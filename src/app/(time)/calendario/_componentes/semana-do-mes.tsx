import type { DiaDoCalendario, EventoNoCalendario, FaixaDaSemana, SemanaDoCalendario } from "@/modules/eventos";

import { CartaoDoEvento } from "./cartao-do-evento";

// A semana é um <tbody> de várias linhas: os números dos dias, uma linha por fileira de faixas (a faixa é uma
// célula com colSpan, por isso atravessa as colunas) e, por fim, o que é de cada dia (Masterclasses recolhidas).

const COLUNA = "border-x border-[var(--ds-separator)]";
const FORA_DO_MES = "bg-[var(--ds-surface-2)]";
// Altura do fim da semana: sem faixa nenhuma a semana mantém a altura de antes (132 px); cada fileira ocupa ~46 px.
const SOBRA = ["h-[102px]", "h-[56px]", "h-6"];

type Faixa = FaixaDaSemana<EventoNoCalendario>;

function fundo(dias: DiaDoCalendario[]): string {
  return dias.every((dia) => !dia.doMes) ? FORA_DO_MES : "";
}

function resumoDasMasterclasses(ativas: number, canceladas: number): string {
  const plural = (quantidade: number, singular: string, varias: string) => `${quantidade} ${quantidade === 1 ? singular : varias}`;
  if (ativas === 0) return plural(canceladas, "Masterclass cancelada", "Masterclasses canceladas");
  const texto = plural(ativas, "Masterclass", "Masterclasses");
  return canceladas > 0 ? `${texto} (+${plural(canceladas, "cancelada", "canceladas")})` : texto;
}

/** As faixas de uma fileira e os dias livres entre elas, na ordem das colunas. */
function celulasDaFileira(faixas: Faixa[], dias: DiaDoCalendario[]): { coluna: number; faixa: Faixa | null }[] {
  const celulas: { coluna: number; faixa: Faixa | null }[] = [];
  for (let coluna = 0; coluna < dias.length; ) {
    const faixa = faixas.find((candidata) => candidata.coluna === coluna) ?? null;
    celulas.push({ coluna, faixa });
    coluna += faixa?.dias ?? 1;
  }
  return celulas;
}

function Masterclasses({ dia }: { dia: DiaDoCalendario }) {
  if (dia.masterclasses.length === 0) return null;
  const ativas = dia.masterclasses.filter((mc) => mc.status !== "CANCELADO").length;
  return (
    <details className="group rounded-[7px] text-[12px]">
      <summary className="rounded-[7px] px-1.5 py-0.5 font-medium text-[var(--ds-label-2)] hover:bg-[var(--ds-fill-4)]">
        {resumoDasMasterclasses(ativas, dia.masterclasses.length - ativas)}
      </summary>
      <div className="mt-1 flex flex-col gap-1">
        {dia.masterclasses.map((mc) => (
          <CartaoDoEvento key={mc.id} evento={mc} dia={dia.data} />
        ))}
      </div>
    </details>
  );
}

export function SemanaDoMes({ semana }: { semana: SemanaDoCalendario }) {
  const { dias, faixas } = semana;
  const fileiras = Array.from({ length: Math.max(0, ...faixas.map((faixa) => faixa.linha + 1)) }, (_, linha) =>
    faixas.filter((faixa) => faixa.linha === linha),
  );

  return (
    <tbody>
      <tr>
        {dias.map((dia) => (
          <td key={dia.data} className={`${COLUNA} border-t px-1.5 pt-1.5 align-top ${fundo([dia])}`}>
            <p
              className={`mb-1 inline-flex h-6 min-w-6 items-center justify-center rounded-full px-1.5 text-[12px] font-semibold tabular-nums ${
                dia.hoje ? "bg-[var(--ds-brand)] text-white" : dia.doMes ? "text-[var(--ds-label)]" : "text-[var(--ds-label-2)]"
              }`}
            >
              {Number(dia.data.slice(8, 10))}
            </p>
          </td>
        ))}
      </tr>
      {fileiras.map((fileira, linha) => (
        <tr key={linha}>
          {celulasDaFileira(fileira, dias).map(({ coluna, faixa }) =>
            faixa ? (
              <td
                key={coluna}
                colSpan={faixa.dias}
                className={`${COLUNA} px-1 pb-1 align-top ${fundo(dias.slice(coluna, coluna + faixa.dias))}`}
              >
                <CartaoDoEvento
                  evento={faixa.item}
                  dia={dias[coluna]!.data}
                  comecaAntes={faixa.comecaAntes}
                  continuaDepois={faixa.continuaDepois}
                />
              </td>
            ) : (
              <td key={coluna} className={`${COLUNA} ${fundo([dias[coluna]!])}`} />
            ),
          )}
        </tr>
      ))}
      <tr>
        {dias.map((dia) => (
          <td
            key={dia.data}
            className={`${COLUNA} border-b px-1.5 pb-1.5 align-top ${SOBRA[Math.min(fileiras.length, SOBRA.length - 1)]} ${fundo([dia])}`}
          >
            <Masterclasses dia={dia} />
          </td>
        ))}
      </tr>
    </tbody>
  );
}
