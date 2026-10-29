"use client";

import { Copy } from "lucide-react";

import { Botao, type PropsDoBotao } from "./botao";
import { useToast } from "./toast";

/** Copia o texto pronto (convite, pedido à SDC, rooming list, telefone) para a área de transferência. Não grava nada. */
export function BotaoCopiar({
  texto,
  mensagem,
  rotulo,
  children,
  ...resto
}: Omit<PropsDoBotao, "onClick" | "icone"> & {
  texto: string;
  /** Toast de sucesso, no passado ("Convite copiado. Cole no grupo do staff."). */
  mensagem: string;
  /** Texto do botão; ou passe como filho. */
  rotulo?: string;
}) {
  const toast = useToast();

  async function copiar() {
    try {
      await navigator.clipboard.writeText(texto);
      toast.sucesso(mensagem);
    } catch {
      toast.erro("Não foi possível copiar automaticamente. Selecione o texto e use Ctrl+C.");
    }
  }

  return (
    <Botao {...resto} onClick={copiar} icone={<Copy size={resto.tamanho === "pequeno" ? 16 : 18} aria-hidden />}>
      {children ?? rotulo}
    </Botao>
  );
}
