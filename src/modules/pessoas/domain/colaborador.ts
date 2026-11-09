// Colaborador do IAM Control -> usuário, pessoa e staff do Eventos (docs/10, decisões de 09/11).
//   Time de eventos (perfil EVENTOS_TIME): conta ativa com o setor EVENTOS. Líder nunca vem daqui (só manual).
//   Staff escalável (eventos.pessoa_evento): conta ativa com alguma função de evento.
//   Funções do Eventos: só as que têm correspondente direto; o time completa à mão.

/** Funções do IAM Control (EFuncoes) que fazem a pessoa ser escalável. */
export const FUNCOES_ESCALAVEIS = [
  "STAFF",
  "DJ",
  "FOTOGRAFO",
  "SOCIAL_MEDIA",
  "LIDER_DE_EVENTOS",
  "LIDER_DE_CONFRONTO",
  "LIDER_DE_MASTERCLASS",
  "PALESTRANTE",
  "LOGISTICA",
] as const;

/** Função do IAM Control -> código de eventos.funcao. */
const FUNCAO_NO_EVENTOS: Readonly<Record<string, string>> = {
  STAFF: "STAFF",
  DJ: "DJ",
  FOTOGRAFO: "FOTOGRAFO",
  SOCIAL_MEDIA: "SOCIAL_MEDIA",
  LIDER_DE_EVENTOS: "LIDER_EVENTO",
  LIDER_DE_CONFRONTO: "LIDER",
  LIDER_DE_MASTERCLASS: "LIDER",
  PALESTRANTE: "PALESTRANTE",
};

export const SETOR_DO_TIME = "EVENTOS";

export type ColaboradorDoIamControl = {
  id: number;
  nome: string;
  email: string;
  telefone: string | null;
  setores: readonly string[];
  funcoes: readonly string[];
  ativo: boolean;
};

export type PlanoDoColaborador = {
  iamControlUserId: number;
  /** Minúsculas, sem espaços: a chave do core.usuario (o login compara assim). */
  email: string;
  nome: string;
  telefone: string | null;
  ativo: boolean;
  /** Ganha EVENTOS_TIME (nunca é retirado pela sincronização). */
  timeDeEventos: boolean;
  /** Entra (ou continua) como staff escalável. */
  escalavel: boolean;
  /** Códigos de eventos.funcao, sem repetição. */
  funcoesDoEventos: string[];
};

export type ColaboradorIgnorado = { iamControlUserId: number; motivo: "EMAIL_INVALIDO" | "NOME_VAZIO" };

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function planoDoColaborador(colaborador: ColaboradorDoIamControl): { ok: true; plano: PlanoDoColaborador } | ({ ok: false } & ColaboradorIgnorado) {
  const email = colaborador.email.trim().toLowerCase();
  if (!EMAIL.test(email)) return { ok: false, iamControlUserId: colaborador.id, motivo: "EMAIL_INVALIDO" };
  const nome = colaborador.nome.trim().replace(/\s+/g, " ");
  if (!nome) return { ok: false, iamControlUserId: colaborador.id, motivo: "NOME_VAZIO" };

  const funcoes = new Set(colaborador.funcoes);
  const ativo = colaborador.ativo;
  return {
    ok: true,
    plano: {
      iamControlUserId: colaborador.id,
      email,
      nome,
      telefone: colaborador.telefone?.trim() || null,
      ativo,
      timeDeEventos: ativo && colaborador.setores.includes(SETOR_DO_TIME),
      escalavel: ativo && FUNCOES_ESCALAVEIS.some((funcao) => funcoes.has(funcao)),
      funcoesDoEventos: [...new Set([...funcoes].flatMap((funcao) => (FUNCAO_NO_EVENTOS[funcao] ? [FUNCAO_NO_EVENTOS[funcao]] : [])))],
    },
  };
}
