import { config } from "@/core/config";

// Valida o ambiente na subida do servidor, não na primeira requisição.
export function register(): void {
  void config;
}
