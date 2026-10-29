import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

import type { Db } from "@/core/db/database";
import { ConflitoDeVersaoError, RegraDeNegocioError } from "@/fluxos/_base";
import { type BancoDeTeste, criarBancoDeTeste, TEST_DATABASE_URL } from "@/test/banco";

import {
  adicionarQuarto,
  alterarPedido,
  aplicarRoomingSugerido,
  cancelarPedido,
  carregarCaronas,
  carregarHospedagem,
  carregarPedido,
  carregarVoos,
  criarCarona,
  criarHospedagem,
  definirCarona,
  porNoQuarto,
  registrarPedidoDeHospedagem,
  registrarPedidoDeVoo,
  registrarRetornoDaSdc,
  registrarRetornoDeHospedagem,
  resumoParaInicio,
  tirarDoQuarto,
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

describe.skipIf(!TEST_DATABASE_URL)("fluxos da logística no banco", () => {
  let teste: BancoDeTeste;
  let usuarioId: string;
  const ator = () => ({ usuarioId, pessoaId: null, origem: "LOCAL" as const });
  let eventoId: string;
  let escalaId: string;
  const agora = new Date("2026-10-28T15:00:00Z");

  const um = async (texto: string, params: unknown[] = []) => ((await teste.sql(texto, params)) as Record<string, string>[])[0]!;

  async function convocar(nome: string, opcoes: { deslocamento?: string; sexo?: "F" | "M" | null; lugares?: number; status?: string } = {}) {
    const { id: pessoaId } = await um(`insert into core.pessoa (nome_completo) values ($1) returning id`, [nome]);
    await teste.sql(`insert into eventos.pessoa_evento (pessoa_id, sexo) values ($1, $2)`, [pessoaId, opcoes.sexo ?? null]);
    if (opcoes.lugares) await teste.sql(`insert into eventos.pessoa_veiculo (pessoa_id, lugares, consumo_km_l) values ($1, $2, 11.5)`, [pessoaId, opcoes.lugares]);
    const { id } = await um(`insert into eventos.convocacao (escala_id, pessoa_id, status, deslocamento) values ($1, $2, $3, $4) returning id`, [
      escalaId,
      pessoaId,
      opcoes.status ?? "ACEITA",
      opcoes.deslocamento ?? null,
    ]);
    return { convocacaoId: id!, pessoaId: pessoaId! };
  }

  const ida = { sentido: "IDA" as const, origemIata: "POA", destinoIata: "MAO", dataDesejada: "2026-12-14" };
  const volta = { sentido: "VOLTA" as const, origemIata: "MAO", destinoIata: "POA", dataDesejada: "2026-12-17" };

  beforeAll(async () => {
    teste = await criarBancoDeTeste();
    banco.db = teste.db;
    usuarioId = (await um(`insert into core.usuario (email) values ('time@exemplo.test') returning id`)).id!;
    const { id: localId } = await um(`insert into eventos.local (nome, tipo, cidade, uf) values ('Centro de Convenções', 'EVENTO', 'Manaus', 'AM') returning id`);
    eventoId = (
      await um(
        `insert into eventos.evento (nome, codigo, inicio, fim, status, local_id)
         values ('ASM', 'ASM_AM_900', '2026-12-15T12:00:00Z', '2026-12-17T22:00:00Z', 'PLANEJADO', $1) returning id`,
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

  it("pedido de voo: a pedir → pedido → emitido → alterado → cancelado, com registro_acao", async () => {
    const ana = await convocar("Ana Voo", { deslocamento: "VOO", sexo: "F" });
    const carro = await convocar("Caio Carro", { deslocamento: "CARRO_PROPRIO", sexo: "M" });

    const antes = await carregarVoos({}, agora);
    expect(antes.linhas.map((linha) => [linha.passageiro.nome, linha.situacao, linha.janela.janela])).toEqual([["Ana Voo", "A_PEDIR", "ATRASADO"]]);
    expect(antes.aPedirNaJanela).toBe(1);
    expect((await resumoParaInicio(agora)).find((item) => item.chave === "voos-a-pedir")?.quantidade).toBe(1);

    await expect(registrarPedidoDeVoo({ convocacaoId: carro.convocacaoId, trechos: [ida] }, ator(), agora)).rejects.toThrow(/Avião/);

    const pedido = await registrarPedidoDeVoo({ convocacaoId: ana.convocacaoId, trechos: [ida, volta], observacaoTime: "Bagagem de mão" }, ator(), agora);
    expect(pedido.referencia).toMatch(/^SDC-\d{6}$/);
    await expect(registrarPedidoDeVoo({ convocacaoId: ana.convocacaoId, trechos: [ida] }, ator(), agora)).rejects.toBeInstanceOf(RegraDeNegocioError);

    const carregado = await carregarPedido(pedido.referencia);
    expect(carregado?.situacao).toBe("PEDIDO");
    expect(carregado?.textoParaSdc).toContain("Ida: POA → MAO em 14/12/2026");

    const retorno = {
      pedidoId: pedido.id,
      valorCentavos: 98000,
      trechos: [{ sentido: "IDA" as const, companhia: "Azul", numeroVoo: "AD4120", localizador: "KXQ7PZ", partidaEm: "2026-12-14T08:10", chegadaEm: "2026-12-14T11:45" }],
    };
    await expect(registrarRetornoDaSdc(retorno, ator(), agora)).rejects.toThrow(/volta/);
    await registrarRetornoDaSdc(
      {
        ...retorno,
        trechos: [
          ...retorno.trechos,
          { sentido: "VOLTA", companhia: "Azul", numeroVoo: "AD4121", localizador: "KXQ7PZ", partidaEm: "2026-12-17T19:20", chegadaEm: "2026-12-17T22:05", cartaoEmbarqueUrl: "https://exemplo.test/cartao" },
        ],
      },
      ator(),
      agora,
    );
    const emitido = await um(`select situacao, valor_centavos, retorno_registrado_por, emitido_em from eventos.pedido_sdc where id = $1`, [pedido.id]);
    expect(emitido).toMatchObject({ situacao: "EMITIDO", valor_centavos: 98000, retorno_registrado_por: usuarioId });
    expect(await um(`select partida_em from eventos.trecho_voo where pedido_id = $1 and sentido = 'IDA'`, [pedido.id])).toEqual({ partida_em: new Date("2026-12-14T11:10:00Z") });
    await expect(registrarRetornoDaSdc({ ...retorno, trechos: [] }, ator(), agora)).rejects.toThrow(/já foi emitido/);

    const versao = (await carregarPedido(pedido.referencia))!.atualizadoEm;
    await expect(alterarPedido({ pedidoId: pedido.id, atualizadoEm: "2020-01-01T00:00:00.000Z" }, ator(), agora)).rejects.toBeInstanceOf(ConflitoDeVersaoError);
    const depois = new Date(agora.getTime() + 60_000);
    await alterarPedido({ pedidoId: pedido.id, atualizadoEm: versao, trechos: [ida, { ...volta, dataDesejada: "2026-12-18" }] }, ator(), depois);
    expect((await carregarPedido(pedido.referencia))?.situacao).toBe("ALTERADO");
    expect((await resumoParaInicio(depois)).find((item) => item.chave === "pedidos-alterados")?.quantidade).toBe(1);

    await cancelarPedido({ pedidoId: pedido.id, motivo: "Vai de carro com a equipe" }, ator(), depois);
    expect((await carregarVoos({ situacao: "A_PEDIR" }, depois)).linhas).toHaveLength(1);
    const novo = await registrarPedidoDeVoo({ convocacaoId: ana.convocacaoId, trechos: [ida] }, ator(), depois);
    expect(novo.referencia).not.toBe(pedido.referencia);

    const acoes = await teste.sql(`select acao, status_de, status_para, usuario_id from eventos.registro_acao where entidade = 'PEDIDO_SDC' and entidade_id = $1 order by criado_em`, [
      pedido.id,
    ]);
    expect(acoes.map((linha) => (linha as { acao: string }).acao)).toEqual(["PEDIDO_REGISTRADO", "RETORNO_REGISTRADO", "ALTERADO", "CANCELADO"]);
    // O localizador fica só no trecho: o histórico imutável diz apenas que houve.
    expect(await um(`select dados from eventos.registro_acao where entidade_id = $1 and acao = 'RETORNO_REGISTRADO'`, [pedido.id])).toEqual({
      dados: { emNomeDe: "SDC", valorCentavos: 98000, trechos: 2, temLocalizador: true },
    });
    expect(await um(`select comentario, dados from eventos.registro_acao where entidade_id = $1 and acao = 'CANCELADO'`, [pedido.id])).toEqual({
      comentario: null,
      dados: { temMotivo: true },
    });
    expect(await um(`select motivo_cancelamento from eventos.pedido_sdc where id = $1`, [pedido.id])).toEqual({ motivo_cancelamento: "Vai de carro com a equipe" });
    const historico = JSON.stringify(await teste.sql(`select dados, comentario from eventos.registro_acao where entidade_id = $1`, [pedido.id]));
    expect(historico).not.toContain("KXQ7PZ");
    expect(historico).not.toContain("Vai de carro");
  });

  it("hospedagem e quartos: sexo, capacidade, mover para outro quarto e rooming sugerido", async () => {
    const bia = await convocar("Bia Quarto", { sexo: "F" });
    const duda = await convocar("Duda Quarto", { sexo: "F" });
    const edu = await convocar("Edu Quarto", { sexo: "M" });
    const { id: localEvento } = await um(`select local_id as id from eventos.evento where id = $1`, [eventoId]);
    const { id: hotelId } = await um(`insert into eventos.local (nome, tipo, cidade, uf) values ('Hotel Teste', 'HOTEL', 'Manaus', 'AM') returning id`);

    await expect(criarHospedagem({ eventoId, localId: localEvento!, checkIn: "2026-12-14", checkOut: "2026-12-18" }, ator(), agora)).rejects.toThrow(/hotel ou um apartamento/);
    const hospedagemId = await criarHospedagem({ eventoId, localId: hotelId!, checkIn: "2026-12-14", checkOut: "2026-12-18" }, ator(), agora);
    await adicionarQuarto({ hospedagemId, nome: "Quarto 1", capacidade: 1, sexo: "F" }, ator(), agora);
    await adicionarQuarto({ hospedagemId, nome: "Quarto 2", capacidade: 3 }, ator(), agora);

    const { id: pedidoId } = await registrarPedidoDeHospedagem({ hospedagemId }, ator(), agora);
    await registrarRetornoDeHospedagem({ pedidoId, valorCentavos: 120000, numeroReserva: "RES-99812" }, ator(), agora);
    expect(await um(`select numero_reserva from eventos.hospedagem where id = $1`, [hospedagemId])).toEqual({ numero_reserva: "RES-99812" });
    expect(await um(`select dados from eventos.registro_acao where entidade_id = $1 and acao = 'RETORNO_REGISTRADO'`, [pedidoId])).toEqual({
      dados: { emNomeDe: "SDC", valorCentavos: 120000, temNumeroReserva: true },
    });
    await expect(adicionarQuarto({ hospedagemId, nome: "quarto 1", capacidade: 2 }, ator(), agora)).rejects.toThrow(/Já existe/);

    const carregada = await carregarHospedagem(eventoId, agora);
    const [quarto1, quarto2] = carregada.hospedagens[0]!.quartos;
    await expect(porNoQuarto({ quartoId: quarto1!.id, convocacaoId: edu.convocacaoId }, ator(), agora)).rejects.toThrow(/outro sexo/);
    await porNoQuarto({ quartoId: quarto1!.id, convocacaoId: bia.convocacaoId }, ator(), agora);
    await expect(porNoQuarto({ quartoId: quarto1!.id, convocacaoId: duda.convocacaoId }, ator(), agora)).rejects.toThrow(/todas as camas/);

    // "Mover para…": Bia sai do Quarto 1 e vai para o Quarto 2 (uma cama por convocação).
    const movida = await porNoQuarto({ quartoId: quarto2!.id, convocacaoId: bia.convocacaoId }, ator(), agora);
    expect(movida.mudou).toBe(true);
    expect(await teste.sql(`select quarto_id from eventos.quarto_ocupante where convocacao_id = $1`, [bia.convocacaoId])).toEqual([{ quarto_id: quarto2!.id }]);
    await tirarDoQuarto({ quartoId: quarto2!.id, convocacaoId: bia.convocacaoId }, ator(), agora);
    await expect(tirarDoQuarto({ quartoId: quarto2!.id, convocacaoId: bia.convocacaoId }, ator(), agora)).rejects.toBeInstanceOf(ConflitoDeVersaoError);

    const resultado = await aplicarRoomingSugerido(eventoId, ator(), agora);
    expect(resultado.alocadas).toBeGreaterThanOrEqual(3);
    const depois = await carregarHospedagem(eventoId, agora);
    const porNome = Object.fromEntries(depois.hospedagens[0]!.quartos.map((quarto) => [quarto.nome, quarto.ocupantes.map((ocupante) => ocupante.nome)]));
    expect(porNome["Quarto 1"]).toHaveLength(1);
    expect(depois.hospedagens[0]!.quartosComSexosMisturados).toEqual([]);
    const movidas = await teste.sql(`select acao from eventos.registro_acao where entidade = 'HOSPEDAGEM' and entidade_id = $1 order by criado_em`, [hospedagemId]);
    expect(movidas.map((linha) => (linha as { acao: string }).acao)).toContain("OCUPANTE_MOVIDO");
  });

  it("caronas: motorista com veículo e carro cheio", async () => {
    const motorista = await convocar("Fabi Motorista", { lugares: 1, deslocamento: "CARRO_PROPRIO" });
    const semCarro = await convocar("Gil Sem Carro", { deslocamento: "CARONA" });
    const outro = await convocar("Hugo Carona", { deslocamento: "CARONA" });

    await expect(criarCarona({ eventoId, motoristaConvocacaoId: semCarro.convocacaoId }, ator(), agora)).rejects.toThrow(/não tem veículo/);
    const caronaId = await criarCarona({ eventoId, motoristaConvocacaoId: motorista.convocacaoId }, ator(), agora);
    await definirCarona({ convocacaoId: semCarro.convocacaoId, caronaId }, ator(), agora);
    await expect(definirCarona({ convocacaoId: outro.convocacaoId, caronaId }, ator(), agora)).rejects.toThrow(/lugares ocupados/);

    const caronas = await carregarCaronas(eventoId, agora);
    expect(caronas.caronas[0]).toMatchObject({ motoristaNome: "Fabi Motorista", livres: 0 });
    expect(caronas.semCarona.map((pessoa) => pessoa.nome)).toEqual(["Hugo Carona"]);
    expect(await um(`select carona_id from eventos.convocacao where id = $1`, [semCarro.convocacaoId])).toEqual({ carona_id: caronaId });

    const registros = await teste.sql(
      `select acao, dados->>'convocacaoId' as convocacao_id from eventos.registro_acao where entidade = 'CARONA' and entidade_id = $1 order by criado_em, acao desc`,
      [caronaId],
    );
    expect(registros).toEqual([
      { acao: "MOTORISTA_DEFINIDO", convocacao_id: motorista.convocacaoId },
      { acao: "CARONA_DEFINIDA", convocacao_id: semCarro.convocacaoId },
    ]);
    expect(await um(`select count(*)::int as n from eventos.registro_acao where entidade = 'CONVOCACAO' and acao like '%CARONA%'`)).toEqual({ n: 0 });
  });
});
