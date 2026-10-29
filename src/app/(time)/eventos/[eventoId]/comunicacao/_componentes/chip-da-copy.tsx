import { CheckCheck, CircleCheck, RefreshCw, TriangleAlert } from "lucide-react";

import { Chip, type TomDoChip } from "@/app/(time)/_componentes/ui/situacao";
import type { SituacaoDaCopy } from "@/modules/comunicacao";

// Rótulos, tons e ícones da doc 08 §13 (Copy).

function aparencia(situacao: SituacaoDaCopy): { rotulo: string; tom: TomDoChip; Icone: typeof CheckCheck } {
  switch (situacao) {
    case "FALTA_DADO":
      return { rotulo: "Falta dado", tom: "atencao", Icone: TriangleAlert };
    case "DESATUALIZADA":
      return { rotulo: "Desatualizada", tom: "atencao", Icone: RefreshCw };
    case "PRONTA":
      return { rotulo: "Pronta", tom: "sucesso", Icone: CircleCheck };
    case "ENVIADA":
      return { rotulo: "Enviada", tom: "informacao", Icone: CheckCheck };
    default: {
      const desconhecida: never = situacao;
      throw new Error(`situação de copy desconhecida: ${String(desconhecida)}`);
    }
  }
}

export function rotuloDaCopy(situacao: SituacaoDaCopy): string {
  return aparencia(situacao).rotulo;
}

export function ChipDaCopy({ situacao }: { situacao: SituacaoDaCopy }) {
  const { rotulo, tom, Icone } = aparencia(situacao);
  return (
    <Chip tom={tom} icone={<Icone size={14} aria-hidden />}>
      {rotulo}
    </Chip>
  );
}
