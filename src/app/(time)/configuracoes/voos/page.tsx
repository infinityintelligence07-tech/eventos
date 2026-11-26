import type { Metadata } from "next";
import Link from "next/link";

import { Cartao, FaixaSomenteLeitura, SemPermissaoNaAcao } from "@/app/(time)/_componentes/ui";
import { exigirAtor, permissoesDoAtor } from "@/app/(time)/_servidor/usuario-atual";
import { situacaoDaEscrita } from "@/fluxos/_base";
import { carregarAvisoDeVoos } from "@/fluxos/logistica";

import { FormularioDoAviso } from "./_componentes/formulario-do-aviso";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Aviso de voos" };

/** Quantos dias antes do evento o sistema começa a avisar, na tela, que há passagens a pedir à SDC. */
export default async function PaginaAvisoDeVoos() {
  await exigirAtor();
  const [aviso, permissoes, escrita] = await Promise.all([carregarAvisoDeVoos(), permissoesDoAtor("config.aviso_de_voos"), situacaoDaEscrita()]);

  return (
    <>
      {!escrita.liberada && <FaixaSomenteLeitura />}

      <Cartao
        id="aviso-de-voos"
        titulo="Aviso de passagens a pedir"
        explicacao="Quando um evento entra neste prazo e ainda há passagens a pedir à SDC, o aviso aparece na Dashboard e no topo da tela de Voos, para a líder e para o time."
      >
        {permissoes["config.aviso_de_voos"] ? (
          <FormularioDoAviso dias={aviso.dias} minimo={aviso.minimo} maximo={aviso.maximo} escritaLiberada={escrita.liberada} />
        ) : (
          <div className="flex flex-col gap-1">
            <p className="text-[14px]">O aviso começa {aviso.dias} dias antes do evento.</p>
            <SemPermissaoNaAcao permissao="config.aviso_de_voos" />
          </div>
        )}

        <dl className="mt-4 grid grid-cols-[minmax(140px,auto)_1fr] gap-x-4 gap-y-1 text-[14px]">
          <dt className="text-[var(--ds-label-2)]">Em vigor</dt>
          <dd>
            {aviso.dias} dias antes do evento{aviso.dias === aviso.padrao ? " (o padrão: 3 meses)" : ` (o padrão é ${aviso.padrao})`}.
          </dd>
          <dt className="text-[var(--ds-label-2)]">Na janela</dt>
          <dd>
            Entre {aviso.dias} e {aviso.diasDoAtraso + 1} dias antes do evento: a passagem aparece como a pedir.
          </dd>
          <dt className="text-[var(--ds-label-2)]">Atrasado</dt>
          <dd>
            Com {aviso.diasDoAtraso} dias ou menos: o aviso passa a dizer &quot;atrasado&quot;. Esse limite acompanha o aviso (dois terços dele, no máximo 60 dias).
          </dd>
        </dl>

        <p className="mt-4 text-[13px] text-[var(--ds-label-2)]">
          O aviso fica só na tela (não manda e-mail nem WhatsApp). Mudar o prazo vale dali em diante.{" "}
          <Link href="/logistica/voos?situacao=A_PEDIR" className="font-medium text-[var(--ds-tint-text)] hover:underline">
            Ver passagens a pedir
          </Link>
        </p>
      </Cartao>
    </>
  );
}
