import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

import type { Db } from "@/core/db/database";
import { adicionarQuarto, criarHospedagem, registrarPedidoDeHospedagem, registrarRetornoDeHospedagem } from "@/fluxos/logistica";
import { incluirAcessoDaSdc, registrarReservaDeHospedagem } from "@/fluxos/sdc";
import { criarRepositorioSincronizacao, type LocalDaTurma } from "@/modules/eventos";
import { registrarReservaPelaSdcSchema } from "@/modules/logistica";
import { type BancoDeTeste, criarBancoDeTeste, TEST_DATABASE_URL } from "@/test/banco";

const banco = vi.hoisted(() => ({ db: null as Db | null }));

vi.mock("@/fluxos/_base", async (importOriginal) => {
  const original = await importOriginal<Record<string, unknown>>();
  return {
    ...original,
    bancoParaLeitura: async () => banco.db!,
    situacaoDaEscrita: async () => ({ liberada: true, modo: "LOCAL" }),
    // A transação real (limite e "sem registro, desfaz"), no banco de teste.
    transacao: async (_ator: unknown, trabalho: (tx: never) => Promise<unknown>) => (await import("@/fluxos/_base/banco")).transacaoNoBanco(banco.db!, trabalho as never),
  };
});

// O hotel da reserva e os locais vindos do IAM Control: o time aproveita o local que já veio de lá; a SDC continua
// sem alterar cadastro que não é dela (docs/09 §15.4), e o hotel que ela informou é ligado depois pela sincronização.
describe.skipIf(!TEST_DATABASE_URL)("hotel da reserva quando o lugar já veio do IAM Control", () => {
  let teste: BancoDeTeste;
  let usuarioId: string;
  let sdcId: string;
  let sequencia = 0;
  const ator = () => ({ usuarioId, pessoaId: null, origem: "LOCAL" as const });
  const sdc = () => ({ acessoSdcId: sdcId, origem: "LOCAL" as const });
  const agora = new Date("2026-10-28T15:00:00Z");
  const depois = new Date("2026-10-29T15:00:00Z");

  const um = async (texto: string, params: unknown[] = []) => ((await teste.sql(texto, params)) as Record<string, unknown>[])[0]!;
  const locais = async (cidade: string) =>
    (await teste.sql(`select id, nome, tipo, origem, logradouro from eventos.local where cidade = $1 order by tipo, criado_em, id`, [cidade])) as { id: string; nome: string; tipo: string; origem: string; logradouro: string | null }[];
  const registros = async (entidadeId: string) =>
    (await teste.sql(`select acao, origem, usuario_id, acesso_sdc_id, dados from eventos.registro_acao where entidade_id = $1 order by criado_em, id`, [entidadeId])) as Record<string, unknown>[];
  const doIamControl = (nome: string, cidade: string, mudanca: Partial<LocalDaTurma> = {}): LocalDaTurma => ({
    nome,
    cidade,
    uf: "SC",
    logradouro: "Av. Brasil",
    numero: "1500",
    complemento: null,
    bairro: "Centro",
    cep: "88330000",
    iamControlEnderecoId: null,
    cadastrado: true,
    capacidade: 350,
    ...mudanca,
  });
  const sincronizarLocal = (local: LocalDaTurma) => criarRepositorioSincronizacao(teste.db).salvarLocalDoIamControl(local, depois);

  /** Um evento com hospedagem pedida à SDC, pronto para receber o hotel no retorno. */
  async function hospedagemPedida() {
    sequencia += 1;
    const eventoId = (
      await um(`insert into eventos.evento (nome, codigo, inicio, fim, status) values ($1, $2, '2026-12-15T12:00:00Z', '2026-12-17T22:00:00Z', 'PLANEJADO') returning id`, [`ASM ${sequencia}`, `ASM_BC_${900 + sequencia}`])
    ).id as string;
    const hospedagemId = await criarHospedagem({ eventoId, checkIn: "2026-12-14", checkOut: "2026-12-18" }, ator(), agora);
    await adicionarQuarto({ hospedagemId, nome: "Quarto 1", capacidade: 2 }, ator(), agora);
    const { id: pedidoId, referencia } = await registrarPedidoDeHospedagem({ hospedagemId }, ator(), agora);
    const hotelDaHospedagem = async () => (await um(`select local_id from eventos.hospedagem where id = $1`, [hospedagemId])).local_id as string | null;
    return { pedidoId, referencia, hotelDaHospedagem };
  }

  beforeAll(async () => {
    teste = await criarBancoDeTeste();
    banco.db = teste.db;
    usuarioId = (await um(`insert into core.usuario (email) values ('time@exemplo.test') returning id`)).id as string;
    sdcId = await incluirAcessoDaSdc({ email: "atendimento.sdc@exemplo.test", nome: "SDC (teste)" }, ator(), agora);
  }, 60_000);

  afterAll(async () => {
    await teste?.encerrar();
  });

  it("o time informa um hotel que já veio do IAM Control como local de evento: usa esse cadastro, que passa a hotel", async () => {
    const cidade = "Cidade Do Time";
    const { localId } = await sincronizarLocal(doIamControl("Hotel Sibara", cidade));
    const { pedidoId, hotelDaHospedagem } = await hospedagemPedida();

    await registrarRetornoDeHospedagem(
      { pedidoId, valorCentavos: 120000, numeroReserva: "RES-1", formaPagamento: "Faturado SDC", novoHotel: { nome: "hotel  SIBARA", cidade: "cidade do time", uf: "SC", logradouro: "Rua digitada" } },
      ator(),
      agora,
    );

    // Não nasce outro cadastro, e nome e endereço continuam os do IAM Control.
    expect(await locais(cidade)).toEqual([{ id: localId, nome: "Hotel Sibara", tipo: "HOTEL", origem: "IAM_CONTROL", logradouro: "Av. Brasil" }]);
    expect(await hotelDaHospedagem()).toBe(localId);
    expect(await registros(localId)).toEqual([
      { acao: "LOCAL_ALTERADO", origem: "USUARIO", usuario_id: usuarioId, acesso_sdc_id: null, dados: { mudancas: { tipo: { de: "EVENTO", para: "HOTEL" } }, origem: "retorno da SDC" } },
    ]);

    // Depois de marcado como hotel, cadastrar de novo é recusado como qualquer hotel que já existe.
    const outra = await hospedagemPedida();
    await expect(
      registrarRetornoDeHospedagem({ pedidoId: outra.pedidoId, valorCentavos: 100, numeroReserva: "RES-2", formaPagamento: "Faturado SDC", novoHotel: { nome: "Hotel Sibara", cidade, uf: "SC" } }, ator(), agora),
    ).rejects.toThrow(/Já existe o hotel "Hotel Sibara"/);
  });

  it("a SDC não altera o local do IAM Control: o hotel que ela informa nasce à parte e a sincronização o liga depois", async () => {
    const cidade = "Cidade Da Agência";
    const p7 = doIamControl("P7 Eventos", cidade);
    const { localId: localDoEvento } = await sincronizarLocal(p7);
    const { referencia, hotelDaHospedagem } = await hospedagemPedida();
    const reserva = registrarReservaPelaSdcSchema.parse({
      referencia,
      hotel: { nome: "p7 eventos", cidade, uf: "SC", logradouro: "Rua da agência" },
      valorCentavos: "1.200,00",
      numeroReserva: "RES-3",
      formaPagamento: "Faturado SDC",
    });

    await registrarReservaDeHospedagem(reserva, sdc(), agora);

    const hotelDaSdc = (await hotelDaHospedagem())!;
    expect(await locais(cidade)).toEqual([
      { id: localDoEvento, nome: "P7 Eventos", tipo: "EVENTO", origem: "IAM_CONTROL", logradouro: "Av. Brasil" },
      { id: hotelDaSdc, nome: "p7 eventos", tipo: "HOTEL", origem: "EVENTOS", logradouro: "Rua da agência" },
    ]);
    expect(await registros(localDoEvento)).toEqual([]);

    // Na rodada seguinte a sincronização liga o hotel da SDC ao local do IAM Control (nome e endereço de lá).
    expect(await sincronizarLocal(p7)).toEqual({ localId: localDoEvento, criado: false, vinculados: 1, atualizados: 0 });
    expect((await locais(cidade))[1]).toEqual({ id: hotelDaSdc, nome: "P7 Eventos", tipo: "HOTEL", origem: "IAM_CONTROL", logradouro: "Av. Brasil" });

    // Ligado, o hotel deixa de ser "o que a SDC cadastrou": corrigir a reserva com outro nome não mexe nele, cria outro.
    await registrarReservaDeHospedagem({ ...reserva, hotel: { ...reserva.hotel, nome: "Pousada Da Agência" } }, sdc(), depois);
    const depoisDaCorrecao = await locais(cidade);
    expect(depoisDaCorrecao.map((local) => [local.nome, local.tipo, local.origem, local.logradouro])).toEqual([
      ["P7 Eventos", "EVENTO", "IAM_CONTROL", "Av. Brasil"],
      ["P7 Eventos", "HOTEL", "IAM_CONTROL", "Av. Brasil"],
      ["Pousada Da Agência", "HOTEL", "EVENTOS", "Rua da agência"],
    ]);
    expect(await hotelDaHospedagem()).toBe(depoisDaCorrecao[2]!.id);
    // E informar de novo o hotel que veio do IAM Control o reaproveita, sem alteração.
    await registrarReservaDeHospedagem(reserva, sdc(), depois);
    expect(await hotelDaHospedagem()).toBe(hotelDaSdc);
    expect((await registros(hotelDaSdc)).map((registro) => [registro.acao, registro.origem])).toEqual([
      ["LOCAL_CRIADO", "SDC"],
      ["LOCAL_VINCULADO", "SISTEMA"],
    ]);
  });
});
