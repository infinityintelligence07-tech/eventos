import { bancoParaLeitura } from "@/fluxos/_base";
import {
  aceitaResposta,
  type Candidato,
  type ConvocacaoDaTela,
  criarConsultaDaEscala,
  descreverLinha,
  distanciaKm,
  escalaEditavel,
  type EventoDaMontagem,
  eventoEncerrado,
  type LinhaDaTela,
  type LinhaResumida,
  lerRegraGuiada,
  ordenarSugestoes,
  pontosDeAtencao,
  type PontoDeAtencao,
  pontuacaoDaSugestao,
  RegraVagasInvalidaError,
  type RegistroDaEscala,
  resumoDaMontagem,
  type ResumoDaMontagem,
} from "@/modules/escala";
import { somarDias } from "@/modules/eventos";

import { ehUuid } from "./comum";

export type LinhaDaEquipe = LinhaDaTela & LinhaResumida & { convocacoes: ConvocacaoDaTela[] };

export type MontagemDaEscala = {
  evento: EventoDaMontagem;
  resumo: ResumoDaMontagem;
  linhas: LinhaDaEquipe[];
  historico: RegistroDaEscala[];
  ultimaDevolucao: { em: Date; comentario: string | null } | null;
  /** Quem monta pode mexer (SEM_ESCALA, RASCUNHO, DEVOLVIDA e evento não encerrado). */
  editavel: boolean;
  aceitaResposta: boolean;
  podeReabrir: boolean;
  aguardandoAprovacao: boolean;
  encerrado: boolean;
  pontosDeAtencao: PontoDeAtencao[];
  funcoes: { id: string; codigo: string; nome: string }[];
  dias: string[];
  /** Como a regra calcula cada função ("1 a cada 25 pessoas do público…"), para o "sugerido N". */
  explicacoes: Record<string, string>;
};

function explicacoesDaRegra(regra: unknown, nomeDaFuncao: (codigo: string) => string): Record<string, string> {
  try {
    return Object.fromEntries(lerRegraGuiada(regra).map((linha) => [linha.funcao, descreverLinha(linha, nomeDaFuncao)]));
  } catch (cause: unknown) {
    if (cause instanceof RegraVagasInvalidaError) return {};
    throw cause;
  }
}

function diasDoEvento(inicio: string, fim: string): string[] {
  const dias: string[] = [];
  for (let dia = inicio; dia <= fim && dias.length < 31; dia = somarDias(dia, 1)) dias.push(dia);
  return dias;
}

/** Nulo = evento não encontrado. */
export async function carregarMontagem(eventoId: string): Promise<MontagemDaEscala | null> {
  if (!ehUuid(eventoId)) return null;
  const consulta = criarConsultaDaEscala(await bancoParaLeitura());
  const evento = await consulta.eventoDaMontagem(eventoId);
  if (!evento) return null;

  const [linhasDaTela, convocacoes, historico, funcoes, [atencao]] = await Promise.all([
    consulta.linhasDaTela(eventoId),
    consulta.convocacoesDaTela(eventoId),
    consulta.historicoDaEscala(eventoId),
    consulta.funcoesAtivas(),
    consulta.situacaoParaAtencao([eventoId]),
  ]);

  const nomes = new Map(funcoes.map((funcao) => [funcao.codigo, funcao.nome]));
  const nomeDaFuncao = (codigo: string) => nomes.get(codigo) ?? codigo;
  const resumo = resumoDaMontagem(
    evento.regraVagas,
    { expectativa_publico: evento.expectativaPublico, pessoas_na_fila: evento.pessoasNaFila },
    linhasDaTela,
    nomeDaFuncao,
  );
  const linhas = resumo.linhas.map((resumida, indice) => ({
    ...linhasDaTela[indice]!,
    ...resumida,
    convocacoes: convocacoes.filter((convocacao) => convocacao.escalaId === resumida.id),
  }));

  const encerrado = eventoEncerrado(evento.status);
  const devolucao = historico.find((registro) => registro.acao === "DEVOLVIDA");
  return {
    evento,
    resumo,
    linhas,
    historico,
    ultimaDevolucao: evento.statusEscala === "DEVOLVIDA" && devolucao ? { em: devolucao.criadoEm, comentario: devolucao.comentario } : null,
    editavel: !encerrado && escalaEditavel(evento.statusEscala),
    aceitaResposta: !encerrado && aceitaResposta(evento.statusEscala),
    podeReabrir: !encerrado && (evento.statusEscala === "APROVADA" || evento.statusEscala === "COMUNICADA"),
    aguardandoAprovacao: evento.statusEscala === "AGUARDANDO_APROVACAO",
    encerrado,
    pontosDeAtencao: pontosDeAtencao({
      vagasAbertas: linhas.map((linha) => ({ funcao: linha.nomeDaFuncao, abertas: Math.max(0, linha.quantidade - linha.ativas) })),
      funcoesSemConfirmacao: linhas.filter((linha) => !linha.confirmada).map((linha) => linha.nomeDaFuncao),
      disseramQueNaoPodem: atencao?.disseramQueNaoPodem ?? 0,
      semRespostaNaEnquete: atencao?.semRespostaNaEnquete ?? 0,
      vooSemPedido: atencao?.vooSemPedido ?? 0,
      trainees: atencao?.trainees ?? [],
    }),
    funcoes,
    dias: diasDoEvento(evento.dataInicio, evento.dataFim),
    explicacoes: explicacoesDaRegra(evento.regraVagas, nomeDaFuncao),
  };
}

export type CandidatoSugerido = Candidato & { pontuacao: number; ultimaData: string | null; ultimoEvento: string | null };

export type SugestoesDaVaga = {
  escalaId: string;
  nomeDaFuncao: string;
  vagasAbertas: number;
  temEnquete: boolean;
  sugeridos: CandidatoSugerido[];
  naoPodem: CandidatoSugerido[];
};

/** Pessoas para uma vaga, na ordem da sugestão. Nulo = a linha não existe ou não é deste evento. */
export async function sugerirPessoas(eventoId: string, escalaId: string, agora: Date): Promise<SugestoesDaVaga | null> {
  if (!ehUuid(eventoId) || !ehUuid(escalaId)) return null;
  const consulta = criarConsultaDaEscala(await bancoParaLeitura());
  const linha = await consulta.linhaParaSugestao(escalaId);
  if (!linha || linha.eventoId !== eventoId) return null;

  const local = linha.localLat !== null && linha.localLng !== null ? { lat: linha.localLat, lng: linha.localLng } : null;
  const extras = new Map<string, { ultimaData: string | null; ultimoEvento: string | null }>();
  const candidatos = (await consulta.candidatos(linha, agora)).map((doBanco): Candidato => {
    extras.set(doBanco.pessoaId, { ultimaData: doBanco.ultimaData, ultimoEvento: doBanco.ultimoEvento });
    return {
      pessoaId: doBanco.pessoaId,
      nome: doBanco.nome,
      disponibilidade: doBanco.disponivel === null ? "SEM_RESPOSTA" : doBanco.disponivel ? "PODE" : "NAO_PODE",
      nivel: doBanco.nivel ?? "SEM_FUNCAO",
      distanciaKm: distanciaKm(doBanco.lat !== null && doBanco.lng !== null ? { lat: doBanco.lat, lng: doBanco.lng } : null, local),
      convocacoesUltimos90Dias: doBanco.convocacoesUltimos90Dias,
      diasDesdeUltima: doBanco.diasDesdeUltima,
      jaNoEvento: doBanco.jaNoEvento,
      conflitos: doBanco.conflitos,
    };
  });
  const completar = (candidato: Candidato): CandidatoSugerido => ({
    ...candidato,
    pontuacao: pontuacaoDaSugestao(candidato),
    ultimaData: extras.get(candidato.pessoaId)?.ultimaData ?? null,
    ultimoEvento: extras.get(candidato.pessoaId)?.ultimoEvento ?? null,
  });
  const { sugeridos, naoPodem } = ordenarSugestoes(candidatos);
  return {
    escalaId,
    nomeDaFuncao: linha.nomeDaFuncao,
    vagasAbertas: Math.max(0, linha.quantidade - linha.ativas),
    temEnquete: linha.temEnquete,
    sugeridos: sugeridos.map(completar),
    naoPodem: naoPodem.map(completar),
  };
}
