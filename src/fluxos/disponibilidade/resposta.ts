import { type AtorDaEscrita, bancoParaLeitura, RegraDeNegocioError, transacao } from "@/fluxos/_base";
import {
  criarConsultaDisponibilidade,
  criarRepositorioEnquete,
  descricaoDoFechamento,
  EnqueteFechadaParaRespostaError,
  EnqueteNaoEncontradaError,
  type EventoDaEnquete,
  EventoForaDaEnqueteError,
  PessoaForaDaEnqueteError,
  type ResponderEnquete,
  responderEnquete as responderEnqueteNoModulo,
  type Resposta,
  respostaDe,
  type ResultadoDaResposta,
  type SituacaoDaEnquete,
  situacaoDaEnquete,
} from "@/modules/disponibilidade";

// Resposta da enquete pelo próprio staff, no link /responder/[enqueteId]. Quem responde sai da sessão, nunca do
// formulário; depois do prazo só o time registra.

const FORMATO_UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export type EnqueteParaResponder = {
  id: string;
  titulo: string;
  situacao: SituacaoDaEnquete;
  descricaoDoFechamento: string;
  eventos: (EventoDaEnquete & { resposta: Resposta })[];
  /** Já respondeu algum evento desta lista (por ela mesma ou registrado pelo time). */
  respondeu: boolean;
};

/** Nulo = enquete não encontrada. */
export async function carregarEnqueteParaResponder(enqueteId: string, pessoaId: string, agora: Date): Promise<EnqueteParaResponder | null> {
  if (!FORMATO_UUID.test(enqueteId)) return null;
  const consulta = criarConsultaDisponibilidade(await bancoParaLeitura());
  const enquete = await consulta.enquete(enqueteId);
  if (!enquete) return null;

  const respostas = await consulta.respostasDosEventos(enquete.eventos.map((evento) => evento.id));
  const daPessoa = new Map(respostas.filter((resposta) => resposta.pessoaId === pessoaId).map((resposta) => [resposta.eventoId, resposta.disponivel]));
  return {
    id: enquete.id,
    titulo: enquete.titulo,
    situacao: situacaoDaEnquete(enquete.fechaEm, agora),
    descricaoDoFechamento: descricaoDoFechamento(enquete.fechaEm, agora),
    eventos: enquete.eventos.map((evento) => ({ ...evento, resposta: respostaDe(daPessoa.get(evento.id)) })),
    respondeu: daPessoa.size > 0,
  };
}

/** `ator` é o próprio staff (usuário e pessoa da sessão): a resposta grava sem `registrado_por`. */
export async function responderEnquete({ enqueteId, eventoIds }: ResponderEnquete, ator: AtorDaEscrita & { pessoaId: string }, agora: Date): Promise<ResultadoDaResposta> {
  try {
    return await transacao(ator, (tx) =>
      responderEnqueteNoModulo(criarRepositorioEnquete(tx), { enqueteId, pessoaId: ator.pessoaId, eventoIds, usuarioId: ator.usuarioId, agora }),
    );
  } catch (erro: unknown) {
    if (erro instanceof EnqueteNaoEncontradaError) throw new RegraDeNegocioError("Enquete não encontrada.");
    if (erro instanceof EnqueteFechadaParaRespostaError) throw new RegraDeNegocioError("Esta enquete já encerrou. Fale com o time de eventos para registrar a sua resposta.");
    if (erro instanceof EventoForaDaEnqueteError) throw new RegraDeNegocioError("Algum evento não faz parte desta enquete. Recarregue a página.");
    if (erro instanceof PessoaForaDaEnqueteError) throw new RegraDeNegocioError("Seu usuário não está no staff ativo.");
    throw erro;
  }
}
