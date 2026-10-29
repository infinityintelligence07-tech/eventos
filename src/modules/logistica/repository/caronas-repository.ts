import { and, asc, eq, inArray, isNull, sql } from "drizzle-orm";

import type { Executor } from "@/core/db/database";
import { registrarAcao } from "@/core/db/registro-acao";
import { pessoa } from "@/core/db/schema/core";
import { carona, convocacao, escala, funcao, pessoaVeiculo } from "@/core/db/schema/eventos";

import type { RepositorioCaronas } from "../service/caronas";
import { CONVOCACAO_ATIVA, nomeDaPessoa, travarLinha } from "./comum";

export type CaronaDoEvento = {
  id: string;
  motoristaPessoaId: string;
  motoristaNome: string;
  motoristaDistanciaKm: number | null;
  lugares: number | null;
  passageiros: { convocacaoId: string; pessoaId: string; nome: string; distanciaKm: number | null }[];
};

export type PessoaDaCarona = {
  convocacaoId: string;
  pessoaId: string;
  nome: string;
  funcao: string | null;
  deslocamento: string | null;
  distanciaKm: number | null;
  caronaId: string | null;
  lugaresDoVeiculo: number | null;
};

const distancia = sql<string | null>`${convocacao.distanciaKm}`;
const paraNumero = (valor: string | null) => (valor === null ? null : Number(valor));

export function criarRepositorioCaronas(executor: Executor): RepositorioCaronas & {
  caronasDoEvento(eventoId: string): Promise<CaronaDoEvento[]>;
  equipeDoEvento(eventoId: string): Promise<PessoaDaCarona[]>;
} {
  async function equipe(eventoId: string): Promise<PessoaDaCarona[]> {
    const linhas = await executor
      .select({
        convocacaoId: convocacao.id,
        pessoaId: convocacao.pessoaId,
        nome: nomeDaPessoa,
        funcao: funcao.nome,
        deslocamento: convocacao.deslocamento,
        distanciaKm: distancia,
        caronaId: convocacao.caronaId,
        lugaresDoVeiculo: pessoaVeiculo.lugares,
      })
      .from(convocacao)
      .innerJoin(escala, eq(escala.id, convocacao.escalaId))
      .innerJoin(pessoa, eq(pessoa.id, convocacao.pessoaId))
      .leftJoin(funcao, eq(funcao.id, escala.funcaoId))
      .leftJoin(pessoaVeiculo, eq(pessoaVeiculo.pessoaId, convocacao.pessoaId))
      .where(and(eq(escala.eventoId, eventoId), isNull(escala.deletedAt), inArray(convocacao.status, CONVOCACAO_ATIVA)))
      .orderBy(asc(nomeDaPessoa));
    return linhas.map((linha) => ({ ...linha, distanciaKm: paraNumero(linha.distanciaKm) }));
  }

  return {
    equipeDoEvento: equipe,

    async caronasDoEvento(eventoId) {
      const caronas = await executor
        .select({ id: carona.id, motoristaPessoaId: carona.motoristaPessoaId, motoristaNome: nomeDaPessoa, lugares: pessoaVeiculo.lugares })
        .from(carona)
        .innerJoin(pessoa, eq(pessoa.id, carona.motoristaPessoaId))
        .leftJoin(pessoaVeiculo, eq(pessoaVeiculo.pessoaId, carona.motoristaPessoaId))
        .where(eq(carona.eventoId, eventoId))
        .orderBy(asc(nomeDaPessoa));
      const pessoas = await equipe(eventoId);
      return caronas.map((item) => ({
        ...item,
        motoristaDistanciaKm: pessoas.find((pessoaDaEquipe) => pessoaDaEquipe.pessoaId === item.motoristaPessoaId)?.distanciaKm ?? null,
        passageiros: pessoas
          .filter((pessoaDaEquipe) => pessoaDaEquipe.caronaId === item.id)
          .map(({ convocacaoId, pessoaId, nome, distanciaKm }) => ({ convocacaoId, pessoaId, nome, distanciaKm })),
      }));
    },

    async travarConvocacao(convocacaoId) {
      if (!(await travarLinha(executor, convocacao, convocacaoId))) return null;
      const [linha] = await executor
        .select({
          convocacaoId: convocacao.id,
          pessoaId: convocacao.pessoaId,
          nome: nomeDaPessoa,
          eventoId: escala.eventoId,
          status: convocacao.status,
          escalaApagada: escala.deletedAt,
          caronaId: convocacao.caronaId,
        })
        .from(convocacao)
        .innerJoin(escala, eq(escala.id, convocacao.escalaId))
        .innerJoin(pessoa, eq(pessoa.id, convocacao.pessoaId))
        .where(eq(convocacao.id, convocacaoId));
      if (!linha) return null;
      const { status, escalaApagada, ...resto } = linha;
      return { ...resto, ativa: escalaApagada === null && CONVOCACAO_ATIVA.includes(status) };
    },

    async lugaresDoVeiculo(pessoaId) {
      const [linha] = await executor.select({ lugares: pessoaVeiculo.lugares }).from(pessoaVeiculo).where(eq(pessoaVeiculo.pessoaId, pessoaId));
      return linha?.lugares ?? null;
    },

    async caronaDoMotorista(eventoId, pessoaId) {
      const [linha] = await executor.select({ id: carona.id }).from(carona).where(and(eq(carona.eventoId, eventoId), eq(carona.motoristaPessoaId, pessoaId)));
      return linha?.id ?? null;
    },

    async inserirCarona(eventoId, motoristaPessoaId, instante) {
      const [linha] = await executor.insert(carona).values({ eventoId, motoristaPessoaId, criadoEm: instante, atualizadoEm: instante }).returning({ id: carona.id });
      return linha!.id;
    },

    async travarCarona(caronaId) {
      if (!(await travarLinha(executor, carona, caronaId))) return null;
      const [linha] = await executor
        .select({ id: carona.id, eventoId: carona.eventoId, motoristaPessoaId: carona.motoristaPessoaId, motoristaNome: nomeDaPessoa, lugares: pessoaVeiculo.lugares })
        .from(carona)
        .innerJoin(pessoa, eq(pessoa.id, carona.motoristaPessoaId))
        .leftJoin(pessoaVeiculo, eq(pessoaVeiculo.pessoaId, carona.motoristaPessoaId))
        .where(eq(carona.id, caronaId));
      if (!linha) return null;
      const passageiros = await executor.select({ id: convocacao.id }).from(convocacao).where(eq(convocacao.caronaId, caronaId));
      return { ...linha, passageiros: passageiros.map((passageiro) => passageiro.id) };
    },

    async removerCarona(caronaId) {
      await executor.delete(carona).where(eq(carona.id, caronaId));
    },

    // convocacao.atualizado_em é a versão da escala (módulo escala): mudar a carona não mexe nela.
    async definirCarona(convocacaoId, de, para) {
      const alteradas = await executor
        .update(convocacao)
        .set({ caronaId: para })
        .where(and(eq(convocacao.id, convocacaoId), de === null ? isNull(convocacao.caronaId) : eq(convocacao.caronaId, de)))
        .returning({ id: convocacao.id });
      return alteradas.length === 1;
    },

    async registrar({ caronaId, convocacaoId, eventoId, acao, dados, usuarioId }) {
      await registrarAcao(executor, { entidade: "CARONA", entidadeId: caronaId, eventoId, acao, usuarioId, dados: { ...dados, convocacaoId } });
    },
  };
}
