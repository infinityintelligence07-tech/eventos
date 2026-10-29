"use client";

import { X } from "lucide-react";
import { type MouseEvent, type ReactNode, type SyntheticEvent, useEffect, useId, useRef, useState } from "react";

import { Botao } from "./botao";
import { TITULO_DE_SECAO } from "./classes";

// doc 08 §3.9: <dialog> nativo com showModal() (prende o foco, Esc fecha, foco volta para quem abriu).
// Controlado: quem usa guarda o `aberto` (estado ou ?parametro= na URL) e fecha em `aoFechar`.

/** Quem abriu: o elemento em foco ou, se ele foi trocado na nova renderização, o link para o endereço do painel. */
function devolverFoco(origem: HTMLElement | null, enderecoDoPainel: string | null) {
  const ativo = document.activeElement;
  if (ativo && ativo !== document.body) return;
  const alvo = origem?.isConnected ? origem : enderecoDoPainel ? document.querySelector<HTMLElement>(`a[href="${CSS.escape(enderecoDoPainel)}"]`) : null;
  alvo?.focus();
}

function useDialogo(aberto: boolean) {
  const referencia = useRef<HTMLDialogElement>(null);
  const origem = useRef<HTMLElement | null>(null);
  const enderecoDoPainel = useRef<string | null>(null);

  useEffect(() => {
    const dialogo = referencia.current;
    if (!dialogo) return;
    if (aberto && !dialogo.open) {
      origem.current = document.activeElement instanceof HTMLElement && document.activeElement !== document.body ? document.activeElement : null;
      enderecoDoPainel.current = `${location.pathname}${location.search}`;
      dialogo.showModal();
    } else if (!aberto && dialogo.open) {
      dialogo.close();
      devolverFoco(origem.current, null);
    }
  }, [aberto]);

  // Painel aberto pela URL (?vaga=, ?protocolo=) não fecha pelo `aberto`: some quando a URL muda, sem passar pelo
  // close(). O foco é devolvido no desmonte, depois que a lista voltou a ser renderizada (WCAG 2.4.3).
  useEffect(
    () => () => {
      const quem = origem.current;
      const endereco = enderecoDoPainel.current;
      requestAnimationFrame(() => devolverFoco(quem, endereco));
    },
    [],
  );

  return referencia;
}

export function PainelLateral({
  aberto,
  aoFechar,
  titulo,
  subtitulo,
  largura = 520,
  rodape,
  alteracoesNaoSalvas = false,
  children,
}: {
  aberto: boolean;
  aoFechar: () => void;
  titulo: ReactNode;
  subtitulo?: ReactNode;
  /** 520 (padrão) ou 720 (detalhe de custo). */
  largura?: 520 | 720;
  /** Botões do rodapé fixo (primário à direita). */
  rodape?: ReactNode;
  /** Pede "Descartar as alterações?" antes de fechar. */
  alteracoesNaoSalvas?: boolean;
  children: ReactNode;
}) {
  const referencia = useDialogo(aberto);
  const idDoTitulo = useId();
  const [confirmandoDescarte, setConfirmandoDescarte] = useState(false);

  function pedirParaFechar() {
    if (alteracoesNaoSalvas) setConfirmandoDescarte(true);
    else aoFechar();
  }

  function aoCancelar(evento: SyntheticEvent<HTMLDialogElement>) {
    evento.preventDefault();
    // O Esc da confirmação de descarte também chega aqui pela árvore do React.
    if (evento.target === evento.currentTarget) pedirParaFechar();
  }

  function aoClicarFora(evento: MouseEvent<HTMLDialogElement>) {
    if (evento.target === evento.currentTarget) pedirParaFechar();
  }

  return (
    <dialog
      ref={referencia}
      aria-labelledby={idDoTitulo}
      onCancel={aoCancelar}
      onClick={aoClicarFora}
      className={`painel-lateral fixed inset-y-0 right-0 left-auto m-0 h-dvh max-h-none ${
        largura === 720 ? "w-[min(720px,100vw)]" : "w-[min(520px,100vw)]"
      } max-w-none bg-[var(--ds-surface)] p-0 text-[var(--ds-label)] shadow-[var(--ds-shadow-3)] backdrop:bg-[var(--ds-scrim)]`}
    >
      <div className="flex h-full flex-col">
        <div className="flex items-start justify-between gap-3 border-b border-[var(--ds-separator)] px-5 py-4">
          <div>
            <h2 id={idDoTitulo} className={TITULO_DE_SECAO}>
              {titulo}
            </h2>
            {subtitulo && <p className="mt-0.5 text-[13px] text-[var(--ds-label-2)]">{subtitulo}</p>}
          </div>
          <Botao variante="icone" aria-label="Fechar" onClick={pedirParaFechar} icone={<X size={18} aria-hidden />} />
        </div>
        <div className="flex-1 overflow-y-auto px-5 py-4">{children}</div>
        {rodape && (
          <div className="sticky bottom-0 flex justify-end gap-2 border-t border-[var(--ds-separator)] bg-[var(--ds-surface)] px-5 py-3">{rodape}</div>
        )}
      </div>
      <Confirmacao
        aberto={confirmandoDescarte}
        aoFechar={() => setConfirmandoDescarte(false)}
        titulo="Descartar as alterações?"
        descricao="O que você preencheu neste painel não foi salvo."
        rotuloConfirmar="Descartar"
        rotuloCancelar="Continuar editando"
        destrutiva
        aoConfirmar={() => {
          setConfirmandoDescarte(false);
          aoFechar();
        }}
      />
    </dialog>
  );
}

/**
 * Confirmação de ação destrutiva ou de alto impacto. Título é a pergunta; descrição diz a consequência.
 * Com `acao` (server action ou dispatch do useActionState), o conteúdo vira um <form> e o botão confirma enviando.
 */
export function Confirmacao({
  aberto,
  aoFechar,
  titulo,
  descricao,
  rotuloConfirmar,
  rotuloCancelar = "Cancelar",
  destrutiva = false,
  carregando = false,
  aoConfirmar,
  acao,
  children,
}: {
  aberto: boolean;
  aoFechar: () => void;
  titulo: ReactNode;
  descricao: ReactNode;
  /** O verbo da ação ("Remover", "Devolver escala"), nunca "OK". */
  rotuloConfirmar: string;
  rotuloCancelar?: string;
  /** Botão vermelho e foco inicial em "Cancelar". */
  destrutiva?: boolean;
  carregando?: boolean;
  aoConfirmar?: () => void;
  acao?: (form: FormData) => void | Promise<void>;
  /** Campos extras (ex.: comentário da devolução). */
  children?: ReactNode;
}) {
  const referencia = useDialogo(aberto);
  const idDoTitulo = useId();
  const idDaDescricao = useId();

  const conteudo = (
    <>
      <h2 id={idDoTitulo} className={TITULO_DE_SECAO}>
        {titulo}
      </h2>
      <div id={idDaDescricao} className="mt-2 text-[14px] text-[var(--ds-label-2)]">
        {descricao}
      </div>
      {children && <div className="mt-4">{children}</div>}
      <div className="mt-6 flex flex-wrap justify-end gap-2">
        <Botao onClick={aoFechar} autoFocus={destrutiva}>
          {rotuloCancelar}
        </Botao>
        <Botao
          type={acao ? "submit" : "button"}
          variante={destrutiva ? "perigo-confirmado" : "primario"}
          carregando={carregando}
          onClick={acao ? undefined : aoConfirmar}
        >
          {rotuloConfirmar}
        </Botao>
      </div>
    </>
  );

  return (
    <dialog
      ref={referencia}
      aria-labelledby={idDoTitulo}
      aria-describedby={idDaDescricao}
      onCancel={(evento) => {
        evento.preventDefault();
        evento.stopPropagation();
        aoFechar();
      }}
      onClick={(evento) => evento.stopPropagation()}
      className="m-auto w-[min(440px,calc(100vw-32px))] rounded-[var(--ds-radius-xl)] bg-[var(--ds-surface)] p-6 text-[var(--ds-label)] shadow-[var(--ds-shadow-3)] backdrop:bg-[var(--ds-scrim)]"
    >
      {acao ? <form action={acao}>{conteudo}</form> : conteudo}
    </dialog>
  );
}
