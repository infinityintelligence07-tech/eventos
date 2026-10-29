import { Lock } from "lucide-react";

import type { Permissao } from "@/core/autorizacao";

import { Aviso } from "./aviso";
import { SomenteLeitura } from "./estados";

// O que o ator não pode fazer não aparece; no lugar, o motivo (docs/09 §4.2, doc 08 §3.12). Só esconde: quem decide
// é executarAcao, que confere a permissão no servidor.

export function motivoSemPermissao(permissao: Permissao): string {
  switch (permissao) {
    case "escala.aprovar":
      return "Só a líder pode aprovar ou devolver escalas.";
    case "escala.reabrir":
      return "Só a líder pode reabrir a escala.";
    case "custos.reabrir_auditoria":
      return "Só a líder pode reabrir a auditoria.";
    case "config.link_custos":
      return "Só a líder pode mudar o link de custos.";
    case "config.regras_vagas":
      return "Só a líder pode mudar as regras de vagas.";
    case "config.regras_custo":
      return "Só a líder pode mudar as regras de custo.";
    case "evento.editar":
    case "escala.montar":
    case "escala.registrar_resposta":
    case "comunicacao.enviar":
    case "disponibilidade.gerir":
    case "disponibilidade.registrar_resposta":
    case "pessoas.editar":
    case "logistica.gerir":
    case "logistica.registrar_retorno_sdc":
    case "custos.registrar":
    case "custos.auditar":
    case "config.locais":
    case "config.modelos_copy":
      return "Você não tem permissão para esta ação.";
    default: {
      const desconhecida: never = permissao;
      throw new Error(`permissão desconhecida: ${String(desconhecida)}`);
    }
  }
}

/** No lugar do botão: cadeado + motivo, em texto (não um botão desabilitado sem explicação). */
export function SemPermissaoNaAcao({ permissao }: { permissao: Permissao }) {
  return <SomenteLeitura origem={motivoSemPermissao(permissao)} />;
}

/** Topo das telas que o ator só consulta. */
export function FaixaSemPermissao({ permissao, className = "mb-5" }: { permissao: Permissao; className?: string }) {
  return (
    <Aviso tom="neutro" className={className} icone={<Lock size={18} aria-hidden className="mt-0.5 shrink-0 text-[var(--ds-label-2)]" />}>
      Somente leitura: {motivoSemPermissao(permissao).replace(/^S/, "s")} Dá para consultar tudo.
    </Aviso>
  );
}
