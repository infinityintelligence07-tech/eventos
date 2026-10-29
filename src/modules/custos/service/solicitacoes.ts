import { exigeMotivo, mensagemDaTransicaoInvalida, type AcaoDeAuditoria, type SituacaoDaSolicitacao, transicaoDaAuditoria } from "../domain/auditoria";
import { calcularSolicitacao, type DeslocamentoCalculado, type NivelDeExcecao, type SolicitacaoCalculada } from "../domain/calculo";
import { CustosMudouError, ErroDosCustos, SolicitacaoJaExisteError } from "../domain/erros";
import { type RegraDeCusto, regrasAplicaveis, regrasDoCalculo } from "../domain/regras";
import type {
  AprovarSolicitacao,
  CorrigirSolicitacao,
  EntradaDeDeslocamento,
  EntradaDeItem,
  ReabrirAuditoria,
  RegistrarSolicitacao,
  ReprovarSolicitacao,
} from "../domain/schemas";

// Solicitação de custo registrada pelo time em nome da pessoa e auditoria (docs/07 §4.4 e §6.7).
// O servidor recalcula combustível, depreciação, alerta e total: não confia no que veio do navegador.

export type ContextoDaAcao = { usuarioId: string; instante: Date };

export type EventoDoCusto = { id: string; codigo: string | null; tipoEventoId: string | null; uf: string | null; data: string };

export type SolicitacaoTravada = {
  id: string;
  protocolo: string;
  eventoId: string;
  pessoaId: string;
  situacao: SituacaoDaSolicitacao;
  nivel: NivelDeExcecao;
};

export type LinhasCalculadas = {
  deslocamentos: (EntradaDeDeslocamento & { calculado: DeslocamentoCalculado })[];
  itens: (EntradaDeItem & { totalCentavos: number })[];
};

export type RepositorioSolicitacoes = {
  eventoDoCusto(eventoId: string): Promise<EventoDoCusto | null>;
  convocacaoDaPessoa(eventoId: string, pessoaId: string): Promise<string | null>;
  solicitacaoDaPessoa(eventoId: string, pessoaId: string): Promise<string | null>;
  regras(): Promise<RegraDeCusto[]>;
  inserirSolicitacao(solicitacao: {
    eventoId: string;
    pessoaId: string;
    convocacaoId: string;
    totalCentavos: number;
    nivel: NivelDeExcecao;
    usuarioId: string;
    instante: Date;
  }): Promise<{ id: string; protocolo: string }>;
  /** Apaga deslocamentos e itens da solicitação e grava os novos. */
  gravarLinhas(solicitacaoId: string, linhas: LinhasCalculadas, instante: Date): Promise<void>;
  travarSolicitacao(solicitacaoId: string): Promise<SolicitacaoTravada | null>;
  /** Compare-and-set: só muda se a auditoria ainda for `de` e a versão for a da tela. false = outra pessoa mudou antes. */
  mudarSolicitacao(
    solicitacaoId: string,
    condicao: { de: SituacaoDaSolicitacao["auditoria"]; atualizadoEm: string },
    mudanca: {
      para: SituacaoDaSolicitacao;
      instante: Date;
      auditoria?: { usuarioId: string; parecer: string | null } | "LIMPAR";
      recalculo?: { totalCentavos: number; nivel: NivelDeExcecao; registradoPor: string };
    },
  ): Promise<boolean>;
  registrar(registro: {
    solicitacaoId: string;
    eventoId: string;
    acao: string;
    statusDe?: string | null;
    statusPara?: string | null;
    comentario?: string | null;
    emNomeDePessoaId?: string | null;
    dados?: Record<string, unknown>;
    usuarioId: string;
  }): Promise<void>;
};

async function eventoDoCusto(repo: RepositorioSolicitacoes, eventoId: string): Promise<EventoDoCusto> {
  const evento = await repo.eventoDoCusto(eventoId);
  if (!evento) throw new ErroDosCustos("Evento não encontrado.");
  return evento;
}

/** Cálculo pelas regras que valem na data do evento (tipo e UF do local). */
export async function calcularPelasRegras(
  repo: Pick<RepositorioSolicitacoes, "regras">,
  evento: EventoDoCusto,
  linhas: { deslocamentos: EntradaDeDeslocamento[]; itens: EntradaDeItem[] },
): Promise<{ calculada: SolicitacaoCalculada; linhas: LinhasCalculadas; regras: RegraDeCusto[] }> {
  const todas = await repo.regras();
  const aplicaveis = regrasAplicaveis(todas, { tipoEventoId: evento.tipoEventoId, uf: evento.uf, data: evento.data });
  const calculada = calcularSolicitacao(linhas, regrasDoCalculo(aplicaveis));
  const idsDasRegras = new Set(todas.map((regra) => regra.id));
  for (const item of linhas.itens) {
    if (item.regraCustoId && !idsDasRegras.has(item.regraCustoId)) throw new ErroDosCustos("Uma das regras de custo dos itens não existe mais. Recarregue a página.");
  }
  return {
    calculada,
    regras: aplicaveis,
    linhas: {
      deslocamentos: linhas.deslocamentos.map((deslocamento, indice) => ({ ...deslocamento, calculado: calculada.deslocamentos[indice]! })),
      itens: linhas.itens.map((item, indice) => ({ ...item, totalCentavos: calculada.itens[indice]! })),
    },
  };
}

async function travada(repo: RepositorioSolicitacoes, solicitacaoId: string): Promise<SolicitacaoTravada> {
  const solicitacao = await repo.travarSolicitacao(solicitacaoId);
  if (!solicitacao) throw new ErroDosCustos("Solicitação não encontrada. Recarregue a página.");
  return solicitacao;
}

function destino(solicitacao: SolicitacaoTravada, acao: AcaoDeAuditoria): SituacaoDaSolicitacao {
  const transicao = transicaoDaAuditoria(solicitacao.situacao, acao);
  if ("erro" in transicao) throw new ErroDosCustos(mensagemDaTransicaoInvalida(acao, transicao.erro));
  return transicao.para;
}

export async function registrarSolicitacao(
  repo: RepositorioSolicitacoes,
  entrada: RegistrarSolicitacao,
  { usuarioId, instante }: ContextoDaAcao,
): Promise<{ id: string; protocolo: string; nivel: NivelDeExcecao; totalCentavos: number }> {
  const evento = await eventoDoCusto(repo, entrada.eventoId);
  const convocacaoId = await repo.convocacaoDaPessoa(entrada.eventoId, entrada.pessoaId);
  if (!convocacaoId) throw new ErroDosCustos("Esta pessoa não esteve na escala deste evento.");
  const existente = await repo.solicitacaoDaPessoa(entrada.eventoId, entrada.pessoaId);
  if (existente) throw new SolicitacaoJaExisteError(existente);

  const { calculada, linhas } = await calcularPelasRegras(repo, evento, entrada);
  const solicitacao = await repo.inserirSolicitacao({
    eventoId: entrada.eventoId,
    pessoaId: entrada.pessoaId,
    convocacaoId,
    totalCentavos: calculada.totalCentavos,
    nivel: calculada.nivel,
    usuarioId,
    instante,
  });
  await repo.gravarLinhas(solicitacao.id, linhas, instante);
  await repo.registrar({
    solicitacaoId: solicitacao.id,
    eventoId: entrada.eventoId,
    acao: "SOLICITACAO_REGISTRADA",
    statusPara: "PENDENTE",
    emNomeDePessoaId: entrada.pessoaId,
    usuarioId,
    dados: { protocolo: solicitacao.protocolo, totalCentavos: calculada.totalCentavos, nivel: calculada.nivel },
  });
  return { ...solicitacao, nivel: calculada.nivel, totalCentavos: calculada.totalCentavos };
}

/** REPROVADO → PENDENTE: o time registra a correção em nome da pessoa e a solicitação volta para a fila. */
export async function corrigirSolicitacao(
  repo: RepositorioSolicitacoes,
  entrada: CorrigirSolicitacao,
  { usuarioId, instante }: ContextoDaAcao,
): Promise<SolicitacaoTravada> {
  const solicitacao = await travada(repo, entrada.solicitacaoId);
  const para = destino(solicitacao, "CORRIGIR");
  const evento = await eventoDoCusto(repo, solicitacao.eventoId);
  const { calculada, linhas } = await calcularPelasRegras(repo, evento, entrada);

  const mudou = await repo.mudarSolicitacao(
    solicitacao.id,
    { de: solicitacao.situacao.auditoria, atualizadoEm: entrada.atualizadoEm },
    { para, instante, recalculo: { totalCentavos: calculada.totalCentavos, nivel: calculada.nivel, registradoPor: usuarioId } },
  );
  if (!mudou) throw new CustosMudouError(`a solicitação ${solicitacao.protocolo} mudou`);
  await repo.gravarLinhas(solicitacao.id, linhas, instante);
  await repo.registrar({
    solicitacaoId: solicitacao.id,
    eventoId: solicitacao.eventoId,
    acao: "CORRECAO_REGISTRADA",
    statusDe: solicitacao.situacao.auditoria,
    statusPara: para.auditoria,
    emNomeDePessoaId: solicitacao.pessoaId,
    usuarioId,
    dados: { totalCentavos: calculada.totalCentavos, nivel: calculada.nivel },
  });
  return { ...solicitacao, situacao: para, nivel: calculada.nivel };
}

export async function aprovarSolicitacao(repo: RepositorioSolicitacoes, entrada: AprovarSolicitacao, { usuarioId, instante }: ContextoDaAcao): Promise<SolicitacaoTravada> {
  const solicitacao = await travada(repo, entrada.solicitacaoId);
  const para = destino(solicitacao, "APROVAR");
  const parecer = entrada.parecer?.trim() || null;
  if (exigeMotivo("APROVAR", solicitacao.nivel) && (!parecer || parecer.length < 3)) {
    throw new ErroDosCustos("Esta solicitação tem alerta crítico: escreva o motivo da aprovação.");
  }
  const mudou = await repo.mudarSolicitacao(
    solicitacao.id,
    { de: solicitacao.situacao.auditoria, atualizadoEm: entrada.atualizadoEm },
    { para, instante, auditoria: { usuarioId, parecer } },
  );
  if (!mudou) throw new CustosMudouError(`a solicitação ${solicitacao.protocolo} mudou`);
  await repo.registrar({
    solicitacaoId: solicitacao.id,
    eventoId: solicitacao.eventoId,
    acao: "AUDITORIA_APROVADA",
    statusDe: solicitacao.situacao.auditoria,
    statusPara: para.auditoria,
    comentario: parecer,
    usuarioId,
    dados: { nivel: solicitacao.nivel, financeiro: para.financeiro },
  });
  return { ...solicitacao, situacao: para };
}

export async function reprovarSolicitacao(repo: RepositorioSolicitacoes, entrada: ReprovarSolicitacao, { usuarioId, instante }: ContextoDaAcao): Promise<SolicitacaoTravada> {
  const solicitacao = await travada(repo, entrada.solicitacaoId);
  const para = destino(solicitacao, "REPROVAR");
  const mudou = await repo.mudarSolicitacao(
    solicitacao.id,
    { de: solicitacao.situacao.auditoria, atualizadoEm: entrada.atualizadoEm },
    { para, instante, auditoria: { usuarioId, parecer: entrada.motivo } },
  );
  if (!mudou) throw new CustosMudouError(`a solicitação ${solicitacao.protocolo} mudou`);
  await repo.registrar({
    solicitacaoId: solicitacao.id,
    eventoId: solicitacao.eventoId,
    acao: "AUDITORIA_REPROVADA",
    statusDe: solicitacao.situacao.auditoria,
    statusPara: para.auditoria,
    comentario: entrada.motivo,
    usuarioId,
    dados: { nivel: solicitacao.nivel },
  });
  return { ...solicitacao, situacao: para };
}

export async function reabrirAuditoria(repo: RepositorioSolicitacoes, entrada: ReabrirAuditoria, { usuarioId, instante }: ContextoDaAcao): Promise<SolicitacaoTravada> {
  const solicitacao = await travada(repo, entrada.solicitacaoId);
  const para = destino(solicitacao, "REABRIR");
  const mudou = await repo.mudarSolicitacao(solicitacao.id, { de: solicitacao.situacao.auditoria, atualizadoEm: entrada.atualizadoEm }, { para, instante, auditoria: "LIMPAR" });
  if (!mudou) throw new CustosMudouError(`a solicitação ${solicitacao.protocolo} mudou`);
  await repo.registrar({
    solicitacaoId: solicitacao.id,
    eventoId: solicitacao.eventoId,
    acao: "AUDITORIA_REABERTA",
    statusDe: solicitacao.situacao.auditoria,
    statusPara: para.auditoria,
    usuarioId,
  });
  return { ...solicitacao, situacao: para };
}
