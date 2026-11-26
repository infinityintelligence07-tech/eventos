import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

import type { Db } from "@/core/db/database";
import { RegraDeNegocioError } from "@/fluxos/_base";
import {
  adicionarQuarto,
  alterarPedido,
  aprovarPagamento,
  cancelarPedido,
  carregarHospedagem,
  carregarVoos,
  criarHospedagem,
  desfazerAprovacao,
  porNoQuarto,
  registrarPedidoDeHospedagem,
  registrarPedidoDeVoo,
  registrarRetornoDaSdc,
  resumoParaInicio,
} from "@/fluxos/logistica";
import { registrarCompraDeVooPelaSdcSchema, registrarReservaPelaSdcSchema } from "@/modules/logistica";
import { type BancoDeTeste, criarBancoDeTeste, TEST_DATABASE_URL } from "@/test/banco";

import { carregarHospedagensDaSdc, carregarVoosDaSdc, definirAcessoDaSdc, incluirAcessoDaSdc, listarAcessoDaSdc, registrarCompraDeVoo, registrarReservaDeHospedagem } from "..";

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

// Dados inventados que a SDC NÃO pode ver (decisão 4): estão no banco, ao lado dos pedidos, e não podem sair.
const SEGREDOS = {
  telefone: "+5500900001111",
  email: "ana.passageira@exemplo.test",
  cep: "00000123",
  cpf: "00000000191",
  rua: "Rua Inventada Do Teste",
  cidadeDeCasa: "Cidade Da Casa Dela",
  motivo: "Motivo interno do cancelamento",
  emailDoTime: "time@exemplo.test",
  obsAprovacao: "Observação interna da aprovação",
};
const UUID = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i;

describe.skipIf(!TEST_DATABASE_URL)("a SDC no banco: lista de acesso, compra, aprovação do pagamento e o que ela enxerga", () => {
  let teste: BancoDeTeste;
  let usuarioId: string;
  let sdcId: string;
  let eventoId: string;
  let escalaId: string;
  const ator = () => ({ usuarioId, pessoaId: null, origem: "LOCAL" as const });
  const sdc = () => ({ acessoSdcId: sdcId, origem: "LOCAL" as const });
  const agora = new Date("2026-10-28T15:00:00Z");
  const depois = new Date("2026-10-29T15:00:00Z");

  const um = async (texto: string, params: unknown[] = []) => ((await teste.sql(texto, params)) as Record<string, unknown>[])[0]!;
  const pedidoNoBanco = (id: string) =>
    um(`select situacao, valor_centavos, retorno_registrado_por, retorno_registrado_pela_sdc, aprovado_em, aprovado_por, observacao_aprovacao from eventos.pedido_sdc where id = $1`, [id]);
  const registros = async (entidadeId: string) =>
    (await teste.sql(`select acao, origem, usuario_id, acesso_sdc_id from eventos.registro_acao where entidade_id = $1 order by criado_em, id`, [entidadeId])) as Record<string, unknown>[];

  /** Aprova como a tela faz: com o valor e a versão do pedido que o aprovador está vendo agora. */
  const visto = async (pedidoId: string) => {
    const linha = await um(`select valor_centavos, atualizado_em from eventos.pedido_sdc where id = $1`, [pedidoId]);
    return { valorCentavos: (linha.valor_centavos as number | null) ?? 0, atualizadoEm: (linha.atualizado_em as Date).toISOString() };
  };
  const aprovar = async (pedidoId: string, extras: { observacao?: string } = {}, quando = depois) => aprovarPagamento({ pedidoId, confirmo: true, ...(await visto(pedidoId)), ...extras }, ator(), quando);

  async function pessoa(nome: string, sexo: "F" | "M" = "F") {
    const { id } = await um(`insert into core.pessoa (nome_completo, email, telefone) values ($1, $2, $3) returning id`, [nome, SEGREDOS.email, SEGREDOS.telefone]);
    await teste.sql(`insert into eventos.pessoa_evento (pessoa_id, sexo, cep, cidade, uf) values ($1, $2, $3, $4, 'RS')`, [id, sexo, SEGREDOS.cep, SEGREDOS.cidadeDeCasa]);
    await teste.sql(`insert into sensivel.pessoa_dado_sensivel (pessoa_id, cpf, endereco) values ($1, $2, $3)`, [id, SEGREDOS.cpf, JSON.stringify({ logradouro: SEGREDOS.rua })]);
    const { id: convocacaoId } = await um(`insert into eventos.convocacao (escala_id, pessoa_id, status, deslocamento, precisa_hotel) values ($1, $2, 'ACEITA', 'VOO', true) returning id`, [escalaId, id]);
    return { pessoaId: id as string, convocacaoId: convocacaoId as string };
  }

  const ida = { sentido: "IDA" as const, origemCidade: "Porto Alegre (RS)", destinoCidade: "Manaus (AM)", dataDesejada: "2026-12-14" };
  const volta = { sentido: "VOLTA" as const, origemCidade: "Manaus (AM)", destinoCidade: "Porto Alegre (RS)", dataDesejada: "2026-12-17" };
  const trechosComprados = [
    { sentido: "IDA" as const, companhia: "Azul", numeroVoo: "AD4120", localizador: "KXQ7PZ", partidaEm: "2026-12-14T08:10", chegadaEm: "2026-12-14T11:45" },
    { sentido: "VOLTA" as const, companhia: "Azul", numeroVoo: "AD4121", localizador: "KXQ7PZ", partidaEm: "2026-12-17T19:20", chegadaEm: "2026-12-17T22:05" },
  ];
  const compra = (referencia: string, valorCentavos = 98000) => registrarCompraDeVooPelaSdcSchema.parse({ referencia, valorCentavos: (valorCentavos / 100).toFixed(2).replace(".", ","), trechos: trechosComprados });

  beforeAll(async () => {
    teste = await criarBancoDeTeste();
    banco.db = teste.db;
    usuarioId = (await um(`insert into core.usuario (email) values ($1) returning id`, [SEGREDOS.emailDoTime])).id as string;
    const { id: localId } = await um(`insert into eventos.local (nome, tipo, cidade, uf) values ('Centro de Convenções', 'EVENTO', 'Manaus', 'AM') returning id`);
    eventoId = (
      await um(
        `insert into eventos.evento (nome, codigo, inicio, fim, status, local_id)
         values ('ASM', 'ASM_AM_900', '2026-12-15T12:00:00Z', '2026-12-17T22:00:00Z', 'PLANEJADO', $1) returning id`,
        [localId],
      )
    ).id as string;
    escalaId = (
      await um(`insert into eventos.escala (evento_id, data, hora_inicio, hora_fim, quantidade_vagas, status) values ($1, '2026-12-15', '08:00', '18:00', 20, 'ABERTA') returning id`, [eventoId])
    ).id as string;
  }, 60_000);

  afterAll(async () => {
    await teste?.encerrar();
  });

  it("lista de acesso: a líder inclui, desativa e reativa; cada mudança fica no histórico e nada vai para o cadastro do GH", async () => {
    sdcId = await incluirAcessoDaSdc({ email: "atendimento.sdc@exemplo.test", nome: "SDC (teste)" }, ator(), agora);
    expect(await um(`select email, nome, ativo, criado_por from eventos.acesso_sdc where id = $1`, [sdcId])).toEqual({
      email: "atendimento.sdc@exemplo.test",
      nome: "SDC (teste)",
      ativo: true,
      criado_por: usuarioId,
    });
    await expect(incluirAcessoDaSdc({ email: "atendimento.sdc@exemplo.test", nome: "De novo" }, ator(), agora)).rejects.toThrow(/já está na lista da SDC/);

    expect(await definirAcessoDaSdc({ acessoSdcId: sdcId, ativo: true }, ator(), agora)).toEqual({ mudou: false, nome: "SDC (teste)" });
    expect(await definirAcessoDaSdc({ acessoSdcId: sdcId, ativo: false }, ator(), agora)).toEqual({ mudou: true, nome: "SDC (teste)" });
    await expect(incluirAcessoDaSdc({ email: "atendimento.sdc@exemplo.test", nome: "De novo" }, ator(), agora)).rejects.toThrow(/desativado\. Use "Reativar"/);
    expect((await listarAcessoDaSdc()).acessos).toMatchObject([{ id: sdcId, ativo: false }]);
    expect(await definirAcessoDaSdc({ acessoSdcId: sdcId, ativo: true }, ator(), depois)).toEqual({ mudou: true, nome: "SDC (teste)" });
    await expect(definirAcessoDaSdc({ acessoSdcId: usuarioId, ativo: false }, ator(), agora)).rejects.toThrow(/não está mais na lista/);

    // E-mail de alguém da IAM (existe em core.usuario, ativo ou não) nunca entra na lista da SDC.
    await teste.sql(`insert into core.usuario (email, ativo) values ('Saiu.Da.IAM@exemplo.test', false)`);
    for (const email of [SEGREDOS.emailDoTime, "saiu.da.iam@exemplo.test"]) {
      await expect(incluirAcessoDaSdc({ email, nome: "Da IAM" }, ator(), agora)).rejects.toThrow("Este e-mail é de alguém da IAM. O acesso dela é em Acesso do time.");
    }
    // Quem ganhou conta na IAM depois de entrar na lista também não é reativado.
    const depoisVirouIam = await incluirAcessoDaSdc({ email: "virou.iam@exemplo.test", nome: "Virou IAM" }, ator(), agora);
    await definirAcessoDaSdc({ acessoSdcId: depoisVirouIam, ativo: false }, ator(), agora);
    await teste.sql(`insert into core.usuario (email, ativo) values ('virou.iam@exemplo.test', true)`);
    await expect(definirAcessoDaSdc({ acessoSdcId: depoisVirouIam, ativo: true }, ator(), agora)).rejects.toThrow(/é de alguém da IAM/);
    expect(await um(`select count(*)::int as n from eventos.acesso_sdc`)).toEqual({ n: 2 });

    expect(await registros(sdcId)).toEqual(
      ["ACESSO_SDC_INCLUIDO", "ACESSO_SDC_DESATIVADO", "ACESSO_SDC_REATIVADO"].map((acao) => ({ acao, origem: "USUARIO", usuario_id: usuarioId, acesso_sdc_id: null })),
    );
    // Nada no cadastro do GH: nem usuário, nem perfil.
    expect(await teste.sql(`select 1 from core.usuario where email = 'atendimento.sdc@exemplo.test'`)).toEqual([]);
    expect(await teste.sql(`select email from core.usuario order by email`)).toEqual([{ email: "Saiu.Da.IAM@exemplo.test" }, { email: SEGREDOS.emailDoTime }, { email: "virou.iam@exemplo.test" }]);
    expect(await um(`select count(*)::int as n from core.usuario_perfil`)).toEqual({ n: 0 });
  });

  it("voo: time solicita, SDC registra e corrige a compra, time aprova; aprovado a SDC não mexe, e mexer pelo time derruba a aprovação", async () => {
    const ana = await pessoa("Ana Passageira");
    const pedido = await registrarPedidoDeVoo({ eventoId, pessoaId: ana.pessoaId, trechos: [ida, volta], observacaoTime: "Bagagem de mão" }, ator(), agora);

    // Antes da compra: nada a aprovar.
    await expect(aprovar(pedido.id, {}, agora)).rejects.toThrow(/depois que a compra estiver registrada/);
    expect((await carregarVoosDaSdc({}, agora)).contagens).toEqual({ A_COMPRAR: 1, AGUARDANDO_APROVACAO: 0, APROVADO: 0, CANCELADO: 0 });

    // A SDC registra a compra: fica no nome dela (coluna e histórico), sem usuário do time.
    await expect(registrarCompraDeVoo({ ...compra(pedido.referencia), trechos: [compra(pedido.referencia).trechos[0]!] }, sdc(), agora)).rejects.toThrow(/volta/);
    await registrarCompraDeVoo(compra(pedido.referencia), sdc(), agora);
    expect(await pedidoNoBanco(pedido.id)).toEqual({
      situacao: "EMITIDO",
      valor_centavos: 98000,
      retorno_registrado_por: null,
      retorno_registrado_pela_sdc: sdcId,
      aprovado_em: null,
      aprovado_por: null,
      observacao_aprovacao: null,
    });
    expect((await registros(pedido.id)).at(-1)).toEqual({ acao: "RETORNO_REGISTRADO", origem: "SDC", usuario_id: null, acesso_sdc_id: sdcId });

    // Enquanto o time não aprova, a SDC corrige (o valor muda; continua a aprovar).
    await registrarCompraDeVoo(compra(pedido.referencia, 101500), sdc(), depois);
    const daSdc = (await carregarVoosDaSdc({}, depois)).grupos[0]!.eventos[0]!.linhas[0]!;
    expect(daSdc).toMatchObject({ referencia: pedido.referencia, passageiro: "Ana Passageira", paraASdc: "AGUARDANDO_APROVACAO", podeRegistrar: true, valorCentavos: 101500, observacaoTime: "Bagagem de mão" });
    expect((await carregarVoosDaSdc({}, depois)).totais).toEqual({ aAprovar: 1, aAprovarCentavos: 101500, aprovados: 0, aprovadoCentavos: 0 });

    // O time vê quem registrou, o total a aprovar e o cartão do Início.
    const doTime = await carregarVoos({}, depois);
    expect(doTime.totais).toEqual({ aAprovar: 1, aAprovarCentavos: 101500, aprovados: 0, aprovadoCentavos: 0 });
    expect(doTime.grupos[0]!.eventos[0]!.linhas[0]!.pedido).toMatchObject({ retornoPelaSdc: "SDC (teste)", aprovadoEm: null });
    const cartao = async () => (await resumoParaInicio(depois)).find((item) => item.chave === "compras-a-aprovar")!;
    expect(await cartao()).toMatchObject({ titulo: "Compras da SDC a aprovar", quantidade: 1 });

    // A aprovação fica presa ao que o aprovador viu. A tela abriu com a compra de 101500; a SDC corrige antes do clique.
    const telaAberta = await visto(pedido.id);
    expect(telaAberta.valorCentavos).toBe(101500);
    const maisTarde = new Date("2026-10-29T16:00:00Z");
    await registrarCompraDeVoo(compra(pedido.referencia, 990000), sdc(), maisTarde);
    const corrida = aprovarPagamento({ pedidoId: pedido.id, confirmo: true, ...telaAberta }, ator(), maisTarde);
    await expect(corrida).rejects.toBeInstanceOf(RegraDeNegocioError);
    await expect(corrida).rejects.toThrow("A compra mudou depois que você abriu a tela. Confira de novo.");
    // Mesmo valor, mas a compra mudou (outro voo, outro instante): a versão não bate e a aprovação também é recusada.
    await registrarCompraDeVoo(compra(pedido.referencia, 101500), sdc(), new Date("2026-10-29T16:05:00Z"));
    await expect(aprovarPagamento({ pedidoId: pedido.id, confirmo: true, ...telaAberta }, ator(), maisTarde)).rejects.toThrow(/A compra mudou depois/);
    // Valor certo com a versão de agora, mas valor adulterado no formulário: recusada.
    await expect(aprovarPagamento({ pedidoId: pedido.id, confirmo: true, ...(await visto(pedido.id)), valorCentavos: 1 }, ator(), maisTarde)).rejects.toThrow(/A compra mudou depois/);
    expect(await pedidoNoBanco(pedido.id)).toMatchObject({ valor_centavos: 101500, aprovado_em: null, aprovado_por: null });
    expect((await registros(pedido.id)).map((registro) => registro.acao)).not.toContain("PAGAMENTO_APROVADO");

    // O time aprova (depois da compra): quem, quando e a observação ficam no pedido e no histórico.
    await aprovar(pedido.id, { observacao: SEGREDOS.obsAprovacao }, depois);
    expect(await pedidoNoBanco(pedido.id)).toMatchObject({ situacao: "EMITIDO", aprovado_em: depois, aprovado_por: usuarioId, observacao_aprovacao: SEGREDOS.obsAprovacao });
    expect((await registros(pedido.id)).at(-1)).toEqual({ acao: "PAGAMENTO_APROVADO", origem: "USUARIO", usuario_id: usuarioId, acesso_sdc_id: null });
    await expect(aprovar(pedido.id, {}, depois)).rejects.toThrow(/já foi aprovado/);
    expect((await cartao()).quantidade).toBe(0);
    expect((await carregarVoos({}, depois)).totais).toEqual({ aAprovar: 0, aAprovarCentavos: 0, aprovados: 1, aprovadoCentavos: 101500 });

    // Aprovado: a SDC só lê; a tentativa de corrigir é recusada e nada muda.
    expect((await carregarVoosDaSdc({}, depois)).grupos[0]!.eventos[0]!.linhas[0]!).toMatchObject({ paraASdc: "APROVADO", podeRegistrar: false, aprovadoEm: depois });
    const recusa = registrarCompraDeVoo(compra(pedido.referencia, 5), sdc(), depois);
    await expect(recusa).rejects.toBeInstanceOf(RegraDeNegocioError);
    await expect(recusa).rejects.toThrow(/já foi aprovado pelo time de eventos/);
    expect(await pedidoNoBanco(pedido.id)).toMatchObject({ valor_centavos: 101500, aprovado_por: usuarioId });

    // O time desfaz: volta a "a aprovar" e a SDC pode corrigir de novo.
    await desfazerAprovacao({ pedidoId: pedido.id }, ator(), depois);
    expect(await pedidoNoBanco(pedido.id)).toMatchObject({ situacao: "EMITIDO", aprovado_em: null, aprovado_por: null, observacao_aprovacao: null });
    expect((await registros(pedido.id)).at(-1)).toMatchObject({ acao: "APROVACAO_DESFEITA", origem: "USUARIO" });
    await expect(desfazerAprovacao({ pedidoId: pedido.id }, ator(), depois)).rejects.toBeInstanceOf(RegraDeNegocioError);
    await registrarCompraDeVoo(compra(pedido.referencia, 99000), sdc(), depois);

    // Aprovado de novo; o time corrige a compra → a aprovação cai sozinha (com registro) e a compra passa a ser do time.
    await aprovar(pedido.id, {}, depois);
    await registrarRetornoDaSdc({ pedidoId: pedido.id, valorCentavos: 99900, trechos: compra(pedido.referencia).trechos }, ator(), depois);
    expect(await pedidoNoBanco(pedido.id)).toMatchObject({ situacao: "EMITIDO", valor_centavos: 99900, retorno_registrado_por: usuarioId, retorno_registrado_pela_sdc: null, aprovado_em: null, aprovado_por: null });
    expect((await registros(pedido.id)).slice(-2).map((registro) => registro.acao).sort()).toEqual(["APROVACAO_DESFEITA", "RETORNO_REGISTRADO"]);

    // Aprovado de novo; o time altera o pedido → volta para a SDC comprar de novo, sem aprovação.
    await aprovar(pedido.id, {}, depois);
    const { atualizado_em: versao } = await um(`select atualizado_em from eventos.pedido_sdc where id = $1`, [pedido.id]);
    await alterarPedido({ pedidoId: pedido.id, atualizadoEm: (versao as Date).toISOString(), trechos: [ida, { ...volta, dataDesejada: "2026-12-18" }] }, ator(), depois);
    expect(await pedidoNoBanco(pedido.id)).toMatchObject({ situacao: "ALTERADO", aprovado_em: null, aprovado_por: null });
    expect((await carregarVoosDaSdc({}, depois)).grupos[0]!.eventos[0]!.linhas[0]!).toMatchObject({ paraASdc: "A_COMPRAR", podeRegistrar: true, dataCompra: null });
    await expect(aprovar(pedido.id, {}, depois)).rejects.toThrow(/depois que a compra estiver registrada/);

    // Cancelado: nem a SDC registra, nem o time aprova.
    await registrarCompraDeVoo(compra(pedido.referencia), sdc(), depois);
    await aprovar(pedido.id, {}, depois);
    await cancelarPedido({ pedidoId: pedido.id, motivo: SEGREDOS.motivo }, ator(), depois);
    expect(await pedidoNoBanco(pedido.id)).toMatchObject({ situacao: "CANCELADO", aprovado_em: null, aprovado_por: null });
    await expect(registrarCompraDeVoo(compra(pedido.referencia), sdc(), depois)).rejects.toBeInstanceOf(RegraDeNegocioError);
    await expect(aprovar(pedido.id, {}, depois)).rejects.toThrow(/foi cancelado/);
    expect((await carregarVoosDaSdc({}, depois)).grupos[0]!.eventos[0]!.linhas[0]!).toMatchObject({ paraASdc: "CANCELADO", podeRegistrar: false });
    expect((await carregarVoosDaSdc({ situacao: "A_COMPRAR" }, depois)).total).toBe(0);
  });

  it("a SDC grava uma lista fechada de campos: não põe nem apaga o link do cartão de embarque, e não usa links nos textos", async () => {
    const eva = await pessoa("Eva Passageira");
    const pedido = await registrarPedidoDeVoo({ eventoId, pessoaId: eva.pessoaId, trechos: [ida, volta] }, ator(), agora);
    const colunas = async () => ({
      pedido: await um(`select * from eventos.pedido_sdc where id = $1`, [pedido.id]),
      ida: await um(`select * from eventos.trecho_voo where pedido_id = $1 and sentido = 'IDA'`, [pedido.id]),
    });
    const mudaram = (antes: Record<string, unknown>, depoisDe: Record<string, unknown>) => Object.keys(antes).filter((coluna) => JSON.stringify(antes[coluna]) !== JSON.stringify(depoisDe[coluna])).sort();

    // O schema da SDC não tem o campo do link: mandar no formulário não chega ao serviço.
    const comLink = registrarCompraDeVooPelaSdcSchema.parse({
      referencia: pedido.referencia,
      valorCentavos: "980,00",
      trechos: trechosComprados.map((trecho) => ({ ...trecho, cartaoEmbarqueUrl: "https://exemplo.test/isca", outraCompanhia: "" })),
    });
    // (0020) A lista fechada ganhou, de propósito, os aeroportos de origem e de destino: é a SDC quem escolhe o aeroporto.
    expect(comLink.trechos.map((trecho) => Object.keys(trecho).sort())).toEqual(Array(2).fill(["chegadaEm", "companhia", "destinoIata", "localizador", "numeroVoo", "origemIata", "partidaEm", "sentido"]));
    expect(comLink.trechos.map((trecho) => [trecho.origemIata, trecho.destinoIata])).toEqual(Array(2).fill([undefined, undefined]));
    expect(Object.keys(comLink).sort()).toEqual(["referencia", "trechos", "valorCentavos"]);

    const antes = await colunas();
    await registrarCompraDeVoo(comLink, sdc(), depois);
    const comprado = await colunas();
    expect(mudaram(antes.pedido, comprado.pedido)).toEqual(["atualizado_em", "data_compra", "emitido_em", "retorno_registrado_pela_sdc", "situacao", "valor_centavos"]);
    expect(mudaram(antes.ida, comprado.ida)).toEqual(["atualizado_em", "chegada_em", "companhia", "localizador", "numero_voo", "partida_em"]);
    expect(comprado.ida.cartao_embarque_url).toBeNull();

    // O time põe o link; a correção da SDC não apaga nem troca.
    await registrarRetornoDaSdc({ pedidoId: pedido.id, valorCentavos: 98000, trechos: trechosComprados.map((trecho) => ({ ...trecho, cartaoEmbarqueUrl: "https://exemplo.test/cartao-do-time" })) }, ator(), depois);
    await registrarCompraDeVoo({ ...comLink, valorCentavos: 99000 }, sdc(), new Date("2026-10-30T15:00:00Z"));
    expect(await teste.sql(`select sentido, cartao_embarque_url from eventos.trecho_voo where pedido_id = $1 order by sentido`, [pedido.id])).toEqual([
      { sentido: "IDA", cartao_embarque_url: "https://exemplo.test/cartao-do-time" },
      { sentido: "VOLTA", cartao_embarque_url: "https://exemplo.test/cartao-do-time" },
    ]);
    expect(await pedidoNoBanco(pedido.id)).toMatchObject({ valor_centavos: 99000, retorno_registrado_por: null, retorno_registrado_pela_sdc: sdcId });

    // Companhia: lista curta ou "Outra" com texto validado. Textos que vão para as copys do staff não levam link nem quebra de linha.
    const base = { referencia: pedido.referencia, valorCentavos: "980,00" };
    const trecho = (extra: Record<string, unknown>) => ({ ...base, trechos: [{ ...trechosComprados[0], ...extra }] });
    expect(registrarCompraDeVooPelaSdcSchema.parse(trecho({ companhia: "OUTRA", outraCompanhia: "  Voepass   Linhas " })).trechos[0]!.companhia).toBe("Voepass Linhas");
    for (const extra of [
      { companhia: "Azul Linhas" },
      { companhia: "OUTRA" },
      { companhia: "OUTRA", outraCompanhia: "A" },
      { companhia: "OUTRA", outraCompanhia: "Veja https://exemplo.test" },
      { companhia: "OUTRA", outraCompanhia: "www.exemplo.test" },
      { companhia: "OUTRA", outraCompanhia: "Azul\nClique aqui" },
      { companhia: "OUTRA", outraCompanhia: "Azul\u0000" },
      { companhia: "OUTRA", outraCompanhia: "Azul\u2028Linhas" },
    ]) {
      expect(registrarCompraDeVooPelaSdcSchema.safeParse(trecho(extra)).success, JSON.stringify(extra)).toBe(false);
    }
    expect(registrarCompraDeVooPelaSdcSchema.safeParse({ ...trecho({}), observacaoSdc: "Veja em http://exemplo.test" }).success).toBe(false);
    expect(registrarCompraDeVooPelaSdcSchema.parse({ ...trecho({}), observacaoSdc: "Linha 1\nLinha 2" }).observacaoSdc).toBe("Linha 1\nLinha 2");

    const reserva = { referencia: "SDC-000001", hotel: { nome: "Hotel Teste", cidade: "Manaus", uf: "AM" }, valorCentavos: "100,00", numeroReserva: "R1", formaPagamento: "Faturado SDC" };
    expect(registrarReservaPelaSdcSchema.safeParse(reserva).success).toBe(true);
    for (const [campo, valor] of [
      ["nome", "Hotel https://exemplo.test"],
      ["nome", "Hotel\nReserve em outro lugar"],
      ["cidade", "www.exemplo.test"],
      ["logradouro", "Rua ftp://exemplo.test"],
      ["bairro", "Centro\r\nLigue já"],
      ["numero", "10\t0"],
    ] as const) {
      const recusa = registrarReservaPelaSdcSchema.safeParse({ ...reserva, hotel: { ...reserva.hotel, [campo]: valor } });
      expect(recusa.success, `${campo}: ${JSON.stringify(valor)}`).toBe(false);
    }
    expect(registrarReservaPelaSdcSchema.safeParse({ ...reserva, formaPagamento: "Pague em www.exemplo.test" }).success).toBe(false);
    expect(registrarReservaPelaSdcSchema.safeParse({ ...reserva, numeroReserva: "R1\nR2" }).success).toBe(false);
    const mensagem = registrarReservaPelaSdcSchema.safeParse({ ...reserva, hotel: { ...reserva.hotel, nome: "Hotel https://exemplo.test" } });
    expect(mensagem.success ? "" : mensagem.error.issues[0]!.message).toBe("Não use links nem endereços de site neste campo.");
  });

  it("a SDC só grava em pedido que ela enxerga: fora do período da lista, é pedido não encontrado", async () => {
    const fabi = await pessoa("Fabi Passageira");
    const pedido = await registrarPedidoDeVoo({ eventoId, pessoaId: fabi.pessoaId, trechos: [ida, volta] }, ator(), agora);
    // O evento termina em 17/12/2026: 120 dias depois ele ainda está na lista; no dia seguinte, não.
    const noLimite = new Date("2027-04-16T15:00:00Z");
    const fora = new Date("2027-04-17T15:00:00Z");
    const naLista = async (quando: Date) => (await carregarVoosDaSdc({}, quando)).grupos.flatMap((mes) => mes.eventos.flatMap((grupo) => grupo.linhas)).some((linha) => linha.referencia === pedido.referencia);
    expect(await naLista(noLimite)).toBe(true);
    expect(await naLista(fora)).toBe(false);
    await expect(registrarCompraDeVoo(compra(pedido.referencia), sdc(), fora)).rejects.toThrow(/Pedido não encontrado/);
    expect(await pedidoNoBanco(pedido.id)).toMatchObject({ situacao: "PEDIDO", valor_centavos: null });
    await registrarCompraDeVoo(compra(pedido.referencia), sdc(), noLimite);
    expect(await pedidoNoBanco(pedido.id)).toMatchObject({ situacao: "EMITIDO", retorno_registrado_pela_sdc: sdcId });
  });

  it("a SDC só alcança pedido que existe e do tipo certo, pela referência (nunca por id)", async () => {
    const bia = await pessoa("Bia Passageira");
    const voo = await registrarPedidoDeVoo({ eventoId, pessoaId: bia.pessoaId, trechos: [ida, volta] }, ator(), agora);
    const reserva = { referencia: voo.referencia, hotel: { nome: "Hotel Teste", cidade: "Manaus", uf: "AM" }, valorCentavos: 100, numeroReserva: "R1", formaPagamento: "Faturado SDC" };
    // Referência de voo no formulário da hospedagem (e vice-versa) não acha nada.
    await expect(registrarReservaDeHospedagem(reserva, sdc(), agora)).rejects.toThrow(/Pedido não encontrado/);
    await expect(registrarCompraDeVoo(compra("SDC-999999"), sdc(), agora)).rejects.toThrow(/Pedido não encontrado/);
    // O formulário não aceita id nem outra coisa no lugar da referência.
    for (const referencia of [voo.id, "sdc-000001", "SDC-1", "SDC-000001' or '1'='1", ""]) {
      expect(registrarCompraDeVooPelaSdcSchema.safeParse({ referencia, valorCentavos: "10,00", trechos: trechosComprados }).success).toBe(false);
    }
    // Campos a mais (um pedidoId, uma aprovação) são ignorados pelo schema: a SDC não escolhe pedido por id nem aprova.
    const comExtras = registrarCompraDeVooPelaSdcSchema.parse({ referencia: voo.referencia, valorCentavos: "10,00", trechos: trechosComprados, pedidoId: voo.id, aprovadoEm: "2026-01-01", situacao: "CANCELADO" });
    expect(Object.keys(comExtras).sort()).toEqual(["referencia", "trechos", "valorCentavos"]);
    expect(await pedidoNoBanco(voo.id)).toMatchObject({ situacao: "PEDIDO", valor_centavos: null });
  });

  it("hospedagem: a SDC informa o hotel (criado na hora, ou reaproveitado), a reserva, o valor e o pagamento; o time aprova", async () => {
    const caio = await pessoa("Caio Hospede", "M");
    const hospedagemId = await criarHospedagem({ eventoId, checkIn: "2026-12-14", checkOut: "2026-12-18" }, ator(), agora);
    await adicionarQuarto({ hospedagemId, nome: "Quarto 1", capacidade: 2 }, ator(), agora);
    const quartoId = (await carregarHospedagem(eventoId, agora)).hospedagens[0]!.quartos[0]!.id;
    await porNoQuarto({ quartoId, pessoaId: caio.pessoaId }, ator(), agora);
    const { id: pedidoId, referencia } = await registrarPedidoDeHospedagem({ hospedagemId, observacaoTime: "Perto do evento" }, ator(), agora);

    const reserva = registrarReservaPelaSdcSchema.parse({
      referencia,
      hotel: { nome: "Hotel Da Agência", cidade: "Manaus", uf: "am", logradouro: "Av. das Flores", numero: "100" },
      valorCentavos: "1.200,00",
      numeroReserva: "RES-99812",
      formaPagamento: "Faturado SDC",
    });
    await registrarReservaDeHospedagem(reserva, sdc(), agora);
    const { id: hotelId } = await um(`select id from eventos.local where nome = 'Hotel Da Agência' and tipo = 'HOTEL' and uf = 'AM'`);
    expect(await um(`select numero_reserva, local_id from eventos.hospedagem where id = $1`, [hospedagemId])).toEqual({ numero_reserva: "RES-99812", local_id: hotelId });
    expect(await pedidoNoBanco(pedidoId)).toMatchObject({ situacao: "EMITIDO", valor_centavos: 120000, retorno_registrado_por: null, retorno_registrado_pela_sdc: sdcId });
    // O hotel novo e o retorno ficam no nome da SDC.
    expect(await registros(hotelId as string)).toEqual([{ acao: "LOCAL_CRIADO", origem: "SDC", usuario_id: null, acesso_sdc_id: sdcId }]);
    expect((await registros(pedidoId)).at(-1)).toEqual({ acao: "RETORNO_REGISTRADO", origem: "SDC", usuario_id: null, acesso_sdc_id: sdcId });

    // Corrigir com o mesmo hotel (comparação normalizada: maiúsculas, acentos e espaços) não cria outro nem mexe nele.
    const hoteis = async () => (await teste.sql(`select id, nome, cidade, logradouro from eventos.local where tipo = 'HOTEL' order by criado_em, id`)) as Record<string, unknown>[];
    await registrarReservaDeHospedagem({ ...reserva, hotel: { ...reserva.hotel, nome: "hotel  da AGENCIA", cidade: "manaus" }, valorCentavos: 121000 }, sdc(), depois);
    expect(await hoteis()).toEqual([{ id: hotelId, nome: "Hotel Da Agência", cidade: "Manaus", logradouro: "Av. das Flores" }]);

    // Corrigir o nome (ou o endereço): o hotel que a própria SDC criou para este pedido é corrigido, não nasce outro.
    await registrarReservaDeHospedagem({ ...reserva, hotel: { ...reserva.hotel, nome: "Hotel Da Agência Centro", logradouro: "Av. das Palmeiras" }, valorCentavos: 122000 }, sdc(), depois);
    expect(await hoteis()).toEqual([{ id: hotelId, nome: "Hotel Da Agência Centro", cidade: "Manaus", logradouro: "Av. das Palmeiras" }]);
    expect(await registros(hotelId as string)).toEqual([
      { acao: "LOCAL_CRIADO", origem: "SDC", usuario_id: null, acesso_sdc_id: sdcId },
      { acao: "LOCAL_ALTERADO", origem: "SDC", usuario_id: null, acesso_sdc_id: sdcId },
    ]);

    // Hotel que o time já tinha cadastrado: a SDC informa o mesmo nome e cidade e ele é reaproveitado, sem alteração.
    const { id: doTime } = await um(`insert into eventos.local (nome, tipo, cidade, uf, cep) values ('Pousada do Time', 'HOTEL', 'Manaus', 'AM', '69000000') returning id`);
    await registrarReservaDeHospedagem({ ...reserva, hotel: { nome: "POUSADA DO TIME", cidade: "Manaus", uf: "AM" }, valorCentavos: 123000 }, sdc(), depois);
    expect(await um(`select local_id from eventos.hospedagem where id = $1`, [hospedagemId])).toEqual({ local_id: doTime });
    // Agora o hotel do pedido é do time: corrigir para um nome novo NÃO altera o cadastro do time (cria o da SDC).
    await registrarReservaDeHospedagem({ ...reserva, hotel: { nome: "Outro Hotel Da Agência", cidade: "Manaus", uf: "AM" }, valorCentavos: 124000 }, sdc(), depois);
    expect(await um(`select nome, cep from eventos.local where id = $1`, [doTime])).toEqual({ nome: "Pousada do Time", cep: "69000000" });
    expect(await registros(doTime as string)).toEqual([]);
    expect((await hoteis()).map((hotel) => hotel.nome).sort()).toEqual(["Hotel Da Agência Centro", "Outro Hotel Da Agência", "Pousada do Time"]);
    // E volta para o primeiro, que continua lá: de novo reaproveitado.
    await registrarReservaDeHospedagem({ ...reserva, hotel: { ...reserva.hotel, nome: "Hotel Da Agência Centro" }, valorCentavos: 125000 }, sdc(), depois);
    expect(await um(`select local_id from eventos.hospedagem where id = $1`, [hospedagemId])).toEqual({ local_id: hotelId });
    expect(await hoteis()).toHaveLength(3);

    const daSdc = (await carregarHospedagensDaSdc({}, depois)).grupos[0]!.eventos[0]!.linhas[0]!;
    expect(daSdc).toMatchObject({
      referencia,
      paraASdc: "AGUARDANDO_APROVACAO",
      podeRegistrar: true,
      checkIn: "2026-12-14",
      checkOut: "2026-12-18",
      quartos: [{ nome: "Quarto 1", capacidade: 2, ocupantes: ["Caio Hospede"] }],
      hotel: { nome: "Hotel Da Agência Centro", cidade: "Manaus", uf: "AM" },
      numeroReserva: "RES-99812",
      formaPagamento: "Faturado SDC",
      valorCentavos: 125000,
      observacaoTime: "Perto do evento",
    });

    await aprovar(pedidoId, {}, depois);
    expect((await carregarHospedagem(eventoId, depois)).hospedagens[0]!.pedido).toMatchObject({ situacao: "EMITIDO", aprovadoEm: depois });
    await expect(registrarReservaDeHospedagem(reserva, sdc(), depois)).rejects.toThrow(/já foi aprovado pelo time de eventos/);
    expect(await pedidoNoBanco(pedidoId)).toMatchObject({ valor_centavos: 125000, aprovado_por: usuarioId });
    expect((await carregarHospedagensDaSdc({}, depois)).totais).toEqual({ aAprovar: 0, aAprovarCentavos: 0, aprovados: 1, aprovadoCentavos: 125000 });
  });

  it("compra a aprovar de evento que já passou continua na tela de Voos do time", async () => {
    const dani = await pessoa("Dani Passageira");
    const pedido = await registrarPedidoDeVoo({ eventoId, pessoaId: dani.pessoaId, trechos: [ida, volta] }, ator(), agora);
    const depoisDoEvento = new Date("2026-12-28T15:00:00Z");
    const aAprovar = async () => (await resumoParaInicio(depoisDoEvento)).find((item) => item.chave === "compras-a-aprovar")!.quantidade;
    const antes = await aAprovar();
    await registrarCompraDeVoo(compra(pedido.referencia, 77000), sdc(), agora);
    const linhas = (await carregarVoos({}, depoisDoEvento)).grupos.flatMap((mes) => mes.eventos.flatMap((grupo) => grupo.linhas));
    expect(linhas.map((linha) => linha.pedido?.referencia)).toContain(pedido.referencia);
    expect(await aAprovar()).toBe(antes + 1);
  });

  it("não vaza dado: o que a SDC recebe não tem telefone, e-mail, documento, endereço, ids internos nem dado interno do time", async () => {
    const voos = await carregarVoosDaSdc({}, depois);
    const hospedagens = await carregarHospedagensDaSdc({}, depois);
    expect(voos.total).toBeGreaterThanOrEqual(3);
    expect(hospedagens.total).toBe(1);
    const texto = JSON.stringify({ voos, hospedagens });

    // Os valores sensíveis estão no banco, ao lado dos pedidos (se não estivessem, o teste não provaria nada).
    expect(await um(`select count(*)::int as n from core.pessoa where telefone = $1 and email = $2`, [SEGREDOS.telefone, SEGREDOS.email])).toMatchObject({ n: 6 });
    expect(await um(`select count(*)::int as n from eventos.pedido_sdc where motivo_cancelamento = $1`, [SEGREDOS.motivo])).toEqual({ n: 1 });
    for (const [nome, valor] of Object.entries(SEGREDOS)) expect(texto, nome).not.toContain(valor);
    // Nenhum id interno (pedido, evento, pessoa, convocação, quarto, local, usuário): a SDC usa a referência SDC-….
    expect(texto).not.toMatch(UUID);
    for (const id of [usuarioId, sdcId, eventoId, escalaId]) expect(texto).not.toContain(id);

    // Lista fechada de campos: um campo novo no que a SDC recebe quebra este teste e pede revisão.
    const chaves = new Set<string>();
    const coletar = (valor: unknown): void => {
      if (Array.isArray(valor)) valor.forEach(coletar);
      else if (valor && typeof valor === "object" && !(valor instanceof Date)) {
        for (const [chave, interno] of Object.entries(valor)) {
          chaves.add(chave);
          coletar(interno);
        }
      }
    };
    coletar({ voos: voos.grupos.flatMap((mes) => mes.eventos.flatMap((grupo) => [grupo.evento, ...grupo.linhas])), hospedagens: hospedagens.grupos.flatMap((mes) => mes.eventos.flatMap((grupo) => [grupo.evento, ...grupo.linhas])) });
    expect([...chaves].sort()).toEqual(
      [
        // pedido
        // (rodada 6) dataSolicitacao e dataCompra entram no lugar de solicitadoEm e compradoEm: a mesma informação, agora
        // com o dia real, sem a hora do lançamento. formaPagamento passou a valer também no voo.
        ...["referencia", "situacao", "evento", "dataSolicitacao", "observacaoTime", "observacaoSdc", "valorCentavos", "dataCompra", "formaPagamento", "aprovadoEm", "paraASdc", "podeRegistrar"],
        // evento (id = a chave de agrupamento "e1", não o id do banco)
        // (rodada 6) masterclass: se o evento é uma palestra, para a tela dela separar "Eventos" de "Masterclass" como a
        // planilha; é dado do evento, não de pessoa.
        ...["id", "chave", "codigo", "nome", "dataInicio", "dataFim", "local", "cidade", "uf", "masterclass"],
        // voo
        // (rodada 6) eventoDaVolta: na turnê de Masterclass a volta sai da última palestra; a SDC precisa saber de onde.
        // É um evento com os mesmos campos do evento do pedido (sem id interno: só a chave de agrupamento).
        // (0020, voo sem aeroporto) origemCidade e destinoCidade: o time pede por cidade e é a SDC quem escolhe o
        // aeroporto. São as cidades do TRECHO, escritas no pedido; o endereço e a cidade do cadastro da pessoa
        // (SEGREDOS.cidadeDeCasa) continuam fora, a não ser que o time as escreva no trecho.
        ...["passageiro", "trechos", "eventoDaVolta", "sentido", "origemCidade", "destinoCidade", "origemIata", "destinoIata", "dataDesejada", "preferenciaHorario", "companhia", "numeroVoo", "localizador", "partidaEm", "chegadaEm"],
        // hospedagem
        ...["checkIn", "checkOut", "quartos", "capacidade", "ocupantes", "hotel", "logradouro", "numero", "bairro", "numeroReserva"],
        "voos",
        "hospedagens",
      ].sort(),
    );
    const eventos = voos.grupos.flatMap((mes) => mes.eventos.map((grupo) => grupo.evento));
    expect(eventos.every((evento) => /^e\d+$/.test(evento.id) && evento.id === evento.chave)).toBe(true);
  });
});
