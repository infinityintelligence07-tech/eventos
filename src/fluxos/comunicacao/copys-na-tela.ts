import {
  type CanalDaMensagem,
  type CopyDaPessoa,
  ondePreencher,
  type OndePreencher,
  ORDEM_DAS_SITUACOES,
  type ParteDaCopy,
  rotuloDaVariavel,
  type SituacaoDaCopy,
} from "@/modules/comunicacao";

// O que as telas recebem: só texto e números (vai do servidor para o componente do navegador).

export type FaltaNaCopy = { variavel: string; rotulo: string; onde: OndePreencher | null };

export type CopyNaTela = {
  convocacaoId: string;
  eventoId: string;
  pessoaId: string;
  nome: string;
  funcao: string | null;
  telefone: string | null;
  /** Dia da vaga (AAAA-MM-DD) e horário. */
  data: string;
  horaInicio: string;
  horaFim: string;
  statusConvocacao: string;
  situacao: SituacaoDaCopy;
  texto: string;
  partes: ParteDaCopy[];
  faltando: FaltaNaCopy[];
  dadosHash: string;
  /** ISO. */
  ultimaEnviada: { enviadaEm: string; canal: CanalDaMensagem } | null;
};

export function faltasDaCopy(faltando: string[]): FaltaNaCopy[] {
  return faltando.map((variavel) => ({ variavel, rotulo: rotuloDaVariavel(variavel), onde: ondePreencher(variavel) }));
}

export function copyNaTela({ pessoa, copy, situacao, ultimaEnviada }: CopyDaPessoa): CopyNaTela {
  return {
    convocacaoId: pessoa.convocacaoId,
    eventoId: pessoa.eventoId,
    pessoaId: pessoa.pessoaId,
    nome: pessoa.nome,
    funcao: pessoa.funcao,
    telefone: pessoa.telefone,
    data: pessoa.data,
    horaInicio: pessoa.horaInicio,
    horaFim: pessoa.horaFim,
    statusConvocacao: pessoa.status,
    situacao,
    texto: copy.texto,
    partes: copy.partes,
    faltando: faltasDaCopy(copy.faltando),
    dadosHash: copy.dadosHash,
    ultimaEnviada: ultimaEnviada && { enviadaEm: ultimaEnviada.enviadaEm.toISOString(), canal: ultimaEnviada.canal },
  };
}

/** Falta dado → desatualizadas → prontas → enviadas; dentro de cada uma, por nome. */
export function ordenarPorSituacao(copys: CopyNaTela[]): CopyNaTela[] {
  return [...copys].sort(
    (a, b) => ORDEM_DAS_SITUACOES.indexOf(a.situacao) - ORDEM_DAS_SITUACOES.indexOf(b.situacao) || a.nome.localeCompare(b.nome, "pt-BR"),
  );
}