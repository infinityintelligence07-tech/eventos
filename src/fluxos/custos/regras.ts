import { bancoParaLeitura, transacao, type AtorDaEscrita } from "@/fluxos/_base";
import {
  agruparVigencias,
  CATEGORIAS_DA_REGRA,
  type CategoriaDaRegra,
  type CriarVigenciaDeRegra,
  criarRepositorioRegras,
  type RegraComTipo,
  servicoDeRegras,
  vigenciaNaData,
} from "@/modules/custos";

import { diaEmSaoPaulo, traduzirErros } from "./comum";

export type RegraNaTela = {
  /** A vigência que vale hoje (ou a mais antiga, se todas começam no futuro). */
  atual: RegraComTipo;
  valeHoje: boolean;
  /** Vigência já cadastrada que começa depois de hoje. */
  proxima: RegraComTipo | null;
  /** Todas as vigências, da mais nova para a mais antiga. */
  historico: RegraComTipo[];
};

export type RegrasPorCategoria = { categoria: CategoriaDaRegra; regras: RegraNaTela[] }[];

/** Configurações › Regras de custo: uma tabela por categoria, com a vigência de hoje e o histórico. */
export async function listarRegrasDeCusto(agora: Date): Promise<RegrasPorCategoria> {
  const hoje = diaEmSaoPaulo(agora);
  const todas = await criarRepositorioRegras(await bancoParaLeitura()).todas();
  const grupos = agruparVigencias(todas).map((historico) => {
    const vigente = vigenciaNaData(historico, hoje);
    const valendo = historico.find((vigencia) => vigencia.vigenteDesde <= hoje);
    const futuras = historico.filter((vigencia) => vigencia.vigenteDesde > hoje);
    return {
      atual: valendo ?? historico.at(-1)!,
      valeHoje: vigente !== null,
      proxima: futuras.at(-1) ?? null,
      historico,
    };
  });
  return CATEGORIAS_DA_REGRA.map((categoria) => ({
    categoria,
    regras: grupos
      .filter((grupo) => grupo.atual.categoria === categoria)
      .sort((a, b) => a.atual.nome.localeCompare(b.atual.nome, "pt-BR") || (a.atual.tipoEventoNome ?? "").localeCompare(b.atual.tipoEventoNome ?? "", "pt-BR")),
  }));
}

export function criarVigenciaDeRegra(entrada: CriarVigenciaDeRegra, ator: AtorDaEscrita, agora: Date) {
  return traduzirErros(() =>
    transacao(ator, (tx) => servicoDeRegras.criarVigenciaDeRegra(criarRepositorioRegras(tx), entrada, { usuarioId: ator.usuarioId, instante: agora })),
  );
}

export function desativarRegra(regraId: string, ator: AtorDaEscrita, agora: Date) {
  return traduzirErros(() => transacao(ator, (tx) => servicoDeRegras.desativarRegra(criarRepositorioRegras(tx), regraId, { usuarioId: ator.usuarioId, instante: agora })));
}
