"use client";

import { useState } from "react";

import { type AcaoDoFormulario, FormularioDeAcao } from "@/app/(time)/_componentes/ui";
import { BotaoDeEnvio } from "@/app/(time)/_componentes/ui/botao";
import { Seletor } from "@/app/(time)/_componentes/ui/seletor";

type Nivel = "SEM_ACESSO" | "TIME" | "LIDER";

const NIVEIS: { valor: Nivel; rotulo: string }[] = [
  { valor: "LIDER", rotulo: "Líder" },
  { valor: "TIME", rotulo: "Time" },
  { valor: "SEM_ACESSO", rotulo: "Retirar acesso" },
];

/** Na linha de quem já tem acesso: troca entre Time e Líder ou retira. O botão só aparece quando algo mudou. */
export function MudarAcesso({ acao, usuarioId, nome, nivel }: { acao: AcaoDoFormulario; usuarioId: string; nome: string; nivel: Nivel }) {
  const [escolhido, setEscolhido] = useState<Nivel>(nivel);
  return (
    <FormularioDeAcao acao={acao} className="flex flex-wrap items-center justify-end gap-2">
      <input type="hidden" name="usuarioId" value={usuarioId} />
      <Seletor
        nome="nivel"
        aria-label={`Acesso de ${nome}`}
        valor={escolhido}
        aoMudar={(novo) => setEscolhido(NIVEIS.find((opcao) => opcao.valor === novo)?.valor ?? nivel)}
        opcoes={NIVEIS}
        className="w-auto min-w-[160px]"
      />
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
