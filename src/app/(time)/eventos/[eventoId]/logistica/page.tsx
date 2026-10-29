import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { z } from "zod";

import { situacaoDaEscrita } from "@/fluxos/_base";
import { carregarCaronas, carregarHospedagem, carregarPedido, carregarVoos } from "@/fluxos/logistica";

import { SecaoDeCaronas } from "../../../logistica/_componentes/secao-de-caronas";
import { SecaoDeHospedagem } from "../../../logistica/_componentes/secao-de-hospedagem";
import { type ParametrosDeVoos, SecaoDeVoos, situacaoDoFiltro } from "../../../logistica/_componentes/secao-de-voos";
import { parametro } from "../../../logistica/_componentes/situacoes";
import { exigirAtor } from "@/app/(time)/_servidor/usuario-atual";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Logística" };

type Props = { params: Promise<{ eventoId: string }>; searchParams: Promise<Record<string, string | string[] | undefined>> };

/** As mesmas seções da Logística, filtradas por este evento, uma abaixo da outra. */
export default async function PaginaLogisticaDoEvento({ params, searchParams }: Props) {
  await exigirAtor();
  const eventoId = z.uuid().safeParse((await params).eventoId).data;
  if (!eventoId) notFound();
  const busca = await searchParams;
  const parametros: ParametrosDeVoos = {
    situacao: situacaoDoFiltro(parametro(busca.situacao)),
    ref: parametro(busca.ref),
    modo: parametro(busca.modo),
    novo: parametro(busca.novo),
    convocacao: parametro(busca.convocacao),
    registrado: parametro(busca.registrado),
  };
  const agora = new Date();
  const [voos, pedido, hospedagem, caronas, escrita] = await Promise.all([
    carregarVoos({ eventoId, situacao: situacaoDoFiltro(parametros.situacao) }, agora),
    parametros.ref ? carregarPedido(parametros.ref) : null,
    carregarHospedagem(eventoId, agora),
    carregarCaronas(eventoId, agora),
    situacaoDaEscrita(),
  ]);
  return (
    <>
      <SecaoDeVoos dados={voos} pedido={pedido} base={`/eventos/${eventoId}/logistica`} parametros={parametros} escrita={escrita.liberada} comSeletorDeEvento={false} />
      <SecaoDeHospedagem dados={hospedagem} escrita={escrita.liberada} comSeletorDeEvento={false} />
      <SecaoDeCaronas dados={caronas} escrita={escrita.liberada} comSeletorDeEvento={false} />
    </>
  );
}
