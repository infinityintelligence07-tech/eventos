import { redirect } from "next/navigation";
import { exigirAtor } from "@/app/(time)/_servidor/usuario-atual";

// Sem isto o build (que roda sem sessão) grava a página como um redirecionamento fixo para o login.
export const dynamic = "force-dynamic";

export default async function PaginaLogistica() {
  await exigirAtor();
  redirect("/logistica/voos");
}
