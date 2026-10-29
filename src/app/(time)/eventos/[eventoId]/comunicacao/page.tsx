import { MessageSquareOff, Send } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import {
  type AtalhoDeFiltro,
  AtalhosDeFiltro,
  Aviso,
  BotaoLink,
  Cartao,
  EstadoVazio,
  FaixaSomenteLeitura,
} from "@/app/(time)/_componentes/ui";
import { carregarComunicacaoDoEvento } from "@/fluxos/comunicacao";
import { rotuloDoTipoDeModelo, type SituacaoDaCopy, type TipoDeModelo, TIPOS_DE_MODELO } from "@/modules/comunicacao";

import { ComunicacaoDoEvento } from "./_componentes/comunicacao-do-evento";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Comunicação" };

type Parametros = {
  params: Promise<{ eventoId: string }>;
  searchParams: Promise<{ modelo?: string; pessoa?: string; situacao?: string }>;
};

const FILTROS: { valor: string; situacao: SituacaoDaCopy; rotulo: string }[] = [
  { valor: "pronta", situacao: "PRONTA", rotulo: "Prontas" },
  { valor: "falta-dado", situacao: "FALTA_DADO", rotulo: "Falta dado" },
  { valor: "desatualizada", situacao: "DESATUALIZADA", rotulo: "Desatualizadas" },
  { valor: "enviada", situacao: "ENVIADA", rotulo: "Enviadas" },
];

function lerTipo(valor: string | undefined): TipoDeModelo {
  return TIPOS_DE_MODELO.find((tipo) => tipo === valor) ?? "ESCALACAO";
}

export default async function PaginaComunicacaoDoEvento({ params, searchParams }: Parametros) {
  const [{ eventoId }, busca] = await Promise.all([params, searchParams]);
  const tipo = lerTipo(busca.modelo);
  const dados = await carregarComunicacaoDoEvento(eventoId, tipo, new Date());
  if (!dados) notFound();

  if (!dados.escalaComunicavel) {
    return (
      <Cartao espacamento="nenhum">
        <EstadoVazio
          icone={<MessageSquareOff size={32} aria-hidden />}
          titulo="A escala deste evento ainda não foi aprovada."
          nivel="h2"
          acao={<BotaoLink href={`/eventos/${eventoId}/escala`}>Ir para a escala</BotaoLink>}
        >
          As copys são geradas depois da aprovação.
        </EstadoVazio>
      </Cartao>
    );
  }

  const filtro = FILTROS.find((opcao) => opcao.valor === busca.situacao) ?? null;
  const visiveis = filtro ? dados.pessoas.filter((pessoa) => pessoa.situacao === filtro.situacao) : dados.pessoas;
  const atalhos: AtalhoDeFiltro[] = [
    { valor: null, rotulo: "Todas", quantidade: dados.pessoas.length },
    ...FILTROS.map((opcao) => ({ valor: opcao.valor, rotulo: opcao.rotulo, quantidade: dados.contagem[opcao.situacao] })),
  ];
  const todasEnviadas = dados.pessoas.length > 0 && dados.contagem.ENVIADA === dados.pessoas.length;

  return (
    <>
      {!dados.escritaLiberada && <FaixaSomenteLeitura />}

      {dados.tiposDisponiveis.length > 1 && (
        <div className="mb-4 flex flex-wrap items-center gap-2">
          <span aria-hidden className="text-[13px] text-[var(--ds-label-2)]">
            Copy de
          </span>
          <AtalhosDeFiltro
            nome="modelo"
            rotulo="Copy de"
            estilo="segmentado"
            opcoes={dados.tiposDisponiveis.map((outro) => ({ valor: outro === "ESCALACAO" ? null : outro, rotulo: rotuloDoTipoDeModelo(outro) }))}
          />
        </div>
      )}

      {!dados.modelo ? (
        <Aviso
          tom="atencao"
          titulo={`Não há modelo de ${rotuloDoTipoDeModelo(tipo).toLowerCase()} ativo.`}
          acao={
            <Link href="/configuracoes/modelos-de-copy" className="text-[14px] font-medium text-[var(--ds-tint-text)] hover:underline">
              Ir para Modelos de copy
            </Link>
          }
        >
          Ative ou crie um modelo em Configurações para gerar as copys.
        </Aviso>
      ) : dados.pessoas.length === 0 ? (
        <Cartao espacamento="nenhum">
          <EstadoVazio titulo="Ninguém na escala para comunicar." nivel="h2" acao={<BotaoLink href={`/eventos/${eventoId}/escala`}>Ir para a escala</BotaoLink>}>
            As copys aparecem aqui para cada pessoa ativa na escala.
          </EstadoVazio>
        </Cartao>
      ) : (
        <>
          {todasEnviadas && tipo === "ESCALACAO" && (
            <Aviso tom="sucesso" className="mb-3" icone={<Send size={18} aria-hidden className="mt-0.5 shrink-0 text-[var(--ds-green-deep)]" />}>
              Todas as copys deste evento foram enviadas.
              {dados.evento.statusEscala === "COMUNICADA" ? " A escala está comunicada." : ""}
            </Aviso>
          )}
          {dados.contagem.FALTA_DADO > 0 && (
            <Aviso tom="atencao" className="mb-3">
              {dados.contagem.FALTA_DADO === 1
                ? "1 copy está bloqueada por falta de dado."
                : `${dados.contagem.FALTA_DADO} copys estão bloqueadas por falta de dado.`}{" "}
              Elas liberam sozinhas quando o dado for preenchido.
            </Aviso>
          )}
          <div className="mb-3">
            <AtalhosDeFiltro nome="situacao" rotulo="Situação das copys" opcoes={atalhos} />
          </div>
          {visiveis.length === 0 ? (
            <Cartao espacamento="nenhum">
              <EstadoVazio
                titulo="Nenhuma copy com essa situação."
                nivel="h2"
                acao={<BotaoLink href={`/eventos/${eventoId}/comunicacao${tipo === "ESCALACAO" ? "" : `?modelo=${tipo}`}`}>Ver todas</BotaoLink>}
              />
            </Cartao>
          ) : (
            <ComunicacaoDoEvento
              key={`${tipo}-${filtro?.valor ?? "todas"}`}
              pessoas={visiveis}
              modelo={dados.modelo}
              rotuloDoModelo={rotuloDoTipoDeModelo(tipo)}
              escritaLiberada={dados.escritaLiberada}
              selecionadaInicial={visiveis.some((pessoa) => pessoa.convocacaoId === busca.pessoa) ? busca.pessoa! : null}
            />
          )}
        </>
      )}
    </>
  );
}
