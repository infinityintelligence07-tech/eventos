import { BedDouble, Hotel, Sparkles } from "lucide-react";

import type { HospedagemDoEventoCarregada } from "@/fluxos/logistica";
import { rotuloDaCapacidade, rotuloDoSexoDoQuarto, somarDias } from "@/modules/logistica";
import { BotaoCopiar, FormularioDeAcao } from "@/app/(time)/_componentes/ui";

import { Aviso, FaixaSomenteLeitura } from "../../_componentes/ui/aviso";
import { BarraDeFiltros, SeletorDeFiltro } from "../../_componentes/ui/barra-de-filtros";
import { BotaoDeEnvio } from "../../_componentes/ui/botao";
import { BotaoLink } from "../../_componentes/ui/botao-link";
import { Cartao } from "../../_componentes/ui/cartao";
import { CAMPO, TITULO_DE_SECAO } from "../../_componentes/ui/classes";
import { EstadoVazio } from "../../_componentes/ui/estados";
import { dataCurta, dinheiro, periodo, quantidadeDe } from "../../_componentes/ui/formatos";
import {
  adicionarQuartoAcao,
  alterarHospedagemAcao,
  aplicarRoomingSugeridoAcao,
  criarHospedagemAcao,
  porNoQuartoAcao,
  registrarPedidoDeHospedagemAcao,
  removerQuartoAcao,
  tirarDoQuartoAcao,
} from "../acoes";
import { BotaoDefinirHospedagem, FormularioNovoQuarto } from "./formularios-de-hospedagem";
import { ChipDoVoo } from "./situacoes";

type OpcaoDeQuarto = { id: string; rotulo: string; cheio: boolean };

/** Seletor "Mover para…" / "Colocar no quarto…" (alternativa a arrastar, WCAG 2.5.7). */
function MoverPara({ convocacaoId, nome, quartos, atual, rotulo }: { convocacaoId: string; nome: string; quartos: OpcaoDeQuarto[]; atual: string | null; rotulo: string }) {
  const destinos = quartos.filter((quarto) => quarto.id !== atual);
  if (destinos.length === 0) return null;
  const id = `mover-${convocacaoId}`;
  const descricao = atual ? `Mover ${nome} para outro quarto` : `Colocar ${nome} num quarto`;
  return (
    <FormularioDeAcao acao={porNoQuartoAcao} className="flex items-center gap-1" aria-label={descricao}>
      <input type="hidden" name="convocacaoId" value={convocacaoId} />
      <label htmlFor={id} className="sr-only">
        {descricao}
      </label>
      <select id={id} name="quartoId" required defaultValue="" className={`${CAMPO} h-8 w-auto max-w-[200px] pl-2 pr-7 text-[13px]`}>
        <option value="" disabled>
          {rotulo}…
        </option>
        {destinos.map((quarto) => (
          <option key={quarto.id} value={quarto.id} disabled={quarto.cheio}>
            {quarto.rotulo}
            {quarto.cheio ? " (cheio)" : ""}
          </option>
        ))}
      </select>
      <BotaoDeEnvio tamanho="pequeno" variante="secundario">
        {atual ? "Mover" : "Colocar"}
      </BotaoDeEnvio>
    </FormularioDeAcao>
  );
}

export function SecaoDeHospedagem({ dados, escrita, comSeletorDeEvento }: { dados: HospedagemDoEventoCarregada; escrita: boolean; comSeletorDeEvento: boolean }) {
  const { evento } = dados;
  const seletor = comSeletorDeEvento && (
    <BarraDeFiltros>
      <SeletorDeFiltro
        nome="evento"
        rotulo="Evento"
        todos="Próximo evento"
        valor={evento?.id ?? null}
        opcoes={dados.eventos.map((item) => ({ valor: item.id, rotulo: `${item.codigo ?? item.nome} · ${dataCurta(item.dataInicio)}` }))}
      />
    </BarraDeFiltros>
  );

  if (!evento) {
    return (
      <section aria-labelledby="titulo-hospedagem" className="mb-8">
        <h2 id="titulo-hospedagem" className={`${TITULO_DE_SECAO} mb-3`}>
          Hospedagem
        </h2>
        <Cartao espacamento="nenhum">
          <EstadoVazio icone={<Hotel size={32} aria-hidden />} titulo="Nenhum evento com equipe nos próximos dias.">
            A hospedagem é montada por evento, depois que a escala tem pessoas.
          </EstadoVazio>
        </Cartao>
      </section>
    );
  }

  const locais = dados.locais.map((local) => ({ valor: local.id, rotulo: `${local.nome} · ${local.cidade} (${local.uf})${local.tipo === "APARTAMENTO" ? " · apartamento" : ""}` }));
  const periodoSugerido = { checkIn: somarDias(evento.dataInicio, -1), checkOut: somarDias(evento.dataFim, 1) };
  const quartos: OpcaoDeQuarto[] = dados.hospedagens.flatMap((hospedagem) =>
    hospedagem.quartos.map((quarto) => ({
      id: quarto.id,
      rotulo: `${quarto.nome}${dados.hospedagens.length > 1 ? ` · ${hospedagem.local.nome}` : ""} · ${quantidadeDe(quarto.ocupantes.length, quarto.capacidade)} · ${rotuloDoSexoDoQuarto(quarto.sexo)}`,
      cheio: quarto.ocupantes.length >= quarto.capacidade,
    })),
  );

  return (
    <section aria-labelledby="titulo-hospedagem" className="mb-8">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
        <h2 id="titulo-hospedagem" className={TITULO_DE_SECAO}>
          Hospedagem
        </h2>
        {escrita && dados.hospedagens.length > 0 && (
          <BotaoDefinirHospedagem acao={criarHospedagemAcao} rotulo="Outra hospedagem" eventoId={evento.id} locais={locais} periodoSugerido={periodoSugerido} />
        )}
      </div>
      {!escrita && comSeletorDeEvento && <FaixaSomenteLeitura />}
      {seletor}

      {dados.hospedagens.length === 0 && (
        <Cartao espacamento="nenhum" className="mb-4">
          <EstadoVazio
            icone={<Hotel size={32} aria-hidden />}
            titulo="Nenhum hotel definido para este evento."
            acao={escrita && <BotaoDefinirHospedagem acao={criarHospedagemAcao} rotulo="Definir hotel" eventoId={evento.id} locais={locais} periodoSugerido={periodoSugerido} primario />}
          >
            Escolha o hotel (pela SDC) ou o apartamento da IAM e depois monte os quartos.
          </EstadoVazio>
        </Cartao>
      )}

      {dados.hospedagens.map((hospedagem) => (
        <div key={hospedagem.id} className="mb-6">
          <Cartao
            id={`hospedagem-${hospedagem.id}`}
            titulo={hospedagem.local.nome}
            explicacao={[hospedagem.local.tipo === "HOTEL" ? "Hotel" : "Apartamento da IAM", hospedagem.local.endereco, `${hospedagem.local.cidade} (${hospedagem.local.uf})`].filter(Boolean).join(" · ")}
            className="mb-4"
            acoes={
              <>
                <BotaoCopiar
                  tamanho="pequeno"
                  texto={hospedagem.textoDoRooming}
                  rotulo="Copiar rooming list"
                  mensagem={`Rooming list de ${hospedagem.local.nome} copiada.`}
                />
                {hospedagem.textoParaSdc && hospedagem.pedido && (
                  <BotaoCopiar tamanho="pequeno" texto={hospedagem.textoParaSdc} rotulo="Copiar pedido" mensagem={`Pedido ${hospedagem.pedido.referencia} copiado. Cole no canal da SDC.`} />
                )}
                {escrita && (
                  <BotaoDefinirHospedagem
                    acao={alterarHospedagemAcao}
                    rotulo="Editar hotel"
                    eventoId={evento.id}
                    locais={locais}
                    periodoSugerido={periodoSugerido}
                    hospedagem={{
                      id: hospedagem.id,
                      localId: hospedagem.local.id,
                      checkIn: hospedagem.checkIn,
                      checkOut: hospedagem.checkOut,
                      observacao: hospedagem.observacao,
                      atualizadoEm: hospedagem.atualizadoEm,
                    }}
                  />
                )}
              </>
            }
          >
            <dl className="grid grid-cols-[120px_1fr] gap-x-3 gap-y-1 text-[14px]">
              <dt className="text-[var(--ds-label-2)]">Período</dt>
              <dd>Check-in {dataCurta(hospedagem.checkIn)} · check-out {dataCurta(hospedagem.checkOut)}</dd>
              <dt className="text-[var(--ds-label-2)]">Reserva</dt>
              <dd>{hospedagem.numeroReserva ?? "—"}</dd>
              {hospedagem.local.tipo === "HOTEL" && (
                <>
                  <dt className="text-[var(--ds-label-2)]">Pedido à SDC</dt>
                  <dd className="flex flex-wrap items-center gap-2">
                    {hospedagem.pedido ? (
                      <>
                        <span className="[font-family:var(--ds-font-mono)] text-[13px]">{hospedagem.pedido.referencia}</span>
                        <ChipDoVoo situacao={hospedagem.pedido.situacao} />
                        {hospedagem.pedido.valorCentavos !== null && <span className="tabular-nums">{dinheiro(hospedagem.pedido.valorCentavos)}</span>}
                        {escrita && (hospedagem.pedido.situacao === "PEDIDO" || hospedagem.pedido.situacao === "ALTERADO") && (
                          <BotaoLink tamanho="pequeno" href={`/logistica/voos?ref=${hospedagem.pedido.referencia}&modo=registrar`}>
                            Registrar reserva
                          </BotaoLink>
                        )}
                        <BotaoLink tamanho="pequeno" variante="texto" href={`/logistica/voos?ref=${hospedagem.pedido.referencia}`}>
                          Abrir pedido
                        </BotaoLink>
                      </>
                    ) : escrita ? (
                      <FormularioDeAcao acao={registrarPedidoDeHospedagemAcao} aria-label="Pedir hospedagem à SDC">
                        <input type="hidden" name="hospedagemId" value={hospedagem.id} />
                        <BotaoDeEnvio tamanho="pequeno" variante="secundario">
                          Registrar pedido à SDC
                        </BotaoDeEnvio>
                      </FormularioDeAcao>
                    ) : (
                      "Sem pedido"
                    )}
                  </dd>
                </>
              )}
              {hospedagem.observacao && (
                <>
                  <dt className="text-[var(--ds-label-2)]">Observação</dt>
                  <dd>{hospedagem.observacao}</dd>
                </>
              )}
            </dl>
          </Cartao>

          <ul className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {hospedagem.quartos.map((quarto) => (
              <li key={quarto.id}>
                <Cartao
                  id={`quarto-${quarto.id}`}
                  titulo={`${quarto.nome} · ${rotuloDaCapacidade(quarto.capacidade)} · ${quantidadeDe(quarto.ocupantes.length, quarto.capacidade)}`}
                  explicacao={[rotuloDoSexoDoQuarto(quarto.sexo), quarto.valorDiariaCentavos !== null ? `diária ${dinheiro(quarto.valorDiariaCentavos)}` : null].filter(Boolean).join(" · ")}
                  acoes={
                    escrita &&
                    quarto.ocupantes.length === 0 && (
                      <FormularioDeAcao acao={removerQuartoAcao} aria-label={`Remover ${quarto.nome}`}>
                        <input type="hidden" name="quartoId" value={quarto.id} />
                        <BotaoDeEnvio tamanho="pequeno" variante="perigo">
                          Remover
                        </BotaoDeEnvio>
                      </FormularioDeAcao>
                    )
                  }
                >
                  {hospedagem.quartosComSexosMisturados.includes(quarto.id) && (
                    <Aviso tom="atencao" className="mb-3">
                      Quarto com pessoas de sexos diferentes.
                    </Aviso>
                  )}
                  {quarto.ocupantes.length === 0 ? (
                    <p className="text-[13px] text-[var(--ds-label-2)]">Quarto vazio.</p>
                  ) : (
                    <ul className="flex flex-col gap-2 text-[14px]">
                      {quarto.ocupantes.map((ocupante) => (
                        <li key={ocupante.convocacaoId} className="flex flex-wrap items-center justify-between gap-2">
                          <span>
                            {ocupante.nome}
                            {ocupante.sexo === null && <span className="ml-1 text-[12px] text-[var(--ds-orange-deep)]">(sem sexo no cadastro)</span>}
                          </span>
                          {escrita && (
                            <span className="flex flex-wrap items-center gap-1">
                              <MoverPara convocacaoId={ocupante.convocacaoId} nome={ocupante.nome} quartos={quartos} atual={quarto.id} rotulo="Mover para" />
                              <FormularioDeAcao acao={tirarDoQuartoAcao} aria-label={`Tirar ${ocupante.nome} do quarto`}>
                                <input type="hidden" name="quartoId" value={quarto.id} />
                                <input type="hidden" name="convocacaoId" value={ocupante.convocacaoId} />
                                <BotaoDeEnvio tamanho="pequeno" variante="texto" aria-label={`Tirar ${ocupante.nome} do ${quarto.nome}`}>
                                  Tirar
                                </BotaoDeEnvio>
                              </FormularioDeAcao>
                            </span>
                          )}
                        </li>
                      ))}
                    </ul>
                  )}
                </Cartao>
              </li>
            ))}
            {escrita && (
              <li className="flex items-start">
                <FormularioNovoQuarto acao={adicionarQuartoAcao} hospedagemId={hospedagem.id} proximoNome={`Quarto ${hospedagem.quartos.length + 1}`} />
              </li>
            )}
          </ul>
        </div>
      ))}

      {dados.hospedagens.length > 0 && (
        <Cartao
          id="sem-quarto"
          titulo={`Sem quarto · ${dados.semQuarto.length}`}
          explicacao={`Pessoas escaladas em ${evento.codigo ?? evento.nome} (${periodo(evento.dataInicio, evento.dataFim)}) que ainda não têm quarto.`}
          acoes={
            escrita &&
            dados.sugestaoAloca > 0 && (
              <FormularioDeAcao acao={aplicarRoomingSugeridoAcao} aria-label="Sugerir rooming por sexo">
                <input type="hidden" name="eventoId" value={evento.id} />
                <BotaoDeEnvio tamanho="pequeno" variante="secundario" icone={<Sparkles size={16} aria-hidden />}>
                  Distribuir por sexo ({dados.sugestaoAloca})
                </BotaoDeEnvio>
              </FormularioDeAcao>
            )
          }
        >
          {dados.semQuarto.length === 0 ? (
            <p className="flex items-center gap-2 text-[13px] text-[var(--ds-label-2)]">
              <BedDouble size={16} aria-hidden /> Todo mundo tem quarto.
            </p>
          ) : (
            <ul className="flex flex-col gap-2 text-[14px]">
              {dados.semQuarto.map((pessoa) => (
                <li key={pessoa.convocacaoId} className="flex flex-wrap items-center justify-between gap-2">
                  <span>
                    {pessoa.nome}
                    <span className="ml-1 text-[12px] text-[var(--ds-label-2)]">
                      {[pessoa.funcao, pessoa.sexo === "F" ? "feminino" : pessoa.sexo === "M" ? "masculino" : "sem sexo no cadastro"].filter(Boolean).join(" · ")}
                    </span>
                  </span>
                  {escrita && <MoverPara convocacaoId={pessoa.convocacaoId} nome={pessoa.nome} quartos={quartos} atual={null} rotulo="Colocar no quarto" />}
                </li>
              ))}
            </ul>
          )}
        </Cartao>
      )}
    </section>
  );
}
