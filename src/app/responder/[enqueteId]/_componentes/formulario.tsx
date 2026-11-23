"use client";

import { useActionState } from "react";

import { responderEnqueteAcao, type ResultadoDaRespostaDaEnquete } from "../acoes";

export type EventoDoFormulario = { id: string; nome: string; quando: string; onde: string | null; marcado: boolean };

function mensagemDeSucesso(podem: number, total: number): string {
  if (podem === 0) return "Resposta enviada: você não pode em nenhum destes eventos.";
  return `Resposta enviada: você pode em ${podem} de ${total} ${total === 1 ? "evento" : "eventos"}.`;
}

export function FormularioDaResposta({ enqueteId, eventos, jaRespondeu }: { enqueteId: string; eventos: EventoDoFormulario[]; jaRespondeu: boolean }) {
  const [resultado, enviar, enviando] = useActionState<ResultadoDaRespostaDaEnquete, FormData>(responderEnqueteAcao, null);

  return (
    <form action={enviar} className="cadastro-form">
      <input type="hidden" name="enqueteId" value={enqueteId} />
      <fieldset>
        <legend>Em quais destes eventos você pode servir?</legend>
        <p className="cadastro-ajuda">Marque os eventos em que você pode. Os que ficarem sem marcar contam como &quot;não posso&quot;.</p>
        <div className="cadastro-opcoes">
          {eventos.map((evento) => (
            <label key={evento.id} className="cadastro-opcao resposta-evento">
              <input type="checkbox" name="eventoIds" value={evento.id} defaultChecked={evento.marcado} />
              <span>
                {evento.nome}
                <small>
                  {evento.quando}
                  {evento.onde ? ` · ${evento.onde}` : ""}
                </small>
              </span>
            </label>
          ))}
        </div>
      </fieldset>

      {resultado && (
        <p className={resultado.ok ? "cadastro-ok" : "login-error"} role={resultado.ok ? "status" : "alert"}>
          {resultado.ok ? `${mensagemDeSucesso(resultado.podem, resultado.total)} Você pode alterar até a enquete fechar.` : resultado.mensagem}
        </p>
      )}
      <button type="submit" className="login-submit" disabled={enviando}>
        {enviando ? "Enviando..." : jaRespondeu ? "Atualizar minha resposta" : "Enviar minha resposta"}
      </button>
    </form>
  );
}
