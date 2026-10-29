import { CircleAlert, CircleCheck, Info, Lock, TriangleAlert } from "lucide-react";
import type { ReactNode } from "react";

export type TomDoAviso = "informacao" | "atencao" | "perigo" | "sucesso" | "neutro";

function estiloDoTom(tom: TomDoAviso): { fundo: string; icone: ReactNode } {
  const classe = "mt-0.5 shrink-0";
  switch (tom) {
    case "informacao":
      return { fundo: "bg-[var(--ds-tint-soft)]", icone: <Info size={18} aria-hidden className={`${classe} text-[var(--ds-tint-text)]`} /> };
    case "atencao":
      return {
        fundo: "bg-[var(--ds-orange-soft)]",
        icone: <TriangleAlert size={18} aria-hidden className={`${classe} text-[var(--ds-orange-deep)]`} />,
      };
    case "perigo":
      return { fundo: "bg-[var(--ds-red-soft)]", icone: <CircleAlert size={18} aria-hidden className={`${classe} text-[var(--ds-red-deep)]`} /> };
    case "sucesso":
      return {
        fundo: "bg-[var(--ds-green-soft)]",
        icone: <CircleCheck size={18} aria-hidden className={`${classe} text-[var(--ds-green-deep)]`} />,
      };
    case "neutro":
      return { fundo: "bg-[var(--ds-fill-4)]", icone: <Info size={18} aria-hidden className={`${classe} text-[var(--ds-label-2)]`} /> };
    default: {
      const desconhecido: never = tom;
      throw new Error(`tom desconhecido: ${String(desconhecido)}`);
    }
  }
}

/**
 * Faixa de aviso (doc 08 §3.12). `alerta` (role="alert") só para erro que acabou de acontecer;
 * aviso permanente é texto comum.
 */
export function Aviso({
  tom,
  titulo,
  icone,
  acao,
  alerta = false,
  className = "",
  children,
}: {
  tom: TomDoAviso;
  titulo?: ReactNode;
  icone?: ReactNode;
  /** Botão texto à direita. */
  acao?: ReactNode;
  alerta?: boolean;
  className?: string;
  children?: ReactNode;
}) {
  const estilo = estiloDoTom(tom);
  return (
    <div role={alerta ? "alert" : undefined} className={`flex items-start gap-3 rounded-[var(--ds-radius-md)] px-4 py-3 text-[14px] ${estilo.fundo} ${className}`}>
      {icone ?? estilo.icone}
      <div className="min-w-0 flex-1 text-[var(--ds-label)]">
        {titulo && <p className="font-semibold">{titulo}</p>}
        {children}
      </div>
      {acao && <div className="shrink-0">{acao}</div>}
    </div>
  );
}

export const MENSAGEM_SOMENTE_LEITURA = "Somente leitura: escrita desligada neste ambiente.";

/** Faixa das telas que escrevem, quando a guarda de escrita está fechada. */
export function FaixaSomenteLeitura({ className = "mb-5" }: { className?: string }) {
  return (
    <Aviso tom="neutro" className={className} icone={<Lock size={18} aria-hidden className="mt-0.5 shrink-0 text-[var(--ds-label-2)]" />}>
      {MENSAGEM_SOMENTE_LEITURA} Dá para consultar tudo, mas nada é gravado.
    </Aviso>
  );
}

/** Topo dos formulários de registro em nome de staff, SDC ou financeiro (doc 08 §3.11). */
export function FaixaEmNomeDe({ nome, className = "mb-4" }: { nome: string; className?: string }) {
  return (
    <Aviso tom="neutro" className={className}>
      Você está registrando em nome de {nome}. O registro fica marcado como feito pelo time.
    </Aviso>
  );
}
