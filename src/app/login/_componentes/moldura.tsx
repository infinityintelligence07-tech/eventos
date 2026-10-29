import Image from "next/image";
import type { ReactNode } from "react";

/** Fundo escuro, marca à esquerda e cartão de vidro à direita (visual do IAM Control). */
export function MolduraDeEntrada({ children }: { children: ReactNode }) {
  return (
    <main className="google-login">
      <section className="login-brand" aria-label="Eventos IAM">
        <div>
          <Image className="login-brand-logo" src="/images/logo/logo-branco.svg" alt="IAM" width={130} height={52} priority />
        </div>
        <div className="login-brand-copy">
          <h2>Eventos IAM</h2>
          <p>Escalas, comunicação, logística e custos do time de eventos.</p>
        </div>
      </section>
      <section className="login-panel">
        <div className="login-form">{children}</div>
      </section>
    </main>
  );
}
