import { type AtorDaEscrita, bancoParaLeitura, ConflitoDeVersaoError, RegraDeNegocioError, transacao } from "@/fluxos/_base";
import {
  andamentoDoEvento,
  criarConsultaDaEscala,
  criarRepositorioVagas,
  type Etapa,
  gerarVagasDoEvento,
  proximoPasso,
  type ProximoPasso,
  resumoDaMontagem,
  type ResumoDaMontagem,
  type ResultadoGerarVagas,
} from "@/modules/escala";
import { criarRepositorioEvento, dadosEditados, type EventoDoResumo, usaFila } from "@/modules/eventos";

// Resumo do evento (docs/07 §6.1, docs/08 §5): andamento, dados da turma, público e fila e vagas sugeridas.

const FORMATO_UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export type ResumoDoEvento = {
  evento: EventoDoResumo;
  usaFila: boolean;
  vagas: ResumoDaMontagem;
  andamento: Etapa[];
  proximoPasso: ProximoPasso;
};

const diaEMes = (instante: Date) =>
  instante.toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo", day: "2-digit", month: "2-digit" });

/** Nulo = evento não encontrado. */
export async function carregarResumoDoEvento(eventoId: string): Promise<ResumoDoEvento | null> {
  if (!FORMATO_UUID.test(eventoId)) return null;
  const db = await bancoParaLeitura();
  const consulta = criarConsultaDaEscala(db);
  const [evento, daMontagem, linhas, funcoes] = await Promise.all([
    criarRepositorioEvento(db).dadosDoEvento(eventoId),
    consulta.eventoDaMontagem(eventoId),
    consulta.linhasDaTela(eventoId),
    consulta.funcoesAtivas(),
  ]);
  if (!evento || !daMontagem) return null;

  const nomes = new Map(funcoes.map((funcao) => [funcao.codigo, funcao.nome]));
  const vagas = resumoDaMontagem(
    daMontagem.regraVagas,
    { expectativa_publico: evento.expectativaPublico, pessoas_na_fila: evento.pessoasNaFila },
    linhas,
    (codigo) => nomes.get(codigo) ?? codigo,
  );
  return {
    evento,
    usaFila: usaFila(evento.tipoSigla),
    vagas,
    andamento: andamentoDoEvento(evento.statusEscala, vagas, evento.aprovadoEm ? diaEMes(evento.aprovadoEm) : null),
    proximoPasso: proximoPasso(evento.statusEscala),
  };
}

export type ResultadoDosDados = { vagas: ResultadoGerarVagas["situacao"] };

/**
 * Grava público e fila e recalcula as vagas na mesma transação (linha confirmada não muda).
 * `atualizadoEm` é a versão da tela: se o evento mudou depois (outra pessoa ou a sincronização), pede para recarregar.
 */
export async function salvarDadosDoEvento(
  entrada: { eventoId: string; expectativaPublico: number | null; pessoasNaFila: number | null; atualizadoEm: string },
  ator: AtorDaEscrita,
  agora: Date,
): Promise<ResultadoDosDados> {
  return transacao(ator, async (tx) => {
    const repositorio = criarRepositorioEvento(tx);
    const atual = await repositorio.dadosDoEvento(entrada.eventoId);
    if (!atual) throw new RegraDeNegocioError("Evento não encontrado.");
    const dados = dadosEditados(atual.tipoSigla, atual, entrada);
    const gravou = await repositorio.atualizarDadosDoEvento(entrada.eventoId, dados, { versaoEsperada: entrada.atualizadoEm, instante: agora });
    if (!gravou) throw new ConflitoDeVersaoError("o evento mudou desde que a tela abriu");
    await repositorio.registrarDadosAlterados(entrada.eventoId, {
      de: { expectativaPublico: atual.expectativaPublico, pessoasNaFila: atual.pessoasNaFila },
      para: dados,
      usuarioId: ator.usuarioId,
    });
    const { situacao } = await gerarVagasDoEvento(criarRepositorioVagas(tx, { usuarioId: ator.usuarioId }), entrada.eventoId);
    return { vagas: situacao };
  });
}
