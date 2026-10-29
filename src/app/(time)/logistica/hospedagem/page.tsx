import type { Metadata } from "next";
import { z } from "zod";

import { situacaoDaEscrita } from "@/fluxos/_base";
import { carregarHospedagem } from "@/fluxos/logistica";

import { CabecalhoDaLogistica } from "../_componentes/cabecalho-da-logistica";
import { SecaoDeHospedagem } from "../_componentes/secao-de-hospedagem";
import { parametro } from "../_componentes/situacoes";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Hospedagem" };

export default async function PaginaHospedagem({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const eventoId = z.uuid().safeParse(parametro((await searchParams).evento)).data ?? null;
  const [dados, escrita] = await Promise.all([carregarHospedagem(eventoId, new Date()), situacaoDaEscrita()]);
  return (
    <>
      <CabecalhoDaLogistica />
      <SecaoDeHospedagem dados={dados} escrita={escrita.liberada} comSeletorDeEvento />
    </>
  );
}
