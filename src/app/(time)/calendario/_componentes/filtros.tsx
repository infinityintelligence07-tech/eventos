"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";

type Opcao = { valor: string; rotulo: string };

const CAMPO =
  "h-10 rounded-[10px] border border-[var(--ds-separator)] bg-[var(--ds-surface)] pl-3 pr-8 text-[14px] text-[var(--ds-label)]";

function Seletor({ nome, rotulo, todos, opcoes, valor }: { nome: string; rotulo: string; todos: string; opcoes: Opcao[]; valor: string | null }) {
  const router = useRouter();
  const caminho = usePathname();
  const parametros = useSearchParams();

  function trocar(novo: string) {
    const proximos = new URLSearchParams(parametros);
    if (novo) proximos.set(nome, novo);
    else proximos.delete(nome);
    router.push(`${caminho}?${proximos.toString()}`);
  }

  return (
    <label className="flex items-center gap-2 text-[13px] text-[var(--ds-label-2)]">
      {rotulo}
      <select className={CAMPO} value={valor ?? ""} onChange={(evento) => trocar(evento.target.value)}>
        <option value="">{todos}</option>
        {opcoes.map((opcao) => (
          <option key={opcao.valor} value={opcao.valor}>
            {opcao.rotulo}
          </option>
        ))}
      </select>
    </label>
  );
}

export function Filtros({
  polos,
  tipos,
  polo,
  tipo,
}: {
  polos: Opcao[];
  tipos: Opcao[];
  polo: string | null;
  tipo: string | null;
}) {
  return (
    <div className="flex flex-wrap items-center gap-3">
      <Seletor nome="polo" rotulo="Polo" todos="Todos os polos" opcoes={polos} valor={polo} />
      <Seletor nome="tipo" rotulo="Tipo" todos="Todos os tipos" opcoes={tipos} valor={tipo} />
    </div>
  );
}
