"use client";

import { Check, ChevronDown, Search } from "lucide-react";
import { type CSSProperties, type KeyboardEvent, type MouseEvent, useEffect, useId, useLayoutEffect, useMemo, useRef, useState } from "react";
import { flushSync } from "react-dom";

import {
  alturaEstimada,
  anuncioDosResultados,
  avisoDoCorte,
  comOpcaoVazia,
  emGrupos,
  entraNoEnvio,
  type EstadoDoSeletor,
  type EventoDoSeletor,
  filtrarOpcoes,
  type OpcaoDoSeletor,
  type PosicaoDaLista,
  posicionar,
  SELETOR_FECHADO,
  temBusca,
  transicao,
  valorEfetivo,
} from "./seletor-logica";

// doc 08 §3.6.1. A lista de escolha do sistema, no lugar da lista nativa do sistema operacional.
// Uma peça, duas formas: lista curta (abre a lista; o foco fica no campo) e lista longa (campo de busca dentro da
// lista, que filtra enquanto se digita). As regras (filtro, teclado, posição) estão em seletor-logica.ts.
//
// Para o formulário é um campo de verdade: o valor vai num campo oculto com o `nome`, então a server action e o
// FormData recebem o mesmo nome e o mesmo valor de sempre.

export type PropsDoSeletor = {
  opcoes: OpcaoDoSeletor[];
  /** `name` do campo oculto. Sem nome, o seletor não entra no formulário (uso controlado, só na tela). */
  nome?: string;
  /** Id do campo (o botão): é para onde o `htmlFor` do rótulo aponta. */
  id?: string;
  /** Opção vazia que pode ser escolhida, com valor "": "Todos", "—", "Sem preferência". */
  vazio?: string;
  /** Texto de quando nada foi escolhido e o vazio não é uma opção: "Escolha pelo nome…". */
  marcador?: string;
  /** Controlado: o valor atual, junto com `aoMudar`. */
  valor?: string | null;
  /** Não controlado: o valor de partida. O campo volta a ele quando o formulário é limpo (inclusive pelo React, depois de uma action). */
  valorInicial?: string | null;
  aoMudar?: (valor: string) => void;
  /** Envia o formulário logo depois de uma escolha, já com o valor novo no campo oculto. */
  enviarAoEscolher?: boolean;
  /** Sem escolha, o navegador segura o envio do formulário e mostra a mensagem dele (o `required` nativo). */
  obrigatorio?: boolean;
  desabilitado?: boolean;
  /** Campo de busca na lista. Sem a prop, aparece sozinho acima de 8 opções. Pessoas, eventos, palestras e locais: sempre `true`. */
  busca?: boolean;
  /** Nome do campo dito pelo leitor de tela dentro da lista ("Passageiro"). */
  rotulo?: string;
  tamanho?: "normal" | "pequeno";
  /** "entrada": as telas escuras do staff (Meu cadastro, enquete, custo, login). */
  moldura?: "sistema" | "entrada";
  /** Classes do invólucro: largura e posição no layout. Padrão: largura toda ("w-full min-w-0"). */
  className?: string;
  /** Id do `<form>`, quando o campo fica fora dele. */
  form?: string;
  "aria-label"?: string;
  "aria-labelledby"?: string;
  "aria-describedby"?: string;
  "aria-invalid"?: boolean;
  "aria-required"?: boolean;
};

const GATILHO_DO_SISTEMA =
  "flex w-full items-center justify-between gap-2 rounded-[10px] border border-[var(--ds-separator)] bg-[var(--ds-surface)] text-left font-normal whitespace-normal text-[var(--ds-label)] disabled:cursor-not-allowed disabled:opacity-50 aria-[invalid=true]:border-[var(--ds-red-deep)]";

const TAMANHO_DO_GATILHO = {
  normal: "min-h-10 py-1.5 pl-3 pr-2 text-[14px]",
  pequeno: "min-h-8 py-1 pl-2 pr-1.5 text-[13px]",
} as const;

// O que a lista herdaria de onde o campo está (célula alinhada à direita, título em negrito, texto que não quebra).
const CAMADA = "sem-caixa-alta fixed z-[80] m-0 flex flex-col border-0 text-left text-[14px] font-normal leading-[1.4] tracking-normal whitespace-normal text-[var(--ds-label)]";

const OPCAO =
  "flex min-h-9 cursor-pointer items-start gap-2 px-3 py-2 [overflow-wrap:anywhere] data-[ativo]:bg-[var(--ds-tint-soft)] aria-disabled:cursor-not-allowed aria-disabled:text-[var(--ds-label-3)] max-sm:min-h-11 max-sm:py-3";

const MENSAGEM_DE_OBRIGATORIO = "Selecione um item da lista.";
const PAUSA_DA_DIGITACAO_MS = 700;

function estiloDaCamada(posicao: PosicaoDaLista | null): CSSProperties {
  // Antes de medir: transparente (e não escondida, para a busca já poder receber o foco), sem piscar no canto da tela.
  if (!posicao) return { top: 0, left: 0, right: "auto", bottom: "auto", opacity: 0, pointerEvents: "none" };
  if (posicao.modo === "folha") {
    const { caixa } = posicao;
    return { top: caixa.topo, left: caixa.esquerda, right: "auto", bottom: "auto", width: caixa.largura, height: caixa.altura, maxWidth: "none", maxHeight: "none" };
  }
  return {
    top: posicao.topo ?? "auto",
    bottom: posicao.base ?? "auto",
    left: posicao.esquerda,
    right: "auto",
    width: posicao.largura,
    height: "auto",
    maxWidth: "none",
    maxHeight: posicao.alturaMaxima,
  };
}

/** Mantém a opção ativa à vista sem rolar nada além da própria lista. */
function trazerParaAVista(lista: HTMLElement, item: HTMLElement) {
  const caixa = lista.getBoundingClientRect();
  const alvo = item.getBoundingClientRect();
  if (alvo.top < caixa.top) lista.scrollTop -= caixa.top - alvo.top;
  else if (alvo.bottom > caixa.bottom) lista.scrollTop += alvo.bottom - caixa.bottom;
}

export function Seletor({
  opcoes,
  nome,
  id: idRecebido,
  vazio,
  marcador,
  valor,
  valorInicial,
  aoMudar,
  enviarAoEscolher = false,
  obrigatorio = false,
  desabilitado = false,
  busca,
  rotulo,
  tamanho = "normal",
  moldura = "sistema",
  className = "w-full min-w-0",
  form,
  "aria-label": ariaLabel,
  "aria-labelledby": ariaLabelledBy,
  "aria-describedby": ariaDescribedBy,
  "aria-invalid": ariaInvalid,
  "aria-required": ariaRequired,
}: PropsDoSeletor) {
  const idGerado = useId();
  const id = idRecebido ?? `seletor-${idGerado}`;
  const idDaCamada = `${id}-camada`;
  const idDaLista = `${id}-lista`;
  const idDaOpcao = (indice: number) => `${id}-opcao-${indice}`;

  const itens = useMemo(() => comOpcaoVazia(opcoes, vazio), [opcoes, vazio]);
  const comBusca = temBusca(itens.length, busca);
  const controlado = valor !== undefined;
  // null = a pessoa ainda não escolheu nada aqui: vale o valor inicial (e continua valendo se ele mudar).
  const [escolhido, setEscolhido] = useState<string | null>(null);
  const atual = valorEfetivo(itens, controlado ? valor : (escolhido ?? valorInicial), vazio !== undefined || marcador !== undefined);
  const selecionada = itens.find((opcao) => opcao.valor === atual);

  const [estado, setEstado] = useState<EstadoDoSeletor>(SELETOR_FECHADO);
  const estadoAtual = useRef(estado);
  const [posicao, setPosicao] = useState<PosicaoDaLista | null>(null);
  const [focoNaValidacao, setFocoNaValidacao] = useState(false);

  const gatilho = useRef<HTMLButtonElement>(null);
  const camada = useRef<HTMLDivElement>(null);
  const campoDeBusca = useRef<HTMLInputElement>(null);
  const lista = useRef<HTMLDivElement>(null);
  const validacao = useRef<HTMLInputElement>(null);
  const pausa = useRef<ReturnType<typeof setTimeout> | null>(null);
  /** O teclado rola a lista até a opção ativa; o mouse não (a lista não pode fugir de baixo do cursor). */
  const rolarAteAAtiva = useRef(false);
  /** Sempre a versão desta renderização: é o que os ouvintes do documento e o temporizador chamam. */
  const despacharAtual = useRef<(evento: EventoDoSeletor) => boolean>(() => false);

  const visiveis = useMemo(() => (comBusca ? filtrarOpcoes(itens, estado.busca) : itens), [comBusca, itens, estado.busca]);
  const desenhadas = visiveis.slice(0, estado.teto);
  const blocos = emGrupos(desenhadas);
  const corte = avisoDoCorte(desenhadas.length, visiveis.length);

  function escolher(novo: string) {
    if (novo === atual) return;
    const aplicar = () => {
      if (!controlado) setEscolhido(novo);
      aoMudar?.(novo);
    };
    if (!enviarAoEscolher) {
      aplicar();
      return;
    }
    // O campo oculto precisa estar com o valor novo antes de o formulário ser lido.
    flushSync(aplicar);
    gatilho.current?.form?.requestSubmit();
  }

  /** Aplica um evento na máquina de estados e faz o que ela pedir. Devolve se a tecla foi usada. */
  function despachar(evento: EventoDoSeletor): boolean {
    const anterior = estadoAtual.current;
    const { estado: novo, efeitos, prevenir } = transicao(anterior, evento, { opcoes: itens, comBusca, valor: atual });
    if (novo !== anterior) {
      estadoAtual.current = novo;
      if (!anterior.aberto && novo.aberto) setPosicao(null);
      // Ao fechar, a lista sai da página antes de o foco voltar ao campo (e antes de o Tab seguir adiante).
      if (anterior.aberto && !novo.aberto) flushSync(() => setEstado(novo));
      else setEstado(novo);
    }
    if (novo.digitado && novo.digitado !== anterior.digitado) {
      if (pausa.current) clearTimeout(pausa.current);
      pausa.current = setTimeout(() => despacharAtual.current({ tipo: "pausa-na-digitacao" }), PAUSA_DA_DIGITACAO_MS);
    }
    for (const efeito of efeitos) {
      if (efeito.tipo === "devolver-foco") gatilho.current?.focus({ preventScroll: true });
      else escolher(efeito.valor);
    }
    return prevenir;
  }
  despacharAtual.current = despachar;

  function aoTeclar(evento: KeyboardEvent<HTMLElement>) {
    if (evento.nativeEvent.isComposing) return;
    const estavaAberto = estadoAtual.current.aberto;
    rolarAteAAtiva.current = true;
    const usada = despachar({ tipo: "tecla", tecla: evento.key, comModificador: evento.ctrlKey || evento.metaKey || evento.altKey });
    if (!usada) return;
    evento.preventDefault();
    // Dentro de um painel ou diálogo, o Esc fecha só a lista.
    if (evento.key === "Escape" && estavaAberto) evento.stopPropagation();
  }

  function medir() {
    const botao = gatilho.current;
    if (!botao) return;
    const ancora = botao.getBoundingClientRect();
    const visivel = window.visualViewport;
    const janela = visivel
      ? { topo: visivel.offsetTop, esquerda: visivel.offsetLeft, largura: visivel.width, altura: visivel.height }
      : { topo: 0, esquerda: 0, largura: window.innerWidth, altura: window.innerHeight };
    setPosicao((antes) =>
      posicionar({
        ancora: { topo: ancora.top, esquerda: ancora.left, largura: ancora.width, altura: ancora.height },
        janela,
        alturaDoLayout: document.documentElement.clientHeight,
        alturaDesejada: alturaEstimada({ opcoes: visiveis.length, grupos: blocos.filter((bloco) => bloco.grupo).length, comBusca }),
        comBusca,
        paraCimaAntes: antes?.modo === "ancorada" ? antes.paraCima : undefined,
      }),
    );
  }
  const medirAtual = useRef(medir);
  medirAtual.current = medir;

  const aberto = estado.aberto;

  // Abrir: a lista vai para a camada de cima do navegador (popover), que nenhum contêiner com rolagem corta e que
  // fica acima do painel lateral e dos diálogos. Sem suporte a popover, ela é só `position: fixed`.
  useLayoutEffect(() => {
    if (!aberto) return;
    const elemento = camada.current;
    try {
      elemento?.showPopover?.();
    } catch {
      // Já aberta ou fora da página: segue como `position: fixed`.
    }
    medirAtual.current();
    if (comBusca) campoDeBusca.current?.focus({ preventScroll: true });
    rolarAteAAtiva.current = true;

    const reposicionar = (evento?: Event) => {
      if (evento?.target instanceof Node && elemento?.contains(evento.target)) return;
      medirAtual.current();
    };
    const fora = (evento: PointerEvent) => {
      const alvo = evento.target;
      if (alvo instanceof Node && (gatilho.current?.contains(alvo) || elemento?.contains(alvo))) return;
      despacharAtual.current({ tipo: "fechar" });
    };
    window.addEventListener("resize", reposicionar);
    window.addEventListener("scroll", reposicionar, true);
    window.visualViewport?.addEventListener("resize", reposicionar);
    window.visualViewport?.addEventListener("scroll", reposicionar);
    document.addEventListener("pointerdown", fora, true);
    return () => {
      window.removeEventListener("resize", reposicionar);
      window.removeEventListener("scroll", reposicionar, true);
      window.visualViewport?.removeEventListener("resize", reposicionar);
      window.visualViewport?.removeEventListener("scroll", reposicionar);
      document.removeEventListener("pointerdown", fora, true);
    };
  }, [aberto, comBusca]);

  useLayoutEffect(() => {
    if (!aberto || !rolarAteAAtiva.current || !posicao) return;
    rolarAteAAtiva.current = false;
    const item = estado.ativo >= 0 ? document.getElementById(idDaOpcao(estado.ativo)) : null;
    if (lista.current && item) trazerParaAVista(lista.current, item);
  });

  // Formulário limpo (botão de limpar ou o React, depois de uma action): o campo volta ao valor inicial.
  useEffect(() => {
    const formulario = gatilho.current?.form;
    if (!formulario) return;
    const limpar = () => setEscolhido(null);
    formulario.addEventListener("reset", limpar);
    return () => formulario.removeEventListener("reset", limpar);
  }, [form]);

  useEffect(() => {
    validacao.current?.setCustomValidity(atual === "" ? MENSAGEM_DE_OBRIGATORIO : "");
  }, [atual, obrigatorio, desabilitado]);

  useEffect(
    () => () => {
      if (pausa.current) clearTimeout(pausa.current);
    },
    [],
  );

  function aoRolarALista() {
    const caixa = lista.current;
    if (caixa && estadoAtual.current.teto < visiveis.length && caixa.scrollTop + caixa.clientHeight >= caixa.scrollHeight - 80) {
      despachar({ tipo: "mostrar-mais" });
    }
  }

  function aoClicarNaCamada(evento: MouseEvent<HTMLDivElement>) {
    // Se o campo estiver dentro de um <label>, o clique na lista não pode valer como clique no rótulo.
    evento.preventDefault();
    // Tela estreita: tocar fora da folha (no fundo escurecido) fecha.
    if (evento.target === evento.currentTarget) {
      despachar({ tipo: "fechar" });
      gatilho.current?.focus({ preventScroll: true });
    }
  }

  const naEntrada = moldura === "entrada";
  const folha = posicao?.modo === "folha";
  const nomeDaLista = rotulo ?? ariaLabel;
  const ativa = aberto && estado.ativo >= 0 ? idDaOpcao(estado.ativo) : undefined;

  return (
    <div className={`relative ${className}`}>
      <button
        ref={gatilho}
        type="button"
        id={id}
        role="combobox"
        aria-haspopup={comBusca ? "dialog" : "listbox"}
        aria-expanded={aberto}
        aria-controls={aberto ? (comBusca ? idDaCamada : idDaLista) : undefined}
        aria-activedescendant={comBusca ? undefined : ativa}
        aria-label={ariaLabel}
        aria-labelledby={ariaLabelledBy}
        aria-describedby={ariaDescribedBy}
        aria-invalid={ariaInvalid || undefined}
        aria-required={ariaRequired || obrigatorio || undefined}
        disabled={desabilitado}
        form={form}
        data-searchable-select=""
        data-open={aberto || focoNaValidacao}
        className={`sem-caixa-alta ${naEntrada ? "seletor-da-entrada" : `${GATILHO_DO_SISTEMA} ${TAMANHO_DO_GATILHO[tamanho]}`}`}
        onClick={() => {
          rolarAteAAtiva.current = true;
          despachar(estadoAtual.current.aberto ? { tipo: "fechar" } : { tipo: "abrir" });
        }}
        onKeyDown={aoTeclar}
        // O botão "clica" ao soltar a barra de espaço: sem isto, a lista que o espaço acabou de abrir fecharia.
        onKeyUp={(evento) => {
          if (evento.key === " ") evento.preventDefault();
        }}
      >
        <span data-marcador={selecionada ? undefined : ""} className={`min-w-0 flex-1 [overflow-wrap:anywhere] ${selecionada || naEntrada ? "" : "text-[var(--ds-label-2)]"}`}>
          {selecionada?.rotulo ?? marcador ?? " "}
        </span>
        <ChevronDown size={16} aria-hidden className={`shrink-0 ${naEntrada ? "" : "text-[var(--ds-label-2)]"}`} />
      </button>

      {nome !== undefined && entraNoEnvio(atual, vazio !== undefined, marcador !== undefined) && (
        <input type="hidden" name={nome} value={atual} disabled={desabilitado} form={form} />
      )}

      {/* Campo oculto não trava o envio: quem carrega o "obrigatório" para o navegador é este campo invisível, por cima do botão. */}
      {obrigatorio && !desabilitado && (
        <input
          ref={validacao}
          tabIndex={-1}
          aria-hidden="true"
          required
          value={atual}
          form={form}
          onChange={() => undefined}
          onFocus={() => setFocoNaValidacao(true)}
          onBlur={() => setFocoNaValidacao(false)}
          onKeyDown={(evento) => {
            // Depois de um envio recusado, o navegador põe o foco aqui: qualquer tecla (menos o Tab) volta ao campo.
            if (evento.key === "Tab") return;
            gatilho.current?.focus({ preventScroll: true });
            aoTeclar(evento);
          }}
          className="pointer-events-none absolute inset-0 h-full w-full opacity-0"
        />
      )}

      {aberto && (
        <div
          ref={camada}
          // "manual": quem abre e fecha é o seletor; a lista só usa a camada de cima do navegador.
          popover="manual"
          id={idDaCamada}
          role={comBusca ? "dialog" : undefined}
          aria-label={comBusca ? (nomeDaLista ?? "Opções") : undefined}
          data-ds-scheme={naEntrada ? "dark" : undefined}
          className={`${CAMADA} ${naEntrada ? "seletor-camada-da-entrada" : ""} ${
            folha ? `bg-[var(--ds-scrim)] p-2 ${posicao.alinhamento === "topo" ? "justify-start" : "justify-end"}` : "bg-transparent p-0"
          }`}
          style={{ ...estiloDaCamada(posicao), overflow: "visible" }}
          // O foco fica onde está (no campo ou na busca) quando se clica na lista.
          onMouseDown={(evento) => {
            if (evento.target !== campoDeBusca.current) evento.preventDefault();
          }}
          onClick={aoClicarNaCamada}
        >
          <div className="flex max-h-full min-h-0 flex-col overflow-hidden rounded-[var(--ds-radius-md)] border border-[var(--ds-separator)] bg-[var(--ds-surface)] shadow-[var(--ds-shadow-3)]">
            {comBusca && (
              <div className="shrink-0 border-b border-[var(--ds-separator)] p-2">
                <div className="flex h-9 items-center gap-2 rounded-[8px] border border-[var(--ds-separator)] bg-[var(--ds-surface)] px-2 focus-within:border-[var(--ds-tint)] focus-within:shadow-[0_0_0_3px_color-mix(in_srgb,var(--ds-tint)_16%,transparent)] max-sm:h-11">
                  <Search size={16} aria-hidden className="shrink-0 text-[var(--ds-label-2)]" />
                  <input
                    ref={campoDeBusca}
                    type="text"
                    role="combobox"
                    aria-expanded="true"
                    aria-controls={idDaLista}
                    aria-activedescendant={ativa}
                    aria-autocomplete="list"
                    aria-label={nomeDaLista ? `Buscar em ${nomeDaLista}` : "Buscar"}
                    placeholder="Buscar…"
                    inputMode="search"
                    enterKeyHint="done"
                    autoComplete="off"
                    autoCorrect="off"
                    autoCapitalize="off"
                    spellCheck={false}
                    value={estado.busca}
                    onChange={(evento) => {
                      rolarAteAAtiva.current = true;
                      despachar({ tipo: "buscar", texto: evento.target.value });
                      if (lista.current) lista.current.scrollTop = 0;
                    }}
                    onKeyDown={aoTeclar}
                    // O destaque do foco é a borda da caixa em volta (as molduras desenham contorno em todo campo).
                    style={{ outline: "none", boxShadow: "none" }}
                    className="h-full w-full min-w-0 border-0 bg-transparent text-[14px] text-[var(--ds-label)]"
                  />
                </div>
              </div>
            )}
            <div
              ref={lista}
              id={idDaLista}
              role="listbox"
              aria-label={nomeDaLista ?? "Opções"}
              tabIndex={-1}
              onScroll={aoRolarALista}
              className={`min-h-0 flex-auto overflow-y-auto overscroll-contain ${visiveis.length > 0 ? "py-1" : ""}`}
            >
              {blocos.map((bloco) => {
                const linhas = bloco.itens.map(({ opcao, indice }) => (
                  <div
                    key={indice}
                    id={idDaOpcao(indice)}
                    role="option"
                    aria-selected={opcao.valor === atual}
                    aria-disabled={opcao.desabilitada || undefined}
                    data-ativo={indice === estado.ativo ? "" : undefined}
                    className={OPCAO}
                    onPointerMove={() => {
                      if (estadoAtual.current.ativo !== indice) despachar({ tipo: "apontar", indice });
                    }}
                    onClick={() => {
                      if (opcao.desabilitada) return;
                      despachar({ tipo: "fechar" });
                      gatilho.current?.focus({ preventScroll: true });
                      escolher(opcao.valor);
                    }}
                  >
                    <span className="min-w-0 flex-1">
                      {opcao.rotulo}
                      {opcao.descricao && <span className="mt-0.5 block text-[12px] text-[var(--ds-label-2)]">{opcao.descricao}</span>}
                    </span>
                    {opcao.valor === atual && <Check size={16} aria-hidden className="mt-0.5 shrink-0 text-[var(--ds-tint-text)]" />}
                  </div>
                ));
                if (!bloco.grupo) return linhas;
                const idDoGrupo = `${id}-grupo-${bloco.itens[0]!.indice}`;
                return (
                  <div key={idDoGrupo} role="group" aria-labelledby={idDoGrupo}>
                    <div id={idDoGrupo} role="presentation" className="px-3 pb-1 pt-2 text-[12px] text-[var(--ds-label-2)]">
                      {bloco.grupo}
                    </div>
                    {linhas}
                  </div>
                );
              })}
            </div>
            {visiveis.length === 0 && <p className="shrink-0 px-3 py-3 text-[14px] text-[var(--ds-label-2)]">Nenhum resultado</p>}
            {corte && <p className="shrink-0 border-t border-[var(--ds-separator)] px-3 py-2 text-[12px] text-[var(--ds-label-2)]">{corte}</p>}
            {comBusca && (
              <p role="status" aria-live="polite" className="sr-only">
                {anuncioDosResultados(visiveis.length, estado.busca)}
              </p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
