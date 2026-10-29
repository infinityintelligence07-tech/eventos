"use client";

import { useEffect, useRef } from "react";

/** Envia o POST para /auth/sair assim que a página abre; o botão fica para quem está sem JavaScript. */
export function FormularioDeSaida({ motivo }: { motivo: string | null }) {
  const formulario = useRef<HTMLFormElement>(null);
  useEffect(() => formulario.current?.requestSubmit(), []);
  return (
    <form ref={formulario} method="post" action="/auth/sair">
      {motivo && <input type="hidden" name="motivo" value={motivo} />}
      <button type="submit" className="login-submit">
        Continuar
      </button>
    </form>
  );
}
