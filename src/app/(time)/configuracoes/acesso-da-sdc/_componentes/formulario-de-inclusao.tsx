"use client";

import { type AcaoDoFormulario, ErroDoFormulario, useAcao } from "@/app/(time)/_componentes/ui";
import { BotaoDeEnvio } from "@/app/(time)/_componentes/ui/botao";
import { CampoDeTexto } from "@/app/(time)/_componentes/ui/campo";

/** Inclui um e-mail da SDC. O formulário limpa sozinho quando dá certo (a lista acima mostra a pessoa nova). */
export function FormularioDeInclusao({ acao }: { acao: AcaoDoFormulario }) {
  const { despachar, erros, estado } = useAcao(acao);
  return (
    <form action={despachar} aria-label="Incluir e-mail da SDC" className="mt-3">
      <ErroDoFormulario estado={estado} />
      <div className="grid gap-3 sm:grid-cols-2">
        <CampoDeTexto nome="nome" rotulo="Nome da pessoa" obrigatorio maxLength={120} erros={erros("nome")} />
        <CampoDeTexto
          nome="email"
          rotulo="E-mail (conta Google)"
          type="email"
          inputMode="email"
          autoComplete="off"
          obrigatorio
          maxLength={254}
          ajuda="O mesmo e-mail com que a pessoa entra no Google."
          erros={erros("email")}
        />
      </div>
      <div className="mt-4 flex justify-end">
        <BotaoDeEnvio textoCarregando="Incluindo…">Incluir na lista</BotaoDeEnvio>
      </div>
    </form>
  );
}
