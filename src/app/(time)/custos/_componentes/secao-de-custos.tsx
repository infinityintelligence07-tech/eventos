import { ChevronLeft, ChevronRight, CircleCheck, Plus } from "lucide-react";
import Link from "next/link";
import { z } from "zod";

import type { FilaCarregada, LinhaDaFila, SolicitacaoCarregada } from "@/fluxos/custos";
import { type NivelDeExcecao, rotuloDaCategoriaDoItem, type StatusAuditoria, textoDoFinanceiro } from "@/modules/custos";
import { PainelPelaUrl } from "@/app/(time)/_componentes/ui";

import { Aviso, FaixaSomenteLeitura } from "../../_componentes/ui/aviso";
import { AtalhosDeFiltro, BarraDeFiltros, BuscaDeFiltro, SeletorDeFiltro } from "../../_componentes/ui/barra-de-filtros";
import { BotaoLink } from "../../_componentes/ui/botao-link";
import { Cartao, CartaoDeNumero } from "../../_componentes/ui/cartao";
import { TITULO_DE_SECAO } from "../../_componentes/ui/classes";
import { EstadoVazio } from "../../_componentes/ui/estados";
import { consumo, dataCurta, dataEHora, dinheiro, distancia } from "../../_componentes/ui/formatos";
import { SeloRegistradoPeloTime } from "../../_componentes/ui/selo";
import { CabecaDaTabela, CelulaDaTabela, ColunaDaTabela, LinhaDaTabela, Tabela } from "../../_componentes/ui/tabela";
import { enderecoCom, parametro } from "../../logistica/_componentes/situacoes";
import { aprovarSolicitacaoAcao, reabrirAuditoriaAcao, reprovarSolicitacaoAcao } from "../acoes";
import { BarraDeAuditada, BarraDeAuditoria } from "./barra-de-auditoria";
import { ChipDaAuditoria, ChipDoAlerta } from "./situacoes";

export type ParametrosDeCustos = { situacao?: string; evento?: string; alerta?: string; busca?: string; protocolo?: string; registrada?: string; corrigida?: string };

const SITUACOES: (StatusAuditoria | "TODAS")[] = ["PENDENTE", "APROVADO", "REPROVADO", "TODAS"];
const NIVEIS: NivelDeExcecao[] = ["CRITICO", "ALERTA", "NENHUM"];

export function parametrosDeCustos(busca: Record<string, string | string[] | undefined>): ParametrosDeCustos {
  return {
    situacao: parametro(busca.situacao),
    evento: z.uuid().safeParse(parametro(busca.evento)).data,
    alerta: parametro(busca.alerta),
    busca: parametro(busca.busca),
    protocolo: parametro(busca.protocolo),
    registrada: parametro(busca.registrada),
    corrigida: parametro(busca.corrigida),
  };
}

export function filtroDosParametros(parametros: ParametrosDeCustos) {
  return {
    situacao: SITUACOES.find((valor) => valor === parametros.situacao) ?? "PENDENTE",
    nivel: NIVEIS.find((valor) => valor === parametros.alerta),
    busca: parametros.busca?.slice(0, 80),
  };
}

function LinhaDaSolicitacao({ linha, base, parametros }: { linha: LinhaDaFila; base: string; parametros: ParametrosDeCustos }) {
  return (
    <LinhaDaTabela>
      <CelulaDaTabela>
        <Link
          href={enderecoCom(base, parametros, { protocolo: linha.protocolo, registrada: null, corrigida: null })}
          scroll={false}
          className="whitespace-nowrap [font-family:var(--ds-font-mono)] text-[13px] font-medium text-[var(--ds-tint-text)] hover:underline"
        >
          {linha.protocolo}
        </Link>
      </CelulaDaTabela>
      <CelulaDaTabela>
        <span className="flex flex-wrap items-center gap-1">
          {linha.pessoaNome}
          {linha.registradaPeloTime && <SeloRegistradoPeloTime em={linha.criadoEm} />}
        </span>
      </CelulaDaTabela>
      <CelulaDaTabela className="whitespace-nowrap [font-family:var(--ds-font-mono)] text-[13px]">{linha.evento.codigo ?? linha.evento.nome}</CelulaDaTabela>
      <CelulaDaTabela numero className="whitespace-nowrap">
        {distancia(linha.kmTotal)}
      </CelulaDaTabela>
      <CelulaDaTabela numero className="whitespace-nowrap">
        {dinheiro(linha.totalCentavos)}
      </CelulaDaTabela>
      <CelulaDaTabela>
        <ChipDoAlerta nivel={linha.nivel} />
        {linha.resumoDoAlerta && <span className="block text-[12px] text-[var(--ds-label-2)]">{linha.resumoDoAlerta}</span>}
      </CelulaDaTabela>
      <CelulaDaTabela>
        <ChipDaAuditoria status={linha.auditoria} />
        <span className="mt-0.5 block text-[12px] text-[var(--ds-label-2)]">
          Recebida em {dataCurta(linha.criadoEm)} · {textoDoFinanceiro(linha.financeiro, linha.pagoEm)}
        </span>
      </CelulaDaTabela>
    </LinhaDaTabela>
  );
}

function PainelDaSolicitacao({
  solicitacao,
  base,
  parametros,
  escrita,
}: {
  solicitacao: SolicitacaoCarregada;
  base: string;
  parametros: ParametrosDeCustos;
  escrita: boolean;
}) {
  const semAviso = { registrada: null, corrigida: null };
  const fechar = enderecoCom(base, parametros, { protocolo: null, ...semAviso });
  const irPara = (protocolo: string | null) => (protocolo ? enderecoCom(base, parametros, { protocolo, ...semAviso }) : fechar);
  const versao = { solicitacaoId: solicitacao.id, atualizadoEm: solicitacao.atualizadoEm };
  const alertas = solicitacao.alertasPorDeslocamento.flatMap((lista, indice) => lista.map((alerta) => ({ ...alerta, deslocamento: indice + 1 })));
  const criticos = alertas.filter((alerta) => alerta.nivel === "CRITICO").map((alerta) => `${alerta.mensagem} (deslocamento ${alerta.deslocamento})`);
  const ultimaReprovacao = solicitacao.historico.find((registro) => registro.acao === "AUDITORIA_REPROVADA");
  const decisao = solicitacao.auditadoEm ? `${solicitacao.auditoria === "APROVADO" ? "Aprovada" : "Reprovada"} em ${dataEHora(solicitacao.auditadoEm)}` : null;

  const rodape = !escrita ? undefined : solicitacao.auditoria === "PENDENTE" ? (
    <BarraDeAuditoria
      versao={versao}
      protocolo={solicitacao.protocolo}
      critico={solicitacao.nivel === "CRITICO"}
      alertasCriticos={criticos}
      hrefDepois={irPara(solicitacao.proxima)}
      aprovar={aprovarSolicitacaoAcao}
      reprovar={reprovarSolicitacaoAcao}
    />
  ) : (
    <BarraDeAuditada
      versao={versao}
      texto={[decisao, textoDoFinanceiro(solicitacao.financeiro, solicitacao.pagoEm)].filter(Boolean).join(" · ")}
      podeReabrir={solicitacao.auditoria === "APROVADO" && solicitacao.financeiro === "AGUARDANDO_PAGAMENTO"}
      hrefCorrigir={solicitacao.auditoria === "REPROVADO" ? `/custos/nova?protocolo=${solicitacao.protocolo}` : null}
      reabrir={reabrirAuditoriaAcao}
    />
  );

  return (
    <PainelPelaUrl
      largura={720}
      titulo={solicitacao.protocolo}
      subtitulo={[solicitacao.pessoaNome, solicitacao.evento.codigo ?? solicitacao.evento.nome, solicitacao.funcao].filter(Boolean).join(" · ")}
      aoFecharIrPara={fechar}
      rodape={rodape}
    >
      <div className="flex flex-col gap-4 text-[14px]">
        {parametros.registrada === "1" && <Aviso tom="sucesso">Solicitação {solicitacao.protocolo} registrada em nome de {solicitacao.pessoaNome}.</Aviso>}
        {parametros.corrigida === "1" && <Aviso tom="sucesso">Correção registrada. A solicitação voltou para Para auditar.</Aviso>}
        <div className="flex flex-wrap items-center justify-between gap-2">
          <span className="flex flex-wrap items-center gap-2">
            <ChipDaAuditoria status={solicitacao.auditoria} />
            <span className="text-[13px] text-[var(--ds-label-2)]">{textoDoFinanceiro(solicitacao.financeiro, solicitacao.pagoEm)}</span>
            {solicitacao.registradaPeloTime && <SeloRegistradoPeloTime em={solicitacao.criadoEm} por={solicitacao.registradoPorNome} />}
          </span>
          {(solicitacao.anterior || solicitacao.proxima) && (
            <nav aria-label="Navegar na fila para auditar" className="flex gap-1">
              {solicitacao.anterior && (
                <BotaoLink variante="icone" tamanho="pequeno" href={irPara(solicitacao.anterior)} scroll={false} aria-label={`Anterior: ${solicitacao.anterior}`} icone={<ChevronLeft size={16} aria-hidden />} />
              )}
              {solicitacao.proxima && (
                <BotaoLink variante="icone" tamanho="pequeno" href={irPara(solicitacao.proxima)} scroll={false} aria-label={`Próxima: ${solicitacao.proxima}`} icone={<ChevronRight size={16} aria-hidden />} />
              )}
            </nav>
          )}
        </div>

        {alertas.map((alerta, indice) => (
          <Aviso key={`${alerta.deslocamento}-${alerta.regra}-${indice}`} tom={alerta.nivel === "CRITICO" ? "perigo" : "atencao"} titulo={alerta.nivel === "CRITICO" ? "Crítico" : "Alerta"}>
            {alerta.mensagem} <span className="text-[var(--ds-label-2)]">Deslocamento {alerta.deslocamento}.</span>
          </Aviso>
        ))}
        {solicitacao.auditoria === "PENDENTE" && ultimaReprovacao?.comentario && (
          <Aviso tom="neutro" titulo="Parecer anterior">
            Reprovada em {dataCurta(ultimaReprovacao.criadoEm)}: {ultimaReprovacao.comentario}
          </Aviso>
        )}
        {solicitacao.auditoria !== "PENDENTE" && solicitacao.parecer && (
          <Aviso tom="neutro" titulo={solicitacao.auditoria === "APROVADO" ? "Motivo da aprovação" : "Motivo da reprovação"}>
            {solicitacao.parecer}
          </Aviso>
        )}

        <section aria-labelledby="titulo-deslocamentos">
          <h3 id="titulo-deslocamentos" className="mb-2 text-[15px] font-semibold">
            Deslocamentos
          </h3>
          {solicitacao.deslocamentos.length === 0 ? (
            <p className="text-[13px] text-[var(--ds-label-2)]">Sem deslocamento de carro.</p>
          ) : (
            <>
              <ul className="flex flex-col gap-3">
                {solicitacao.deslocamentos.map((deslocamento) => (
                  <li key={deslocamento.ordem} className="rounded-[var(--ds-radius-md)] border border-[var(--ds-separator)] p-4">
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <div className="min-w-0">
                        <h4 className="text-[14px] font-semibold">
                          {deslocamento.ordem}. {deslocamento.origem} → {deslocamento.destino}
                        </h4>
                        <p className="text-[12px] text-[var(--ds-label-2)]">{deslocamento.idaVolta ? "ida e volta" : "só ida"}</p>
                      </div>
                      <div className="flex shrink-0 items-center gap-2">
                        <ChipDoAlerta nivel={deslocamento.nivel} />
                        <span className="text-[15px] font-semibold tabular-nums whitespace-nowrap">{dinheiro(deslocamento.totalCentavos)}</span>
                      </div>
                    </div>
                    <dl className="mt-3 grid grid-cols-3 gap-x-4 gap-y-2 text-[13px] sm:grid-cols-6">
                      {[
                        ["Km rodados", distancia(deslocamento.km * (deslocamento.idaVolta ? 2 : 1))],
                        ["Consumo", consumo(deslocamento.consumoKmL)],
                        ["Litro", dinheiro(deslocamento.precoLitroCentavos)],
                        ["Combustível", dinheiro(deslocamento.combustivelCentavos)],
                        ["Pedágio", dinheiro(deslocamento.pedagioCentavos)],
                        ["Depreciação", dinheiro(deslocamento.depreciacaoCentavos)],
                      ].map(([rotulo, valor]) => (
                        <div key={rotulo}>
                          <dt className="text-[12px] text-[var(--ds-label-2)]">{rotulo}</dt>
                          <dd className="tabular-nums whitespace-nowrap">{valor}</dd>
                        </div>
                      ))}
                    </dl>
                    {deslocamento.comprovanteUrl && (
                      <a href={deslocamento.comprovanteUrl} target="_blank" rel="noreferrer noopener" className="mt-2 inline-block text-[13px] font-medium text-[var(--ds-tint-text)] hover:underline">
                        Ver comprovante
                      </a>
                    )}
                  </li>
                ))}
              </ul>
              <p className="mt-2 text-[13px] text-[var(--ds-label-2)]">Km total: {distancia(solicitacao.kmTotal)}</p>
            </>
          )}
        </section>

        <section aria-labelledby="titulo-itens">
          <h3 id="titulo-itens" className="mb-2 text-[15px] font-semibold">
            Outros itens
          </h3>
          {solicitacao.itens.length === 0 ? (
            <p className="text-[13px] text-[var(--ds-label-2)]">Sem outros itens.</p>
          ) : (
            <Tabela legenda="Outros itens da solicitação" larguraMinima="min-w-[560px]">
              <CabecaDaTabela>
                <ColunaDaTabela>Categoria</ColunaDaTabela>
                <ColunaDaTabela>Descrição</ColunaDaTabela>
                <ColunaDaTabela numero>Quantidade</ColunaDaTabela>
                <ColunaDaTabela numero>Valor</ColunaDaTabela>
              </CabecaDaTabela>
              <tbody>
                {solicitacao.itens.map((item, indice) => (
                  <LinhaDaTabela key={indice}>
                    <CelulaDaTabela>{rotuloDaCategoriaDoItem(item.categoria)}</CelulaDaTabela>
                    <CelulaDaTabela>
                      {item.descricao}
                      {item.regraCustoId && <span className="ml-1 text-[12px] text-[var(--ds-label-2)]">(valor da regra)</span>}
                    </CelulaDaTabela>
                    <CelulaDaTabela numero>{item.quantidade.toLocaleString("pt-BR")}</CelulaDaTabela>
                    <CelulaDaTabela numero>{dinheiro(item.valorCentavos)}</CelulaDaTabela>
                  </LinhaDaTabela>
                ))}
              </tbody>
            </Tabela>
          )}
        </section>

        <p className="text-right text-[20px] font-semibold tabular-nums">Total {dinheiro(solicitacao.totalCentavos)}</p>

        {solicitacao.historico.length > 0 && (
          <section aria-labelledby="titulo-historico">
            <h3 id="titulo-historico" className="mb-2 text-[15px] font-semibold">
              Histórico
            </h3>
            <ul className="flex flex-col gap-1 text-[13px] text-[var(--ds-label-2)]">
              {solicitacao.historico.map((registro, indice) => (
                <li key={indice}>
                  {dataEHora(registro.criadoEm)} · {registro.acao.replaceAll("_", " ").toLowerCase()}
                  {registro.usuarioNome ? ` · ${registro.usuarioNome}` : ""}
                  {registro.comentario ? `: ${registro.comentario}` : ""}
                </li>
              ))}
            </ul>
          </section>
        )}
      </div>
    </PainelPelaUrl>
  );
}

export function BotaoRegistrarSolicitacao({ href }: { href: string }) {
  return (
    <BotaoLink variante="primario" href={href} icone={<Plus size={18} aria-hidden />} className="whitespace-nowrap">
      Registrar solicitação
    </BotaoLink>
  );
}

/** Fila de auditoria: em /custos e, filtrada, em /eventos/[id]/custos. */
export function SecaoDeCustos({
  dados,
  solicitacao,
  base,
  parametros,
  escrita,
  comSeletorDeEvento,
  hrefRegistrar,
}: {
  dados: FilaCarregada;
  solicitacao: SolicitacaoCarregada | null;
  base: string;
  parametros: ParametrosDeCustos;
  escrita: boolean;
  comSeletorDeEvento: boolean;
  /** Sem isto, a ação "Registrar solicitação" fica no cabeçalho da página. */
  hrefRegistrar?: string;
}) {
  const filtro = filtroDosParametros(parametros);
  return (
    <section aria-labelledby="titulo-custos">
      <div className={comSeletorDeEvento ? "" : "mb-3 flex flex-wrap items-center justify-between gap-3"}>
        <h2 id="titulo-custos" className={comSeletorDeEvento ? "sr-only" : TITULO_DE_SECAO}>
          Solicitações de custo
        </h2>
        {escrita && hrefRegistrar && <BotaoRegistrarSolicitacao href={hrefRegistrar} />}
      </div>
      {!escrita && <FaixaSomenteLeitura />}
      <div className="mb-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <CartaoDeNumero rotulo="Para auditar" valor={dados.numeros.paraAuditar} href={enderecoCom(base, {}, { situacao: null })} />
        <CartaoDeNumero rotulo="Com alerta crítico" valor={dados.numeros.criticas} href={enderecoCom(base, {}, { alerta: "CRITICO" })} />
        <div className="rounded-[var(--ds-radius-lg)] bg-[var(--ds-surface)] px-5 py-4 shadow-[var(--ds-shadow-1)]">
          <p className="text-[12px] font-medium text-[var(--ds-label-2)]">Aprovadas no mês</p>
          <p className="mt-1 text-[28px] font-semibold leading-[1.2] tracking-[-0.02em] tabular-nums">{dinheiro(dados.numeros.aprovadasNoMesCentavos)}</p>
        </div>
        <CartaoDeNumero rotulo="Reprovadas no mês" valor={dados.numeros.reprovadasNoMes} href={enderecoCom(base, {}, { situacao: "REPROVADO" })} />
      </div>
      <BarraDeFiltros resultado={`${dados.linhas.length} solicitações encontradas`} nomes={["evento", "alerta", "busca"]}>
        <BuscaDeFiltro rotulo="Buscar por protocolo ou nome" placeholder="Protocolo ou nome" />
        {comSeletorDeEvento && (
          <SeletorDeFiltro nome="evento" rotulo="Evento" todos="Todos os eventos" valor={parametros.evento ?? null} opcoes={dados.eventos.map((evento) => ({ valor: evento.id, rotulo: evento.rotulo }))} />
        )}
        <SeletorDeFiltro
          nome="alerta"
          rotulo="Alerta"
          todos="Todos"
          valor={filtro.nivel ?? null}
          opcoes={[
            { valor: "CRITICO", rotulo: "Crítico" },
            { valor: "ALERTA", rotulo: "Alerta" },
            { valor: "NENHUM", rotulo: "Sem alerta" },
          ]}
        />
        <AtalhosDeFiltro
          nome="situacao"
          rotulo="Situação da auditoria"
          opcoes={[
            { valor: null, rotulo: "Para auditar", quantidade: dados.contagens.PENDENTE },
            { valor: "APROVADO", rotulo: "Aprovadas", quantidade: dados.contagens.APROVADO },
            { valor: "REPROVADO", rotulo: "Reprovadas", quantidade: dados.contagens.REPROVADO },
            { valor: "TODAS", rotulo: "Todas", quantidade: dados.contagens.TODAS },
          ]}
        />
      </BarraDeFiltros>
      {dados.linhas.length === 0 ? (
        <Cartao espacamento="nenhum">
          {filtro.situacao === "PENDENTE" && !filtro.nivel && !filtro.busca ? (
            <EstadoVazio icone={<CircleCheck size={32} aria-hidden />} titulo="Nenhuma solicitação para auditar.">
              Quando uma solicitação for registrada, ela aparece aqui.
            </EstadoVazio>
          ) : (
            <EstadoVazio titulo="Nenhum resultado com esses filtros." acao={<BotaoLink variante="texto" href={base}>Limpar filtros</BotaoLink>} />
          )}
        </Cartao>
      ) : (
        <Tabela legenda="Solicitações de custo">
          <CabecaDaTabela>
            <ColunaDaTabela>Protocolo</ColunaDaTabela>
            <ColunaDaTabela>Pessoa</ColunaDaTabela>
            <ColunaDaTabela>Evento</ColunaDaTabela>
            <ColunaDaTabela numero>Km</ColunaDaTabela>
            <ColunaDaTabela numero>Total</ColunaDaTabela>
            <ColunaDaTabela>Alerta</ColunaDaTabela>
            <ColunaDaTabela>Auditoria</ColunaDaTabela>
          </CabecaDaTabela>
          <tbody>
            {dados.linhas.map((linha) => (
              <LinhaDaSolicitacao key={linha.id} linha={linha} base={base} parametros={parametros} />
            ))}
          </tbody>
        </Tabela>
      )}
      {parametros.protocolo && solicitacao && <PainelDaSolicitacao solicitacao={solicitacao} base={base} parametros={parametros} escrita={escrita} />}
      {parametros.protocolo && !solicitacao && (
        <PainelPelaUrl titulo="Solicitação não encontrada" aoFecharIrPara={enderecoCom(base, parametros, { protocolo: null })}>
          <Aviso tom="atencao">Não encontramos a solicitação {parametros.protocolo}.</Aviso>
        </PainelPelaUrl>
      )}
    </section>
  );
}
