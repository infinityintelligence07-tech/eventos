import { describe, expect, it } from "vitest";

import { mesmoDono } from "../dono";

describe("dono do sistema (EVENTOS_DONO_EMAIL)", () => {
  it("só o e-mail configurado, sem diferenciar maiúsculas", () => {
    expect(mesmoDono("Dono@Exemplo.test", "dono@exemplo.test")).toBe(true);
    expect(mesmoDono(" dono@exemplo.test ", "dono@exemplo.test")).toBe(true);
    expect(mesmoDono("outro@exemplo.test", "dono@exemplo.test")).toBe(false);
  });

  it("sem dono configurado ou sem e-mail no ator, ninguém é dono", () => {
    expect(mesmoDono("dono@exemplo.test", undefined)).toBe(false);
    expect(mesmoDono(null, "dono@exemplo.test")).toBe(false);
    expect(mesmoDono("", "dono@exemplo.test")).toBe(false);
  });
});
