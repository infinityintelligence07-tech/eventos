import type { AtorDaEscrita } from "@/core/autorizacao";
import { bancoLocal, bancoLocalDaUrl, urlSemDesvio } from "@/core/config/banco-local";
import { type ConfigDeEscrita, lerConfigDeEscrita } from "@/core/config/escrita";
import { type Config, lerConfig } from "@/core/config/leitura";

// Guarda de escrita (docs/07 §3 e docs/09 §5): dois modos, decididos pela configuração. Fora deles, somente leitura.
//   LOCAL    — EVENTOS_MODO=local: NODE_ENV ≠ production; DATABASE_URL em loopback; marcador `local` no BANCO, servidor
//              em loopback e porta conferida; ator LOCAL ou SESSAO.
//   PRODUCAO — EVENTOS_ESCRITA=producao: NODE_ENV = production (`next dev` nunca é); conexão própria de escrita
//              (DATABASE_URL_ESCRITA) no papel app_eventos; marcador `producao` no PAPEL e nenhum `local` no banco;
//              ator SESSAO.
// Travas 1 e 2 (ambiente) ficam aqui; a 3 (servidor) é lida por bancoParaEscrita() em src/fluxos/_base; a 4 (ator) aqui.

/** Mesmo id que scripts/banco-local grava em core.usuario. */
export const USUARIO_TESTE = { id: "7e570000-0000-7000-8000-000000000001", nome: "Usuário de teste" } as const;

/** Valor de eventos.ambiente no banco local (ALTER DATABASE … SET pelo banco:local). */
export const MARCADOR_DO_BANCO_LOCAL = "local";
/** Valor de eventos.ambiente no papel de escrita da produção (ALTER ROLE app_eventos SET, manual). */
export const MARCADOR_DO_PAPEL_DE_PRODUCAO = "producao";
export const PAPEL_DE_ESCRITA = "app_eventos";

export type ModoDeEscrita = "LOCAL" | "PRODUCAO";

export type AmbienteDeEscrita = Pick<Config, "NODE_ENV" | "EVENTOS_MODO" | "DATABASE_URL"> & Partial<ConfigDeEscrita>;

export type TravaDeEscrita =
  | "MODO_LOCAL"
  | "HOST_LOCAL"
  | "MARCADOR_NO_BANCO"
  | "SERVIDOR_LOCAL"
  | "MODO_PRODUCAO"
  | "PAPEL_DE_ESCRITA"
  | "MARCADOR_NO_PAPEL"
  | "ATOR";

export type SituacaoDaEscrita = { liberada: true; modo: ModoDeEscrita } | { liberada: false; trava: TravaDeEscrita; motivo: string };

type Fechada = Extract<SituacaoDaEscrita, { liberada: false }>;

const fechada = (trava: TravaDeEscrita, motivo: string): Fechada => ({ liberada: false, trava, motivo });

/** Qual modo a configuração pede (sem conferir nada ainda). Os dois juntos é configuração contraditória. */
export function modoPedido(ambiente: Pick<AmbienteDeEscrita, "EVENTOS_MODO" | "EVENTOS_ESCRITA">): ModoDeEscrita | null | "CONFLITO" {
  const local = ambiente.EVENTOS_MODO === "local";
  const producao = ambiente.EVENTOS_ESCRITA === "producao";
  if (local && producao) return "CONFLITO";
  if (local) return "LOCAL";
  if (producao) return "PRODUCAO";
  return null;
}

/** Trava 1 do modo LOCAL: modo local e fora de produção. */
export function verificarModoLocal(ambiente: Pick<AmbienteDeEscrita, "NODE_ENV" | "EVENTOS_MODO">): SituacaoDaEscrita {
  if (ambiente.EVENTOS_MODO !== "local") return fechada("MODO_LOCAL", "EVENTOS_MODO não é local.");
  if (ambiente.NODE_ENV === "production") return fechada("MODO_LOCAL", "NODE_ENV é production.");
  return { liberada: true, modo: "LOCAL" };
}

/** Travas 1 e 2 do modo PRODUCAO no ambiente (o papel e o marcador são conferidos no banco). */
export function verificarModoProducao(ambiente: AmbienteDeEscrita): SituacaoDaEscrita {
  if (ambiente.NODE_ENV !== "production") return fechada("MODO_PRODUCAO", "Escrita em produção só com NODE_ENV=production (next dev nunca grava).");
  if (!ambiente.DATABASE_URL_ESCRITA) return fechada("PAPEL_DE_ESCRITA", "Sem DATABASE_URL_ESCRITA (conexão de escrita no papel app_eventos).");
  if (ambiente.DATABASE_URL_ESCRITA === ambiente.DATABASE_URL) {
    return fechada("PAPEL_DE_ESCRITA", "A escrita precisa de uma conexão própria, diferente da DATABASE_URL de leitura.");
  }
  if (!urlSemDesvio(ambiente.DATABASE_URL_ESCRITA)) {
    return fechada("PAPEL_DE_ESCRITA", "DATABASE_URL_ESCRITA inválida ou com host, hostaddr ou options (desviam o servidor ou o papel).");
  }
  return { liberada: true, modo: "PRODUCAO" };
}

/** Travas 1 e 2 do modo pedido pela configuração. */
export function verificarAmbiente(ambiente: AmbienteDeEscrita): SituacaoDaEscrita {
  const modo = modoPedido(ambiente);
  switch (modo) {
    case null:
      return fechada("MODO_LOCAL", "Nenhum modo de escrita configurado (EVENTOS_MODO=local ou EVENTOS_ESCRITA=producao).");
    case "CONFLITO":
      return fechada("MODO_PRODUCAO", "EVENTOS_MODO=local e EVENTOS_ESCRITA=producao ao mesmo tempo.");
    case "LOCAL": {
      const local = verificarModoLocal(ambiente);
      if (!local.liberada) return local;
      if (!bancoLocal(ambiente.DATABASE_URL)) {
        return fechada("HOST_LOCAL", "DATABASE_URL não aponta para localhost (ou desvia a conexão com host, hostaddr ou options).");
      }
      return local;
    }
    case "PRODUCAO":
      return verificarModoProducao(ambiente);
    default: {
      const desconhecido: never = modo;
      throw new Error(`modo de escrita desconhecido: ${String(desconhecido)}`);
    }
  }
}

/** Trava 3 (LOCAL): o marcador gravado no catálogo do banco (ALTER DATABASE … SET eventos.ambiente). */
export function verificarMarcador(valor: string | null | undefined): SituacaoDaEscrita {
  if (valor === MARCADOR_DO_BANCO_LOCAL) return { liberada: true, modo: "LOCAL" };
  return fechada("MARCADOR_NO_BANCO", "O banco não tem o marcador eventos.ambiente = 'local'.");
}

/** O que o próprio servidor diz da conexão (nada disso vem da URL nem da sessão). */
export type LeituraDoServidor = {
  /** eventos.ambiente gravado para o banco atual (pg_db_role_setting, setrole = 0). */
  marcador: string | null;
  /** eventos.ambiente gravado para o papel do login (pg_db_role_setting, setrole = oid do session_user). */
  marcadorDoPapel?: string | null;
  /** session_user: o papel do login. current_user muda com SET ROLE ou `options=-c role=…` e não serve. */
  papel?: string | null;
  /** inet_server_addr(); nulo = socket Unix. */
  endereco: string | null;
  /** inet_server_port(); nulo = socket Unix. */
  porta: number | null;
};

const ENDERECOS_DE_LOOPBACK = new Set(["127.0.0.1", "::1"]);

/**
 * Trava 3 (LOCAL e PRODUCAO). No LOCAL, porta diferente da configurada denuncia túnel (55432 local → 5432 remoto),
 * e o marcador `producao` no papel recusa (a conexão local caiu num papel da produção).
 * @param portaEsperada porta da DATABASE_URL no modo LOCAL (nula = não conferir).
 */
export function verificarServidor(leitura: LeituraDoServidor, portaEsperada: number | null, modo: ModoDeEscrita = "LOCAL"): SituacaoDaEscrita {
  switch (modo) {
    case "LOCAL": {
      const marcador = verificarMarcador(leitura.marcador);
      if (!marcador.liberada) return marcador;
      if (leitura.marcadorDoPapel === MARCADOR_DO_PAPEL_DE_PRODUCAO) {
        return fechada("MARCADOR_NO_PAPEL", "O papel da conexão tem o marcador de produção.");
      }
      if (leitura.endereco !== null && !ENDERECOS_DE_LOOPBACK.has(leitura.endereco)) {
        return fechada("SERVIDOR_LOCAL", "O servidor do banco não está no endereço de loopback.");
      }
      if (portaEsperada !== null && leitura.porta !== null && leitura.porta !== portaEsperada) {
        return fechada("SERVIDOR_LOCAL", "O servidor responde numa porta diferente da configurada (túnel?).");
      }
      return marcador;
    }
    case "PRODUCAO":
      if (leitura.papel !== PAPEL_DE_ESCRITA) return fechada("PAPEL_DE_ESCRITA", `A conexão de escrita não está no papel ${PAPEL_DE_ESCRITA}.`);
      if (leitura.marcador === MARCADOR_DO_BANCO_LOCAL) return fechada("MARCADOR_NO_PAPEL", "O banco tem o marcador local: não é a produção.");
      if (leitura.marcadorDoPapel !== MARCADOR_DO_PAPEL_DE_PRODUCAO) {
        return fechada("MARCADOR_NO_PAPEL", `O papel ${PAPEL_DE_ESCRITA} não tem o marcador eventos.ambiente = 'producao'.`);
      }
      return { liberada: true, modo: "PRODUCAO" };
    default: {
      const desconhecido: never = modo;
      throw new Error(`modo de escrita desconhecido: ${String(desconhecido)}`);
    }
  }
}

/** Trava 4: quem pede a transação. Em PRODUCAO, só ator de sessão (o "Entrar como" do local nunca grava lá). */
export function verificarAtor(modo: ModoDeEscrita, ator: AtorDaEscrita | null): SituacaoDaEscrita {
  switch (modo) {
    case "LOCAL":
      if (!ator) return fechada("ATOR", "Escrita sem usuário.");
      return { liberada: true, modo };
    case "PRODUCAO":
      if (!ator) return fechada("ATOR", "Escrita em produção sem usuário de sessão.");
      if (ator.origem !== "SESSAO") return fechada("ATOR", "Escrita em produção só com login (ator de sessão).");
      return { liberada: true, modo };
    default: {
      const desconhecido: never = modo;
      throw new Error(`modo de escrita desconhecido: ${String(desconhecido)}`);
    }
  }
}

function ambienteAtual(): AmbienteDeEscrita | null {
  try {
    return { ...lerConfig(), ...lerConfigDeEscrita() };
  } catch {
    return null;
  }
}

/** Travas 1 e 2 no ambiente do processo. Configuração inválida conta como fechada. */
export function situacaoDoAmbiente(): SituacaoDaEscrita {
  const ambiente = ambienteAtual();
  if (!ambiente) return fechada("MODO_LOCAL", "Configuração do ambiente inválida.");
  return verificarAmbiente(ambiente);
}

/** Porta do banco configurado, se ele for local (para a trava 3 do modo LOCAL). */
export function portaDoBancoConfigurado(): number | null {
  const ambiente = ambienteAtual();
  return ambiente ? (bancoLocalDaUrl(ambiente.DATABASE_URL)?.porta ?? null) : null;
}

/** URL da conexão de escrita do modo PRODUCAO (nula fora dele). */
export function urlDeEscritaDeProducao(): string | null {
  const ambiente = ambienteAtual();
  return ambiente?.DATABASE_URL_ESCRITA ?? null;
}

export function modoLocal(): boolean {
  const ambiente = ambienteAtual();
  return ambiente !== null && verificarModoLocal(ambiente).liberada;
}

/**
 * Travas 1 e 2, síncrona: serve só para esconder ou desabilitar botões.
 * Quem decide se grava é bancoParaEscrita(), que também confere o servidor e o ator.
 */
export function escritaLiberada(): boolean {
  return situacaoDoAmbiente().liberada;
}
