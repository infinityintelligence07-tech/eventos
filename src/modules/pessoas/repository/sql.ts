import { sql } from "drizzle-orm";

import { pessoa, polo, vinculo } from "@/core/db/schema/core";
import { evento, pessoaEvento } from "@/core/db/schema/eventos";

export const nomeDaPessoa = sql<string>`coalesce(nullif(trim(${pessoa.nomeSocial}), ''), ${pessoa.nomeCompleto})`;

// Polo do staff: o que ele escolheu em "Meu cadastro" (pessoa_evento.polo_id, docs/10); sem isso, o do vínculo ativo
// mais recente no GH (core.vinculo, só leitura).
const doPoloDaPessoa = (coluna: typeof polo.codigo | typeof polo.nome) => sql<string | null>`coalesce(
  (select ${coluna} from ${pessoaEvento} join ${polo} on ${polo.id} = ${pessoaEvento.poloId} where ${pessoaEvento.pessoaId} = ${pessoa.id}),
  (select ${coluna} from ${vinculo} join ${polo} on ${polo.id} = ${vinculo.poloId}
    where ${vinculo.pessoaId} = ${pessoa.id} and ${vinculo.status} = 'ATIVO' and ${vinculo.deletedAt} is null
    order by ${vinculo.dataInicio} desc limit 1)
)`;

export const poloCodigoDaPessoa = doPoloDaPessoa(polo.codigo);
export const poloNomeDaPessoa = doPoloDaPessoa(polo.nome);

export const diaEmSaoPaulo = (coluna: typeof evento.inicio | typeof evento.fim) =>
  sql<string>`to_char(${coluna} at time zone 'America/Sao_Paulo', 'YYYY-MM-DD')`;
