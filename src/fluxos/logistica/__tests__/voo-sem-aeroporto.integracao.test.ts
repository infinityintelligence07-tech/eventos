import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

import type { Db } from "@/core/db/database";
import { carregarVoosDaSdc, registrarCompraDeVoo } from "@/fluxos/sdc";
import { registrarCompraDeVooPelaSdcSchema } from "@/modules/logistica";
import { type BancoDeTeste, criarBancoDeTeste, TEST_DATABASE_URL } from "@/test/banco";

import { alterarPedido, carregarPedido, carregarVoos, registrarPedidoDeVoo, registrarRetornoDaSdc, type VoosCarregados } from "..";

const banco = vi.hoisted(() => ({ db: null as Db | null }));

vi.mock("@/fluxos/_base", async (importOriginal) => {
  const original = await importOriginal<Record<string, unknown>>();
  return {
    ...original,
    bancoParaLeitura: async () => banco.db!,
    // A transação real (limite e "sem registro, desfaz"), no banco de teste.
    transacao: async (_ator: unknown, trabalho: (tx: never) => Promise<unknown>) => (await import("@/fluxos/_base/banco")).transacaoNoBanco(banco.db!, trabalho as never),
  };
});

// Pedido de voo sem aeroporto (0020, decisão do Vitor em 26/11/2026): o time pede por cidade (de onde a pessoa sai e a
// cidade do evento); a SDC escolhe o aeroporto e informa na compra. Pedido antigo, só com aeroporto, continua valendo.
describe.skipIf(!TEST_DATABASE_URL)("voo sem aeroporto no banco: pedido por cidade, aeroporto na compra e pedido antigo", () => {
  let teste: BancoDeTeste;
  let usuarioId: string;
  let sdcId: string;
  let eventoId: string;
  const ator = () => ({ usuarioId, pessoaId: null, origem: "LOCAL" as const });
  const sdc = () => ({ acessoSdcId: sdcId, origem: "LOCAL" as const });
  const agora = new Date("2026-10-28T15:00:00Z");
  const depois = new Date("2026-10-29T15:00:00Z");

  const um = async (texto: string, params: unknown[] = []) => ((await teste.sql(texto, params)) as Record<string, unknown>[])[0]!;
  /** Pessoa ativa do staff; `cidade` e `uf` são as do cadastro dela (o pedido sugere como origem). */
  const staff = async (nome: string, cidade: string | null = null, uf: string | null = null) => {
    const { id } = await um(`insert into core.pessoa (nome_completo) values ($1) returning id`, [nome]);
    await teste.sql(`insert into eventos.pessoa_evento (pessoa_id, sexo, cidade, uf) values ($1, 'F', $2, $3)`, [id, cidade, uf]);
    return id as string;
  };
  const trechosNoBanco = (pedidoId: string) =>
    teste.sql(`select sentido, origem_cidade, destino_cidade, origem_iata, destino_iata from eventos.trecho_voo where pedido_id = $1 order by sentido`, [pedidoId]) as Promise<Record<string, string | null>[]>;
  const versao = async (pedidoId: string) => ((await um(`select atualizado_em from eventos.pedido_sdc where id = $1`, [pedidoId])).atualizado_em as Date).toISOString();
  const linhasDe = (voos: VoosCarregados) => voos.grupos.flatMap((mes) => mes.eventos.flatMap((grupo) => grupo.linhas));
  const linhaDoTime = async (referencia: string) => linhasDe(await carregarVoos({}, agora)).find((linha) => linha.pedido?.referencia === referencia)!;
  const linhaDaSdc = async (referencia: string) => (await carregarVoosDaSdc({}, agora)).grupos.flatMap((mes) => mes.eventos.flatMap((grupo) => grupo.linhas)).find((voo) => voo.referencia === referencia)!;
  const pontas = (trecho: { origemCidade: string | null; destinoCidade: string | null; origemIata: string | null; destinoIata: string | null }) => [trecho.origemCidade, trecho.destinoCidade, trecho.origemIata, trecho.destinoIata];

  const ida = { sentido: "IDA" as const, origemCidade: "Porto Alegre (RS)", destinoCidade: "Manaus (AM)", dataDesejada: "2026-12-14" };
  const volta = { sentido: "VOLTA" as const, origemCidade: "Manaus (AM)", destinoCidade: "Porto Alegre (RS)", dataDesejada: "2026-12-17" };
  const comprados = [
    { sentido: "IDA" as const, companhia: "Azul", numeroVoo: "AD4120", localizador: "KXQ7PZ", partidaEm: "2026-12-14T08:10", chegadaEm: "2026-12-14T11:45" },
    { sentido: "VOLTA" as const, companhia: "Azul", numeroVoo: "AD4121", localizador: "KXQ7PZ", partidaEm: "2026-12-17T19:20", chegadaEm: "2026-12-17T22:05" },
  ];
  /** A compra como chega do formulário da SDC; `aeroportos` por trecho, na ordem ida, volta. */
  const compraDaSdc = (referencia: string, aeroportos: { origemIata?: string; destinoIata?: string }[] = [], somente: ("IDA" | "VOLTA")[] = ["IDA", "VOLTA"]) =>
    registrarCompraDeVooPelaSdcSchema.parse({
      referencia,
      valorCentavos: "980,00",
      trechos: comprados.map((trecho, indice) => ({ ...trecho, ...aeroportos[indice] })).filter((trecho) => somente.includes(trecho.sentido)),
    });

  /** Pedido como era antes da 0020: gravado direto, só com os aeroportos. */
  async function pedidoAntigo(pessoaId: string, situacao: "PEDIDO" | "EMITIDO" = "PEDIDO") {
    const pedido = await um(
      `insert into eventos.pedido_sdc (tipo, evento_id, pessoa_id, situacao, valor_centavos, emitido_em, data_solicitacao, data_compra, solicitado_em)
       values ('VOO', $1, $2, $3, $4, $5, '2026-10-20', $6, '2026-10-20T15:00:00Z') returning id, referencia`,
      [eventoId, pessoaId, situacao, situacao === "EMITIDO" ? 98000 : null, situacao === "EMITIDO" ? "2026-10-21T15:00:00Z" : null, situacao === "EMITIDO" ? "2026-10-21" : null],
    );
    await teste.sql(
      `insert into eventos.trecho_voo (pedido_id, sentido, origem_iata, destino_iata, data_desejada) values ($1, 'IDA', 'POA', 'MAO', '2026-12-14'), ($1, 'VOLTA', 'MAO', 'POA', '2026-12-17')`,
      [pedido.id],
    );
    return { id: pedido.id as string, referencia: pedido.referencia as string };
  }

  beforeAll(async () => {
    teste = await criarBancoDeTeste();
    banco.db = teste.db;
    usuarioId = (await um(`insert into core.usuario (email) values ('time@exemplo.test') returning id`)).id as string;
    sdcId = (await um(`insert into eventos.acesso_sdc (email, nome) values ('atendimento.sdc@exemplo.test', 'SDC (teste)') returning id`)).id as string;
    const { id: localId } = await um(`insert into eventos.local (nome, tipo, cidade, uf) values ('Centro de Convenções', 'EVENTO', 'Manaus', 'AM') returning id`);
    eventoId = (
      await um(
        `insert into eventos.evento (nome, codigo, inicio, fim, status, local_id) values ('ASM', 'ASM_AM_900', '2026-12-15T12:00:00Z', '2026-12-17T22:00:00Z', 'PLANEJADO', $1) returning id`,
        [localId],
      )
    ).id as string;
  }, 60_000);

  afterAll(async () => {
    await teste?.encerrar();
  });

  it("pedido novo nasce com as cidades e sem aeroporto; a tela traz a cidade do cadastro da pessoa e a do evento para sugerir", async () => {
    const ana = await staff("Ana De Porto Alegre", "Porto Alegre", "RS");
    await staff("Bia Sem Cidade");
    await staff("Caio Sem Uf", "Londrina");

    const tela = await carregarVoos({}, agora);
    expect(tela.staff).toEqual([
      { pessoaId: ana, nome: "Ana De Porto Alegre", cidade: "Porto Alegre (RS)" },
      { pessoaId: expect.any(String), nome: "Bia Sem Cidade", cidade: null },
      { pessoaId: expect.any(String), nome: "Caio Sem Uf", cidade: "Londrina" },
    ]);
    expect(tela.eventos.map((evento) => [evento.codigo, evento.cidade, evento.uf])).toEqual([["ASM_AM_900", "Manaus", "AM"]]);

    const pedido = await registrarPedidoDeVoo({ eventoId, pessoaId: ana, trechos: [ida, volta] }, ator(), agora);
    expect(await trechosNoBanco(pedido.id)).toEqual([
      { sentido: "IDA", origem_cidade: "Porto Alegre (RS)", destino_cidade: "Manaus (AM)", origem_iata: null, destino_iata: null },
      { sentido: "VOLTA", origem_cidade: "Manaus (AM)", destino_cidade: "Porto Alegre (RS)", origem_iata: null, destino_iata: null },
    ]);

    // O time, a SDC e o texto de "Copiar pedido" mostram as cidades.
    expect((await linhaDoTime(pedido.referencia)).pedido!.trechos.map(pontas)).toEqual([
      ["Porto Alegre (RS)", "Manaus (AM)", null, null],
      ["Manaus (AM)", "Porto Alegre (RS)", null, null],
    ]);
    expect((await linhaDaSdc(pedido.referencia)).trechos.map(pontas)).toEqual([
      ["Porto Alegre (RS)", "Manaus (AM)", null, null],
      ["Manaus (AM)", "Porto Alegre (RS)", null, null],
    ]);
    const texto = (await carregarPedido(pedido.referencia))!.textoParaSdc!;
    expect(texto).toContain("Ida: Porto Alegre (RS) → Manaus (AM) em 14/12/2026");
    expect(texto).toContain("Volta: Manaus (AM) → Porto Alegre (RS) em 17/12/2026");
    expect(texto).not.toMatch(/aeroporto/);
  });

  it("a SDC informa o aeroporto na compra (os dois, um só ou nenhum); corrigir em branco tira o que havia", async () => {
    const dani = await staff("Dani Passageira", "Porto Alegre", "RS");
    const pedido = await registrarPedidoDeVoo({ eventoId, pessoaId: dani, trechos: [ida, volta] }, ator(), agora);

    // Ida com os dois aeroportos; volta só com o de destino.
    await registrarCompraDeVoo(compraDaSdc(pedido.referencia, [{ origemIata: "poa", destinoIata: "MAO" }, { destinoIata: "POA" }]), sdc(), agora);
    expect(await trechosNoBanco(pedido.id)).toEqual([
      { sentido: "IDA", origem_cidade: "Porto Alegre (RS)", destino_cidade: "Manaus (AM)", origem_iata: "POA", destino_iata: "MAO" },
      { sentido: "VOLTA", origem_cidade: "Manaus (AM)", destino_cidade: "Porto Alegre (RS)", origem_iata: null, destino_iata: "POA" },
    ]);
    expect(await um(`select situacao, retorno_registrado_pela_sdc from eventos.pedido_sdc where id = $1`, [pedido.id])).toEqual({ situacao: "EMITIDO", retorno_registrado_pela_sdc: sdcId });
    // A SDC e o time leem os aeroportos; o texto do pedido passa a dizer os dois.
    expect((await linhaDaSdc(pedido.referencia)).trechos.map(pontas)[0]).toEqual(["Porto Alegre (RS)", "Manaus (AM)", "POA", "MAO"]);
    expect((await linhaDoTime(pedido.referencia)).pedido!.trechos.map(pontas)[1]).toEqual(["Manaus (AM)", "Porto Alegre (RS)", null, "POA"]);
    expect((await carregarPedido(pedido.referencia))!.textoParaSdc).toContain("Ida: Porto Alegre (RS) → Manaus (AM) (aeroportos POA → MAO) em 14/12/2026");

    // Correção: troca o aeroporto de origem da ida e deixa o resto em branco (sai o que havia).
    await registrarCompraDeVoo(compraDaSdc(pedido.referencia, [{ origemIata: "CXJ" }, {}]), sdc(), depois);
    expect((await trechosNoBanco(pedido.id)).map((trecho) => [trecho.origem_iata, trecho.destino_iata])).toEqual([
      ["CXJ", null],
      [null, null],
    ]);
  });

  it("o time, registrando em nome da SDC, também informa o aeroporto", async () => {
    const eva = await staff("Eva Passageira");
    const pedido = await registrarPedidoDeVoo({ eventoId, pessoaId: eva, trechos: [ida] }, ator(), agora);
    await registrarRetornoDaSdc({ pedidoId: pedido.id, valorCentavos: 50000, trechos: [{ ...comprados[0]!, origemIata: "POA", destinoIata: "MAO" }] }, ator(), agora);
    expect(await trechosNoBanco(pedido.id)).toEqual([{ sentido: "IDA", origem_cidade: "Porto Alegre (RS)", destino_cidade: "Manaus (AM)", origem_iata: "POA", destino_iata: "MAO" }]);
    expect((await linhaDoTime(pedido.referencia)).pedido).toMatchObject({ situacao: "EMITIDO", retornoRegistradoPor: expect.any(String), retornoPelaSdc: null });
  });

  it("alterar o pedido: o aeroporto fica na ponta em que a cidade não mudou e sai da que mudou", async () => {
    const fabi = await staff("Fabi Passageira");
    const pedido = await registrarPedidoDeVoo({ eventoId, pessoaId: fabi, trechos: [ida, volta] }, ator(), agora);
    await registrarCompraDeVoo(compraDaSdc(pedido.referencia, [{ origemIata: "POA", destinoIata: "MAO" }, { origemIata: "MAO", destinoIata: "POA" }]), sdc(), agora);

    // Só a data muda: os aeroportos continuam (a cidade vem escrita de outro jeito, mas é a mesma).
    await alterarPedido({ pedidoId: pedido.id, atualizadoEm: await versao(pedido.id), trechos: [{ ...ida, origemCidade: "porto alegre (RS)", dataDesejada: "2026-12-13" }, volta] }, ator(), depois);
    expect((await trechosNoBanco(pedido.id)).map((trecho) => [trecho.origem_cidade, trecho.origem_iata, trecho.destino_iata])).toEqual([
      ["porto alegre (RS)", "POA", "MAO"],
      ["Manaus (AM)", "MAO", "POA"],
    ]);

    // A pessoa passa a sair de Caxias do Sul: o aeroporto daquela ponta sai (na ida e na volta); o de Manaus fica.
    await alterarPedido(
      { pedidoId: pedido.id, atualizadoEm: await versao(pedido.id), trechos: [{ ...ida, origemCidade: "Caxias do Sul (RS)" }, { ...volta, destinoCidade: "Caxias do Sul (RS)" }] },
      ator(),
      new Date(depois.getTime() + 60_000),
    );
    expect(await trechosNoBanco(pedido.id)).toEqual([
      { sentido: "IDA", origem_cidade: "Caxias do Sul (RS)", destino_cidade: "Manaus (AM)", origem_iata: null, destino_iata: "MAO" },
      { sentido: "VOLTA", origem_cidade: "Manaus (AM)", destino_cidade: "Caxias do Sul (RS)", origem_iata: "MAO", destino_iata: null },
    ]);
    expect((await um(`select situacao from eventos.pedido_sdc where id = $1`, [pedido.id])).situacao).toBe("ALTERADO");

    // Tirar a volta e pôr de novo: o trecho novo nasce sem aeroporto.
    await alterarPedido({ pedidoId: pedido.id, atualizadoEm: await versao(pedido.id), trechos: [{ ...ida, origemCidade: "Caxias do Sul (RS)" }] }, ator(), new Date(depois.getTime() + 120_000));
    await alterarPedido(
      { pedidoId: pedido.id, atualizadoEm: await versao(pedido.id), trechos: [{ ...ida, origemCidade: "Caxias do Sul (RS)" }, { ...volta, destinoCidade: "Caxias do Sul (RS)" }] },
      ator(),
      new Date(depois.getTime() + 180_000),
    );
    expect((await trechosNoBanco(pedido.id)).map((trecho) => [trecho.sentido, trecho.origem_iata, trecho.destino_iata])).toEqual([
      ["IDA", null, "MAO"],
      ["VOLTA", null, null],
    ]);
  });

  it("pedido antigo, só com aeroporto, continua aparecendo para o time e para a SDC, e a compra em branco não apaga o aeroporto", async () => {
    const gil = await staff("Gil Do Pedido Antigo", "Porto Alegre", "RS");
    const antigo = await pedidoAntigo(gil);

    expect((await linhaDoTime(antigo.referencia)).pedido!.trechos.map(pontas)).toEqual([
      [null, null, "POA", "MAO"],
      [null, null, "MAO", "POA"],
    ]);
    expect((await linhaDaSdc(antigo.referencia)).trechos.map(pontas)).toEqual([
      [null, null, "POA", "MAO"],
      [null, null, "MAO", "POA"],
    ]);
    const texto = (await carregarPedido(antigo.referencia))!.textoParaSdc!;
    expect(texto).toContain("Ida: POA → MAO em 14/12/2026");
    expect(texto).toContain("Volta: MAO → POA em 17/12/2026");

    // A SDC compra sem preencher os aeroportos: o trecho não tem cidade, então fica o aeroporto que o pedido já tinha.
    await registrarCompraDeVoo(compraDaSdc(antigo.referencia), sdc(), agora);
    expect((await trechosNoBanco(antigo.id)).map((trecho) => [trecho.origem_cidade, trecho.origem_iata, trecho.destino_iata])).toEqual([
      [null, "POA", "MAO"],
      [null, "MAO", "POA"],
    ]);
    // Ela pode trocar o aeroporto; trocar só um para o mesmo da outra ponta é recusado com a explicação (não chega ao CHECK).
    await expect(registrarCompraDeVoo(compraDaSdc(antigo.referencia, [{ origemIata: "MAO" }, {}]), sdc(), depois)).rejects.toThrow("No voo de ida, a origem e o destino precisam ser aeroportos diferentes.");
    await registrarCompraDeVoo(compraDaSdc(antigo.referencia, [{ origemIata: "CXJ" }, { destinoIata: "CXJ" }]), sdc(), depois);
    expect((await trechosNoBanco(antigo.id)).map((trecho) => [trecho.origem_iata, trecho.destino_iata])).toEqual([
      ["CXJ", "MAO"],
      ["MAO", "CXJ"],
    ]);

    // O time altera o pedido antigo: as cidades entram e o aeroporto que ele já tinha fica.
    await alterarPedido({ pedidoId: antigo.id, atualizadoEm: await versao(antigo.id), trechos: [ida, volta] }, ator(), new Date(depois.getTime() + 60_000));
    expect(await trechosNoBanco(antigo.id)).toEqual([
      { sentido: "IDA", origem_cidade: "Porto Alegre (RS)", destino_cidade: "Manaus (AM)", origem_iata: "CXJ", destino_iata: "MAO" },
      { sentido: "VOLTA", origem_cidade: "Manaus (AM)", destino_cidade: "Porto Alegre (RS)", origem_iata: "MAO", destino_iata: "CXJ" },
    ]);
  });

  it("o banco não aceita trecho sem cidade e sem aeroporto numa das pontas", async () => {
    const hugo = await staff("Hugo Passageiro");
    const pedido = await registrarPedidoDeVoo({ eventoId, pessoaId: hugo, trechos: [ida] }, ator(), agora);
    await expect(teste.sql(`update eventos.trecho_voo set origem_cidade = null where pedido_id = $1`, [pedido.id])).rejects.toThrow(/trecho_voo_pontas_check/);
    await expect(teste.sql(`insert into eventos.trecho_voo (pedido_id, sentido, origem_cidade, data_desejada) values ($1, 'VOLTA', 'Manaus (AM)', '2026-12-17')`, [pedido.id])).rejects.toThrow(/trecho_voo_pontas_check/);
  });
});
