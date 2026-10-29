"use client";

import { RotateCcw, Send } from "lucide-react";
import { useState } from "react";

import { AprovarOuDevolver } from "../../../../escalas/_componentes/aprovar-ou-devolver";
import { useAcao } from "@/app/(time)/_componentes/ui";
import { Botao } from "../../../../_componentes/ui/botao";
import { BotaoLink } from "../../../../_componentes/ui/botao-link";
import { CampoDeTextoLongo } from "../../../../_componentes/ui/campo";
import { Confirmacao } from "../../../../_componentes/ui/dialogo";
import { BarraDeAcao } from "../../../../_componentes/ui/estados";
import { aprovarEscala, devolverEscala, enviarParaAprovacao, reabrirEscala } from "../acoes";

export type SituacaoDaBarra =
  | { tipo: "MONTANDO"; statusEsperado: "RASCUNHO" | "DEVOLVIDA"; pode: boolean; motivos: string[]; vagasAbertas: number }
  | { tipo: "COM_A_LIDER" }
  | { tipo: "APROVADA"; statusEsperado: "APROVADA" | "COMUNICADA" }
  | { tipo: "SO_LEITURA" };

function Enviar({ eventoId, situacao }: { eventoId: string; situacao: Extract<SituacaoDaBarra, { tipo: "MONTANDO" }> }) {
  const [confirmando, setConfirmando] = useState(false);
  const { despachar, pendente } = useAcao(enviarParaAprovacao, { aoConcluir: () => setConfirmando(false), toastDeCampo: true });
  const rotulo = situacao.statusEsperado === "DEVOLVIDA" ? "Reenviar para aprovação" : "Enviar para aprovação";
  const campos = (
    <>
      <input type="hidden" name="eventoId" value={eventoId} />
      <input type="hidden" name="statusEsperado" value={situacao.statusEsperado} />
    </>
  );

  if (!situacao.pode) {
    return (
      <Botao variante="primario" icone={<Send size={18} aria-hidden />} motivoDesabilitado={situacao.motivos.join(" ")}>
        {rotulo}
      </Botao>
    );
  }
  if (situacao.vagasAbertas > 0) {
    const abertas = situacao.vagasAbertas === 1 ? "1 vaga aberta" : `${situacao.vagasAbertas} vagas abertas`;
    return (
      <>
        <Botao variante="primario" icone={<Send size={18} aria-hidden />} onClick={() => setConfirmando(true)}>
          {rotulo}
        </Botao>
        <Confirmacao
          aberto={confirmando}
          aoFechar={() => setConfirmando(false)}
          titulo={`Enviar com ${abertas}?`}
          descricao="A líder vai ver quais funções estão incompletas."
          rotuloConfirmar="Enviar mesmo assim"
          rotuloCancelar="Continuar montando"
          carregando={pendente}
          acao={despachar}
        >
          {campos}
        </Confirmacao>
      </>
    );
  }
  return (
    <form action={despachar}>
      {campos}
      <Botao type="submit" variante="primario" icone={<Send size={18} aria-hidden />} carregando={pendente} textoCarregando="Enviando…">
        {rotulo}
      </Botao>
    </form>
  );
}

function Reabrir({ eventoId, statusEsperado }: { eventoId: string; statusEsperado: "APROVADA" | "COMUNICADA" }) {
  const [aberto, setAberto] = useState(false);
  const { despachar, pendente } = useAcao(reabrirEscala, { aoConcluir: () => setAberto(false), toastDeCampo: true });
  return (
    <>
      <Botao icone={<RotateCcw size={18} aria-hidden />} onClick={() => setAberto(true)}>
        Reabrir escala
      </Botao>
      <Confirmacao
        aberto={aberto}
        aoFechar={() => setAberto(false)}
        titulo="Reabrir a escala?"
        descricao="A escala volta para rascunho e a aprovação é desfeita. Depois das mudanças, envie para aprovação de novo. Quem já recebeu a copy continua na escala."
        rotuloConfirmar="Reabrir escala"
        carregando={pendente}
        acao={despachar}
      >
        <input type="hidden" name="eventoId" value={eventoId} />
        <input type="hidden" name="statusEsperado" value={statusEsperado} />
        <CampoDeTextoLongo nome="motivo" rotulo="Motivo (opcional)" maxLength={1000} />
      </Confirmacao>
    </>
  );
}

export function BarraDaEscala({
  eventoId,
  codigo,
  resumo,
  situacao,
}: {
  eventoId: string;
  codigo: string;
  resumo: string;
  situacao: SituacaoDaBarra;
}) {
  return (
    <BarraDeAcao>
      <p className="text-[14px] text-[var(--ds-label-2)]">{resumo}</p>
      <div className="flex flex-wrap items-center gap-2">
        {(() => {
          switch (situacao.tipo) {
            case "MONTANDO":
              return <Enviar eventoId={eventoId} situacao={situacao} />;
            case "COM_A_LIDER":
              return <AprovarOuDevolver eventoId={eventoId} codigo={codigo} aprovar={aprovarEscala} devolver={devolverEscala} />;
            case "APROVADA":
              return (
                <>
                  <Reabrir eventoId={eventoId} statusEsperado={situacao.statusEsperado} />
                  <BotaoLink href={`/eventos/${eventoId}/comunicacao`} variante="primario">
                    Ir para Comunicação
                  </BotaoLink>
                </>
              );
            case "SO_LEITURA":
              return null;
            default: {
              const desconhecida: never = situacao;
              throw new Error(`situação desconhecida: ${JSON.stringify(desconhecida)}`);
            }
          }
        })()}
      </div>
    </BarraDeAcao>
  );
}
