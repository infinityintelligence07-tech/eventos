import { and, eq, inArray, isNull } from "drizzle-orm";

import type { Executor } from "@/core/db/database";
import { registrarAcao } from "@/core/db/registro-acao";
import { pessoa, polo } from "@/core/db/schema/core";
import { funcao, pessoaEvento, pessoaFuncao, pessoaVeiculo } from "@/core/db/schema/eventos";

import type { RepositorioMeuCadastro } from "../service/meu-cadastro";
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

    async perfilAtual(pessoaId) {
      const [linha] = await executor
        .select({
          sexo: pessoaEvento.sexo,
          camisetaModelo: pessoaEvento.camisetaModelo,
          camisetaTamanho: pessoaEvento.camisetaTamanho,
          possuiCamiseta: pessoaEvento.possuiCamiseta,
          fezConfronto: pessoaEvento.fezConfronto,
          temCnpj: pessoaEvento.temCnpj,
        })
        .from(pessoaEvento)
        .where(eq(pessoaEvento.pessoaId, pessoaId));
      return linha ?? null;
    },

    async funcoesDaPessoa(pessoaId) {
      return executor
        .select({ codigo: funcao.codigo, nivel: pessoaFuncao.nivel })
        .from(pessoaFuncao)
        .innerJoin(funcao, eq(funcao.id, pessoaFuncao.funcaoId))
        .where(eq(pessoaFuncao.pessoaId, pessoaId))
        .orderBy(funcao.codigo);
    },

    async veiculoAtual(pessoaId) {
      const [linha] = await executor
        .select({ lugares: pessoaVeiculo.lugares, consumoKmL: pessoaVeiculo.consumoKmL })
        .from(pessoaVeiculo)
        .where(eq(pessoaVeiculo.pessoaId, pessoaId));
      return linha ? { lugares: linha.lugares, consumoKmL: linha.consumoKmL === null ? null : Number(linha.consumoKmL) } : null;
    },

    async registrar({ pessoaId, acao, usuarioId, dados }) {
      await registrarAcao(executor, { entidade: "PESSOA", entidadeId: pessoaId, acao, usuarioId, dados });
    },
  };
}

/** "Meu cadastro" (docs/10): a ficha mais polo, local resumido e a marca de revisado. */
export function criarRepositorioMeuCadastro(executor: Executor): RepositorioMeuCadastro {
  return {
    ...criarRepositorioPerfil(executor),

    async poloPorCodigo(codigo) {
      const [linha] = await executor
        .select({ id: polo.id })
        .from(polo)
        .where(and(eq(polo.codigo, codigo), eq(polo.ativo, true), isNull(polo.deletedAt)));
      return linha?.id ?? null;
    },

    async funcoesComId(pessoaId) {
      const linhas = await executor.select({ funcaoId: pessoaFuncao.funcaoId, nivel: pessoaFuncao.nivel }).from(pessoaFuncao).where(eq(pessoaFuncao.pessoaId, pessoaId));
      return linhas.map((linha) => ({ funcaoId: linha.funcaoId, nivel: linha.nivel === "TRAINEE" ? "TRAINEE" : "HABILITADO" }));
    },

    async localAtual(pessoaId) {
      const [linha] = await executor
        .select({ poloId: pessoaEvento.poloId, cep: pessoaEvento.cep, cidade: pessoaEvento.cidade, uf: pessoaEvento.uf })
        .from(pessoaEvento)
        .where(eq(pessoaEvento.pessoaId, pessoaId));
      return linha ?? null;
    },

    async salvarLocal({ pessoaId, poloId, cep, cidade, uf, coordenadas, instante }) {
      await executor
        .update(pessoaEvento)
        .set({
          poloId,
          cep,
          cidade,
          uf,
          ...(coordenadas && { lat: coordenadas.lat, lng: coordenadas.lng, geocodificadoEm: instante }),
          atualizadoEm: instante,
        })
        .where(eq(pessoaEvento.pessoaId, pessoaId));
    },

    async marcarRevisado(pessoaId, instante) {
      await executor.update(pessoaEvento).set({ cadastroRevisadoEm: instante, atualizadoEm: instante }).where(eq(pessoaEvento.pessoaId, pessoaId));
    },
  };
}
