import { bancoParaLeitura } from "@/fluxos/_base";
import {
  type AlertaDeCusto,
  alertasDoConsumo,
  criarRepositorioSolicitacoes,
  type DeslocamentoGravado,
  dadosDoCustoReprovado,
  type DetalheDaSolicitacao,
  mensagemDeCustoAprovado,
  MODELO_PADRAO_DE_CUSTO_REPROVADO,
  type NivelDeExcecao,
  type NumerosDaFila,
  ordenarParaAuditoria,
  type RegraDeCusto,
  regrasAplicaveis,
  regrasDoCalculo,
  type SolicitacaoDaFila,
  type StatusAuditoria,
} from "@/modules/custos";
import { CHAVE_LINK_CUSTOS, criarRepositorioComunicacao, gerarCopy, modeloEmUso, saudacao } from "@/modules/comunicacao";
import { linkDoWhatsApp } from "@/modules/pessoas";

import { diaEmSaoPaulo } from "./comum";

export type FiltroDeCustos = { eventoId?: string; situacao?: StatusAuditoria | "TODAS"; nivel?: NivelDeExcecao; busca?: string };

export type LinhaDaFila = SolicitacaoDaFila & { resumoDoAlerta: string | null };

export type FilaCarregada = {
  numeros: NumerosDaFila;
  linhas: LinhaDaFila[];
  contagens: Record<StatusAuditoria | "TODAS", number>;
  eventos: { id: string; rotulo: string }[];
};

type EventoDaRegra = { tipoEventoId: string | null; uf: string | null; data: string };

function alertasDosDeslocamentos(deslocamentos: DeslocamentoGravado[], regras: RegraDeCusto[], evento: EventoDaRegra): AlertaDeCusto[][] {
  const limites = regrasDoCalculo(regrasAplicaveis(regras, evento)).limites;
  return deslocamentos.map((deslocamento) => alertasDoConsumo(deslocamento.consumoKmL, deslocamento.precoLitroCentavos, limites));
}

/** Motivo curto da coluna Alerta ("consumo 6,8 km/l"): o alerta mais grave entre os deslocamentos. */
function resumoDoAlerta(alertas: AlertaDeCusto[][]): string | null {
  const todos = alertas.flat();
  return (todos.find((alerta) => alerta.nivel === "CRITICO") ?? todos[0])?.resumo ?? null;
}

/** Fila de auditoria (doc 08 §11.1). "Para auditar" é o padrão: críticos → alertas → sem alerta, a mais antiga primeiro. */
export async function carregarFilaDeAuditoria(filtro: FiltroDeCustos, agora: Date): Promise<FilaCarregada> {
  const repo = criarRepositorioSolicitacoes(await bancoParaLeitura());
  const situacao = filtro.situacao ?? "PENDENTE";
  const inicioDoMes = `${diaEmSaoPaulo(agora).slice(0, 7)}-01`;
  const [numeros, todasDoFiltro, regras] = await Promise.all([
    repo.numeros(inicioDoMes),
    repo.fila({ eventoId: filtro.eventoId, nivel: filtro.nivel, busca: filtro.busca }),
    repo.regras(),
  ]);
  const doFiltro = situacao === "TODAS" ? todasDoFiltro : todasDoFiltro.filter((linha) => linha.auditoria === situacao);
  const deslocamentos = await repo.deslocamentosDasSolicitacoes(doFiltro.map((linha) => linha.id));
  const linhas = doFiltro.map((linha) => ({
    ...linha,
    resumoDoAlerta: linha.nivel === "NENHUM" ? null : resumoDoAlerta(alertasDosDeslocamentos(deslocamentos.get(linha.id) ?? [], regras, linha.evento)),
  }));

  const eventos = new Map<string, string>();
  for (const linha of todasDoFiltro) eventos.set(linha.evento.id, linha.evento.codigo ?? linha.evento.nome);
  const contar = (status: StatusAuditoria) => todasDoFiltro.filter((linha) => linha.auditoria === status).length;
  return {
    numeros,
    linhas: situacao === "PENDENTE" ? ordenarParaAuditoria(linhas) : linhas,
    contagens: { PENDENTE: contar("PENDENTE"), APROVADO: contar("APROVADO"), REPROVADO: contar("REPROVADO"), TODAS: todasDoFiltro.length },
    eventos: [...eventos].map(([id, rotulo]) => ({ id, rotulo })).sort((a, b) => a.rotulo.localeCompare(b.rotulo)),
  };
}

/** Mensagem de "custo aprovado" (doc 08 §11.2). O sistema não envia nem registra envio: o time copia ou abre a conversa. */
export type MensagemDeAprovado = {
  texto: string;
  /**
   * https://wa.me/… da pessoa, com o texto já escrito. Nulo = sem telefone válido no cadastro, ou quem abriu não recebe
   * o link. O telefone só existe aqui dentro: não vai para log, histórico nem para outro campo da tela.
   */
  linkDoWhatsApp: string | null;
  /** O telefone foi procurado e o cadastro não tem um válido (a tela avisa para usar o contato de sempre). */
  semTelefone: boolean;
};

export type SolicitacaoCarregada = DetalheDaSolicitacao & {
  alertasPorDeslocamento: AlertaDeCusto[][];
  /** Vizinhas na fila "Para auditar" (Anterior / Próxima). */
  anterior: string | null;
  proxima: string | null;
  /** Só nas aprovadas. */
  mensagemDeAprovado: MensagemDeAprovado | null;
  /** Só nas reprovadas: a copy de reprovação, com o motivo, pronta para mandar à pessoa. */
  mensagemDeReprovado: MensagemDeAprovado | null;
};

export type OpcoesDaSolicitacao = {
  /** Quem abriu audita custos (custos.auditar, conferido pela página): só então o telefone da pessoa é lido para o link. */
  comLinkDoWhatsApp?: boolean;
};

/** Painel do detalhe (?protocolo=STF-…). Nulo = protocolo inexistente. */
export async function carregarSolicitacao(
  protocolo: string,
  filtro: FiltroDeCustos = {},
  { comLinkDoWhatsApp = false }: OpcoesDaSolicitacao = {},
): Promise<SolicitacaoCarregada | null> {
  if (!/^STF-\d{6}-\d{4,}$/.test(protocolo)) return null;
  const db = await bancoParaLeitura();
  const repo = criarRepositorioSolicitacoes(db);
  const detalhe = await repo.detalhe(protocolo);
  if (!detalhe) return null;
  const regras = await repo.regras();
  const fila = ordenarParaAuditoria(await repo.fila({ eventoId: filtro.eventoId, nivel: filtro.nivel, busca: filtro.busca, auditoria: "PENDENTE" }));
  const posicao = fila.findIndex((linha) => linha.protocolo === protocolo);
  return {
    ...detalhe,
    alertasPorDeslocamento: alertasDosDeslocamentos(detalhe.deslocamentos, regras, detalhe.evento),
    anterior: posicao > 0 ? fila[posicao - 1]!.protocolo : null,
    proxima: posicao >= 0 ? (fila[posicao + 1]?.protocolo ?? null) : (fila[0]?.protocolo ?? null),
    mensagemDeAprovado: detalhe.auditoria === "APROVADO" ? await mensagemDeAprovado(repo, detalhe, comLinkDoWhatsApp) : null,
    mensagemDeReprovado:
      detalhe.auditoria === "REPROVADO" ? await mensagemDeReprovado(repo, criarRepositorioComunicacao(db), detalhe, comLinkDoWhatsApp, new Date()) : null,
  };
}

/**
 * Copy de reprovação (Vitor, 26/11/2026): nasce quando a solicitação é reprovada, com o motivo escrito pelo time. O
 * texto vem do modelo ativo "Reprovação de custo" (Configurações › Modelos de copy); sem modelo ativo, do texto padrão.
 */
async function mensagemDeReprovado(
  repo: { telefoneDaPessoa(pessoaId: string): Promise<string | null> },
  comunicacao: Pick<ReturnType<typeof criarRepositorioComunicacao>, "modelos" | "configuracao">,
  detalhe: DetalheDaSolicitacao,
  comLinkDoWhatsApp: boolean,
  agora: Date,
): Promise<MensagemDeAprovado> {
  const [modelos, linkCustos] = await Promise.all([comunicacao.modelos(), comunicacao.configuracao(CHAVE_LINK_CUSTOS)]);
  const corpo = modeloEmUso(modelos, "REPROVACAO_CUSTO")?.corpo ?? MODELO_PADRAO_DE_CUSTO_REPROVADO;
  const { texto } = gerarCopy(
    corpo,
    dadosDoCustoReprovado({
      nome: detalhe.pessoaNome,
      evento: detalhe.evento.codigo ?? detalhe.evento.nome,
      protocolo: detalhe.protocolo,
      totalCentavos: detalhe.totalCentavos,
      motivo: detalhe.parecer,
      saudacao: saudacao(agora),
      linkCustos,
    }),
  );
  if (!comLinkDoWhatsApp) return { texto, linkDoWhatsApp: null, semTelefone: false };
  const link = linkDoWhatsApp(await repo.telefoneDaPessoa(detalhe.pessoaId), texto);
  return { texto, linkDoWhatsApp: link, semTelefone: link === null };
}

async function mensagemDeAprovado(
  repo: { telefoneDaPessoa(pessoaId: string): Promise<string | null> },
  detalhe: DetalheDaSolicitacao,
  comLinkDoWhatsApp: boolean,
): Promise<MensagemDeAprovado> {
  const texto = mensagemDeCustoAprovado({
    nome: detalhe.pessoaNome,
    evento: detalhe.evento.codigo ?? detalhe.evento.nome,
    protocolo: detalhe.protocolo,
    totalCentavos: detalhe.totalCentavos,
  });
  if (!comLinkDoWhatsApp) return { texto, linkDoWhatsApp: null, semTelefone: false };
  const link = linkDoWhatsApp(await repo.telefoneDaPessoa(detalhe.pessoaId), texto);
  return { texto, linkDoWhatsApp: link, semTelefone: link === null };
}
