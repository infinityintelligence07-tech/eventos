import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import type { Db } from "@/core/db/database";
import type { ArmazenamentoDeArquivos } from "@/core/integrations/armazenamento";
import { criarArmazenamentoEmMemoria } from "@/core/integrations/armazenamento/armazenamento";
import { RegraDeNegocioError } from "@/fluxos/_base";
import { type BancoDeTeste, criarBancoDeTeste, TEST_DATABASE_URL } from "@/test/banco";

import {
  abrirComprovanteDoStaff,
  abrirComprovanteParaOTime,
  anexarComprovante,
  anexoDeComprovantesLigado,
  carregarFormularioDoStaff,
  carregarSolicitacao,
  corrigirMeuCusto,
  registrarSolicitacao,
  removerComprovante,
  reprovarSolicitacao,
  solicitarCusto,
} from "..";

const banco = vi.hoisted(() => ({ db: null as Db | null, falharNaTransacao: false }));
// O armazenamento do teste: em memória por padrão; cada teste pode trocar (desligado, com link).
const armazem = vi.hoisted(() => ({ atual: null as ArmazenamentoDeArquivos | null }));

vi.mock("@/core/autorizacao", async (importOriginal) => {
  const original = await importOriginal<typeof import("@/core/autorizacao")>();
  return { ...original, ehDonoDoSistema: () => false };
});

vi.mock("@/core/integrations/armazenamento", () => ({ armazenamentoDeComprovantes: () => armazem.atual }));

vi.mock("@/fluxos/_base", async (importOriginal) => {
  const original = await importOriginal<Record<string, unknown>>();
  return {
    ...original,
    bancoParaLeitura: async () => banco.db!,
    transacao: async (_ator: unknown, trabalho: (tx: never) => Promise<unknown>) => {
      if (banco.falharNaTransacao) throw new Error("banco fora do ar");
      return (await import("@/fluxos/_base/banco")).transacaoNoBanco(banco.db!, trabalho as never);
    },
  };
});

// São Paulo = UTC-3. O evento vai de 15/12 a 17/12: o formulário abre em 15/12 e fecha no fim de 22/12.
const DURANTE_O_PRAZO = new Date("2026-12-19T15:00:00Z");
const ANTES_DE_ABRIR = new Date("2026-12-15T02:59:59Z");
const DEPOIS_DO_PRAZO = new Date("2026-12-23T03:00:00Z");

const bytes = (...partes: (number[] | string)[]) => new Uint8Array(partes.flatMap((parte) => (typeof parte === "string" ? [...Buffer.from(parte, "latin1")] : parte)));
const JPEG = bytes([0xff, 0xd8, 0xff, 0xe0], "foto do cupom");
const PNG = bytes([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a], "captura de tela");
const WEBP = bytes("RIFF", [0x24, 0, 0, 0], "WEBP", "VP8 ");
const PDF = bytes("%PDF-1.7\n", "recibo");

describe.skipIf(!TEST_DATABASE_URL)("comprovantes do formulário de custo do staff", () => {
  let teste: BancoDeTeste;
  let memoria: ReturnType<typeof criarArmazenamentoEmMemoria>;
  let eventoId: string;
  let escalaId: string;
  let outroEventoId: string;
  let timeId: string;
  let auditorId: string;
  let pessoaDoTime: string;
  let pessoaDoAuditor: string;
  let contador = 0;

  const um = async (texto: string, params: unknown[] = []) => ((await teste.sql(texto, params)) as Record<string, unknown>[])[0]!;
  const doTime = () => ({ usuarioId: timeId, pessoaId: pessoaDoTime, email: "time@exemplo.test", origem: "LOCAL" as const });
  const auditor = () => ({ usuarioId: auditorId, pessoaId: pessoaDoAuditor, email: "auditor@exemplo.test", origem: "LOCAL" as const });

  async function staff(nome: string, naEscala: string | null = escalaId) {
    contador += 1;
    const email = `anexo${contador}@exemplo.test`;
    const usuarioId = (await um(`insert into core.usuario (email) values ($1) returning id`, [email])).id as string;
    const pessoaId = (await um(`insert into core.pessoa (nome_completo, usuario_id, email) values ($1, $2, $3) returning id`, [nome, usuarioId, email])).id as string;
    if (naEscala) await teste.sql(`insert into eventos.convocacao (escala_id, pessoa_id, status) values ($1, $2, 'ACEITA')`, [naEscala, pessoaId]);
    return { pessoaId, usuarioId, ator: { usuarioId, pessoaId, origem: "SESSAO" as const } };
  }

  async function eventoCom(codigo: string) {
    const id = (
      await um(
        `insert into eventos.evento (nome, codigo, inicio, fim, status, local_id, tipo_evento_id)
         select $1, $1, '2026-12-15T12:00:00Z', '2026-12-17T22:00:00Z', 'PLANEJADO', (select id from eventos.local where nome = 'Centro'), id from eventos.tipo_evento where sigla = 'ASM'
         returning id`,
        [codigo],
      )
    ).id as string;
    const escala = (await um(`insert into eventos.escala (evento_id, data, hora_inicio, hora_fim, quantidade_vagas, status) values ($1, '2026-12-15', '08:00', '18:00', 20, 'ABERTA') returning id`, [id])).id as string;
    return { id, escalaId: escala };
  }

  const estacionamento = { descricao: "Estacionamento", valorCentavos: 2500 };
  const comDespesa = (noEvento = eventoId) => ({ eventoId: noEvento, deslocamentos: [], despesas: [estacionamento] });
  const anexar = (quem: Awaited<ReturnType<typeof staff>>, conteudo: Uint8Array = JPEG, nome = "cupom.jpg", quando = DURANTE_O_PRAZO, noEvento = eventoId) =>
    anexarComprovante({ eventoId: noEvento, nome, conteudo }, quem.ator, quando);
  const linhas = (pessoaId: string) =>
    teste.sql(`select nome_original, tipo, tamanho_bytes, solicitacao_id, enviado_por, chave from eventos.comprovante_custo where pessoa_id = $1 order by criado_em, id`, [pessoaId]) as Promise<
      { nome_original: string; tipo: string; tamanho_bytes: number; solicitacao_id: string | null; enviado_por: string; chave: string }[]
    >;

  beforeAll(async () => {
    teste = await criarBancoDeTeste();
    banco.db = teste.db;
    timeId = (await um(`insert into core.usuario (email) values ('time@exemplo.test') returning id`)).id as string;
    auditorId = (await um(`insert into core.usuario (email) values ('auditor@exemplo.test') returning id`)).id as string;
    pessoaDoTime = (await um(`insert into core.pessoa (nome_completo, usuario_id) values ('Time', $1) returning id`, [timeId])).id as string;
    pessoaDoAuditor = (await um(`insert into core.pessoa (nome_completo, usuario_id) values ('Auditor', $1) returning id`, [auditorId])).id as string;
    await teste.sql(`update eventos.regra_custo set vigente_desde = '2026-10-22'`);
    await teste.sql(`insert into eventos.local (nome, tipo, cidade, uf) values ('Centro', 'EVENTO', 'Manaus', 'AM')`);
    ({ id: eventoId, escalaId } = await eventoCom("ASM_AM_910"));
    outroEventoId = (await eventoCom("ASM_AM_911")).id;
  }, 60_000);

  beforeEach(() => {
    memoria = criarArmazenamentoEmMemoria();
    armazem.atual = memoria;
    banco.falharNaTransacao = false;
  });

  afterAll(async () => {
    await teste?.encerrar();
  });

  it("anexa antes de enviar: guarda o arquivo com nome gerado no servidor, lista para a pessoa e registra a ação", async () => {
    const ana = await staff("Ana Anexo");
    expect(anexoDeComprovantesLigado()).toBe(true);
    const anexado = await anexar(ana, JPEG, "C:\\fotos\\Cupom do posto.JPG");
    expect(anexado).toEqual({ id: expect.stringMatching(/^[0-9a-f-]{36}$/), nome: "Cupom do posto.JPG", tipo: "image/jpeg", tamanhoBytes: JPEG.byteLength, criadoEm: DURANTE_O_PRAZO });

    const [linha] = await linhas(ana.pessoaId);
    expect(linha).toMatchObject({ nome_original: "Cupom do posto.JPG", tipo: "image/jpeg", tamanho_bytes: JPEG.byteLength, solicitacao_id: null, enviado_por: ana.usuarioId });
    // Só ids e a extensão do tipo conferido: nada do nome original no caminho.
    expect(linha!.chave).toBe(`custos/${eventoId}/${anexado.id}.jpg`);
    expect([...memoria.arquivos.keys()]).toEqual([linha!.chave]);
    expect(memoria.arquivos.get(linha!.chave)).toEqual({ conteudo: JPEG, tipo: "image/jpeg" });

    expect(await um(`select entidade, acao, usuario_id, evento_id, dados from eventos.registro_acao where entidade_id = $1`, [anexado.id])).toEqual({
      entidade: "COMPROVANTE_CUSTO",
      acao: "COMPROVANTE_ANEXADO",
      usuario_id: ana.usuarioId,
      evento_id: eventoId,
      dados: { propria: true, tipo: "image/jpeg", tamanhoBytes: JPEG.byteLength },
    });

    // Sai da página e volta: o que já subiu continua no formulário, sem a chave do armazenamento.
    const aberto = await carregarFormularioDoStaff(eventoId, ana.pessoaId, DURANTE_O_PRAZO);
    expect(aberto).toMatchObject({ situacao: "ABERTO", anexo: { comprovantes: [{ id: anexado.id, nome: "Cupom do posto.JPG", tipo: "image/jpeg" }] } });
    expect(JSON.stringify(aberto)).not.toContain("custos/");
  });

  it("aceita JPEG, PNG, WebP e PDF pelo conteúdo e recusa o resto, o vazio e o que passa de 8 MB, sem guardar nada", async () => {
    const bia = await staff("Bia Tipos");
    // A extensão e o nome mentem de propósito: vale o começo do arquivo.
    expect((await anexar(bia, PNG, "recibo.pdf")).tipo).toBe("image/png");
    expect((await anexar(bia, WEBP, "sem-extensao")).tipo).toBe("image/webp");
    expect((await anexar(bia, PDF, "nota.jpg")).tipo).toBe("application/pdf");
    expect((await linhas(bia.pessoaId)).map((linha) => linha.chave.split(".").pop()).sort()).toEqual(["pdf", "png", "webp"]);

    const caio = await staff("Caio Recusado");
    const html = bytes("<html><script>alert(1)</script></html>");
    await expect(anexar(caio, html, "cupom.jpg")).rejects.toThrow("Envie uma foto (JPG, PNG ou WebP) ou um PDF.");
    await expect(anexar(caio, bytes("GIF89a", "animacao"), "foto.gif")).rejects.toBeInstanceOf(RegraDeNegocioError);
    await expect(anexar(caio, new Uint8Array(0), "vazio.pdf")).rejects.toThrow("O arquivo está vazio");
    const grande = new Uint8Array(8 * 1024 * 1024 + 1);
    grande.set(PDF);
    await expect(anexar(caio, grande, "enorme.pdf")).rejects.toThrow("passa de 8 MB");
    const noLimite = new Uint8Array(8 * 1024 * 1024);
    noLimite.set(PDF);
    await expect(anexar(caio, noLimite, "justo.pdf")).resolves.toMatchObject({ tamanhoBytes: 8 * 1024 * 1024 });

    expect(await linhas(caio.pessoaId)).toHaveLength(1);
    expect(memoria.arquivos.size).toBe(4);
  });

  it("no máximo três comprovantes por solicitação; remover abre vaga e apaga o arquivo", async () => {
    const duda = await staff("Duda Limite");
    const [primeiro] = [await anexar(duda), await anexar(duda, PNG), await anexar(duda, PDF)];
    await expect(anexar(duda, WEBP)).rejects.toThrow("Cada solicitação aceita até 3 comprovantes. Remova um para anexar outro.");
    expect(await linhas(duda.pessoaId)).toHaveLength(3);
    expect(memoria.arquivos.size).toBe(3);

    await removerComprovante({ eventoId, comprovanteId: primeiro!.id }, duda.ator, DURANTE_O_PRAZO);
    expect((await linhas(duda.pessoaId)).map((linha) => linha.tipo).sort()).toEqual(["application/pdf", "image/png"]);
    expect(memoria.arquivos.has(`custos/${eventoId}/${primeiro!.id}.jpg`)).toBe(false);
    expect(await teste.sql(`select acao from eventos.registro_acao where entidade_id = $1 order by criado_em, acao`, [primeiro!.id])).toEqual([{ acao: "COMPROVANTE_ANEXADO" }, { acao: "COMPROVANTE_REMOVIDO" }]);
    await expect(anexar(duda, WEBP)).resolves.toMatchObject({ tipo: "image/webp" });
  });

  it("só a própria pessoa, no evento dela e dentro do prazo, anexa; fora disso nada é guardado", async () => {
    const fora = await staff("Fora da Escala", null);
    await expect(anexar(fora)).rejects.toThrow("Você não está na escala deste evento");
    const edu = await staff("Edu Prazo");
    await expect(anexar(edu, JPEG, "cedo.jpg", ANTES_DE_ABRIR)).rejects.toThrow(/abre em 15\/12/);
    await expect(anexar(edu, JPEG, "tarde.jpg", DEPOIS_DO_PRAZO)).rejects.toThrow(/acabou em 22\/12/);
    await expect(anexar(edu, JPEG, "outro.jpg", DURANTE_O_PRAZO, outroEventoId)).rejects.toThrow("Você não está na escala deste evento");
    await expect(anexar(edu, JPEG, "x.jpg", DURANTE_O_PRAZO, "nao-e-uuid")).rejects.toBeInstanceOf(RegraDeNegocioError);
    await teste.sql(`update eventos.evento set status = 'CANCELADO' where id = $1`, [outroEventoId]);
    const doCancelado = await staff("Do Cancelado", (await um(`select id from eventos.escala where evento_id = $1`, [outroEventoId])).id as string);
    await expect(anexar(doCancelado, JPEG, "x.jpg", DURANTE_O_PRAZO, outroEventoId)).rejects.toThrow("Este evento foi cancelado");
    await teste.sql(`update eventos.evento set status = 'PLANEJADO' where id = $1`, [outroEventoId]);

    expect(memoria.arquivos.size).toBe(0);
    expect(await um(`select count(*)::int as n from eventos.comprovante_custo where pessoa_id = any($1)`, [[fora.pessoaId, edu.pessoaId, doCancelado.pessoaId]])).toEqual({ n: 0 });
  });

  it("ninguém abre nem remove o anexo de outra pessoa trocando o id na URL; o time abre na auditoria", async () => {
    const fabi = await staff("Fabi Dona");
    const gil = await staff("Gil Curioso");
    const daFabi = await anexar(fabi, PDF, "recibo.pdf");

    expect(await abrirComprovanteDoStaff(eventoId, daFabi.id, fabi.pessoaId)).toEqual({ forma: "CONTEUDO", conteudo: PDF, tipo: "application/pdf", nome: "recibo.pdf" });
    // Outra pessoa da mesma escala, com o id certo: como se não existisse.
    expect(await abrirComprovanteDoStaff(eventoId, daFabi.id, gil.pessoaId)).toBeNull();
    // A dona, por outro evento na URL: também não.
    expect(await abrirComprovanteDoStaff(outroEventoId, daFabi.id, fabi.pessoaId)).toBeNull();
    expect(await abrirComprovanteDoStaff(eventoId, "nao-e-uuid", fabi.pessoaId)).toBeNull();
    expect(await abrirComprovanteDoStaff(eventoId, "0192f0c0-0000-7000-8000-00000000dead", fabi.pessoaId)).toBeNull();

    await expect(removerComprovante({ eventoId, comprovanteId: daFabi.id }, gil.ator, DURANTE_O_PRAZO)).rejects.toThrow("Comprovante não encontrado");
    await expect(removerComprovante({ eventoId: outroEventoId, comprovanteId: daFabi.id }, fabi.ator, DURANTE_O_PRAZO)).rejects.toThrow("Comprovante não encontrado");
    expect(await linhas(fabi.pessoaId)).toHaveLength(1);
    expect(memoria.arquivos.size).toBe(1);
    // O formulário do Gil não mostra o anexo da Fabi.
    expect(await carregarFormularioDoStaff(eventoId, gil.pessoaId, DURANTE_O_PRAZO)).toMatchObject({ situacao: "ABERTO", anexo: { comprovantes: [] } });

    const { protocolo } = await solicitarCusto(comDespesa(), fabi.ator, DURANTE_O_PRAZO);
    const naAuditoria = await carregarSolicitacao(protocolo);
    expect(naAuditoria?.comprovantes).toEqual([{ id: daFabi.id, nome: "recibo.pdf", tipo: "application/pdf", tamanhoBytes: PDF.byteLength, criadoEm: DURANTE_O_PRAZO }]);
    expect(await abrirComprovanteParaOTime(daFabi.id)).toEqual({ forma: "CONTEUDO", conteudo: PDF, tipo: "application/pdf", nome: "recibo.pdf" });
    expect(await abrirComprovanteParaOTime("0192f0c0-0000-7000-8000-00000000dead")).toBeNull();
  });

  it("com deslocamento ou despesa o comprovante é obrigatório; só com os valores fixos, não", async () => {
    const hugo = await staff("Hugo Sem Comprovante");
    const semAnexo = solicitarCusto(comDespesa(), hugo.ator, DURANTE_O_PRAZO);
    await expect(semAnexo).rejects.toBeInstanceOf(RegraDeNegocioError);
    await expect(semAnexo).rejects.toThrow("Anexe pelo menos um comprovante");
    await expect(
      solicitarCusto({ eventoId, deslocamentos: [{ origem: "Canoas", destino: "Manaus", idaVolta: true, km: 60, consumoKmL: 12, precoLitroCentavos: 600, pedagioCentavos: 0 }], despesas: [] }, hugo.ator, DURANTE_O_PRAZO),
    ).rejects.toThrow("Anexe pelo menos um comprovante");
    expect(await um(`select count(*)::int as n from eventos.solicitacao_custo where pessoa_id = $1`, [hugo.pessoaId])).toEqual({ n: 0 });

    const anexado = await anexar(hugo);
    const enviada = await solicitarCusto(comDespesa(), hugo.ator, DURANTE_O_PRAZO);
    // O anexo passa a ser da solicitação, e o registro dela diz quantos tem.
    expect((await linhas(hugo.pessoaId)).map((linha) => linha.solicitacao_id)).toEqual([enviada.id]);
    expect(await um(`select dados->>'comprovantes' as comprovantes, dados->>'propria' as propria from eventos.registro_acao where entidade_id = $1`, [enviada.id])).toEqual({ comprovantes: "1", propria: "true" });
    expect(await carregarFormularioDoStaff(eventoId, hugo.pessoaId, DURANTE_O_PRAZO)).toMatchObject({ situacao: "ENVIADA", anexoLigado: true, solicitacao: { comprovantes: [{ id: anexado.id }] } });

    // Em conferência, os comprovantes ficam como foram enviados.
    await expect(anexar(hugo, PNG)).rejects.toThrow("A solicitação já foi enviada: os comprovantes não podem mais ser alterados");
    await expect(removerComprovante({ eventoId, comprovanteId: anexado.id }, hugo.ator, DURANTE_O_PRAZO)).rejects.toThrow("os comprovantes não podem mais ser alterados");
    expect(memoria.arquivos.size).toBe(1);

    // Não foi de carro e não teve despesa: leva só os valores fixos do evento e não há gasto a comprovar.
    const iris = await staff("Iris Só Fixos");
    await expect(solicitarCusto({ eventoId, deslocamentos: [], despesas: [] }, iris.ator, DURANTE_O_PRAZO)).resolves.toMatchObject({ totalCentavos: 87000 });
  });

  it("reprovada: os anexos sobrevivem à correção, e a pessoa acrescenta ou troca dentro do prazo de corrigir", async () => {
    const joao = await staff("João Corrige");
    const primeiro = await anexar(joao, JPEG, "cupom.jpg");
    const { id, protocolo } = await solicitarCusto(comDespesa(), joao.ator, DURANTE_O_PRAZO);
    const versao = async () => (await carregarSolicitacao(protocolo))!.atualizadoEm;
    const reprovadaEm = new Date("2027-01-04T14:00:00Z");
    await reprovarSolicitacao({ solicitacaoId: id, atualizadoEm: await versao(), motivo: "O cupom está ilegível" }, auditor(), reprovadaEm);

    // Fora do prazo do evento, mas dentro dos 5 dias depois da reprovação.
    const corrigindo = new Date("2027-01-06T12:00:00Z");
    const segundo = await anexar(joao, PDF, "cupom-legivel.pdf", corrigindo);
    expect((await linhas(joao.pessoaId)).map((linha) => linha.solicitacao_id)).toEqual([id, id]);
    expect(await um(`select dados->>'solicitacaoId' as solicitacao from eventos.registro_acao where entidade_id = $1`, [segundo.id])).toEqual({ solicitacao: id });
    await removerComprovante({ eventoId, comprovanteId: primeiro.id }, joao.ator, corrigindo);

    // Tirou todos: com despesa, a correção não sai sem comprovante.
    await removerComprovante({ eventoId, comprovanteId: segundo.id }, joao.ator, corrigindo);
    await expect(corrigirMeuCusto({ ...comDespesa(), atualizadoEm: await versao() }, joao.ator, corrigindo)).rejects.toThrow("Anexe pelo menos um comprovante");
    const terceiro = await anexar(joao, PNG, "novo.png", corrigindo);

    // A correção apaga e regrava deslocamentos e itens; o anexo é da solicitação e continua lá.
    await corrigirMeuCusto({ eventoId, atualizadoEm: await versao(), deslocamentos: [], despesas: [{ descricao: "Estacionamento", valorCentavos: 2000 }] }, joao.ator, corrigindo);
    const corrigida = await carregarSolicitacao(protocolo);
    expect(corrigida).toMatchObject({ auditoria: "PENDENTE", comprovantes: [{ id: terceiro.id, nome: "novo.png" }] });
    expect([...memoria.arquivos.keys()]).toEqual([`custos/${eventoId}/${terceiro.id}.png`]);
    await expect(anexar(joao, JPEG, "depois.jpg", corrigindo)).rejects.toThrow("os comprovantes não podem mais ser alterados");

    // Passado o prazo de corrigir, a reprovada também não aceita mais anexo.
    const kate = await staff("Kate Atrasada");
    await anexar(kate);
    const daKate = await solicitarCusto(comDespesa(), kate.ator, DURANTE_O_PRAZO);
    await reprovarSolicitacao({ solicitacaoId: daKate.id, atualizadoEm: (await carregarSolicitacao(daKate.protocolo))!.atualizadoEm, motivo: "Valor errado" }, auditor(), reprovadaEm);
    await expect(anexar(kate, PDF, "tarde.pdf", new Date("2027-01-10T03:00:00Z"))).rejects.toThrow("O prazo para corrigir esta solicitação acabou");
  });

  it("registro pelo time em nome da pessoa: não exige comprovante e leva junto o que ela já tinha anexado", async () => {
    const lia = await staff("Lia Pelo Time");
    const anexado = await anexar(lia);
    const peloTime = await registrarSolicitacao({ eventoId, pessoaId: lia.pessoaId, deslocamentos: [], itens: [{ categoria: "OUTRO", descricao: "Ônibus", quantidade: 1, valorCentavos: 8000 }] }, doTime(), DEPOIS_DO_PRAZO);
    expect((await carregarSolicitacao(peloTime.protocolo))?.comprovantes.map((comprovante) => comprovante.id)).toEqual([anexado.id]);

    const mel = await staff("Mel Sem Anexo");
    await expect(registrarSolicitacao({ eventoId, pessoaId: mel.pessoaId, deslocamentos: [], itens: [{ categoria: "OUTRO", descricao: "Ônibus", quantidade: 1, valorCentavos: 8000 }] }, doTime(), DEPOIS_DO_PRAZO)).resolves.toMatchObject({
      totalCentavos: 8000,
    });
  });

  it("se a gravação falha depois de guardar, o arquivo é apagado; se o armazenamento falha, nada é gravado", async () => {
    const nei = await staff("Nei Falha");
    banco.falharNaTransacao = true;
    await expect(anexar(nei)).rejects.toThrow("banco fora do ar");
    expect(memoria.arquivos.size).toBe(0);
    banco.falharNaTransacao = false;

    armazem.atual = { ...memoria, guardar: async () => Promise.reject(new Error("armazenamento fora do ar")) };
    await expect(anexar(nei)).rejects.toThrow("armazenamento fora do ar");
    expect(await linhas(nei.pessoaId)).toHaveLength(0);

    // Arquivo que sumiu do armazenamento: a rota responde como "não encontrado", sem erro.
    armazem.atual = memoria;
    const anexado = await anexar(nei);
    memoria.arquivos.clear();
    expect(await abrirComprovanteDoStaff(eventoId, anexado.id, nei.pessoaId)).toBeNull();
  });

  it("armazenamento com link (S3): a leitura devolve o link de curta duração, nunca a chave", async () => {
    const olga = await staff("Olga Link");
    const pedidos: { chave: string; segundos: number }[] = [];
    armazem.atual = {
      ...memoria,
      linkTemporario: async (chave, segundos) => {
        pedidos.push({ chave, segundos });
        return "https://armazenamento.exemplo.test/assinado";
      },
    };
    const anexado = await anexar(olga);
    expect(await abrirComprovanteDoStaff(eventoId, anexado.id, olga.pessoaId)).toEqual({ forma: "LINK", url: "https://armazenamento.exemplo.test/assinado" });
    expect(pedidos).toEqual([{ chave: `custos/${eventoId}/${anexado.id}.jpg`, segundos: 300 }]);
    const outra = await staff("Outra Pessoa");
    expect(await abrirComprovanteDoStaff(eventoId, anexado.id, outra.pessoaId)).toBeNull();
    expect(pedidos).toHaveLength(1);
  });

  it("anexo desligado (sem as variáveis em produção): o formulário funciona sem o campo e sem exigir comprovante", async () => {
    armazem.atual = null;
    const paulo = await staff("Paulo Desligado");
    expect(anexoDeComprovantesLigado()).toBe(false);
    expect(await carregarFormularioDoStaff(eventoId, paulo.pessoaId, DURANTE_O_PRAZO)).toMatchObject({ situacao: "ABERTO", anexo: null });
    await expect(anexar(paulo)).rejects.toThrow("O envio de comprovantes não está disponível neste ambiente.");
    const enviada = await solicitarCusto(comDespesa(), paulo.ator, DURANTE_O_PRAZO);
    expect(await carregarFormularioDoStaff(eventoId, paulo.pessoaId, DURANTE_O_PRAZO)).toMatchObject({ situacao: "ENVIADA", anexoLigado: false, solicitacao: { protocolo: enviada.protocolo, comprovantes: [] } });
    expect(await abrirComprovanteParaOTime("0192f0c0-0000-7000-8000-00000000dead")).toBeNull();
  });
});
