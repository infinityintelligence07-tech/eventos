// O que o Eventos guarda do staff (pessoa_evento, pessoa_funcao, pessoa_veiculo) e o que falta para escalar
// (docs/07 §6.5, doc 08 §9). Nome, telefone e e-mail vêm do cadastro do GH (core.pessoa, só leitura);
// endereço, CPF e PIX ficam em sensivel e não aparecem nesta rodada.

export type Sexo = "F" | "M";
export type ModeloDeCamiseta = "CAMISETA" | "BABY_LOOK";
export type TamanhoDeCamiseta = "PP" | "P" | "M" | "G" | "GG" | "XG";
export type NivelNaFuncao = "TRAINEE" | "HABILITADO";

export const SEXOS: readonly Sexo[] = ["F", "M"];
export const MODELOS_DE_CAMISETA: readonly ModeloDeCamiseta[] = ["CAMISETA", "BABY_LOOK"];
export const TAMANHOS_DE_CAMISETA: readonly TamanhoDeCamiseta[] = ["PP", "P", "M", "G", "GG", "XG"];
export const NIVEIS: readonly NivelNaFuncao[] = ["HABILITADO", "TRAINEE"];

export type PerfilDoStaff = {
  sexo: Sexo | null;
  camisetaModelo: ModeloDeCamiseta | null;
  camisetaTamanho: TamanhoDeCamiseta | null;
  possuiCamiseta: boolean | null;
  fezConfronto: boolean | null;
  temCnpj: boolean | null;
  lat: number | null;
  lng: number | null;
};

export type FuncaoDaPessoa = { funcaoId: string; codigo: string; nome: string; nivel: NivelNaFuncao };

export type VeiculoDaPessoa = { lugares: number; consumoKmL: number | null };

export function rotuloDoSexo(sexo: Sexo): string {
  switch (sexo) {
    case "F":
      return "Feminino";
    case "M":
      return "Masculino";
    default: {
      const desconhecido: never = sexo;
      throw new Error(`sexo desconhecido: ${String(desconhecido)}`);
    }
  }
}

export function rotuloDoModelo(modelo: ModeloDeCamiseta): string {
  switch (modelo) {
    case "CAMISETA":
      return "Camiseta";
    case "BABY_LOOK":
      return "Baby look";
    default: {
      const desconhecido: never = modelo;
      throw new Error(`modelo de camiseta desconhecido: ${String(desconhecido)}`);
    }
  }
}

export function rotuloDoNivel(nivel: NivelNaFuncao): string {
  switch (nivel) {
    case "HABILITADO":
      return "Habilitado";
    case "TRAINEE":
      return "Trainee";
    default: {
      const desconhecido: never = nivel;
      throw new Error(`nível desconhecido: ${String(desconhecido)}`);
    }
  }
}

/** "Baby look M", "Camiseta", "Tamanho G"; nulo sem nenhum dos dois. */
export function rotuloDaCamiseta(modelo: ModeloDeCamiseta | null, tamanho: TamanhoDeCamiseta | null): string | null {
  if (modelo && tamanho) return `${rotuloDoModelo(modelo)} ${tamanho}`;
  if (modelo) return rotuloDoModelo(modelo);
  if (tamanho) return `Tamanho ${tamanho}`;
  return null;
}

/** "Staff líder" ou "Pai / mãe · trainee". */
export function rotuloDaFuncao(funcao: Pick<FuncaoDaPessoa, "nome" | "nivel">): string {
  return funcao.nivel === "TRAINEE" ? `${funcao.nome} · trainee` : funcao.nome;
}

export function rotuloSimNao(valor: boolean | null): string {
  if (valor === null) return "—";
  return valor ? "Sim" : "Não";
}

/** "4 lugares" / "1 lugar" */
export function rotuloDoVeiculo(veiculo: VeiculoDaPessoa | null): string | null {
  if (!veiculo) return null;
  return `${veiculo.lugares} ${veiculo.lugares === 1 ? "lugar" : "lugares"}`;
}

/** O que falta para o staff ser escalado e comunicado sem pendência. */
export type PendenciaDoCadastro = "SEXO" | "CAMISETA" | "FUNCAO" | "LOCALIZACAO" | "CONSUMO_DO_CARRO";

export function pendenciasDoCadastro({
  perfil,
  funcoes,
  veiculo,
}: {
  perfil: PerfilDoStaff;
  funcoes: readonly unknown[];
  veiculo: VeiculoDaPessoa | null;
}): PendenciaDoCadastro[] {
  const pendencias: PendenciaDoCadastro[] = [];
  if (!perfil.sexo) pendencias.push("SEXO");
  if (!perfil.camisetaModelo || !perfil.camisetaTamanho) pendencias.push("CAMISETA");
  if (funcoes.length === 0) pendencias.push("FUNCAO");
  if (perfil.lat === null || perfil.lng === null) pendencias.push("LOCALIZACAO");
  if (veiculo && veiculo.consumoKmL === null) pendencias.push("CONSUMO_DO_CARRO");
  return pendencias;
}

export function rotuloDaPendencia(pendencia: PendenciaDoCadastro): string {
  switch (pendencia) {
    case "SEXO":
      return "Falta informar o sexo";
    case "CAMISETA":
      return "Falta camiseta";
    case "FUNCAO":
      return "Falta função";
    case "LOCALIZACAO":
      return "Falta localização";
    case "CONSUMO_DO_CARRO":
      return "Falta consumo do carro";
    default: {
      const desconhecida: never = pendencia;
      throw new Error(`pendência desconhecida: ${String(desconhecida)}`);
    }
  }
}

/** A pessoa não é staff (sem pessoa_evento) ou não existe. O fluxo traduz para "Pessoa não encontrada.". */
export class PessoaNaoEncontradaError extends Error {
  constructor(readonly pessoaId: string) {
    super(`pessoa ${pessoaId} não encontrada`);
    this.name = "PessoaNaoEncontradaError";
  }
}

/** Alguma função escolhida não existe ou está inativa. */
export class FuncaoInvalidaError extends Error {
  constructor(readonly funcaoIds: string[]) {
    super(`funções inválidas: ${funcaoIds.join(", ")}`);
    this.name = "FuncaoInvalidaError";
  }
}
