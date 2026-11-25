import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import type { TurmaRecebida } from "@/core/integrations/iam-control";
import { criarRepositorioVagas } from "@/modules/escala";
import { chaveDoLocal, criarRepositorioLocal, criarRepositorioSincronizacao } from "@/modules/eventos";
import { type BancoDeTeste, criarBancoDeTeste, TEST_DATABASE_URL } from "@/test/banco";
import { turmaDeExemplo } from "@/test/turmas";

import { sincronizarTurmas } from "../sincronizar-turmas";

type Local = {
  id: string;
  nome: string;
  tipo: string;
  origem: string;
  iam_control_endereco_id: number | null;
  logradouro: string | null;
  numero: string | null;
  complemento: string | null;
  bairro: string | null;
  cidade: string;
  uf: string;
  cep: string | null;
  lat: number | null;
  lng: number | null;
  capacidade: number | null;
  atualizado_em: string;
  arquivado: boolean;
};

// Locais e hotéis vindos do IAM Control: o local chega embutido na turma (GET /api/webhooks/eventos/turmas) e a
// sincronização o põe em eventos.local. O IAM Control é um dublê (listarTurmas devolve o que o teste montou), como nos
// testes das turmas; nada sai para a rede.
describe.skipIf(!TEST_DATABASE_URL)("locais e hotéis vindos do IAM Control no Postgres", () => {
  let banco: BancoDeTeste;
  // Com o papel do worker (0009): os privilégios dele em eventos.local e no histórico têm de bastar.
  let worker: ReturnType<BancoDeTeste["dbComoPapel"]>;
  let turmas: TurmaRecebida[] = [];

  // O histórico é só de inclusão e cita os eventos, então nada é apagado entre os testes: cada teste tem a sua
  // cidade, as suas turmas e as suas edições, e olha só para os locais da cidade dele.
  let mundo = 0;
  let cidade = "";
  let sibara: TurmaRecebida["local"];
  const semAcento = (texto: string) => texto.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  const turma = ({ id = 1, ...mudanca }: Partial<TurmaRecebida> = {}) =>
    turmaDeExemplo({
      polo: { id: 9, sigla: "BC", nome: "Balneário Camboriú", cidade, estado: "SC" },
      local: sibara,
      capacidade: 350,
      ...mudanca,
      id: mundo * 10 + id,
      edicao: String(mundo * 10 + id),
    });

  const sincronizar = (agora = "2026-10-26T15:00:00Z") =>
    sincronizarTurmas({
      iamControl: { listarTurmas: async () => ({ a_partir_de: "2026-09-26", ate: null, total: turmas.length, turmas }) },
      eventos: criarRepositorioSincronizacao(worker.db),
      vagas: criarRepositorioVagas(worker.db, { origem: "SISTEMA" }),
      agora: new Date(agora),
    });

  const locais = async () =>
    (await banco.sql(
      `select id, nome, tipo, origem, iam_control_endereco_id, logradouro, numero, complemento, bairro, cidade, uf, cep, lat, lng, capacidade,
              atualizado_em::text as atualizado_em, deleted_at is not null as arquivado
         from eventos.local where cidade ilike $1 or cidade ilike $2 order by criado_em, nome`,
      [`${cidade}%`, `${semAcento(cidade)}%`],
    )) as Local[];
  const local = async (id: string) => (await locais()).find((linha) => linha.id === id)!;
  const localDoEvento = async (turmaId: number) =>
    ((await banco.sql(`select local_id from eventos.evento where iam_control_turma_id = $1`, [mundo * 10 + turmaId])) as { local_id: string | null }[])[0]!.local_id;
  const cadastrarAMao = async (dados: Partial<Local> & { nome: string; tipo: string }) =>
    (
      (await banco.sql(
        `insert into eventos.local (nome, tipo, logradouro, numero, complemento, bairro, cidade, uf, cep, lat, lng, capacidade, criado_em, atualizado_em)
         values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, '2026-10-01T12:00:00Z', '2026-10-01T12:00:00Z') returning id`,
        [dados.nome, dados.tipo, dados.logradouro ?? null, dados.numero ?? null, dados.complemento ?? null, dados.bairro ?? null, dados.cidade ?? cidade, dados.uf ?? "SC", dados.cep ?? null, dados.lat ?? null, dados.lng ?? null, dados.capacidade ?? null],
      )) as { id: string }[]
    )[0]!.id;
  const historico = async (localId: string) =>
    (await banco.sql(`select acao, origem, usuario_id, dados from eventos.registro_acao where entidade = 'LOCAL' and entidade_id = $1 order by criado_em`, [localId])) as {
      acao: string;
      origem: string;
      usuario_id: string | null;
      dados: { mudancas?: Record<string, { de: unknown; para: unknown }> };
    }[];

  beforeAll(async () => {
    banco = await criarBancoDeTeste();
    worker = banco.dbComoPapel("app_eventos_worker");
    await banco.sql(`insert into core.polo (codigo, nome) values ('BC', 'Balneário Camboriú'), ('AM', 'Manaus')`);
  }, 60_000);

  afterAll(async () => {
    await worker?.encerrar();
    await banco?.encerrar();
  });

  beforeEach(() => {
    mundo += 1;
    cidade = `Balneário Camboriú ${mundo}`;
    sibara = { nome: "Hotel Sibara", logradouro: "Av. Brasil", numero: "1500", complemento: null, bairro: "Centro", cidade, estado: "SC", cep: "88330-000" };
    turmas = [];
  });

  it("cria o local do IAM Control com a origem, o endereço e os lugares, e o evento aponta para ele", async () => {
    turmas = [turma()];
    const resumo = await sincronizar();

    expect(resumo).toMatchObject({ criados: 1, falhas: [], locais: { criados: 1, vinculados: 0, atualizados: 0 } });
    const [criado, ...resto] = await locais();
    expect(resto).toEqual([]);
    expect(criado).toMatchObject({
      nome: "Hotel Sibara",
      tipo: "EVENTO",
      origem: "IAM_CONTROL",
      iam_control_endereco_id: null,
      logradouro: "Av. Brasil",
      numero: "1500",
      bairro: "Centro",
      cidade,
      uf: "SC",
      cep: "88330000",
      capacidade: 350,
      lat: null,
      arquivado: false,
    });
    expect(await localDoEvento(1)).toBe(criado!.id);
    // Local criado pela sincronização não tem autor: nada no histórico (como já era).
    expect(await historico(criado!.id)).toEqual([]);
  });

  it("rodar duas vezes não duplica nem regrava o local, mesmo com várias turmas no mesmo lugar", async () => {
    turmas = [turma(), turma({ id: 2, local: { ...sibara, nome: "HOTEL  SIBARA", cidade: semAcento(cidade).toUpperCase() } })];
    expect((await sincronizar()).locais).toEqual({ criados: 1, vinculados: 0, atualizados: 0 });
    const [antes] = await locais();

    const segunda = await sincronizar("2026-10-26T15:30:00Z");

    expect(segunda).toMatchObject({ criados: 0, semMudanca: 2, falhas: [], locais: { criados: 0, vinculados: 0, atualizados: 0 } });
    expect(await locais()).toEqual([antes]);
    expect(await localDoEvento(1)).toBe(antes!.id);
    expect(await localDoEvento(2)).toBe(antes!.id);
  });

  it("atualiza o que vem do IAM Control e preserva o que é do Eventos (tipo, complemento, capacidade, localização)", async () => {
    turmas = [turma()];
    await sincronizar();
    const [criado] = await locais();
    // O time marcou como hotel e completou o cadastro em Configurações.
    await banco.sql(`update eventos.local set tipo = 'HOTEL', complemento = 'Torre B', capacidade = 120, lat = -26.99, lng = -48.63 where id = $1`, [criado!.id]);

    turmas = [turma({ capacidade: 500, local: { ...sibara, nome: "Hotel Sibára", logradouro: "Avenida Brasil", numero: "1600", bairro: null, cep: "88330-100" } })];
    const resumo = await sincronizar("2026-10-27T15:00:00Z");

    expect(resumo.locais).toEqual({ criados: 0, vinculados: 0, atualizados: 1 });
    expect(await locais()).toEqual([
      expect.objectContaining({
        id: criado!.id,
        nome: "Hotel Sibára",
        logradouro: "Avenida Brasil",
        numero: "1600",
        bairro: null,
        cep: "88330100",
        origem: "IAM_CONTROL",
        tipo: "HOTEL",
        complemento: "Torre B",
        capacidade: 120,
        lat: -26.99,
        lng: -48.63,
      }),
    ]);
    // O evento continua no mesmo cadastro, agora marcado como hotel.
    expect(await localDoEvento(1)).toBe(criado!.id);
  });

  it("liga o hotel cadastrado à mão em vez de duplicar: mesmo nome + cidade + UF, sem ligar para acento, maiúscula e espaço", async () => {
    const aMao = await cadastrarAMao({ nome: "hotel   SIBÁRA", tipo: "HOTEL", cidade: semAcento(cidade).toLowerCase().replace(" ", "  "), logradouro: "Rua errada", numero: "1", complemento: "Bloco 2", cep: "88330-999", lat: -26.99, lng: -48.63, capacidade: 80 });
    const apartamento = await cadastrarAMao({ nome: "Hotel Sibara", tipo: "APARTAMENTO" });
    const outraCidade = await cadastrarAMao({ nome: "Hotel Sibara", tipo: "HOTEL", cidade: `${cidade} Norte` });

    turmas = [turma()];
    const resumo = await sincronizar();

    expect(resumo.locais).toEqual({ criados: 0, vinculados: 1, atualizados: 0 });
    expect(await locais()).toHaveLength(3);
    expect(await local(aMao)).toMatchObject({
      origem: "IAM_CONTROL",
      // Nome e endereço passam a ser os do IAM Control...
      nome: "Hotel Sibara",
      cidade,
      logradouro: "Av. Brasil",
      numero: "1500",
      bairro: "Centro",
      cep: "88330000",
      // ...e o que é do Eventos fica como o time deixou (capacidade de hotel são leitos: não recebe os lugares da turma).
      tipo: "HOTEL",
      complemento: "Bloco 2",
      lat: -26.99,
      lng: -48.63,
      capacidade: 80,
    });
    expect(await localDoEvento(1)).toBe(aMao);
    expect(await historico(aMao)).toEqual([
      {
        acao: "LOCAL_VINCULADO",
        origem: "SISTEMA",
        usuario_id: null,
        dados: expect.objectContaining({
          mudancas: expect.objectContaining({ nome: { de: "hotel   SIBÁRA", para: "Hotel Sibara" }, logradouro: { de: "Rua errada", para: "Av. Brasil" } }),
        }),
      },
    ]);
    // Apartamento da IAM e hotel de outra cidade não são o local do IAM Control.
    expect(await local(apartamento)).toMatchObject({ origem: "EVENTOS", tipo: "APARTAMENTO", logradouro: null });
    expect(await local(outraCidade)).toMatchObject({ origem: "EVENTOS", cidade: `${cidade} Norte`, logradouro: null });

    // Rodar de novo: nada muda e o histórico não repete.
    expect((await sincronizar("2026-10-26T15:30:00Z")).locais).toEqual({ criados: 0, vinculados: 0, atualizados: 0 });
    expect(await locais()).toHaveLength(3);
    expect(await historico(aMao)).toHaveLength(1);
  });

  it("local de evento e hotel com o mesmo nome (cadastros antigos) ficam os dois ligados; o evento usa o local de evento", async () => {
    const hotel = await cadastrarAMao({ nome: "Hotel Sibara", tipo: "HOTEL", capacidade: 80 });
    const evento = await cadastrarAMao({ nome: "Hotel Sibara", tipo: "EVENTO" });

    turmas = [turma()];
    expect((await sincronizar()).locais).toEqual({ criados: 0, vinculados: 2, atualizados: 0 });

    expect(await locais()).toHaveLength(2);
    expect(await local(evento)).toMatchObject({ origem: "IAM_CONTROL", logradouro: "Av. Brasil", capacidade: 350 });
    expect(await local(hotel)).toMatchObject({ origem: "IAM_CONTROL", logradouro: "Av. Brasil", capacidade: 80 });
    expect(await localDoEvento(1)).toBe(evento);
  });

  it("não apaga nem arquiva local: o que saiu das turmas continua lá, com a hospedagem e os eventos antigos", async () => {
    turmas = [turma(), turma({ id: 2 })];
    await sincronizar();
    const [antigo] = await locais();
    await banco.sql(`update eventos.local set tipo = 'HOTEL' where id = $1`, [antigo!.id]);
    const eventoId = ((await banco.sql(`select id from eventos.evento where iam_control_turma_id = $1`, [mundo * 10 + 1])) as { id: string }[])[0]!.id;
    await banco.sql(`insert into eventos.hospedagem (evento_id, local_id, check_in, check_out) values ($1, $2, '2026-12-11', '2026-12-15')`, [eventoId, antigo!.id]);

    // A turma 501 muda de local no IAM Control e a 502 é excluída lá.
    turmas = [
      turma({ local: { ...sibara, nome: "P7 Eventos", logradouro: "Rua das Palmeiras", numero: "70" } }),
      turma({ id: 2, excluida_em: "2026-10-27T10:00:00.000Z" }),
    ];
    const resumo = await sincronizar("2026-10-27T15:00:00Z");

    expect(resumo).toMatchObject({ falhas: [], locais: { criados: 1, vinculados: 0, atualizados: 0 } });
    const depois = await locais();
    expect(depois.map((linha) => [linha.nome, linha.origem, linha.arquivado])).toEqual([
      ["Hotel Sibara", "IAM_CONTROL", false],
      ["P7 Eventos", "IAM_CONTROL", false],
    ]);
    expect(await localDoEvento(1)).toBe(depois[1]!.id);
    // O evento cancelado segue apontando para o local dele, e a hospedagem para o hotel.
    expect(await localDoEvento(2)).toBe(antigo!.id);
    expect(await banco.sql(`select local_id from eventos.hospedagem where evento_id = $1`, [eventoId])).toEqual([{ local_id: antigo!.id }]);

    // Sem nenhuma turma na resposta, nada é apagado.
    turmas = [];
    await sincronizar("2026-10-28T15:00:00Z");
    expect(await locais()).toEqual(depois);
  });

  it("local arquivado pelo time não volta a ser usado: a turma que ainda o traz ganha um cadastro novo", async () => {
    turmas = [turma()];
    await sincronizar();
    const [primeiro] = await locais();
    await banco.sql(`update eventos.evento set local_id = null where local_id = $1`, [primeiro!.id]);
    await banco.sql(`update eventos.local set deleted_at = now() where id = $1`, [primeiro!.id]);

    expect((await sincronizar("2026-10-27T15:00:00Z")).locais).toEqual({ criados: 1, vinculados: 0, atualizados: 0 });
    const todos = await locais();
    expect(todos.map((linha) => linha.arquivado)).toEqual([true, false]);
    expect(await localDoEvento(1)).toBe(todos[1]!.id);
  });

  it("endereço digitado na turma (sem local cadastrado no IAM Control) vira local do IAM Control, sem lugares e sem ficar regravando", async () => {
    const digitado = { ...sibara, nome: null };
    turmas = [
      turma({ local: digitado }),
      // Outra turma no mesmo logradouro, com número e bairro diferentes: o cadastro fica como a primeira deixou.
      turma({ id: 2, local: { ...digitado, numero: "2000", bairro: "Pioneiros" } }),
      // Sem endereço nenhum: só a cidade do polo.
      turma({ id: 3, local: { nome: null, logradouro: null, numero: null, complemento: null, bairro: null, cidade: null, estado: null, cep: null } }),
    ];
    const hotelHomonimo = await cadastrarAMao({ nome: `Av. Brasil, ${cidade}`, tipo: "HOTEL" });

    expect((await sincronizar()).locais).toEqual({ criados: 2, vinculados: 0, atualizados: 0 });
    const criados = (await locais()).filter((linha) => linha.id !== hotelHomonimo);
    expect(criados.map((linha) => [linha.nome, linha.origem, linha.tipo, linha.numero, linha.capacidade])).toEqual([
      [`Av. Brasil, ${cidade}`, "IAM_CONTROL", "EVENTO", "1500", null],
      [`Local a definir — ${cidade}`, "IAM_CONTROL", "EVENTO", null, null],
    ]);
    // Endereço digitado não liga hotel cadastrado à mão.
    expect(await local(hotelHomonimo)).toMatchObject({ origem: "EVENTOS", tipo: "HOTEL" });

    expect((await sincronizar("2026-10-26T15:30:00Z")).locais).toEqual({ criados: 0, vinculados: 0, atualizados: 0 });
    expect((await locais()).filter((linha) => linha.id !== hotelHomonimo)).toEqual(criados);
  });

  it("local de evento cadastrado à mão com o nome do endereço digitado é ligado sem ter o endereço trocado", async () => {
    const aMao = await cadastrarAMao({ nome: `Local a definir — ${cidade}`, tipo: "EVENTO", logradouro: "Rua do time", lat: -26.9, lng: -48.6 });
    turmas = [turma({ local: { nome: null, logradouro: null, numero: null, complemento: null, bairro: null, cidade: null, estado: null, cep: null } })];

    expect((await sincronizar()).locais).toEqual({ criados: 0, vinculados: 1, atualizados: 0 });
    expect(await locais()).toEqual([expect.objectContaining({ id: aMao, origem: "IAM_CONTROL", logradouro: "Rua do time", lat: -26.9 })]);
  });

  it("quando o IAM Control mandar o id do local: o id é gravado e o local renomeado lá continua o mesmo cadastro aqui", async () => {
    // Hoje a rota não manda o id: o local entra pelo nome.
    turmas = [turma()];
    await sincronizar();
    const [semId] = await locais();
    await banco.sql(`update eventos.local set lat = -26.99, lng = -48.63 where id = $1`, [semId!.id]);

    // A rota passa a mandar id e capacidade do local.
    turmas = [turma({ local: { ...sibara, id: 12, capacidade: 400 } })];
    expect((await sincronizar("2026-10-27T15:00:00Z")).locais).toEqual({ criados: 0, vinculados: 0, atualizados: 1 });
    expect(await locais()).toEqual([expect.objectContaining({ id: semId!.id, iam_control_endereco_id: 12, nome: "Hotel Sibara", capacidade: 350 })]);

    // O hotel muda de nome e de cidade no IAM Control: mesmo cadastro, sem perder o que o time preencheu.
    turmas = [turma({ local: { ...sibara, id: 12, nome: "Sibara Flat & Convention", cidade: `${cidade} Sul` } })];
    expect((await sincronizar("2026-10-28T15:00:00Z")).locais).toEqual({ criados: 0, vinculados: 0, atualizados: 1 });
    expect(await locais()).toEqual([expect.objectContaining({ id: semId!.id, iam_control_endereco_id: 12, nome: "Sibara Flat & Convention", cidade: `${cidade} Sul`, lat: -26.99 })]);

    // Outro local do IAM Control com o nome antigo (outro id) é outro cadastro.
    turmas = [turma({ local: { ...sibara, id: 12, nome: "Sibara Flat & Convention", cidade: `${cidade} Sul` } }), turma({ id: 2, local: { ...sibara, id: 13 } })];
    expect((await sincronizar("2026-10-29T15:00:00Z")).locais).toEqual({ criados: 1, vinculados: 0, atualizados: 0 });
    expect((await locais()).map((linha) => [linha.nome, linha.iam_control_endereco_id])).toEqual([
      ["Sibara Flat & Convention", 12],
      ["Hotel Sibara", 13],
    ]);
  });

  it("a comparação da sincronização (código) e a do hotel informado pela SDC (SQL) concordam", async () => {
    const hotelId = await cadastrarAMao({ nome: "Hotel São João Palace", tipo: "HOTEL", cidade: "São José dos Pinhais" });
    const repositorio = criarRepositorioLocal(banco.db);
    const cadastrado = { nome: "Hotel São João Palace", cidade: "São José dos Pinhais", uf: "SC" };
    const escritas = [
      { nome: "hotel sao joao palace", cidade: "sao jose dos pinhais", igual: true },
      { nome: "  HOTEL   SÃO  JOÃO PALACE ", cidade: "SÃO   JOSÉ DOS PINHAIS", igual: true },
      { nome: "Hôtel Sâo Joâo Pàlace", cidade: "Sao Josè dos Pinhais", igual: true },
      { nome: "Hotel São João", cidade: "São José dos Pinhais", igual: false },
      { nome: "Hotel S. João Palace", cidade: "São José dos Pinhais", igual: false },
      { nome: "Hotel São João Palace", cidade: "São José", igual: false },
    ];
    for (const { nome, cidade: escrita, igual } of escritas) {
      const peloSql = (await repositorio.hotelComNome({ nome, cidade: escrita, uf: "SC" })) === hotelId;
      const peloCodigo = chaveDoLocal({ nome, cidade: escrita, uf: "SC" }) === chaveDoLocal(cadastrado);
      expect([nome, escrita, peloSql, peloCodigo]).toEqual([nome, escrita, igual, igual]);
    }
  });
});
