"use client";

import { LoaderCircle } from "lucide-react";
import { type ButtonHTMLAttributes, type MouseEvent, type ReactNode, useId } from "react";
import { useFormStatus } from "react-dom";

import { classesDoBotao, type TamanhoDoBotao, type VarianteDoBotao } from "./classes";

export type PropsDoBotao = Omit<ButtonHTMLAttributes<HTMLButtonElement>, "disabled"> & {
  variante?: VarianteDoBotao;
  tamanho?: TamanhoDoBotao;
  /** Ícone lucide com size 18 (16 no pequeno) e aria-hidden. */
  icone?: ReactNode;
  carregando?: boolean;
  /** Texto no gerúndio enquanto carrega ("Salvando…"). */
  textoCarregando?: string;
  /**
   * Deixa o botão focável mas inerte (aria-disabled) e mostra o porquê ao lado, ligado por aria-describedby.
   * Use em vez de `disabled` quando a pessoa precisa saber o motivo.
   */
  motivoDesabilitado?: string;
};

export function Botao({
  variante = "secundario",
  tamanho = "normal",
  icone,
  carregando = false,
  textoCarregando,
  motivoDesabilitado,
  type = "button",
  className = "",
  onClick,
  children,
  ...resto
}: PropsDoBotao) {
  const idDoMotivo = useId();
  const inerte = carregando || motivoDesabilitado !== undefined;

  function aoClicar(evento: MouseEvent<HTMLButtonElement>) {
    if (inerte) {
      evento.preventDefault();
      return;
    }
    onClick?.(evento);
  }

  const botao = (
    <button
      {...resto}
      type={type}
      onClick={aoClicar}
      aria-disabled={inerte || undefined}
      aria-busy={carregando || undefined}
      aria-describedby={[resto["aria-describedby"], motivoDesabilitado ? idDoMotivo : null].filter(Boolean).join(" ") || undefined}
      className={`${classesDoBotao({ variante, tamanho, desabilitado: motivoDesabilitado !== undefined })} ${className}`}
    >
      {carregando ? (
        <LoaderCircle size={tamanho === "pequeno" ? 16 : 18} className="animate-spin motion-reduce:animate-none" aria-hidden />
      ) : (
        icone
      )}
      {carregando && textoCarregando ? textoCarregando : children}
    </button>
  );

  if (!motivoDesabilitado) return botao;
  return (
    <span className="inline-flex flex-wrap items-center gap-2">
      {botao}
      <span id={idDoMotivo} className="text-[12px] text-[var(--ds-label-2)]">
        {motivoDesabilitado}
      </span>
    </span>
  );
}

/** Botão de envio de `<form action={…}>`: mostra "carregando" sozinho enquanto a server action roda. */
export function BotaoDeEnvio({ variante = "primario", ...props }: Omit<PropsDoBotao, "type" | "carregando">) {
  const { pending } = useFormStatus();
  return <Botao {...props} variante={variante} type="submit" carregando={pending} />;
}
