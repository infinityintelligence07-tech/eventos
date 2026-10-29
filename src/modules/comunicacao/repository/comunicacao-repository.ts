import { createHash } from "node:crypto";

import { and, asc, desc, eq, gte, inArray, isNull, ne, sql } from "drizzle-orm";

import type { Executor } from "@/core/db/database";
import { registrarAcao } from "@/core/db/registro-acao";
import { cargo, pessoa } from "@/core/db/schema/core";
import {
  configuracao,
  convocacao,
  escala,
  evento,
  funcao,
  hospedagem,
  local,
  mensagem,
  modeloCopy,
  pedidoSdc,
  pessoaEvento,
  quarto,
  quartoOcupante,
  tipoEvento,
  trechoVoo,
} from "@/core/db/schema/eventos";

import type { Deslocamento, HospedagemDaCopy } from "../domain/contexto-da-copy";
import type { ModeloDeCopy } from "../domain/modelo";
import type { CanalDaMensagem, TipoDeModelo } from "../domain/situacao";
import type { PessoaDaEquipe, RepositorioComunicacao, VooDaPessoa } from "../service/porta";

// Comunicação escreve `mensagem`, `modelo_copy` e `configuracao`; o resto é só leitura (docs/07 §2.3 e §7.4).

const ATIVAS = ["SUGERIDA", "CONVIDADA", "ACEITA"];

const diaEmSaoPaulo = (coluna: typeof evento.inicio | typeof evento.fim) =>
  sql<string>`to_char(${coluna} at time zone 'America/Sao_Paulo', 'YYYY-MM-DD')`;

// tipo, sexo, deslocamento, sentido e canal têm CHECK no banco com os valores dos tipos do domínio.
const comoModelo = (linha: Omit<ModeloDeCopy, "tipo"> & { tipo: string }): ModeloDeCopy => ({ ...linha, tipo: linha.tipo as TipoDeModelo });

const COLUNAS_DO_MODELO = {
  id: modeloCopy.id,
  tipo: modeloCopy.tipo,
  nome: modeloCopy.nome,
  corpo: modeloCopy.corpo,
  ativo: modeloCopy.ativo,
  atualizadoEm: modeloCopy.atualizadoEm,
};

const nomeDaPessoa = sql<string>`coalesce(nullif(trim(${pessoa.nomeSocial}), ''), ${pessoa.nomeCompleto})`;

export function criarRepositorioComunicacao(executor: Executor): RepositorioComunicacao {
  return {
    async eventos({ eventoId, statusEscala, fimDesde }) {
      const linhas = await executor
        .select({
          id: evento.id,
          nome: evento.nome,
          codigo: evento.codigo,
          edicao: evento.edicao,
          tipoSigla: tipoEvento.sigla,
          tipoNome: tipoEvento.nome,
          dataInicio: diaEmSaoPaulo(evento.inicio),
          dataFim: diaEmSaoPaulo(evento.fim),
          statusEscala: evento.statusEscala,
          localNome: local.nome,
          localCidade: local.cidade,
          localUf: local.uf,
        })
        .from(evento)
        .leftJoin(tipoEvento, eq(tipoEvento.id, evento.tipoEventoId))
        .leftJoin(local, eq(local.id, evento.localId))
        .where(
          and(
            isNull(evento.deletedAt),
            eventoId ? eq(evento.id, eventoId) : undefined,
            statusEscala ? inArray(evento.statusEscala, statusEscala) : undefined,
            fimDesde ? gte(evento.fim, fimDesde) : undefined,
          ),
        )
        .orderBy(asc(evento.inicio), asc(evento.codigo));
      return linhas.map(({ localNome, localCidade, localUf, ...linha }) => ({
        ...linha,
        local: localNome !== null && localCidade !== null && localUf !== null ? { nome: localNome, cidade: localCidade, uf: localUf } : null,
      }));
    },

    async equipe(eventoIds, convocacaoId) {
      if (eventoIds.length === 0) return [];
      const linhas = await executor
        .select({
          convocacaoId: convocacao.id,
          eventoId: escala.eventoId,
          pessoaId: convocacao.pessoaId,
          status: convocacao.status,
          nome: nomeDaPessoa,
          telefone: pessoa.telefone,
          sexo: pessoaEvento.sexo,
          funcao: sql<string | null>`coalesce(${funcao.nome}, ${cargo.nome})`,
          data: escala.data,
          horaInicio: escala.horaInicio,
          horaFim: escala.horaFim,
          deslocamento: convocacao.deslocamento,
        })
        .from(convocacao)
        .innerJoin(escala, eq(escala.id, convocacao.escalaId))
        .innerJoin(pessoa, eq(pessoa.id, convocacao.pessoaId))
        .leftJoin(pessoaEvento, eq(pessoaEvento.pessoaId, convocacao.pessoaId))
        .leftJoin(funcao, eq(funcao.id, escala.funcaoId))
        .leftJoin(cargo, eq(cargo.id, escala.cargoId))
        .where(
          and(
            inArray(escala.eventoId, eventoIds),
            isNull(escala.deletedAt),
            inArray(convocacao.status, ATIVAS),
            convocacaoId ? eq(convocacao.id, convocacaoId) : undefined,
          ),
        )
        .orderBy(asc(nomeDaPessoa), asc(convocacao.id));
      return linhas.map((linha) => ({
        ...linha,
        sexo: linha.sexo as PessoaDaEquipe["sexo"],
        deslocamento: linha.deslocamento as Deslocamento | null,
      }));
    },

    async hospedagens(convocacaoIds) {
      const resultado = new Map<string, HospedagemDaCopy>();
      if (convocacaoIds.length === 0) return resultado;
      const camas = await executor
        .select({
          convocacaoId: quartoOcupante.convocacaoId,
          quartoId: quarto.id,
          capacidade: quarto.capacidade,
          hotel: local.nome,
          logradouro: local.logradouro,
          numero: local.numero,
          bairro: local.bairro,
          cidade: local.cidade,
          uf: local.uf,
        })
        .from(quartoOcupante)
        .innerJoin(quarto, eq(quarto.id, quartoOcupante.quartoId))
        .innerJoin(hospedagem, eq(hospedagem.id, quarto.hospedagemId))
        .innerJoin(local, eq(local.id, hospedagem.localId))
        .where(inArray(quartoOcupante.convocacaoId, convocacaoIds));
      if (camas.length === 0) return resultado;

      const ocupantes = await executor
        .select({ quartoId: quartoOcupante.quartoId, convocacaoId: quartoOcupante.convocacaoId, nome: nomeDaPessoa })
        .from(quartoOcupante)
        .innerJoin(convocacao, eq(convocacao.id, quartoOcupante.convocacaoId))
        .innerJoin(pessoa, eq(pessoa.id, convocacao.pessoaId))
        .where(and(inArray(quartoOcupante.quartoId, [...new Set(camas.map((cama) => cama.quartoId))]), inArray(convocacao.status, ATIVAS)))
        .orderBy(asc(nomeDaPessoa));

      for (const { convocacaoId, quartoId, capacidade, ...hotel } of camas) {
        resultado.set(convocacaoId, {
          ...hotel,
          capacidadeDoQuarto: capacidade,
          colegas: ocupantes.filter((o) => o.quartoId === quartoId && o.convocacaoId !== convocacaoId).map((o) => o.nome),
        });
      }
      return resultado;
    },

    async voos(eventoIds) {
      if (eventoIds.length === 0) return [];
      const linhas = await executor
        .select({
          eventoId: pedidoSdc.eventoId,
          pessoaId: pedidoSdc.pessoaId,
          sentido: trechoVoo.sentido,
          companhia: trechoVoo.companhia,
          numeroVoo: trechoVoo.numeroVoo,
          localizador: trechoVoo.localizador,
          origemIata: trechoVoo.origemIata,
          destinoIata: trechoVoo.destinoIata,
          partidaEm: trechoVoo.partidaEm,
        })
        .from(trechoVoo)
        .innerJoin(pedidoSdc, eq(pedidoSdc.id, trechoVoo.pedidoId))
        .where(and(inArray(pedidoSdc.eventoId, eventoIds), eq(pedidoSdc.tipo, "VOO"), eq(pedidoSdc.situacao, "EMITIDO")));
      return linhas.flatMap(({ pessoaId, sentido, ...trecho }) =>
        pessoaId === null ? [] : [{ ...trecho, pessoaId, sentido: sentido as VooDaPessoa["sentido"] }],
      );
    },

    async ultimosEnvios(convocacaoIds) {
      if (convocacaoIds.length === 0) return [];
      const linhas = await executor
        .selectDistinctOn([mensagem.convocacaoId, modeloCopy.tipo], {
          convocacaoId: mensagem.convocacaoId,
          tipo: modeloCopy.tipo,
          dadosHash: mensagem.dadosHash,
          enviadaEm: mensagem.enviadaEm,
          canal: mensagem.canal,
        })
        .from(mensagem)
        .innerJoin(modeloCopy, eq(modeloCopy.id, mensagem.modeloId))
        .where(and(inArray(mensagem.convocacaoId, convocacaoIds), eq(mensagem.status, "ENVIADA")))
        .orderBy(mensagem.convocacaoId, modeloCopy.tipo, desc(mensagem.enviadaEm), desc(mensagem.criadoEm));
      // mensagem_enviada_check: ENVIADA sempre tem enviada_em e canal.
      return linhas.map((linha) => ({
        ...linha,
        tipo: linha.tipo as TipoDeModelo,
        enviadaEm: linha.enviadaEm!,
        canal: linha.canal as CanalDaMensagem,
      }));
    },

    async modelos() {
      const linhas = await executor.select(COLUNAS_DO_MODELO).from(modeloCopy).orderBy(asc(modeloCopy.tipo), desc(modeloCopy.atualizadoEm));
      return linhas.map(comoModelo);
    },

    async modelo(modeloId) {
      const [linha] = await executor.select(COLUNAS_DO_MODELO).from(modeloCopy).where(eq(modeloCopy.id, modeloId));
      return linha ? comoModelo(linha) : null;
    },

    async configuracao(chave) {
      const [linha] = await executor.select({ valor: configuracao.valor }).from(configuracao).where(eq(configuracao.chave, chave));
      return linha?.valor?.trim() || null;
    },

    async exemplosParaPrevia(fimDesde, limite) {
      return executor
        .select({
          convocacaoId: convocacao.id,
          eventoId: evento.id,
          nome: nomeDaPessoa,
          evento: sql<string>`coalesce(${evento.codigo}, ${evento.nome})`,
        })
        .from(convocacao)
        .innerJoin(escala, eq(escala.id, convocacao.escalaId))
        .innerJoin(evento, eq(evento.id, escala.eventoId))
        .innerJoin(pessoa, eq(pessoa.id, convocacao.pessoaId))
        .where(and(isNull(evento.deletedAt), isNull(escala.deletedAt), gte(evento.fim, fimDesde), inArray(convocacao.status, ATIVAS)))
        .orderBy(
          desc(inArray(evento.statusEscala, ["APROVADA", "COMUNICADA"])),
          asc(evento.inicio),
          asc(nomeDaPessoa),
        )
        .limit(limite);
    },

    async travarConvocacao(convocacaoId) {
      const [travada] = await executor
        .select({ escalaId: convocacao.escalaId, status: convocacao.status })
        .from(convocacao)
        .where(eq(convocacao.id, convocacaoId))
        .for("update");
      if (!travada) return null;
      const [linha] = await executor.select({ eventoId: escala.eventoId }).from(escala).where(eq(escala.id, travada.escalaId));
      return linha ? { eventoId: linha.eventoId, status: travada.status } : null;
    },

    async registrarEnvio(envio) {
      const doMesmoTipo = executor.select({ id: modeloCopy.id }).from(modeloCopy).where(eq(modeloCopy.tipo, envio.tipo));
      const superadas = await executor
        .update(mensagem)
        .set({ status: "DESATUALIZADA" })
        .where(and(eq(mensagem.convocacaoId, envio.convocacaoId), eq(mensagem.status, "ENVIADA"), inArray(mensagem.modeloId, doMesmoTipo)))
        .returning({ id: mensagem.id });

      const [gravada] = await executor
        .insert(mensagem)
        .values({
          convocacaoId: envio.convocacaoId,
          modeloId: envio.modeloId,
          texto: envio.texto,
          dadosHash: envio.dadosHash,
          canal: envio.canal,
          status: "ENVIADA",
          enviadaEm: envio.instante,
          enviadaPor: envio.usuarioId,
          criadoEm: envio.instante,
        })
        .returning({ id: mensagem.id });

      await registrarAcao(executor, {
        entidade: "MENSAGEM",
        entidadeId: gravada!.id,
        eventoId: envio.eventoId,
        acao: "COPY_ENVIADA",
        statusPara: "ENVIADA",
        usuarioId: envio.usuarioId,
        dados: { convocacaoId: envio.convocacaoId, tipo: envio.tipo, canal: envio.canal, reenvio: superadas.length > 0 },
      });
    },

    async criarModelo(modelo, { usuarioId, instante }) {
      const [criado] = await executor
        .insert(modeloCopy)
        .values({ ...modelo, ativo: false, criadoEm: instante, atualizadoEm: instante })
        .returning({ id: modeloCopy.id });
      await registrarAcao(executor, {
        entidade: "MODELO_COPY",
        entidadeId: criado!.id,
        acao: "MODELO_CRIADO",
        statusPara: "INATIVO",
        usuarioId,
        dados: { tipo: modelo.tipo, nome: modelo.nome },
      });
      return criado!.id;
    },

    async alterarModelo(modeloId, modelo, { usuarioId, instante }) {
      const [anterior] = await executor
        .select({ tipo: modeloCopy.tipo, nome: modeloCopy.nome, corpo: modeloCopy.corpo })
        .from(modeloCopy)
        .where(eq(modeloCopy.id, modeloId))
        .for("update");
      if (!anterior) return false;
      await executor.update(modeloCopy).set({ ...modelo, atualizadoEm: instante }).where(eq(modeloCopy.id, modeloId));
      await registrarAcao(executor, {
        entidade: "MODELO_COPY",
        entidadeId: modeloId,
        acao: "MODELO_ALTERADO",
        usuarioId,
        dados: { tipo: modelo.tipo, nome: modelo.nome, anterior },
      });
      return true;
    },

    async ativarModelo(modeloId, { usuarioId, instante }) {
      const [alvo] = await executor.select({ tipo: modeloCopy.tipo, ativo: modeloCopy.ativo }).from(modeloCopy).where(eq(modeloCopy.id, modeloId));
      if (!alvo) return null;
      // tipo tem CHECK no banco com os valores de TipoDeModelo.
      const tipo = alvo.tipo as TipoDeModelo;
      // Duas ativações do mesmo tipo ao mesmo tempo esperam uma pela outra (senão as duas desativariam o mesmo
      // ativo antigo e a segunda bateria no índice de um ativo por tipo).
      await executor.execute(sql`select pg_advisory_xact_lock(hashtext(${`eventos.modelo_copy:${tipo}`}))`);

      const [atual] = await executor.select({ ativo: modeloCopy.ativo }).from(modeloCopy).where(eq(modeloCopy.id, modeloId));
      if (atual?.ativo) return { tipo, desativados: [] };

      const desativados = await executor
        .update(modeloCopy)
        .set({ ativo: false, atualizadoEm: instante })
        .where(and(eq(modeloCopy.tipo, tipo), eq(modeloCopy.ativo, true), ne(modeloCopy.id, modeloId)))
        .returning({ id: modeloCopy.id });
      await executor.update(modeloCopy).set({ ativo: true, atualizadoEm: instante }).where(eq(modeloCopy.id, modeloId));

      for (const { id } of desativados) {
        await registrarAcao(executor, {
          entidade: "MODELO_COPY",
          entidadeId: id,
          acao: "MODELO_DESATIVADO",
          statusDe: "ATIVO",
          statusPara: "INATIVO",
          usuarioId,
          dados: { tipo, substituidoPor: modeloId },
        });
      }
      await registrarAcao(executor, {
        entidade: "MODELO_COPY",
        entidadeId: modeloId,
        acao: "MODELO_ATIVADO",
        statusDe: "INATIVO",
        statusPara: "ATIVO",
        usuarioId,
        dados: { tipo, desativados: desativados.map(({ id }) => id) },
      });
      return { tipo, desativados: desativados.map(({ id }) => id) };
    },

    async desativarModelo(modeloId, { usuarioId, instante }) {
      const [alvo] = await executor.select({ tipo: modeloCopy.tipo, ativo: modeloCopy.ativo }).from(modeloCopy).where(eq(modeloCopy.id, modeloId)).for("update");
      if (!alvo) return false;
      if (!alvo.ativo) return true;
      await executor.update(modeloCopy).set({ ativo: false, atualizadoEm: instante }).where(eq(modeloCopy.id, modeloId));
      await registrarAcao(executor, {
        entidade: "MODELO_COPY",
        entidadeId: modeloId,
        acao: "MODELO_DESATIVADO",
        statusDe: "ATIVO",
        statusPara: "INATIVO",
        usuarioId,
        dados: { tipo: alvo.tipo },
      });
      return true;
    },

    async salvarConfiguracao(chave, valor, { usuarioId, instante }) {
      const [anterior] = await executor.select({ valor: configuracao.valor }).from(configuracao).where(eq(configuracao.chave, chave)).for("update");
      await executor
        .insert(configuracao)
        .values({ chave, valor, atualizadoPor: usuarioId, criadoEm: instante, atualizadoEm: instante })
        .onConflictDoUpdate({ target: configuracao.chave, set: { valor, atualizadoPor: usuarioId, atualizadoEm: instante } });
      await registrarAcao(executor, {
        entidade: "CONFIGURACAO",
        entidadeId: idDaConfiguracao(chave),
        acao: "CONFIGURACAO_ALTERADA",
        usuarioId,
        dados: { chave, de: anterior?.valor ?? null, para: valor },
      });
    },
  };
}

/**
 * registro_acao.entidade_id é uuid e a configuração é identificada pela chave (texto): um uuid fixo por chave
 * (md5 de "configuracao:<chave>") deixa o histórico de cada chave consultável pelo índice da entidade.
 */
export function idDaConfiguracao(chave: string): string {
  const hex = createHash("md5").update(`configuracao:${chave}`).digest("hex");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}
