import type { Metadata } from "next";
import type { ReactNode } from "react";

export const metadata: Metadata = { title: { default: "Logística e SDC", template: "%s · Logística e SDC · Eventos IAM" } };

export default function LayoutDaLogistica({ children }: { children: ReactNode }) {
  return children;
}
