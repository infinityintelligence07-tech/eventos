import { and, asc, desc, eq, inArray, isNull, ne, or, sql } from "drizzle-orm";

import type { Executor } from "@/core/db/database";
import { type AutorDaAcao, autoriaDe, registrarAcao } from "@/core/db/registro-acao";
import { evento, hospedagem, local, registroAcao } from "@/core/db/schema/eventos";

import type { AjustarLocalDoIamControl, OrigemDoLocal, SalvarLocal, TipoDeLocal, UsoDoLocal } from "../domain/local";

// eventos.local: a base vem do IAM Control (a sincronização de turmas cria e mantém os locais de lá, origem
// IAM_CONTROL); o time cadastra à mão o que não existe lá (hotéis que a SDC reserva, apartamentos) e completa o que é
// do Eventos. Arquivar = deleted_at; o local some das listas, mas eventos antigos continuam apontando.

export type DadosDoLocal = Omit<SalvarLocal, "localId">;

export type LocalCadastrado = DadosDoLocal & { id: string; origem: OrigemDoLocal; uso: UsoDoLocal; atualizadoEm: Date };

// Nomes qualificados à mão: num select de uma tabela só o Drizzle escreve as colunas sem a tabela, e a subconsulta
// compararia a coluna dela mesma.
const usoEmEventos = sql<number>`(select count(*) from ${evento} e where e.local_id = "local"."id" and e.deleted_at is null)::int`;
const usoEmHospedagens = sql<number>`(select count(*) from ${hospedagem} h where h.local_id = "local"."id")::int`;

/**
 * Comparação de nome e cidade: sem maiúsculas, sem acentos e com um espaço só entre as palavras (a mesma regra de
 * `textoParaComparar`, no domínio). As maiúsculas acentuadas entram na troca porque `lower()` só as converte quando o
 * banco tem localidade (num banco com LC_CTYPE "C", como o local, `lower('SÃO')` devolve 'sÃo').
 */
const normalizado = (valor: unknown) =>
  sql`translate(lower(regexp_replace(btrim(${valor}), '[[:space:]]+', ' ', 'g')), 'áàâãäéèêëíìîïóòôõöúùûüçñÁÀÂÃÄÉÈÊËÍÌÎÏÓÒÔÕÖÚÙÛÜÇÑ', 'aaaaaeeeeiiiiooooouuuucnaaaaaeeeeiiiiooooouuuucn')`;

/** O que a SDC informa do hotel (o resto do cadastro é do time, em Configurações › Locais e hotéis). */
export type HotelInformado = Pick<DadosDoLocal, "nome" | "cidade" | "uf" | "logradouro" | "numero" | "bairro">;

const COLUNAS = {
  id: local.id,
  nome: local.nome,
  tipo: local.tipo,
  cep: local.cep,
  logradouro: local.logradouro,
  numero: local.numero,
  complemento: local.complemento,
  bairro: local.bairro,
  cidade: local.cidade,
  uf: local.uf,
  lat: local.lat,
  lng: local.lng,
  capacidade: local.capacidade,
  origem: local.origem,
  atualizadoEm: local.atualizadoEm,
  eventos: usoEmEventos,
  hospedagens: usoEmHospedagens,
};

type Linha = { tipo: string; origem: string; eventos: number; hospedagens: number } & Omit<LocalCadastrado, "tipo" | "origem" | "uso">;

function comoLocal({ eventos, hospedagens, tipo, origem, ...linha }: Linha): LocalCadastrado {
  // tipo e origem têm CHECK no banco com os valores de TipoDeLocal e OrigemDoLocal.
  return { ...linha, tipo: tipo as TipoDeLocal, origem: origem as OrigemDoLocal, uso: { eventos, hospedagens } };
}

const escaparLike = (texto: string) => texto.replace(/[\\%_]/g, (caractere) => `\\${caractere}`);

export function criarRepositorioLocal(executor: Executor) {
  return {
    async listar({ tipo, origem, busca }: { tipo?: TipoDeLocal; origem?: OrigemDoLocal; busca?: string }): Promise<LocalCadastrado[]> {
      const padrao = busca ? `%${escaparLike(busca)}%` : null;
      const linhas = await executor
        .select(COLUNAS)
        .from(local)
        .where(
          and(
            isNull(local.deletedAt),
            tipo ? eq(local.tipo, tipo) : undefined,
            origem ? eq(local.origem, origem) : undefined,
            padrao ? or(sql`${local.nome} ilike ${padrao}`, sql`${local.cidade} ilike ${padrao}`) : undefined,
          ),
        )
        .orderBy(asc(local.uf), asc(local.cidade), asc(local.nome));
      return linhas.map(comoLocal);
    },

    async local(localId: string): Promise<LocalCadastrado | null> {
      const [linha] = await executor
        .select(COLUNAS)
        .from(local)
        .where(and(eq(local.id, localId), isNull(local.deletedAt)));
      return linha ? comoLocal(linha) : null;
    },

    /** Mesmo tipo, nome e cidade (sem diferenciar maiúsculas): a sincronização usa essa chave para achar o local de evento. */
    async existeComMesmoNome({ tipo, nome, cidade, uf }: Pick<DadosDoLocal, "tipo" | "nome" | "cidade" | "uf">, excetoId?: string): Promise<boolean> {
      const [linha] = await executor
        .select({ id: local.id })
        .from(local)
        .where(
          and(
            isNull(local.deletedAt),
            eq(local.tipo, tipo),
            eq(local.uf, uf),
            sql`lower(${local.nome}) = lower(${nome})`,
            sql`lower(${local.cidade}) = lower(${cidade})`,
            excetoId ? ne(local.id, excetoId) : undefined,
          ),
        )
        .limit(1);
      return linha !== undefined;
    },

    /**
     * Local vindo do IAM Control com este nome nesta cidade (comparação normalizada), de qualquer tipo que o IAM Control
     * tem (local de evento ou hotel). Quem cadastra à mão um lugar que já veio de lá é mandado para esse cadastro.
     */
    async localDoIamControlComNome({ nome, cidade, uf }: Pick<DadosDoLocal, "nome" | "cidade" | "uf">, excetoId?: string): Promise<{ id: string; tipo: TipoDeLocal } | null> {
      const [linha] = await executor
        .select({ id: local.id, tipo: local.tipo })
        .from(local)
        .where(
          and(
            isNull(local.deletedAt),
            eq(local.origem, "IAM_CONTROL"),
            inArray(local.tipo, ["EVENTO", "HOTEL"]),
            eq(local.uf, uf),
            sql`${normalizado(local.nome)} = ${normalizado(nome)}`,
            sql`${normalizado(local.cidade)} = ${normalizado(cidade)}`,
            excetoId ? ne(local.id, excetoId) : undefined,
          ),
        )
        // Hotel antes de local de evento: se o lugar já está marcado como hotel, é esse que a hospedagem usa.
        .orderBy(desc(local.tipo), asc(local.criadoEm))
        .limit(1);
      return linha ? { id: linha.id, tipo: linha.tipo as TipoDeLocal } : null;
    },

    /** Hotel ativo com este nome nesta cidade (comparação normalizada), para não cadastrar o mesmo hotel duas vezes. */
    async hotelComNome({ nome, cidade, uf }: Pick<DadosDoLocal, "nome" | "cidade" | "uf">): Promise<string | null> {
      const [linha] = await executor
        .select({ id: local.id })
        .from(local)
        .where(and(isNull(local.deletedAt), eq(local.tipo, "HOTEL"), eq(local.uf, uf), sql`${normalizado(local.nome)} = ${normalizado(nome)}`, sql`${normalizado(local.cidade)} = ${normalizado(cidade)}`))
        .orderBy(asc(local.criadoEm))
        .limit(1);
      return linha?.id ?? null;
    },

    /**
     * O hotel que a própria SDC cadastrou para a hospedagem deste pedido, se só essa hospedagem o usa. É o que ela pode
     * corrigir no lugar de cadastrar outro (cada correção de nome criaria um registro novo em Locais e hotéis).
     * Nulo = o hotel do pedido veio do time, é usado em outra hospedagem ou evento, ou ainda não há hotel.
     */
    async hotelDaSdcDoPedido(pedidoId: string): Promise<(HotelInformado & { id: string }) | null> {
      const [linha] = await executor
        .select({ id: local.id, nome: local.nome, cidade: local.cidade, uf: local.uf, logradouro: local.logradouro, numero: local.numero, bairro: local.bairro })
        .from(hospedagem)
        .innerJoin(local, eq(local.id, hospedagem.localId))
        .where(
          and(
            eq(hospedagem.pedidoId, pedidoId),
            eq(local.tipo, "HOTEL"),
            // Hotel que a sincronização ligou ao IAM Control deixa de ser corrigível pela SDC: nome e endereço vêm de lá.
            eq(local.origem, "EVENTOS"),
            isNull(local.deletedAt),
            sql`exists (select 1 from ${registroAcao} r where r.entidade = 'LOCAL' and r.entidade_id = "local"."id" and r.acao = 'LOCAL_CRIADO' and r.origem = 'SDC')`,
            sql`not exists (select 1 from ${hospedagem} outra where outra.local_id = "local"."id" and outra.pedido_id is distinct from ${pedidoId})`,
            sql`not exists (select 1 from ${evento} e where e.local_id = "local"."id")`,
          ),
        );
      return linha ?? null;
    },

    /** Corrige só o que a SDC informa (nome, cidade, UF e endereço); o resto do cadastro fica como o time deixou. */
    async corrigirHotelInformado(localId: string, dados: HotelInformado, instante: Date): Promise<boolean> {
      const alterados = await executor
        .update(local)
        .set({ nome: dados.nome, cidade: dados.cidade, uf: dados.uf, logradouro: dados.logradouro, numero: dados.numero, bairro: dados.bairro, atualizadoEm: instante })
        .where(and(eq(local.id, localId), eq(local.tipo, "HOTEL"), eq(local.origem, "EVENTOS"), isNull(local.deletedAt)))
        .returning({ id: local.id });
      return alterados.length === 1;
    },

    async criar(dados: DadosDoLocal, instante: Date): Promise<string> {
      const [criado] = await executor
        .insert(local)
        .values({ ...dados, criadoEm: instante, atualizadoEm: instante })
        .returning({ id: local.id });
      return criado!.id;
    },

    /** Só cadastro do Eventos: o que veio do IAM Control muda por `ajustarDoIamControl`. false = não existe, foi arquivado ou veio do IAM Control. */
    async alterar(localId: string, dados: DadosDoLocal, instante: Date): Promise<boolean> {
      const alterados = await executor
        .update(local)
        .set({ ...dados, atualizadoEm: instante })
        .where(and(eq(local.id, localId), eq(local.origem, "EVENTOS"), isNull(local.deletedAt)))
        .returning({ id: local.id });
      return alterados.length === 1;
    },

    /** No local do IAM Control só muda o que é do Eventos. false = não existe, foi arquivado ou não veio do IAM Control. */
    async ajustarDoIamControl(localId: string, dados: Omit<AjustarLocalDoIamControl, "localId">, instante: Date): Promise<boolean> {
      const alterados = await executor
        .update(local)
        .set({ tipo: dados.tipo, complemento: dados.complemento, lat: dados.lat, lng: dados.lng, capacidade: dados.capacidade, atualizadoEm: instante })
        .where(and(eq(local.id, localId), eq(local.origem, "IAM_CONTROL"), isNull(local.deletedAt)))
        .returning({ id: local.id });
      return alterados.length === 1;
    },

    /** Local de evento do IAM Control que o time informou como o hotel da reserva: passa a hotel, para a hospedagem poder usá-lo. */
    async marcarComoHotel(localId: string, instante: Date): Promise<boolean> {
      const alterados = await executor
        .update(local)
        .set({ tipo: "HOTEL", atualizadoEm: instante })
        .where(and(eq(local.id, localId), eq(local.tipo, "EVENTO"), eq(local.origem, "IAM_CONTROL"), isNull(local.deletedAt)))
        .returning({ id: local.id });
      return alterados.length === 1;
    },

    /** Trava o local (FOR UPDATE) e conta onde ele é usado. Nulo = não existe ou já foi arquivado. */
    async travarUso(localId: string): Promise<UsoDoLocal | null> {
      const [travado] = await executor
        .select({ id: local.id })
        .from(local)
        .where(and(eq(local.id, localId), isNull(local.deletedAt)))
        .for("update");
      if (!travado) return null;
      const [uso] = await executor.select({ eventos: usoEmEventos, hospedagens: usoEmHospedagens }).from(local).where(eq(local.id, localId));
      return uso ?? { eventos: 0, hospedagens: 0 };
    },

    async arquivar(localId: string, instante: Date): Promise<void> {
      await executor.update(local).set({ deletedAt: instante, atualizadoEm: instante }).where(eq(local.id, localId));
    },

    /** Endereço de local de evento ou hotel não é dado pessoal: as mudanças vão com os valores. */
    async registrar(
      localId: string,
      { acao, dados, ...autor }: { acao: "LOCAL_CRIADO" | "LOCAL_ALTERADO" | "LOCAL_ARQUIVADO"; dados: Record<string, unknown> } & AutorDaAcao,
    ): Promise<void> {
      // O autor é alguém do time ou, quando o hotel nasce do retorno de uma hospedagem, alguém da SDC.
      await registrarAcao(executor, { ...autoriaDe(autor), entidade: "LOCAL", entidadeId: localId, acao, dados });
    },
  };
}

export type RepositorioLocal = ReturnType<typeof criarRepositorioLocal>;
