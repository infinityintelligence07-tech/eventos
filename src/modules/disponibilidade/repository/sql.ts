import { sql } from "drizzle-orm";

import { pessoa, polo, vinculo } from "@/core/db/schema/core";
import { evento } from "@/core/db/schema/eventos";

export const nomeDaPessoa = sql<string>`coalesce(nullif(trim(${pessoa.nomeSocial}), ''), ${pessoa.nomeCompleto})`;

// core.vinculo é do GH (só leitura): o polo do staff vem do vínculo ativo mais recente.
export const poloDaPessoa = sql<string | null>`(
  select ${polo.codigo} from ${vinculo} join ${polo} on ${polo.id} = ${vinculo.poloId}
   where ${vinculo.pessoaId} = ${pessoa.id} and ${vinculo.status} = 'ATIVO' and ${vinculo.deletedAt} is null
   order by ${vinculo.dataInicio} desc limit 1
)`;

export const diaEmSaoPaulo = (coluna: typeof evento.inicio | typeof evento.fim) =>
  sql<string>`to_char(${coluna} at time zone 'America/Sao_Paulo', 'YYYY-MM-DD')`;
