"use client";

import { useEffect, useRef } from "react";

/**
 * No celular a tabela vira uma lista de cartões (globals.css, .tabela-em-cartoes) e cada célula mostra o nome da sua
 * coluna, lido de `data-rotulo`. Este componente copia o texto dos cabeçalhos para as células e repete quando as
 * linhas mudam (filtro, "mostrar mais"). Não desenha nada.
 */
export function RotulosDasCelulas() {
  const marca = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    const tabela = marca.current?.parentElement?.querySelector("table");
    if (!tabela) return;

    const rotular = () => {
      const colunas = [...tabela.querySelectorAll<HTMLTableCellElement>("thead th")].map((th) => (th.textContent ?? "").trim());
      for (const linha of tabela.querySelectorAll<HTMLTableRowElement>("tbody tr, tfoot tr")) {
        let coluna = 0;
        for (const celula of linha.cells) {
          const rotulo = celula.colSpan > 1 ? "" : (colunas[coluna] ?? "");
          if (celula.dataset.rotulo !== rotulo) celula.dataset.rotulo = rotulo;
          coluna += celula.colSpan;
        }
      }
    };

    rotular();
    const observador = new MutationObserver(rotular);
    observador.observe(tabela, { childList: true, subtree: true });
    return () => observador.disconnect();
  }, []);

  return <span ref={marca} hidden />;
}
