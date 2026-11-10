import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

import type { Db } from "@/core/db/database";
import { RegraDeNegocioError } from "@/fluxos/_base";
import { meuCadastroSchema } from "@/modules/pessoas";
import { type BancoDeTeste, criarBancoDeTeste, TEST_DATABASE_URL } from "@/test/banco";

import { carregarMeuCadastro, salvarMeuCadastro, type StaffDaSessao, staffDaIdentidade } from "../meu-cadastro";

const banco = vi.hoisted(() => ({ db: null as Db | null }));
const google = vi.hoisted(() => ({ chave: undefined as string | undefined, resposta: null as { lat: number; lng: number } | null, enderecos: [] as string[] }));

vi.mock("@/fluxos/_base", async (importOriginal) => {
  const original = await importOriginal<Record<string, unknown>>();
  return {
    ...original,
    bancoParaLeitura: async () => banco.db!,
    transacao: async (_ator: unknown, trabalho: (tx: never) => Promise<unknown>) => (await import("@/fluxos/_base/banco")).transacaoNoBanco(banco.db!, trabalho as never),
  };
});
vi.mock("@/core/config/leitura", async (importOriginal) => {
  const original = await importOriginal<typeof import("@/core/config/leitura")>();
  return { ...original, lerConfig: () => ({ GOOGLE_MAPS_API_KEY: google.chave }) as ReturnType<typeof original.lerConfig> };
});
vi.mock("@/core/integrations/google-maps/geocodificacao", () => ({
  geocodificar: async (endereco: string) => {
    google.enderecos.push(endereco);
    return google.resposta;
  },
}));

describe.skipIf(!TEST_DATABASE_URL)("Meu cadastro no banco", () => {
  let teste: BancoDeTeste;
  let staff: StaffDaSessao;
  let funcoes: Record<string, string>;
  const agora = new Date("2026-11-10T12:00:00Z");
  const um = async (texto: string, params: unknown[] = []) => ((await teste.sql(texto, params)) as Record<string, unknown>[])[0]!;
  const formulario = (mudanca: Record<string, unknown> = {}) =>
    meuCadastroSchema.parse({
      poloCodigo: "CPS",
      sexo: "F",
      camisetaModelo: "BABY_LOOK",
      camisetaTamanho: "M",
      funcoes: [funcoes.DJ],
      cep: "13015001",
      logradouro: "Rua Barão de Jaguara",
      numero: "100",
      cidade: "Campinas",
      uf: "SP",
      temCarro: "SIM",
      lugares: "3",
      consumoKmL: "11,5",
      ...mudanca,
    });
  const salvar = (mudanca: Record<string, unknown> = {}) =>
    salvarMeuCadastro(formulario(mudanca), staff, { usuarioId: staff.usuarioId, pessoaId: staff.pessoaId, origem: "SESSAO" }, agora);

  beforeAll(async () => {
    teste = await criarBancoDeTeste();
    banco.db = teste.db;
    await teste.sql(`insert into core.polo (codigo, nome) values ('CPS', 'Campinas'), ('POA', 'Porto Alegre')`);
    const { id: usuarioId } = (await um(`insert into core.usuario (email) values ('ana@exemplo.test') returning id`)) as { id: string };
    const { id: pessoaId } = (await um(`insert into core.pessoa (usuario_id, nome_completo, email) values ($1, 'Ana Souza', 'ana@exemplo.test') returning id`, [usuarioId])) as { id: string };
    await teste.sql(`insert into eventos.pessoa_evento (pessoa_id, fez_confronto, tem_cnpj) values ($1, true, false)`, [pessoaId]);
    funcoes = Object.fromEntries(((await teste.sql(`select codigo, id from eventos.funcao`)) as { codigo: string; id: string }[]).map((linha) => [linha.codigo, linha.id]));
    // O time já habilitou STAFF.
    await teste.sql(`insert into eventos.pessoa_funcao (pessoa_id, funcao_id, nivel) values ($1, $2, 'HABILITADO')`, [pessoaId, funcoes.STAFF]);
    await teste.sql(`insert into core.usuario (email) values ('sem-staff@exemplo.test')`);
  }, 60_000);

  afterAll(async () => {
    await teste?.encerrar();
  });

  it("a sessão vira o staff pelo e-mail (sem diferenciar maiúsculas); quem não é staff fica de fora", async () => {
    staff = (await staffDaIdentidade({ email: "ANA@exemplo.test" }))!;
    expect(staff).toMatchObject({ nome: "Ana Souza", email: "ana@exemplo.test" });
    expect(await staffDaIdentidade({ usuarioId: staff.usuarioId })).toEqual(staff);
    expect(await staffDaIdentidade({ email: "sem-staff@exemplo.test" })).toBeNull();
    expect((await carregarMeuCadastro(staff.pessoaId, agora))?.pendencias).toEqual(expect.arrayContaining(["SEXO", "CAMISETA", "LOCALIZACAO"]));
    // Mesma consulta com o papel da produção (grants por coluna e RLS em core): o staff se acha.
    const comoLeitura = await teste.comoPapel(
      "app_eventos_leitura",
      `select p.id from core.usuario u join core.pessoa p on p.usuario_id = u.id and p.deleted_at is null
         join eventos.pessoa_evento pe on pe.pessoa_id = p.id
        where u.ativo and u.deleted_at is null and lower(u.email) = 'ana@exemplo.test'`,
    );
    expect(comoLeitura).toEqual([{ id: staff.pessoaId }]);
  });

  it("salva tudo numa vez; a coordenada vem do Google; rua e número não ficam no banco nem no histórico", async () => {
    google.chave = "k";
    google.resposta = { lat: -22.905, lng: -47.061 };
    await expect(salvar()).resolves.toEqual({ localizacao: "CALCULADA" });
    expect(google.enderecos.at(-1)).toBe("Rua Barão de Jaguara, 100, Campinas - SP, 13015001, Brasil");

    const gravado = await um(
      `select pe.sexo, pe.camiseta_modelo, pe.camiseta_tamanho, pe.fez_confronto, pe.tem_cnpj, pe.cep, pe.cidade, pe.uf, pe.lat, pe.lng,
              pe.geocodificado_em is not null as geocodificado, pe.cadastro_revisado_em is not null as revisado, po.codigo as polo,
              v.lugares, v.consumo_km_l::text as consumo
         from eventos.pessoa_evento pe left join core.polo po on po.id = pe.polo_id left join eventos.pessoa_veiculo v on v.pessoa_id = pe.pessoa_id
        where pe.pessoa_id = $1`,
      [staff.pessoaId],
    );
    expect(gravado).toEqual({
      sexo: "F", camiseta_modelo: "BABY_LOOK", camiseta_tamanho: "M", fez_confronto: true, tem_cnpj: false, cep: "13015001", cidade: "Campinas", uf: "SP",
      lat: -22.905, lng: -47.061, geocodificado: true, revisado: true, polo: "CPS", lugares: 3, consumo: "11.5",
    });
    const funcoesGravadas = await teste.sql(
      `select f.codigo, pf.nivel from eventos.pessoa_funcao pf join eventos.funcao f on f.id = pf.funcao_id where pf.pessoa_id = $1 order by f.codigo`,
      [staff.pessoaId],
    );
    expect(funcoesGravadas).toEqual([{ codigo: "DJ", nivel: "TRAINEE" }, { codigo: "STAFF", nivel: "HABILITADO" }]);

    const registro = await um(`select acao, usuario_id, dados::text as dados from eventos.registro_acao where entidade_id = $1 order by criado_em desc limit 1`, [staff.pessoaId]);
    expect(registro).toMatchObject({ acao: "CADASTRO_REVISADO", usuario_id: staff.usuarioId });
    for (const valorPessoal of ["Barão", "13015001", "Campinas", "-22.9", "BABY_LOOK", "CPS"]) expect(registro.dados).not.toContain(valorPessoal);
    expect(JSON.parse(registro.dados as string).campos).toEqual(expect.arrayContaining(["sexo", "funcoes", "poloId", "localizacao"]));
  });

  it("sem rua e número mantém a coordenada; sem chave do Google salva sem recalcular; endereço não achado avisa", async () => {
    await expect(salvar({ logradouro: "", numero: "", temCarro: "NAO" })).resolves.toEqual({ localizacao: "MANTIDA" });
    expect(await um(`select lat, (select count(*)::int from eventos.pessoa_veiculo where pessoa_id = $1) as carros from eventos.pessoa_evento where pessoa_id = $1`, [staff.pessoaId])).toEqual({ lat: -22.905, carros: 0 });

    google.chave = undefined;
    await expect(salvar({ numero: "200" })).resolves.toEqual({ localizacao: "INDISPONIVEL" });
    google.chave = "k";
    google.resposta = null;
    await expect(salvar({ numero: "300" })).resolves.toEqual({ localizacao: "NAO_ENCONTRADA" });
    expect((await um(`select lat from eventos.pessoa_evento where pessoa_id = $1`, [staff.pessoaId])).lat).toBe(-22.905);
  });

  it("desmarcar tira só a sugestão (TRAINEE); a habilitada pelo time fica; polo inexistente é recusado", async () => {
    await salvar({ funcoes: [] });
    expect(await teste.sql(`select f.codigo from eventos.pessoa_funcao pf join eventos.funcao f on f.id = pf.funcao_id where pf.pessoa_id = $1`, [staff.pessoaId])).toEqual([{ codigo: "STAFF" }]);
    await expect(salvar({ poloCodigo: "XYZ" })).rejects.toBeInstanceOf(RegraDeNegocioError);
  });
});
