import type { Metadata } from "next";
import { z } from "zod";

import { situacaoDaEscrita } from "@/fluxos/_base";
import { carregarPedido, carregarVoos } from "@/fluxos/logistica";

import { CabecalhoDaLogistica } from "../_componentes/cabecalho-da-logistica";
import { parametro } from "../_componentes/situacoes";
import { type ParametrosDeVoos, SecaoDeVoos, situacaoDoFiltro } from "../_componentes/secao-de-voos";
import { exigirAtor } from "@/app/(time)/_servidor/usuario-atual";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Voos (SDC)" };

type Busca = Record<string, string | string[] | undefined>;

export default async function PaginaVoos({ searchParams }: { searchParams: Promise<Busca> }) {
  await exigirAtor();
  const busca = await searchParams;
  const eventoId = z.uuid().safeParse(parametro(busca.evento)).data;
  const parametros: ParametrosDeVoos = {
    evento: eventoId,
    situacao: situacaoDoFiltro(parametro(busca.situacao)),
    ref: parametro(busca.ref),
    modo: parametro(busca.modo),
    novo: parametro(busca.novo),
    convocacao: parametro(busca.convocacao),
    registrado: parametro(busca.registrado),
  };
  const agora = new Date();
  const [dados, pedido, escrita] = await Promise.all([
    carregarVoos({ eventoId, situacao: situacaoDoFiltro(parametros.situacao) }, agora),
    parametros.ref ? carregarPedido(parametros.ref) : null,
    situacaoDaEscrita(),
  ]);
  return (
    <>
      <CabecalhoDaLogistica />
      <SecaoDeVoos dados={dados} pedido={pedido} base="/logistica/voos" parametros={parametros} escrita={escrita.liberada} comSeletorDeEvento />
    </>
  );
}
