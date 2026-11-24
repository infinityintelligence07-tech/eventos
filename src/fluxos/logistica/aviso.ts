import { bancoParaLeitura, type Executor, transacao, type AtorDaEscrita } from "@/fluxos/_base";
import { criarRepositorioComunicacao } from "@/modules/comunicacao";
import {
  CHAVE_DIAS_DO_AVISO_DE_VOOS,
  DIAS_ABRE_A_JANELA,
  DIAS_DO_AVISO_MAXIMO,
  DIAS_DO_AVISO_MINIMO,
  diasDoAtraso,
  diasDoAvisoConfigurado,
  type SalvarAvisoDeVoos,
} from "@/modules/logistica";

// Configurações › Aviso de voos: quantos dias antes do evento o sistema avisa, na tela, que há passagens a pedir.
// O valor mora em eventos.configuracao (a mesma tabela do link de custos, que o módulo comunicacao escreve); a regra
// da janela fica em modules/logistica/domain/janela.ts e recebe os dias por parâmetro.

/** Dias do aviso em vigor. Sem configuração (ou com valor inválido no banco) vale o padrão de 90 dias. */
export async function diasDoAvisoDeVoos(executor: Executor): Promise<number> {
  return diasDoAvisoConfigurado(await criarRepositorioComunicacao(executor).configuracao(CHAVE_DIAS_DO_AVISO_DE_VOOS));
}

export type AvisoDeVoos = {
  /** Dias antes do evento em que o aviso começa. */
  dias: number;
  /** A partir de quantos dias o pedido conta como atrasado (acompanha `dias`). */
  diasDoAtraso: number;
  padrao: number;
  minimo: number;
  maximo: number;
};

export async function carregarAvisoDeVoos(): Promise<AvisoDeVoos> {
  const dias = await diasDoAvisoDeVoos(await bancoParaLeitura());
  return { dias, diasDoAtraso: diasDoAtraso(dias), padrao: DIAS_ABRE_A_JANELA, minimo: DIAS_DO_AVISO_MINIMO, maximo: DIAS_DO_AVISO_MAXIMO };
}

/** Vale dali em diante: o Início e a tela de Voos passam a usar os dias novos na próxima leitura. */
export async function salvarAvisoDeVoos({ dias }: SalvarAvisoDeVoos, ator: AtorDaEscrita, agora: Date): Promise<AvisoDeVoos> {
  await transacao(ator, (tx) => criarRepositorioComunicacao(tx).salvarConfiguracao(CHAVE_DIAS_DO_AVISO_DE_VOOS, String(dias), { usuarioId: ator.usuarioId, instante: agora }));
  return { dias, diasDoAtraso: diasDoAtraso(dias), padrao: DIAS_ABRE_A_JANELA, minimo: DIAS_DO_AVISO_MINIMO, maximo: DIAS_DO_AVISO_MAXIMO };
}
