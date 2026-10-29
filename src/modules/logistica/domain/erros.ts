// Erros que o serviço lança com a mensagem pronta para a tela; o fluxo traduz para RegraDeNegocioError.

export class ErroDaLogistica extends Error {
  constructor(readonly mensagem: string) {
    super(mensagem);
    this.name = "ErroDaLogistica";
  }
}

/** O compare-and-set não achou a versão esperada: outra pessoa mudou antes. O fluxo traduz para ConflitoDeVersaoError. */
export class LogisticaMudouError extends Error {
  constructor(detalhe: string) {
    super(detalhe);
    this.name = "LogisticaMudouError";
  }
}
