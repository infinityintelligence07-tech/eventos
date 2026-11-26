import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

import type { Db } from "@/core/db/database";
import { RegraDeNegocioError } from "@/fluxos/_base";
import { carregarVoosDaSdc, registrarCompraDeVoo } from "@/fluxos/sdc";
import { registrarCompraDeVooPelaSdcSchema } from "@/modules/logistica";
import { type BancoDeTeste, criarBancoDeTeste, TEST_DATABASE_URL } from "@/test/banco";

import {
  acrescentarHospede,
  adicionarQuarto,
  carregarHospedagem,
  carregarPedido,
  carregarVoos,
  criarHospedagem,
  porNoQuarto,
  registrarPedidoDeHospedagem,
  registrarPedidoDeVoo,
  registrarRetornoDaSdc,
  registrarRetornoDeHospedagem,
  type VoosCarregados,
} from "..";

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

const UUID = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i;

// Voos e hospedagem de Masterclass (turnê) e a data real da solicitação e da compra (docs/07 §4.7).
describe.skipIf(!TEST_DATABASE_URL)("Masterclass: voo em turnê, hospedagem da palestra e data real", () => {
  let teste: BancoDeTeste;
  let usuarioId: string;
  let sdcId: string;
  let evento: string;
  const palestras: Record<"manaus" | "belem" | "macapa" | "cancelada", string> = { manaus: "", belem: "", macapa: "", cancelada: "" };
  const ator = () => ({ usuarioId, pessoaId: null, origem: "LOCAL" as const });
  const sdc = () => ({ acessoSdcId: sdcId, origem: "LOCAL" as const });
  // "Hoje" dos testes: 28/10/2026, 12h em São Paulo.
  const agora = new Date("2026-10-28T15:00:00Z");
  const HOJE = "2026-10-28";

  const um = async (texto: string, params: unknown[] = []) => ((await teste.sql(texto, params)) as Record<string, unknown>[])[0]!;
  const staff = async (nome: string) => {
    const { id } = await um(`insert into core.pessoa (nome_completo) values ($1) returning id`, [nome]);
    await teste.sql(`insert into eventos.pessoa_evento (pessoa_id, sexo) values ($1, 'F')`, [id]);
    return id as string;
  };
  async function novoEvento(codigo: string, dia: string, { masterclass, cidade, uf, status = "PLANEJADO" }: { masterclass: boolean; cidade: string; uf: string; status?: string }) {
    const { id: localId } = await um(`insert into eventos.local (nome, tipo, cidade, uf) values ($1, 'EVENTO', $2, $3) returning id`, [`Hotel ${cidade}`, cidade, uf]);
    return (
      await um(
        `insert into eventos.evento (nome, codigo, inicio, fim, status, local_id, tipo_evento_id)
         select $1, $1, $2::date + time '22:00', $2::date + time '23:30', $3, $4, (select id from eventos.tipo_evento where sigla = $5) returning id`,
        [codigo, dia, status, localId, masterclass ? "MC" : "IPR"],
      )
    ).id as string;
  }
  const linhasDe = (voos: VoosCarregados) => voos.grupos.flatMap((mes) => mes.eventos.flatMap((grupo) => grupo.linhas));
  const doBanco = (pedidoId: string) =>
    um(`select evento_id, evento_volta_id, data_solicitacao::text, data_compra::text, forma_pagamento, solicitado_em, emitido_em, situacao from eventos.pedido_sdc where id = $1`, [pedidoId]);

  // Na turnê a volta sai da cidade da última palestra (Macapá), não da cidade onde a ida chegou (Manaus).
  const ida = { sentido: "IDA" as const, origemCidade: "São Paulo (SP)", destinoCidade: "Manaus (AM)", dataDesejada: "2027-03-09" };
  const volta = { sentido: "VOLTA" as const, origemCidade: "Macapá (AP)", destinoCidade: "São Paulo (SP)", dataDesejada: "2027-03-14" };
  const comprados = [
    { sentido: "IDA" as const, companhia: "Azul", numeroVoo: "AD4120", localizador: "KXQ7PZ", partidaEm: "2027-03-09T08:10", chegadaEm: "2027-03-09T11:45" },
    { sentido: "VOLTA" as const, companhia: "LATAM", numeroVoo: "LA3301", localizador: "KXQ7PZ", partidaEm: "2027-03-14T19:20", chegadaEm: "2027-03-14T23:05" },
  ];

  beforeAll(async () => {
    teste = await criarBancoDeTeste();
    banco.db = teste.db;
    usuarioId = (await um(`insert into core.usuario (email) values ('time@exemplo.test') returning id`)).id as string;
    sdcId = (await um(`insert into eventos.acesso_sdc (email, nome) values ('atendimento.sdc@exemplo.test', 'SDC (teste)') returning id`)).id as string;
    expect(await teste.sql(`select sigla from eventos.tipo_evento where sigla in ('MC', 'IPR') order by sigla`)).toEqual([{ sigla: "IPR" }, { sigla: "MC" }]);
    palestras.manaus = await novoEvento("MC_AM_MANAUS", "2027-03-10", { masterclass: true, cidade: "Manaus", uf: "AM" });
    palestras.belem = await novoEvento("MC_PA_BELEM", "2027-03-12", { masterclass: true, cidade: "Belém", uf: "PA" });
    palestras.macapa = await novoEvento("MC_AP_MACAPA", "2027-03-14", { masterclass: true, cidade: "Macapá", uf: "AP" });
    palestras.cancelada = await novoEvento("MC_RR_CANCELADA", "2027-03-16", { masterclass: true, cidade: "Boa Vista", uf: "RR", status: "CANCELADO" });
    evento = await novoEvento("IPR_POA_950", "2027-03-11", { masterclass: false, cidade: "Porto Alegre", uf: "RS" });
  }, 60_000);

  afterAll(async () => {
    await teste?.encerrar();
  });

  it("turnê: o pedido é da primeira palestra e guarda a última; fica no recorte de Masterclass, com os dois locais", async () => {
    const ana = await staff("Ana Palestrante");
    const pedido = await registrarPedidoDeVoo({ eventoId: palestras.manaus, eventoVoltaId: palestras.macapa, pessoaId: ana, trechos: [ida, volta] }, ator(), agora);
    expect(await doBanco(pedido.id)).toMatchObject({ evento_id: palestras.manaus, evento_volta_id: palestras.macapa, data_solicitacao: HOJE, data_compra: null });

    // Uma palestra só: a mesma na ida e na volta (ou nenhuma na volta) não grava evento da volta.
    const bia = await staff("Bia Uma Palestra");
    const simples = await registrarPedidoDeVoo({ eventoId: palestras.belem, eventoVoltaId: palestras.belem, pessoaId: bia, trechos: [{ ...ida, destinoCidade: "Belém (PA)" }] }, ator(), agora);
    expect(await doBanco(simples.id)).toMatchObject({ evento_id: palestras.belem, evento_volta_id: null });
    // E um voo de evento comum, para o outro recorte.
    const caio = await staff("Caio Do Evento");
    const doEvento = await registrarPedidoDeVoo({ eventoId: evento, pessoaId: caio, trechos: [{ ...ida, destinoCidade: "Porto Alegre (RS)" }] }, ator(), agora);

    const masterclass = await carregarVoos({ recorte: "MASTERCLASS" }, agora);
    expect(masterclass.recorte).toBe("MASTERCLASS");
    expect(masterclass.linhasPorRecorte).toEqual({ EVENTOS: 1, MASTERCLASS: 2 });
    expect(linhasDe(masterclass).map((linha) => [linha.passageiro.nome, linha.evento.codigo, linha.pedido?.eventoDaVolta?.codigo ?? null])).toEqual([
      ["Ana Palestrante", "MC_AM_MANAUS", "MC_AP_MACAPA"],
      ["Bia Uma Palestra", "MC_PA_BELEM", null],
    ]);
    const daAna = linhasDe(masterclass)[0]!.pedido!;
    expect(daAna.evento).toMatchObject({ masterclass: true, localNome: "Hotel Manaus", cidade: "Manaus", uf: "AM", dataInicio: "2027-03-10" });
    expect(daAna.eventoDaVolta).toMatchObject({ masterclass: true, localNome: "Hotel Macapá", cidade: "Macapá", uf: "AP", dataInicio: "2027-03-14" });
    // O aviso de voos por evento continua sem as Masterclasses.
    expect(masterclass.avisoDeCompra.eventos).toEqual([]);
    const avisados = (await carregarVoos({}, new Date("2027-01-15T15:00:00Z"))).avisoDeCompra.eventos.map((item) => item.eventoId);
    expect(avisados).not.toContain(palestras.belem);
    expect(avisados).not.toContain(palestras.macapa);

    // O recorte padrão (Eventos) não mistura: só o voo do evento. O seletor recebe os dois lados, cada um marcado.
    const eventos = await carregarVoos({}, agora);
    expect(eventos.recorte).toBe("EVENTOS");
    expect(linhasDe(eventos).map((linha) => linha.pedido?.id)).toEqual([doEvento.id]);
    expect(Object.fromEntries(eventos.eventos.map((item) => [item.codigo, item.masterclass]))).toEqual({ MC_AM_MANAUS: true, IPR_POA_950: false, MC_PA_BELEM: true, MC_AP_MACAPA: true });
    // Com uma palestra escolhida, o recorte é o dela; a turnê aparece tanto na primeira quanto na última palestra.
    for (const palestra of [palestras.manaus, palestras.macapa]) {
      const daPalestra = await carregarVoos({ eventoId: palestra }, agora);
      expect(daPalestra.recorte).toBe("MASTERCLASS");
      expect(linhasDe(daPalestra).map((linha) => linha.pedido?.id)).toEqual([pedido.id]);
    }

    // O texto para a SDC troca "Evento" pelas duas pontas da turnê.
    const carregado = (await carregarPedido(pedido.referencia))!;
    expect(carregado.textoParaSdc).toContain("Masterclass (turnê) — primeira palestra: 10/03/2027 · Hotel Manaus — Manaus (AM)");
    expect(carregado.textoParaSdc).toContain("Última palestra: 14/03/2027 · Hotel Macapá — Macapá (AP)");
    expect((await carregarPedido(doEvento.referencia))!.textoParaSdc).toContain("Evento: IPR_POA_950");

    // A turnê continua na lista até a última palestra passar (a primeira já passou, a última é hoje).
    const noFimDaTurne = new Date("2027-03-14T15:00:00Z");
    expect(linhasDe(await carregarVoos({ recorte: "MASTERCLASS" }, noFimDaTurne)).map((linha) => linha.passageiro.nome)).toEqual(["Ana Palestrante"]);
    expect(linhasDe(await carregarVoos({ recorte: "MASTERCLASS" }, new Date("2027-03-16T15:00:00Z")))).toEqual([]);
  });

  it("turnê recusada: volta antes da ida, palestra cancelada, evento que não é Masterclass", async () => {
    const dora = await staff("Dora Recusada");
    const tentar = (eventoId: string, eventoVoltaId: string) => registrarPedidoDeVoo({ eventoId, eventoVoltaId, pessoaId: dora, trechos: [ida, volta] }, ator(), agora);
    await expect(tentar(palestras.macapa, palestras.manaus)).rejects.toThrow(/não pode ser antes da primeira/);
    await expect(tentar(palestras.manaus, palestras.cancelada)).rejects.toThrow(/foi cancelada/);
    await expect(tentar(palestras.manaus, evento)).rejects.toThrow(/precisa ser uma Masterclass/);
    await expect(tentar(evento, palestras.macapa)).rejects.toThrow(/Só o voo de Masterclass tem a volta por outra palestra/);
    await expect(tentar(palestras.manaus, dora)).rejects.toThrow(/Última palestra não encontrada/);
    await expect(tentar(palestras.manaus, palestras.cancelada)).rejects.toBeInstanceOf(RegraDeNegocioError);
    expect(await um(`select count(*)::int as n from eventos.pedido_sdc where pessoa_id = $1`, [dora])).toEqual({ n: 0 });
    // O banco também não deixa a turnê num pedido de hospedagem nem repetir o evento na volta.
    await expect(teste.sql(`insert into eventos.pedido_sdc (tipo, evento_id, evento_volta_id) values ('HOSPEDAGEM', $1, $2)`, [palestras.manaus, palestras.macapa])).rejects.toThrow(/pedido_sdc_evento_volta_check/);
    await expect(teste.sql(`insert into eventos.pedido_sdc (tipo, evento_id, evento_volta_id, pessoa_id) values ('VOO', $1, $1, $2)`, [palestras.manaus, dora])).rejects.toThrow(/pedido_sdc_evento_volta_check/);
  });

  it("data real: a solicitação e a compra levam o dia em que aconteceram; o lançamento continua com a hora de verdade", async () => {
    const eli = await staff("Eli Compra Antiga");
    // Futuro não; passado sim (pedido antigo, da planilha).
    await expect(registrarPedidoDeVoo({ eventoId: evento, pessoaId: eli, trechos: [{ ...ida, destinoCidade: "Porto Alegre (RS)" }], dataSolicitacao: "2026-10-29" }, ator(), agora)).rejects.toThrow(/data da solicitação não pode ser no futuro/);
    const pedido = await registrarPedidoDeVoo({ eventoId: evento, pessoaId: eli, trechos: [{ ...ida, destinoCidade: "Porto Alegre (RS)" }], dataSolicitacao: "2026-08-03" }, ator(), agora);
    expect(await doBanco(pedido.id)).toMatchObject({ data_solicitacao: "2026-08-03", data_compra: null, solicitado_em: agora });
    expect(await um(`select dados->>'dataSolicitacao' as data from eventos.registro_acao where entidade_id = $1 and acao = 'PEDIDO_REGISTRADO'`, [pedido.id])).toEqual({ data: "2026-08-03" });

    const retorno = { pedidoId: pedido.id, valorCentavos: 98000, trechos: [{ ...comprados[0]!, partidaEm: "2027-03-10T08:10", chegadaEm: "2027-03-10T10:00" }] };
    // A compra não vem antes da solicitação nem depois de hoje.
    await expect(registrarRetornoDaSdc({ ...retorno, dataCompra: "2026-08-02" }, ator(), agora)).rejects.toThrow(/A compra não pode ser antes da solicitação do pedido \(03\/08\/2026\)/);
    await expect(registrarRetornoDaSdc({ ...retorno, dataCompra: "2026-10-29" }, ator(), agora)).rejects.toThrow(/data da compra não pode ser no futuro/);
    expect(await doBanco(pedido.id)).toMatchObject({ situacao: "PEDIDO", data_compra: null });

    // Compra antiga, com a forma de pagamento da planilha.
    await registrarRetornoDaSdc({ ...retorno, dataCompra: "2026-08-20", formaPagamento: "Faturado SDC" }, ator(), agora);
    expect(await doBanco(pedido.id)).toMatchObject({ situacao: "EMITIDO", data_compra: "2026-08-20", forma_pagamento: "Faturado SDC", emitido_em: agora });
    // O histórico guarda o lançamento (com a data informada nos dados); o instante do registro é o de agora de verdade.
    const registro = await um(`select dados->>'dataCompra' as data, dados->>'formaPagamento' as forma, criado_em from eventos.registro_acao where entidade_id = $1 and acao = 'RETORNO_REGISTRADO'`, [pedido.id]);
    expect(registro).toMatchObject({ data: "2026-08-20", forma: "Faturado SDC" });
    expect((registro.criado_em as Date).getFullYear()).toBeGreaterThanOrEqual(2026);
    expect((registro.criado_em as Date).toISOString().slice(0, 10)).not.toBe("2026-08-20");

    // As telas mostram a data informada nas colunas Solicitação e Compra.
    const linha = linhasDe(await carregarVoos({}, agora)).find((item) => item.pedido?.id === pedido.id)!;
    expect(linha.pedido).toMatchObject({ dataSolicitacao: "2026-08-03", dataCompra: "2026-08-20", formaPagamento: "Faturado SDC" });
    // Corrigir a compra sem informar a data = hoje; e a data pode ser corrigida.
    await registrarRetornoDaSdc({ ...retorno, valorCentavos: 99000 }, ator(), agora);
    expect(await doBanco(pedido.id)).toMatchObject({ data_compra: HOJE, forma_pagamento: null });
    await registrarRetornoDaSdc({ ...retorno, dataCompra: "2026-08-21", formaPagamento: "Cartão corporativo" }, ator(), agora);
    expect(await doBanco(pedido.id)).toMatchObject({ data_compra: "2026-08-21", forma_pagamento: "Cartão corporativo" });
    await expect(teste.sql(`update eventos.pedido_sdc set data_compra = '2026-08-01' where id = $1`, [pedido.id])).rejects.toThrow(/pedido_sdc_data_compra_check/);
  });

  it("a SDC: vê a turnê (sem id interno), separa Eventos de Masterclass, informa só a data da compra e a forma de pagamento", async () => {
    const masterclass = await carregarVoosDaSdc({ recorte: "MASTERCLASS" }, agora);
    expect(masterclass.recorte).toBe("MASTERCLASS");
    expect(masterclass.pedidosPorRecorte).toEqual({ EVENTOS: 2, MASTERCLASS: 2 });
    const daAna = masterclass.grupos.flatMap((mes) => mes.eventos.flatMap((grupo) => grupo.linhas)).find((voo) => voo.passageiro === "Ana Palestrante")!;
    expect(daAna.evento).toMatchObject({ codigo: "MC_AM_MANAUS", masterclass: true, cidade: "Manaus" });
    expect(daAna.eventoDaVolta).toEqual({ chave: expect.stringMatching(/^e\d+$/), codigo: "MC_AP_MACAPA", nome: "MC_AP_MACAPA", dataInicio: "2027-03-14", dataFim: "2027-03-14", local: "Hotel Macapá", cidade: "Macapá", uf: "AP", masterclass: true });
    expect(daAna).toMatchObject({ dataSolicitacao: HOJE, dataCompra: null, formaPagamento: null });
    // A última palestra chega com os mesmos campos do evento do pedido, e nada do que a SDC recebe tem id interno.
    expect(Object.keys(daAna.eventoDaVolta!).sort()).toEqual(Object.keys(daAna.evento).filter((chave) => chave !== "id").sort());
    expect(JSON.stringify(masterclass)).not.toMatch(UUID);
    expect((await carregarVoosDaSdc({}, agora)).grupos.flatMap((mes) => mes.eventos.flatMap((grupo) => grupo.linhas)).map((voo) => voo.passageiro).sort()).toEqual(["Caio Do Evento", "Eli Compra Antiga"]);

    const compra = (extras: Record<string, unknown> = {}) =>
      registrarCompraDeVooPelaSdcSchema.parse({ referencia: daAna.referencia, valorCentavos: "2.400,00", trechos: comprados, ...extras });
    await expect(registrarCompraDeVoo(compra({ dataCompra: "2026-10-27" }), sdc(), agora)).rejects.toThrow(/antes da solicitação/);
    await expect(registrarCompraDeVoo(compra({ dataCompra: "2026-10-29" }), sdc(), agora)).rejects.toThrow(/no futuro/);
    await registrarCompraDeVoo(compra({ formaPagamento: "Faturado SDC" }), sdc(), agora);
    const comprado = (await carregarVoosDaSdc({ recorte: "MASTERCLASS" }, agora)).grupos.flatMap((mes) => mes.eventos.flatMap((grupo) => grupo.linhas)).find((voo) => voo.referencia === daAna.referencia)!;
    expect(comprado).toMatchObject({ dataCompra: HOJE, formaPagamento: "Faturado SDC", valorCentavos: 240000, paraASdc: "AGUARDANDO_APROVACAO" });
    // O time vê o mesmo na tabela de Masterclass.
    const doTime = linhasDe(await carregarVoos({ recorte: "MASTERCLASS" }, agora)).find((linha) => linha.pedido?.referencia === daAna.referencia)!;
    expect(doTime.pedido).toMatchObject({ dataCompra: HOJE, formaPagamento: "Faturado SDC", retornoPelaSdc: "SDC (teste)" });

    // No meio da turnê (a primeira palestra passou há mais de 120 dias? não: vale a data da ÚLTIMA): a SDC ainda corrige.
    const quaseNoLimite = new Date("2027-07-12T15:00:00Z");
    await registrarCompraDeVoo(compra({ dataCompra: "2026-11-02" }), sdc(), quaseNoLimite);
    expect(await um(`select data_compra::text from eventos.pedido_sdc where referencia = $1`, [daAna.referencia])).toEqual({ data_compra: "2026-11-02" });
    await expect(registrarCompraDeVoo(compra(), sdc(), new Date("2027-07-13T15:00:00Z"))).rejects.toThrow(/Pedido não encontrado/);
  });

  it("hospedagem de Masterclass: palestrante e time sem escala, pedido à SDC (a \"pré-reserva\" da planilha) e retorno com hotel, valor e pagamento", async () => {
    const fabi = await staff("Fabi Palestrante");
    const gil = await staff("Gil Do Time");
    // A palestra não tem escala: quem dorme é acrescentado direto (ou vem do voo com "também precisa de hotel").
    expect(await um(`select count(*)::int as n from eventos.escala where evento_id = $1`, [palestras.belem])).toEqual({ n: 0 });
    for (const pessoaId of [fabi, gil]) await acrescentarHospede({ eventoId: palestras.belem, pessoaId }, ator(), agora);

    // O recorte de Masterclass lista só palestras (e abre a que já tem o que montar); o de Eventos não as traz.
    const masterclass = await carregarHospedagem(null, agora, "MASTERCLASS");
    expect(masterclass.recorte).toBe("MASTERCLASS");
    expect(masterclass.eventos.map((item) => item.codigo)).toEqual(["MC_AM_MANAUS", "MC_PA_BELEM", "MC_AP_MACAPA"]);
    expect(masterclass.evento?.codigo).toBe("MC_PA_BELEM");
    expect(masterclass.equipe.map((pessoa) => [pessoa.nome, pessoa.origens, pessoa.naEscala])).toEqual([
      ["Fabi Palestrante", ["AVULSA"], false],
      ["Gil Do Time", ["AVULSA"], false],
    ]);
    const eventos = await carregarHospedagem(null, agora);
    expect(eventos.recorte).toBe("EVENTOS");
    expect(eventos.eventos.map((item) => item.codigo)).toEqual(["IPR_POA_950"]);
    // Uma palestra aberta por link cai no recorte dela, mesmo sem o parâmetro.
    expect((await carregarHospedagem(palestras.belem, agora)).recorte).toBe("MASTERCLASS");

    // Uma noite, um quarto, as duas pessoas.
    const hospedagemId = await criarHospedagem({ eventoId: palestras.belem, checkIn: "2027-03-12", checkOut: "2027-03-13" }, ator(), agora);
    await adicionarQuarto({ hospedagemId, nome: "Quarto 1", capacidade: 2 }, ator(), agora);
    const quartoId = (await carregarHospedagem(palestras.belem, agora)).hospedagens[0]!.quartos[0]!.id;
    for (const pessoaId of [fabi, gil]) await porNoQuarto({ quartoId, pessoaId }, ator(), agora);

    // Pedido feito à SDC antes (data real): fica "Pedido à SDC" até ela emitir, que é a "pré-reserva" da planilha.
    await expect(registrarPedidoDeHospedagem({ hospedagemId, dataSolicitacao: "2026-10-29" }, ator(), agora)).rejects.toThrow(/no futuro/);
    const { id: pedidoId } = await registrarPedidoDeHospedagem({ hospedagemId, dataSolicitacao: "2026-09-15" }, ator(), agora);
    const pedida = (await carregarHospedagem(palestras.belem, agora)).hospedagens[0]!;
    expect(pedida.pedido).toMatchObject({ situacao: "PEDIDO", dataSolicitacao: "2026-09-15", dataCompra: null });
    expect(pedida.textoParaSdc).toContain("Local do evento: Hotel Belém — Belém (PA)");
    expect(pedida.textoParaSdc).toContain("1 quarto · 2 pessoas");

    // Retorno: hotel onde dormem (outro que não o da palestra), valor, forma de pagamento e a data real da reserva.
    const retorno = { pedidoId, valorCentavos: 64000, numeroReserva: "RES-7781", formaPagamento: "Faturado SDC", novoHotel: { nome: "Hotel Do Sono", cidade: "Belém", uf: "PA" } };
    await expect(registrarRetornoDeHospedagem({ ...retorno, dataCompra: "2026-09-14" }, ator(), agora)).rejects.toThrow(/antes da solicitação do pedido \(15\/09\/2026\)/);
    await registrarRetornoDeHospedagem({ ...retorno, dataCompra: "2026-09-20" }, ator(), agora);
    const emitida = (await carregarHospedagem(palestras.belem, agora)).hospedagens[0]!;
    expect(emitida.local).toMatchObject({ nome: "Hotel Do Sono", cidade: "Belém", uf: "PA" });
    expect(emitida.pedido).toMatchObject({ situacao: "EMITIDO", valorCentavos: 64000, formaPagamento: "Faturado SDC", dataSolicitacao: "2026-09-15", dataCompra: "2026-09-20" });
    expect(emitida.textoDoRooming).toContain("Fabi Palestrante");
  });
});
