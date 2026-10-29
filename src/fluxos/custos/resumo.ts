import { bancoParaLeitura } from "@/fluxos/_base";
import { criarRepositorioSolicitacoes, ordenarParaAuditoria, rotuloDoNivel } from "@/modules/custos";

import { type ItemDoInicio, LIMITE_DE_EXEMPLOS } from "./comum";

const UM_DIA_MS = 86_400_000;

function espera(desde: Date, agora: Date): string {
  const dias = Math.floor((agora.getTime() - desde.getTime()) / UM_DIA_MS);
  return dias <= 0 ? "recebida hoje" : dias === 1 ? "há 1 dia" : `há ${dias} dias`;
}

/** Contrato §7.3: solicitações para auditar, com as críticas em destaque (primeiro e num item próprio). */
export async function resumoParaInicio(agora: Date): Promise<ItemDoInicio[]> {
  const fila = ordenarParaAuditoria(await criarRepositorioSolicitacoes(await bancoParaLeitura()).fila({ auditoria: "PENDENTE" }));
  const criticas = fila.filter((linha) => linha.nivel === "CRITICO");
  const exemplo = (linha: (typeof fila)[number]) => ({
    rotulo: `${linha.protocolo} · ${linha.pessoaNome}`,
    detalhe: [rotuloDoNivel(linha.nivel), espera(linha.criadoEm, agora)].filter(Boolean).join(" · "),
    href: `/custos?protocolo=${linha.protocolo}`,
  });
  return [
    { chave: "custos-para-auditar", titulo: "Custos para auditar", quantidade: fila.length, href: "/custos", exemplos: fila.slice(0, LIMITE_DE_EXEMPLOS).map(exemplo) },
    { chave: "custos-criticos", titulo: "Custos com alerta crítico", quantidade: criticas.length, href: "/custos?alerta=CRITICO", exemplos: criticas.slice(0, LIMITE_DE_EXEMPLOS).map(exemplo) },
  ];
}
