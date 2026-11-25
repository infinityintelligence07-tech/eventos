import { redirect } from "next/navigation";

import { exigirAtorSdc } from "./_servidor/ator-sdc";

export const dynamic = "force-dynamic";

export default async function PaginaDaSdc() {
  await exigirAtorSdc();
  redirect("/sdc/voos");
}
