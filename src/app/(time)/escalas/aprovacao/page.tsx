import { CircleCheck, Info, TriangleAlert } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";

import { situacaoDaEscrita } from "@/fluxos/_base";
import { carregarFilaDeAprovacao } from "@/fluxos/escalas";

import { FaixaSomenteLeitura } from "../../_componentes/ui/aviso";
import { FaixaSemPermissao } from "../../_componentes/ui/permissao";
import { exigirAtor, permissoesDoAtor } from "../../_servidor/usuario-atual";
import { BotaoLink } from "../../_componentes/ui/botao-link";
import { CabecalhoDaPagina, Migalha } from "../../_componentes/ui/cabecalho";
import { Cartao } from "../../_componentes/ui/cartao";
import { EstadoVazio } from "../../_componentes/ui/estados";
import { dataEHora, periodo } from "../../_componentes/ui/formatos";
import { AprovarOuDevolver } from "../_componentes/aprovar-ou-devolver";
import { aprovarEscala, devolverEscala } from "./acoes";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Aprovação de escalas" };

export default async function PaginaAprovacao() {
  await exigirAtor();
  const [fila, escrita, permissoes] = await Promise.all([carregarFilaDeAprovacao(), situacaoDaEscrita(), permissoesDoAtor("escala.aprovar")]);
  const podeAprovar = permissoes["escala.aprovar"];

  return (
    <>
      <CabecalhoDaPagina
        migalha={<Migalha itens={[{ rotulo: "Escalas", href: "/escalas" }, { rotulo: "Aprovação de escalas" }]} />}
        titulo="Aprovação de escalas"
        subtitulo="Escalas enviadas para a líder aprovar. Aprovar só registra; nada é enviado às pessoas."
      />
      {!escrita.liberada ? <FaixaSomenteLeitura /> : !podeAprovar && <FaixaSemPermissao permissao="escala.aprovar" />}

      {fila.length === 0 ? (
        <Cartao espacamento="nenhum">
          <EstadoVazio
            icone={<CircleCheck size={32} aria-hidden />}
            titulo="Nenhuma escala esperando aprovação."
            nivel="h2"
            acao={
              <BotaoLink href="/escalas" variante="texto">
                Ver escalas
              </BotaoLink>
            }
          >
            Quando alguém enviar uma escala, ela aparece aqui.
          </EstadoVazio>
        </Cartao>
      ) : (
        <div className="grid gap-3">
          {fila.map((escala) => {
            const codigo = escala.codigo ?? escala.nome;
            const idDoTitulo = `fila-${escala.id}`;
            const nome = escala.tipoSigla === "MC" ? escala.nome : [escala.tipoNome, escala.edicao].filter(Boolean).join(" ");
            return (
              <article key={escala.id} aria-labelledby={idDoTitulo} className="rounded-[var(--ds-radius-lg)] bg-[var(--ds-surface)] p-5 shadow-[var(--ds-shadow-1)]">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <h2 id={idDoTitulo} className="text-[15px] font-semibold">
                      {nome} · <span className="[font-family:var(--ds-font-mono)]">{codigo}</span>
                    </h2>
                    <p className="mt-0.5 text-[13px] text-[var(--ds-label-2)]">
                      {periodo(escala.dataInicio, escala.dataFim)}
                      {escala.poloCodigo ? ` · ${escala.poloCodigo}` : ""}
                      {escala.enviadaEm ? ` · enviada em ${dataEHora(escala.enviadaEm)}` : ""}
                    </p>
                    <p className="mt-2 text-[14px] tabular-nums">
                      Vagas: {escala.preenchidas} de {escala.vagas} preenchidas
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <BotaoLink href={`/eventos/${escala.id}/escala`} aria-label={`Ver escala ${codigo}`}>
                      Ver escala
                    </BotaoLink>
                    {escrita.liberada && podeAprovar && <AprovarOuDevolver eventoId={escala.id} codigo={codigo} aprovar={aprovarEscala} devolver={devolverEscala} />}
                  </div>
                </div>
                <div className="mt-3">
                  <h3 className="text-[13px] font-medium">Pontos de atenção</h3>
                  {escala.pontosDeAtencao.length === 0 ? (
                    <p className="mt-1 inline-flex items-center gap-1 text-[13px] text-[var(--ds-green-deep)]">
                      <CircleCheck size={14} aria-hidden /> Nenhum ponto de atenção.
                    </p>
                  ) : (
                    <ul className="mt-1 grid gap-1 text-[13px]">
                      {escala.pontosDeAtencao.map((ponto) => (
                        <li key={ponto.texto} className="flex items-center gap-1">
                          {ponto.tom === "atencao" ? (
                            <TriangleAlert size={14} aria-hidden className="text-[var(--ds-orange-deep)]" />
                          ) : (
                            <Info size={14} aria-hidden className="text-[var(--ds-tint-text)]" />
                          )}
                          <Link href={`/eventos/${escala.id}/escala`} className="hover:underline">
                            {ponto.texto}
                          </Link>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              </article>
            );
          })}
        </div>
      )}
    </>
  );
}
