import type { ReactNode } from "react";

import { sair } from "@/app/(time)/_servidor/sessao";
import { dataCurta } from "@/app/(time)/_componentes/ui/formatos";
import { type StatusAuditoria, type StatusFinanceiro, textoDoFinanceiro } from "@/modules/custos";

import { MolduraDeEntrada } from "../../login/_componentes/moldura";

export function Sair() {
  return (
    <form action={sair} className="cadastro-sair">
      <button type="submit">Sair</button>
    </form>
  );
}

/** Usuário logado que não é staff: a mesma explicação do "Meu cadastro". */
export function NaoEhStaff() {
  return (
    <MolduraDeEntrada>
      <h1>Solicitação de custo</h1>
      <p className="login-lead">
        Sua conta não está no cadastro de staff do Eventos. Quem tem função de evento no IAM Control aparece aqui em até 30 minutos. Se já
        faz parte do staff, fale com o time de eventos.
      </p>
      <Sair />
    </MolduraDeEntrada>
  );
}

/** "ASM_POA_234 · ASM Porto Alegre" (sem repetir quando o nome é o próprio código). */
export function nomeDoEvento(evento: { codigo: string | null; nome: string }): string {
  return evento.codigo && evento.codigo !== evento.nome ? `${evento.codigo} · ${evento.nome}` : evento.nome;
}

/** A situação nas palavras de quem enviou (o time vê "Para auditar"). */
export function situacaoParaOStaff(auditoria: StatusAuditoria, financeiro: StatusFinanceiro, pagoEm: string | null): string {
  switch (auditoria) {
    case "PENDENTE":
      return "Em conferência pelo time";
    case "APROVADO":
      return `Aprovada · ${textoDoFinanceiro(financeiro, pagoEm).toLowerCase()}`;
    case "REPROVADO":
      return "Reprovada";
    default: {
      const desconhecida: never = auditoria;
      throw new Error(`situação desconhecida: ${String(desconhecida)}`);
    }
  }
}

const CLASSE_DA_SITUACAO: Record<StatusAuditoria, string> = { PENDENTE: "custo-situacao", APROVADO: "custo-situacao custo-situacao-ok", REPROVADO: "custo-situacao custo-situacao-nao" };

export function Situacao({ auditoria, children }: { auditoria: StatusAuditoria; children: ReactNode }) {
  return <span className={CLASSE_DA_SITUACAO[auditoria]}>{children}</span>;
}

/** 15/12 a 17/12 (um dia só: 15/12). */
export function periodoDoEvento(evento: { dataInicio: string; dataFim: string }): string {
  return evento.dataInicio === evento.dataFim ? dataCurta(evento.dataInicio) : `${dataCurta(evento.dataInicio)} a ${dataCurta(evento.dataFim)}`;
}
