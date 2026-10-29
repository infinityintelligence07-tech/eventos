import type { Metadata } from "next";
import type { ReactNode } from "react";
import { exigirAtor } from "@/app/(time)/_servidor/usuario-atual";

export const metadata: Metadata = { title: { default: "Logística e SDC", template: "%s · Logística e SDC · Eventos IAM" } };

export default async function LayoutDaLogistica({ children }: { children: ReactNode }) {
  await exigirAtor();
  return children;
}
