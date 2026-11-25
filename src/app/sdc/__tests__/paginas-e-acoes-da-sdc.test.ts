import { globSync, readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

// Varredura da área da SDC (docs/09 §15), no molde das varreduras do (time): toda página e layout confere o ator SDC
// antes de ler qualquer dado, toda action passa por executarAcaoDaSdc, e nada daqui usa as portas ou as leituras do time.

const RAIZ = path.resolve(import.meta.dirname, "..");
const ler = (arquivo: string) => readFileSync(path.join(RAIZ, arquivo), "utf8");

const PAGINAS = globSync("**/{page,layout}.tsx", { cwd: RAIZ }).sort();
const FONTES = globSync("**/*.{ts,tsx}", { cwd: RAIZ })
  .filter((arquivo) => !arquivo.includes("__tests__"))
  .sort();

function primeirasInstrucoes(texto: string): { nome: string; primeiraInstrucao: string }[] {
  const encontradas: { nome: string; primeiraInstrucao: string }[] = [];
  const cabecalho = /^export (?:default (async )?function (\w+)|(async )?function (generateMetadata))\([^]*?\)\s*(?::[^{]*)?\{$/gm;
  for (let achado = cabecalho.exec(texto); achado; achado = cabecalho.exec(texto)) {
    const corpo = texto.slice(achado.index + achado[0].length).split("\n");
    const primeiraInstrucao = corpo.map((linha) => linha.trim()).find((linha) => linha && !linha.startsWith("//") && !linha.startsWith("/*") && !linha.startsWith("*")) ?? "";
    encontradas.push({ nome: achado[2] ?? achado[4]!, primeiraInstrucao });
  }
  return encontradas;
}

describe("área da SDC: portas próprias em tudo", () => {
  it("as páginas são só Voos e Hospedagem (mais a raiz, que leva a Voos)", () => {
    expect(PAGINAS).toEqual(["hospedagem/page.tsx", "layout.tsx", "page.tsx", "voos/page.tsx"]);
    expect(globSync("**/route.ts", { cwd: RAIZ })).toEqual([]);
  });

  it.each(PAGINAS)("%s exige o ator SDC primeiro", (arquivo) => {
    const funcoes = primeirasInstrucoes(ler(arquivo));
    expect(funcoes.length, "sem export default function").toBeGreaterThan(0);
    for (const { nome, primeiraInstrucao } of funcoes) {
      expect(primeiraInstrucao, `${nome}: a primeira instrução precisa ser await exigirAtorSdc()`).toMatch(/\bawait exigirAtorSdc\(\)/);
    }
  });

  it("as actions da SDC são só as duas de registrar compra, e todas passam por executarAcaoDaSdc", () => {
    const comUseServer = FONTES.filter((arquivo) => /^["']use server["']/m.test(ler(arquivo)));
    expect(comUseServer).toEqual(["acoes.ts"]);
    const partes = ler("acoes.ts")
      .split(/^(?=export )/m)
      .slice(1);
    const actions = Object.fromEntries(partes.map((parte) => [/^export (?:async )?(?:function|const) (\w+)/.exec(parte)?.[1] ?? parte.slice(0, 40), /^\s*return executarAcaoDaSdc\(form, \w+Schema, async/m.test(parte)]));
    expect(actions).toEqual({ registrarCompraDeVooAcao: true, registrarReservaAcao: true });
  });

  it("nada na área da SDC usa as portas do time, as leituras do time nem o banco direto", () => {
    for (const arquivo of FONTES) {
      const texto = ler(arquivo);
      // Só _servidor/ator-sdc.ts lê a situação de quem entrou; ninguém chama exigirAtor/obterAtor/executarAcao do time.
      expect(texto, arquivo).not.toMatch(/\b(exigirAtor|obterAtor|executarAcao|executarLeitura|permissoesDoAtor)\(/);
      expect(texto, arquivo).not.toMatch(/from "@\/core\/db|from "@\/modules\/[^"]+\/repository/);
      // Dos fluxos, só o da SDC (as leituras do time carregam mais dados do que a SDC pode ver).
      for (const [, fluxo] of texto.matchAll(/from "@\/fluxos\/([^"]+)"/g)) expect(["sdc", "_base"], `${arquivo} importa @/fluxos/${fluxo}`).toContain(fluxo);
    }
  });
});
