"use client";

import Link from "next/link";
import { useActionState, useEffect, useRef, useState, useTransition } from "react";

import type { PreviaDoStaff, ResultadoDoCusto } from "../acoes";
import { type ComprovanteDoFormulario, Comprovantes, type LimitesDoAnexo } from "./comprovantes";

// Formulário de custo do próprio staff (docs/08 §11.4), pensado para o celular. O resumo vem do servidor (o mesmo
// cálculo do envio); o total gravado é sempre recalculado lá.

export type DeslocamentoDoFormulario = { origem: string; destino: string; idaVolta: boolean; km: string; consumoKmL: string; precoLitroCentavos: string; pedagioCentavos: string };
export type DespesaDoFormulario = { descricao: string; valorCentavos: string };
/** Valor que a pessoa vê e não edita: fixo do evento (pela regra de custo) ou lançado pelo time. */
export type FixoDoFormulario = { descricao: string; totalCentavos: number; origem: "REGRA" | "TIME"; observacao: string | null };
/** Anexo de comprovantes ligado neste ambiente: onde enviar, o que já foi anexado e os limites. */
export type AnexoDoFormulario = { endereco: string; comprovantes: ComprovanteDoFormulario[]; limites: LimitesDoAnexo };

type ComChave<T> = T & { chave: number };

const REAIS = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });
const reais = (centavos: number) => REAIS.format(centavos / 100);

const LIMITE_DE_LINHAS = 10;
const DESPESA_NOVA: DespesaDoFormulario = { descricao: "", valorCentavos: "" };

function Erro({ erros, campo }: { erros?: Record<string, string>; campo: string }) {
  return erros?.[campo] ? (
    <span className="cadastro-erro" role="alert">
      {erros[campo]}
    </span>
  ) : null;
}

export function FormularioDeCusto({
  acao,
  calcularPrevia,
  eventoId,
  correcao,
  deslocamentosIniciais,
  despesasIniciais,
  deslocamentoNovo,
  fixos,
  anexo,
  cancelarHref,
}: {
  acao: (anterior: ResultadoDoCusto, form: FormData) => Promise<ResultadoDoCusto>;
  calcularPrevia: (entrada: unknown) => Promise<PreviaDoStaff>;
  eventoId: string;
  /** Corrigindo a solicitação reprovada: a versão que a pessoa abriu. */
  correcao: { atualizadoEm: string } | null;
  deslocamentosIniciais: DeslocamentoDoFormulario[];
  despesasIniciais: DespesaDoFormulario[];
  /** Linha em branco, já com o consumo do cadastro e o preço do litro da regra. */
  deslocamentoNovo: DeslocamentoDoFormulario;
  /** Remuneração e alimentação fixas do evento e itens do time: entram sozinhos na solicitação e no total mostrado. */
  fixos: FixoDoFormulario[];
  /** Nulo = anexo desligado neste ambiente: o formulário funciona sem o campo. */
  anexo: AnexoDoFormulario | null;
  cancelarHref?: string;
}) {
  const [resultado, enviar, enviando] = useActionState<ResultadoDoCusto, FormData>(acao, null);
  const proximaChave = useRef(1);
  const comChave = <T,>(linha: T): ComChave<T> => ({ ...linha, chave: proximaChave.current++ });
  const [deslocamentos, setDeslocamentos] = useState(() => deslocamentosIniciais.map(comChave));
  const [despesas, setDespesas] = useState(() => despesasIniciais.map(comChave));
  const [previa, setPrevia] = useState<PreviaDoStaff>(null);
  const [, iniciar] = useTransition();
  const [anexos, setAnexos] = useState({ quantidade: anexo?.comprovantes.length ?? 0, enviando: false });
  const erros = resultado && !resultado.ok ? resultado.erros : undefined;
  const foiDeCarro = deslocamentos.length > 0;
  const temGasto = deslocamentos.length + despesas.length > 0;
  const totalFixoCentavos = fixos.reduce((soma, item) => soma + item.totalCentavos, 0);
  const faltaComprovante = anexo !== null && temGasto && anexos.quantidade === 0;

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
            despesas: despesas.map(({ descricao, valorCentavos }) => ({ descricao, valorCentavos })),
          }),
        );
      });
    }, 500);
    return () => clearTimeout(espera);
  }, [deslocamentos, despesas, eventoId, calcularPrevia]);

  const mudarDeslocamento = (chave: number, mudanca: Partial<DeslocamentoDoFormulario>) =>
    setDeslocamentos((atuais) => atuais.map((linha) => (linha.chave === chave ? { ...linha, ...mudanca } : linha)));
  const mudarDespesa = (chave: number, mudanca: Partial<DespesaDoFormulario>) => setDespesas((atuais) => atuais.map((linha) => (linha.chave === chave ? { ...linha, ...mudanca } : linha)));

  return (
    <form action={enviar} className="cadastro-form" noValidate>
      <input type="hidden" name="eventoId" value={eventoId} />
      {correcao && <input type="hidden" name="atualizadoEm" value={correcao.atualizadoEm} />}

      <fieldset>
        <legend>Você foi com o seu carro?</legend>
        <div className="cadastro-opcoes">
          <label className="cadastro-opcao">
            <input type="radio" name="foiDeCarro" checked={foiDeCarro} onChange={() => setDeslocamentos((atuais) => (atuais.length > 0 ? atuais : [comChave(deslocamentoNovo)]))} />
            Sim, fui com o meu carro
          </label>
          <label className="cadastro-opcao">
            <input type="radio" name="foiDeCarro" checked={!foiDeCarro} onChange={() => setDeslocamentos([])} />
            Não fui com o meu carro
          </label>
        </div>
        {!foiDeCarro && <p className="cadastro-ajuda">Sem carro, informe abaixo o que você gastou para chegar (ônibus, aplicativo, carona paga...).</p>}
      </fieldset>

      {deslocamentos.map((linha, indice) => {
        const nome = (campo: string) => `deslocamentos[${indice}].${campo}`;
        const caminho = (campo: string) => `deslocamentos.${indice}.${campo}`;
        const calculado = previa?.deslocamentos[indice] ?? null;
        return (
          <fieldset key={linha.chave} className="custo-bloco">
            <legend>{deslocamentos.length > 1 ? `Deslocamento de carro ${indice + 1}` : "Deslocamento de carro"}</legend>
            <label className="login-campo">
              <span>De onde você saiu</span>
              <input name={nome("origem")} maxLength={200} placeholder="Cidade ou bairro" value={linha.origem} onChange={(evento) => mudarDeslocamento(linha.chave, { origem: evento.target.value })} />
              <Erro erros={erros} campo={caminho("origem")} />
            </label>
            <label className="login-campo">
              <span>Para onde você foi</span>
              <input name={nome("destino")} maxLength={200} placeholder="Local do evento" value={linha.destino} onChange={(evento) => mudarDeslocamento(linha.chave, { destino: evento.target.value })} />
              <Erro erros={erros} campo={caminho("destino")} />
            </label>
            <div className="cadastro-duas-colunas">
              <label className="login-campo">
                <span>Km de um sentido</span>
                <input name={nome("km")} inputMode="decimal" placeholder="ex.: 42,5" value={linha.km} onChange={(evento) => mudarDeslocamento(linha.chave, { km: evento.target.value })} />
                <Erro erros={erros} campo={caminho("km")} />
              </label>
              <label className="login-campo">
                <span>Consumo (km/l)</span>
                <input name={nome("consumoKmL")} inputMode="decimal" placeholder="ex.: 10,5" value={linha.consumoKmL} onChange={(evento) => mudarDeslocamento(linha.chave, { consumoKmL: evento.target.value })} />
                <Erro erros={erros} campo={caminho("consumoKmL")} />
              </label>
            </div>
            <div className="cadastro-duas-colunas">
              <label className="login-campo">
                <span>Preço do litro (R$)</span>
                <input
                  name={nome("precoLitroCentavos")}
                  inputMode="decimal"
                  placeholder="ex.: 6,19"
                  value={linha.precoLitroCentavos}
                  onChange={(evento) => mudarDeslocamento(linha.chave, { precoLitroCentavos: evento.target.value })}
                />
                <Erro erros={erros} campo={caminho("precoLitroCentavos")} />
              </label>
              <label className="login-campo">
                <span>Pedágio de um sentido (R$)</span>
                <input
                  name={nome("pedagioCentavos")}
                  inputMode="decimal"
                  placeholder="0,00"
                  value={linha.pedagioCentavos}
                  onChange={(evento) => mudarDeslocamento(linha.chave, { pedagioCentavos: evento.target.value })}
                />
                <Erro erros={erros} campo={caminho("pedagioCentavos")} />
              </label>
            </div>
            <label className="cadastro-opcao">
              <input type="checkbox" name={nome("idaVolta")} checked={linha.idaVolta} onChange={(evento) => mudarDeslocamento(linha.chave, { idaVolta: evento.target.checked })} />
              Ida e volta (conta os dois trechos)
            </label>
            <p className="cadastro-ajuda" aria-live="polite">
              {calculado
                ? `Combustível ${reais(calculado.combustivelCentavos)} · pedágio ${reais(calculado.pedagioCentavos)} · depreciação ${reais(calculado.depreciacaoCentavos)} · total ${reais(calculado.totalCentavos)}`
                : "Preencha os campos para ver o cálculo. Confira a distância de um sentido no mapa do celular."}
            </p>
            {calculado?.avisos.map((aviso) => (
              <p key={aviso} className="cadastro-pendencias custo-aviso">
                Confira: {aviso} O time vai conferir este valor.
              </p>
            ))}
            {deslocamentos.length > 1 && (
              <button type="button" className="custo-botao-texto" onClick={() => setDeslocamentos((atuais) => atuais.filter((item) => item.chave !== linha.chave))}>
                Remover este deslocamento
              </button>
            )}
          </fieldset>
        );
      })}
      {foiDeCarro && deslocamentos.length < LIMITE_DE_LINHAS && (
        <button type="button" className="custo-botao-secundario" onClick={() => setDeslocamentos((atuais) => [...atuais, comChave(deslocamentoNovo)])}>
          Adicionar outro deslocamento
        </button>
      )}

      <fieldset>
        <legend>Outras despesas do deslocamento</legend>
        <p className="cadastro-ajuda">Estacionamento, ônibus, aplicativo... Uma linha para cada despesa. Combustível e pedágio do seu carro já entram no deslocamento acima.</p>
        {despesas.map((linha, indice) => (
          <div key={linha.chave} className="custo-bloco">
            <label className="login-campo">
              <span>O que foi</span>
              <input
                name={`despesas[${indice}].descricao`}
                maxLength={200}
                placeholder="ex.: estacionamento"
                value={linha.descricao}
                onChange={(evento) => mudarDespesa(linha.chave, { descricao: evento.target.value })}
              />
              <Erro erros={erros} campo={`despesas.${indice}.descricao`} />
            </label>
            <label className="login-campo">
              <span>Valor (R$)</span>
              <input
                name={`despesas[${indice}].valorCentavos`}
                inputMode="decimal"
                placeholder="0,00"
                value={linha.valorCentavos}
                onChange={(evento) => mudarDespesa(linha.chave, { valorCentavos: evento.target.value })}
              />
              <Erro erros={erros} campo={`despesas.${indice}.valorCentavos`} />
            </label>
            <button type="button" className="custo-botao-texto" onClick={() => setDespesas((atuais) => atuais.filter((item) => item.chave !== linha.chave))}>
              Remover esta despesa
            </button>
          </div>
        ))}
        {despesas.length < LIMITE_DE_LINHAS && (
          <button type="button" className="custo-botao-secundario" onClick={() => setDespesas((atuais) => [...atuais, comChave(DESPESA_NOVA)])}>
            {despesas.length === 0 ? "Adicionar despesa" : "Adicionar outra despesa"}
          </button>
        )}
      </fieldset>

      {anexo && <Comprovantes endereco={anexo.endereco} iniciais={anexo.comprovantes} limites={anexo.limites} obrigatorio={temGasto} aoMudar={setAnexos} />}

      {fixos.length > 0 && (
        <fieldset>
          <legend>Valores fixos do evento</legend>
          <p className="cadastro-ajuda">Entram sozinhos na sua solicitação. Você não precisa pedir nem pode alterar.</p>
          {fixos.map((item, indice) => (
            <p key={indice} className="custo-bloco custo-linha">
              <span>
                {item.descricao}
                <small> · {item.origem === "REGRA" ? "valor fixo do evento" : "lançado pelo time"}{item.observacao ? ` (${item.observacao})` : ""}</small>
              </span>
              <span>{reais(item.totalCentavos)}</span>
            </p>
          ))}
        </fieldset>
      )}

      <div className="custo-total" aria-live="polite">
        <span>Total da solicitação</span>
        <strong>{reais((previa?.totalCentavos ?? 0) + totalFixoCentavos)}</strong>
        <small>
          {totalFixoCentavos > 0 ? `Inclui ${reais(totalFixoCentavos)} de valores fixos. ` : ""}
          Calculado pelas regras de custo do evento. O time confere antes de aprovar.
        </small>
      </div>
      {!temGasto && (
        <p className="cadastro-ajuda">
          {fixos.length > 0
            ? "Sem deslocamento de carro e sem despesa, a solicitação leva só os valores fixos do evento."
            : "Informe um deslocamento de carro ou uma despesa para enviar."}
        </p>
      )}
      {faltaComprovante && !anexos.enviando && <p className="cadastro-pendencias custo-aviso">Falta anexar pelo menos um comprovante do deslocamento ou das despesas.</p>}

      {resultado && !resultado.ok && (
        <p className="login-error" role="alert">
          {resultado.mensagem}
        </p>
      )}
      <button type="submit" className="login-submit" disabled={enviando || anexos.enviando}>
        {enviando ? "Enviando..." : anexos.enviando ? "Aguarde o envio dos comprovantes..." : correcao ? "Reenviar a solicitação corrigida" : "Enviar solicitação"}
      </button>
      {cancelarHref && (
        <Link href={cancelarHref} className="custo-botao-texto custo-centro">
          Cancelar
        </Link>
      )}
    </form>
  );
}
