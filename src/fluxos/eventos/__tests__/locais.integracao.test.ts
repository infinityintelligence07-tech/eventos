import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

import type * as Base from "@/fluxos/_base";
import { RegraDeNegocioError } from "@/fluxos/_base";
import { salvarLocalSchema } from "@/modules/eventos";
import { type BancoDeTeste, criarBancoDeTeste, TEST_DATABASE_URL } from "@/test/banco";

import { arquivarLocal, listarLocais, salvarLocal } from "..";

// A guarda de escrita tem testes próprios (src/fluxos/_base); aqui o fluxo roda direto no banco descartável.
const teste = vi.hoisted(() => ({ banco: null as BancoDeTeste | null }));
vi.mock("@/fluxos/_base", async (importOriginal) => {
  const real = await importOriginal<typeof Base>();
  return {
    ...real,
    bancoParaLeitura: async () => teste.banco!.db,
    situacaoDaEscrita: async () => ({ liberada: true }),
    transacao: (trabalho: (tx: Base.Executor) => Promise<unknown>) => teste.banco!.db.transaction(trabalho),
  };
});

describe.skipIf(!TEST_DATABASE_URL)("Locais e hotéis no banco", () => {
  const agora = new Date("2026-11-05T15:00:00Z");
  const banco = () => teste.banco!;
  const formulario = (dados: Record<string, string>) => salvarLocalSchema.parse(dados);

  beforeAll(async () => {
    teste.banco = await criarBancoDeTeste();
  }, 60_000);

  afterAll(async () => {
    await teste.banco?.encerrar();
  });

  it("cadastra um hotel, edita e lista com filtro e busca", async () => {
    const id = await salvarLocal(
      formulario({ nome: "Hotel Central", tipo: "HOTEL", cep: "69005010", logradouro: "Av. Brasil", numero: "100", cidade: "Manaus", uf: "am", capacidade: "120" }),
      agora,
    );
    expect((await banco().sql(`select nome, tipo, cep, uf, lat, capacidade from eventos.local where id = $1`, [id]))[0]).toEqual({
      nome: "Hotel Central",
      tipo: "HOTEL",
      cep: "69005-010",
      uf: "AM",
      lat: null,
      capacidade: 120,
    });

    await salvarLocal(formulario({ localId: id, nome: "Hotel Central", tipo: "HOTEL", cidade: "Manaus", uf: "AM", lat: "-3,119", lng: "-60,02" }), agora);
    const { locais } = await listarLocais({ tipo: "HOTEL", busca: "centr" });
    expect(locais).toEqual([
      expect.objectContaining({ id, lat: -3.119, lng: -60.02, logradouro: null, capacidade: null, uso: { eventos: 0, hospedagens: 0 }, motivoParaNaoArquivar: null }),
    ]);
    expect((await listarLocais({ tipo: "EVENTO", busca: "centr" })).locais).toEqual([]);
    expect((await listarLocais({ busca: "100%" })).locais).toEqual([]);
  });

  it("recusa outro local do mesmo tipo com o mesmo nome na mesma cidade", async () => {
    await expect(salvarLocal(formulario({ nome: "hotel central", tipo: "HOTEL", cidade: "MANAUS", uf: "AM" }), agora)).rejects.toEqual(
      new RegraDeNegocioError('Já existe "hotel central" em MANAUS/AM. Edite o cadastro existente.'),
    );
    await expect(salvarLocal(formulario({ nome: "Hotel Central", tipo: "APARTAMENTO", cidade: "Manaus", uf: "AM" }), agora)).resolves.toBeTypeOf("string");
  });

  it("local em uso não é arquivado; sem uso, some da lista", async () => {
    const emUso = await salvarLocal(formulario({ nome: "Centro de Convenções", tipo: "EVENTO", cidade: "Manaus", uf: "AM" }), agora);
    await banco().sql(`insert into eventos.evento (nome, inicio, fim, status, local_id) values ('Evento', now(), now(), 'PLANEJADO', $1)`, [emUso]);
    await expect(arquivarLocal(emUso, agora)).rejects.toEqual(new RegraDeNegocioError("Este local está em 1 evento."));
    expect((await listarLocais({ busca: "Convenções" })).locais[0]).toMatchObject({ uso: { eventos: 1, hospedagens: 0 }, motivoParaNaoArquivar: "Este local está em 1 evento." });

    const livre = await salvarLocal(formulario({ nome: "Apartamento IAM", tipo: "APARTAMENTO", cidade: "Belém", uf: "PA" }), agora);
    await arquivarLocal(livre, agora);
    expect((await listarLocais({ busca: "Apartamento IAM" })).locais).toEqual([]);
    await expect(arquivarLocal(livre, agora)).rejects.toEqual(new RegraDeNegocioError("Este local não existe mais. Recarregue a página."));
    await expect(salvarLocal(formulario({ localId: livre, nome: "Apartamento IAM", tipo: "APARTAMENTO", cidade: "Belém", uf: "PA" }), agora)).rejects.toEqual(
      new RegraDeNegocioError("Este local não existe mais. Recarregue a página."),
    );
  });
});
