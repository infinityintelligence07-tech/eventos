"use client";

import { CircleCheck } from "lucide-react";
import { type MouseEvent, useActionState, useEffect, useId, useRef } from "react";

import { responderEnqueteAcao, type ResultadoDaRespostaDaEnquete } from "../acoes";
import { avisoDaResposta, RESPOSTA_GRAVADA } from "./aviso";

export type EventoDoFormulario = { id: string; nome: string; quando: string; onde: string | null; marcado: boolean };

export function FormularioDaResposta({ enqueteId, eventos, jaRespondeu }: { enqueteId: string; eventos: EventoDoFormulario[]; jaRespondeu: boolean }) {
  const [resultado, enviar, enviando] = useActionState<ResultadoDaRespostaDaEnquete, FormData>(responderEnqueteAcao, null);
  const aviso = avisoDaResposta(resultado);
  const popup = useRef<HTMLDialogElement>(null);
  const botaoDeEnviar = useRef<HTMLButtonElement>(null);
  const idDoTitulo = useId();

  // Cada envio devolve um resultado novo: o pop-up abre a cada gravação (inclusive ao alterar a resposta) e nunca
  // ao carregar a página, quando o resultado ainda é nulo.
  useEffect(() => {
    const dialogo = popup.current;
    if (resultado?.ok && dialogo && !dialogo.open) dialogo.showModal();
  }, [resultado]);

  function aoClicarFora(evento: MouseEvent<HTMLDialogElement>) {
    if (evento.target === evento.currentTarget) evento.currentTarget.close();
  }

  // O <dialog> devolve o foco sozinho; quando o navegador o perdeu (botão desabilitado durante o envio), volta ao envio.
  function aoFechar() {
    if (document.activeElement === document.body) botaoDeEnviar.current?.focus();
  }

  return (
    <>
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

        {/* Na gravação quem anuncia é o pop-up; o resumo fica na tela sem repetir o anúncio. */}
        {aviso.tipo === "gravada" && <p className="cadastro-ok">{aviso.resumo}</p>}
        {aviso.tipo === "erro" && (
          <p className="login-error" role="alert">
            {aviso.mensagem}
          </p>
        )}
        <button ref={botaoDeEnviar} type="submit" className="login-submit" disabled={enviando}>
          {enviando ? "Enviando..." : jaRespondeu ? "Atualizar minha resposta" : "Enviar minha resposta"}
        </button>
      </form>

      {/* <dialog> nativo com showModal(): o foco vai para "Fechar" (único controle), Esc fecha e o foco volta para a página. */}
      <dialog ref={popup} className="resposta-gravada" aria-labelledby={idDoTitulo} onClick={aoClicarFora} onClose={aoFechar}>
        <div className="resposta-gravada-conteudo">
          <span className="resposta-gravada-icone" aria-hidden>
            <CircleCheck size={28} />
          </span>
          <h2 id={idDoTitulo}>{RESPOSTA_GRAVADA}</h2>
          <button type="button" className="login-submit" onClick={() => popup.current?.close()}>
            Fechar
          </button>
        </div>
      </dialog>
    </>
  );
}
