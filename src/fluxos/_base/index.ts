export type { Db, Executor } from "@/core/db/database";
export { type AutoriaDoRegistro, type EntidadeRegistrada, type EntradaDoRegistro, registrarAcao } from "@/core/db/registro-acao";
export {
  type LeituraDoServidor,
  type ModoDeEscrita,
  type SituacaoDaEscrita,
  type TravaDeEscrita,
  USUARIO_TESTE,
} from "@/core/ambiente";
export { AcessoNegadoError, type AtorDaEscrita } from "@/core/autorizacao";
export {
  bancoParaEscrita,
  bancoParaLeitura,
  criarGuardaDeEscrita,
  type DependenciasDaGuarda,
  type GuardaDeEscrita,
  lerEmTransacao,
  marcadorDoBanco,
  situacaoDaEscrita,
  transacao,
  transacaoNoBanco,
} from "./banco";
export {
  AcaoSemRegistroError,
  ConflitoDeVersaoError,
  EscritaDesligadaError,
  MENSAGEM_CONFLITO,
  MENSAGEM_DADOS_RECUSADOS,
  MENSAGEM_ESCRITA_DESLIGADA,
  MENSAGEM_FALHA,
  mensagemDoErro,
  RegraDeNegocioError,
} from "./erros";
