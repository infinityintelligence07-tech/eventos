import type { Metadata } from "next";
import type { ReactNode } from "react";
import { exigirAtor } from "@/app/(time)/_servidor/usuario-atual";

// Voos e Hospedagem são itens separados no menu: cada página diz no título a qual dos dois pertence.
export const metadata: Metadata = { title: { default: "Voos", template: "%s · Eventos IAM" } };

export default async function LayoutDaLogistica({ children }: { children: ReactNode }) {
  await exigirAtor();
  return children;
}
