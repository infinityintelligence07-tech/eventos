import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

import type * as Base from "@/fluxos/_base";
import { RegraDeNegocioError } from "@/fluxos/_base";
import { idDaConfiguracao } from "@/modules/comunicacao";
import { type BancoDeTeste, criarBancoDeTeste, TEST_DATABASE_URL } from "@/test/banco";

import {
  carregarComunicacaoDoEvento,
  carregarEditorDeModelo,
  definirModeloAtivo,
  listarComunicacao,
  listarModelos,
  previaDoModelo,
  registrarEnvioDaCopy,
  resumoParaInicio,
  salvarLinkDeCustos,
  salvarModelo,
} from "..";

// A guarda de escrita tem testes próprios (src/fluxos/_base); aqui o fluxo roda direto no banco descartável.
const teste = vi.hoisted(() => ({ banco: null as BancoDeTeste | null }));
vi.mock("@/fluxos/_base", async (importOriginal) => {
  const real = await importOriginal<typeof Base>();
  return {
    ...real,
    bancoParaLeitura: async () => teste.banco!.db,
    situacaoDaEscrita: async () => ({ liberada: true }),
    // A transação real (limite e "sem registro, desfaz"), no banco de teste.
    transacao: async (_ator: unknown, trabalho: (tx: never) => Promise<unknown>) => (await import("@/fluxos/_base/banco")).transacaoNoBanco(teste.banco!.db, trabalho as never),
  };
});

const ESCALACAO = `Uaaaau que top você está {{genero:ESCALADO|ESCALADA}}
📍 {{evento.cidade}}
📅 {{evento.data}}
🕐 {{evento.horario}}
👉 {{link_custos}}`;

describe.skipIf(!TEST_DATABASE_URL)("fluxos da Comunicação no banco", () => {
  const agora = new Date("2026-11-05T15:00:00Z");
  let usuarioId: string;
  const ator = () => ({ usuarioId, pessoaId: null, origem: "LOCAL" as const });
  let eventoId: string;
  let escalaId: string;
  let modeloEscalacao: string;
  let ana: string;
  let bruno: string;
  let carla: string;
  let recusada: string;

  const banco = () => teste.banco!;
  const um = async (texto: string, params: unknown[] = []) => ((await banco().sql(texto, params)) as Record<string, string>[])[0]!;

  async function convocar(nome: string, sexo: string | null, status = "SUGERIDA", deslocamento: string | null = null): Promise<{ convocacao: string; pessoa: string }> {
    const { id: pessoa } = await um(`insert into core.pessoa (nome_completo, telefone) values ($1, '11999990000') returning id`, [nome]);
    await banco().sql(`insert into eventos.pessoa_evento (pessoa_id, sexo) values ($1, $2)`, [pessoa, sexo]);
    const { id: convocacao } = await um(
      `insert into eventos.convocacao (escala_id, pessoa_id, status, deslocamento) values ($1, $2, $3, $4) returning id`,
      [escalaId, pessoa, status, deslocamento],
    );
    return { convocacao: convocacao!, pessoa: pessoa! };
  }

  const comunicacao = async (tipo: "ESCALACAO" | "HOSPEDAGEM" = "ESCALACAO") => (await carregarComunicacaoDoEvento(eventoId, tipo, agora))!;
  const copyDe = async (convocacaoId: string, tipo: "ESCALACAO" | "HOSPEDAGEM" = "ESCALACAO") =>
    (await comunicacao(tipo)).pessoas.find((pessoa) => pessoa.convocacaoId === convocacaoId)!;
  const enviar = async (convocacaoId: string, tipo: "ESCALACAO" | "HOSPEDAGEM" = "ESCALACAO") => {
    const atual = await comunicacao(tipo);
    const copy = atual.pessoas.find((pessoa) => pessoa.convocacaoId === convocacaoId)!;
    return registrarEnvioDaCopy({ convocacaoId, modeloId: atual.modelo!.id, dadosHash: copy.dadosHash }, ator(), agora);
  };

  beforeAll(async () => {
    teste.banco = await criarBancoDeTeste();
    usuarioId = (await um(`insert into core.usuario (email) values ('time@exemplo.test') returning id`)).id!;
    const { id: tipo } = await um(`select id from eventos.tipo_evento where sigla = 'ASM'`);
    const { id: localId } = await um(`insert into eventos.local (nome, cidade, uf) values ('Centro de Convenções', 'Manaus', 'AM') returning id`);
    eventoId = (
      await um(
        `insert into eventos.evento (nome, codigo, inicio, fim, status, tipo_evento_id, local_id, status_escala, aprovado_em)
         values ('ASM 235', 'ASM_AM_235', '2026-12-12T12:00:00Z', '2026-12-14T22:00:00Z', 'PLANEJADO', $1, $2, 'APROVADA', now()) returning id`,
        [tipo, localId],
      )
    ).id!;
    const { id: funcaoId } = await um(`select id from eventos.funcao where codigo = 'STAFF'`);
    escalaId = (
      await um(
        `insert into eventos.escala (evento_id, data, hora_inicio, hora_fim, quantidade_vagas, status, funcao_id)
         values ($1, '2026-12-12', '07:30', '18:00', 5, 'ABERTA', $2) returning id`,
        [eventoId, funcaoId],
      )
    ).id!;

    const a = await convocar("ANA PAULA SOUZA", "F", "SUGERIDA", "VOO");
    ana = a.convocacao;
    bruno = (await convocar("Bruno Lima", "M")).convocacao;
    carla = (await convocar("Carla Dias", null)).convocacao;
    recusada = (await convocar("Diego Recusou", "M", "RECUSADA")).convocacao;

    // Voo emitido e quarto com a Carla para a Ana.
    const { id: pedido } = await um(
      `insert into eventos.pedido_sdc (tipo, evento_id, pessoa_id, convocacao_id, situacao, emitido_em) values ('VOO', $1, $2, $3, 'EMITIDO', now()) returning id`,
      [eventoId, a.pessoa, ana],
    );
    await banco().sql(
      `insert into eventos.trecho_voo (pedido_id, sentido, origem_iata, destino_iata, data_desejada, companhia, numero_voo, localizador, partida_em, chegada_em)
       values ($1, 'IDA', 'GRU', 'MAO', '2026-12-11', 'AZUL', 'AD4120', 'KXQ7PZ', '2026-12-11T11:10:00Z', '2026-12-11T14:00:00Z')`,
      [pedido],
    );
    const { id: hotel } = await um(
      `insert into eventos.local (nome, tipo, logradouro, numero, bairro, cidade, uf) values ('Hotel Central', 'HOTEL', 'Av. Brasil', '100', 'Centro', 'Manaus', 'AM') returning id`,
    );
    const { id: hospedagemId } = await um(
      `insert into eventos.hospedagem (evento_id, local_id, check_in, check_out) values ($1, $2, '2026-12-11', '2026-12-15') returning id`,
      [eventoId, hotel],
    );
    const { id: quartoId } = await um(`insert into eventos.quarto (hospedagem_id, nome, capacidade, sexo) values ($1, 'Quarto 1', 2, 'F') returning id`, [hospedagemId]);
    await banco().sql(`insert into eventos.quarto_ocupante (quarto_id, convocacao_id) values ($1, $2), ($1, $3)`, [quartoId, ana, carla]);

    await salvarLinkDeCustos("https://exemplo.test/custos", ator(), agora);
    modeloEscalacao = (await um(`select id from eventos.modelo_copy where tipo = 'ESCALACAO'`)).id!;
    await salvarModelo({ modeloId: modeloEscalacao, tipo: "ESCALACAO", nome: "Escalação", corpo: ESCALACAO, ativar: false }, ator(), agora);
  }, 60_000);

  afterAll(async () => {
    await teste.banco?.encerrar();
  });

  it("gera a copy de cada pessoa ativa; quem não tem sexo fica bloqueada e vem primeiro", async () => {
    const tela = await comunicacao();
    expect(tela.escalaComunicavel).toBe(true);
    expect(tela.modelo?.id).toBe(modeloEscalacao);
    expect(tela.tiposDisponiveis).toEqual(["ESCALACAO", "HOSPEDAGEM"]);
    expect(tela.pessoas.map((pessoa) => [pessoa.nome, pessoa.situacao])).toEqual([
      ["Carla Dias", "FALTA_DADO"],
      ["ANA PAULA SOUZA", "PRONTA"],
      ["Bruno Lima", "PRONTA"],
    ]);
    expect(tela.pessoas[0]!.faltando).toEqual([{ variavel: "pessoa.sexo", rotulo: "sexo da pessoa", onde: "PESSOAS" }]);
    expect(tela.pessoas[1]!.texto).toBe(
      "Uaaaau que top você está ESCALADA\n📍 Manaus\n📅 12 a 14 de dezembro\n🕐 7h30\n👉 https://exemplo.test/custos",
    );
    expect(tela.contagem).toEqual({ FALTA_DADO: 1, DESATUALIZADA: 0, PRONTA: 2, ENVIADA: 0 });
  });

  it("recusa copy bloqueada, copy que mudou e convocação recusada", async () => {
    const tela = await comunicacao();
    const daCarla = tela.pessoas.find((pessoa) => pessoa.convocacaoId === carla)!;
    await expect(registrarEnvioDaCopy({ convocacaoId: carla, modeloId: modeloEscalacao, dadosHash: daCarla.dadosHash }, ator(), agora)).rejects.toEqual(
      new RegraDeNegocioError("Esta copy está bloqueada: falta sexo da pessoa."),
    );
    await expect(registrarEnvioDaCopy({ convocacaoId: ana, modeloId: modeloEscalacao, dadosHash: "0".repeat(64) }, ator(), agora)).rejects.toEqual(
      new RegraDeNegocioError("A copy mudou desde que você copiou. Copie de novo."),
    );
    await expect(registrarEnvioDaCopy({ convocacaoId: recusada, modeloId: modeloEscalacao, dadosHash: "0".repeat(64) }, ator(), agora)).rejects.toEqual(
      new RegraDeNegocioError("A pessoa não está mais nesta escala. Recarregue a página."),
    );
    expect(await banco().sql(`select 1 from eventos.mensagem`)).toEqual([]);
  });

  it("marcar como enviada grava a mensagem e convida a pessoa; a mesma copy não é marcada duas vezes", async () => {
    await expect(enviar(ana)).resolves.toEqual({ eventoId, nome: "ANA PAULA SOUZA", convidada: true, comunicada: false });

    const mensagens = await banco().sql(
      `select status, canal, enviada_por, dados_hash, enviada_em from eventos.mensagem where convocacao_id = $1`,
      [ana],
    );
    expect(mensagens).toEqual([expect.objectContaining({ status: "ENVIADA", canal: "COPIADO", enviada_por: usuarioId })]);
    expect((await um(`select status from eventos.convocacao where id = $1`, [ana])).status).toBe("CONVIDADA");
    expect(await banco().sql(`select acao, status_para from eventos.registro_acao where entidade = 'MENSAGEM'`)).toEqual([
      { acao: "COPY_ENVIADA", status_para: "ENVIADA" },
    ]);
    expect((await copyDe(ana)).situacao).toBe("ENVIADA");

    const copy = await copyDe(ana);
    await expect(registrarEnvioDaCopy({ convocacaoId: ana, modeloId: modeloEscalacao, dadosHash: copy.dadosHash }, ator(), agora)).rejects.toEqual(
      new RegraDeNegocioError("Esta copy já foi marcada como enviada."),
    );
  });

  it("dado mudou depois do envio: fica desatualizada; o reenvio supera a mensagem anterior", async () => {
    await banco().sql(`update eventos.escala set hora_inicio = '08:00' where id = $1`, [escalaId]);
    expect((await copyDe(ana)).situacao).toBe("DESATUALIZADA");

    await expect(enviar(ana)).resolves.toMatchObject({ convidada: false, comunicada: false });
    expect(await banco().sql(`select status from eventos.mensagem where convocacao_id = $1 order by criado_em, status`, [ana])).toEqual([
      { status: "DESATUALIZADA" },
      { status: "ENVIADA" },
    ]);
    expect((await copyDe(ana)).situacao).toBe("ENVIADA");
  });

  it("a última copy de escalação enviada deixa a escala COMUNICADA", async () => {
    await expect(enviar(bruno)).resolves.toMatchObject({ comunicada: false });
    await banco().sql(`update eventos.pessoa_evento set sexo = 'F' where pessoa_id = (select pessoa_id from eventos.convocacao where id = $1)`, [carla]);
    expect((await copyDe(carla)).situacao).toBe("PRONTA");

    await expect(enviar(carla)).resolves.toEqual({ eventoId, nome: "Carla Dias", convidada: true, comunicada: true });
    expect((await um(`select status_escala from eventos.evento where id = $1`, [eventoId])).status_escala).toBe("COMUNICADA");
    expect(await banco().sql(`select status_de, status_para, usuario_id from eventos.registro_acao where entidade = 'ESCALA_DO_EVENTO'`)).toEqual([
      { status_de: "APROVADA", status_para: "COMUNICADA", usuario_id: usuarioId },
    ]);
    expect((await comunicacao()).contagem).toEqual({ FALTA_DADO: 0, DESATUALIZADA: 0, PRONTA: 0, ENVIADA: 3 });
  });

  it("copy de hospedagem: hotel, colega e voo; enviar não mexe na convocação", async () => {
    await salvarModelo(
      {
        modeloId: (await um(`select id from eventos.modelo_copy where tipo = 'HOSPEDAGEM'`)).id!,
        tipo: "HOSPEDAGEM",
        nome: "Hospedagem",
        corpo: "{{hospedagem.hotel}} ({{hospedagem.endereco}}) com {{hospedagem.colega}}. Ida: {{voo.ida}}",
        ativar: false,
      },
      ator(),
      agora,
    );
    const daAna = await copyDe(ana, "HOSPEDAGEM");
    expect(daAna.texto).toBe("Hotel Central (Av. Brasil, 100 - Centro - Manaus/AM) com Carla. Ida: AD4120 (AZUL) · 11/12 às 08:10 · GRU → MAO · localizador KXQ7PZ");
    expect((await copyDe(bruno, "HOSPEDAGEM")).faltando.map((falta) => falta.rotulo)).toEqual(["colega de quarto", "endereço do hotel", "hotel", "voo de ida"]);

    await expect(enviar(ana, "HOSPEDAGEM")).resolves.toMatchObject({ convidada: false, comunicada: false });
    expect((await copyDe(ana, "HOSPEDAGEM")).situacao).toBe("ENVIADA");
    expect((await copyDe(ana)).situacao).toBe("ENVIADA");
  });

  it("link de custos vazio bloqueia a copy de escalação", async () => {
    await salvarLinkDeCustos(null, ator(), agora);
    expect((await copyDe(bruno)).faltando.map((falta) => falta.variavel)).toEqual(["link_custos"]);
    expect((await listarModelos()).linkCustos).toBeNull();
    await salvarLinkDeCustos("https://exemplo.test/custos", ator(), agora);
    expect((await copyDe(bruno)).situacao).toBe("ENVIADA");
  });

  it("lista entre eventos e resumo para o Início", async () => {
    await banco().sql(`update eventos.escala set hora_inicio = '09:00' where id = $1`, [escalaId]);
    const lista = await listarComunicacao({}, agora);
    expect(lista.semModelo).toBe(false);
    expect(lista.eventos).toEqual([expect.objectContaining({ id: eventoId, codigo: "ASM_AM_235", total: 3, statusEscala: "COMUNICADA" })]);
    expect(lista.totais).toEqual({ FALTA_DADO: 0, DESATUALIZADA: 3, PRONTA: 0, ENVIADA: 0 });
    expect((await listarComunicacao({ situacao: "FALTA_DADO" }, agora)).eventos).toEqual([]);

    const [faltaDado, desatualizadas] = await resumoParaInicio(agora);
    expect(faltaDado).toMatchObject({ chave: "comunicacao-falta-dado", quantidade: 0, exemplos: [] });
    expect(desatualizadas).toMatchObject({ chave: "comunicacao-desatualizadas", quantidade: 3, href: "/comunicacao?situacao=desatualizada" });
    expect(desatualizadas!.exemplos[0]).toEqual({
      rotulo: "ANA PAULA SOUZA · ASM_AM_235",
      detalhe: "dados mudaram depois do envio",
      href: `/eventos/${eventoId}/comunicacao?pessoa=${ana}`,
    });

    expect(await listarComunicacao({}, new Date("2027-01-01T00:00:00Z"))).toMatchObject({ eventos: [] });
  });

  it("escala fora de APROVADA/COMUNICADA: sem copys e envio recusado", async () => {
    await banco().sql(`update eventos.evento set status_escala = 'RASCUNHO', aprovado_em = null where id = $1`, [eventoId]);
    const tela = await comunicacao();
    expect(tela).toMatchObject({ escalaComunicavel: false, pessoas: [] });
    await expect(registrarEnvioDaCopy({ convocacaoId: bruno, modeloId: modeloEscalacao, dadosHash: "0".repeat(64) }, ator(), agora)).rejects.toEqual(
      new RegraDeNegocioError("A escala deste evento não está aprovada. As copys saem depois da aprovação."),
    );
    await banco().sql(`update eventos.evento set status_escala = 'COMUNICADA', aprovado_em = now() where id = $1`, [eventoId]);
  });

  it("modelos: lista, desativa e prévia com pessoa de exemplo", async () => {
    await definirModeloAtivo(modeloEscalacao, false, ator(), agora);
    expect((await listarModelos()).modelos.find((modelo) => modelo.id === modeloEscalacao)).toMatchObject({ ativo: false, emUso: false });
    expect((await comunicacao()).modelo).toBeNull();
    expect((await listarComunicacao({}, agora)).semModelo).toBe(true);
    await definirModeloAtivo(modeloEscalacao, true, ator(), agora);

    const editor = (await carregarEditorDeModelo(modeloEscalacao, agora))!;
    expect(editor.modelo?.corpo).toBe(ESCALACAO);
    expect(editor.exemplos.map((exemplo) => exemplo.nome)).toEqual(["ANA PAULA SOUZA", "Bruno Lima", "Carla Dias"]);
    expect(editor.campos.find((campo) => campo.variavel === "voo.ida")?.rotulo).toBe("voo de ida");
    expect(await carregarEditorDeModelo("01a16511-dd29-71a1-8399-acd55d254fb2", agora)).toBeNull();

    const previa = await previaDoModelo({ corpo: "Oi {{pessoa.primeiro_nome}}, {{voo.volta}} {{pessoa.apelido}}", convocacaoId: ana, eventoId }, agora);
    expect(previa.partes[0]).toEqual({ tipo: "texto", texto: "Oi Ana, " });
    expect(previa.faltando.map((falta) => falta.variavel)).toEqual(["pessoa.apelido", "voo.volta"]);
    expect(previa.erros).toEqual(["O campo {{pessoa.apelido}} não existe. Use os botões de Inserir campo."]);

    const semPessoa = await previaDoModelo({ corpo: "{{saudacao}}: {{link_custos}}" }, agora);
    expect(semPessoa.partes).toEqual([{ tipo: "texto", texto: "Boa tarde: https://exemplo.test/custos" }]);
  });

  describe("um modelo ativo por tipo e histórico", () => {
    const ativos = async (tipo: string) =>
      (await banco().sql(`select id from eventos.modelo_copy where tipo = $1 and ativo`, [tipo])) as { id: string }[];
    const historico = async (entidadeId: string) =>
      banco().sql(`select acao, status_de, status_para, usuario_id from eventos.registro_acao where entidade = 'MODELO_COPY' and entidade_id = $1 order by criado_em, acao`, [
        entidadeId,
      ]);

    it("modelo novo nasce inativo e a Comunicação continua com o anterior", async () => {
      const novo = await salvarModelo({ tipo: "ESCALACAO", nome: "Escalação curta", corpo: "Oi {{pessoa.primeiro_nome}}", ativar: false }, ator(), agora);
      expect(novo.ativo).toBe(false);
      expect(await ativos("ESCALACAO")).toEqual([{ id: modeloEscalacao }]);
      expect(await historico(novo.id)).toEqual([{ acao: "MODELO_CRIADO", status_de: null, status_para: "INATIVO", usuario_id: usuarioId }]);
    });

    it("ativar troca o modelo do tipo na mesma transação e registra os dois lados", async () => {
      const novo = await salvarModelo({ tipo: "ESCALACAO", nome: "Escalação nova", corpo: "Oi {{pessoa.primeiro_nome}}!", ativar: true }, ator(), agora);
      expect(novo.ativo).toBe(true);
      expect(await ativos("ESCALACAO")).toEqual([{ id: novo.id }]);
      expect((await comunicacao()).modelo?.id).toBe(novo.id);
      expect(await historico(modeloEscalacao)).toContainEqual({ acao: "MODELO_DESATIVADO", status_de: "ATIVO", status_para: "INATIVO", usuario_id: usuarioId });
      expect(await historico(novo.id)).toEqual([
        { acao: "MODELO_ATIVADO", status_de: "INATIVO", status_para: "ATIVO", usuario_id: usuarioId },
        { acao: "MODELO_CRIADO", status_de: null, status_para: "INATIVO", usuario_id: usuarioId },
      ]);

      await definirModeloAtivo(modeloEscalacao, true, ator(), agora);
      expect(await ativos("ESCALACAO")).toEqual([{ id: modeloEscalacao }]);
      // Já ativo: nada muda e nada é registrado.
      const antes = (await historico(modeloEscalacao)).length;
      await definirModeloAtivo(modeloEscalacao, true, ator(), agora);
      expect(await historico(modeloEscalacao)).toHaveLength(antes);
    });

    it("o índice recusa dois ativos e duas ativações ao mesmo tempo terminam com um só", async () => {
      await expect(
        banco().sql(`insert into eventos.modelo_copy (tipo, nome, corpo, ativo) values ('ESCALACAO', 'Duplicado', 'Oi', true)`),
      ).rejects.toMatchObject({ code: "23505", constraint: "modelo_copy_ativo_unique" });

      const a = await salvarModelo({ tipo: "LEMBRETE", nome: "Lembrete A", corpo: "Amanhã: {{evento.horario}}", ativar: false }, ator(), agora);
      const b = await salvarModelo({ tipo: "LEMBRETE", nome: "Lembrete B", corpo: "Até amanhã, {{pessoa.primeiro_nome}}", ativar: false }, ator(), agora);
      await Promise.all([definirModeloAtivo(a.id, true, ator(), agora), definirModeloAtivo(b.id, true, ator(), agora)]);
      expect(await ativos("LEMBRETE")).toHaveLength(1);
    });

    it("modelo ativo não troca de tipo; desativar registra", async () => {
      await expect(
        salvarModelo({ modeloId: modeloEscalacao, tipo: "ALTERACAO", nome: "Escalação", corpo: ESCALACAO, ativar: false }, ator(), agora),
      ).rejects.toEqual(new RegraDeNegocioError("Este modelo está em uso na Comunicação. Desative-o antes de trocar o tipo."));

      await definirModeloAtivo(modeloEscalacao, false, ator(), agora);
      expect(await ativos("ESCALACAO")).toEqual([]);
      await definirModeloAtivo(modeloEscalacao, true, ator(), agora);
      await expect(definirModeloAtivo("01a16511-dd29-71a1-8399-acd55d254fb2", true, ator(), agora)).rejects.toEqual(
        new RegraDeNegocioError("Este modelo não existe mais. Recarregue a página."),
      );
    });

    it("alterar o link de custos fica no histórico como CONFIGURACAO", async () => {
      await salvarLinkDeCustos("https://exemplo.test/novo", ator(), agora);
      const registros = await banco().sql(
        `select acao, usuario_id, dados from eventos.registro_acao where entidade = 'CONFIGURACAO' and entidade_id = $1 order by criado_em`,
        [idDaConfiguracao("link_custos")],
      );
      expect(registros.at(-1)).toEqual({
        acao: "CONFIGURACAO_ALTERADA",
        usuario_id: usuarioId,
        dados: { chave: "link_custos", de: "https://exemplo.test/custos", para: "https://exemplo.test/novo" },
      });
      expect(registros.length).toBeGreaterThanOrEqual(4);
    });
  });
});
