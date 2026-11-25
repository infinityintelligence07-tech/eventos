import { Plane } from "lucide-react";
import type { Metadata } from "next";

import { Cartao } from "@/app/(time)/_componentes/ui/cartao";
import { TITULO_DE_SECAO } from "@/app/(time)/_componentes/ui/classes";
import { EstadoVazio } from "@/app/(time)/_componentes/ui/estados";
import { dataCurta, dinheiro, hora } from "@/app/(time)/_componentes/ui/formatos";
import { paraCampoDeDataEHora, paraCampoDeDinheiro } from "@/app/(time)/logistica/_componentes/situacoes";
import { carregarVoosDaSdc } from "@/fluxos/sdc";
import { rotuloDaPreferencia, rotuloDoMes, rotuloDoTrajeto, trajetoDosTrechos, type TrechoParaASdc } from "@/modules/logistica";

import { FiltroDaSdc, Linha, SituacaoDoPedidoParaASdc, situacaoDoFiltroDaSdc, TituloDoEvento, TotaisDaSdc } from "../_componentes/comuns";
import { BotaoRegistrarCompraDeVoo } from "../_componentes/formularios";
import { exigirAtorSdc } from "../_servidor/ator-sdc";
import { registrarCompraDeVooAcao } from "../acoes";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Voos" };

const sentido = (trecho: TrechoParaASdc) => (trecho.sentido === "IDA" ? "Ida" : "Volta");

/** O que o time pediu: aeroportos, data e preferência de horário. */
function pedido(trecho: TrechoParaASdc): string {
  return `${trecho.origemIata} → ${trecho.destinoIata} em ${dataCurta(trecho.dataDesejada)}${trecho.preferenciaHorario ? ` (${rotuloDaPreferencia(trecho.preferenciaHorario)})` : ""}`;
}

/** O que a SDC comprou, quando já registrou. */
function compra(trecho: TrechoParaASdc): string | null {
  if (!trecho.companhia) return null;
  const horario = trecho.partidaEm && trecho.chegadaEm ? ` · ${dataCurta(trecho.partidaEm)} ${hora(trecho.partidaEm)}–${hora(trecho.chegadaEm)}` : "";
  return `${[trecho.companhia, trecho.numeroVoo].filter(Boolean).join(" ")}${horario}${trecho.localizador ? ` · reserva ${trecho.localizador}` : ""}`;
}

/** Voos pedidos pelo time, como na planilha: por mês e evento. A SDC registra a compra e o valor de cada um. */
export default async function PaginaVoosDaSdc({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  await exigirAtorSdc();
  const situacao = situacaoDoFiltroDaSdc((await searchParams).situacao);
  const dados = await carregarVoosDaSdc({ situacao }, new Date());

  return (
    <>
      <h1 className="mb-1 text-[22px] font-semibold tracking-[-0.01em]">Voos</h1>
      <p className="mb-4 text-[14px] text-[var(--ds-label-2)]">Passagens pedidas pelo time de eventos. Registre a compra e o valor de cada pedido; o time confere e aprova o pagamento.</p>
      <TotaisDaSdc totais={dados.totais} />
      <FiltroDaSdc base="/sdc/voos" atual={situacao} contagens={dados.contagens} />

      {dados.total === 0 ? (
        <Cartao espacamento="nenhum">
          <EstadoVazio icone={<Plane size={32} aria-hidden />} titulo={situacao ? "Nenhum pedido de voo com esse filtro." : "Nenhum pedido de voo por enquanto."} nivel="h2">
            Os pedidos aparecem aqui assim que o time de eventos registra.
          </EstadoVazio>
        </Cartao>
      ) : (
        dados.grupos.map((mes) => (
          <section key={mes.mes} aria-label={rotuloDoMes(mes.mes)} className="mb-6">
            <h2 className={`${TITULO_DE_SECAO} mb-3`}>{rotuloDoMes(mes.mes)}</h2>
            {mes.eventos.map(({ evento, linhas }) => (
              <div key={evento.chave} className="mb-5">
                <TituloDoEvento evento={evento} />
                <ul className="grid grid-cols-1 gap-3 lg:grid-cols-2">
                  {linhas.map((voo) => {
                    const trajeto = trajetoDosTrechos(voo.trechos.map((trecho) => trecho.sentido));
                    return (
                      <li key={voo.referencia}>
                        <Cartao
                          titulo={voo.passageiro}
                          explicacao={
                            <>
                              <span className="[font-family:var(--ds-font-mono)]">{voo.referencia}</span>
                              {trajeto ? ` · ${rotuloDoTrajeto(trajeto)}` : ""} · pedido em {dataCurta(voo.solicitadoEm)}
                            </>
                          }
                          acoes={
                            voo.podeRegistrar && (
                              <BotaoRegistrarCompraDeVoo
                                acao={registrarCompraDeVooAcao}
                                referencia={voo.referencia}
                                passageiro={voo.passageiro}
                                corrigindo={voo.paraASdc === "AGUARDANDO_APROVACAO"}
                                valor={paraCampoDeDinheiro(voo.paraASdc === "AGUARDANDO_APROVACAO" ? voo.valorCentavos : null)}
                                observacao={voo.observacaoSdc ?? ""}
                                trechos={voo.trechos.map((trecho) => ({
                                  sentido: trecho.sentido,
                                  rotulo: `${sentido(trecho)}: ${pedido(trecho)}`,
                                  partidaSugerida: `${trecho.dataDesejada}T08:00`,
                                  companhia: trecho.companhia ?? "",
                                  numeroVoo: trecho.numeroVoo ?? "",
                                  localizador: trecho.localizador ?? "",
                                  partidaEm: paraCampoDeDataEHora(trecho.partidaEm),
                                  chegadaEm: paraCampoDeDataEHora(trecho.chegadaEm),
                                }))}
                              />
                            )
                          }
                        >
                          <p className="mb-3">
                            <SituacaoDoPedidoParaASdc situacao={voo.paraASdc} aprovadoEm={voo.aprovadoEm} />
                          </p>
                          <dl className="grid grid-cols-[92px_1fr] gap-x-3 gap-y-1 text-[14px]">
                            {voo.trechos.map((trecho) => (
                              <Linha key={trecho.sentido} rotulo={sentido(trecho)}>
                                {pedido(trecho)}
                                {voo.paraASdc !== "A_COMPRAR" && compra(trecho) && <span className="block text-[13px] text-[var(--ds-label-2)]">Comprado: {compra(trecho)}</span>}
                              </Linha>
                            ))}
                            {voo.observacaoTime && <Linha rotulo="Do time">{voo.observacaoTime}</Linha>}
                            {voo.compradoEm && voo.valorCentavos !== null && (
                              <Linha rotulo="Valor">
                                <span className="tabular-nums">{dinheiro(voo.valorCentavos)}</span> · registrado em {dataCurta(voo.compradoEm)}
                              </Linha>
                            )}
                            {voo.observacaoSdc && <Linha rotulo="Sua obs.">{voo.observacaoSdc}</Linha>}
                          </dl>
                          {voo.situacao === "ALTERADO" && <p className="mt-3 text-[13px] text-[var(--ds-orange-deep)]">O time alterou este pedido depois da compra. Confira o trecho e registre a compra de novo.</p>}
                        </Cartao>
                      </li>
                    );
                  })}
                </ul>
              </div>
            ))}
          </section>
        ))
      )}
    </>
  );
}
