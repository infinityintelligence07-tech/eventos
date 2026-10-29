import { globSync, readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

// Uma requisição RSC de navegação (RSC: 1 + Next-Router-State-Tree) pode renderizar só a página, sem passar pelo
// layout do (time). Por isso toda page.tsx e todo layout.tsx daqui conferem o ator antes de ler qualquer dado
// (docs/09 §4.1, camada 1), e o generateMetadata também, porque ele lê dados para montar o título.

const RAIZ = path.resolve(import.meta.dirname, "..");

const ARQUIVOS = globSync("**/{page,layout}.tsx", { cwd: RAIZ }).sort();

/** Corpo das funções que o Next chama ao renderizar: o componente padrão e o generateMetadata. */
function funcoesRenderizadas(texto: string): { nome: string; primeiraInstrucao: string }[] {
  const encontradas: { nome: string; primeiraInstrucao: string }[] = [];
  const cabecalho = /^export (?:default (async )?function (\w+)|(async )?function (generateMetadata))\([^]*?\)\s*(?::[^{]*)?\{$/gm;
  for (let achado = cabecalho.exec(texto); achado; achado = cabecalho.exec(texto)) {
    const nome = achado[2] ?? achado[4]!;
    const corpo = texto.slice(achado.index + achado[0].length).split("\n");
    const primeiraInstrucao = corpo.map((linha) => linha.trim()).find((linha) => linha && !linha.startsWith("//") && !linha.startsWith("/*") && !linha.startsWith("*")) ?? "";
    encontradas.push({ nome, primeiraInstrucao });
  }
  return encontradas;
}

describe("toda página e layout do (time) exige o ator primeiro", () => {
  it("encontra as páginas e os layouts", () => {
    expect(ARQUIVOS.length).toBeGreaterThanOrEqual(30);
    expect(ARQUIVOS).toContain("layout.tsx");
    expect(ARQUIVOS).toContain("pessoas/[pessoaId]/page.tsx");
  });

  it.each(ARQUIVOS)("%s", (arquivo) => {
    const funcoes = funcoesRenderizadas(readFileSync(path.join(RAIZ, arquivo), "utf8"));
    expect(funcoes.map((funcao) => funcao.nome).length, "sem export default function").toBeGreaterThan(0);
    for (const { nome, primeiraInstrucao } of funcoes) {
      expect(primeiraInstrucao, `${nome}: a primeira instrução precisa ser await exigirAtor()`).toMatch(/\bawait exigirAtor\(\)/);
    }
  });
});
