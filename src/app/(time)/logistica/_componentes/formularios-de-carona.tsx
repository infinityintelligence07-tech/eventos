"use client";

import { Car } from "lucide-react";
import { useState } from "react";

import { type AcaoDoFormulario, ErroDoFormulario, useAcao } from "@/app/(time)/_componentes/ui";

import { Botao, BotaoDeEnvio } from "../../_componentes/ui/botao";
import { CampoDeSelecao } from "../../_componentes/ui/campo";
import { PainelLateral } from "../../_componentes/ui/dialogo";

/** "Novo motorista": botão padrão que abre o painel com quem está escalado e tem carro. */
export function BotaoNovoMotorista({
  acao,
  eventoId,
  rotuloDoEvento,
  candidatos,
}: {
  acao: AcaoDoFormulario;
  eventoId: string;
  rotuloDoEvento: string;
  candidatos: { valor: string; rotulo: string }[];
}) {
  const [aberto, setAberto] = useState(false);
  const { despachar, erros, estado } = useAcao(acao, () => setAberto(false));
  return (
    <>
      <Botao
        variante="primario"
        icone={<Car size={18} aria-hidden />}
        onClick={() => setAberto(true)}
        motivoDesabilitado={candidatos.length === 0 ? "Ninguém escalado com carro cadastrado." : undefined}
        className="whitespace-nowrap"
      >
        Novo motorista
      </Botao>
      <PainelLateral aberto={aberto} aoFechar={() => setAberto(false)} titulo="Novo motorista" subtitulo={rotuloDoEvento}>
        <form action={despachar} aria-label="Novo motorista">
          <ErroDoFormulario estado={estado} />
          <input type="hidden" name="eventoId" value={eventoId} />
          <CampoDeSelecao
            nome="motoristaConvocacaoId"
            rotulo="Motorista"
            obrigatorio
            opcoes={candidatos}
            ajuda="Só aparecem pessoas escaladas neste evento com veículo no cadastro."
            erros={erros("motoristaConvocacaoId")}
          />
          <div className="mt-5 flex justify-end gap-2">
            <Botao onClick={() => setAberto(false)}>Cancelar</Botao>
            <BotaoDeEnvio textoCarregando="Salvando…">Adicionar motorista</BotaoDeEnvio>
          </div>
        </form>
      </PainelLateral>
    </>
  );
}
