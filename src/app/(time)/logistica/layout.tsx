import type { Metadata } from "next";
import type { ReactNode } from "react";
import { exigirAtor } from "@/app/(time)/_servidor/usuario-atual";

export const metadata: Metadata = { title: { default: "Voos e Hospedagem", template: "%s · Voos e Hospedagem · Eventos IAM" } };

export default async function LayoutDaLogistica({ children }: { children: ReactNode }) {
  await exigirAtor();
  return children;
}
