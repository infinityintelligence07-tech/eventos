import { redirect } from "next/navigation";
import { z } from "zod";

import { exigirAtor } from "@/app/(time)/_servidor/usuario-atual";

import { parametro } from "../_componentes/situacoes";

// Sem isto o build (que roda sem sessão) grava a página como um redirecionamento fixo para o login.
export const dynamic = "force-dynamic";

/**
 * As caronas são montadas junto com os quartos, na tela de Hospedagem do evento. O endereço antigo continua valendo:
 * leva para lá (mantendo o evento escolhido), direto na seção de caronas.
 */
export default async function PaginaCaronas({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  await exigirAtor();
  const eventoId = z.uuid().safeParse(parametro((await searchParams).evento)).data;
  redirect(`/logistica/hospedagem${eventoId ? `?evento=${eventoId}` : ""}#titulo-caronas`);
}
