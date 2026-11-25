import { and, asc, count, desc, eq, inArray, isNotNull, isNull, ne, notInArray, or, sql, type SQL } from "drizzle-orm";

import { pessoa, polo, usuario } from "@/core/db/schema/core";
import type { Executor } from "@/core/db/database";
import { autoriaDe, registrarAcao } from "@/core/db/registro-acao";
import { alias } from "drizzle-orm/pg-core";

import { acessoSdc, convocacao, escala, evento, hospedagem, local, pedidoSdc, pessoaEvento, quarto, quartoOcupante, tipoEvento, trechoVoo } from "@/core/db/schema/eventos";

import type { PreferenciaDeHorario, Sentido, SituacaoDoPedido, TipoDoPedido } from "../domain/pedido";
import type { RepositorioPedidos } from "../service/pedidos";
import { origensDoHotel } from "./hospedagem-repository";
import { CONVOCACAO_ATIVA, convocacaoPrincipal, eventoTerminaDesde, fimDoEvento, inicioDoEvento, mesmaVersao, nomeDaPessoa, travarLinha } from "./comum";

export type EventoDaLogistica = {
  id: string;
  codigo: string | null;
  nome: string;
  dataInicio: string;
  dataFim: string;
  /** Local do evento (onde ele acontece), com cidade e UF. */
  localNome: string | null;
  cidade: string | null;
  uf: string | null;
  /** O time marcou que o evento não precisa de voo: sai do aviso de voos. */
  semVoo: boolean;
  /** O time marcou que o evento não tem hospedagem (o "Sem hospedagem" da planilha). */
  semHospedagem: boolean;
  /** Evento do tipo Masterclass (palestra): fica no recorte "Masterclass" das telas de Voos e de Hospedagem. */
  masterclass: boolean;
};

/** Evento de hoje em diante, não cancelado, com a sigla do tipo e o código do polo (o aviso de voos deixa de fora as Masterclasses e o polo de casa). */
export type EventoFuturo = EventoDaLogistica & { tipoSigla: string | null; poloCodigo: string | null };

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
  /** Só no voo: "também precisa de hotel" (uma das origens da lista de hotel do evento). */
  precisaHotel: boolean;
  /**
   * Só no voo de Masterclass em turnê: a última palestra, de onde a volta sai (`evento` é a primeira, onde a ida
   * chega). Nulo = ida e volta pelo mesmo evento.
   */
  eventoDaVolta: EventoDaLogistica | null;
  valorCentavos: number | null;
  formaPagamento: string | null;
  observacaoTime: string | null;
  observacaoSdc: string | null;
  /** Dia em que o pedido foi feito à SDC e dia em que ela comprou (AAAA-MM-DD), informados por quem lança. */
  dataSolicitacao: string;
  dataCompra: string | null;
  /** Instantes do lançamento no sistema (o histórico usa estes). */
  solicitadoEm: Date;
  emitidoEm: Date | null;
  retornoRegistradoPor: string | null;
  /** Nome de quem da SDC lançou a compra pela área dela (nulo = foi o time, ou ainda não há compra). */
  retornoPelaSdc: string | null;
  /** Aprovação do pagamento pelo time: quando, por quem (nome) e a observação. */
  aprovadoEm: Date | null;
  aprovadoPor: string | null;
  observacaoAprovacao: string | null;
  canceladoEm: Date | null;
  motivoCancelamento: string | null;
  /** ISO com milissegundos: versão para o compare-and-set da tela. */
  atualizadoEm: string;
  trechos: TrechoDoPedido[];
};

/** Sigla do tipo Masterclass (a mesma de modules/eventos). */
const SIGLA_MASTERCLASS = "MC";

/** As colunas do evento para a logística, do evento do pedido ou de um apelido dele (o evento da volta, na turnê). */
const colunasDe = (ev: typeof evento, lugar: typeof local) => ({
  id: ev.id,
  codigo: ev.codigo,
  nome: ev.nome,
  dataInicio: sql<string>`to_char(${ev.inicio} at time zone 'America/Sao_Paulo', 'YYYY-MM-DD')`,
  dataFim: sql<string>`to_char(${ev.fim} at time zone 'America/Sao_Paulo', 'YYYY-MM-DD')`,
  localNome: lugar.nome,
  cidade: lugar.cidade,
  uf: lugar.uf,
  semVoo: ev.semVoo,
  semHospedagem: ev.semHospedagem,
  masterclass: sql<boolean>`coalesce((select t.sigla = ${SIGLA_MASTERCLASS} from eventos.tipo_evento t where t.id = ${ev.tipoEventoId}), false)`,
});

const colunasDoEvento = colunasDe(evento, local);

/** Recebe o executor da transação do fluxo (escrita) ou o banco (leitura). */
export function criarRepositorioPedidos(executor: Executor): RepositorioPedidos & {
  eventoPorId(eventoId: string): Promise<EventoDaLogistica | null>;
  /** Eventos de hoje em diante que já têm gente na escala (é com eles que a Hospedagem e as Caronas trabalham). */
  eventosDaLogistica(filtro: { desde: string }): Promise<EventoDaLogistica[]>;
  /** Todos os eventos de hoje em diante, com ou sem escala, fora os cancelados: o voo é pedido antes da escala. */
  eventosFuturos(filtro: { desde: string }): Promise<EventoFuturo[]>;
  /** Lembrete da escala: quem está nela com o deslocamento Avião. */
  passageirosDeVoo(filtro: { desde: string; eventoId?: string }): Promise<PassageiroDeVoo[]>;
  /** Pares evento|pessoa de quem está na escala (convocação principal ativa), para a coluna "Escala" dos pedidos. */
  naEscala(filtro: { desde: string; eventoId?: string }): Promise<Set<string>>;
  /** Por evento (de `desde` em diante): quantas pessoas com voo pedido "também precisa de hotel" ainda estão sem quarto. */
  comHotelPeloVooSemQuarto(filtro: { desde: string; eventoId?: string }): Promise<{ eventoId: string; pessoas: number }[]>;
  /** Pessoas ativas do cadastro de staff, por nome: quem pode receber um pedido de voo. */
  staffAtivoPorNome(): Promise<{ pessoaId: string; nome: string }[]>;
  temPedidoDeVooAtivo(eventoId: string): Promise<boolean>;
  /** `aAprovar`: só compras registradas, com valor, que o time ainda não aprovou para pagamento (de qualquer data). */
  pedidos(filtro: { desde?: string; eventoId?: string; tipo?: TipoDoPedido; referencia?: string; situacoes?: SituacaoDoPedido[]; aAprovar?: boolean }): Promise<PedidoDaSdc[]>;
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

    async eventosFuturos({ desde }) {
      return executor
        .select({ ...colunasDoEvento, tipoSigla: tipoEvento.sigla, poloCodigo: polo.codigo })
        .from(evento)
        .leftJoin(local, eq(local.id, evento.localId))
        .leftJoin(tipoEvento, eq(tipoEvento.id, evento.tipoEventoId))
        .leftJoin(polo, eq(polo.id, evento.poloId))
        .where(and(isNull(evento.deletedAt), ne(evento.status, "CANCELADO"), eventoTerminaDesde(desde)))
        .orderBy(asc(inicioDoEvento), asc(evento.codigo));
    },

    async naEscala({ desde, eventoId }) {
      const linhas = await executor
        .select({ eventoId: escala.eventoId, pessoaId: convocacao.pessoaId })
        .from(convocacao)
        .innerJoin(escala, eq(escala.id, convocacao.escalaId))
        .innerJoin(evento, eq(evento.id, escala.eventoId))
        .where(
          and(
            isNull(escala.deletedAt),
            isNull(evento.deletedAt),
            inArray(convocacao.status, CONVOCACAO_ATIVA),
            convocacaoPrincipal,
            eventoId ? eq(evento.id, eventoId) : eventoTerminaDesde(desde),
          ),
        );
      return new Set(linhas.map((linha) => `${linha.eventoId}|${linha.pessoaId}`));
    },

    async temPedidoDeVooAtivo(eventoId) {
      const [linha] = await executor
        .select({ id: pedidoSdc.id })
        .from(pedidoSdc)
        .where(and(eq(pedidoSdc.eventoId, eventoId), eq(pedidoSdc.tipo, "VOO"), ne(pedidoSdc.situacao, "CANCELADO")))
        .limit(1);
      return linha !== undefined;
    },

    async comHotelPeloVooSemQuarto({ desde, eventoId }) {
      const linhas = await executor
        .select({ eventoId: pedidoSdc.eventoId, pessoas: sql<number>`count(distinct ${pedidoSdc.pessoaId})::int` })
        .from(pedidoSdc)
        .innerJoin(evento, eq(evento.id, pedidoSdc.eventoId))
        .where(
          and(
            eq(pedidoSdc.tipo, "VOO"),
            ne(pedidoSdc.situacao, "CANCELADO"),
            eq(pedidoSdc.precisaHotel, true),
            isNotNull(pedidoSdc.pessoaId),
            isNull(evento.deletedAt),
            eventoTerminaDesde(desde),
            eventoId ? eq(pedidoSdc.eventoId, eventoId) : undefined,
            sql`not exists (select 1 from ${quartoOcupante} o where o.evento_id = ${pedidoSdc.eventoId} and o.pessoa_id = ${pedidoSdc.pessoaId})`,
          ),
        )
        .groupBy(pedidoSdc.eventoId);
      return linhas;
    },

    async staffAtivoPorNome() {
      return executor
        .select({ pessoaId: pessoa.id, nome: nomeDaPessoa })
        .from(pessoa)
        .innerJoin(pessoaEvento, eq(pessoaEvento.pessoaId, pessoa.id))
        .where(and(eq(pessoa.ativo, true), isNull(pessoa.deletedAt)))
        .orderBy(asc(nomeDaPessoa));
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
            convocacaoPrincipal,
            eventoId ? eq(evento.id, eventoId) : eventoTerminaDesde(desde),
          ),
        )
        .orderBy(asc(inicioDoEvento), asc(nomeDaPessoa));
      return linhas;
    },

    async pedidos({ desde, eventoId, tipo, referencia, situacoes, aAprovar }) {
      const aprovador = alias(usuario, "aprovador");
      // A última palestra da turnê de Masterclass (a volta sai de lá).
      const eventoDaVolta = alias(evento, "evento_volta");
      const localDaVolta = alias(local, "local_volta");
      const condicoes: (SQL | undefined)[] = [
        // Na turnê, o pedido aparece tanto na primeira palestra quanto na última.
        eventoId ? or(eq(pedidoSdc.eventoId, eventoId), eq(pedidoSdc.eventoVoltaId, eventoId)) : undefined,
        // A turnê continua na lista até a última palestra passar.
        desde && !eventoId && !referencia ? sql`(coalesce(${eventoDaVolta.fim}, ${evento.fim}) at time zone 'America/Sao_Paulo')::date >= ${desde}::date` : undefined,
        tipo ? eq(pedidoSdc.tipo, tipo) : undefined,
        referencia ? eq(pedidoSdc.referencia, referencia) : undefined,
        situacoes ? inArray(pedidoSdc.situacao, situacoes) : undefined,
        aAprovar ? and(eq(pedidoSdc.situacao, "EMITIDO"), isNotNull(pedidoSdc.valorCentavos), isNull(pedidoSdc.aprovadoEm)) : undefined,
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
          precisaHotel: pedidoSdc.precisaHotel,
          eventoVoltaId: pedidoSdc.eventoVoltaId,
          // O apelido tem as mesmas colunas; só o nome da tabela no tipo é outro.
          eventoDaVolta: colunasDe(eventoDaVolta as unknown as typeof evento, localDaVolta as unknown as typeof local),
          valorCentavos: pedidoSdc.valorCentavos,
          formaPagamento: pedidoSdc.formaPagamento,
          observacaoTime: pedidoSdc.observacaoTime,
          observacaoSdc: pedidoSdc.observacaoSdc,
          dataSolicitacao: pedidoSdc.dataSolicitacao,
          dataCompra: pedidoSdc.dataCompra,
          solicitadoEm: pedidoSdc.solicitadoEm,
          emitidoEm: pedidoSdc.emitidoEm,
          retornoRegistradoPor: sql<string | null>`case when ${pedidoSdc.retornoRegistradoPor} is null then null else coalesce(${usuario.nomeUsuario}, ${usuario.email}, 'time') end`,
          retornoPelaSdc: acessoSdc.nome,
          aprovadoEm: pedidoSdc.aprovadoEm,
          aprovadoPor: sql<string | null>`case when ${pedidoSdc.aprovadoEm} is null then null else coalesce(${aprovador.nomeUsuario}, ${aprovador.email}, 'time') end`,
          observacaoAprovacao: pedidoSdc.observacaoAprovacao,
          canceladoEm: pedidoSdc.canceladoEm,
          motivoCancelamento: pedidoSdc.motivoCancelamento,
          atualizadoEm: pedidoSdc.atualizadoEm,
        })
        .from(pedidoSdc)
        .innerJoin(evento, eq(evento.id, pedidoSdc.eventoId))
        .leftJoin(local, eq(local.id, evento.localId))
        .leftJoin(eventoDaVolta, eq(eventoDaVolta.id, pedidoSdc.eventoVoltaId))
        .leftJoin(localDaVolta, eq(localDaVolta.id, eventoDaVolta.localId))
        .leftJoin(pessoa, eq(pessoa.id, pedidoSdc.pessoaId))
        .leftJoin(usuario, eq(usuario.id, pedidoSdc.retornoRegistradoPor))
        .leftJoin(aprovador, eq(aprovador.id, pedidoSdc.aprovadoPor))
        .leftJoin(acessoSdc, eq(acessoSdc.id, pedidoSdc.retornoRegistradoPelaSdc))
        .where(and(...condicoes))
        .orderBy(asc(inicioDoEvento), desc(pedidoSdc.referencia));
      const trechos = await trechosDosPedidos(linhas.map((linha) => linha.id));
      return linhas.map(({ eventoVoltaId, eventoDaVolta: daVolta, ...linha }) => ({
        ...linha,
        eventoDaVolta: eventoVoltaId && daVolta?.id ? (daVolta as EventoDaLogistica) : null,
        // tipo e situacao têm CHECK no banco com esses valores.
        tipo: linha.tipo as TipoDoPedido,
        situacao: linha.situacao as SituacaoDoPedido,
        atualizadoEm: linha.atualizadoEm.toISOString(),
        trechos: trechos.get(linha.id) ?? [],
      }));
    },

    async travarEvento(eventoId) {
      if (!(await travarLinha(executor, evento, eventoId))) return null;
      return this.eventoDoPedido(eventoId);
    },

    async eventoDoPedido(eventoId) {
      const [linha] = await executor
        .select({ id: evento.id, dataInicio: inicioDoEvento, dataFim: fimDoEvento, status: evento.status, masterclass: colunasDoEvento.masterclass })
        .from(evento)
        .where(and(eq(evento.id, eventoId), isNull(evento.deletedAt)));
      return linha ? { id: linha.id, dataInicio: linha.dataInicio, dataFim: linha.dataFim, cancelado: linha.status === "CANCELADO", masterclass: linha.masterclass === true } : null;
    },

    async staffAtivo(pessoaId) {
      const [linha] = await executor
        .select({ pessoaId: pessoa.id, nome: nomeDaPessoa })
        .from(pessoa)
        .innerJoin(pessoaEvento, eq(pessoaEvento.pessoaId, pessoa.id))
        .where(and(eq(pessoa.id, pessoaId), eq(pessoa.ativo, true), isNull(pessoa.deletedAt)));
      return linha ?? null;
    },

    async convocacaoPrincipal(eventoId, pessoaId) {
      const [linha] = await executor
        .select({ id: convocacao.id })
        .from(convocacao)
        .innerJoin(escala, eq(escala.id, convocacao.escalaId))
        .where(and(eq(escala.eventoId, eventoId), isNull(escala.deletedAt), eq(convocacao.pessoaId, pessoaId), inArray(convocacao.status, CONVOCACAO_ATIVA), convocacaoPrincipal))
        .limit(1);
      return linha?.id ?? null;
    },

    async pedidosDeVooAtivos(eventoId, pessoaId) {
      const linhas = await executor
        .select({ referencia: pedidoSdc.referencia })
        .from(pedidoSdc)
        .where(and(eq(pedidoSdc.eventoId, eventoId), eq(pedidoSdc.pessoaId, pessoaId), eq(pedidoSdc.tipo, "VOO"), ne(pedidoSdc.situacao, "CANCELADO")))
        .orderBy(asc(pedidoSdc.referencia));
      return linhas.map((linha) => linha.referencia);
    },

    async inserirPedido(pedido) {
      const [linha] = await executor
        .insert(pedidoSdc)
        .values({
          tipo: pedido.tipo,
          eventoId: pedido.eventoId,
          pessoaId: pedido.pessoaId,
          convocacaoId: pedido.convocacaoId,
          precisaHotel: pedido.tipo === "VOO" && pedido.precisaHotel === true,
          eventoVoltaId: pedido.tipo === "VOO" ? (pedido.eventoVoltaId ?? null) : null,
          dataSolicitacao: pedido.dataSolicitacao,
          observacaoTime: pedido.observacaoTime,
          solicitadoPor: pedido.usuarioId,
          solicitadoEm: pedido.instante,
          criadoEm: pedido.instante,
          atualizadoEm: pedido.instante,
        })
        .returning({ id: pedidoSdc.id, referencia: pedidoSdc.referencia });
      return linha!;
    },

    async definirPrecisaHotel(pedidoId, precisaHotel, instante) {
      await executor.update(pedidoSdc).set({ precisaHotel, atualizadoEm: instante }).where(eq(pedidoSdc.id, pedidoId));
    },

    async hotelDaPessoaNoEvento(eventoId, pessoaId) {
      const [ocupante] = await executor
        .select({ quartoId: quartoOcupante.quartoId })
        .from(quartoOcupante)
        .where(and(eq(quartoOcupante.eventoId, eventoId), eq(quartoOcupante.pessoaId, pessoaId)));
      return { origens: await origensDoHotel(executor, { eventoId, pessoaId }), noQuarto: ocupante !== undefined };
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
          precisaHotel: pedidoSdc.precisaHotel,
          dataSolicitacao: pedidoSdc.dataSolicitacao,
          valorCentavos: pedidoSdc.valorCentavos,
          aprovadoEm: pedidoSdc.aprovadoEm,
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
                dataCompra: mudanca.emissao.dataCompra,
                valorCentavos: mudanca.emissao.valorCentavos,
                observacaoSdc: mudanca.emissao.observacaoSdc,
                // Um ou outro: o time em nome da SDC, ou a própria SDC.
                retornoRegistradoPor: "usuarioId" in mudanca.emissao.autor ? mudanca.emissao.autor.usuarioId : null,
                retornoRegistradoPelaSdc: "acessoSdcId" in mudanca.emissao.autor ? mudanca.emissao.autor.acessoSdcId : null,
                ...(mudanca.emissao.formaPagamento !== undefined ? { formaPagamento: mudanca.emissao.formaPagamento } : {}),
              }
            : {}),
          ...(mudanca.cancelamento
            ? { canceladoEm: mudanca.instante, canceladoPor: mudanca.cancelamento.usuarioId, motivoCancelamento: mudanca.cancelamento.motivo }
            : {}),
          // Alterar e cancelar tiram o pedido de EMITIDO: a aprovação sai junto (o CHECK do banco exige). Corrigir a compra também a derruba.
          ...(mudanca.aprovacaoCai || mudanca.para !== "EMITIDO" ? { aprovadoEm: null, aprovadoPor: null, observacaoAprovacao: null } : {}),
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

    async aprovarPagamento(pedidoId, visto, { usuarioId, instante, observacao }) {
      const alterados = await executor
        .update(pedidoSdc)
        .set({ aprovadoEm: instante, aprovadoPor: usuarioId, observacaoAprovacao: observacao, atualizadoEm: instante })
        .where(
          and(
            eq(pedidoSdc.id, pedidoId),
            eq(pedidoSdc.situacao, "EMITIDO"),
            isNull(pedidoSdc.aprovadoEm),
            eq(pedidoSdc.valorCentavos, visto.valorCentavos),
            mesmaVersao(pedidoSdc.atualizadoEm, visto.atualizadoEm),
          ),
        )
        .returning({ id: pedidoSdc.id });
      return alterados.length === 1;
    },

    async desfazerAprovacao(pedidoId, instante) {
      const alterados = await executor
        .update(pedidoSdc)
        .set({ aprovadoEm: null, aprovadoPor: null, observacaoAprovacao: null, atualizadoEm: instante })
        .where(and(eq(pedidoSdc.id, pedidoId), isNotNull(pedidoSdc.aprovadoEm)))
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
            // Ausente = quem registra é a SDC: o link do time fica como estava.
            ...(trecho.cartaoEmbarqueUrl !== undefined ? { cartaoEmbarqueUrl: trecho.cartaoEmbarqueUrl } : {}),
            atualizadoEm: instante,
          })
          .where(and(eq(trechoVoo.pedidoId, pedidoId), eq(trechoVoo.sentido, trecho.sentido)));
      }
    },

    async travarHospedagemSemPedido(hospedagemId) {
      if (!(await travarLinha(executor, hospedagem, hospedagemId))) return null;
      // Left join: enquanto a SDC não escolhe o hotel, a hospedagem não tem local.
      const [linha] = await executor
        .select({ eventoId: hospedagem.eventoId, pedidoId: hospedagem.pedidoId, localTipo: local.tipo })
        .from(hospedagem)
        .leftJoin(local, eq(local.id, hospedagem.localId))
        .where(eq(hospedagem.id, hospedagemId));
      if (!linha) return null;
      const [quartos] = await executor.select({ total: count() }).from(quarto).where(eq(quarto.hospedagemId, hospedagemId));
      return { ...linha, quartos: quartos?.total ?? 0 };
    },

    async vincularHospedagem(hospedagemId, pedidoId, instante) {
      await executor.update(hospedagem).set({ pedidoId, atualizadoEm: instante }).where(eq(hospedagem.id, hospedagemId));
    },

    async desvincularHospedagemDoPedido(pedidoId, instante) {
      await executor.update(hospedagem).set({ pedidoId: null, atualizadoEm: instante }).where(eq(hospedagem.pedidoId, pedidoId));
    },

    async tipoDoLocal(localId) {
      const [linha] = await executor.select({ tipo: local.tipo }).from(local).where(and(eq(local.id, localId), isNull(local.deletedAt)));
      return linha?.tipo ?? null;
    },

    async registrarReserva(pedidoId, { numeroReserva, localId }, instante) {
      const alteradas = await executor
        .update(hospedagem)
        .set({ numeroReserva, localId, atualizadoEm: instante })
        .where(eq(hospedagem.pedidoId, pedidoId))
        .returning({ id: hospedagem.id });
      return alteradas.length === 1;
    },

    async registrar({ pedidoId, eventoId, acao, statusDe, statusPara, comentario, emNomeDePessoaId, dados, ...autor }) {
      await registrarAcao(executor, {
        ...autoriaDe(autor),
        entidade: "PEDIDO_SDC",
        entidadeId: pedidoId,
        eventoId,
        acao,
        statusDe,
        statusPara,
        comentario,
        emNomeDePessoaId,
        dados,
      });
    },
  };
}
