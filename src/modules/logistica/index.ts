export { dataEmSaoPaulo, diasEntre, somarDias } from "./domain/datas";
export { DIAS_ABRE_A_JANELA, DIAS_ATRASADO, type JanelaDeCompra, janelaDeCompra, precisaPedir } from "./domain/janela";
export {
  aguardandoSdc,
  pedidoAtivo,
  type PreferenciaDeHorario,
  rotuloDaPreferencia,
  rotuloDaSituacaoDoVoo,
  rotuloDoSentido,
  type Sentido,
  type SituacaoDoPedido,
  type SituacaoDoVoo,
  textoDoPedidoDeHospedagem,
  textoDoPedidoDeVoo,
  type TipoDoPedido,
  type TrechoDesejado,
  transicaoDoPedido,
} from "./domain/pedido";
export {
  misturaSexos,
  podeOcupar,
  type QuartoDoRooming,
  rotuloDaCapacidade,
  rotuloDoSexoDoQuarto,
  type Sexo,
  sugerirRooming,
  textoDoRooming,
} from "./domain/rooming";
export { lugaresLivres } from "./domain/caronas";
export { ErroDaLogistica, LogisticaMudouError } from "./domain/erros";
export {
  type AdicionarQuarto,
  adicionarQuartoSchema,
  type AlterarHospedagem,
  type AlterarPedido,
  type CancelarPedido,
  type CriarCarona,
  type CriarHospedagem,
  type DefinirCarona,
  type PorNoQuarto,
  type RegistrarPedidoDeHospedagem,
  type RegistrarPedidoDeVoo,
  type RegistrarRetornoDeHospedagem,
  type RegistrarRetornoDeVoo,
  alterarHospedagemSchema,
  alterarPedidoSchema,
  aplicarRoomingSugeridoSchema,
  cancelarPedidoSchema,
  criarCaronaSchema,
  criarHospedagemSchema,
  definirCaronaSchema,
  PREFERENCIAS,
  porNoQuartoSchema,
  registrarPedidoDeHospedagemSchema,
  registrarPedidoDeVooSchema,
  registrarRetornoDeHospedagemSchema,
  registrarRetornoDeVooSchema,
  removerCaronaSchema,
  removerQuartoSchema,
  SENTIDOS,
  tirarDaCaronaSchema,
  tirarDoQuartoSchema,
} from "./domain/schemas";
export * as servicoDePedidos from "./service/pedidos";
export * as servicoDeHospedagem from "./service/hospedagem";
export * as servicoDeCaronas from "./service/caronas";
export { type ContextoDaAcao } from "./service/pedidos";
export {
  criarRepositorioPedidos,
  type EventoDaLogistica,
  type PassageiroDeVoo,
  type PedidoDaSdc,
  type TrechoDoPedido,
} from "./repository/pedidos-repository";
export {
  criarRepositorioHospedagem,
  type HospedagemDoEvento,
  type LocalDeHospedagem,
  type OcupanteDoQuarto,
  type PessoaDaEquipe,
  type QuartoDaHospedagem,
} from "./repository/hospedagem-repository";
export { type CaronaDoEvento, criarRepositorioCaronas, type PessoaDaCarona } from "./repository/caronas-repository";
