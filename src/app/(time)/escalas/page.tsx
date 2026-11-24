import { CircleCheck, CircleX, Clock, Hourglass } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";

import { type EscalaAMontar, escalasAMontar, listarEscalas, PERIODOS_DA_LISTA } from "@/fluxos/escalas";
import { DIAS_PARA_MONTAR_ESCALA } from "@/modules/eventos";

import { AtalhosDeFiltro, BarraDeFiltros, BuscaDeFiltro, SeletorDeFiltro } from "../_componentes/ui/barra-de-filtros";
import { BotaoLink } from "../_componentes/ui/botao-link";
import { CabecalhoDaPagina } from "../_componentes/ui/cabecalho";
import { Cartao } from "../_componentes/ui/cartao";
import { EstadoVazio } from "../_componentes/ui/estados";
import { dataCurta, nomeCurtoDoEvento as nomeCurto, periodo, quantidadeDe } from "../_componentes/ui/formatos";
import { ChipDaEscala } from "../_componentes/ui/situacao";
import { CabecaDaTabela, CelulaDaTabela, ColunaDaTabela, LinhaDaTabela, Tabela } from "../_componentes/ui/tabela";
import { exigirAtor } from "@/app/(time)/_servidor/usuario-atual";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Escalas" };

type Parametros = { searchParams: Promise<{ situacao?: string; polo?: string; tipo?: string; periodo?: string; busca?: string; masterclass?: string }> };

const FILTROS = ["situacao", "polo", "tipo", "periodo", "busca", "masterclass"];

function acaoDaLinha(statusEscala: string, status: string): string {
  if (status === "CANCELADO" || status === "CONCLUIDO") return "Ver";
  if (statusEscala === "SEM_ESCALA") return "Começar escala";
  if (statusEscala === "RASCUNHO" || statusEscala === "DEVOLVIDA") return "Continuar";
  return "Ver";
}

const ROTULO_DO_DADO = "text-[12px] text-[var(--ds-label-2)]";

/** Um evento do cartão "Escalas a montar": nome, código, início, término, local (se houver) e vagas. */
function EventoAMontar({ evento }: { evento: EscalaAMontar }) {
  return (
    <li className="min-w-0 rounded-[var(--ds-radius-md)] border border-[var(--ds-separator)] p-3">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <p className="min-w-0">
          <Link href={`/eventos/${evento.id}/escala`} className="font-medium text-[var(--ds-tint-text)] hover:underline">
            {nomeCurto(evento)}
          </Link>
          <span className="block text-[12px] text-[var(--ds-label-2)] [font-family:var(--ds-font-mono)]">{evento.codigo ?? "sem código"}</span>
        </p>
        <ChipDaEscala situacao={evento.statusEscala} />
      </div>
      <dl className="mt-2 grid grid-cols-2 gap-x-3 gap-y-1 text-[13px]">
        <div>
          <dt className={ROTULO_DO_DADO}>Início</dt>
          <dd className="tabular-nums">{dataCurta(evento.dataInicio)}</dd>
        </div>
        <div>
          <dt className={ROTULO_DO_DADO}>Término</dt>
          <dd className="tabular-nums">{dataCurta(evento.dataFim)}</dd>
        </div>
        {evento.local && (
          <div className="col-span-2">
            <dt className={ROTULO_DO_DADO}>Local</dt>
            <dd>
              {evento.local.nome} · {evento.local.cidade} ({evento.local.uf})
            </dd>
          </div>
        )}
        <div className="col-span-2">
          <dt className={ROTULO_DO_DADO}>Vagas preenchidas</dt>
          <dd className="tabular-nums">{evento.vagas > 0 ? quantidadeDe(evento.preenchidas, evento.vagas) : "Sem vagas ainda"}</dd>
        </div>
      </dl>
    </li>
  );
}

export default async function PaginaEscalas({ searchParams }: Parametros) {
  await exigirAtor();
  const agora = new Date();
  const [lista, aMontar] = await Promise.all([listarEscalas(await searchParams, agora), escalasAMontar(agora)]);
  const { contagem, filtros } = lista;
  const algumFiltro = Boolean(filtros.situacao || filtros.polo || filtros.tipo || filtros.busca || !filtros.esconderMasterclasses);

  return (
    <>
      <CabecalhoDaPagina
        titulo="Escalas"
        subtitulo="Monte e acompanhe a escala de cada evento."
        acoes={
          <BotaoLink href="/escalas/aprovacao" icone={<Hourglass size={18} aria-hidden />}>
            Fila de aprovação
            <span className="rounded-full bg-[var(--ds-fill-4)] px-2 py-0.5 text-[12px] tabular-nums text-[var(--ds-label-2)]">{lista.aguardandoAprovacao}</span>
          </BotaoLink>
        }
      />

      <section className="mb-5" aria-labelledby="precisa-de-acao">
        <h2 id="precisa-de-acao" className="mb-3 text-[17px] font-semibold tracking-[-0.01em]">
          Precisa de ação
        </h2>
        <Cartao
          id="escalas-a-montar"
          titulo="Escalas a montar"
          explicacao={`Eventos nos próximos ${DIAS_PARA_MONTAR_ESCALA} dias com a escala ainda não aprovada.`}
          acoes={
            <span
              className={`rounded-full px-2 py-0.5 text-[12px] font-semibold tabular-nums ${
                aMontar.length > 0 ? "bg-[var(--ds-orange-soft)] text-[var(--ds-orange-deep)]" : "bg-[var(--ds-green-soft)] text-[var(--ds-green-deep)]"
              }`}
            >
              {aMontar.length}
              <span className="sr-only">{aMontar.length === 1 ? " escala a montar" : " escalas a montar"}</span>
            </span>
          }
        >
          {aMontar.length === 0 ? (
            <p className="text-[13px] text-[var(--ds-label-2)]">Nenhuma escala a montar nos próximos {DIAS_PARA_MONTAR_ESCALA} dias.</p>
          ) : (
            <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
              {aMontar.map((evento) => (
                <EventoAMontar key={evento.id} evento={evento} />
              ))}
            </ul>
          )}
        </Cartao>
      </section>

      <BarraDeFiltros nomes={FILTROS} resultado={lista.eventos.length === 1 ? "1 evento encontrado" : `${lista.eventos.length} eventos encontrados`}>
        <BuscaDeFiltro rotulo="Buscar por código ou nome" placeholder="Buscar por código ou nome" />
        <SeletorDeFiltro nome="polo" rotulo="Polo" todos="Todos" valor={filtros.polo} opcoes={lista.opcoes.polos.map((polo) => ({ valor: polo.codigo, rotulo: polo.nome }))} />
        <SeletorDeFiltro nome="tipo" rotulo="Tipo" todos="Todos" valor={filtros.tipo} opcoes={lista.opcoes.tipos.map((tipo) => ({ valor: tipo.sigla, rotulo: tipo.nome }))} />
        <SeletorDeFiltro
          nome="periodo"
          rotulo="Período"
          todos="Próximos 30 dias"
          valor={filtros.periodo === 30 ? null : String(filtros.periodo)}
          opcoes={PERIODOS_DA_LISTA.filter((dias) => dias !== 30).map((dias) => ({ valor: String(dias), rotulo: `Próximos ${dias} dias` }))}
        />
      </BarraDeFiltros>
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <AtalhosDeFiltro
          nome="situacao"
          rotulo="Situação da escala"
          opcoes={[
            { valor: "a-montar", rotulo: "A montar", quantidade: contagem["a-montar"] },
            { valor: "aguardando", rotulo: "Aguardando aprovação", quantidade: contagem.aguardando },
            { valor: "devolvidas", rotulo: "Devolvidas", quantidade: contagem.devolvidas },
            { valor: "aprovadas", rotulo: "Aprovadas", quantidade: contagem.aprovadas },
            { valor: "comunicadas", rotulo: "Comunicadas", quantidade: contagem.comunicadas },
            { valor: null, rotulo: "Todas", quantidade: contagem.todas },
          ]}
        />
        <AtalhosDeFiltro
          nome="masterclass"
          rotulo="Masterclasses"
          opcoes={[
            { valor: null, rotulo: "Sem Masterclasses" },
            { valor: "mostrar", rotulo: "Mostrar Masterclasses" },
          ]}
        />
      </div>

      {lista.eventos.length === 0 ? (
        <Cartao espacamento="nenhum">
          {algumFiltro ? (
            <EstadoVazio titulo="Nenhuma escala com esses filtros." nivel="h2" acao={<BotaoLink href="/escalas" variante="texto">Limpar filtros</BotaoLink>} />
          ) : (
            <EstadoVazio
              titulo={`Nenhum evento nos próximos ${filtros.periodo} dias.`}
              nivel="h2"
              acao={
                filtros.periodo < 90 ? (
                  <BotaoLink href="/escalas?periodo=90" variante="texto">
                    Ver próximos 90 dias
                  </BotaoLink>
                ) : undefined
              }
            />
          )}
        </Cartao>
      ) : (
        <Tabela legenda="Escalas dos eventos do período, a data mais próxima primeiro">
          <CabecaDaTabela>
            <ColunaDaTabela>Evento</ColunaDaTabela>
            <ColunaDaTabela>Datas</ColunaDaTabela>
            <ColunaDaTabela>Polo</ColunaDaTabela>
            <ColunaDaTabela>Vagas</ColunaDaTabela>
            <ColunaDaTabela>Respostas</ColunaDaTabela>
            <ColunaDaTabela>Situação</ColunaDaTabela>
            <ColunaDaTabela numero>
              <span className="sr-only">Ação</span>
            </ColunaDaTabela>
          </CabecaDaTabela>
          <tbody>
            {lista.eventos.map((evento) => {
              const href = `/eventos/${evento.id}/escala`;
              const percentual = evento.vagas > 0 ? Math.round((evento.preenchidas / evento.vagas) * 100) : 0;
              const respondeu = evento.confirmaram + evento.aguardando + evento.naoPodem > 0;
              return (
                <LinhaDaTabela key={evento.id}>
                  <CelulaDaTabela>
                    <Link href={href} className="font-medium hover:underline">
                      {nomeCurto(evento)}
                    </Link>
                    <span className="block text-[12px] text-[var(--ds-label-2)] [font-family:var(--ds-font-mono)]">{evento.codigo ?? "sem código"}</span>
                  </CelulaDaTabela>
                  <CelulaDaTabela className="whitespace-nowrap">{periodo(evento.dataInicio, evento.dataFim)}</CelulaDaTabela>
                  <CelulaDaTabela>{evento.poloCodigo ?? "—"}</CelulaDaTabela>
                  <CelulaDaTabela className="min-w-[120px]">
                    <span aria-hidden className="mb-1 block h-1.5 rounded-full bg-[var(--ds-fill-3)]">
                      <span className="block h-1.5 rounded-full bg-[var(--ds-brand)]" style={{ width: `${percentual}%` }} />
                    </span>
                    <span className="text-[13px] tabular-nums">
                      {evento.preenchidas} de {evento.vagas}
                    </span>
                  </CelulaDaTabela>
                  <CelulaDaTabela className="text-[13px]">
                    {respondeu ? (
                      <span className="inline-flex flex-wrap items-center gap-2 tabular-nums">
                        <span className="inline-flex items-center gap-1">
                          <CircleCheck size={14} aria-hidden className="text-[var(--ds-green-deep)]" />
                          {evento.confirmaram} confirmaram
                        </span>
                        <span className="inline-flex items-center gap-1">
                          <Clock size={14} aria-hidden className="text-[var(--ds-tint-text)]" />
                          {evento.aguardando} aguardando
                        </span>
                        <span className="inline-flex items-center gap-1">
                          <CircleX size={14} aria-hidden className="text-[var(--ds-red-deep)]" />
                          {evento.naoPodem} não {evento.naoPodem === 1 ? "pode" : "podem"}
                        </span>
                      </span>
                    ) : (
                      <span className="text-[var(--ds-label-2)]">—</span>
                    )}
                  </CelulaDaTabela>
                  <CelulaDaTabela>
                    <ChipDaEscala situacao={evento.situacao} />
                  </CelulaDaTabela>
                  <CelulaDaTabela numero>
                    <BotaoLink href={href} tamanho="pequeno" className="whitespace-nowrap" aria-label={`${acaoDaLinha(evento.statusEscala, evento.status)}: ${evento.codigo ?? evento.nome}`}>
                      {acaoDaLinha(evento.statusEscala, evento.status)}
                    </BotaoLink>
                  </CelulaDaTabela>
                </LinhaDaTabela>
              );
            })}
          </tbody>
        </Tabela>
      )}
    </>
  );
}
