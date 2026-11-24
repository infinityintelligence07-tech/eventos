import path from "node:path";

import { lerConfig } from "@/core/config";
import { lerConfigDosComprovantes } from "@/core/config/comprovantes";
import { logger } from "@/core/logging";

import { type ArmazenamentoDeArquivos, criarArmazenamentoEmDisco, criarArmazenamentoS3 } from "./armazenamento";

export { type ArmazenamentoDeArquivos, ArmazenamentoError, criarArmazenamentoEmDisco, criarArmazenamentoEmMemoria, criarArmazenamentoS3 } from "./armazenamento";

/** Pasta dos comprovantes no modo local (dentro de `.banco-local/`, que não vai para o Git). */
export const PASTA_LOCAL_DOS_COMPROVANTES = path.join(".banco-local", "comprovantes");

let escolhido: { armazenamento: ArmazenamentoDeArquivos | null } | undefined;

function escolher(): ArmazenamentoDeArquivos | null {
  // No modo local os arquivos ficam sempre no disco: o banco de teste nunca escreve no bucket de produção.
  if (lerConfig().EVENTOS_MODO === "local") return criarArmazenamentoEmDisco(path.resolve(process.cwd(), PASTA_LOCAL_DOS_COMPROVANTES));
  const leitura = lerConfigDosComprovantes();
  switch (leitura.situacao) {
    case "CONFIGURADO": {
      const { endpoint, regiao, bucket, chaveId, segredo } = leitura.config;
      return criarArmazenamentoS3({ endpoint, regiao, bucket, credenciais: { chaveId, segredo } });
    }
    case "INCOMPLETO":
      logger.warn({ componente: "comprovantes", faltando: leitura.faltando }, "armazenamento de comprovantes incompleto: o anexo fica desligado");
      return null;
    case "DESLIGADO":
      return null;
    default: {
      const desconhecida: never = leitura;
      throw new Error(`leitura desconhecida: ${JSON.stringify(desconhecida)}`);
    }
  }
}

/**
 * Onde os comprovantes de custo são guardados neste ambiente. Nulo = anexo desligado (produção sem as variáveis
 * COMPROVANTES_S3_*): o formulário do staff funciona sem o campo.
 */
export function armazenamentoDeComprovantes(): ArmazenamentoDeArquivos | null {
  escolhido ??= { armazenamento: escolher() };
  return escolhido.armazenamento;
}
