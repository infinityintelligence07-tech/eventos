"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { useAcao } from "@/app/(time)/_componentes/ui";
import { FaixaEmNomeDe } from "../../../../_componentes/ui/aviso";
import { Botao } from "../../../../_componentes/ui/botao";
import { CaixaDeMarcar, CampoDeTextoLongo } from "../../../../_componentes/ui/campo";
import { PainelLateral } from "../../../../_componentes/ui/dialogo";
import { registrarRespostaDoStaff } from "../acoes";

/** "Registrar resposta" em nome da pessoa (doc 08 §6.2): fica marcado como registrado pelo time. */
export function PainelDeResposta({
  eventoId,
  convocacaoId,
  nome,
  respostaAtual,
  caminho,
}: {
  eventoId: string;
  convocacaoId: string;
  nome: string;
  respostaAtual: "ACEITA" | "RECUSADA" | null;
  caminho: string;
}) {
  const router = useRouter();
  const fechar = () => router.replace(caminho, { scroll: false });
  const { erros, enviar, pendente } = useAcao(registrarRespostaDoStaff, { aoConcluir: fechar, toastDeCampo: true });
  const [resposta, setResposta] = useState<"ACEITA" | "RECUSADA" | null>(respostaAtual === "ACEITA" ? "RECUSADA" : respostaAtual === "RECUSADA" ? "ACEITA" : null);
  const idDoFormulario = "formulario-registrar-resposta";

  return (
    <PainelLateral
      aberto
      aoFechar={fechar}
      titulo="Registrar resposta"
      subtitulo={nome}
      rodape={
        <>
          <Botao onClick={fechar}>Cancelar</Botao>
          <Botao type="submit" form={idDoFormulario} variante="primario" carregando={pendente} textoCarregando="Registrando…">
            Registrar resposta
          </Botao>
        </>
      }
    >
      <FaixaEmNomeDe nome={nome} />
      <form id={idDoFormulario} onSubmit={enviar} className="grid gap-3">
        <input type="hidden" name="eventoId" value={eventoId} />
        <input type="hidden" name="convocacaoId" value={convocacaoId} />
        <fieldset>
          <legend className="mb-1 text-[13px] font-medium">Resposta</legend>
          <CaixaDeMarcar type="radio" name="resposta" value="ACEITA" rotulo="Confirmou" checked={resposta === "ACEITA"} onChange={() => setResposta("ACEITA")} />
          <CaixaDeMarcar type="radio" name="resposta" value="RECUSADA" rotulo="Não pode" checked={resposta === "RECUSADA"} onChange={() => setResposta("RECUSADA")} />
          {erros("resposta") && (
            <p className="mt-1 text-[12px] font-medium text-[var(--ds-red-deep)]">{erros("resposta")![0]}</p>
          )}
        </fieldset>
        {resposta === "RECUSADA" && (
          <CampoDeTextoLongo nome="motivoRecusa" rotulo="Motivo (opcional)" maxLength={500} erros={erros("motivoRecusa")} />
        )}
        {respostaAtual && (
          <p className="text-[12px] text-[var(--ds-label-2)]">
            Resposta atual: {respostaAtual === "ACEITA" ? "confirmou" : "não pode"}. Registrar de novo troca a resposta (a pessoa mudou de ideia).
          </p>
        )}
      </form>
    </PainelLateral>
  );
}
