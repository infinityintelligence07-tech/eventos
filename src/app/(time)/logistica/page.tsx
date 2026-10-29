import { redirect } from "next/navigation";
import { exigirAtor } from "@/app/(time)/_servidor/usuario-atual";

export default async function PaginaLogistica() {
  await exigirAtor();
  redirect("/logistica/voos");
}
