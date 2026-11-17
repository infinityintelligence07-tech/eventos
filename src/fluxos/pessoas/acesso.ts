import { type AtorDaEscrita, bancoParaLeitura, RegraDeNegocioError, situacaoDaEscrita, transacao } from "@/fluxos/_base";
import {
  acaoDoHistorico,
  criarRepositorioAcesso,
  type DefinirAcesso,
  motivoParaNaoAlterar,
  type NivelDeAcesso,
  type PessoaComAcesso,
} from "@/modules/pessoas";

// Configurações › Acesso do time. Só a líder altera (permissão config.acesso_do_time, conferida em executarAcao e de
// novo dentro da função do banco).

const LIMITE_DA_BUSCA = 20;
const MINIMO_DA_BUSCA = 2;

export type AcessoDoTime = {
  comAcesso: PessoaComAcesso[];
  /** null = ainda não buscou (ou digitou menos de 2 letras). */
  encontrados: PessoaComAcesso[] | null;
  escritaLiberada: boolean;
};

export async function listarAcessoDoTime(busca: string | undefined): Promise<AcessoDoTime> {
  const repo = criarRepositorioAcesso(await bancoParaLeitura());
  const texto = busca?.trim() ?? "";
  const [comAcesso, encontrados, escrita] = await Promise.all([
    repo.comAcesso(),
    texto.length >= MINIMO_DA_BUSCA ? repo.semAcesso(texto, LIMITE_DA_BUSCA) : Promise.resolve(null),
    situacaoDaEscrita(),
  ]);
  return { comAcesso, encontrados, escritaLiberada: escrita.liberada };
}

/** Concede, muda ou retira o acesso. Devolve de qual nível para qual, para a mensagem da tela. */
export async function definirAcessoDoTime({ usuarioId, nivel }: DefinirAcesso, ator: AtorDaEscrita): Promise<{ de: NivelDeAcesso; para: NivelDeAcesso }> {
  return transacao(ator, async (tx) => {
    const repo = criarRepositorioAcesso(tx);
    const motivo = motivoParaNaoAlterar(ator.usuarioId, await repo.alvo(usuarioId), nivel);
    if (motivo) throw new RegraDeNegocioError(motivo);
    const de = await repo.definir(ator.usuarioId, usuarioId, nivel);
    if (de === nivel) throw new RegraDeNegocioError("Esta conta já está com esse acesso. Recarregue a página.");
    await repo.registrar(usuarioId, { acao: acaoDoHistorico(de, nivel), usuarioId: ator.usuarioId, dados: { de, para: nivel } });
    return { de, para: nivel };
  });
}
