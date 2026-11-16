"use client";

import { CircleAlert } from "lucide-react";
import { type MouseEvent, useEffect, useRef } from "react";

import { idDoCampo } from "./classes";

/**
 * Topo do formulário depois de um envio com erro: lista os campos como links e leva o foco ao primeiro.
 * `campos` é ResultadoAcao.campos; `rotulos` traduz o caminho do Zod para o rótulo visível.
 */
export function ResumoDeErros({
  campos,
  rotulos,
  titulo = "Corrija os campos abaixo para continuar.",
}: {
  campos: Record<string, string[]> | undefined;
  rotulos: Record<string, string>;
  titulo?: string;
}) {
  const caminhos = Object.keys(campos ?? {});
  const primeiro = caminhos[0];

  const caixa = useRef<HTMLDivElement>(null);

  // O campo é procurado dentro do formulário deste resumo: outra parte da página pode ter um campo com o mesmo nome.
  function campoDe(caminho: string): HTMLElement | null {
    const id = idDoCampo(caminho);
    return caixa.current?.closest("form")?.querySelector<HTMLElement>(`#${CSS.escape(id)}`) ?? document.getElementById(id);
  }

  function irParaOCampo(evento: MouseEvent<HTMLAnchorElement>, caminho: string) {
    const campo = campoDe(caminho);
    if (!campo) return;
    evento.preventDefault();
    campo.focus();
    campo.scrollIntoView({ block: "center" });
  }

  useEffect(() => {
    if (primeiro) campoDe(primeiro)?.focus();
  }, [campos, primeiro]);

  if (!campos || caminhos.length === 0) return null;
  return (
    <div ref={caixa} className="mb-4 flex items-start gap-3 rounded-[var(--ds-radius-md)] bg-[var(--ds-red-soft)] px-4 py-3 text-[14px]">
      <CircleAlert size={18} aria-hidden className="mt-0.5 shrink-0 text-[var(--ds-red-deep)]" />
      <div>
        <p className="font-semibold">{titulo}</p>
        <ul className="mt-1 list-disc pl-5">
          {caminhos.map((caminho) => (
            <li key={caminho}>
              <a href={`#${idDoCampo(caminho)}`} onClick={(evento) => irParaOCampo(evento, caminho)} className="underline">
                {rotulos[caminho] ?? caminho}: {campos[caminho]?.[0]}
              </a>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
