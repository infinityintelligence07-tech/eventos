import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

import type * as Base from "@/fluxos/_base";
import { RegraDeNegocioError } from "@/fluxos/_base";
import { type BancoDeTeste, criarBancoDeTeste, TEST_DATABASE_URL } from "@/test/banco";

import {
  abrirEnquete,
  alterarEnquete,
  carregarEnquete,
  carregarNovaEnquete,
  encerrarEnquete,
  listarEnquetes,
  registrarDisponibilidade,
  resumoParaInicio,
} from "..";

// A guarda de escrita tem testes próprios (src/fluxos/_base); aqui o fluxo roda direto no banco descartável.
const teste = vi.hoisted(() => ({ banco: null as BancoDeTeste | null }));
vi.mock("@/fluxos/_base", async (importOriginal) => {
  const real = await importOriginal<typeof Base>();
  return {
    ...real,
    bancoParaLeitura: async () => teste.banco!.db,
    transacao: (trabalho: (tx: Base.Executor) => Promise<unknown>) => teste.banco!.db.transaction(trabalho),
  };
});

describe.skipIf(!TEST_DATABASE_URL)("fluxos da Disponibilidade no banco", () => {
  const agora = new Date("2026-11-01T15:00:00Z");
  let usuarioId: string;
  let ana: string;
  let bruno: string;
  let inativa: string;
  let confronto: string;
  let asm: string;
  let cancelado: string;

  const um = async (texto: string, params: unknown[] = []) => ((await teste.banco!.sql(texto, params)) as Record<string, string>[])[0]!;

  async function staff(nome: string, ativo = true): Promise<string> {
    const { id } = await um(`insert into core.pessoa (nome_completo, ativo) values ($1, $2) returning id`, [nome, ativo]);
    await teste.banco!.sql(`insert into eventos.pessoa_evento (pessoa_id) values ($1)`, [id]);
    return id!;
  }

  async function evento(nome: string, codigo: string, inicio: string, status = "PLANEJADO"): Promise<string> {
    return (
      await um(`insert into eventos.evento (nome, codigo, inicio, fim, status) values ($1, $2, $3::timestamptz, $3::timestamptz + interval '1 day', $4) returning id`, [
        nome,
        codigo,
        inicio,
        status,
      ])
    ).id!;
  }

  beforeAll(async () => {
    teste.banco = await criarBancoDeTeste();
    usuarioId = (await um(`insert into core.usuario (email) values ('time@exemplo.test') returning id`)).id!;
    ana = await staff("Ana Teste");
    bruno = await staff("Bruno Teste");
    inativa = await staff("Inativa Teste", false);
    const { id: poloId } = await um(`insert into core.polo (codigo, nome) values ('AM', 'Americana') returning id`);
    await teste.banco.sql(`insert into core.vinculo (pessoa_id, tipo, polo_id, data_inicio, status) values ($1, 'STAFF', $2, '2025-01-01', 'ATIVO')`, [ana, poloId]);
    confronto = await evento("Confronto ed. 60", "CONF_AM_60", "2026-11-12T03:00:00Z");
    asm = await evento("ASM ed. 235", "ASM_AM_235", "2026-11-20T03:00:00Z");
    cancelado = await evento("ASM cancelado", "ASM_AM_236", "2026-11-25T03:00:00Z", "CANCELADO");
  }, 60_000);

  afterAll(async () => {
    await teste.banco?.encerrar();
  });

  it("Nova enquete: eventos do período sem os cancelados; abrir cria a enquete com os eventos", async () => {
    const nova = await carregarNovaEnquete({ de: "2026-11-01", ate: "2026-11-30" }, agora);
    expect(nova.eventos.map((item) => item.codigo)).toEqual(["CONF_AM_60", "ASM_AM_235"]);
    expect(nova.tituloSugerido).toBe("Eventos de 01/11 a 30/11");
    expect(nova.eventos.map((item) => item.id)).not.toContain(cancelado);

    const enqueteId = await abrirEnquete({ titulo: "Novembro", fechaEm: new Date("2026-11-08T02:59:00Z"), eventoIds: [confronto, asm] }, usuarioId, agora);
    const lista = await listarEnquetes(null, agora);
    expect(lista.enquetes).toEqual([expect.objectContaining({ id: enqueteId, situacao: "ABERTA", eventos: 2, responderam: 0 })]);
    expect(lista.totalDeStaff).toBe(2);
    expect((await um(`select criado_por from eventos.enquete where id = $1`, [enqueteId])).criado_por).toBe(usuarioId);

    await expect(abrirEnquete({ titulo: "Passado", fechaEm: new Date("2026-10-01T00:00:00Z"), eventoIds: [asm] }, usuarioId, agora)).rejects.toEqual(
      new RegraDeNegocioError("Escolha uma data a partir de hoje."),
    );
  });

  it("Registrar resposta em nome da pessoa: grava registrado_por, registro_acao e aparece na matriz com o selo", async () => {
    const enqueteId = await abrirEnquete({ titulo: "Registro", fechaEm: new Date("2026-11-08T02:59:00Z"), eventoIds: [confronto, asm] }, usuarioId, agora);

    const resultado = await registrarDisponibilidade(
      {
        enqueteId,
        pessoaId: ana,
        respostas: [
          { eventoId: confronto, resposta: "PODE" },
          { eventoId: asm, resposta: "NAO_PODE" },
        ],
      },
      usuarioId,
      agora,
    );
    expect(resultado).toEqual({ nome: "Ana Teste", gravadas: 2, apagadas: 0, foraDoPrazo: false });

    const gravadas = await teste.banco!.sql(
      `select evento_id, disponivel, registrado_por, enquete_id from eventos.disponibilidade where pessoa_id = $1 order by disponivel desc`,
      [ana],
    );
    expect(gravadas).toEqual([
      { evento_id: confronto, disponivel: true, registrado_por: usuarioId, enquete_id: enqueteId },
      { evento_id: asm, disponivel: false, registrado_por: usuarioId, enquete_id: enqueteId },
    ]);
    const registros = await teste.banco!.sql(
      `select acao, status_de, status_para, em_nome_de_pessoa_id, usuario_id from eventos.registro_acao where entidade = 'DISPONIBILIDADE' and entidade_id = $1 order by status_para`,
      [enqueteId],
    );
    expect(registros).toEqual([
      { acao: "RESPOSTA_REGISTRADA", status_de: "SEM_RESPOSTA", status_para: "NAO_PODE", em_nome_de_pessoa_id: ana, usuario_id: usuarioId },
      { acao: "RESPOSTA_REGISTRADA", status_de: "SEM_RESPOSTA", status_para: "PODE", em_nome_de_pessoa_id: ana, usuario_id: usuarioId },
    ]);

    const carregada = (await carregarEnquete(enqueteId, {}, agora))!;
    expect(carregada.responderam).toBe(1);
    expect(carregada.totalDeStaff).toBe(2);
    expect(carregada.linhas.map((linha) => [linha.pessoa.nome, linha.pessoa.poloCodigo, linha.respostas[confronto], linha.registradoPeloTimeEm !== null])).toEqual([
      ["Ana Teste", "AM", "PODE", true],
      ["Bruno Teste", null, "SEM_RESPOSTA", false],
    ]);
    expect(carregada.totais).toEqual([
      { eventoId: confronto, podem: 1, naoPodem: 0, semResposta: 1 },
      { eventoId: asm, podem: 0, naoPodem: 1, semResposta: 1 },
    ]);
    expect(carregada.convite).toContain("• CONF_AM_60 · Confronto ed. 60 · 12/11 a 13/11");
    expect((await carregarEnquete(enqueteId, { soSemResposta: true }, agora))!.linhas.map((linha) => linha.pessoa.nome)).toEqual(["Bruno Teste"]);

    // Mesma resposta não grava de novo; "Sem resposta" apaga.
    const segunda = await registrarDisponibilidade(
      {
        enqueteId,
        pessoaId: ana,
        respostas: [
          { eventoId: confronto, resposta: "PODE" },
          { eventoId: asm, resposta: "SEM_RESPOSTA" },
        ],
      },
      usuarioId,
      agora,
    );
    expect(segunda).toMatchObject({ gravadas: 0, apagadas: 1 });
    expect(await teste.banco!.sql(`select evento_id from eventos.disponibilidade where pessoa_id = $1`, [ana])).toEqual([{ evento_id: confronto }]);
  });

  it("recusa pessoa fora do staff ativo, evento fora da enquete e enquete inexistente", async () => {
    const enqueteId = await abrirEnquete({ titulo: "Recusas", fechaEm: new Date("2026-11-08T02:59:00Z"), eventoIds: [confronto] }, usuarioId, agora);
    await expect(
      registrarDisponibilidade({ enqueteId, pessoaId: inativa, respostas: [{ eventoId: confronto, resposta: "PODE" }] }, usuarioId, agora),
    ).rejects.toEqual(new RegraDeNegocioError("Esta pessoa não está no staff ativo."));
    await expect(
      registrarDisponibilidade({ enqueteId, pessoaId: bruno, respostas: [{ eventoId: asm, resposta: "PODE" }] }, usuarioId, agora),
    ).rejects.toEqual(new RegraDeNegocioError("Algum evento não faz parte desta enquete. Recarregue a página."));
    await expect(
      registrarDisponibilidade(
        { enqueteId: "7e570000-0000-7000-8000-00000000ffff", pessoaId: bruno, respostas: [{ eventoId: asm, resposta: "PODE" }] },
        usuarioId,
        agora,
      ),
    ).rejects.toEqual(new RegraDeNegocioError("Enquete não encontrada."));
    expect(await carregarEnquete("nao-e-uuid", {}, agora)).toBeNull();
  });

  it("encerrar, registrar fora do prazo e reabrir", async () => {
    const enqueteId = await abrirEnquete({ titulo: "Encerrar", fechaEm: new Date("2026-11-08T02:59:00Z"), eventoIds: [asm] }, usuarioId, agora);
    await encerrarEnquete({ enqueteId }, agora);
    expect((await carregarEnquete(enqueteId, {}, agora))!.situacao).toBe("ENCERRADA");
    await expect(encerrarEnquete({ enqueteId }, agora)).rejects.toEqual(new RegraDeNegocioError("A enquete já estava encerrada."));

    const depois = new Date(agora.getTime() + 60_000);
    const registro = await registrarDisponibilidade({ enqueteId, pessoaId: bruno, respostas: [{ eventoId: asm, resposta: "PODE" }] }, usuarioId, depois);
    expect(registro.foraDoPrazo).toBe(true);
    expect((await um(`select dados from eventos.registro_acao where entidade_id = $1 and em_nome_de_pessoa_id = $2`, [enqueteId, bruno])).dados).toEqual({
      foraDoPrazo: true,
    });

    await alterarEnquete({ enqueteId, fechaEm: new Date("2026-11-10T02:59:00Z") }, depois);
    expect((await carregarEnquete(enqueteId, {}, depois))!.situacao).toBe("ABERTA");
  });

  it("resumoParaInicio: só as abertas que fecham em até 3 dias", async () => {
    const fechaLogo = await abrirEnquete({ titulo: "Fecha logo", fechaEm: new Date("2026-11-03T15:00:00Z"), eventoIds: [asm] }, usuarioId, agora);
    await abrirEnquete({ titulo: "Fecha depois", fechaEm: new Date("2026-11-05T15:00:00Z"), eventoIds: [asm] }, usuarioId, agora);

    const [item] = await resumoParaInicio(agora);
    expect(item).toEqual({
      chave: "disponibilidade.enquetes-fechando",
      titulo: "Enquetes que fecham em até 3 dias",
      quantidade: 1,
      href: "/disponibilidade?situacao=abertas",
      exemplos: [{ rotulo: "Fecha logo", detalhe: "Fecha em 03/11 às 12:00", href: `/disponibilidade/${fechaLogo}` }],
    });
  });
});
