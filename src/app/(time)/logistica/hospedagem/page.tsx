import type { Metadata } from "next";
import { z } from "zod";

import { situacaoDaEscrita } from "@/fluxos/_base";
import { carregarHospedagem } from "@/fluxos/logistica";
import { recorteDaLogistica } from "@/modules/logistica";

import { CabecalhoDeHospedagem } from "../_componentes/cabecalho-da-logistica";
import { SecaoDeHospedagem } from "../_componentes/secao-de-hospedagem";
import { parametro } from "../_componentes/situacoes";
import { exigirAtor } from "@/app/(time)/_servidor/usuario-atual";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Hospedagem" };

/** Os quartos do evento: quem dorme com quem. As caronas ficam na escala do evento (Vitor, 26/11/2026). */
export default async function PaginaHospedagem({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  await exigirAtor();
  const busca = await searchParams;
  const eventoId = z.uuid().safeParse(parametro(busca.evento)).data ?? null;
  const agora = new Date();
  const [dados, escrita] = await Promise.all([carregarHospedagem(eventoId, agora, recorteDaLogistica(parametro(busca.recorte))), situacaoDaEscrita()]);
  return (
    <>
      <CabecalhoDeHospedagem />
      <SecaoDeHospedagem dados={dados} escrita={escrita.liberada} comSeletorDeEvento />
    </>
  );
}
