import { bancoParaLeitura, transacao } from "@/fluxos/_base";
import {
  type AlertaDeCusto,
  type AprovarSolicitacao,
  type CategoriaDoItem,
  type CorrigirSolicitacao,
  criarRepositorioSolicitacoes,
  type DetalheDaSolicitacao,
  type EntradaDeDeslocamento,
  type EntradaDeItem,
  type EventoParaRegistro,
  type NivelDeExcecao,
  type PessoaParaRegistro,
  precoDoLitro,
  type ReabrirAuditoria,
  type RegistrarSolicitacao,
  type ReprovarSolicitacao,
  regrasAplicaveis,
  servicoDeSolicitacoes,
  type UnidadeDaRegra,
} from "@/modules/custos";

import { diaEmSaoPaulo, somarDias, traduzirErros } from "./comum";

export type ItemSugerido = {
  categoria: CategoriaDoItem;
  regraCustoId: string;
  descricao: string;
  unidade: UnidadeDaRegra;
  quantidade: number;
  valorCentavos: number;
};

export type SolicitacaoPreparada = {
  eventos: EventoParaRegistro[];
  evento: (EventoParaRegistro & { uf: string | null }) | null;
  pessoas: PessoaParaRegistro[];
  pessoa: PessoaParaRegistro | null;
  sugestoes: { precoLitroCentavos: number | null; consumoKmL: number | null; itens: ItemSugerido[] };
  /** Solicitação reprovada aberta para correção (?protocolo=). */
  paraCorrigir: DetalheDaSolicitacao | null;
};

/** Eventos dos últimos 60 dias primeiro (os mais recentes antes), depois os próximos. */
function ordenarEventos(eventos: EventoParaRegistro[], hoje: string): EventoParaRegistro[] {
  const passados = eventos.filter((evento) => evento.data <= hoje).sort((a, b) => b.data.localeCompare(a.data));
  const proximos = eventos.filter((evento) => evento.data > hoje).sort((a, b) => a.data.localeCompare(b.data));
  return [...passados, ...proximos];
}

/** Formulário "Registrar solicitação" (?evento=&pessoa=) ou "Corrigir" (?protocolo=, só reprovada). */
export async function prepararSolicitacao(
  filtro: { eventoId?: string; pessoaId?: string; protocolo?: string },
  agora: Date,
): Promise<SolicitacaoPreparada> {
  const hoje = diaEmSaoPaulo(agora);
  const repo = criarRepositorioSolicitacoes(await bancoParaLeitura());
  const paraCorrigir = filtro.protocolo ? await repo.detalhe(filtro.protocolo) : null;
  const eventoId = paraCorrigir?.evento.id ?? filtro.eventoId;
  const pessoaId = paraCorrigir?.pessoaId ?? filtro.pessoaId;

  const eventos = ordenarEventos(await repo.eventosParaRegistro(somarDias(hoje, -60)), hoje);
  const dadosDoEvento = eventoId ? await repo.eventoDoCusto(eventoId) : null;
  if (!dadosDoEvento) return { eventos, evento: null, pessoas: [], pessoa: null, sugestoes: { precoLitroCentavos: null, consumoKmL: null, itens: [] }, paraCorrigir: null };

  const evento = { ...(eventos.find((item) => item.id === dadosDoEvento.id) ?? { id: dadosDoEvento.id, codigo: dadosDoEvento.codigo, nome: dadosDoEvento.codigo ?? "Evento", data: dadosDoEvento.data }), uf: dadosDoEvento.uf };
  const [pessoas, regras] = await Promise.all([repo.pessoasParaRegistro(dadosDoEvento.id), repo.regras()]);
  const aplicaveis = regrasAplicaveis(regras, { tipoEventoId: dadosDoEvento.tipoEventoId, uf: dadosDoEvento.uf, data: dadosDoEvento.data });
  const pessoa = pessoas.find((item) => item.pessoaId === pessoaId) ?? null;

  return {
    eventos,
    evento,
    pessoas,
    pessoa,
    paraCorrigir: paraCorrigir?.auditoria === "REPROVADO" ? paraCorrigir : null,
    sugestoes: {
      precoLitroCentavos: precoDoLitro(aplicaveis),
      consumoKmL: pessoa?.consumoKmL ?? null,
      itens: aplicaveis
        .filter((regra) => (regra.categoria === "REMUNERACAO" || regra.categoria === "ALIMENTACAO") && regra.valorCentavos !== null)
        .sort((a, b) => a.categoria.localeCompare(b.categoria) * -1)
        .map((regra) => ({
          categoria: regra.categoria as CategoriaDoItem,
          regraCustoId: regra.id,
          descricao: regra.nome,
          unidade: regra.unidade,
          quantidade: 1,
          valorCentavos: regra.valorCentavos!,
        })),
    },
  };
}

export type PreviaDaSolicitacao = {
  totalCentavos: number;
  kmTotal: number;
  nivel: NivelDeExcecao;
  deslocamentos: { combustivelCentavos: number; pedagioCentavos: number; depreciacaoCentavos: number; totalCentavos: number; alertas: AlertaDeCusto[] }[];
  itens: number[];
};

/** Resumo ao vivo do formulário: o mesmo cálculo do registro, sem gravar. */
export async function previaDaSolicitacao(entrada: { eventoId: string; deslocamentos: EntradaDeDeslocamento[]; itens: EntradaDeItem[] }): Promise<PreviaDaSolicitacao | null> {
  const repo = criarRepositorioSolicitacoes(await bancoParaLeitura());
  const evento = await repo.eventoDoCusto(entrada.eventoId);
  if (!evento) return null;
  const { calculada } = await servicoDeSolicitacoes.calcularPelasRegras(repo, evento, { deslocamentos: entrada.deslocamentos, itens: entrada.itens.map((item) => ({ ...item, regraCustoId: undefined })) });
  return {
    totalCentavos: calculada.totalCentavos,
    kmTotal: calculada.kmTotal,
    nivel: calculada.nivel,
    itens: calculada.itens,
    deslocamentos: calculada.deslocamentos.map(({ combustivelCentavos, pedagioCentavos, depreciacaoCentavos, totalCentavos, alertas }) => ({
      combustivelCentavos,
      pedagioCentavos,
      depreciacaoCentavos,
      totalCentavos,
      alertas,
    })),
  };
}

const contexto = (usuarioId: string, agora: Date) => ({ usuarioId, instante: agora });

export function registrarSolicitacao(entrada: RegistrarSolicitacao, usuarioId: string, agora: Date) {
  return traduzirErros(() => transacao((tx) => servicoDeSolicitacoes.registrarSolicitacao(criarRepositorioSolicitacoes(tx), entrada, contexto(usuarioId, agora))));
}

export function corrigirSolicitacao(entrada: CorrigirSolicitacao, usuarioId: string, agora: Date) {
  return traduzirErros(() => transacao((tx) => servicoDeSolicitacoes.corrigirSolicitacao(criarRepositorioSolicitacoes(tx), entrada, contexto(usuarioId, agora))));
}

export function aprovarSolicitacao(entrada: AprovarSolicitacao, usuarioId: string, agora: Date) {
  return traduzirErros(() => transacao((tx) => servicoDeSolicitacoes.aprovarSolicitacao(criarRepositorioSolicitacoes(tx), entrada, contexto(usuarioId, agora))));
}

export function reprovarSolicitacao(entrada: ReprovarSolicitacao, usuarioId: string, agora: Date) {
  return traduzirErros(() => transacao((tx) => servicoDeSolicitacoes.reprovarSolicitacao(criarRepositorioSolicitacoes(tx), entrada, contexto(usuarioId, agora))));
}

export function reabrirAuditoria(entrada: ReabrirAuditoria, usuarioId: string, agora: Date) {
  return traduzirErros(() => transacao((tx) => servicoDeSolicitacoes.reabrirAuditoria(criarRepositorioSolicitacoes(tx), entrada, contexto(usuarioId, agora))));
}
