export {
  type CopyGerada,
  type DadosCopy,
  formatarPeriodo,
  gerarCopy,
  ondePreencher,
  type OndePreencher,
  type ParteDaCopy,
  primeiroNome,
  rotuloDaVariavel,
  saudacao,
  validarModelo,
  VARIAVEIS_COPY,
  type VariavelDaCopy,
} from "./domain/copy";
export {
  type ContextoDaCopy,
  dadosDaCopy,
  type Deslocamento,
  descreverTrecho,
  type HospedagemDaCopy,
  rotuloDoDeslocamento,
  type TrechoDaCopy,
} from "./domain/contexto-da-copy";
export { type ModeloDeCopy, modeloEmUso, trocaDeTipoRecusada } from "./domain/modelo";
export {
  type CanalDaMensagem,
  contarSituacoes,
  type ContagemDeSituacoes,
  type EnvioAnterior,
  listarEmPortugues,
  ORDEM_DAS_SITUACOES,
  type RecusaDoEnvio,
  recusaDoEnvio,
  rotuloDoCanal,
  rotuloDoTipoDeModelo,
  type SituacaoDaCopy,
  situacaoDaCopy,
  type TipoDeModelo,
  TIPOS_DE_MODELO,
} from "./domain/situacao";
export {
  CHAVE_LINK_CUSTOS,
  corpoDoModeloSchema,
  LIMITE_DO_CORPO,
  type MarcarCopyComoEnviada,
  marcarCopyComoEnviadaSchema,
  definirModeloAtivoSchema,
  type PreviaDoModelo,
  previaDoModeloSchema,
  type SalvarLinkDeCustos,
  salvarLinkDeCustosSchema,
  type SalvarModelo,
  salvarModeloSchema,
} from "./domain/schemas";
export type {
  EnvioRegistrado,
  EventoDaComunicacao,
  ExemploDePrevia,
  NovoEnvio,
  PessoaDaEquipe,
  QuemRegistra,
  RepositorioComunicacao,
  TextoDoModelo,
  VooDaPessoa,
} from "./service/porta";
export { type CopyDaPessoa, gerarCopysDaEquipe } from "./service/copys";
export { criarRepositorioComunicacao, idDaConfiguracao } from "./repository/comunicacao-repository";
