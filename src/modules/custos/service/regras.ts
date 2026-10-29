import { ErroDosCustos } from "../domain/erros";
import type { RegraDeCusto } from "../domain/regras";
import type { CriarVigenciaDeRegra } from "../domain/schemas";

// Configurações › Regras de custo (docs/07 §6.8): mudar o valor cria uma vigência nova; a antiga nunca é editada,
// porque solicitações já registradas apontam para ela.

export type RepositorioRegras = {
  regra(regraId: string): Promise<RegraDeCusto | null>;
  /** Já existe vigência do mesmo grupo nesta data (UNIQUE regra_custo_vigencia_unique). */
  vigenciaNaMesmaData(regra: RegraDeCusto, vigenteDesde: string): Promise<boolean>;
  inserirVigencia(regra: Omit<RegraDeCusto, "id">, instante: Date): Promise<string>;
  desativar(regraId: string, instante: Date): Promise<boolean>;
  /** registro_acao da regra (entidade REGRA_CUSTO). */
  registrar(registro: { regraId: string; acao: "VIGENCIA_CRIADA" | "REGRA_DESATIVADA"; usuarioId: string; dados: Record<string, unknown> }): Promise<void>;
};

export type ContextoDaRegra = { usuarioId: string; instante: Date };

function parametrosNovos(base: RegraDeCusto, entrada: CriarVigenciaDeRegra): Record<string, unknown> {
  const parametros = { ...base.parametros };
  const trocar = (chave: string, valor: number | undefined) => {
    if (valor !== undefined) parametros[chave] = valor;
  };
  switch (base.categoria) {
    case "DEPRECIACAO":
      trocar("km_min", entrada.kmMin);
      trocar("km_max", entrada.kmMax);
      break;
    case "LIMITE":
      trocar("km_l_min", entrada.kmLMin);
      trocar("km_l_max", entrada.kmLMax);
      trocar("custo_km_max_centavos", entrada.custoKmMaxCentavos);
      break;
    case "REMUNERACAO":
    case "ALIMENTACAO":
    case "ADICIONAL":
    case "MONTAGEM":
    case "COMBUSTIVEL":
      break;
    default: {
      const desconhecida: never = base.categoria;
      throw new Error(`categoria desconhecida: ${String(desconhecida)}`);
    }
  }
  return parametros;
}

export async function criarVigenciaDeRegra(repo: RepositorioRegras, entrada: CriarVigenciaDeRegra, { usuarioId, instante }: ContextoDaRegra): Promise<RegraDeCusto> {
  const base = await repo.regra(entrada.regraId);
  if (!base) throw new ErroDosCustos("Regra não encontrada. Recarregue a página.");
  if (await repo.vigenciaNaMesmaData(base, entrada.vigenteDesde)) {
    throw new ErroDosCustos("Já existe um valor desta regra que vale a partir desta data. Escolha outra data.");
  }
  const parametros = parametrosNovos(base, entrada);
  const kmMin = parametros.km_min;
  const kmMax = parametros.km_max;
  if (typeof kmMin === "number" && typeof kmMax === "number" && kmMax < kmMin) throw new ErroDosCustos("O km final da faixa precisa ser maior que o inicial.");

  const nova: Omit<RegraDeCusto, "id"> = {
    categoria: base.categoria,
    codigo: base.codigo,
    nome: base.nome,
    tipoEventoId: base.tipoEventoId,
    uf: base.uf,
    unidade: base.unidade,
    valorCentavos: base.categoria === "LIMITE" ? null : (entrada.valorCentavos ?? base.valorCentavos),
    parametros,
    vigenteDesde: entrada.vigenteDesde,
    ativo: true,
    observacao: entrada.observacao ?? base.observacao,
  };
  const id = await repo.inserirVigencia(nova, instante);
  await repo.registrar({
    regraId: id,
    acao: "VIGENCIA_CRIADA",
    usuarioId,
    dados: { vigenciaAnteriorId: base.id, vigenteDesde: nova.vigenteDesde, valorCentavos: nova.valorCentavos, parametros: nova.parametros },
  });
  return { ...nova, id };
}

export async function desativarRegra(repo: RepositorioRegras, regraId: string, { usuarioId, instante }: ContextoDaRegra): Promise<RegraDeCusto> {
  const regra = await repo.regra(regraId);
  if (!regra) throw new ErroDosCustos("Regra não encontrada. Recarregue a página.");
  if (!regra.ativo) throw new ErroDosCustos("Esta regra já está inativa.");
  await repo.desativar(regraId, instante);
  await repo.registrar({ regraId, acao: "REGRA_DESATIVADA", usuarioId, dados: { vigenteDesde: regra.vigenteDesde } });
  return { ...regra, ativo: false };
}
