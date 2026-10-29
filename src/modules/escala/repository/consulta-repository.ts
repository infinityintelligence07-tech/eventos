import { and, asc, desc, eq, inArray, isNull, sql } from "drizzle-orm";

import { pessoa, polo, usuario } from "@/core/db/schema/core";
import type { Executor } from "@/core/db/database";
import { convocacao, escala, evento, funcao, pessoaFuncao, registroAcao, tipoEvento } from "@/core/db/schema/eventos";

import type { StatusConvocacao, StatusEscala } from "../domain/convite";
import type { LinhaDaMontagem } from "../domain/montagem";
import { nomeDaPessoa } from "./montagem-repository";

// Leituras das telas da escala (Montar escala, lista, aprovação, Início). Lê também pessoa_evento,
// pessoa_funcao, disponibilidade e pedido_sdc só para consulta (docs/07 §2.3).

const diaEmSaoPaulo = (coluna: typeof evento.inicio | typeof evento.fim) =>
  sql<string>`to_char(${coluna} at time zone 'America/Sao_Paulo', 'YYYY-MM-DD')`;

const nomeDoUsuario = sql<string | null>`coalesce(${usuario.nomeUsuario}, ${usuario.email})`;

export type EventoDaMontagem = {
  id: string;
  codigo: string | null;
  nome: string;
  status: string;
  statusEscala: StatusEscala;
  tipoSigla: string | null;
  regraVagas: unknown;
  expectativaPublico: number | null;
  pessoasNaFila: number | null;
  dataInicio: string;
  dataFim: string;
  aprovadoEm: Date | null;
  aprovadoPor: string | null;
};

export type LinhaDaTela = LinhaDaMontagem & {
  funcaoId: string | null;
  horaInicio: string;
  horaFim: string;
  confirmadaEm: Date | null;
  confirmadaPor: string | null;
};

export type ConvocacaoDaTela = {
  id: string;
  escalaId: string;
  pessoaId: string;
  nome: string;
  status: StatusConvocacao;
  nivel: "HABILITADO" | "TRAINEE" | null;
  convidadaEm: Date | null;
  respondidaEm: Date | null;
  motivoRecusa: string | null;
  registradoPor: string | null;
  deslocamento: string | null;
  distanciaKm: number | null;
  conflitos: string[];
};

export type RegistroDaEscala = {
  acao: string;
  statusDe: string | null;
  statusPara: string | null;
  comentario: string | null;
  usuario: string | null;
  criadoEm: Date;
};

export type CandidatoDoBanco = {
  pessoaId: string;
  nome: string;
  disponivel: boolean | null;
  nivel: "HABILITADO" | "TRAINEE" | null;
  lat: number | null;
  lng: number | null;
  convocacoesUltimos90Dias: number;
  ultimaData: string | null;
  ultimoEvento: string | null;
  diasDesdeUltima: number | null;
  jaNoEvento: boolean;
  conflitos: string[];
};

export type LinhaParaSugestao = {
  escalaId: string;
  eventoId: string;
  funcaoId: string | null;
  nomeDaFuncao: string;
  quantidade: number;
  ativas: number;
  localLat: number | null;
  localLng: number | null;
  temEnquete: boolean;
  dataInicio: string;
  dataFim: string;
};

export type EventoDaLista = {
  id: string;
  codigo: string | null;
  nome: string;
  tipoSigla: string;
  tipoNome: string;
  edicao: string | null;
  poloCodigo: string | null;
  dataInicio: string;
  dataFim: string;
  status: string;
  statusEscala: StatusEscala;
  vagas: number;
  preenchidas: number;
  confirmaram: number;
  aguardando: number;
  naoPodem: number;
  /** Último envio para aprovação e última devolução (registro_acao). */
  enviadaEm: Date | null;
  devolvidaEm: Date | null;
  comentarioDaDevolucao: string | null;
};

export type SituacaoDoEventoParaAtencao = {
  eventoId: string;
  disseramQueNaoPodem: number;
  semRespostaNaEnquete: number;
  vooSemPedido: number;
  trainees: { funcao: string; quantidade: number }[];
};

export type SemResposta = { convocacaoId: string; nome: string; eventoId: string; codigo: string | null; funcao: string; convidadaEm: Date };

const numero = (valor: string | number | null): number | null => (valor === null ? null : Number(valor));

export function criarConsultaDaEscala(executor: Executor) {
  return {
    async eventoDaMontagem(eventoId: string): Promise<EventoDaMontagem | null> {
      const [linha] = await executor
        .select({
          id: evento.id,
          codigo: evento.codigo,
          nome: evento.nome,
          status: evento.status,
          statusEscala: evento.statusEscala,
          tipoSigla: tipoEvento.sigla,
          regraVagas: tipoEvento.regraVagas,
          expectativaPublico: evento.expectativaPublico,
          pessoasNaFila: evento.pessoasNaFila,
          dataInicio: diaEmSaoPaulo(evento.inicio),
          dataFim: diaEmSaoPaulo(evento.fim),
          aprovadoEm: evento.aprovadoEm,
          aprovadoPor: nomeDoUsuario,
        })
        .from(evento)
        .leftJoin(tipoEvento, eq(tipoEvento.id, evento.tipoEventoId))
        .leftJoin(usuario, eq(usuario.id, evento.aprovadoPor))
        .where(and(eq(evento.id, eventoId), isNull(evento.deletedAt)));
      return linha ? { ...linha, statusEscala: linha.statusEscala as StatusEscala, regraVagas: linha.regraVagas ?? {} } : null;
    },

    async linhasDaTela(eventoId: string): Promise<LinhaDaTela[]> {
      const linhas = await executor
        .select({
          id: escala.id,
          funcaoId: escala.funcaoId,
          funcao: funcao.codigo,
          nomeDaFuncao: sql<string>`coalesce(${funcao.nome}, 'Função sem nome')`,
          data: sql<string>`${escala.data}::text`,
          horaInicio: escala.horaInicio,
          horaFim: escala.horaFim,
          quantidade: escala.quantidadeVagas,
          origem: escala.origem,
          confirmada: sql<boolean>`${escala.confirmadaEm} is not null`,
          confirmadaEm: escala.confirmadaEm,
          confirmadaPor: nomeDoUsuario,
          ativas: sql<number>`(select count(*)::int from ${convocacao}
            where ${convocacao.escalaId} = ${escala.id} and ${convocacao.status} in ('SUGERIDA', 'CONVIDADA', 'ACEITA'))`,
        })
        .from(escala)
        .leftJoin(funcao, eq(funcao.id, escala.funcaoId))
        .leftJoin(usuario, eq(usuario.id, escala.confirmadaPor))
        .where(and(eq(escala.eventoId, eventoId), isNull(escala.deletedAt)))
        .orderBy(escala.data, escala.criadoEm, escala.id);
      return linhas.map((linha) => ({ ...linha, origem: linha.origem as LinhaDaTela["origem"] }));
    },

    async convocacoesDaTela(eventoId: string): Promise<ConvocacaoDaTela[]> {
      const resultado = await executor.execute<{
        id: string;
        escala_id: string;
        pessoa_id: string;
        nome: string;
        status: string;
        nivel: string | null;
        convidada_em: string | null;
        respondida_em: string | null;
        motivo_recusa: string | null;
        registrado_por: string | null;
        deslocamento: string | null;
        distancia_km: string | null;
        conflitos: string[] | null;
      }>(sql`
        select c.id, c.escala_id, c.pessoa_id, coalesce(p.nome_social, p.nome_completo) as nome, c.status, pf.nivel,
               c.convidada_em, c.respondida_em, c.motivo_recusa, coalesce(u.nome_usuario, u.email) as registrado_por,
               c.deslocamento, c.distancia_km,
               (select array_agg(distinct coalesce(outro.codigo, outro.nome))
                  from ${convocacao} c2
                  join ${escala} e2 on e2.id = c2.escala_id and e2.deleted_at is null
                  join ${evento} outro on outro.id = e2.evento_id and outro.deleted_at is null and outro.status <> 'CANCELADO'
                 where c2.pessoa_id = c.pessoa_id and c2.status in ('SUGERIDA', 'CONVIDADA', 'ACEITA')
                   and outro.id <> ev.id and outro.inicio <= ev.fim and outro.fim >= ev.inicio) as conflitos
          from ${convocacao} c
          join ${escala} e on e.id = c.escala_id and e.deleted_at is null
          join ${evento} ev on ev.id = e.evento_id
          join ${pessoa} p on p.id = c.pessoa_id
          left join ${pessoaFuncao} pf on pf.pessoa_id = c.pessoa_id and pf.funcao_id = e.funcao_id
          left join ${usuario} u on u.id = c.registrado_por
         where e.evento_id = ${eventoId}
         order by c.criado_em, c.id`);
      return resultado.rows.map((linha) => ({
        id: linha.id,
        escalaId: linha.escala_id,
        pessoaId: linha.pessoa_id,
        nome: linha.nome,
        status: linha.status as StatusConvocacao,
        nivel: linha.nivel as ConvocacaoDaTela["nivel"],
        convidadaEm: linha.convidada_em ? new Date(linha.convidada_em) : null,
        respondidaEm: linha.respondida_em ? new Date(linha.respondida_em) : null,
        motivoRecusa: linha.motivo_recusa,
        registradoPor: linha.registrado_por,
        deslocamento: linha.deslocamento,
        distanciaKm: numero(linha.distancia_km),
        conflitos: linha.conflitos ?? [],
      }));
    },

    async historicoDaEscala(eventoId: string, limite = 20): Promise<RegistroDaEscala[]> {
      return executor
        .select({
          acao: registroAcao.acao,
          statusDe: registroAcao.statusDe,
          statusPara: registroAcao.statusPara,
          comentario: registroAcao.comentario,
          usuario: nomeDoUsuario,
          criadoEm: registroAcao.criadoEm,
        })
        .from(registroAcao)
        .leftJoin(usuario, eq(usuario.id, registroAcao.usuarioId))
        .where(and(eq(registroAcao.entidade, "ESCALA_DO_EVENTO"), eq(registroAcao.entidadeId, eventoId)))
        .orderBy(desc(registroAcao.criadoEm))
        .limit(limite);
    },

    async funcoesAtivas(): Promise<{ id: string; codigo: string; nome: string }[]> {
      return executor
        .select({ id: funcao.id, codigo: funcao.codigo, nome: funcao.nome })
        .from(funcao)
        .where(eq(funcao.ativo, true))
        .orderBy(asc(funcao.nome));
    },

    async linhaParaSugestao(escalaId: string): Promise<LinhaParaSugestao | null> {
      const resultado = await executor.execute<{
        escala_id: string;
        evento_id: string;
        funcao_id: string | null;
        nome_da_funcao: string;
        quantidade: number;
        ativas: number;
        local_lat: number | null;
        local_lng: number | null;
        tem_enquete: boolean;
        data_inicio: string;
        data_fim: string;
      }>(sql`
        select e.id as escala_id, e.evento_id, e.funcao_id, coalesce(f.nome, 'Função sem nome') as nome_da_funcao,
               e.quantidade_vagas as quantidade,
               (select count(*)::int from ${convocacao} c where c.escala_id = e.id and c.status in ('SUGERIDA', 'CONVIDADA', 'ACEITA')) as ativas,
               l.lat as local_lat, l.lng as local_lng,
               exists (select 1 from eventos.enquete_evento ee where ee.evento_id = e.evento_id) as tem_enquete,
               to_char(ev.inicio at time zone 'America/Sao_Paulo', 'YYYY-MM-DD') as data_inicio,
               to_char(ev.fim at time zone 'America/Sao_Paulo', 'YYYY-MM-DD') as data_fim
          from ${escala} e
          join ${evento} ev on ev.id = e.evento_id and ev.deleted_at is null
          left join ${funcao} f on f.id = e.funcao_id
          left join eventos.local l on l.id = ev.local_id
         where e.id = ${escalaId} and e.deleted_at is null`);
      const linha = resultado.rows[0];
      if (!linha) return null;
      return {
        escalaId: linha.escala_id,
        eventoId: linha.evento_id,
        funcaoId: linha.funcao_id,
        nomeDaFuncao: linha.nome_da_funcao,
        quantidade: linha.quantidade,
        ativas: linha.ativas,
        localLat: linha.local_lat,
        localLng: linha.local_lng,
        temEnquete: linha.tem_enquete,
        dataInicio: linha.data_inicio,
        dataFim: linha.data_fim,
      };
    },

    /** Staff ativo (pessoa_evento + core.pessoa ativa), com o que a sugestão precisa. */
    async candidatos(linha: LinhaParaSugestao, agora: Date): Promise<CandidatoDoBanco[]> {
      const resultado = await executor.execute<{
        pessoa_id: string;
        nome: string;
        disponivel: boolean | null;
        nivel: string | null;
        lat: number | null;
        lng: number | null;
        convocacoes_90: number;
        ultima_data: string | null;
        ultimo_evento: string | null;
        dias_desde_ultima: number | null;
        ja_no_evento: boolean;
        conflitos: string[] | null;
      }>(sql`
        with este as (select id, inicio, fim from ${evento} where id = ${linha.eventoId}),
        trabalhos as (
          select c.pessoa_id, ev.inicio, coalesce(ev.codigo, ev.nome) as evento
            from ${convocacao} c
            join ${escala} e on e.id = c.escala_id and e.deleted_at is null
            join ${evento} ev on ev.id = e.evento_id and ev.deleted_at is null and ev.status <> 'CANCELADO'
           where c.status in ('CONVIDADA', 'ACEITA')
             and ev.inicio < ${agora} and ev.inicio >= ${agora}::timestamptz - interval '90 days'
        )
        select pe.pessoa_id, coalesce(p.nome_social, p.nome_completo) as nome, d.disponivel, pf.nivel, pe.lat, pe.lng,
               (select count(*)::int from trabalhos t where t.pessoa_id = pe.pessoa_id) as convocacoes_90,
               (select to_char(max(t.inicio) at time zone 'America/Sao_Paulo', 'YYYY-MM-DD') from trabalhos t where t.pessoa_id = pe.pessoa_id) as ultima_data,
               (select t.evento from trabalhos t where t.pessoa_id = pe.pessoa_id order by t.inicio desc limit 1) as ultimo_evento,
               (select extract(day from ${agora}::timestamptz - max(t.inicio))::int from trabalhos t where t.pessoa_id = pe.pessoa_id) as dias_desde_ultima,
               exists (select 1 from ${convocacao} c join ${escala} e on e.id = c.escala_id and e.deleted_at is null
                        where c.pessoa_id = pe.pessoa_id and e.evento_id = ${linha.eventoId}
                          and c.status in ('SUGERIDA', 'CONVIDADA', 'ACEITA')) as ja_no_evento,
               (select array_agg(distinct coalesce(outro.codigo, outro.nome))
                  from ${convocacao} c
                  join ${escala} e on e.id = c.escala_id and e.deleted_at is null
                  join ${evento} outro on outro.id = e.evento_id and outro.deleted_at is null and outro.status <> 'CANCELADO'
                  cross join este
                 where c.pessoa_id = pe.pessoa_id and c.status in ('SUGERIDA', 'CONVIDADA', 'ACEITA')
                   and outro.id <> este.id and outro.inicio <= este.fim and outro.fim >= este.inicio) as conflitos
          from eventos.pessoa_evento pe
          join ${pessoa} p on p.id = pe.pessoa_id and p.ativo and p.deleted_at is null
          left join ${pessoaFuncao} pf on pf.pessoa_id = pe.pessoa_id and pf.funcao_id = ${linha.funcaoId}
          left join eventos.disponibilidade d on d.pessoa_id = pe.pessoa_id and d.evento_id = ${linha.eventoId}
         order by nome`);
      return resultado.rows.map((linhaDoBanco) => ({
        pessoaId: linhaDoBanco.pessoa_id,
        nome: linhaDoBanco.nome,
        disponivel: linhaDoBanco.disponivel,
        nivel: linhaDoBanco.nivel as CandidatoDoBanco["nivel"],
        lat: linhaDoBanco.lat,
        lng: linhaDoBanco.lng,
        convocacoesUltimos90Dias: linhaDoBanco.convocacoes_90,
        ultimaData: linhaDoBanco.ultima_data,
        ultimoEvento: linhaDoBanco.ultimo_evento,
        diasDesdeUltima: linhaDoBanco.dias_desde_ultima,
        jaNoEvento: linhaDoBanco.ja_no_evento,
        conflitos: linhaDoBanco.conflitos ?? [],
      }));
    },

    /** Eventos com início no intervalo (AAAA-MM-DD, São Paulo), com vagas, preenchidas, respostas e o último envio/devolução. */
    async eventosDaLista({ de, ate, statusEscala }: { de?: string; ate?: string; statusEscala?: StatusEscala[] }): Promise<EventoDaLista[]> {
      const resultado = await executor.execute<{
        id: string;
        codigo: string | null;
        nome: string;
        tipo_sigla: string;
        tipo_nome: string;
        edicao: string | null;
        polo_codigo: string | null;
        data_inicio: string;
        data_fim: string;
        status: string;
        status_escala: string;
        vagas: number;
        preenchidas: number;
        confirmaram: number;
        aguardando: number;
        nao_podem: number;
        enviada_em: string | null;
        devolvida_em: string | null;
        comentario_da_devolucao: string | null;
      }>(sql`
        with linhas as (
          select e.evento_id, e.quantidade_vagas,
                 count(c.id) filter (where c.status in ('SUGERIDA', 'CONVIDADA', 'ACEITA'))::int as ativas,
                 count(c.id) filter (where c.status = 'ACEITA')::int as aceitas,
                 count(c.id) filter (where c.status = 'CONVIDADA')::int as convidadas,
                 count(c.id) filter (where c.status = 'RECUSADA')::int as recusadas
            from ${escala} e
            left join ${convocacao} c on c.escala_id = e.id
           where e.deleted_at is null
           group by e.id
        )
        select ev.id, ev.codigo, ev.nome, t.sigla as tipo_sigla, t.nome as tipo_nome, ev.edicao, po.codigo as polo_codigo,
               to_char(ev.inicio at time zone 'America/Sao_Paulo', 'YYYY-MM-DD') as data_inicio,
               to_char(ev.fim at time zone 'America/Sao_Paulo', 'YYYY-MM-DD') as data_fim,
               ev.status, ev.status_escala,
               coalesce(sum(l.quantidade_vagas), 0)::int as vagas,
               coalesce(sum(least(l.ativas, l.quantidade_vagas)), 0)::int as preenchidas,
               coalesce(sum(l.aceitas), 0)::int as confirmaram,
               coalesce(sum(l.convidadas), 0)::int as aguardando,
               coalesce(sum(l.recusadas), 0)::int as nao_podem,
               (select max(r.criado_em) from ${registroAcao} r
                 where r.entidade = 'ESCALA_DO_EVENTO' and r.entidade_id = ev.id and r.acao = 'ENVIADA_APROVACAO') as enviada_em,
               dev.criado_em as devolvida_em, dev.comentario as comentario_da_devolucao
          from ${evento} ev
          join ${tipoEvento} t on t.id = ev.tipo_evento_id
          left join ${polo} po on po.id = ev.polo_id
          left join linhas l on l.evento_id = ev.id
          left join lateral (
            select r.criado_em, r.comentario from ${registroAcao} r
             where r.entidade = 'ESCALA_DO_EVENTO' and r.entidade_id = ev.id and r.acao = 'DEVOLVIDA'
             order by r.criado_em desc limit 1
          ) dev on true
         where ev.deleted_at is null
           ${de ? sql`and to_char(ev.fim at time zone 'America/Sao_Paulo', 'YYYY-MM-DD') >= ${de}` : sql``}
           ${ate ? sql`and to_char(ev.inicio at time zone 'America/Sao_Paulo', 'YYYY-MM-DD') <= ${ate}` : sql``}
           ${statusEscala?.length ? sql`and ev.status_escala in (${sql.join(statusEscala.map((status) => sql`${status}`), sql`, `)})` : sql``}
         group by ev.id, t.sigla, t.nome, po.codigo, dev.criado_em, dev.comentario
         order by ev.inicio, ev.nome`);
      return resultado.rows.map((linha) => ({
        id: linha.id,
        codigo: linha.codigo,
        nome: linha.nome,
        tipoSigla: linha.tipo_sigla,
        tipoNome: linha.tipo_nome,
        edicao: linha.edicao,
        poloCodigo: linha.polo_codigo,
        dataInicio: linha.data_inicio,
        dataFim: linha.data_fim,
        status: linha.status,
        statusEscala: linha.status_escala as StatusEscala,
        vagas: linha.vagas,
        preenchidas: linha.preenchidas,
        confirmaram: linha.confirmaram,
        aguardando: linha.aguardando,
        naoPodem: linha.nao_podem,
        enviadaEm: linha.enviada_em ? new Date(linha.enviada_em) : null,
        devolvidaEm: linha.devolvida_em ? new Date(linha.devolvida_em) : null,
        comentarioDaDevolucao: linha.comentario_da_devolucao,
      }));
    },

    async opcoesDeFiltro(): Promise<{ polos: { codigo: string; nome: string }[]; tipos: { sigla: string; nome: string }[] }> {
      const [polos, tipos] = await Promise.all([
        executor
          .select({ codigo: polo.codigo, nome: polo.nome })
          .from(polo)
          .where(and(isNull(polo.deletedAt), eq(polo.ativo, true)))
          .orderBy(asc(polo.nome)),
        executor.select({ sigla: tipoEvento.sigla, nome: tipoEvento.nome }).from(tipoEvento).where(eq(tipoEvento.ativo, true)).orderBy(asc(tipoEvento.nome)),
      ]);
      return { polos, tipos };
    },

    /** O que a aprovação aponta além das vagas: enquete, voo sem pedido e trainees, por evento. */
    async situacaoParaAtencao(eventoIds: string[]): Promise<SituacaoDoEventoParaAtencao[]> {
      if (eventoIds.length === 0) return [];
      const ids = sql.join(eventoIds.map((id) => sql`${id}::uuid`), sql`, `);
      const resultado = await executor.execute<{
        evento_id: string;
        nao_podem: number;
        sem_resposta: number;
        voo_sem_pedido: number;
        trainees: { funcao: string; quantidade: number }[] | null;
      }>(sql`
        with ativas as (
          select e.evento_id, c.pessoa_id, c.deslocamento, e.funcao_id
            from ${convocacao} c
            join ${escala} e on e.id = c.escala_id and e.deleted_at is null
           where e.evento_id in (${ids}) and c.status in ('SUGERIDA', 'CONVIDADA', 'ACEITA')
        )
        select ev.id as evento_id,
               (select count(*)::int from ativas a join eventos.disponibilidade d on d.evento_id = a.evento_id and d.pessoa_id = a.pessoa_id
                 where a.evento_id = ev.id and not d.disponivel) as nao_podem,
               (select count(*)::int from ativas a
                 where a.evento_id = ev.id
                   and exists (select 1 from eventos.enquete_evento ee where ee.evento_id = ev.id)
                   and not exists (select 1 from eventos.disponibilidade d where d.evento_id = a.evento_id and d.pessoa_id = a.pessoa_id)) as sem_resposta,
               (select count(*)::int from ativas a
                 where a.evento_id = ev.id and a.deslocamento = 'VOO'
                   and not exists (select 1 from eventos.pedido_sdc ps
                                    where ps.evento_id = a.evento_id and ps.pessoa_id = a.pessoa_id and ps.tipo = 'VOO' and ps.situacao <> 'CANCELADO')) as voo_sem_pedido,
               (select json_agg(json_build_object('funcao', x.nome, 'quantidade', x.quantidade))
                  from (select coalesce(f.nome, 'Função sem nome') as nome, count(*)::int as quantidade
                          from ativas a
                          join ${pessoaFuncao} pf on pf.pessoa_id = a.pessoa_id and pf.funcao_id = a.funcao_id and pf.nivel = 'TRAINEE'
                          left join ${funcao} f on f.id = a.funcao_id
                         where a.evento_id = ev.id
                         group by f.nome) x) as trainees
          from ${evento} ev
         where ev.id in (${ids})`);
      return resultado.rows.map((linha) => ({
        eventoId: linha.evento_id,
        disseramQueNaoPodem: linha.nao_podem,
        semRespostaNaEnquete: linha.sem_resposta,
        vooSemPedido: linha.voo_sem_pedido,
        trainees: linha.trainees ?? [],
      }));
    },

    /** Linhas de várias escalas de uma vez (para os pontos de atenção da fila). */
    async linhasDosEventos(eventoIds: string[]): Promise<(LinhaDaMontagem & { eventoId: string })[]> {
      if (eventoIds.length === 0) return [];
      const linhas = await executor
        .select({
          id: escala.id,
          eventoId: escala.eventoId,
          funcao: funcao.codigo,
          nomeDaFuncao: sql<string>`coalesce(${funcao.nome}, 'Função sem nome')`,
          data: sql<string>`${escala.data}::text`,
          quantidade: escala.quantidadeVagas,
          origem: escala.origem,
          confirmada: sql<boolean>`${escala.confirmadaEm} is not null`,
          ativas: sql<number>`(select count(*)::int from ${convocacao}
            where ${convocacao.escalaId} = ${escala.id} and ${convocacao.status} in ('SUGERIDA', 'CONVIDADA', 'ACEITA'))`,
        })
        .from(escala)
        .leftJoin(funcao, eq(funcao.id, escala.funcaoId))
        .where(and(inArray(escala.eventoId, eventoIds), isNull(escala.deletedAt)))
        .orderBy(escala.data, escala.criadoEm);
      return linhas.map((linha) => ({ ...linha, origem: linha.origem as LinhaDaMontagem["origem"] }));
    },

    /** Convidadas antes de `limite` e ainda sem resposta, em eventos que não acabaram. */
    async semResposta(limite: Date, hoje: string): Promise<SemResposta[]> {
      const linhas = await executor
        .select({
          convocacaoId: convocacao.id,
          nome: nomeDaPessoa,
          eventoId: evento.id,
          codigo: evento.codigo,
          funcao: sql<string>`coalesce(${funcao.nome}, 'Função sem nome')`,
          convidadaEm: convocacao.convidadaEm,
        })
        .from(convocacao)
        .innerJoin(escala, and(eq(escala.id, convocacao.escalaId), isNull(escala.deletedAt)))
        .innerJoin(evento, and(eq(evento.id, escala.eventoId), isNull(evento.deletedAt)))
        .innerJoin(pessoa, eq(pessoa.id, convocacao.pessoaId))
        .leftJoin(funcao, eq(funcao.id, escala.funcaoId))
        .where(
          and(
            eq(convocacao.status, "CONVIDADA"),
            sql`${convocacao.convidadaEm} < ${limite}`,
            sql`${evento.status} <> 'CANCELADO'`,
            sql`to_char(${evento.fim} at time zone 'America/Sao_Paulo', 'YYYY-MM-DD') >= ${hoje}`,
          ),
        )
        .orderBy(asc(evento.inicio), asc(convocacao.convidadaEm));
      return linhas.map((linha) => ({ ...linha, convidadaEm: linha.convidadaEm! }));
    },
  };
}

export type ConsultaDaEscala = ReturnType<typeof criarConsultaDaEscala>;
