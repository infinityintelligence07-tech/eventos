// Erros que o serviço lança com a mensagem pronta para a tela; o fluxo traduz para RegraDeNegocioError.

export class ErroDosCustos extends Error {
  constructor(readonly mensagem: string) {
    super(mensagem);
    this.name = "ErroDosCustos";
  }
}

/** UNIQUE (evento_id, pessoa_id): a tela oferece "Abrir solicitação". */
export class SolicitacaoJaExisteError extends ErroDosCustos {
  constructor(readonly protocolo: string) {
    super(`Esta pessoa já tem a solicitação ${protocolo} para este evento.`);
    this.name = "SolicitacaoJaExisteError";
  }
}

/** O compare-and-set não achou a versão esperada: outra pessoa mudou antes. O fluxo traduz para ConflitoDeVersaoError. */
export class CustosMudouError extends Error {
  constructor(detalhe: string) {
    super(detalhe);
    this.name = "CustosMudouError";
  }
}
