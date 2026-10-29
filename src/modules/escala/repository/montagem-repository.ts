import { and, eq, inArray, isNull, ne, sql } from "drizzle-orm";

import { pessoa } from "@/core/db/schema/core";
import type { Executor } from "@/core/db/database";
import { registrarAcao } from "@/core/db/registro-acao";
import { convocacao, escala, evento, funcao, pessoaEvento, tipoEvento } from "@/core/db/schema/eventos";

import type { StatusConvocacao, StatusEscala } from "../domain/convite";
import type { LinhaTravada, RepositorioMontagem } from "../service/portas";
import { HORARIO_PADRAO } from "./vagas-repository";

const ATIVAS: StatusConvocacao[] = ["SUGERIDA", "CONVIDADA", "ACEITA"];

const diaEmSaoPaulo = (coluna: typeof evento.inicio | typeof evento.fim) =>
  sql<string>`to_char(${coluna} at time zone 'America/Sao_Paulo', 'YYYY-MM-DD')`;

export const nomeDaPessoa = sql<string>`coalesce(${pessoa.nomeSocial}, ${pessoa.nomeCompleto})`;

const ativasDaLinha = sql<number>`(select count(*)::int from ${convocacao}
  where ${convocacao.escalaId} = ${escala.id} and ${convocacao.status} in ('SUGERIDA', 'CONVIDADA', 'ACEITA'))`;

const COLUNAS_DA_LINHA = {
  id: escala.id,
  eventoId: escala.eventoId,
  funcaoId: escala.funcaoId,
  funcao: funcao.codigo,
  nomeDaFuncao: sql<string>`coalesce(${funcao.nome}, 'Função sem nome')`,
  data: sql<string>`${escala.data}::text`,
  quantidade: escala.quantidadeVagas,
  origem: escala.origem,
  confirmada: sql<boolean>`${escala.confirmadaEm} is not null`,
  ativas: ativasDaLinha,
};

// origem tem CHECK no banco ('REGRA', 'MANUAL').
const comOrigem = (linha: Omit<LinhaTravada, "origem"> & { origem: string }): LinhaTravada => ({ ...linha, origem: linha.origem as LinhaTravada["origem"] });

/** Recebe o executor da transação do fluxo. O evento é travado antes de qualquer linha ou convocação. */
export function criarRepositorioMontagem(executor: Executor): RepositorioMontagem {
  return {
    async travarEvento(eventoId) {
      // O Postgres não aceita FOR UPDATE OF com schema no nome: trava sem join e lê depois.
      const [travado] = await executor
        .select({ id: evento.id })
        .from(evento)
        .where(and(eq(evento.id, eventoId), isNull(evento.deletedAt)))
        .for("update");
      if (!travado) return null;
      const [linha] = await executor
        .select({
          id: evento.id,
          codigo: evento.codigo,
          status: evento.status,
          statusEscala: evento.statusEscala,
          regraVagas: tipoEvento.regraVagas,
          expectativaPublico: evento.expectativaPublico,
          pessoasNaFila: evento.pessoasNaFila,
          dataInicio: diaEmSaoPaulo(evento.inicio),
          dataFim: diaEmSaoPaulo(evento.fim),
        })
        .from(evento)
        .leftJoin(tipoEvento, eq(tipoEvento.id, evento.tipoEventoId))
        .where(eq(evento.id, eventoId));
      // status_escala tem CHECK no banco com esses valores.
      return linha ? { ...linha, statusEscala: linha.statusEscala as StatusEscala, regraVagas: linha.regraVagas ?? {} } : null;
    },

    async comecarRascunho(eventoId, instante) {
      await executor
        .update(evento)
        .set({ statusEscala: "RASCUNHO", atualizadoEm: instante })
        .where(and(eq(evento.id, eventoId), eq(evento.statusEscala, "SEM_ESCALA")));
    },

    async travarLinha(escalaId) {
      const [travada] = await executor
        .select({ id: escala.id })
        .from(escala)
        .where(and(eq(escala.id, escalaId), isNull(escala.deletedAt)))
        .for("update");
      if (!travada) return null;
      const [linha] = await executor.select(COLUNAS_DA_LINHA).from(escala).leftJoin(funcao, eq(funcao.id, escala.funcaoId)).where(eq(escala.id, escalaId));
      return linha ? comOrigem(linha) : null;
    },

    async linhasDoEvento(eventoId) {
      const linhas = await executor
        .select(COLUNAS_DA_LINHA)
        .from(escala)
        .leftJoin(funcao, eq(funcao.id, escala.funcaoId))
        .where(and(eq(escala.eventoId, eventoId), isNull(escala.deletedAt)))
        .orderBy(escala.criadoEm, escala.id);
      return linhas.map(comOrigem);
    },

    async definirVagas(escalaId, { quantidade, confirmadaPor, instante }) {
      await executor
        .update(escala)
        .set({ quantidadeVagas: quantidade, confirmadaEm: confirmadaPor ? instante : null, confirmadaPor, atualizadoEm: instante })
        .where(eq(escala.id, escalaId));
    },

    async funcaoPorCodigo(codigo) {
      const [linha] = await executor
        .select({ id: funcao.id, codigo: funcao.codigo, nome: funcao.nome })
        .from(funcao)
        .where(and(eq(funcao.codigo, codigo), eq(funcao.ativo, true)));
      return linha ?? null;
    },

    async funcaoPorId(funcaoId) {
      const [linha] = await executor
        .select({ id: funcao.id, codigo: funcao.codigo, nome: funcao.nome })
        .from(funcao)
        .where(and(eq(funcao.id, funcaoId), eq(funcao.ativo, true)));
      return linha ?? null;
    },

    async inserirLinha({ eventoId, funcaoId, data, quantidade, origem, confirmadaPor, instante }) {
      const [linha] = await executor
        .insert(escala)
        .values({
          eventoId,
          funcaoId,
          data,
          horaInicio: HORARIO_PADRAO.inicio,
          horaFim: HORARIO_PADRAO.fim,
          quantidadeVagas: quantidade,
          status: "ABERTA",
          origem,
          confirmadaEm: instante,
          confirmadaPor,
          criadoEm: instante,
          atualizadoEm: instante,
        })
        .returning({ id: escala.id });
      return linha!.id;
    },

    async apagarLinha(escalaId, instante) {
      await executor.update(escala).set({ deletedAt: instante, atualizadoEm: instante }).where(eq(escala.id, escalaId));
    },

    async pessoaEscalavel(pessoaId) {
      const [linha] = await executor
        .select({ nome: nomeDaPessoa })
        .from(pessoaEvento)
        .innerJoin(pessoa, eq(pessoa.id, pessoaEvento.pessoaId))
        .where(and(eq(pessoaEvento.pessoaId, pessoaId), eq(pessoa.ativo, true), isNull(pessoa.deletedAt)));
      return linha ?? null;
    },

    async convocacaoNaLinha(escalaId, pessoaId) {
      const [linha] = await executor
        .select({ id: convocacao.id, status: convocacao.status })
        .from(convocacao)
        .where(and(eq(convocacao.escalaId, escalaId), eq(convocacao.pessoaId, pessoaId)))
        .for("update");
      return linha ? { id: linha.id, status: linha.status as StatusConvocacao } : null;
    },

    async ativaEmOutraLinhaDoEvento(eventoId, escalaId, pessoaId) {
      const [linha] = await executor
        .select({ id: convocacao.id })
        .from(convocacao)
        .innerJoin(escala, eq(escala.id, convocacao.escalaId))
        .where(
          and(
            eq(escala.eventoId, eventoId),
            ne(escala.id, escalaId),
            isNull(escala.deletedAt),
            eq(convocacao.pessoaId, pessoaId),
            inArray(convocacao.status, ATIVAS),
          ),
        )
        .limit(1);
      return linha !== undefined;
    },

    async conflitosDeAgenda(eventoId, pessoaId) {
      const resultado = await executor.execute<{ evento: string }>(sql`
        select distinct coalesce(outro.codigo, outro.nome) as evento
          from ${convocacao} c
          join ${escala} e on e.id = c.escala_id and e.deleted_at is null
          join ${evento} outro on outro.id = e.evento_id and outro.deleted_at is null and outro.status <> 'CANCELADO'
          join ${evento} este on este.id = ${eventoId}
         where c.pessoa_id = ${pessoaId}
           and c.status in ('SUGERIDA', 'CONVIDADA', 'ACEITA')
           and outro.id <> este.id
           and outro.inicio <= este.fim and outro.fim >= este.inicio
         order by 1`);
      return resultado.rows.map((linha) => linha.evento);
    },

    async inserirConvocacao({ escalaId, pessoaId, usuarioId, sugestaoScore, instante }) {
      const [linha] = await executor
        .insert(convocacao)
        .values({
          escalaId,
          pessoaId,
          status: "SUGERIDA",
          criadoPor: usuarioId,
          sugestaoScore: sugestaoScore === null ? null : sugestaoScore.toFixed(2),
          criadoEm: instante,
          atualizadoEm: instante,
        })
        .returning({ id: convocacao.id });
      return linha!.id;
    },

    async reativarConvocacao(convocacaoId, { de, usuarioId, sugestaoScore, instante }) {
      const alteradas = await executor
        .update(convocacao)
        .set({
          status: "SUGERIDA",
          convidadaEm: null,
          respondidaEm: null,
          motivoRecusa: null,
          registradoPor: null,
          criadoPor: usuarioId,
          sugestaoScore: sugestaoScore === null ? null : sugestaoScore.toFixed(2),
          atualizadoEm: instante,
        })
        .where(and(eq(convocacao.id, convocacaoId), eq(convocacao.status, de)))
        .returning({ id: convocacao.id });
      return alteradas.length === 1;
    },

    async travarConvocacao(convocacaoId) {
      const [travada] = await executor.select({ id: convocacao.id }).from(convocacao).where(eq(convocacao.id, convocacaoId)).for("update");
      if (!travada) return null;
      const [linha] = await executor
        .select({
          id: convocacao.id,
          escalaId: convocacao.escalaId,
          eventoId: escala.eventoId,
          pessoaId: convocacao.pessoaId,
          nome: nomeDaPessoa,
          status: convocacao.status,
        })
        .from(convocacao)
        .innerJoin(escala, and(eq(escala.id, convocacao.escalaId), isNull(escala.deletedAt)))
        .innerJoin(pessoa, eq(pessoa.id, convocacao.pessoaId))
        .where(eq(convocacao.id, convocacaoId));
      return linha ? { ...linha, status: linha.status as StatusConvocacao } : null;
    },

    async apagarConvocacao(convocacaoId, de) {
      const apagadas = await executor
        .delete(convocacao)
        .where(and(eq(convocacao.id, convocacaoId), eq(convocacao.status, de)))
        .returning({ id: convocacao.id });
      return apagadas.length === 1;
    },

    async mudarConvocacao(convocacaoId, { de, para, instante, resposta }) {
      const alteradas = await executor
        .update(convocacao)
        .set({
          status: para,
          atualizadoEm: instante,
          ...(resposta ? { respondidaEm: instante, motivoRecusa: resposta.motivoRecusa, registradoPor: resposta.registradoPor } : {}),
        })
        .where(and(eq(convocacao.id, convocacaoId), eq(convocacao.status, de)))
        .returning({ id: convocacao.id });
      return alteradas.length === 1;
    },

    async definirDeslocamento(convocacaoId, deslocamento, instante) {
      await executor.update(convocacao).set({ deslocamento, atualizadoEm: instante }).where(eq(convocacao.id, convocacaoId));
    },

    async mudarStatusDaEscala(eventoId, { de, para, instante, aprovadoPor, limparAprovacao }) {
      const alterados = await executor
        .update(evento)
        .set({
          statusEscala: para,
          atualizadoEm: instante,
          ...(aprovadoPor ? { aprovadoPor, aprovadoEm: instante } : {}),
          ...(limparAprovacao ? { aprovadoPor: null, aprovadoEm: null } : {}),
        })
        .where(and(eq(evento.id, eventoId), eq(evento.statusEscala, de), isNull(evento.deletedAt)))
        .returning({ id: evento.id });
      return alterados.length === 1;
    },

    registrar(entrada) {
      return registrarAcao(executor, entrada);
    },
  };
}
