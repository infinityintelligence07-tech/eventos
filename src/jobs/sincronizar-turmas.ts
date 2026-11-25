import type { IamControlClient } from "@/core/integrations/iam-control";
import { gerarVagasDoEvento, type RepositorioVagas, type ResultadoGerarVagas } from "@/modules/escala";
import { chaveDoLocal, eventoDaTurma, type LocalDaTurma, type LocalSalvo, type MotivoTurmaIgnorada, type RepositorioSincronizacao } from "@/modules/eventos";


// Turmas do IAM Control -> locais e eventos -> vagas da escala (rascunho, sem pessoas).
// Idempotente: rodar de novo só atualiza o que mudou.
// Os locais e hotéis do Eventos vêm daqui: o IAM Control não tem rota de locais para o token do Eventos, então cada
// local chega embutido na turma que o usa (docs/07 §6.8).

export type DependenciasSincronizacao = {
  iamControl: Pick<IamControlClient, "listarTurmas">;
  eventos: RepositorioSincronizacao;
  vagas: RepositorioVagas;
  agora: Date;
};

export type ResumoSincronizacao = {
  turmasLidas: number;
  criados: number;
  atualizados: number;
  /** Turmas que chegaram iguais ao evento já gravado. */
  semMudanca: number;
  ignoradosExcluidos: number;
  ignoradas: { iamControlTurmaId: number; motivo: MotivoTurmaIgnorada | "TIPO_INATIVO"; treinamento: string | null }[];
  codigosEmConflito: { iamControlTurmaId: number; codigo: string }[];
  polosNaoEncontrados: string[];
  /** Locais do IAM Control nos cadastros do Eventos: criados, cadastros feitos à mão que foram ligados, e atualizados. */
  locais: { criados: number; vinculados: number; atualizados: number };
  vagas: Record<ResultadoGerarVagas["situacao"], number>;
  avisosDeVagas: { eventoId: string; aviso: string }[];
  falhas: { iamControlTurmaId: number; erro: string }[];
};

/** Mensagem do erro com a causa (o Drizzle embrulha o erro do Postgres em "Failed query: ..."). */
export function mensagemDeErro(cause: unknown): string {
  if (!(cause instanceof Error)) return String(cause);
  const interna = cause.cause instanceof Error ? cause.cause.message : null;
  const principal = cause.message.startsWith("Failed query") ? "falha no banco" : cause.message;
  return interna ? `${principal}: ${interna}` : principal;
}

export function hojeEmSaoPaulo(agora: Date): string {
  return agora.toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" });
}

export async function sincronizarTurmas(
  deps: DependenciasSincronizacao,
  filtros: { aPartirDe?: string; ate?: string } = {},
): Promise<ResumoSincronizacao> {
  const resposta = await deps.iamControl.listarTurmas(filtros);
  const tipos = await deps.eventos.tiposAtivos();
  const nomes = Object.fromEntries([...tipos].map(([sigla, tipo]) => [sigla, tipo.nome]));
  const hoje = hojeEmSaoPaulo(deps.agora);

  const resumo: ResumoSincronizacao = {
    turmasLidas: resposta.turmas.length,
    criados: 0,
    atualizados: 0,
    semMudanca: 0,
    ignoradosExcluidos: 0,
    ignoradas: [],
    codigosEmConflito: [],
    polosNaoEncontrados: [],
    locais: { criados: 0, vinculados: 0, atualizados: 0 },
    vagas: {
      GERADA: 0,
      SEM_MUDANCA: 0,
      NAO_ENCONTRADO: 0,
      ESCALA_APROVADA: 0,
      EVENTO_ENCERRADO: 0,
      REGRA_INVALIDA: 0,
    },
    avisosDeVagas: [],
    falhas: [],
  };
  const polosFaltando = new Set<string>();

  // Cada local é gravado uma vez por rodada, na primeira turma que o traz (as turmas vêm em ordem de data): várias
  // turmas usam o mesmo local, e duas com o mesmo nome e endereços diferentes não ficam se desfazendo.
  const locaisDaRodada = new Map<string, Promise<LocalSalvo>>();
  const localDaRodada = (local: LocalDaTurma): Promise<LocalSalvo> => {
    const chave = local.iamControlEnderecoId === null ? `chave:${chaveDoLocal(local)}` : `id:${local.iamControlEnderecoId}`;
    let salvo = locaisDaRodada.get(chave);
    if (!salvo) {
      salvo = deps.eventos.salvarLocalDoIamControl(local, deps.agora).then((resultado) => {
        resumo.locais.criados += resultado.criado ? 1 : 0;
        resumo.locais.vinculados += resultado.vinculados;
        resumo.locais.atualizados += resultado.atualizados;
        return resultado;
      });
      locaisDaRodada.set(chave, salvo);
    }
    return salvo;
  };

  for (const turma of resposta.turmas) {
    const convertida = eventoDaTurma(turma, hoje, nomes);
    if (!convertida.ok) {
      resumo.ignoradas.push({
        iamControlTurmaId: convertida.iamControlTurmaId,
        motivo: convertida.motivo,
        treinamento: convertida.treinamento,
      });
      continue;
    }
    const tipo = tipos.get(convertida.evento.tipoSigla);
    if (!tipo) {
      resumo.ignoradas.push({ iamControlTurmaId: turma.id, motivo: "TIPO_INATIVO", treinamento: turma.treinamento.nome });
      continue;
    }

    // Uma turma com problema não derruba as outras.
    try {
      const localId = convertida.evento.local ? (await localDaRodada(convertida.evento.local)).localId : null;
      const salvo = await deps.eventos.salvarEventoDaTurma(convertida.evento, tipo.id, deps.agora, localId);
      if (salvo.acao === "IGNORADO_EXCLUIDO") {
        resumo.ignoradosExcluidos += 1;
        continue;
      }
      resumo[salvo.acao === "CRIADO" ? "criados" : salvo.acao === "ATUALIZADO" ? "atualizados" : "semMudanca"] += 1;
      if (salvo.codigoEmConflito) {
        resumo.codigosEmConflito.push({ iamControlTurmaId: turma.id, codigo: salvo.codigoEmConflito });
      }
      if (salvo.poloNaoEncontrado && convertida.evento.poloSigla) polosFaltando.add(convertida.evento.poloSigla);

      const vagas = await gerarVagasDoEvento(deps.vagas, salvo.eventoId);
      resumo.vagas[vagas.situacao] += 1;
      if (vagas.situacao === "GERADA" || vagas.situacao === "SEM_MUDANCA") {
        for (const aviso of vagas.plano.avisos) resumo.avisosDeVagas.push({ eventoId: salvo.eventoId, aviso });
        for (const codigo of vagas.funcoesNaoCadastradas) {
          resumo.avisosDeVagas.push({ eventoId: salvo.eventoId, aviso: `função ${codigo} não cadastrada` });
        }
      } else if (vagas.situacao === "REGRA_INVALIDA") {
        resumo.avisosDeVagas.push({ eventoId: salvo.eventoId, aviso: vagas.erros.join("; ") });
      }
    } catch (cause: unknown) {
      resumo.falhas.push({ iamControlTurmaId: turma.id, erro: mensagemDeErro(cause) });
    }
  }

  resumo.polosNaoEncontrados = [...polosFaltando].sort();
  return resumo;
}
