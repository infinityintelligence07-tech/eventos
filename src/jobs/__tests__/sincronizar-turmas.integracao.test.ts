import { afterAll, beforeAll, describe, expect, it } from "vitest";

import type { TurmaRecebida } from "@/core/integrations/iam-control";
import { criarRepositorioVagas, HORARIO_PADRAO } from "@/modules/escala";
import { criarRepositorioSincronizacao } from "@/modules/eventos";
import { type BancoDeTeste, criarBancoDeTeste, TEST_DATABASE_URL } from "@/test/banco";
import { turmaDeExemplo } from "@/test/turmas";

import { sincronizarTurmas } from "../sincronizar-turmas";

type Vaga = { funcao: string; quantidade: number; data: string; hora_inicio: string; hora_fim: string; origem: string };

describe.skipIf(!TEST_DATABASE_URL)("sincronização de turmas no Postgres (GH + Eventos)", () => {
  let banco: BancoDeTeste;
  let turmas: TurmaRecebida[] = [];

  const sincronizar = (agora = "2026-10-26T15:00:00Z") =>
    sincronizarTurmas({
      iamControl: { listarTurmas: async () => ({ a_partir_de: "2026-09-26", ate: null, total: turmas.length, turmas }) },
      eventos: criarRepositorioSincronizacao(banco.db),
      vagas: criarRepositorioVagas(banco.db, { origem: "SISTEMA" }),
      agora: new Date(agora),
    });

  const evento = async (turmaId: number) =>
    (
      (await banco.sql(
        `select e.*, t.sigla as tipo, p.codigo as polo, l.nome as local_nome, l.uf as local_uf
           from eventos.evento e
           left join eventos.tipo_evento t on t.id = e.tipo_evento_id
           left join core.polo p on p.id = e.polo_id
           left join eventos.local l on l.id = e.local_id
          where e.iam_control_turma_id = $1`,
        [turmaId],
      )) as Record<string, unknown>[]
    )[0]!;

  const vagas = async (turmaId: number) =>
    (await banco.sql(
      `select f.codigo as funcao, s.quantidade_vagas as quantidade, s.data::text as data,
              s.hora_inicio, s.hora_fim, s.origem
         from eventos.escala s
         join eventos.funcao f on f.id = s.funcao_id
         join eventos.evento e on e.id = s.evento_id
        where e.iam_control_turma_id = $1 and s.deleted_at is null
        order by f.codigo`,
      [turmaId],
    )) as Vaga[];

  const quantidades = async (turmaId: number) =>
    Object.fromEntries((await vagas(turmaId)).map((vaga) => [vaga.funcao, vaga.quantidade]));

  beforeAll(async () => {
    banco = await criarBancoDeTeste();
    await banco.sql(`insert into core.polo (codigo, nome) values ('AM', 'Manaus')`);
  }, 60_000);

  afterAll(async () => {
    await banco?.encerrar();
  });

  it("cria o evento, o local e as vagas da regra em rascunho", async () => {
    turmas = [turmaDeExemplo()];
    const resumo = await sincronizar();

    expect(resumo).toMatchObject({ criados: 1, atualizados: 0, falhas: [], polosNaoEncontrados: [] });
    expect(await evento(501)).toMatchObject({
      tipo: "CONF",
      codigo: "CONF_AM_60",
      edicao: "60",
      nome: "Confronto · ed. 60 · Manaus",
      status: "PLANEJADO",
      status_escala: "RASCUNHO",
      expectativa_publico: 300,
      pessoas_na_fila: null,
      polo: "AM",
      local_nome: "Centro de Convenções Vasco Vasques",
      local_uf: "AM",
    });
    // Pai/mãe espera o número de pessoas na fila.
    expect(await quantidades(501)).toEqual({ LIDER: 12, DJ: 1, SOCIAL_MEDIA: 1, FOTOGRAFO: 1, CAMARIM: 1 });
    expect((await vagas(501))[0]).toMatchObject({
      data: "2026-12-12",
      hora_inicio: HORARIO_PADRAO.inicio,
      hora_fim: HORARIO_PADRAO.fim,
      origem: "REGRA",
    });
  });

  it("rodar de novo não duplica nada", async () => {
    const resumo = await sincronizar();
    expect(resumo).toMatchObject({ criados: 0, atualizados: 1 });
    expect(resumo.vagas.SEM_MUDANCA).toBe(1);
    expect(await banco.sql(`select count(*)::int as n from eventos.local`)).toEqual([{ n: 1 }]);
    expect(Object.keys(await quantidades(501))).toHaveLength(5);
  });

  it("respeita o que o time editou e recalcula as vagas da regra", async () => {
    await banco.sql(
      `update eventos.evento set expectativa_publico = 350, pessoas_na_fila = 95 where iam_control_turma_id = 501`,
    );
    // Ajuste manual do time: não pode ser desfeito pela regra.
    await banco.sql(
      `insert into eventos.escala (evento_id, funcao_id, data, hora_inicio, hora_fim, quantidade_vagas, status, origem)
       select e.id, f.id, '2026-12-12', '07:00', '19:00', 2, 'ABERTA', 'MANUAL'
         from eventos.evento e, eventos.funcao f
        where e.iam_control_turma_id = 501 and f.codigo = 'PALCO'`,
    );
    turmas = [turmaDeExemplo({ meta: 420, data_final: "2026-12-16" })];

    await sincronizar();

    const atualizado = await evento(501);
    expect(atualizado.expectativa_publico).toBe(350);
    expect((atualizado.fim as Date).toISOString()).toBe("2026-12-17T02:59:59.000Z");
    expect(await quantidades(501)).toEqual({
      LIDER: 14,
      PAI_MAE: 7,
      DJ: 1,
      SOCIAL_MEDIA: 1,
      FOTOGRAFO: 1,
      CAMARIM: 1,
      PALCO: 2,
    });
  });

  it("código repetido fica em branco e é avisado", async () => {
    turmas = [turmaDeExemplo(), turmaDeExemplo({ id: 777, data_inicio: "2027-01-10", data_final: "2027-01-12" })];
    const resumo = await sincronizar();
    expect(resumo.codigosEmConflito).toEqual([{ iamControlTurmaId: 777, codigo: "CONF_AM_60" }]);
    expect((await evento(777)).codigo).toBeNull();
    expect((await evento(501)).codigo).toBe("CONF_AM_60");
  });

  it("escala aprovada não é recalculada", async () => {
    await banco.sql(
      `update eventos.evento set status_escala = 'APROVADA', aprovado_em = now(), pessoas_na_fila = 150
        where iam_control_turma_id = 501`,
    );
    const resumo = await sincronizar();
    expect(resumo.vagas.ESCALA_APROVADA).toBe(1);
    expect((await quantidades(501)).PAI_MAE).toBe(7);
  });

  it("turma excluída no IAM Control cancela o evento sem apagar a escala", async () => {
    turmas = [turmaDeExemplo({ id: 777, data_inicio: "2027-01-10", excluida_em: "2026-10-25T10:00:00Z" })];
    const antes = await quantidades(777);
    const resumo = await sincronizar();
    expect(resumo.vagas.EVENTO_ENCERRADO).toBe(1);
    expect((await evento(777)).status).toBe("CANCELADO");
    expect(await quantidades(777)).toEqual(antes);
  });

  it("evento apagado no Eventos não volta", async () => {
    await banco.sql(`update eventos.evento set deleted_at = now() where iam_control_turma_id = 777`);
    turmas = [turmaDeExemplo({ id: 777, data_inicio: "2027-01-10" })];
    const resumo = await sincronizar();
    expect(resumo.ignoradosExcluidos).toBe(1);
    expect((await evento(777)).status).toBe("CANCELADO");
  });

  it("turma remarcada: o código passa da cancelada para a ativa, sem aviso", async () => {
    turmas = [
      turmaDeExemplo({ status_evento: "CANCELADA" }),
      turmaDeExemplo({ id: 888, data_inicio: "2026-12-19", data_final: "2026-12-21" }),
    ];
    const resumo = await sincronizar();
    expect(resumo.codigosEmConflito).toEqual([]);
    expect((await evento(501)).codigo).toBeNull();
    expect((await evento(888)).codigo).toBe("CONF_AM_60");

    const denovo = await sincronizar();
    expect(denovo.codigosEmConflito).toEqual([]);
    expect((await evento(501)).codigo).toBeNull();
    expect((await evento(888)).codigo).toBe("CONF_AM_60");
  });
});
