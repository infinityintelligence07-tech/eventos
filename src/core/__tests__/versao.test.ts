import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { VERSAO_SEM_BUILD, versaoDoCodigo } from "../versao";

describe("versão do código", () => {
  const pasta = () => mkdtempSync(path.join(tmpdir(), "versao-"));

  it("lê a impressão digital gravada no build", () => {
    const dir = pasta();
    writeFileSync(path.join(dir, ".versao"), "0123456789abcdef\n");
    expect(versaoDoCodigo(dir)).toBe("0123456789abcdef");
  });

  it("sem arquivo ou com conteúdo estranho, responde que não é uma imagem publicada", () => {
    expect(versaoDoCodigo(pasta())).toBe(VERSAO_SEM_BUILD);
    const dir = pasta();
    writeFileSync(path.join(dir, ".versao"), "<html>erro</html>");
    expect(versaoDoCodigo(dir)).toBe(VERSAO_SEM_BUILD);
  });
});
