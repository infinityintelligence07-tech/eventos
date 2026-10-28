import "./globals.css";

import type { Metadata } from "next";
import type { ReactNode } from "react";

export const metadata: Metadata = {
  title: { default: "Eventos IAM", template: "%s · Eventos IAM" },
};

// Aplica o tema salvo antes da primeira pintura, para a tela não piscar em claro.
const TEMA_SALVO = `try{if(localStorage.getItem("tema")==="escuro"){var h=document.documentElement;h.classList.add("dark");h.dataset.dsScheme="dark"}}catch(e){}`;

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="pt-BR" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: TEMA_SALVO }} />
      </head>
      <body>{children}</body>
    </html>
  );
}
