import { type DadosCopy, formatarDataEHora, formatarHorario, formatarPeriodo, primeiroNome, saudacao } from "./copy";

// Monta os dados de {{evento.*}}, {{pessoa.*}}, {{hospedagem.*}} e {{voo.*}} a partir do que o repositório leu.
// Dado ausente fica nulo: o motor de copy aponta a falta em vez de mandar a copy com buraco.

/** Valores do CHECK convocacao_deslocamento_check. */
export type Deslocamento = "CARRO_PROPRIO" | "CARONA" | "CARRO_IAM" | "UBER" | "ONIBUS" | "VOO" | "NAO_SE_APLICA";

export function rotuloDoDeslocamento(deslocamento: Deslocamento): string {
  switch (deslocamento) {
    case "CARRO_PROPRIO":
      return "Carro próprio";
    case "CARONA":
      return "Carona";
    case "CARRO_IAM":
      return "Carro da IAM";
    case "UBER":
      return "Uber";
    case "ONIBUS":
      return "Ônibus";
    case "VOO":
      return "Voo";
    case "NAO_SE_APLICA":
      return "Não se aplica";
    default: {
      const desconhecido: never = deslocamento;
      throw new Error(`deslocamento desconhecido: ${String(desconhecido)}`);
    }
  }
}

/** Trecho de voo emitido pela SDC. */
export type TrechoDaCopy = {
  companhia: string | null;
  numeroVoo: string | null;
  localizador: string | null;
  origemIata: string;
  destinoIata: string;
  partidaEm: Date | null;
};

export type HospedagemDaCopy = {
  hotel: string;
  logradouro: string | null;
  numero: string | null;
  bairro: string | null;
  cidade: string;
  uf: string;
  capacidadeDoQuarto: number;
  colegas: string[];
};

export type ContextoDaCopy = {
  evento: {
    codigo: string | null;
    tipoNome: string | null;
    /** AAAA-MM-DD em São Paulo. */
    dataInicio: string;
    dataFim: string;
    local: { nome: string; cidade: string } | null;
  };
  pessoa: {
    nome: string;
    sexo: "F" | "M" | null;
    funcao: string | null;
    deslocamento: Deslocamento | null;
    /** Início da vaga na escala (HH:MM). */
    horaInicio: string | null;
  };
  hospedagem: HospedagemDaCopy | null;
  voos: { ida: TrechoDaCopy | null; volta: TrechoDaCopy | null };
  linkCustos: string | null;
};

/** "AD4120 (AZUL) · 12/12 às 08:10 · GRU → MAO · localizador KXQ7PZ". Só com o voo emitido (número e horário). */
export function descreverTrecho(trecho: TrechoDaCopy | null): string | null {
  if (!trecho?.numeroVoo || !trecho.partidaEm) return null;
  return [
    trecho.companhia ? `${trecho.numeroVoo} (${trecho.companhia})` : trecho.numeroVoo,
    formatarDataEHora(trecho.partidaEm),
    `${trecho.origemIata} → ${trecho.destinoIata}`,
    trecho.localizador ? `localizador ${trecho.localizador}` : null,
  ]
    .filter(Boolean)
    .join(" · ");
}

function endereco(hospedagem: HospedagemDaCopy): string | null {
  if (!hospedagem.logradouro) return null;
  const rua = hospedagem.numero ? `${hospedagem.logradouro}, ${hospedagem.numero}` : hospedagem.logradouro;
  return [rua, hospedagem.bairro, `${hospedagem.cidade}/${hospedagem.uf}`].filter(Boolean).join(" - ");
}

/** Quarto individual não tem colega; quarto compartilhado ainda sem ninguém conta como dado faltando. */
function colegas(hospedagem: HospedagemDaCopy): string | null {
  if (hospedagem.colegas.length > 0) {
    const nomes = hospedagem.colegas.map(primeiroNome);
    return nomes.length === 1 ? nomes[0]! : `${nomes.slice(0, -1).join(", ")} e ${nomes.at(-1)}`;
  }
  return hospedagem.capacidadeDoQuarto === 1 ? "Quarto individual" : null;
}

export function dadosDaCopy(contexto: ContextoDaCopy, instante: Date): DadosCopy {
  const { evento, pessoa, hospedagem, voos } = contexto;
  return {
    saudacao: saudacao(instante),
    link_custos: contexto.linkCustos,
    evento: {
      tipo: evento.tipoNome,
      codigo: evento.codigo,
      cidade: evento.local?.cidade ?? null,
      data: formatarPeriodo(evento.dataInicio, evento.dataFim),
      horario: pessoa.horaInicio ? formatarHorario(pessoa.horaInicio) : null,
    },
    local: { nome: evento.local?.nome ?? null },
    pessoa: {
      nome: pessoa.nome,
      primeiro_nome: primeiroNome(pessoa.nome),
      funcao: pessoa.funcao,
      deslocamento: pessoa.deslocamento ? rotuloDoDeslocamento(pessoa.deslocamento) : null,
      sexo: pessoa.sexo,
    },
    hospedagem: {
      hotel: hospedagem?.hotel ?? null,
      endereco: hospedagem ? endereco(hospedagem) : null,
      colega: hospedagem ? colegas(hospedagem) : null,
    },
    voo: { ida: descreverTrecho(voos.ida), volta: descreverTrecho(voos.volta) },
  };
}
