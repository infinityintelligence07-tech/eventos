import { and, asc, count, eq, inArray, isNull, lt, gt, or, sql } from "drizzle-orm";

import { pessoa } from "@/core/db/schema/core";
import type { Executor } from "@/core/db/database";
import { registrarAcao } from "@/core/db/registro-acao";
import { evento, hospedagem, hospedagemPessoa, local, pedidoSdc, pessoaEvento, quarto, quartoOcupante } from "@/core/db/schema/eventos";

import { type OrigemDoHotel, ordenarOrigens, precisaManterComoAvulsa } from "../domain/hotel";
import type { Sexo } from "../domain/rooming";
import type { SituacaoDoPedido } from "../domain/pedido";
import type { QuartoTravado, RepositorioHospedagem } from "../service/hospedagem";
import { fimDoEvento, mesmaVersao, nomeDaPessoa } from "./comum";

export type LocalDeHospedagem = { id: string; nome: string; tipo: "HOTEL" | "APARTAMENTO"; cidade: string; uf: string };

/** checkIn/checkOut só vêm preenchidos quando a pessoa tem período próprio (nulo = o da hospedagem). */
export type OcupanteDoQuarto = { pessoaId: string; nome: string; sexo: Sexo | null; checkIn: string | null; checkOut: string | null };

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
  /** Nulo = hotel ainda não definido: a SDC escolhe e reserva, e ele entra no retorno do pedido. */
  local: { id: string; nome: string; tipo: "HOTEL" | "APARTAMENTO"; endereco: string | null; cidade: string; uf: string } | null;
  pedido: {
    id: string;
    referencia: string;
    situacao: SituacaoDoPedido;
    valorCentavos: number | null;
    formaPagamento: string | null;
    observacaoTime: string | null;
    observacaoSdc: string | null;
    /** Preenchido = pagamento aprovado pelo time. */
    aprovadoEm: Date | null;
    /** Dia em que o pedido foi feito à SDC e dia em que ela reservou (AAAA-MM-DD), informados por quem lança. */
    dataSolicitacao: string;
    dataCompra: string | null;
    atualizadoEm: string;
  } | null;
  checkIn: string;
  checkOut: string;
  numeroReserva: string | null;
  observacao: string | null;
  atualizadoEm: string;
  quartos: QuartoDaHospedagem[];
};

/** Uma pessoa da lista de quem precisa de hotel no evento (a união das origens), com o quarto em que já está. */
export type PessoaParaHospedar = {
  pessoaId: string;
  nome: string;
  sexo: Sexo | null;
  /** De onde veio a necessidade de hotel, na ordem escala, voo, acrescentada. Vazio só em dado antigo fora da regra. */
  origens: OrigemDoHotel[];
  /** Está na escala do evento (convocação principal ativa)? Função e deslocamento vêm de lá. */
  naEscala: boolean;
  funcao: string | null;
  deslocamento: string | null;
  quartoId: string | null;
};

// As três origens de "precisa de hotel" (domain/hotel.ts), em SQL. `e` e `p` são o evento e a pessoa.
const ATIVAS = sql`('SUGERIDA', 'CONVIDADA', 'ACEITA')`;
const daEscala = (e: unknown, p: unknown) => sql`exists (
  select 1 from eventos.convocacao c join eventos.escala es on es.id = c.escala_id
   where es.evento_id = ${e} and es.deleted_at is null and c.pessoa_id = ${p} and c.principal and c.precisa_hotel and c.status in ${ATIVAS})`;
const doVoo = (e: unknown, p: unknown) => sql`exists (
  select 1 from eventos.pedido_sdc v
   where v.evento_id = ${e} and v.pessoa_id = ${p} and v.tipo = 'VOO' and v.situacao <> 'CANCELADO' and v.precisa_hotel)`;
const avulsa = (e: unknown, p: unknown) => sql`exists (select 1 from eventos.hospedagem_pessoa hp where hp.evento_id = ${e} and hp.pessoa_id = ${p})`;

function origensDe(linha: { da_escala: boolean; do_voo: boolean; avulsa: boolean }): OrigemDoHotel[] {
  return ordenarOrigens([...(linha.da_escala ? (["ESCALA"] as const) : []), ...(linha.do_voo ? (["VOO"] as const) : []), ...(linha.avulsa ? (["AVULSA"] as const) : [])]);
}

/**
 * Origens de "precisa de hotel" da pessoa no evento, lidas agora. Usado também pelos fluxos da escala e do voo, na
 * mesma transação, para decidir o que acontece quando uma origem sai.
 */
export async function origensDoHotel(executor: Executor, { eventoId, pessoaId }: { eventoId: string; pessoaId: string }): Promise<OrigemDoHotel[]> {
  const linhas = await executor.execute<{ da_escala: boolean; do_voo: boolean; avulsa: boolean }>(
    sql`select ${daEscala(sql`${eventoId}::uuid`, sql`${pessoaId}::uuid`)} as da_escala, ${doVoo(sql`${eventoId}::uuid`, sql`${pessoaId}::uuid`)} as do_voo, ${avulsa(sql`${eventoId}::uuid`, sql`${pessoaId}::uuid`)} as avulsa`,
  );
  return origensDe(linhas.rows[0]!);
}

/**
 * A pessoa entrou na escala do evento (ou a principal dela mudou): o quarto que ela já tinha se liga à convocação
 * principal e, se ela já estava na lista de hotel por outra origem (voo ou acrescentada), a caixa "Hotel" da escala
 * nasce marcada, para a escala mostrar o que já vale. Chamado pelo fluxo da escala, na mesma transação.
 */
export async function vincularHotelDaPessoa(executor: Executor, { eventoId, pessoaId, instante }: { eventoId: string; pessoaId: string; instante: Date }): Promise<void> {
  const principal = await executor.execute<{ id: string; precisa_hotel: boolean }>(sql`
    select c.id, c.precisa_hotel from eventos.convocacao c join eventos.escala es on es.id = c.escala_id
     where es.evento_id = ${eventoId} and es.deleted_at is null and c.pessoa_id = ${pessoaId} and c.principal and c.status in ${ATIVAS}
     limit 1`);
  const convocacao = principal.rows[0];
  if (!convocacao) return;
  await executor.update(quartoOcupante).set({ convocacaoId: convocacao.id }).where(and(eq(quartoOcupante.eventoId, eventoId), eq(quartoOcupante.pessoaId, pessoaId)));
  if (convocacao.precisa_hotel) return;
  const [ocupante] = await executor.select({ quartoId: quartoOcupante.quartoId }).from(quartoOcupante).where(and(eq(quartoOcupante.eventoId, eventoId), eq(quartoOcupante.pessoaId, pessoaId)));
  const origens = await origensDoHotel(executor, { eventoId, pessoaId });
  if (origens.length === 0 && !ocupante) return;
  await executor.execute(sql`update eventos.convocacao set precisa_hotel = true, atualizado_em = ${instante.toISOString()}::timestamptz where id = ${convocacao.id}`);
}

/**
 * Uma origem de "precisa de hotel" saiu por consequência de outra ação (a pessoa saiu da escala, o pedido de voo foi
 * cancelado). Ninguém é arrancado do quarto por isso: quem está num quarto e ficou sem nenhuma origem passa a constar
 * como acrescentada na Hospedagem (com registro), e o time decide lá se tira. O vínculo com a convocação acompanha a
 * escala (vazio se a pessoa não está mais nela). Devolve true se a pessoa foi mantida assim.
 */
export async function manterNoQuartoSemOrigem(
  executor: Executor,
  { eventoId, pessoaId, usuarioId, instante, motivo }: { eventoId: string; pessoaId: string; usuarioId: string; instante: Date; motivo: "SAIU_DA_ESCALA" | "VOO_CANCELADO" },
): Promise<boolean> {
  const [ocupante] = await executor.select({ quartoId: quartoOcupante.quartoId }).from(quartoOcupante).where(and(eq(quartoOcupante.eventoId, eventoId), eq(quartoOcupante.pessoaId, pessoaId)));
  if (!ocupante) return false;
  const principal = await executor.execute<{ id: string }>(sql`
    select c.id from eventos.convocacao c join eventos.escala es on es.id = c.escala_id
     where es.evento_id = ${eventoId} and es.deleted_at is null and c.pessoa_id = ${pessoaId} and c.principal and c.status in ${ATIVAS}
     limit 1`);
  await executor
    .update(quartoOcupante)
    .set({ convocacaoId: principal.rows[0]?.id ?? null })
    .where(and(eq(quartoOcupante.eventoId, eventoId), eq(quartoOcupante.pessoaId, pessoaId)));
  const origens = await origensDoHotel(executor, { eventoId, pessoaId });
  if (!precisaManterComoAvulsa({ origens, noQuarto: true })) return false;
  await executor.insert(hospedagemPessoa).values({ eventoId, pessoaId, criadoPor: usuarioId, criadoEm: instante }).onConflictDoNothing();
  await registrarAcao(executor, { entidade: "EVENTO", entidadeId: eventoId, eventoId, acao: "HOSPEDE_MANTIDO_NO_QUARTO", usuarioId, emNomeDePessoaId: pessoaId, dados: { motivo, quartoId: ocupante.quartoId } });
  return true;
}

export function criarRepositorioHospedagem(executor: Executor): RepositorioHospedagem & {
  locaisDeHospedagem(): Promise<LocalDeHospedagem[]>;
  hospedagensDoEvento(eventoId: string): Promise<HospedagemDoEvento[]>;
  /** A lista de quem precisa de hotel no evento: a união das origens (escala, voo, acrescentada), uma linha por pessoa. */
  precisamDeHotel(eventoId: string): Promise<PessoaParaHospedar[]>;
  /** Quantas pessoas ativas na escala do evento não estão na lista de quem precisa de hotel (o lembrete "falta alguém?"). */
  naEscalaSemHotel(eventoId: string): Promise<number>;
  /** Eventos (de `desde` em diante) que já têm hospedagem aberta ou gente na lista de hotel pelo voo ou acrescentada. */
  eventosComHotel(filtro: { desde: string }): Promise<string[]>;
  /** Quantas hospedagens o evento tem (com ou sem hotel definido). */
  hospedagensDoEventoQuantas(eventoId: string): Promise<number>;
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
      .select({ quartoId: quartoOcupante.quartoId, pessoaId: quartoOcupante.pessoaId, sexo: pessoaEvento.sexo })
      .from(quartoOcupante)
      .leftJoin(pessoaEvento, eq(pessoaEvento.pessoaId, quartoOcupante.pessoaId))
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
      ocupantes: ocupantes.filter((ocupante) => ocupante.quartoId === item.id).map((ocupante) => ({ pessoaId: ocupante.pessoaId, sexo: ocupante.sexo as Sexo | null })),
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
          formaPagamento: pedidoSdc.formaPagamento,
          observacaoTime: pedidoSdc.observacaoTime,
          observacaoSdc: pedidoSdc.observacaoSdc,
          aprovadoEm: pedidoSdc.aprovadoEm,
          dataSolicitacao: pedidoSdc.dataSolicitacao,
          dataCompra: pedidoSdc.dataCompra,
          pedidoAtualizadoEm: pedidoSdc.atualizadoEm,
          checkIn: hospedagem.checkIn,
          checkOut: hospedagem.checkOut,
          numeroReserva: hospedagem.numeroReserva,
          observacao: hospedagem.observacao,
          atualizadoEm: hospedagem.atualizadoEm,
        })
        .from(hospedagem)
        .leftJoin(local, eq(local.id, hospedagem.localId))
        .leftJoin(pedidoSdc, eq(pedidoSdc.id, hospedagem.pedidoId))
        .where(eq(hospedagem.eventoId, eventoId))
        .orderBy(asc(hospedagem.checkIn), asc(hospedagem.criadoEm));
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
            .select({
              quartoId: quartoOcupante.quartoId,
              pessoaId: pessoa.id,
              nome: nomeDaPessoa,
              sexo: pessoaEvento.sexo,
              checkIn: quartoOcupante.checkIn,
              checkOut: quartoOcupante.checkOut,
            })
            .from(quartoOcupante)
            .innerJoin(pessoa, eq(pessoa.id, quartoOcupante.pessoaId))
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
        local:
          linha.localId && linha.localNome && linha.cidade && linha.uf
            ? { id: linha.localId, nome: linha.localNome, tipo: linha.localTipo as "HOTEL" | "APARTAMENTO", endereco: linha.endereco, cidade: linha.cidade, uf: linha.uf }
            : null,
        pedido:
          linha.pedidoId && linha.referencia && linha.situacao && linha.pedidoAtualizadoEm
            ? {
                id: linha.pedidoId,
                referencia: linha.referencia,
                situacao: linha.situacao as SituacaoDoPedido,
                valorCentavos: linha.valorCentavos,
                formaPagamento: linha.formaPagamento,
                observacaoTime: linha.observacaoTime,
                observacaoSdc: linha.observacaoSdc,
                aprovadoEm: linha.aprovadoEm,
                dataSolicitacao: linha.dataSolicitacao ?? linha.pedidoAtualizadoEm.toISOString().slice(0, 10),
                dataCompra: linha.dataCompra,
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
              .map((ocupante) => ({
                pessoaId: ocupante.pessoaId,
                nome: ocupante.nome,
                sexo: ocupante.sexo as Sexo | null,
                checkIn: ocupante.checkIn,
                checkOut: ocupante.checkOut,
              })),
          })),
      }));
    },

    async precisamDeHotel(eventoId) {
      // Quem já está num quarto do evento entra na lista mesmo sem origem (não some da tela por dado fora da regra).
      const linhas = await executor.execute<{
        pessoa_id: string;
        nome: string;
        sexo: string | null;
        da_escala: boolean;
        do_voo: boolean;
        avulsa: boolean;
        na_escala: boolean;
        funcao: string | null;
        deslocamento: string | null;
        quarto_id: string | null;
      }>(sql`
        with lista as (
          select c.pessoa_id from eventos.convocacao c join eventos.escala es on es.id = c.escala_id
           where es.evento_id = ${eventoId} and es.deleted_at is null and c.principal and c.precisa_hotel and c.status in ${ATIVAS}
          union
          select v.pessoa_id from eventos.pedido_sdc v
           where v.evento_id = ${eventoId} and v.tipo = 'VOO' and v.situacao <> 'CANCELADO' and v.precisa_hotel and v.pessoa_id is not null
          union
          select hp.pessoa_id from eventos.hospedagem_pessoa hp where hp.evento_id = ${eventoId}
          union
          select o.pessoa_id from eventos.quarto_ocupante o where o.evento_id = ${eventoId}
        )
        select p.id as pessoa_id, coalesce(p.nome_social, p.nome_completo) as nome, pe.sexo,
               ${daEscala(sql`${eventoId}::uuid`, sql`p.id`)} as da_escala,
               ${doVoo(sql`${eventoId}::uuid`, sql`p.id`)} as do_voo,
               ${avulsa(sql`${eventoId}::uuid`, sql`p.id`)} as avulsa,
               principal.id is not null as na_escala, principal.funcao, principal.deslocamento,
               o.quarto_id
          from lista
          join core.pessoa p on p.id = lista.pessoa_id
          left join eventos.pessoa_evento pe on pe.pessoa_id = p.id
          left join eventos.quarto_ocupante o on o.evento_id = ${eventoId} and o.pessoa_id = p.id
          left join lateral (
            select c.id, f.nome as funcao, c.deslocamento
              from eventos.convocacao c
              join eventos.escala es on es.id = c.escala_id
              left join eventos.funcao f on f.id = es.funcao_id
             where es.evento_id = ${eventoId} and es.deleted_at is null and c.pessoa_id = p.id and c.principal and c.status in ${ATIVAS}
             limit 1
          ) principal on true
         order by coalesce(p.nome_social, p.nome_completo), p.id`);
      return linhas.rows.map((linha) => ({
        pessoaId: linha.pessoa_id,
        nome: linha.nome,
        // sexo tem CHECK no banco (F, M ou nulo).
        sexo: linha.sexo as Sexo | null,
        origens: origensDe(linha),
        naEscala: linha.na_escala,
        funcao: linha.funcao,
        deslocamento: linha.deslocamento,
        quartoId: linha.quarto_id,
      }));
    },

    async naEscalaSemHotel(eventoId) {
      const linhas = await executor.execute<{ total: number }>(sql`
        select count(*)::int as total
          from eventos.convocacao c join eventos.escala es on es.id = c.escala_id
         where es.evento_id = ${eventoId} and es.deleted_at is null and c.principal and c.status in ${ATIVAS} and not c.precisa_hotel
           and not ${doVoo(sql`${eventoId}::uuid`, sql`c.pessoa_id`)} and not ${avulsa(sql`${eventoId}::uuid`, sql`c.pessoa_id`)}`);
      return linhas.rows[0]?.total ?? 0;
    },

    async eventosComHotel({ desde }) {
      const linhas = await executor.execute<{ id: string }>(sql`
        select ev.id
          from eventos.evento ev
         where ev.deleted_at is null and (ev.fim at time zone 'America/Sao_Paulo')::date >= ${desde}::date
           and (exists (select 1 from eventos.hospedagem h where h.evento_id = ev.id)
             or exists (select 1 from eventos.hospedagem_pessoa hp where hp.evento_id = ev.id)
             or exists (select 1 from eventos.pedido_sdc v where v.evento_id = ev.id and v.tipo = 'VOO' and v.situacao <> 'CANCELADO' and v.precisa_hotel))`);
      return linhas.rows.map((linha) => linha.id);
    },

    async hospedagensDoEventoQuantas(eventoId) {
      const [linha] = await executor.select({ total: count() }).from(hospedagem).where(eq(hospedagem.eventoId, eventoId));
      return linha?.total ?? 0;
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
        .values({ eventoId, localId: localId ?? null, checkIn, checkOut, observacao: observacao ?? null, criadoPor: usuarioId, criadoEm: instante, atualizadoEm: instante })
        .returning({ id: hospedagem.id });
      return linha!.id;
    },

    async travarHospedagem(hospedagemId) {
      const [linha] = await executor
        .select({
          id: hospedagem.id,
          eventoId: hospedagem.eventoId,
          localId: hospedagem.localId,
          pedidoId: hospedagem.pedidoId,
          numeroReserva: hospedagem.numeroReserva,
          checkIn: hospedagem.checkIn,
          checkOut: hospedagem.checkOut,
        })
        .from(hospedagem)
        .where(eq(hospedagem.id, hospedagemId))
        .for("update");
      return linha ?? null;
    },

    async periodosForaDe(hospedagemId, { checkIn, checkOut }) {
      const linhas = await executor
        .select({ pessoaId: quartoOcupante.pessoaId })
        .from(quartoOcupante)
        .innerJoin(quarto, eq(quarto.id, quartoOcupante.quartoId))
        .where(and(eq(quarto.hospedagemId, hospedagemId), or(lt(quartoOcupante.checkIn, checkIn), gt(quartoOcupante.checkOut, checkOut))));
      return linhas.length;
    },

    async atualizarHospedagem({ hospedagemId, localId, checkIn, checkOut, observacao, atualizadoEm }, instante) {
      const alteradas = await executor
        .update(hospedagem)
        .set({ localId: localId ?? null, checkIn, checkOut, observacao: observacao ?? null, atualizadoEm: instante })
        .where(and(eq(hospedagem.id, hospedagemId), mesmaVersao(hospedagem.atualizadoEm, atualizadoEm)))
        .returning({ id: hospedagem.id });
      return alteradas.length === 1;
    },

    async quartosDaHospedagem(hospedagemId) {
      const [linha] = await executor.select({ total: count() }).from(quarto).where(eq(quarto.hospedagemId, hospedagemId));
      return linha?.total ?? 0;
    },

    async removerHospedagem(hospedagemId) {
      await executor.delete(hospedagem).where(eq(hospedagem.id, hospedagemId));
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

    async eventoParaHospedar(eventoId) {
      const [linha] = await executor
        .select({ id: evento.id, dataFim: fimDoEvento, status: evento.status })
        .from(evento)
        .where(and(eq(evento.id, eventoId), isNull(evento.deletedAt)));
      return linha ? { id: linha.id, dataFim: linha.dataFim, cancelado: linha.status === "CANCELADO" } : null;
    },

    async travarPessoaNoEvento(eventoId, pessoaId) {
      // A linha de pessoa_evento serializa o que muda o hotel desta pessoa (quarto e origens).
      const [travada] = await executor.select({ pessoaId: pessoaEvento.pessoaId, sexo: pessoaEvento.sexo }).from(pessoaEvento).where(eq(pessoaEvento.pessoaId, pessoaId)).for("update");
      if (!travada) return null;
      const [dados] = await executor.select({ nome: nomeDaPessoa, ativo: pessoa.ativo, apagada: pessoa.deletedAt }).from(pessoa).where(eq(pessoa.id, pessoaId));
      if (!dados) return null;
      const [ocupante] = await executor
        .select({ quartoId: quartoOcupante.quartoId })
        .from(quartoOcupante)
        .where(and(eq(quartoOcupante.eventoId, eventoId), eq(quartoOcupante.pessoaId, pessoaId)));
      const principal = await executor.execute<{ id: string }>(sql`
        select c.id from eventos.convocacao c join eventos.escala es on es.id = c.escala_id
         where es.evento_id = ${eventoId} and es.deleted_at is null and c.pessoa_id = ${pessoaId} and c.principal and c.status in ${ATIVAS}
         limit 1`);
      return {
        pessoaId,
        nome: dados.nome,
        sexo: travada.sexo as Sexo | null,
        staffAtivo: dados.ativo === true && dados.apagada === null,
        origens: await origensDoHotel(executor, { eventoId, pessoaId }),
        quartoId: ocupante?.quartoId ?? null,
        convocacaoId: principal.rows[0]?.id ?? null,
      };
    },

    async semQuartoDoEvento(eventoId) {
      const lista = await this.precisamDeHotel(eventoId);
      return lista.filter((item) => item.quartoId === null && item.origens.length > 0).map((item) => ({ pessoaId: item.pessoaId, sexo: item.sexo }));
    },

    async porOcupante(quartoId, { eventoId, pessoaId, convocacaoId }) {
      // Mudar de quarto na mesma hospedagem mantém o período próprio da pessoa; em outra hospedagem ele não vale mais.
      const [anterior] = await executor
        .select({ checkIn: quartoOcupante.checkIn, checkOut: quartoOcupante.checkOut, hospedagemId: quarto.hospedagemId })
        .from(quartoOcupante)
        .innerJoin(quarto, eq(quarto.id, quartoOcupante.quartoId))
        .where(and(eq(quartoOcupante.eventoId, eventoId), eq(quartoOcupante.pessoaId, pessoaId)));
      const [destino] = await executor.select({ hospedagemId: quarto.hospedagemId }).from(quarto).where(eq(quarto.id, quartoId));
      const mantem = anterior !== undefined && destino !== undefined && anterior.hospedagemId === destino.hospedagemId;
      await executor.delete(quartoOcupante).where(and(eq(quartoOcupante.eventoId, eventoId), eq(quartoOcupante.pessoaId, pessoaId)));
      await executor.insert(quartoOcupante).values({ quartoId, eventoId, pessoaId, convocacaoId, checkIn: mantem ? anterior.checkIn : null, checkOut: mantem ? anterior.checkOut : null });
    },

    async definirPeriodoDoOcupante(quartoId, pessoaId, periodo) {
      const alterados = await executor
        .update(quartoOcupante)
        .set({ checkIn: periodo?.checkIn ?? null, checkOut: periodo?.checkOut ?? null })
        .where(and(eq(quartoOcupante.quartoId, quartoId), eq(quartoOcupante.pessoaId, pessoaId)))
        .returning({ pessoaId: quartoOcupante.pessoaId });
      return alterados.length === 1;
    },

    async tirarOcupante(quartoId, pessoaId) {
      const removidos = await executor
        .delete(quartoOcupante)
        .where(and(eq(quartoOcupante.quartoId, quartoId), eq(quartoOcupante.pessoaId, pessoaId)))
        .returning({ pessoaId: quartoOcupante.pessoaId });
      return removidos.length === 1;
    },

    async incluirAvulsa({ eventoId, pessoaId, usuarioId, instante }) {
      const incluidas = await executor
        .insert(hospedagemPessoa)
        .values({ eventoId, pessoaId, criadoPor: usuarioId, criadoEm: instante })
        .onConflictDoNothing()
        .returning({ pessoaId: hospedagemPessoa.pessoaId });
      return incluidas.length === 1;
    },

    async removerAvulsa(eventoId, pessoaId) {
      const removidas = await executor
        .delete(hospedagemPessoa)
        .where(and(eq(hospedagemPessoa.eventoId, eventoId), eq(hospedagemPessoa.pessoaId, pessoaId)))
        .returning({ pessoaId: hospedagemPessoa.pessoaId });
      return removidas.length === 1;
    },

    async registrarDoEvento({ eventoId, pessoaId, acao, dados, usuarioId }) {
      // Sem hospedagem aberta ainda: o registro é do evento, com a pessoa em `emNomeDePessoaId`.
      await registrarAcao(executor, { entidade: "EVENTO", entidadeId: eventoId, eventoId, acao, usuarioId, emNomeDePessoaId: pessoaId, dados });
    },

    async registrar({ hospedagemId, eventoId, acao, comentario, dados, usuarioId }) {
      await registrarAcao(executor, { entidade: "HOSPEDAGEM", entidadeId: hospedagemId, eventoId, acao, comentario, usuarioId, dados });
    },
  };
}
