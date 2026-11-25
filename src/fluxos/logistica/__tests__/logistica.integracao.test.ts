import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

import type { Db } from "@/core/db/database";
import { ConflitoDeVersaoError, RegraDeNegocioError } from "@/fluxos/_base";
import { vincularPedidosDeVooDaPessoa } from "@/modules/logistica";
import { type BancoDeTeste, criarBancoDeTeste, TEST_DATABASE_URL } from "@/test/banco";

import {
  adicionarQuarto,
  alterarHospedagem,
  alterarPedido,
  aplicarRoomingSugerido,
  cancelarPedido,
  carregarAvisoDeVoos,
  carregarCaronas,
  carregarHospedagem,
  carregarPedido,
  carregarVoos,
  criarCarona,
  criarHospedagem,
  definirCarona,
  definirPeriodoDoOcupante,
  dispensarLogisticaDoEvento,
  porNoQuarto,
  registrarPedidoDeHospedagem,
  registrarPedidoDeVoo,
  registrarRetornoDaSdc,
  registrarRetornoDeHospedagem,
  removerHospedagem,
  removerQuarto,
  resumoParaInicio,
  salvarAvisoDeVoos,
  tirarDoQuarto,
  trocarDeQuarto,
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

describe.skipIf(!TEST_DATABASE_URL)("fluxos da logística no banco", () => {
  let teste: BancoDeTeste;
  let usuarioId: string;
  const ator = () => ({ usuarioId, pessoaId: null, origem: "LOCAL" as const });
  let eventoId: string;
  let escalaId: string;
  const agora = new Date("2026-10-28T15:00:00Z");

  const um = async (texto: string, params: unknown[] = []) => ((await teste.sql(texto, params)) as Record<string, string>[])[0]!;

  /** `hotel`: marcada na escala como "precisa de hotel" (padrão sim; a Hospedagem só enxerga quem está marcado). */
  async function convocar(
    nome: string,
    opcoes: { deslocamento?: string; sexo?: "F" | "M" | null; lugares?: number; status?: string; hotel?: boolean; naEscala?: string } = {},
  ) {
    const { id: pessoaId } = await um(`insert into core.pessoa (nome_completo) values ($1) returning id`, [nome]);
    await teste.sql(`insert into eventos.pessoa_evento (pessoa_id, sexo) values ($1, $2)`, [pessoaId, opcoes.sexo ?? null]);
    if (opcoes.lugares) await teste.sql(`insert into eventos.pessoa_veiculo (pessoa_id, lugares, consumo_km_l) values ($1, $2, 11.5)`, [pessoaId, opcoes.lugares]);
    const { id } = await um(`insert into eventos.convocacao (escala_id, pessoa_id, status, deslocamento, precisa_hotel) values ($1, $2, $3, $4, $5) returning id`, [
      opcoes.naEscala ?? escalaId,
      pessoaId,
      opcoes.status ?? "ACEITA",
      opcoes.deslocamento ?? null,
      opcoes.hotel ?? true,
    ]);
    return { convocacaoId: id!, pessoaId: pessoaId! };
  }

  /** Outro evento (com uma linha de escala), para os testes que não podem depender do que os anteriores deixaram. */
  async function outroEvento(codigo: string, dia: string) {
    const { id: localId } = await um(`select local_id as id from eventos.evento where id = $1`, [eventoId]);
    const { id } = await um(
      `insert into eventos.evento (nome, codigo, inicio, fim, status, local_id) values ($1, $1, $2::date + time '12:00', $2::date + time '22:00', 'PLANEJADO', $3) returning id`,
      [codigo, dia, localId],
    );
    const { id: escala } = await um(
      `insert into eventos.escala (evento_id, data, hora_inicio, hora_fim, quantidade_vagas, status) values ($1, $2, '08:00', '18:00', 20, 'ABERTA') returning id`,
      [id, dia],
    );
    return { id: id!, escalaId: escala! };
  }

  /** Pessoa ativa do cadastro de staff, fora de qualquer escala. */
  async function staff(nome: string) {
    const { id } = await um(`insert into core.pessoa (nome_completo) values ($1) returning id`, [nome]);
    await teste.sql(`insert into eventos.pessoa_evento (pessoa_id) values ($1)`, [id]);
    return id!;
  }

  /** As linhas da tela de Voos, na ordem em que aparecem (mês → evento → linha). */
  const linhasDe = (voos: VoosCarregados) => voos.grupos.flatMap((mes) => mes.eventos.flatMap((grupo) => grupo.linhas));
  const convocacaoDoPedido = async (pedidoId: string) => (await um(`select convocacao_id from eventos.pedido_sdc where id = $1`, [pedidoId])).convocacao_id;
  const cartaoDeVoos = async (quando = agora) => (await resumoParaInicio(quando)).find((item) => item.chave === "voos-a-pedir")!;

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

  it("pedido de voo como na planilha: sem depender da escala, mais de uma compra por pessoa e o ciclo pedido → emitido → alterado → cancelado", async () => {
    const ana = await convocar("Ana Voo", { deslocamento: "VOO", sexo: "F" });
    const carro = await convocar("Caio Carro", { deslocamento: "CARRO_PROPRIO", sexo: "M" });
    const zecaId = await staff("Zeca Fora Da Escala");

    // Antes de qualquer pedido: o evento (a 48 dias) está no aviso por evento; quem está como Avião na escala é só lembrete.
    const antes = await carregarVoos({}, agora);
    expect(linhasDe(antes).map((linha) => [linha.passageiro.nome, linha.situacao, linha.passageiro.naEscala, linha.janela.janela])).toEqual([["Ana Voo", "A_PEDIR", true, "ATRASADO"]]);
    expect(antes.avisoDeCompra).toEqual({
      diasDoAviso: 90,
      diasDoAtraso: 60,
      eventos: [{ eventoId, codigo: "ASM_AM_900", nome: "ASM", dataInicio: "2026-12-15", marcadasComoAviao: 1, janela: "ATRASADO", dias: 48 }],
    });
    expect(await cartaoDeVoos()).toMatchObject({
      quantidade: 1,
      exemplos: [{ rotulo: "ASM_AM_900", detalhe: "atrasado · faltam 48 dias", href: `/logistica/voos?evento=${eventoId}` }],
    });
    // "Novo pedido" vale para qualquer pessoa ativa do staff e qualquer evento futuro.
    expect(antes.staff.map((pessoa) => pessoa.nome)).toEqual(["Ana Voo", "Caio Carro", "Zeca Fora Da Escala"]);
    expect(antes.eventos.map((evento) => evento.codigo)).toEqual(["ASM_AM_900"]);

    // Quem não está marcado como Avião e quem nem está na escala recebem pedido do mesmo jeito.
    const doCarro = await registrarPedidoDeVoo({ eventoId, pessoaId: carro.pessoaId, trechos: [ida] }, ator(), agora);
    expect(await convocacaoDoPedido(doCarro.id)).toBe(carro.convocacaoId);
    const doZeca = await registrarPedidoDeVoo({ eventoId, pessoaId: zecaId, trechos: [ida, volta] }, ator(), agora);
    expect(await convocacaoDoPedido(doZeca.id)).toBeNull();

    // Só não vale para quem não é staff ativo nem para evento que não existe, foi cancelado ou já terminou.
    const { id: foraDoStaff } = await um(`insert into core.pessoa (nome_completo) values ('Fora Do Staff') returning id`);
    const inativaId = await staff("Inativa No Cadastro");
    await teste.sql(`update core.pessoa set ativo = false where id = $1`, [inativaId]);
    for (const pessoaId of [foraDoStaff!, inativaId]) {
      await expect(registrarPedidoDeVoo({ eventoId, pessoaId, trechos: [ida] }, ator(), agora)).rejects.toThrow(/não está ativa no cadastro de staff/);
    }
    const cancelado = await outroEvento("CANC_AM_903", "2026-12-22");
    await teste.sql(`update eventos.evento set status = 'CANCELADO' where id = $1`, [cancelado.id]);
    await expect(registrarPedidoDeVoo({ eventoId: cancelado.id, pessoaId: zecaId, trechos: [ida] }, ator(), agora)).rejects.toThrow(/foi cancelado/);
    await expect(registrarPedidoDeVoo({ eventoId, pessoaId: zecaId, trechos: [ida] }, ator(), new Date("2027-01-10T15:00:00Z"))).rejects.toThrow(/já terminou/);
    await expect(registrarPedidoDeVoo({ eventoId: zecaId, pessoaId: zecaId, trechos: [ida] }, ator(), agora)).rejects.toThrow(/Evento não encontrado/);

    const pedido = await registrarPedidoDeVoo({ eventoId, pessoaId: ana.pessoaId, trechos: [ida, volta], observacaoTime: "Bagagem de mão" }, ator(), agora);
    expect(pedido.referencia).toMatch(/^SDC-\d{6}$/);
    expect(await convocacaoDoPedido(pedido.id)).toBe(ana.convocacaoId);

    // Segunda compra da mesma pessoa no mesmo evento: o sistema avisa e só registra com a confirmação.
    const repetido = registrarPedidoDeVoo({ eventoId, pessoaId: ana.pessoaId, trechos: [ida] }, ator(), agora);
    await expect(repetido).rejects.toBeInstanceOf(RegraDeNegocioError);
    await expect(repetido).rejects.toThrow(new RegExp(`Ana Voo já tem o pedido ${pedido.referencia}`));
    const extra = await registrarPedidoDeVoo(
      { eventoId, pessoaId: ana.pessoaId, trechos: [{ sentido: "IDA", origemIata: "MAO", destinoIata: "BSB", dataDesejada: "2026-12-18" }], outraCompra: true },
      ator(),
      agora,
    );
    expect(extra.outrosAtivos).toEqual([pedido.referencia]);
    expect(await um(`select dados->'outrosAtivos' as outros from eventos.registro_acao where entidade_id = $1 and acao = 'PEDIDO_REGISTRADO'`, [extra.id])).toEqual({
      outros: [pedido.referencia],
    });

    // A tela lê como a planilha: mês → evento → uma linha por compra, com a coluna "Escala". O evento saiu do aviso.
    const tela = await carregarVoos({}, agora);
    expect(tela.grupos.map((mes) => [mes.mes, mes.eventos.map((grupo) => grupo.evento.codigo)])).toEqual([["2026-12", ["ASM_AM_900"]]]);
    expect(linhasDe(tela).map((linha) => [linha.passageiro.nome, linha.situacao, linha.passageiro.naEscala, linha.pedido?.referencia])).toEqual([
      ["Ana Voo", "PEDIDO", true, pedido.referencia],
      ["Ana Voo", "PEDIDO", true, extra.referencia],
      ["Caio Carro", "PEDIDO", true, doCarro.referencia],
      ["Zeca Fora Da Escala", "PEDIDO", false, doZeca.referencia],
    ]);
    expect(tela.total).toBe(4);
    expect(tela.contagens).toMatchObject({ A_PEDIR: 0, PEDIDO: 4 });
    expect(tela.avisoDeCompra.eventos).toEqual([]);
    expect((await cartaoDeVoos()).quantidade).toBe(0);
    expect(tela.pedidosAtivos.filter((item) => item.pessoaId === ana.pessoaId).map((item) => [item.referencia, item.trajeto])).toEqual([
      [pedido.referencia, "IDA_E_VOLTA"],
      [extra.referencia, "IDA"],
    ]);
    expect((await carregarVoos({ situacao: "EMITIDO" }, agora)).grupos).toEqual([]);

    // A pessoa entra na escala depois do pedido: o pedido passa a apontar para a convocação (sem depender disso).
    const { id: escalaDoZeca } = await um(`insert into eventos.convocacao (escala_id, pessoa_id, status) values ($1, $2, 'ACEITA') returning id`, [escalaId, zecaId]);
    await vincularPedidosDeVooDaPessoa(teste.db, { eventoId, pessoaId: zecaId });
    expect(await convocacaoDoPedido(doZeca.id)).toBe(escalaDoZeca);
    expect(linhasDe(await carregarVoos({}, agora)).find((linha) => linha.pedido?.id === doZeca.id)?.passageiro.naEscala).toBe(true);

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
    // Compra já registrada: registrar de novo é corrigir (as validações são as mesmas).
    await expect(registrarRetornoDaSdc({ ...retorno, trechos: [] }, ator(), agora)).rejects.toThrow(/Informe o voo de ida e de volta/);

    const versao = (await carregarPedido(pedido.referencia))!.atualizadoEm;
    await expect(alterarPedido({ pedidoId: pedido.id, atualizadoEm: "2020-01-01T00:00:00.000Z" }, ator(), agora)).rejects.toBeInstanceOf(ConflitoDeVersaoError);
    const depois = new Date(agora.getTime() + 60_000);
    await alterarPedido({ pedidoId: pedido.id, atualizadoEm: versao, trechos: [ida, { ...volta, dataDesejada: "2026-12-18" }] }, ator(), depois);
    expect((await carregarPedido(pedido.referencia))?.situacao).toBe("ALTERADO");
    expect((await resumoParaInicio(depois)).find((item) => item.chave === "pedidos-alterados")?.quantidade).toBe(1);

    await cancelarPedido({ pedidoId: pedido.id, motivo: "Vai de carro com a equipe" }, ator(), depois);
    // Pedido cancelado não conta como "já tem": só o trecho extra segue ativo. Cancelado também, Ana volta ao lembrete.
    await expect(registrarPedidoDeVoo({ eventoId, pessoaId: ana.pessoaId, trechos: [ida] }, ator(), depois)).rejects.toThrow(new RegExp(`o pedido ${extra.referencia}`));
    await cancelarPedido({ pedidoId: extra.id, motivo: "Trecho extra desistido" }, ator(), depois);
    expect(linhasDe(await carregarVoos({ situacao: "A_PEDIR" }, depois)).map((linha) => linha.passageiro.nome)).toEqual(["Ana Voo"]);
    const novo = await registrarPedidoDeVoo({ eventoId, pessoaId: ana.pessoaId, trechos: [ida] }, ator(), depois);
    expect(novo.referencia).not.toBe(pedido.referencia);
    expect(novo.outrosAtivos).toEqual([]);

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

  it("hospedagem: o time monta os quartos sem hotel, pede à SDC e registra o hotel no retorno; sexo, capacidade, mover e rooming sugerido", async () => {
    const bia = await convocar("Bia Quarto", { sexo: "F" });
    const duda = await convocar("Duda Quarto", { sexo: "F" });
    const edu = await convocar("Edu Quarto", { sexo: "M" });
    // Na escala, mas o time não marcou hotel para ela: não entra na hospedagem.
    const nara = await convocar("Nara Sem Hotel", { sexo: "F", hotel: false });
    const { id: localEvento } = await um(`select local_id as id from eventos.evento where id = $1`, [eventoId]);

    await expect(criarHospedagem({ eventoId, localId: localEvento!, checkIn: "2026-12-14", checkOut: "2026-12-18" }, ator(), agora)).rejects.toThrow(/hotel ou um apartamento/);
    // Primeiro passo: montar os quartos, sem hotel (quem escolhe e reserva é a SDC).
    const hospedagemId = await criarHospedagem({ eventoId, checkIn: "2026-12-14", checkOut: "2026-12-18" }, ator(), agora);
    expect(await um(`select local_id, pedido_id from eventos.hospedagem where id = $1`, [hospedagemId])).toEqual({ local_id: null, pedido_id: null });
    await expect(registrarPedidoDeHospedagem({ hospedagemId }, ator(), agora)).rejects.toThrow(/Monte os quartos antes de pedir/);
    await adicionarQuarto({ hospedagemId, nome: "Quarto 1", capacidade: 1, sexo: "F" }, ator(), agora);
    await adicionarQuarto({ hospedagemId, nome: "Quarto 2", capacidade: 3 }, ator(), agora);

    // Com os quartos montados, o time solicita à SDC: o texto diz onde é o evento, as datas e os quartos, sem hotel.
    const { id: pedidoId } = await registrarPedidoDeHospedagem({ hospedagemId }, ator(), agora);
    const pedida = (await carregarHospedagem(eventoId, agora)).hospedagens[0]!;
    expect(pedida.local).toBeNull();
    expect(pedida.pedido).toMatchObject({ situacao: "PEDIDO", valorCentavos: null, formaPagamento: null });
    expect(pedida.textoParaSdc).toContain("Local do evento: Centro de Convenções — Manaus (AM)");
    expect(pedida.textoParaSdc).toContain("Check-in 14/12/2026 · check-out 18/12/2026");
    expect(pedida.textoParaSdc).toContain("2 quartos · 0 pessoas");
    expect(pedida.textoParaSdc).not.toContain("Hotel:");
    expect(pedida.textoDoRooming).toContain("Rooming list — hotel a definir pela SDC");

    // Retorno da SDC: o hotel entra aqui. Sem hotel não registra; um hotel novo é cadastrado na hora.
    const retorno = { pedidoId, valorCentavos: 120000, numeroReserva: "RES-99812", formaPagamento: "Faturado SDC" };
    await expect(registrarRetornoDeHospedagem(retorno, ator(), agora)).rejects.toThrow(/Escolha o hotel que a SDC reservou/);
    await expect(registrarRetornoDeHospedagem({ ...retorno, localId: localEvento! }, ator(), agora)).rejects.toThrow(/Escolha um hotel/);
    await registrarRetornoDeHospedagem({ ...retorno, novoHotel: { nome: "Hotel Teste", cidade: "Manaus", uf: "AM", logradouro: "Av. das Flores", numero: "100" } }, ator(), agora);
    const { id: hotelId } = await um(`select id from eventos.local where nome = 'Hotel Teste' and tipo = 'HOTEL' and cidade = 'Manaus' and logradouro = 'Av. das Flores'`);
    expect(await um(`select numero_reserva, local_id from eventos.hospedagem where id = $1`, [hospedagemId])).toEqual({ numero_reserva: "RES-99812", local_id: hotelId });
    expect(await um(`select situacao, valor_centavos, forma_pagamento from eventos.pedido_sdc where id = $1`, [pedidoId])).toEqual({
      situacao: "EMITIDO",
      valor_centavos: 120000,
      forma_pagamento: "Faturado SDC",
    });
    expect(await um(`select dados from eventos.registro_acao where entidade_id = $1 and acao = 'RETORNO_REGISTRADO'`, [pedidoId])).toEqual({
      dados: { emNomeDe: "SDC", valorCentavos: 120000, temNumeroReserva: true, localId: hotelId, formaPagamento: "Faturado SDC" },
    });
    expect(await um(`select acao, usuario_id, dados->>'origem' as origem from eventos.registro_acao where entidade = 'LOCAL' and entidade_id = $1`, [hotelId])).toEqual({
      acao: "LOCAL_CRIADO",
      usuario_id: usuarioId,
      origem: "retorno da SDC",
    });
    const emitida = (await carregarHospedagem(eventoId, agora)).hospedagens[0]!;
    expect(emitida.local).toMatchObject({ id: hotelId, nome: "Hotel Teste", tipo: "HOTEL", endereco: "Av. das Flores, 100" });
    expect(emitida.pedido).toMatchObject({ situacao: "EMITIDO", valorCentavos: 120000, formaPagamento: "Faturado SDC" });
    expect(emitida.textoDoRooming).toContain("Rooming list — Hotel Teste");
    // Com a reserva registrada, a hospedagem não volta a ficar sem hotel nem vira apartamento.
    await expect(alterarHospedagem({ hospedagemId, checkIn: "2026-12-14", checkOut: "2026-12-18", atualizadoEm: emitida.atualizadoEm }, ator(), agora)).rejects.toThrow(
      /já reservou o hotel/,
    );
    await expect(adicionarQuarto({ hospedagemId, nome: "quarto 1", capacidade: 2 }, ator(), agora)).rejects.toThrow(/Já existe/);

    const carregada = await carregarHospedagem(eventoId, agora);
    const [quarto1, quarto2] = carregada.hospedagens[0]!.quartos;
    // Só quem está marcado para hotel na escala aparece para alocar e pode entrar em quarto.
    const nomes = (lista: { nome: string }[]) => lista.map((pessoa) => pessoa.nome);
    expect(nomes(carregada.semQuarto)).toEqual(expect.arrayContaining(["Bia Quarto", "Duda Quarto", "Edu Quarto"]));
    expect(nomes(carregada.equipe)).not.toContain("Nara Sem Hotel");
    expect(nomes(carregada.semQuarto)).not.toContain("Nara Sem Hotel");
    const semMarca = porNoQuarto({ quartoId: quarto2!.id, convocacaoId: nara.convocacaoId }, ator(), agora);
    await expect(semMarca).rejects.toBeInstanceOf(RegraDeNegocioError);
    await expect(semMarca).rejects.toThrow(/não está marcada para hotel/);
    await expect(porNoQuarto({ quartoId: quarto1!.id, convocacaoId: edu.convocacaoId }, ator(), agora)).rejects.toThrow(/outro sexo/);
    await porNoQuarto({ quartoId: quarto1!.id, convocacaoId: bia.convocacaoId }, ator(), agora);
    await expect(porNoQuarto({ quartoId: quarto1!.id, convocacaoId: duda.convocacaoId }, ator(), agora)).rejects.toThrow(/todas as camas/);

    // "Mover para…": Bia sai do Quarto 1 e vai para o Quarto 2 (uma cama por convocação).
    const movida = await porNoQuarto({ quartoId: quarto2!.id, convocacaoId: bia.convocacaoId }, ator(), agora);
    expect(movida.mudou).toBe(true);
    expect(await teste.sql(`select quarto_id from eventos.quarto_ocupante where convocacao_id = $1`, [bia.convocacaoId])).toEqual([{ quarto_id: quarto2!.id }]);

    // Período próprio (planilha GESTÃO HOSP): Bia chega um dia depois e sai um dia antes.
    const periodoDaBia = () => um(`select check_in::text, check_out::text from eventos.quarto_ocupante where convocacao_id = $1`, [bia.convocacaoId]);
    await definirPeriodoDoOcupante({ quartoId: quarto2!.id, convocacaoId: bia.convocacaoId, checkIn: "2026-12-15", checkOut: "2026-12-17" }, ator(), agora);
    expect(await periodoDaBia()).toEqual({ check_in: "2026-12-15", check_out: "2026-12-17" });
    await expect(
      definirPeriodoDoOcupante({ quartoId: quarto2!.id, convocacaoId: bia.convocacaoId, checkIn: "2026-12-13", checkOut: "2026-12-17" }, ator(), agora),
    ).rejects.toThrow(/dentro da hospedagem/);
    await expect(
      definirPeriodoDoOcupante({ quartoId: quarto1!.id, convocacaoId: bia.convocacaoId, checkIn: "2026-12-15", checkOut: "2026-12-17" }, ator(), agora),
    ).rejects.toBeInstanceOf(ConflitoDeVersaoError);
    const comPeriodo = await carregarHospedagem(eventoId, agora);
    expect(comPeriodo.hospedagens[0]!.textoDoRooming).toContain("Bia Quarto (15/12 a 17/12)");
    // Mudar de quarto na mesma hospedagem mantém o período.
    await porNoQuarto({ quartoId: quarto1!.id, convocacaoId: bia.convocacaoId }, ator(), agora);
    expect(await periodoDaBia()).toEqual({ check_in: "2026-12-15", check_out: "2026-12-17" });
    await porNoQuarto({ quartoId: quarto2!.id, convocacaoId: bia.convocacaoId }, ator(), agora);
    // Encurtar a hospedagem deixando o período de alguém de fora é recusado.
    const versao = comPeriodo.hospedagens[0]!.atualizadoEm;
    await expect(alterarHospedagem({ hospedagemId, localId: hotelId!, checkIn: "2026-12-16", checkOut: "2026-12-18", atualizadoEm: versao }, ator(), agora)).rejects.toThrow(
      /período próprio fora das novas datas/,
    );
    // Com as datas da hospedagem, volta a segui-la.
    await definirPeriodoDoOcupante({ quartoId: quarto2!.id, convocacaoId: bia.convocacaoId, checkIn: "2026-12-14", checkOut: "2026-12-18" }, ator(), agora);
    expect(await periodoDaBia()).toEqual({ check_in: null, check_out: null });
    expect(await um(`select count(*)::int as n from eventos.registro_acao where entidade_id = $1 and acao = 'PERIODO_DO_OCUPANTE_DEFINIDO'`, [hospedagemId])).toEqual({ n: 2 });

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

    // O rooming sugerido também ignora quem não está marcado; depois de marcada na escala, ela passa a aparecer.
    expect(await teste.sql(`select 1 from eventos.quarto_ocupante where convocacao_id = $1`, [nara.convocacaoId])).toEqual([]);
    await teste.sql(`update eventos.convocacao set precisa_hotel = true where id = $1`, [nara.convocacaoId]);
    expect(nomes((await carregarHospedagem(eventoId, agora)).semQuarto)).toContain("Nara Sem Hotel");
    // Quem já está num quarto continua aparecendo no quarto, mesmo que a marca seja tirada por fora da tela.
    const [ocupante] = (await teste.sql(`select convocacao_id from eventos.quarto_ocupante limit 1`)) as { convocacao_id: string }[];
    await teste.sql(`update eventos.convocacao set precisa_hotel = false where id = $1`, [ocupante!.convocacao_id]);
    const comDesmarcada = await carregarHospedagem(eventoId, agora);
    expect(comDesmarcada.hospedagens[0]!.quartos.flatMap((quarto) => quarto.ocupantes.map((pessoa) => pessoa.convocacaoId))).toContain(ocupante!.convocacao_id);
    await teste.sql(`update eventos.convocacao set precisa_hotel = true where id = $1`, [ocupante!.convocacao_id]);
  });

  it("caronas: motorista com veículo e carro cheio", async () => {
    const motorista = await convocar("Fabi Motorista", { lugares: 1, deslocamento: "CARRO_PROPRIO" });
    const semCarro = await convocar("Gil Sem Carro", { deslocamento: "CARONA" });
    const outro = await convocar("Hugo Carona", { deslocamento: "CARONA" });

    // A seção parte de quem está marcado como Carona na escala: antes de existir motorista, as duas estão sem carona.
    const antes = await carregarCaronas(eventoId, agora);
    expect(antes.marcadasComoCarona).toBe(2);
    expect(antes.semCarona.map((pessoa) => pessoa.nome)).toEqual(["Gil Sem Carro", "Hugo Carona"]);
    expect(antes.caronas).toEqual([]);

    await expect(criarCarona({ eventoId, motoristaConvocacaoId: semCarro.convocacaoId }, ator(), agora)).rejects.toThrow(/não tem veículo/);
    const caronaId = await criarCarona({ eventoId, motoristaConvocacaoId: motorista.convocacaoId }, ator(), agora);
    await definirCarona({ convocacaoId: semCarro.convocacaoId, caronaId }, ator(), agora);
    await expect(definirCarona({ convocacaoId: outro.convocacaoId, caronaId }, ator(), agora)).rejects.toThrow(/lugares ocupados/);

    const caronas = await carregarCaronas(eventoId, agora);
    expect(caronas.caronas[0]).toMatchObject({ motoristaNome: "Fabi Motorista", livres: 0 });
    expect(caronas.semCarona.map((pessoa) => pessoa.nome)).toEqual(["Hugo Carona"]);
    // Gil ganhou motorista, Hugo não: 2 marcadas como Carona, 1 ainda sem carona. A motorista (carro próprio) não conta.
    expect(caronas.marcadasComoCarona).toBe(2);
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

  it("quem tem duas funções no evento aparece uma vez só, pela convocação principal", async () => {
    const iara = await convocar("Iara Duas", { sexo: "F", deslocamento: "VOO", lugares: 4 });
    const { id: outraLinha } = await um(
      `insert into eventos.escala (evento_id, data, hora_inicio, hora_fim, quantidade_vagas, status) values ($1, '2026-12-16', '08:00', '18:00', 2, 'ABERTA') returning id`,
      [eventoId],
    );
    const { id: segunda } = await um(`insert into eventos.convocacao (escala_id, pessoa_id, status, principal) values ($1, $2, 'ACEITA', false) returning id`, [outraLinha, iara.pessoaId]);

    const daIara = <T extends { pessoaId: string }>(lista: T[]) => lista.filter((pessoa) => pessoa.pessoaId === iara.pessoaId);
    const hospedagem = await carregarHospedagem(eventoId, agora);
    expect(daIara(hospedagem.equipe).map((pessoa) => pessoa.convocacaoId)).toEqual([iara.convocacaoId]);
    const caronas = await carregarCaronas(eventoId, agora);
    expect(daIara([...caronas.semCarona, ...caronas.candidatosAMotorista, ...caronas.candidatosAPassageiro]).every((pessoa) => pessoa.convocacaoId === iara.convocacaoId)).toBe(true);
    const voos = await carregarVoos({ eventoId }, agora);
    expect(linhasDe(voos).filter((linha) => linha.passageiro.pessoaId === iara.pessoaId)).toHaveLength(1);

    // Quarto, carona e voo só pela principal.
    const quarto = hospedagem.hospedagens[0]!.quartos.find((item) => item.nome === "Quarto 2")!;
    await expect(porNoQuarto({ quartoId: quarto.id, convocacaoId: segunda! }, ator(), agora)).rejects.toBeInstanceOf(RegraDeNegocioError);
    await expect(criarCarona({ eventoId, motoristaConvocacaoId: segunda! }, ator(), agora)).rejects.toBeInstanceOf(RegraDeNegocioError);
    // O pedido de voo é da pessoa no evento: o vínculo com a escala vai para a convocação principal.
    const daIaraVoo = await registrarPedidoDeVoo({ eventoId, pessoaId: iara.pessoaId, trechos: [ida] }, ator(), agora);
    expect(await convocacaoDoPedido(daIaraVoo.id)).toBe(iara.convocacaoId);
  });

  it("quem fica com quem: duas pessoas de quartos cheios trocam de lugar em um passo, com registro", async () => {
    const evento = await outroEvento("TROCA_AM_901", "2026-12-20");
    const ana = await convocar("Ana Troca", { sexo: "F", naEscala: evento.escalaId });
    const bel = await convocar("Bel Troca", { sexo: "F", naEscala: evento.escalaId });
    const caio = await convocar("Caio Troca", { sexo: "M", naEscala: evento.escalaId });
    const dani = await convocar("Dani Troca", { sexo: "F", naEscala: evento.escalaId });
    await convocar("Enzo Mora Perto", { sexo: "M", naEscala: evento.escalaId, hotel: false });

    // Antes de existir hotel a tela já mostra quem foi marcado na escala e quantos da escala ficaram sem a marca.
    const semHotel = await carregarHospedagem(evento.id, agora);
    expect(semHotel.hospedagens).toEqual([]);
    expect(semHotel.equipe.map((pessoa) => pessoa.nome)).toEqual(["Ana Troca", "Bel Troca", "Caio Troca", "Dani Troca"]);
    expect(semHotel.semQuarto).toHaveLength(4);
    expect(semHotel.naEscalaSemHotel).toBe(1);

    const { id: hotelId } = await um(`insert into eventos.local (nome, tipo, cidade, uf) values ('Hotel da Troca', 'HOTEL', 'Manaus', 'AM') returning id`);
    const hospedagemId = await criarHospedagem({ eventoId: evento.id, localId: hotelId!, checkIn: "2026-12-19", checkOut: "2026-12-21" }, ator(), agora);
    await adicionarQuarto({ hospedagemId, nome: "Quarto A", capacidade: 2, sexo: "F" }, ator(), agora);
    await adicionarQuarto({ hospedagemId, nome: "Quarto B", capacidade: 2 }, ator(), agora);
    const [quartoA, quartoB] = (await carregarHospedagem(evento.id, agora)).hospedagens[0]!.quartos;
    await porNoQuarto({ quartoId: quartoA!.id, convocacaoId: ana.convocacaoId }, ator(), agora);
    await porNoQuarto({ quartoId: quartoA!.id, convocacaoId: bel.convocacaoId }, ator(), agora);
    await porNoQuarto({ quartoId: quartoB!.id, convocacaoId: caio.convocacaoId }, ator(), agora);
    await porNoQuarto({ quartoId: quartoB!.id, convocacaoId: dani.convocacaoId }, ator(), agora);
    await definirPeriodoDoOcupante({ quartoId: quartoA!.id, convocacaoId: bel.convocacaoId, checkIn: "2026-12-20", checkOut: "2026-12-21" }, ator(), agora);

    // Os dois quartos estão cheios: "Mover para" não cabe, a troca sim.
    await expect(porNoQuarto({ quartoId: quartoB!.id, convocacaoId: bel.convocacaoId }, ator(), agora)).rejects.toThrow(/todas as camas/);
    const quartoDe = async (convocacaoId: string) => (await um(`select quarto_id from eventos.quarto_ocupante where convocacao_id = $1`, [convocacaoId])).quarto_id;
    const troca = (de: { convocacaoId: string }, quartoId: string, com: { convocacaoId: string }, comQuartoId: string) =>
      trocarDeQuarto({ quartoId, convocacaoId: de.convocacaoId, comQuartoId, comConvocacaoId: com.convocacaoId }, ator(), agora);

    // Caio (M) não pode ir para o quarto feminino: nada muda.
    const recusada = troca(bel, quartoA!.id, caio, quartoB!.id);
    await expect(recusada).rejects.toBeInstanceOf(RegraDeNegocioError);
    await expect(recusada).rejects.toThrow(/Quarto A é de outro sexo/);
    await expect(troca(ana, quartoA!.id, bel, quartoA!.id)).rejects.toThrow(/já estão no mesmo quarto/);
    // Tela desatualizada: a tela diz que Bel está no Quarto B e Dani no A, mas é o contrário.
    await expect(trocarDeQuarto({ quartoId: quartoB!.id, convocacaoId: bel.convocacaoId, comQuartoId: quartoA!.id, comConvocacaoId: dani.convocacaoId }, ator(), agora)).rejects.toBeInstanceOf(
      ConflitoDeVersaoError,
    );
    expect([await quartoDe(bel.convocacaoId), await quartoDe(dani.convocacaoId)]).toEqual([quartoA!.id, quartoB!.id]);

    // Bel e Dani trocam de lugar: Ana passa a dividir com Dani, e Caio com Bel.
    const feita = await troca(bel, quartoA!.id, dani, quartoB!.id);
    expect(feita).toEqual({ eventoId: evento.id, nomeDoQuarto: "Quarto B", nomeDoOutroQuarto: "Quarto A" });
    const depois = await carregarHospedagem(evento.id, agora);
    const porQuarto = Object.fromEntries(depois.hospedagens[0]!.quartos.map((quarto) => [quarto.nome, quarto.ocupantes.map((ocupante) => ocupante.nome)]));
    expect(porQuarto).toEqual({ "Quarto A": ["Ana Troca", "Dani Troca"], "Quarto B": ["Bel Troca", "Caio Troca"] });
    expect(depois.semQuarto).toEqual([]);
    expect(depois.hospedagens[0]!.quartosComSexosMisturados).toEqual([quartoB!.id]);
    // Na mesma hospedagem, o período próprio de quem trocou continua valendo.
    expect(await um(`select check_in::text, check_out::text from eventos.quarto_ocupante where convocacao_id = $1`, [bel.convocacaoId])).toEqual({
      check_in: "2026-12-20",
      check_out: "2026-12-21",
    });
    expect(await teste.sql(`select acao, usuario_id, dados from eventos.registro_acao where entidade = 'HOSPEDAGEM' and entidade_id = $1 and acao = 'OCUPANTES_TROCADOS'`, [hospedagemId])).toEqual([
      {
        acao: "OCUPANTES_TROCADOS",
        usuario_id: usuarioId,
        dados: { convocacaoId: bel.convocacaoId, quartoId: quartoB!.id, comConvocacaoId: dani.convocacaoId, comQuartoId: quartoA!.id },
      },
    ]);

    // Quem saiu da marca de hotel não troca de lugar (o mesmo que vale para pôr no quarto).
    await teste.sql(`update eventos.convocacao set precisa_hotel = false where id = $1`, [caio.convocacaoId]);
    await expect(troca(caio, quartoB!.id, ana, quartoA!.id)).rejects.toThrow(/não está marcada para hotel/);
  });

  it("aviso de voos por evento: prazo configurável, evento sem pedido entra, com pedido ou marcado como sem voo sai", async () => {
    // Hoje é 28/10/2026: um evento a 105 dias (10/02/2027) fica fora do aviso padrão de 90 dias. Ele nem tem escala.
    const evento = await outroEvento("AVISO_AM_902", "2027-02-10");
    await teste.sql(`delete from eventos.escala where id = $1`, [evento.escalaId]);
    const liaId = await staff("Lia Aviso");
    // Masterclass não entra no aviso (são muitas e não têm equipe viajando), mas aceita pedido como qualquer evento.
    await teste.sql(
      `insert into eventos.evento (nome, codigo, inicio, fim, status, tipo_evento_id)
       select 'MC_AM_MANAUS', 'MC_AM_MANAUS', '2027-02-11T22:00:00Z', '2027-02-12T01:00:00Z', 'PLANEJADO', id from eventos.tipo_evento where sigla = 'MC'`,
    );
    // Evento do polo de casa (Americana): a equipe é de lá, então fica fora do aviso mesmo no prazo e sem pedido.
    await teste.sql(
      `with casa as (insert into core.polo (codigo, nome) values ('AM', 'Americana') returning id)
       insert into eventos.evento (nome, codigo, inicio, fim, status, polo_id)
       select 'CASA_AM_905', 'CASA_AM_905', '2027-02-09T12:00:00Z', '2027-02-09T22:00:00Z', 'PLANEJADO', id from casa`,
    );

    const doEvento = async () => {
      const voos = await carregarVoos({ eventoId: evento.id }, agora);
      const cartao = await cartaoDeVoos();
      return { voos, cartao, noInicio: cartao.exemplos.find((exemplo) => exemplo.href.includes(evento.id)) };
    };
    const noAviso = { eventoId: evento.id, codigo: "AVISO_AM_902", nome: "AVISO_AM_902", dataInicio: "2027-02-10", marcadasComoAviao: 0, dias: 105 };

    expect(await carregarAvisoDeVoos()).toEqual({ dias: 90, diasDoAtraso: 60, padrao: 90, minimo: 7, maximo: 365 });
    const padrao = await doEvento();
    expect(padrao.voos.avisoDeCompra).toEqual({ diasDoAviso: 90, diasDoAtraso: 60, eventos: [] });
    expect(padrao.voos.eventoDoFiltro).toMatchObject({ id: evento.id, semVoo: false });
    expect(padrao.noInicio).toBeUndefined();
    expect(padrao.cartao.explicacao).toContain("90 dias");
    const antes = padrao.cartao.quantidade;

    // A líder passa o aviso para 120 dias: o evento entra no prazo e, sem nenhum pedido, entra no aviso.
    expect(await salvarAvisoDeVoos({ dias: 120 }, ator(), agora)).toMatchObject({ dias: 120, diasDoAtraso: 60 });
    const com120 = await doEvento();
    expect(com120.voos.avisoDeCompra).toEqual({ diasDoAviso: 120, diasDoAtraso: 60, eventos: [{ ...noAviso, janela: "NA_JANELA" }] });
    expect(com120.cartao.quantidade).toBe(antes + 1);
    expect(com120.cartao.explicacao).toContain("120 dias");
    expect(com120.noInicio).toEqual({ rotulo: "AVISO_AM_902", detalhe: "faltam 105 dias", href: `/logistica/voos?evento=${evento.id}` });
    const geral = await carregarVoos({}, agora);
    expect(geral.avisoDeCompra.eventos.map((item) => item.codigo)).toContain("AVISO_AM_902");
    expect(geral.avisoDeCompra.eventos.map((item) => item.codigo)).not.toContain("MC_AM_MANAUS");
    expect(geral.avisoDeCompra.eventos.map((item) => item.codigo)).not.toContain("CASA_AM_905");
    expect(geral.eventos.map((item) => item.codigo)).toEqual(expect.arrayContaining(["AVISO_AM_902", "MC_AM_MANAUS", "CASA_AM_905"]));

    // "Este evento não precisa de voo": sai do aviso (Início e Voos), fica na lista para desfazer, com registro.
    expect(await dispensarLogisticaDoEvento({ eventoId: evento.id, item: "VOO", dispensar: true }, ator())).toEqual({ mudou: true });
    expect(await dispensarLogisticaDoEvento({ eventoId: evento.id, item: "VOO", dispensar: true }, ator())).toEqual({ mudou: false });
    const semVoo = await doEvento();
    expect(semVoo.voos.avisoDeCompra.eventos).toEqual([]);
    expect(semVoo.voos.semVoo.map((item) => item.codigo)).toEqual(["AVISO_AM_902"]);
    expect(semVoo.cartao.quantidade).toBe(antes);
    expect(semVoo.noInicio).toBeUndefined();
    // Dá para desfazer: o evento volta ao aviso.
    await dispensarLogisticaDoEvento({ eventoId: evento.id, item: "VOO", dispensar: false }, ator());
    expect((await doEvento()).voos.avisoDeCompra.eventos).toEqual([{ ...noAviso, janela: "NA_JANELA" }]);
    await dispensarLogisticaDoEvento({ eventoId: evento.id, item: "VOO", dispensar: true }, ator());

    // Registrar um pedido para um evento marcado como "sem voo" desfaz a marca (o pedido prova o contrário), e o
    // evento sai do aviso porque agora tem pedido. Com pedido ativo não dá para marcar de novo.
    const daLia = await registrarPedidoDeVoo({ eventoId: evento.id, pessoaId: liaId, trechos: [{ ...ida, dataDesejada: "2027-02-09" }] }, ator(), agora);
    expect(await um(`select sem_voo from eventos.evento where id = $1`, [evento.id])).toEqual({ sem_voo: false });
    const comPedido = await doEvento();
    expect(comPedido.voos.semVoo).toEqual([]);
    expect(comPedido.voos.avisoDeCompra.eventos).toEqual([]);
    expect(linhasDe(comPedido.voos).map((linha) => [linha.passageiro.nome, linha.situacao, linha.passageiro.naEscala])).toEqual([["Lia Aviso", "PEDIDO", false]]);
    await expect(dispensarLogisticaDoEvento({ eventoId: evento.id, item: "VOO", dispensar: true }, ator())).rejects.toThrow(/já tem pedido de voo/);
    expect(
      await teste.sql(`select acao, usuario_id, dados from eventos.registro_acao where entidade = 'EVENTO' and entidade_id = $1 order by criado_em, id`, [evento.id]),
    ).toEqual([
      { acao: "SEM_VOO_MARCADO", usuario_id: usuarioId, dados: {} },
      { acao: "SEM_VOO_DESFEITO", usuario_id: usuarioId, dados: {} },
      { acao: "SEM_VOO_MARCADO", usuario_id: usuarioId, dados: {} },
      { acao: "SEM_VOO_DESFEITO", usuario_id: usuarioId, dados: { motivo: "pedido de voo registrado" } },
    ]);
    // Cancelado o único pedido, o evento volta a ficar sem pedido e reaparece no aviso.
    await cancelarPedido({ pedidoId: daLia.id, motivo: "Evento sem equipe de fora" }, ator(), agora);
    expect((await doEvento()).voos.avisoDeCompra.eventos).toEqual([{ ...noAviso, janela: "NA_JANELA" }]);

    // Aviso curto (30 dias): o atrasado acompanha (20) e nenhum evento desta bateria (o mais próximo está a 48 dias) aparece.
    await salvarAvisoDeVoos({ dias: 30 }, ator(), agora);
    expect(await carregarAvisoDeVoos()).toMatchObject({ dias: 30, diasDoAtraso: 20 });
    const com30 = await carregarVoos({}, agora);
    expect(com30.avisoDeCompra).toEqual({ diasDoAviso: 30, diasDoAtraso: 20, eventos: [] });
    expect(linhasDe(com30).every((linha) => linha.janela.janela === "FORA_DA_JANELA")).toBe(true);
    expect(await cartaoDeVoos()).toMatchObject({ quantidade: 0, exemplos: [] });

    // Fica em eventos.configuracao, com registro de quem mudou e de quanto para quanto.
    expect(await um(`select valor, atualizado_por from eventos.configuracao where chave = 'dias_aviso_voos'`)).toEqual({ valor: "30", atualizado_por: usuarioId });
    const registros = await teste.sql(
      `select acao, usuario_id, dados from eventos.registro_acao where entidade = 'CONFIGURACAO' and dados->>'chave' = 'dias_aviso_voos' order by criado_em, dados->>'para' desc`,
    );
    expect(registros).toEqual([
      { acao: "CONFIGURACAO_ALTERADA", usuario_id: usuarioId, dados: { chave: "dias_aviso_voos", de: null, para: "120" } },
      { acao: "CONFIGURACAO_ALTERADA", usuario_id: usuarioId, dados: { chave: "dias_aviso_voos", de: "120", para: "30" } },
    ]);

    // Valor estranho gravado por fora da tela não quebra nada: vale o padrão.
    await teste.sql(`update eventos.configuracao set valor = 'noventa' where chave = 'dias_aviso_voos'`);
    expect(await carregarAvisoDeVoos()).toMatchObject({ dias: 90, diasDoAtraso: 60 });
    await teste.sql(`delete from eventos.configuracao where chave = 'dias_aviso_voos'`);
    expect((await carregarVoos({}, agora)).avisoDeCompra.diasDoAviso).toBe(90);
  });
  it("sem SDC e sem hospedagem: apartamento da IAM não tem pedido, hospedagem aberta por engano sai e o evento pode ser marcado como sem hospedagem", async () => {
    const evento = await outroEvento("CASA_AM_904", "2026-12-28");
    const depoisDele = await outroEvento("DEPOIS_AM_905", "2026-12-30");
    await convocar("Olga Casa", { sexo: "F", naEscala: evento.escalaId, hotel: false });
    await convocar("Paulo Depois", { sexo: "M", naEscala: depoisDele.escalaId });
    const { id: apartamentoId } = await um(`insert into eventos.local (nome, tipo, cidade, uf) values ('Apartamento da IAM', 'APARTAMENTO', 'Manaus', 'AM') returning id`);
    const periodo = { checkIn: "2026-12-27", checkOut: "2026-12-29" };
    const semHospedagem = async () => (await um(`select sem_hospedagem from eventos.evento where id = $1`, [evento.id])).sem_hospedagem;

    // "Este evento não tem hospedagem" (o "Sem hospedagem" da planilha): sai dos pendentes, com registro, e dá para desfazer.
    expect(await dispensarLogisticaDoEvento({ eventoId: evento.id, item: "HOSPEDAGEM", dispensar: true }, ator())).toEqual({ mudou: true });
    expect((await carregarHospedagem(evento.id, agora)).evento).toMatchObject({ codigo: "CASA_AM_904", semHospedagem: true });
    // Sem evento escolhido, a tela pula o evento marcado e abre o próximo (o marcado continua no seletor).
    const maisTarde = new Date("2026-12-24T15:00:00Z");
    const padrao = await carregarHospedagem(null, maisTarde);
    expect(padrao.eventos.map((item) => [item.codigo, item.semHospedagem])).toEqual([
      ["CASA_AM_904", true],
      ["DEPOIS_AM_905", false],
    ]);
    expect(padrao.evento?.codigo).toBe("DEPOIS_AM_905");
    await dispensarLogisticaDoEvento({ eventoId: evento.id, item: "HOSPEDAGEM", dispensar: false }, ator());
    expect((await carregarHospedagem(null, maisTarde)).evento?.codigo).toBe("CASA_AM_904");
    await dispensarLogisticaDoEvento({ eventoId: evento.id, item: "HOSPEDAGEM", dispensar: true }, ator());

    // Montar quartos num evento marcado desfaz a marca; com hospedagem aberta não dá para marcar de novo.
    const noApartamento = await criarHospedagem({ eventoId: evento.id, localId: apartamentoId!, ...periodo }, ator(), agora);
    expect(await semHospedagem()).toBe(false);
    await expect(dispensarLogisticaDoEvento({ eventoId: evento.id, item: "HOSPEDAGEM", dispensar: true }, ator())).rejects.toThrow(/já tem quartos montados/);
    expect(
      (await teste.sql(`select acao, dados from eventos.registro_acao where entidade = 'EVENTO' and entidade_id = $1 order by criado_em, id`, [evento.id])).map((linha) => {
        const { acao, dados } = linha as { acao: string; dados: { motivo?: string } };
        return dados.motivo ? `${acao} (${dados.motivo})` : acao;
      }),
    ).toEqual(["SEM_HOSPEDAGEM_MARCADO", "SEM_HOSPEDAGEM_DESFEITO", "SEM_HOSPEDAGEM_MARCADO", "SEM_HOSPEDAGEM_DESFEITO (hospedagem criada)"]);

    // Apartamento da IAM é o caminho sem SDC: tem quartos, não tem pedido.
    await adicionarQuarto({ hospedagemId: noApartamento, nome: "Sala", capacidade: 2 }, ator(), agora);
    await expect(registrarPedidoDeHospedagem({ hospedagemId: noApartamento }, ator(), agora)).rejects.toThrow(/Apartamento da IAM não passa pela SDC/);
    const comApartamento = (await carregarHospedagem(evento.id, agora)).hospedagens[0]!;
    expect(comApartamento.local).toMatchObject({ tipo: "APARTAMENTO", nome: "Apartamento da IAM" });

    // Hospedagem aberta por engano: sai quando não tem quarto nem pedido.
    await expect(removerHospedagem(noApartamento, ator(), agora)).rejects.toThrow(/Remova os quartos/);
    await removerQuarto(comApartamento.quartos[0]!.id, ator(), agora);
    expect(await removerHospedagem(noApartamento, ator(), agora)).toBe(evento.id);
    expect(await teste.sql(`select 1 from eventos.hospedagem where id = $1`, [noApartamento])).toEqual([]);
    expect(await um(`select acao, usuario_id from eventos.registro_acao where entidade = 'HOSPEDAGEM' and entidade_id = $1 order by criado_em desc, id desc limit 1`, [noApartamento])).toEqual({
      acao: "HOSPEDAGEM_REMOVIDA",
      usuario_id: usuarioId,
    });

    // Pela SDC: com pedido ativo a hospedagem não sai nem vira apartamento; cancelado o pedido, volta a poder.
    const pelaSdc = await criarHospedagem({ eventoId: evento.id, ...periodo }, ator(), agora);
    await adicionarQuarto({ hospedagemId: pelaSdc, nome: "Quarto 1", capacidade: 2 }, ator(), agora);
    const pedido = await registrarPedidoDeHospedagem({ hospedagemId: pelaSdc }, ator(), agora);
    await expect(registrarPedidoDeHospedagem({ hospedagemId: pelaSdc }, ator(), agora)).rejects.toThrow(/já tem pedido/);
    await expect(removerHospedagem(pelaSdc, ator(), agora)).rejects.toThrow(/Cancele o pedido antes de removê-la/);
    const aberta = (await carregarHospedagem(evento.id, agora)).hospedagens[0]!;
    await expect(alterarHospedagem({ hospedagemId: pelaSdc, localId: apartamentoId!, ...periodo, atualizadoEm: aberta.atualizadoEm }, ator(), agora)).rejects.toThrow(
      /Cancele o pedido antes de trocar para apartamento/,
    );
    await cancelarPedido({ pedidoId: pedido.id, motivo: "Evento virou de casa" }, ator(), agora);
    const semPedido = (await carregarHospedagem(evento.id, agora)).hospedagens[0]!;
    expect(semPedido.pedido).toBeNull();
    await removerQuarto(semPedido.quartos[0]!.id, ator(), agora);
    await removerHospedagem(pelaSdc, ator(), agora);
    expect(await dispensarLogisticaDoEvento({ eventoId: evento.id, item: "HOSPEDAGEM", dispensar: true }, ator())).toEqual({ mudou: true });
    expect(await semHospedagem()).toBe(true);
  });
});
