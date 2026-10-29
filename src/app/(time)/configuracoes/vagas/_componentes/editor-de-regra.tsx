"use client";

import { Pencil, Plus, RefreshCw, Trash2 } from "lucide-react";
import { useMemo, useState } from "react";

import type { LinhaGuiada, ModoDaVaga } from "@/modules/escala";

import { useAcao } from "@/app/(time)/_componentes/ui";
import { Botao } from "../../../_componentes/ui/botao";
import { Confirmacao, PainelLateral } from "../../../_componentes/ui/dialogo";
import { recalcularVagasDoTipo, salvarRegraDeVagas } from "../acoes";

type Funcao = { codigo: string; nome: string };

type LinhaEmEdicao = {
  chave: number;
  funcao: string;
  modo: ModoDaVaga;
  quantidade: string;
  cada: string;
  multiplicador: string;
  base: string;
  formula: string;
};

const MODOS: { modo: Exclude<ModoDaVaga, "PERSONALIZADA">; rotulo: string }[] = [
  { modo: "FIXO", rotulo: "Número fixo" },
  { modo: "POR_PUBLICO", rotulo: "1 a cada N pessoas do público" },
  { modo: "POR_FILA", rotulo: "1 a cada N pessoas na fila" },
  { modo: "POR_FUNCAO", rotulo: "N para cada vaga de outra função" },
  { modo: "DIGITADO", rotulo: "Definido em cada evento" },
];

const CAMPO = "h-10 rounded-[10px] border border-[var(--ds-separator)] bg-[var(--ds-surface)] px-3 text-[14px]";

function emEdicao(linha: LinhaGuiada, chave: number): LinhaEmEdicao {
  const vazia = { chave, funcao: linha.funcao, modo: linha.modo, quantidade: "1", cada: "25", multiplicador: "2", base: "", formula: "" };
  switch (linha.modo) {
    case "FIXO":
      return { ...vazia, quantidade: String(linha.quantidade) };
    case "POR_PUBLICO":
    case "POR_FILA":
      return { ...vazia, cada: String(linha.cada) };
    case "POR_FUNCAO":
      return { ...vazia, multiplicador: String(linha.multiplicador), base: linha.base };
    case "DIGITADO":
      return vazia;
    case "PERSONALIZADA":
      return { ...vazia, formula: linha.formula };
    default: {
      const desconhecida: never = linha;
      throw new Error(`modo desconhecido: ${JSON.stringify(desconhecida)}`);
    }
  }
}

/** Só para a prévia da tela; quem grava e valida a regra é o servidor. */
function previa(linhas: LinhaEmEdicao[], publico: number, fila: number): Map<number, number | null> {
  const valores = new Map<string, number | null>();
  const resultado = new Map<number, number | null>();
  for (const linha of linhas) {
    let valor: number | null = null;
    const inteiro = (texto: string) => (/^\d+$/.test(texto.trim()) ? Number(texto) : null);
    switch (linha.modo) {
      case "FIXO":
        valor = inteiro(linha.quantidade);
        break;
      case "POR_PUBLICO":
        valor = inteiro(linha.cada) ? Math.ceil(publico / inteiro(linha.cada)!) : null;
        break;
      case "POR_FILA":
        valor = inteiro(linha.cada) ? Math.ceil(fila / inteiro(linha.cada)!) : null;
        break;
      case "POR_FUNCAO": {
        const base = valores.get(linha.base);
        valor = base !== undefined && base !== null && inteiro(linha.multiplicador) ? base * inteiro(linha.multiplicador)! : null;
        break;
      }
      case "DIGITADO":
      case "PERSONALIZADA":
        valor = null;
        break;
      default: {
        const desconhecido: never = linha.modo;
        throw new Error(`modo desconhecido: ${String(desconhecido)}`);
      }
    }
    valores.set(linha.funcao, valor);
    resultado.set(linha.chave, valor);
  }
  return resultado;
}

export function EditorDeRegra({
  tipoEventoId,
  nomeDoTipo,
  linhas,
  funcoes,
  publicoDeExemplo,
  filaDeExemplo,
  escritaLiberada,
}: {
  tipoEventoId: string;
  nomeDoTipo: string;
  linhas: LinhaGuiada[];
  funcoes: Funcao[];
  publicoDeExemplo: number;
  filaDeExemplo: number;
  escritaLiberada: boolean;
}) {
  const [aberto, setAberto] = useState(false);
  const [recalculando, setRecalculando] = useState(false);
  const [edicao, setEdicao] = useState<LinhaEmEdicao[]>(() => linhas.map(emEdicao));
  const [proximaChave, setProximaChave] = useState(linhas.length);
  const salvar = useAcao(salvarRegraDeVagas, { aoConcluir: () => setAberto(false), toastDeCampo: true });
  const recalcular = useAcao(recalcularVagasDoTipo, { aoConcluir: () => setRecalculando(false), toastDeCampo: true });
  const nomes = useMemo(() => new Map(funcoes.map((funcao) => [funcao.codigo, funcao.nome])), [funcoes]);
  const valores = previa(edicao, publicoDeExemplo, filaDeExemplo);
  const idDoFormulario = `regra-${tipoEventoId}`;
  const personalizadas = new Set(linhas.filter((linha) => linha.modo === "PERSONALIZADA").map((linha) => linha.funcao));
  const erroGeral = salvar.estado.ok ? null : salvar.estado.erro;

  const mudar = (chave: number, mudanca: Partial<LinhaEmEdicao>) =>
    setEdicao((atuais) => atuais.map((linha) => (linha.chave === chave ? { ...linha, ...mudanca } : linha)));

  function abrir() {
    setEdicao(linhas.map(emEdicao));
    setProximaChave(linhas.length);
    setAberto(true);
  }

  if (!escritaLiberada) return null;

  return (
    <div className="flex flex-wrap gap-2">
      <Botao icone={<Pencil size={18} aria-hidden />} onClick={abrir} aria-label={`Editar regra de vagas de ${nomeDoTipo}`}>
        Editar
      </Botao>
      {linhas.length > 0 && (
        <Botao icone={<RefreshCw size={18} aria-hidden />} onClick={() => setRecalculando(true)} aria-label={`Recalcular vagas de ${nomeDoTipo}`}>
          Recalcular vagas
        </Botao>
      )}

      <Confirmacao
        aberto={recalculando}
        aoFechar={() => setRecalculando(false)}
        titulo={`Recalcular as vagas dos eventos de ${nomeDoTipo}?`}
        descricao="Vale para os eventos que ainda não terminaram com a escala sem escala, em rascunho ou devolvida. Números já confirmados por quem monta não mudam."
        rotuloConfirmar="Recalcular vagas"
        carregando={recalcular.pendente}
        acao={recalcular.despachar}
      >
        <input type="hidden" name="tipoEventoId" value={tipoEventoId} />
      </Confirmacao>

      <PainelLateral
        aberto={aberto}
        aoFechar={() => setAberto(false)}
        titulo={`Vagas de ${nomeDoTipo}`}
        subtitulo="Vale para eventos novos e para escalas ainda sem número confirmado."
        largura={720}
        rodape={
          <>
            <Botao onClick={() => setAberto(false)}>Cancelar</Botao>
            <Botao type="submit" form={idDoFormulario} variante="primario" carregando={salvar.pendente} textoCarregando="Salvando…">
              Salvar regra
            </Botao>
          </>
        }
      >
        <form id={idDoFormulario} action={salvar.despachar} className="grid gap-4">
          <input type="hidden" name="tipoEventoId" value={tipoEventoId} />
          {erroGeral && (
            <p role="alert" className="rounded-[var(--ds-radius-md)] bg-[var(--ds-red-soft)] px-3 py-2 text-[13px] text-[var(--ds-red-deep)]">
              {erroGeral}
            </p>
          )}
          {edicao.length === 0 && <p className="text-[14px] text-[var(--ds-label-2)]">Sem funções: estes eventos não recebem vagas sugeridas.</p>}
          {edicao.map((linha, indice) => {
            const prefixo = `funcoes[${indice}]`;
            const anteriores = edicao.slice(0, indice).map((item) => item.funcao).filter(Boolean);
            const valor = valores.get(linha.chave);
            return (
              <fieldset key={linha.chave} className="rounded-[var(--ds-radius-md)] border border-[var(--ds-separator)] p-3">
                <legend className="px-1 text-[13px] font-medium">{nomes.get(linha.funcao) ?? "Nova função"}</legend>
                <input type="hidden" name={`${prefixo}.modo`} value={linha.modo} />
                <div className="flex flex-wrap items-end gap-3">
                  <label className="grid gap-1 text-[13px]">
                    Função
                    <select name={`${prefixo}.funcao`} value={linha.funcao} onChange={(evento) => mudar(linha.chave, { funcao: evento.target.value })} className={`${CAMPO} pr-8`}>
                      <option value="">Escolha a função</option>
                      {funcoes.map((funcao) => (
                        <option key={funcao.codigo} value={funcao.codigo}>
                          {funcao.nome}
                        </option>
                      ))}
                    </select>
                  </label>
                  <Botao
                    variante="icone"
                    aria-label={`Tirar ${nomes.get(linha.funcao) ?? "a função"} da regra`}
                    onClick={() => setEdicao((atuais) => atuais.filter((item) => item.chave !== linha.chave))}
                    icone={<Trash2 size={18} aria-hidden />}
                  />
                </div>
                <div role="radiogroup" aria-label="Como calcular" className="mt-3 grid gap-1">
                  {[...MODOS, ...(personalizadas.has(linha.funcao) ? [{ modo: "PERSONALIZADA" as const, rotulo: "Manter o cálculo personalizado" }] : [])].map(
                    (opcao) => (
                      <label key={opcao.modo} className="flex min-h-6 items-center gap-2 text-[14px]">
                        <input
                          type="radio"
                          name={`modo-${linha.chave}`}
                          checked={linha.modo === opcao.modo}
                          onChange={() => mudar(linha.chave, { modo: opcao.modo })}
                          className="h-[18px] w-[18px] accent-[var(--ds-brand)]"
                        />
                        {opcao.rotulo}
                        {opcao.modo === "FIXO" && linha.modo === "FIXO" && (
                          <input
                            name={`${prefixo}.quantidade`}
                            aria-label="Número fixo de vagas"
                            inputMode="numeric"
                            value={linha.quantidade}
                            onChange={(evento) => mudar(linha.chave, { quantidade: evento.target.value })}
                            className={`${CAMPO} h-8 w-20`}
                          />
                        )}
                        {(opcao.modo === "POR_PUBLICO" || opcao.modo === "POR_FILA") && linha.modo === opcao.modo && (
                          <input
                            name={`${prefixo}.cada`}
                            aria-label="N (pessoas por vaga)"
                            inputMode="numeric"
                            value={linha.cada}
                            onChange={(evento) => mudar(linha.chave, { cada: evento.target.value })}
                            className={`${CAMPO} h-8 w-20`}
                          />
                        )}
                        {opcao.modo === "POR_FUNCAO" && linha.modo === "POR_FUNCAO" && (
                          <>
                            <input
                              name={`${prefixo}.multiplicador`}
                              aria-label="Quantas vagas para cada vaga da outra função"
                              inputMode="numeric"
                              value={linha.multiplicador}
                              onChange={(evento) => mudar(linha.chave, { multiplicador: evento.target.value })}
                              className={`${CAMPO} h-8 w-16`}
                            />
                            <select
                              name={`${prefixo}.base`}
                              aria-label="Função de base"
                              value={linha.base}
                              onChange={(evento) => mudar(linha.chave, { base: evento.target.value })}
                              className={`${CAMPO} h-8 pr-8`}
                            >
                              <option value="">Função anterior</option>
                              {anteriores.map((codigo) => (
                                <option key={codigo} value={codigo}>
                                  {nomes.get(codigo) ?? codigo}
                                </option>
                              ))}
                            </select>
                          </>
                        )}
                        {opcao.modo === "PERSONALIZADA" && linha.modo === "PERSONALIZADA" && (
                          <>
                            <input type="hidden" name={`${prefixo}.formula`} value={linha.formula} />
                            <span className="text-[12px] text-[var(--ds-label-2)] [font-family:var(--ds-font-mono)]">{linha.formula}</span>
                          </>
                        )}
                      </label>
                    ),
                  )}
                </div>
                <p className="mt-2 text-[12px] text-[var(--ds-label-2)]" aria-live="polite">
                  {linha.modo === "DIGITADO"
                    ? "Quem monta a escala digita o número em cada evento."
                    : valor !== null && valor !== undefined
                      ? `Prévia: com ${publicoDeExemplo} pessoas de público e ${filaDeExemplo} na fila, ${valor} ${valor === 1 ? "vaga" : "vagas"}.`
                      : "Prévia indisponível: complete os campos."}
                </p>
              </fieldset>
            );
          })}
          <div>
            <Botao
              variante="texto"
              icone={<Plus size={18} aria-hidden />}
              onClick={() => {
                setEdicao((atuais) => [...atuais, { chave: proximaChave, funcao: "", modo: "FIXO", quantidade: "1", cada: "25", multiplicador: "2", base: "", formula: "" }]);
                setProximaChave((chave) => chave + 1);
              }}
            >
              Adicionar função
            </Botao>
          </div>
        </form>
      </PainelLateral>
    </div>
  );
}
