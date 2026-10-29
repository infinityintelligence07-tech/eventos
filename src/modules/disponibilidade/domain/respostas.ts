// Respostas da enquete: matriz pessoa × evento (doc 08 §8.3) e o plano do "Registrar resposta" em nome da pessoa.
// A chave de disponibilidade é (evento, pessoa): um evento em duas enquetes tem uma resposta só.

export type Resposta = "PODE" | "NAO_PODE" | "SEM_RESPOSTA";

export const RESPOSTAS: readonly Resposta[] = ["PODE", "NAO_PODE", "SEM_RESPOSTA"];

export function respostaDe(disponivel: boolean | null | undefined): Resposta {
  if (disponivel === true) return "PODE";
  if (disponivel === false) return "NAO_PODE";
  return "SEM_RESPOSTA";
}

export function rotuloDaResposta(resposta: Resposta): string {
  switch (resposta) {
    case "PODE":
      return "Pode";
    case "NAO_PODE":
      return "Não pode";
    case "SEM_RESPOSTA":
      return "Sem resposta";
    default: {
      const desconhecida: never = resposta;
      throw new Error(`resposta desconhecida: ${String(desconhecida)}`);
    }
  }
}

export type PessoaDaEnquete = {
  pessoaId: string;
  nome: string;
  poloCodigo: string | null;
  funcoes: { codigo: string; nome: string }[];
};

export type RespostaGravada = {
  eventoId: string;
  pessoaId: string;
  disponivel: boolean;
  respondidoEm: Date;
  /** Preenchido = registrada pelo time em nome da pessoa. */
  registradoPor: string | null;
};

export type LinhaDaMatriz = {
  pessoa: PessoaDaEnquete;
  respostas: Record<string, Resposta>;
  respondeu: boolean;
  /** Última resposta registrada pelo time (selo "Registrado pelo time"); nulo se a pessoa respondeu sozinha ou não respondeu. */
  registradoPeloTimeEm: Date | null;
};

export type TotalDoEvento = { eventoId: string; podem: number; naoPodem: number; semResposta: number };

export type Matriz = {
  linhas: LinhaDaMatriz[];
  totais: TotalDoEvento[];
  /** Pessoas com pelo menos uma resposta nos eventos da enquete. */
  responderam: number;
};

export function montarMatriz(pessoas: PessoaDaEnquete[], eventoIds: string[], respostas: RespostaGravada[]): Matriz {
  const eventos = new Set(eventoIds);
  const porPessoa = new Map<string, RespostaGravada[]>();
  for (const resposta of respostas) {
    if (!eventos.has(resposta.eventoId)) continue;
    const lista = porPessoa.get(resposta.pessoaId) ?? [];
    lista.push(resposta);
    porPessoa.set(resposta.pessoaId, lista);
  }

  const totais = new Map(eventoIds.map((eventoId) => [eventoId, { eventoId, podem: 0, naoPodem: 0, semResposta: 0 }]));
  const linhas = pessoas.map((pessoa): LinhaDaMatriz => {
    const daPessoa = porPessoa.get(pessoa.pessoaId) ?? [];
    const respostasDaLinha: Record<string, Resposta> = {};
    for (const eventoId of eventoIds) {
      const resposta = respostaDe(daPessoa.find((item) => item.eventoId === eventoId)?.disponivel);
      respostasDaLinha[eventoId] = resposta;
      const total = totais.get(eventoId)!;
      if (resposta === "PODE") total.podem += 1;
      else if (resposta === "NAO_PODE") total.naoPodem += 1;
      else total.semResposta += 1;
    }
    const peloTime = daPessoa.filter((item) => item.registradoPor !== null).map((item) => item.respondidoEm.getTime());
    return {
      pessoa,
      respostas: respostasDaLinha,
      respondeu: daPessoa.length > 0,
      registradoPeloTimeEm: peloTime.length > 0 ? new Date(Math.max(...peloTime)) : null,
    };
  });

  return { linhas, totais: [...totais.values()], responderam: linhas.filter((linha) => linha.respondeu).length };
}

export type FiltrosDaMatriz = { busca?: string | null; polo?: string | null; funcao?: string | null; soSemResposta?: boolean };

export function normalizarBusca(texto: string): string {
  return texto
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .trim();
}

export function filtrarLinhas(linhas: LinhaDaMatriz[], filtros: FiltrosDaMatriz): LinhaDaMatriz[] {
  const busca = filtros.busca ? normalizarBusca(filtros.busca) : "";
  return linhas.filter(
    (linha) =>
      (!busca || normalizarBusca(linha.pessoa.nome).includes(busca)) &&
      (!filtros.polo || linha.pessoa.poloCodigo === filtros.polo) &&
      (!filtros.funcao || linha.pessoa.funcoes.some((funcao) => funcao.codigo === filtros.funcao)) &&
      (!filtros.soSemResposta || !linha.respondeu),
  );
}

export type RespostaAtual = { disponivel: boolean; enqueteId: string };

export type MudancaDeResposta =
  | { tipo: "GRAVAR"; eventoId: string; disponivel: boolean; de: Resposta }
  | { tipo: "APAGAR"; eventoId: string; de: Resposta };

/**
 * O que gravar para deixar as respostas pedidas. Resposta igual na mesma enquete não muda nada (mantém a data);
 * igual vinda de outra enquete passa para esta (o upsert troca o enquete_id).
 */
export function planoDoRegistro({
  enqueteId,
  eventosDaEnquete,
  atuais,
  pedidas,
}: {
  enqueteId: string;
  eventosDaEnquete: string[];
  atuais: Map<string, RespostaAtual>;
  pedidas: { eventoId: string; resposta: Resposta }[];
}): MudancaDeResposta[] {
  const daEnquete = new Set(eventosDaEnquete);
  const fora = pedidas.filter((pedida) => !daEnquete.has(pedida.eventoId)).map((pedida) => pedida.eventoId);
  if (fora.length > 0) throw new EventoForaDaEnqueteError(fora);

  const mudancas: MudancaDeResposta[] = [];
  for (const { eventoId, resposta } of pedidas) {
    const atual = atuais.get(eventoId);
    const de = respostaDe(atual?.disponivel);
    switch (resposta) {
      case "SEM_RESPOSTA":
        if (atual) mudancas.push({ tipo: "APAGAR", eventoId, de });
        break;
      case "PODE":
      case "NAO_PODE": {
        const disponivel = resposta === "PODE";
        if (!atual || atual.disponivel !== disponivel || atual.enqueteId !== enqueteId) mudancas.push({ tipo: "GRAVAR", eventoId, disponivel, de });
        break;
      }
      default: {
        const desconhecida: never = resposta;
        throw new Error(`resposta desconhecida: ${String(desconhecida)}`);
      }
    }
  }
  return mudancas;
}

/** Evento pedido que não faz parte da enquete. */
export class EventoForaDaEnqueteError extends Error {
  constructor(readonly eventoIds: string[]) {
    super(`eventos fora da enquete: ${eventoIds.join(", ")}`);
    this.name = "EventoForaDaEnqueteError";
  }
}

/** Quem responde a enquete é o staff ativo (pessoa_evento + core.pessoa ativa). */
export class PessoaForaDaEnqueteError extends Error {
  constructor(readonly pessoaId: string) {
    super(`pessoa ${pessoaId} não é staff ativo`);
    this.name = "PessoaForaDaEnqueteError";
  }
}
