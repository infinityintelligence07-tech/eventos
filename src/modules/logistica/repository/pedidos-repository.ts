import { and, asc, count, desc, eq, inArray, isNull, ne, notInArray, sql, type SQL } from "drizzle-orm";

import { pessoa, polo, usuario } from "@/core/db/schema/core";
import type { Executor } from "@/core/db/database";
import { registrarAcao } from "@/core/db/registro-acao";
import { convocacao, escala, evento, hospedagem, local, pedidoSdc, pessoaEvento, quarto, tipoEvento, trechoVoo } from "@/core/db/schema/eventos";

import type { PreferenciaDeHorario, Sentido, SituacaoDoPedido, TipoDoPedido } from "../domain/pedido";
import type { RepositorioPedidos } from "../service/pedidos";
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
  valorCentavos: number | null;
  formaPagamento: string | null;
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
  localNome: local.nome,
  cidade: local.cidade,
  uf: local.uf,
  semVoo: evento.semVoo,
  semHospedagem: evento.semHospedagem,
};

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
  /** Pessoas ativas do cadastro de staff, por nome: quem pode receber um pedido de voo. */
  staffAtivoPorNome(): Promise<{ pessoaId: string; nome: string }[]>;
  temPedidoDeVooAtivo(eventoId: string): Promise<boolean>;
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
          formaPagamento: pedidoSdc.formaPagamento,
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

    async travarEvento(eventoId) {
      if (!(await travarLinha(executor, evento, eventoId))) return null;
      const [linha] = await executor
        .select({ id: evento.id, dataFim: fimDoEvento, status: evento.status })
        .from(evento)
        .where(and(eq(evento.id, eventoId), isNull(evento.deletedAt)));
      return linha ? { id: linha.id, dataFim: linha.dataFim, cancelado: linha.status === "CANCELADO" } : null;
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
                ...(mudanca.emissao.formaPagamento !== undefined ? { formaPagamento: mudanca.emissao.formaPagamento } : {}),
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
