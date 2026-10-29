import * as escala from "@/modules/escala";

import { escrever } from "./comum";

// Montar escala: cada ação numa transação, com o evento travado (docs/07 §6.2).

type Quem = { usuarioId: string; agora: Date };

const montagem = escala.criarRepositorioMontagem;

export function confirmarVagas(entrada: { eventoId: string; linhas: { escalaId: string; quantidade: number }[] }, { usuarioId, agora }: Quem) {
  return escrever((tx) => escala.confirmarVagas(montagem(tx), { ...entrada, usuarioId, instante: agora }));
}

export function alterarVagas(entrada: { eventoId: string; escalaId: string; quantidade: number }, { agora }: Quem) {
  return escrever((tx) => escala.alterarVagas(montagem(tx), { ...entrada, instante: agora }));
}

export function definirVagaDigitada(entrada: { eventoId: string; funcao: string; quantidade: number }, { usuarioId, agora }: Quem) {
  return escrever((tx) => escala.definirVagaDigitada(montagem(tx), { ...entrada, usuarioId, instante: agora }));
}

export function adicionarVagaManual(entrada: { eventoId: string; funcaoId: string; data: string; quantidade: number }, { usuarioId, agora }: Quem) {
  return escrever((tx) => escala.adicionarVagaManual(montagem(tx), { ...entrada, usuarioId, instante: agora }));
}

export function removerVagaManual(entrada: { eventoId: string; escalaId: string }, { agora }: Quem) {
  return escrever((tx) => escala.removerVagaManual(montagem(tx), { ...entrada, instante: agora }));
}

export function porNaVaga(entrada: { eventoId: string; escalaId: string; pessoaId: string; sugestaoScore?: number }, { usuarioId, agora }: Quem) {
  return escrever((tx) =>
    escala.porNaVaga(montagem(tx), { ...entrada, sugestaoScore: entrada.sugestaoScore ?? null, usuarioId, instante: agora }),
  );
}

export function tirarDaVaga(entrada: { eventoId: string; convocacaoId: string }, { usuarioId, agora }: Quem) {
  return escrever((tx) => escala.tirarDaVaga(montagem(tx), { ...entrada, usuarioId, instante: agora }));
}

export function atualizarConvocacao(entrada: { eventoId: string; convocacaoId: string; deslocamento?: escala.Deslocamento }, { agora }: Quem) {
  return escrever((tx) =>
    escala.definirDeslocamento(montagem(tx), { ...entrada, deslocamento: entrada.deslocamento ?? null, instante: agora }),
  );
}

export function registrarRespostaDoStaff(
  entrada: { eventoId: string; convocacaoId: string; resposta: "ACEITA" | "RECUSADA"; motivoRecusa?: string },
  { usuarioId, agora }: Quem,
) {
  return escrever((tx) =>
    escala.registrarRespostaDoStaff(montagem(tx), { ...entrada, motivoRecusa: entrada.motivoRecusa ?? null, usuarioId, instante: agora }),
  );
}

export function enviarParaAprovacao(entrada: { eventoId: string; statusEsperado: "RASCUNHO" | "DEVOLVIDA" }, { usuarioId, agora }: Quem) {
  return escrever((tx) => escala.enviarParaAprovacao(montagem(tx), { ...entrada, usuarioId, instante: agora }));
}

export function aprovarEscala(entrada: { eventoId: string }, { usuarioId, agora }: Quem) {
  return escrever((tx) => escala.aprovarEscala(montagem(tx), { ...entrada, usuarioId, instante: agora }));
}

export function devolverEscala(entrada: { eventoId: string; comentario?: string }, { usuarioId, agora }: Quem) {
  return escrever((tx) => escala.devolverEscala(montagem(tx), { ...entrada, comentario: entrada.comentario ?? null, usuarioId, instante: agora }));
}

export function reabrirEscala(entrada: { eventoId: string; statusEsperado: "APROVADA" | "COMUNICADA"; motivo?: string }, { usuarioId, agora }: Quem) {
  return escrever((tx) => escala.reabrirEscala(montagem(tx), { ...entrada, motivo: entrada.motivo ?? null, usuarioId, instante: agora }));
}
