import { SearchX } from "lucide-react";

import { BotaoLink, CARTAO, EstadoVazio } from "@/app/(time)/_componentes/ui";

export default function PessoaNaoEncontrada() {
  return (
    <section className={CARTAO}>
      <EstadoVazio icone={<SearchX size={32} aria-hidden />} titulo="Pessoa não encontrada." nivel="h1" acao={<BotaoLink href="/pessoas">Voltar para Pessoas</BotaoLink>}>
        Ela pode não estar no staff do Eventos, ou o endereço está errado.
      </EstadoVazio>
    </section>
  );
}
