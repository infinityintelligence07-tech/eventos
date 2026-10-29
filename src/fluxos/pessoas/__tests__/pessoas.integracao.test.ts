import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

import type * as Base from "@/fluxos/_base";
import { RegraDeNegocioError } from "@/fluxos/_base";
import { lerFiltrosDaLista } from "@/modules/pessoas";
import { type BancoDeTeste, criarBancoDeTeste, TEST_DATABASE_URL } from "@/test/banco";

import { carregarPessoa, definirFuncoes, listarPessoas, salvarCoordenadas, salvarPerfilDoStaff, salvarVeiculo } from "..";

// A guarda de escrita tem testes próprios (src/fluxos/_base); aqui o fluxo roda direto no banco descartável.
const teste = vi.hoisted(() => ({ banco: null as BancoDeTeste | null }));
vi.mock("@/fluxos/_base", async (importOriginal) => {
  const real = await importOriginal<typeof Base>();
  return {
    ...real,
    bancoParaLeitura: async () => teste.banco!.db,
    // A transação real (limite e "sem registro, desfaz"), no banco de teste.
    transacao: async (_ator: unknown, trabalho: (tx: never) => Promise<unknown>) => (await import("@/fluxos/_base/banco")).transacaoNoBanco(teste.banco!.db, trabalho as never),
  };
});

describe.skipIf(!TEST_DATABASE_URL)("fluxos de Pessoas no banco", () => {
  const agora = new Date("2026-11-01T15:00:00Z");
  let ana: string;
  let bruno: string;
  let semStaff: string;
  let staffId: string;
  let djId: string;

  const um = async (texto: string, params: unknown[] = []) => ((await teste.banco!.sql(texto, params)) as Record<string, unknown>[])[0]!;

  async function pessoa(nome: string, { staff = true, nomeSocial = null as string | null } = {}): Promise<string> {
    const { id } = await um(`insert into core.pessoa (nome_completo, nome_social, telefone, email) values ($1, $2, '(11) 90000-0001', 'p@exemplo.test') returning id`, [
      nome,
      nomeSocial,
    ]);
    if (staff) await teste.banco!.sql(`insert into eventos.pessoa_evento (pessoa_id) values ($1)`, [id]);
    return id as string;
  }

  async function convocar(pessoaId: string, codigo: string, inicio: string, status: string, funcaoId: string | null = null): Promise<void> {
    const { id: eventoId } = await um(
      `insert into eventos.evento (nome, codigo, inicio, fim, status) values ($1, $1, $2::timestamptz, $2::timestamptz + interval '1 day', 'PLANEJADO') returning id`,
      [codigo, inicio],
    );
    const { id: escalaId } = await um(
      `insert into eventos.escala (evento_id, data, hora_inicio, hora_fim, quantidade_vagas, status, funcao_id) values ($1, $2::date, '08:00', '18:00', 3, 'ABERTA', $3) returning id`,
      [eventoId, inicio, funcaoId],
    );
    await teste.banco!.sql(`insert into eventos.convocacao (escala_id, pessoa_id, status) values ($1, $2, $3)`, [escalaId, pessoaId, status]);
  }

  let usuarioId: string;
  const ator = () => ({ usuarioId, pessoaId: null, origem: "LOCAL" as const });

  beforeAll(async () => {
    teste.banco = await criarBancoDeTeste();
    usuarioId = ((await teste.banco.sql(`insert into core.usuario (email) values ('time@exemplo.test') returning id`)) as [{ id: string }])[0].id;
    ana = await pessoa("Ana Maria Teste", { nomeSocial: "Ana" });
    bruno = await pessoa("Bruno Teste");
    semStaff = await pessoa("Só no GH", { staff: false });
    staffId = (await um(`select id from eventos.funcao where codigo = 'STAFF'`)).id as string;
    djId = (await um(`select id from eventos.funcao where codigo = 'DJ'`)).id as string;
    const { id: poloId } = await um(`insert into core.polo (codigo, nome) values ('AM', 'Americana') returning id`);
    await teste.banco.sql(`insert into core.vinculo (pessoa_id, tipo, polo_id, data_inicio, status) values ($1, 'STAFF', $2, '2025-01-01', 'ATIVO')`, [ana, poloId]);
    await convocar(ana, "ASM_AM_230", "2026-09-10T03:00:00Z", "ACEITA", staffId);
    await convocar(ana, "ASM_AM_231", "2026-10-10T03:00:00Z", "RECUSADA", staffId);
    await convocar(ana, "ASM_AM_240", "2026-12-10T03:00:00Z", "SUGERIDA", djId);
  }, 60_000);

  afterAll(async () => {
    await teste.banco?.encerrar();
  });

  it("lista só o staff, com polo, último evento e pendências", async () => {
    const lista = await listarPessoas(lerFiltrosDaLista({}), agora);
    expect(lista.totalDoStaff).toBe(2);
    expect(lista.pessoas.map((item) => [item.nome, item.poloCodigo, item.ultimoEvento?.codigo ?? null, item.pendencias])).toEqual([
      ["Ana", "AM", "ASM_AM_230", ["SEXO", "CAMISETA", "FUNCAO", "LOCALIZACAO"]],
      ["Bruno Teste", null, null, ["SEXO", "CAMISETA", "FUNCAO", "LOCALIZACAO"]],
    ]);
    expect((await listarPessoas(lerFiltrosDaLista({ polo: "AM" }), agora)).pessoas.map((item) => item.pessoaId)).toEqual([ana]);
    expect(lista.opcoes.funcoes.length).toBeGreaterThan(10);
  });

  it("ficha: dados do GH só leitura e histórico do mais recente para o mais antigo", async () => {
    const ficha = (await carregarPessoa(ana, agora))!;
    expect(ficha).toMatchObject({ nome: "Ana", nomeCompleto: "Ana Maria Teste", telefone: "(11) 90000-0001", poloNome: "Americana" });
    expect(ficha.historico.map((item) => [item.eventoCodigo, item.funcao, item.situacao])).toEqual([
      ["ASM_AM_240", "DJ", "SUGERIDA"],
      ["ASM_AM_231", "Staff", "RECUSADA"],
      ["ASM_AM_230", "Staff", "ACEITA"],
    ]);
    expect(await carregarPessoa(semStaff, agora)).toBeNull();
    expect(await carregarPessoa("nao-e-uuid", agora)).toBeNull();
  });

  it("completar o perfil: sexo, camiseta, funções, veículo e coordenadas", async () => {
    await salvarPerfilDoStaff(
      { pessoaId: bruno, sexo: "M", camisetaModelo: "CAMISETA", camisetaTamanho: "G", possuiCamiseta: true, fezConfronto: false, temCnpj: null },
      ator(),
      agora,
    );
    await expect(
      definirFuncoes({
        pessoaId: bruno,
        funcoes: [
          { funcaoId: staffId, nivel: "HABILITADO" },
          { funcaoId: djId, nivel: "TRAINEE" },
        ],
      }, ator(), agora),
    ).resolves.toEqual({ nome: "Bruno Teste", quantidade: 2 });
    await salvarVeiculo({ pessoaId: bruno, temCarro: "SIM", lugares: 4, consumoKmL: null }, ator(), agora);

    let ficha = (await carregarPessoa(bruno, agora))!;
    expect(ficha.perfil).toMatchObject({ sexo: "M", camisetaModelo: "CAMISETA", camisetaTamanho: "G", possuiCamiseta: true, fezConfronto: false });
    expect(ficha.funcoes.map((item) => [item.codigo, item.nivel])).toEqual([
      ["DJ", "TRAINEE"],
      ["STAFF", "HABILITADO"],
    ]);
    expect(ficha.veiculo).toEqual({ lugares: 4, consumoKmL: null });
    expect(ficha.pendencias).toEqual(["LOCALIZACAO", "CONSUMO_DO_CARRO"]);

    await salvarVeiculo({ pessoaId: bruno, temCarro: "SIM", lugares: 5, consumoKmL: 10.5 }, ator(), agora);
    await salvarCoordenadas({ pessoaId: bruno, lat: -22.7349, lng: -47.3311 }, ator(), agora);
    await definirFuncoes({ pessoaId: bruno, funcoes: [{ funcaoId: staffId, nivel: "TRAINEE" }] }, ator(), agora);
    ficha = (await carregarPessoa(bruno, agora))!;
    expect(ficha.veiculo).toEqual({ lugares: 5, consumoKmL: 10.5 });
    expect(ficha.perfil).toMatchObject({ lat: -22.7349, lng: -47.3311 });
    expect(ficha.funcoes.map((item) => [item.codigo, item.nivel])).toEqual([["STAFF", "TRAINEE"]]);
    expect(ficha.pendencias).toEqual([]);

    await salvarVeiculo({ pessoaId: bruno, temCarro: "NAO" }, ator(), agora);
    expect((await carregarPessoa(bruno, agora))!.veiculo).toBeNull();
    expect(await teste.banco!.sql(`select nome_completo from core.pessoa where id = $1`, [bruno])).toEqual([{ nome_completo: "Bruno Teste" }]);

    // Trilha (docs/09 §7.1): PESSOA com o nome dos campos, nunca o valor; coordenadas não entram.
    const registros = (await teste.banco!.sql(
      `select acao, usuario_id, dados from eventos.registro_acao where entidade = 'PESSOA' and entidade_id = $1 order by criado_em, acao`,
      [bruno],
    )) as { acao: string; usuario_id: string; dados: Record<string, unknown> }[];
    expect(registros.map((registro) => registro.acao)).toEqual([
      "PERFIL_ALTERADO",
      "FUNCOES_DEFINIDAS",
      "VEICULO_SALVO",
      "VEICULO_SALVO",
      "COORDENADAS_ALTERADAS",
      "FUNCOES_DEFINIDAS",
      "VEICULO_REMOVIDO",
    ]);
    expect(registros.every((registro) => registro.usuario_id === usuarioId)).toBe(true);
    expect(registros[0]!.dados).toEqual({ campos: ["sexo", "camisetaModelo", "camisetaTamanho", "possuiCamiseta", "fezConfronto"] });
    expect(registros.slice(2, 5).map((registro) => registro.dados)).toEqual([
      { campos: ["lugares"] },
      { campos: ["lugares", "consumoKmL"] },
      {},
    ]);
    expect(registros[6]!.dados).toEqual({});
    const texto = JSON.stringify(registros.map((registro) => registro.dados));
    expect(texto).not.toMatch(/"M"|CAMISETA"|"G"|-22\.73|-47\.33|10\.5|:\s*[45]\b/);
  });

  it("recusa quem não é staff e função inexistente, sem gravar nada", async () => {
    await expect(salvarVeiculo({ pessoaId: semStaff, temCarro: "SIM", lugares: 4, consumoKmL: null }, ator(), agora)).rejects.toEqual(
      new RegraDeNegocioError("Pessoa não encontrada."),
    );
    await expect(definirFuncoes({ pessoaId: ana, funcoes: [{ funcaoId: "7e570000-0000-7000-8000-00000000ffff", nivel: "HABILITADO" }] }, ator(), agora)).rejects.toEqual(
      new RegraDeNegocioError("Alguma função escolhida não existe mais. Recarregue a página."),
    );
    expect(await teste.banco!.sql(`select 1 from eventos.pessoa_veiculo where pessoa_id = $1`, [semStaff])).toEqual([]);
  });
});
