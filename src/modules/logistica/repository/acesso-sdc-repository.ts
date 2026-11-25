import { asc, eq, sql } from "drizzle-orm";

import type { Executor } from "@/core/db/database";
import { registrarAcao } from "@/core/db/registro-acao";
import { usuario } from "@/core/db/schema/core";
import { acessoSdc } from "@/core/db/schema/eventos";

// eventos.acesso_sdc: a lista de e-mails da SDC (docs/09 §15). O e-mail não muda depois de incluído e ninguém é
// apagado (o histórico aponta para a linha): desativar corta o acesso, reativar devolve.

export type AcessoDaSdc = { id: string; email: string; nome: string; ativo: boolean; criadoEm: Date; atualizadoEm: Date };

const COLUNAS = { id: acessoSdc.id, email: acessoSdc.email, nome: acessoSdc.nome, ativo: acessoSdc.ativo, criadoEm: acessoSdc.criadoEm, atualizadoEm: acessoSdc.atualizadoEm };

export function criarRepositorioAcessoSdc(executor: Executor) {
  return {
    async listar(): Promise<AcessoDaSdc[]> {
      return executor.select(COLUNAS).from(acessoSdc).orderBy(asc(acessoSdc.nome), asc(acessoSdc.email));
    },

    /** `email` já normalizado (minúsculas, sem espaços). */
    async porEmail(email: string): Promise<AcessoDaSdc | null> {
      const [linha] = await executor.select(COLUNAS).from(acessoSdc).where(eq(acessoSdc.email, email));
      return linha ?? null;
    },

    /** O e-mail (já normalizado) existe em core.usuario, ativo ou não: é de alguém da IAM e nunca entra na lista da SDC. */
    async emailEhDaIam(email: string): Promise<boolean> {
      const [linha] = await executor
        .select({ id: usuario.id })
        .from(usuario)
        .where(sql`lower(btrim(${usuario.email})) = ${email}`)
        .limit(1);
      return Boolean(linha);
    },

    async travar(acessoSdcId: string): Promise<AcessoDaSdc | null> {
      const [linha] = await executor.select(COLUNAS).from(acessoSdc).where(eq(acessoSdc.id, acessoSdcId)).for("update");
      return linha ?? null;
    },

    async incluir({ email, nome, usuarioId, instante }: { email: string; nome: string; usuarioId: string; instante: Date }): Promise<string> {
      const [linha] = await executor
        .insert(acessoSdc)
        .values({ email, nome, ativo: true, criadoPor: usuarioId, criadoEm: instante, atualizadoEm: instante })
        .returning({ id: acessoSdc.id });
      return linha!.id;
    },

    async definirAtivo(acessoSdcId: string, ativo: boolean, instante: Date): Promise<void> {
      await executor.update(acessoSdc).set({ ativo, atualizadoEm: instante }).where(eq(acessoSdc.id, acessoSdcId));
    },

    /** Sem e-mail nem nome em `dados` (o registro é imutável): a linha de acesso_sdc diz quem é. */
    async registrar(acessoSdcId: string, { acao, usuarioId }: { acao: "ACESSO_SDC_INCLUIDO" | "ACESSO_SDC_DESATIVADO" | "ACESSO_SDC_REATIVADO"; usuarioId: string }): Promise<void> {
      await registrarAcao(executor, { entidade: "CONFIGURACAO", entidadeId: acessoSdcId, acao, usuarioId, dados: {} });
    },
  };
}
