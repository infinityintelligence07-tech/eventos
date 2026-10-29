import { and, eq, inArray } from "drizzle-orm";

import type { Executor } from "@/core/db/database";
import { pessoa } from "@/core/db/schema/core";
import { funcao, pessoaEvento, pessoaFuncao, pessoaVeiculo } from "@/core/db/schema/eventos";

import type { RepositorioPerfil } from "../service/perfil";
import { nomeDaPessoa } from "./sql";

// Dono de pessoa_evento, pessoa_funcao e pessoa_veiculo (docs/07 §2.3). core.pessoa é só leitura.

/** Recebe o executor da transação do fluxo. */
export function criarRepositorioPerfil(executor: Executor): RepositorioPerfil {
  return {
    async travarStaff(pessoaId) {
      const [travada] = await executor.select({ pessoaId: pessoaEvento.pessoaId }).from(pessoaEvento).where(eq(pessoaEvento.pessoaId, pessoaId)).for("update");
      if (!travada) return null;
      const [linha] = await executor.select({ nome: nomeDaPessoa }).from(pessoa).where(eq(pessoa.id, pessoaId));
      return linha ?? null;
    },

    async funcoesAtivas(funcaoIds) {
      if (funcaoIds.length === 0) return [];
      const linhas = await executor
        .select({ id: funcao.id })
        .from(funcao)
        .where(and(inArray(funcao.id, funcaoIds), eq(funcao.ativo, true)));
      return linhas.map((linha) => linha.id);
    },

    async salvarPerfil({ pessoaId, instante, ...perfil }) {
      await executor
        .update(pessoaEvento)
        .set({ ...perfil, atualizadoEm: instante })
        .where(eq(pessoaEvento.pessoaId, pessoaId));
    },

    async substituirFuncoes(pessoaId, funcoes) {
      await executor.delete(pessoaFuncao).where(eq(pessoaFuncao.pessoaId, pessoaId));
      if (funcoes.length > 0) {
        await executor.insert(pessoaFuncao).values(funcoes.map(({ funcaoId, nivel }) => ({ pessoaId, funcaoId, nivel })));
      }
    },

    async salvarVeiculo({ pessoaId, lugares, consumoKmL, instante }) {
      const consumo = consumoKmL === null ? null : consumoKmL.toFixed(1);
      await executor
        .insert(pessoaVeiculo)
        .values({ pessoaId, lugares, consumoKmL: consumo, atualizadoEm: instante })
        .onConflictDoUpdate({ target: pessoaVeiculo.pessoaId, set: { lugares, consumoKmL: consumo, atualizadoEm: instante } });
    },

    async removerVeiculo(pessoaId) {
      await executor.delete(pessoaVeiculo).where(eq(pessoaVeiculo.pessoaId, pessoaId));
    },

    async salvarCoordenadas({ pessoaId, lat, lng, instante }) {
      // Digitadas à mão até existir geocodificação (docs/07 R7): geocodificado_em fica nulo.
      await executor.update(pessoaEvento).set({ lat, lng, atualizadoEm: instante }).where(eq(pessoaEvento.pessoaId, pessoaId));
    },
  };
}
