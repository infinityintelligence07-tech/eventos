import { z } from "zod";

import type { LocalDaTurma } from "./turma";

// Configurações › Locais e hotéis (docs/07 §6.8, docs/08 §12.4). Sem geocodificação automática nesta rodada:
// latitude e longitude são digitadas (a distância até o evento depende delas).
// A base vem do IAM Control (os locais das turmas, pela sincronização); o time cadastra à mão o que não existe lá.

/** Valores do CHECK local_tipo_check. */
export const TIPOS_DE_LOCAL = ["EVENTO", "HOTEL", "APARTAMENTO"] as const;
export type TipoDeLocal = (typeof TIPOS_DE_LOCAL)[number];

export function rotuloDoTipoDeLocal(tipo: TipoDeLocal): string {
  switch (tipo) {
    case "EVENTO":
      return "Local de evento";
    case "HOTEL":
      return "Hotel";
    case "APARTAMENTO":
      return "Apartamento";
    default: {
      const desconhecido: never = tipo;
      throw new Error(`tipo de local desconhecido: ${String(desconhecido)}`);
    }
  }
}

/** Valores do CHECK local_origem_check. IAM_CONTROL: a sincronização de turmas mantém nome e endereço. */
export const ORIGENS_DO_LOCAL = ["EVENTOS", "IAM_CONTROL"] as const;
export type OrigemDoLocal = (typeof ORIGENS_DO_LOCAL)[number];

export function rotuloDaOrigemDoLocal(origem: OrigemDoLocal): string {
  switch (origem) {
    case "IAM_CONTROL":
      return "IAM Control";
    case "EVENTOS":
      return "Cadastrado no Eventos";
    default: {
      const desconhecida: never = origem;
      throw new Error(`origem de local desconhecida: ${String(desconhecida)}`);
    }
  }
}

/**
 * O que o IAM Control manda de um local (o cadastro de lá não tem complemento). No local vindo de lá o time não edita
 * estes campos: a sincronização escreveria por cima. Tipo, complemento, capacidade e localização no mapa são do Eventos.
 */
export const CAMPOS_DO_IAM_CONTROL = ["nome", "cidade", "uf", "cep", "logradouro", "numero", "bairro"] as const;
export type CamposDoIamControl = Pick<LocalDaTurma, (typeof CAMPOS_DO_IAM_CONTROL)[number]>;

/** Local do IAM Control é onde o evento acontece; o time marca como hotel o que também hospeda o staff. */
export const TIPOS_DE_LOCAL_DO_IAM_CONTROL = ["EVENTO", "HOTEL"] as const;

/**
 * Texto para comparar nome e cidade: sem maiúsculas, sem acentos e com um espaço só entre as palavras. A mesma regra
 * do hotel informado pela SDC (`hotelComNome`, em SQL); um teste de integração confere que as duas concordam.
 */
export function textoParaComparar(valor: string): string {
  return valor
    .trim()
    .replace(/\s+/g, " ")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

/** Mesmo nome + cidade + UF = mesmo lugar. É por esta chave que um cadastro do Eventos é ligado ao local do IAM Control. */
export function chaveDoLocal(local: { nome: string; cidade: string; uf: string }): string {
  return [textoParaComparar(local.nome), textoParaComparar(local.cidade), local.uf.trim().toUpperCase()].join("|");
}

export type LocalParaCorresponder = {
  id: string;
  tipo: TipoDeLocal;
  origem: OrigemDoLocal;
  iamControlEnderecoId: number | null;
  nome: string;
  cidade: string;
  uf: string;
  criadoEm: Date;
};

/**
 * Os cadastros do Eventos que são este local do IAM Control, com o que o evento deve usar em primeiro lugar.
 * Pelo id do IAM Control quando ele vem; senão por nome + cidade + UF. Local cadastrado lá casa com local de evento e
 * com hotel (o hotel que o time ou a SDC cadastrou à mão é ligado, não duplicado); endereço digitado na turma só casa
 * com local de evento. Apartamento da IAM nunca casa.
 */
export function correspondentesDoIamControl<T extends LocalParaCorresponder>(
  local: Pick<LocalDaTurma, "nome" | "cidade" | "uf" | "iamControlEnderecoId" | "cadastrado">,
  candidatos: readonly T[],
): T[] {
  const chave = chaveDoLocal(local);
  const tipos: readonly TipoDeLocal[] = local.cadastrado ? TIPOS_DE_LOCAL_DO_IAM_CONTROL : ["EVENTO"];
  const peloId = (candidato: T) => local.iamControlEnderecoId !== null && candidato.iamControlEnderecoId === local.iamControlEnderecoId;
  const pelaChave = (candidato: T) =>
    chaveDoLocal(candidato) === chave && (local.iamControlEnderecoId === null || candidato.iamControlEnderecoId === null);
  // Menor = mais forte: o id do IAM Control, depois local de evento, depois o que já veio de lá, depois o mais antigo.
  const peso = (candidato: T) => [peloId(candidato) ? 0 : 1, candidato.tipo === "EVENTO" ? 0 : 1, candidato.origem === "IAM_CONTROL" ? 0 : 1];
  return candidatos
    .filter((candidato) => tipos.includes(candidato.tipo) && (peloId(candidato) || pelaChave(candidato)))
    .sort((a, b) => {
      const [pesoA, pesoB] = [peso(a), peso(b)];
      const diferente = pesoA.findIndex((valor, indice) => valor !== pesoB[indice]);
      return diferente >= 0 ? pesoA[diferente]! - pesoB[diferente]! : a.criadoEm.getTime() - b.criadoEm.getTime() || a.id.localeCompare(b.id);
    });
}

/** Os campos do IAM Control que estão diferentes no cadastro do Eventos, com de/para. Vazio = já está igual. */
export function mudancasVindasDoIamControl(atual: CamposDoIamControl, doIamControl: CamposDoIamControl): Record<string, { de: unknown; para: unknown }> {
  return mudancasDoLocal(
    Object.fromEntries(CAMPOS_DO_IAM_CONTROL.map((campo) => [campo, atual[campo]])),
    Object.fromEntries(CAMPOS_DO_IAM_CONTROL.map((campo) => [campo, doIamControl[campo]])),
  );
}

export type UsoDoLocal = { eventos: number; hospedagens: number };

/** Local em uso não é arquivado (eventos e hospedagens apontam para ele). Nulo = pode arquivar. */
export function motivoParaNaoArquivar(uso: UsoDoLocal): string | null {
  const partes = [
    uso.eventos > 0 ? (uso.eventos === 1 ? "1 evento" : `${uso.eventos} eventos`) : null,
    uso.hospedagens > 0 ? (uso.hospedagens === 1 ? "1 hospedagem" : `${uso.hospedagens} hospedagens`) : null,
  ].filter(Boolean);
  return partes.length > 0 ? `Este local está em ${partes.join(" e ")}.` : null;
}

const textoOpcional = (maximo: number) =>
  z
    .string()
    .trim()
    .max(maximo, `Use até ${maximo} caracteres.`)
    .optional()
    .transform((valor) => valor || null);

/** Aceita vírgula decimal ("-3,119"). */
const coordenada = (limite: number, nome: string) =>
  z.preprocess(
    (valor) => (typeof valor === "string" ? valor.trim().replace(",", ".") : valor),
    z.coerce
      .number({ error: `Informe a ${nome} em graus decimais.` })
      .min(-limite, `A ${nome} vai de -${limite} a ${limite}.`)
      .max(limite, `A ${nome} vai de -${limite} a ${limite}.`)
      .optional(),
  );

const coordenadasJuntas = (local: { lat?: number; lng?: number }, contexto: z.RefinementCtx) => {
  if ((local.lat === undefined) !== (local.lng === undefined)) {
    contexto.addIssue({
      code: "custom",
      path: [local.lat === undefined ? "lat" : "lng"],
      message: "Informe latitude e longitude juntas (ou deixe as duas vazias).",
    });
  }
};

const capacidade = z.coerce.number({ error: "Informe um número." }).int("Use um número inteiro.").positive("Informe um número maior que zero.").optional();

export const salvarLocalSchema = z
  .object({
    localId: z.uuid().optional(),
    nome: z.string().trim().min(2, "Informe o nome.").max(120, "Use até 120 caracteres."),
    tipo: z.enum(TIPOS_DE_LOCAL, "Escolha o tipo."),
    cep: z
      .string()
      .trim()
      .regex(/^\d{5}-?\d{3}$/, "Use o CEP com 8 números (00000-000).")
      .optional()
      .transform((valor) => (valor ? `${valor.replace("-", "").slice(0, 5)}-${valor.replace("-", "").slice(5)}` : null)),
    logradouro: textoOpcional(160),
    numero: textoOpcional(20),
    complemento: textoOpcional(80),
    bairro: textoOpcional(80),
    cidade: z.string().trim().min(2, "Informe a cidade.").max(80, "Use até 80 caracteres."),
    uf: z
      .string()
      .trim()
      .toUpperCase()
      .regex(/^[A-Z]{2}$/, "Use a sigla do estado (SP, AM...)."),
    lat: coordenada(90, "latitude"),
    lng: coordenada(180, "longitude"),
    capacidade,
  })
  .superRefine(coordenadasJuntas)
  .transform(({ lat, lng, capacidade, ...local }) => ({ ...local, lat: lat ?? null, lng: lng ?? null, capacidade: capacidade ?? null }));
export type SalvarLocal = z.output<typeof salvarLocalSchema>;

/** Local vindo do IAM Control: só o que é do Eventos. Nome e endereço não entram (mudam no IAM Control). */
export const ajustarLocalDoIamControlSchema = z
  .object({
    localId: z.uuid(),
    tipo: z.enum(TIPOS_DE_LOCAL_DO_IAM_CONTROL, "Escolha local de evento ou hotel."),
    complemento: textoOpcional(80),
    lat: coordenada(90, "latitude"),
    lng: coordenada(180, "longitude"),
    capacidade,
  })
  .superRefine(coordenadasJuntas)
  .transform(({ lat, lng, capacidade, ...local }) => ({ ...local, lat: lat ?? null, lng: lng ?? null, capacidade: capacidade ?? null }));
export type AjustarLocalDoIamControl = z.output<typeof ajustarLocalDoIamControlSchema>;

export const arquivarLocalSchema = z.object({ localId: z.uuid() });

/** Campos que mudaram, com de/para (para o registro_acao do local: endereço de local não é dado pessoal). */
export function mudancasDoLocal(
  antes: Record<string, unknown> | null,
  depois: Record<string, unknown>,
): Record<string, { de: unknown; para: unknown }> {
  const iguais = (a: unknown, b: unknown) => (a ?? null) === (b ?? null);
  return Object.fromEntries(
    Object.entries(depois)
      .filter(([campo, valor]) => !iguais(antes?.[campo], valor))
      .map(([campo, valor]) => [campo, { de: antes?.[campo] ?? null, para: valor ?? null }]),
  );
}
