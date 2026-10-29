import { bancoParaLeitura } from "@/fluxos/_base";
import {
  type AlertaDeCusto,
  alertasDoConsumo,
  criarRepositorioSolicitacoes,
  type DeslocamentoGravado,
  type DetalheDaSolicitacao,
  type NivelDeExcecao,
  type NumerosDaFila,
  ordenarParaAuditoria,
  type RegraDeCusto,
  regrasAplicaveis,
  regrasDoCalculo,
  type SolicitacaoDaFila,
  type StatusAuditoria,
} from "@/modules/custos";

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

export type SolicitacaoCarregada = DetalheDaSolicitacao & {
  alertasPorDeslocamento: AlertaDeCusto[][];
  /** Vizinhas na fila "Para auditar" (Anterior / Próxima). */
  anterior: string | null;
  proxima: string | null;
};

/** Painel do detalhe (?protocolo=STF-…). Nulo = protocolo inexistente. */
export async function carregarSolicitacao(protocolo: string, filtro: FiltroDeCustos = {}): Promise<SolicitacaoCarregada | null> {
  if (!/^STF-\d{6}-\d{4,}$/.test(protocolo)) return null;
  const repo = criarRepositorioSolicitacoes(await bancoParaLeitura());
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
  };
}
