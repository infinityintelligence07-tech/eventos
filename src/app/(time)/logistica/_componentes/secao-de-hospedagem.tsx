import { Hotel, Sparkles } from "lucide-react";
import Link from "next/link";

import type { HospedagemDoEventoCarregada } from "@/fluxos/logistica";
import { destinoDaTroca, destinoNoQuarto, diasEntre, rotuloDaCapacidade, rotuloDoSexoDoQuarto, somarDias, textoDoPeriodo } from "@/modules/logistica";
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
  definirPeriodoDoOcupanteAcao,
  moverDeQuartoAcao,
  porNoQuartoAcao,
  registrarPedidoDeHospedagemAcao,
  removerQuartoAcao,
  tirarDoQuartoAcao,
} from "../acoes";
import { BotaoDefinirHospedagem, BotaoPeriodoDoOcupante, FormularioNovoQuarto } from "./formularios-de-hospedagem";
import { ChipDoVoo } from "./situacoes";

type OpcaoDeQuarto = { id: string; rotulo: string; cheio: boolean };
/** Quem já está num quarto e pode trocar de lugar com outra pessoa. */
type OpcaoDeTroca = { convocacaoId: string; quartoId: string; rotulo: string };

const diarias = (noites: number) => (noites === 1 ? "1 diária" : `${noites} diárias`);
const primeiroNome = (nome: string) => nome.trim().split(/\s+/)[0] ?? nome;
const pessoas = (quantidade: number) => (quantidade === 1 ? "1 pessoa" : `${quantidade} pessoas`);

const CLASSE_DO_SELETOR = `${CAMPO} h-8 w-auto max-w-[220px] pl-2 pr-7 text-[13px]`;

/** "Colocar no quarto…" de quem está sem quarto (alternativa a arrastar, WCAG 2.5.7). */
function ColocarNoQuarto({ convocacaoId, nome, quartos }: { convocacaoId: string; nome: string; quartos: OpcaoDeQuarto[] }) {
  if (quartos.length === 0) return null;
  const id = `colocar-${convocacaoId}`;
  const descricao = `Colocar ${nome} num quarto`;
  return (
    <FormularioDeAcao acao={porNoQuartoAcao} className="flex items-center gap-1" aria-label={descricao}>
      <input type="hidden" name="convocacaoId" value={convocacaoId} />
      <label htmlFor={id} className="sr-only">
        {descricao}
      </label>
      <select id={id} name="quartoId" required defaultValue="" className={CLASSE_DO_SELETOR}>
        <option value="" disabled>
          Colocar no quarto…
        </option>
        {quartos.map((quarto) => (
          <option key={quarto.id} value={quarto.id} disabled={quarto.cheio}>
            {quarto.rotulo}
            {quarto.cheio ? " (cheio)" : ""}
          </option>
        ))}
      </select>
      <BotaoDeEnvio tamanho="pequeno" variante="secundario">
        Colocar
      </BotaoDeEnvio>
    </FormularioDeAcao>
  );
}

/**
 * "Mover para…" de quem já está num quarto, em um passo: outro quarto com vaga ou trocar de lugar com alguém de outro
 * quarto (a troca funciona mesmo com os dois quartos cheios).
 */
function MoverDeQuarto({ convocacaoId, nome, quartoAtual, quartos, trocas }: { convocacaoId: string; nome: string; quartoAtual: string; quartos: OpcaoDeQuarto[]; trocas: OpcaoDeTroca[] }) {
  const destinos = quartos.filter((quarto) => quarto.id !== quartoAtual);
  const comQuem = trocas.filter((troca) => troca.quartoId !== quartoAtual);
  if (destinos.length === 0) return null;
  const id = `mover-${convocacaoId}`;
  const descricao = `Mover ${nome} para outro quarto ou trocar de lugar com alguém`;
  return (
    <FormularioDeAcao acao={moverDeQuartoAcao} className="flex items-center gap-1" aria-label={descricao}>
      <input type="hidden" name="quartoId" value={quartoAtual} />
      <input type="hidden" name="convocacaoId" value={convocacaoId} />
      <label htmlFor={id} className="sr-only">
        {descricao}
      </label>
      <select id={id} name="destino" required defaultValue="" className={CLASSE_DO_SELETOR}>
        <option value="" disabled>
          Mover para…
        </option>
        <optgroup label="Outro quarto">
          {destinos.map((quarto) => (
            <option key={quarto.id} value={destinoNoQuarto(quarto.id)} disabled={quarto.cheio}>
              {quarto.rotulo}
              {quarto.cheio ? " (cheio)" : ""}
            </option>
          ))}
        </optgroup>
        {comQuem.length > 0 && (
          <optgroup label="Trocar de lugar com">
            {comQuem.map((troca) => (
              <option key={troca.convocacaoId} value={destinoDaTroca(troca.quartoId, troca.convocacaoId)}>
                {troca.rotulo}
              </option>
            ))}
          </optgroup>
        )}
      </select>
      <BotaoDeEnvio tamanho="pequeno" variante="secundario">
        Mover
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
  const variosHoteis = dados.hospedagens.length > 1;
  // A opção do quarto diz quem já está nele: escolher o quarto é escolher com quem a pessoa divide.
  const quartos: OpcaoDeQuarto[] = dados.hospedagens.flatMap((hospedagem) =>
    hospedagem.quartos.map((quarto) => ({
      id: quarto.id,
      rotulo: [
        `${quarto.nome}${variosHoteis ? ` · ${hospedagem.local.nome}` : ""}`,
        quantidadeDe(quarto.ocupantes.length, quarto.capacidade),
        rotuloDoSexoDoQuarto(quarto.sexo),
        quarto.ocupantes.length > 0 ? `com ${quarto.ocupantes.map((ocupante) => primeiroNome(ocupante.nome)).join(", ")}` : "vazio",
      ].join(" · "),
      cheio: quarto.ocupantes.length >= quarto.capacidade,
    })),
  );
  const trocas: OpcaoDeTroca[] = dados.hospedagens.flatMap((hospedagem) =>
    hospedagem.quartos.flatMap((quarto) =>
      quarto.ocupantes.map((ocupante) => ({
        convocacaoId: ocupante.convocacaoId,
        quartoId: quarto.id,
        rotulo: `${ocupante.nome} (${quarto.nome}${variosHoteis ? ` · ${hospedagem.local.nome}` : ""})`,
      })),
    ),
  );
  const totalDeQuartos = quartos.length;
  const comQuarto = dados.equipe.length - dados.semQuarto.length;
  const escalaHref = `/eventos/${evento.id}/escala`;

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

      {/* De onde a tela parte: quem o time marcou para hotel na escala, e quantos já têm quarto. */}
      <Aviso
        tom={dados.equipe.length === 0 ? "informacao" : dados.semQuarto.length > 0 ? "atencao" : "sucesso"}
        className="mb-4"
        titulo={
          dados.equipe.length === 0
            ? `Ninguém marcado para hotel na escala de ${evento.codigo ?? evento.nome}`
            : `${dados.equipe.length === 1 ? "1 pessoa marcada" : `${dados.equipe.length} pessoas marcadas`} para hotel na escala de ${evento.codigo ?? evento.nome}`
        }
        acao={
          <Link href={escalaHref} className="font-medium text-[var(--ds-tint-text)] hover:underline">
            {dados.equipe.length === 0 ? "Marcar na escala" : "Abrir a escala"}
          </Link>
        }
      >
        <p>
          {dados.equipe.length === 0
            ? "Só entra em quarto quem está marcado com Hotel na escala do evento. Marque lá quem vai hospedar e volte para montar os quartos."
            : dados.semQuarto.length === 0
              ? "Todo mundo tem quarto. Em cada quarto abaixo dá para ver quem divide com quem."
              : `${comQuarto} com quarto e ${dados.semQuarto.length} sem quarto. Coloque cada pessoa num quarto para definir quem divide com quem.`}
        </p>
        {dados.naEscalaSemHotel > 0 && (
          <p className="mt-1 text-[13px] text-[var(--ds-label-2)]">
            {dados.naEscalaSemHotel === 1 ? "1 pessoa da escala não está marcada" : `${dados.naEscalaSemHotel} pessoas da escala não estão marcadas`} para hotel. Se falta alguém aqui, marque Hotel na escala.
          </p>
        )}
      </Aviso>

      {dados.semQuarto.length > 0 && (
        <Cartao
          id="sem-quarto"
          titulo={`Sem quarto · ${dados.semQuarto.length}`}
          explicacao={`Marcadas para hotel na escala de ${evento.codigo ?? evento.nome} (${periodo(evento.dataInicio, evento.dataFim)}) que ainda não têm quarto.`}
          className="mb-4"
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
          {totalDeQuartos === 0 && (
            <p className="mb-3 text-[13px] text-[var(--ds-label-2)]">
              {dados.hospedagens.length === 0 ? "Defina o hotel e crie os quartos logo abaixo para começar a distribuir." : "Crie os quartos logo abaixo para começar a distribuir."}
            </p>
          )}
          <ul className="flex flex-col gap-2 text-[14px]">
            {dados.semQuarto.map((pessoa) => (
              <li key={pessoa.convocacaoId} className="flex flex-wrap items-center justify-between gap-2">
                <span>
                  {pessoa.nome}
                  <span className="ml-1 text-[12px] text-[var(--ds-label-2)]">
                    {[pessoa.funcao, pessoa.sexo === "F" ? "feminino" : pessoa.sexo === "M" ? "masculino" : "sem sexo no cadastro"].filter(Boolean).join(" · ")}
                  </span>
                </span>
                {escrita && <ColocarNoQuarto convocacaoId={pessoa.convocacaoId} nome={pessoa.nome} quartos={quartos} />}
              </li>
            ))}
          </ul>
        </Cartao>
      )}

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

          <ul className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
            {hospedagem.quartos.map((quarto) => (
              <li key={quarto.id}>
                <Cartao
                  id={`quarto-${quarto.id}`}
                  titulo={`${quarto.nome} · ${rotuloDaCapacidade(quarto.capacidade)} · ${quantidadeDe(quarto.ocupantes.length, quarto.capacidade)}`}
                  explicacao={[
                    rotuloDoSexoDoQuarto(quarto.sexo),
                    quarto.valorDiariaCentavos !== null ? `diária ${dinheiro(quarto.valorDiariaCentavos)}` : null,
                    quarto.ocupantes.length > 1 ? `${pessoas(quarto.ocupantes.length)} dividem o quarto` : null,
                  ]
                    .filter(Boolean)
                    .join(" · ")}
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
                    <p className="text-[13px] text-[var(--ds-label-2)]">Quarto vazio. Coloque alguém pela lista &quot;Sem quarto&quot;, no topo.</p>
                  ) : (
                    <ul className="flex flex-col gap-2 text-[14px]">
                      {quarto.ocupantes.map((ocupante) => (
                        <li key={ocupante.convocacaoId} className="flex flex-wrap items-center justify-between gap-2">
                          <span>
                            {ocupante.nome}
                            {ocupante.sexo === null && <span className="ml-1 text-[12px] text-[var(--ds-orange-deep)]">(sem sexo no cadastro)</span>}
                            {ocupante.checkIn && ocupante.checkOut && (
                              <span className="block text-[12px] text-[var(--ds-label-2)]">
                                {textoDoPeriodo({ checkIn: ocupante.checkIn, checkOut: ocupante.checkOut })} · {diarias(diasEntre(ocupante.checkIn, ocupante.checkOut))}
                              </span>
                            )}
                          </span>
                          {escrita && (
                            <span className="flex flex-wrap items-center gap-1">
                              <BotaoPeriodoDoOcupante
                                acao={definirPeriodoDoOcupanteAcao}
                                quartoId={quarto.id}
                                convocacaoId={ocupante.convocacaoId}
                                nome={ocupante.nome}
                                hospedagem={{ checkIn: hospedagem.checkIn, checkOut: hospedagem.checkOut }}
                                proprio={ocupante.checkIn && ocupante.checkOut ? { checkIn: ocupante.checkIn, checkOut: ocupante.checkOut } : null}
                              />
                              <MoverDeQuarto convocacaoId={ocupante.convocacaoId} nome={ocupante.nome} quartoAtual={quarto.id} quartos={quartos} trocas={trocas} />
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
    </section>
  );
}
