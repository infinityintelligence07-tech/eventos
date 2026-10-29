import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { situacaoDaEscrita } from "@/fluxos/_base";
import { permissoesDoAtor } from "@/app/(time)/_servidor/usuario-atual";
import { carregarMontagem, type MontagemDaEscala, sugerirPessoas } from "@/fluxos/escalas";

import { Aviso, FaixaSomenteLeitura } from "../../../_componentes/ui/aviso";
import { Cartao } from "../../../_componentes/ui/cartao";
import { TITULO_DE_SECAO } from "../../../_componentes/ui/classes";
import { EstadoVazio } from "../../../_componentes/ui/estados";
import { dataCurta, dataEHora, periodo } from "../../../_componentes/ui/formatos";
import { AdicionarFuncao } from "./_componentes/adicionar-funcao";
import { BarraDaEscala, type SituacaoDaBarra } from "./_componentes/barra-da-escala";
import { EquipeDaFuncao } from "./_componentes/equipe-da-funcao";
import { PainelDeResposta } from "./_componentes/painel-de-resposta";
import { PainelDeSugestoes } from "./_componentes/painel-de-sugestoes";
import { VagasPorFuncao } from "./_componentes/vagas-por-funcao";
import { exigirAtor } from "@/app/(time)/_servidor/usuario-atual";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Escala" };

type Parametros = { params: Promise<{ eventoId: string }>; searchParams: Promise<{ vaga?: string; responder?: string }> };

const ROTULO_DO_HISTORICO: Record<string, string> = {
  ENVIADA_APROVACAO: "Enviada para aprovação",
  APROVADA: "Aprovada",
  DEVOLVIDA: "Devolvida",
  REABERTA: "Reaberta",
  COMUNICADA: "Comunicada",
};

function situacaoDaBarra(
  montagem: MontagemDaEscala,
  escreve: boolean,
  permissoes: { aprovar: boolean; reabrir: boolean },
): SituacaoDaBarra {
  if (!escreve || montagem.encerrado) return { tipo: "SO_LEITURA" };
  const status = montagem.evento.statusEscala;
  switch (status) {
    case "RASCUNHO":
    case "DEVOLVIDA": {
      const { envio } = montagem.resumo;
      return {
        tipo: "MONTANDO",
        statusEsperado: status,
        pode: envio.pode,
        motivos: envio.pode ? [] : envio.motivos,
        vagasAbertas: montagem.resumo.vagasAbertas,
      };
    }
    case "AGUARDANDO_APROVACAO":
      return { tipo: "COM_A_LIDER", podeAprovar: permissoes.aprovar };
    case "APROVADA":
    case "COMUNICADA":
      return { tipo: "APROVADA", statusEsperado: status, podeReabrir: permissoes.reabrir };
    case "SEM_ESCALA":
      return { tipo: "SO_LEITURA" };
    default: {
      const desconhecido: never = status;
      throw new Error(`status de escala desconhecido: ${String(desconhecido)}`);
    }
  }
}

function resumoDaBarra(montagem: MontagemDaEscala): string {
  const { resumo } = montagem;
  const partes = [`${resumo.preenchidas} de ${resumo.vagas} vagas preenchidas`];
  const semConfirmar = montagem.linhas.filter((linha) => !linha.confirmada).length + resumo.pendencias.length;
  if (semConfirmar > 0) partes.push(semConfirmar === 1 ? "1 função sem número confirmado" : `${semConfirmar} funções sem número confirmado`);
  return partes.join(" · ");
}

export default async function PaginaEscalaDoEvento({ params, searchParams }: Parametros) {
  await exigirAtor();
  const [{ eventoId }, { vaga, responder }] = await Promise.all([params, searchParams]);
  const [montagem, escrita, permissoes] = await Promise.all([
    carregarMontagem(eventoId),
    situacaoDaEscrita(),
    permissoesDoAtor("escala.aprovar", "escala.reabrir"),
  ]);
  if (!montagem) notFound();

  const { evento, resumo } = montagem;
  const caminho = `/eventos/${evento.id}/escala`;
  const escreve = escrita.liberada;
  const editavel = escreve && montagem.editavel;
  const sugestoes = editavel && vaga ? await sugerirPessoas(evento.id, vaga, new Date()) : null;
  const convocacaoParaResponder =
    escreve && montagem.aceitaResposta && responder
      ? montagem.linhas.flatMap((linha) => linha.convocacoes).find((convocacao) => convocacao.id === responder && convocacao.status !== "SUGERIDA")
      : undefined;
  const varios = montagem.dias.length > 1;
  const codigo = evento.codigo ?? evento.nome;

  return (
    <>
      {!escreve && <FaixaSomenteLeitura />}
      <div className="mb-5 grid gap-3">
        {evento.status === "CONCLUIDO" && <Aviso tom="neutro">Evento concluído: a escala fica só para consulta.</Aviso>}
        {montagem.ultimaDevolucao && (
          <Aviso tom="informacao" titulo={`A líder devolveu esta escala em ${dataEHora(montagem.ultimaDevolucao.em)}.`}>
            {montagem.ultimaDevolucao.comentario ? `“${montagem.ultimaDevolucao.comentario}”` : "Sem comentário."}
          </Aviso>
        )}
        {montagem.aguardandoAprovacao && (
          <Aviso
            tom="informacao"
            acao={
              <Link href="/escalas/aprovacao" className="font-medium text-[var(--ds-tint-text)] hover:underline">
                Ver na fila
              </Link>
            }
          >
            Esta escala está com a líder para aprovação. Ela fica travada até ser aprovada ou devolvida.
          </Aviso>
        )}
        {(evento.statusEscala === "APROVADA" || evento.statusEscala === "COMUNICADA") && evento.aprovadoEm && (
          <Aviso tom="informacao">
            Escala aprovada em {dataEHora(evento.aprovadoEm)}
            {evento.aprovadoPor ? ` por ${evento.aprovadoPor}` : ""}. Para trocar pessoas ou vagas, reabra a escala e envie para aprovação de novo.
          </Aviso>
        )}
        {resumo.pendencias.some((pendencia) => pendencia.motivo === "FALTA_FILA") && (
          <Aviso
            tom="atencao"
            acao={
              <Link href={`/eventos/${evento.id}#fila`} className="font-medium text-[var(--ds-tint-text)] hover:underline">
                Informar fila
              </Link>
            }
          >
            Falta o número de pessoas na fila. Sem ele, as vagas de pai e mãe não são sugeridas.
          </Aviso>
        )}
        {resumo.pendencias.some((pendencia) => pendencia.motivo === "FALTA_PUBLICO") && (
          <Aviso
            tom="atencao"
            acao={
              <Link href={`/eventos/${evento.id}`} className="font-medium text-[var(--ds-tint-text)] hover:underline">
                Informar público
              </Link>
            }
          >
            Falta a expectativa de público. Sem ela, as vagas de líderes não são sugeridas.
          </Aviso>
        )}
        {resumo.sugestoesMudadas.length > 0 && montagem.editavel && (
          <Aviso tom="atencao">
            A sugestão de vagas mudou:{" "}
            {resumo.sugestoesMudadas.map((item) => `${item.nomeDaFuncao} agora é ${item.sugerido} (confirmado ${item.confirmado})`).join("; ")}. Ajuste e
            confirme de novo se quiser seguir a sugestão.
          </Aviso>
        )}
        {resumo.regraInvalida && (
          <Aviso tom="perigo" titulo="A regra de vagas deste tipo de evento tem erro.">
            {resumo.regraInvalida.join("; ")}. Corrija em Configurações › Vagas.
          </Aviso>
        )}
      </div>

      <section aria-labelledby="vagas-por-funcao" className="mb-6">
        <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
          <h2 id="vagas-por-funcao" className={TITULO_DE_SECAO}>
            Vagas por função
          </h2>
        </div>
        <Cartao espacamento="nenhum" className="py-2">
          {montagem.linhas.length === 0 && resumo.pendencias.length === 0 ? (
            <EstadoVazio
              titulo="Este evento ainda não tem vagas."
              acao={editavel ? <AdicionarFuncao eventoId={evento.id} funcoes={montagem.funcoes} dias={montagem.dias} primaria /> : undefined}
            >
              {resumo.semRegra ? "Este tipo de evento ainda não tem regra de vagas. " : ""}Adicione as funções e o número de vagas para começar.
            </EstadoVazio>
          ) : (
            <>
              <div className="px-4 pt-2">
                <VagasPorFuncao
                  eventoId={evento.id}
                  editavel={editavel}
                  digitadas={resumo.pendencias.filter((pendencia) => pendencia.motivo === "DIGITAR")}
                  linhas={montagem.linhas.map((linha) => ({
                    id: linha.id,
                    nomeDaFuncao: linha.nomeDaFuncao,
                    data: linha.data,
                    horaInicio: linha.horaInicio,
                    horaFim: linha.horaFim,
                    quantidade: linha.quantidade,
                    origem: linha.origem,
                    confirmada: linha.confirmada,
                    ativas: linha.ativas,
                    sugerido: linha.sugerido,
                    digitada: linha.digitada,
                    explicacao: linha.funcao ? (montagem.explicacoes[linha.funcao] ?? null) : null,
                  }))}
                />
              </div>
              {editavel && (
                <div className="border-t border-[var(--ds-separator)] px-4 pt-2">
                  <AdicionarFuncao eventoId={evento.id} funcoes={montagem.funcoes} dias={montagem.dias} />
                </div>
              )}
            </>
          )}
        </Cartao>
      </section>

      {montagem.linhas.length > 0 && (
        <section aria-labelledby="equipe" className="mb-6">
          <h2 id="equipe" className={`${TITULO_DE_SECAO} mb-2`}>
            Equipe
          </h2>
          <div className="grid gap-3">
            {montagem.linhas.map((linha) => (
              <EquipeDaFuncao
                key={linha.id}
                eventoId={evento.id}
                escalaId={linha.id}
                titulo={varios ? `${linha.nomeDaFuncao} · ${dataCurta(linha.data)}` : linha.nomeDaFuncao}
                quantidade={linha.quantidade}
                ativas={linha.ativas}
                pessoas={linha.convocacoes}
                editavel={editavel}
                aceitaResposta={escreve && montagem.aceitaResposta}
                deslocamentoEditavel={escreve && !montagem.encerrado && !montagem.aguardandoAprovacao}
                caminho={caminho}
              />
            ))}
          </div>
        </section>
      )}

      {montagem.aguardandoAprovacao && montagem.pontosDeAtencao.length > 0 && (
        <Cartao id="atencao" titulo="Pontos de atenção para a aprovação" className="mb-6">
          <ul className="list-disc pl-5 text-[14px]">
            {montagem.pontosDeAtencao.map((ponto) => (
              <li key={ponto.texto}>{ponto.texto}</li>
            ))}
          </ul>
        </Cartao>
      )}

      {montagem.historico.length > 0 && (
        <Cartao id="historico" titulo="Histórico da escala">
          <ol className="grid gap-1 text-[13px]">
            {montagem.historico.map((registro) => (
              <li key={`${registro.acao}-${registro.criadoEm.toISOString()}`}>
                <span className="font-medium">{ROTULO_DO_HISTORICO[registro.acao] ?? registro.acao}</span> em {dataEHora(registro.criadoEm)}
                {registro.usuario ? ` por ${registro.usuario}` : ""}
                {registro.comentario ? ` — “${registro.comentario}”` : ""}
              </li>
            ))}
          </ol>
        </Cartao>
      )}

      <BarraDaEscala eventoId={evento.id} codigo={codigo} resumo={resumoDaBarra(montagem)} situacao={situacaoDaBarra(montagem, escreve, { aprovar: permissoes["escala.aprovar"], reabrir: permissoes["escala.reabrir"] })} />

      {sugestoes && <PainelDeSugestoes eventoId={evento.id} sugestoes={sugestoes} periodoDoEvento={periodo(evento.dataInicio, evento.dataFim)} caminho={caminho} />}
      {convocacaoParaResponder && (
        <PainelDeResposta
          eventoId={evento.id}
          convocacaoId={convocacaoParaResponder.id}
          nome={convocacaoParaResponder.nome}
          respostaAtual={convocacaoParaResponder.status === "ACEITA" || convocacaoParaResponder.status === "RECUSADA" ? convocacaoParaResponder.status : null}
          caminho={caminho}
        />
      )}
    </>
  );
}
