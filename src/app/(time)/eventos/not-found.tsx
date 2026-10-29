import { CalendarDays, SearchX } from "lucide-react";

import { BotaoLink } from "../_componentes/ui/botao-link";
import { CARTAO } from "../_componentes/ui/classes";
import { EstadoVazio } from "../_componentes/ui/estados";

export default function EventoNaoEncontrado() {
  return (
    <div className={CARTAO}>
      <EstadoVazio
        icone={<SearchX size={32} aria-hidden />}
        titulo="Evento não encontrado"
        nivel="h1"
        acao={
          <BotaoLink href="/calendario" variante="primario" icone={<CalendarDays size={18} aria-hidden />}>
            Voltar ao calendário
          </BotaoLink>
        }
      >
        Ele pode ter sido removido do IAM Control.
      </EstadoVazio>
    </div>
  );
}
