import { Plane, Plus } from "lucide-react";
import Link from "next/link";

import type { LinhaDeVoo, PedidoCarregado, VoosCarregados } from "@/fluxos/logistica";
import { aguardandoSdc, rotuloDaPreferencia, rotuloDoSentido, type TrechoDoPedido } from "@/modules/logistica";
import { BotaoCopiar, PainelPelaUrl } from "@/app/(time)/_componentes/ui";

import { Aviso, FaixaSomenteLeitura } from "../../_componentes/ui/aviso";
import { AtalhosDeFiltro, BarraDeFiltros, SeletorDeFiltro } from "../../_componentes/ui/barra-de-filtros";
import { BotaoLink } from "../../_componentes/ui/botao-link";
import { Cartao } from "../../_componentes/ui/cartao";
import { EstadoVazio } from "../../_componentes/ui/estados";
import { dataCurta, dataEHora, dinheiro, hora } from "../../_componentes/ui/formatos";
import { SeloRegistradoPeloTime } from "../../_componentes/ui/selo";
import { CabecaDaTabela, CelulaDaTabela, ColunaDaTabela, LinhaDaTabela, Tabela } from "../../_componentes/ui/tabela";
import { TITULO_DE_SECAO } from "../../_componentes/ui/classes";
import {
  alterarPedidoAcao,
  cancelarPedidoAcao,
  registrarPedidoDeVooAcao,
  registrarRetornoDeHospedagemAcao,
  registrarRetornoDeVooAcao,
} from "../acoes";
import { BotaoCancelarPedido, FormularioAlterarPedido, FormularioNovoPedido, FormularioRegistrarVoo, type TrechosIniciais } from "./formularios-de-voo";
import { FormularioRegistrarReserva } from "./formularios-de-hospedagem";
import { ChipDoVoo, enderecoCom, paraCampoDeDataEHora, paraCampoDeDinheiro } from "./situacoes";

export type ParametrosDeVoos = { evento?: string; situacao?: string; ref?: string; modo?: string; novo?: string; convocacao?: string; registrado?: string };

function textoDoTrecho(trecho: TrechoDoPedido): string {
  return `${trecho.origemIata} → ${trecho.destinoIata} · ${rotuloDoSentido(trecho.sentido)}`;
}

function textoDoVoo(trecho: TrechoDoPedido): string | null {
  if (!trecho.companhia || !trecho.numeroVoo) return null;
  const horario = trecho.partidaEm && trecho.chegadaEm ? ` · ${dataCurta(trecho.partidaEm)} ${hora(trecho.partidaEm)}–${hora(trecho.chegadaEm)}` : "";
  return `${trecho.companhia} ${trecho.numeroVoo}${horario}${trecho.localizador ? ` · localizador ${trecho.localizador}` : ""}`;
}

function trechosIniciais(trechos: TrechoDoPedido[]): TrechosIniciais {
  const ida = trechos.find((trecho) => trecho.sentido === "IDA");
  const volta = trechos.find((trecho) => trecho.sentido === "VOLTA");
  return {
    origemIata: ida?.origemIata ?? volta?.destinoIata ?? "",
    destinoIata: ida?.destinoIata ?? volta?.origemIata ?? "",
    ida: ida ? { data: ida.dataDesejada, preferencia: ida.preferenciaHorario ?? "" } : null,
    volta: volta ? { data: volta.dataDesejada, preferencia: volta.preferenciaHorario ?? "" } : null,
  };
}

function LinhaDoVoo({
  linha,
  base,
  parametros,
  escrita,
  mostrarEvento,
}: {
  linha: LinhaDeVoo;
  base: string;
  parametros: ParametrosDeVoos;
  escrita: boolean;
  mostrarEvento: boolean;
}) {
  const faltam = linha.situacao === "A_PEDIR" && linha.janela.janela !== "FORA_DA_JANELA" ? `faltam ${linha.janela.dias} dias` : null;
  const pedido = linha.pedido;
  const trechos = pedido?.trechos ?? [];
  const abrir = (mudancas: Record<string, string | null>) => enderecoCom(base, parametros, { ref: null, modo: null, novo: null, convocacao: null, registrado: null, ...mudancas });
  return (
    <LinhaDaTabela>
      <CelulaDaTabela>
        {pedido ? (
          <Link
            href={abrir({ ref: pedido.referencia })}
            scroll={false}
            className="whitespace-nowrap [font-family:var(--ds-font-mono)] text-[13px] font-medium text-[var(--ds-tint-text)] hover:underline"
          >
            {pedido.referencia}
          </Link>
        ) : (
          <span className="text-[var(--ds-label-2)]">—</span>
        )}
      </CelulaDaTabela>
      {mostrarEvento && (
        <CelulaDaTabela>
          <span className="whitespace-nowrap [font-family:var(--ds-font-mono)] text-[13px]">{linha.evento.codigo ?? linha.evento.nome}</span>
          <span className="block whitespace-nowrap text-[12px] text-[var(--ds-label-2)]">{faltam ?? dataCurta(linha.evento.dataInicio)}</span>
        </CelulaDaTabela>
      )}
      <CelulaDaTabela>{linha.passageiro.nome}</CelulaDaTabela>
      <CelulaDaTabela>
        {trechos.length ? trechos.map((trecho) => <span key={trecho.sentido} className="block whitespace-nowrap">{textoDoTrecho(trecho)}</span>) : <span className="text-[var(--ds-label-2)]">—</span>}
      </CelulaDaTabela>
      <CelulaDaTabela>
        {trechos.length ? trechos.map((trecho) => <span key={trecho.sentido} className="block tabular-nums">{dataCurta(trecho.dataDesejada)}</span>) : "—"}
      </CelulaDaTabela>
      <CelulaDaTabela className="text-[13px]">
        {trechos.some(textoDoVoo) ? trechos.map((trecho) => <span key={trecho.sentido} className="block">{textoDoVoo(trecho) ?? "—"}</span>) : "—"}
      </CelulaDaTabela>
      <CelulaDaTabela>
        <span className="flex flex-wrap items-center gap-1">
          <ChipDoVoo situacao={linha.situacao} />
          {pedido?.retornoRegistradoPor && <SeloRegistradoPeloTime em={pedido.emitidoEm} por={pedido.retornoRegistradoPor} />}
        </span>
        {linha.situacao === "A_PEDIR" && linha.janela.janela === "ATRASADO" && <span className="mt-1 block text-[12px] font-medium text-[var(--ds-red-deep)]">Atrasado (menos de 60 dias)</span>}
        {!mostrarEvento && faltam && <span className="mt-1 block text-[12px] text-[var(--ds-label-2)]">{faltam}</span>}
      </CelulaDaTabela>
      <CelulaDaTabela className="text-right">
        {escrita && linha.situacao === "A_PEDIR" && linha.passageiro.convocacaoId && (
          <BotaoLink tamanho="pequeno" className="whitespace-nowrap" href={abrir({ novo: "1", convocacao: linha.passageiro.convocacaoId })} scroll={false}>
            Registrar pedido
          </BotaoLink>
        )}
        {escrita && pedido && aguardandoSdc(pedido.situacao) && (
          <BotaoLink tamanho="pequeno" className="whitespace-nowrap" href={abrir({ ref: pedido.referencia, modo: "registrar" })} scroll={false}>
            Registrar voo
          </BotaoLink>
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

function DetalheDoPedido({ pedido, registrado }: { pedido: PedidoCarregado; registrado: boolean }) {
  return (
    <div className="flex flex-col gap-4 text-[14px]">
      {registrado && (
        <Aviso tom="sucesso" titulo={`Pedido ${pedido.referencia} registrado.`}>
          A SDC ainda não tem portal: copie o pedido e envie pelo canal de sempre.
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
          {pedido.retornoRegistradoPor && <SeloRegistradoPeloTime em={pedido.emitidoEm} por={pedido.retornoRegistradoPor} />}
        </dd>
        <dt className="text-[var(--ds-label-2)]">Evento</dt>
        <dd>
          {pedido.evento.codigo ?? pedido.evento.nome} · {dataCurta(pedido.evento.dataInicio)}
        </dd>
        {pedido.pessoaNome && (
          <>
            <dt className="text-[var(--ds-label-2)]">Passageiro</dt>
            <dd>{pedido.pessoaNome}</dd>
          </>
        )}
        <dt className="text-[var(--ds-label-2)]">Pedido em</dt>
        <dd>{dataEHora(pedido.solicitadoEm)}</dd>
        {pedido.valorCentavos !== null && (
          <>
            <dt className="text-[var(--ds-label-2)]">Valor</dt>
            <dd className="tabular-nums">{dinheiro(pedido.valorCentavos)}</dd>
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
            {trecho.sentido === "IDA" ? "Ida" : "Volta"}: {trecho.origemIata} → {trecho.destinoIata}
          </h3>
          <p className="mt-1 text-[13px] text-[var(--ds-label-2)]">
            Desejado em {dataCurta(trecho.dataDesejada)}
            {trecho.preferenciaHorario ? `, ${rotuloDaPreferencia(trecho.preferenciaHorario)}` : ""}
          </p>
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

function PainelDoPedido({ pedido, base, parametros, escrita }: { pedido: PedidoCarregado; base: string; parametros: ParametrosDeVoos; escrita: boolean }) {
  const fechar = enderecoCom(base, parametros, { ref: null, modo: null, registrado: null });
  const voltar = enderecoCom(base, parametros, { modo: null, registrado: null });
  const subtitulo = [pedido.pessoaNome ?? "Hospedagem", pedido.evento.codigo ?? pedido.evento.nome].join(" · ");
  const modo = escrita ? parametros.modo : undefined;

  if (modo === "registrar" && aguardandoSdc(pedido.situacao)) {
    return (
      <PainelPelaUrl titulo={pedido.tipo === "VOO" ? `Registrar voo · ${pedido.referencia}` : `Registrar reserva · ${pedido.referencia}`} subtitulo={subtitulo} aoFecharIrPara={fechar}>
        {pedido.tipo === "VOO" ? (
          <FormularioRegistrarVoo
            acao={registrarRetornoDeVooAcao}
            pedidoId={pedido.id}
            valorInicial={paraCampoDeDinheiro(pedido.valorCentavos)}
            aoConcluirIrPara={voltar}
            trechos={pedido.trechos.map((trecho) => ({
              sentido: trecho.sentido,
              rotulo: `${trecho.sentido === "IDA" ? "Ida" : "Volta"}: ${trecho.origemIata} → ${trecho.destinoIata} em ${dataCurta(trecho.dataDesejada)}`,
              partidaSugerida: `${trecho.dataDesejada}T08:00`,
              companhia: trecho.companhia ?? "",
              numeroVoo: trecho.numeroVoo ?? "",
              localizador: trecho.localizador ?? "",
              partidaEm: paraCampoDeDataEHora(trecho.partidaEm),
              chegadaEm: paraCampoDeDataEHora(trecho.chegadaEm),
              cartaoEmbarqueUrl: trecho.cartaoEmbarqueUrl ?? "",
            }))}
          />
        ) : (
          <FormularioRegistrarReserva acao={registrarRetornoDeHospedagemAcao} pedidoId={pedido.id} valorInicial={paraCampoDeDinheiro(pedido.valorCentavos)} aoConcluirIrPara={voltar} />
        )}
      </PainelPelaUrl>
    );
  }

  if (modo === "alterar" && pedido.situacao !== "CANCELADO" && pedido.tipo === "VOO") {
    return (
      <PainelPelaUrl titulo={`Alterar pedido · ${pedido.referencia}`} subtitulo={subtitulo} aoFecharIrPara={fechar}>
        <FormularioAlterarPedido
          acao={alterarPedidoAcao}
          pedidoId={pedido.id}
          atualizadoEm={pedido.atualizadoEm}
          inicial={trechosIniciais(pedido.trechos)}
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
            {escrita && ativo && pedido.tipo === "VOO" && (
              <BotaoLink href={enderecoCom(base, parametros, { modo: "alterar", registrado: null })} scroll={false}>
                Alterar pedido
              </BotaoLink>
            )}
            {escrita && aguardandoSdc(pedido.situacao) && (
              <BotaoLink variante="primario" href={enderecoCom(base, parametros, { modo: "registrar", registrado: null })} scroll={false}>
                {pedido.tipo === "VOO" ? "Registrar voo" : "Registrar reserva"}
              </BotaoLink>
            )}
          </div>
        </div>
      }
    >
      <DetalheDoPedido pedido={pedido} registrado={parametros.registrado === "1"} />
    </PainelPelaUrl>
  );
}

const SITUACOES_VALIDAS = ["A_PEDIR", "PEDIDO", "EMITIDO", "ALTERADO", "CANCELADO"] as const;

export function situacaoDoFiltro(valor: string | undefined) {
  return SITUACOES_VALIDAS.find((situacao) => situacao === valor);
}

/** Voos (SDC): usada em /logistica/voos e, filtrada, em /eventos/[id]/logistica. */
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
  const { contagens } = dados;
  const novoHref = enderecoCom(base, parametros, { novo: "1", ref: null, modo: null, convocacao: null });
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
      {dados.aPedirNaJanela > 0 && (
        <Aviso
          tom="atencao"
          className="mb-4"
          acao={
            <Link href={enderecoCom(base, parametros, { situacao: "A_PEDIR" })} className="font-medium text-[var(--ds-tint-text)] hover:underline">
              Ver quem falta
            </Link>
          }
        >
          {dados.aPedirNaJanela === 1
            ? "1 pessoa vai de avião para evento em menos de 90 dias e ainda não tem pedido."
            : `${dados.aPedirNaJanela} pessoas vão de avião para eventos em menos de 90 dias e ainda não têm pedido.`}
        </Aviso>
      )}
      <BarraDeFiltros resultado={`${dados.linhas.length} linhas`}>
        {comSeletorDeEvento && (
          <SeletorDeFiltro
            nome="evento"
            rotulo="Evento"
            todos="Próximos eventos"
            valor={parametros.evento ?? null}
            opcoes={dados.eventos.map((evento) => ({ valor: evento.id, rotulo: `${evento.codigo ?? evento.nome} · ${dataCurta(evento.dataInicio)}` }))}
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
      {dados.linhas.length === 0 ? (
        <Cartao espacamento="nenhum">
          <EstadoVazio icone={<Plane size={32} aria-hidden />} titulo={parametros.situacao ? "Nenhum voo com esse filtro." : "Ninguém vai de avião nos próximos eventos."}>
            Quem vai de avião aparece aqui quando o deslocamento for marcado como Avião na escala.
          </EstadoVazio>
        </Cartao>
      ) : (
        <Tabela legenda="Pedidos de voo à SDC e pessoas a pedir">
          <CabecaDaTabela>
            <ColunaDaTabela>Referência</ColunaDaTabela>
            {comSeletorDeEvento && <ColunaDaTabela>Evento</ColunaDaTabela>}
            <ColunaDaTabela>Passageiro</ColunaDaTabela>
            <ColunaDaTabela>Trecho</ColunaDaTabela>
            <ColunaDaTabela>Data desejada</ColunaDaTabela>
            <ColunaDaTabela>Voo</ColunaDaTabela>
            <ColunaDaTabela>Situação</ColunaDaTabela>
            <ColunaDaTabela className="text-right">Ações</ColunaDaTabela>
          </CabecaDaTabela>
          <tbody>
            {dados.linhas.map((linha) => (
              <LinhaDoVoo key={linha.chave} linha={linha} base={base} parametros={parametros} escrita={escrita} mostrarEvento={comSeletorDeEvento} />
            ))}
          </tbody>
        </Tabela>
      )}

      {escrita && parametros.novo === "1" && (
        <PainelPelaUrl titulo="Novo pedido de voo" subtitulo="Registre o pedido e envie para a SDC pelo canal de sempre." aoFecharIrPara={enderecoCom(base, parametros, { novo: null, convocacao: null })}>
          <FormularioNovoPedido
            acao={registrarPedidoDeVooAcao}
            destino={base}
            convocacaoInicial={parametros.convocacao}
            passageiros={dados.semPedido.map((passageiro) => ({
              convocacaoId: passageiro.convocacaoId,
              rotulo: `${passageiro.pessoaNome} · ${passageiro.evento.codigo ?? passageiro.evento.nome} (${dataCurta(passageiro.evento.dataInicio)})`,
              dataInicio: passageiro.evento.dataInicio,
              dataFim: passageiro.evento.dataFim,
            }))}
          />
        </PainelPelaUrl>
      )}
      {parametros.ref && pedido && <PainelDoPedido pedido={pedido} base={base} parametros={parametros} escrita={escrita} />}
      {parametros.ref && !pedido && (
        <PainelPelaUrl titulo="Pedido não encontrado" aoFecharIrPara={enderecoCom(base, parametros, { ref: null, modo: null })}>
          <Aviso tom="atencao">Não encontramos o pedido {parametros.ref}. Ele pode ter outra referência.</Aviso>
        </PainelPelaUrl>
      )}
    </section>
  );
}
