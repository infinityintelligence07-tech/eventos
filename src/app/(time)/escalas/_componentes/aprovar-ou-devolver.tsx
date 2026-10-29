"use client";

import { BadgeCheck, Undo2 } from "lucide-react";
import { useState } from "react";

import { Botao } from "../../_componentes/ui/botao";
import { CampoDeTextoLongo } from "../../_componentes/ui/campo";
import { Confirmacao } from "../../_componentes/ui/dialogo";
import { type AcaoDoFormulario, useAcao } from "@/app/(time)/_componentes/ui";

const LIMITE_DO_COMENTARIO = 1000;

/** Aprovar (sem modal: é reversível reabrindo) e Devolver (modal com comentário opcional). doc 08 §6.3. */
export function AprovarOuDevolver({
  eventoId,
  codigo,
  aprovar,
  devolver,
  aoConcluir,
}: {
  eventoId: string;
  codigo: string;
  aprovar: AcaoDoFormulario;
  devolver: AcaoDoFormulario;
  aoConcluir?: () => void;
}) {
  const [devolvendo, setDevolvendo] = useState(false);
  const [comentario, setComentario] = useState("");
  const aprovacao = useAcao(aprovar, { aoConcluir, toastDeCampo: true });
  const devolucao = useAcao(devolver, {
    aoConcluir: () => {
      setDevolvendo(false);
      setComentario("");
      aoConcluir?.();
    },
    toastDeCampo: true,
  });

  return (
    <div className="flex flex-wrap gap-2">
      <Botao variante="perigo" icone={<Undo2 size={18} aria-hidden />} onClick={() => setDevolvendo(true)} aria-label={`Devolver escala ${codigo}`}>
        Devolver
      </Botao>
      <form action={aprovacao.despachar}>
        <input type="hidden" name="eventoId" value={eventoId} />
        <Botao
          type="submit"
          variante="primario"
          icone={<BadgeCheck size={18} aria-hidden />}
          carregando={aprovacao.pendente}
          textoCarregando="Aprovando…"
          aria-label={`Aprovar escala ${codigo}`}
        >
          Aprovar
        </Botao>
      </form>
      <Confirmacao
        aberto={devolvendo}
        aoFechar={() => setDevolvendo(false)}
        titulo={`Devolver a escala ${codigo}?`}
        descricao="Quem montou vai ver seu comentário e poderá reenviar."
        rotuloConfirmar="Devolver escala"
        destrutiva
        carregando={devolucao.pendente}
        acao={devolucao.despachar}
      >
        <input type="hidden" name="eventoId" value={eventoId} />
        <CampoDeTextoLongo
          nome="comentario"
          id={`comentario-${eventoId}`}
          rotulo="Comentário (opcional)"
          maxLength={LIMITE_DO_COMENTARIO}
          value={comentario}
          onChange={(evento) => setComentario(evento.target.value)}
          ajuda={`${comentario.length} de ${LIMITE_DO_COMENTARIO} caracteres`}
          erros={devolucao.erros("comentario")}
        />
      </Confirmacao>
    </div>
  );
}
