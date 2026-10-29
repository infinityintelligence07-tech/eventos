import { type FuncaoDaPessoa, type PendenciaDoCadastro, pendenciasDoCadastro, type PerfilDoStaff, type VeiculoDaPessoa } from "./cadastro";

// Lista de pessoas (doc 08 §9.1): filtros na URL, validados aqui.

export type UltimoEvento = { eventoId: string; codigo: string | null; nome: string; dataInicio: string };

export type StaffNaLista = {
  pessoaId: string;
  nome: string;
  ativo: boolean;
  poloCodigo: string | null;
  poloNome: string | null;
  perfil: PerfilDoStaff;
  funcoes: FuncaoDaPessoa[];
  veiculo: VeiculoDaPessoa | null;
  ultimoEvento: UltimoEvento | null;
};

export type SituacaoDaPessoa = "ativas" | "inativas" | "todas";
export type AtalhoDaLista = "incompleto" | "com-carro" | "fez-confronto";

export type FiltrosDaLista = {
  busca: string | null;
  polo: string | null;
  funcao: string | null;
  situacao: SituacaoDaPessoa;
  mostrar: AtalhoDaLista | null;
};

const SITUACOES: readonly SituacaoDaPessoa[] = ["ativas", "inativas", "todas"];
const ATALHOS: readonly AtalhoDaLista[] = ["incompleto", "com-carro", "fez-confronto"];

const texto = (valor: unknown): string | null => (typeof valor === "string" && valor.trim() ? valor.trim().slice(0, 100) : null);

/** searchParams → filtros. Valor desconhecido vira o padrão (situação "ativas", sem atalho). */
export function lerFiltrosDaLista(parametros: Record<string, string | string[] | undefined>): FiltrosDaLista {
  const situacao = SITUACOES.find((item) => item === parametros.situacao) ?? "ativas";
  const mostrar = ATALHOS.find((item) => item === parametros.mostrar) ?? null;
  return { busca: texto(parametros.busca), polo: texto(parametros.polo), funcao: texto(parametros.funcao), situacao, mostrar };
}

export function normalizarBusca(valor: string): string {
  return valor
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .trim();
}

export type StaffComPendencias = StaffNaLista & { pendencias: PendenciaDoCadastro[] };

export function comPendencias(pessoa: StaffNaLista): StaffComPendencias {
  return { ...pessoa, pendencias: pendenciasDoCadastro(pessoa) };
}

function passaNoAtalho(pessoa: StaffComPendencias, atalho: AtalhoDaLista | null): boolean {
  switch (atalho) {
    case null:
      return true;
    case "incompleto":
      return pessoa.pendencias.length > 0;
    case "com-carro":
      return pessoa.veiculo !== null;
    case "fez-confronto":
      return pessoa.perfil.fezConfronto === true;
    default: {
      const desconhecido: never = atalho;
      throw new Error(`atalho desconhecido: ${String(desconhecido)}`);
    }
  }
}

function passaNaSituacao(pessoa: StaffNaLista, situacao: SituacaoDaPessoa): boolean {
  switch (situacao) {
    case "ativas":
      return pessoa.ativo;
    case "inativas":
      return !pessoa.ativo;
    case "todas":
      return true;
    default: {
      const desconhecida: never = situacao;
      throw new Error(`situação desconhecida: ${String(desconhecida)}`);
    }
  }
}

export function filtrarStaff(lista: StaffNaLista[], filtros: FiltrosDaLista): StaffComPendencias[] {
  const busca = filtros.busca ? normalizarBusca(filtros.busca) : "";
  return lista
    .map(comPendencias)
    .filter(
      (pessoa) =>
        passaNaSituacao(pessoa, filtros.situacao) &&
        (!busca || normalizarBusca(pessoa.nome).includes(busca)) &&
        (!filtros.polo || pessoa.poloCodigo === filtros.polo) &&
        (!filtros.funcao || pessoa.funcoes.some((funcao) => funcao.codigo === filtros.funcao)) &&
        passaNoAtalho(pessoa, filtros.mostrar),
    );
}

export const PAGINA_DA_LISTA = 50;

/** "Mostrar mais 50": `?limite=` múltiplo de 50, entre 50 e 1000. */
export function limiteDaLista(valor: unknown): number {
  const numero = typeof valor === "string" ? Number.parseInt(valor, 10) : Number.NaN;
  if (!Number.isFinite(numero) || numero < PAGINA_DA_LISTA) return PAGINA_DA_LISTA;
  return Math.min(Math.ceil(numero / PAGINA_DA_LISTA) * PAGINA_DA_LISTA, 1000);
}
