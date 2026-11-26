import { Plane, Plus } from "lucide-react";
import Link from "next/link";

import type { LinhaDeVoo, PedidoCarregado, VoosCarregados } from "@/fluxos/logistica";
import {
  aeroportosDoTrecho,
  aguardandoSdc,
  cidadeComUf,
  cidadesDoTrecho,
  type EventoDaLogistica,
  localDaPalestra,
  type PedidoDaSdc,
  rotaDoTrecho,
  rotuloDaPreferencia,
  rotuloDoMes,
  rotuloDoSentido,
  rotuloDoTrajeto,
  situacaoDoPagamento,
  type Sentido,
  textoDosDiasQueFaltam,
  trajetoDosTrechos,
  type TrechoDoPedido,
} from "@/modules/logistica";
import { BotaoCopiar, FormularioDeAcao, PainelPelaUrl } from "@/app/(time)/_componentes/ui";

import { Aviso, FaixaSomenteLeitura } from "../../_componentes/ui/aviso";
import { AtalhosDeFiltro, BarraDeFiltros, SeletorDeFiltro } from "../../_componentes/ui/barra-de-filtros";
import { BotaoDeEnvio } from "../../_componentes/ui/botao";
import { BotaoLink } from "../../_componentes/ui/botao-link";
import { Cartao } from "../../_componentes/ui/cartao";
import { TITULO_DE_CARTAO, TITULO_DE_SECAO } from "../../_componentes/ui/classes";
import { EstadoVazio } from "../../_componentes/ui/estados";
import { dataCurta, dataEHora, dinheiro, hora, periodo } from "../../_componentes/ui/formatos";
import { SeloRegistradoPeloTime } from "../../_componentes/ui/selo";
import { CabecaDaTabela, CelulaDaTabela, ColunaDaTabela, LinhaDaTabela, Tabela } from "../../_componentes/ui/tabela";
import {
  alterarPedidoAcao,
  aprovarPagamentoAcao,
  cancelarPedidoAcao,
  desfazerAprovacaoAcao,
  dispensarLogisticaDoEventoAcao,
  registrarPedidoDeVooAcao,
  registrarRetornoDeVooAcao,
  definirHotelDoVooAcao,
} from "../acoes";
import {
  BotaoAprovarPagamento,
  BotaoCancelarPedido,
  BotaoDesfazerAprovacao,
  FormularioAlterarPedido,
  FormularioNovoPedido,
  FormularioRegistrarVoo,
  type TrechosIniciais,
} from "./formularios-de-voo";
import { ChipDoPagamento, TotaisDoPagamentoNaTela } from "./pagamento";
import { AtalhosDoRecorte } from "./recorte";
import { ChipDoVoo, enderecoCom, paraCampoDeDataEHora, paraCampoDeDinheiro } from "./situacoes";

// Voos como na planilha do time: pedidos agrupados por mês e por evento, uma linha por compra. Nós solicitamos, a SDC
// compra e o time registra o retorno. O pedido não depende da escala: "Novo pedido" vale para qualquer evento futuro e
// qualquer pessoa ativa do staff.

export type ParametrosDeVoos = { evento?: string; situacao?: string; ref?: string; modo?: string; novo?: string; pessoa?: string; registrado?: string; hotel?: string; /** "masterclass" = recorte de Masterclass; ausente = eventos. */ recorte?: string };

function textoDoVoo(trecho: TrechoDoPedido): string | null {
  if (!trecho.companhia || !trecho.numeroVoo) return null;
  const horario = trecho.partidaEm && trecho.chegadaEm ? ` · ${dataCurta(trecho.partidaEm)} ${hora(trecho.partidaEm)}–${hora(trecho.chegadaEm)}` : "";
  return `${trecho.companhia} ${trecho.numeroVoo}${horario}${trecho.localizador ? ` · localizador ${trecho.localizador}` : ""}`;
}

const SEM_DADO = <span className="text-[var(--ds-label-2)]">—</span>;

/** A palestra no seletor: a data primeiro (são centenas), depois onde é. */
const rotuloDaPalestra = (evento: EventoDaLogistica) => `${dataCurta(evento.dataInicio)} · ${localDaPalestra(evento)}${evento.codigo ? ` · ${evento.codigo}` : ""}`;
const rotuloNoSeletor = (evento: EventoDaLogistica) => (evento.masterclass ? rotuloDaPalestra(evento) : rotuloDoEvento(evento));

const rotuloDoEvento = (evento: EventoDaLogistica) => `${periodo(evento.dataInicio, evento.dataFim)} · ${evento.codigo ?? evento.nome}${evento.cidade && evento.uf ? ` · ${evento.cidade} (${evento.uf})` : ""}`;

/**
 * Ida ou volta numa célula. Em cima, de onde para onde: as cidades que o time pediu e, quando a SDC já informou (ou no
 * pedido antigo), os aeroportos. Embaixo a data e o horário (os do voo emitido, ou o que foi pedido).
 */
function CelulaDoSentido({ trechos, sentido }: { trechos: TrechoDoPedido[]; sentido: Sentido }) {
  const trecho = trechos.find((item) => item.sentido === sentido);
  if (!trecho) return <CelulaDaTabela>{SEM_DADO}</CelulaDaTabela>;
  const quando = trecho.partidaEm
    ? `${dataCurta(trecho.partidaEm)} · ${hora(trecho.partidaEm)}`
    : `${dataCurta(trecho.dataDesejada)}${trecho.preferenciaHorario ? ` · ${rotuloDaPreferencia(trecho.preferenciaHorario)}` : ""}`;
  return (
    <CelulaDaTabela>
      {trecho.origemIata && trecho.destinoIata ? (
        // Os dois aeroportos: uma linha em mono, como na planilha.
        <span className="block whitespace-nowrap [font-family:var(--ds-font-mono)] text-[13px]">{rotaDoTrecho(trecho)}</span>
      ) : (
        // Ainda com cidade (em uma ponta ou nas duas): nome de cidade é comprido, então a origem e o destino vão um embaixo do outro.
        <>
          <span className="block whitespace-nowrap text-[13px]">{trecho.origemIata ?? trecho.origemCidade ?? "—"} →</span>
          <span className="block whitespace-nowrap text-[13px]">{trecho.destinoIata ?? trecho.destinoCidade ?? "—"}</span>
        </>
      )}
      <span className="block whitespace-nowrap text-[12px] tabular-nums text-[var(--ds-label-2)]">{quando}</span>
    </CelulaDaTabela>
  );
}

/** Quem lançou a compra: a própria SDC (pela área dela) ou alguém do time em nome dela. */
function QuemRegistrou({ pedido }: { pedido: PedidoDaSdc }) {
  if (pedido.retornoPelaSdc) return <span className="text-[12px] text-[var(--ds-label-2)]">Compra registrada pela SDC ({pedido.retornoPelaSdc})</span>;
  return pedido.retornoRegistradoPor ? <SeloRegistradoPeloTime em={pedido.emitidoEm} por={pedido.retornoRegistradoPor} /> : null;
}

const distintos = (valores: (string | null)[]) => [...new Set(valores.filter((valor): valor is string => Boolean(valor)))];

/**
 * As cidades do "Alterar pedido": as que o pedido já tem. No pedido antigo (só aeroporto) entram as sugestões, como no
 * pedido novo: a cidade do cadastro da pessoa e a do evento (na turnê, a volta sai da cidade da última palestra).
 */
function trechosIniciais(pedido: PedidoDaSdc, cidadeDaPessoa: string | null): TrechosIniciais {
  const ida = pedido.trechos.find((trecho) => trecho.sentido === "IDA");
  const volta = pedido.trechos.find((trecho) => trecho.sentido === "VOLTA");
  const cidadeDoEvento = cidadeComUf(pedido.evento.cidade, pedido.evento.uf) ?? "";
  const cidadeDaVolta = pedido.eventoDaVolta ? (cidadeComUf(pedido.eventoDaVolta.cidade, pedido.eventoDaVolta.uf) ?? "") : null;
  const destinoCidade = ida ? (ida.destinoCidade ?? cidadeDoEvento) : (volta?.origemCidade ?? cidadeDaVolta ?? cidadeDoEvento);
  // A volta sai de outra cidade (turnê): a gravada no pedido ou, no pedido antigo, a da última palestra.
  const voltaDe = ida && volta ? (volta.origemCidade ?? cidadeDaVolta) : ida ? cidadeDaVolta : null;
  return {
    origemCidade: ida?.origemCidade ?? volta?.destinoCidade ?? cidadeDaPessoa ?? "",
    destinoCidade,
    voltaDeCidade: voltaDe !== null && (pedido.eventoDaVolta !== null || voltaDe !== destinoCidade) ? voltaDe : null,
    ida: ida ? { data: ida.dataDesejada, preferencia: ida.preferenciaHorario ?? "" } : null,
    volta: volta ? { data: volta.dataDesejada, preferencia: volta.preferenciaHorario ?? "" } : null,
  };
}

/** Uma compra (ou um lembrete da escala, sem pedido) nas colunas da planilha. */
function LinhaDoVoo({
  linha,
  base,
  parametros,
  escrita,
  diasDoAtraso,
  masterclass = false,
}: {
  linha: LinhaDeVoo;
  /** Limite do "atrasado" em vigor. */
  diasDoAtraso: number;
  base: string;
  parametros: ParametrosDeVoos;
  escrita: boolean;
  /** Colunas da aba VOOS MASTERCLASS: local da 1ª e da última palestra no lugar da escala, e a forma de pagamento. */
  masterclass?: boolean;
}) {
  const pedido = linha.pedido;
  const trechos = pedido?.trechos ?? [];
  const trajeto = trajetoDosTrechos(trechos.map((trecho) => trecho.sentido));
  const companhias = distintos(trechos.map((trecho) => (trecho.companhia ? [trecho.companhia, trecho.numeroVoo].filter(Boolean).join(" ") : null)));
  const reservas = distintos(trechos.map((trecho) => trecho.localizador));
  const abrir = (mudancas: Record<string, string | null>) => enderecoCom(base, parametros, { ref: null, modo: null, novo: null, pessoa: null, registrado: null, hotel: null, ...mudancas });
  return (
    <LinhaDaTabela>
      <CelulaDaTabela cabecalhoDaLinha>
        {linha.passageiro.nome}
        {pedido && (
          <Link href={abrir({ ref: pedido.referencia })} scroll={false} className="block whitespace-nowrap [font-family:var(--ds-font-mono)] text-[12px] font-medium text-[var(--ds-tint-text)] hover:underline">
            {pedido.referencia}
          </Link>
        )}
      </CelulaDaTabela>
      {!masterclass && (
        <CelulaDaTabela className="whitespace-nowrap text-[13px]">
          {linha.passageiro.naEscala ? "Na escala" : <span className="text-[var(--ds-label-2)]">Fora da escala</span>}
        </CelulaDaTabela>
      )}
      <CelulaDaTabela className="whitespace-nowrap tabular-nums">{pedido ? dataCurta(pedido.dataSolicitacao) : SEM_DADO}</CelulaDaTabela>
      <CelulaDaTabela className="whitespace-nowrap">{trajeto ? rotuloDoTrajeto(trajeto) : SEM_DADO}</CelulaDaTabela>
      {masterclass && <CelulaDaPalestra evento={linha.evento} />}
      <CelulaDoSentido trechos={trechos} sentido="IDA" />
      {masterclass && <CelulaDaPalestra evento={pedido?.eventoDaVolta ?? linha.evento} />}
      <CelulaDoSentido trechos={trechos} sentido="VOLTA" />
      <CelulaDaTabela>
        <span className="flex flex-wrap items-center gap-1">
          <ChipDoVoo situacao={linha.situacao} />
          {pedido && <ChipDoPagamento pedido={pedido} />}
          {pedido && <QuemRegistrou pedido={pedido} />}
        </span>
        {linha.situacao === "A_PEDIR" && (
          <span className="mt-1 block text-[12px] text-[var(--ds-label-2)]">
            Marcada como Avião na escala
            {linha.janela.janela === "ATRASADO" && <span className="font-medium text-[var(--ds-red-deep)]"> · atrasado ({diasDoAtraso} dias ou menos)</span>}
          </span>
        )}
      </CelulaDaTabela>
      <CelulaDaTabela className="whitespace-nowrap tabular-nums">{pedido?.dataCompra ? dataCurta(pedido.dataCompra) : SEM_DADO}</CelulaDaTabela>
      <CelulaDaTabela className="text-[13px]">{companhias.length ? companhias.map((companhia) => <span key={companhia} className="block whitespace-nowrap">{companhia}</span>) : SEM_DADO}</CelulaDaTabela>
      <CelulaDaTabela className="[font-family:var(--ds-font-mono)] text-[13px]">{reservas.length ? reservas.join(" / ") : SEM_DADO}</CelulaDaTabela>
      <CelulaDaTabela numero className="whitespace-nowrap">
        {pedido && pedido.valorCentavos !== null ? dinheiro(pedido.valorCentavos) : SEM_DADO}
      </CelulaDaTabela>
      {masterclass && <CelulaDaTabela className="text-[13px]">{pedido?.formaPagamento ?? SEM_DADO}</CelulaDaTabela>}
      <CelulaDaTabela className="text-right">
        {escrita && linha.situacao === "A_PEDIR" && linha.passageiro.pessoaId && (
          <BotaoLink tamanho="pequeno" className="whitespace-nowrap" href={abrir({ novo: "1", evento: linha.evento.id, pessoa: linha.passageiro.pessoaId })} scroll={false}>
            Registrar pedido
          </BotaoLink>
        )}
        {escrita && pedido && aguardandoSdc(pedido.situacao) && (
          <BotaoLink tamanho="pequeno" className="whitespace-nowrap" href={abrir({ ref: pedido.referencia, modo: "registrar" })} scroll={false}>
            Registrar voo
          </BotaoLink>
        )}
        {escrita && pedido && situacaoDoPagamento(pedido) === "A_APROVAR" && (
          <span className="mr-1 inline-flex">
            <BotaoAprovarPagamento acao={aprovarPagamentoAcao} pedidoId={pedido.id} referencia={pedido.referencia} valor={dinheiro(pedido.valorCentavos ?? 0)} valorCentavos={pedido.valorCentavos ?? 0} atualizadoEm={pedido.atualizadoEm} />
          </span>
        )}
        {pedido && !(escrita && aguardandoSdc(pedido.situacao)) && (
          <BotaoLink tamanho="pequeno" className="whitespace-nowrap" href={abrir({ ref: pedido.referencia })} scroll={false}>
            Abrir
          </BotaoLink>
        )}
      </CelulaDaTabela>
    </LinhaDaTabela>
  );
}

/** Onde é a palestra e quando (colunas "Local 1ª palestra" e "Local última palestra" da planilha de Masterclass). */
function CelulaDaPalestra({ evento }: { evento: EventoDaLogistica }) {
  return (
    <CelulaDaTabela className="text-[13px]">
      <span className="block">{localDaPalestra(evento)}</span>
      <span className="block whitespace-nowrap text-[12px] tabular-nums text-[var(--ds-label-2)]">{dataCurta(evento.dataInicio)}</span>
    </CelulaDaTabela>
  );
}

/**
 * Os voos de Masterclass de um mês, como a aba VOOS MASTERCLASS: a viagem é uma turnê (ida para a primeira palestra,
 * volta da última), então no lugar do evento único vêm os dois locais; e a forma de pagamento de cada compra.
 */
function TabelaDeMasterclass({ legenda, linhas, base, parametros, escrita, diasDoAtraso }: { legenda: string; linhas: LinhaDeVoo[]; base: string; parametros: ParametrosDeVoos; escrita: boolean; diasDoAtraso: number }) {
  return (
    <Tabela legenda={legenda} larguraMinima="min-w-[1480px]">
      <CabecaDaTabela>
        <ColunaDaTabela>Passageiro</ColunaDaTabela>
        <ColunaDaTabela>Solicitação</ColunaDaTabela>
        <ColunaDaTabela>Ida/volta</ColunaDaTabela>
        <ColunaDaTabela>Local 1ª palestra</ColunaDaTabela>
        <ColunaDaTabela>Ida</ColunaDaTabela>
        <ColunaDaTabela>Local última palestra</ColunaDaTabela>
        <ColunaDaTabela>Volta</ColunaDaTabela>
        <ColunaDaTabela>Situação</ColunaDaTabela>
        <ColunaDaTabela>Compra</ColunaDaTabela>
        <ColunaDaTabela>Companhia</ColunaDaTabela>
        <ColunaDaTabela>Reserva</ColunaDaTabela>
        <ColunaDaTabela numero>Preço</ColunaDaTabela>
        <ColunaDaTabela>Pagamento</ColunaDaTabela>
        <ColunaDaTabela className="text-right">Ações</ColunaDaTabela>
      </CabecaDaTabela>
      <tbody>
        {linhas.map((linha) => (
          <LinhaDoVoo key={linha.chave} linha={linha} base={base} parametros={parametros} escrita={escrita} diasDoAtraso={diasDoAtraso} masterclass />
        ))}
      </tbody>
    </Tabela>
  );
}

/** A tabela de um evento, com as colunas que o time acompanha na planilha. */
function TabelaDoEvento({ evento, linhas, base, parametros, escrita, diasDoAtraso }: { evento: EventoDaLogistica; linhas: LinhaDeVoo[]; base: string; parametros: ParametrosDeVoos; escrita: boolean; diasDoAtraso: number }) {
  return (
    <Tabela legenda={`Pedidos de voo de ${evento.codigo ?? evento.nome}`} larguraMinima="min-w-[1240px]">
      <CabecaDaTabela>
        <ColunaDaTabela>Passageiro</ColunaDaTabela>
        <ColunaDaTabela>Escala</ColunaDaTabela>
        <ColunaDaTabela>Solicitação</ColunaDaTabela>
        <ColunaDaTabela>Ida/volta</ColunaDaTabela>
        <ColunaDaTabela>Ida</ColunaDaTabela>
        <ColunaDaTabela>Volta</ColunaDaTabela>
        <ColunaDaTabela>Situação</ColunaDaTabela>
        <ColunaDaTabela>Compra</ColunaDaTabela>
        <ColunaDaTabela>Companhia</ColunaDaTabela>
        <ColunaDaTabela>Reserva</ColunaDaTabela>
        <ColunaDaTabela numero>Preço</ColunaDaTabela>
        <ColunaDaTabela className="text-right">Ações</ColunaDaTabela>
      </CabecaDaTabela>
      <tbody>
        {linhas.map((linha) => (
          <LinhaDoVoo key={linha.chave} linha={linha} base={base} parametros={parametros} escrita={escrita} diasDoAtraso={diasDoAtraso} />
        ))}
      </tbody>
    </Tabela>
  );
}

/** Marca ou desmarca "Também precisa de hotel" num pedido de voo que já existe. */
function BotaoHotelDoVoo({ pedidoId, precisaHotel }: { pedidoId: string; precisaHotel: boolean }) {
  const rotulo = precisaHotel ? "Não precisa de hotel" : "Também precisa de hotel";
  return (
    <FormularioDeAcao acao={definirHotelDoVooAcao} aria-label={rotulo}>
      <input type="hidden" name="pedidoId" value={pedidoId} />
      <input type="hidden" name="precisaHotel" value={precisaHotel ? "false" : "true"} />
      <BotaoDeEnvio tamanho="pequeno" variante="texto">
        {precisaHotel ? "Desmarcar" : "Marcar"}
      </BotaoDeEnvio>
    </FormularioDeAcao>
  );
}

function DetalheDoPedido({ pedido, registrado, comHotel = false, escrita = false }: { pedido: PedidoCarregado; registrado: boolean; comHotel?: boolean; escrita?: boolean }) {
  const hospedagemHref = `/logistica/hospedagem?evento=${pedido.evento.id}`;
  return (
    <div className="flex flex-col gap-4 text-[14px]">
      {registrado && (
        <Aviso tom="sucesso" titulo={`Pedido ${pedido.referencia} registrado.`}>
          A SDC ainda não tem portal: copie o pedido e envie pelo canal de sempre.
        </Aviso>
      )}
      {registrado && comHotel && pedido.precisaHotel && (
        <Aviso
          tom="informacao"
          titulo={`${pedido.pessoaNome ?? "A pessoa"} entrou na lista de quem precisa de hotel`}
          acao={
            <Link href={hospedagemHref} className="font-medium text-[var(--ds-tint-text)] hover:underline">
              Montar os quartos
            </Link>
          }
        >
          O hotel é pedido à SDC junto com o voo. Coloque a pessoa num quarto em Hospedagem, mesmo antes de a escala existir.
        </Aviso>
      )}
      {pedido.situacao === "ALTERADO" && <Aviso tom="atencao">O time alterou este pedido depois da emissão. Registre o novo voo quando a SDC responder.</Aviso>}
      {pedido.situacao === "CANCELADO" && (
        <Aviso tom="neutro" titulo={`Cancelado${pedido.canceladoEm ? ` em ${dataEHora(pedido.canceladoEm)}` : ""}`}>
          {pedido.motivoCancelamento}
        </Aviso>
      )}
      <dl className="grid grid-cols-[140px_1fr] gap-x-3 gap-y-2">
        <dt className="text-[var(--ds-label-2)]">Situação</dt>
        <dd className="flex flex-wrap items-center gap-1">
          <ChipDoVoo situacao={pedido.situacao} />
          <ChipDoPagamento pedido={pedido} />
          <QuemRegistrou pedido={pedido} />
        </dd>
        {pedido.aprovadoEm && (
          <>
            <dt className="text-[var(--ds-label-2)]">Pagamento</dt>
            <dd>
              Aprovado em {dataEHora(pedido.aprovadoEm)}
              {pedido.aprovadoPor ? ` por ${pedido.aprovadoPor}` : ""}
              {pedido.observacaoAprovacao ? ` — “${pedido.observacaoAprovacao}”` : ""}
            </dd>
          </>
        )}
        {pedido.tipo === "VOO" && pedido.evento.masterclass ? (
          <>
            <dt className="text-[var(--ds-label-2)]">1ª palestra</dt>
            <dd>{rotuloDaPalestra(pedido.evento)}</dd>
            <dt className="text-[var(--ds-label-2)]">Última palestra</dt>
            <dd>{pedido.eventoDaVolta ? rotuloDaPalestra(pedido.eventoDaVolta) : "A mesma (ida e volta pela mesma palestra)"}</dd>
          </>
        ) : (
          <>
            <dt className="text-[var(--ds-label-2)]">Evento</dt>
            <dd>
              {pedido.evento.codigo ?? pedido.evento.nome} · {periodo(pedido.evento.dataInicio, pedido.evento.dataFim)}
            </dd>
          </>
        )}
        {pedido.pessoaNome && (
          <>
            <dt className="text-[var(--ds-label-2)]">Passageiro</dt>
            <dd>{pedido.pessoaNome}</dd>
          </>
        )}
        {pedido.tipo === "VOO" && (
          <>
            <dt className="text-[var(--ds-label-2)]">Hotel</dt>
            <dd className="flex flex-wrap items-center gap-2">
              {pedido.precisaHotel ? (
                <>
                  Também precisa de hotel
                  <Link href={hospedagemHref} className="text-[13px] font-medium text-[var(--ds-tint-text)] hover:underline">
                    Ver quartos
                  </Link>
                </>
              ) : (
                "Não precisa de hotel por este pedido"
              )}
              {escrita && pedido.situacao !== "CANCELADO" && <BotaoHotelDoVoo pedidoId={pedido.id} precisaHotel={pedido.precisaHotel} />}
            </dd>
          </>
        )}
        <dt className="text-[var(--ds-label-2)]">Solicitado em</dt>
        <dd>
          {dataCurta(pedido.dataSolicitacao)}
          <span className="block text-[12px] text-[var(--ds-label-2)]">lançado no sistema em {dataEHora(pedido.solicitadoEm)}</span>
        </dd>
        {pedido.dataCompra && (
          <>
            <dt className="text-[var(--ds-label-2)]">Comprado em</dt>
            <dd>
              {dataCurta(pedido.dataCompra)}
              {pedido.emitidoEm && <span className="block text-[12px] text-[var(--ds-label-2)]">lançado no sistema em {dataEHora(pedido.emitidoEm)}</span>}
            </dd>
          </>
        )}
        {pedido.valorCentavos !== null && (
          <>
            <dt className="text-[var(--ds-label-2)]">Valor</dt>
            <dd className="tabular-nums">{dinheiro(pedido.valorCentavos)}</dd>
          </>
        )}
        {pedido.formaPagamento && (
          <>
            <dt className="text-[var(--ds-label-2)]">Forma de pagamento</dt>
            <dd>{pedido.formaPagamento}</dd>
          </>
        )}
        {pedido.observacaoTime && (
          <>
            <dt className="text-[var(--ds-label-2)]">O que a IAM pediu</dt>
            <dd>{pedido.observacaoTime}</dd>
          </>
        )}
        {pedido.observacaoSdc && (
          <>
            <dt className="text-[var(--ds-label-2)]">Resposta da SDC</dt>
            <dd>{pedido.observacaoSdc}</dd>
          </>
        )}
      </dl>
      {pedido.trechos.map((trecho) => (
        <section key={trecho.sentido} aria-label={`Trecho de ${rotuloDoSentido(trecho.sentido)}`} className="rounded-[var(--ds-radius-md)] border border-[var(--ds-separator)] p-4">
          <h3 className="text-[15px] font-semibold">
            {trecho.sentido === "IDA" ? "Ida" : "Volta"}: {cidadesDoTrecho(trecho) ?? aeroportosDoTrecho(trecho) ?? "—"}
          </h3>
          <p className="mt-1 text-[13px] text-[var(--ds-label-2)]">
            Desejado em {dataCurta(trecho.dataDesejada)}
            {trecho.preferenciaHorario ? `, ${rotuloDaPreferencia(trecho.preferenciaHorario)}` : ""}
          </p>
          {/* Com as cidades no título, os aeroportos (quando a SDC já informou) vêm numa linha própria. */}
          {cidadesDoTrecho(trecho) && aeroportosDoTrecho(trecho) && (
            <p className="mt-1 text-[13px] text-[var(--ds-label-2)]">
              Aeroportos: <span className="[font-family:var(--ds-font-mono)] text-[var(--ds-label)]">{aeroportosDoTrecho(trecho)}</span>
            </p>
          )}
          {cidadesDoTrecho(trecho) && !aeroportosDoTrecho(trecho) && pedido.situacao !== "CANCELADO" && (
            <p className="mt-1 text-[13px] text-[var(--ds-label-2)]">{aguardandoSdc(pedido.situacao) ? "Aeroporto a definir pela SDC." : "A SDC não informou o aeroporto."}</p>
          )}
          <p className="mt-1">{textoDoVoo(trecho) ?? "Voo ainda não informado pela SDC."}</p>
          {trecho.cartaoEmbarqueUrl && (
            <a href={trecho.cartaoEmbarqueUrl} target="_blank" rel="noreferrer noopener" className="mt-1 inline-block text-[13px] font-medium text-[var(--ds-tint-text)] hover:underline">
              Ver cartão de embarque
            </a>
          )}
        </section>
      ))}
    </div>
  );
}

function PainelDoPedido({
  pedido,
  base,
  parametros,
  escrita,
  hoje,
  cidadeDaPessoa,
}: {
  pedido: PedidoCarregado;
  base: string;
  parametros: ParametrosDeVoos;
  escrita: boolean;
  hoje: string;
  /** A cidade do cadastro do passageiro, para sugerir a origem ao alterar um pedido antigo (que não tem cidade). */
  cidadeDaPessoa: string | null;
}) {
  const fechar = enderecoCom(base, parametros, { ref: null, modo: null, registrado: null, hotel: null });
  const voltar = enderecoCom(base, parametros, { modo: null, registrado: null, hotel: null });
  const subtitulo = [pedido.pessoaNome ?? "Hospedagem", pedido.evento.codigo ?? pedido.evento.nome].join(" · ");
  const modo = escrita ? parametros.modo : undefined;

  // Pedido de hospedagem tem a sua tela: é lá que se registra a reserva (com o hotel que a SDC escolheu) e se cancela.
  if (pedido.tipo === "HOSPEDAGEM") {
    return (
      <PainelPelaUrl
        titulo={`Pedido ${pedido.referencia}`}
        subtitulo={subtitulo}
        aoFecharIrPara={fechar}
        rodape={
          <BotaoLink variante="primario" href={`/logistica/hospedagem?evento=${pedido.evento.id}`}>
            Abrir na Hospedagem
          </BotaoLink>
        }
      >
        <DetalheDoPedido pedido={pedido} registrado={false} />
      </PainelPelaUrl>
    );
  }

  // Registrar a compra (aguardando a SDC) ou corrigir a que já foi registrada (EMITIDO): se o pagamento já estava
  // aprovado, a aprovação cai e o pedido volta para "a aprovar".
  if (modo === "registrar" && pedido.situacao !== "CANCELADO") {
    return (
      <PainelPelaUrl titulo={`Registrar voo · ${pedido.referencia}`} subtitulo={subtitulo} aoFecharIrPara={fechar}>
        <FormularioRegistrarVoo
          acao={registrarRetornoDeVooAcao}
          pedidoId={pedido.id}
          valorInicial={paraCampoDeDinheiro(pedido.valorCentavos)}
          aoConcluirIrPara={voltar}
          formaPagamento={pedido.formaPagamento ?? ""}
          // Corrigindo a compra, a data já registrada; senão, hoje (o pedido nunca é de depois de hoje).
          dataCompra={pedido.situacao === "EMITIDO" && pedido.dataCompra ? pedido.dataCompra : hoje}
          dataSolicitacao={pedido.dataSolicitacao}
          hoje={hoje}
          trechos={pedido.trechos.map((trecho) => ({
            sentido: trecho.sentido,
            rotulo: `${trecho.sentido === "IDA" ? "Ida" : "Volta"}: ${cidadesDoTrecho(trecho) ?? aeroportosDoTrecho(trecho) ?? "—"} em ${dataCurta(trecho.dataDesejada)}`,
            partidaSugerida: `${trecho.dataDesejada}T08:00`,
            companhia: trecho.companhia ?? "",
            numeroVoo: trecho.numeroVoo ?? "",
            localizador: trecho.localizador ?? "",
            partidaEm: paraCampoDeDataEHora(trecho.partidaEm),
            chegadaEm: paraCampoDeDataEHora(trecho.chegadaEm),
            origemIata: trecho.origemIata ?? "",
            destinoIata: trecho.destinoIata ?? "",
            cartaoEmbarqueUrl: trecho.cartaoEmbarqueUrl ?? "",
          }))}
        />
      </PainelPelaUrl>
    );
  }

  if (modo === "alterar" && pedido.situacao !== "CANCELADO") {
    return (
      <PainelPelaUrl titulo={`Alterar pedido · ${pedido.referencia}`} subtitulo={subtitulo} aoFecharIrPara={fechar}>
        <FormularioAlterarPedido
          acao={alterarPedidoAcao}
          pedidoId={pedido.id}
          atualizadoEm={pedido.atualizadoEm}
          inicial={trechosIniciais(pedido, cidadeDaPessoa)}
          observacaoTime={pedido.observacaoTime}
          aoConcluirIrPara={voltar}
        />
      </PainelPelaUrl>
    );
  }

  const ativo = pedido.situacao !== "CANCELADO";
  return (
    <PainelPelaUrl
      titulo={`Pedido ${pedido.referencia}`}
      subtitulo={subtitulo}
      aoFecharIrPara={fechar}
      rodape={
        <div className="flex w-full flex-wrap justify-between gap-2">
          <div className="flex flex-wrap gap-2">
            {pedido.textoParaSdc && <BotaoCopiar texto={pedido.textoParaSdc} rotulo="Copiar pedido" mensagem={`Pedido ${pedido.referencia} copiado. Cole no canal da SDC.`} />}
            {escrita && ativo && <BotaoCancelarPedido acao={cancelarPedidoAcao} pedidoId={pedido.id} referencia={pedido.referencia} aoConcluirIrPara={voltar} />}
          </div>
          <div className="flex flex-wrap gap-2">
            {escrita && ativo && (
              <BotaoLink href={enderecoCom(base, parametros, { modo: "alterar", registrado: null, hotel: null })} scroll={false}>
                Alterar pedido
              </BotaoLink>
            )}
            {escrita && pedido.situacao === "EMITIDO" && (
              <BotaoLink href={enderecoCom(base, parametros, { modo: "registrar", registrado: null, hotel: null })} scroll={false}>
                Corrigir compra
              </BotaoLink>
            )}
            {escrita && situacaoDoPagamento(pedido) === "APROVADO" && <BotaoDesfazerAprovacao acao={desfazerAprovacaoAcao} pedidoId={pedido.id} referencia={pedido.referencia} tamanho="normal" />}
            {escrita && situacaoDoPagamento(pedido) === "A_APROVAR" && (
              <BotaoAprovarPagamento acao={aprovarPagamentoAcao} pedidoId={pedido.id} referencia={pedido.referencia} valor={dinheiro(pedido.valorCentavos ?? 0)} valorCentavos={pedido.valorCentavos ?? 0} atualizadoEm={pedido.atualizadoEm} tamanho="normal" />
            )}
            {escrita && aguardandoSdc(pedido.situacao) && (
              <BotaoLink variante="primario" href={enderecoCom(base, parametros, { modo: "registrar", registrado: null, hotel: null })} scroll={false}>
                Registrar voo
              </BotaoLink>
            )}
          </div>
        </div>
      }
    >
      <DetalheDoPedido pedido={pedido} registrado={parametros.registrado === "1"} comHotel={parametros.hotel === "1"} escrita={escrita} />
    </PainelPelaUrl>
  );
}

/** Botão de "este evento não precisa de voo" e do desfazer. */
function BotaoSemVoo({ eventoId, dispensar, rotulo, descricao }: { eventoId: string; dispensar: boolean; rotulo: string; descricao: string }) {
  return (
    <FormularioDeAcao acao={dispensarLogisticaDoEventoAcao} aria-label={descricao}>
      <input type="hidden" name="eventoId" value={eventoId} />
      <input type="hidden" name="item" value="VOO" />
      <input type="hidden" name="dispensar" value={dispensar ? "true" : "false"} />
      <BotaoDeEnvio tamanho="pequeno" variante="texto" aria-label={descricao}>
        {rotulo}
      </BotaoDeEnvio>
    </FormularioDeAcao>
  );
}

/**
 * Aviso de voos (só na tela, para a líder e o time), por evento: os que entraram no prazo configurado em
 * Configurações › Aviso de voos e ainda não têm nenhum pedido. Como a maioria dos eventos (os de casa) não tem voo,
 * cada linha traz "Não precisa de voo", que tira o evento do aviso.
 */
function AvisoDeCompra({ aviso, base, parametros, escrita }: { aviso: VoosCarregados["avisoDeCompra"]; base: string; parametros: ParametrosDeVoos; escrita: boolean }) {
  if (aviso.eventos.length === 0) return null;
  const limpo = { ref: null, modo: null, pessoa: null, registrado: null, hotel: null, situacao: null };
  return (
    <Aviso tom="atencao" className="mb-4" titulo={aviso.eventos.length === 1 ? "1 evento no prazo ainda sem pedido de voo" : `${aviso.eventos.length} eventos no prazo ainda sem pedido de voo`}>
      <ul className="mt-1 flex flex-col gap-1">
        {aviso.eventos.map((evento) => (
          <li key={evento.eventoId} className="flex flex-wrap items-center gap-x-3 gap-y-1">
            <span>
              <span className="font-medium">
                {evento.codigo ?? evento.nome} · {dataCurta(evento.dataInicio)}
              </span>{" "}
              <span className="tabular-nums">
                {textoDosDiasQueFaltam(evento.dias)}
                {evento.janela === "ATRASADO" && <span className="text-[var(--ds-orange-deep)]"> · atrasado</span>}
                {evento.marcadasComoAviao > 0 && ` · ${evento.marcadasComoAviao === 1 ? "1 pessoa marcada" : `${evento.marcadasComoAviao} pessoas marcadas`} como Avião na escala`}
              </span>
            </span>
            {escrita && (
              <span className="flex flex-wrap items-center gap-1">
                <BotaoLink tamanho="pequeno" href={enderecoCom(base, parametros, { ...limpo, novo: "1", evento: evento.eventoId })} scroll={false}>
                  Pedir voo
                </BotaoLink>
                <BotaoSemVoo eventoId={evento.eventoId} dispensar rotulo="Não precisa de voo" descricao={`${evento.codigo ?? evento.nome} não precisa de voo`} />
              </span>
            )}
          </li>
        ))}
      </ul>
      <p className="mt-2 text-[12px] text-[var(--ds-label-2)]">
        O aviso começa {aviso.diasDoAviso} dias antes do evento e conta como atrasado a partir de {aviso.diasDoAtraso} dias. Eventos do polo Americana e os marcados como &quot;não precisa de voo&quot; ficam fora do aviso; o pedido continua liberado para eles.{" "}
        <Link href="/configuracoes/voos" className="font-medium text-[var(--ds-tint-text)] hover:underline">
          Configurações
        </Link>
      </p>
    </Aviso>
  );
}

const SITUACOES_VALIDAS = ["A_PEDIR", "PEDIDO", "EMITIDO", "ALTERADO", "CANCELADO"] as const;

export function situacaoDoFiltro(valor: string | undefined) {
  return SITUACOES_VALIDAS.find((situacao) => situacao === valor);
}

/** Voos (SDC): usada em /logistica/voos (todos os eventos, por mês) e, filtrada, em /eventos/[id]/logistica. */
export function SecaoDeVoos({
  dados,
  pedido,
  base,
  parametros,
  escrita,
  comSeletorDeEvento,
}: {
  dados: VoosCarregados;
  pedido: PedidoCarregado | null;
  base: string;
  parametros: ParametrosDeVoos;
  escrita: boolean;
  comSeletorDeEvento: boolean;
}) {
  const { contagens, eventoDoFiltro } = dados;
  const limpo = { ref: null, modo: null, pessoa: null, registrado: null, hotel: null };
  const novoHref = enderecoCom(base, parametros, { ...limpo, novo: "1" });
  const diasDoAtraso = dados.avisoDeCompra.diasDoAtraso;
  // Na aba do evento o formulário já sabe o evento; na tela geral vale o do filtro (ou o do atalho que abriu o painel).
  // (Na aba de uma Masterclass, as outras palestras também vão, para escolher a última da turnê.)
  const eventosDoFormulario = comSeletorDeEvento
    ? dados.eventos
    : eventoDoFiltro
      ? [eventoDoFiltro, ...(eventoDoFiltro.masterclass ? dados.eventos.filter((evento) => evento.masterclass && evento.id !== eventoDoFiltro.id) : [])]
      : [];
  const masterclass = dados.recorte === "MASTERCLASS";
  const eventosDoRecorte = dados.eventos.filter((evento) => evento.masterclass === masterclass);
  const semPedidoAtivo = eventoDoFiltro !== null && !dados.pedidosAtivos.some((item) => item.eventoId === eventoDoFiltro.id);
  const noAviso = eventoDoFiltro !== null && dados.avisoDeCompra.eventos.some((item) => item.eventoId === eventoDoFiltro.id);

  return (
    <section aria-labelledby="titulo-voos" className="mb-8">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
        <h2 id="titulo-voos" className={TITULO_DE_SECAO}>
          Voos (SDC)
        </h2>
        {escrita && (
          <BotaoLink variante="primario" href={novoHref} scroll={false} icone={<Plus size={18} aria-hidden />}>
            Novo pedido
          </BotaoLink>
        )}
      </div>
      {!escrita && <FaixaSomenteLeitura />}
      {comSeletorDeEvento && (
        <AtalhosDoRecorte
          recorte={dados.recorte}
          quantidades={dados.linhasPorRecorte}
          // Trocar de recorte tira o evento escolhido (ele é do outro lado) e fecha o que estiver aberto.
          href={(recorte) => enderecoCom(base, parametros, { ...limpo, novo: null, evento: null, situacao: null, recorte: recorte === "MASTERCLASS" ? "masterclass" : null })}
        />
      )}
      <AvisoDeCompra aviso={dados.avisoDeCompra} base={base} parametros={parametros} escrita={escrita} />
      {dados.hotelSemQuarto.length > 0 && (
        <Aviso
          tom="informacao"
          className="mb-4"
          titulo={(() => {
            const total = dados.hotelSemQuarto.reduce((soma, item) => soma + item.pessoas, 0);
            return total === 1 ? "1 pessoa com voo pedido e sem quarto" : `${total} pessoas com voo pedido e sem quarto`;
          })()}
        >
          <p>Quem voa e também precisa de hotel já está na lista da Hospedagem. Monte os quartos para pedir o hotel à SDC junto com o voo.</p>
          <ul className="mt-1 flex flex-col gap-1">
            {dados.hotelSemQuarto.map(({ evento, pessoas }) => (
              <li key={evento.id}>
                <Link href={`/logistica/hospedagem?evento=${evento.id}`} className="font-medium text-[var(--ds-tint-text)] hover:underline">
                  {evento.codigo ?? evento.nome} · {dataCurta(evento.dataInicio)}
                </Link>{" "}
                · {pessoas === 1 ? "1 pessoa sem quarto" : `${pessoas} pessoas sem quarto`}
              </li>
            ))}
          </ul>
        </Aviso>
      )}
      <TotaisDoPagamentoNaTela totais={dados.totais} />
      <BarraDeFiltros resultado={dados.total === 1 ? "1 linha" : `${dados.total} linhas`}>
        {comSeletorDeEvento && (
          <SeletorDeFiltro
            nome="evento"
            rotulo={masterclass ? "Palestra" : "Evento"}
            todos={masterclass ? "Próximas palestras" : "Próximos eventos"}
            busca
            valor={parametros.evento ?? null}
            opcoes={[...(eventoDoFiltro && !eventosDoRecorte.some((evento) => evento.id === eventoDoFiltro.id) ? [eventoDoFiltro] : []), ...eventosDoRecorte].map((evento) => ({
              valor: evento.id,
              rotulo: masterclass ? rotuloDaPalestra(evento) : `${evento.codigo ?? evento.nome} · ${dataCurta(evento.dataInicio)}`,
            }))}
          />
        )}
        <AtalhosDeFiltro
          nome="situacao"
          rotulo="Situação dos voos"
          opcoes={[
            { valor: "A_PEDIR", rotulo: "A pedir", quantidade: contagens.A_PEDIR },
            { valor: "PEDIDO", rotulo: "Pedido à SDC", quantidade: contagens.PEDIDO },
            { valor: "EMITIDO", rotulo: "Emitidos", quantidade: contagens.EMITIDO },
            { valor: "ALTERADO", rotulo: "Alterados", quantidade: contagens.ALTERADO },
            { valor: "CANCELADO", rotulo: "Cancelados", quantidade: contagens.CANCELADO },
            { valor: null, rotulo: "Todos" },
          ]}
        />
      </BarraDeFiltros>

      {dados.total === 0 ? (
        <Cartao espacamento="nenhum">
          <EstadoVazio
            icone={<Plane size={32} aria-hidden />}
            titulo={
              parametros.situacao
                ? "Nenhum voo com esse filtro."
                : eventoDoFiltro
                  ? "Nenhum pedido de voo para este evento."
                  : masterclass
                    ? "Nenhum pedido de voo de Masterclass nas próximas palestras."
                    : "Nenhum pedido de voo nos próximos eventos."
            }
            acao={
              escrita && (
                <BotaoLink href={novoHref} scroll={false}>
                  Novo pedido
                </BotaoLink>
              )
            }
          >
            Peça as passagens por aqui, como na planilha: escolha o evento e a pessoa do staff, mesmo antes de montar a escala. A SDC compra e o time registra o voo.
          </EstadoVazio>
        </Cartao>
      ) : (
        dados.grupos.map((mes) => (
          <div key={mes.mes} className="mb-6">
            {comSeletorDeEvento && <h3 className={`${TITULO_DE_SECAO} mb-3`}>{rotuloDoMes(mes.mes)}</h3>}
            {/* Masterclass: uma tabela por mês (a planilha tem poucas linhas por mês), pela data da primeira palestra. */}
            {masterclass && (
              <TabelaDeMasterclass
                legenda={`Voos de Masterclass de ${rotuloDoMes(mes.mes)}`}
                linhas={mes.eventos.flatMap((grupo) => grupo.linhas)}
                base={base}
                parametros={parametros}
                escrita={escrita}
                diasDoAtraso={diasDoAtraso}
              />
            )}
            {(masterclass ? [] : mes.eventos).map(({ evento, linhas }) => (
              <section key={evento.id} aria-labelledby={comSeletorDeEvento ? `voos-do-evento-${evento.id}` : undefined} className="mb-4">
                {comSeletorDeEvento && (
                  <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                    <h4 id={`voos-do-evento-${evento.id}`} className={TITULO_DE_CARTAO}>
                      {rotuloDoEvento(evento)}
                    </h4>
                    <span className="flex flex-wrap items-center gap-2 text-[13px] text-[var(--ds-label-2)]">
                      {linhas.length === 1 ? "1 linha" : `${linhas.length} linhas`}
                      {escrita && (
                        <BotaoLink tamanho="pequeno" variante="texto" href={enderecoCom(base, parametros, { ...limpo, novo: "1", evento: evento.id })} scroll={false}>
                          Novo pedido neste evento
                        </BotaoLink>
                      )}
                    </span>
                  </div>
                )}
                <TabelaDoEvento evento={evento} linhas={linhas} base={base} parametros={parametros} escrita={escrita} diasDoAtraso={diasDoAtraso} />
              </section>
            ))}
          </div>
        ))
      )}

      {/* Evento escolhido, ainda fora do aviso (longe do prazo) e sem pedido: dá para adiantar o "não precisa de voo". */}
      {escrita && eventoDoFiltro && !eventoDoFiltro.semVoo && semPedidoAtivo && !noAviso && (
        <div className="mb-4 flex flex-wrap items-center gap-2 text-[13px] text-[var(--ds-label-2)]">
          Este evento não vai ter passagem?
          <BotaoSemVoo eventoId={eventoDoFiltro.id} dispensar rotulo="Marcar que não precisa de voo" descricao={`${eventoDoFiltro.codigo ?? eventoDoFiltro.nome} não precisa de voo`} />
        </div>
      )}

      {dados.semVoo.length > 0 && (
        <Cartao
          id="sem-voo"
          titulo={`Marcados como sem voo · ${dados.semVoo.length}`}
          explicacao="O time marcou que estes eventos não precisam de voo: eles não entram no aviso. Registrar um pedido para o evento também desfaz a marca."
          className="mb-4"
        >
          <ul className="flex flex-col gap-1 text-[14px]">
            {dados.semVoo.map((evento) => (
              <li key={evento.id} className="flex flex-wrap items-center justify-between gap-2">
                <span>{rotuloDoEvento(evento)}</span>
                {escrita && <BotaoSemVoo eventoId={evento.id} dispensar={false} rotulo="Desfazer" descricao={`Desfazer: ${evento.codigo ?? evento.nome} volta a contar no aviso de voos`} />}
              </li>
            ))}
          </ul>
        </Cartao>
      )}

      {escrita && parametros.novo === "1" && (
        <PainelPelaUrl titulo="Novo pedido de voo" subtitulo="Registre o pedido e envie para a SDC pelo canal de sempre. Ela compra; o time registra o voo depois." aoFecharIrPara={enderecoCom(base, parametros, { novo: null, pessoa: null })}>
          <FormularioNovoPedido
            // Os atalhos ("Pedir voo", "Registrar pedido") trocam o evento e a pessoa com o painel aberto.
            key={`${eventoDoFiltro?.id ?? ""}|${parametros.pessoa ?? ""}`}
            acao={registrarPedidoDeVooAcao}
            destino={base}
            eventoFixo={!comSeletorDeEvento}
            eventoInicial={eventoDoFiltro?.id}
            pessoaInicial={parametros.pessoa}
            recorteInicial={dados.recorte}
            hoje={dados.hoje}
            eventos={eventosDoFormulario.map((evento) => ({
              id: evento.id,
              rotulo: rotuloNoSeletor(evento),
              dataInicio: evento.dataInicio,
              dataFim: evento.dataFim,
              masterclass: evento.masterclass,
              cidade: cidadeComUf(evento.cidade, evento.uf) ?? "",
            }))}
            pessoas={dados.staff}
            pedidosAtivos={dados.pedidosAtivos.map((item) => ({ ...item, trajeto: item.trajeto ? rotuloDoTrajeto(item.trajeto).toLowerCase() : null }))}
          />
        </PainelPelaUrl>
      )}
      {parametros.ref && pedido && (
        <PainelDoPedido
          pedido={pedido}
          base={base}
          parametros={parametros}
          escrita={escrita}
          hoje={dados.hoje}
          cidadeDaPessoa={dados.staff.find((pessoa) => pessoa.pessoaId === pedido.pessoaId)?.cidade ?? null}
        />
      )}
      {parametros.ref && !pedido && (
        <PainelPelaUrl titulo="Pedido não encontrado" aoFecharIrPara={enderecoCom(base, parametros, { ref: null, modo: null })}>
          <Aviso tom="atencao">Não encontramos o pedido {parametros.ref}. Ele pode ter outra referência.</Aviso>
        </PainelPelaUrl>
      )}
    </section>
  );
}
