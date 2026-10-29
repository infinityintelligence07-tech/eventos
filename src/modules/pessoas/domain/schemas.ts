import { z } from "zod";

import type { ModeloDeCamiseta, NivelNaFuncao, Sexo, TamanhoDeCamiseta } from "./cadastro";

// Schemas das server actions da ficha (docs/07 §6.5). Campo vazio chega ausente (lerFormulario) e vira null.

const opcional = <T extends z.ZodType>(schema: T) => schema.optional().transform((valor) => valor ?? null);

const simOuNao = opcional(z.enum(["SIM", "NAO"]).transform((valor) => valor === "SIM"));

/** "10,5" ou "10.5". */
function decimal(minimo: number, maximo: number, mensagem: string) {
  return z
    .string()
    .max(30, "Número longo demais.")
    .trim()
    .transform((texto, contexto) => {
      const numero = Number(texto.replace(",", "."));
      if (!/^-?\d+([.,]\d+)?$/.test(texto) || !Number.isFinite(numero) || numero < minimo || numero > maximo) {
        contexto.addIssue({ code: "custom", message: mensagem });
        return z.NEVER;
      }
      return numero;
    });
}

export const salvarPerfilDoStaffSchema = z.object({
  pessoaId: z.uuid(),
  sexo: opcional(z.enum(["F", "M"] satisfies Sexo[])),
  camisetaModelo: opcional(z.enum(["CAMISETA", "BABY_LOOK"] satisfies ModeloDeCamiseta[])),
  camisetaTamanho: opcional(z.enum(["PP", "P", "M", "G", "GG", "XG"] satisfies TamanhoDeCamiseta[])),
  possuiCamiseta: simOuNao,
  fezConfronto: simOuNao,
  temCnpj: simOuNao,
});

export type SalvarPerfilDoStaff = z.output<typeof salvarPerfilDoStaffSchema>;

/** Substitui o conjunto. Linha sem `funcaoId` (caixa desmarcada) é ignorada. */
export const definirFuncoesSchema = z.object({
  pessoaId: z.uuid(),
  funcoes: z.preprocess(
    (valor) => (Array.isArray(valor) ? valor.filter((linha) => typeof linha === "object" && linha !== null && "funcaoId" in linha) : []),
    z
      .array(z.object({ funcaoId: z.uuid(), nivel: z.enum(["TRAINEE", "HABILITADO"] satisfies NivelNaFuncao[]).default("HABILITADO") }))
      .max(50, "Até 50 funções.")
      .refine((funcoes) => new Set(funcoes.map((funcao) => funcao.funcaoId)).size === funcoes.length, "Função repetida."),
  ),
});

export type DefinirFuncoes = z.output<typeof definirFuncoesSchema>;

export const salvarVeiculoSchema = z.discriminatedUnion("temCarro", [
  z.object({
    pessoaId: z.uuid(),
    temCarro: z.literal("SIM"),
    lugares: z.coerce.number<string>().int("Use um número inteiro.").min(1, "De 1 a 8 lugares.").max(8, "De 1 a 8 lugares."),
    consumoKmL: opcional(decimal(0.1, 99.9, "Informe o consumo em km/l, maior que zero (ex.: 10,5).")),
  }),
  z.object({ pessoaId: z.uuid(), temCarro: z.literal("NAO") }),
]);

export type SalvarVeiculo = z.output<typeof salvarVeiculoSchema>;

export const salvarCoordenadasSchema = z.object({
  pessoaId: z.uuid(),
  lat: decimal(-90, 90, "Latitude entre -90 e 90 (ex.: -22,7349)."),
  lng: decimal(-180, 180, "Longitude entre -180 e 180 (ex.: -47,3311)."),
});

export type SalvarCoordenadas = z.output<typeof salvarCoordenadasSchema>;
