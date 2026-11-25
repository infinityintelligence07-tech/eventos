import { and, asc, eq, inArray, sql } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";

import { pessoa } from "@/core/db/schema/core";
import type { Executor } from "@/core/db/database";
import { convocacao, evento, hospedagem, local, pedidoSdc, quarto, quartoOcupante, trechoVoo } from "@/core/db/schema/eventos";

import type { PreferenciaDeHorario, Sentido, SituacaoDoPedido, TipoDoPedido } from "../domain/pedido";
import { fimDoEvento, inicioDoEvento, nomeDaPessoa } from "./comum";

// O que a SDC enxerga (docs/09 §15, decisão do Vitor): SÓ os pedidos de voo e de hospedagem. Estas consultas são
// próprias e escolhem coluna por coluna: nada de reaproveitar os objetos das telas do time, que carregam mais dados.
// Não saem daqui: telefone, e-mail, documento, endereço, função, escala, custos, histórico interno, motivo de
// cancelamento, quem do time pediu ou aprovou, nem ids internos (o pedido é identificado pela referência SDC-…;
// o evento ganha uma chave de agrupamento que só vale dentro da resposta).

export type EventoParaASdc = {
  /** Só para agrupar as linhas na tela ("e1", "e2"…); não é o id do evento. */
  chave: string;
  codigo: string | null;
  nome: string;
  dataInicio: string;
  dataFim: string;
  /** Onde o evento acontece. */
  local: string | null;
  cidade: string | null;
  uf: string | null;
};

export type TrechoParaASdc = {
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
};

type PedidoParaASdc = {
  referencia: string;
  situacao: SituacaoDoPedido;
  evento: EventoParaASdc;
  solicitadoEm: Date;
  /** O que o time escreveu para a SDC. */
  observacaoTime: string | null;
  /** O que a SDC respondeu. */
  observacaoSdc: string | null;
  valorCentavos: number | null;
  /** Quando a compra foi registrada. */
  compradoEm: Date | null;
  /** Preenchido = o time aprovou o pagamento. */
  aprovadoEm: Date | null;
};

export type VooParaASdc = PedidoParaASdc & { passageiro: string; trechos: TrechoParaASdc[] };

export type HospedagemParaASdc = PedidoParaASdc & {
  /** Nulos quando o pedido foi cancelado (a hospedagem deixa de estar ligada a ele). */
  checkIn: string | null;
  checkOut: string | null;
  quartos: { nome: string; capacidade: number; ocupantes: string[] }[];
  /** O hotel que a própria SDC informou. */
  hotel: { nome: string; cidade: string; uf: string; logradouro: string | null; numero: string | null; bairro: string | null } | null;
  numeroReserva: string | null;
  formaPagamento: string | null;
};

const COLUNAS_DO_PEDIDO = {
  pedidoId: pedidoSdc.id,
  referencia: pedidoSdc.referencia,
  situacao: pedidoSdc.situacao,
  eventoId: evento.id,
  eventoCodigo: evento.codigo,
  eventoNome: evento.nome,
  dataInicio: inicioDoEvento,
  dataFim: fimDoEvento,
  localNome: local.nome,
  cidade: local.cidade,
  uf: local.uf,
  solicitadoEm: pedidoSdc.solicitadoEm,
  observacaoTime: pedidoSdc.observacaoTime,
  observacaoSdc: pedidoSdc.observacaoSdc,
  valorCentavos: pedidoSdc.valorCentavos,
  emitidoEm: pedidoSdc.emitidoEm,
  aprovadoEm: pedidoSdc.aprovadoEm,
};

type LinhaDoPedido = {
  pedidoId: string;
  referencia: string;
  situacao: string;
  eventoId: string;
  eventoCodigo: string | null;
  eventoNome: string;
  dataInicio: string;
  dataFim: string;
  localNome: string | null;
  cidade: string | null;
  uf: string | null;
  solicitadoEm: Date;
  observacaoTime: string | null;
  observacaoSdc: string | null;
  valorCentavos: number | null;
  emitidoEm: Date | null;
  aprovadoEm: Date | null;
};

/** Evento terminou a partir deste dia (AAAA-MM-DD), no fuso de São Paulo. */
const eventoDesde = (dia: string) => sql`(${evento.fim} at time zone 'America/Sao_Paulo')::date >= ${dia}::date`;

function paraASdc(linha: LinhaDoPedido, chaves: Map<string, string>): PedidoParaASdc {
  if (!chaves.has(linha.eventoId)) chaves.set(linha.eventoId, `e${chaves.size + 1}`);
  return {
    referencia: linha.referencia,
    // situacao tem CHECK no banco com esses valores.
    situacao: linha.situacao as SituacaoDoPedido,
    evento: {
      chave: chaves.get(linha.eventoId)!,
      codigo: linha.eventoCodigo,
      nome: linha.eventoNome,
      dataInicio: linha.dataInicio,
      dataFim: linha.dataFim,
      local: linha.localNome,
      cidade: linha.cidade,
      uf: linha.uf,
    },
    solicitadoEm: linha.solicitadoEm,
    observacaoTime: linha.observacaoTime,
    observacaoSdc: linha.observacaoSdc,
    valorCentavos: linha.valorCentavos,
    // Em ALTERADO o emitido_em é da compra anterior, que não vale mais.
    compradoEm: linha.situacao === "EMITIDO" ? linha.emitidoEm : null,
    aprovadoEm: linha.aprovadoEm,
  };
}

export function criarRepositorioDaSdc(executor: Executor) {
  return {
    /** Pedidos de voo dos eventos que terminam de `desde` em diante, pela data do evento e depois pelo passageiro. */
    async voos({ desde }: { desde: string }): Promise<VooParaASdc[]> {
      const linhas = await executor
        .select({ ...COLUNAS_DO_PEDIDO, passageiro: nomeDaPessoa })
        .from(pedidoSdc)
        .innerJoin(evento, eq(evento.id, pedidoSdc.eventoId))
        .leftJoin(local, eq(local.id, evento.localId))
        .innerJoin(pessoa, eq(pessoa.id, pedidoSdc.pessoaId))
        .where(and(eq(pedidoSdc.tipo, "VOO"), eventoDesde(desde)))
        .orderBy(asc(inicioDoEvento), asc(evento.id), asc(nomeDaPessoa), asc(pedidoSdc.referencia));
      const trechos = linhas.length
        ? await executor
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
            })
            .from(trechoVoo)
            .where(
              inArray(
                trechoVoo.pedidoId,
                linhas.map((linha) => linha.pedidoId),
              ),
            )
            .orderBy(asc(trechoVoo.sentido))
        : [];
      const chaves = new Map<string, string>();
      return linhas.map((linha) => ({
        ...paraASdc(linha, chaves),
        passageiro: linha.passageiro,
        trechos: trechos
          .filter((trecho) => trecho.pedidoId === linha.pedidoId)
          .map((trecho) => ({
            // sentido e preferencia_horario têm CHECK no banco com esses valores.
            sentido: trecho.sentido as Sentido,
            origemIata: trecho.origemIata,
            destinoIata: trecho.destinoIata,
            dataDesejada: trecho.dataDesejada,
            preferenciaHorario: trecho.preferenciaHorario as PreferenciaDeHorario | null,
            companhia: trecho.companhia,
            numeroVoo: trecho.numeroVoo,
            localizador: trecho.localizador,
            partidaEm: trecho.partidaEm,
            chegadaEm: trecho.chegadaEm,
          })),
      }));
    },

    /** Pedidos de hospedagem dos eventos que terminam de `desde` em diante, com os quartos e os nomes de quem divide. */
    async hospedagens({ desde }: { desde: string }): Promise<HospedagemParaASdc[]> {
      // O hotel que a SDC informou no retorno (outro uso da tabela de locais, além do local do evento).
      const hotel = alias(local, "hotel");
      const linhas = await executor
        .select({
          ...COLUNAS_DO_PEDIDO,
          hospedagemId: hospedagem.id,
          checkIn: hospedagem.checkIn,
          checkOut: hospedagem.checkOut,
          numeroReserva: hospedagem.numeroReserva,
          formaPagamento: pedidoSdc.formaPagamento,
          hotelNome: hotel.nome,
          hotelCidade: hotel.cidade,
          hotelUf: hotel.uf,
          hotelLogradouro: hotel.logradouro,
          hotelNumero: hotel.numero,
          hotelBairro: hotel.bairro,
        })
        .from(pedidoSdc)
        .innerJoin(evento, eq(evento.id, pedidoSdc.eventoId))
        .leftJoin(local, eq(local.id, evento.localId))
        .leftJoin(hospedagem, eq(hospedagem.pedidoId, pedidoSdc.id))
        .leftJoin(hotel, eq(hotel.id, hospedagem.localId))
        .where(and(eq(pedidoSdc.tipo, "HOSPEDAGEM"), eventoDesde(desde)))
        .orderBy(asc(inicioDoEvento), asc(evento.id), asc(pedidoSdc.referencia));

      const hospedagemIds = linhas.flatMap((linha) => (linha.hospedagemId ? [linha.hospedagemId] : []));
      const quartos = hospedagemIds.length
        ? await executor
            .select({ id: quarto.id, hospedagemId: quarto.hospedagemId, nome: quarto.nome, capacidade: quarto.capacidade })
            .from(quarto)
            .where(inArray(quarto.hospedagemId, hospedagemIds))
            .orderBy(asc(quarto.nome))
        : [];
      const ocupantes = quartos.length
        ? await executor
            .select({ quartoId: quartoOcupante.quartoId, nome: nomeDaPessoa })
            .from(quartoOcupante)
            .innerJoin(convocacao, eq(convocacao.id, quartoOcupante.convocacaoId))
            .innerJoin(pessoa, eq(pessoa.id, convocacao.pessoaId))
            .where(
              inArray(
                quartoOcupante.quartoId,
                quartos.map((item) => item.id),
              ),
            )
            .orderBy(asc(nomeDaPessoa))
        : [];

      const chaves = new Map<string, string>();
      return linhas.map((linha) => ({
        ...paraASdc(linha, chaves),
        checkIn: linha.checkIn,
        checkOut: linha.checkOut,
        quartos: quartos
          .filter((item) => item.hospedagemId === linha.hospedagemId)
          .map((item) => ({ nome: item.nome, capacidade: item.capacidade, ocupantes: ocupantes.filter((ocupante) => ocupante.quartoId === item.id).map((ocupante) => ocupante.nome) })),
        hotel:
          linha.hotelNome && linha.hotelCidade && linha.hotelUf
            ? { nome: linha.hotelNome, cidade: linha.hotelCidade, uf: linha.hotelUf, logradouro: linha.hotelLogradouro, numero: linha.hotelNumero, bairro: linha.hotelBairro }
            : null,
        numeroReserva: linha.numeroReserva,
        formaPagamento: linha.formaPagamento,
      }));
    },

    /**
     * A referência que a SDC manda no formulário → o pedido daquele tipo, com o MESMO recorte de período das listas
     * (`desde`): a SDC só grava em pedido que ela enxerga. Nulo = não existe, é de outro tipo ou está fora do recorte.
     */
    async idDoPedido(referencia: string, tipo: TipoDoPedido, { desde }: { desde: string }): Promise<string | null> {
      const [linha] = await executor
        .select({ id: pedidoSdc.id })
        .from(pedidoSdc)
        .innerJoin(evento, eq(evento.id, pedidoSdc.eventoId))
        .where(and(eq(pedidoSdc.referencia, referencia), eq(pedidoSdc.tipo, tipo), eventoDesde(desde)));
      return linha?.id ?? null;
    },
  };
}
