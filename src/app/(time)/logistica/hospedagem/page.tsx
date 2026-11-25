import type { Metadata } from "next";
import { z } from "zod";

import { situacaoDaEscrita } from "@/fluxos/_base";
import { carregarCaronas, carregarHospedagem } from "@/fluxos/logistica";
import { recorteDaLogistica } from "@/modules/logistica";

import { BotaoLink } from "../../_componentes/ui/botao-link";
import { CabecalhoDeHospedagem } from "../_componentes/cabecalho-da-logistica";
import { SecaoDeCaronas } from "../_componentes/secao-de-caronas";
import { SecaoDeHospedagem } from "../_componentes/secao-de-hospedagem";
import { parametro } from "../_componentes/situacoes";
import { exigirAtor } from "@/app/(time)/_servidor/usuario-atual";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Hospedagem" };

/** Quartos e caronas do mesmo evento, um abaixo do outro: quem dorme com quem e quem vai com quem, numa passada. */
export default async function PaginaHospedagem({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  await exigirAtor();
  const busca = await searchParams;
  const eventoId = z.uuid().safeParse(parametro(busca.evento)).data ?? null;
  const agora = new Date();
  const [dados, escrita] = await Promise.all([carregarHospedagem(eventoId, agora, recorteDaLogistica(parametro(busca.recorte))), situacaoDaEscrita()]);
  // As caronas acompanham o evento que a Hospedagem está mostrando (o escolhido ou o próximo com equipe).
  const caronas = dados.evento ? await carregarCaronas(dados.evento.id, agora) : null;
  return (
    <>
      <CabecalhoDeHospedagem
        acoes={
          caronas && (
            <BotaoLink href="#titulo-caronas" variante="texto">
              Ir para as caronas
            </BotaoLink>
          )
        }
      />
      <SecaoDeHospedagem dados={dados} escrita={escrita.liberada} comSeletorDeEvento />
      {caronas && <SecaoDeCaronas dados={caronas} escrita={escrita.liberada} />}
    </>
  );
}
