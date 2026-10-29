export type { Db, Executor } from "@/core/db/database";
export { type EntidadeRegistrada, type EntradaDoRegistro, registrarAcao } from "@/core/db/registro-acao";
export { type LeituraDoServidor, type SituacaoDaEscrita, type TravaDeEscrita, USUARIO_TESTE } from "@/core/ambiente";
export {
  bancoParaEscrita,
  bancoParaLeitura,
  criarGuardaDeEscrita,
  type DependenciasDaGuarda,
  type GuardaDeEscrita,
  marcadorDoBanco,
  situacaoDaEscrita,
  transacao,
} from "./banco";
export {
  ConflitoDeVersaoError,
  EscritaDesligadaError,
  MENSAGEM_CONFLITO,
  MENSAGEM_DADOS_RECUSADOS,
  MENSAGEM_ESCRITA_DESLIGADA,
  MENSAGEM_FALHA,
  mensagemDoErro,
  RegraDeNegocioError,
} from "./erros";
