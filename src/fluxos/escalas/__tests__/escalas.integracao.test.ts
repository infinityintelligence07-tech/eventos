import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

import { ConflitoDeVersaoError, RegraDeNegocioError } from "@/fluxos/_base";
import { lerRegraGuiada } from "@/modules/escala";
import { type BancoDeTeste, criarBancoDeTeste, desfazerFuncoesDa0021, TEST_DATABASE_URL } from "@/test/banco";

import { carregarResumoDoEvento, salvarDadosDoEvento } from "../../eventos";
import * as escalas from "..";

const estado = vi.hoisted(() => ({ banco: null as BancoDeTeste | null }));

// Os fluxos abrem a transação por @/fluxos/_base; aqui ela vai para o banco descartável do teste.
vi.mock("@/fluxos/_base", async (original) => {
  const base = await original<typeof import("@/fluxos/_base")>();
  return {
    ...base,
    // A transação real (limite e "sem registro, desfaz"), no banco de teste.
    transacao: async (_ator: unknown, trabalho: (tx: never) => Promise<unknown>) => (await import("@/fluxos/_base/banco")).transacaoNoBanco(estado.banco!.db, trabalho as never),
    bancoParaLeitura: async () => estado.banco!.db,
  };
});

describe.skipIf(!TEST_DATABASE_URL)("fluxos da escala no banco", () => {
  let banco: BancoDeTeste;
  let usuarioId: string;
  let eventoId: string;
  let tipoConfronto: string;
  const pessoas: Record<string, string> = {};
  const agora = new Date("2026-10-28T15:00:00Z");
  const quem = () => ({ ator: { usuarioId, pessoaId: null, origem: "LOCAL" as const }, agora });

  const um = async (texto: string, params: unknown[] = []) => ((await banco.sql(texto, params)) as Record<string, unknown>[])[0]!;
  const linhaDa = async (codigo: string) =>
    (await um(
      `select e.id, e.quantidade_vagas, e.confirmada_em, e.confirmada_por from eventos.escala e join eventos.funcao f on f.id = e.funcao_id
        where e.evento_id = $1 and f.codigo = $2 and e.deleted_at is null`,
      [eventoId, codigo],
    )) as { id: string; quantidade_vagas: number; confirmada_em: Date | null; confirmada_por: string | null };
  const statusDaEscala = async () => (await um(`select status_escala, aprovado_por, aprovado_em from eventos.evento where id = $1`, [eventoId])) as {
    status_escala: string;
    aprovado_por: string | null;
    aprovado_em: Date | null;
  };

  async function novoEvento(nome: string, inicio: string, fim: string): Promise<string> {
    return (await um(
      `insert into eventos.evento (nome, codigo, inicio, fim, status, tipo_evento_id, expectativa_publico, local_id)
       values ($1, $2, $3, $4, 'PLANEJADO', $5, 180,
               (select id from eventos.local where nome = 'Centro de Eventos'))
       returning id`,
      [nome, nome.toUpperCase().replace(/ /g, "_"), inicio, fim, tipoConfronto],
    )).id as string;
  }

  async function novaPessoa(nome: string, { lat, lng, funcao, nivel = "HABILITADO" }: { lat?: number; lng?: number; funcao?: string; nivel?: string }) {
    const { id } = (await um(`insert into core.pessoa (nome_completo) values ($1) returning id`, [nome])) as { id: string };
    await banco.sql(`insert into eventos.pessoa_evento (pessoa_id, lat, lng) values ($1, $2, $3)`, [id, lat ?? null, lng ?? null]);
    if (funcao) {
      await banco.sql(`insert into eventos.pessoa_funcao (pessoa_id, funcao_id, nivel) select $1, id, $3 from eventos.funcao where codigo = $2`, [id, funcao, nivel]);
    }
    pessoas[nome] = id;
    return id;
  }

  beforeAll(async () => {
    banco = await criarBancoDeTeste();
    // As funções de exemplo destes testes (Pai / mãe, Trainee de líder...) saíram na 0021: voltam só aqui.
    await desfazerFuncoesDa0021(banco);
    estado.banco = banco;
    usuarioId = (await um(`insert into core.usuario (email, nome_usuario) values ('time@exemplo.test', 'Usuário de teste') returning id`)).id as string;
    tipoConfronto = (await um(`select id from eventos.tipo_evento where sigla = 'CONF'`)).id as string;
    await banco.sql(`insert into eventos.local (nome, cidade, uf, lat, lng) values ('Centro de Eventos', 'Porto Alegre', 'RS', -30.03, -51.22)`);
    eventoId = await novoEvento("Conf teste", "2026-11-12T03:00:00Z", "2026-11-15T02:59:59Z");
    await novaPessoa("Ana Perto", { lat: -30.04, lng: -51.21, funcao: "STAFF" });
    await novaPessoa("Bia Longe", { lat: -29.0, lng: -51.0, funcao: "STAFF" });
    await novaPessoa("Caio Sem Funcao", { lat: -30.04, lng: -51.21 });
    await novaPessoa("Duda Ocupada", { lat: -30.04, lng: -51.21, funcao: "STAFF" });
  }, 60_000);

  afterAll(async () => {
    await banco?.encerrar();
  });

  it("Configurações › Vagas: Confronto ganha Staff digitado; cálculo personalizado novo é recusado", async () => {
    const { tipos } = await escalas.listarRegrasDeVagas();
    const confronto = tipos.find((tipo) => tipo.sigla === "CONF")!;
    expect(confronto.linhas.map((linha) => linha.modo)).toEqual(["POR_PUBLICO", "POR_FILA", "FIXO", "FIXO", "FIXO", "FIXO"]);

    const linhas = lerRegraGuiada((await um(`select regra_vagas from eventos.tipo_evento where id = $1`, [tipoConfronto])).regra_vagas);
    await expect(
      escalas.salvarRegraDeVagas({ tipoEventoId: tipoConfronto, funcoes: [...linhas, { funcao: "SOM", modo: "PERSONALIZADA", formula: "99" }] }, quem()),
    ).rejects.toBeInstanceOf(RegraDeNegocioError);

    await escalas.salvarRegraDeVagas({ tipoEventoId: tipoConfronto, funcoes: [...linhas, { funcao: "STAFF", modo: "DIGITADO" }] }, quem());
    const regra = (await um(`select regra_vagas from eventos.tipo_evento where id = $1`, [tipoConfronto])).regra_vagas as { funcoes: unknown[] };
    expect(regra.funcoes.at(-1)).toEqual({ funcao: "STAFF", digitado: true });
    const historico = await banco.sql(
      `select acao, usuario_id = $2 as do_usuario, dados -> 'depois' = $3::jsonb as depois, jsonb_array_length(dados -> 'antes' -> 'funcoes') as antes
         from eventos.registro_acao where entidade = 'TIPO_EVENTO' and entidade_id = $1`,
      [tipoConfronto, usuarioId, JSON.stringify(regra)],
    );
    // A tentativa recusada (cálculo personalizado novo) não deixa histórico.
    expect(historico).toEqual([{ acao: "REGRA_VAGAS_ALTERADA", do_usuario: true, depois: true, antes: 6 }]);
  });

  it("Resumo: informar a fila grava e gera as vagas; versão velha é recusada", async () => {
    const resumo = (await carregarResumoDoEvento(eventoId))!;
    expect(resumo.usaFila).toBe(true);
    expect(resumo.vagas.pendencias.map((pendencia) => pendencia.motivo)).toEqual(["FALTA_FILA", "DIGITAR"]);

    await expect(salvarDadosDoEvento({ eventoId, expectativaPublico: 180, pessoasNaFila: 90, atualizadoEm: resumo.evento.atualizadoEm }, quem().ator, agora)).resolves.toEqual({
      vagas: "GERADA",
    });
    await expect(
      salvarDadosDoEvento({ eventoId, expectativaPublico: 200, pessoasNaFila: 90, atualizadoEm: resumo.evento.atualizadoEm }, quem().ator, agora),
    ).rejects.toBeInstanceOf(ConflitoDeVersaoError);

    expect((await statusDaEscala()).status_escala).toBe("RASCUNHO");
    expect((await linhaDa("LIDER")).quantidade_vagas).toBe(8);
    expect((await linhaDa("PAI_MAE")).quantidade_vagas).toBe(6);
  });

  it("Montar escala: sem Staff digitado e sem confirmar, não vai para a líder", async () => {
    const montagem = (await escalas.carregarMontagem(eventoId))!;
    expect(montagem.editavel).toBe(true);
    expect(montagem.resumo.pendencias).toEqual([{ funcao: "STAFF", nomeDaFuncao: "Staff", motivo: "DIGITAR" }]);
    await expect(escalas.enviarParaAprovacao({ eventoId, statusEsperado: "RASCUNHO" }, quem())).rejects.toThrow(/Confirme o número de vagas/);
  });

  it("confirma números, digita o Staff e desfaz a confirmação ao mudar o número", async () => {
    const montagem = (await escalas.carregarMontagem(eventoId))!;
    await escalas.confirmarVagas({ eventoId, linhas: montagem.linhas.map((linha) => ({ escalaId: linha.id, quantidade: linha.quantidade })) }, quem());
    await escalas.definirVagaDigitada({ eventoId, funcao: "STAFF", quantidade: 2 }, quem());

    const staff = await linhaDa("STAFF");
    expect(staff).toMatchObject({ quantidade_vagas: 2, confirmada_por: usuarioId });
    await expect(escalas.definirVagaDigitada({ eventoId, funcao: "DJ", quantidade: 2 }, quem())).rejects.toBeInstanceOf(RegraDeNegocioError);

    const lider = await linhaDa("LIDER");
    await escalas.alterarVagas({ eventoId, escalaId: lider.id, quantidade: 9 }, quem());
    expect(await linhaDa("LIDER")).toMatchObject({ quantidade_vagas: 9, confirmada_em: null, confirmada_por: null });
    await escalas.confirmarVagas({ eventoId, linhas: [{ escalaId: lider.id, quantidade: 9 }] }, quem());

    // Recalcular não mexe em linha confirmada (a regra sugere 8).
    await expect(escalas.recalcularVagasDoTipo({ tipoEventoId: tipoConfronto }, quem())).resolves.toMatchObject({ eventos: 1 });
    expect((await linhaDa("LIDER")).quantidade_vagas).toBe(9);
    const depois = (await escalas.carregarMontagem(eventoId))!;
    expect(depois.resumo.sugestoesMudadas).toEqual([{ nomeDaFuncao: "Líder", sugerido: 8, confirmado: 9 }]);
    expect(depois.resumo.envio.pode).toBe(true);
  });

  it("sugestões: quem tem a função e está perto primeiro; conflito de agenda aparece e é recusado na gravação", async () => {
    const outro = await novoEvento("MC sobreposta", "2026-11-13T03:00:00Z", "2026-11-14T02:59:59Z");
    const { id: linhaDoOutro } = (await um(
      `insert into eventos.escala (evento_id, data, hora_inicio, hora_fim, quantidade_vagas, status) values ($1, '2026-11-13', '08:00', '18:00', 1, 'ABERTA') returning id`,
      [outro],
    )) as { id: string };
    await banco.sql(`insert into eventos.convocacao (escala_id, pessoa_id, status) values ($1, $2, 'SUGERIDA')`, [linhaDoOutro, pessoas["Duda Ocupada"]]);

    const staff = await linhaDa("STAFF");
    const sugestoes = (await escalas.sugerirPessoas(eventoId, staff.id, agora))!;
    expect(sugestoes.vagasAbertas).toBe(2);
    expect(sugestoes.sugeridos.map((candidato) => candidato.nome)).toEqual(["Ana Perto", "Duda Ocupada", "Bia Longe", "Caio Sem Funcao"]);
    expect(sugestoes.sugeridos.find((candidato) => candidato.nome === "Duda Ocupada")!.conflitos).toEqual(["MC_SOBREPOSTA"]);
    expect(await escalas.sugerirPessoas(outro, staff.id, agora)).toBeNull();

    await expect(escalas.porNaVaga({ eventoId, escalaId: staff.id, pessoaId: pessoas["Duda Ocupada"]! }, quem())).rejects.toThrow(/MC_SOBREPOSTA/);
  });

  it("Pai / mãe é cargo do evento: qualquer staff é sugerido como apto, sem ter a função no cadastro", async () => {
    const staff = (await escalas.sugerirPessoas(eventoId, (await linhaDa("STAFF")).id, agora))!;
    expect(staff.cargoDoEvento).toBe(false);
    expect(staff.sugeridos.find((candidato) => candidato.nome === "Caio Sem Funcao")!.nivel).toBe("SEM_FUNCAO");

    const paiMae = (await escalas.sugerirPessoas(eventoId, (await linhaDa("PAI_MAE")).id, agora))!;
    expect(paiMae).toMatchObject({ nomeDaFuncao: "Pai / mãe", cargoDoEvento: true, vagasAbertas: 6 });
    expect(paiMae.sugeridos.map((candidato) => candidato.nome).sort()).toEqual(["Ana Perto", "Bia Longe", "Caio Sem Funcao", "Duda Ocupada"]);
    expect(new Set(paiMae.sugeridos.map((candidato) => candidato.nivel))).toEqual(new Set(["HABILITADO"]));
    // Ninguém tem (nem pode ter) Pai / mãe como função: quem não tem função nenhuma empata com quem é Staff e está perto.
    const pontos = Object.fromEntries(paiMae.sugeridos.map((candidato) => [candidato.nome, candidato.pontuacao]));
    expect(pontos["Caio Sem Funcao"]).toBe(pontos["Ana Perto"]);

    // Entra na vaga e a tela não a marca como "não habilitada".
    const caio = await escalas.porNaVaga({ eventoId, escalaId: (await linhaDa("PAI_MAE")).id, pessoaId: pessoas["Caio Sem Funcao"]! }, quem());
    const naTela = (await escalas.carregarMontagem(eventoId))!.linhas.flatMap((linha) => linha.convocacoes).find((convocacao) => convocacao.id === caio.convocacaoId);
    expect(naTela).toMatchObject({ nivel: null, cargoDoEvento: true, status: "ACEITA" });
    await escalas.tirarDaVaga({ eventoId, convocacaoId: caio.convocacaoId }, quem());
    expect(await banco.sql(`select 1 from eventos.convocacao where id = $1`, [caio.convocacaoId])).toEqual([]);
  });

  it("Trainee de líder é função do cadastro: entra em Adicionar função e é sugerida como qualquer outra", async () => {
    const montagem = (await escalas.carregarMontagem(eventoId))!;
    const codigos = montagem.funcoes.map((funcao) => funcao.codigo);
    // Pai / mãe continua disponível para a escala (é cargo do evento); só saiu das funções da pessoa.
    expect(codigos).toEqual(expect.arrayContaining(["TRAINEE_LIDER", "PAI_MAE", "STAFF"]));
    const traineeDeLider = montagem.funcoes.find((funcao) => funcao.codigo === "TRAINEE_LIDER")!;
    expect(traineeDeLider.nome).toBe("Trainee de líder");

    await expect(escalas.adicionarVagaManual({ eventoId, funcaoId: traineeDeLider.id, quantidade: 1 }, quem())).resolves.toMatchObject({ nomeDaFuncao: "Trainee de líder" });
    const linha = await linhaDa("TRAINEE_LIDER");
    // Sem regra de vaga automática: a linha é manual e ninguém a tem ainda, então todos aparecem como não habilitados.
    const sugestoes = (await escalas.sugerirPessoas(eventoId, linha.id, agora))!;
    expect(sugestoes).toMatchObject({ nomeDaFuncao: "Trainee de líder", cargoDoEvento: false, vagasAbertas: 1 });
    expect(new Set(sugestoes.sugeridos.map((candidato) => candidato.nivel))).toEqual(new Set(["SEM_FUNCAO"]));
    const regra = (await um(`select regra_vagas::text as regra from eventos.tipo_evento where id = $1`, [tipoConfronto])).regra as string;
    expect(regra).not.toContain("TRAINEE_LIDER");
    expect(await banco.sql(`select 1 from eventos.regra_custo where parametros::text like '%TRAINEE_LIDER%' or codigo like '%TRAINEE_LIDER%'`)).toEqual([]);
    await escalas.removerVagaManual({ eventoId, escalaId: linha.id }, quem());
  });

  it("põe e tira pessoas: entra confirmada; vaga esgotada, repetida; hotel e deslocamento são da pessoa no evento", async () => {
    const staff = await linhaDa("STAFF");
    // O voo costuma ser pedido antes da escala: o pedido que a pessoa já tinha no evento passa a apontar para a convocação.
    const { id: pedidoDaAna } = await um(`insert into eventos.pedido_sdc (tipo, evento_id, pessoa_id) values ('VOO', $1, $2) returning id`, [eventoId, pessoas["Ana Perto"]]);
    const ana = await escalas.porNaVaga({ eventoId, escalaId: staff.id, pessoaId: pessoas["Ana Perto"]!, sugestaoScore: 90 }, quem());
    expect(await um(`select convocacao_id from eventos.pedido_sdc where id = $1`, [pedidoDaAna])).toEqual({ convocacao_id: ana.convocacaoId });
    await expect(escalas.porNaVaga({ eventoId, escalaId: staff.id, pessoaId: pessoas["Ana Perto"]! }, quem())).rejects.toThrow(/já está/);
    const bia = await escalas.porNaVaga({ eventoId, escalaId: staff.id, pessoaId: pessoas["Bia Longe"]! }, quem());
    await expect(escalas.porNaVaga({ eventoId, escalaId: staff.id, pessoaId: pessoas["Caio Sem Funcao"]! }, quem())).rejects.toThrow(/já estão preenchidas/);

    const dj = await linhaDa("DJ");

    // Quem entra na escala já entra confirmada (a tela não pede situação) e ainda não foi avisada.
    expect(await um(`select status, criado_por, sugestao_score, convidada_em, precisa_hotel from eventos.convocacao where id = $1`, [ana.convocacaoId])).toEqual({
      status: "ACEITA",
      criado_por: usuarioId,
      sugestao_score: "90.00",
      convidada_em: null,
      precisa_hotel: false,
    });
    expect(await um(`select status_de, status_para from eventos.registro_acao where entidade_id = $1 and acao = 'CONVOCACAO_INCLUIDA'`, [ana.convocacaoId])).toEqual({
      status_de: null,
      status_para: "ACEITA",
    });

    // Deslocamento, montagem e hotel: um campo por vez, sem mexer nos outros.
    const daAna = { eventoId, convocacaoId: ana.convocacaoId };
    await escalas.atualizarConvocacao({ ...daAna, mudanca: { campo: "deslocamento", deslocamento: "ONIBUS" } }, quem());
    await escalas.atualizarConvocacao({ ...daAna, mudanca: { campo: "montagem", montagem: true } }, quem());
    await escalas.atualizarConvocacao({ ...daAna, mudanca: { campo: "hotel", precisaHotel: true } }, quem());
    expect(await um(`select deslocamento, montagem, precisa_hotel from eventos.convocacao where id = $1`, [ana.convocacaoId])).toEqual({
      deslocamento: "ONIBUS",
      montagem: true,
      precisa_hotel: true,
    });
    const historico = await banco.sql(`select dados from eventos.registro_acao where entidade_id = $1 and acao = 'CONVOCACAO_ATUALIZADA' order by criado_em, id`, [ana.convocacaoId]);
    expect(historico.map((linha) => (linha as { dados: unknown }).dados)).toEqual([
      { campos: ["deslocamento"], deslocamento: "ONIBUS" },
      { campos: ["montagem"], montagem: true },
      { campos: ["hotel"], precisaHotel: true },
    ]);
    const naTela = (await escalas.carregarMontagem(eventoId))!.linhas.flatMap((linha) => linha.convocacoes).find((convocacao) => convocacao.id === ana.convocacaoId);
    expect(naTela).toMatchObject({ status: "ACEITA", deslocamento: "ONIBUS", montagem: true, precisaHotel: true, avisada: false, cargoDoEvento: false });
    // A observação saiu da escala e não vai mais para a tela (a coluna continua no banco).
    expect(naTela).not.toHaveProperty("observacao");

    // Segunda função no mesmo evento: Ana, que é Staff, também entra como DJ. A primeira convocação é a principal.
    const naVaga = async (convocacaoId: string) => um(`select principal, deslocamento, precisa_hotel from eventos.convocacao where id = $1`, [convocacaoId]);
    const candidataAoDj = (await escalas.sugerirPessoas(eventoId, dj.id, agora))!;
    expect([...candidataAoDj.sugeridos, ...candidataAoDj.naoPodem].find((candidato) => candidato.pessoaId === pessoas["Ana Perto"])).toMatchObject({ funcoesNoEvento: ["Staff"] });
    const anaDj = await escalas.porNaVaga({ eventoId, escalaId: dj.id, pessoaId: pessoas["Ana Perto"]! }, quem());
    expect(await naVaga(ana.convocacaoId)).toEqual({ principal: true, deslocamento: "ONIBUS", precisa_hotel: true });
    expect(await naVaga(anaDj.convocacaoId)).toEqual({ principal: false, deslocamento: null, precisa_hotel: false });
    await expect(escalas.porNaVaga({ eventoId, escalaId: dj.id, pessoaId: pessoas["Ana Perto"]! }, quem())).rejects.toThrow(/já está/);
    // O deslocamento e o hotel são da pessoa no evento: pedidos pela linha do DJ, gravam na principal e aparecem nas duas linhas.
    await escalas.atualizarConvocacao({ eventoId, convocacaoId: anaDj.convocacaoId, mudanca: { campo: "deslocamento", deslocamento: "CARONA" } }, quem());
    await escalas.atualizarConvocacao({ eventoId, convocacaoId: anaDj.convocacaoId, mudanca: { campo: "hotel", precisaHotel: false } }, quem());
    expect(await naVaga(ana.convocacaoId)).toEqual({ principal: true, deslocamento: "CARONA", precisa_hotel: false });
    await escalas.atualizarConvocacao({ eventoId, convocacaoId: anaDj.convocacaoId, mudanca: { campo: "hotel", precisaHotel: true } }, quem());
    expect(await naVaga(ana.convocacaoId)).toEqual({ principal: true, deslocamento: "CARONA", precisa_hotel: true });
    expect(await naVaga(anaDj.convocacaoId)).toEqual({ principal: false, deslocamento: null, precisa_hotel: false });
    const linhasDaAna = (await escalas.carregarMontagem(eventoId))!.linhas.flatMap((linha) => linha.convocacoes).filter((convocacao) => convocacao.pessoaId === pessoas["Ana Perto"]);
    expect(
      linhasDaAna
        .map(({ id, principal, outrasFuncoes, deslocamento, precisaHotel }) => ({ id, principal, outrasFuncoes, deslocamento, precisaHotel }))
        .sort((a, b) => Number(b.principal) - Number(a.principal)),
    ).toEqual([
      { id: ana.convocacaoId, principal: true, outrasFuncoes: ["DJ"], deslocamento: "CARONA", precisaHotel: true },
      { id: anaDj.convocacaoId, principal: false, outrasFuncoes: ["Staff"], deslocamento: "CARONA", precisaHotel: true },
    ]);
    // Com a pessoa já num quarto, desmarcar o hotel é recusado (por qualquer uma das linhas dela) e nada muda.
    const { id: hotelId } = await um(`insert into eventos.local (nome, tipo, cidade, uf) values ('Hotel da Ana', 'HOTEL', 'Porto Alegre', 'RS') returning id`);
    const { id: hospedagemId } = await um(`insert into eventos.hospedagem (evento_id, local_id, check_in, check_out) values ($1, $2, '2026-11-11', '2026-11-16') returning id`, [eventoId, hotelId]);
    const { id: quartoId } = await um(`insert into eventos.quarto (hospedagem_id, nome, capacidade) values ($1, 'Quarto 1', 2) returning id`, [hospedagemId]);
    await banco.sql(`insert into eventos.quarto_ocupante (quarto_id, evento_id, pessoa_id, convocacao_id) select q.id, h.evento_id, c.pessoa_id, c.id from eventos.quarto q join eventos.hospedagem h on h.id = q.hospedagem_id, eventos.convocacao c where q.id = $1 and c.id = $2`, [quartoId, ana.convocacaoId]);
    for (const convocacaoId of [ana.convocacaoId, anaDj.convocacaoId]) {
      const recusa = escalas.atualizarConvocacao({ eventoId, convocacaoId, mudanca: { campo: "hotel", precisaHotel: false } }, quem());
      await expect(recusa).rejects.toBeInstanceOf(RegraDeNegocioError);
      await expect(recusa).rejects.toThrow(/já está num quarto/);
    }
    expect(await naVaga(ana.convocacaoId)).toMatchObject({ precisa_hotel: true });
    // Com outra origem do hotel (acrescentada na Hospedagem ou "também precisa de hotel" no voo), desmarcar na escala
    // passa: a pessoa continua na lista e no quarto por essa origem.
    await banco.sql(`insert into eventos.hospedagem_pessoa (evento_id, pessoa_id) values ($1, $2)`, [eventoId, pessoas["Ana Perto"]]);
    await escalas.atualizarConvocacao({ eventoId, convocacaoId: ana.convocacaoId, mudanca: { campo: "hotel", precisaHotel: false } }, quem());
    expect(await naVaga(ana.convocacaoId)).toMatchObject({ precisa_hotel: false });
    expect(await banco.sql(`select 1 as ok from eventos.quarto_ocupante where quarto_id = $1 and pessoa_id = $2`, [quartoId, pessoas["Ana Perto"]])).toEqual([{ ok: 1 }]);
    await escalas.atualizarConvocacao({ eventoId, convocacaoId: ana.convocacaoId, mudanca: { campo: "hotel", precisaHotel: true } }, quem());
    await banco.sql(`delete from eventos.hospedagem_pessoa where evento_id = $1 and pessoa_id = $2`, [eventoId, pessoas["Ana Perto"]]);
    // Ana sai de Staff e continua DJ: o DJ herda a principal, com o deslocamento, o hotel, o quarto e a solicitação de custo.
    await escalas.tirarDaVaga({ eventoId, convocacaoId: ana.convocacaoId }, quem());
    expect(await naVaga(anaDj.convocacaoId)).toEqual({ principal: true, deslocamento: "CARONA", precisa_hotel: true });
    expect(await banco.sql(`select convocacao_id from eventos.quarto_ocupante where quarto_id = $1`, [quartoId])).toEqual([{ convocacao_id: anaDj.convocacaoId }]);
    expect(await um(`select dados from eventos.registro_acao where entidade_id = $1 and dados->'campos' ? 'principal'`, [anaDj.convocacaoId])).toEqual({
      dados: { campos: ["principal"], herdouDe: ana.convocacaoId },
    });
    // Ana sai da escala de vez, com a escala como única origem do hotel: ninguém é arrancado do quarto. Ela continua
    // nele, sem vínculo com a escala, e passa a constar como acrescentada na Hospedagem (com registro).
    await expect(escalas.tirarDaVaga({ eventoId, convocacaoId: anaDj.convocacaoId }, quem())).resolves.toMatchObject({ nome: "Ana Perto", mantidaNoQuarto: true });
    expect(await banco.sql(`select convocacao_id from eventos.quarto_ocupante where quarto_id = $1 and pessoa_id = $2`, [quartoId, pessoas["Ana Perto"]])).toEqual([{ convocacao_id: null }]);
    expect(await banco.sql(`select criado_por from eventos.hospedagem_pessoa where evento_id = $1 and pessoa_id = $2`, [eventoId, pessoas["Ana Perto"]])).toHaveLength(1);
    expect(
      await um(`select acao, dados->>'motivo' as motivo from eventos.registro_acao where entidade = 'EVENTO' and entidade_id = $1 and em_nome_de_pessoa_id = $2`, [eventoId, pessoas["Ana Perto"]]),
    ).toEqual({ acao: "HOSPEDE_MANTIDO_NO_QUARTO", motivo: "SAIU_DA_ESCALA" });
    // Volta ao cenário dos próximos testes: Ana só como Staff, sem hospedagem.
    await banco.sql(`delete from eventos.quarto_ocupante where quarto_id = $1`, [quartoId]);
    await banco.sql(`delete from eventos.hospedagem_pessoa where evento_id = $1`, [eventoId]);
    await banco.sql(`delete from eventos.quarto where id = $1`, [quartoId]);
    await banco.sql(`delete from eventos.hospedagem where id = $1`, [hospedagemId]);
    await escalas.porNaVaga({ eventoId, escalaId: staff.id, pessoaId: pessoas["Ana Perto"]!, sugestaoScore: 90 }, quem());

    await escalas.tirarDaVaga({ eventoId, convocacaoId: bia.convocacaoId }, quem());
    expect(await banco.sql(`select 1 from eventos.convocacao where id = $1`, [bia.convocacaoId])).toEqual([]);
    await escalas.porNaVaga({ eventoId, escalaId: staff.id, pessoaId: pessoas["Bia Longe"]! }, quem());
  });

  it("tirar da escala: quem nunca foi avisada some; quem já recebeu copy fica como removida e pode voltar", async () => {
    const staff = await linhaDa("STAFF");
    const daBia = async () =>
      (await banco.sql(`select id, status, convidada_em is not null as com_data from eventos.convocacao where escala_id = $1 and pessoa_id = $2`, [staff.id, pessoas["Bia Longe"]])) as {
        id: string;
        status: string;
        com_data: boolean;
      }[];
    const [bia] = await daBia();
    expect(bia).toMatchObject({ status: "ACEITA", com_data: false });

    // Nunca avisada: a linha some.
    await expect(escalas.tirarDaVaga({ eventoId, convocacaoId: bia!.id }, quem())).resolves.toMatchObject({ nome: "Bia Longe", jaAvisada: false, mantidaNoQuarto: false });
    expect(await daBia()).toEqual([]);

    // Recebeu a copy de escalação (a Comunicação grava a mensagem e a data do aviso): fica CANCELADA, com o histórico.
    const { convocacaoId } = await escalas.porNaVaga({ eventoId, escalaId: staff.id, pessoaId: pessoas["Bia Longe"]! }, quem());
    const { id: modeloId } = await um(`select id from eventos.modelo_copy where tipo = 'ESCALACAO' and ativo`);
    await banco.sql(
      `insert into eventos.mensagem (convocacao_id, modelo_id, texto, dados_hash, canal, status, enviada_em) values ($1, $2, 'copy', repeat('a', 64), 'COPIADO', 'ENVIADA', now())`,
      [convocacaoId, modeloId],
    );
    const naTela = async () => (await escalas.carregarMontagem(eventoId))!.linhas.flatMap((linha) => linha.convocacoes).find((convocacao) => convocacao.id === convocacaoId);
    expect(await naTela()).toMatchObject({ status: "ACEITA", avisada: true });
    await expect(escalas.tirarDaVaga({ eventoId, convocacaoId }, quem())).resolves.toMatchObject({ nome: "Bia Longe", jaAvisada: true, mantidaNoQuarto: false });
    expect(await daBia()).toEqual([{ id: convocacaoId, status: "CANCELADA", com_data: false }]);
    expect(await banco.sql(`select 1 as tem from eventos.mensagem where convocacao_id = $1`, [convocacaoId])).toEqual([{ tem: 1 }]);
    expect(await um(`select status_de, status_para from eventos.registro_acao where entidade_id = $1 and acao = 'CANCELADA'`, [convocacaoId])).toEqual({
      status_de: "ACEITA",
      status_para: "CANCELADA",
    });
    await expect(escalas.tirarDaVaga({ eventoId, convocacaoId }, quem())).rejects.toThrow(/já não ocupa a vaga/);
    // Removida não muda hotel nem deslocamento.
    await expect(escalas.atualizarConvocacao({ eventoId, convocacaoId, mudanca: { campo: "hotel", precisaHotel: true } }, quem())).rejects.toThrow(/não está mais nesta escala/);

    // Volta para a mesma linha, de novo confirmada.
    await expect(escalas.porNaVaga({ eventoId, escalaId: staff.id, pessoaId: pessoas["Bia Longe"]! }, quem())).resolves.toMatchObject({ convocacaoId });
    expect(await daBia()).toEqual([{ id: convocacaoId, status: "ACEITA", com_data: false }]);
    // A mensagem enviada continua lá, então ela segue contando como avisada.
    expect(await naTela()).toMatchObject({ status: "ACEITA", avisada: true });
  });

  it("envia, a líder devolve com comentário, reenvia e aprova; travada enquanto está com a líder", async () => {
    await escalas.enviarParaAprovacao({ eventoId, statusEsperado: "RASCUNHO" }, quem());
    expect((await statusDaEscala()).status_escala).toBe("AGUARDANDO_APROVACAO");
    await expect(escalas.enviarParaAprovacao({ eventoId, statusEsperado: "RASCUNHO" }, quem())).rejects.toBeInstanceOf(ConflitoDeVersaoError);
    await expect(escalas.alterarVagas({ eventoId, escalaId: (await linhaDa("DJ")).id, quantidade: 2 }, quem())).rejects.toThrow(/com a líder/);

    const fila = await escalas.carregarFilaDeAprovacao();
    expect(fila.map((item) => item.id)).toEqual([eventoId]);
    expect(fila[0]!.pontosDeAtencao.map((ponto) => ponto.texto)).toContain("9 vagas abertas em Líder");

    await escalas.devolverEscala({ eventoId, comentario: "Faltam líderes." }, quem());
    expect((await statusDaEscala()).status_escala).toBe("DEVOLVIDA");
    expect((await escalas.carregarMontagem(eventoId))!.ultimaDevolucao?.comentario).toBe("Faltam líderes.");

    await escalas.enviarParaAprovacao({ eventoId, statusEsperado: "DEVOLVIDA" }, quem());
    await escalas.aprovarEscala({ eventoId }, quem());
    const aprovada = await statusDaEscala();
    expect(aprovada.status_escala).toBe("APROVADA");
    expect(aprovada.aprovado_por).toBe(usuarioId);
    expect(aprovada.aprovado_em).not.toBeNull();
    await expect(escalas.aprovarEscala({ eventoId }, quem())).rejects.toBeInstanceOf(RegraDeNegocioError);

    const historico = await banco.sql(
      `select acao, status_de, status_para, comentario, usuario_id = $2 as do_usuario from eventos.registro_acao
        where entidade = 'ESCALA_DO_EVENTO' and entidade_id = $1 order by criado_em, id`,
      [eventoId, usuarioId],
    );
    expect(historico).toEqual([
      { acao: "ENVIADA_APROVACAO", status_de: "RASCUNHO", status_para: "AGUARDANDO_APROVACAO", comentario: null, do_usuario: true },
      { acao: "DEVOLVIDA", status_de: "AGUARDANDO_APROVACAO", status_para: "DEVOLVIDA", comentario: "Faltam líderes.", do_usuario: true },
      { acao: "ENVIADA_APROVACAO", status_de: "DEVOLVIDA", status_para: "AGUARDANDO_APROVACAO", comentario: null, do_usuario: true },
      { acao: "APROVADA", status_de: "AGUARDANDO_APROVACAO", status_para: "APROVADA", comentario: null, do_usuario: true },
    ]);
  });

  it("resposta em nome do staff (fluxo sem tela desde a 0013): quem está na escala já está confirmada; mudança exige reabrir", async () => {
    const ana = (await um(`select id from eventos.convocacao where pessoa_id = $1 and status = 'ACEITA'`, [pessoas["Ana Perto"]])).id as string;
    await expect(escalas.registrarRespostaDoStaff({ eventoId, convocacaoId: ana, resposta: "ACEITA" }, quem())).rejects.toThrow(/já está registrada assim/);

    await escalas.registrarRespostaDoStaff({ eventoId, convocacaoId: ana, resposta: "RECUSADA", motivoRecusa: "Viagem" }, quem());
    expect(await um(`select status, motivo_recusa, registrado_por, respondida_em is not null as respondida from eventos.convocacao where id = $1`, [ana])).toEqual({
      status: "RECUSADA",
      motivo_recusa: "Viagem",
      registrado_por: usuarioId,
      respondida: true,
    });
    expect(
      await um(
        `select acao, status_de, status_para, em_nome_de_pessoa_id, comentario, dados from eventos.registro_acao where entidade = 'CONVOCACAO' and entidade_id = $1 and acao = 'RESPOSTA_REGISTRADA'`,
        [ana],
      ),
    ).toEqual({
      acao: "RESPOSTA_REGISTRADA",
      status_de: "ACEITA",
      status_para: "RECUSADA",
      em_nome_de_pessoa_id: pessoas["Ana Perto"],
      // O motivo ("Viagem") fica só na convocação.
      comentario: null,
      dados: { temMotivoRecusa: true },
    });

    await expect(escalas.porNaVaga({ eventoId, escalaId: (await linhaDa("STAFF")).id, pessoaId: pessoas["Caio Sem Funcao"]! }, quem())).rejects.toThrow(
      /Reabra a escala/,
    );
    await escalas.reabrirEscala({ eventoId, statusEsperado: "APROVADA", motivo: "Trocar a Ana" }, quem());
    expect(await statusDaEscala()).toMatchObject({ status_escala: "RASCUNHO", aprovado_por: null, aprovado_em: null });
    await escalas.porNaVaga({ eventoId, escalaId: (await linhaDa("STAFF")).id, pessoaId: pessoas["Caio Sem Funcao"]! }, quem());
  });

  it("lista, fila e Início", async () => {
    const lista = await escalas.listarEscalas({ situacao: "a-montar" }, agora);
    expect(lista.eventos.map((evento) => evento.id)).toContain(eventoId);
    expect(lista.contagem["a-montar"]).toBeGreaterThanOrEqual(1);

    const itens = await escalas.resumoParaInicio(agora);
    // "Pessoas sem resposta" saiu do Início: quem está na escala já conta como confirmada.
    expect(itens.map((item) => item.chave)).toEqual(["escalas-a-montar", "escalas-a-montar-masterclass", "escalas-aguardando-aprovacao", "escalas-situacao"]);
    // Um cartão só para a aprovação: não aprovadas, aguardando e aprovadas; "aguardando" à parte só alimenta o número do topo.
    expect(itens[2]).toMatchObject({ semCartao: true });
    expect(itens[3]!.exemplos.map((exemplo) => exemplo.rotulo.replace(/ \(.*$/, ""))).toEqual(["Não aprovadas", "Aguardando aprovação", "Aprovadas"]);
    expect(itens[0]!.exemplos[0]!.href).toBe(`/eventos/${eventoId}/escala`);
  });

  it("cartão Escalas a montar: só quem começa em 30 dias e não foi aprovado, com início, término, local e vagas", async () => {
    const longe = await novoEvento("Conf longe", "2026-12-20T03:00:00Z", "2026-12-22T02:59:59Z");
    const { eventos: aMontar, masterclasses } = await escalas.escalasAMontar(agora);
    expect(masterclasses.every((evento) => evento.tipoSigla === "MC")).toBe(true);
    expect(aMontar.map((evento) => evento.id)).toContain(eventoId);
    expect(aMontar.map((evento) => evento.id)).not.toContain(longe);
    const doTeste = aMontar.find((evento) => evento.id === eventoId)!;
    expect(doTeste).toMatchObject({
      codigo: "CONF_TESTE",
      dataInicio: "2026-11-12",
      dataFim: "2026-11-14",
      statusEscala: "RASCUNHO",
      local: { nome: "Centro de Eventos", cidade: "Porto Alegre", uf: "RS" },
    });
    expect(doTeste.vagas).toBeGreaterThan(0);
    expect(doTeste.preenchidas).toBeGreaterThanOrEqual(1);
    expect(doTeste.preenchidas).toBeLessThanOrEqual(doTeste.vagas);

    // Aprovada sai do cartão.
    await banco.sql(`update eventos.evento set status_escala = 'APROVADA', aprovado_em = now() where id = $1`, [eventoId]);
    expect((await escalas.escalasAMontar(agora)).eventos.map((evento) => evento.id)).not.toContain(eventoId);
    await banco.sql(`update eventos.evento set status_escala = 'RASCUNHO', aprovado_em = null where id = $1`, [eventoId]);
  });

  it("Masterclass não passa por aprovação: quem monta conclui e a escala já fica aprovada", async () => {
    const tipoMasterclass = (await um(`select id from eventos.tipo_evento where sigla = 'MC'`)).id as string;
    const masterclassId = (await um(
      `insert into eventos.evento (nome, codigo, inicio, fim, status, tipo_evento_id) values ('Masterclass · Teste', 'MC_TESTE', '2026-11-20T22:00:00Z', '2026-11-21T01:00:00Z', 'PLANEJADO', $1) returning id`,
      [tipoMasterclass],
    )).id as string;
    const staff = (await escalas.carregarMontagem(masterclassId))!.funcoes.find((funcao) => funcao.codigo === "STAFF")!;
    // Sem o campo "Dia": a função acrescentada vale para o evento inteiro.
    await escalas.adicionarVagaManual({ eventoId: masterclassId, funcaoId: staff.id, quantidade: 1 }, quem());
    await expect(escalas.adicionarVagaManual({ eventoId: masterclassId, funcaoId: staff.id, quantidade: 2 }, quem())).rejects.toThrow(/já está na escala/);

    await expect(escalas.enviarParaAprovacao({ eventoId: masterclassId, statusEsperado: "RASCUNHO" }, quem())).resolves.toMatchObject({ semAprovacao: true });
    expect(await um(`select status_escala, aprovado_em is not null as concluida from eventos.evento where id = $1`, [masterclassId])).toEqual({ status_escala: "APROVADA", concluida: true });
    expect(
      await banco.sql(`select acao, status_para from eventos.registro_acao where entidade = 'ESCALA_DO_EVENTO' and entidade_id = $1 order by criado_em, id`, [masterclassId]),
    ).toEqual([{ acao: "CONCLUIDA", status_para: "APROVADA" }]);
    // Não entra na fila da líder; reabrir funciona como em qualquer escala aprovada.
    expect((await escalas.carregarFilaDeAprovacao()).map((evento) => evento.id)).not.toContain(masterclassId);
    await escalas.reabrirEscala({ eventoId: masterclassId, statusEsperado: "APROVADA" }, quem());
    expect(await um(`select status_escala from eventos.evento where id = $1`, [masterclassId])).toEqual({ status_escala: "RASCUNHO" });
  });
});
