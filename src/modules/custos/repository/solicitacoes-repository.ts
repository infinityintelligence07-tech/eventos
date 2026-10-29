import { and, asc, desc, eq, gte, ilike, inArray, isNull, notInArray, or, sql, type SQL } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";

import type { Executor } from "@/core/db/database";
import { registrarAcao } from "@/core/db/registro-acao";
import { pessoa, usuario } from "@/core/db/schema/core";
import {
  convocacao,
  custoItem,
  deslocamento,
  escala,
  evento,
  funcao,
  local,
  pessoaVeiculo,
  registroAcao,
  regraCusto,
  solicitacaoCusto,
} from "@/core/db/schema/eventos";

import type { CategoriaDoItem, StatusAuditoria, StatusFinanceiro } from "../domain/auditoria";
import type { NivelDeExcecao } from "../domain/calculo";
import type { CategoriaDaRegra, RegraDeCusto, UnidadeDaRegra } from "../domain/regras";
import type { RepositorioSolicitacoes } from "../service/solicitacoes";

const NA_ESCALA = ["SUGERIDA", "CONVIDADA", "ACEITA"];
const registrador = alias(usuario, "registrador");

const nomeDaPessoa = sql<string>`coalesce(${pessoa.nomeSocial}, ${pessoa.nomeCompleto})`;
const dataDoEvento = sql<string>`to_char(${evento.inicio} at time zone 'America/Sao_Paulo', 'YYYY-MM-DD')`;
const nomeDoUsuario = (coluna: unknown) => sql<string | null>`case when ${coluna} is null then null else coalesce(${usuario.nomeUsuario}, ${usuario.email}, 'time') end`;
const mesmaVersao = (iso: string) => sql`date_trunc('milliseconds', ${solicitacaoCusto.atualizadoEm}) = ${iso}::timestamptz`;

export type SolicitacaoDaFila = {
  id: string;
  protocolo: string;
  pessoaId: string;
  pessoaNome: string;
  registradaPeloTime: boolean;
  evento: { id: string; codigo: string | null; nome: string; data: string; tipoEventoId: string | null; uf: string | null };
  kmTotal: number;
  totalCentavos: number;
  nivel: NivelDeExcecao;
  auditoria: StatusAuditoria;
  financeiro: StatusFinanceiro;
  pagoEm: string | null;
  criadoEm: Date;
  /** ISO com milissegundos: versão para o compare-and-set da tela. */
  atualizadoEm: string;
};

export type DeslocamentoGravado = {
  ordem: number;
  origem: string;
  destino: string;
  idaVolta: boolean;
  km: number;
  consumoKmL: number;
  precoLitroCentavos: number;
  combustivelCentavos: number;
  pedagioCentavos: number;
  depreciacaoCentavos: number;
  totalCentavos: number;
  nivel: NivelDeExcecao;
  comprovanteUrl: string | null;
};

export type ItemGravado = {
  categoria: CategoriaDoItem;
  regraCustoId: string | null;
  descricao: string;
  quantidade: number;
  valorCentavos: number;
  comprovanteUrl: string | null;
};

export type HistoricoDaSolicitacao = { acao: string; statusPara: string | null; comentario: string | null; criadoEm: Date; usuarioNome: string | null };

export type DetalheDaSolicitacao = SolicitacaoDaFila & {
  funcao: string | null;
  parecer: string | null;
  auditadoEm: Date | null;
  auditadoPorNome: string | null;
  registradoPorNome: string | null;
  deslocamentos: DeslocamentoGravado[];
  itens: ItemGravado[];
  historico: HistoricoDaSolicitacao[];
};

export type FiltroDaFila = { eventoId?: string; auditoria?: StatusAuditoria; nivel?: NivelDeExcecao; busca?: string };

export type NumerosDaFila = { paraAuditar: number; criticas: number; aprovadasNoMesCentavos: number; reprovadasNoMes: number };

export type EventoParaRegistro = { id: string; codigo: string | null; nome: string; data: string };

export type PessoaParaRegistro = {
  pessoaId: string;
  nome: string;
  funcao: string | null;
  consumoKmL: number | null;
  solicitacao: { id: string; protocolo: string; auditoria: StatusAuditoria } | null;
};

const colunasDaFila = {
  id: solicitacaoCusto.id,
  protocolo: solicitacaoCusto.protocolo,
  pessoaId: solicitacaoCusto.pessoaId,
  pessoaNome: nomeDaPessoa,
  registradoPor: solicitacaoCusto.registradoPor,
  evento: { id: evento.id, codigo: evento.codigo, nome: evento.nome, data: dataDoEvento, tipoEventoId: evento.tipoEventoId, uf: local.uf },
  kmTotal: sql<string>`coalesce((select sum(${deslocamento.km} * case when ${deslocamento.idaVolta} then 2 else 1 end) from ${deslocamento} where ${deslocamento.solicitacaoId} = ${solicitacaoCusto.id}), 0)`,
  totalCentavos: solicitacaoCusto.totalCentavos,
  nivel: solicitacaoCusto.nivelExcecao,
  auditoria: solicitacaoCusto.statusAuditoria,
  financeiro: solicitacaoCusto.statusFinanceiro,
  pagoEm: solicitacaoCusto.pagoEm,
  criadoEm: solicitacaoCusto.criadoEm,
  atualizadoEm: solicitacaoCusto.atualizadoEm,
};

type LinhaDaFila = {
  registradoPor: string | null;
  kmTotal: string;
  nivel: string;
  auditoria: string;
  financeiro: string;
  atualizadoEm: Date;
} & Omit<SolicitacaoDaFila, "registradaPeloTime" | "kmTotal" | "nivel" | "auditoria" | "financeiro" | "atualizadoEm">;

function daFila({ registradoPor, kmTotal, nivel, auditoria, financeiro, atualizadoEm, ...resto }: LinhaDaFila): SolicitacaoDaFila {
  return {
    ...resto,
    registradaPeloTime: registradoPor !== null,
    kmTotal: Number(kmTotal),
    // nivel_excecao, status_auditoria e status_financeiro têm CHECK no banco com esses valores.
    nivel: nivel as NivelDeExcecao,
    auditoria: auditoria as StatusAuditoria,
    financeiro: financeiro as StatusFinanceiro,
    atualizadoEm: atualizadoEm.toISOString(),
  };
}

export function lerRegra(linha: typeof regraCusto.$inferSelect): RegraDeCusto {
  return {
    id: linha.id,
    // categoria e unidade têm CHECK no banco com esses valores.
    categoria: linha.categoria as CategoriaDaRegra,
    codigo: linha.codigo,
    nome: linha.nome,
    tipoEventoId: linha.tipoEventoId,
    uf: linha.uf,
    unidade: linha.unidade as UnidadeDaRegra,
    valorCentavos: linha.valorCentavos,
    parametros: (linha.parametros ?? {}) as Record<string, unknown>,
    vigenteDesde: linha.vigenteDesde,
    ativo: linha.ativo,
    observacao: linha.observacao,
  };
}

export function criarRepositorioSolicitacoes(executor: Executor): RepositorioSolicitacoes & {
  fila(filtro: FiltroDaFila): Promise<SolicitacaoDaFila[]>;
  numeros(inicioDoMes: string): Promise<NumerosDaFila>;
  deslocamentosDasSolicitacoes(ids: string[]): Promise<Map<string, DeslocamentoGravado[]>>;
  detalhe(protocolo: string): Promise<DetalheDaSolicitacao | null>;
  eventosParaRegistro(desde: string): Promise<EventoParaRegistro[]>;
  pessoasParaRegistro(eventoId: string): Promise<PessoaParaRegistro[]>;
} {
  function consultaDaFila() {
    return executor
      .select(colunasDaFila)
      .from(solicitacaoCusto)
      .innerJoin(evento, eq(evento.id, solicitacaoCusto.eventoId))
      .leftJoin(local, eq(local.id, evento.localId))
      .innerJoin(pessoa, eq(pessoa.id, solicitacaoCusto.pessoaId));
  }

  async function deslocamentosDasSolicitacoes(ids: string[]): Promise<Map<string, DeslocamentoGravado[]>> {
    const porSolicitacao = new Map<string, DeslocamentoGravado[]>();
    if (ids.length === 0) return porSolicitacao;
    const linhas = await executor.select().from(deslocamento).where(inArray(deslocamento.solicitacaoId, ids)).orderBy(asc(deslocamento.ordem));
    for (const linha of linhas) {
      porSolicitacao.set(linha.solicitacaoId, [
        ...(porSolicitacao.get(linha.solicitacaoId) ?? []),
        {
          ordem: linha.ordem,
          origem: linha.origem,
          destino: linha.destino,
          idaVolta: linha.idaVolta,
          km: Number(linha.km),
          consumoKmL: Number(linha.consumoKmL),
          precoLitroCentavos: linha.precoLitroCentavos,
          combustivelCentavos: linha.combustivelCentavos,
          pedagioCentavos: linha.pedagioCentavos,
          depreciacaoCentavos: linha.depreciacaoCentavos,
          totalCentavos: linha.totalCentavos,
          nivel: linha.nivelExcecao as NivelDeExcecao,
          comprovanteUrl: linha.comprovanteUrl,
        },
      ]);
    }
    return porSolicitacao;
  }

  return {
    deslocamentosDasSolicitacoes,

    async fila({ eventoId, auditoria, nivel, busca }) {
      const termo = busca?.trim();
      const condicoes: (SQL | undefined)[] = [
        eventoId ? eq(solicitacaoCusto.eventoId, eventoId) : undefined,
        auditoria ? eq(solicitacaoCusto.statusAuditoria, auditoria) : undefined,
        nivel ? eq(solicitacaoCusto.nivelExcecao, nivel) : undefined,
        termo
          ? or(ilike(solicitacaoCusto.protocolo, `%${termo}%`), ilike(pessoa.nomeCompleto, `%${termo}%`), ilike(pessoa.nomeSocial, `%${termo}%`))
          : undefined,
      ];
      const linhas = await consultaDaFila()
        .where(and(...condicoes))
        .orderBy(desc(solicitacaoCusto.criadoEm));
      return linhas.map(daFila);
    },

    async numeros(inicioDoMes) {
      const [linha] = await executor
        .select({
          paraAuditar: sql<number>`(count(*) filter (where ${solicitacaoCusto.statusAuditoria} = 'PENDENTE'))::int`,
          criticas: sql<number>`(count(*) filter (where ${solicitacaoCusto.statusAuditoria} = 'PENDENTE' and ${solicitacaoCusto.nivelExcecao} = 'CRITICO'))::int`,
          aprovadasNoMesCentavos: sql<number>`coalesce(sum(${solicitacaoCusto.totalCentavos}) filter (where ${solicitacaoCusto.statusAuditoria} = 'APROVADO' and ${solicitacaoCusto.auditadoEm} >= ${inicioDoMes}::date), 0)::int`,
          reprovadasNoMes: sql<number>`(count(*) filter (where ${solicitacaoCusto.statusAuditoria} = 'REPROVADO' and ${solicitacaoCusto.auditadoEm} >= ${inicioDoMes}::date))::int`,
        })
        .from(solicitacaoCusto);
      return linha ?? { paraAuditar: 0, criticas: 0, aprovadasNoMesCentavos: 0, reprovadasNoMes: 0 };
    },

    async detalhe(protocolo) {
      const [linha] = await consultaDaFila().where(eq(solicitacaoCusto.protocolo, protocolo));
      if (!linha) return null;
      const base = daFila(linha);
      const [extra] = await executor
        .select({
          parecer: solicitacaoCusto.parecer,
          auditadoEm: solicitacaoCusto.auditadoEm,
          auditadoPorNome: nomeDoUsuario(solicitacaoCusto.auditadoPor),
          registradoPorNome: sql<string | null>`case when ${solicitacaoCusto.registradoPor} is null then null else coalesce(${registrador.nomeUsuario}, ${registrador.email}, 'time') end`,
          funcao: funcao.nome,
        })
        .from(solicitacaoCusto)
        .leftJoin(usuario, eq(usuario.id, solicitacaoCusto.auditadoPor))
        .leftJoin(registrador, eq(registrador.id, solicitacaoCusto.registradoPor))
        .leftJoin(convocacao, eq(convocacao.id, solicitacaoCusto.convocacaoId))
        .leftJoin(escala, eq(escala.id, convocacao.escalaId))
        .leftJoin(funcao, eq(funcao.id, escala.funcaoId))
        .where(eq(solicitacaoCusto.id, base.id));
      const itens = await executor.select().from(custoItem).where(eq(custoItem.solicitacaoId, base.id)).orderBy(asc(custoItem.criadoEm), asc(custoItem.id));
      const historico = await executor
        .select({
          acao: registroAcao.acao,
          statusPara: registroAcao.statusPara,
          comentario: registroAcao.comentario,
          criadoEm: registroAcao.criadoEm,
          usuarioNome: nomeDoUsuario(registroAcao.usuarioId),
        })
        .from(registroAcao)
        .leftJoin(usuario, eq(usuario.id, registroAcao.usuarioId))
        .where(and(eq(registroAcao.entidade, "SOLICITACAO_CUSTO"), eq(registroAcao.entidadeId, base.id)))
        .orderBy(desc(registroAcao.criadoEm));
      return {
        ...base,
        funcao: extra?.funcao ?? null,
        parecer: extra?.parecer ?? null,
        auditadoEm: extra?.auditadoEm ?? null,
        auditadoPorNome: extra?.auditadoPorNome ?? null,
        registradoPorNome: extra?.registradoPorNome ?? null,
        deslocamentos: (await deslocamentosDasSolicitacoes([base.id])).get(base.id) ?? [],
        itens: itens.map((item) => ({
          categoria: item.categoria as CategoriaDoItem,
          regraCustoId: item.regraCustoId,
          descricao: item.descricao,
          quantidade: Number(item.quantidade),
          valorCentavos: item.valorCentavos,
          comprovanteUrl: item.comprovanteUrl,
        })),
        historico,
      };
    },

    async eventosParaRegistro(desde) {
      const comEscala = executor
        .select({ eventoId: escala.eventoId })
        .from(convocacao)
        .innerJoin(escala, eq(escala.id, convocacao.escalaId))
        .where(and(isNull(escala.deletedAt), inArray(convocacao.status, NA_ESCALA)));
      return executor
        .select({ id: evento.id, codigo: evento.codigo, nome: evento.nome, data: dataDoEvento })
        .from(evento)
        .where(and(isNull(evento.deletedAt), gte(sql`(${evento.inicio} at time zone 'America/Sao_Paulo')::date`, sql`${desde}::date`), inArray(evento.id, comEscala)))
        .orderBy(asc(evento.inicio));
    },

    async pessoasParaRegistro(eventoId) {
      const linhas = await executor
        .selectDistinctOn([convocacao.pessoaId], {
          pessoaId: convocacao.pessoaId,
          nome: nomeDaPessoa,
          funcao: funcao.nome,
          consumoKmL: pessoaVeiculo.consumoKmL,
          solicitacaoId: solicitacaoCusto.id,
          protocolo: solicitacaoCusto.protocolo,
          auditoria: solicitacaoCusto.statusAuditoria,
        })
        .from(convocacao)
        .innerJoin(escala, eq(escala.id, convocacao.escalaId))
        .innerJoin(pessoa, eq(pessoa.id, convocacao.pessoaId))
        .leftJoin(funcao, eq(funcao.id, escala.funcaoId))
        .leftJoin(pessoaVeiculo, eq(pessoaVeiculo.pessoaId, convocacao.pessoaId))
        .leftJoin(solicitacaoCusto, and(eq(solicitacaoCusto.eventoId, escala.eventoId), eq(solicitacaoCusto.pessoaId, convocacao.pessoaId)))
        .where(and(eq(escala.eventoId, eventoId), isNull(escala.deletedAt), inArray(convocacao.status, NA_ESCALA)))
        .orderBy(asc(convocacao.pessoaId));
      return linhas
        .map((linha) => ({
          pessoaId: linha.pessoaId,
          nome: linha.nome,
          funcao: linha.funcao,
          consumoKmL: linha.consumoKmL === null ? null : Number(linha.consumoKmL),
          solicitacao:
            linha.solicitacaoId && linha.protocolo && linha.auditoria
              ? { id: linha.solicitacaoId, protocolo: linha.protocolo, auditoria: linha.auditoria as StatusAuditoria }
              : null,
        }))
        .sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR"));
    },

    async eventoDoCusto(eventoId) {
      const [linha] = await executor
        .select({ id: evento.id, codigo: evento.codigo, tipoEventoId: evento.tipoEventoId, uf: local.uf, data: dataDoEvento })
        .from(evento)
        .leftJoin(local, eq(local.id, evento.localId))
        .where(and(eq(evento.id, eventoId), isNull(evento.deletedAt)));
      return linha ?? null;
    },

    async convocacaoDaPessoa(eventoId, pessoaId) {
      const [linha] = await executor
        .select({ id: convocacao.id })
        .from(convocacao)
        .innerJoin(escala, eq(escala.id, convocacao.escalaId))
        .where(and(eq(escala.eventoId, eventoId), eq(convocacao.pessoaId, pessoaId), isNull(escala.deletedAt), inArray(convocacao.status, NA_ESCALA)))
        .orderBy(asc(convocacao.criadoEm));
      return linha?.id ?? null;
    },

    async solicitacaoDaPessoa(eventoId, pessoaId) {
      const [linha] = await executor
        .select({ protocolo: solicitacaoCusto.protocolo })
        .from(solicitacaoCusto)
        .where(and(eq(solicitacaoCusto.eventoId, eventoId), eq(solicitacaoCusto.pessoaId, pessoaId)))
        .for("update");
      return linha?.protocolo ?? null;
    },

    async regras() {
      return (await executor.select().from(regraCusto)).map(lerRegra);
    },

    async inserirSolicitacao({ eventoId, pessoaId, convocacaoId, totalCentavos, nivel, usuarioId, instante }) {
      const [linha] = await executor
        .insert(solicitacaoCusto)
        .values({
          protocolo: sql`eventos.proximo_protocolo()`,
          eventoId,
          pessoaId,
          convocacaoId,
          totalCentavos,
          nivelExcecao: nivel,
          registradoPor: usuarioId,
          criadoEm: instante,
          atualizadoEm: instante,
        })
        .returning({ id: solicitacaoCusto.id, protocolo: solicitacaoCusto.protocolo });
      return linha!;
    },

    async gravarLinhas(solicitacaoId, linhas, instante) {
      await executor.delete(deslocamento).where(eq(deslocamento.solicitacaoId, solicitacaoId));
      await executor.delete(custoItem).where(eq(custoItem.solicitacaoId, solicitacaoId));
      if (linhas.deslocamentos.length > 0) {
        await executor.insert(deslocamento).values(
          linhas.deslocamentos.map((linha, indice) => ({
            solicitacaoId,
            ordem: indice + 1,
            origem: linha.origem,
            destino: linha.destino,
            idaVolta: linha.idaVolta,
            km: linha.km.toFixed(1),
            consumoKmL: linha.consumoKmL.toFixed(1),
            precoLitroCentavos: linha.precoLitroCentavos,
            combustivelCentavos: linha.calculado.combustivelCentavos,
            pedagioCentavos: linha.calculado.pedagioCentavos,
            depreciacaoCentavos: linha.calculado.depreciacaoCentavos,
            totalCentavos: linha.calculado.totalCentavos,
            nivelExcecao: linha.calculado.nivel,
            criadoEm: instante,
          })),
        );
      }
      if (linhas.itens.length > 0) {
        await executor.insert(custoItem).values(
          linhas.itens.map((item) => ({
            solicitacaoId,
            categoria: item.categoria,
            regraCustoId: item.regraCustoId ?? null,
            descricao: item.descricao,
            quantidade: item.quantidade.toFixed(2),
            valorCentavos: item.valorCentavos,
            criadoEm: instante,
          })),
        );
      }
    },

    async travarSolicitacao(solicitacaoId) {
      const [linha] = await executor
        .select({
          id: solicitacaoCusto.id,
          protocolo: solicitacaoCusto.protocolo,
          eventoId: solicitacaoCusto.eventoId,
          pessoaId: solicitacaoCusto.pessoaId,
          auditoria: solicitacaoCusto.statusAuditoria,
          financeiro: solicitacaoCusto.statusFinanceiro,
          nivel: solicitacaoCusto.nivelExcecao,
          registradoPor: solicitacaoCusto.registradoPor,
        })
        .from(solicitacaoCusto)
        .where(eq(solicitacaoCusto.id, solicitacaoId))
        .for("update");
      if (!linha) return null;
      const { auditoria, financeiro, nivel, ...resto } = linha;
      return { ...resto, situacao: { auditoria: auditoria as StatusAuditoria, financeiro: financeiro as StatusFinanceiro }, nivel: nivel as NivelDeExcecao };
    },

    async autoresDoRegistro(solicitacaoId) {
      const linhas = await executor
        .selectDistinct({ usuarioId: registroAcao.usuarioId })
        .from(registroAcao)
        .where(
          and(
            eq(registroAcao.entidade, "SOLICITACAO_CUSTO"),
            eq(registroAcao.entidadeId, solicitacaoId),
            inArray(registroAcao.acao, ["SOLICITACAO_REGISTRADA", "CORRECAO_REGISTRADA"]),
          ),
        );
      return linhas.flatMap((linha) => (linha.usuarioId ? [linha.usuarioId] : []));
    },

    async cadastroDaPessoa(pessoaId) {
      const [linha] = await executor.select({ usuarioId: pessoa.usuarioId, email: pessoa.email }).from(pessoa).where(eq(pessoa.id, pessoaId));
      return { usuarioId: linha?.usuarioId ?? null, email: linha?.email ?? null };
    },

    async mudarSolicitacao(solicitacaoId, condicao, mudanca) {
      const auditoria =
        mudanca.auditoria === "LIMPAR"
          ? { auditadoPor: null, auditadoEm: null }
          : mudanca.auditoria
            ? { auditadoPor: mudanca.auditoria.usuarioId, auditadoEm: mudanca.instante, parecer: mudanca.auditoria.parecer }
            : {};
      const recalculo = mudanca.recalculo
        ? { totalCentavos: mudanca.recalculo.totalCentavos, nivelExcecao: mudanca.recalculo.nivel, registradoPor: mudanca.recalculo.registradoPor }
        : {};
      const alteradas = await executor
        .update(solicitacaoCusto)
        .set({
          statusAuditoria: mudanca.para.auditoria,
          statusFinanceiro: mudanca.para.financeiro,
          atualizadoEm: mudanca.instante,
          ...auditoria,
          ...recalculo,
        })
        .where(
          and(
            eq(solicitacaoCusto.id, solicitacaoId),
            eq(solicitacaoCusto.statusAuditoria, condicao.de),
            notInArray(solicitacaoCusto.statusFinanceiro, ["PAGO", "REJEITADO"]),
            mesmaVersao(condicao.atualizadoEm),
          ),
        )
        .returning({ id: solicitacaoCusto.id });
      return alteradas.length === 1;
    },

    async registrar({ solicitacaoId, eventoId, acao, statusDe, statusPara, comentario, emNomeDePessoaId, dados, usuarioId }) {
      await registrarAcao(executor, { entidade: "SOLICITACAO_CUSTO", entidadeId: solicitacaoId, eventoId, acao, statusDe, statusPara, comentario, emNomeDePessoaId, usuarioId, dados });
    },
  };
}
