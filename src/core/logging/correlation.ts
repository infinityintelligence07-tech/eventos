import { randomUUID } from "node:crypto";
import { AsyncLocalStorage } from "node:async_hooks";

type CorrelationContext = {
  correlationId: string;
};

const correlationStorage = new AsyncLocalStorage<CorrelationContext>();

export function withCorrelationId<T>(correlationId: string, callback: () => T): T {
  return correlationStorage.run({ correlationId }, callback);
}

export function getCorrelationId(): string {
  return correlationStorage.getStore()?.correlationId ?? randomUUID();
}
