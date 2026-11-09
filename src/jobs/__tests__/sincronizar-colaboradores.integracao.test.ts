import { afterAll, beforeAll, describe, expect, it } from "vitest";

import type { ColaboradorRecebido } from "@/core/integrations/iam-control";
import { criarRepositorioColaboradores } from "@/modules/pessoas";
import { type BancoDeTeste, criarBancoDeTeste, TEST_DATABASE_URL } from "@/test/banco";

import { sincronizarColaboradores } from "../sincronizar-colaboradores";

const colaborador = (mudanca: Partial<ColaboradorRecebido> & Pick<ColaboradorRecebido, "id" | "email">): ColaboradorRecebido => ({
  nome: `Pessoa ${mudanca.id}`,
  telefone: "11 90000-0000",
  cidade: "Campinas",
  estado: "SP",
  setores: [],
  funcoes: ["STAFF"],
  ativo: true,
  atualizado_em: "2026-11-09T12:00:00Z",
  excluido_em: null,
  ...mudanca,
});

describe.skipIf(!TEST_DATABASE_URL)("sincronização de colaboradores no Postgres (GH + Eventos)", () => {
  let banco: BancoDeTeste;
  let colaboradores: ColaboradorRecebido[] = [];

  const sincronizar = () =>
    sincronizarColaboradores({
      iamControl: { listarColaboradores: async () => ({ total: colaboradores.length, colaboradores }) },
      colaboradores: criarRepositorioColaboradores(banco.db),
      agora: new Date("2026-11-09T15:00:00Z"),
    });

  const usuario = async (email: string) =>
    ((await banco.sql(
      `select u.id, u.ativo, u.nome_usuario, array(select p.codigo from core.usuario_perfil up join core.perfil p on p.id = up.perfil_id
               where up.usuario_id = u.id order by p.codigo) as perfis
         from core.usuario u where u.email = $1`,
      [email],
    )) as { id: string; ativo: boolean; nome_usuario: string | null; perfis: string[] }[])[0];

  const staff = async (iamId: number) =>
    ((await banco.sql(
      `select p.nome_completo, p.email, p.ativo, p.usuario_id, array(select f.codigo from eventos.pessoa_funcao pf join eventos.funcao f on f.id = pf.funcao_id
               where pf.pessoa_id = p.id order by f.codigo) as funcoes
         from eventos.pessoa_evento pe join core.pessoa p on p.id = pe.pessoa_id where pe.iam_control_user_id = $1`,
      [iamId],
    )) as { nome_completo: string; email: string; ativo: boolean; usuario_id: string; funcoes: string[] }[])[0];

  beforeAll(async () => {
    banco = await criarBancoDeTeste();
  }, 60_000);

  afterAll(async () => {
    await banco?.encerrar();
  });

  it("cria usuário, perfil do time e staff escalável com as funções; ignora inativo novo e e-mail inválido", async () => {
    colaboradores = [
      colaborador({ id: 1, email: "Time@Exemplo.test", setores: ["EVENTOS"], funcoes: ["LIDER_DE_EVENTOS"] }),
      colaborador({ id: 2, email: "dj@exemplo.test", funcoes: ["DJ", "STAFF"] }),
      colaborador({ id: 3, email: "vendas@exemplo.test", setores: ["COMERCIAL"], funcoes: ["VENDEDOR"] }),
      colaborador({ id: 4, email: "saiu@exemplo.test", ativo: false }),
      colaborador({ id: 5, email: "sem-arroba" }),
    ];
    const resumo = await sincronizar();
    expect(resumo).toMatchObject({ lidos: 5, criados: 3, atualizados: 0, desativados: 0, inativosIgnorados: 1, timeDeEventos: 1, escalaveis: 2, falhas: [] });
    expect(resumo.ignorados).toEqual([{ iamControlUserId: 5, motivo: "EMAIL_INVALIDO" }]);

    // Time: perfil EVENTOS_TIME (nunca EVENTOS_LIDER) e, por ter função de evento, também escalável.
    expect(await usuario("time@exemplo.test")).toMatchObject({ ativo: true, nome_usuario: null, perfis: ["EVENTOS_TIME"] });
    expect(await staff(1)).toMatchObject({ nome_completo: "Pessoa 1", funcoes: ["LIDER_EVENTO"] });
    expect(await staff(2)).toMatchObject({ email: "dj@exemplo.test", ativo: true, funcoes: ["DJ", "STAFF"] });

    // Sem setor EVENTOS nem função de evento: só o login (sem perfil e sem pessoa).
    expect(await usuario("vendas@exemplo.test")).toMatchObject({ ativo: true, perfis: [] });
    expect(((await banco.sql(`select count(*)::int as n from core.pessoa where email = 'vendas@exemplo.test'`)) as [{ n: number }])[0].n).toBe(0);
    expect(await usuario("saiu@exemplo.test")).toBeUndefined();
  });

  it("de novo: idempotente, mantém o que o time deu à mão e desativa quem saiu", async () => {
    const dj = await usuario("dj@exemplo.test");
    // À mão: líder e uma função a mais. A sincronização não retira.
    await banco.sql(
      `insert into core.usuario_perfil (usuario_id, perfil_id, escopo) select $1, id, 'GLOBAL' from core.perfil where codigo = 'EVENTOS_LIDER'`,
      [dj!.id],
    );
    await banco.sql(
      `insert into eventos.pessoa_funcao (pessoa_id, funcao_id)
       select pe.pessoa_id, f.id from eventos.pessoa_evento pe, eventos.funcao f where pe.iam_control_user_id = 2 and f.codigo = 'CAMARIM'`,
    );

    colaboradores = [
      colaborador({ id: 1, email: "time@exemplo.test", setores: ["EVENTOS"], funcoes: ["LIDER_DE_EVENTOS"] }),
      colaborador({ id: 2, email: "dj@exemplo.test", nome: "DJ Renomeado", funcoes: ["DJ"], ativo: false }),
      colaborador({ id: 3, email: "vendas@exemplo.test", setores: ["COMERCIAL"], funcoes: ["VENDEDOR"] }),
    ];
    const resumo = await sincronizar();
    expect(resumo).toMatchObject({ criados: 0, atualizados: 2, desativados: 1, escalaveis: 1, falhas: [] });

    expect(await usuario("dj@exemplo.test")).toMatchObject({ ativo: false, perfis: ["EVENTOS_LIDER"] });
    expect(await staff(2)).toMatchObject({ nome_completo: "DJ Renomeado", ativo: false, funcoes: ["CAMARIM", "DJ", "STAFF"] });
    expect(((await banco.sql(`select count(*)::int as n from core.pessoa`)) as [{ n: number }])[0].n).toBe(2);
  });

  it("liga a conta já cadastrada à mão pelo e-mail, sem duplicar usuário", async () => {
    const { id } = ((await banco.sql(`insert into core.usuario (email, nome_usuario) values ('dono@exemplo.test', 'Dono') returning id`)) as [{ id: string }])[0];
    colaboradores = [colaborador({ id: 9, email: "DONO@exemplo.test", setores: ["EVENTOS"], funcoes: [] })];
    expect(await sincronizar()).toMatchObject({ criados: 0, atualizados: 1, timeDeEventos: 1, escalaveis: 0 });
    expect(await usuario("dono@exemplo.test")).toMatchObject({ id, nome_usuario: "Dono", perfis: ["EVENTOS_TIME"] });
    expect(((await banco.sql(`select nome_completo from core.pessoa where usuario_id = $1`, [id])) as { nome_completo: string }[])).toEqual([{ nome_completo: "Pessoa 9" }]);
  });
});
