import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

import type { Db, Executor } from "@/core/db/database";
import { ConflitoDeVersaoError, RegraDeNegocioError } from "@/fluxos/_base";
import { type BancoDeTeste, criarBancoDeTeste, TEST_DATABASE_URL } from "@/test/banco";

import {
  aprovarSolicitacao,
  carregarFilaDeAuditoria,
  carregarSolicitacao,
  corrigirSolicitacao,
  criarVigenciaDeRegra,
  desativarRegra,
  listarRegrasDeCusto,
  prepararSolicitacao,
  previaDaSolicitacao,
  reabrirAuditoria,
  registrarSolicitacao,
  reprovarSolicitacao,
  resumoParaInicio,
} from "..";

const banco = vi.hoisted(() => ({ db: null as Db | null }));

vi.mock("@/fluxos/_base", async (importOriginal) => {
  const original = await importOriginal<Record<string, unknown>>();
  return {
    ...original,
    bancoParaLeitura: async () => banco.db!,
    transacao: <T>(trabalho: (tx: Executor) => Promise<T>) => banco.db!.transaction(trabalho),
  };
});

describe.skipIf(!TEST_DATABASE_URL)("fluxos de custos no banco", () => {
  let teste: BancoDeTeste;
  let usuarioId: string;
  let eventoId: string;
  let escalaId: string;
  const agora = new Date("2026-10-28T15:00:00Z");

  const um = async (texto: string, params: unknown[] = []) => ((await teste.sql(texto, params)) as Record<string, string>[])[0]!;

  async function pessoaNaEscala(nome: string): Promise<string> {
    const { id: pessoaId } = await um(`insert into core.pessoa (nome_completo) values ($1) returning id`, [nome]);
    await teste.sql(`insert into eventos.convocacao (escala_id, pessoa_id, status) values ($1, $2, 'ACEITA')`, [escalaId, pessoaId]);
    return pessoaId!;
  }

  const deslocamento = (consumoKmL: number) => ({ origem: "Canoas", destino: "Manaus", idaVolta: true, km: 206, consumoKmL, precoLitroCentavos: 619, pedagioCentavos: 1250 });

  beforeAll(async () => {
    teste = await criarBancoDeTeste();
    banco.db = teste.db;
    usuarioId = (await um(`insert into core.usuario (email) values ('time@exemplo.test') returning id`)).id!;
    // As regras da carga (migration 0002) valem a partir do dia da migration; aqui, desde antes do evento.
    await teste.sql(`update eventos.regra_custo set vigente_desde = '2026-10-22'`);
    const { id: localId } = await um(`insert into eventos.local (nome, tipo, cidade, uf) values ('Centro', 'EVENTO', 'Manaus', 'AM') returning id`);
    eventoId = (
      await um(
        `insert into eventos.evento (nome, codigo, inicio, fim, status, local_id, tipo_evento_id)
         select 'ASM', 'ASM_AM_901', '2026-12-15T12:00:00Z', '2026-12-17T22:00:00Z', 'PLANEJADO', $1, id from eventos.tipo_evento where sigla = 'ASM'
         returning id`,
        [localId],
      )
    ).id!;
    escalaId = (
      await um(`insert into eventos.escala (evento_id, data, hora_inicio, hora_fim, quantidade_vagas, status) values ($1, '2026-12-15', '08:00', '18:00', 20, 'ABERTA') returning id`, [
        eventoId,
      ])
    ).id!;
  }, 60_000);

  afterAll(async () => {
    await teste?.encerrar();
  });

  it("registrar recalcula no servidor, gera o protocolo e marca registrado pelo time", async () => {
    const pessoaId = await pessoaNaEscala("Ana Custo");
    const preparada = await prepararSolicitacao({ eventoId, pessoaId }, agora);
    expect(preparada.sugestoes.itens.map((item) => [item.descricao, item.valorCentavos])).toEqual([
      ["Remuneração", 60000],
      ["Alimentação", 27000],
    ]);

    const previa = await previaDaSolicitacao({ eventoId, deslocamentos: [deslocamento(6.5)], itens: [] });
    expect(previa?.nivel).toBe("CRITICO");

    const itens = preparada.sugestoes.itens.map(({ categoria, regraCustoId, descricao, quantidade, valorCentavos }) => ({ categoria, regraCustoId, descricao, quantidade, valorCentavos }));
    const registrada = await registrarSolicitacao({ eventoId, pessoaId, deslocamentos: [deslocamento(6.5)], itens }, usuarioId, agora);
    expect(registrada.protocolo).toMatch(/^STF-\d{6}-\d{4}$/);
    expect(registrada.nivel).toBe("CRITICO");
    // 412 km ÷ 6,5 × 6,19 = 392,35; pedágio 12,50 × 2; faixa ≥ 250 km = 250,00; itens 870,00.
    expect(registrada.totalCentavos).toBe(39235 + 2500 + 25000 + 87000);

    const gravada = await um(`select status_auditoria, status_financeiro, nivel_excecao, registrado_por, total_centavos from eventos.solicitacao_custo where id = $1`, [registrada.id]);
    expect(gravada).toEqual({ status_auditoria: "PENDENTE", status_financeiro: "AGUARDANDO_AUDITORIA", nivel_excecao: "CRITICO", registrado_por: usuarioId, total_centavos: 153735 });
    expect(await um(`select em_nome_de_pessoa_id, acao from eventos.registro_acao where entidade_id = $1`, [registrada.id])).toEqual({
      em_nome_de_pessoa_id: pessoaId,
      acao: "SOLICITACAO_REGISTRADA",
    });

    await expect(registrarSolicitacao({ eventoId, pessoaId, deslocamentos: [deslocamento(12)], itens: [] }, usuarioId, agora)).rejects.toThrow(registrada.protocolo);
    const fora = (await um(`insert into core.pessoa (nome_completo) values ('Fora da escala') returning id`)).id!;
    await expect(registrarSolicitacao({ eventoId, pessoaId: fora, deslocamentos: [deslocamento(12)], itens: [] }, usuarioId, agora)).rejects.toBeInstanceOf(RegraDeNegocioError);
  });

  it("auditoria: reprovar com motivo → corrigir → aprovar crítico só com motivo → reabrir", async () => {
    const pessoaId = await pessoaNaEscala("Bia Auditoria");
    const { id, protocolo } = await registrarSolicitacao({ eventoId, pessoaId, deslocamentos: [deslocamento(6.8)], itens: [] }, usuarioId, agora);
    const versao = async () => (await carregarSolicitacao(protocolo))!.atualizadoEm;

    const detalhe = await carregarSolicitacao(protocolo);
    expect(detalhe?.alertasPorDeslocamento[0]?.map((alerta) => alerta.mensagem)).toContain("Consumo de 6,8 km/l está abaixo do limite de 7,5 km/l.");

    await expect(aprovarSolicitacao({ solicitacaoId: id, atualizadoEm: await versao() }, usuarioId, agora)).rejects.toThrow(/motivo da aprovação/);
    await expect(reprovarSolicitacao({ solicitacaoId: id, atualizadoEm: "2020-01-01T00:00:00.000Z", motivo: "Falta o comprovante" }, usuarioId, agora)).rejects.toBeInstanceOf(
      ConflitoDeVersaoError,
    );
    await reprovarSolicitacao({ solicitacaoId: id, atualizadoEm: await versao(), motivo: "Falta o comprovante do pedágio" }, usuarioId, agora);
    expect(await um(`select status_auditoria, parecer, auditado_por from eventos.solicitacao_custo where id = $1`, [id])).toEqual({
      status_auditoria: "REPROVADO",
      parecer: "Falta o comprovante do pedágio",
      auditado_por: usuarioId,
    });
    await expect(aprovarSolicitacao({ solicitacaoId: id, atualizadoEm: await versao(), parecer: "ok" }, usuarioId, agora)).rejects.toThrow(/já foi auditada/);

    const depois = new Date(agora.getTime() + 60_000);
    await corrigirSolicitacao({ solicitacaoId: id, atualizadoEm: await versao(), deslocamentos: [deslocamento(9)], itens: [] }, usuarioId, depois);
    expect(await um(`select status_auditoria, nivel_excecao from eventos.solicitacao_custo where id = $1`, [id])).toEqual({ status_auditoria: "PENDENTE", nivel_excecao: "ALERTA" });

    await aprovarSolicitacao({ solicitacaoId: id, atualizadoEm: await versao() }, usuarioId, depois);
    expect(await um(`select status_auditoria, status_financeiro from eventos.solicitacao_custo where id = $1`, [id])).toEqual({
      status_auditoria: "APROVADO",
      status_financeiro: "AGUARDANDO_PAGAMENTO",
    });
    await reabrirAuditoria({ solicitacaoId: id, atualizadoEm: await versao() }, usuarioId, depois);
    expect(await um(`select status_auditoria, status_financeiro, auditado_por from eventos.solicitacao_custo where id = $1`, [id])).toEqual({
      status_auditoria: "PENDENTE",
      status_financeiro: "AGUARDANDO_AUDITORIA",
      auditado_por: null,
    });

    const acoes = await teste.sql(`select acao from eventos.registro_acao where entidade = 'SOLICITACAO_CUSTO' and entidade_id = $1 order by criado_em`, [id]);
    expect(acoes.map((linha) => (linha as { acao: string }).acao)).toEqual([
      "SOLICITACAO_REGISTRADA",
      "AUDITORIA_REPROVADA",
      "CORRECAO_REGISTRADA",
      "AUDITORIA_APROVADA",
      "AUDITORIA_REABERTA",
    ]);
  });

  it("fila põe críticos primeiro e o Início destaca as críticas", async () => {
    const pessoaId = await pessoaNaEscala("Caio Sem Alerta");
    await registrarSolicitacao({ eventoId, pessoaId, deslocamentos: [deslocamento(12)], itens: [] }, usuarioId, agora);
    const fila = await carregarFilaDeAuditoria({}, agora);
    expect(fila.linhas.map((linha) => linha.nivel)).toEqual(["CRITICO", "ALERTA", "NENHUM"]);
    expect(fila.linhas[0]?.resumoDoAlerta).toBe("consumo 6,5 km/l");
    expect(fila.numeros).toMatchObject({ paraAuditar: 3, criticas: 1 });

    const resumo = await resumoParaInicio(agora);
    expect(resumo.map((item) => [item.chave, item.quantidade])).toEqual([
      ["custos-para-auditar", 3],
      ["custos-criticos", 1],
    ]);
  });

  it("regras de custo: nova vigência vale a partir da data e não mexe na antiga", async () => {
    const regras = await listarRegrasDeCusto(agora);
    const alimentacaoAsm = regras
      .find((grupo) => grupo.categoria === "ALIMENTACAO")!
      .regras.find((regra) => regra.atual.tipoEventoSigla === "ASM")!;
    expect(alimentacaoAsm.atual.valorCentavos).toBe(27000);

    const nova = await criarVigenciaDeRegra({ regraId: alimentacaoAsm.atual.id, valorCentavos: 30000, vigenteDesde: "2026-12-01" }, usuarioId, agora);
    await expect(criarVigenciaDeRegra({ regraId: alimentacaoAsm.atual.id, valorCentavos: 31000, vigenteDesde: "2026-12-01" }, usuarioId, agora)).rejects.toThrow(/Já existe/);
    expect(
      await um(`select acao, usuario_id, dados->>'vigenciaAnteriorId' as anterior, dados->>'valorCentavos' as valor from eventos.registro_acao where entidade = 'REGRA_CUSTO' and entidade_id = $1`, [nova.id]),
    ).toEqual({ acao: "VIGENCIA_CRIADA", usuario_id: usuarioId, anterior: alimentacaoAsm.atual.id, valor: "30000" });

    const depois = (await listarRegrasDeCusto(agora)).find((grupo) => grupo.categoria === "ALIMENTACAO")!.regras.find((regra) => regra.atual.tipoEventoSigla === "ASM")!;
    expect(depois.atual.valorCentavos).toBe(27000);
    expect(depois.proxima?.valorCentavos).toBe(30000);
    expect(depois.historico).toHaveLength(2);

    const pessoaId = await pessoaNaEscala("Duda Regra");
    const preparada = await prepararSolicitacao({ eventoId, pessoaId }, agora);
    expect(preparada.sugestoes.itens.find((item) => item.categoria === "ALIMENTACAO")?.valorCentavos).toBe(30000);

    await desativarRegra(nova.id, usuarioId, agora);
    await expect(desativarRegra(nova.id, usuarioId, agora)).rejects.toThrow(/já está inativa/);
    const desativacoes = await teste.sql(`select acao from eventos.registro_acao where entidade = 'REGRA_CUSTO' and entidade_id = $1 order by criado_em`, [nova.id]);
    expect(desativacoes).toEqual([{ acao: "VIGENCIA_CRIADA" }, { acao: "REGRA_DESATIVADA" }]);
  });
});
