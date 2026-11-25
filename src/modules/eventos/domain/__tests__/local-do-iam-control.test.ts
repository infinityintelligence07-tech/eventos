import { describe, expect, it } from "vitest";

import {
  ajustarLocalDoIamControlSchema,
  chaveDoLocal,
  correspondentesDoIamControl,
  type LocalParaCorresponder,
  mudancasVindasDoIamControl,
  rotuloDaOrigemDoLocal,
  textoParaComparar,
} from "../local";

describe("comparação de nome e cidade", () => {
  it("ignora maiúsculas, acentos e espaços repetidos", () => {
    expect(textoParaComparar("  Hotel   SIBARA Flat & Convenções ")).toBe("hotel sibara flat & convencoes");
    expect(textoParaComparar("Balneário\tCamboriú")).toBe("balneario camboriu");
    expect(textoParaComparar("ÁÀÂÃÄ éèêë íìîï óòôõö úùûü Çç Ññ")).toBe("aaaaa eeee iiii ooooo uuuu cc nn");
  });

  it("não confunde nomes diferentes: pontuação e números contam", () => {
    expect(textoParaComparar("Hotel S. Paulo")).not.toBe(textoParaComparar("Hotel S Paulo"));
    expect(textoParaComparar("P7 Eventos")).not.toBe(textoParaComparar("P 7 Eventos"));
    expect(textoParaComparar("Hotel Ibis 2")).not.toBe(textoParaComparar("Hotel Ibis"));
  });

  it("a chave do local é nome + cidade + UF", () => {
    const sibara = chaveDoLocal({ nome: "Hotel Sibara", cidade: "Balneário Camboriú", uf: "SC" });
    expect(chaveDoLocal({ nome: " hotel  sibara", cidade: "BALNEARIO CAMBORIU", uf: "sc" })).toBe(sibara);
    expect(chaveDoLocal({ nome: "Hotel Sibara", cidade: "Itajaí", uf: "SC" })).not.toBe(sibara);
    expect(chaveDoLocal({ nome: "Hotel Sibara", cidade: "Balneário Camboriú", uf: "PR" })).not.toBe(sibara);
    // O separador não deixa nome e cidade se misturarem.
    expect(chaveDoLocal({ nome: "Hotel", cidade: "Sibara Centro", uf: "SC" })).not.toBe(chaveDoLocal({ nome: "Hotel Sibara", cidade: "Centro", uf: "SC" }));
  });
});

describe("cadastros do Eventos que são o local do IAM Control", () => {
  const sibara = { nome: "Hotel Sibara", cidade: "Balneário Camboriú", uf: "SC", iamControlEnderecoId: null, cadastrado: true };
  let sequencia = 0;
  const cadastro = (mudanca: Partial<LocalParaCorresponder> = {}): LocalParaCorresponder => ({
    id: `local-${++sequencia}`,
    tipo: "EVENTO",
    origem: "EVENTOS",
    iamControlEnderecoId: null,
    nome: "Hotel Sibara",
    cidade: "Balneário Camboriú",
    uf: "SC",
    criadoEm: new Date(2026, 0, sequencia),
    ...mudanca,
  });
  const ids = (locais: LocalParaCorresponder[]) => locais.map((local) => local.id);

  it("casa pelo nome + cidade + UF, com local de evento e com hotel; apartamento e outra cidade ficam de fora", () => {
    const hotel = cadastro({ tipo: "HOTEL", nome: "HOTEL SIBARA", cidade: "balneario camboriu" });
    const evento = cadastro();
    const apartamento = cadastro({ tipo: "APARTAMENTO" });
    const outraCidade = cadastro({ cidade: "Itajaí" });
    const outroNome = cadastro({ nome: "Hotel Sibara Flat" });
    // O local de evento vem primeiro (é o que o evento usa), mesmo cadastrado depois do hotel.
    expect(ids(correspondentesDoIamControl(sibara, [hotel, evento, apartamento, outraCidade, outroNome]))).toEqual([evento.id, hotel.id]);
  });

  it("sem local de evento, o hotel cadastrado à mão é o que o evento usa (liga, não duplica)", () => {
    const hotel = cadastro({ tipo: "HOTEL" });
    expect(ids(correspondentesDoIamControl(sibara, [hotel]))).toEqual([hotel.id]);
    expect(correspondentesDoIamControl(sibara, [cadastro({ tipo: "APARTAMENTO" })])).toEqual([]);
  });

  it("entre dois do mesmo tipo, o que já veio do IAM Control e depois o mais antigo", () => {
    const antigo = cadastro();
    const doIamControl = cadastro({ origem: "IAM_CONTROL" });
    const novo = cadastro();
    expect(ids(correspondentesDoIamControl(sibara, [novo, antigo, doIamControl]))).toEqual([doIamControl.id, antigo.id, novo.id]);
  });

  it("endereço digitado na turma (sem cadastro no IAM Control) só casa com local de evento", () => {
    const hotel = cadastro({ tipo: "HOTEL" });
    const evento = cadastro();
    expect(ids(correspondentesDoIamControl({ ...sibara, cadastrado: false }, [hotel, evento]))).toEqual([evento.id]);
  });

  it("com o id do IAM Control: o id vence o nome, e outro id com o mesmo nome é outro local", () => {
    const comId = { ...sibara, iamControlEnderecoId: 7, nome: "Hotel Sibara Flat & Convention" };
    const renomeado = cadastro({ origem: "IAM_CONTROL", iamControlEnderecoId: 7 });
    const homonimoDeOutroId = cadastro({ origem: "IAM_CONTROL", iamControlEnderecoId: 8, nome: "Hotel Sibara Flat & Convention" });
    const aMaoComNomeNovo = cadastro({ tipo: "HOTEL", nome: "hotel sibara flat & convention" });
    expect(ids(correspondentesDoIamControl(comId, [aMaoComNomeNovo, homonimoDeOutroId, renomeado]))).toEqual([renomeado.id, aMaoComNomeNovo.id]);
    // Enquanto o Eventos não tem o id gravado, o primeiro encontro é pelo nome.
    const semIdAinda = cadastro({ origem: "IAM_CONTROL" });
    expect(ids(correspondentesDoIamControl({ ...sibara, iamControlEnderecoId: 7 }, [semIdAinda]))).toEqual([semIdAinda.id]);
  });
});

describe("o que muda no cadastro quando o IAM Control manda o local", () => {
  const doIamControl = { nome: "Hotel Sibara", cidade: "Balneário Camboriú", uf: "SC", cep: "88330000", logradouro: "Av. Brasil", numero: "1500", bairro: "Centro" };

  it("só os campos do IAM Control que estão diferentes", () => {
    expect(mudancasVindasDoIamControl({ ...doIamControl }, doIamControl)).toEqual({});
    expect(mudancasVindasDoIamControl({ ...doIamControl, nome: "hotel sibara", numero: null, cep: "88330-000" }, doIamControl)).toEqual({
      nome: { de: "hotel sibara", para: "Hotel Sibara" },
      numero: { de: null, para: "1500" },
      cep: { de: "88330-000", para: "88330000" },
    });
  });

  it("complemento, tipo, capacidade e localização não são do IAM Control", () => {
    const comOQueEhDoEventos = { ...doIamControl, complemento: "Torre B", tipo: "HOTEL", capacidade: 80, lat: -26.99, lng: -48.63 };
    expect(mudancasVindasDoIamControl(comOQueEhDoEventos, doIamControl)).toEqual({});
  });
});

describe("ajustar local vindo do IAM Control", () => {
  const base = { localId: "0198a6f0-0000-7000-8000-000000000001", tipo: "HOTEL" };

  it("aceita só o que é do Eventos e descarta nome e endereço", () => {
    expect(
      ajustarLocalDoIamControlSchema.parse({ ...base, nome: "Outro Nome", cidade: "Outra", logradouro: "Rua X", complemento: " Torre B ", capacidade: "350", lat: "-26,99", lng: "-48.63" }),
    ).toEqual({ ...base, complemento: "Torre B", capacidade: 350, lat: -26.99, lng: -48.63 });
    expect(ajustarLocalDoIamControlSchema.parse(base)).toEqual({ ...base, complemento: null, capacidade: null, lat: null, lng: null });
  });

  it.each([
    [{ tipo: "APARTAMENTO" }, "tipo"],
    [{ lat: "-3.1" }, "lng"],
    [{ capacidade: "0" }, "capacidade"],
    [{ localId: "x" }, "localId"],
  ])("recusa %o no campo %s", (mudanca, campo) => {
    const lido = ajustarLocalDoIamControlSchema.safeParse({ ...base, ...mudanca });
    expect(lido.success).toBe(false);
    expect(lido.error?.issues.map((issue) => issue.path.join("."))).toContain(campo);
  });

  it("rótulos da origem", () => {
    expect(rotuloDaOrigemDoLocal("IAM_CONTROL")).toBe("IAM Control");
    expect(rotuloDaOrigemDoLocal("EVENTOS")).toBe("Cadastrado no Eventos");
  });
});
