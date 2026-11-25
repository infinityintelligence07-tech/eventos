import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

import type * as Base from "@/fluxos/_base";
import { RegraDeNegocioError } from "@/fluxos/_base";
import { ajustarLocalDoIamControlSchema, salvarLocalSchema } from "@/modules/eventos";
import { type BancoDeTeste, criarBancoDeTeste, TEST_DATABASE_URL } from "@/test/banco";

import { ajustarLocalDoIamControl, arquivarLocal, listarLocais, salvarLocal } from "..";

// A guarda de escrita tem testes próprios (src/fluxos/_base); aqui o fluxo roda direto no banco descartável.
const teste = vi.hoisted(() => ({ banco: null as BancoDeTeste | null }));
vi.mock("@/fluxos/_base", async (importOriginal) => {
  const real = await importOriginal<typeof Base>();
  return {
    ...real,
    bancoParaLeitura: async () => teste.banco!.db,
    situacaoDaEscrita: async () => ({ liberada: true }),
    // A transação real (limite e "sem registro, desfaz"), no banco de teste.
    transacao: async (_ator: unknown, trabalho: (tx: never) => Promise<unknown>) => (await import("@/fluxos/_base/banco")).transacaoNoBanco(teste.banco!.db, trabalho as never),
  };
});

describe.skipIf(!TEST_DATABASE_URL)("Locais e hotéis no banco", () => {
  const agora = new Date("2026-11-05T15:00:00Z");
  const banco = () => teste.banco!;
  const formulario = (dados: Record<string, string>) => salvarLocalSchema.parse(dados);

  let usuarioId: string;
  const ator = () => ({ usuarioId, pessoaId: null, origem: "LOCAL" as const });

  beforeAll(async () => {
    teste.banco = await criarBancoDeTeste();
    usuarioId = ((await teste.banco.sql(`insert into core.usuario (email) values ('time@exemplo.test') returning id`)) as [{ id: string }])[0].id;
  }, 60_000);

  afterAll(async () => {
    await teste.banco?.encerrar();
  });

  it("cadastra um hotel, edita e lista com filtro e busca", async () => {
    const id = await salvarLocal(
      formulario({ nome: "Hotel Central", tipo: "HOTEL", cep: "69005010", logradouro: "Av. Brasil", numero: "100", cidade: "Manaus", uf: "am", capacidade: "120" }),
      ator(),      agora,
    );
    expect((await banco().sql(`select nome, tipo, cep, uf, lat, capacidade from eventos.local where id = $1`, [id]))[0]).toEqual({
      nome: "Hotel Central",
      tipo: "HOTEL",
      cep: "69005-010",
      uf: "AM",
      lat: null,
      capacidade: 120,
    });

    await salvarLocal(formulario({ localId: id, nome: "Hotel Central", tipo: "HOTEL", cidade: "Manaus", uf: "AM", lat: "-3,119", lng: "-60,02" }), ator(), agora);
    const { locais } = await listarLocais({ tipo: "HOTEL", busca: "centr" });
    expect(locais).toEqual([
      expect.objectContaining({ id, lat: -3.119, lng: -60.02, logradouro: null, capacidade: null, uso: { eventos: 0, hospedagens: 0 }, motivoParaNaoArquivar: null }),
    ]);
    expect((await listarLocais({ tipo: "EVENTO", busca: "centr" })).locais).toEqual([]);
    expect((await listarLocais({ busca: "100%" })).locais).toEqual([]);
  });

  it("recusa outro local do mesmo tipo com o mesmo nome na mesma cidade", async () => {
    await expect(salvarLocal(formulario({ nome: "hotel central", tipo: "HOTEL", cidade: "MANAUS", uf: "AM" }), ator(), agora)).rejects.toEqual(
      new RegraDeNegocioError('Já existe "hotel central" em MANAUS/AM. Edite o cadastro existente.'),
    );
    await expect(salvarLocal(formulario({ nome: "Hotel Central", tipo: "APARTAMENTO", cidade: "Manaus", uf: "AM" }), ator(), agora)).resolves.toBeTypeOf("string");
  });

  it("local em uso não é arquivado; sem uso, some da lista", async () => {
    const emUso = await salvarLocal(formulario({ nome: "Centro de Convenções", tipo: "EVENTO", cidade: "Manaus", uf: "AM" }), ator(), agora);
    await banco().sql(`insert into eventos.evento (nome, inicio, fim, status, local_id) values ('Evento', now(), now(), 'PLANEJADO', $1)`, [emUso]);
    await expect(arquivarLocal(emUso, ator(), agora)).rejects.toEqual(new RegraDeNegocioError("Este local está em 1 evento."));
    expect((await listarLocais({ busca: "Convenções" })).locais[0]).toMatchObject({ uso: { eventos: 1, hospedagens: 0 }, motivoParaNaoArquivar: "Este local está em 1 evento." });

    const livre = await salvarLocal(formulario({ nome: "Apartamento IAM", tipo: "APARTAMENTO", cidade: "Belém", uf: "PA" }), ator(), agora);
    await arquivarLocal(livre, ator(), agora);
    expect((await listarLocais({ busca: "Apartamento IAM" })).locais).toEqual([]);
    await expect(arquivarLocal(livre, ator(), agora)).rejects.toEqual(new RegraDeNegocioError("Este local não existe mais. Recarregue a página."));
    await expect(salvarLocal(formulario({ localId: livre, nome: "Apartamento IAM", tipo: "APARTAMENTO", cidade: "Belém", uf: "PA" }), ator(), agora)).rejects.toEqual(
      new RegraDeNegocioError("Este local não existe mais. Recarregue a página."),
    );
  });

  describe("local vindo do IAM Control", () => {
    let doIamControl: string;
    const ajuste = (dados: Record<string, string>) => ajustarLocalDoIamControlSchema.parse(dados);
    const noBanco = async (id: string) =>
      ((await banco().sql(`select nome, tipo, origem, logradouro, complemento, cidade, uf, cep, lat, lng, capacidade from eventos.local where id = $1`, [id])) as Record<string, unknown>[])[0]!;

    beforeAll(async () => {
      // Como a sincronização deixa: nome e endereço do IAM Control (o CEP vem só com números).
      doIamControl = (
        (await banco().sql(
          `insert into eventos.local (nome, tipo, origem, logradouro, numero, bairro, cidade, uf, cep, capacidade)
           values ('Hotel Sibara', 'EVENTO', 'IAM_CONTROL', 'Av. Brasil', '1500', 'Centro', 'Balneário Camboriú', 'SC', '88330000', 350) returning id`,
        )) as [{ id: string }]
      )[0].id;
    });

    it("a lista diz a origem de cada linha e filtra por ela", async () => {
      const todos = (await listarLocais({})).locais;
      expect(todos.find((local) => local.id === doIamControl)).toMatchObject({ nome: "Hotel Sibara", origem: "IAM_CONTROL", tipo: "EVENTO" });
      expect(todos.find((local) => local.nome === "Hotel Central")).toMatchObject({ origem: "EVENTOS" });
      expect((await listarLocais({ origem: "IAM_CONTROL" })).locais.map((local) => local.id)).toEqual([doIamControl]);
      expect((await listarLocais({ origem: "EVENTOS" })).locais.map((local) => local.id)).not.toContain(doIamControl);
    });

    it("nome e endereço não se editam no Eventos; o que é do Eventos (tipo, complemento, capacidade, localização) sim", async () => {
      await expect(
        salvarLocal(formulario({ localId: doIamControl, nome: "Outro Nome", tipo: "EVENTO", cidade: "Outra Cidade", uf: "SC", logradouro: "Rua X" }), ator(), agora),
      ).rejects.toEqual(new RegraDeNegocioError("Este local vem do IAM Control: nome e endereço mudam lá. Recarregue a página."));
      expect(await noBanco(doIamControl)).toMatchObject({ nome: "Hotel Sibara", cidade: "Balneário Camboriú", logradouro: "Av. Brasil" });

      await ajustarLocalDoIamControl(ajuste({ localId: doIamControl, tipo: "HOTEL", complemento: "Torre B", capacidade: "120", lat: "-26,99", lng: "-48,63" }), ator(), agora);
      expect(await noBanco(doIamControl)).toEqual({
        nome: "Hotel Sibara",
        origem: "IAM_CONTROL",
        logradouro: "Av. Brasil",
        cidade: "Balneário Camboriú",
        uf: "SC",
        cep: "88330000",
        tipo: "HOTEL",
        complemento: "Torre B",
        capacidade: 120,
        lat: -26.99,
        lng: -48.63,
      });
      const [registro] = (await banco().sql(
        `select acao, origem, usuario_id, dados from eventos.registro_acao where entidade = 'LOCAL' and entidade_id = $1 order by criado_em desc limit 1`,
        [doIamControl],
      )) as { acao: string; origem: string; usuario_id: string; dados: { mudancas: Record<string, unknown> } }[];
      expect(registro).toMatchObject({ acao: "LOCAL_ALTERADO", origem: "USUARIO", usuario_id: usuarioId });
      expect(Object.keys(registro!.dados.mudancas).sort()).toEqual(["capacidade", "complemento", "lat", "lng", "tipo"]);
    });

    it("o ajuste do IAM Control não serve para cadastro do Eventos, e a origem não muda pelo app", async () => {
      const hotel = (await listarLocais({ busca: "Hotel Central" })).locais[0]!;
      await expect(ajustarLocalDoIamControl(ajuste({ localId: hotel.id, tipo: "HOTEL" }), ator(), agora)).rejects.toEqual(
        new RegraDeNegocioError("Este local não vem do IAM Control. Recarregue a página."),
      );
      // O papel do app não tem UPDATE em origem nem no id do IAM Control (0005 + 0018): só a sincronização liga um cadastro.
      await expect(banco().comoPapel("app_eventos", `update eventos.local set origem = 'EVENTOS' where id = $1`, [doIamControl])).rejects.toThrow(/permission denied/);
      await expect(banco().comoPapel("app_eventos", `update eventos.local set iam_control_endereco_id = 1 where id = $1`, [doIamControl])).rejects.toThrow(/permission denied/);
      await banco().comoPapel("app_eventos", `update eventos.local set tipo = 'HOTEL', complemento = 'A', capacidade = 1, lat = 0, lng = 0, atualizado_em = now() where id = $1`, [doIamControl]);
      await banco().comoPapel("app_eventos_worker", `update eventos.local set origem = 'IAM_CONTROL', iam_control_endereco_id = 1 where id = $1`, [doIamControl]);
    });

    it("lugar que já veio do IAM Control não se cadastra de novo à mão (nem com outro tipo, acento ou maiúscula)", async () => {
      // Volta a local de evento para o teste do tipo.
      await ajustarLocalDoIamControl(ajuste({ localId: doIamControl, tipo: "EVENTO" }), ator(), agora);
      await expect(salvarLocal(formulario({ nome: "hotel  SIBARA", tipo: "HOTEL", cidade: "Balneario Camboriu", uf: "SC" }), ator(), agora)).rejects.toEqual(
        new RegraDeNegocioError(
          '"hotel  SIBARA" em Balneario Camboriu/SC já veio do IAM Control como local de evento. Edite esse cadastro em vez de criar outro (para hospedar o staff nele, mude o tipo para Hotel).',
        ),
      );
      // Renomear um cadastro do Eventos para o nome de um local do IAM Control também é recusado.
      const outro = await salvarLocal(formulario({ nome: "Hotel Praia", tipo: "HOTEL", cidade: "Balneário Camboriú", uf: "SC" }), ator(), agora);
      await expect(salvarLocal(formulario({ localId: outro, nome: "Hotel Sibara", tipo: "HOTEL", cidade: "Balneário Camboriú", uf: "SC" }), ator(), agora)).rejects.toThrow(/já veio do IAM Control/);
      // Apartamento da IAM com o mesmo nome é outra coisa, e continua permitido.
      await expect(salvarLocal(formulario({ nome: "Hotel Sibara", tipo: "APARTAMENTO", cidade: "Balneário Camboriú", uf: "SC" }), ator(), agora)).resolves.toBeTypeOf("string");
    });

    it("cadastro antigo com o mesmo nome de um local do IAM Control continua editável até a sincronização ligá-lo", async () => {
      const antigo = ((await banco().sql(`insert into eventos.local (nome, tipo, cidade, uf) values ('Hotel Sibara', 'HOTEL', 'Balneário Camboriú', 'SC') returning id`)) as [{ id: string }])[0].id;
      await salvarLocal(formulario({ localId: antigo, nome: "Hotel Sibara", tipo: "HOTEL", cidade: "Balneário Camboriú", uf: "SC", lat: "-26,99", lng: "-48,63" }), ator(), agora);
      expect(await noBanco(antigo)).toMatchObject({ origem: "EVENTOS", lat: -26.99 });
    });

    it("com hospedagem, o tipo não muda (nem no que veio do IAM Control, nem no cadastro do Eventos)", async () => {
      await ajustarLocalDoIamControl(ajuste({ localId: doIamControl, tipo: "HOTEL" }), ator(), agora);
      const [{ id: eventoId }] = (await banco().sql(`insert into eventos.evento (nome, inicio, fim, status) values ('Evento com hotel', now(), now(), 'PLANEJADO') returning id`)) as [{ id: string }];
      const doEventos = await salvarLocal(formulario({ nome: "Hotel Do Time", tipo: "HOTEL", cidade: "Balneário Camboriú", uf: "SC" }), ator(), agora);
      await banco().sql(`insert into eventos.hospedagem (evento_id, local_id, check_in, check_out) values ($1, $2, '2026-12-11', '2026-12-15'), ($1, $3, '2026-12-11', '2026-12-15')`, [eventoId, doIamControl, doEventos]);

      const recusa = new RegraDeNegocioError("Este local tem hospedagem: o tipo não muda enquanto ela existir.");
      await expect(ajustarLocalDoIamControl(ajuste({ localId: doIamControl, tipo: "EVENTO" }), ator(), agora)).rejects.toEqual(recusa);
      await expect(salvarLocal(formulario({ localId: doEventos, nome: "Hotel Do Time", tipo: "APARTAMENTO", cidade: "Balneário Camboriú", uf: "SC" }), ator(), agora)).rejects.toEqual(recusa);
      // O resto continua editável.
      await ajustarLocalDoIamControl(ajuste({ localId: doIamControl, tipo: "HOTEL", capacidade: "90" }), ator(), agora);
      expect(await noBanco(doIamControl)).toMatchObject({ tipo: "HOTEL", capacidade: 90 });
      await expect(arquivarLocal(doIamControl, ator(), agora)).rejects.toEqual(new RegraDeNegocioError("Este local está em 1 hospedagem."));
    });
  });
});
