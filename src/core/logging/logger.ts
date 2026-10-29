import pino from "pino";

import { lerConfig } from "@/core/config/leitura";

import { getCorrelationId } from "./correlation";
import { redactSensitive } from "./redact";

// Criado na primeira escrita: as páginas importam o logger e o build do Next não pode exigir o ambiente.
let pinoLogger: pino.Logger | undefined;

/**
 * O `err` chega já serializado pela lista fixa (redactSensitive → serializarErro). O serializador padrão do pino
 * o reprocessaria (junta mensagens das causas e perde code/constraint), então fica desligado.
 */
export function criarPino(nivel: pino.LevelWithSilent, destino?: pino.DestinationStream): pino.Logger {
  const opcoes: pino.LoggerOptions = {
    level: nivel,
    base: null,
    serializers: { err: (valor: unknown) => valor },
    mixin: () => ({ correlationId: getCorrelationId() }),
  };
  return destino ? pino(opcoes, destino) : pino(opcoes);
}

function instancia(): pino.Logger {
  pinoLogger ??= criarPino(lerConfig().LOG_LEVEL);
  return pinoLogger;
}

/** O que vai para o pino: dados sensíveis tirados e Error reduzido à lista fixa. */
export function prepararParaLog(data: unknown): unknown {
  return redactSensitive(data);
}

type LogLevel = "debug" | "error" | "fatal" | "info" | "silent" | "trace" | "warn";
type LogMethod = (data: unknown, message?: string) => void;

function write(level: LogLevel, data: unknown, message?: string): void {
  const alvo = instancia();
  const method = alvo[level] as LogMethod;

  if (typeof data === "string") {
    method.call(alvo, data);
    return;
  }

  method.call(alvo, prepararParaLog(data), message);
}

export const logger = {
  debug: (data: unknown, message?: string) => write("debug", data, message),
  error: (data: unknown, message?: string) => write("error", data, message),
  fatal: (data: unknown, message?: string) => write("fatal", data, message),
  info: (data: unknown, message?: string) => write("info", data, message),
  warn: (data: unknown, message?: string) => write("warn", data, message),
};
