import { type CompraDoPedido, situacaoDoPagamento, type TotaisDoPagamento } from "@/modules/logistica";

import { dataCurta, dinheiro } from "../../_componentes/ui/formatos";
import { Chip } from "../../_componentes/ui/situacao";

// Pagamento das compras da SDC nas telas do time (Voos e Hospedagem): a SDC registra a compra e o valor; o time
// confere e aprova, confirmando que usou.

/** "A aprovar" (compra registrada, esperando o time) ou "Aprovado 12/11". Sem compra e cancelado não mostram nada. */
export function ChipDoPagamento({ pedido }: { pedido: CompraDoPedido }) {
  switch (situacaoDoPagamento(pedido)) {
    case "A_APROVAR":
      return <Chip tom="atencao">Pagamento a aprovar</Chip>;
    case "APROVADO":
      return <Chip tom="sucesso">Pagamento aprovado{pedido.aprovadoEm ? ` ${dataCurta(new Date(pedido.aprovadoEm))}` : ""}</Chip>;
    default:
      return null;
  }
}

/** A soma que a planilha faz, no recorte da tela: quanto espera a aprovação do time e quanto já foi aprovado. */
export function TotaisDoPagamentoNaTela({ totais }: { totais: TotaisDoPagamento }) {
  if (totais.aAprovar === 0 && totais.aprovados === 0) return null;
  return (
    <dl className="mb-4 flex flex-wrap gap-x-8 gap-y-2 rounded-[var(--ds-radius-md)] bg-[var(--ds-fill-4)] px-4 py-3 text-[14px]">
      <div>
        <dt className="text-[12px] text-[var(--ds-label-2)]">Compras a aprovar</dt>
        <dd className="tabular-nums">
          <span className="font-semibold">{dinheiro(totais.aAprovarCentavos)}</span> · {totais.aAprovar === 1 ? "1 compra" : `${totais.aAprovar} compras`}
        </dd>
      </div>
      <div>
        <dt className="text-[12px] text-[var(--ds-label-2)]">Aprovado para pagamento</dt>
        <dd className="tabular-nums">
          <span className="font-semibold">{dinheiro(totais.aprovadoCentavos)}</span> · {totais.aprovados === 1 ? "1 compra" : `${totais.aprovados} compras`}
        </dd>
      </div>
    </dl>
  );
}
