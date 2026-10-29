import { MessageSquare } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";

import {
  AtalhosDeFiltro,
  Aviso,
  BotaoLink,
  CabecalhoDaPagina,
  Cartao,
  ChipDaEscala,
  EstadoVazio,
  formatar,
} from "@/app/(time)/_componentes/ui";
import { CabecaDaTabela, CelulaDaTabela, ColunaDaTabela, LinhaDaTabela, Tabela } from "@/app/(time)/_componentes/ui/tabela";
import { listarComunicacao } from "@/fluxos/comunicacao";
import type { SituacaoDaCopy } from "@/modules/comunicacao";

import { ChipDaCopy } from "../eventos/[eventoId]/comunicacao/_componentes/chip-da-copy";
import { exigirAtor } from "@/app/(time)/_servidor/usuario-atual";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Comunicação" };

const FILTROS: { valor: string; situacao: SituacaoDaCopy; rotulo: string }[] = [
  { valor: "falta-dado", situacao: "FALTA_DADO", rotulo: "Com copys com falta de dado" },
  { valor: "desatualizada", situacao: "DESATUALIZADA", rotulo: "Com copys desatualizadas" },
  { valor: "pronta", situacao: "PRONTA", rotulo: "Com copys prontas" },
];

function Quantidade({ valor, situacao }: { valor: number; situacao: SituacaoDaCopy }) {
  if (valor === 0) return <span className="text-[var(--ds-label-2)]">0</span>;
  if (situacao === "PRONTA") return <>{valor.toLocaleString("pt-BR")}</>;
  return (
    <span className="inline-flex items-center gap-2 whitespace-nowrap">
      {valor.toLocaleString("pt-BR")}
      <span aria-hidden>
        <ChipDaCopy situacao={situacao} />
      </span>
    </span>
  );
}

export default async function PaginaComunicacao({ searchParams }: { searchParams: Promise<{ situacao?: string }> }) {
  await exigirAtor();
  const { situacao } = await searchParams;
  const filtro = FILTROS.find((opcao) => opcao.valor === situacao) ?? null;
  const lista = await listarComunicacao({ situacao: filtro?.situacao }, new Date());
  const { totais } = lista;

  return (
    <>
      <CabecalhoDaPagina titulo="Comunicação" subtitulo="Copys das escalas aprovadas. Copie, envie pelo WhatsApp e marque como enviada." />

      {lista.semModelo && (
        <Aviso
          tom="atencao"
          className="mb-5"
          titulo="Não há modelo de escalação ativo: nenhuma copy é gerada."
          acao={
            <Link href="/configuracoes/modelos-de-copy" className="text-[14px] font-medium text-[var(--ds-tint-text)] hover:underline">
              Ir para Modelos de copy
            </Link>
          }
        />
      )}
      {totais.FALTA_DADO > 0 && (
        <Aviso
          tom="atencao"
          className="mb-5"
          acao={
            filtro?.situacao !== "FALTA_DADO" && (
              <Link href="/comunicacao?situacao=falta-dado" className="text-[14px] font-medium text-[var(--ds-tint-text)] hover:underline">
                Ver bloqueadas
              </Link>
            )
          }
        >
          {totais.FALTA_DADO === 1 ? "1 copy está bloqueada" : `${totais.FALTA_DADO.toLocaleString("pt-BR")} copys estão bloqueadas`} por falta de dado.
          Elas liberam sozinhas quando o dado for preenchido.
        </Aviso>
      )}

      <div className="mb-3">
        <AtalhosDeFiltro
          nome="situacao"
          rotulo="Filtrar eventos pela situação das copys"
          opcoes={[
            { valor: null, rotulo: "Todos" },
            ...FILTROS.map((opcao) => ({ valor: opcao.valor, rotulo: opcao.rotulo, quantidade: totais[opcao.situacao] })),
          ]}
        />
      </div>
      <p className="sr-only" aria-live="polite">
        {lista.eventos.length === 1 ? "1 evento encontrado" : `${lista.eventos.length} eventos encontrados`}
      </p>

      {lista.eventos.length === 0 ? (
        <Cartao espacamento="nenhum">
          {filtro ? (
            <EstadoVazio titulo="Nenhum resultado com esses filtros." nivel="h2" acao={<BotaoLink href="/comunicacao">Limpar filtros</BotaoLink>} />
          ) : (
            <EstadoVazio
              icone={<MessageSquare size={32} aria-hidden />}
              titulo="Nenhuma escala aprovada para comunicar."
              nivel="h2"
              acao={<BotaoLink href="/escalas/aprovacao">Ver fila de aprovação</BotaoLink>}
            >
              As copys aparecem aqui quando a líder aprova uma escala.
            </EstadoVazio>
          )}
        </Cartao>
      ) : (
        <Tabela legenda="Eventos com escala aprovada ou comunicada e a situação das copys de escalação">
          <CabecaDaTabela>
            <ColunaDaTabela>Evento</ColunaDaTabela>
            <ColunaDaTabela>Datas</ColunaDaTabela>
            <ColunaDaTabela>Escala</ColunaDaTabela>
            <ColunaDaTabela numero>Prontas</ColunaDaTabela>
            <ColunaDaTabela numero className="whitespace-nowrap">
              Falta dado
            </ColunaDaTabela>
            <ColunaDaTabela numero>Desatualizadas</ColunaDaTabela>
            <ColunaDaTabela numero>Enviadas</ColunaDaTabela>
          </CabecaDaTabela>
          <tbody>
            {lista.eventos.map((evento) => (
              <LinhaDaTabela key={evento.id}>
                <CelulaDaTabela cabecalhoDaLinha>
                  <Link href={`/eventos/${evento.id}/comunicacao`} className="text-[var(--ds-tint-text)] hover:underline">
                    {formatar.nomeCurtoDoEvento(evento)}
                  </Link>
                  {evento.codigo && <span className="ml-2 [font-family:var(--ds-font-mono)] text-[12px] text-[var(--ds-label-2)]">{evento.codigo}</span>}
                </CelulaDaTabela>
                <CelulaDaTabela className="whitespace-nowrap tabular-nums">{formatar.periodo(evento.dataInicio, evento.dataFim)}</CelulaDaTabela>
                <CelulaDaTabela className="whitespace-nowrap">
                  <ChipDaEscala situacao={evento.statusEscala} />
                </CelulaDaTabela>
                <CelulaDaTabela numero>
                  <Quantidade valor={evento.contagem.PRONTA} situacao="PRONTA" />
                </CelulaDaTabela>
                <CelulaDaTabela numero>
                  <Quantidade valor={evento.contagem.FALTA_DADO} situacao="FALTA_DADO" />
                </CelulaDaTabela>
                <CelulaDaTabela numero>
                  <Quantidade valor={evento.contagem.DESATUALIZADA} situacao="DESATUALIZADA" />
                </CelulaDaTabela>
                <CelulaDaTabela numero className="whitespace-nowrap">
                  {formatar.quantidadeDe(evento.contagem.ENVIADA, evento.total)}
                </CelulaDaTabela>
              </LinhaDaTabela>
            ))}
          </tbody>
        </Tabela>
      )}
    </>
  );
}
