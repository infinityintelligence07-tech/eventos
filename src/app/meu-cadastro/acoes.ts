"use server";

import { revalidatePath } from "next/cache";

import { identidadeDaSessao } from "@/app/(time)/_servidor/usuario-atual";
import { logger } from "@/core/logging";
import { mensagemDoErro } from "@/fluxos/_base";
import { salvarMeuCadastro, type SituacaoDaLocalizacao, staffDaIdentidade } from "@/fluxos/pessoas";
import { meuCadastroSchema } from "@/modules/pessoas";

// "Meu cadastro" (docs/10). Fora do (time): não pede perfil do Eventos, só que o usuário logado seja staff. Quem é
// sai da sessão a cada envio; nenhum id vem do formulário.

export type ResultadoDoMeuCadastro =
  | { ok: true; localizacao: SituacaoDaLocalizacao }
  | { ok: false; mensagem: string; erros?: Record<string, string> }
  | null;

const CAMPOS = ["poloCodigo", "sexo", "camisetaModelo", "camisetaTamanho", "cep", "logradouro", "numero", "bairro", "cidade", "uf", "temCarro", "lugares", "consumoKmL"] as const;

export async function salvarMeuCadastroAcao(_anterior: ResultadoDoMeuCadastro, form: FormData): Promise<ResultadoDoMeuCadastro> {
  const sessao = await identidadeDaSessao();
  if (!sessao) return { ok: false, mensagem: "Sua sessão terminou. Entre de novo." };
  const staff = await staffDaIdentidade(sessao.identidade);
  if (!staff) return { ok: false, mensagem: "Seu usuário não está no cadastro de staff." };

  const bruto: Record<string, unknown> = Object.fromEntries(
    CAMPOS.map((campo) => [campo, typeof form.get(campo) === "string" ? (form.get(campo) as string) : undefined]),
  );
  bruto.funcoes = form.getAll("funcoes").filter((valor) => typeof valor === "string");
  const leitura = meuCadastroSchema.safeParse(bruto);
  if (!leitura.success) {
    const erros = Object.fromEntries(leitura.error.issues.map((issue) => [String(issue.path[0] ?? "formulario"), issue.message]));
    return { ok: false, mensagem: "Confira os campos destacados.", erros };
  }

  try {
    const { localizacao } = await salvarMeuCadastro(leitura.data, staff, { usuarioId: staff.usuarioId, pessoaId: staff.pessoaId, origem: sessao.origem }, new Date());
    revalidatePath("/meu-cadastro");
    return { ok: true, localizacao };
  } catch (erro: unknown) {
    logger.error({ componente: "meu-cadastro", erro: erro instanceof Error ? erro.name : "desconhecido" }, "falha ao salvar o cadastro do staff");
    return { ok: false, mensagem: mensagemDoErro(erro) };
  }
}
