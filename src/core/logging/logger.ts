import pino from "pino";

import { config } from "@/core/config";

import { getCorrelationId } from "./correlation";
import { redactSensitive } from "./redact";

const pinoLogger = pino({
  level: config.LOG_LEVEL,
  base: null,
  mixin: () => ({ correlationId: getCorrelationId() }),
});

type LogLevel = "debug" | "error" | "fatal" | "info" | "silent" | "trace" | "warn";
type LogMethod = (data: unknown, message?: string) => void;

function write(level: LogLevel, data: unknown, message?: string): void {
  const method = pinoLogger[level] as LogMethod;

  if (typeof data === "string") {
    method.call(pinoLogger, data);
    return;
  }

  method.call(pinoLogger, redactSensitive(data), message);
}

export const logger = {
  debug: (data: unknown, message?: string) => write("debug", data, message),
  error: (data: unknown, message?: string) => write("error", data, message),
  fatal: (data: unknown, message?: string) => write("fatal", data, message),
  info: (data: unknown, message?: string) => write("info", data, message),
  warn: (data: unknown, message?: string) => write("warn", data, message),
};
