import { Check, Inbox, Minus, X } from "lucide-react";
import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { AtalhosDeFiltro, Aviso, BarraDeFiltros, BotaoCopiar, BotaoLink, BuscaDeFiltro, CabecalhoDaPagina, CARTAO, Cartao, EstadoVazio, FaixaSomenteLeitura, Migalha, SeletorDeFiltro, SeloRegistradoPeloTime } from "@/app/(time)/_componentes/ui";
import { CabecaDaTabela, CelulaDaTabela, ColunaDaTabela, LinhaDaTabela, Tabela } from "@/app/(time)/_componentes/ui/tabela";
import { situacaoDaEscrita } from "@/fluxos/_base";
import { carregarEnquete } from "@/fluxos/disponibilidade";
import { diaEHora, type EventoDaEnquete, periodoCurto, type Resposta, RESPOSTAS, rotuloDaResposta } from "@/modules/disponibilidade";

import { ChipDaEnquete } from "../_componentes/chip-da-enquete";
import { AcoesDaEnquete } from "./_componentes/acoes-da-enquete";
import { PainelDeResposta } from "./_componentes/painel-de-resposta";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Respostas da enquete" };

type Parametros = { busca?: string; polo?: string; funcao?: string; respostas?: string; registrar?: string; criada?: string };

const FILTROS = ["busca", "polo", "funcao", "respostas"] as const;

function endereco(base: string, parametros: Parametros, mudancas: Partial<Record<keyof Parametros, string | null>>): string {
  const proximos = new URLSearchParams();
  for (const [nome, valor] of Object.entries({ ...parametros, ...mudancas })) {
    if (typeof valor === "string" && valor) proximos.set(nome, valor);
  }
  const texto = proximos.toString();
  return texto ? `${base}?${texto}` : base;
}

function nomeDoEvento(evento: EventoDaEnquete): string {
  return evento.codigo ?? evento.nome;
}

function CelulaDaResposta({ resposta }: { resposta: Resposta }) {
  switch (resposta) {
    case "PODE":
      return (
        <span className="inline-flex items-center gap-1 font-medium text-[var(--ds-green-deep)]">
          <Check size={14} aria-hidden />
          {rotuloDaResposta(resposta)}
        </span>
      );
    case "NAO_PODE":
      return (
        <span className="inline-flex items-center gap-1 font-medium text-[var(--ds-red-deep)]">
          <X size={14} aria-hidden />
          {rotuloDaResposta(resposta)}
        </span>
      );
    case "SEM_RESPOSTA":
      return (
        <span className="inline-flex items-center gap-1 text-[var(--ds-label-2)]">
          <Minus size={14} aria-hidden />
          <span className="sr-only">{rotuloDaResposta(resposta)}</span>
        </span>
      );
    default: {
      const desconhecida: never = resposta;
      throw new Error(`resposta desconhecida: ${String(desconhecida)}`);
    }
  }
}

export default async function PaginaEnquete({ params, searchParams }: { params: Promise<{ enqueteId: string }>; searchParams: Promise<Parametros> }) {
  const [{ enqueteId }, parametros] = await Promise.all([params, searchParams]);
  const agora = new Date();
  const [enquete, escrita] = await Promise.all([
    carregarEnquete(
      enqueteId,
      { busca: parametros.busca, polo: parametros.polo, funcao: parametros.funcao, soSemResposta: parametros.respostas === "sem-resposta" },
      agora,
    ),
    situacaoDaEscrita(),
  ]);
  if (!enquete) notFound();

  const base = `/disponibilidade/${enquete.id}`;
  const semCriada = { ...parametros, criada: undefined };
  const comFiltro = FILTROS.some((nome) => parametros[nome]);
  const somenteLeitura = !escrita.liberada;
  const registrar = !somenteLeitura && parametros.registrar ? parametros.registrar : null;
  const pessoaInicial = registrar && enquete.pessoas.some((pessoa) => pessoa.pessoaId === registrar) ? registrar : null;
  const totalPorEvento = new Map(enquete.totais.map((total) => [total.eventoId, total]));
  const botaoCopiar = (
    <BotaoCopiar texto={enquete.convite} mensagem="Convite copiado. Cole no grupo do staff.">
      Copiar convite
    </BotaoCopiar>
  );

  return (
    <>
      <CabecalhoDaPagina
        migalha={<Migalha itens={[{ rotulo: "Disponibilidade", href: "/disponibilidade" }, { rotulo: enquete.titulo }]} />}
        titulo={enquete.titulo}
        aoLadoDoTitulo={<ChipDaEnquete situacao={enquete.situacao} />}
        subtitulo={`${enquete.descricaoDoFechamento} · ${enquete.responderam} de ${enquete.totalDeStaff} pessoas responderam`}
        acoes={
          <AcoesDaEnquete
            enqueteId={enquete.id}
            titulo={enquete.titulo}
            convite={enquete.convite}
            situacao={enquete.situacao}
            reabrirAte={enquete.reabrirAte}
            hrefRegistrar={endereco(base, semCriada, { registrar: "nova" })}
            somenteLeitura={somenteLeitura}
          />
        }
      />
      {somenteLeitura && <FaixaSomenteLeitura />}

      {parametros.criada && (
        <>
          <Aviso tom="sucesso" className="mb-4">
            Enquete criada. Copie o convite e envie no grupo do staff.
          </Aviso>
          <Cartao id="convite" titulo="Convite para o WhatsApp" explicacao="Texto pronto para colar no grupo. Só copia; o envio é pelo WhatsApp." acoes={botaoCopiar} className="mb-5">
            <pre className="overflow-x-auto whitespace-pre-wrap rounded-[var(--ds-radius-md)] bg-[var(--ds-surface-2)] p-4 text-[13px] leading-relaxed">{enquete.convite}</pre>
          </Cartao>
        </>
      )}

      {enquete.situacao === "ENCERRADA" && (
        <Aviso tom="neutro" className="mb-4">
          Enquete encerrada em {diaEHora(enquete.fechaEm)}. O time ainda pode registrar respostas.
        </Aviso>
      )}

      <ul aria-label="Quem pode, por evento" className="relative mb-5 flex gap-3 overflow-x-auto pb-1">
        {enquete.eventos.map((evento) => {
          const total = totalPorEvento.get(evento.id);
          return (
            <li key={evento.id} className={`${CARTAO} min-w-[200px] shrink-0 px-4 py-3`}>
              <p className="text-[12px] font-medium text-[var(--ds-label-2)]">
                {nomeDoEvento(evento)} · {periodoCurto(evento.dataInicio, evento.dataFim)}
              </p>
              <p className="mt-0.5 text-[20px] font-semibold tabular-nums">
                {total?.podem ?? 0} <span className="text-[14px] font-medium text-[var(--ds-label-2)]">podem</span>
              </p>
            </li>
          );
        })}
      </ul>

      {enquete.responderam === 0 && !comFiltro ? (
        <section className={CARTAO}>
          <EstadoVazio icone={<Inbox size={32} aria-hidden />} titulo="Ninguém respondeu ainda." nivel="h2" acao={botaoCopiar}>
            Copie o convite e envie no grupo do staff. Registre aqui as respostas que chegarem.
          </EstadoVazio>
        </section>
      ) : (
        <>
          <BarraDeFiltros
            nomes={[...FILTROS]}
            resultado={enquete.linhas.length === 1 ? "1 pessoa encontrada" : `${enquete.linhas.length} pessoas encontradas`}
          >
            <BuscaDeFiltro rotulo="Buscar por nome" placeholder="Buscar por nome" />
            <SeletorDeFiltro nome="polo" rotulo="Polo" todos="Todos" opcoes={enquete.opcoes.polos.map((polo) => ({ valor: polo.codigo, rotulo: polo.nome }))} />
            <SeletorDeFiltro nome="funcao" rotulo="Função" todos="Todas" opcoes={enquete.opcoes.funcoes.map((funcao) => ({ valor: funcao.codigo, rotulo: funcao.nome }))} />
            <AtalhosDeFiltro
              nome="respostas"
              rotulo="Respostas"
              opcoes={[
                { valor: null, rotulo: "Todas" },
                { valor: "sem-resposta", rotulo: "Só quem não respondeu", quantidade: enquete.totalDeStaff - enquete.responderam },
              ]}
            />
          </BarraDeFiltros>

          {enquete.linhas.length === 0 ? (
            <section className={CARTAO}>
              <EstadoVazio titulo="Nenhuma pessoa com esses filtros.">
                <BotaoLink href={base} variante="texto">
                  Limpar filtros
                </BotaoLink>
              </EstadoVazio>
            </section>
          ) : (
            <Tabela legenda={`Respostas de cada pessoa por evento — ${enquete.titulo}`} larguraMinima="min-w-[720px]">
              <CabecaDaTabela>
                <ColunaDaTabela className="sticky left-0 z-10 bg-[var(--ds-surface-1)]">Pessoa</ColunaDaTabela>
                {enquete.eventos.map((evento) => (
                  <ColunaDaTabela key={evento.id} className="whitespace-nowrap">
                    {nomeDoEvento(evento)}
                    <span className="block font-normal">{periodoCurto(evento.dataInicio, evento.dataFim)}</span>
                  </ColunaDaTabela>
                ))}
                <ColunaDaTabela className="text-right">
                  <span className="sr-only">Ações</span>
                </ColunaDaTabela>
              </CabecaDaTabela>
              <tbody>
                {enquete.linhas.map((linha) => (
                  <LinhaDaTabela key={linha.pessoa.pessoaId}>
                    <CelulaDaTabela cabecalhoDaLinha fixa className="min-w-[220px]">
                      <span className="flex flex-wrap items-center gap-1.5">
                        {linha.pessoa.nome}
                        {linha.registradoPeloTimeEm && <SeloRegistradoPeloTime em={linha.registradoPeloTimeEm} />}
                      </span>
                      {linha.pessoa.funcoes.length > 0 && (
                        <span className="block text-[12px] font-normal text-[var(--ds-label-2)]">{linha.pessoa.funcoes.map((funcao) => funcao.nome).join(", ")}</span>
                      )}
                    </CelulaDaTabela>
                    {enquete.eventos.map((evento) => (
                      <CelulaDaTabela key={evento.id}>
                        <CelulaDaResposta resposta={linha.respostas[evento.id] ?? "SEM_RESPOSTA"} />
                      </CelulaDaTabela>
                    ))}
                    <CelulaDaTabela className="text-right">
                      {!somenteLeitura && (
                        <BotaoLink
                          href={endereco(base, semCriada, { registrar: linha.pessoa.pessoaId })}
                          scroll={false}
                          tamanho="pequeno"
                          aria-label={`Registrar resposta de ${linha.pessoa.nome}`}
                        >
                          Registrar
                        </BotaoLink>
                      )}
                    </CelulaDaTabela>
                  </LinhaDaTabela>
                ))}
              </tbody>
              <tfoot className="border-t border-[var(--ds-separator)] bg-[var(--ds-surface-1)] text-[12px] text-[var(--ds-label-2)]">
                <tr>
                  <th scope="row" className="sticky left-0 z-10 bg-[var(--ds-surface-1)] px-4 py-2.5 text-left font-medium">
                    Total ({enquete.totalDeStaff} pessoas)
                  </th>
                  {enquete.eventos.map((evento) => {
                    const total = totalPorEvento.get(evento.id);
                    return (
                      <td key={evento.id} className="px-4 py-2.5 tabular-nums whitespace-nowrap">
                        {total?.podem ?? 0} podem · {total?.naoPodem ?? 0} não podem
                      </td>
                    );
                  })}
                  <td />
                </tr>
              </tfoot>
            </Tabela>
          )}
        </>
      )}

      {registrar && (
        <PainelDeResposta
          key={registrar}
          aberto
          pessoaInicial={pessoaInicial}
          enqueteId={enquete.id}
          pessoas={enquete.pessoas}
          eventos={enquete.eventos.map((evento) => ({
            id: evento.id,
            rotulo: evento.codigo ? `${evento.codigo} · ${evento.nome}` : evento.nome,
            data: periodoCurto(evento.dataInicio, evento.dataFim),
          }))}
          respostasPorPessoa={enquete.respostasPorPessoa}
          opcoes={RESPOSTAS.map((valor) => ({ valor, rotulo: rotuloDaResposta(valor) }))}
          foraDoPrazo={enquete.situacao === "ENCERRADA"}
          hrefFechar={endereco(base, semCriada, { registrar: null })}
        />
      )}
    </>
  );
}
