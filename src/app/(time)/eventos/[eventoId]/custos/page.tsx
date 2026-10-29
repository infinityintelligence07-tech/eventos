import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { z } from "zod";

import { permissoesDoAtor } from "@/app/(time)/_servidor/usuario-atual";
import { situacaoDaEscrita } from "@/fluxos/_base";
import { carregarFilaDeAuditoria, carregarSolicitacao } from "@/fluxos/custos";

import { filtroDosParametros, parametrosDeCustos, SecaoDeCustos } from "../../../custos/_componentes/secao-de-custos";
import { exigirAtor } from "@/app/(time)/_servidor/usuario-atual";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Custos" };

type Props = { params: Promise<{ eventoId: string }>; searchParams: Promise<Record<string, string | string[] | undefined>> };

export default async function PaginaCustosDoEvento({ params, searchParams }: Props) {
  await exigirAtor();
  const eventoId = z.uuid().safeParse((await params).eventoId).data;
  if (!eventoId) notFound();
  const parametros = { ...parametrosDeCustos(await searchParams), evento: undefined };
  const filtro = { ...filtroDosParametros(parametros), eventoId };
  const [dados, solicitacao, escrita, permissoes] = await Promise.all([
    carregarFilaDeAuditoria(filtro, new Date()),
    parametros.protocolo ? carregarSolicitacao(parametros.protocolo, filtro) : null,
    situacaoDaEscrita(),
    permissoesDoAtor("custos.reabrir_auditoria"),
  ]);
  return (
    <SecaoDeCustos
        dados={dados}
        solicitacao={solicitacao}
        base={`/eventos/${eventoId}/custos`}
        parametros={parametros}
        escrita={escrita.liberada}
        podeReabrirAuditoria={permissoes["custos.reabrir_auditoria"]}
        comSeletorDeEvento={false}
      hrefRegistrar={`/custos/nova?evento=${eventoId}`}
    />
  );
}
