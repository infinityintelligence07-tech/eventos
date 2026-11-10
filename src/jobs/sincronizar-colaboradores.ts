import type { IamControlClient } from "@/core/integrations/iam-control";
import { type ColaboradorIgnorado, planoDoColaborador, type RepositorioColaboradores } from "@/modules/pessoas";

import { mensagemDeErro } from "./sincronizar-turmas";

// Colaboradores do IAM Control -> login (core.usuario) e staff escalável (docs/10). Acesso de time é só manual.
// Idempotente: rodar de novo só atualiza o que mudou. Uma transação por colaborador: um erro não derruba os outros.

export type DependenciasColaboradores = {
  iamControl: Pick<IamControlClient, "listarColaboradores">;
  colaboradores: RepositorioColaboradores;
  agora: Date;
};

export type ResumoColaboradores = {
  lidos: number;
  criados: number;
  atualizados: number;
  desativados: number;
  inativosIgnorados: number;
  escalaveis: number;
  ignorados: ColaboradorIgnorado[];
  falhas: { iamControlUserId: number; erro: string }[];
};

export async function sincronizarColaboradores(deps: DependenciasColaboradores): Promise<ResumoColaboradores> {
  const resposta = await deps.iamControl.listarColaboradores();
  const resumo: ResumoColaboradores = {
    lidos: resposta.colaboradores.length,
    criados: 0,
    atualizados: 0,
    desativados: 0,
    inativosIgnorados: 0,
    escalaveis: 0,
    ignorados: [],
    falhas: [],
  };

  for (const colaborador of resposta.colaboradores) {
    const convertido = planoDoColaborador(colaborador);
    if (!convertido.ok) {
      resumo.ignorados.push({ iamControlUserId: convertido.iamControlUserId, motivo: convertido.motivo });
      continue;
    }
    try {
      const salvo = await deps.colaboradores.salvarColaborador(convertido.plano, deps.agora);
      switch (salvo.acao) {
        case "CRIADO":
          resumo.criados += 1;
          break;
        case "ATUALIZADO":
          resumo.atualizados += 1;
          break;
        case "DESATIVADO":
          resumo.desativados += 1;
          break;
        case "IGNORADO_INATIVO":
          resumo.inativosIgnorados += 1;
          break;
        default: {
          const desconhecida: never = salvo.acao;
          throw new Error(`ação desconhecida: ${String(desconhecida)}`);
        }
      }
      if (salvo.escalavel) resumo.escalaveis += 1;
    } catch (cause: unknown) {
      resumo.falhas.push({ iamControlUserId: colaborador.id, erro: mensagemDeErro(cause) });
    }
  }
  return resumo;
}
