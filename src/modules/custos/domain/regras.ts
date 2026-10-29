// Regras de custo (eventos.regra_custo) e a escolha da que vale numa data (docs/07 §6.7 e §6.8).
// Uma "regra" é o grupo (categoria, código, tipo de evento, UF); cada linha do grupo é uma vigência.
// Mudar o valor cria uma linha nova; a antiga fica, porque solicitações já registradas apontam para ela.

/** Valores do CHECK regra_custo_categoria_check. */
export type CategoriaDaRegra = "REMUNERACAO" | "ALIMENTACAO" | "DEPRECIACAO" | "ADICIONAL" | "MONTAGEM" | "COMBUSTIVEL" | "LIMITE";
/** Valores do CHECK regra_custo_unidade_check. */
export type UnidadeDaRegra = "EVENTO" | "DIA" | "HORA" | "DESLOCAMENTO" | "LITRO" | "FIXO" | "NENHUMA";

export const CATEGORIAS_DA_REGRA: CategoriaDaRegra[] = ["REMUNERACAO", "ALIMENTACAO", "DEPRECIACAO", "ADICIONAL", "MONTAGEM", "COMBUSTIVEL", "LIMITE"];

export type RegraDeCusto = {
  id: string;
  categoria: CategoriaDaRegra;
  codigo: string;
  nome: string;
  tipoEventoId: string | null;
  uf: string | null;
  unidade: UnidadeDaRegra;
  valorCentavos: number | null;
  parametros: Record<string, unknown>;
  /** AAAA-MM-DD */
  vigenteDesde: string;
  ativo: boolean;
  observacao: string | null;
};

export function chaveDaRegra(regra: Pick<RegraDeCusto, "categoria" | "codigo" | "tipoEventoId" | "uf">): string {
  return [regra.categoria, regra.codigo, regra.tipoEventoId ?? "*", regra.uf ?? "*"].join("|");
}

/** Linha que vale na data: a de maior `vigenteDesde` ≤ data. Desativada = o grupo não vale a partir dela. */
export function vigenciaNaData<R extends Pick<RegraDeCusto, "vigenteDesde" | "ativo">>(vigencias: R[], data: string): R | null {
  const valendo = vigencias.filter((vigencia) => vigencia.vigenteDesde <= data).sort((a, b) => b.vigenteDesde.localeCompare(a.vigenteDesde))[0];
  return valendo && valendo.ativo ? valendo : null;
}

/** Agrupa as linhas por regra (categoria, código, tipo, UF), cada grupo da vigência mais nova para a mais antiga. */
export function agruparVigencias<R extends RegraDeCusto>(regras: R[]): R[][] {
  const grupos = new Map<string, R[]>();
  for (const regra of regras) {
    const chave = chaveDaRegra(regra);
    grupos.set(chave, [...(grupos.get(chave) ?? []), regra]);
  }
  return [...grupos.values()].map((grupo) => grupo.sort((a, b) => b.vigenteDesde.localeCompare(a.vigenteDesde)));
}

/**
 * Regras que valem para um evento (tipo, UF, data): por categoria e código, a vigência do grupo mais específico
 * (tipo e UF iguais > só tipo > só UF > geral). Grupo de outro tipo ou de outra UF não entra.
 */
export function regrasAplicaveis(regras: RegraDeCusto[], evento: { tipoEventoId: string | null; uf: string | null; data: string }): RegraDeCusto[] {
  const porCodigo = new Map<string, { especificidade: number; regra: RegraDeCusto }>();
  for (const grupo of agruparVigencias(regras)) {
    const modelo = grupo[0]!;
    if (modelo.tipoEventoId !== null && modelo.tipoEventoId !== evento.tipoEventoId) continue;
    if (modelo.uf !== null && modelo.uf !== evento.uf) continue;
    const vigente = vigenciaNaData(grupo, evento.data);
    if (!vigente) continue;
    const especificidade = (modelo.tipoEventoId !== null ? 2 : 0) + (modelo.uf !== null ? 1 : 0);
    const chave = `${modelo.categoria}|${modelo.codigo}`;
    const atual = porCodigo.get(chave);
    if (!atual || especificidade > atual.especificidade) porCodigo.set(chave, { especificidade, regra: vigente });
  }
  return [...porCodigo.values()].map((item) => item.regra);
}

export type FaixaDeDepreciacao = { regraId: string; kmMin: number; kmMax: number | null; valorCentavos: number };

export type LimitesDeConsumo = {
  critico: { kmLMin: number | null; kmLMax: number | null; custoKmMaxCentavos: number | null };
  alerta: { kmLMin: number | null; custoKmMaxCentavos: number | null };
};

export type RegrasDoCalculo = { faixas: FaixaDeDepreciacao[]; limites: LimitesDeConsumo };

function numero(valor: unknown): number | null {
  return typeof valor === "number" && Number.isFinite(valor) ? valor : null;
}

/** Faixas de depreciação e limites de alerta (LIMITE.CONSUMO_CRITICO e CONSUMO_ALERTA) das regras aplicáveis. */
export function regrasDoCalculo(aplicaveis: RegraDeCusto[]): RegrasDoCalculo {
  const faixas = aplicaveis
    .filter((regra) => regra.categoria === "DEPRECIACAO" && regra.valorCentavos !== null)
    .map((regra) => ({ regraId: regra.id, kmMin: numero(regra.parametros.km_min) ?? 0, kmMax: numero(regra.parametros.km_max), valorCentavos: regra.valorCentavos! }))
    .sort((a, b) => a.kmMin - b.kmMin);
  const limite = (codigo: string) => aplicaveis.find((regra) => regra.categoria === "LIMITE" && regra.codigo === codigo)?.parametros ?? {};
  const critico = limite("CONSUMO_CRITICO");
  const alerta = limite("CONSUMO_ALERTA");
  return {
    faixas,
    limites: {
      critico: { kmLMin: numero(critico.km_l_min), kmLMax: numero(critico.km_l_max), custoKmMaxCentavos: numero(critico.custo_km_max_centavos) },
      alerta: { kmLMin: numero(alerta.km_l_min), custoKmMaxCentavos: numero(alerta.custo_km_max_centavos) },
    },
  };
}

/** Preço do litro da UF (regra COMBUSTIVEL), quando houver. */
export function precoDoLitro(aplicaveis: RegraDeCusto[]): number | null {
  return aplicaveis.find((regra) => regra.categoria === "COMBUSTIVEL" && regra.valorCentavos !== null)?.valorCentavos ?? null;
}

export function rotuloDaCategoriaDaRegra(categoria: CategoriaDaRegra): string {
  switch (categoria) {
    case "REMUNERACAO":
      return "Remuneração";
    case "ALIMENTACAO":
      return "Alimentação";
    case "DEPRECIACAO":
      return "Depreciação";
    case "ADICIONAL":
      return "Adicionais";
    case "MONTAGEM":
      return "Montagem";
    case "COMBUSTIVEL":
      return "Combustível";
    case "LIMITE":
      return "Limites de alerta";
    default: {
      const desconhecida: never = categoria;
      throw new Error(`categoria desconhecida: ${String(desconhecida)}`);
    }
  }
}

export function rotuloDaUnidade(unidade: UnidadeDaRegra): string {
  switch (unidade) {
    case "EVENTO":
      return "por evento";
    case "DIA":
      return "por dia";
    case "HORA":
      return "por hora";
    case "DESLOCAMENTO":
      return "por deslocamento";
    case "LITRO":
      return "por litro";
    case "FIXO":
      return "fixo";
    case "NENHUMA":
      return "—";
    default: {
      const desconhecida: never = unidade;
      throw new Error(`unidade desconhecida: ${String(desconhecida)}`);
    }
  }
}

const UMA_CASA = new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 2 });
const REAIS = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });

/** Parâmetros em texto: "de 100 a 249,99 km"; "Crítico: consumo abaixo de 7,5 km/l". */
export function descricaoDosParametros(regra: Pick<RegraDeCusto, "categoria" | "codigo" | "parametros">): string | null {
  const p = regra.parametros;
  if (regra.categoria === "DEPRECIACAO") {
    const minimo = numero(p.km_min) ?? 0;
    const maximo = numero(p.km_max);
    if (maximo === null) return `a partir de ${UMA_CASA.format(minimo)} km`;
    return minimo === 0 ? `abaixo de ${UMA_CASA.format(Math.ceil(maximo))} km` : `de ${UMA_CASA.format(minimo)} a ${UMA_CASA.format(maximo)} km`;
  }
  if (regra.categoria === "LIMITE") {
    const partes: string[] = [];
    const kmLMin = numero(p.km_l_min);
    const kmLMax = numero(p.km_l_max);
    const custo = numero(p.custo_km_max_centavos);
    if (kmLMin !== null) partes.push(`consumo abaixo de ${UMA_CASA.format(kmLMin)} km/l`);
    if (kmLMax !== null) partes.push(`acima de ${UMA_CASA.format(kmLMax)} km/l`);
    if (custo !== null) partes.push(`custo acima de ${REAIS.format(custo / 100)} por km`);
    const nivel = regra.codigo === "CONSUMO_CRITICO" ? "Crítico" : "Alerta";
    return partes.length ? `${nivel}: ${partes.join(", ")}` : null;
  }
  return null;
}
