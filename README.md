# Eventos

Sistema do time de eventos da IAM: escala de eventos e Masterclass, comunicação com o staff,
logística (carona, voo, hotel) e custos. Fase atual: backend e banco.

- Banco: Supabase `iam-pessoas` (sa-east-1), compartilhado com o GH (repo GH-System).
  Este repo só cria migrations do schema `eventos`; `core` e `sensivel` são lidos (ver `src/core/db/schema/core.ts`).
- Decisões: [docs/adr/0001-banco-pessoas-gh-eventos.md](docs/adr/0001-banco-pessoas-gh-eventos.md)
- Requisitos: [docs/01-requisitos-e-viabilidade.md](docs/01-requisitos-e-viabilidade.md)
- Regras de custo: [docs/03-regras-de-custo.md](docs/03-regras-de-custo.md)

## Banco

```bash
npm ci
cp .env.example .env          # DATABASE_URL
npm run db:migrate            # aplica as migrations do schema eventos
npm run db:generate           # gera migration a partir de src/core/db/schema/eventos
```

- Localmente, aplique antes as migrations do GH-System (criam `core`, `sensivel` e as tabelas de evento adotadas).
- O histórico de migrations deste repo fica em `drizzle.__drizzle_migrations_eventos`.
- Toda migration manual tem `.down.sql`. Valores de dinheiro sempre em centavos.
