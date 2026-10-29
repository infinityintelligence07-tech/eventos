import { and, asc, desc, eq, gt, gte, inArray, isNull, lte, notInArray, sql } from "drizzle-orm";

import type { Executor } from "@/core/db/database";
import { pessoa, polo } from "@/core/db/schema/core";
import { disponibilidade, enquete, enqueteEvento, evento, funcao, pessoaEvento, pessoaFuncao, tipoEvento } from "@/core/db/schema/eventos";

import type { PessoaDaEnquete, RespostaGravada } from "../domain/respostas";
import { diaEmSaoPaulo, nomeDaPessoa, poloDaPessoa } from "./sql";

export type EnqueteNaLista = { id: string; titulo: string; fechaEm: Date; eventos: number; responderam: number };

export type EventoDaEnquete = {
  id: string;
  codigo: string | null;
  nome: string;
  dataInicio: string;
  dataFim: string;
  poloCodigo: string | null;
  tipoSigla: string | null;
};

export type EnqueteComEventos = { id: string; titulo: string; fechaEm: Date; criadoEm: Date; eventos: EventoDaEnquete[] };

export type FiltrosDosEventos = { de: string; ate: string; poloCodigo?: string | null; tipoSigla?: string | null };

export type OpcoesDaDisponibilidade = {
  polos: { codigo: string; nome: string }[];
  tipos: { sigla: string; nome: string }[];
  funcoes: { codigo: string; nome: string }[];
};

export type ConsultaDisponibilidade = {
  listarEnquetes(): Promise<EnqueteNaLista[]>;
  totalDeStaffAtivo(): Promise<number>;
  enquete(enqueteId: string): Promise<EnqueteComEventos | null>;
  staffAtivo(): Promise<PessoaDaEnquete[]>;
  respostasDosEventos(eventoIds: string[]): Promise<RespostaGravada[]>;
  eventosParaEnquete(filtros: FiltrosDosEventos): Promise<EventoDaEnquete[]>;
  opcoesDeFiltro(): Promise<OpcoesDaDisponibilidade>;
  /** Abertas em `agora` que fecham até `limite`. */
  enquetesFechandoAte(agora: Date, limite: Date): Promise<{ id: string; titulo: string; fechaEm: Date }[]>;
};

const staffAtivoNaPessoa = and(eq(pessoa.ativo, true), isNull(pessoa.deletedAt));

const COLUNAS_DO_EVENTO = {
  id: evento.id,
  codigo: evento.codigo,
  nome: evento.nome,
  dataInicio: diaEmSaoPaulo(evento.inicio),
  dataFim: diaEmSaoPaulo(evento.fim),
  poloCodigo: polo.codigo,
  tipoSigla: tipoEvento.sigla,
};

export function criarConsultaDisponibilidade(executor: Executor): ConsultaDisponibilidade {
  return {
    async listarEnquetes() {
      const responderam = sql<number>`(
        select count(distinct d.pessoa_id)::int
          from ${disponibilidade} d
          join ${enqueteEvento} ee on ee.evento_id = d.evento_id
          join ${pessoaEvento} pe on pe.pessoa_id = d.pessoa_id
          join ${pessoa} p on p.id = d.pessoa_id
         where ee.enquete_id = "enquete"."id" and p.ativo and p.deleted_at is null
      )`;
      const eventos = sql<number>`(select count(*)::int from ${enqueteEvento} ee where ee.enquete_id = "enquete"."id")`;
      return executor
        .select({ id: enquete.id, titulo: enquete.titulo, fechaEm: enquete.fechaEm, eventos, responderam })
        .from(enquete)
        .orderBy(desc(enquete.fechaEm), desc(enquete.criadoEm));
    },

    async totalDeStaffAtivo() {
      const [linha] = await executor
        .select({ total: sql<number>`count(*)::int` })
        .from(pessoaEvento)
        .innerJoin(pessoa, eq(pessoa.id, pessoaEvento.pessoaId))
        .where(staffAtivoNaPessoa);
      return linha?.total ?? 0;
    },

    async enquete(enqueteId) {
      const [encontrada] = await executor
        .select({ id: enquete.id, titulo: enquete.titulo, fechaEm: enquete.fechaEm, criadoEm: enquete.criadoEm })
        .from(enquete)
        .where(eq(enquete.id, enqueteId));
      if (!encontrada) return null;
      const eventos = await executor
        .select(COLUNAS_DO_EVENTO)
        .from(enqueteEvento)
        .innerJoin(evento, eq(evento.id, enqueteEvento.eventoId))
        .leftJoin(polo, eq(polo.id, evento.poloId))
        .leftJoin(tipoEvento, eq(tipoEvento.id, evento.tipoEventoId))
        .where(eq(enqueteEvento.enqueteId, enqueteId))
        .orderBy(asc(evento.inicio), asc(evento.codigo));
      return { ...encontrada, eventos };
    },

    async staffAtivo() {
      const pessoas = await executor
        .select({ pessoaId: pessoa.id, nome: nomeDaPessoa, poloCodigo: poloDaPessoa })
        .from(pessoaEvento)
        .innerJoin(pessoa, eq(pessoa.id, pessoaEvento.pessoaId))
        .where(staffAtivoNaPessoa)
        .orderBy(asc(nomeDaPessoa));
      const funcoes = await executor
        .select({ pessoaId: pessoaFuncao.pessoaId, codigo: funcao.codigo, nome: funcao.nome })
        .from(pessoaFuncao)
        .innerJoin(funcao, eq(funcao.id, pessoaFuncao.funcaoId))
        .orderBy(asc(funcao.nome));
      const porPessoa = Map.groupBy(funcoes, (linha) => linha.pessoaId);
      return pessoas.map((linha) => ({
        ...linha,
        funcoes: (porPessoa.get(linha.pessoaId) ?? []).map(({ codigo, nome }) => ({ codigo, nome })),
      }));
    },

    async respostasDosEventos(eventoIds) {
      if (eventoIds.length === 0) return [];
      return executor
        .select({
          eventoId: disponibilidade.eventoId,
          pessoaId: disponibilidade.pessoaId,
          disponivel: disponibilidade.disponivel,
          respondidoEm: disponibilidade.respondidoEm,
          registradoPor: disponibilidade.registradoPor,
        })
        .from(disponibilidade)
        .where(inArray(disponibilidade.eventoId, eventoIds));
    },

    async eventosParaEnquete({ de, ate, poloCodigo, tipoSigla }) {
      return executor
        .select(COLUNAS_DO_EVENTO)
        .from(evento)
        .leftJoin(polo, eq(polo.id, evento.poloId))
        .leftJoin(tipoEvento, eq(tipoEvento.id, evento.tipoEventoId))
        .where(
          and(
            isNull(evento.deletedAt),
            notInArray(evento.status, ["CANCELADO", "CONCLUIDO"]),
            gte(diaEmSaoPaulo(evento.fim), de),
            lte(diaEmSaoPaulo(evento.inicio), ate),
            poloCodigo ? eq(polo.codigo, poloCodigo) : undefined,
            tipoSigla ? eq(tipoEvento.sigla, tipoSigla) : undefined,
          ),
        )
        .orderBy(asc(evento.inicio), asc(evento.codigo));
    },

    async opcoesDeFiltro() {
      const [polos, tipos, funcoes] = await Promise.all([
        executor.select({ codigo: polo.codigo, nome: polo.nome }).from(polo).where(and(eq(polo.ativo, true), isNull(polo.deletedAt))).orderBy(asc(polo.nome)),
        executor.select({ sigla: tipoEvento.sigla, nome: tipoEvento.nome }).from(tipoEvento).where(eq(tipoEvento.ativo, true)).orderBy(asc(tipoEvento.nome)),
        executor.select({ codigo: funcao.codigo, nome: funcao.nome }).from(funcao).where(eq(funcao.ativo, true)).orderBy(asc(funcao.nome)),
      ]);
      return { polos, tipos, funcoes };
    },

    async enquetesFechandoAte(agora, limite) {
      return executor
        .select({ id: enquete.id, titulo: enquete.titulo, fechaEm: enquete.fechaEm })
        .from(enquete)
        .where(and(gt(enquete.fechaEm, agora), lte(enquete.fechaEm, limite)))
        .orderBy(asc(enquete.fechaEm));
    },
  };
}
