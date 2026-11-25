import { describe, expect, it } from "vitest";

import { normalizarBusca as normalizarBuscaDaDisponibilidade } from "@/modules/disponibilidade/domain/respostas";
import { normalizarBusca as normalizarBuscaDePessoas } from "@/modules/pessoas/domain/lista";

import {
  ALTURA_MAXIMA_DA_LISTA,
  alturaEstimada,
  anuncioDosResultados,
  avisoDoCorte,
  comOpcaoVazia,
  type ContextoDoSeletor,
  emGrupos,
  entraNoEnvio,
  type EstadoDoSeletor,
  type EventoDoSeletor,
  filtrarOpcoes,
  LIMITE_DA_LISTA_CURTA,
  moverAtivo,
  normalizarTexto,
  type OpcaoDoSeletor,
  PASSO_DA_LISTA,
  posicionar,
  pularParaTexto,
  SELETOR_FECHADO,
  temBusca,
  tetoDaLista,
  transicao,
  valorEfetivo,
} from "../seletor-logica";

const opcao = (rotulo: string, extra: Partial<OpcaoDoSeletor> = {}): OpcaoDoSeletor => ({ valor: rotulo, rotulo, ...extra });
const rotulos = (opcoes: OpcaoDoSeletor[]) => opcoes.map((item) => item.rotulo);

const PESSOAS = [opcao("Ana Souza"), opcao("André Luís"), opcao("João da Silva"), opcao("Mariana Ângelo"), opcao("Zé Antônio")];

describe("normalizarTexto", () => {
  it("tira acentos, maiúsculas e espaços das pontas", () => {
    expect(normalizarTexto("  JOÃO Ângelo  ")).toBe("joao angelo");
    expect(normalizarTexto("São José dos Pinhais – PR")).toBe("sao jose dos pinhais – pr");
  });

  it("é a mesma regra das buscas de Pessoas e de Disponibilidade", () => {
    for (const texto of ["  JOÃO Ângelo  ", "Açaí com ÇEDILHA", "IPR_POA_12 · 16/12", "", "ñ ü ô"]) {
      expect(normalizarTexto(texto)).toBe(normalizarBuscaDePessoas(texto));
      expect(normalizarTexto(texto)).toBe(normalizarBuscaDaDisponibilidade(texto));
    }
  });
});

describe("temBusca", () => {
  it("sem pedir, a busca aparece só acima do limite da lista curta", () => {
    expect(temBusca(LIMITE_DA_LISTA_CURTA)).toBe(false);
    expect(temBusca(LIMITE_DA_LISTA_CURTA + 1)).toBe(true);
    expect(temBusca(0)).toBe(false);
  });

  it("quem pede manda, para um lado e para o outro", () => {
    expect(temBusca(2, true)).toBe(true);
    expect(temBusca(500, false)).toBe(false);
  });
});

describe("valorEfetivo", () => {
  const opcoes = [opcao("A", { desabilitada: true }), opcao("B"), opcao("C")];

  it("fica com o valor pedido quando ele existe na lista, mesmo desabilitado", () => {
    expect(valorEfetivo(opcoes, "C", false)).toBe("C");
    expect(valorEfetivo(opcoes, "A", false)).toBe("A");
  });

  it("sem valor e sem vazio, vale a primeira opção que pode ser escolhida (como o select nativo)", () => {
    expect(valorEfetivo(opcoes, undefined, false)).toBe("B");
    expect(valorEfetivo(opcoes, null, false)).toBe("B");
    expect(valorEfetivo(opcoes, "", false)).toBe("B");
    expect(valorEfetivo(opcoes, "não existe", false)).toBe("B");
  });

  it("com opção vazia ou texto de escolha, o que não existe vira vazio", () => {
    expect(valorEfetivo(comOpcaoVazia(opcoes, "Todos"), "", true)).toBe("");
    expect(valorEfetivo(comOpcaoVazia(opcoes, "Todos"), "não existe", true)).toBe("");
    expect(valorEfetivo(opcoes, undefined, true)).toBe("");
    expect(valorEfetivo(opcoes, "C", true)).toBe("C");
  });

  it("lista vazia manda vazio", () => {
    expect(valorEfetivo([], "x", false)).toBe("");
    expect(valorEfetivo([opcao("A", { desabilitada: true })], undefined, false)).toBe("");
  });
});

describe("entraNoEnvio", () => {
  it("com valor, o campo sempre é enviado", () => {
    expect(entraNoEnvio("x", false, false)).toBe(true);
    expect(entraNoEnvio("x", false, true)).toBe(true);
  });

  it("vazio com opção vazia (\"Todos\", \"—\") é enviado como texto vazio", () => {
    expect(entraNoEnvio("", true, false)).toBe(true);
    expect(entraNoEnvio("", true, true)).toBe(true);
  });

  it("vazio só com o texto de escolha não é enviado (a opção desabilitada do select nativo também não era)", () => {
    expect(entraNoEnvio("", false, true)).toBe(false);
  });

  it("lista sem nenhuma opção manda vazio, como antes", () => {
    expect(entraNoEnvio("", false, false)).toBe(true);
  });
});

describe("comOpcaoVazia", () => {
  it("a opção vazia é a primeira, com valor vazio", () => {
    expect(comOpcaoVazia([opcao("A")], "Todos")).toEqual([{ valor: "", rotulo: "Todos" }, opcao("A")]);
  });

  it("sem vazio, a lista é a mesma", () => {
    const opcoes = [opcao("A")];
    expect(comOpcaoVazia(opcoes, undefined)).toBe(opcoes);
  });
});

describe("filtrarOpcoes", () => {
  it("busca vazia devolve a lista inteira, na ordem", () => {
    expect(filtrarOpcoes(PESSOAS, "")).toBe(PESSOAS);
    expect(filtrarOpcoes(PESSOAS, "   ")).toBe(PESSOAS);
  });

  it("não diferencia maiúsculas nem acentos, nos dois sentidos", () => {
    expect(rotulos(filtrarOpcoes(PESSOAS, "JOAO"))).toEqual(["João da Silva"]);
    expect(rotulos(filtrarOpcoes(PESSOAS, "ângelo"))).toEqual(["Mariana Ângelo"]);
    expect(rotulos(filtrarOpcoes(PESSOAS, "ze"))).toEqual(["Zé Antônio"]);
  });

  it("todas as palavras precisam aparecer, em qualquer ordem", () => {
    expect(rotulos(filtrarOpcoes(PESSOAS, "silva joão"))).toEqual(["João da Silva"]);
    expect(rotulos(filtrarOpcoes(PESSOAS, "joão souza"))).toEqual([]);
  });

  it("quem começa pelo que foi digitado vem antes; depois quem tem palavra começando; depois o resto", () => {
    expect(rotulos(filtrarOpcoes(PESSOAS, "an"))).toEqual(["Ana Souza", "André Luís", "Mariana Ângelo", "Zé Antônio"]);
    expect(rotulos(filtrarOpcoes([opcao("Mariana"), opcao("Luana Dias"), opcao("Ana"), opcao("Dra. Ana")], "ana"))).toEqual(["Ana", "Dra. Ana", "Mariana", "Luana Dias"]);
  });

  it("código de evento conta como palavras separadas", () => {
    const eventos = [opcao("CONF_SP_10 · 10/12"), opcao("IPR_POA_12 · 16/12"), opcao("POA_LIDER · 20/12")];
    expect(rotulos(filtrarOpcoes(eventos, "poa"))).toEqual(["POA_LIDER · 20/12", "IPR_POA_12 · 16/12"]);
    expect(rotulos(filtrarOpcoes(eventos, "16/12"))).toEqual(["IPR_POA_12 · 16/12"]);
  });

  it("a descrição e o grupo também são procurados", () => {
    const hoteis = [opcao("Hotel Atlântico", { descricao: "Porto Alegre – RS" }), opcao("Hotel Central", { descricao: "Curitiba – PR" })];
    expect(rotulos(filtrarOpcoes(hoteis, "curitiba"))).toEqual(["Hotel Central"]);
    expect(rotulos(filtrarOpcoes(hoteis, "hotel porto"))).toEqual(["Hotel Atlântico"]);
    expect(rotulos(filtrarOpcoes([opcao("Quarto 2", { grupo: "Outro quarto" }), opcao("Bia", { grupo: "Trocar de lugar com" })], "trocar"))).toEqual(["Bia"]);
  });

  it("em lista com grupos a ordem recebida fica (os grupos não se misturam)", () => {
    const opcoes = [opcao("Mariana", { grupo: "A" }), opcao("Ana", { grupo: "A" }), opcao("Ana Paula", { grupo: "B" })];
    expect(rotulos(filtrarOpcoes(opcoes, "ana"))).toEqual(["Mariana", "Ana", "Ana Paula"]);
  });

  it("não muda a lista recebida", () => {
    const copia = [...PESSOAS];
    filtrarOpcoes(PESSOAS, "an");
    expect(PESSOAS).toEqual(copia);
  });

  it("aguenta centenas de opções", () => {
    const muitas = Array.from({ length: 800 }, (_, indice) => opcao(`Pessoa ${String(indice).padStart(3, "0")}`));
    // "79" em qualquer lugar do número: 079, 179, … 779 (8) e 790 a 799 (10).
    expect(filtrarOpcoes(muitas, "pessoa 79")).toHaveLength(18);
    expect(filtrarOpcoes(muitas, "799")).toEqual([opcao("Pessoa 799")]);
  });
});

describe("emGrupos", () => {
  it("opções seguidas do mesmo grupo viram um bloco, com o índice da lista inteira", () => {
    const blocos = emGrupos([opcao("Solta"), opcao("Q1", { grupo: "Outro quarto" }), opcao("Q2", { grupo: "Outro quarto" }), opcao("Bia", { grupo: "Trocar de lugar com" })]);
    expect(blocos.map((bloco) => [bloco.grupo, bloco.itens.map((item) => `${item.indice}:${item.opcao.rotulo}`)])).toEqual([
      [null, ["0:Solta"]],
      ["Outro quarto", ["1:Q1", "2:Q2"]],
      ["Trocar de lugar com", ["3:Bia"]],
    ]);
  });

  it("lista vazia não tem bloco", () => {
    expect(emGrupos([])).toEqual([]);
  });
});

describe("moverAtivo", () => {
  //                0     1      2     3      4
  const opcoes = [{}, { desabilitada: true }, {}, { desabilitada: true }, {}];

  it("vai para a próxima e a anterior pulando as desabilitadas", () => {
    expect(moverAtivo(opcoes, 0, "proxima")).toBe(2);
    expect(moverAtivo(opcoes, 2, "proxima")).toBe(4);
    expect(moverAtivo(opcoes, 4, "anterior")).toBe(2);
    expect(moverAtivo(opcoes, 2, "anterior")).toBe(0);
  });

  it("para nas pontas, sem dar a volta", () => {
    expect(moverAtivo(opcoes, 4, "proxima")).toBe(4);
    expect(moverAtivo(opcoes, 0, "anterior")).toBe(0);
  });

  it("sem opção ativa, a seta para baixo começa na primeira e a para cima na última", () => {
    expect(moverAtivo(opcoes, -1, "proxima")).toBe(0);
    expect(moverAtivo(opcoes, -1, "anterior")).toBe(4);
  });

  it("Home e End vão à primeira e à última que podem ser escolhidas", () => {
    const comPontasFechadas = [{ desabilitada: true }, {}, {}, { desabilitada: true }];
    expect(moverAtivo(comPontasFechadas, 2, "primeira")).toBe(1);
    expect(moverAtivo(comPontasFechadas, 1, "ultima")).toBe(2);
  });

  it("PageDown e PageUp pulam dez e param na ponta", () => {
    const longa = Array.from({ length: 35 }, () => ({}));
    expect(moverAtivo(longa, 3, "pagina-abaixo")).toBe(13);
    expect(moverAtivo(longa, 30, "pagina-abaixo")).toBe(34);
    expect(moverAtivo(longa, 13, "pagina-acima")).toBe(3);
    expect(moverAtivo(longa, 4, "pagina-acima")).toBe(0);
  });

  it("lista vazia ou toda desabilitada não tem opção ativa", () => {
    expect(moverAtivo([], -1, "proxima")).toBe(-1);
    expect(moverAtivo([], -1, "ultima")).toBe(-1);
    expect(moverAtivo([{ desabilitada: true }], -1, "primeira")).toBe(-1);
    expect(moverAtivo([{ desabilitada: true }], -1, "proxima")).toBe(-1);
  });
});

describe("pularParaTexto", () => {
  const ufs = [opcao("Acre"), opcao("Amapá"), opcao("Maranhão"), opcao("Minas Gerais"), opcao("São Paulo"), opcao("Santa Catarina", { desabilitada: true })];

  it("uma letra vai para a próxima opção que começa com ela", () => {
    expect(pularParaTexto(ufs, -1, "m")).toBe(2);
    expect(pularParaTexto(ufs, 2, "m")).toBe(3);
  });

  it("a mesma letra repetida dá a volta", () => {
    expect(pularParaTexto(ufs, 3, "mm")).toBe(2);
    expect(pularParaTexto(ufs, 1, "aaa")).toBe(0);
  });

  it("letras diferentes procuram o começo do texto, a partir da ativa", () => {
    expect(pularParaTexto(ufs, 2, "mi")).toBe(3);
    expect(pularParaTexto(ufs, 0, "am")).toBe(1);
    expect(pularParaTexto(ufs, 1, "am")).toBe(1);
  });

  it("não diferencia acentos nem maiúsculas e pula as desabilitadas", () => {
    expect(pularParaTexto(ufs, -1, "SAO")).toBe(4);
    expect(pularParaTexto(ufs, 4, "s")).toBe(4);
    expect(pularParaTexto(ufs, -1, "sa")).toBe(4);
  });

  it("sem opção que comece assim, fica onde está", () => {
    expect(pularParaTexto(ufs, 2, "x")).toBe(2);
    expect(pularParaTexto(ufs, 2, "")).toBe(2);
    expect(pularParaTexto([], -1, "a")).toBe(-1);
  });
});

describe("tetoDaLista", () => {
  it("começa em um bloco e nunca passa do total", () => {
    expect(tetoDaLista(PASSO_DA_LISTA, -1, 320)).toBe(50);
    expect(tetoDaLista(PASSO_DA_LISTA, -1, 12)).toBe(12);
    expect(tetoDaLista(PASSO_DA_LISTA, -1, 0)).toBe(0);
  });

  it("cresce em blocos até a opção ativa estar desenhada", () => {
    expect(tetoDaLista(50, 49, 320)).toBe(50);
    expect(tetoDaLista(50, 50, 320)).toBe(100);
    expect(tetoDaLista(50, 319, 320)).toBe(320);
    expect(tetoDaLista(50, 130, 320)).toBe(150);
  });

  it("não encolhe o que já está desenhado", () => {
    expect(tetoDaLista(150, 3, 320)).toBe(150);
  });
});

describe("textos da lista", () => {
  it("anuncia a quantidade para o leitor de tela", () => {
    expect(anuncioDosResultados(0, "xyz")).toBe("Nenhum resultado");
    expect(anuncioDosResultados(1, "jo")).toBe("1 resultado");
    expect(anuncioDosResultados(12, "jo")).toBe("12 resultados");
    expect(anuncioDosResultados(320, "")).toBe("320 opções");
    expect(anuncioDosResultados(1, "  ")).toBe("1 opção");
  });

  it("avisa quando nem tudo está desenhado", () => {
    expect(avisoDoCorte(50, 320)).toBe("Mostrando 50 de 320. Continue digitando ou role a lista para ver mais.");
    expect(avisoDoCorte(12, 12)).toBeNull();
    expect(avisoDoCorte(0, 0)).toBeNull();
  });
});

// ---------- Máquina de estados ----------

const CURTA: ContextoDoSeletor = {
  opcoes: [opcao("Líder"), opcao("Time"), opcao("Bloqueado", { desabilitada: true }), opcao("Retirar acesso")],
  comBusca: false,
  valor: "Time",
};

const LONGA: ContextoDoSeletor = { opcoes: comOpcaoVazia(PESSOAS, "Escolha a pessoa"), comBusca: true, valor: "" };

/** Aplica os eventos em sequência e devolve o último resultado. */
function rodar(contexto: ContextoDoSeletor, eventos: EventoDoSeletor[], inicio: EstadoDoSeletor = SELETOR_FECHADO) {
  let resultado = { estado: inicio, efeitos: [] as ReturnType<typeof transicao>["efeitos"], prevenir: false };
  for (const evento of eventos) resultado = transicao(resultado.estado, evento, contexto);
  return resultado;
}
const tecla = (nome: string, comModificador = false): EventoDoSeletor => ({ tipo: "tecla", tecla: nome, comModificador });
const ativa = (contexto: ContextoDoSeletor, estado: EstadoDoSeletor) => (contexto.comBusca ? filtrarOpcoes(contexto.opcoes, estado.busca) : contexto.opcoes)[estado.ativo]?.rotulo;

describe("transicao · lista fechada", () => {
  it.each(["ArrowDown", "ArrowUp", "Enter", " "])("%j abre na opção escolhida e não deixa a página rolar nem o formulário enviar", (nome) => {
    const { estado, efeitos, prevenir } = rodar(CURTA, [tecla(nome)]);
    expect(estado.aberto).toBe(true);
    expect(ativa(CURTA, estado)).toBe("Time");
    expect(efeitos).toEqual([]);
    expect(prevenir).toBe(true);
  });

  it("Home abre na primeira e End na última que pode ser escolhida", () => {
    expect(ativa(CURTA, rodar(CURTA, [tecla("Home")]).estado)).toBe("Líder");
    expect(ativa(CURTA, rodar(CURTA, [tecla("End")]).estado)).toBe("Retirar acesso");
  });

  it("sem valor escolhido (ou com ele desabilitado), abre na primeira livre", () => {
    expect(ativa(CURTA, rodar({ ...CURTA, valor: "" }, [tecla("ArrowDown")]).estado)).toBe("Líder");
    expect(ativa(CURTA, rodar({ ...CURTA, valor: "Bloqueado" }, [tecla("ArrowDown")]).estado)).toBe("Líder");
  });

  it("Tab, Esc e teclas de controle passam direto, sem abrir", () => {
    for (const nome of ["Tab", "Escape", "Shift", "F5", "Backspace"]) {
      const { estado, prevenir } = rodar(CURTA, [tecla(nome)]);
      expect(estado).toBe(SELETOR_FECHADO);
      expect(prevenir).toBe(false);
    }
  });

  it("atalho com Ctrl, Cmd ou Alt não é digitação", () => {
    const { estado, prevenir } = rodar(CURTA, [tecla("r", true)]);
    expect(estado.aberto).toBe(false);
    expect(prevenir).toBe(false);
  });

  it("lista curta: uma letra abre e pula para a opção que começa com ela", () => {
    const { estado, prevenir } = rodar(CURTA, [tecla("r")]);
    expect(estado.aberto).toBe(true);
    expect(ativa(CURTA, estado)).toBe("Retirar acesso");
    expect(estado.digitado).toBe("r");
    expect(prevenir).toBe(true);
  });

  it("lista longa: uma letra abre com ela já na busca, na primeira opção encontrada", () => {
    const { estado, prevenir } = rodar(LONGA, [tecla("j")]);
    expect(estado).toMatchObject({ aberto: true, busca: "j", ativo: 0 });
    expect(ativa(LONGA, estado)).toBe("João da Silva");
    expect(prevenir).toBe(true);
  });

  it("clique: abre na opção escolhida; clique de novo fecha", () => {
    const aberto = rodar(CURTA, [{ tipo: "abrir" }]);
    expect(ativa(CURTA, aberto.estado)).toBe("Time");
    expect(rodar(CURTA, [{ tipo: "fechar" }], aberto.estado).estado).toBe(SELETOR_FECHADO);
  });
});

describe("transicao · lista curta aberta", () => {
  const aberto = rodar(CURTA, [{ tipo: "abrir" }]).estado;

  it("setas andam pelas opções, pulando a desabilitada e parando nas pontas", () => {
    expect(ativa(CURTA, rodar(CURTA, [tecla("ArrowDown")], aberto).estado)).toBe("Retirar acesso");
    expect(ativa(CURTA, rodar(CURTA, [tecla("ArrowDown"), tecla("ArrowDown")], aberto).estado)).toBe("Retirar acesso");
    expect(ativa(CURTA, rodar(CURTA, [tecla("ArrowUp"), tecla("ArrowUp")], aberto).estado)).toBe("Líder");
    expect(rodar(CURTA, [tecla("ArrowDown")], aberto).prevenir).toBe(true);
  });

  it("Home e End", () => {
    expect(ativa(CURTA, rodar(CURTA, [tecla("End")], aberto).estado)).toBe("Retirar acesso");
    expect(ativa(CURTA, rodar(CURTA, [tecla("End"), tecla("Home")], aberto).estado)).toBe("Líder");
  });

  it.each(["Enter", " "])("%j escolhe a opção ativa, fecha e devolve o foco ao campo", (nome) => {
    const { estado, efeitos, prevenir } = rodar(CURTA, [tecla("ArrowUp"), tecla(nome)], aberto);
    expect(estado).toBe(SELETOR_FECHADO);
    expect(efeitos).toEqual([{ tipo: "devolver-foco" }, { tipo: "escolher", valor: "Líder" }]);
    expect(prevenir).toBe(true);
  });

  it("Esc fecha sem escolher e devolve o foco", () => {
    const { estado, efeitos, prevenir } = rodar(CURTA, [tecla("ArrowDown"), tecla("Escape")], aberto);
    expect(estado).toBe(SELETOR_FECHADO);
    expect(efeitos).toEqual([{ tipo: "devolver-foco" }]);
    expect(prevenir).toBe(true);
  });

  it("Tab confirma a opção ativa e deixa o foco seguir adiante", () => {
    const { estado, efeitos, prevenir } = rodar(CURTA, [tecla("ArrowDown"), tecla("Tab")], aberto);
    expect(estado).toBe(SELETOR_FECHADO);
    expect(efeitos).toEqual([{ tipo: "devolver-foco" }, { tipo: "escolher", valor: "Retirar acesso" }]);
    expect(prevenir).toBe(false);
  });

  it("digitar pula para a opção; a mesma letra de novo vai para a seguinte", () => {
    const contexto: ContextoDoSeletor = { opcoes: [opcao("Carro próprio"), opcao("Carona"), opcao("Carro da IAM"), opcao("Uber")], comBusca: false, valor: "Uber" };
    const inicio = rodar(contexto, [{ tipo: "abrir" }]).estado;
    expect(ativa(contexto, rodar(contexto, [tecla("c")], inicio).estado)).toBe("Carro próprio");
    expect(ativa(contexto, rodar(contexto, [tecla("c"), tecla("c")], inicio).estado)).toBe("Carona");
    expect(ativa(contexto, rodar(contexto, [tecla("c"), tecla("a"), tecla("r"), tecla("r"), tecla("o"), tecla(" "), tecla("d")], inicio).estado)).toBe("Carro da IAM");
  });

  it("depois da pausa, a digitação recomeça", () => {
    const contexto: ContextoDoSeletor = { opcoes: [opcao("Carona"), opcao("Avião"), opcao("Ônibus")], comBusca: false, valor: "Carona" };
    const inicio = rodar(contexto, [{ tipo: "abrir" }]).estado;
    const { estado } = rodar(contexto, [tecla("a"), { tipo: "pausa-na-digitacao" }, tecla("o")], inicio);
    expect(ativa(contexto, estado)).toBe("Ônibus");
    expect(estado.digitado).toBe("o");
  });

  it("espaço fora de uma digitação escolhe; no meio dela faz parte do texto", () => {
    expect(rodar(CURTA, [tecla(" ")], aberto).efeitos).toContainEqual({ tipo: "escolher", valor: "Time" });
    const noMeio = rodar(CURTA, [tecla("r"), tecla(" ")], aberto);
    expect(noMeio.estado.aberto).toBe(true);
    expect(noMeio.efeitos).toEqual([]);
  });

  it("o mouse aponta uma opção; a desabilitada e as de fora da lista são ignoradas", () => {
    expect(ativa(CURTA, rodar(CURTA, [{ tipo: "apontar", indice: 0 }], aberto).estado)).toBe("Líder");
    expect(rodar(CURTA, [{ tipo: "apontar", indice: 2 }], aberto).estado).toBe(aberto);
    expect(rodar(CURTA, [{ tipo: "apontar", indice: 99 }], aberto).estado).toBe(aberto);
  });

  it("buscar não faz nada numa lista sem busca", () => {
    expect(rodar(CURTA, [{ tipo: "buscar", texto: "x" }], aberto).estado).toBe(aberto);
  });
});

describe("transicao · lista longa aberta (com busca)", () => {
  const aberto = rodar(LONGA, [{ tipo: "abrir" }]).estado;

  it("abre na opção escolhida (aqui, a vazia)", () => {
    expect(aberto).toMatchObject({ aberto: true, busca: "", ativo: 0 });
    expect(ativa(LONGA, aberto)).toBe("Escolha a pessoa");
  });

  it("digitar filtra e põe a primeira opção encontrada como ativa", () => {
    const { estado } = rodar(LONGA, [tecla("End"), { tipo: "buscar", texto: "an" }], aberto);
    expect(estado.busca).toBe("an");
    expect(ativa(LONGA, estado)).toBe("Ana Souza");
  });

  it("as setas andam só pelo que a busca deixou", () => {
    const { estado } = rodar(LONGA, [{ tipo: "buscar", texto: "an" }, tecla("ArrowDown"), tecla("ArrowDown"), tecla("ArrowDown"), tecla("ArrowDown")], aberto);
    expect(ativa(LONGA, estado)).toBe("Zé Antônio");
  });

  it("Enter escolhe a ativa da lista filtrada", () => {
    const { estado, efeitos, prevenir } = rodar(LONGA, [{ tipo: "buscar", texto: "joão" }, tecla("Enter")], aberto);
    expect(estado).toBe(SELETOR_FECHADO);
    expect(efeitos).toEqual([{ tipo: "devolver-foco" }, { tipo: "escolher", valor: "João da Silva" }]);
    expect(prevenir).toBe(true);
  });

  it("sem resultado: nenhuma opção ativa, e o Enter não escolhe nem envia o formulário", () => {
    const semResultado = rodar(LONGA, [{ tipo: "buscar", texto: "xyz" }], aberto);
    expect(semResultado.estado.ativo).toBe(-1);
    const { estado, efeitos, prevenir } = rodar(LONGA, [tecla("Enter")], semResultado.estado);
    expect(estado.aberto).toBe(true);
    expect(efeitos).toEqual([]);
    expect(prevenir).toBe(true);
  });

  it("letras e espaço ficam com o campo de busca (não são atalho)", () => {
    for (const nome of ["a", " ", "Backspace", "ArrowLeft"]) {
      const { estado, prevenir } = rodar(LONGA, [tecla(nome)], aberto);
      expect(estado).toBe(aberto);
      expect(prevenir).toBe(false);
    }
  });

  it("Tab fecha sem escolher (a primeira opção fica ativa sozinha enquanto se digita)", () => {
    const { estado, efeitos, prevenir } = rodar(LONGA, [{ tipo: "buscar", texto: "an" }, tecla("Tab")], aberto);
    expect(estado).toBe(SELETOR_FECHADO);
    expect(efeitos).toEqual([{ tipo: "devolver-foco" }]);
    expect(prevenir).toBe(false);
  });

  it("Esc fecha e joga a busca fora", () => {
    const { estado, efeitos } = rodar(LONGA, [{ tipo: "buscar", texto: "an" }, tecla("Escape")], aberto);
    expect(estado).toBe(SELETOR_FECHADO);
    expect(efeitos).toEqual([{ tipo: "devolver-foco" }]);
    expect(rodar(LONGA, [{ tipo: "abrir" }], estado).estado.busca).toBe("");
  });
});

describe("transicao · lista de centenas", () => {
  const muitas: ContextoDoSeletor = {
    opcoes: Array.from({ length: 320 }, (_, indice) => opcao(`Palestra ${String(indice + 1).padStart(3, "0")}`)),
    comBusca: true,
    valor: "Palestra 001",
  };
  const aberto = rodar(muitas, [{ tipo: "abrir" }]).estado;

  it("abre desenhando só o primeiro bloco", () => {
    expect(aberto.teto).toBe(PASSO_DA_LISTA);
  });

  it("abre com a opção escolhida desenhada, mesmo longe do começo", () => {
    const { estado } = rodar({ ...muitas, valor: "Palestra 130" }, [{ tipo: "abrir" }]);
    expect(estado.ativo).toBe(129);
    expect(estado.teto).toBe(150);
  });

  it("rolar até o fim mostra mais um bloco, até o total", () => {
    expect(rodar(muitas, [{ tipo: "mostrar-mais" }], aberto).estado.teto).toBe(100);
    expect(rodar(muitas, Array.from({ length: 20 }, () => ({ tipo: "mostrar-mais" }) as const), aberto).estado.teto).toBe(320);
  });

  it("o teclado passa do que está desenhado e a lista cresce junto", () => {
    const descendo = rodar(muitas, Array.from({ length: 50 }, () => tecla("ArrowDown")), aberto).estado;
    expect(descendo.ativo).toBe(50);
    expect(descendo.teto).toBe(100);
    const noFim = rodar(muitas, [tecla("End")], aberto).estado;
    expect(noFim.ativo).toBe(319);
    expect(noFim.teto).toBe(320);
  });

  it("uma busca nova volta ao primeiro bloco", () => {
    const { estado } = rodar(muitas, [tecla("End"), { tipo: "buscar", texto: "palestra 2" }], aberto);
    expect(estado.ativo).toBe(0);
    expect(estado.teto).toBe(PASSO_DA_LISTA);
    expect(filtrarOpcoes(muitas.opcoes, estado.busca).length).toBeGreaterThan(PASSO_DA_LISTA);
  });

  it("com a lista fechada, mostrar mais e apontar não fazem nada", () => {
    expect(rodar(muitas, [{ tipo: "mostrar-mais" }]).estado).toBe(SELETOR_FECHADO);
    expect(rodar(muitas, [{ tipo: "apontar", indice: 3 }]).estado).toBe(SELETOR_FECHADO);
  });
});

// ---------- Posição ----------

const TELA = { topo: 0, esquerda: 0, largura: 1280, altura: 800 };
const campo = (topo: number, extra: Partial<{ esquerda: number; largura: number; altura: number }> = {}) => ({ topo, esquerda: 100, largura: 240, altura: 40, ...extra });
const medidas = { janela: TELA, alturaDoLayout: 800, alturaDesejada: 300, comBusca: false };

describe("alturaEstimada", () => {
  it("cresce com as opções e os grupos e para no máximo", () => {
    expect(alturaEstimada({ opcoes: 3, comBusca: false })).toBe(118);
    expect(alturaEstimada({ opcoes: 3, grupos: 2, comBusca: false })).toBe(174);
    expect(alturaEstimada({ opcoes: 3, comBusca: true })).toBe(171);
    expect(alturaEstimada({ opcoes: 300, comBusca: true })).toBe(ALTURA_MAXIMA_DA_LISTA);
    expect(alturaEstimada({ opcoes: 0, comBusca: true })).toBe(107);
  });
});

describe("posicionar", () => {
  it("abre para baixo, colada no campo e com a largura dele, quando cabe", () => {
    expect(posicionar({ ...medidas, ancora: campo(100) })).toEqual({ modo: "ancorada", paraCima: false, topo: 144, base: null, esquerda: 100, largura: 240, alturaMaxima: 360 });
  });

  it("abre para cima quando não cabe embaixo e há mais espaço em cima", () => {
    const posicao = posicionar({ ...medidas, ancora: campo(700) });
    expect(posicao).toMatchObject({ modo: "ancorada", paraCima: true, topo: null, base: 104, alturaMaxima: 360 });
  });

  it("lista pequena que cabe embaixo não sobe, mesmo perto do fim da tela", () => {
    expect(posicionar({ ...medidas, alturaDesejada: 40, ancora: campo(700) })).toMatchObject({ paraCima: false, topo: 744 });
  });

  it("sem caber em nenhum dos lados, fica no maior e limita a altura ao espaço", () => {
    const baixa = { ...TELA, altura: 300 };
    expect(posicionar({ ...medidas, janela: baixa, alturaDoLayout: 300, ancora: campo(100) })).toMatchObject({ paraCima: false, alturaMaxima: 148 });
    expect(posicionar({ ...medidas, janela: baixa, alturaDoLayout: 300, ancora: campo(200) })).toMatchObject({ paraCima: true, alturaMaxima: 188 });
  });

  it("nunca fica menor que o mínimo utilizável", () => {
    const minima = { ...TELA, altura: 200 };
    expect(posicionar({ ...medidas, janela: minima, alturaDoLayout: 200, ancora: campo(80) })).toMatchObject({ alturaMaxima: 120 });
  });

  it("não sai pela direita nem pela esquerda da tela", () => {
    expect(posicionar({ ...medidas, ancora: campo(100, { esquerda: 1150 }) })).toMatchObject({ esquerda: 1032, largura: 240 });
    expect(posicionar({ ...medidas, ancora: campo(100, { esquerda: -30 }) })).toMatchObject({ esquerda: 8 });
  });

  it("campo estreito ganha uma lista com largura mínima; com busca, um pouco mais", () => {
    expect(posicionar({ ...medidas, ancora: campo(100, { largura: 90 }) })).toMatchObject({ largura: 220 });
    expect(posicionar({ ...medidas, comBusca: true, ancora: campo(100, { largura: 90 }) })).toMatchObject({ largura: 300 });
  });

  it("campo largo: a lista acompanha", () => {
    expect(posicionar({ ...medidas, ancora: campo(100, { largura: 600 }) })).toMatchObject({ largura: 600 });
  });

  it("conta só a parte visível da tela (teclado do tablet aberto)", () => {
    const comTeclado = { topo: 0, esquerda: 0, largura: 1024, altura: 420 };
    const posicao = posicionar({ ...medidas, janela: comTeclado, alturaDoLayout: 768, ancora: campo(330) });
    expect(posicao).toMatchObject({ paraCima: true, base: 768 - 330 + 4, alturaMaxima: 318 });
  });

  it("lista já aberta não troca de lado a cada rolagem", () => {
    // Abriu para baixo; a página rolou e sobraram 200 px embaixo: ainda dá para usar, continua para baixo.
    expect(posicionar({ ...medidas, ancora: campo(548), paraCimaAntes: false })).toMatchObject({ paraCima: false, alturaMaxima: 200 });
    // Sem a memória, a mesma posição abriria para cima.
    expect(posicionar({ ...medidas, ancora: campo(548) })).toMatchObject({ paraCima: true });
  });

  it("lista já aberta troca de lado quando o lado atual fica sem espaço útil", () => {
    expect(posicionar({ ...medidas, ancora: campo(700), paraCimaAntes: false })).toMatchObject({ paraCima: true });
    expect(posicionar({ ...medidas, ancora: campo(60), paraCimaAntes: true })).toMatchObject({ paraCima: false });
  });

  it("tela estreita: a lista vira uma folha na parte visível, embaixo (curta) ou em cima (com busca)", () => {
    const celular = { topo: 0, esquerda: 0, largura: 390, altura: 760 };
    expect(posicionar({ ...medidas, janela: celular, ancora: campo(300) })).toEqual({ modo: "folha", caixa: celular, alinhamento: "base" });
    expect(posicionar({ ...medidas, janela: celular, comBusca: true, ancora: campo(300) })).toEqual({ modo: "folha", caixa: celular, alinhamento: "topo" });
  });

  it("tela estreita com o teclado aberto: a folha ocupa só o que sobrou acima dele", () => {
    const comTeclado = { topo: 120, esquerda: 0, largura: 390, altura: 420 };
    expect(posicionar({ ...medidas, janela: comTeclado, comBusca: true, ancora: campo(300) })).toEqual({ modo: "folha", caixa: comTeclado, alinhamento: "topo" });
  });

  it("639 px é estreita; 640 px já ancora no campo", () => {
    expect(posicionar({ ...medidas, janela: { ...TELA, largura: 639 }, ancora: campo(100) }).modo).toBe("folha");
    expect(posicionar({ ...medidas, janela: { ...TELA, largura: 640 }, ancora: campo(100) }).modo).toBe("ancorada");
  });
});
