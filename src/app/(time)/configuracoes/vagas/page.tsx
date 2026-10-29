import type { Metadata } from "next";

import { situacaoDaEscrita } from "@/fluxos/_base";
import { FILA_DE_EXEMPLO, listarRegrasDeVagas, PUBLICO_DE_EXEMPLO } from "@/fluxos/escalas";

import { Aviso, FaixaSomenteLeitura } from "../../_componentes/ui/aviso";
import { Cartao } from "../../_componentes/ui/cartao";
import { EditorDeRegra } from "./_componentes/editor-de-regra";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Vagas por tipo de evento" };

export default async function PaginaRegrasDeVagas() {
  const [{ tipos, funcoes }, escrita] = await Promise.all([listarRegrasDeVagas(), situacaoDaEscrita()]);
  const nomes = new Map(funcoes.map((funcao) => [funcao.codigo, funcao.nome]));

  return (
    <>
      {!escrita.liberada && <FaixaSomenteLeitura />}
      <div className="grid gap-3 md:grid-cols-2">
        {tipos.map((tipo) => (
          <Cartao
            key={tipo.id}
            id={`tipo-${tipo.sigla}`}
            titulo={`${tipo.nome} (${tipo.sigla})`}
            acoes={
              tipo.erros ? undefined : (
                <EditorDeRegra
                  tipoEventoId={tipo.id}
                  nomeDoTipo={tipo.nome}
                  linhas={tipo.linhas}
                  funcoes={funcoes}
                  publicoDeExemplo={PUBLICO_DE_EXEMPLO}
                  filaDeExemplo={FILA_DE_EXEMPLO}
                  escritaLiberada={escrita.liberada}
                />
              )
            }
          >
            {tipo.erros ? (
              <Aviso tom="perigo" titulo="A regra gravada tem erro.">
                {tipo.erros.join("; ")}
              </Aviso>
            ) : tipo.linhas.length === 0 ? (
              <Aviso tom="atencao">Sem regra: estes eventos não recebem vagas sugeridas.</Aviso>
            ) : (
              <>
                <ul className="grid gap-1 text-[14px]">
                  {tipo.linhas.map((linha) => (
                    <li key={linha.funcao}>
                      <span className="font-medium">{linha.nomeDaFuncao}:</span> {linha.descricao}
                    </li>
                  ))}
                </ul>
                {tipo.previa.length > 0 && (
                  <p className="mt-3 text-[13px] text-[var(--ds-label-2)]">
                    Com {PUBLICO_DE_EXEMPLO} pessoas de público e {FILA_DE_EXEMPLO} na fila:{" "}
                    {tipo.previa.map((vaga) => `${vaga.quantidade} ${nomes.get(vaga.funcao) ?? vaga.funcao}`).join(", ")}.
                  </p>
                )}
              </>
            )}
          </Cartao>
        ))}
      </div>
    </>
  );
}
