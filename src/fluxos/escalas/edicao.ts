import type { Executor } from "@/core/db/database";
import type { AtorDaEscrita } from "@/fluxos/_base";
import { transferirSolicitacaoDaConvocacao } from "@/modules/custos";
import * as escala from "@/modules/escala";
import { transferirLogisticaDaConvocacao } from "@/modules/logistica";

import { escrever } from "./comum";

// Montar escala: cada ação numa transação, com o evento travado (docs/07 §6.2).

type Quem = { ator: AtorDaEscrita; agora: Date };

const montagem = escala.criarRepositorioMontagem;

/** A pessoa saiu de uma função e ficou em outra do evento: quarto, pedidos à SDC e solicitação de custo seguem a pessoa. */
const levarVinculos =
  (tx: Executor): escala.AoTrocarPrincipal =>
  async (troca) => {
    await transferirLogisticaDaConvocacao(tx, troca);
    await transferirSolicitacaoDaConvocacao(tx, troca);
  };

export function confirmarVagas(entrada: { eventoId: string; linhas: { escalaId: string; quantidade: number }[] }, { ator, agora }: Quem) {
  return escrever(ator, (tx) => escala.confirmarVagas(montagem(tx), { ...entrada, usuarioId: ator.usuarioId, instante: agora }));
}

export function alterarVagas(entrada: { eventoId: string; escalaId: string; quantidade: number }, { ator, agora }: Quem) {
  return escrever(ator, (tx) => escala.alterarVagas(montagem(tx), { ...entrada, usuarioId: ator.usuarioId, instante: agora }));
}

export function definirVagaDigitada(entrada: { eventoId: string; funcao: string; quantidade: number }, { ator, agora }: Quem) {
  return escrever(ator, (tx) => escala.definirVagaDigitada(montagem(tx), { ...entrada, usuarioId: ator.usuarioId, instante: agora }));
}

export function adicionarVagaManual(entrada: { eventoId: string; funcaoId: string; data: string; quantidade: number }, { ator, agora }: Quem) {
  return escrever(ator, (tx) => escala.adicionarVagaManual(montagem(tx), { ...entrada, usuarioId: ator.usuarioId, instante: agora }));
}

export function removerVagaManual(entrada: { eventoId: string; escalaId: string }, { ator, agora }: Quem) {
  return escrever(ator, (tx) => escala.removerVagaManual(montagem(tx), { ...entrada, usuarioId: ator.usuarioId, instante: agora }));
}

export function porNaVaga(entrada: { eventoId: string; escalaId: string; pessoaId: string; sugestaoScore?: number }, { ator, agora }: Quem) {
  return escrever(ator, (tx) =>
    escala.porNaVaga(montagem(tx), { ...entrada, sugestaoScore: entrada.sugestaoScore ?? null, usuarioId: ator.usuarioId, instante: agora }),
  );
}

export function tirarDaVaga(entrada: { eventoId: string; convocacaoId: string }, { ator, agora }: Quem) {
  return escrever(ator, (tx) => escala.tirarDaVaga(montagem(tx), { ...entrada, usuarioId: ator.usuarioId, instante: agora, aoTrocarPrincipal: levarVinculos(tx) }));
}

export function atualizarConvocacao(entrada: { eventoId: string; convocacaoId: string; mudanca: escala.MudancaDaConvocacao }, { ator, agora }: Quem) {
  return escrever(ator, (tx) => escala.atualizarConvocacao(montagem(tx), { ...entrada, usuarioId: ator.usuarioId, instante: agora }));
}

export function registrarRespostaDoStaff(
  entrada: { eventoId: string; convocacaoId: string; resposta: "ACEITA" | "RECUSADA"; motivoRecusa?: string },
  { ator, agora }: Quem,
) {
  return escrever(ator, (tx) =>
    escala.registrarRespostaDoStaff(montagem(tx), {
      ...entrada,
      motivoRecusa: entrada.motivoRecusa ?? null,
      usuarioId: ator.usuarioId,
      instante: agora,
      aoTrocarPrincipal: levarVinculos(tx),
    }),
  );
}

export function enviarParaAprovacao(entrada: { eventoId: string; statusEsperado: "RASCUNHO" | "DEVOLVIDA" }, { ator, agora }: Quem) {
  return escrever(ator, (tx) => escala.enviarParaAprovacao(montagem(tx), { ...entrada, usuarioId: ator.usuarioId, instante: agora }));
}

export function aprovarEscala(entrada: { eventoId: string }, { ator, agora }: Quem) {
  return escrever(ator, (tx) => escala.aprovarEscala(montagem(tx), { ...entrada, usuarioId: ator.usuarioId, instante: agora }));
}

export function devolverEscala(entrada: { eventoId: string; comentario?: string }, { ator, agora }: Quem) {
  return escrever(ator, (tx) => escala.devolverEscala(montagem(tx), { ...entrada, comentario: entrada.comentario ?? null, usuarioId: ator.usuarioId, instante: agora }));
}

export function reabrirEscala(entrada: { eventoId: string; statusEsperado: "APROVADA" | "COMUNICADA"; motivo?: string }, { ator, agora }: Quem) {
  return escrever(ator, (tx) => escala.reabrirEscala(montagem(tx), { ...entrada, motivo: entrada.motivo ?? null, usuarioId: ator.usuarioId, instante: agora }));
}
