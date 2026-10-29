import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { type BancoDeTeste, criarBancoDeTeste, TEST_DATABASE_URL } from "@/test/banco";

import { ConvocacaoInativaError } from "../../domain/convite";
import { concluirComunicacao, registrarConvite } from "../../service/convite";
import { criarRepositorioConvite } from "../convite-repository";

describe.skipIf(!TEST_DATABASE_URL)("convite e comunicação da escala no banco", () => {
  let banco: BancoDeTeste;
  let usuarioId: string;
  let modeloEscalacao: string;
  let modeloHospedagem: string;
  const instante = new Date("2026-11-05T12:00:00Z");

  const um = async (texto: string, params: unknown[] = []) => ((await banco.sql(texto, params)) as Record<string, string>[])[0]!;

  async function eventoAprovado(): Promise<{ eventoId: string; escalaId: string }> {
    const { id: eventoId } = await um(
      `insert into eventos.evento (nome, inicio, fim, status, status_escala, aprovado_em)
       values ('Confronto · ed. 60', now(), now() + interval '2 days', 'PLANEJADO', 'APROVADA', now()) returning id`,
    );
    const { id: escalaId } = await um(
      `insert into eventos.escala (evento_id, data, hora_inicio, hora_fim, quantidade_vagas, status)
       values ($1, current_date, '08:00', '18:00', 5, 'ABERTA') returning id`,
      [eventoId],
    );
    return { eventoId: eventoId!, escalaId: escalaId! };
  }

  async function convocar(escalaId: string, status: string): Promise<string> {
    const { id: pessoaId } = await um(`insert into core.pessoa (nome_completo) values ('Staff de teste') returning id`);
    return (await um(`insert into eventos.convocacao (escala_id, pessoa_id, status) values ($1, $2, $3) returning id`, [escalaId, pessoaId, status])).id!;
  }

  async function enviar(convocacaoId: string, modeloId: string, status = "ENVIADA") {
    await banco.sql(
      `insert into eventos.mensagem (convocacao_id, modelo_id, texto, dados_hash, canal, status, enviada_em)
       values ($1, $2, 'copy', repeat('a', 64), 'COPIADO', $3, now())`,
      [convocacaoId, modeloId, status],
    );
  }

  const comRepositorio = <T>(trabalho: (repo: ReturnType<typeof criarRepositorioConvite>) => Promise<T>) =>
    banco.db.transaction((tx) => trabalho(criarRepositorioConvite(tx)));

  beforeAll(async () => {
    banco = await criarBancoDeTeste();
    usuarioId = (await um(`insert into core.usuario (email) values ('time@exemplo.test') returning id`)).id!;
    // Um modelo ativo por tipo (modelo_copy_ativo_unique): reaproveita o da migration ou cria se faltar.
    const modeloAtivo = async (tipo: string) =>
      (
        (await banco.sql(`select id from eventos.modelo_copy where tipo = $1 and ativo`, [tipo])) as { id: string }[]
      )[0]?.id ?? (await um(`insert into eventos.modelo_copy (tipo, nome, corpo) values ($1, $1, 'Oi') returning id`, [tipo])).id!;
    modeloEscalacao = await modeloAtivo("ESCALACAO");
    modeloHospedagem = await modeloAtivo("HOSPEDAGEM");
  }, 60_000);

  afterAll(async () => {
    await banco?.encerrar();
  });

  it("registrarConvite: SUGERIDA vira CONVIDADA uma vez; inativa é recusada", async () => {
    const { escalaId } = await eventoAprovado();
    const sugerida = await convocar(escalaId, "SUGERIDA");
    const cancelada = await convocar(escalaId, "CANCELADA");

    await expect(comRepositorio((repo) => registrarConvite(repo, { convocacaoId: sugerida, instante }))).resolves.toBe("CONVIDADA");
    const depois = await um(`select status, convidada_em from eventos.convocacao where id = $1`, [sugerida]);
    expect(depois.status).toBe("CONVIDADA");
    expect(new Date(depois.convidada_em!).toISOString()).toBe(instante.toISOString());

    const outroInstante = new Date("2026-11-06T12:00:00Z");
    await expect(comRepositorio((repo) => registrarConvite(repo, { convocacaoId: sugerida, instante: outroInstante }))).resolves.toBe("SEM_MUDANCA");
    expect(new Date((await um(`select convidada_em from eventos.convocacao where id = $1`, [sugerida])).convidada_em!).toISOString()).toBe(
      instante.toISOString(),
    );

    await expect(comRepositorio((repo) => registrarConvite(repo, { convocacaoId: cancelada, instante }))).rejects.toBeInstanceOf(ConvocacaoInativaError);
  });

  it("registrarConvite desfaz junto com a transação do fluxo", async () => {
    const { escalaId } = await eventoAprovado();
    const sugerida = await convocar(escalaId, "SUGERIDA");
    await expect(
      comRepositorio(async (repo) => {
        await registrarConvite(repo, { convocacaoId: sugerida, instante });
        throw new Error("falhou depois");
      }),
    ).rejects.toThrow("falhou depois");
    expect((await um(`select status from eventos.convocacao where id = $1`, [sugerida])).status).toBe("SUGERIDA");
  });

  it("concluirComunicacao: comunica só quando toda convocação ativa tem a copy de escalação enviada", async () => {
    const { eventoId, escalaId } = await eventoAprovado();
    const convidada = await convocar(escalaId, "CONVIDADA");
    const aceita = await convocar(escalaId, "ACEITA");
    await convocar(escalaId, "RECUSADA");
    await enviar(convidada, modeloEscalacao);
    // Copy de hospedagem e copy de escalação superada não contam.
    await enviar(aceita, modeloHospedagem);
    await enviar(aceita, modeloEscalacao, "DESATUALIZADA");

    // Linha de vaga apagada não segura a comunicação.
    const { id: linhaApagada } = await um(
      `insert into eventos.escala (evento_id, data, hora_inicio, hora_fim, quantidade_vagas, status, deleted_at)
       values ($1, current_date, '08:00', '18:00', 1, 'ABERTA', now()) returning id`,
      [eventoId],
    );
    await convocar(linhaApagada!, "SUGERIDA");

    const pedido = { eventoId, usuarioId, instante };
    await expect(comRepositorio((repo) => concluirComunicacao(repo, pedido))).resolves.toBe("SEM_MUDANCA");
    expect((await um(`select status_escala from eventos.evento where id = $1`, [eventoId])).status_escala).toBe("APROVADA");

    await enviar(aceita, modeloEscalacao);
    await expect(comRepositorio((repo) => concluirComunicacao(repo, pedido))).resolves.toBe("COMUNICADA");
    expect(await um(`select status_escala, aprovado_em is not null as aprovada from eventos.evento where id = $1`, [eventoId])).toEqual({
      status_escala: "COMUNICADA",
      aprovada: true,
    });

    await expect(comRepositorio((repo) => concluirComunicacao(repo, pedido))).resolves.toBe("SEM_MUDANCA");
    const registros = await banco.sql(
      `select acao, status_de, status_para, usuario_id, dados from eventos.registro_acao where entidade = 'ESCALA_DO_EVENTO' and entidade_id = $1`,
      [eventoId],
    );
    expect(registros).toEqual([
      { acao: "COMUNICADA", status_de: "APROVADA", status_para: "COMUNICADA", usuario_id: usuarioId, dados: { convocacoesAtivas: 2 } },
    ]);
  });

  it("concluirComunicacao não mexe em escala fora de APROVADA nem sem equipe", async () => {
    const { eventoId, escalaId } = await eventoAprovado();
    await expect(comRepositorio((repo) => concluirComunicacao(repo, { eventoId, usuarioId, instante }))).resolves.toBe("SEM_MUDANCA");

    const convidada = await convocar(escalaId, "CONVIDADA");
    await enviar(convidada, modeloEscalacao);
    await banco.sql(`update eventos.evento set status_escala = 'RASCUNHO', aprovado_em = null where id = $1`, [eventoId]);
    await expect(comRepositorio((repo) => concluirComunicacao(repo, { eventoId, usuarioId, instante }))).resolves.toBe("SEM_MUDANCA");
    expect((await um(`select status_escala from eventos.evento where id = $1`, [eventoId])).status_escala).toBe("RASCUNHO");
  });
});
