"use client";

import { useState } from "react";
import { type AcaoDoFormulario, ErroDoFormulario, useAcao } from "@/app/(time)/_componentes/ui";

import { Aviso } from "../../../_componentes/ui/aviso";
import { Botao, BotaoDeEnvio } from "../../../_componentes/ui/botao";
import { CampoDeTexto, CampoDeTextoLongo } from "../../../_componentes/ui/campo";
import { PainelLateral } from "../../../_componentes/ui/dialogo";

export type CamposDaRegra = {
  /** Remuneração, alimentação, adicionais…: o valor em R$. */
  valor: string | null;
  /** Depreciação: faixa de km. */
  faixa: { kmMin: string; kmMax: string } | null;
  /** Limites de alerta. */
  limite: { kmLMin: string; kmLMax: string | null; custoKmMax: string } | null;
};

/** "Editar" (doc 08 §12.1): cria uma vigência nova; a antiga fica guardada. */
export function EditarRegra({
  acao,
  regraId,
  nome,
  hoje,
  campos,
  historico,
}: {
  acao: AcaoDoFormulario;
  regraId: string;
  nome: string;
  hoje: string;
  campos: CamposDaRegra;
  historico: { vigenteDesde: string; texto: string; ativo: boolean }[];
}) {
  const [aberto, setAberto] = useState(false);
  const { despachar, erros, estado } = useAcao(acao, () => setAberto(false));
  return (
    <>
      <Botao tamanho="pequeno" onClick={() => setAberto(true)} aria-label={`Editar ${nome}`}>
        Editar
      </Botao>
      <PainelLateral aberto={aberto} aoFechar={() => setAberto(false)} titulo={`Editar ${nome}`} subtitulo="O valor antigo fica guardado. Solicitações já registradas não mudam.">
        <form action={despachar} aria-label={`Novo valor de ${nome}`}>
          <ErroDoFormulario estado={estado} />
          <input type="hidden" name="regraId" value={regraId} />
          {campos.valor !== null && (
            <CampoDeTexto nome="valorCentavos" rotulo="Valor (R$)" obrigatorio inputMode="decimal" defaultValue={campos.valor} erros={erros("valorCentavos")} />
          )}
          {campos.faixa && (
            <div className="mt-3 grid grid-cols-2 gap-3">
              <CampoDeTexto nome="kmMin" rotulo="A partir de (km)" inputMode="decimal" defaultValue={campos.faixa.kmMin} erros={erros("kmMin")} />
              <CampoDeTexto nome="kmMax" rotulo="Até (km)" inputMode="decimal" defaultValue={campos.faixa.kmMax} ajuda="Vazio = sem limite." erros={erros("kmMax")} />
            </div>
          )}
          {campos.limite && (
            <div className="grid grid-cols-2 gap-3">
              <CampoDeTexto nome="kmLMin" rotulo="Consumo abaixo de (km/l)" inputMode="decimal" defaultValue={campos.limite.kmLMin} erros={erros("kmLMin")} />
              {campos.limite.kmLMax !== null && (
                <CampoDeTexto nome="kmLMax" rotulo="Consumo acima de (km/l)" inputMode="decimal" defaultValue={campos.limite.kmLMax} erros={erros("kmLMax")} />
              )}
              <CampoDeTexto nome="custoKmMaxCentavos" rotulo="Custo por km acima de (R$)" inputMode="decimal" defaultValue={campos.limite.custoKmMax} erros={erros("custoKmMaxCentavos")} />
            </div>
          )}
          <CampoDeTexto className="mt-3" nome="vigenteDesde" rotulo="Vale a partir de" type="date" obrigatorio defaultValue={hoje} erros={erros("vigenteDesde")} />
          <CampoDeTextoLongo className="mt-3" nome="observacao" rotulo="Observação" maxLength={500} erros={erros("observacao")} />
          <div className="mt-5 flex justify-end gap-2">
            <Botao onClick={() => setAberto(false)}>Cancelar</Botao>
            <BotaoDeEnvio textoCarregando="Salvando…">Salvar novo valor</BotaoDeEnvio>
          </div>
        </form>
        {historico.length > 1 && (
          <section aria-labelledby={`historico-${regraId}`} className="mt-6">
            <h3 id={`historico-${regraId}`} className="mb-2 text-[15px] font-semibold">
              Valores anteriores
            </h3>
            <ul className="flex flex-col gap-1 text-[13px]">
              {historico.map((vigencia) => (
                <li key={vigencia.vigenteDesde} className="flex justify-between gap-2">
                  <span>
                    Desde {vigencia.vigenteDesde.slice(8, 10)}/{vigencia.vigenteDesde.slice(5, 7)}/{vigencia.vigenteDesde.slice(0, 4)}
                    {!vigencia.ativo && " (inativa)"}
                  </span>
                  <span className="tabular-nums">{vigencia.texto}</span>
                </li>
              ))}
            </ul>
          </section>
        )}
        {campos.limite && (
          <Aviso tom="informacao" className="mt-4">
            Crítico e alerta seguem o doc de regras de custo: a solicitação entra na fila com o nível mais grave.
          </Aviso>
        )}
      </PainelLateral>
    </>
  );
}
