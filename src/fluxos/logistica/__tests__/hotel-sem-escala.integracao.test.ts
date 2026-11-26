import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

import type { Db } from "@/core/db/database";
import { ConflitoDeVersaoError, RegraDeNegocioError } from "@/fluxos/_base";
import { criarRepositorioDaSdc, vincularHotelDaPessoa, vincularPedidosDeVooDaPessoa } from "@/modules/logistica";
import { type BancoDeTeste, criarBancoDeTeste, TEST_DATABASE_URL } from "@/test/banco";

import {
  acrescentarHospede,
  adicionarQuarto,
  aplicarRoomingSugerido,
  cancelarPedido,
  carregarHospedagem,
  carregarVoos,
  criarHospedagem,
  definirHotelDoVoo,
  definirPeriodoDoOcupante,
  porNoQuarto,
  registrarPedidoDeHospedagem,
  registrarPedidoDeVoo,
  tirarDoQuarto,
  tirarHospede,
  trocarDeQuarto,
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

// Hotel pedido junto com o voo, sem depender da escala (docs/07 §4.6): o evento destes testes NÃO tem escala.
describe.skipIf(!TEST_DATABASE_URL)("hotel sem escala: lista de quem precisa de hotel, quartos por pessoa e origens", () => {
  let teste: BancoDeTeste;
  let usuarioId: string;
  let eventoId: string;
  const ator = () => ({ usuarioId, pessoaId: null, origem: "LOCAL" as const });
  const agora = new Date("2026-09-10T15:00:00Z");

  const um = async (texto: string, params: unknown[] = []) => ((await teste.sql(texto, params)) as Record<string, unknown>[])[0]!;
  const staff = async (nome: string, sexo: "F" | "M" = "F") => {
    const { id } = await um(`insert into core.pessoa (nome_completo) values ($1) returning id`, [nome]);
    await teste.sql(`insert into eventos.pessoa_evento (pessoa_id, sexo) values ($1, $2)`, [id, sexo]);
    return id as string;
  };
  const novoEvento = async (codigo: string, dia: string, status = "PLANEJADO") =>
    (await um(`insert into eventos.evento (nome, codigo, inicio, fim, status) values ($1, $1, $2::date + time '12:00', $2::date + time '22:00', $3) returning id`, [codigo, dia, status])).id as string;
  /** Põe a pessoa na escala do evento, como o fluxo da escala faz (insere a convocação e liga o que ela já tinha). */
  const entrarNaEscala = async (evento: string, pessoaId: string, precisaHotel = false) => {
    const escala =
      ((await teste.sql(`select id from eventos.escala where evento_id = $1 limit 1`, [evento])) as { id: string }[])[0]?.id ??
      ((await um(`insert into eventos.escala (evento_id, data, hora_inicio, hora_fim, quantidade_vagas, status) select id, (inicio at time zone 'America/Sao_Paulo')::date, '08:00', '18:00', 20, 'ABERTA' from eventos.evento where id = $1 returning id`, [evento])).id as string);
    const { id } = await um(`insert into eventos.convocacao (escala_id, pessoa_id, status, precisa_hotel) values ($1, $2, 'ACEITA', $3) returning id`, [escala, pessoaId, precisaHotel]);
    await vincularPedidosDeVooDaPessoa(teste.db, { eventoId: evento, pessoaId });
    await vincularHotelDaPessoa(teste.db, { eventoId: evento, pessoaId, instante: agora });
    return id as string;
  };
  const daLista = async (evento: string, pessoaId: string) => (await carregarHospedagem(evento, agora)).equipe.find((pessoa) => pessoa.pessoaId === pessoaId) ?? null;
  const ocupante = async (evento: string, pessoaId: string) =>
    ((await teste.sql(`select quarto_id, convocacao_id, check_in::text, check_out::text from eventos.quarto_ocupante where evento_id = $1 and pessoa_id = $2`, [evento, pessoaId])) as Record<string, unknown>[])[0] ?? null;
  const acoesDoEvento = async (evento: string, pessoaId: string) =>
    ((await teste.sql(`select acao from eventos.registro_acao where entidade = 'EVENTO' and entidade_id = $1 and em_nome_de_pessoa_id = $2 order by criado_em, id`, [evento, pessoaId])) as { acao: string }[]).map((linha) => linha.acao);

  const ida = { sentido: "IDA" as const, origemCidade: "Porto Alegre (RS)", destinoCidade: "Manaus (AM)", dataDesejada: "2026-12-14" };
  const volta = { sentido: "VOLTA" as const, origemCidade: "Manaus (AM)", destinoCidade: "Porto Alegre (RS)", dataDesejada: "2026-12-17" };
  const periodo = { checkIn: "2026-12-14", checkOut: "2026-12-18" };

  beforeAll(async () => {
    teste = await criarBancoDeTeste();
    banco.db = teste.db;
    usuarioId = (await um(`insert into core.usuario (email) values ('time@exemplo.test') returning id`)).id as string;
    eventoId = await novoEvento("HOTEL_AM_910", "2026-12-15");
  }, 60_000);

  afterAll(async () => {
    await teste?.encerrar();
  });

  it("junto com o voo: o pedido com \"também precisa de hotel\" põe a pessoa na lista e ela entra em quarto sem existir escala", async () => {
    const ana = await staff("Ana Voa E Dorme");
    const bruno = await staff("Bruno Só Voa", "M");
    expect(await um(`select count(*)::int as n from eventos.escala where evento_id = $1`, [eventoId])).toEqual({ n: 0 });

    const pedido = await registrarPedidoDeVoo({ eventoId, pessoaId: ana, trechos: [ida, volta], precisaHotel: true }, ator(), agora);
    expect(pedido.precisaHotel).toBe(true);
    const semHotel = await registrarPedidoDeVoo({ eventoId, pessoaId: bruno, trechos: [ida] }, ator(), agora);
    expect(await um(`select precisa_hotel from eventos.pedido_sdc where id = $1`, [semHotel.id])).toEqual({ precisa_hotel: false });

    // A Hospedagem já lista o evento (sem escala) e quem veio do voo; quem só voa não entra.
    const tela = await carregarHospedagem(null, agora);
    expect(tela.evento?.id).toBe(eventoId);
    expect(tela.eventos.map((evento) => evento.id)).toContain(eventoId);
    expect(tela.equipe).toEqual([{ pessoaId: ana, nome: "Ana Voa E Dorme", sexo: "F", origens: ["VOO"], naEscala: false, funcao: null, deslocamento: null, quartoId: null }]);
    expect(tela.semQuarto).toHaveLength(1);
    expect(tela.podeAcrescentar).toBe(true);
    // Sem escala no evento, dá para acrescentar qualquer pessoa ativa do cadastro de staff.
    expect(tela.acrescentarDe).toBe("STAFF");
    expect(tela.paraAcrescentar.map((pessoa) => pessoa.nome)).toEqual(["Bruno Só Voa"]);
    // E a tela de Voos leva para lá: "1 pessoa com voo pedido e sem quarto".
    expect((await carregarVoos({}, agora)).hotelSemQuarto).toMatchObject([{ evento: { id: eventoId }, pessoas: 1 }]);

    const hospedagemId = await criarHospedagem({ eventoId, ...periodo }, ator(), agora);
    await adicionarQuarto({ hospedagemId, nome: "Quarto 1", capacidade: 2, sexo: "F" }, ator(), agora);
    const quartoId = (await carregarHospedagem(eventoId, agora)).hospedagens[0]!.quartos[0]!.id;
    // Quem não está na lista não entra em quarto; quem está entra, sem escala.
    const fora = porNoQuarto({ quartoId, pessoaId: bruno }, ator(), agora);
    await expect(fora).rejects.toBeInstanceOf(RegraDeNegocioError);
    await expect(fora).rejects.toThrow(/não está na lista de quem precisa de hotel/);
    expect(await porNoQuarto({ quartoId, pessoaId: ana }, ator(), agora)).toMatchObject({ mudou: true, nomeDoQuarto: "Quarto 1" });
    expect(await ocupante(eventoId, ana)).toEqual({ quarto_id: quartoId, convocacao_id: null, check_in: null, check_out: null });
    expect((await carregarVoos({}, agora)).hotelSemQuarto).toEqual([]);

    // Período próprio, rooming e pedido à SDC funcionam com o ocupante sem escala.
    await definirPeriodoDoOcupante({ quartoId, pessoaId: ana, checkIn: "2026-12-15", checkOut: "2026-12-17" }, ator(), agora);
    const { referencia } = await registrarPedidoDeHospedagem({ hospedagemId }, ator(), agora);
    const comQuarto = (await carregarHospedagem(eventoId, agora)).hospedagens[0]!;
    expect(comQuarto.textoDoRooming).toContain("Ana Voa E Dorme (15/12 a 17/12)");
    expect(comQuarto.textoParaSdc).toContain("1 quarto · 1 pessoa");
    expect(comQuarto.textoParaSdc).toContain("Ana Voa E Dorme");
    // A SDC vê o nome certo na lista de quartos (e nada novo: o teste de lista fechada dela continua em src/fluxos/sdc).
    const daSdc = (await criarRepositorioDaSdc(teste.db).hospedagens({ desde: "2026-01-01" })).find((item) => item.referencia === referencia)!;
    expect(daSdc.quartos).toEqual([{ nome: "Quarto 1", capacidade: 2, ocupantes: ["Ana Voa E Dorme"] }]);
    expect(Object.keys(daSdc)).not.toContain("precisaHotel");
  });

  it("no pedido de voo que já existe: marcar põe na lista; desmarcar com a pessoa num quarto só é recusado se o voo for a única origem", async () => {
    const [ana] = (await teste.sql(`select id from core.pessoa where nome_completo = 'Ana Voa E Dorme'`)) as { id: string }[];
    const [bruno] = (await teste.sql(`select id from core.pessoa where nome_completo = 'Bruno Só Voa'`)) as { id: string }[];
    const pedidoDe = async (pessoaId: string) => (await um(`select id from eventos.pedido_sdc where evento_id = $1 and pessoa_id = $2 and tipo = 'VOO' and situacao <> 'CANCELADO'`, [eventoId, pessoaId])).id as string;

    // Bruno: marcar depois de o pedido existir.
    expect(await definirHotelDoVoo({ pedidoId: await pedidoDe(bruno!.id), precisaHotel: true }, ator(), agora)).toMatchObject({ precisaHotel: true, continuaNaLista: true });
    expect(await daLista(eventoId, bruno!.id)).toMatchObject({ origens: ["VOO"], quartoId: null });
    await expect(definirHotelDoVoo({ pedidoId: await pedidoDe(bruno!.id), precisaHotel: true }, ator(), agora)).rejects.toThrow(/já está marcado com hotel/);
    // Fora de quarto, desmarcar tira da lista.
    expect(await definirHotelDoVoo({ pedidoId: await pedidoDe(bruno!.id), precisaHotel: false }, ator(), agora)).toMatchObject({ precisaHotel: false, continuaNaLista: false });
    expect(await daLista(eventoId, bruno!.id)).toBeNull();

    // Ana está num quarto e o voo é a única origem: desmarcar é recusado e nada muda.
    const recusa = definirHotelDoVoo({ pedidoId: await pedidoDe(ana!.id), precisaHotel: false }, ator(), agora);
    await expect(recusa).rejects.toBeInstanceOf(RegraDeNegocioError);
    await expect(recusa).rejects.toThrow(/já está num quarto\. Tire a pessoa do quarto em Hospedagem antes de desmarcar o hotel/);
    expect(await um(`select precisa_hotel from eventos.pedido_sdc where id = $1`, [await pedidoDe(ana!.id)])).toEqual({ precisa_hotel: true });

    // Com outra origem (acrescentada na Hospedagem), desmarcar o voo passa e ela continua no quarto.
    await acrescentarHospede({ eventoId, pessoaId: ana!.id }, ator(), agora);
    expect((await daLista(eventoId, ana!.id))?.origens).toEqual(["VOO", "AVULSA"]);
    expect(await definirHotelDoVoo({ pedidoId: await pedidoDe(ana!.id), precisaHotel: false }, ator(), agora)).toMatchObject({ continuaNaLista: true });
    expect(await daLista(eventoId, ana!.id)).toMatchObject({ origens: ["AVULSA"], quartoId: expect.any(String) });
    expect((await teste.sql(`select acao from eventos.registro_acao where entidade = 'PEDIDO_SDC' and entidade_id = $1 and acao like 'HOTEL_%' order by criado_em, id`, [await pedidoDe(ana!.id)])) as unknown[]).toEqual([
      { acao: "HOTEL_DESMARCADO" },
    ]);
  });

  it("direto na Hospedagem: acrescenta qualquer staff ativo a evento futuro não cancelado; tira só quem não fica num quarto por causa disso", async () => {
    const carla = await staff("Carla Acrescentada");
    expect(await acrescentarHospede({ eventoId, pessoaId: carla }, ator(), agora)).toEqual({ nome: "Carla Acrescentada", mudou: true });
    expect(await daLista(eventoId, carla)).toMatchObject({ origens: ["AVULSA"], naEscala: false, quartoId: null });
    expect(await acoesDoEvento(eventoId, carla)).toEqual(["HOSPEDE_ACRESCENTADO"]);
    await expect(acrescentarHospede({ eventoId, pessoaId: carla }, ator(), agora)).rejects.toThrow(/já foi acrescentada/);

    // A mesma regra do pedido de voo para quem e para qual evento.
    const { id: foraDoStaff } = await um(`insert into core.pessoa (nome_completo) values ('Fora Do Staff') returning id`);
    const inativa = await staff("Inativa No Cadastro");
    await teste.sql(`update core.pessoa set ativo = false where id = $1`, [inativa]);
    for (const pessoaId of [foraDoStaff as string, inativa]) {
      await expect(acrescentarHospede({ eventoId, pessoaId }, ator(), agora)).rejects.toThrow(/não está ativa no cadastro de staff/);
    }
    const cancelado = await novoEvento("CANC_AM_911", "2026-12-22", "CANCELADO");
    await expect(acrescentarHospede({ eventoId: cancelado, pessoaId: carla }, ator(), agora)).rejects.toThrow(/foi cancelado/);
    await expect(acrescentarHospede({ eventoId, pessoaId: carla }, ator(), new Date("2027-01-10T15:00:00Z"))).rejects.toThrow(/já terminou/);
    await expect(acrescentarHospede({ eventoId: carla, pessoaId: carla }, ator(), agora)).rejects.toThrow(/Evento não encontrado/);
    expect((await carregarHospedagem(eventoId, new Date("2027-01-10T15:00:00Z"))).podeAcrescentar).toBe(false);

    // Num quarto só por ter sido acrescentada: tirar da lista é recusado até sair do quarto.
    const quartoId = (await carregarHospedagem(eventoId, agora)).hospedagens[0]!.quartos[0]!.id;
    await porNoQuarto({ quartoId, pessoaId: carla }, ator(), agora);
    const recusa = tirarHospede({ eventoId, pessoaId: carla }, ator(), agora);
    await expect(recusa).rejects.toBeInstanceOf(RegraDeNegocioError);
    await expect(recusa).rejects.toThrow(/está num quarto\. Tire a pessoa do quarto antes de tirá-la da lista/);
    await tirarDoQuarto({ quartoId, pessoaId: carla }, ator(), agora);
    expect(await tirarHospede({ eventoId, pessoaId: carla }, ator(), agora)).toEqual({ nome: "Carla Acrescentada", continuaNaLista: false });
    expect(await daLista(eventoId, carla)).toBeNull();
    expect(await acoesDoEvento(eventoId, carla)).toEqual(["HOSPEDE_ACRESCENTADO", "HOSPEDE_RETIRADO"]);
    // Tirar de novo (tela desatualizada) não passa em silêncio.
    await expect(tirarHospede({ eventoId, pessoaId: carla }, ator(), agora)).rejects.toBeInstanceOf(ConflitoDeVersaoError);
  });

  it("a lista é a união das origens, sem repetir a pessoa; quem entra na escala depois leva o quarto e a marca de hotel", async () => {
    const evento = await novoEvento("UNIAO_AM_912", "2026-12-20");
    const dora = await staff("Dora Três Origens");
    const eli = await staff("Eli Da Escala");
    const fabi = await staff("Fabi Sem Hotel");

    // Dora: voo com hotel + acrescentada, ainda sem escala; já num quarto.
    await registrarPedidoDeVoo({ eventoId: evento, pessoaId: dora, trechos: [{ ...ida, dataDesejada: "2026-12-19" }], precisaHotel: true }, ator(), agora);
    await acrescentarHospede({ eventoId: evento, pessoaId: dora }, ator(), agora);
    const hospedagemId = await criarHospedagem({ eventoId: evento, checkIn: "2026-12-19", checkOut: "2026-12-21" }, ator(), agora);
    await adicionarQuarto({ hospedagemId, nome: "Quarto A", capacidade: 2 }, ator(), agora);
    await adicionarQuarto({ hospedagemId, nome: "Quarto B", capacidade: 2 }, ator(), agora);
    const [quartoA, quartoB] = (await carregarHospedagem(evento, agora)).hospedagens[0]!.quartos;
    await porNoQuarto({ quartoId: quartoA!.id, pessoaId: dora }, ator(), agora);
    await definirPeriodoDoOcupante({ quartoId: quartoA!.id, pessoaId: dora, checkIn: "2026-12-20", checkOut: "2026-12-21" }, ator(), agora);

    // A escala nasce depois. Eli entra marcada com Hotel; Fabi entra sem; Dora entra e leva o que já tinha.
    const convocacaoDaEli = await entrarNaEscala(evento, eli, true);
    await entrarNaEscala(evento, fabi);
    const convocacaoDaDora = await entrarNaEscala(evento, dora);
    expect(await ocupante(evento, dora)).toEqual({ quarto_id: quartoA!.id, convocacao_id: convocacaoDaDora, check_in: "2026-12-20", check_out: "2026-12-21" });
    expect(await um(`select precisa_hotel from eventos.convocacao where id = $1`, [convocacaoDaDora])).toEqual({ precisa_hotel: true });

    const tela = await carregarHospedagem(evento, agora);
    expect(tela.equipe.map(({ nome, origens, naEscala, quartoId }) => ({ nome, origens, naEscala, noQuarto: quartoId !== null }))).toEqual([
      { nome: "Dora Três Origens", origens: ["ESCALA", "VOO", "AVULSA"], naEscala: true, noQuarto: true },
      { nome: "Eli Da Escala", origens: ["ESCALA"], naEscala: true, noQuarto: false },
    ]);
    // Fabi está na escala sem hotel e sem outra origem: é o lembrete "falta alguém?".
    expect(tela.naEscalaSemHotel).toBe(1);
    // Com escala, "Acrescentar pessoa" só traz nomes dela: quem está escalado e ainda fora da lista de hotel.
    expect(tela.acrescentarDe).toBe("ESCALA");
    expect(tela.paraAcrescentar.map((pessoa) => pessoa.nome)).toEqual(["Fabi Sem Hotel"]);

    // "Distribuir por sexo" e a troca de quarto continuam funcionando, por pessoa.
    expect(await aplicarRoomingSugerido(evento, ator(), agora)).toEqual({ alocadas: 1, semLugar: 0 });
    expect(await ocupante(evento, eli)).toMatchObject({ convocacao_id: convocacaoDaEli });
    await porNoQuarto({ quartoId: quartoB!.id, pessoaId: eli }, ator(), agora);
    expect(await trocarDeQuarto({ quartoId: quartoA!.id, pessoaId: dora, comQuartoId: quartoB!.id, comPessoaId: eli }, ator(), agora)).toMatchObject({ nomeDoQuarto: "Quarto B", nomeDoOutroQuarto: "Quarto A" });
    expect(await ocupante(evento, dora)).toMatchObject({ quarto_id: quartoB!.id, check_in: "2026-12-20", check_out: "2026-12-21" });
    // Uma cama por pessoa no evento, garantida pelo banco.
    await expect(teste.sql(`insert into eventos.quarto_ocupante (quarto_id, evento_id, pessoa_id) values ($1, $2, $3)`, [quartoA!.id, evento, dora])).rejects.toThrow(/quarto_ocupante_evento_pessoa_unique/);

    // Tirar origens à mão, uma a uma: com outra origem, Dora continua na lista e no quarto.
    expect(await tirarHospede({ eventoId: evento, pessoaId: dora }, ator(), agora)).toEqual({ nome: "Dora Três Origens", continuaNaLista: true });
    expect((await daLista(evento, dora))?.origens).toEqual(["ESCALA", "VOO"]);
    const { id: pedidoDaDora } = await um(`select id from eventos.pedido_sdc where evento_id = $1 and pessoa_id = $2`, [evento, dora]);
    expect(await definirHotelDoVoo({ pedidoId: pedidoDaDora as string, precisaHotel: false }, ator(), agora)).toMatchObject({ continuaNaLista: true });
    expect(await daLista(evento, dora)).toMatchObject({ origens: ["ESCALA"], quartoId: quartoB!.id });
  });

  it("cancelar o voo não arranca ninguém do quarto: sem outra origem a pessoa fica como acrescentada; fora de quarto, só sai da lista", async () => {
    const evento = await novoEvento("CANCELA_AM_913", "2026-12-26");
    const gil = await staff("Gil No Quarto", "M");
    const hugo = await staff("Hugo Sem Quarto", "M");
    const doGil = await registrarPedidoDeVoo({ eventoId: evento, pessoaId: gil, trechos: [{ ...ida, dataDesejada: "2026-12-25" }], precisaHotel: true }, ator(), agora);
    const doHugo = await registrarPedidoDeVoo({ eventoId: evento, pessoaId: hugo, trechos: [{ ...ida, dataDesejada: "2026-12-25" }], precisaHotel: true }, ator(), agora);
    const hospedagemId = await criarHospedagem({ eventoId: evento, checkIn: "2026-12-25", checkOut: "2026-12-27" }, ator(), agora);
    await adicionarQuarto({ hospedagemId, nome: "Quarto 1", capacidade: 2 }, ator(), agora);
    const quartoId = (await carregarHospedagem(evento, agora)).hospedagens[0]!.quartos[0]!.id;
    await porNoQuarto({ quartoId, pessoaId: gil }, ator(), agora);

    expect(await cancelarPedido({ pedidoId: doHugo.id, motivo: "Vai de carro" }, ator(), agora)).toMatchObject({ situacao: "CANCELADO", mantidaNoQuarto: false });
    expect(await daLista(evento, hugo)).toBeNull();

    expect(await cancelarPedido({ pedidoId: doGil.id, motivo: "Vai de carro" }, ator(), agora)).toMatchObject({ situacao: "CANCELADO", mantidaNoQuarto: true });
    expect(await daLista(evento, gil)).toMatchObject({ origens: ["AVULSA"], quartoId });
    expect(await acoesDoEvento(evento, gil)).toEqual(["HOSPEDE_MANTIDO_NO_QUARTO"]);
    // Daí em diante é o time que decide na Hospedagem: tira do quarto e da lista.
    await tirarDoQuarto({ quartoId, pessoaId: gil }, ator(), agora);
    await tirarHospede({ eventoId: evento, pessoaId: gil }, ator(), agora);
    expect((await carregarHospedagem(evento, agora)).equipe).toEqual([]);
  });
});
