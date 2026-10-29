import { CircleCheck, TriangleAlert } from "lucide-react";

import { Chip } from "@/app/(time)/_componentes/ui";
import { type PendenciaDoCadastro, rotuloDaPendencia } from "@/modules/pessoas";

/** "Completo" (sucesso) ou a primeira pendência (atenção) + "+N" com a lista completa no title. */
export function ChipDoCadastro({ pendencias }: { pendencias: PendenciaDoCadastro[] }) {
  const [primeira, ...outras] = pendencias;
  if (!primeira) {
    return (
      <Chip tom="sucesso" icone={<CircleCheck size={14} aria-hidden />}>
        Completo
      </Chip>
    );
  }
  const todas = pendencias.map(rotuloDaPendencia).join(", ");
  return (
    <span title={todas}>
      <Chip tom="atencao" icone={<TriangleAlert size={14} aria-hidden />}>
        {rotuloDaPendencia(primeira)}
        {outras.length > 0 && (
          <>
            <span aria-hidden> +{outras.length}</span>
            <span className="sr-only">, {outras.map(rotuloDaPendencia).join(", ")}</span>
          </>
        )}
      </Chip>
    </span>
  );
}
