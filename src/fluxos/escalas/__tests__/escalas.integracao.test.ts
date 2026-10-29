import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

import { ConflitoDeVersaoError, RegraDeNegocioError } from "@/fluxos/_base";
import { lerRegraGuiada } from "@/modules/escala";
import { type BancoDeTeste, criarBancoDeTeste, TEST_DATABASE_URL } from "@/test/banco";

import { carregarResumoDoEvento, salvarDadosDoEvento } from "../../eventos";
import * as escalas from "..";

const estado = vi.hoisted(() => ({ banco: null as BancoDeTeste | null }));

// Os fluxos abrem a transação por @/fluxos/_base; aqui ela vai para o banco descartável do teste.
vi.mock("@/fluxos/_base", async (original) => {
  const base = await original<typeof import("@/fluxos/_base")>();
  return {
    ...base,
    transacao: <T>(trabalho: Parameters<typeof base.transacao<T>>[0]) => estado.banco!.db.transaction(trabalho),
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
  const quem = () => ({ usuarioId, agora });

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

    await expect(salvarDadosDoEvento({ eventoId, expectativaPublico: 180, pessoasNaFila: 90, atualizadoEm: resumo.evento.atualizadoEm }, quem())).resolves.toEqual({
      vagas: "GERADA",
    });
    await expect(
      salvarDadosDoEvento({ eventoId, expectativaPublico: 200, pessoasNaFila: 90, atualizadoEm: resumo.evento.atualizadoEm }, quem()),
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

  it("põe e tira pessoas: vaga esgotada, repetida e tirar quem não foi avisado apaga a linha", async () => {
    const staff = await linhaDa("STAFF");
    const ana = await escalas.porNaVaga({ eventoId, escalaId: staff.id, pessoaId: pessoas["Ana Perto"]!, sugestaoScore: 90 }, quem());
    await expect(escalas.porNaVaga({ eventoId, escalaId: staff.id, pessoaId: pessoas["Ana Perto"]! }, quem())).rejects.toThrow(/já está/);
    const bia = await escalas.porNaVaga({ eventoId, escalaId: staff.id, pessoaId: pessoas["Bia Longe"]! }, quem());
    await expect(escalas.porNaVaga({ eventoId, escalaId: staff.id, pessoaId: pessoas["Caio Sem Funcao"]! }, quem())).rejects.toThrow(/já estão preenchidas/);

    const dj = await linhaDa("DJ");
    await expect(escalas.porNaVaga({ eventoId, escalaId: dj.id, pessoaId: pessoas["Ana Perto"]! }, quem())).rejects.toThrow(/outra função/);

    expect(await um(`select status, criado_por, sugestao_score from eventos.convocacao where id = $1`, [ana.convocacaoId])).toEqual({
      status: "SUGERIDA",
      criado_por: usuarioId,
      sugestao_score: "90.00",
    });
    await escalas.tirarDaVaga({ eventoId, convocacaoId: bia.convocacaoId }, quem());
    expect(await banco.sql(`select 1 from eventos.convocacao where id = $1`, [bia.convocacaoId])).toEqual([]);
    await escalas.porNaVaga({ eventoId, escalaId: staff.id, pessoaId: pessoas["Bia Longe"]! }, quem());
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

  it("registra a resposta em nome do staff só depois do convite; mudança exige reabrir", async () => {
    const ana = (await um(`select id from eventos.convocacao where pessoa_id = $1 and status = 'SUGERIDA'`, [pessoas["Ana Perto"]])).id as string;
    await expect(escalas.registrarRespostaDoStaff({ eventoId, convocacaoId: ana, resposta: "ACEITA" }, quem())).rejects.toThrow(/ainda não recebeu a copy/);

    await banco.sql(`update eventos.convocacao set status = 'CONVIDADA', convidada_em = now() where id = $1`, [ana]);
    await escalas.registrarRespostaDoStaff({ eventoId, convocacaoId: ana, resposta: "RECUSADA", motivoRecusa: "Viagem" }, quem());
    expect(await um(`select status, motivo_recusa, registrado_por, respondida_em is not null as respondida from eventos.convocacao where id = $1`, [ana])).toEqual({
      status: "RECUSADA",
      motivo_recusa: "Viagem",
      registrado_por: usuarioId,
      respondida: true,
    });
    expect(
      await um(`select acao, status_de, status_para, em_nome_de_pessoa_id from eventos.registro_acao where entidade = 'CONVOCACAO' and entidade_id = $1`, [ana]),
    ).toEqual({ acao: "RESPOSTA_REGISTRADA", status_de: "CONVIDADA", status_para: "RECUSADA", em_nome_de_pessoa_id: pessoas["Ana Perto"] });

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
    expect(itens.map((item) => item.chave)).toEqual(["escalas-a-montar", "escalas-aguardando-aprovacao", "escalas-devolvidas", "escalas-sem-resposta"]);
    expect(itens[0]!.exemplos[0]!.href).toBe(`/eventos/${eventoId}/escala`);
  });
});
