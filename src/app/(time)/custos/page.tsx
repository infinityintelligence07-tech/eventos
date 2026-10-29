import type { Metadata } from "next";

import { permissoesDoAtor } from "@/app/(time)/_servidor/usuario-atual";
import { situacaoDaEscrita } from "@/fluxos/_base";
import { carregarFilaDeAuditoria, carregarSolicitacao } from "@/fluxos/custos";

import { CabecalhoDaPagina } from "../_componentes/ui/cabecalho";
import { BotaoRegistrarSolicitacao, filtroDosParametros, parametrosDeCustos, SecaoDeCustos } from "./_componentes/secao-de-custos";
import { exigirAtor } from "@/app/(time)/_servidor/usuario-atual";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Custos" };

export default async function PaginaCustos({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  await exigirAtor();
  const parametros = parametrosDeCustos(await searchParams);
  const filtro = { ...filtroDosParametros(parametros), eventoId: parametros.evento };
  const [dados, solicitacao, escrita, permissoes] = await Promise.all([
    carregarFilaDeAuditoria(filtro, new Date()),
    parametros.protocolo ? carregarSolicitacao(parametros.protocolo, filtro) : null,
    situacaoDaEscrita(),
    permissoesDoAtor("custos.reabrir_auditoria"),
  ]);
  return (
    <>
      <CabecalhoDaPagina
        titulo="Custos"
        subtitulo="Confira as solicitações do staff. Só as aprovadas seguem para o financeiro."
        acoes={escrita.liberada && <BotaoRegistrarSolicitacao href="/custos/nova" />}
      />
      <SecaoDeCustos dados={dados} solicitacao={solicitacao} base="/custos" parametros={parametros} escrita={escrita.liberada}
        podeReabrirAuditoria={permissoes["custos.reabrir_auditoria"]} comSeletorDeEvento />
    </>
  );
}
