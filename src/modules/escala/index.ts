export {
  calcularVagas,
  compilarRegraVagas,
  type DadosDoEvento,
  type Pendencia,
  RegraVagasInvalidaError,
  type ResultadoVagas,
  totalDeVagas,
  type Vaga,
  VARIAVEIS_DO_EVENTO,
} from "./domain/vagas";
export { DivisaoPorZeroError, FormulaInvalidaError } from "./domain/formula";
export { type LinhaDaRegra, type PlanoVagas, planejarVagas, planoVazio } from "./domain/plano-vagas";
export {
  type EventoParaVagas,
  gerarVagasDoEvento,
  type RepositorioVagas,
  type ResultadoGerarVagas,
  type TransacaoVagas,
} from "./service/gerar-vagas";
export { criarRepositorioVagas, HORARIO_PADRAO } from "./repository/vagas-repository";
export {
  ConvocacaoInativaError,
  ConvocacaoNaoEncontradaError,
  convocacaoAtiva,
  type EquipeDaComunicacao,
  EscalaMudouError,
  EventoNaoEncontradoError,
  podeComunicar,
  type StatusConvocacao,
  type StatusEscala,
  transicaoDaComunicacao,
  transicaoDoConvite,
} from "./domain/convite";
export { concluirComunicacao, registrarConvite, type RepositorioConvite } from "./service/convite";
export { criarRepositorioConvite } from "./repository/convite-repository";

export {
  type AcaoDaEscala,
  aceitaResposta,
  conferirEnvio,
  type ConferenciaDoEnvio,
  escalaEditavel,
  eventoEncerrado,
  type MotivoDaPendencia,
  transicaoDaEscala,
} from "./domain/status-escala";
export { type AcaoDaConvocacao, rotuloDaConvocacao, transicaoDaConvocacao } from "./domain/convocacao";
export { type Candidato, type Disponibilidade, type NivelNaFuncao, ordenarSugestoes, pontuacaoDaSugestao, type Sugestoes } from "./domain/sugestao";
export { type Coordenada, distanciaKm } from "./domain/distancia";
export { type LinhaDaMontagem, type LinhaResumida, type ResumoDaMontagem, resumoDaMontagem } from "./domain/montagem";
export { type PontoDeAtencao, pontosDeAtencao, type SituacaoParaAtencao } from "./domain/atencao";
export { descreverLinha, type LinhaGuiada, lerRegraGuiada, type ModoDaVaga, regraDasLinhas } from "./domain/regra-guiada";
export {
  ConflitoDeAgendaError,
  EnvioBloqueadoError,
  ErroDaEscala,
  EscalaTravadaError,
  NaoEncontradoError,
  TransicaoInvalidaError,
  VagasEsgotadasError,
} from "./domain/erros";
export {
  adicionarVagaManualSchema,
  alterarVagasSchema,
  aprovarEscalaSchema,
  atualizarConvocacaoSchema,
  confirmarVagasSchema,
  definirVagaDigitadaSchema,
  type Deslocamento,
  DESLOCAMENTOS,
  devolverEscalaSchema,
  enviarParaAprovacaoSchema,
  porNaVagaSchema,
  reabrirEscalaSchema,
  recalcularVagasDoTipoSchema,
  registrarRespostaDoStaffSchema,
  removerVagaManualSchema,
  salvarRegraDeVagasSchema,
  tirarDaVagaSchema,
} from "./domain/schemas";
export type { ConvocacaoTravada, EventoTravado, LinhaTravada, RepositorioMontagem } from "./service/portas";
export {
  adicionarVagaManual,
  alterarVagas,
  confirmarVagas,
  definirDeslocamento,
  definirVagaDigitada,
  porNaVaga,
  removerVagaManual,
  tirarDaVaga,
} from "./service/montar-escala";
export { aprovarEscala, devolverEscala, enviarParaAprovacao, reabrirEscala } from "./service/aprovacao";
export { registrarRespostaDoStaff } from "./service/resposta-do-staff";
export { criarRepositorioMontagem } from "./repository/montagem-repository";
export {
  type CandidatoDoBanco,
  type ConsultaDaEscala,
  type ConvocacaoDaTela,
  criarConsultaDaEscala,
  type EventoDaLista,
  type EventoDaMontagem,
  type LinhaDaTela,
  type LinhaParaSugestao,
  type RegistroDaEscala,
  type SemResposta,
  type SituacaoDoEventoParaAtencao,
} from "./repository/consulta-repository";
export { criarRepositorioRegras, type RepositorioRegras, type TipoComRegra } from "./repository/regras-repository";
export { andamentoDoEvento, type Etapa, proximoPasso, type ProximoPasso, type SituacaoDaEtapa } from "./domain/andamento";
