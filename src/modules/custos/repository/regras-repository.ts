import { and, asc, eq, isNull, type SQL } from "drizzle-orm";

import type { Executor } from "@/core/db/database";
import { registrarAcao } from "@/core/db/registro-acao";
import { regraCusto, tipoEvento } from "@/core/db/schema/eventos";

import type { RegraDeCusto } from "../domain/regras";
import type { RepositorioRegras } from "../service/regras";
import { lerRegra } from "./solicitacoes-repository";

export type RegraComTipo = RegraDeCusto & { tipoEventoNome: string | null; tipoEventoSigla: string | null };

const igualOuNulo = (coluna: typeof regraCusto.tipoEventoId | typeof regraCusto.uf, valor: string | null): SQL => (valor === null ? isNull(coluna) : eq(coluna, valor));

export function criarRepositorioRegras(executor: Executor): RepositorioRegras & {
  todas(): Promise<RegraComTipo[]>;
  tiposDeEvento(): Promise<{ id: string; sigla: string; nome: string }[]>;
} {
  return {
    async todas() {
      const linhas = await executor
        .select({ regra: regraCusto, tipoEventoNome: tipoEvento.nome, tipoEventoSigla: tipoEvento.sigla })
        .from(regraCusto)
        .leftJoin(tipoEvento, eq(tipoEvento.id, regraCusto.tipoEventoId))
        .orderBy(asc(regraCusto.categoria), asc(regraCusto.nome), asc(tipoEvento.nome), asc(regraCusto.uf), asc(regraCusto.vigenteDesde));
      return linhas.map((linha) => ({ ...lerRegra(linha.regra), tipoEventoNome: linha.tipoEventoNome, tipoEventoSigla: linha.tipoEventoSigla }));
    },

    tiposDeEvento() {
      return executor.select({ id: tipoEvento.id, sigla: tipoEvento.sigla, nome: tipoEvento.nome }).from(tipoEvento).orderBy(asc(tipoEvento.nome));
    },

    async regra(regraId) {
      const [linha] = await executor.select().from(regraCusto).where(eq(regraCusto.id, regraId));
      return linha ? lerRegra(linha) : null;
    },

    async vigenciaNaMesmaData(regra, vigenteDesde) {
      const [linha] = await executor
        .select({ id: regraCusto.id })
        .from(regraCusto)
        .where(
          and(
            eq(regraCusto.categoria, regra.categoria),
            eq(regraCusto.codigo, regra.codigo),
            igualOuNulo(regraCusto.tipoEventoId, regra.tipoEventoId),
            igualOuNulo(regraCusto.uf, regra.uf),
            eq(regraCusto.vigenteDesde, vigenteDesde),
          ),
        );
      return Boolean(linha);
    },

    async inserirVigencia(regra, instante) {
      const [linha] = await executor
        .insert(regraCusto)
        .values({ ...regra, criadoEm: instante, atualizadoEm: instante })
        .returning({ id: regraCusto.id });
      return linha!.id;
    },

    async desativar(regraId, instante) {
      const alteradas = await executor.update(regraCusto).set({ ativo: false, atualizadoEm: instante }).where(eq(regraCusto.id, regraId)).returning({ id: regraCusto.id });
      return alteradas.length === 1;
    },

    async registrar({ regraId, acao, usuarioId, dados }) {
      await registrarAcao(executor, { entidade: "REGRA_CUSTO", entidadeId: regraId, acao, usuarioId, dados });
    },
  };
}
