// npm run comprovantes:testar
// Confere a credencial do armazenamento dos comprovantes (variáveis COMPROVANTES_S3_* do ambiente ou do .env):
// grava um arquivo de teste, lê pela URL pré-assinada, confere que sem assinatura ele não abre, apaga e confere que
// sumiu. Imprime só "ok" ou em que etapa falhou. Nunca imprime endereço, chave, segredo nem a URL assinada.
import { randomUUID } from "node:crypto";

import { lerComprovantesDoAmbiente } from "@/core/config/comprovantes";
import { ArmazenamentoError, criarArmazenamentoS3 } from "@/core/integrations/armazenamento/armazenamento";

function falhar(mensagem: string): never {
  console.error(`erro: ${mensagem}`);
  process.exit(1);
}

const leitura = lerComprovantesDoAmbiente(process.env);
if (leitura.situacao === "DESLIGADO") falhar("nenhuma variável COMPROVANTES_S3_* definida (o anexo está desligado).");
if (leitura.situacao === "INCOMPLETO") falhar(`configuração incompleta ou inválida: ${leitura.faltando.join(", ")}.`);

const { endpoint, regiao, bucket, chaveId, segredo } = leitura.config;
const armazenamento = criarArmazenamentoS3({ endpoint, regiao, bucket, credenciais: { chaveId, segredo } }, { timeoutMs: 20_000 });
const chave = `diagnostico/${randomUUID()}.txt`;
const conteudo = new Uint8Array(Buffer.from(`teste do armazenamento dos comprovantes ${new Date().toISOString()}`));

async function etapa<T>(nome: string, trabalho: () => Promise<T>): Promise<T> {
  try {
    return await trabalho();
  } catch (erro: unknown) {
    // Só o nome da etapa e o status: a mensagem de um erro de rede pode trazer o endereço.
    const status = erro instanceof ArmazenamentoError && erro.status !== null ? ` (HTTP ${erro.status})` : "";
    return falhar(`${nome}${status}.`);
  }
}

const buscar = async (url: string) => fetch(url, { signal: AbortSignal.timeout(20_000), cache: "no-store" });

await etapa("gravar o arquivo de teste", () => armazenamento.guardar(chave, conteudo, "text/plain"));

const link = await etapa("montar a URL pré-assinada", () => armazenamento.linkTemporario(chave, 60));
if (!link) falhar("o armazenamento não devolveu a URL pré-assinada.");
const lido = await etapa("ler pela URL pré-assinada", () => buscar(link));
if (!lido.ok) falhar(`ler pela URL pré-assinada (HTTP ${lido.status}).`);
if (Buffer.compare(Buffer.from(await lido.arrayBuffer()), Buffer.from(conteudo)) !== 0) falhar("o conteúdo lido é diferente do gravado.");

// Bucket privado: o mesmo endereço, sem a assinatura, não pode abrir o arquivo.
const semAssinatura = await etapa("conferir que o bucket é privado", () => buscar(link.split("?")[0]!));
if (semAssinatura.ok) falhar("o arquivo abriu sem assinatura: o bucket não está privado.");

await etapa("apagar o arquivo de teste", () => armazenamento.apagar(chave));
if ((await etapa("conferir que o arquivo sumiu", () => armazenamento.ler(chave))) !== null) falhar("o arquivo de teste continua lá depois de apagado.");

console.log("ok");
