// Regras do Seletor (seletor.tsx) sem React nem DOM: filtro, teclado, quanto desenhar e onde abrir a lista.
// Ficam aqui para serem testadas em node (o projeto não tem teste de componente).

export type OpcaoDoSeletor = {
  valor: string;
  rotulo: string;
  /** Segunda linha, menor (função da pessoa, cidade do hotel). Também entra na busca. */
  descricao?: string;
  /** Nome do grupo. Opções seguidas do mesmo grupo aparecem sob um título só. */
  grupo?: string;
  desabilitada?: boolean;
};

/** Até aqui a lista abre sem campo de busca. */
export const LIMITE_DA_LISTA_CURTA = 8;
/** Quantas opções são desenhadas de cada vez na lista longa. */
export const PASSO_DA_LISTA = 50;
/** Quantas opções PageUp e PageDown pulam. */
export const PAGINA_DO_TECLADO = 10;

/**
 * Sem maiúsculas, sem acentos e sem espaço nas pontas. É a mesma regra do `normalizarBusca` das listas de Pessoas
 * e de Disponibilidade (domain/ dos módulos); mora aqui porque componente do navegador só importa tipos dos
 * módulos. O teste confere que as duas continuam iguais.
 */
export function normalizarTexto(texto: string): string {
  return texto
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .trim();
}

/** `busca` explícita manda; sem ela, a lista ganha busca quando passa do limite da lista curta. */
export function temBusca(quantidade: number, busca?: boolean): boolean {
  return busca ?? quantidade > LIMITE_DA_LISTA_CURTA;
}

/** A opção vazia ("Todos", "—") entra na lista como a primeira opção, com valor "". */
export function comOpcaoVazia(opcoes: OpcaoDoSeletor[], vazio: string | undefined): OpcaoDoSeletor[] {
  return vazio === undefined ? opcoes : [{ valor: "", rotulo: vazio }, ...opcoes];
}

/**
 * O valor que o campo manda, como o select nativo fazia: o valor pedido, se existir na lista; senão o vazio, quando
 * o campo aceita ficar vazio (tem opção vazia ou texto de "escolha…"); senão a primeira opção que pode ser escolhida.
 */
export function valorEfetivo(opcoes: OpcaoDoSeletor[], valor: string | null | undefined, aceitaVazio: boolean): string {
  if (valor !== null && valor !== undefined && opcoes.some((opcao) => opcao.valor === valor)) return valor;
  if (aceitaVazio) return "";
  return opcoes.find((opcao) => !opcao.desabilitada)?.valor ?? "";
}

/**
 * Se o campo entra no envio do formulário. Vazio numa lista que só tem o texto de "escolha…" (sem opção vazia) não
 * entra, como no select nativo, que não enviava a opção desabilitada: o servidor continua recebendo o campo ausente.
 */
export function entraNoEnvio(valor: string, temOpcaoVazia: boolean, temMarcador: boolean): boolean {
  return valor !== "" || temOpcaoVazia || !temMarcador;
}

function pesoNaBusca(rotulo: string, termo: string, primeiraPalavra: string): number {
  if (rotulo.startsWith(termo)) return 0;
  if (rotulo.split(/[^\p{L}\p{N}]+/u).some((palavra) => palavra.startsWith(primeiraPalavra))) return 1;
  return 2;
}

/**
 * Opções que têm todas as palavras digitadas (no rótulo, na descrição ou no grupo), sem diferenciar maiúsculas nem
 * acentos. Quem começa pelo que foi digitado vem antes; no empate, e em lista com grupos, vale a ordem recebida.
 */
export function filtrarOpcoes(opcoes: OpcaoDoSeletor[], busca: string): OpcaoDoSeletor[] {
  const termo = normalizarTexto(busca);
  if (!termo) return opcoes;
  const palavras = termo.split(/\s+/);
  const achadas = opcoes
    .map((opcao) => ({ opcao, rotulo: normalizarTexto(opcao.rotulo), resto: normalizarTexto(`${opcao.descricao ?? ""} ${opcao.grupo ?? ""}`) }))
    .filter(({ rotulo, resto }) => palavras.every((palavra) => rotulo.includes(palavra) || resto.includes(palavra)));
  if (achadas.some(({ opcao }) => opcao.grupo)) return achadas.map(({ opcao }) => opcao);
  return achadas
    .map((achada, ordem) => ({ ...achada, ordem, peso: pesoNaBusca(achada.rotulo, termo, palavras[0]!) }))
    .sort((a, b) => a.peso - b.peso || a.ordem - b.ordem)
    .map(({ opcao }) => opcao);
}

/** Opções seguidas do mesmo grupo viram um bloco; o índice é o da lista inteira (o que o teclado usa). */
export function emGrupos<Opcao extends { grupo?: string }>(opcoes: Opcao[]): { grupo: string | null; itens: { opcao: Opcao; indice: number }[] }[] {
  const blocos: { grupo: string | null; itens: { opcao: Opcao; indice: number }[] }[] = [];
  opcoes.forEach((opcao, indice) => {
    const grupo = opcao.grupo ?? null;
    const ultimo = blocos[blocos.length - 1];
    if (ultimo && ultimo.grupo === grupo) ultimo.itens.push({ opcao, indice });
    else blocos.push({ grupo, itens: [{ opcao, indice }] });
  });
  return blocos;
}

// ---------- Teclado ----------

type Navegavel = { desabilitada?: boolean };

export type Movimento = "primeira" | "ultima" | "proxima" | "anterior" | "pagina-abaixo" | "pagina-acima";

const livre = (opcoes: Navegavel[], indice: number) => indice >= 0 && indice < opcoes.length && !opcoes[indice]!.desabilitada;

function vizinha(opcoes: Navegavel[], atual: number, passo: 1 | -1): number {
  for (let indice = atual + passo; indice >= 0 && indice < opcoes.length; indice += passo) {
    if (!opcoes[indice]!.desabilitada) return indice;
  }
  return -1;
}

/** Para onde vai a opção ativa. Pula as desabilitadas e para nas pontas (não dá a volta). -1 = lista sem opção livre. */
export function moverAtivo(opcoes: Navegavel[], atual: number, movimento: Movimento): number {
  const primeira = vizinha(opcoes, -1, 1);
  const ultima = vizinha(opcoes, opcoes.length, -1);
  const dentro = atual >= 0 && atual < opcoes.length;
  switch (movimento) {
    case "primeira":
      return primeira;
    case "ultima":
      return ultima;
    case "proxima": {
      if (!dentro) return primeira;
      const seguinte = vizinha(opcoes, atual, 1);
      return seguinte === -1 ? (livre(opcoes, atual) ? atual : ultima) : seguinte;
    }
    case "anterior": {
      if (!dentro) return ultima;
      const seguinte = vizinha(opcoes, atual, -1);
      return seguinte === -1 ? (livre(opcoes, atual) ? atual : primeira) : seguinte;
    }
    case "pagina-abaixo":
    case "pagina-acima": {
      let indice = atual;
      for (let vez = 0; vez < PAGINA_DO_TECLADO; vez += 1) indice = moverAtivo(opcoes, indice, movimento === "pagina-abaixo" ? "proxima" : "anterior");
      return indice;
    }
    default: {
      const desconhecido: never = movimento;
      throw new Error(`movimento desconhecido: ${String(desconhecido)}`);
    }
  }
}

/**
 * "Digitar para pular" da lista curta. A mesma letra repetida ("m", "m", "m") passa pelas opções que começam com
 * ela, dando a volta; letras diferentes ("ma") procuram a primeira opção que começa com o texto, a partir da ativa.
 */
export function pularParaTexto(opcoes: { rotulo: string; desabilitada?: boolean }[], atual: number, digitado: string): number {
  const termo = normalizarTexto(digitado);
  if (!termo || opcoes.length === 0) return atual;
  const repetida = [...termo].every((letra) => letra === termo[0]);
  const procurado = repetida ? termo[0]! : termo;
  const inicio = repetida ? atual + 1 : Math.max(atual, 0);
  for (let passo = 0; passo < opcoes.length; passo += 1) {
    const indice = (((inicio + passo) % opcoes.length) + opcoes.length) % opcoes.length;
    const opcao = opcoes[indice]!;
    if (!opcao.desabilitada && normalizarTexto(opcao.rotulo).startsWith(procurado)) return indice;
  }
  return atual;
}

/** Quantas opções desenhar: em blocos de `passo`, sempre o bastante para a opção ativa estar na tela. */
export function tetoDaLista(teto: number, ativo: number, total: number, passo = PASSO_DA_LISTA): number {
  const necessario = Math.max(teto, ativo + 1, 1);
  return Math.min(total, Math.ceil(necessario / passo) * passo);
}

export type EstadoDoSeletor = {
  aberto: boolean;
  /** O que foi digitado no campo de busca (lista longa). */
  busca: string;
  /** Índice da opção ativa na lista filtrada; -1 = nenhuma. */
  ativo: number;
  /** Quantas opções da lista filtrada estão desenhadas. */
  teto: number;
  /** Letras do "digitar para pular" (lista curta); some depois de uma pausa. */
  digitado: string;
};

export const SELETOR_FECHADO: EstadoDoSeletor = { aberto: false, busca: "", ativo: -1, teto: PASSO_DA_LISTA, digitado: "" };

export type EventoDoSeletor =
  | { tipo: "abrir"; onde?: "selecionada" | "primeira" | "ultima"; busca?: string }
  | { tipo: "fechar" }
  | { tipo: "buscar"; texto: string }
  | { tipo: "apontar"; indice: number }
  | { tipo: "mostrar-mais" }
  | { tipo: "pausa-na-digitacao" }
  | { tipo: "tecla"; tecla: string; comModificador?: boolean };

export type EfeitoDoSeletor = { tipo: "escolher"; valor: string } | { tipo: "devolver-foco" };

export type ContextoDoSeletor = {
  /** Todas as opções, na ordem da lista (a vazia, quando existe, é a primeira). */
  opcoes: OpcaoDoSeletor[];
  comBusca: boolean;
  /** Valor escolhido agora. */
  valor: string;
};

export type ResultadoDaTransicao = {
  estado: EstadoDoSeletor;
  efeitos: EfeitoDoSeletor[];
  /** A tecla foi usada pelo seletor: o navegador não deve fazer o padrão dela (rolar a página, enviar o formulário). */
  prevenir: boolean;
};

const visiveisEm = (contexto: ContextoDoSeletor, busca: string) => (contexto.comBusca ? filtrarOpcoes(contexto.opcoes, busca) : contexto.opcoes);

function comAtivo(estado: EstadoDoSeletor, ativo: number, total: number): EstadoDoSeletor {
  return { ...estado, ativo, teto: tetoDaLista(estado.teto, ativo, total) };
}

function abrir(contexto: ContextoDoSeletor, onde: "selecionada" | "primeira" | "ultima", busca: string): EstadoDoSeletor {
  const visiveis = visiveisEm(contexto, busca);
  const selecionada = visiveis.findIndex((opcao) => opcao.valor === contexto.valor);
  const ativo = onde === "ultima" ? moverAtivo(visiveis, -1, "ultima") : onde === "selecionada" && livre(visiveis, selecionada) ? selecionada : moverAtivo(visiveis, -1, "primeira");
  return { aberto: true, busca, ativo, teto: tetoDaLista(PASSO_DA_LISTA, ativo, visiveis.length), digitado: "" };
}

const SEM_EFEITO: EfeitoDoSeletor[] = [];
const ficou = (estado: EstadoDoSeletor, prevenir = false): ResultadoDaTransicao => ({ estado, efeitos: SEM_EFEITO, prevenir });
const imprimivel = (tecla: string) => [...tecla].length === 1 && tecla !== " ";

const MOVIMENTO_DA_TECLA: Record<string, Movimento> = {
  ArrowDown: "proxima",
  ArrowUp: "anterior",
  Home: "primeira",
  End: "ultima",
  PageDown: "pagina-abaixo",
  PageUp: "pagina-acima",
};

function teclaComListaFechada(estado: EstadoDoSeletor, tecla: string, comModificador: boolean, contexto: ContextoDoSeletor): ResultadoDaTransicao {
  if (tecla === "ArrowDown" || tecla === "ArrowUp" || tecla === "Enter" || tecla === " ") return ficou(abrir(contexto, "selecionada", ""), true);
  if (tecla === "Home") return ficou(abrir(contexto, "primeira", ""), true);
  if (tecla === "End") return ficou(abrir(contexto, "ultima", ""), true);
  if (!imprimivel(tecla) || comModificador) return ficou(estado);
  // Lista longa: a letra já vai para a busca. Lista curta: abre e pula para a opção que começa com ela.
  if (contexto.comBusca) return ficou(abrir(contexto, "primeira", tecla), true);
  const aberto = abrir(contexto, "selecionada", "");
  return ficou({ ...comAtivo(aberto, pularParaTexto(contexto.opcoes, aberto.ativo, tecla), contexto.opcoes.length), digitado: tecla }, true);
}

function teclaComListaAberta(estado: EstadoDoSeletor, tecla: string, comModificador: boolean, contexto: ContextoDoSeletor): ResultadoDaTransicao {
  const visiveis = visiveisEm(contexto, estado.busca);
  const escolhida = livre(visiveis, estado.ativo) ? visiveis[estado.ativo]! : null;
  const fechado = SELETOR_FECHADO;

  const movimento = MOVIMENTO_DA_TECLA[tecla];
  if (movimento) return ficou(comAtivo({ ...estado, digitado: "" }, moverAtivo(visiveis, estado.ativo, movimento), visiveis.length), true);

  if (tecla === "Escape") return { estado: fechado, efeitos: [{ tipo: "devolver-foco" }], prevenir: true };

  // No meio de uma digitação ("são p"), o espaço faz parte do texto procurado, e não escolhe.
  if (tecla === " " && !contexto.comBusca && estado.digitado) {
    const digitado = `${estado.digitado} `;
    return ficou({ ...comAtivo(estado, pularParaTexto(visiveis, estado.ativo, digitado), visiveis.length), digitado }, true);
  }

  if (tecla === "Enter" || (tecla === " " && !contexto.comBusca)) {
    // Enter com a lista aberta nunca envia o formulário, mesmo sem opção para escolher.
    if (!escolhida) return ficou(estado, true);
    return { estado: fechado, efeitos: [{ tipo: "devolver-foco" }, { tipo: "escolher", valor: escolhida.valor }], prevenir: true };
  }

  if (tecla === "Tab") {
    // O foco volta ao campo e o Tab segue dali. Lista curta: Tab confirma a opção ativa (como no select nativo);
    // lista longa: só fecha, porque a primeira opção fica ativa sozinha enquanto se digita a busca.
    const efeitos: EfeitoDoSeletor[] = [{ tipo: "devolver-foco" }];
    if (escolhida && !contexto.comBusca) efeitos.push({ tipo: "escolher", valor: escolhida.valor });
    return { estado: fechado, efeitos, prevenir: false };
  }

  if (contexto.comBusca || !imprimivel(tecla) || comModificador) return ficou(estado);
  const digitado = estado.digitado + tecla;
  return ficou({ ...comAtivo(estado, pularParaTexto(visiveis, estado.ativo, digitado), visiveis.length), digitado }, true);
}

/** A máquina de estados do seletor: estado + evento (teclado, mouse, busca) = estado novo e o que fazer fora dela. */
export function transicao(estado: EstadoDoSeletor, evento: EventoDoSeletor, contexto: ContextoDoSeletor): ResultadoDaTransicao {
  switch (evento.tipo) {
    case "abrir":
      return ficou(abrir(contexto, evento.onde ?? "selecionada", contexto.comBusca ? (evento.busca ?? "") : ""));
    case "fechar":
      return ficou(SELETOR_FECHADO);
    case "buscar": {
      if (!estado.aberto || !contexto.comBusca) return ficou(estado);
      const visiveis = visiveisEm(contexto, evento.texto);
      const ativo = moverAtivo(visiveis, -1, "primeira");
      return ficou({ ...estado, busca: evento.texto, ativo, teto: tetoDaLista(PASSO_DA_LISTA, ativo, visiveis.length) });
    }
    case "apontar": {
      if (!estado.aberto || !livre(visiveisEm(contexto, estado.busca), evento.indice)) return ficou(estado);
      return ficou({ ...estado, ativo: evento.indice });
    }
    case "mostrar-mais": {
      if (!estado.aberto) return ficou(estado);
      return ficou({ ...estado, teto: Math.min(visiveisEm(contexto, estado.busca).length, estado.teto + PASSO_DA_LISTA) });
    }
    case "pausa-na-digitacao":
      return ficou(estado.digitado ? { ...estado, digitado: "" } : estado);
    case "tecla":
      return estado.aberto
        ? teclaComListaAberta(estado, evento.tecla, evento.comModificador ?? false, contexto)
        : teclaComListaFechada(estado, evento.tecla, evento.comModificador ?? false, contexto);
    default: {
      const desconhecido: never = evento;
      throw new Error(`evento desconhecido: ${JSON.stringify(desconhecido)}`);
    }
  }
}

// ---------- Textos da lista ----------

/** O que o leitor de tela ouve enquanto a busca muda. */
export function anuncioDosResultados(total: number, busca: string): string {
  if (total === 0) return "Nenhum resultado";
  if (!normalizarTexto(busca)) return total === 1 ? "1 opção" : `${total} opções`;
  return total === 1 ? "1 resultado" : `${total} resultados`;
}

/** Rodapé da lista quando nem tudo está desenhado. */
export function avisoDoCorte(mostradas: number, total: number): string | null {
  if (mostradas >= total) return null;
  return `Mostrando ${mostradas} de ${total}. Continue digitando ou role a lista para ver mais.`;
}

// ---------- Onde a lista abre ----------

export type Retangulo = { topo: number; esquerda: number; largura: number; altura: number };

export type PosicaoDaLista =
  /** Tela estreita: a lista ocupa a parte visível da tela, em cima (com busca, para o teclado não cobrir) ou embaixo. */
  | { modo: "folha"; caixa: Retangulo; alinhamento: "topo" | "base" }
  /** Colada no campo, para baixo (`topo`) ou para cima (`base`, medida a partir do fim da tela). */
  | { modo: "ancorada"; paraCima: boolean; topo: number | null; base: number | null; esquerda: number; largura: number; alturaMaxima: number };

export const LARGURA_DA_TELA_ESTREITA = 640;
export const ALTURA_MAXIMA_DA_LISTA = 360;
const ALTURA_UTIL = 160;
const ALTURA_MINIMA = 120;
const MARGEM = 8;
const FOLGA = 4;
const LARGURA_MINIMA = 220;
const LARGURA_MINIMA_COM_BUSCA = 300;

/** Altura que a lista teria se coubesse inteira: serve só para decidir se abre para baixo ou para cima. */
export function alturaEstimada({ opcoes, grupos = 0, comBusca }: { opcoes: number; grupos?: number; comBusca: boolean }): number {
  const linhas = opcoes === 0 ? 44 : opcoes * 36 + grupos * 28;
  return Math.min(ALTURA_MAXIMA_DA_LISTA, linhas + 10 + (comBusca ? 53 : 0));
}

const limitar = (valor: number, minimo: number, maximo: number) => Math.max(minimo, Math.min(valor, Math.max(minimo, maximo)));

/**
 * Tudo nas coordenadas de `position: fixed`. `janela` é a parte da tela que está à vista (com o teclado do celular
 * aberto, só o que sobra acima dele); `alturaDoLayout` é a altura usada para ancorar pela base.
 * Abre para baixo quando cabe; se não cabe e há mais espaço em cima, abre para cima. Com a lista já aberta
 * (`paraCimaAntes`), só troca de lado se o lado atual ficou sem espaço útil: a lista não pula a cada rolagem.
 */
export function posicionar({
  ancora,
  janela,
  alturaDoLayout,
  alturaDesejada,
  comBusca,
  paraCimaAntes,
}: {
  ancora: Retangulo;
  janela: Retangulo;
  alturaDoLayout: number;
  alturaDesejada: number;
  comBusca: boolean;
  paraCimaAntes?: boolean;
}): PosicaoDaLista {
  if (janela.largura < LARGURA_DA_TELA_ESTREITA) return { modo: "folha", caixa: janela, alinhamento: comBusca ? "topo" : "base" };

  const abaixo = janela.topo + janela.altura - MARGEM - (ancora.topo + ancora.altura + FOLGA);
  const acima = ancora.topo - FOLGA - (janela.topo + MARGEM);
  const desejada = Math.min(alturaDesejada, ALTURA_MAXIMA_DA_LISTA);
  let paraCima: boolean;
  if (paraCimaAntes === undefined) {
    paraCima = abaixo < desejada && acima > abaixo;
  } else {
    const [atual, outro] = paraCimaAntes ? [acima, abaixo] : [abaixo, acima];
    paraCima = atual < Math.min(desejada, ALTURA_UTIL) && outro > atual ? !paraCimaAntes : paraCimaAntes;
  }
  const espaco = paraCima ? acima : abaixo;
  const largura = Math.min(Math.max(ancora.largura, comBusca ? LARGURA_MINIMA_COM_BUSCA : LARGURA_MINIMA), janela.largura - 2 * MARGEM);
  return {
    modo: "ancorada",
    paraCima,
    topo: paraCima ? null : ancora.topo + ancora.altura + FOLGA,
    base: paraCima ? alturaDoLayout - ancora.topo + FOLGA : null,
    esquerda: limitar(ancora.esquerda, janela.esquerda + MARGEM, janela.esquerda + janela.largura - MARGEM - largura),
    largura,
    alturaMaxima: Math.max(Math.min(ALTURA_MAXIMA_DA_LISTA, espaco), Math.min(ALTURA_MINIMA, janela.altura - 2 * MARGEM)),
  };
}
