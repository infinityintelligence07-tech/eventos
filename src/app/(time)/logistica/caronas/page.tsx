import { redirect } from "next/navigation";
import { z } from "zod";

import { exigirAtor } from "@/app/(time)/_servidor/usuario-atual";

import { parametro } from "../_componentes/situacoes";

// Sem isto o build (que roda sem sessão) grava a página como um redirecionamento fixo para o login.
export const dynamic = "force-dynamic";

/**
 * As caronas são montadas na escala do evento (saíram da Hospedagem em 26/11/2026). O endereço antigo continua valendo:
 * com o evento, leva para a escala dele, direto na seção de caronas; sem evento, para a lista de Escalas.
 */
export default async function PaginaCaronas({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  await exigirAtor();
  const eventoId = z.uuid().safeParse(parametro((await searchParams).evento)).data;
  redirect(eventoId ? `/eventos/${eventoId}/escala#titulo-caronas` : "/escalas");
}
