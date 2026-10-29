import type { StatusConvocacao, StatusEscala } from "../domain/convite";
import type { Deslocamento } from "../domain/schemas";

// O que a montagem, a aprovação e a resposta do staff precisam do banco. Tudo roda no executor da transação
// do fluxo; as leituras "travar…" usam FOR UPDATE. Ordem das travas: evento → linha → convocação.

export type EventoTravado = {
  id: string;
  codigo: string | null;
  status: string;
  statusEscala: StatusEscala;
  regraVagas: unknown;
  expectativaPublico: number | null;
  pessoasNaFila: number | null;
  /** AAAA-MM-DD no fuso de São Paulo. */
  dataInicio: string;
  dataFim: string;
};

export type LinhaTravada = {
  id: string;
  eventoId: string;
  funcaoId: string | null;
  funcao: string | null;
  nomeDaFuncao: string;
  data: string;
  quantidade: number;
  origem: "REGRA" | "MANUAL";
  confirmada: boolean;
  ativas: number;
};

export type ConvocacaoTravada = { id: string; escalaId: string; eventoId: string; pessoaId: string; nome: string; status: StatusConvocacao };

export type EntradaDoHistorico = {
  entidade: "ESCALA_DO_EVENTO" | "CONVOCACAO";
  entidadeId: string;
  eventoId: string;
  acao: string;
  statusDe?: string | null;
  statusPara?: string | null;
  comentario?: string | null;
  emNomeDePessoaId?: string | null;
  usuarioId: string;
  dados?: Record<string, unknown>;
};

export type RepositorioMontagem = {
  travarEvento(eventoId: string): Promise<EventoTravado | null>;
  /** SEM_ESCALA → RASCUNHO na primeira mudança (compare-and-set; sem efeito em outro status). */
  comecarRascunho(eventoId: string, instante: Date): Promise<void>;
  travarLinha(escalaId: string): Promise<LinhaTravada | null>;
  linhasDoEvento(eventoId: string): Promise<LinhaTravada[]>;
  /** `confirmadaPor` nulo desfaz a confirmação. */
  definirVagas(escalaId: string, entrada: { quantidade: number; confirmadaPor: string | null; instante: Date }): Promise<void>;
  funcaoPorCodigo(codigo: string): Promise<{ id: string; codigo: string; nome: string } | null>;
  funcaoPorId(funcaoId: string): Promise<{ id: string; codigo: string; nome: string } | null>;
  inserirLinha(entrada: {
    eventoId: string;
    funcaoId: string;
    data: string;
    quantidade: number;
    origem: "REGRA" | "MANUAL";
    confirmadaPor: string;
    instante: Date;
  }): Promise<string>;
  apagarLinha(escalaId: string, instante: Date): Promise<void>;
  /** Pessoa com perfil de staff (pessoa_evento) e ativa no cadastro. */
  pessoaEscalavel(pessoaId: string): Promise<{ nome: string } | null>;
  convocacaoNaLinha(escalaId: string, pessoaId: string): Promise<{ id: string; status: StatusConvocacao } | null>;
  ativaEmOutraLinhaDoEvento(eventoId: string, escalaId: string, pessoaId: string): Promise<boolean>;
  /** Códigos (ou nomes) dos outros eventos com datas sobrepostas onde a pessoa está ativa. */
  conflitosDeAgenda(eventoId: string, pessoaId: string): Promise<string[]>;
  inserirConvocacao(entrada: { escalaId: string; pessoaId: string; usuarioId: string; sugestaoScore: number | null; instante: Date }): Promise<string>;
  /** CANCELADA/RECUSADA → SUGERIDA na mesma linha (limpa convite e resposta). false = o status mudou. */
  reativarConvocacao(
    convocacaoId: string,
    entrada: { de: StatusConvocacao; usuarioId: string; sugestaoScore: number | null; instante: Date },
  ): Promise<boolean>;
  travarConvocacao(convocacaoId: string): Promise<ConvocacaoTravada | null>;
  apagarConvocacao(convocacaoId: string, de: StatusConvocacao): Promise<boolean>;
  mudarConvocacao(
    convocacaoId: string,
    entrada: { de: StatusConvocacao; para: StatusConvocacao; instante: Date; resposta?: { motivoRecusa: string | null; registradoPor: string } },
  ): Promise<boolean>;
  definirDeslocamento(convocacaoId: string, deslocamento: Deslocamento | null, instante: Date): Promise<void>;
  /** Compare-and-set do status. `aprovadoPor` grava aprovado_por/em; `limparAprovacao` zera os dois. */
  mudarStatusDaEscala(
    eventoId: string,
    entrada: { de: StatusEscala; para: StatusEscala; instante: Date; aprovadoPor?: string; limparAprovacao?: boolean },
  ): Promise<boolean>;
  registrar(entrada: EntradaDoHistorico): Promise<void>;
};
