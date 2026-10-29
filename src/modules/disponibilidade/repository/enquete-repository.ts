import { and, eq, gt, inArray, isNull } from "drizzle-orm";

import type { Executor } from "@/core/db/database";
import { registrarAcao } from "@/core/db/registro-acao";
import { pessoa } from "@/core/db/schema/core";
import { disponibilidade, enquete, enqueteEvento, evento, pessoaEvento } from "@/core/db/schema/eventos";

import type { RepositorioEnquete } from "../service/enquete";
import { nomeDaPessoa } from "./sql";

/** Recebe o executor da transação do fluxo: enquete, respostas e registro_acao gravam juntos ou nada. */
export function criarRepositorioEnquete(executor: Executor): RepositorioEnquete {
  return {
    async eventosExistentes(eventoIds) {
      if (eventoIds.length === 0) return [];
      const linhas = await executor
        .select({ id: evento.id })
        .from(evento)
        .where(and(inArray(evento.id, eventoIds), isNull(evento.deletedAt)));
      return linhas.map((linha) => linha.id);
    },

    async criarEnquete({ titulo, fechaEm, eventoIds, criadoPor }) {
      const [criada] = await executor.insert(enquete).values({ titulo, fechaEm, criadoPor }).returning({ id: enquete.id });
      const enqueteId = criada!.id;
      await executor.insert(enqueteEvento).values(eventoIds.map((eventoId) => ({ enqueteId, eventoId })));
      return enqueteId;
    },

    async travarEnquete(enqueteId) {
      const [travada] = await executor.select({ fechaEm: enquete.fechaEm }).from(enquete).where(eq(enquete.id, enqueteId)).for("update");
      if (!travada) return null;
      const eventos = await executor.select({ eventoId: enqueteEvento.eventoId }).from(enqueteEvento).where(eq(enqueteEvento.enqueteId, enqueteId));
      return { fechaEm: travada.fechaEm, eventoIds: eventos.map((linha) => linha.eventoId) };
    },

    async alterarEnquete(enqueteId, { titulo, fechaEm }) {
      await executor
        .update(enquete)
        .set({ ...(titulo !== undefined ? { titulo } : {}), ...(fechaEm !== undefined ? { fechaEm } : {}) })
        .where(eq(enquete.id, enqueteId));
    },

    async encerrarEnquete(enqueteId, agora) {
      const alteradas = await executor
        .update(enquete)
        .set({ fechaEm: agora })
        .where(and(eq(enquete.id, enqueteId), gt(enquete.fechaEm, agora)))
        .returning({ id: enquete.id });
      return alteradas.length === 1;
    },

    async staffAtivo(pessoaId) {
      const [linha] = await executor
        .select({ nome: nomeDaPessoa })
        .from(pessoa)
        .innerJoin(pessoaEvento, eq(pessoaEvento.pessoaId, pessoa.id))
        .where(and(eq(pessoa.id, pessoaId), eq(pessoa.ativo, true), isNull(pessoa.deletedAt)));
      return linha ?? null;
    },

    async respostasDaPessoa(pessoaId, eventoIds) {
      if (eventoIds.length === 0) return new Map();
      const linhas = await executor
        .select({ eventoId: disponibilidade.eventoId, disponivel: disponibilidade.disponivel, enqueteId: disponibilidade.enqueteId })
        .from(disponibilidade)
        .where(and(eq(disponibilidade.pessoaId, pessoaId), inArray(disponibilidade.eventoId, eventoIds)))
        .for("update");
      return new Map(linhas.map((linha) => [linha.eventoId, { disponivel: linha.disponivel, enqueteId: linha.enqueteId }]));
    },

    async gravarResposta({ enqueteId, eventoId, pessoaId, disponivel, instante, registradoPor }) {
      await executor
        .insert(disponibilidade)
        .values({ enqueteId, eventoId, pessoaId, disponivel, respondidoEm: instante, registradoPor })
        .onConflictDoUpdate({
          target: [disponibilidade.eventoId, disponibilidade.pessoaId],
          set: { enqueteId, disponivel, respondidoEm: instante, registradoPor },
        });
    },

    async apagarResposta(eventoId, pessoaId) {
      await executor.delete(disponibilidade).where(and(eq(disponibilidade.eventoId, eventoId), eq(disponibilidade.pessoaId, pessoaId)));
    },

    async registrarMudanca({ enqueteId, pessoaId, usuarioId, mudanca, para, foraDoPrazo }) {
      await registrarAcao(executor, {
        entidade: "DISPONIBILIDADE",
        entidadeId: enqueteId,
        eventoId: mudanca.eventoId,
        acao: mudanca.tipo === "GRAVAR" ? "RESPOSTA_REGISTRADA" : "RESPOSTA_REMOVIDA",
        statusDe: mudanca.de,
        statusPara: para,
        emNomeDePessoaId: pessoaId,
        usuarioId,
        dados: { foraDoPrazo },
      });
    },

    async registrarSemMudanca({ enqueteId, pessoaId, usuarioId }) {
      await registrarAcao(executor, {
        entidade: "DISPONIBILIDADE",
        entidadeId: enqueteId,
        acao: "RESPOSTAS_SEM_MUDANCA",
        emNomeDePessoaId: pessoaId,
        usuarioId,
      });
    },

    async registrarEnquete({ enqueteId, acao, usuarioId, dados }) {
      await registrarAcao(executor, { entidade: "ENQUETE", entidadeId: enqueteId, acao, usuarioId, dados });
    },
  };
}
