import { and, eq, inArray, isNull, sql } from "drizzle-orm";

import type { Db } from "@/core/db/database";
import { convocacao, escala, evento, funcao, tipoEvento } from "@/core/db/schema/eventos";

import type { RepositorioVagas, TransacaoVagas } from "../service/gerar-vagas";

/** Horário das vagas geradas pela regra até o time ajustar a escala. */
export const HORARIO_PADRAO = { inicio: "08:00", fim: "18:00" } as const;

export function criarRepositorioVagas(db: Db): RepositorioVagas {
  return {
    comEventoTravado(eventoId, trabalho) {
      return db.transaction(async (tx) => {
        // Trava o evento antes de ler (o Postgres não aceita FOR UPDATE OF com schema no nome).
        const [travado] = await tx
          .select({ id: evento.id })
          .from(evento)
          .where(and(eq(evento.id, eventoId), isNull(evento.deletedAt)))
          .for("update");
        if (!travado) return trabalho(null);

        const [linhaEvento] = await tx
          .select({
            id: evento.id,
            status: evento.status,
            statusEscala: evento.statusEscala,
            expectativaPublico: evento.expectativaPublico,
            pessoasNaFila: evento.pessoasNaFila,
            // Primeiro dia do evento no horário de Brasília.
            dataInicio: sql<string>`to_char(${evento.inicio} AT TIME ZONE 'America/Sao_Paulo', 'YYYY-MM-DD')`,
            regraVagas: tipoEvento.regraVagas,
          })
          .from(evento)
          .leftJoin(tipoEvento, eq(tipoEvento.id, evento.tipoEventoId))
          .where(eq(evento.id, eventoId));

        if (!linhaEvento) return trabalho(null);

        const linhas = await tx
          .select({
            id: escala.id,
            funcao: funcao.codigo,
            quantidade: escala.quantidadeVagas,
            convocacoes: sql<number>`(select count(*)::int from ${convocacao} where ${convocacao.escalaId} = ${escala.id})`,
          })
          .from(escala)
          .innerJoin(funcao, eq(funcao.id, escala.funcaoId))
          .where(and(eq(escala.eventoId, eventoId), eq(escala.origem, "REGRA"), isNull(escala.deletedAt)))
          .orderBy(escala.criadoEm, escala.id);

        const transacao: TransacaoVagas = {
          evento: { ...linhaEvento, regraVagas: linhaEvento.regraVagas ?? {} },
          linhasDaRegra: linhas,
          async aplicar(plano) {
            const codigos = plano.inserir.map((item) => item.funcao);
            const funcoes = codigos.length
              ? await tx
                  .select({ id: funcao.id, codigo: funcao.codigo })
                  .from(funcao)
                  .where(and(inArray(funcao.codigo, codigos), eq(funcao.ativo, true)))
              : [];
            const idPorCodigo = new Map(funcoes.map((item) => [item.codigo, item.id]));
            const funcoesNaoCadastradas = codigos.filter((codigo) => !idPorCodigo.has(codigo));
            const agora = new Date();

            const novas = plano.inserir.flatMap((item) => {
              const funcaoId = idPorCodigo.get(item.funcao);
              return funcaoId
                ? [
                    {
                      eventoId,
                      funcaoId,
                      data: linhaEvento.dataInicio,
                      horaInicio: HORARIO_PADRAO.inicio,
                      horaFim: HORARIO_PADRAO.fim,
                      quantidadeVagas: item.quantidade,
                      status: "ABERTA",
                      origem: "REGRA",
                    },
                  ]
                : [];
            });
            if (novas.length) await tx.insert(escala).values(novas);

            for (const item of plano.atualizar) {
              await tx
                .update(escala)
                .set({ quantidadeVagas: item.quantidade, atualizadoEm: agora })
                .where(eq(escala.id, item.id));
            }
            if (plano.remover.length) {
              await tx
                .update(escala)
                .set({ deletedAt: agora, atualizadoEm: agora })
                .where(inArray(escala.id, plano.remover.map((item) => item.id)));
            }

            if (linhaEvento.statusEscala === "SEM_ESCALA" && novas.length) {
              await tx
                .update(evento)
                .set({ statusEscala: "RASCUNHO", atualizadoEm: agora })
                .where(eq(evento.id, eventoId));
            }
            return { funcoesNaoCadastradas };
          },
        };

        return trabalho(transacao);
      });
    },
  };
}
