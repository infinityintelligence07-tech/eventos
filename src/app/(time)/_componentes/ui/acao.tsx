"use client";

import {
  type FormEvent,
  type FormHTMLAttributes,
  type ReactNode,
  startTransition,
  useActionState,
  useCallback,
  useRef,
} from "react";

import { ACAO_NAO_EXECUTADA, errosDoCampo, type ResultadoAcao, temErroDeCampo } from "./resultado-acao";
import { useToast } from "./toast";

/** Assinatura das server actions para useActionState. */
export type AcaoDoFormulario = (estado: ResultadoAcao, form: FormData) => Promise<ResultadoAcao>;

export type ErrosDoCampo = (caminho: string) => string[] | undefined;

export type OpcoesDaAcao = {
  /** Roda depois de um resultado ok (fechar painel, navegar). */
  aoConcluir?: () => void;
  /**
   * Erro de campo também vira toast (com a primeira mensagem). Use quando os campos são ocultos ou não mostram
   * o erro ao lado. Padrão: erro de campo fica só no formulário.
   */
  toastDeCampo?: boolean;
};

/**
 * useActionState + toast do resultado. O toast sai de dentro da action, e não de um efeito: o formulário costuma
 * sumir da tela na mesma atualização (solicitação aprovada sai da fila, pessoa muda de quarto) e o efeito não rodaria.
 */
export function useAcao(acao: AcaoDoFormulario, opcoes: OpcoesDaAcao | (() => void) = {}) {
  const { aoConcluir, toastDeCampo = false } = typeof opcoes === "function" ? { aoConcluir: opcoes } : opcoes;
  const toast = useToast();
  const concluir = useRef(aoConcluir);
  concluir.current = aoConcluir;

  const comRetorno = useCallback(
    async (anterior: ResultadoAcao, form: FormData): Promise<ResultadoAcao> => {
      const resultado = await acao(anterior, form);
      if (resultado.ok) {
        if (resultado.mensagem) toast.sucesso(resultado.mensagem);
        concluir.current?.();
      } else if (!temErroDeCampo(resultado)) {
        toast.erro(resultado.erro);
      } else if (toastDeCampo) {
        toast.erro(Object.values(resultado.campos ?? {})[0]?.[0] ?? resultado.erro);
      }
      return resultado;
    },
    [acao, toast, toastDeCampo],
  );
  const [estado, despachar, pendente] = useActionState(comRetorno, ACAO_NAO_EXECUTADA);

  const erros: ErrosDoCampo = (caminho) => errosDoCampo(estado, caminho);

  /**
   * Para `<form onSubmit={enviar}>`: envia sem o React limpar o formulário (com `action`, os campos voltam ao
   * valor inicial e o que foi digitado se perde quando a ação devolve erro).
   */
  function enviar(evento: FormEvent<HTMLFormElement>) {
    evento.preventDefault();
    const dados = new FormData(evento.currentTarget);
    startTransition(() => despachar(dados));
  }

  return { estado, despachar, pendente, erros, enviar };
}

/** `<form>` ligado a uma server action. Os filhos podem ser server components ou uma função do estado. */
export function FormularioDeAcao({
  acao,
  aoConcluir,
  toastDeCampo,
  children,
  ...resto
}: Omit<FormHTMLAttributes<HTMLFormElement>, "action" | "children"> &
  OpcoesDaAcao & {
    acao: AcaoDoFormulario;
    children: ReactNode | ((estado: ResultadoAcao, pendente: boolean) => ReactNode);
  }) {
  const { estado, despachar, pendente } = useAcao(acao, { aoConcluir, toastDeCampo });
  return (
    <form {...resto} action={despachar}>
      {typeof children === "function" ? children(estado, pendente) : children}
    </form>
  );
}

/** Mensagem geral do erro (sem campo) dentro de painéis, além do toast. */
export function ErroDoFormulario({ estado }: { estado: ResultadoAcao }) {
  if (estado.ok || temErroDeCampo(estado)) return null;
  return (
    <p role="alert" className="mb-3 rounded-[var(--ds-radius-md)] bg-[var(--ds-red-soft)] px-4 py-3 text-[14px] text-[var(--ds-label)]">
      {estado.erro}
    </p>
  );
}
