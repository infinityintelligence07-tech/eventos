import type { Deslocamento, HospedagemDaCopy, TrechoDaCopy } from "../domain/contexto-da-copy";
import type { ModeloDeCopy } from "../domain/modelo";
import type { CanalDaMensagem, EnvioAnterior, TipoDeModelo } from "../domain/situacao";

// Porta do módulo: implementada por repository/comunicacao-repository.ts sobre o executor do fluxo.

export type EventoDaComunicacao = {
  id: string;
  nome: string;
  codigo: string | null;
  edicao: string | null;
  tipoSigla: string | null;
  tipoNome: string | null;
  /** AAAA-MM-DD em São Paulo. */
  dataInicio: string;
  dataFim: string;
  /** Valor do CHECK evento_status_escala_check. */
  statusEscala: string;
  local: { nome: string; cidade: string; uf: string } | null;
};

/** Convocação ativa (SUGERIDA, CONVIDADA ou ACEITA) com o que a copy usa da pessoa e da vaga. */
export type PessoaDaEquipe = {
  convocacaoId: string;
  eventoId: string;
  pessoaId: string;
  status: string;
  nome: string;
  telefone: string | null;
  sexo: "F" | "M" | null;
  funcao: string | null;
  /** Dia da vaga (AAAA-MM-DD). */
  data: string;
  horaInicio: string;
  horaFim: string;
  deslocamento: Deslocamento | null;
};

export type VooDaPessoa = TrechoDaCopy & { eventoId: string; pessoaId: string; sentido: "IDA" | "VOLTA" };

export type EnvioRegistrado = EnvioAnterior & { convocacaoId: string; tipo: TipoDeModelo };

export type ExemploDePrevia = { convocacaoId: string; eventoId: string; nome: string; evento: string };

export type NovoEnvio = {
  convocacaoId: string;
  eventoId: string;
  modeloId: string;
  tipo: TipoDeModelo;
  texto: string;
  dadosHash: string;
  canal: CanalDaMensagem;
  instante: Date;
  usuarioId: string;
};

export type RepositorioComunicacao = {
  /** Sem `eventoId`, só eventos com a escala num dos `statusEscala`. Eventos apagados nunca voltam. */
  eventos(filtro: { eventoId?: string; statusEscala?: string[]; fimDesde?: Date }): Promise<EventoDaComunicacao[]>;
  equipe(eventoIds: string[], convocacaoId?: string): Promise<PessoaDaEquipe[]>;
  /** Por convocação: onde a pessoa dorme e quem divide o quarto. */
  hospedagens(convocacaoIds: string[]): Promise<Map<string, HospedagemDaCopy>>;
  /** Trechos de pedidos de voo EMITIDO (ALTERADO espera a nova emissão). */
  voos(eventoIds: string[]): Promise<VooDaPessoa[]>;
  /** Última mensagem ENVIADA por convocação e tipo de modelo. */
  ultimosEnvios(convocacaoIds: string[]): Promise<EnvioRegistrado[]>;
  modelos(): Promise<ModeloDeCopy[]>;
  modelo(modeloId: string): Promise<ModeloDeCopy | null>;
  configuracao(chave: string): Promise<string | null>;
  /** Pessoas ativas de eventos que não terminaram; as de escala aprovada ou comunicada primeiro. */
  exemplosParaPrevia(fimDesde: Date, limite: number): Promise<ExemploDePrevia[]>;
  /** Trava a convocação (FOR UPDATE) para dois envios da mesma pessoa não passarem juntos. */
  travarConvocacao(convocacaoId: string): Promise<{ eventoId: string; status: string } | null>;
  /** O envio anterior do mesmo tipo vira DESATUALIZADA; grava a nova ENVIADA e o registro_acao. */
  registrarEnvio(envio: NovoEnvio): Promise<void>;
  // Escritas de modelo e configuração gravam também o registro_acao (MODELO_COPY / CONFIGURACAO).
  /** Nasce inativo. */
  criarModelo(modelo: TextoDoModelo, registro: QuemRegistra): Promise<string>;
  /** false = o modelo não existe. */
  alterarModelo(modeloId: string, modelo: TextoDoModelo, registro: QuemRegistra): Promise<boolean>;
  /**
   * Ativa e desativa o ativo do mesmo tipo (um ativo por tipo, modelo_copy_ativo_unique), travando o tipo
   * para duas ativações juntas não colidirem. Nulo = o modelo não existe; já ativo = nada muda.
   */
  ativarModelo(modeloId: string, registro: QuemRegistra): Promise<{ tipo: TipoDeModelo; desativados: string[] } | null>;
  /** false = o modelo não existe. */
  desativarModelo(modeloId: string, registro: QuemRegistra): Promise<boolean>;
  salvarConfiguracao(chave: string, valor: string | null, registro: QuemRegistra): Promise<void>;
};

export type TextoDoModelo = { tipo: TipoDeModelo; nome: string; corpo: string };

export type QuemRegistra = { usuarioId: string; instante: Date };
