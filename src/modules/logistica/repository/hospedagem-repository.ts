import { and, asc, eq, inArray, isNull, sql } from "drizzle-orm";

import { pessoa } from "@/core/db/schema/core";
import type { Executor } from "@/core/db/database";
import { registrarAcao } from "@/core/db/registro-acao";
import { convocacao, escala, evento, funcao, hospedagem, local, pedidoSdc, pessoaEvento, quarto, quartoOcupante } from "@/core/db/schema/eventos";

import type { Sexo } from "../domain/rooming";
import type { SituacaoDoPedido } from "../domain/pedido";
import type { QuartoTravado, RepositorioHospedagem } from "../service/hospedagem";
import { CONVOCACAO_ATIVA, mesmaVersao, nomeDaPessoa, travarLinha } from "./comum";

export type LocalDeHospedagem = { id: string; nome: string; tipo: "HOTEL" | "APARTAMENTO"; cidade: string; uf: string };

export type OcupanteDoQuarto = { convocacaoId: string; pessoaId: string; nome: string; sexo: Sexo | null };

export type QuartoDaHospedagem = {
  id: string;
  nome: string;
  capacidade: number;
  sexo: Sexo | null;
  valorDiariaCentavos: number | null;
  ocupantes: OcupanteDoQuarto[];
};

export type HospedagemDoEvento = {
  id: string;
  local: { id: string; nome: string; tipo: "HOTEL" | "APARTAMENTO"; endereco: string | null; cidade: string; uf: string };
  pedido: { id: string; referencia: string; situacao: SituacaoDoPedido; valorCentavos: number | null; observacaoTime: string | null; atualizadoEm: string } | null;
  checkIn: string;
  checkOut: string;
  numeroReserva: string | null;
  observacao: string | null;
  atualizadoEm: string;
  quartos: QuartoDaHospedagem[];
};

export type PessoaDaEquipe = {
  convocacaoId: string;
  pessoaId: string;
  nome: string;
  sexo: Sexo | null;
  funcao: string | null;
  deslocamento: string | null;
  quartoId: string | null;
};

const ativaNaEscala = and(isNull(escala.deletedAt), inArray(convocacao.status, CONVOCACAO_ATIVA));

export function criarRepositorioHospedagem(executor: Executor): RepositorioHospedagem & {
  locaisDeHospedagem(): Promise<LocalDeHospedagem[]>;
  hospedagensDoEvento(eventoId: string): Promise<HospedagemDoEvento[]>;
  equipeDoEvento(eventoId: string): Promise<PessoaDaEquipe[]>;
} {
  async function quartosTravados(condicao: ReturnType<typeof eq>): Promise<QuartoTravado[]> {
    // Inner join: o FOR UPDATE trava o quarto e a hospedagem dele.
    const quartos = await executor
      .select({ id: quarto.id, nome: quarto.nome, capacidade: quarto.capacidade, sexo: quarto.sexo, hospedagemId: quarto.hospedagemId, eventoId: hospedagem.eventoId })
      .from(quarto)
      .innerJoin(hospedagem, eq(hospedagem.id, quarto.hospedagemId))
      .where(condicao)
      .orderBy(asc(quarto.id))
      .for("update");
    if (quartos.length === 0) return [];
    const ocupantes = await executor
      .select({ quartoId: quartoOcupante.quartoId, convocacaoId: quartoOcupante.convocacaoId, sexo: pessoaEvento.sexo })
      .from(quartoOcupante)
      .innerJoin(convocacao, eq(convocacao.id, quartoOcupante.convocacaoId))
      .leftJoin(pessoaEvento, eq(pessoaEvento.pessoaId, convocacao.pessoaId))
      .where(
        inArray(
          quartoOcupante.quartoId,
          quartos.map((item) => item.id),
        ),
      );
    return quartos.map((item) => ({
      ...item,
      // sexo tem CHECK no banco (F, M ou nulo).
      sexo: item.sexo as Sexo | null,
      ocupantes: ocupantes.filter((ocupante) => ocupante.quartoId === item.id).map((ocupante) => ({ convocacaoId: ocupante.convocacaoId, sexo: ocupante.sexo as Sexo | null })),
    }));
  }

  return {
    async locaisDeHospedagem() {
      const linhas = await executor
        .select({ id: local.id, nome: local.nome, tipo: local.tipo, cidade: local.cidade, uf: local.uf })
        .from(local)
        .where(and(isNull(local.deletedAt), inArray(local.tipo, ["HOTEL", "APARTAMENTO"])))
        .orderBy(asc(local.uf), asc(local.cidade), asc(local.nome));
      return linhas.map((linha) => ({ ...linha, tipo: linha.tipo as LocalDeHospedagem["tipo"] }));
    },

    async hospedagensDoEvento(eventoId) {
      const linhas = await executor
        .select({
          id: hospedagem.id,
          localId: local.id,
          localNome: local.nome,
          localTipo: local.tipo,
          endereco: sql<string | null>`nullif(concat_ws(', ', ${local.logradouro}, ${local.numero}, ${local.bairro}), '')`,
          cidade: local.cidade,
          uf: local.uf,
          pedidoId: pedidoSdc.id,
          referencia: pedidoSdc.referencia,
          situacao: pedidoSdc.situacao,
          valorCentavos: pedidoSdc.valorCentavos,
          observacaoTime: pedidoSdc.observacaoTime,
          pedidoAtualizadoEm: pedidoSdc.atualizadoEm,
          checkIn: hospedagem.checkIn,
          checkOut: hospedagem.checkOut,
          numeroReserva: hospedagem.numeroReserva,
          observacao: hospedagem.observacao,
          atualizadoEm: hospedagem.atualizadoEm,
        })
        .from(hospedagem)
        .innerJoin(local, eq(local.id, hospedagem.localId))
        .leftJoin(pedidoSdc, eq(pedidoSdc.id, hospedagem.pedidoId))
        .where(eq(hospedagem.eventoId, eventoId))
        .orderBy(asc(hospedagem.checkIn), asc(local.nome));
      if (linhas.length === 0) return [];

      const quartos = await executor
        .select({ id: quarto.id, hospedagemId: quarto.hospedagemId, nome: quarto.nome, capacidade: quarto.capacidade, sexo: quarto.sexo, valorDiariaCentavos: quarto.valorDiariaCentavos })
        .from(quarto)
        .where(
          inArray(
            quarto.hospedagemId,
            linhas.map((linha) => linha.id),
          ),
        )
        .orderBy(asc(quarto.nome));
      const ocupantes = quartos.length
        ? await executor
            .select({ quartoId: quartoOcupante.quartoId, convocacaoId: convocacao.id, pessoaId: pessoa.id, nome: nomeDaPessoa, sexo: pessoaEvento.sexo })
            .from(quartoOcupante)
            .innerJoin(convocacao, eq(convocacao.id, quartoOcupante.convocacaoId))
            .innerJoin(pessoa, eq(pessoa.id, convocacao.pessoaId))
            .leftJoin(pessoaEvento, eq(pessoaEvento.pessoaId, pessoa.id))
            .where(
              inArray(
                quartoOcupante.quartoId,
                quartos.map((item) => item.id),
              ),
            )
            .orderBy(asc(nomeDaPessoa))
        : [];

      return linhas.map((linha) => ({
        id: linha.id,
        local: { id: linha.localId, nome: linha.localNome, tipo: linha.localTipo as "HOTEL" | "APARTAMENTO", endereco: linha.endereco, cidade: linha.cidade, uf: linha.uf },
        pedido:
          linha.pedidoId && linha.referencia && linha.situacao && linha.pedidoAtualizadoEm
            ? {
                id: linha.pedidoId,
                referencia: linha.referencia,
                situacao: linha.situacao as SituacaoDoPedido,
                valorCentavos: linha.valorCentavos,
                observacaoTime: linha.observacaoTime,
                atualizadoEm: linha.pedidoAtualizadoEm.toISOString(),
              }
            : null,
        checkIn: linha.checkIn,
        checkOut: linha.checkOut,
        numeroReserva: linha.numeroReserva,
        observacao: linha.observacao,
        atualizadoEm: linha.atualizadoEm.toISOString(),
        quartos: quartos
          .filter((item) => item.hospedagemId === linha.id)
          .map((item) => ({
            id: item.id,
            nome: item.nome,
            capacidade: item.capacidade,
            sexo: item.sexo as Sexo | null,
            valorDiariaCentavos: item.valorDiariaCentavos,
            ocupantes: ocupantes
              .filter((ocupante) => ocupante.quartoId === item.id)
              .map((ocupante) => ({ convocacaoId: ocupante.convocacaoId, pessoaId: ocupante.pessoaId, nome: ocupante.nome, sexo: ocupante.sexo as Sexo | null })),
          })),
      }));
    },

    async equipeDoEvento(eventoId) {
      const linhas = await executor
        .select({
          convocacaoId: convocacao.id,
          pessoaId: convocacao.pessoaId,
          nome: nomeDaPessoa,
          sexo: pessoaEvento.sexo,
          funcao: funcao.nome,
          deslocamento: convocacao.deslocamento,
          quartoId: quartoOcupante.quartoId,
        })
        .from(convocacao)
        .innerJoin(escala, eq(escala.id, convocacao.escalaId))
        .innerJoin(pessoa, eq(pessoa.id, convocacao.pessoaId))
        .leftJoin(pessoaEvento, eq(pessoaEvento.pessoaId, convocacao.pessoaId))
        .leftJoin(funcao, eq(funcao.id, escala.funcaoId))
        .leftJoin(quartoOcupante, eq(quartoOcupante.convocacaoId, convocacao.id))
        .where(and(eq(escala.eventoId, eventoId), ativaNaEscala))
        .orderBy(asc(nomeDaPessoa));
      return linhas.map((linha) => ({ ...linha, sexo: linha.sexo as Sexo | null }));
    },

    async eventoExiste(eventoId) {
      const [linha] = await executor.select({ id: evento.id }).from(evento).where(and(eq(evento.id, eventoId), isNull(evento.deletedAt)));
      return Boolean(linha);
    },

    async localDeHospedagem(localId) {
      const [linha] = await executor.select({ tipo: local.tipo, deletedAt: local.deletedAt }).from(local).where(eq(local.id, localId));
      return linha ? { tipo: linha.tipo, arquivado: linha.deletedAt !== null } : null;
    },

    async inserirHospedagem({ eventoId, localId, checkIn, checkOut, observacao, usuarioId, instante }) {
      const [linha] = await executor
        .insert(hospedagem)
        .values({ eventoId, localId, checkIn, checkOut, observacao: observacao ?? null, criadoPor: usuarioId, criadoEm: instante, atualizadoEm: instante })
        .returning({ id: hospedagem.id });
      return linha!.id;
    },

    async travarHospedagem(hospedagemId) {
      const [linha] = await executor.select({ id: hospedagem.id, eventoId: hospedagem.eventoId }).from(hospedagem).where(eq(hospedagem.id, hospedagemId)).for("update");
      return linha ?? null;
    },

    async atualizarHospedagem({ hospedagemId, localId, checkIn, checkOut, observacao, atualizadoEm }, instante) {
      const alteradas = await executor
        .update(hospedagem)
        .set({ localId, checkIn, checkOut, observacao: observacao ?? null, atualizadoEm: instante })
        .where(and(eq(hospedagem.id, hospedagemId), mesmaVersao(hospedagem.atualizadoEm, atualizadoEm)))
        .returning({ id: hospedagem.id });
      return alteradas.length === 1;
    },

    async quartoComNome(hospedagemId, nome) {
      const [linha] = await executor
        .select({ id: quarto.id })
        .from(quarto)
        .where(and(eq(quarto.hospedagemId, hospedagemId), sql`lower(${quarto.nome}) = lower(${nome})`));
      return Boolean(linha);
    },

    async inserirQuarto({ hospedagemId, nome, capacidade, sexo, valorDiariaCentavos }, instante) {
      const [linha] = await executor
        .insert(quarto)
        .values({ hospedagemId, nome, capacidade, sexo: sexo ?? null, valorDiariaCentavos: valorDiariaCentavos ?? null, criadoEm: instante, atualizadoEm: instante })
        .returning({ id: quarto.id });
      return linha!.id;
    },

    async travarQuarto(quartoId) {
      const [travado] = await quartosTravados(eq(quarto.id, quartoId));
      return travado ?? null;
    },

    travarQuartosDoEvento(eventoId) {
      return quartosTravados(eq(hospedagem.eventoId, eventoId));
    },

    async removerQuarto(quartoId) {
      await executor.delete(quarto).where(eq(quarto.id, quartoId));
    },

    async travarConvocacao(convocacaoId) {
      if (!(await travarLinha(executor, convocacao, convocacaoId))) return null;
      const [linha] = await executor
        .select({ convocacaoId: convocacao.id, eventoId: escala.eventoId, status: convocacao.status, escalaApagada: escala.deletedAt, sexo: pessoaEvento.sexo })
        .from(convocacao)
        .innerJoin(escala, eq(escala.id, convocacao.escalaId))
        .leftJoin(pessoaEvento, eq(pessoaEvento.pessoaId, convocacao.pessoaId))
        .where(eq(convocacao.id, convocacaoId));
      if (!linha) return null;
      const [ocupante] = await executor.select({ quartoId: quartoOcupante.quartoId }).from(quartoOcupante).where(eq(quartoOcupante.convocacaoId, convocacaoId));
      return {
        convocacaoId: linha.convocacaoId,
        eventoId: linha.eventoId,
        ativa: linha.escalaApagada === null && CONVOCACAO_ATIVA.includes(linha.status),
        sexo: linha.sexo as Sexo | null,
        quartoId: ocupante?.quartoId ?? null,
      };
    },

    async semQuartoDoEvento(eventoId) {
      const linhas = await executor
        .select({ convocacaoId: convocacao.id, sexo: pessoaEvento.sexo })
        .from(convocacao)
        .innerJoin(escala, eq(escala.id, convocacao.escalaId))
        .innerJoin(pessoa, eq(pessoa.id, convocacao.pessoaId))
        .leftJoin(pessoaEvento, eq(pessoaEvento.pessoaId, convocacao.pessoaId))
        .leftJoin(quartoOcupante, eq(quartoOcupante.convocacaoId, convocacao.id))
        .where(and(eq(escala.eventoId, eventoId), ativaNaEscala, isNull(quartoOcupante.quartoId)))
        .orderBy(asc(nomeDaPessoa));
      return linhas.map((linha) => ({ convocacaoId: linha.convocacaoId, sexo: linha.sexo as Sexo | null }));
    },

    async porOcupante(quartoId, convocacaoId) {
      await executor.delete(quartoOcupante).where(eq(quartoOcupante.convocacaoId, convocacaoId));
      await executor.insert(quartoOcupante).values({ quartoId, convocacaoId });
    },

    async tirarOcupante(quartoId, convocacaoId) {
      const removidos = await executor
        .delete(quartoOcupante)
        .where(and(eq(quartoOcupante.quartoId, quartoId), eq(quartoOcupante.convocacaoId, convocacaoId)))
        .returning({ convocacaoId: quartoOcupante.convocacaoId });
      return removidos.length === 1;
    },

    async registrar({ hospedagemId, eventoId, acao, comentario, dados, usuarioId }) {
      await registrarAcao(executor, { entidade: "HOSPEDAGEM", entidadeId: hospedagemId, eventoId, acao, comentario, usuarioId, dados });
    },
  };
}
