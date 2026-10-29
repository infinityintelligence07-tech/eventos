import { bancoParaLeitura } from "@/fluxos/_base";
import {
  criarConsultaDisponibilidade,
  descricaoDoFechamento,
  DIAS_PARA_AVISAR_FECHAMENTO,
  type EnqueteNaLista,
  type EventoDaEnquete,
  fechaEmNoCampo,
  fechaEmPadrao,
  filtrarLinhas,
  type FiltrosDaMatriz,
  type LinhaDaMatriz,
  montarMatriz,
  type OpcoesDaDisponibilidade,
  periodoPadrao,
  type Resposta,
  type SituacaoDaEnquete,
  situacaoDaEnquete,
  textoDoConvite,
  type TotalDoEvento,
  tituloSugerido,
} from "@/modules/disponibilidade";

const FORMATO_UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const FORMATO_DIA = /^\d{4}-\d{2}-\d{2}$/;

export type FiltroDaListaDeEnquetes = "abertas" | "encerradas" | null;

export type ListaDeEnquetes = {
  enquetes: (EnqueteNaLista & { situacao: SituacaoDaEnquete })[];
  totalDeStaff: number;
  quantidade: { abertas: number; encerradas: number; todas: number };
};

export async function listarEnquetes(filtro: FiltroDaListaDeEnquetes, agora: Date): Promise<ListaDeEnquetes> {
  const consulta = criarConsultaDisponibilidade(await bancoParaLeitura());
  const [todas, totalDeStaff] = await Promise.all([consulta.listarEnquetes(), consulta.totalDeStaffAtivo()]);
  const comSituacao = todas.map((enquete) => ({ ...enquete, situacao: situacaoDaEnquete(enquete.fechaEm, agora) }));
  const abertas = comSituacao.filter((enquete) => enquete.situacao === "ABERTA").length;
  return {
    enquetes: comSituacao.filter((enquete) => filtro === null || enquete.situacao === (filtro === "abertas" ? "ABERTA" : "ENCERRADA")),
    totalDeStaff,
    quantidade: { abertas, encerradas: comSituacao.length - abertas, todas: comSituacao.length },
  };
}

export type PessoaDoRegistro = { pessoaId: string; nome: string; funcoes: string };

export type EnqueteCarregada = {
  id: string;
  titulo: string;
  fechaEm: Date;
  fechaEmNoCampo: string;
  /** Padrão para "Reabrir": 7 dias a partir de hoje. */
  reabrirAte: string;
  situacao: SituacaoDaEnquete;
  descricaoDoFechamento: string;
  convite: string;
  eventos: EventoDaEnquete[];
  totais: TotalDoEvento[];
  totalDeStaff: number;
  responderam: number;
  /** Linhas depois dos filtros. */
  linhas: LinhaDaMatriz[];
  /** Todo o staff, para o painel "Registrar resposta" (só nome e função, sem telefone). */
  pessoas: PessoaDoRegistro[];
  respostasPorPessoa: Record<string, Record<string, Resposta>>;
  opcoes: Pick<OpcoesDaDisponibilidade, "polos" | "funcoes">;
};

/** Nulo = enquete não encontrada. */
export async function carregarEnquete(enqueteId: string, filtros: FiltrosDaMatriz, agora: Date): Promise<EnqueteCarregada | null> {
  if (!FORMATO_UUID.test(enqueteId)) return null;
  const consulta = criarConsultaDisponibilidade(await bancoParaLeitura());
  const enquete = await consulta.enquete(enqueteId);
  if (!enquete) return null;

  const eventoIds = enquete.eventos.map((evento) => evento.id);
  const [staff, respostas, opcoes] = await Promise.all([consulta.staffAtivo(), consulta.respostasDosEventos(eventoIds), consulta.opcoesDeFiltro()]);
  const matriz = montarMatriz(staff, eventoIds, respostas);

  return {
    id: enquete.id,
    titulo: enquete.titulo,
    fechaEm: enquete.fechaEm,
    fechaEmNoCampo: fechaEmNoCampo(enquete.fechaEm),
    reabrirAte: fechaEmPadrao(agora),
    situacao: situacaoDaEnquete(enquete.fechaEm, agora),
    descricaoDoFechamento: descricaoDoFechamento(enquete.fechaEm, agora),
    convite: textoDoConvite({ titulo: enquete.titulo, fechaEm: enquete.fechaEm, eventos: enquete.eventos }),
    eventos: enquete.eventos,
    totais: matriz.totais,
    totalDeStaff: staff.length,
    responderam: matriz.responderam,
    linhas: filtrarLinhas(matriz.linhas, filtros),
    pessoas: staff.map((pessoa) => ({ pessoaId: pessoa.pessoaId, nome: pessoa.nome, funcoes: pessoa.funcoes.map((funcao) => funcao.nome).join(", ") })),
    respostasPorPessoa: Object.fromEntries(matriz.linhas.map((linha) => [linha.pessoa.pessoaId, linha.respostas])),
    opcoes: { polos: opcoes.polos, funcoes: opcoes.funcoes },
  };
}

export type FiltrosDaNovaEnquete = { de?: string | null; ate?: string | null; polo?: string | null; tipo?: string | null };

export type NovaEnquete = {
  periodo: { de: string; ate: string };
  polo: string | null;
  tipo: string | null;
  tituloSugerido: string;
  fechaEmPadrao: string;
  eventos: EventoDaEnquete[];
  opcoes: Pick<OpcoesDaDisponibilidade, "polos" | "tipos">;
};

export async function carregarNovaEnquete(filtros: FiltrosDaNovaEnquete, agora: Date): Promise<NovaEnquete> {
  const padrao = periodoPadrao(agora);
  const de = filtros.de && FORMATO_DIA.test(filtros.de) ? filtros.de : padrao.de;
  const ateInformado = filtros.ate && FORMATO_DIA.test(filtros.ate) ? filtros.ate : padrao.ate;
  const ate = ateInformado < de ? de : ateInformado;

  const consulta = criarConsultaDisponibilidade(await bancoParaLeitura());
  const opcoes = await consulta.opcoesDeFiltro();
  const polo = opcoes.polos.some((item) => item.codigo === filtros.polo) ? filtros.polo! : null;
  const tipo = opcoes.tipos.some((item) => item.sigla === filtros.tipo) ? filtros.tipo! : null;
  const eventos = await consulta.eventosParaEnquete({ de, ate, poloCodigo: polo, tipoSigla: tipo });

  return {
    periodo: { de, ate },
    polo,
    tipo,
    tituloSugerido: tituloSugerido(de, ate),
    fechaEmPadrao: fechaEmPadrao(agora),
    eventos,
    opcoes: { polos: opcoes.polos, tipos: opcoes.tipos },
  };
}

/** Contrato docs/07 §7.3: cada aba entrega os itens dela para o Início. */
export type ItemDoInicio = {
  chave: string;
  titulo: string;
  quantidade: number;
  href: string;
  /** Até 6. */
  exemplos: { rotulo: string; detalhe?: string; href: string }[];
};

const LIMITE_DE_EXEMPLOS = 6;

/** Enquetes abertas que fecham em até 3 dias. */
export async function resumoParaInicio(agora: Date): Promise<ItemDoInicio[]> {
  const limite = new Date(agora.getTime() + DIAS_PARA_AVISAR_FECHAMENTO * 24 * 60 * 60 * 1000);
  const fechando = await criarConsultaDisponibilidade(await bancoParaLeitura()).enquetesFechandoAte(agora, limite);
  return [
    {
      chave: "disponibilidade.enquetes-fechando",
      titulo: "Enquetes que fecham em até 3 dias",
      quantidade: fechando.length,
      href: "/disponibilidade?situacao=abertas",
      exemplos: fechando.slice(0, LIMITE_DE_EXEMPLOS).map((enquete) => ({
        rotulo: enquete.titulo,
        detalhe: descricaoDoFechamento(enquete.fechaEm, agora),
        href: `/disponibilidade/${enquete.id}`,
      })),
    },
  ];
}
