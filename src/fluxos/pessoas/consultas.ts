import { bancoParaLeitura } from "@/fluxos/_base";
import {
  comPendencias,
  criarConsultaPessoas,
  type FichaDaPessoa,
  filtrarStaff,
  type FiltrosDaLista,
  type ItemDoHistorico,
  type OpcoesDePessoas,
  type PendenciaDoCadastro,
  type StaffComPendencias,
} from "@/modules/pessoas";

const FORMATO_UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export type ListaDePessoas = {
  pessoas: StaffComPendencias[];
  /** Total do staff cadastrado (sem filtro), para distinguir "vazio de verdade" de "vazio por filtro". */
  totalDoStaff: number;
  opcoes: OpcoesDePessoas;
};

export async function listarPessoas(filtros: FiltrosDaLista, agora: Date): Promise<ListaDePessoas> {
  const consulta = criarConsultaPessoas(await bancoParaLeitura());
  const [staff, opcoes] = await Promise.all([consulta.listarStaff(agora), consulta.opcoes()]);
  return { pessoas: filtrarStaff(staff, filtros), totalDoStaff: staff.length, opcoes };
}

export type PessoaCarregada = FichaDaPessoa & {
  pendencias: PendenciaDoCadastro[];
  historico: ItemDoHistorico[];
  funcoesDisponiveis: OpcoesDePessoas["funcoes"];
};

/** Nulo = não existe ou não é staff (sem pessoa_evento). */
export async function carregarPessoa(pessoaId: string, agora: Date): Promise<PessoaCarregada | null> {
  if (!FORMATO_UUID.test(pessoaId)) return null;
  const consulta = criarConsultaPessoas(await bancoParaLeitura());
  const ficha = await consulta.ficha(pessoaId, agora);
  if (!ficha) return null;
  const [historico, opcoes] = await Promise.all([consulta.historico(pessoaId), consulta.opcoes()]);
  return { ...ficha, pendencias: comPendencias(ficha).pendencias, historico, funcoesDisponiveis: opcoes.funcoes };
}
