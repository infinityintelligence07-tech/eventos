"use client";

import { useRef, useState } from "react";

import { reduzirImagem } from "./reduzir-imagem";

// Anexos do formulário de custo do staff. Cada arquivo sobe sozinho, assim que é escolhido, pela rota
// /solicitar-custo/[eventoId]/comprovantes: no celular uma falha de rede perde só aquele arquivo, e o que já subiu
// continua lá se a pessoa sair e voltar. Foto grande é reduzida aqui antes de enviar.

export type ComprovanteDoFormulario = { id: string; nome: string; tamanhoBytes: number };

export type LimitesDoAnexo = { maximo: number; tamanhoMaximoBytes: number };

type Resposta = { ok: true; comprovante: ComprovanteDoFormulario } | { ok: false; mensagem: string };

const SEM_REDE = "Não foi possível enviar. Confira a internet e tente de novo.";
const SEM_SESSAO = "Sua sessão terminou. Recarregue a página e entre de novo.";

/** Sessão vencida: o middleware redireciona para o login e a resposta deixa de ser o JSON da rota. */
async function lerResposta<T>(resposta: Response): Promise<T | { ok: false; mensagem: string }> {
  if (resposta.redirected || resposta.status === 401) return { ok: false, mensagem: SEM_SESSAO };
  try {
    return (await resposta.json()) as T;
  } catch {
    return { ok: false, mensagem: SEM_REDE };
  }
}

function tamanho(bytes: number): string {
  if (bytes >= 1024 * 1024) return `${(bytes / (1024 * 1024)).toLocaleString("pt-BR", { maximumFractionDigits: 1 })} MB`;
  return `${Math.max(1, Math.round(bytes / 1024)).toLocaleString("pt-BR")} kB`;
}

export function Comprovantes({
  endereco,
  iniciais,
  limites,
  obrigatorio,
  aoMudar,
}: {
  /** /solicitar-custo/[eventoId]/comprovantes */
  endereco: string;
  iniciais: ComprovanteDoFormulario[];
  limites: LimitesDoAnexo;
  /** Há deslocamento ou despesa no formulário: sem comprovante o envio é recusado. */
  obrigatorio: boolean;
  /** Avisa o formulário: quantos anexos há e se algum ainda está subindo. */
  aoMudar: (estado: { quantidade: number; enviando: boolean }) => void;
}) {
  const [lista, setLista] = useState(iniciais);
  const [enviando, setEnviando] = useState(0);
  const [erro, setErro] = useState<string | null>(null);
  const campo = useRef<HTMLInputElement>(null);
  const vagas = limites.maximo - lista.length - enviando;

  function publicar(proxima: ComprovanteDoFormulario[], subindo: number) {
    setLista(proxima);
    setEnviando(subindo);
    aoMudar({ quantidade: proxima.length, enviando: subindo > 0 });
  }

  async function enviarUm(original: File): Promise<Resposta> {
    const arquivo = await reduzirImagem(original);
    if (arquivo.size > limites.tamanhoMaximoBytes) return { ok: false, mensagem: `"${original.name}" passa de ${tamanho(limites.tamanhoMaximoBytes)}. Envie uma foto menor ou um PDF mais leve.` };
    const corpo = new FormData();
    corpo.append("arquivo", arquivo, arquivo.name);
    try {
      return await lerResposta<Resposta>(await fetch(endereco, { method: "POST", body: corpo, credentials: "same-origin" }));
    } catch {
      return { ok: false, mensagem: SEM_REDE };
    }
  }

  async function aoEscolher(arquivos: FileList | null) {
    const escolhidos = [...(arquivos ?? [])];
    if (campo.current) campo.current.value = "";
    if (escolhidos.length === 0) return;
    setErro(escolhidos.length > vagas ? `Cada solicitação aceita até ${limites.maximo} comprovantes. Enviando só ${vagas === 1 ? "o primeiro" : `os ${vagas} primeiros`}.` : null);

    let atual = lista;
    let faltam = Math.min(escolhidos.length, vagas);
    publicar(atual, faltam);
    for (const arquivo of escolhidos.slice(0, faltam)) {
      const resposta = await enviarUm(arquivo);
      faltam -= 1;
      if (resposta.ok) atual = [...atual, resposta.comprovante];
      else setErro(resposta.mensagem);
      publicar(atual, faltam);
    }
  }

  async function remover(id: string) {
    setErro(null);
    try {
      const resposta = await lerResposta<{ ok: true }>(await fetch(`${endereco}/${id}`, { method: "DELETE", credentials: "same-origin" }));
      if (!resposta.ok) return setErro(resposta.mensagem);
      publicar(
        lista.filter((item) => item.id !== id),
        enviando,
      );
    } catch {
      setErro(SEM_REDE);
    }
  }

  return (
    <fieldset>
      <legend>Comprovantes</legend>
      <p className="cadastro-ajuda">
        Foto ou PDF do cupom, do recibo ou do pedágio. Até {limites.maximo} arquivos de {tamanho(limites.tamanhoMaximoBytes)} cada.{" "}
        {obrigatorio ? "Com deslocamento ou despesa, pelo menos um comprovante é obrigatório." : "Sem deslocamento e sem despesa, não precisa anexar."}
      </p>
      {lista.length > 0 && (
        <ul className="custo-lista">
          {lista.map((item) => (
            <li key={item.id} className="custo-bloco custo-anexo">
              <a href={`${endereco}/${item.id}`} target="_blank" rel="noreferrer noopener">
                {item.nome}
              </a>
              <small>{tamanho(item.tamanhoBytes)}</small>
              <button type="button" className="custo-botao-texto" onClick={() => void remover(item.id)}>
                Remover
              </button>
            </li>
          ))}
        </ul>
      )}
      {enviando > 0 && (
        <p className="cadastro-ajuda" role="status">
          Enviando {enviando === 1 ? "1 arquivo" : `${enviando} arquivos`}... Não feche a página.
        </p>
      )}
      {erro && (
        <p className="cadastro-erro" role="alert">
          {erro}
        </p>
      )}
      {vagas > 0 && (
        <label className="custo-botao-secundario custo-anexar">
          <input ref={campo} type="file" accept="image/jpeg,image/png,image/webp,application/pdf" multiple onChange={(evento) => void aoEscolher(evento.target.files)} />
          {lista.length === 0 ? "Anexar comprovante" : "Anexar outro comprovante"}
        </label>
      )}
    </fieldset>
  );
}
