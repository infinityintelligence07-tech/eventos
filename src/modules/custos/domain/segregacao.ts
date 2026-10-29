import { ErroDosCustos } from "./erros";

// Segregação de funções na auditoria de custos (docs/09 §4.4 e §13.1). Roda no serviço com a solicitação travada.
//   SoD-2: quem registrou ou corrigiu a solicitação não a aprova nem reprova.
//   SoD-3: ninguém aprova, reprova ou reabre o próprio custo. A pessoa do auditor é reconhecida pelo cadastro
//          (pessoaId ou usuario_id da pessoa) ou pelo e-mail; sem como conferir (auditor sem pessoa e pessoa sem
//          e-mail), recusa.

export type AcaoSegregada = "APROVAR" | "REPROVAR" | "REABRIR";

export type Auditor = { usuarioId: string; pessoaId: string | null; email: string | null };

export type AutoriaDaSolicitacao = {
  /** A pessoa (staff) da solicitação. */
  pessoaId: string;
  /** core.pessoa.usuario_id e core.pessoa.email da pessoa da solicitação. */
  usuarioDaPessoa: string | null;
  emailDaPessoa: string | null;
  /** solicitacao_custo.registrado_por (último registro ou correção feito pelo time). */
  registradoPor: string | null;
  /** Usuários com SOLICITACAO_REGISTRADA ou CORRECAO_REGISTRADA no registro_acao da solicitação. */
  autoresDoRegistro: string[];
};

export type ViolacaoDeSegregacao = "AUDITA_O_PROPRIO_CUSTO" | "AUDITA_O_QUE_REGISTROU" | "SEM_COMO_CONFERIR_A_PESSOA";

const normalizarEmail = (email: string | null): string | null => {
  const limpo = email?.trim().toLowerCase();
  return limpo ? limpo : null;
};

function sod3(auditor: Auditor, autoria: AutoriaDaSolicitacao): ViolacaoDeSegregacao | null {
  if (auditor.pessoaId !== null && auditor.pessoaId === autoria.pessoaId) return "AUDITA_O_PROPRIO_CUSTO";
  if (autoria.usuarioDaPessoa !== null && autoria.usuarioDaPessoa === auditor.usuarioId) return "AUDITA_O_PROPRIO_CUSTO";
  const emailDoAuditor = normalizarEmail(auditor.email);
  const emailDaPessoa = normalizarEmail(autoria.emailDaPessoa);
  if (emailDoAuditor !== null && emailDoAuditor === emailDaPessoa) return "AUDITA_O_PROPRIO_CUSTO";
  if (auditor.pessoaId === null && (emailDoAuditor === null || emailDaPessoa === null)) return "SEM_COMO_CONFERIR_A_PESSOA";
  return null;
}

function sod2Vale(acao: AcaoSegregada): boolean {
  switch (acao) {
    case "APROVAR":
    case "REPROVAR":
      return true;
    case "REABRIR":
      return false;
    default: {
      const desconhecida: never = acao;
      throw new Error(`ação de auditoria desconhecida: ${String(desconhecida)}`);
    }
  }
}

export function violacaoDeSegregacao(acao: AcaoSegregada, auditor: Auditor, autoria: AutoriaDaSolicitacao): ViolacaoDeSegregacao | null {
  const propria = sod3(auditor, autoria);
  if (propria) return propria;
  if (sod2Vale(acao) && (autoria.registradoPor === auditor.usuarioId || autoria.autoresDoRegistro.includes(auditor.usuarioId))) {
    return "AUDITA_O_QUE_REGISTROU";
  }
  return null;
}

export class SegregacaoDeFuncoesError extends ErroDosCustos {
  constructor(readonly violacao: ViolacaoDeSegregacao) {
    super(mensagemDaViolacao(violacao));
    this.name = "SegregacaoDeFuncoesError";
  }
}

function mensagemDaViolacao(violacao: ViolacaoDeSegregacao): string {
  switch (violacao) {
    case "AUDITA_O_PROPRIO_CUSTO":
      return "Você não pode auditar o próprio custo. Peça a outra pessoa do time.";
    case "AUDITA_O_QUE_REGISTROU":
      return "Quem registrou ou corrigiu esta solicitação não pode auditá-la. Peça a outra pessoa do time.";
    case "SEM_COMO_CONFERIR_A_PESSOA":
      return "Não dá para confirmar que este custo não é seu: seu usuário não está ligado a uma pessoa do cadastro e a pessoa da solicitação não tem e-mail. Peça a outra pessoa do time.";
    default: {
      const desconhecida: never = violacao;
      throw new Error(`violação desconhecida: ${String(desconhecida)}`);
    }
  }
}

export function exigirSegregacao(acao: AcaoSegregada, auditor: Auditor, autoria: AutoriaDaSolicitacao): void {
  const violacao = violacaoDeSegregacao(acao, auditor, autoria);
  if (violacao) throw new SegregacaoDeFuncoesError(violacao);
}
