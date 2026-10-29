import type { ResultadoVagas } from "./vagas";

// Compara as vagas calculadas pela regra com as linhas de escala que a regra já gerou
// e diz o que mudar. Linhas MANUAIS nunca entram aqui: o ajuste do time não é desfeito.
// Linha com número confirmado por quem monta também não muda: só ganha um aviso quando a sugestão muda.

export type LinhaDaRegra = { id: string; funcao: string; quantidade: number; convocacoes: number; confirmada?: boolean };

export type PlanoVagas = {
  inserir: { funcao: string; quantidade: number }[];
  atualizar: { id: string; funcao: string; quantidade: number }[];
  remover: { id: string; funcao: string }[];
  avisos: string[];
};

export function planejarVagas(atuais: readonly LinhaDaRegra[], resultado: ResultadoVagas): PlanoVagas {
  const plano: PlanoVagas = { inserir: [], atualizar: [], remover: [], avisos: [] };
  // Função sem dado para calcular (ex.: fila não informada) ou digitada em cada evento: mantém o que existe.
  const pendentes = new Set(resultado.pendencias.map((pendencia) => pendencia.funcao));
  const calculadas = new Map(resultado.vagas.map((vaga) => [vaga.funcao, vaga.quantidade]));
  const vistas = new Set<string>();

  const removerOuAvisar = (linha: LinhaDaRegra, motivo: string): void => {
    if (linha.convocacoes > 0) {
      plano.avisos.push(`${linha.funcao}: ${motivo}, mas tem ${linha.convocacoes} convocação(ões); mantida`);
      return;
    }
    if (linha.confirmada) {
      plano.avisos.push(`${linha.funcao}: ${motivo}, mas o número foi confirmado; mantida`);
      return;
    }
    plano.remover.push({ id: linha.id, funcao: linha.funcao });
  };

  for (const linha of atuais) {
    if (pendentes.has(linha.funcao)) continue;

    if (vistas.has(linha.funcao)) {
      removerOuAvisar(linha, "linha repetida da regra");
      continue;
    }
    vistas.add(linha.funcao);

    const quantidade = calculadas.get(linha.funcao);
    if (quantidade === undefined || quantidade === 0) {
      removerOuAvisar(linha, "a regra não pede mais esta função");
      continue;
    }
    if (quantidade !== linha.quantidade) {
      if (linha.confirmada) {
        plano.avisos.push(`${linha.funcao}: a sugestão agora é ${quantidade} (confirmado ${linha.quantidade}); mantida`);
        continue;
      }
      plano.atualizar.push({ id: linha.id, funcao: linha.funcao, quantidade });
      if (quantidade < linha.convocacoes) {
        plano.avisos.push(
          `${linha.funcao}: regra pede ${quantidade} vaga(s) e já há ${linha.convocacoes} convocação(ões)`,
        );
      }
    }
  }

  for (const vaga of resultado.vagas) {
    if (vaga.quantidade > 0 && !vistas.has(vaga.funcao)) {
      plano.inserir.push({ funcao: vaga.funcao, quantidade: vaga.quantidade });
    }
  }

  return plano;
}

export function planoVazio(plano: PlanoVagas): boolean {
  return plano.inserir.length === 0 && plano.atualizar.length === 0 && plano.remover.length === 0;
}
