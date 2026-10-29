"use client";

import { Save } from "lucide-react";
import { useActionState } from "react";

import { Botao, CampoDeTexto, caminhoDoCampo, useToastDoResultado } from "@/app/(time)/_componentes/ui";

import { salvarLinkDeCustosAcao } from "../acoes";
import { enviarSemLimpar } from "./enviar-sem-limpar";

const ACAO_NAO_EXECUTADA = { ok: true } as const;

export function FormularioDoLink({ linkCustos, escritaLiberada }: { linkCustos: string | null; escritaLiberada: boolean }) {
  const [resultado, acao, salvando] = useActionState(salvarLinkDeCustosAcao, ACAO_NAO_EXECUTADA);
  useToastDoResultado(resultado);
  const erros = resultado.ok ? undefined : resultado.campos?.[caminhoDoCampo("linkCustos")];

  return (
    <form onSubmit={(evento) => enviarSemLimpar(evento, acao)} className="flex flex-wrap items-end gap-3">
      <CampoDeTexto
        nome="linkCustos"
        rotulo="Link do formulário de custos"
        type="url"
        inputMode="url"
        placeholder="https://"
        defaultValue={linkCustos ?? ""}
        erros={erros}
        className="min-w-[320px] flex-1"
        ajuda="Entra no lugar de {{link_custos}} na copy de escalação. Vazio: as copys de escalação ficam bloqueadas."
      />
      <Botao
        type="submit"
        carregando={salvando}
        icone={<Save size={18} aria-hidden />}
        textoCarregando="Salvando…"
        motivoDesabilitado={escritaLiberada ? undefined : "Somente leitura neste ambiente."}
      >
        Salvar link
      </Botao>
    </form>
  );
}
