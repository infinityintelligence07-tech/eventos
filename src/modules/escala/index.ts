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
