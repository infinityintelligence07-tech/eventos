import { bancoLocal, bancoLocalDaUrl } from "@/core/config/banco-local";
import { type Config, lerConfig } from "@/core/config/leitura";

// Guarda de escrita (docs/07 §3): as telas só gravam com as três travas abertas. Fora disso, somente leitura.
// Travas 1 e 2 olham o ambiente (aqui); a trava 3 olha o servidor em que a conexão caiu: o marcador gravado no
// catálogo do banco (pg_db_role_setting, que a sessão não forja), endereço de loopback e a porta configurada.
// A leitura do servidor é feita por bancoParaEscrita() em src/fluxos/_base.

/** Mesmo id que scripts/banco-local grava em core.usuario. */
export const USUARIO_TESTE = { id: "7e570000-0000-7000-8000-000000000001", nome: "Usuário de teste" } as const;

/** Valor de current_setting('eventos.ambiente') no banco local (ALTER DATABASE … SET pelo banco:local). */
export const MARCADOR_DO_BANCO_LOCAL = "local";

export type AmbienteDeEscrita = Pick<Config, "NODE_ENV" | "EVENTOS_MODO" | "DATABASE_URL">;

export type TravaDeEscrita = "MODO_LOCAL" | "HOST_LOCAL" | "MARCADOR_NO_BANCO" | "SERVIDOR_LOCAL";

export type SituacaoDaEscrita = { liberada: true } | { liberada: false; trava: TravaDeEscrita; motivo: string };

const LIBERADA: SituacaoDaEscrita = { liberada: true };

/** Trava 1: modo local e fora de produção. */
export function verificarModoLocal(ambiente: Pick<AmbienteDeEscrita, "NODE_ENV" | "EVENTOS_MODO">): SituacaoDaEscrita {
  if (ambiente.EVENTOS_MODO !== "local") {
    return { liberada: false, trava: "MODO_LOCAL", motivo: "EVENTOS_MODO não é local." };
  }
  if (ambiente.NODE_ENV === "production") {
    return { liberada: false, trava: "MODO_LOCAL", motivo: "NODE_ENV é production." };
  }
  return LIBERADA;
}

/** Travas 1 e 2: modo local e DATABASE_URL em localhost. */
export function verificarAmbiente(ambiente: AmbienteDeEscrita): SituacaoDaEscrita {
  const modo = verificarModoLocal(ambiente);
  if (!modo.liberada) return modo;
  if (!bancoLocal(ambiente.DATABASE_URL)) {
    return { liberada: false, trava: "HOST_LOCAL", motivo: "DATABASE_URL não aponta para localhost (ou desvia a conexão com host, hostaddr ou options)." };
  }
  return LIBERADA;
}

/** Trava 3: o marcador gravado no catálogo do banco (ALTER DATABASE … SET eventos.ambiente). */
export function verificarMarcador(valor: string | null | undefined): SituacaoDaEscrita {
  if (valor === MARCADOR_DO_BANCO_LOCAL) return LIBERADA;
  return { liberada: false, trava: "MARCADOR_NO_BANCO", motivo: "O banco não tem o marcador eventos.ambiente = 'local'." };
}

/** O que o próprio servidor diz da conexão (nada disso vem da URL). */
export type LeituraDoServidor = {
  /** Valor gravado em pg_db_role_setting para o banco atual. */
  marcador: string | null;
  /** inet_server_addr(); nulo = socket Unix. */
  endereco: string | null;
  /** inet_server_port(); nulo = socket Unix. */
  porta: number | null;
};

const ENDERECOS_DE_LOOPBACK = new Set(["127.0.0.1", "::1"]);

/**
 * Trava 3 completa. A porta diferente da configurada denuncia túnel (porta local 55432 → servidor remoto 5432).
 * @param portaEsperada porta da DATABASE_URL (nula = não conferir).
 */
export function verificarServidor(leitura: LeituraDoServidor, portaEsperada: number | null): SituacaoDaEscrita {
  const marcador = verificarMarcador(leitura.marcador);
  if (!marcador.liberada) return marcador;
  if (leitura.endereco !== null && !ENDERECOS_DE_LOOPBACK.has(leitura.endereco)) {
    return { liberada: false, trava: "SERVIDOR_LOCAL", motivo: "O servidor do banco não está no endereço de loopback." };
  }
  if (portaEsperada !== null && leitura.porta !== null && leitura.porta !== portaEsperada) {
    return { liberada: false, trava: "SERVIDOR_LOCAL", motivo: "O servidor responde numa porta diferente da configurada (túnel?)." };
  }
  return LIBERADA;
}

function ambienteAtual(): AmbienteDeEscrita | null {
  try {
    return lerConfig();
  } catch {
    return null;
  }
}

/** Travas 1 e 2 no ambiente do processo. Configuração inválida conta como fechada. */
export function situacaoDoAmbiente(): SituacaoDaEscrita {
  const ambiente = ambienteAtual();
  if (!ambiente) return { liberada: false, trava: "MODO_LOCAL", motivo: "Configuração do ambiente inválida." };
  return verificarAmbiente(ambiente);
}

/** Porta do banco configurado, se ele for local (para a trava 3). */
export function portaDoBancoConfigurado(): number | null {
  const ambiente = ambienteAtual();
  return ambiente ? (bancoLocalDaUrl(ambiente.DATABASE_URL)?.porta ?? null) : null;
}

export function modoLocal(): boolean {
  const ambiente = ambienteAtual();
  return ambiente !== null && verificarModoLocal(ambiente).liberada;
}

/**
 * Travas 1 e 2, síncrona: serve só para esconder ou desabilitar botões.
 * Quem decide se grava é bancoParaEscrita(), que também confere o marcador no banco.
 */
export function escritaLiberada(): boolean {
  return situacaoDoAmbiente().liberada;
}
