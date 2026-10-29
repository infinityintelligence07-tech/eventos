import { SearchX } from "lucide-react";

import { BotaoLink, CARTAO, EstadoVazio } from "@/app/(time)/_componentes/ui";

export default function EnqueteNaoEncontrada() {
  return (
    <section className={CARTAO}>
      <EstadoVazio
        icone={<SearchX size={32} aria-hidden />}
        titulo="Enquete não encontrada."
        nivel="h1"
        acao={<BotaoLink href="/disponibilidade">Voltar para Disponibilidade</BotaoLink>}
      >
        Ela pode ter sido apagada, ou o endereço está errado.
      </EstadoVazio>
    </section>
  );
}
