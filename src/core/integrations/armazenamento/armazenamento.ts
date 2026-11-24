import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";

import { assinarRequisicao, type CredenciaisS3, sha256Hex, urlPreAssinada } from "./sigv4";

// Onde ficam os arquivos que as pessoas anexam (comprovantes de custo). Uma interface e três implementações:
// S3 (o Storage do Supabase, em produção), disco (só no modo local) e memória (testes). Quem usa não sabe qual é.
// Nenhuma delas põe a chave de acesso, a URL assinada ou o conteúdo do arquivo em log ou em mensagem de erro.

export class ArmazenamentoError extends Error {
  constructor(
    readonly operacao: "guardar" | "ler" | "apagar",
    /** Status HTTP do armazenamento, quando houve resposta. */
    readonly status: number | null,
  ) {
    super(`armazenamento: falha ao ${operacao}${status === null ? "" : ` (HTTP ${status})`}`);
    this.name = "ArmazenamentoError";
  }
}

export type ArmazenamentoDeArquivos = {
  guardar(chave: string, conteudo: Uint8Array, tipo: string): Promise<void>;
  /**
   * Endereço que abre o arquivo por `segundos`, sem passar pelo servidor do app. Nulo = este armazenamento não tem
   * link: quem chama lê com `ler` e serve o conteúdo.
   */
  linkTemporario(chave: string, segundos: number): Promise<string | null>;
  /** Nulo = não existe. */
  ler(chave: string): Promise<Uint8Array | null>;
  /** Apagar o que não existe não é erro. */
  apagar(chave: string): Promise<void>;
};

/** A chave é gerada pelo servidor; ainda assim nenhuma implementação aceita `..`, barra inicial ou caractere estranho. */
const CHAVE_VALIDA = /^[a-z0-9][a-z0-9._-]*(\/[a-z0-9][a-z0-9._-]*)*$/;

function conferirChave(chave: string): string {
  if (chave.length > 300 || !CHAVE_VALIDA.test(chave) || chave.includes("..")) throw new Error("armazenamento: chave de arquivo inválida");
  return chave;
}

export type ConfiguracaoS3 = {
  /** Endpoint S3 do Storage, sem o bucket (ex.: https://<projeto>.storage.supabase.co/storage/v1/s3). */
  endpoint: string;
  regiao: string;
  bucket: string;
  credenciais: CredenciaisS3;
};

export type OpcoesDoS3 = { fetch?: typeof fetch; agora?: () => Date; timeoutMs?: number };

/** Protocolo S3 no estilo de caminho (`<endpoint>/<bucket>/<chave>`), assinado com AWS Signature V4. */
export function criarArmazenamentoS3({ endpoint, regiao, bucket, credenciais }: ConfiguracaoS3, opcoes: OpcoesDoS3 = {}): ArmazenamentoDeArquivos {
  const buscar = opcoes.fetch ?? fetch;
  const agora = opcoes.agora ?? (() => new Date());
  const timeoutMs = opcoes.timeoutMs ?? 30_000;
  const urlDo = (chave: string) => `${endpoint.replace(/\/+$/, "")}/${bucket}/${conferirChave(chave)}`;

  async function pedir(operacao: "guardar" | "ler" | "apagar", metodo: "GET" | "PUT" | "DELETE", chave: string, corpo?: Uint8Array, tipo?: string): Promise<Response> {
    const url = urlDo(chave);
    const cabecalhos = assinarRequisicao({
      metodo,
      url,
      cabecalhos: tipo ? { "content-type": tipo } : {},
      corpoSha256: sha256Hex(corpo ?? ""),
      credenciais,
      regiao,
      instante: agora(),
    });
    try {
      return await buscar(url, { method: metodo, headers: cabecalhos, body: corpo as BodyInit | undefined, signal: AbortSignal.timeout(timeoutMs), cache: "no-store" });
    } catch {
      // Sem repassar o erro original: a mensagem dele pode trazer o endereço.
      throw new ArmazenamentoError(operacao, null);
    }
  }

  return {
    async guardar(chave, conteudo, tipo) {
      const resposta = await pedir("guardar", "PUT", chave, conteudo, tipo);
      if (!resposta.ok) throw new ArmazenamentoError("guardar", resposta.status);
    },
    async linkTemporario(chave, segundos) {
      return urlPreAssinada({ url: urlDo(chave), expiraEmSegundos: segundos, credenciais, regiao, instante: agora() });
    },
    async ler(chave) {
      const resposta = await pedir("ler", "GET", chave);
      if (resposta.status === 404) return null;
      if (!resposta.ok) throw new ArmazenamentoError("ler", resposta.status);
      return new Uint8Array(await resposta.arrayBuffer());
    },
    async apagar(chave) {
      const resposta = await pedir("apagar", "DELETE", chave);
      if (!resposta.ok && resposta.status !== 404) throw new ArmazenamentoError("apagar", resposta.status);
    },
  };
}

/** Arquivos numa pasta do disco (modo local: `.banco-local/comprovantes`). Sem link: o app serve o conteúdo. */
export function criarArmazenamentoEmDisco(pasta: string): ArmazenamentoDeArquivos {
  const raiz = path.resolve(pasta);
  function caminhoDo(chave: string): string {
    const caminho = path.resolve(raiz, conferirChave(chave));
    if (!caminho.startsWith(`${raiz}${path.sep}`)) throw new Error("armazenamento: chave de arquivo inválida");
    return caminho;
  }
  return {
    async guardar(chave, conteudo) {
      const caminho = caminhoDo(chave);
      await mkdir(path.dirname(caminho), { recursive: true });
      await writeFile(caminho, conteudo);
    },
    async linkTemporario() {
      return null;
    },
    async ler(chave) {
      const caminho = caminhoDo(chave);
      try {
        return new Uint8Array(await readFile(caminho));
      } catch (erro: unknown) {
        if ((erro as NodeJS.ErrnoException).code === "ENOENT") return null;
        throw new ArmazenamentoError("ler", null);
      }
    },
    async apagar(chave) {
      await rm(caminhoDo(chave), { force: true });
    },
  };
}

/** Em memória, para os testes. `arquivos` deixa o teste olhar o que foi guardado. */
export function criarArmazenamentoEmMemoria(): ArmazenamentoDeArquivos & { arquivos: Map<string, { conteudo: Uint8Array; tipo: string }> } {
  const arquivos = new Map<string, { conteudo: Uint8Array; tipo: string }>();
  return {
    arquivos,
    async guardar(chave, conteudo, tipo) {
      arquivos.set(conferirChave(chave), { conteudo: new Uint8Array(conteudo), tipo });
    },
    async linkTemporario() {
      return null;
    },
    async ler(chave) {
      return arquivos.get(conferirChave(chave))?.conteudo ?? null;
    },
    async apagar(chave) {
      arquivos.delete(conferirChave(chave));
    },
  };
}
