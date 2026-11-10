import { z } from "zod";

import type { ModeloDeCamiseta, NivelNaFuncao, Sexo, TamanhoDeCamiseta } from "./cadastro";

// "Meu cadastro" (docs/10): o próprio staff completa o que o Eventos precisa. Só os dados dele, decididos no servidor
// pela sessão (nunca um id vindo do formulário). Rua e número viram coordenada e não ficam gravados (minimização).

const texto = (maximo: number) =>
  z
    .string()
    .max(maximo, `Até ${maximo} caracteres.`)
    .optional()
    .transform((valor) => valor?.trim().replace(/\s+/g, " ") || null);

/** "10,5" ou "10.5". */
const consumo = z
  .string()
  .max(10)
  .optional()
  .transform((valor, contexto) => {
    const limpo = valor?.trim();
    if (!limpo) return null;
    const numero = Number(limpo.replace(",", "."));
    if (!/^\d+([.,]\d+)?$/.test(limpo) || numero <= 0 || numero >= 100) {
      contexto.addIssue({ code: "custom", message: "Informe o consumo em km por litro (ex.: 10,5)." });
      return z.NEVER;
    }
    return numero;
  });

export const meuCadastroSchema = z
  .object({
    poloCodigo: z.string().trim().min(1, "Escolha o seu polo.").max(10),
    sexo: z.enum(["F", "M"] satisfies Sexo[], { message: "Escolha uma opção." }),
    camisetaModelo: z.enum(["CAMISETA", "BABY_LOOK"] satisfies ModeloDeCamiseta[], { message: "Escolha o modelo." }),
    camisetaTamanho: z.enum(["PP", "P", "M", "G", "GG", "XG"] satisfies TamanhoDeCamiseta[], { message: "Escolha o tamanho." }),
    funcoes: z.array(z.uuid()).max(30),
    cep: z
      .string()
      .optional()
      .transform((valor) => valor?.replace(/\D/g, "") || null)
      .pipe(z.string().regex(/^\d{8}$/, "CEP com 8 números.").nullable()),
    logradouro: texto(150),
    numero: texto(20),
    bairro: texto(80),
    cidade: texto(80),
    uf: z
      .string()
      .optional()
      .transform((valor) => valor?.trim().toUpperCase() || null)
      .pipe(z.string().regex(/^[A-Z]{2}$/, "UF com 2 letras.").nullable()),
    temCarro: z.enum(["SIM", "NAO"], { message: "Diga se tem carro." }),
    lugares: z
      .string()
      .optional()
      .transform((valor) => (valor?.trim() ? Number(valor) : null))
      .pipe(z.number().int("Use um número inteiro.").min(1, "De 1 a 8 lugares.").max(8, "De 1 a 8 lugares.").nullable()),
    consumoKmL: consumo,
  })
  .superRefine((dados, contexto) => {
    if (dados.temCarro === "SIM" && dados.lugares === null) {
      contexto.addIssue({ code: "custom", path: ["lugares"], message: "Quantos passageiros cabem no carro?" });
    }
    if (!dados.cidade) contexto.addIssue({ code: "custom", path: ["cidade"], message: "Informe a cidade." });
    if (!dados.uf) contexto.addIssue({ code: "custom", path: ["uf"], message: "Informe a UF." });
  });

export type MeuCadastro = z.output<typeof meuCadastroSchema>;

export type FuncaoDoStaff = { funcaoId: string; nivel: NivelNaFuncao };

/**
 * O staff sugere, o time confirma: o que ele marca e ainda não tinha entra como TRAINEE; o que o time já habilitou
 * fica (mesmo desmarcado); TRAINEE desmarcado sai.
 */
export function funcoesDepoisDoStaff(atuais: readonly FuncaoDoStaff[], marcadas: readonly string[]): FuncaoDoStaff[] {
  const marcadasSet = new Set(marcadas);
  const mantidas = atuais.filter((funcao) => funcao.nivel === "HABILITADO" || marcadasSet.has(funcao.funcaoId));
  const ja = new Set(atuais.map((funcao) => funcao.funcaoId));
  const novas = [...marcadasSet].filter((funcaoId) => !ja.has(funcaoId)).map((funcaoId) => ({ funcaoId, nivel: "TRAINEE" as const }));
  return [...mantidas, ...novas];
}

/**
 * Endereço para a geocodificação: só com rua e número (cidade sozinha daria um ponto no centro da cidade e um km
 * errado). Nulo = não recalcular (mantém a coordenada que já existe, se houver).
 */
export function enderecoParaGeocodificar(dados: Pick<MeuCadastro, "logradouro" | "numero" | "bairro" | "cidade" | "uf" | "cep">): string | null {
  if (!dados.logradouro || !dados.numero || !dados.cidade || !dados.uf) return null;
  return [`${dados.logradouro}, ${dados.numero}`, dados.bairro, `${dados.cidade} - ${dados.uf}`, dados.cep, "Brasil"].filter(Boolean).join(", ");
}
