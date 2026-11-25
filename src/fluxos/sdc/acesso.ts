import { type AtorDaEscrita, bancoParaLeitura, RegraDeNegocioError, situacaoDaEscrita, transacao } from "@/fluxos/_base";
import { type AcessoDaSdc, criarRepositorioAcessoSdc, type DefinirAcessoDaSdc, type IncluirAcessoDaSdc } from "@/modules/logistica";

// Configurações › Acesso da SDC (docs/09 §15): a líder mantém a lista de e-mails da agência. Quem está ativo na lista
// entra com o Google e só enxerga a área /sdc. Só a líder altera (permissão config.acesso_da_sdc, conferida em
// executarAcao); nada é gravado no cadastro do GH (core).

/** Sem Date: vai para componente do navegador. */
export type AcessoDaSdcNaTela = Omit<AcessoDaSdc, "criadoEm" | "atualizadoEm"> & { criadoEm: string };

export async function listarAcessoDaSdc(): Promise<{ acessos: AcessoDaSdcNaTela[]; escritaLiberada: boolean }> {
  const [acessos, escrita] = await Promise.all([criarRepositorioAcessoSdc(await bancoParaLeitura()).listar(), situacaoDaEscrita()]);
  return {
    acessos: acessos.map((acesso) => ({ id: acesso.id, email: acesso.email, nome: acesso.nome, ativo: acesso.ativo, criadoEm: acesso.criadoEm.toISOString() })),
    escritaLiberada: escrita.liberada,
  };
}

/** Inclui um e-mail (já em minúsculas, pelo schema). E-mail repetido é recusado: desativado se reativa, não se inclui de novo. */
export async function incluirAcessoDaSdc({ email, nome }: IncluirAcessoDaSdc, ator: AtorDaEscrita, agora: Date): Promise<string> {
  return transacao(ator, async (tx) => {
    const repo = criarRepositorioAcessoSdc(tx);
    const existente = await repo.porEmail(email);
    if (existente) {
      throw new RegraDeNegocioError(existente.ativo ? "Este e-mail já está na lista da SDC." : "Este e-mail já está na lista da SDC, desativado. Use \"Reativar\" na linha dele.");
    }
    const id = await repo.incluir({ email, nome, usuarioId: ator.usuarioId, instante: agora });
    await repo.registrar(id, { acao: "ACESSO_SDC_INCLUIDO", usuarioId: ator.usuarioId });
    return id;
  });
}

/** Desativa (corta o acesso no próximo clique) ou reativa. Sem mudança, não grava nem registra. */
export async function definirAcessoDaSdc({ acessoSdcId, ativo }: DefinirAcessoDaSdc, ator: AtorDaEscrita, agora: Date): Promise<{ mudou: boolean; nome: string }> {
  const atual = (await criarRepositorioAcessoSdc(await bancoParaLeitura()).listar()).find((acesso) => acesso.id === acessoSdcId);
  if (!atual) throw new RegraDeNegocioError("Este e-mail não está mais na lista. Recarregue a página.");
  if (atual.ativo === ativo) return { mudou: false, nome: atual.nome };
  return transacao(ator, async (tx) => {
    const repo = criarRepositorioAcessoSdc(tx);
    const travado = await repo.travar(acessoSdcId);
    if (!travado) throw new RegraDeNegocioError("Este e-mail não está mais na lista. Recarregue a página.");
    if (travado.ativo !== ativo) {
      await repo.definirAtivo(acessoSdcId, ativo, agora);
      await repo.registrar(acessoSdcId, { acao: ativo ? "ACESSO_SDC_REATIVADO" : "ACESSO_SDC_DESATIVADO", usuarioId: ator.usuarioId });
      return { mudou: true, nome: travado.nome };
    }
    // Outra líder fez a mesma mudança entre a leitura e a trava.
    throw new RegraDeNegocioError("Outra pessoa acabou de fazer esta mudança. Recarregue a página.");
  });
}
