"use client";

import { Calculator, Plus, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, useTransition } from "react";
import { type AcaoDoFormulario, ErroDoFormulario, useAcao } from "@/app/(time)/_componentes/ui";

import { Aviso } from "../../_componentes/ui/aviso";
import { Botao, BotaoDeEnvio } from "../../_componentes/ui/botao";
import { CaixaDeMarcar, CampoDeSelecao, CampoDeTexto } from "../../_componentes/ui/campo";
import { CARTAO, TITULO_DE_CARTAO } from "../../_componentes/ui/classes";
import { dinheiro, distancia } from "../../_componentes/ui/formatos";
import { ResumoDeErros } from "../../_componentes/ui/resumo-de-erros";
import type { PreviaNaTela } from "../acoes";

// Registrar (ou corrigir) a solicitação em nome da pessoa (doc 08 §11.3). Km digitado nesta rodada.
// O resumo ao vivo vem do servidor (mesmo cálculo do registro); o total gravado é sempre recalculado lá.

export type LinhaDeDeslocamento = { origem: string; destino: string; idaVolta: boolean; km: string; consumoKmL: string; precoLitroCentavos: string; pedagioCentavos: string };
export type LinhaDeItem = { categoria: string; regraCustoId: string; descricao: string; quantidade: string; valorCentavos: string };

type ComChave<T> = T & { chave: number };

type Opcao = { valor: string; rotulo: string };

export function FormularioDeSolicitacao({
  acao,
  calcularPrevia,
  eventoId,
  pessoaId,
  correcao,
  categorias,
  deslocamentosIniciais,
  itensIniciais,
  linhaNova,
}: {
  acao: AcaoDoFormulario;
  calcularPrevia: (entrada: unknown) => Promise<PreviaNaTela>;
  eventoId: string;
  pessoaId: string;
  correcao: { solicitacaoId: string; atualizadoEm: string } | null;
  categorias: Opcao[];
  deslocamentosIniciais: LinhaDeDeslocamento[];
  itensIniciais: LinhaDeItem[];
  linhaNova: LinhaDeDeslocamento;
}) {
  const router = useRouter();
  const { despachar, erros, estado } = useAcao(acao);
  const proximaChave = useRef(1);
  const comChave = <T,>(linha: T): ComChave<T> => ({ ...linha, chave: proximaChave.current++ });
  const [deslocamentos, setDeslocamentos] = useState(() => deslocamentosIniciais.map(comChave));
  const [itens, setItens] = useState(() => itensIniciais.map(comChave));
  const [previa, setPrevia] = useState<PreviaNaTela | null>(null);
  const [, iniciar] = useTransition();

  useEffect(() => {
    const espera = setTimeout(() => {
      iniciar(async () => {
        setPrevia(
          await calcularPrevia({
            eventoId,
            deslocamentos: deslocamentos.map(({ origem, destino, km, consumoKmL, precoLitroCentavos, pedagioCentavos, idaVolta }) => ({
              origem,
              destino,
              km,
              consumoKmL,
              precoLitroCentavos,
              pedagioCentavos: pedagioCentavos || undefined,
              idaVolta: idaVolta ? "on" : undefined,
            })),
            itens: itens.map(({ categoria, regraCustoId, descricao, quantidade, valorCentavos }) => ({ categoria, regraCustoId: regraCustoId || undefined, descricao, quantidade, valorCentavos })),
          }),
        );
      });
    }, 400);
    return () => clearTimeout(espera);
  }, [deslocamentos, itens, eventoId, calcularPrevia]);

  const mudarDeslocamento = (chave: number, mudanca: Partial<LinhaDeDeslocamento>) =>
    setDeslocamentos((atuais) => atuais.map((linha) => (linha.chave === chave ? { ...linha, ...mudanca } : linha)));
  const mudarItem = (chave: number, mudanca: Partial<LinhaDeItem>) => setItens((atuais) => atuais.map((linha) => (linha.chave === chave ? { ...linha, ...mudanca } : linha)));

  const calculo = previa?.previa;
  const alertas = calculo?.deslocamentos.flatMap((deslocamento) => deslocamento.alertas) ?? [];
  const rotulos: Record<string, string> = {};
  deslocamentos.forEach((_linha, indice) => {
    for (const [campo, rotulo] of Object.entries({ origem: "Origem", destino: "Destino", km: "Km", consumoKmL: "Consumo", precoLitroCentavos: "Preço do litro", pedagioCentavos: "Pedágio" })) {
      rotulos[`deslocamentos.${indice}.${campo}`] = `Deslocamento ${indice + 1}, ${rotulo.toLowerCase()}`;
    }
  });
  itens.forEach((_linha, indice) => {
    for (const [campo, rotulo] of Object.entries({ descricao: "Descrição", quantidade: "Quantidade", valorCentavos: "Valor", categoria: "Categoria" })) {
      rotulos[`itens.${indice}.${campo}`] = `Item ${indice + 1}, ${rotulo.toLowerCase()}`;
    }
  });

  return (
    <form action={despachar} aria-label={correcao ? "Corrigir solicitação de custo" : "Registrar solicitação de custo"} className="grid gap-5 xl:grid-cols-[1fr_320px]">
      <div className="min-w-0">
        <ResumoDeErros campos={estado.ok ? undefined : estado.campos} rotulos={rotulos} />
        <ErroDoFormulario estado={estado} />
        {correcao ? (
          <>
            <input type="hidden" name="solicitacaoId" value={correcao.solicitacaoId} />
            <input type="hidden" name="atualizadoEm" value={correcao.atualizadoEm} />
          </>
        ) : (
          <>
            <input type="hidden" name="eventoId" value={eventoId} />
            <input type="hidden" name="pessoaId" value={pessoaId} />
          </>
        )}

        <section aria-labelledby="titulo-deslocamentos" className={`${CARTAO} mb-5 p-5`}>
          <h3 id="titulo-deslocamentos" className={TITULO_DE_CARTAO}>
            Deslocamentos de carro
          </h3>
          <p className="mt-0.5 mb-3 text-[12px] text-[var(--ds-label-2)]">Km digitado (o cálculo pelo mapa entra numa próxima rodada). Combustível, depreciação e total são calculados.</p>
          {deslocamentos.map((linha, indice) => {
            const calculado = previa?.deslocamentosValidos[indice] ? calculo?.deslocamentos[previa.deslocamentosValidos.slice(0, indice).filter(Boolean).length] : undefined;
            const nome = (campo: string) => `deslocamentos[${indice}].${campo}`;
            const erro = (campo: string) => erros(`deslocamentos.${indice}.${campo}`);
            return (
              <fieldset key={linha.chave} className="mb-4 rounded-[var(--ds-radius-md)] border border-[var(--ds-separator)] p-4">
                <legend className="px-1 text-[13px] font-semibold">Deslocamento {indice + 1}</legend>
                <div className="grid gap-3 md:grid-cols-2">
                  <CampoDeTexto nome={nome("origem")} rotulo="Origem" obrigatorio value={linha.origem} onChange={(evento) => mudarDeslocamento(linha.chave, { origem: evento.target.value })} erros={erro("origem")} />
                  <CampoDeTexto nome={nome("destino")} rotulo="Destino" obrigatorio value={linha.destino} onChange={(evento) => mudarDeslocamento(linha.chave, { destino: evento.target.value })} erros={erro("destino")} />
                </div>
                <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                  <CampoDeTexto nome={nome("km")} rotulo="Km (um sentido)" obrigatorio inputMode="decimal" value={linha.km} onChange={(evento) => mudarDeslocamento(linha.chave, { km: evento.target.value })} erros={erro("km")} />
                  <CampoDeTexto
                    nome={nome("consumoKmL")}
                    rotulo="Consumo (km/l)"
                    obrigatorio
                    inputMode="decimal"
                    value={linha.consumoKmL}
                    onChange={(evento) => mudarDeslocamento(linha.chave, { consumoKmL: evento.target.value })}
                    erros={erro("consumoKmL")}
                  />
                  <CampoDeTexto
                    nome={nome("precoLitroCentavos")}
                    rotulo="Preço do litro (R$)"
                    obrigatorio
                    inputMode="decimal"
                    value={linha.precoLitroCentavos}
                    onChange={(evento) => mudarDeslocamento(linha.chave, { precoLitroCentavos: evento.target.value })}
                    erros={erro("precoLitroCentavos")}
                  />
                  <CampoDeTexto
                    nome={nome("pedagioCentavos")}
                    rotulo="Pedágio (R$, um sentido)"
                    inputMode="decimal"
                    value={linha.pedagioCentavos}
                    onChange={(evento) => mudarDeslocamento(linha.chave, { pedagioCentavos: evento.target.value })}
                    erros={erro("pedagioCentavos")}
                  />
                </div>
                <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
                  <CaixaDeMarcar
                    name={nome("idaVolta")}
                    checked={linha.idaVolta}
                    onChange={(evento) => mudarDeslocamento(linha.chave, { idaVolta: evento.target.checked })}
                    rotulo="Ida e volta"
                    ajuda="Conta os dois trechos no combustível e no pedágio."
                  />
                  <Botao tamanho="pequeno" variante="texto" icone={<Trash2 size={16} aria-hidden />} onClick={() => setDeslocamentos((atuais) => atuais.filter((item) => item.chave !== linha.chave))}>
                    Remover deslocamento {indice + 1}
                  </Botao>
                </div>
                <p className="mt-2 text-[13px] text-[var(--ds-label-2)]" aria-live="polite">
                  {calculado
                    ? `Combustível ${dinheiro(calculado.combustivelCentavos)} · pedágio ${dinheiro(calculado.pedagioCentavos)} · depreciação ${dinheiro(calculado.depreciacaoCentavos)} · total ${dinheiro(calculado.totalCentavos)}`
                    : "Preencha a linha para ver o cálculo."}
                </p>
              </fieldset>
            );
          })}
          <Botao icone={<Plus size={18} aria-hidden />} onClick={() => setDeslocamentos((atuais) => [...atuais, comChave(linhaNova)])}>
            Adicionar deslocamento
          </Botao>
        </section>

        <section aria-labelledby="titulo-itens" className={`${CARTAO} mb-5 p-5`}>
          <h3 id="titulo-itens" className={TITULO_DE_CARTAO}>
            Itens
          </h3>
          <p className="mt-0.5 mb-3 text-[12px] text-[var(--ds-label-2)]">Remuneração e alimentação vêm da regra do tipo de evento e podem ser editadas.</p>
          {itens.map((linha, indice) => {
            const nome = (campo: string) => `itens[${indice}].${campo}`;
            const erro = (campo: string) => erros(`itens.${indice}.${campo}`);
            return (
              <fieldset key={linha.chave} className="mb-3 grid items-end gap-3 rounded-[var(--ds-radius-md)] border border-[var(--ds-separator)] p-4 md:grid-cols-[160px_1fr_100px_140px_auto]">
                <legend className="sr-only">Item {indice + 1}</legend>
                {linha.regraCustoId && <input type="hidden" name={nome("regraCustoId")} value={linha.regraCustoId} />}
                <CampoDeSelecao nome={nome("categoria")} rotulo="Categoria" value={linha.categoria} onChange={(evento) => mudarItem(linha.chave, { categoria: evento.target.value })} opcoes={categorias} erros={erro("categoria")} />
                <CampoDeTexto
                  nome={nome("descricao")}
                  rotulo={
                    <>
                      Descrição
                      {linha.regraCustoId && (
                        <>
                          <Calculator size={12} aria-hidden className="ml-1 inline" />
                          <span className="sr-only"> (valor da regra)</span>
                        </>
                      )}
                    </>
                  }
                  value={linha.descricao}
                  onChange={(evento) => mudarItem(linha.chave, { descricao: evento.target.value })}
                  erros={erro("descricao")}
                />
                <CampoDeTexto nome={nome("quantidade")} rotulo="Quantidade" inputMode="decimal" value={linha.quantidade} onChange={(evento) => mudarItem(linha.chave, { quantidade: evento.target.value })} erros={erro("quantidade")} />
                <CampoDeTexto
                  nome={nome("valorCentavos")}
                  rotulo="Valor unitário (R$)"
                  inputMode="decimal"
                  value={linha.valorCentavos}
                  onChange={(evento) => mudarItem(linha.chave, { valorCentavos: evento.target.value })}
                  erros={erro("valorCentavos")}
                />
                <Botao variante="icone" aria-label={`Remover item ${indice + 1}`} icone={<Trash2 size={18} aria-hidden />} onClick={() => setItens((atuais) => atuais.filter((item) => item.chave !== linha.chave))} />
              </fieldset>
            );
          })}
          <Botao
            icone={<Plus size={18} aria-hidden />}
            onClick={() => setItens((atuais) => [...atuais, comChave({ categoria: "ADICIONAL", regraCustoId: "", descricao: "", quantidade: "1", valorCentavos: "" })])}
          >
            Adicionar item
          </Botao>
        </section>

        <div className="flex justify-end gap-2">
          <Botao onClick={() => router.push("/custos")}>Cancelar</Botao>
          <BotaoDeEnvio textoCarregando="Registrando…">{correcao ? "Registrar correção" : "Registrar solicitação"}</BotaoDeEnvio>
        </div>
      </div>

      <aside aria-labelledby="titulo-resumo" className={`${CARTAO} h-fit p-5 xl:sticky xl:top-4`}>
        <h3 id="titulo-resumo" className={TITULO_DE_CARTAO}>
          Resumo
        </h3>
        <div aria-live="polite">
          <p className="mt-3 text-[12px] text-[var(--ds-label-2)]">Total</p>
          <p className="text-[28px] font-semibold tabular-nums">{dinheiro(calculo?.totalCentavos ?? 0)}</p>
          <p className="mt-2 text-[13px] text-[var(--ds-label-2)]">Km total: {distancia(calculo?.kmTotal ?? 0)}</p>
          {alertas.length > 0 ? (
            <div className="mt-3 flex flex-col gap-2">
              {alertas.map((alerta, indice) => (
                <Aviso key={indice} tom={alerta.nivel === "CRITICO" ? "perigo" : "atencao"}>
                  Esta solicitação vai entrar com {alerta.nivel === "CRITICO" ? "alerta crítico" : "alerta"}: {alerta.mensagem}
                </Aviso>
              ))}
            </div>
          ) : (
            calculo && <p className="mt-3 text-[13px] text-[var(--ds-label-2)]">Sem alerta pelas regras de custo.</p>
          )}
        </div>
      </aside>
    </form>
  );
}
