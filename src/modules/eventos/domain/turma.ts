import { montarCodigoEvento } from "./codigo";

// Converte uma turma do IAM Control (GET /api/webhooks/eventos/turmas) nos dados do evento.
// O IAM Control é a fonte de datas, edição, polo, local e cancelamento; o Eventos é dono do resto.

export type TurmaIamControl = {
  id: number;
  edicao: string | null;
  data_inicio: string | null;
  data_final: string | null;
  status_evento: string | null;
  meta: number | null;
  capacidade: number | null;
  inscritos_ativos: number;
  treinamento: { nome: string | null; sigla: string | null; tipo_palestra: boolean };
  polo: { sigla: string; nome: string; cidade: string; estado: string } | null;
  local: {
    nome: string | null;
    logradouro: string | null;
    numero: string | null;
    complemento: string | null;
    bairro: string | null;
    cidade: string | null;
    estado: string | null;
    cep: string | null;
  };
  excluida_em: string | null;
};

export type StatusEvento = "PLANEJADO" | "EM_ANDAMENTO" | "CONCLUIDO" | "CANCELADO";

export type LocalDaTurma = {
  nome: string;
  logradouro: string | null;
  numero: string | null;
  complemento: string | null;
  bairro: string | null;
  cidade: string;
  uf: string;
  cep: string | null;
};

export type EventoDaTurma = {
  iamControlTurmaId: number;
  tipoSigla: string;
  codigo: string | null;
  edicao: string | null;
  nome: string;
  inicio: Date;
  fim: Date;
  /** Datas do evento (AAAA-MM-DD), sem fuso. */
  dataInicio: string;
  dataFim: string;
  status: StatusEvento;
  /** Sugestão de público: o maior entre a meta e os inscritos ativos. O time pode ajustar. */
  expectativaPublico: number | null;
  poloSigla: string | null;
  local: LocalDaTurma | null;
};

export type MotivoTurmaIgnorada = "TIPO_NAO_RECONHECIDO" | "SEM_DATA" | "TURMA_DE_CONTROLE";

// O IAM Control guarda alunos fora de turma (cancelados, inadimplentes, no jurídico...) em turmas
// com essas edições e data 31/12/2999. Não são eventos.
const EDICOES_DE_CONTROLE = new Set(["CANCELADA", "SEM_TURMA", "INADIMPLENTE", "JURIDICO"]);
const ANO_DE_CONTROLE = "2900";

function turmaDeControle(edicao: string | null, dataInicio: string): boolean {
  const edicaoNormalizada = normalizar(edicao).replace(/ /g, "_").toUpperCase();
  return EDICOES_DE_CONTROLE.has(edicaoNormalizada) || dataInicio.slice(0, 4) >= ANO_DE_CONTROLE;
}

export type TurmaConvertida =
  | { ok: true; evento: EventoDaTurma }
  | { ok: false; iamControlTurmaId: number; motivo: MotivoTurmaIgnorada; treinamento: string | null };

/** No IAM Control o IPR passou a se chamar ASM a partir da edição 230 (migration RenomearIprParaAsm). */
export const PRIMEIRA_EDICAO_ASM = 230;

function normalizar(texto: string | null | undefined): string {
  return (texto ?? "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function numeroDaEdicao(edicao: string | null): number | null {
  const limpo = (edicao ?? "").trim();
  return /^\d{1,5}$/.test(limpo) && Number(limpo) > 0 ? Number(limpo) : null;
}

/** Sigla do `tipo_evento` para o treinamento da turma, ou null se não for evento que o time escala. */
export function tipoDoTreinamento(
  treinamento: TurmaIamControl["treinamento"],
  edicao: string | null,
): string | null {
  const nome = ` ${normalizar(treinamento.nome)} `;
  const sigla = normalizar(treinamento.sigla).replace(/ /g, "_").toUpperCase();
  const tem = (...termos: string[]) => termos.some((termo) => nome.includes(` ${termo} `));

  if (sigla === "IPR" || sigla === "ASM" || tem("imersao prosperar", "acorde sua mente", "ipr", "asm")) {
    const numero = numeroDaEdicao(edicao);
    if (numero !== null) {
      return numero >= PRIMEIRA_EDICAO_ASM ? "ASM" : "IPR";
    }
    return sigla === "ASM" || tem("asm", "acorde sua mente") ? "ASM" : "IPR";
  }
  if (sigla === "CONF" || tem("confronto")) return "CONF";
  if (sigla === "MG" || tem("missao governar")) return "MG";
  // Antes de "liberty": a Imersão de Negócios é um produto da Liberty (IDN).
  if (sigla === "IDN" || tem("imersao de negocios")) return "IMERSAO_NEGOCIOS";
  if (tem("mesa de destino")) return "MESA_DESTINO";
  if (tem("life coach")) return "LIFE_COACH";
  if (tem("trainer")) return "TRAINER";
  if (tem("pnl", "pmr")) return "PNL_PMR";
  if (tem("legacy xp", "legacyxp") || sigla === "LEGACY" || sigla === "LEGACY_XP") return "LEGACY";
  if (sigla === "LIB" || tem("liberty")) return "LIB";
  if (treinamento.tipo_palestra || tem("masterclass", "master class")) return "MC";
  return null;
}

const UF_POR_NOME: Record<string, string> = {
  acre: "AC", alagoas: "AL", amapa: "AP", amazonas: "AM", bahia: "BA", ceara: "CE",
  "distrito federal": "DF", "espirito santo": "ES", goias: "GO", maranhao: "MA",
  "mato grosso": "MT", "mato grosso do sul": "MS", "minas gerais": "MG", para: "PA",
  paraiba: "PB", parana: "PR", pernambuco: "PE", piaui: "PI", "rio de janeiro": "RJ",
  "rio grande do norte": "RN", "rio grande do sul": "RS", rondonia: "RO", roraima: "RR",
  "santa catarina": "SC", "sao paulo": "SP", sergipe: "SE", tocantins: "TO",
};
const UFS = new Set(Object.values(UF_POR_NOME));

/** "sp", "SP", "São Paulo" -> "SP"; o que não for estado brasileiro -> null. */
export function siglaDaUf(estado: string | null | undefined): string | null {
  const limpo = (estado ?? "").trim();
  if (UFS.has(limpo.toUpperCase())) return limpo.toUpperCase();
  return UF_POR_NOME[normalizar(limpo)] ?? null;
}

function textoOuNulo(valor: string | null | undefined): string | null {
  const limpo = (valor ?? "").trim();
  return limpo === "" ? null : limpo;
}

function localDaTurma(turma: TurmaIamControl): LocalDaTurma | null {
  const cidade = textoOuNulo(turma.local.cidade) ?? textoOuNulo(turma.polo?.cidade);
  const uf = siglaDaUf(turma.local.estado) ?? siglaDaUf(turma.polo?.estado);
  if (!cidade || !uf) return null;

  const logradouro = textoOuNulo(turma.local.logradouro);
  return {
    nome: textoOuNulo(turma.local.nome) ?? (logradouro ? `${logradouro}, ${cidade}` : `Local a definir — ${cidade}`),
    logradouro,
    numero: textoOuNulo(turma.local.numero),
    complemento: textoOuNulo(turma.local.complemento),
    bairro: textoOuNulo(turma.local.bairro),
    cidade,
    uf,
    cep: textoOuNulo(turma.local.cep)?.replace(/\D/g, "") || null,
  };
}

// Brasil sem horário de verão desde 2019: o dia do evento vai de 00:00 a 23:59:59 em -03:00.
function inicioDoDia(data: string): Date {
  return new Date(`${data}T00:00:00-03:00`);
}
function fimDoDia(data: string): Date {
  return new Date(`${data}T23:59:59-03:00`);
}

const DATA = /^\d{4}-\d{2}-\d{2}$/;

export function statusDoEvento(
  turma: Pick<TurmaIamControl, "excluida_em" | "status_evento">,
  dataInicio: string,
  dataFim: string,
  hoje: string,
): StatusEvento {
  if (turma.excluida_em || turma.status_evento === "CANCELADA") return "CANCELADO";
  if (dataFim < hoje) return "CONCLUIDO";
  if (dataInicio <= hoje) return "EM_ANDAMENTO";
  return "PLANEJADO";
}

/**
 * @param hoje data de hoje em São Paulo (AAAA-MM-DD), para o status.
 * @param nomesDosTipos nome de exibição por sigla de tipo (tipo_evento.nome).
 */
export function eventoDaTurma(
  turma: TurmaIamControl,
  hoje: string,
  nomesDosTipos: Readonly<Record<string, string>> = {},
): TurmaConvertida {
  const tipoSigla = tipoDoTreinamento(turma.treinamento, turma.edicao);
  if (!tipoSigla) {
    return { ok: false, iamControlTurmaId: turma.id, motivo: "TIPO_NAO_RECONHECIDO", treinamento: turma.treinamento.nome };
  }

  const dataInicio = turma.data_inicio?.slice(0, 10) ?? "";
  const dataFinal = turma.data_final?.slice(0, 10) || dataInicio;
  if (!DATA.test(dataInicio) || !DATA.test(dataFinal)) {
    return { ok: false, iamControlTurmaId: turma.id, motivo: "SEM_DATA", treinamento: turma.treinamento.nome };
  }
  if (turmaDeControle(turma.edicao, dataInicio)) {
    return { ok: false, iamControlTurmaId: turma.id, motivo: "TURMA_DE_CONTROLE", treinamento: turma.treinamento.nome };
  }

  // Data final antes da inicial é erro de digitação: o evento fica com um dia só.
  const dataFim = dataFinal < dataInicio ? dataInicio : dataFinal;
  const edicao = textoOuNulo(turma.edicao);
  const numero = numeroDaEdicao(edicao);
  const poloSigla = textoOuNulo(turma.polo?.sigla)?.toUpperCase() ?? null;
  let codigo: string | null = null;
  if (numero !== null && poloSigla) {
    try {
      codigo = montarCodigoEvento({ sigla: tipoSigla, polo: poloSigla, edicao: numero });
    } catch {
      codigo = null;
    }
  }

  const local = localDaTurma(turma);
  const rotulo = nomesDosTipos[tipoSigla] ?? textoOuNulo(turma.treinamento.nome) ?? tipoSigla;
  const nome = [rotulo, edicao ? `ed. ${edicao}` : null, local?.cidade ?? turma.polo?.nome ?? null]
    .filter(Boolean)
    .join(" · ");

  const publico = Math.max(turma.meta ?? 0, turma.inscritos_ativos);

  return {
    ok: true,
    evento: {
      iamControlTurmaId: turma.id,
      tipoSigla,
      codigo,
      edicao,
      nome,
      inicio: inicioDoDia(dataInicio),
      fim: fimDoDia(dataFim),
      dataInicio,
      dataFim,
      status: statusDoEvento(turma, dataInicio, dataFim, hoje),
      expectativaPublico: publico > 0 ? publico : null,
      poloSigla,
      local,
    },
  };
}
