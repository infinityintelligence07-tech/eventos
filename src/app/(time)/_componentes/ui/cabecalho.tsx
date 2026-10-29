import Link from "next/link";
import { Fragment, type ReactNode } from "react";

import { TITULO_DA_PAGINA } from "./classes";

export type ItemDaMigalha = { rotulo: string; href?: string };

/** Calendário › CONF_AM_60 › Escala. O último item é a página atual. */
export function Migalha({ itens }: { itens: ItemDaMigalha[] }) {
  return (
    <nav aria-label="Você está em" className="mb-1 text-[13px] text-[var(--ds-label-2)]">
      <ol className="flex flex-wrap items-center gap-1">
        {itens.map((item, indice) => {
          const atual = indice === itens.length - 1;
          return (
            <Fragment key={`${item.rotulo}-${indice}`}>
              {indice > 0 && (
                <li aria-hidden className="select-none">
                  ›
                </li>
              )}
              <li>
                {atual || !item.href ? (
                  <span aria-current={atual ? "page" : undefined}>{item.rotulo}</span>
                ) : (
                  <Link href={item.href} className="hover:text-[var(--ds-label)] hover:underline">
                    {item.rotulo}
                  </Link>
                )}
              </li>
            </Fragment>
          );
        })}
      </ol>
    </nav>
  );
}

/** Topo de toda tela: migalha opcional, o único h1, subtítulo e as ações da página à direita. */
export function CabecalhoDaPagina({
  titulo,
  subtitulo,
  migalha,
  aoLadoDoTitulo,
  acoes,
}: {
  titulo: ReactNode;
  subtitulo?: ReactNode;
  /** `<Migalha itens={…} />` (ou `MigalhaDaSecao` nos layouts com abas). */
  migalha?: ReactNode;
  /** Ex.: chip da situação da escala. */
  aoLadoDoTitulo?: ReactNode;
  acoes?: ReactNode;
}) {
  return (
    <div className="mb-5 flex flex-wrap items-start justify-between gap-3">
      <div className="min-w-0">
        {migalha}
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
          <h1 className={TITULO_DA_PAGINA}>{titulo}</h1>
          {aoLadoDoTitulo}
        </div>
        {subtitulo && <p className="mt-1 text-[14px] text-[var(--ds-label-2)]">{subtitulo}</p>}
      </div>
      {acoes && <div className="flex flex-wrap gap-2">{acoes}</div>}
    </div>
  );
}
