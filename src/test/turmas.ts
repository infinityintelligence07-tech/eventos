import type { TurmaRecebida } from "@/core/integrations/iam-control";

/** Turma no formato que o IAM Control devolve, com valores de um Confronto em Manaus. */
export function turmaDeExemplo(sobrescrever: Partial<TurmaRecebida> = {}): TurmaRecebida {
  return {
    id: 501,
    edicao: "60",
    data_inicio: "2026-12-12",
    data_final: "2026-12-15",
    status_turma: "INSCRICOES_ABERTAS",
    status_evento: "OK",
    meta: 300,
    capacidade: 400,
    inscritos_ativos: 280,
    treinamento: { id: 7, nome: "Confronto", sigla: "CONF", tipo_evento: true, tipo_palestra: false },
    polo: { id: 3, sigla: "AM", nome: "Manaus", cidade: "Manaus", estado: "AM" },
    local: {
      nome: "Centro de Convenções Vasco Vasques",
      logradouro: "Av. Constantino Nery",
      numero: "5001",
      complemento: null,
      bairro: "Flores",
      cidade: "Manaus",
      estado: "Amazonas",
      cep: "69058-795",
    },
    atualizado_em: "2026-10-20T12:00:00.000Z",
    excluida_em: null,
    ...sobrescrever,
  };
}
