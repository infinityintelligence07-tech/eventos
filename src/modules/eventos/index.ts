export {
  CodigoEventoInvalidoError,
  montarCodigoEvento,
  normalizarCodigoEvento,
  type PartesCodigo,
  partesDoCodigo,
} from "./domain/codigo";
export {
  type EventoDaTurma,
  eventoDaTurma,
  type LocalDaTurma,
  type MotivoTurmaIgnorada,
  PRIMEIRA_EDICAO_ASM,
  siglaDaUf,
  type StatusEvento,
  statusDoEvento,
  tipoDoTreinamento,
  type TurmaConvertida,
  type TurmaIamControl,
} from "./domain/turma";
export {
  type AcaoSincronizacao,
  criarRepositorioSincronizacao,
  type EventoSalvo,
  type RepositorioSincronizacao,
} from "./repository/sincronizacao-repository";
