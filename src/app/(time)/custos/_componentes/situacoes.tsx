import { CircleCheck, CircleX, Clock, OctagonAlert, TriangleAlert } from "lucide-react";

import { type NivelDeExcecao, rotuloDaAuditoria, rotuloDoNivel, type StatusAuditoria } from "@/modules/custos";

import { Chip } from "../../_componentes/ui/situacao";

/** Doc 08 §13: Para auditar (informação) · Aprovada (sucesso) · Reprovada (perigo). */
export function ChipDaAuditoria({ status }: { status: StatusAuditoria }) {
  const rotulo = rotuloDaAuditoria(status);
  switch (status) {
    case "PENDENTE":
      return (
        <Chip tom="informacao" icone={<Clock size={14} aria-hidden />}>
          {rotulo}
        </Chip>
      );
    case "APROVADO":
      return (
        <Chip tom="sucesso" icone={<CircleCheck size={14} aria-hidden />}>
          {rotulo}
        </Chip>
      );
    case "REPROVADO":
      return (
        <Chip tom="perigo" icone={<CircleX size={14} aria-hidden />}>
          {rotulo}
        </Chip>
      );
    default: {
      const desconhecido: never = status;
      throw new Error(`status desconhecido: ${String(desconhecido)}`);
    }
  }
}

/** Crítico (perigo, OctagonAlert) · Alerta (atenção, TriangleAlert) · sem alerta: nada. */
export function ChipDoAlerta({ nivel }: { nivel: NivelDeExcecao }) {
  const rotulo = rotuloDoNivel(nivel);
  switch (nivel) {
    case "CRITICO":
      return (
        <Chip tom="perigo" icone={<OctagonAlert size={14} aria-hidden />}>
          {rotulo}
        </Chip>
      );
    case "ALERTA":
      return (
        <Chip tom="atencao" icone={<TriangleAlert size={14} aria-hidden />}>
          {rotulo}
        </Chip>
      );
    case "NENHUM":
      return null;
    default: {
      const desconhecido: never = nivel;
      throw new Error(`nível desconhecido: ${String(desconhecido)}`);
    }
  }
}
