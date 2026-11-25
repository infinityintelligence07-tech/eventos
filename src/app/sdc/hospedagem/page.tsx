import { Hotel } from "lucide-react";
import type { Metadata } from "next";

import { Cartao } from "@/app/(time)/_componentes/ui/cartao";
import { TITULO_DE_SECAO } from "@/app/(time)/_componentes/ui/classes";
import { EstadoVazio } from "@/app/(time)/_componentes/ui/estados";
import { dataCurta, dinheiro, periodo } from "@/app/(time)/_componentes/ui/formatos";
import { paraCampoDeDinheiro } from "@/app/(time)/logistica/_componentes/situacoes";
import { carregarHospedagensDaSdc } from "@/fluxos/sdc";
import { AtalhosDoRecorte } from "@/app/(time)/logistica/_componentes/recorte";
import { dataEmSaoPaulo, recorteDaLogistica, rotuloDoMes } from "@/modules/logistica";

import { enderecoDaSdc, FiltroDaSdc, Linha, SituacaoDoPedidoParaASdc, situacaoDoFiltroDaSdc, TituloDoEvento, TotaisDaSdc } from "../_componentes/comuns";
import { BotaoRegistrarReserva } from "../_componentes/formularios";
import { exigirAtorSdc } from "../_servidor/ator-sdc";
import { registrarReservaAcao } from "../acoes";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Hospedagem" };

const quantos = (quantidade: number, um: string, varios: string) => `${quantidade} ${quantidade === 1 ? um : varios}`;

/** Hospedagens pedidas pelo time: datas, quartos e quem divide com quem. A SDC escolhe o hotel e registra a reserva. */
export default async function PaginaHospedagemDaSdc({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  await exigirAtorSdc();
  const busca = await searchParams;
  const situacao = situacaoDoFiltroDaSdc(busca.situacao);
  const agora = new Date();
  const hoje = dataEmSaoPaulo(agora);
  const dados = await carregarHospedagensDaSdc({ situacao, recorte: recorteDaLogistica(typeof busca.recorte === "string" ? busca.recorte : undefined) }, agora);

  return (
    <>
      <h1 className="mb-1 text-[22px] font-semibold tracking-[-0.01em]">Hospedagem</h1>
      <p className="mb-4 text-[14px] text-[var(--ds-label-2)]">
        Hospedagens pedidas pelo time de eventos, com os quartos já montados. Registre o hotel reservado, a reserva e o valor; o time confere e aprova o pagamento.
      </p>
      {/* Eventos | Masterclass, como as abas da planilha. */}
      <AtalhosDoRecorte recorte={dados.recorte} quantidades={dados.pedidosPorRecorte} href={(recorte) => enderecoDaSdc("/sdc/hospedagem", recorte)} />
      <TotaisDaSdc totais={dados.totais} />
      <FiltroDaSdc base="/sdc/hospedagem" recorte={dados.recorte} atual={situacao} contagens={dados.contagens} />

      {dados.total === 0 ? (
        <Cartao espacamento="nenhum">
          <EstadoVazio icone={<Hotel size={32} aria-hidden />} titulo={situacao ? "Nenhum pedido de hospedagem com esse filtro." : "Nenhum pedido de hospedagem por enquanto."} nivel="h2">
            Os pedidos aparecem aqui assim que o time de eventos monta os quartos e pede a hospedagem.
          </EstadoVazio>
        </Cartao>
      ) : (
        dados.grupos.map((mes) => (
          <section key={mes.mes} aria-label={rotuloDoMes(mes.mes)} className="mb-6">
            <h2 className={`${TITULO_DE_SECAO} mb-3`}>{rotuloDoMes(mes.mes)}</h2>
            {mes.eventos.map(({ evento, linhas }) => (
              <div key={evento.chave} className="mb-5">
                <TituloDoEvento evento={evento} />
                <ul className="grid grid-cols-1 gap-3">
                  {linhas.map((hospedagem) => {
                    const pessoas = hospedagem.quartos.reduce((total, quarto) => total + quarto.ocupantes.length, 0);
                    const corrigindo = hospedagem.paraASdc === "AGUARDANDO_APROVACAO";
                    return (
                      <li key={hospedagem.referencia}>
                        <Cartao
                          titulo={hospedagem.hotel && hospedagem.paraASdc !== "A_COMPRAR" ? hospedagem.hotel.nome : "Hospedagem a reservar"}
                          explicacao={
                            <>
                              <span className="[font-family:var(--ds-font-mono)]">{hospedagem.referencia}</span> · pedido em {dataCurta(hospedagem.dataSolicitacao)}
                            </>
                          }
                          acoes={
                            hospedagem.podeRegistrar && (
                              <BotaoRegistrarReserva
                                acao={registrarReservaAcao}
                                referencia={hospedagem.referencia}
                                evento={evento.codigo ?? evento.nome}
                                corrigindo={corrigindo}
                                hotel={{
                                  nome: hospedagem.hotel?.nome ?? "",
                                  cidade: hospedagem.hotel?.cidade ?? evento.cidade ?? "",
                                  uf: hospedagem.hotel?.uf ?? evento.uf ?? "",
                                  logradouro: hospedagem.hotel?.logradouro ?? "",
                                  numero: hospedagem.hotel?.numero ?? "",
                                  bairro: hospedagem.hotel?.bairro ?? "",
                                }}
                                numeroReserva={corrigindo ? (hospedagem.numeroReserva ?? "") : ""}
                                valor={paraCampoDeDinheiro(corrigindo ? hospedagem.valorCentavos : null)}
                                formaPagamento={hospedagem.formaPagamento ?? "Faturado SDC"}
                                observacao={hospedagem.observacaoSdc ?? ""}
                                datas={{ dataCompra: hospedagem.dataCompra ?? hoje, dataSolicitacao: hospedagem.dataSolicitacao, hoje }}
                              />
                            )
                          }
                        >
                          <p className="mb-3">
                            <SituacaoDoPedidoParaASdc situacao={hospedagem.paraASdc} aprovadoEm={hospedagem.aprovadoEm} />
                          </p>
                          <dl className="grid grid-cols-[92px_1fr] gap-x-3 gap-y-1 text-[14px]">
                            {hospedagem.checkIn && hospedagem.checkOut && (
                              <Linha rotulo="Período">
                                Entrada {dataCurta(hospedagem.checkIn)} · saída {dataCurta(hospedagem.checkOut)} ({periodo(hospedagem.checkIn, hospedagem.checkOut)})
                              </Linha>
                            )}
                            {hospedagem.quartos.length > 0 && (
                              <Linha rotulo="Quartos">
                                {quantos(hospedagem.quartos.length, "quarto", "quartos")} · {quantos(pessoas, "pessoa", "pessoas")}
                              </Linha>
                            )}
                            {hospedagem.observacaoTime && <Linha rotulo="Do time">{hospedagem.observacaoTime}</Linha>}
                            {hospedagem.hotel && (
                              <Linha rotulo={hospedagem.paraASdc === "A_COMPRAR" ? "Hotel pedido" : "Hotel"}>
                                {hospedagem.hotel.nome} · {[hospedagem.hotel.logradouro, hospedagem.hotel.numero, hospedagem.hotel.bairro].filter(Boolean).join(", ")}
                                {hospedagem.hotel.logradouro ? " · " : ""}
                                {hospedagem.hotel.cidade} ({hospedagem.hotel.uf})
                              </Linha>
                            )}
                            {hospedagem.dataCompra && hospedagem.numeroReserva && <Linha rotulo="Reserva">{hospedagem.numeroReserva}</Linha>}
                            {hospedagem.dataCompra && hospedagem.valorCentavos !== null && (
                              <Linha rotulo="Valor">
                                <span className="tabular-nums">{dinheiro(hospedagem.valorCentavos)}</span>
                                {hospedagem.formaPagamento ? ` · ${hospedagem.formaPagamento}` : ""} · reservado em {dataCurta(hospedagem.dataCompra)}
                              </Linha>
                            )}
                            {hospedagem.observacaoSdc && <Linha rotulo="Sua obs.">{hospedagem.observacaoSdc}</Linha>}
                          </dl>
                          {hospedagem.quartos.length > 0 && (
                            <ul className="mt-3 grid grid-cols-1 gap-2 border-t border-[var(--ds-separator)] pt-3 text-[14px] sm:grid-cols-2 lg:grid-cols-3">
                              {hospedagem.quartos.map((quarto) => (
                                <li key={quarto.nome}>
                                  <span className="font-medium">
                                    {quarto.nome} · {quantos(quarto.capacidade, "cama", "camas")}
                                  </span>
                                  <span className="block text-[13px] text-[var(--ds-label-2)]">{quarto.ocupantes.join(", ") || "Sem ninguém ainda"}</span>
                                </li>
                              ))}
                            </ul>
                          )}
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
