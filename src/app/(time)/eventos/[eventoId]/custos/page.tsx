import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { z } from "zod";

import { situacaoDaEscrita } from "@/fluxos/_base";
import { carregarFilaDeAuditoria, carregarSolicitacao } from "@/fluxos/custos";

import { filtroDosParametros, parametrosDeCustos, SecaoDeCustos } from "../../../custos/_componentes/secao-de-custos";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Custos" };

type Props = { params: Promise<{ eventoId: string }>; searchParams: Promise<Record<string, string | string[] | undefined>> };

export default async function PaginaCustosDoEvento({ params, searchParams }: Props) {
  const eventoId = z.uuid().safeParse((await params).eventoId).data;
  if (!eventoId) notFound();
  const parametros = { ...parametrosDeCustos(await searchParams), evento: undefined };
  const filtro = { ...filtroDosParametros(parametros), eventoId };
  const [dados, solicitacao, escrita] = await Promise.all([
    carregarFilaDeAuditoria(filtro, new Date()),
    parametros.protocolo ? carregarSolicitacao(parametros.protocolo, filtro) : null,
    situacaoDaEscrita(),
  ]);
  return (
    <SecaoDeCustos
        dados={dados}
        solicitacao={solicitacao}
        base={`/eventos/${eventoId}/custos`}
        parametros={parametros}
        escrita={escrita.liberada}
        comSeletorDeEvento={false}
      hrefRegistrar={`/custos/nova?evento=${eventoId}`}
    />
  );
}
