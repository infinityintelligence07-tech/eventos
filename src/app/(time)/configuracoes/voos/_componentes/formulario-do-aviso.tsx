"use client";

import { Save } from "lucide-react";
import { useActionState } from "react";

import { Botao, CampoDeTexto, caminhoDoCampo, useToastDoResultado } from "@/app/(time)/_componentes/ui";

import { enviarSemLimpar } from "../../modelos-de-copy/_componentes/enviar-sem-limpar";
import { salvarAvisoDeVoosAcao } from "../acoes";

const ACAO_NAO_EXECUTADA = { ok: true } as const;

export function FormularioDoAviso({ dias, minimo, maximo, escritaLiberada }: { dias: number; minimo: number; maximo: number; escritaLiberada: boolean }) {
  const [resultado, acao, salvando] = useActionState(salvarAvisoDeVoosAcao, ACAO_NAO_EXECUTADA);
  useToastDoResultado(resultado);
  const erros = resultado.ok ? undefined : resultado.campos?.[caminhoDoCampo("dias")];

  return (
    <form onSubmit={(evento) => enviarSemLimpar(evento, acao)} className="flex flex-wrap items-end gap-3">
      <CampoDeTexto
        nome="dias"
        rotulo="Avisar quantos dias antes do evento"
        numerico
        obrigatorio
        maxLength={4}
        defaultValue={String(dias)}
        erros={erros}
        className="w-[280px] max-w-full"
        ajuda={`De ${minimo} a ${maximo} dias. 90 dias são os 3 meses.`}
      />
      <Botao
        type="submit"
        carregando={salvando}
        icone={<Save size={18} aria-hidden />}
        textoCarregando="Salvando…"
        motivoDesabilitado={escritaLiberada ? undefined : "Somente leitura neste ambiente."}
      >
        Salvar aviso
      </Botao>
    </form>
  );
}
