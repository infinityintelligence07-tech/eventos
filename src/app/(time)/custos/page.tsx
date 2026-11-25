import type { Metadata } from "next";

import { permissoesDoAtor } from "@/app/(time)/_servidor/usuario-atual";
import { situacaoDaEscrita } from "@/fluxos/_base";
import { carregarFilaDeAuditoria, carregarSolicitacao } from "@/fluxos/custos";
import { caminhoDoFormularioDeCusto } from "@/modules/custos";

import { CabecalhoDaPagina } from "../_componentes/ui/cabecalho";
import { BotaoRegistrarSolicitacao, filtroDosParametros, parametrosDeCustos, SecaoDeCustos } from "./_componentes/secao-de-custos";
import { exigirAtor } from "@/app/(time)/_servidor/usuario-atual";
import { enderecoDoSite } from "@/app/(time)/_servidor/endereco-do-site";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Custos" };

export default async function PaginaCustos({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const ator = await exigirAtor();
  const parametros = parametrosDeCustos(await searchParams);
  const filtro = { ...filtroDosParametros(parametros), eventoId: parametros.evento };
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
    <>
      <CabecalhoDaPagina
        titulo="Custos"
        subtitulo="Confira as solicitações do staff. Só as aprovadas seguem para o financeiro."
        acoes={escrita.liberada && <BotaoRegistrarSolicitacao href="/custos/nova" />}
      />
      <SecaoDeCustos dados={dados} solicitacao={solicitacao} base="/custos" parametros={parametros} escrita={escrita.liberada}
        podeReabrirAuditoria={permissoes["custos.reabrir_auditoria"]} comSeletorDeEvento
        linkDoFormulario={site ? `${site}${caminhoDoFormularioDeCusto()}` : null} />
    </>
  );
}
