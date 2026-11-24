import { exigeMotivo, mensagemDaTransicaoInvalida, type AcaoDeAuditoria, type CategoriaDoItem, type SituacaoDaSolicitacao, transicaoDaAuditoria } from "../domain/auditoria";
import { calcularSolicitacao, type DeslocamentoCalculado, type NivelDeExcecao, type SolicitacaoCalculada } from "../domain/calculo";
import { CustosMudouError, ErroDosCustos, SolicitacaoJaExisteError } from "../domain/erros";
import { DIAS_DE_PRAZO_DO_FORMULARIO, type PeriodoDoEvento, podeCorrigirNoPrazo, prazoDoFormulario, situacaoDoPrazo } from "../domain/prazo";
import { type RegraDeCusto, regrasAplicaveis, regrasDoCalculo } from "../domain/regras";
import type {
  AprovarSolicitacao,
  CorrigirMeuCusto,
  CorrigirSolicitacao,
  EntradaDeDeslocamento,
  EntradaDeDespesa,
  EntradaDeItem,
  ReabrirAuditoria,
  RegistrarSolicitacao,
  ReprovarSolicitacao,
  SolicitarCusto,
} from "../domain/schemas";
import { type AcaoSegregada, SegregacaoDeFuncoesError, type ViolacaoDeSegregacao, violacaoDeSegregacao } from "../domain/segregacao";

// Solicitação de custo (registrada pelo time em nome da pessoa ou enviada pela própria pessoa) e auditoria
// (docs/07 §4.4 e §6.7). O servidor recalcula combustível, depreciação, alerta e total: não confia no navegador.

/**
 * `pessoaId` e `email`: quem é o usuário no cadastro (SoD-3: ninguém audita o próprio custo). Sem e-mail, só a pessoa conta.
 * `dispensaSegregacao`: só o dono do sistema (docs/10); a regra dispensada vai para o registro_acao.
 * `propria`: quem envia é a própria pessoa (formulário do staff). Grava sem `registrado_por`, o registro_acao leva
 * `propria: true` e vale o prazo do formulário.
 */
export type ContextoDaAcao = { usuarioId: string; pessoaId: string | null; email?: string | null; dispensaSegregacao?: boolean; propria?: boolean; instante: Date };

/** `data` e `dataFim`: primeiro e último dia do evento em São Paulo (AAAA-MM-DD). */
export type EventoDoCusto = { id: string; codigo: string | null; nome: string; tipoEventoId: string | null; uf: string | null; data: string; dataFim: string; cancelado: boolean };

export type SolicitacaoTravada = {
  id: string;
  protocolo: string;
  eventoId: string;
  pessoaId: string;
  situacao: SituacaoDaSolicitacao;
  nivel: NivelDeExcecao;
  registradoPor: string | null;
  auditadoEm: Date | null;
};

export type LinhasCalculadas = {
  deslocamentos: (EntradaDeDeslocamento & { calculado: DeslocamentoCalculado })[];
  itens: (EntradaDeItem & { totalCentavos: number })[];
};

export type RepositorioSolicitacoes = {
  eventoDoCusto(eventoId: string): Promise<EventoDoCusto | null>;
  convocacaoDaPessoa(eventoId: string, pessoaId: string): Promise<string | null>;
  /** Trava a solicitação da pessoa no evento, se existir (só dentro da transação de escrita). */
  solicitacaoDaPessoa(eventoId: string, pessoaId: string): Promise<{ id: string; protocolo: string } | null>;
  regras(): Promise<RegraDeCusto[]>;
  inserirSolicitacao(solicitacao: {
    eventoId: string;
    pessoaId: string;
    convocacaoId: string;
    totalCentavos: number;
    nivel: NivelDeExcecao;
    /** Nulo = enviada pela própria pessoa. */
    registradoPor: string | null;
    instante: Date;
  }): Promise<{ id: string; protocolo: string }>;
  /** Apaga deslocamentos e itens da solicitação e grava os novos. */
  gravarLinhas(solicitacaoId: string, linhas: LinhasCalculadas, instante: Date): Promise<void>;
  /** Itens gravados, na forma em que entram de novo em `gravarLinhas`. */
  itensDaSolicitacao(solicitacaoId: string): Promise<EntradaDeItem[]>;
  travarSolicitacao(solicitacaoId: string): Promise<SolicitacaoTravada | null>;
  /** Usuários que registraram ou corrigiram a solicitação (registro_acao), para a SoD-2. */
  autoresDoRegistro(solicitacaoId: string): Promise<string[]>;
  /** core.pessoa.usuario_id e email da pessoa da solicitação, para a SoD-3. */
  cadastroDaPessoa(pessoaId: string): Promise<{ usuarioId: string | null; email: string | null }>;
  /** Compare-and-set: só muda se a auditoria ainda for `de` e a versão for a da tela. false = outra pessoa mudou antes. */
  mudarSolicitacao(
    solicitacaoId: string,
    condicao: { de: SituacaoDaSolicitacao["auditoria"]; atualizadoEm: string },
    mudanca: {
      para: SituacaoDaSolicitacao;
      instante: Date;
      auditoria?: { usuarioId: string; parecer: string | null } | "LIMPAR";
      recalculo?: { totalCentavos: number; nivel: NivelDeExcecao; registradoPor: string | null };
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

const periodoDoEvento = (evento: EventoDoCusto): PeriodoDoEvento => ({ dataInicio: evento.data, dataFim: evento.dataFim });

const diaEMes = (dia: string) => `${dia.slice(8, 10)}/${dia.slice(5, 7)}`;

/** O formulário do staff só aceita envio do primeiro dia do evento até 5 dias depois do último (docs/08 §11.4). */
function exigirPrazoAberto(evento: EventoDoCusto, instante: Date): void {
  const periodo = periodoDoEvento(evento);
  const { abreEm, fechaEm } = prazoDoFormulario(periodo);
  const situacao = situacaoDoPrazo(periodo, instante);
  switch (situacao) {
    case "ABERTO":
      return;
    case "AINDA_NAO_ABRIU":
      throw new ErroDosCustos(`O formulário deste evento abre em ${diaEMes(abreEm)}, o primeiro dia do evento.`);
    case "ENCERRADO":
      throw new ErroDosCustos(
        `O prazo para enviar a solicitação deste evento acabou em ${diaEMes(fechaEm)} (${DIAS_DE_PRAZO_DO_FORMULARIO} dias depois do último dia). Fale com o time de eventos.`,
      );
    default: {
      const desconhecida: never = situacao;
      throw new Error(`situação do prazo desconhecida: ${String(desconhecida)}`);
    }
  }
}

/** A autoria no registro_acao: em nome da pessoa (time) ou `propria: true` (a pessoa mesma). */
const autoria = (propria: boolean, pessoaId: string) => ({ emNomeDePessoaId: propria ? null : pessoaId, marca: propria ? { propria: true } : {} });

export async function registrarSolicitacao(
  repo: RepositorioSolicitacoes,
  entrada: RegistrarSolicitacao,
  { usuarioId, instante, propria = false }: ContextoDaAcao,
): Promise<{ id: string; protocolo: string; nivel: NivelDeExcecao; totalCentavos: number }> {
  const evento = await eventoDoCusto(repo, entrada.eventoId);
  const convocacaoId = await repo.convocacaoDaPessoa(entrada.eventoId, entrada.pessoaId);
  if (!convocacaoId) throw new ErroDosCustos(propria ? "Você não está na escala deste evento. Se serviu nele, fale com o time de eventos." : "Esta pessoa não esteve na escala deste evento.");
  const existente = await repo.solicitacaoDaPessoa(entrada.eventoId, entrada.pessoaId);
  if (existente) throw new SolicitacaoJaExisteError(existente.protocolo, propria);
  if (propria) {
    // Evento cancelado não abre o formulário do staff; o time ainda pode registrar em nome da pessoa.
    if (evento.cancelado) throw new ErroDosCustos("Este evento foi cancelado. Se você teve custo com ele, fale com o time de eventos.");
    exigirPrazoAberto(evento, instante);
  }

  const { calculada, linhas } = await calcularPelasRegras(repo, evento, entrada);
  const solicitacao = await repo.inserirSolicitacao({
    eventoId: entrada.eventoId,
    pessoaId: entrada.pessoaId,
    convocacaoId,
    totalCentavos: calculada.totalCentavos,
    nivel: calculada.nivel,
    registradoPor: propria ? null : usuarioId,
    instante,
  });
  await repo.gravarLinhas(solicitacao.id, linhas, instante);
  const { emNomeDePessoaId, marca } = autoria(propria, entrada.pessoaId);
  await repo.registrar({
    solicitacaoId: solicitacao.id,
    eventoId: entrada.eventoId,
    acao: "SOLICITACAO_REGISTRADA",
    statusPara: "PENDENTE",
    emNomeDePessoaId,
    usuarioId,
    dados: { protocolo: solicitacao.protocolo, totalCentavos: calculada.totalCentavos, nivel: calculada.nivel, ...marca },
  });
  return { ...solicitacao, nivel: calculada.nivel, totalCentavos: calculada.totalCentavos };
}

/** Recalcula, volta a solicitação reprovada para a fila (compare-and-set) e grava as linhas novas. */
async function aplicarCorrecao(
  repo: RepositorioSolicitacoes,
  solicitacao: SolicitacaoTravada,
  linhasDigitadas: { deslocamentos: EntradaDeDeslocamento[]; itens: EntradaDeItem[] },
  atualizadoEm: string,
  { usuarioId, instante, propria = false }: ContextoDaAcao,
): Promise<SolicitacaoTravada> {
  const para = destino(solicitacao, "CORRIGIR");
  const evento = await eventoDoCusto(repo, solicitacao.eventoId);
  const { calculada, linhas } = await calcularPelasRegras(repo, evento, linhasDigitadas);

  const mudou = await repo.mudarSolicitacao(
    solicitacao.id,
    { de: solicitacao.situacao.auditoria, atualizadoEm },
    { para, instante, recalculo: { totalCentavos: calculada.totalCentavos, nivel: calculada.nivel, registradoPor: propria ? null : usuarioId } },
  );
  if (!mudou) throw new CustosMudouError(`a solicitação ${solicitacao.protocolo} mudou`);
  await repo.gravarLinhas(solicitacao.id, linhas, instante);
  const { emNomeDePessoaId, marca } = autoria(propria, solicitacao.pessoaId);
  await repo.registrar({
    solicitacaoId: solicitacao.id,
    eventoId: solicitacao.eventoId,
    acao: "CORRECAO_REGISTRADA",
    statusDe: solicitacao.situacao.auditoria,
    statusPara: para.auditoria,
    emNomeDePessoaId,
    usuarioId,
    dados: { totalCentavos: calculada.totalCentavos, nivel: calculada.nivel, ...marca },
  });
  return { ...solicitacao, situacao: para, nivel: calculada.nivel, registradoPor: propria ? null : usuarioId };
}

/** REPROVADO → PENDENTE: o time registra a correção em nome da pessoa e a solicitação volta para a fila. */
export async function corrigirSolicitacao(repo: RepositorioSolicitacoes, entrada: CorrigirSolicitacao, contexto: ContextoDaAcao): Promise<SolicitacaoTravada> {
  const solicitacao = await travada(repo, entrada.solicitacaoId);
  return aplicarCorrecao(repo, solicitacao, entrada, entrada.atualizadoEm, { ...contexto, propria: false });
}

/** Categoria das despesas que o próprio staff declara (estacionamento, ônibus…). As outras categorias são do time. */
export const CATEGORIA_DA_DESPESA_DO_STAFF: CategoriaDoItem = "OUTRO";

const itensDasDespesas = (despesas: EntradaDeDespesa[]): EntradaDeItem[] =>
  despesas.map((despesa) => ({ categoria: CATEGORIA_DA_DESPESA_DO_STAFF, descricao: despesa.descricao, quantidade: 1, valorCentavos: despesa.valorCentavos }));

/** Quem envia pelo formulário do staff: a pessoa vem da sessão. */
export type ContextoDoStaff = ContextoDaAcao & { pessoaId: string };

/**
 * A própria pessoa envia a solicitação do evento em que está na escala, dentro do prazo. É o mesmo registro do
 * time (validação, cálculo e protocolo), sem `registrado_por`.
 */
export function solicitarCusto(repo: RepositorioSolicitacoes, entrada: SolicitarCusto, contexto: ContextoDoStaff) {
  return registrarSolicitacao(
    repo,
    { eventoId: entrada.eventoId, pessoaId: contexto.pessoaId, deslocamentos: entrada.deslocamentos, itens: itensDasDespesas(entrada.despesas) },
    { ...contexto, propria: true },
  );
}

/**
 * A própria pessoa corrige a solicitação reprovada e ela volta para a fila. Troca os deslocamentos e as despesas
 * que ela declara; os itens lançados pelo time (remuneração, alimentação…) ficam como estão.
 */
export async function corrigirMeuCusto(repo: RepositorioSolicitacoes, entrada: CorrigirMeuCusto, contexto: ContextoDoStaff): Promise<SolicitacaoTravada> {
  const existente = await repo.solicitacaoDaPessoa(entrada.eventoId, contexto.pessoaId);
  if (!existente) throw new ErroDosCustos("Você ainda não enviou solicitação para este evento. Recarregue a página.");
  const solicitacao = await travada(repo, existente.id);
  destino(solicitacao, "CORRIGIR");
  const evento = await eventoDoCusto(repo, solicitacao.eventoId);
  if (!podeCorrigirNoPrazo(periodoDoEvento(evento), solicitacao.auditadoEm, contexto.instante)) {
    throw new ErroDosCustos("O prazo para corrigir esta solicitação acabou. Fale com o time de eventos.");
  }
  const doTime = (await repo.itensDaSolicitacao(solicitacao.id)).filter((item) => item.categoria !== CATEGORIA_DA_DESPESA_DO_STAFF);
  return aplicarCorrecao(
    repo,
    solicitacao,
    { deslocamentos: entrada.deslocamentos, itens: [...doTime, ...itensDasDespesas(entrada.despesas)] },
    entrada.atualizadoEm,
    { ...contexto, propria: true },
  );
}

/** Recusa a violação; para o dono do sistema, devolve a regra dispensada (para o registro_acao). */
async function conferirSegregacao(
  repo: RepositorioSolicitacoes,
  acao: AcaoSegregada,
  solicitacao: SolicitacaoTravada,
  { usuarioId, pessoaId, email, dispensaSegregacao }: ContextoDaAcao,
): Promise<ViolacaoDeSegregacao | null> {
  const cadastro = await repo.cadastroDaPessoa(solicitacao.pessoaId);
  const violacao = violacaoDeSegregacao(acao, { usuarioId, pessoaId, email: email ?? null }, {
    pessoaId: solicitacao.pessoaId,
    usuarioDaPessoa: cadastro.usuarioId,
    emailDaPessoa: cadastro.email,
    registradoPor: solicitacao.registradoPor,
    autoresDoRegistro: await repo.autoresDoRegistro(solicitacao.id),
  });
  if (violacao && !dispensaSegregacao) throw new SegregacaoDeFuncoesError(violacao);
  return violacao;
}

const dispensa = (violacao: ViolacaoDeSegregacao | null) => (violacao ? { segregacaoDispensada: violacao } : {});

export async function aprovarSolicitacao(repo: RepositorioSolicitacoes, entrada: AprovarSolicitacao, contexto: ContextoDaAcao): Promise<SolicitacaoTravada> {
  const { usuarioId, instante } = contexto;
  const solicitacao = await travada(repo, entrada.solicitacaoId);
  const dispensada = await conferirSegregacao(repo, "APROVAR", solicitacao, contexto);
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
    dados: { nivel: solicitacao.nivel, financeiro: para.financeiro, ...dispensa(dispensada) },
  });
  return { ...solicitacao, situacao: para };
}

export async function reprovarSolicitacao(repo: RepositorioSolicitacoes, entrada: ReprovarSolicitacao, contexto: ContextoDaAcao): Promise<SolicitacaoTravada> {
  const { usuarioId, instante } = contexto;
  const solicitacao = await travada(repo, entrada.solicitacaoId);
  const dispensada = await conferirSegregacao(repo, "REPROVAR", solicitacao, contexto);
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
    dados: { nivel: solicitacao.nivel, ...dispensa(dispensada) },
  });
  return { ...solicitacao, situacao: para };
}

export async function reabrirAuditoria(repo: RepositorioSolicitacoes, entrada: ReabrirAuditoria, contexto: ContextoDaAcao): Promise<SolicitacaoTravada> {
  const { usuarioId, instante } = contexto;
  const solicitacao = await travada(repo, entrada.solicitacaoId);
  const dispensada = await conferirSegregacao(repo, "REABRIR", solicitacao, contexto);
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
    ...(dispensada && { dados: dispensa(dispensada) }),
  });
  return { ...solicitacao, situacao: para };
}
