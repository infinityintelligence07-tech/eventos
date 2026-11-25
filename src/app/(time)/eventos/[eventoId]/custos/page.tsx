import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { z } from "zod";

import { permissoesDoAtor } from "@/app/(time)/_servidor/usuario-atual";
import { situacaoDaEscrita } from "@/fluxos/_base";
import { carregarFilaDeAuditoria, carregarSolicitacao } from "@/fluxos/custos";
import { caminhoDoFormularioDeCusto } from "@/modules/custos";

import { filtroDosParametros, parametrosDeCustos, SecaoDeCustos } from "../../../custos/_componentes/secao-de-custos";
import { exigirAtor } from "@/app/(time)/_servidor/usuario-atual";
import { enderecoDoSite } from "@/app/(time)/_servidor/endereco-do-site";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Custos" };

type Props = { params: Promise<{ eventoId: string }>; searchParams: Promise<Record<string, string | string[] | undefined>> };

export default async function PaginaCustosDoEvento({ params, searchParams }: Props) {
  const ator = await exigirAtor();
  const eventoId = z.uuid().safeParse((await params).eventoId).data;
  if (!eventoId) notFound();
  const parametros = { ...parametrosDeCustos(await searchParams), evento: undefined };
  const filtro = { ...filtroDosParametros(parametros), eventoId };
  const permissoes = await permissoesDoAtor("custos.reabrir_auditoria", "custos.auditar");
  // O link do WhatsApp leva o telefone da pessoa: só para quem audita custos, e nunca para o visitante da demo.
  const comLinkDoWhatsApp = permissoes["custos.auditar"] && ator.origem !== "DEMO";
  const [dados, solicitacao, escrita, site] = await Promise.all([
    carregarFilaDeAuditoria(filtro, new Date()),
    parametros.protocolo ? carregarSolicitacao(parametros.protocolo, filtro, { comLinkDoWhatsApp }) : null,
    situacaoDaEscrita(),
    enderecoDoSite(),
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
      linkDoFormulario={site ? `${site}${caminhoDoFormularioDeCusto(eventoId)}` : null}
    />
  );
}
