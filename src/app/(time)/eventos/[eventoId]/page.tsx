import { Circle, CircleCheck, CircleDot, TriangleAlert } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";
import type { ReactNode } from "react";

import { situacaoDaEscrita } from "@/fluxos/_base";
import { carregarResumoDoEvento } from "@/fluxos/eventos";
import type { Etapa, SituacaoDaEtapa } from "@/modules/escala";

import { Aviso } from "../../_componentes/ui/aviso";
import { BotaoLink } from "../../_componentes/ui/botao-link";
import { Cartao } from "../../_componentes/ui/cartao";
import { EstadoVazio, SomenteLeitura } from "../../_componentes/ui/estados";
import { dataEHora, periodo } from "../../_componentes/ui/formatos";
import { CabecaDaTabela, CelulaDaTabela, ColunaDaTabela, LinhaDaTabela, Tabela } from "../../_componentes/ui/tabela";
import { PublicoEFila } from "./_componentes/resumo-publico-e-fila";
import { salvarDadosDoEvento } from "./acoes";

export const dynamic = "force-dynamic";

const STATUS_DO_EVENTO = { PLANEJADO: "Planejado", EM_ANDAMENTO: "Em andamento", CONCLUIDO: "Concluído", CANCELADO: "Cancelado" } as const;

function IconeDaEtapa({ situacao }: { situacao: SituacaoDaEtapa }) {
  switch (situacao) {
    case "FEITA":
      return <CircleCheck size={18} aria-hidden className="text-[var(--ds-green-deep)]" />;
    case "EM_ANDAMENTO":
      return <CircleDot size={18} aria-hidden className="text-[var(--ds-tint-text)]" />;
    case "PENDENCIA":
      return <TriangleAlert size={18} aria-hidden className="text-[var(--ds-orange-deep)]" />;
    case "NAO_COMECOU":
      return <Circle size={18} aria-hidden className="text-[var(--ds-label-2)]" />;
    default: {
      const desconhecida: never = situacao;
      throw new Error(`situação de etapa desconhecida: ${String(desconhecida)}`);
    }
  }
}

function textoDaSituacao(situacao: SituacaoDaEtapa): string {
  switch (situacao) {
    case "FEITA":
      return "concluída";
    case "EM_ANDAMENTO":
      return "em andamento";
    case "PENDENCIA":
      return "com pendência";
    case "NAO_COMECOU":
      return "não começou";
    default: {
      const desconhecida: never = situacao;
      throw new Error(`situação de etapa desconhecida: ${String(desconhecida)}`);
    }
  }
}

function hrefDaEtapa(eventoId: string, etapa: Etapa): string {
  switch (etapa.chave) {
    case "vagas":
    case "escala":
    case "aprovacao":
      return `/eventos/${eventoId}/escala`;
    case "comunicacao":
      return `/eventos/${eventoId}/comunicacao`;
    case "logistica":
      return `/eventos/${eventoId}/logistica`;
    case "custos":
      return `/eventos/${eventoId}/custos`;
    default: {
      const desconhecida: never = etapa.chave;
      throw new Error(`etapa desconhecida: ${String(desconhecida)}`);
    }
  }
}

function Dado({ rotulo, children }: { rotulo: string; children: ReactNode }) {
  return (
    <div>
      <dt className="text-[12px] text-[var(--ds-label-2)]">{rotulo}</dt>
      <dd className="text-[14px]">{children}</dd>
    </div>
  );
}

export default async function PaginaResumoDoEvento({ params }: { params: Promise<{ eventoId: string }> }) {
  const { eventoId } = await params;
  const [resumo, escrita] = await Promise.all([carregarResumoDoEvento(eventoId), situacaoDaEscrita()]);
  if (!resumo) notFound();
  const { evento, vagas, andamento, proximoPasso } = resumo;
  const editavel = escrita.liberada && evento.status !== "CANCELADO";

  return (
    <div className="grid gap-3 lg:grid-cols-3">
      <Cartao
        id="andamento"
        titulo="Andamento"
        className="lg:col-span-3"
        acoes={
          <BotaoLink variante="primario" href={`/eventos/${evento.id}/${proximoPasso.aba}`}>
            {proximoPasso.rotulo}
          </BotaoLink>
        }
      >
        <ol className="grid gap-3 sm:grid-cols-3 lg:grid-cols-6">
          {andamento.map((etapa) => {
            const conteudo = (
              <>
                <span className="flex items-center gap-2 font-medium">
                  <IconeDaEtapa situacao={etapa.situacao} />
                  {etapa.nome}
                  <span className="sr-only">: {textoDaSituacao(etapa.situacao)}</span>
                </span>
                <span className="mt-0.5 block text-[12px] text-[var(--ds-label-2)]">{etapa.detalhe}</span>
              </>
            );
            return (
              <li key={etapa.chave} className="text-[14px]">
                {etapa.situacao === "PENDENCIA" ? (
                  <Link href={hrefDaEtapa(evento.id, etapa)} className="block hover:underline">
                    {conteudo}
                  </Link>
                ) : (
                  conteudo
                )}
              </li>
            );
          })}
        </ol>
      </Cartao>

      {vagas.sugestoesMudadas.length > 0 && (
        <Aviso
          tom="atencao"
          className="lg:col-span-3"
          acao={
            <Link href={`/eventos/${evento.id}/escala`} className="font-medium text-[var(--ds-tint-text)] hover:underline">
              Revisar vagas
            </Link>
          }
        >
          A sugestão de vagas mudou:{" "}
          {vagas.sugestoesMudadas.map((item) => `${item.nomeDaFuncao} agora é ${item.sugerido} (confirmado ${item.confirmado})`).join("; ")}. Revise
          em Escala.
        </Aviso>
      )}

      <Cartao
        id="dados-da-turma"
        titulo="Dados da turma"
        className="lg:col-span-2"
        explicacao={
          <SomenteLeitura
            origem={`Vem do IAM Control. Atualiza a cada 30 minutos${evento.sincronizadoEm ? ` (última: ${dataEHora(evento.sincronizadoEm)})` : ""}.`}
          />
        }
      >
        <dl className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Dado rotulo="Tipo">{evento.tipoNome ?? "Não informado"}</Dado>
          <Dado rotulo="Edição">{evento.edicao ?? "Não informada"}</Dado>
          <Dado rotulo="Código">{evento.codigo ?? "Sem código"}</Dado>
          <Dado rotulo="Polo">{evento.poloNome ? `${evento.poloNome}${evento.poloCodigo ? ` (${evento.poloCodigo})` : ""}` : "Não informado"}</Dado>
          <Dado rotulo="Datas">{periodo(evento.dataInicio, evento.dataFim)}</Dado>
          <Dado rotulo="Local">{evento.local ? `${evento.local.nome} · ${evento.local.cidade} (${evento.local.uf})` : "A definir"}</Dado>
          <Dado rotulo="Situação no IAM Control">{STATUS_DO_EVENTO[evento.status]}</Dado>
          <Dado rotulo="Turma no IAM Control">{evento.iamControlTurmaId ?? "Sem vínculo"}</Dado>
        </dl>
      </Cartao>

      <Cartao id="publico-e-fila" titulo={resumo.usaFila ? "Público e fila" : "Público"}>
        <PublicoEFila
          acao={salvarDadosDoEvento}
          eventoId={evento.id}
          atualizadoEm={evento.atualizadoEm}
          expectativaPublico={evento.expectativaPublico}
          pessoasNaFila={evento.pessoasNaFila}
          usaFila={resumo.usaFila}
          editavel={editavel}
        />
      </Cartao>

      <div className="lg:col-span-3">
        <h2 className="mb-2 text-[17px] font-semibold tracking-[-0.01em]">Vagas sugeridas</h2>
        {vagas.semRegra && vagas.linhas.length === 0 ? (
          <Cartao espacamento="nenhum">
            <EstadoVazio
              titulo="Este tipo de evento ainda não tem regra de vagas."
              acao={
                <BotaoLink href="/configuracoes/vagas" variante="texto">
                  Criar a regra em Configurações
                </BotaoLink>
              }
            >
              Monte a escala digitando o número de cada função ou crie a regra em Configurações.
            </EstadoVazio>
          </Cartao>
        ) : (
          <Tabela
            legenda="Vagas sugeridas pela regra, número confirmado e vagas preenchidas por função"
            larguraMinima="min-w-[640px]"
            rodape={
              <div className="border-t border-[var(--ds-separator)] px-4 py-3">
                <Link href={`/eventos/${evento.id}/escala`} className="text-[14px] font-medium text-[var(--ds-tint-text)] hover:underline">
                  Abrir escala
                </Link>
              </div>
            }
          >
            <CabecaDaTabela>
              <ColunaDaTabela>Função</ColunaDaTabela>
              <ColunaDaTabela numero>Sugerido</ColunaDaTabela>
              <ColunaDaTabela numero>Confirmado</ColunaDaTabela>
              <ColunaDaTabela numero>Preenchidas</ColunaDaTabela>
            </CabecaDaTabela>
            <tbody>
              {vagas.linhas.map((linha) => (
                <LinhaDaTabela key={linha.id}>
                  <CelulaDaTabela cabecalhoDaLinha>{linha.nomeDaFuncao}</CelulaDaTabela>
                  <CelulaDaTabela numero>{linha.digitada ? "sem sugestão" : (linha.sugerido ?? "—")}</CelulaDaTabela>
                  <CelulaDaTabela numero>{linha.confirmada ? linha.quantidade : "não confirmado"}</CelulaDaTabela>
                  <CelulaDaTabela numero>
                    {Math.min(linha.ativas, linha.quantidade)} de {linha.quantidade}
                  </CelulaDaTabela>
                </LinhaDaTabela>
              ))}
              {vagas.pendencias.map((pendencia) => (
                <LinhaDaTabela key={pendencia.funcao}>
                  <CelulaDaTabela cabecalhoDaLinha>{pendencia.nomeDaFuncao}</CelulaDaTabela>
                  <CelulaDaTabela numero colSpan={3}>
                    {pendencia.motivo === "DIGITAR"
                      ? "Definido em cada evento: digite o número em Escala"
                      : pendencia.motivo === "FALTA_FILA"
                        ? "Falta informar as pessoas na fila"
                        : "Falta informar a expectativa de público"}
                  </CelulaDaTabela>
                </LinhaDaTabela>
              ))}
            </tbody>
          </Tabela>
        )}
      </div>
    </div>
  );
}
