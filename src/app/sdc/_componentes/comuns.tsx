import Link from "next/link";
import type { ReactNode } from "react";

import { CARTAO } from "@/app/(time)/_componentes/ui/classes";
import { dataCurta, dinheiro, periodo } from "@/app/(time)/_componentes/ui/formatos";
import { Chip } from "@/app/(time)/_componentes/ui/situacao";
import type { SituacaoParaASdc } from "@/fluxos/sdc";
import type { EventoParaASdc, TotaisDoPagamento } from "@/modules/logistica";

// Peças das duas telas da SDC (Voos e Hospedagem). Tudo em cartões empilhados: funciona no celular sem rolar de lado.

const ROTULOS: Record<SituacaoParaASdc, string> = {
  A_COMPRAR: "A comprar",
  AGUARDANDO_APROVACAO: "Aguardando aprovação",
  APROVADO: "Aprovados",
  CANCELADO: "Cancelados",
};

const ORDEM: SituacaoParaASdc[] = ["A_COMPRAR", "AGUARDANDO_APROVACAO", "APROVADO", "CANCELADO"];

export function situacaoDoFiltroDaSdc(valor: string | string[] | undefined): SituacaoParaASdc | undefined {
  return ORDEM.find((situacao) => situacao === valor);
}

/** O que o time já aprovou para pagamento e o que ainda espera a conferência dele (a soma que a planilha faz). */
export function TotaisDaSdc({ totais }: { totais: TotaisDoPagamento }) {
  return (
    <dl className="mb-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
      <div className={`${CARTAO} px-5 py-4`}>
        <dt className="text-[12px] font-medium text-[var(--ds-label-2)]">Aguardando aprovação do time</dt>
        <dd className="mt-1 text-[22px] font-semibold tabular-nums">{dinheiro(totais.aAprovarCentavos)}</dd>
        <dd className="text-[12px] text-[var(--ds-label-2)]">{totais.aAprovar === 1 ? "1 compra" : `${totais.aAprovar} compras`}</dd>
      </div>
      <div className={`${CARTAO} px-5 py-4`}>
        <dt className="text-[12px] font-medium text-[var(--ds-label-2)]">Aprovado para pagamento</dt>
        <dd className="mt-1 text-[22px] font-semibold tabular-nums">{dinheiro(totais.aprovadoCentavos)}</dd>
        <dd className="text-[12px] text-[var(--ds-label-2)]">{totais.aprovados === 1 ? "1 compra" : `${totais.aprovados} compras`}</dd>
      </div>
    </dl>
  );
}

export function FiltroDaSdc({ base, atual, contagens }: { base: string; atual: SituacaoParaASdc | undefined; contagens: Record<SituacaoParaASdc, number> }) {
  const opcoes: { valor: SituacaoParaASdc | undefined; rotulo: string }[] = [...ORDEM.map((valor) => ({ valor, rotulo: `${ROTULOS[valor]} (${contagens[valor]})` })), { valor: undefined, rotulo: "Todos" }];
  return (
    <nav aria-label="Filtrar por situação" className="mb-5 overflow-x-auto">
      <ul className="flex gap-2">
        {opcoes.map((opcao) => {
          const ativo = opcao.valor === atual;
          return (
            <li key={opcao.rotulo}>
              <Link
                href={opcao.valor ? `${base}?situacao=${opcao.valor}` : base}
                aria-current={ativo ? "true" : undefined}
                className={`inline-flex h-9 items-center whitespace-nowrap rounded-full border px-3 text-[13px] font-medium ${
                  ativo ? "border-transparent bg-[var(--ds-tint-soft)] text-[var(--ds-tint-text)]" : "border-[var(--ds-separator)] text-[var(--ds-label-2)] hover:text-[var(--ds-label)]"
                }`}
              >
                {opcao.rotulo}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

/** "16 a 18/12 · IPR_POA_12 · Imersão · Centro de Eventos — Porto Alegre (RS)". */
export function TituloDoEvento({ evento }: { evento: EventoParaASdc }) {
  const onde = [evento.local, evento.cidade && evento.uf ? `${evento.cidade} (${evento.uf})` : null].filter(Boolean).join(" — ");
  return (
    <h3 className="mb-2 text-[15px] font-semibold">
      {periodo(evento.dataInicio, evento.dataFim)} · {evento.codigo ?? evento.nome}
      <span className="block text-[13px] font-normal text-[var(--ds-label-2)]">{[evento.codigo ? evento.nome : null, onde].filter(Boolean).join(" · ")}</span>
    </h3>
  );
}

/** O que a SDC precisa saber do pagamento: se o time ainda vai conferir, se já aprovou (e quando) ou se cancelou. */
export function SituacaoDoPedidoParaASdc({ situacao, aprovadoEm }: { situacao: SituacaoParaASdc; aprovadoEm: Date | null }) {
  switch (situacao) {
    case "A_COMPRAR":
      return <Chip tom="informacao">A comprar</Chip>;
    case "AGUARDANDO_APROVACAO":
      return <Chip tom="atencao">Aguardando aprovação do time</Chip>;
    case "APROVADO":
      return <Chip tom="sucesso">Aprovado para pagamento{aprovadoEm ? ` em ${dataCurta(aprovadoEm)}` : ""}</Chip>;
    case "CANCELADO":
      return (
        <Chip tom="neutro" riscado>
          Cancelado pelo time
        </Chip>
      );
    default: {
      const desconhecida: never = situacao;
      throw new Error(`situação desconhecida: ${String(desconhecida)}`);
    }
  }
}

export function Linha({ rotulo, children }: { rotulo: string; children: ReactNode }) {
  return (
    <>
      <dt className="text-[var(--ds-label-2)]">{rotulo}</dt>
      <dd className="min-w-0 break-words">{children}</dd>
    </>
  );
}
