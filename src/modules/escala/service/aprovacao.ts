import { EscalaMudouError, type StatusEscala } from "../domain/convite";
import { EnvioBloqueadoError, EscalaTravadaError, NaoEncontradoError, TransicaoInvalidaError } from "../domain/erros";
import { resumoDaMontagem } from "../domain/montagem";
import { type AcaoDaEscala, acaoRegistrada, eventoEncerrado, transicaoDaEscala } from "../domain/status-escala";
import type { EventoTravado, RepositorioMontagem } from "./portas";

// Enviar, aprovar, devolver e reabrir (docs/07 §4.1 e §11.1). Compare-and-set no status e registro_acao.
// Aprovar só registra (aprovado_por/em); nada é enviado às pessoas.

const MENSAGEM_TRANSICAO: Record<AcaoDaEscala, string> = {
  ENVIAR: "Só escalas em rascunho ou devolvidas vão para aprovação.",
  APROVAR: "Esta escala não está aguardando aprovação.",
  DEVOLVER: "Esta escala não está aguardando aprovação.",
  REABRIR: "Só escalas aprovadas ou comunicadas podem ser reabertas.",
};

async function travar(repo: RepositorioMontagem, eventoId: string): Promise<EventoTravado> {
  const evento = await repo.travarEvento(eventoId);
  if (!evento) throw new NaoEncontradoError("Evento não encontrado.");
  if (eventoEncerrado(evento.status)) throw new EscalaTravadaError("O evento foi cancelado ou já terminou. A escala fica só para consulta.");
  return evento;
}

async function aplicar(
  repo: RepositorioMontagem,
  evento: EventoTravado,
  acao: AcaoDaEscala,
  { usuarioId, instante, comentario, dados }: { usuarioId: string; instante: Date; comentario?: string | null; dados?: Record<string, unknown> },
): Promise<StatusEscala> {
  const transicao = transicaoDaEscala(evento.statusEscala, acao);
  if ("erro" in transicao) throw new TransicaoInvalidaError(MENSAGEM_TRANSICAO[acao]);
  const alterou = await repo.mudarStatusDaEscala(evento.id, {
    de: evento.statusEscala,
    para: transicao.para,
    instante,
    aprovadoPor: acao === "APROVAR" ? usuarioId : undefined,
    limparAprovacao: acao === "REABRIR",
  });
  if (!alterou) throw new EscalaMudouError("a escala mudou antes da ação");
  await repo.registrar({
    entidade: "ESCALA_DO_EVENTO",
    entidadeId: evento.id,
    eventoId: evento.id,
    acao: acaoRegistrada(acao),
    statusDe: evento.statusEscala,
    statusPara: transicao.para,
    comentario: comentario ?? null,
    usuarioId,
    dados,
  });
  return transicao.para;
}

/** `statusEsperado` é o que estava na tela: se mudou, é conflito (outra pessoa enviou ou a líder devolveu). */
export async function enviarParaAprovacao(
  repo: RepositorioMontagem,
  { eventoId, statusEsperado, usuarioId, instante }: { eventoId: string; statusEsperado: StatusEscala; usuarioId: string; instante: Date },
): Promise<{ vagasAbertas: number }> {
  const evento = await travar(repo, eventoId);
  if (evento.statusEscala !== statusEsperado) throw new EscalaMudouError("a escala mudou desde que a tela abriu");

  const linhas = await repo.linhasDoEvento(eventoId);
  const resumo = resumoDaMontagem(
    evento.regraVagas,
    { expectativa_publico: evento.expectativaPublico, pessoas_na_fila: evento.pessoasNaFila },
    linhas.map((linha) => ({ ...linha })),
    (codigo) => linhas.find((linha) => linha.funcao === codigo)?.nomeDaFuncao ?? codigo,
  );
  if (!resumo.envio.pode) throw new EnvioBloqueadoError(resumo.envio.motivos);

  await aplicar(repo, evento, "ENVIAR", {
    usuarioId,
    instante,
    dados: { vagas: resumo.vagas, preenchidas: resumo.preenchidas, vagasAbertas: resumo.vagasAbertas },
  });
  return { vagasAbertas: resumo.vagasAbertas };
}

export async function aprovarEscala(
  repo: RepositorioMontagem,
  { eventoId, usuarioId, instante }: { eventoId: string; usuarioId: string; instante: Date },
): Promise<{ codigo: string | null }> {
  const evento = await travar(repo, eventoId);
  const linhas = await repo.linhasDoEvento(eventoId);
  const vagas = linhas.reduce((soma, linha) => soma + linha.quantidade, 0);
  const preenchidas = linhas.reduce((soma, linha) => soma + Math.min(linha.ativas, linha.quantidade), 0);
  await aplicar(repo, evento, "APROVAR", { usuarioId, instante, dados: { vagas, preenchidas } });
  return { codigo: evento.codigo };
}

export async function devolverEscala(
  repo: RepositorioMontagem,
  { eventoId, comentario, usuarioId, instante }: { eventoId: string; comentario: string | null; usuarioId: string; instante: Date },
): Promise<{ codigo: string | null }> {
  const evento = await travar(repo, eventoId);
  await aplicar(repo, evento, "DEVOLVER", { usuarioId, instante, comentario });
  return { codigo: evento.codigo };
}

/** Volta para RASCUNHO e limpa a aprovação; convocações e mensagens ficam. */
export async function reabrirEscala(
  repo: RepositorioMontagem,
  { eventoId, statusEsperado, motivo, usuarioId, instante }: { eventoId: string; statusEsperado: StatusEscala; motivo: string | null; usuarioId: string; instante: Date },
): Promise<void> {
  const evento = await travar(repo, eventoId);
  if (evento.statusEscala !== statusEsperado) throw new EscalaMudouError("a escala mudou desde que a tela abriu");
  await aplicar(repo, evento, "REABRIR", { usuarioId, instante, comentario: motivo });
}
