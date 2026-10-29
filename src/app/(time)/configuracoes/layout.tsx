import type { Metadata } from "next";
import type { ReactNode } from "react";

import type { Permissao } from "@/core/autorizacao";

import { type AbaDaPagina, AbasDaPagina } from "../_componentes/ui/abas-da-pagina";
import { CabecalhoDaPagina } from "../_componentes/ui/cabecalho";
import { exigirAtor, permissoesDoAtor } from "../_servidor/usuario-atual";

export const metadata: Metadata = { title: { default: "Configurações", template: "%s · Configurações · Eventos IAM" } };

const ABAS: (AbaDaPagina & { permissao: Permissao })[] = [
  { href: "/configuracoes/regras-de-custo", rotulo: "Regras de custo", permissao: "config.regras_custo" },
  { href: "/configuracoes/vagas", rotulo: "Vagas por tipo de evento", permissao: "config.regras_vagas" },
  { href: "/configuracoes/modelos-de-copy", rotulo: "Modelos de copy", permissao: "config.modelos_copy" },
  { href: "/configuracoes/locais", rotulo: "Locais e hotéis", permissao: "config.locais" },
];

export default async function LayoutDasConfiguracoes({ children }: { children: ReactNode }) {
  await exigirAtor();
  const permissoes = await permissoesDoAtor(...ABAS.map((aba) => aba.permissao));
  // O time consulta as abas da líder; o contador avisa antes de abrir.
  const abas: AbaDaPagina[] = ABAS.map(({ permissao, ...aba }) =>
    permissoes[permissao] ? aba : { ...aba, contador: "só leitura", rotuloAcessivel: `${aba.rotulo} · só leitura` },
  );
  return (
    <>
      <CabecalhoDaPagina titulo="Configurações" subtitulo="Valores e modelos usados pelo sistema. Mudanças valem dali em diante." />
      <AbasDaPagina rotulo="Seções das configurações" abas={abas} />
      {children}
    </>
  );
}
