import { type AtorDaEscrita, bancoParaLeitura, transacao } from "@/fluxos/_base";
import {
  CATEGORIAS_DO_ITEM,
  type ComprovanteDaTela,
  type CorrigirMeuCusto,
  criarRepositorioSolicitacoes,
  type DeslocamentoGravado,
  DIAS_DE_PRAZO_DO_FORMULARIO,
  diaEmSaoPaulo,
  type EntradaDeDeslocamentoDoStaff,
  type EntradaDeDespesa,
  type EventoDaPessoa,
  type ItemFixo,
  type ItemGravado,
  podeCorrigirNoPrazo,
  prazoDaCorrecao,
  prazoDoFormulario,
  type PrazoDoFormulario,
  itensFixosDasRegras,
  precoDoLitroDoStaff,
  regrasAplicaveis,
  servicoDeSolicitacoes,
  situacaoDoPrazo,
  type SolicitacaoDaPessoa,
  type SolicitarCusto,
  somarDias,
  type StatusAuditoria,
  type StatusFinanceiro,
  totalDoItem,
} from "@/modules/custos";

import { anexoDeComprovantesLigado, comprovantesDoStaff } from "./comprovantes";
import { traduzirErros } from "./comum";
import { previaDaSolicitacao, type PreviaDaSolicitacao } from "./registro";

// Formulário de custo do próprio staff (/solicitar-custo, docs/08 §11.4). Quem envia sai da sessão, nunca do
// formulário. Fica aberto do primeiro dia do evento até 5 dias depois do último; fora disso, só o time registra.

const FORMATO_UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** `ator` é o próprio staff: usuário e pessoa da sessão. */
export type AtorDoStaff = AtorDaEscrita & { pessoaId: string };

export type EventoAbertoDoStaff = EventoDaPessoa & {
  /** Último dia para enviar (AAAA-MM-DD). */
  fechaEm: string;
  solicitacao: { protocolo: string; auditoria: StatusAuditoria } | null;
};

export type CustosDoStaff = {
  /** Eventos em que a pessoa está na escala e o prazo está aberto. */
  abertos: EventoAbertoDoStaff[];
  /** As solicitações mais recentes da pessoa (enviadas por ela ou registradas pelo time). */
  enviadas: SolicitacaoDaPessoa[];
};

const LIMITE_DE_ENVIADAS = 50;

export async function carregarCustosDoStaff(pessoaId: string, agora: Date): Promise<CustosDoStaff> {
  const hoje = diaEmSaoPaulo(agora);
  const repo = criarRepositorioSolicitacoes(await bancoParaLeitura());
  const [eventos, enviadas] = await Promise.all([
    repo.eventosDaPessoa(pessoaId, { inicioAte: hoje, fimDesde: somarDias(hoje, -DIAS_DE_PRAZO_DO_FORMULARIO) }),
    repo.solicitacoesDaPessoa(pessoaId, { limite: LIMITE_DE_ENVIADAS }),
  ]);
  const porEvento = new Map(enviadas.map((solicitacao) => [solicitacao.evento.id, solicitacao]));
  return {
    abertos: eventos
      // A consulta traz a janela; quem decide se está aberto é a regra do domínio.
      .filter((evento) => situacaoDoPrazo(evento, agora) === "ABERTO")
      .map((evento) => {
        const enviada = porEvento.get(evento.id);
        return { ...evento, fechaEm: prazoDoFormulario(evento).fechaEm, solicitacao: enviada ? { protocolo: enviada.protocolo, auditoria: enviada.auditoria } : null };
      }),
    enviadas,
  };
}

export type EventoDoFormulario = { id: string; codigo: string | null; nome: string; dataInicio: string; dataFim: string; uf: string | null };

/** O que a pessoa vê da própria solicitação: sem o histórico nem os nomes de quem auditou. */
export type SolicitacaoDoStaff = {
  protocolo: string;
  auditoria: StatusAuditoria;
  financeiro: StatusFinanceiro;
  pagoEm: string | null;
  totalCentavos: number;
  kmTotal: number;
  criadoEm: Date;
  /** Versão para o compare-and-set da correção. */
  atualizadoEm: string;
  registradaPeloTime: boolean;
  /** Motivo da reprovação (só quando reprovada). */
  motivoDaReprovacao: string | null;
  auditadoEm: Date | null;
  deslocamentos: DeslocamentoGravado[];
  /** Despesas declaradas pela pessoa (o que ela pode corrigir), já com o total de cada uma. */
  despesas: { descricao: string; valorCentavos: number }[];
  /** Valores fixos do evento (pela regra de custo) e itens lançados pelo time: a pessoa vê, não altera. */
  itensFixos: ItemFixoDoStaff[];
  /** Comprovantes anexados à solicitação. */
  comprovantes: ComprovanteDaTela[];
};

/**
 * Item que a pessoa vê e não edita. `REGRA`: remuneração ou alimentação fixas do evento (entram sozinhas no envio).
 * `TIME`: item que o time lançou à mão. `observacao`: aviso quando a regra é por hora ou por dia (entra 1 unidade).
 */
export type ItemFixoDoStaff = { descricao: string; totalCentavos: number; origem: "REGRA" | "TIME"; observacao: string | null };

function observacaoDaUnidade(unidade: ItemFixo["unidade"]): string | null {
  switch (unidade) {
    case "HORA":
      return "entra 1 hora; o time confere as horas";
    case "DIA":
      return "entra 1 dia; o time confere os dias";
    default:
      return null;
  }
}

const fixoDaRegra = (item: ItemFixo): ItemFixoDoStaff => ({ descricao: item.descricao, totalCentavos: totalDoItem(item), origem: "REGRA", observacao: observacaoDaUnidade(item.unidade) });
const fixoGravado = (item: ItemGravado): ItemFixoDoStaff => ({ descricao: item.descricao, totalCentavos: totalDoItem(item), origem: item.regraCustoId ? "REGRA" : "TIME", observacao: null });

/** Anexo de comprovantes neste ambiente: nulo = desligado (o formulário funciona sem o campo). */
export type AnexoDoStaff = { comprovantes: ComprovanteDaTela[] } | null;

/** `precoLitroCentavos` é o que o servidor vai usar (regra de combustível ou o padrão): a pessoa vê, não escolhe. */
export type SugestoesDoStaff = { consumoKmL: number | null; precoLitroCentavos: number };

export type FormularioDoStaff =
  | { situacao: "NAO_ENCONTRADO" }
  | { situacao: "FORA_DA_ESCALA" | "CANCELADO"; evento: EventoDoFormulario }
  | { situacao: "AINDA_NAO_ABRIU" | "ENCERRADO"; evento: EventoDoFormulario; prazo: PrazoDoFormulario }
  | {
      situacao: "ABERTO";
      evento: EventoDoFormulario;
      prazo: PrazoDoFormulario;
      sugestoes: SugestoesDoStaff;
      /** Remuneração e alimentação fixas do evento: entram sozinhas na solicitação. */
      fixos: ItemFixoDoStaff[];
      anexo: AnexoDoStaff;
    }
  | {
      situacao: "ENVIADA";
      evento: EventoDoFormulario;
      solicitacao: SolicitacaoDoStaff;
      /** Reprovada e ainda no prazo de correção: a pessoa corrige e reenvia. `ate` = último dia (AAAA-MM-DD). */
      correcao: { pode: boolean; ate: string | null };
      sugestoes: SugestoesDoStaff;
      anexoLigado: boolean;
    };

/** A página do evento para a pessoa: o formulário, o que ela já enviou ou por que não dá para enviar. */
export async function carregarFormularioDoStaff(eventoId: string, pessoaId: string, agora: Date): Promise<FormularioDoStaff> {
  if (!FORMATO_UUID.test(eventoId)) return { situacao: "NAO_ENCONTRADO" };
  const repo = criarRepositorioSolicitacoes(await bancoParaLeitura());
  const dados = await repo.eventoDoCusto(eventoId);
  if (!dados) return { situacao: "NAO_ENCONTRADO" };
  const evento: EventoDoFormulario = { id: dados.id, codigo: dados.codigo, nome: dados.nome, dataInicio: dados.data, dataFim: dados.dataFim, uf: dados.uf };
  const prazo = prazoDoFormulario(evento);

  const [[enviada], convocacaoId, consumoKmL, regras] = await Promise.all([
    repo.solicitacoesDaPessoa(pessoaId, { eventoId, limite: 1 }),
    repo.convocacaoDaPessoa(eventoId, pessoaId),
    repo.consumoDaPessoa(pessoaId),
    repo.regras(),
  ]);
  const aplicaveis = regrasAplicaveis(regras, { tipoEventoId: dados.tipoEventoId, uf: dados.uf, data: dados.data });
  const sugestoes: SugestoesDoStaff = { consumoKmL, precoLitroCentavos: precoDoLitroDoStaff(aplicaveis) };
  const anexoLigado = anexoDeComprovantesLigado();

  // Quem já tem solicitação vê a situação dela, mesmo fora do prazo ou depois de sair da escala.
  const detalhe = enviada ? await repo.detalhe(enviada.protocolo) : null;
  if (detalhe) {
    const reprovada = detalhe.auditoria === "REPROVADO";
    const despesaDoStaff = (item: ItemGravado) => item.categoria === servicoDeSolicitacoes.CATEGORIA_DA_DESPESA_DO_STAFF;
    return {
      situacao: "ENVIADA",
      evento,
      sugestoes,
      anexoLigado,
      correcao: {
        pode: reprovada && podeCorrigirNoPrazo(evento, detalhe.auditadoEm, agora),
        ate: reprovada ? (detalhe.auditadoEm ? prazoDaCorrecao(evento, detalhe.auditadoEm) : prazo.fechaEm) : null,
      },
      solicitacao: {
        protocolo: detalhe.protocolo,
        auditoria: detalhe.auditoria,
        financeiro: detalhe.financeiro,
        pagoEm: detalhe.pagoEm,
        totalCentavos: detalhe.totalCentavos,
        kmTotal: detalhe.kmTotal,
        criadoEm: detalhe.criadoEm,
        atualizadoEm: detalhe.atualizadoEm,
        registradaPeloTime: detalhe.registradaPeloTime,
        motivoDaReprovacao: reprovada ? detalhe.parecer : null,
        auditadoEm: detalhe.auditadoEm,
        deslocamentos: detalhe.deslocamentos,
        despesas: detalhe.itens.filter(despesaDoStaff).map((item) => ({ descricao: item.descricao, valorCentavos: totalDoItem(item) })),
        // Gravados juntos, os itens saem do banco sem ordem garantida: aqui, sempre remuneração antes de alimentação.
        itensFixos: detalhe.itens
          .filter((item) => !despesaDoStaff(item))
          .sort((a, b) => CATEGORIAS_DO_ITEM.indexOf(a.categoria) - CATEGORIAS_DO_ITEM.indexOf(b.categoria))
          .map(fixoGravado),
        comprovantes: detalhe.comprovantes,
      },
    };
  }

  if (!convocacaoId) return { situacao: "FORA_DA_ESCALA", evento };
  if (dados.cancelado) return { situacao: "CANCELADO", evento };
  const situacao = situacaoDoPrazo(evento, agora);
  if (situacao !== "ABERTO") return { situacao, evento, prazo };
  return {
    situacao,
    evento,
    prazo,
    sugestoes,
    fixos: itensFixosDasRegras(aplicaveis).map(fixoDaRegra),
    // O que a pessoa já anexou antes de enviar (voltou à página, trocou de aparelho) continua lá.
    anexo: anexoLigado ? { comprovantes: await comprovantesDoStaff(eventoId, pessoaId) } : null,
  };
}

/** Resumo ao vivo do formulário do staff: o mesmo cálculo do envio, sem gravar. */
export async function previaDoCustoDoStaff(entrada: { eventoId: string; deslocamentos: EntradaDeDeslocamentoDoStaff[]; despesas: EntradaDeDespesa[] }): Promise<PreviaDaSolicitacao | null> {
  if (!FORMATO_UUID.test(entrada.eventoId)) return null;
  const repo = criarRepositorioSolicitacoes(await bancoParaLeitura());
  const evento = await repo.eventoDoCusto(entrada.eventoId);
  if (!evento) return null;
  return previaDaSolicitacao({
    eventoId: entrada.eventoId,
    // Mesmo preço do litro do envio: o do servidor.
    deslocamentos: await servicoDeSolicitacoes.deslocamentosDoStaff(repo, evento, entrada.deslocamentos),
    itens: entrada.despesas.map((despesa) => ({ categoria: servicoDeSolicitacoes.CATEGORIA_DA_DESPESA_DO_STAFF, descricao: despesa.descricao, quantidade: 1, valorCentavos: despesa.valorCentavos })),
  });
}

const contexto = (ator: AtorDoStaff, agora: Date) => ({ usuarioId: ator.usuarioId, pessoaId: ator.pessoaId, instante: agora, comprovanteObrigatorio: anexoDeComprovantesLigado() });

/**
 * A própria pessoa envia a solicitação: grava sem `registrado_por` e o registro_acao leva `propria: true`. Os itens
 * fixos do evento entram sozinhos; com o anexo ligado, deslocamento ou despesa exigem um comprovante já anexado.
 */
export function solicitarCusto(entrada: SolicitarCusto, ator: AtorDoStaff, agora: Date) {
  return traduzirErros(() => transacao(ator, (tx) => servicoDeSolicitacoes.solicitarCusto(criarRepositorioSolicitacoes(tx), entrada, contexto(ator, agora))));
}

/** A própria pessoa corrige a solicitação reprovada, que volta para a fila de auditoria. */
export function corrigirMeuCusto(entrada: CorrigirMeuCusto, ator: AtorDoStaff, agora: Date) {
  return traduzirErros(() => transacao(ator, (tx) => servicoDeSolicitacoes.corrigirMeuCusto(criarRepositorioSolicitacoes(tx), entrada, contexto(ator, agora))));
}
