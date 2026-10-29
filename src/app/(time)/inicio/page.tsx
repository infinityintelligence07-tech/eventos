import { CircleAlert, RefreshCw } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";

import { carregarInicio, type EventoDaSemana } from "@/fluxos/inicio";

import { Aviso } from "../_componentes/ui/aviso";
import { BotaoLink } from "../_componentes/ui/botao-link";
import { CabecalhoDaPagina } from "../_componentes/ui/cabecalho";
import { CARTAO, TITULO_DE_CARTAO, TITULO_DE_SECAO } from "../_componentes/ui/classes";
import { Cartao, CartaoDeNumero, CartaoDePendencia } from "../_componentes/ui/cartao";
import { EstadoVazio } from "../_componentes/ui/estados";
import { dataEHora, periodo } from "../_componentes/ui/formatos";
import { ChipDaEscala } from "../_componentes/ui/situacao";
import { CabecaDaTabela, CelulaDaTabela, ColunaDaTabela, LinhaDaTabela, Tabela } from "../_componentes/ui/tabela";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Início" };

/** Microcopy da doc 08 §4. */
const EXPLICACAO: Record<string, string> = {
  "comunicacao-falta-dado": "Estas copys só podem ser enviadas quando o dado for preenchido.",
  "escalas-aguardando-aprovacao": "Escalas enviadas para a líder aprovar.",
  "escalas-devolvidas": "A líder devolveu para ajustar.",
  "escalas-a-montar": "Eventos nos próximos 30 dias com a escala ainda não aprovada.",
  "escalas-sem-resposta": "Convidadas há mais de 2 dias sem confirmar.",
  "comunicacao-desatualizadas": "Os dados mudaram depois do envio. Copie e envie de novo.",
  "confronto-sem-fila": "Sem o número de pessoas na fila, as vagas de pai e mãe não são calculadas.",
  "eventos-sem-codigo": "Eventos sem polo cadastrado ou com código repetido no IAM Control.",
  "custos-para-auditar": "Solicitações de custo esperando aprovação do time.",
  "custos-criticos": "Solicitações com alerta crítico de consumo ou distância.",
  "voos-a-pedir": "Eventos em menos de 90 dias com pessoas que vão de avião e ainda sem pedido à SDC.",
  "pedidos-alterados": "Pedidos mudados pelo time depois da emissão, esperando novo retorno da SDC.",
  "disponibilidade.enquetes-fechando": "Enquetes de disponibilidade perto de fechar.",
};

function quandoSincronizou(instante: Date | null): string {
  return instante ? `Turmas do IAM Control sincronizadas em ${dataEHora(instante)}.` : "Turmas do IAM Control ainda não sincronizadas.";
}

function LinhaDaSemana({ evento }: { evento: EventoDaSemana }) {
  return (
    <LinhaDaTabela>
      <CelulaDaTabela>
        <Link href={`/eventos/${evento.id}`} className="font-medium hover:underline">
          {evento.codigo ?? evento.nome}
        </Link>
      </CelulaDaTabela>
      <CelulaDaTabela className="whitespace-nowrap">{periodo(evento.dataInicio, evento.dataFim)}</CelulaDaTabela>
      <CelulaDaTabela>{evento.poloCodigo ?? "—"}</CelulaDaTabela>
      <CelulaDaTabela numero>
        {evento.preenchidas} de {evento.vagas}
      </CelulaDaTabela>
      <CelulaDaTabela>
        <ChipDaEscala situacao={evento.situacao} />
      </CelulaDaTabela>
    </LinhaDaTabela>
  );
}

export default async function PaginaInicio() {
  const inicio = await carregarInicio(new Date());

  return (
    <>
      <CabecalhoDaPagina
        titulo="Início"
        subtitulo={quandoSincronizou(inicio.ultimaSincronizacao)}
        acoes={
          <BotaoLink href="/inicio" icone={<RefreshCw size={18} aria-hidden />}>
            Atualizar
          </BotaoLink>
        }
      />

      <div className="mb-5 grid gap-3">
        {inicio.sincronizacaoAtrasada && inicio.ultimaSincronizacao && (
          <Aviso tom="atencao">
            As turmas do IAM Control não são atualizadas desde {dataEHora(inicio.ultimaSincronizacao)}. Os dados de eventos podem estar desatualizados.
          </Aviso>
        )}
        {inicio.tudoEmDia && <Aviso tom="sucesso">Tudo em dia por aqui. Nenhuma pendência para hoje.</Aviso>}
      </div>

      <div className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
        {inicio.numeros.map((numero) =>
          numero.valor === null ? (
            <div key={numero.rotulo} className={`${CARTAO} px-5 py-4`}>
              <p className="text-[12px] font-medium text-[var(--ds-label-2)]">
                <Link href={numero.href} className="hover:underline">
                  {numero.rotulo}
                </Link>
              </p>
              <p className="mt-1 text-[14px] text-[var(--ds-red-deep)]">Não foi possível carregar.</p>
            </div>
          ) : (
            <CartaoDeNumero key={numero.rotulo} rotulo={numero.rotulo} valor={numero.valor} href={numero.href} />
          ),
        )}
      </div>

      <section aria-labelledby="precisa-de-acao" className="mb-6">
        <h2 id="precisa-de-acao" className={`${TITULO_DE_SECAO} mb-2`}>
          Precisa de ação
        </h2>
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {inicio.cartoes.map((cartao) =>
            cartao.tipo === "erro" ? (
              <section key={`erro-${cartao.origem}`} role="alert" className={`${CARTAO} p-5`}>
                <h3 className={`flex items-center gap-2 ${TITULO_DE_CARTAO}`}>
                  <CircleAlert size={18} aria-hidden className="text-[var(--ds-red-deep)]" />
                  {cartao.nome}
                </h3>
                <p className="mt-1 text-[13px] text-[var(--ds-label-2)]">
                  Não foi possível carregar as pendências de {cartao.nome}. Tente de novo; se continuar, o banco de dados pode estar fora do ar.
                </p>
              </section>
            ) : (
              <CartaoDePendencia
                key={cartao.item.chave}
                titulo={cartao.item.titulo}
                explicacao={EXPLICACAO[cartao.item.chave] ?? ""}
                quantidade={cartao.item.quantidade}
                href={cartao.item.href}
                textoSemPendencia="Nada pendente."
                exemplos={cartao.item.exemplos.map((exemplo, indice) => ({ chave: `${indice}-${exemplo.href}`, ...exemplo }))}
              />
            ),
          )}
        </div>
      </section>

      <section aria-labelledby="proximos-7-dias">
        <h2 id="proximos-7-dias" className={`${TITULO_DE_SECAO} mb-2`}>
          Próximos 7 dias
        </h2>
        {inicio.proximos7Dias === null ? (
          <Aviso tom="perigo">Não foi possível carregar os eventos da semana.</Aviso>
        ) : inicio.proximos7Dias.eventos.length === 0 && inicio.proximos7Dias.masterclasses.length === 0 ? (
          <Cartao espacamento="nenhum">
            <EstadoVazio
              titulo="Nenhum evento nos próximos 7 dias."
              acao={
                <BotaoLink href="/calendario" variante="texto">
                  Abrir calendário
                </BotaoLink>
              }
            />
          </Cartao>
        ) : (
          <Tabela legenda="Eventos dos próximos 7 dias" larguraMinima="min-w-[720px]">
            <CabecaDaTabela>
              <ColunaDaTabela>Evento</ColunaDaTabela>
              <ColunaDaTabela>Datas</ColunaDaTabela>
              <ColunaDaTabela>Polo</ColunaDaTabela>
              <ColunaDaTabela numero>Vagas</ColunaDaTabela>
              <ColunaDaTabela>Escala</ColunaDaTabela>
            </CabecaDaTabela>
            <tbody>
              {inicio.proximos7Dias.eventos.map((evento) => (
                <LinhaDaSemana key={evento.id} evento={evento} />
              ))}
              {inicio.proximos7Dias.masterclasses.length > 0 && (
                <tr className="border-t border-[var(--ds-separator)]">
                  <td colSpan={5} className="px-4 py-3">
                    <details>
                      <summary className="cursor-pointer text-[14px] font-medium text-[var(--ds-tint-text)]">
                        +{inicio.proximos7Dias.masterclasses.length}{" "}
                        {inicio.proximos7Dias.masterclasses.length === 1 ? "Masterclass" : "Masterclasses"}
                      </summary>
                      <ul className="mt-2 grid gap-1 text-[13px] sm:grid-cols-2">
                        {inicio.proximos7Dias.masterclasses.map((masterclass) => (
                          <li key={masterclass.id} className="flex flex-wrap items-center gap-2">
                            <Link href={`/eventos/${masterclass.id}`} className="hover:underline">
                              {masterclass.codigo ?? masterclass.nome}
                            </Link>
                            <span className="text-[var(--ds-label-2)]">{periodo(masterclass.dataInicio, masterclass.dataFim)}</span>
                          </li>
                        ))}
                      </ul>
                    </details>
                  </td>
                </tr>
              )}
            </tbody>
          </Tabela>
        )}
      </section>
    </>
  );
}
