import type { Metadata } from "next";
import { z } from "zod";

import { situacaoDaEscrita } from "@/fluxos/_base";
import { carregarCaronas } from "@/fluxos/logistica";

import { CabecalhoDaLogistica } from "../_componentes/cabecalho-da-logistica";
import { NovoMotorista, SecaoDeCaronas } from "../_componentes/secao-de-caronas";
import { parametro } from "../_componentes/situacoes";
import { exigirAtor } from "@/app/(time)/_servidor/usuario-atual";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Caronas" };

export default async function PaginaCaronas({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  await exigirAtor();
  const eventoId = z.uuid().safeParse(parametro((await searchParams).evento)).data ?? null;
  const [dados, escrita] = await Promise.all([carregarCaronas(eventoId, new Date()), situacaoDaEscrita()]);
  return (
    <>
      <CabecalhoDaLogistica acoes={escrita.liberada && <NovoMotorista dados={dados} />} />
      <SecaoDeCaronas dados={dados} escrita={escrita.liberada} comSeletorDeEvento />
    </>
  );
}
