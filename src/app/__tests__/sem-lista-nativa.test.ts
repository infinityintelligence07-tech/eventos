import { globSync, readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

// "Todas as listas de busca devem ser do sistema, e não deixar para o padrão do sistema operacional."
// Lista de escolha em tela é o `Seletor` (src/app/(time)/_componentes/ui/seletor.tsx; docs/08 §3.6.1), direto ou
// pelos componentes que o embrulham (`CampoDeSelecao`, `SeletorDeFiltro`). Este teste falha se uma lista nativa
// voltar a aparecer em qualquer tela: a lista do sistema operacional não tem busca, não segue o tema e, com
// centenas de pessoas ou de palestras, não dá para usar.

const RAIZ = path.resolve(import.meta.dirname, "..");

const ARQUIVOS = globSync("**/*.{ts,tsx}", { cwd: RAIZ })
  .filter((arquivo) => !arquivo.split(path.sep).includes("__tests__"))
  .sort();

/** Elementos de lista nativa e o atributo que liga um campo a uma lista de sugestões nativa. */
const PROIBIDOS: { nome: string; padrao: RegExp }[] = [
  { nome: "<select>", padrao: /<select[\s/>]/ },
  { nome: "<datalist>", padrao: /<datalist[\s/>]/ },
  { nome: "<option>", padrao: /<option[\s/>]/ },
  { nome: "<optgroup>", padrao: /<optgroup[\s/>]/ },
  { nome: "atributo list=", padrao: /\slist=[{"']/ },
];

/**
 * Lista fechada: arquivo → por que ali a lista nativa fica. Está vazia, e a ideia é continuar assim; uma exceção
 * nova precisa do motivo escrito aqui.
 */
const EXCECOES: Record<string, string> = {};

describe("nenhuma tela usa lista nativa do sistema operacional", () => {
  it("encontra os arquivos das telas, com o Seletor entre eles", () => {
    expect(ARQUIVOS.length).toBeGreaterThanOrEqual(150);
    expect(ARQUIVOS).toContain(path.join("(time)", "_componentes", "ui", "seletor.tsx"));
    expect(ARQUIVOS).toContain(path.join("meu-cadastro", "_componentes", "formulario.tsx"));
    expect(ARQUIVOS).toContain(path.join("sdc", "_componentes", "formularios.tsx"));
  });

  it("os padrões pegam as formas de escrever uma lista nativa", () => {
    const pega = (texto: string) => PROIBIDOS.filter(({ padrao }) => padrao.test(texto)).map(({ nome }) => nome);
    expect(pega('<select name="polo">')).toEqual(["<select>"]);
    expect(pega("<select\n  name")).toEqual(["<select>"]);
    expect(pega("<select>")).toEqual(["<select>"]);
    expect(pega('<option value="">Todos</option>')).toEqual(["<option>"]);
    expect(pega('<optgroup label="Outro quarto">')).toEqual(["<optgroup>"]);
    expect(pega('<input list="polos" /><datalist id="polos">')).toEqual(["<datalist>", "atributo list="]);
    expect(pega("<input list={idDaLista} />")).toEqual(["atributo list="]);
    // O que não é lista nativa: os componentes do sistema e os nomes parecidos.
    expect(pega('<Seletor nome="polo" opcoes={polos} />')).toEqual([]);
    expect(pega('<SeletorDeFiltro nome="polo" /> <CampoDeSelecao nome="tipo" />')).toEqual([]);
    expect(pega('role="option" aria-selected data-searchable-select=""')).toEqual([]);
    expect(pega("const lista = useRef(null); <ul className={classes.lista}>")).toEqual([]);
  });

  it("toda exceção tem motivo e aponta para um arquivo que existe", () => {
    for (const [arquivo, motivo] of Object.entries(EXCECOES)) {
      expect(ARQUIVOS, `exceção para um arquivo que não existe: ${arquivo}`).toContain(arquivo);
      expect(motivo.trim().length, `exceção sem motivo: ${arquivo}`).toBeGreaterThan(20);
    }
  });

  it("nenhum arquivo de src/app tem select, datalist, option ou optgroup", () => {
    const achados = ARQUIVOS.filter((arquivo) => !(arquivo in EXCECOES)).flatMap((arquivo) => {
      const linhas = readFileSync(path.join(RAIZ, arquivo), "utf8").split("\n");
      return linhas.flatMap((linha, indice) => PROIBIDOS.filter(({ padrao }) => padrao.test(linha)).map(({ nome }) => `${arquivo}:${indice + 1} usa ${nome}`));
    });
    expect(achados, "use o Seletor do sistema (docs/08 §3.6.1) no lugar da lista nativa").toEqual([]);
  });
});
