// Erros de regra da montagem e da aprovação. `mensagem` já é o texto da tela; o fluxo traduz para
// RegraDeNegocioError (src/fluxos/_base). EscalaMudouError (convite.ts) é o conflito de versão.

export class ErroDaEscala extends Error {
  constructor(readonly mensagem: string) {
    super(mensagem);
    this.name = new.target.name;
  }
}

export class EscalaTravadaError extends ErroDaEscala {}
export class TransicaoInvalidaError extends ErroDaEscala {}
export class VagasEsgotadasError extends ErroDaEscala {}
export class ConflitoDeAgendaError extends ErroDaEscala {}
export class EnvioBloqueadoError extends ErroDaEscala {
  constructor(readonly motivos: string[]) {
    super(motivos.join(" "));
  }
}
export class NaoEncontradoError extends ErroDaEscala {}
