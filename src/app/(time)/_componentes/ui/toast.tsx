"use client";

import { CircleAlert, CircleCheck, X } from "lucide-react";
import { createContext, type ReactNode, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";

import type { ResultadoAcao } from "./resultado-acao";

// doc 08 §3.10. Sucesso some em 6 s (10 s com "Desfazer") e pausa com mouse ou foco em cima.
// Erro não some sozinho e usa role="alert". O toast não rouba o foco.

export type AcaoDoToast = { rotulo: string; aoClicar: () => void };

type Toast = { id: number; tipo: "sucesso" | "erro"; mensagem: string; acao?: AcaoDoToast };

type ContextoDeToast = { mostrar(toast: Omit<Toast, "id">): void };

const Contexto = createContext<ContextoDeToast | null>(null);

const DURACAO_MS = 6000;
const DURACAO_COM_ACAO_MS = 10000;

function ItemDoToast({ toast, aoSumir }: { toast: Toast; aoSumir: () => void }) {
  const [pausado, setPausado] = useState(false);
  const restante = useRef(toast.acao ? DURACAO_COM_ACAO_MS : DURACAO_MS);

  useEffect(() => {
    if (toast.tipo === "erro" || pausado) return;
    const inicio = Date.now();
    const espera = setTimeout(aoSumir, restante.current);
    return () => {
      clearTimeout(espera);
      restante.current -= Date.now() - inicio;
    };
  }, [toast.tipo, pausado, aoSumir]);

  const sucesso = toast.tipo === "sucesso";
  return (
    <div
      role={sucesso ? undefined : "alert"}
      onMouseEnter={() => setPausado(true)}
      onMouseLeave={() => setPausado(false)}
      onFocus={() => setPausado(true)}
      onBlur={() => setPausado(false)}
      className="pointer-events-auto flex min-w-[320px] max-w-[440px] items-start gap-3 rounded-[var(--ds-radius-md)] bg-[var(--ds-surface)] px-4 py-3 text-[14px] text-[var(--ds-label)] shadow-[var(--ds-shadow-3)]"
    >
      {sucesso ? (
        <CircleCheck size={18} aria-hidden className="mt-0.5 shrink-0 text-[var(--ds-green-deep)]" />
      ) : (
        <CircleAlert size={18} aria-hidden className="mt-0.5 shrink-0 text-[var(--ds-red-deep)]" />
      )}
      <p className="flex-1">{toast.mensagem}</p>
      {toast.acao && (
        <button
          type="button"
          onClick={() => {
            toast.acao!.aoClicar();
            aoSumir();
          }}
          className="shrink-0 font-medium text-[var(--ds-tint-text)] hover:underline"
        >
          {toast.acao.rotulo}
        </button>
      )}
      {!sucesso && (
        <button type="button" onClick={aoSumir} aria-label="Fechar aviso" className="shrink-0 rounded p-0.5 text-[var(--ds-label-2)] hover:text-[var(--ds-label)]">
          <X size={16} aria-hidden />
        </button>
      )}
    </div>
  );
}

/** Fica no Painel: uma região de toasts para o app inteiro. */
export function ProvedorDeToast({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const proximoId = useRef(1);

  const remover = useCallback((id: number) => setToasts((atuais) => atuais.filter((toast) => toast.id !== id)), []);
  const contexto = useMemo<ContextoDeToast>(
    () => ({ mostrar: (toast) => setToasts((atuais) => [...atuais, { ...toast, id: proximoId.current++ }]) }),
    [],
  );

  return (
    <Contexto.Provider value={contexto}>
      {children}
      <div className="pointer-events-none fixed right-6 bottom-6 z-[60] flex flex-col items-end gap-2">
        <div role="status" aria-live="polite" className="flex flex-col items-end gap-2">
          {toasts
            .filter((toast) => toast.tipo === "sucesso")
            .map((toast) => (
              <ItemDoToast key={toast.id} toast={toast} aoSumir={() => remover(toast.id)} />
            ))}
        </div>
        {toasts
          .filter((toast) => toast.tipo === "erro")
          .map((toast) => (
            <ItemDoToast key={toast.id} toast={toast} aoSumir={() => remover(toast.id)} />
          ))}
      </div>
    </Contexto.Provider>
  );
}

/** Mensagem no passado e específica: "Escala enviada para aprovação." (não "Sucesso!"). */
export function useToast() {
  const contexto = useContext(Contexto);
  if (!contexto) throw new Error("useToast precisa do ProvedorDeToast (está no Painel)");
  return useMemo(
    () => ({
      sucesso: (mensagem: string, acao?: AcaoDoToast) => contexto.mostrar({ tipo: "sucesso", mensagem, acao }),
      erro: (mensagem: string, acao?: AcaoDoToast) => contexto.mostrar({ tipo: "erro", mensagem, acao }),
    }),
    [contexto],
  );
}

/**
 * Mostra o toast do resultado de uma server action (o estado do useActionState).
 * Só funciona se o componente continuar na tela depois da ação: quando a ação tira o formulário da tela
 * (item que sai da lista, painel que fecha), o efeito não roda e o toast se perde. Para isso, use `useAcao`.
 */
export function useToastDoResultado(resultado: ResultadoAcao) {
  const toast = useToast();
  const anterior = useRef(resultado);
  useEffect(() => {
    if (resultado === anterior.current) return;
    anterior.current = resultado;
    if (resultado.ok) {
      if (resultado.mensagem) toast.sucesso(resultado.mensagem);
    } else if (!resultado.campos || Object.keys(resultado.campos).length === 0) {
      toast.erro(resultado.erro);
    }
  }, [resultado, toast]);
}
