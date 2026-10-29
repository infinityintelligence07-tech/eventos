import { describe, expect, it } from "vitest";

import { distanciaKm } from "../distancia";
import { type Candidato, ordenarSugestoes, pontuacaoDaSugestao } from "../sugestao";

const candidato = (nome: string, dados: Partial<Candidato> = {}): Candidato => ({
  pessoaId: nome,
  nome,
  disponibilidade: "SEM_RESPOSTA",
  nivel: "HABILITADO",
  distanciaKm: 10,
  convocacoesUltimos90Dias: 0,
  diasDesdeUltima: null,
  jaNoEvento: false,
  conflitos: [],
  ...dados,
});

const nomes = (lista: Candidato[]) => lista.map((item) => item.nome);

describe("ordem das sugestões", () => {
  it("disponibilidade pesa mais que função, distância e rodízio", () => {
    const { sugeridos } = ordenarSugestoes([
      candidato("sem-resposta-perto", { distanciaKm: 1 }),
      candidato("pode-longe-trainee", { disponibilidade: "PODE", nivel: "TRAINEE", distanciaKm: 400 }),
    ]);
    expect(nomes(sugeridos)).toEqual(["pode-longe-trainee", "sem-resposta-perto"]);
  });

  it("depois da disponibilidade: habilitado → trainee → sem a função", () => {
    const { sugeridos } = ordenarSugestoes([
      candidato("sem-funcao", { nivel: "SEM_FUNCAO" }),
      candidato("trainee", { nivel: "TRAINEE" }),
      candidato("habilitado", { nivel: "HABILITADO", distanciaKm: 200 }),
    ]);
    expect(nomes(sugeridos)).toEqual(["habilitado", "trainee", "sem-funcao"]);
  });

  it("distância em faixas de 50 km; sem coordenada vai para o fim", () => {
    const { sugeridos } = ordenarSugestoes([
      candidato("sem-coordenada", { distanciaKm: null }),
      candidato("80km", { distanciaKm: 80 }),
      candidato("49km-rodou-muito", { distanciaKm: 49, convocacoesUltimos90Dias: 3 }),
      candidato("5km-rodou-muito", { distanciaKm: 5, convocacoesUltimos90Dias: 3 }),
      candidato("30km-descansado", { distanciaKm: 30 }),
    ]);
    // 49, 5 e 30 km estão na mesma faixa: o rodízio decide.
    expect(nomes(sugeridos)).toEqual(["30km-descansado", "49km-rodou-muito", "5km-rodou-muito", "80km", "sem-coordenada"]);
  });

  it("rodízio: menos convocações, depois mais tempo parado", () => {
    const { sugeridos } = ordenarSugestoes([
      candidato("trabalhou-ontem", { convocacoesUltimos90Dias: 1, diasDesdeUltima: 1 }),
      candidato("trabalhou-mes-passado", { convocacoesUltimos90Dias: 1, diasDesdeUltima: 30 }),
      candidato("nunca", { convocacoesUltimos90Dias: 0 }),
    ]);
    expect(nomes(sugeridos)).toEqual(["nunca", "trabalhou-mes-passado", "trabalhou-ontem"]);
  });

  it("quem já está no evento sai; quem não pode fica num grupo à parte; conflito só marca", () => {
    const resultado = ordenarSugestoes([
      candidato("no-evento", { jaNoEvento: true, disponibilidade: "PODE" }),
      candidato("nao-pode", { disponibilidade: "NAO_PODE" }),
      candidato("conflito", { conflitos: ["MC_POA_POA"] }),
    ]);
    expect(nomes(resultado.sugeridos)).toEqual(["conflito"]);
    expect(nomes(resultado.naoPodem)).toEqual(["nao-pode"]);
  });

  it("pontuação de 0 a 100 cabe em sugestao_score", () => {
    expect(pontuacaoDaSugestao(candidato("melhor", { disponibilidade: "PODE", distanciaKm: 0 }))).toBe(100);
    expect(pontuacaoDaSugestao(candidato("pior", { disponibilidade: "NAO_PODE", nivel: "SEM_FUNCAO", distanciaKm: null, convocacoesUltimos90Dias: 9 }))).toBe(0);
  });
});

describe("distância em linha reta", () => {
  it("Porto Alegre → Canoas ≈ 15 km; sem coordenada é nulo", () => {
    const km = distanciaKm({ lat: -30.0346, lng: -51.2177 }, { lat: -29.9178, lng: -51.1839 });
    expect(km).toBeGreaterThan(12);
    expect(km).toBeLessThan(15);
    expect(distanciaKm(null, { lat: 0, lng: 0 })).toBeNull();
  });
});
