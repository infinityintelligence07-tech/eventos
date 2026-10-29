import { and, asc, desc, eq, inArray, isNull, ne, notInArray, sql, type SQL } from "drizzle-orm";

import { pessoa, usuario } from "@/core/db/schema/core";
import type { Executor } from "@/core/db/database";
import { registrarAcao } from "@/core/db/registro-acao";
import { convocacao, escala, evento, hospedagem, local, pedidoSdc, trechoVoo } from "@/core/db/schema/eventos";

import type { PreferenciaDeHorario, Sentido, SituacaoDoPedido, TipoDoPedido } from "../domain/pedido";
import type { RepositorioPedidos } from "../service/pedidos";
import { CONVOCACAO_ATIVA, eventoTerminaDesde, fimDoEvento, inicioDoEvento, mesmaVersao, nomeDaPessoa, travarLinha } from "./comum";

export type EventoDaLogistica = {
  id: string;
  codigo: string | null;
  nome: string;
  dataInicio: string;
  dataFim: string;
  cidade: string | null;
  uf: string | null;
};

export type PassageiroDeVoo = {
  convocacaoId: string;
  pessoaId: string;
  pessoaNome: string;
  statusConvocacao: string;
  evento: EventoDaLogistica;
};

export type TrechoDoPedido = {
  sentido: Sentido;
  origemIata: string;
  destinoIata: string;
  dataDesejada: string;
  preferenciaHorario: PreferenciaDeHorario | null;
  companhia: string | null;
  numeroVoo: string | null;
  localizador: string | null;
  partidaEm: Date | null;
  chegadaEm: Date | null;
  cartaoEmbarqueUrl: string | null;
};

export type PedidoDaSdc = {
  id: string;
  referencia: string;
  tipo: TipoDoPedido;
  situacao: SituacaoDoPedido;
  evento: EventoDaLogistica;
  pessoaId: string | null;
  pessoaNome: string | null;
  convocacaoId: string | null;
  valorCentavos: number | null;
  observacaoTime: string | null;
  observacaoSdc: string | null;
  solicitadoEm: Date;
  emitidoEm: Date | null;
  retornoRegistradoPor: string | null;
  canceladoEm: Date | null;
  motivoCancelamento: string | null;
  /** ISO com milissegundos: versão para o compare-and-set da tela. */
  atualizadoEm: string;
  trechos: TrechoDoPedido[];
};

const colunasDoEvento = {
  id: evento.id,
  codigo: evento.codigo,
  nome: evento.nome,
  dataInicio: inicioDoEvento,
  dataFim: fimDoEvento,
  cidade: local.cidade,
  uf: local.uf,
};

/** Recebe o executor da transação do fluxo (escrita) ou o banco (leitura). */
export function criarRepositorioPedidos(executor: Executor): RepositorioPedidos & {
  eventoPorId(eventoId: string): Promise<EventoDaLogistica | null>;
  eventosDaLogistica(filtro: { desde: string }): Promise<EventoDaLogistica[]>;
  passageirosDeVoo(filtro: { desde: string; eventoId?: string }): Promise<PassageiroDeVoo[]>;
  pedidos(filtro: { desde?: string; eventoId?: string; tipo?: TipoDoPedido; referencia?: string; situacoes?: SituacaoDoPedido[] }): Promise<PedidoDaSdc[]>;
} {
  async function trechosDosPedidos(ids: string[]): Promise<Map<string, TrechoDoPedido[]>> {
    const porPedido = new Map<string, TrechoDoPedido[]>();
    if (ids.length === 0) return porPedido;
    const linhas = await executor
      .select({
        pedidoId: trechoVoo.pedidoId,
        sentido: trechoVoo.sentido,
        origemIata: trechoVoo.origemIata,
        destinoIata: trechoVoo.destinoIata,
        dataDesejada: trechoVoo.dataDesejada,
        preferenciaHorario: trechoVoo.preferenciaHorario,
        companhia: trechoVoo.companhia,
        numeroVoo: trechoVoo.numeroVoo,
        localizador: trechoVoo.localizador,
        partidaEm: trechoVoo.partidaEm,
        chegadaEm: trechoVoo.chegadaEm,
        cartaoEmbarqueUrl: trechoVoo.cartaoEmbarqueUrl,
      })
      .from(trechoVoo)
      .where(inArray(trechoVoo.pedidoId, ids))
      .orderBy(asc(trechoVoo.sentido));
    for (const { pedidoId, ...trecho } of linhas) {
      // sentido e preferencia_horario têm CHECK no banco com esses valores.
      porPedido.set(pedidoId, [
        ...(porPedido.get(pedidoId) ?? []),
        { ...trecho, sentido: trecho.sentido as Sentido, preferenciaHorario: trecho.preferenciaHorario as PreferenciaDeHorario | null },
      ]);
    }
    return porPedido;
  }

  return {
    async eventoPorId(eventoId) {
      const [linha] = await executor
        .select(colunasDoEvento)
        .from(evento)
        .leftJoin(local, eq(local.id, evento.localId))
        .where(and(eq(evento.id, eventoId), isNull(evento.deletedAt)));
      return linha ?? null;
    },

    async eventosDaLogistica({ desde }) {
      const ativas = executor
        .select({ eventoId: escala.eventoId })
        .from(convocacao)
        .innerJoin(escala, eq(escala.id, convocacao.escalaId))
        .where(and(isNull(escala.deletedAt), inArray(convocacao.status, CONVOCACAO_ATIVA)));
      return executor
        .selectDistinct(colunasDoEvento)
        .from(evento)
        .leftJoin(local, eq(local.id, evento.localId))
        .where(and(isNull(evento.deletedAt), eventoTerminaDesde(desde), inArray(evento.id, ativas)))
        .orderBy(asc(inicioDoEvento), asc(evento.codigo));
    },

    async passageirosDeVoo({ desde, eventoId }) {
      const linhas = await executor
        .select({
          convocacaoId: convocacao.id,
          pessoaId: convocacao.pessoaId,
          pessoaNome: nomeDaPessoa,
          statusConvocacao: convocacao.status,
          evento: colunasDoEvento,
        })
        .from(convocacao)
        .innerJoin(escala, eq(escala.id, convocacao.escalaId))
        .innerJoin(evento, eq(evento.id, escala.eventoId))
        .leftJoin(local, eq(local.id, evento.localId))
        .innerJoin(pessoa, eq(pessoa.id, convocacao.pessoaId))
        .where(
          and(
            isNull(escala.deletedAt),
            isNull(evento.deletedAt),
            eq(convocacao.deslocamento, "VOO"),
            inArray(convocacao.status, CONVOCACAO_ATIVA),
            eventoId ? eq(evento.id, eventoId) : eventoTerminaDesde(desde),
          ),
        )
        .orderBy(asc(inicioDoEvento), asc(nomeDaPessoa));
      return linhas;
    },

    async pedidos({ desde, eventoId, tipo, referencia, situacoes }) {
      const condicoes: (SQL | undefined)[] = [
        eventoId ? eq(pedidoSdc.eventoId, eventoId) : undefined,
        desde && !eventoId && !referencia ? eventoTerminaDesde(desde) : undefined,
        tipo ? eq(pedidoSdc.tipo, tipo) : undefined,
        referencia ? eq(pedidoSdc.referencia, referencia) : undefined,
        situacoes ? inArray(pedidoSdc.situacao, situacoes) : undefined,
      ];
      const linhas = await executor
        .select({
          id: pedidoSdc.id,
          referencia: pedidoSdc.referencia,
          tipo: pedidoSdc.tipo,
          situacao: pedidoSdc.situacao,
          evento: colunasDoEvento,
          pessoaId: pedidoSdc.pessoaId,
          pessoaNome: sql<string | null>`case when ${pessoa.id} is null then null else ${nomeDaPessoa} end`,
          convocacaoId: pedidoSdc.convocacaoId,
          valorCentavos: pedidoSdc.valorCentavos,
          observacaoTime: pedidoSdc.observacaoTime,
          observacaoSdc: pedidoSdc.observacaoSdc,
          solicitadoEm: pedidoSdc.solicitadoEm,
          emitidoEm: pedidoSdc.emitidoEm,
          retornoRegistradoPor: sql<string | null>`case when ${pedidoSdc.retornoRegistradoPor} is null then null else coalesce(${usuario.nomeUsuario}, ${usuario.email}, 'time') end`,
          canceladoEm: pedidoSdc.canceladoEm,
          motivoCancelamento: pedidoSdc.motivoCancelamento,
          atualizadoEm: pedidoSdc.atualizadoEm,
        })
        .from(pedidoSdc)
        .innerJoin(evento, eq(evento.id, pedidoSdc.eventoId))
        .leftJoin(local, eq(local.id, evento.localId))
        .leftJoin(pessoa, eq(pessoa.id, pedidoSdc.pessoaId))
        .leftJoin(usuario, eq(usuario.id, pedidoSdc.retornoRegistradoPor))
        .where(and(...condicoes))
        .orderBy(asc(inicioDoEvento), desc(pedidoSdc.referencia));
      const trechos = await trechosDosPedidos(linhas.map((linha) => linha.id));
      return linhas.map((linha) => ({
        ...linha,
        // tipo e situacao têm CHECK no banco com esses valores.
        tipo: linha.tipo as TipoDoPedido,
        situacao: linha.situacao as SituacaoDoPedido,
        atualizadoEm: linha.atualizadoEm.toISOString(),
        trechos: trechos.get(linha.id) ?? [],
      }));
    },

    async travarConvocacao(convocacaoId) {
      if (!(await travarLinha(executor, convocacao, convocacaoId))) return null;
      const [linha] = await executor
        .select({ convocacaoId: convocacao.id, pessoaId: convocacao.pessoaId, eventoId: escala.eventoId, status: convocacao.status, deslocamento: convocacao.deslocamento })
        .from(convocacao)
        .innerJoin(escala, eq(escala.id, convocacao.escalaId))
        .where(and(eq(convocacao.id, convocacaoId), isNull(escala.deletedAt)));
      if (!linha) return null;
      return { ...linha, ativa: CONVOCACAO_ATIVA.includes(linha.status) };
    },

    async pedidoDeVooAtivo(eventoId, pessoaId) {
      const [linha] = await executor
        .select({ referencia: pedidoSdc.referencia })
        .from(pedidoSdc)
        .where(and(eq(pedidoSdc.eventoId, eventoId), eq(pedidoSdc.pessoaId, pessoaId), eq(pedidoSdc.tipo, "VOO"), ne(pedidoSdc.situacao, "CANCELADO")));
      return linha?.referencia ?? null;
    },

    async inserirPedido(pedido) {
      const [linha] = await executor
        .insert(pedidoSdc)
        .values({
          tipo: pedido.tipo,
          eventoId: pedido.eventoId,
          pessoaId: pedido.pessoaId,
          convocacaoId: pedido.convocacaoId,
          observacaoTime: pedido.observacaoTime,
          solicitadoPor: pedido.usuarioId,
          solicitadoEm: pedido.instante,
          criadoEm: pedido.instante,
          atualizadoEm: pedido.instante,
        })
        .returning({ id: pedidoSdc.id, referencia: pedidoSdc.referencia });
      return linha!;
    },

    async substituirTrechosDesejados(pedidoId, trechos, instante) {
      const sentidos = trechos.map((trecho) => trecho.sentido);
      await executor.delete(trechoVoo).where(and(eq(trechoVoo.pedidoId, pedidoId), notInArray(trechoVoo.sentido, sentidos)));
      for (const trecho of trechos) {
        const desejado = {
          origemIata: trecho.origemIata,
          destinoIata: trecho.destinoIata,
          dataDesejada: trecho.dataDesejada,
          preferenciaHorario: trecho.preferenciaHorario,
          atualizadoEm: instante,
        };
        await executor
          .insert(trechoVoo)
          .values({ pedidoId, sentido: trecho.sentido, ...desejado, criadoEm: instante })
          .onConflictDoUpdate({ target: [trechoVoo.pedidoId, trechoVoo.sentido], set: desejado });
      }
    },

    async travarPedido(pedidoId) {
      const [linha] = await executor
        .select({
          id: pedidoSdc.id,
          referencia: pedidoSdc.referencia,
          tipo: pedidoSdc.tipo,
          situacao: pedidoSdc.situacao,
          eventoId: pedidoSdc.eventoId,
          pessoaId: pedidoSdc.pessoaId,
          atualizadoEm: pedidoSdc.atualizadoEm,
        })
        .from(pedidoSdc)
        .where(eq(pedidoSdc.id, pedidoId))
        .for("update");
      if (!linha) return null;
      const sentidos = await executor.select({ sentido: trechoVoo.sentido }).from(trechoVoo).where(eq(trechoVoo.pedidoId, pedidoId));
      return {
        ...linha,
        tipo: linha.tipo as TipoDoPedido,
        situacao: linha.situacao as SituacaoDoPedido,
        sentidos: sentidos.map((trecho) => trecho.sentido as Sentido),
      };
    },

    async mudarPedido(pedidoId, condicao, mudanca) {
      const alterados = await executor
        .update(pedidoSdc)
        .set({
          situacao: mudanca.para,
          atualizadoEm: mudanca.instante,
          ...(mudanca.observacaoTime !== undefined ? { observacaoTime: mudanca.observacaoTime } : {}),
          ...(mudanca.emissao
            ? {
                emitidoEm: mudanca.instante,
                valorCentavos: mudanca.emissao.valorCentavos,
                observacaoSdc: mudanca.emissao.observacaoSdc,
                retornoRegistradoPor: mudanca.emissao.usuarioId,
              }
            : {}),
          ...(mudanca.cancelamento
            ? { canceladoEm: mudanca.instante, canceladoPor: mudanca.cancelamento.usuarioId, motivoCancelamento: mudanca.cancelamento.motivo }
            : {}),
        })
        .where(
          and(
            eq(pedidoSdc.id, pedidoId),
            eq(pedidoSdc.situacao, condicao.de),
            condicao.atualizadoEm ? mesmaVersao(pedidoSdc.atualizadoEm, condicao.atualizadoEm) : undefined,
          ),
        )
        .returning({ id: pedidoSdc.id });
      return alterados.length === 1;
    },

    async registrarEmissaoDosTrechos(pedidoId, trechos, instante) {
      for (const trecho of trechos) {
        await executor
          .update(trechoVoo)
          .set({
            companhia: trecho.companhia,
            numeroVoo: trecho.numeroVoo,
            localizador: trecho.localizador,
            partidaEm: trecho.partidaEm,
            chegadaEm: trecho.chegadaEm,
            cartaoEmbarqueUrl: trecho.cartaoEmbarqueUrl,
            atualizadoEm: instante,
          })
          .where(and(eq(trechoVoo.pedidoId, pedidoId), eq(trechoVoo.sentido, trecho.sentido)));
      }
    },

    async travarHospedagemSemPedido(hospedagemId) {
      if (!(await travarLinha(executor, hospedagem, hospedagemId))) return null;
      const [linha] = await executor
        .select({ eventoId: hospedagem.eventoId, pedidoId: hospedagem.pedidoId, localTipo: local.tipo })
        .from(hospedagem)
        .innerJoin(local, eq(local.id, hospedagem.localId))
        .where(eq(hospedagem.id, hospedagemId));
      return linha ?? null;
    },

    async vincularHospedagem(hospedagemId, pedidoId, instante) {
      await executor.update(hospedagem).set({ pedidoId, atualizadoEm: instante }).where(eq(hospedagem.id, hospedagemId));
    },

    async desvincularHospedagemDoPedido(pedidoId, instante) {
      await executor.update(hospedagem).set({ pedidoId: null, atualizadoEm: instante }).where(eq(hospedagem.pedidoId, pedidoId));
    },

    async registrarReserva(pedidoId, numeroReserva, instante) {
      await executor.update(hospedagem).set({ numeroReserva, atualizadoEm: instante }).where(eq(hospedagem.pedidoId, pedidoId));
    },

    async registrar({ pedidoId, eventoId, acao, statusDe, statusPara, comentario, emNomeDePessoaId, dados, usuarioId }) {
      await registrarAcao(executor, {
        entidade: "PEDIDO_SDC",
        entidadeId: pedidoId,
        eventoId,
        acao,
        statusDe,
        statusPara,
        comentario,
        emNomeDePessoaId,
        usuarioId,
        dados,
      });
    },
  };
}
