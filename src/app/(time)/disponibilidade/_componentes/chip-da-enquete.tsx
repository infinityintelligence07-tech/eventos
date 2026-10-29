import { Clock, Lock } from "lucide-react";

import { Chip } from "@/app/(time)/_componentes/ui";
import { rotuloDaSituacaoDaEnquete, type SituacaoDaEnquete } from "@/modules/disponibilidade";

/** Enquete: Aberta (informação) · Encerrada (neutro) — doc 08 §13. */
export function ChipDaEnquete({ situacao }: { situacao: SituacaoDaEnquete }) {
  switch (situacao) {
    case "ABERTA":
      return (
        <Chip tom="informacao" icone={<Clock size={14} aria-hidden />}>
          {rotuloDaSituacaoDaEnquete(situacao)}
        </Chip>
      );
    case "ENCERRADA":
      return (
        <Chip tom="neutro" icone={<Lock size={14} aria-hidden />}>
          {rotuloDaSituacaoDaEnquete(situacao)}
        </Chip>
      );
    default: {
      const desconhecida: never = situacao;
      throw new Error(`situação de enquete desconhecida: ${String(desconhecida)}`);
    }
  }
}
