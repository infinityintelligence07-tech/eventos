import type { IamControlClient } from "@/core/integrations/iam-control";
import { gerarVagasDoEvento, type RepositorioVagas, type ResultadoGerarVagas } from "@/modules/escala";
import { eventoDaTurma, type MotivoTurmaIgnorada, type RepositorioSincronizacao } from "@/modules/eventos";


// Turmas do IAM Control -> eventos -> vagas da escala (rascunho, sem pessoas).
// Idempotente: rodar de novo só atualiza o que mudou.

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
  ignoradosExcluidos: number;
  ignoradas: { iamControlTurmaId: number; motivo: MotivoTurmaIgnorada | "TIPO_INATIVO"; treinamento: string | null }[];
  codigosEmConflito: { iamControlTurmaId: number; codigo: string }[];
  polosNaoEncontrados: string[];
  vagas: Record<ResultadoGerarVagas["situacao"], number>;
  avisosDeVagas: { eventoId: string; aviso: string }[];
  falhas: { iamControlTurmaId: number; erro: string }[];
};

/** Mensagem do erro com a causa (o Drizzle embrulha o erro do Postgres em "Failed query: ..."). */
function mensagemDeErro(cause: unknown): string {
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
    ignoradosExcluidos: 0,
    ignoradas: [],
    codigosEmConflito: [],
    polosNaoEncontrados: [],
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
      const salvo = await deps.eventos.salvarEventoDaTurma(convertida.evento, tipo.id, deps.agora);
      if (salvo.acao === "IGNORADO_EXCLUIDO") {
        resumo.ignoradosExcluidos += 1;
        continue;
      }
      resumo[salvo.acao === "CRIADO" ? "criados" : "atualizados"] += 1;
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
