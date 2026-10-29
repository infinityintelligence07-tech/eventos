import { EscalaMudouError } from "../domain/convite";
import { transicaoDaConvocacao } from "../domain/convocacao";
import { EscalaTravadaError, NaoEncontradoError, TransicaoInvalidaError } from "../domain/erros";
import { aceitaResposta, eventoEncerrado } from "../domain/status-escala";
import type { RepositorioMontagem } from "./portas";

// "Registrar resposta" em nome do staff (docs/07 §3.3 e §4.2): grava registrado_por e o registro_acao
// com em_nome_de_pessoa_id. Só com a escala aprovada ou comunicada.

export async function registrarRespostaDoStaff(
  repo: RepositorioMontagem,
  entrada: {
    eventoId: string;
    convocacaoId: string;
    resposta: "ACEITA" | "RECUSADA";
    motivoRecusa: string | null;
    usuarioId: string;
    instante: Date;
  },
): Promise<{ nome: string }> {
  const evento = await repo.travarEvento(entrada.eventoId);
  if (!evento) throw new NaoEncontradoError("Evento não encontrado.");
  if (eventoEncerrado(evento.status)) throw new EscalaTravadaError("O evento foi cancelado ou já terminou. A escala fica só para consulta.");
  if (!aceitaResposta(evento.statusEscala)) throw new EscalaTravadaError("Respostas só são registradas com a escala aprovada.");

  const convocacao = await repo.travarConvocacao(entrada.convocacaoId);
  if (!convocacao || convocacao.eventoId !== entrada.eventoId) throw new NaoEncontradoError("A pessoa não está mais nesta escala.");

  const transicao = transicaoDaConvocacao(convocacao.status, entrada.resposta === "ACEITA" ? "REGISTRAR_ACEITA" : "REGISTRAR_RECUSADA");
  if (!("para" in transicao)) {
    const motivo =
      convocacao.status === "SUGERIDA"
        ? `${convocacao.nome} ainda não recebeu a copy de escalação. Envie a copy antes de registrar a resposta.`
        : `A resposta de ${convocacao.nome} já está registrada assim.`;
    throw new TransicaoInvalidaError(motivo);
  }

  const motivoRecusa = entrada.resposta === "RECUSADA" ? entrada.motivoRecusa : null;
  const alterou = await repo.mudarConvocacao(entrada.convocacaoId, {
    de: convocacao.status,
    para: transicao.para,
    instante: entrada.instante,
    resposta: { motivoRecusa, registradoPor: entrada.usuarioId },
  });
  if (!alterou) throw new EscalaMudouError("a convocação mudou");

  await repo.registrar({
    entidade: "CONVOCACAO",
    entidadeId: entrada.convocacaoId,
    eventoId: entrada.eventoId,
    acao: "RESPOSTA_REGISTRADA",
    statusDe: convocacao.status,
    statusPara: transicao.para,
    // O motivo fica só na convocação (dado pessoal fora do histórico imutável, docs/09 §7.1).
    dados: { temMotivoRecusa: motivoRecusa !== null },
    emNomeDePessoaId: convocacao.pessoaId,
    usuarioId: entrada.usuarioId,
  });
  return { nome: convocacao.nome };
}
