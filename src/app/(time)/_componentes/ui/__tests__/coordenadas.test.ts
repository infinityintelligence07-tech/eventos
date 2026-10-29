import { describe, expect, it } from "vitest";

import { lerCoordenadas } from "../coordenadas";

describe("lerCoordenadas", () => {
  it.each([
    ["-26.94209, -48.63893", { lat: -26.94209, lng: -48.63893 }],
    ["-26.94209,-48.63893", { lat: -26.94209, lng: -48.63893 }],
    ["26.9,48.6", { lat: 26.9, lng: 48.6 }],
    ["-26,94, -48,63", { lat: -26.94, lng: -48.63 }],
    ["-26,94; -48,63", { lat: -26.94, lng: -48.63 }],
    ["-26,94 -48,63", { lat: -26.94, lng: -48.63 }],
    ["-26,94,-48,63", { lat: -26.94, lng: -48.63 }],
    ["  -3, -60  ", { lat: -3, lng: -60 }],
  ])("%s", (texto, esperado) => {
    expect(lerCoordenadas(texto)).toEqual(esperado);
  });

  it.each(["", "Balneário Camboriú", "-26,94", "26,94,48,63", "-95, 10", "10, 200", "1, 2, 3"])("recusa %j", (texto) => {
    expect(lerCoordenadas(texto)).toBeNull();
  });
});
