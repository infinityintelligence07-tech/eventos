"use client";

import { useState } from "react";

import { type AcaoDoFormulario, FormularioDeAcao } from "@/app/(time)/_componentes/ui";
import { BotaoDeEnvio } from "@/app/(time)/_componentes/ui/botao";
import { CAMPO } from "@/app/(time)/_componentes/ui/classes";

type Nivel = "SEM_ACESSO" | "TIME" | "LIDER";

/** Na linha de quem já tem acesso: troca entre Time e Líder ou retira. O botão só aparece quando algo mudou. */
export function MudarAcesso({ acao, usuarioId, nome, nivel }: { acao: AcaoDoFormulario; usuarioId: string; nome: string; nivel: Nivel }) {
  const [escolhido, setEscolhido] = useState<Nivel>(nivel);
  return (
    <FormularioDeAcao acao={acao} className="flex flex-wrap items-center justify-end gap-2">
      <input type="hidden" name="usuarioId" value={usuarioId} />
      <select
        name="nivel"
        aria-label={`Acesso de ${nome}`}
        value={escolhido}
        onChange={(evento) => setEscolhido(evento.target.value as Nivel)}
        className={`${CAMPO} w-auto pl-3 pr-8`}
      >
        <option value="LIDER">Líder</option>
        <option value="TIME">Time</option>
        <option value="SEM_ACESSO">Retirar acesso</option>
      </select>
      {escolhido !== nivel && (
        <BotaoDeEnvio tamanho="pequeno" variante={escolhido === "SEM_ACESSO" ? "perigo" : "primario"} textoCarregando="Salvando…">
          {escolhido === "SEM_ACESSO" ? "Retirar" : "Salvar"}
        </BotaoDeEnvio>
      )}
    </FormularioDeAcao>
  );
}

/** No resultado da busca: libera a conta como Time ou como Líder. */
export function LiberarAcesso({ acao, usuarioId, nome }: { acao: AcaoDoFormulario; usuarioId: string; nome: string }) {
  return (
    <FormularioDeAcao acao={acao} className="flex flex-wrap items-center justify-end gap-2">
      <input type="hidden" name="usuarioId" value={usuarioId} />
      <BotaoDeEnvio name="nivel" value="TIME" tamanho="pequeno" variante="secundario" aria-label={`Liberar ${nome} como Time`} textoCarregando="Liberando…">
        Liberar como Time
      </BotaoDeEnvio>
      <BotaoDeEnvio name="nivel" value="LIDER" tamanho="pequeno" variante="secundario" aria-label={`Liberar ${nome} como Líder`} textoCarregando="Liberando…">
        Liberar como Líder
      </BotaoDeEnvio>
    </FormularioDeAcao>
  );
}
