import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

import type { Db } from "@/core/db/database";
import { ConflitoDeVersaoError, RegraDeNegocioError } from "@/fluxos/_base";
import { type BancoDeTeste, criarBancoDeTeste, TEST_DATABASE_URL } from "@/test/banco";

import {
  aprovarSolicitacao,
  carregarCustosDoStaff,
  carregarFilaDeAuditoria,
  carregarFormularioDoStaff,
  carregarSolicitacao,
  corrigirMeuCusto,
  previaDoCustoDoStaff,
  registrarSolicitacao,
  reprovarSolicitacao,
  solicitarCusto,
} from "..";

const banco = vi.hoisted(() => ({ db: null as Db | null }));

vi.mock("@/core/autorizacao", async (importOriginal) => {
  const original = await importOriginal<typeof import("@/core/autorizacao")>();
  return { ...original, ehDonoDoSistema: () => false };
});

vi.mock("@/fluxos/_base", async (importOriginal) => {
  const original = await importOriginal<Record<string, unknown>>();
  return {
    ...original,
    bancoParaLeitura: async () => banco.db!,
    // A transação real (limite e "sem registro, desfaz"), no banco de teste.
    transacao: async (_ator: unknown, trabalho: (tx: never) => Promise<unknown>) => (await import("@/fluxos/_base/banco")).transacaoNoBanco(banco.db!, trabalho as never),
  };
});

// São Paulo = UTC-3. O evento vai de 15/12 a 17/12: o formulário abre em 15/12 e fecha no fim de 22/12.
const DURANTE_O_PRAZO = new Date("2026-12-19T15:00:00Z");
const ANTES_DE_ABRIR = new Date("2026-12-15T02:59:59Z");
const FIM_DO_QUINTO_DIA = new Date("2026-12-23T02:59:59Z");
const DEPOIS_DO_PRAZO = new Date("2026-12-23T03:00:00Z");

describe.skipIf(!TEST_DATABASE_URL)("formulário de custo do staff no banco", () => {
  let teste: BancoDeTeste;
  let eventoId: string;
  let escalaId: string;
  let timeId: string;
  let auditorId: string;
  let pessoaDoTime: string;
  let pessoaDoAuditor: string;
  let contador = 0;

  const um = async (texto: string, params: unknown[] = []) => ((await teste.sql(texto, params)) as Record<string, unknown>[])[0]!;
  const doTime = () => ({ usuarioId: timeId, pessoaId: pessoaDoTime, email: "time@exemplo.test", origem: "LOCAL" as const });
  const auditor = () => ({ usuarioId: auditorId, pessoaId: pessoaDoAuditor, email: "auditor@exemplo.test", origem: "LOCAL" as const });

  /** Staff com usuário próprio; `status` nulo = fora da escala do evento. */
  async function staff(nome: string, status: string | null = "ACEITA", emEscala = escalaId) {
    contador += 1;
    const email = `staff${contador}@exemplo.test`;
    const usuarioId = (await um(`insert into core.usuario (email) values ($1) returning id`, [email])).id as string;
    const pessoaId = (await um(`insert into core.pessoa (nome_completo, usuario_id, email) values ($1, $2, $3) returning id`, [nome, usuarioId, email])).id as string;
    if (status) await teste.sql(`insert into eventos.convocacao (escala_id, pessoa_id, status) values ($1, $2, $3)`, [emEscala, pessoaId, status]);
    return { pessoaId, usuarioId, ator: { usuarioId, pessoaId, origem: "SESSAO" as const } };
  }

  async function eventoCom(codigo: string, inicio: string, fim: string) {
    const id = (
      await um(
        `insert into eventos.evento (nome, codigo, inicio, fim, status, local_id, tipo_evento_id)
         select $1, $1, $2, $3, 'PLANEJADO', (select id from eventos.local where nome = 'Centro'), id from eventos.tipo_evento where sigla = 'ASM'
         returning id`,
        [codigo, inicio, fim],
      )
    ).id as string;
    const escala = (
      await um(`insert into eventos.escala (evento_id, data, hora_inicio, hora_fim, quantidade_vagas, status) values ($1, $2::timestamptz::date, '08:00', '18:00', 20, 'ABERTA') returning id`, [id, inicio])
    ).id as string;
    return { id, escalaId: escala };
  }

  const deslocamento = { origem: "Canoas", destino: "Manaus", idaVolta: true, km: 60, consumoKmL: 12, precoLitroCentavos: 600, pedagioCentavos: 1000 };
  const estacionamento = { descricao: "Estacionamento", valorCentavos: 2500 };
  const envio = (mudanca: Record<string, unknown> = {}) => ({ eventoId, deslocamentos: [deslocamento], despesas: [estacionamento], ...mudanca });
  const solicitacaoNoBanco = (id: string) => um(`select status_auditoria, registrado_por, total_centavos from eventos.solicitacao_custo where id = $1`, [id]);

  beforeAll(async () => {
    teste = await criarBancoDeTeste();
    banco.db = teste.db;
    timeId = (await um(`insert into core.usuario (email) values ('time@exemplo.test') returning id`)).id as string;
    auditorId = (await um(`insert into core.usuario (email) values ('auditor@exemplo.test') returning id`)).id as string;
    pessoaDoTime = (await um(`insert into core.pessoa (nome_completo, usuario_id) values ('Time', $1) returning id`, [timeId])).id as string;
    pessoaDoAuditor = (await um(`insert into core.pessoa (nome_completo, usuario_id) values ('Auditor', $1) returning id`, [auditorId])).id as string;
    await teste.sql(`update eventos.regra_custo set vigente_desde = '2026-10-22'`);
    await teste.sql(`insert into eventos.local (nome, tipo, cidade, uf) values ('Centro', 'EVENTO', 'Manaus', 'AM')`);
    ({ id: eventoId, escalaId } = await eventoCom("ASM_AM_902", "2026-12-15T12:00:00Z", "2026-12-17T22:00:00Z"));
  }, 60_000);

  afterAll(async () => {
    await teste?.encerrar();
  });

  it("envia dentro do prazo: mesmo cálculo e protocolo do time, sem registrado_por e com propria no registro", async () => {
    const ana = await staff("Ana Staff");
    await teste.sql(`insert into eventos.pessoa_veiculo (pessoa_id, lugares, consumo_km_l) values ($1, 3, 11.5)`, [ana.pessoaId]);

    const aberto = await carregarFormularioDoStaff(eventoId, ana.pessoaId, DURANTE_O_PRAZO);
    expect(aberto).toMatchObject({
      situacao: "ABERTO",
      evento: { codigo: "ASM_AM_902", dataInicio: "2026-12-15", dataFim: "2026-12-17", uf: "AM" },
      prazo: { abreEm: "2026-12-15", fechaEm: "2026-12-22" },
      sugestoes: { consumoKmL: 11.5 },
    });
    expect((await carregarCustosDoStaff(ana.pessoaId, DURANTE_O_PRAZO)).abertos).toEqual([
      { id: eventoId, codigo: "ASM_AM_902", nome: "ASM_AM_902", dataInicio: "2026-12-15", dataFim: "2026-12-17", fechaEm: "2026-12-22", solicitacao: null },
    ]);

    // 120 km ÷ 12 × 6,00 = 60,00; pedágio 10,00 × 2; faixa de 100 a 249 km = 80,00; estacionamento 25,00.
    const esperado = 6000 + 2000 + 8000 + 2500;
    expect((await previaDoCustoDoStaff(envio()))?.totalCentavos).toBe(esperado);

    const enviada = await solicitarCusto(envio(), ana.ator, DURANTE_O_PRAZO);
    expect(enviada.protocolo).toMatch(/^STF-\d{6}-\d{4}$/);
    expect(enviada.totalCentavos).toBe(esperado);
    expect(await solicitacaoNoBanco(enviada.id)).toEqual({ status_auditoria: "PENDENTE", registrado_por: null, total_centavos: esperado });
    expect(await um(`select acao, usuario_id, em_nome_de_pessoa_id, dados->>'propria' as propria from eventos.registro_acao where entidade_id = $1`, [enviada.id])).toEqual({
      acao: "SOLICITACAO_REGISTRADA",
      usuario_id: ana.usuarioId,
      em_nome_de_pessoa_id: null,
      propria: "true",
    });
    // A despesa entra como item "OUTRO": a pessoa não escolhe categoria nem lança remuneração.
    expect(await teste.sql(`select categoria, descricao, quantidade::float as quantidade, valor_centavos from eventos.custo_item where solicitacao_id = $1`, [enviada.id])).toEqual([
      { categoria: "OUTRO", descricao: "Estacionamento", quantidade: 1, valor_centavos: 2500 },
    ]);

    // Na fila do time aparece sem o selo "Registrado pelo time".
    const naFila = (await carregarFilaDeAuditoria({}, DURANTE_O_PRAZO)).linhas.find((linha) => linha.protocolo === enviada.protocolo);
    expect(naFila).toMatchObject({ pessoaNome: "Ana Staff", registradaPeloTime: false, auditoria: "PENDENTE" });

    // A página dela passa a mostrar o que foi enviado, em vez do formulário.
    const depois = await carregarFormularioDoStaff(eventoId, ana.pessoaId, DURANTE_O_PRAZO);
    expect(depois).toMatchObject({
      situacao: "ENVIADA",
      correcao: { pode: false, ate: null },
      solicitacao: { protocolo: enviada.protocolo, auditoria: "PENDENTE", registradaPeloTime: false, totalCentavos: esperado, despesas: [estacionamento], itensDoTime: [], motivoDaReprovacao: null },
    });
    const lista = await carregarCustosDoStaff(ana.pessoaId, DURANTE_O_PRAZO);
    expect(lista.abertos[0]?.solicitacao).toEqual({ protocolo: enviada.protocolo, auditoria: "PENDENTE" });
    expect(lista.enviadas.map((solicitacao) => [solicitacao.protocolo, solicitacao.evento.codigo, solicitacao.totalCentavos])).toEqual([[enviada.protocolo, "ASM_AM_902", esperado]]);
  });

  it("prazo: aceita até o fim do 5º dia depois do evento e recusa antes de abrir e depois de fechar", async () => {
    const cedo = await staff("Cedo Demais");
    await expect(solicitarCusto(envio(), cedo.ator, ANTES_DE_ABRIR)).rejects.toThrow(/abre em 15\/12/);
    expect(await carregarFormularioDoStaff(eventoId, cedo.pessoaId, ANTES_DE_ABRIR)).toMatchObject({ situacao: "AINDA_NAO_ABRIU", prazo: { abreEm: "2026-12-15" } });
    expect((await carregarCustosDoStaff(cedo.pessoaId, ANTES_DE_ABRIR)).abertos).toEqual([]);

    const noLimite = await staff("No Limite");
    expect((await carregarCustosDoStaff(noLimite.pessoaId, FIM_DO_QUINTO_DIA)).abertos.map((evento) => evento.id)).toEqual([eventoId]);
    await expect(solicitarCusto(envio(), noLimite.ator, FIM_DO_QUINTO_DIA)).resolves.toMatchObject({ protocolo: expect.stringMatching(/^STF-/) });

    const atrasada = await staff("Atrasada");
    const recusa = solicitarCusto(envio(), atrasada.ator, DEPOIS_DO_PRAZO);
    await expect(recusa).rejects.toBeInstanceOf(RegraDeNegocioError);
    await expect(recusa).rejects.toThrow(/acabou em 22\/12 \(5 dias depois do último dia\)\. Fale com o time de eventos/);
    expect(await carregarFormularioDoStaff(eventoId, atrasada.pessoaId, DEPOIS_DO_PRAZO)).toMatchObject({ situacao: "ENCERRADO", prazo: { fechaEm: "2026-12-22" } });
    expect((await carregarCustosDoStaff(atrasada.pessoaId, DEPOIS_DO_PRAZO)).abertos).toEqual([]);
    expect(await um(`select count(*)::int as n from eventos.solicitacao_custo where pessoa_id = any($1)`, [[cedo.pessoaId, atrasada.pessoaId]])).toEqual({ n: 0 });

    // Fora do prazo, o registro em nome da pessoa pelo time continua funcionando.
    const peloTime = await registrarSolicitacao({ eventoId, pessoaId: atrasada.pessoaId, deslocamentos: [deslocamento], itens: [] }, doTime(), DEPOIS_DO_PRAZO);
    expect(await solicitacaoNoBanco(peloTime.id)).toMatchObject({ status_auditoria: "PENDENTE", registrado_por: timeId });
  });

  it("recusa quem não está na escala do evento", async () => {
    const fora = await staff("Fora da Escala", null);
    const recusa = solicitarCusto(envio(), fora.ator, DURANTE_O_PRAZO);
    await expect(recusa).rejects.toBeInstanceOf(RegraDeNegocioError);
    await expect(recusa).rejects.toThrow(/Você não está na escala deste evento/);
    expect(await carregarFormularioDoStaff(eventoId, fora.pessoaId, DURANTE_O_PRAZO)).toMatchObject({ situacao: "FORA_DA_ESCALA" });

    // Quem recusou o convite ou foi cancelado também não está na escala.
    for (const status of ["RECUSADA", "CANCELADA"]) {
      const saiu = await staff(`Saiu ${status}`, status);
      await expect(solicitarCusto(envio(), saiu.ator, DURANTE_O_PRAZO)).rejects.toThrow(/não está na escala/);
      expect((await carregarCustosDoStaff(saiu.pessoaId, DURANTE_O_PRAZO)).abertos).toEqual([]);
    }

    // Na escala de outro evento não vale para este; e a pessoa enviada é sempre a da sessão.
    const outro = await eventoCom("ASM_AM_903", "2026-12-16T12:00:00Z", "2026-12-16T22:00:00Z");
    const deOutro = await staff("De Outro Evento", "ACEITA", outro.escalaId);
    await expect(solicitarCusto(envio(), deOutro.ator, DURANTE_O_PRAZO)).rejects.toThrow(/não está na escala/);
    expect((await carregarCustosDoStaff(deOutro.pessoaId, DURANTE_O_PRAZO)).abertos.map((evento) => evento.codigo)).toEqual(["ASM_AM_903"]);

    // Evento cancelado não abre o formulário do staff, mesmo com a pessoa na escala e dentro do prazo.
    const cancelado = await eventoCom("ASM_AM_904", "2026-12-16T12:00:00Z", "2026-12-16T22:00:00Z");
    await teste.sql(`update eventos.evento set status = 'CANCELADO' where id = $1`, [cancelado.id]);
    const doCancelado = await staff("Do Cancelado", "ACEITA", cancelado.escalaId);
    await expect(solicitarCusto(envio({ eventoId: cancelado.id }), doCancelado.ator, DURANTE_O_PRAZO)).rejects.toThrow(/Este evento foi cancelado/);
    expect(await carregarFormularioDoStaff(cancelado.id, doCancelado.pessoaId, DURANTE_O_PRAZO)).toMatchObject({ situacao: "CANCELADO" });
    expect((await carregarCustosDoStaff(doCancelado.pessoaId, DURANTE_O_PRAZO)).abertos).toEqual([]);

    expect(await carregarFormularioDoStaff("nao-e-uuid", fora.pessoaId, DURANTE_O_PRAZO)).toEqual({ situacao: "NAO_ENCONTRADO" });
    expect(await carregarFormularioDoStaff("0192f0c0-0000-7000-8000-00000000dead", fora.pessoaId, DURANTE_O_PRAZO)).toEqual({ situacao: "NAO_ENCONTRADO" });
  });

  it("não duplica: uma solicitação por pessoa e evento, enviada por ela ou registrada pelo time", async () => {
    const bia = await staff("Bia Duplicada");
    const primeira = await solicitarCusto(envio(), bia.ator, DURANTE_O_PRAZO);
    const segunda = solicitarCusto(envio({ despesas: [] }), bia.ator, DURANTE_O_PRAZO);
    await expect(segunda).rejects.toBeInstanceOf(RegraDeNegocioError);
    await expect(segunda).rejects.toThrow(`Já existe a solicitação ${primeira.protocolo} em seu nome para este evento.`);
    await expect(registrarSolicitacao({ eventoId, pessoaId: bia.pessoaId, deslocamentos: [deslocamento], itens: [] }, doTime(), DURANTE_O_PRAZO)).rejects.toThrow(primeira.protocolo);

    const caio = await staff("Caio Pelo Time");
    const peloTime = await registrarSolicitacao({ eventoId, pessoaId: caio.pessoaId, deslocamentos: [deslocamento], itens: [] }, doTime(), DURANTE_O_PRAZO);
    await expect(solicitarCusto(envio(), caio.ator, DURANTE_O_PRAZO)).rejects.toThrow(peloTime.protocolo);
    expect(await carregarFormularioDoStaff(eventoId, caio.pessoaId, DURANTE_O_PRAZO)).toMatchObject({ situacao: "ENVIADA", solicitacao: { protocolo: peloTime.protocolo, registradaPeloTime: true } });

    expect(await um(`select count(*)::int as n from eventos.solicitacao_custo where pessoa_id = any($1)`, [[bia.pessoaId, caio.pessoaId]])).toEqual({ n: 2 });
  });

  it("reprovada: a pessoa vê o motivo, corrige dentro do prazo e a solicitação volta para a fila", async () => {
    const duda = await staff("Duda Corrige");
    const { id, protocolo } = await solicitarCusto(envio(), duda.ator, DURANTE_O_PRAZO);
    const versao = async () => (await carregarSolicitacao(protocolo))!.atualizadoEm;
    const correcao = async (mudanca: Record<string, unknown> = {}) => ({ eventoId, atualizadoEm: await versao(), deslocamentos: [], despesas: [{ descricao: "Ônibus", valorCentavos: 8000 }], ...mudanca });

    // Pendente não se corrige (como no registro do time): só depois de reprovada.
    await expect(corrigirMeuCusto(await correcao(), duda.ator, DURANTE_O_PRAZO)).rejects.toThrow(/Só dá para corrigir uma solicitação reprovada/);

    // A auditoria costuma acontecer depois do prazo do evento: a correção conta 5 dias da reprovação.
    const reprovadaEm = new Date("2027-01-04T14:00:00Z");
    await reprovarSolicitacao({ solicitacaoId: id, atualizadoEm: await versao(), motivo: "Não foi de carro neste evento" }, auditor(), reprovadaEm);
    expect(await carregarFormularioDoStaff(eventoId, duda.pessoaId, new Date("2027-01-05T12:00:00Z"))).toMatchObject({
      situacao: "ENVIADA",
      correcao: { pode: true, ate: "2027-01-09" },
      solicitacao: { auditoria: "REPROVADO", motivoDaReprovacao: "Não foi de carro neste evento" },
    });

    const foraDoPrazo = new Date("2027-01-10T03:00:00Z");
    await expect(corrigirMeuCusto(await correcao(), duda.ator, foraDoPrazo)).rejects.toThrow(/prazo para corrigir esta solicitação acabou/);
    expect(await carregarFormularioDoStaff(eventoId, duda.pessoaId, foraDoPrazo)).toMatchObject({ situacao: "ENVIADA", correcao: { pode: false, ate: "2027-01-09" } });

    const noPrazo = new Date("2027-01-10T02:59:59Z");
    await expect(corrigirMeuCusto(await correcao({ atualizadoEm: "2020-01-01T00:00:00.000Z" }), duda.ator, noPrazo)).rejects.toBeInstanceOf(ConflitoDeVersaoError);
    await corrigirMeuCusto(await correcao(), duda.ator, noPrazo);
    expect(await solicitacaoNoBanco(id)).toEqual({ status_auditoria: "PENDENTE", registrado_por: null, total_centavos: 8000 });
    expect(await um(`select count(*)::int as n from eventos.deslocamento where solicitacao_id = $1`, [id])).toEqual({ n: 0 });
    expect(
      await teste.sql(`select acao, usuario_id, em_nome_de_pessoa_id, dados->>'propria' as propria from eventos.registro_acao where entidade_id = $1 and acao = 'CORRECAO_REGISTRADA'`, [id]),
    ).toEqual([{ acao: "CORRECAO_REGISTRADA", usuario_id: duda.usuarioId, em_nome_de_pessoa_id: null, propria: "true" }]);

    // Outra pessoa do time audita normalmente a solicitação enviada pelo staff.
    await expect(aprovarSolicitacao({ solicitacaoId: id, atualizadoEm: await versao() }, auditor(), noPrazo)).resolves.toMatchObject({ situacao: { auditoria: "APROVADO" } });
    await expect(corrigirMeuCusto(await correcao(), duda.ator, noPrazo)).rejects.toThrow(/Só dá para corrigir uma solicitação reprovada/);
  });

  it("a correção do staff troca só o que é dele: os itens lançados pelo time ficam", async () => {
    const edu = await staff("Edu Com Itens");
    const { id, protocolo } = await registrarSolicitacao(
      {
        eventoId,
        pessoaId: edu.pessoaId,
        deslocamentos: [deslocamento],
        itens: [
          { categoria: "REMUNERACAO", descricao: "Remuneração", quantidade: 1, valorCentavos: 60000 },
          { categoria: "OUTRO", descricao: "Estacionamento", quantidade: 2, valorCentavos: 2500 },
        ],
      },
      doTime(),
      DURANTE_O_PRAZO,
    );
    const versao = async () => (await carregarSolicitacao(protocolo))!.atualizadoEm;
    await reprovarSolicitacao({ solicitacaoId: id, atualizadoEm: await versao(), motivo: "Estacionamento foi um dia só" }, auditor(), DURANTE_O_PRAZO);

    const reprovada = await carregarFormularioDoStaff(eventoId, edu.pessoaId, DURANTE_O_PRAZO);
    expect(reprovada).toMatchObject({
      situacao: "ENVIADA",
      correcao: { pode: true },
      solicitacao: { registradaPeloTime: true, despesas: [{ descricao: "Estacionamento", valorCentavos: 5000 }], itensDoTime: [{ categoria: "REMUNERACAO", totalCentavos: 60000 }] },
    });

    await corrigirMeuCusto({ eventoId, atualizadoEm: await versao(), deslocamentos: [deslocamento], despesas: [estacionamento] }, edu.ator, DURANTE_O_PRAZO);
    expect(await teste.sql(`select categoria, valor_centavos from eventos.custo_item where solicitacao_id = $1 order by categoria`, [id])).toEqual([
      { categoria: "OUTRO", valor_centavos: 2500 },
      { categoria: "REMUNERACAO", valor_centavos: 60000 },
    ]);
    // A última versão é da própria pessoa: sai o selo; quem registrou antes continua sem poder auditar (SoD-2).
    expect(await solicitacaoNoBanco(id)).toEqual({ status_auditoria: "PENDENTE", registrado_por: null, total_centavos: 6000 + 2000 + 8000 + 60000 + 2500 });
    await expect(aprovarSolicitacao({ solicitacaoId: id, atualizadoEm: await versao() }, doTime(), DURANTE_O_PRAZO)).rejects.toThrow(/Quem registrou ou corrigiu/);
    // E ninguém audita o próprio custo (SoD-3), mesmo tendo enviado pelo formulário.
    await expect(aprovarSolicitacao({ solicitacaoId: id, atualizadoEm: await versao() }, { ...edu.ator, email: null }, DURANTE_O_PRAZO)).rejects.toThrow(/próprio custo/);
  });
});
