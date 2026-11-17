import type { Metadata } from "next";

import { BuscaDeFiltro, CabecaDaTabela, CelulaDaTabela, Chip, ColunaDaTabela, FaixaSemPermissao, FaixaSomenteLeitura, LinhaDaTabela, Tabela } from "@/app/(time)/_componentes/ui";
import { Cartao } from "@/app/(time)/_componentes/ui/cartao";
import { exigirAtor, permissoesDoAtor } from "@/app/(time)/_servidor/usuario-atual";
import { listarAcessoDoTime } from "@/fluxos/pessoas";
import { rotuloDoNivelDeAcesso } from "@/modules/pessoas";

import { LiberarAcesso, MudarAcesso } from "./_componentes/controles-de-acesso";
import { definirAcessoAcao } from "./acoes";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Acesso do time" };

export default async function PaginaAcessoDoTime({ searchParams }: { searchParams: Promise<{ busca?: string }> }) {
  const ator = await exigirAtor();
  const busca = (await searchParams).busca?.trim().slice(0, 80) || undefined;
  const [{ comAcesso, encontrados, escritaLiberada }, permissoes] = await Promise.all([listarAcessoDoTime(busca), permissoesDoAtor("config.acesso_do_time")]);
  const edita = escritaLiberada && permissoes["config.acesso_do_time"];

  return (
    <>
      {!escritaLiberada ? <FaixaSomenteLeitura /> : !edita && <FaixaSemPermissao permissao="config.acesso_do_time" />}

      <section aria-labelledby="com-acesso" className="mb-6">
        <h2 id="com-acesso" className="mb-1 text-[17px] font-semibold tracking-[-0.01em]">
          Quem usa o sistema
        </h2>
        <p className="mb-3 text-[13px] text-[var(--ds-label-2)]">
          Time monta escalas, registra custos e cuida da logística. Líder faz tudo isso e também aprova escalas, muda regras e libera acesso.
        </p>
        <Tabela legenda="Pessoas com acesso às telas do time e o nível de cada uma" larguraMinima="min-w-[640px]">
          <CabecaDaTabela>
            <ColunaDaTabela>Pessoa</ColunaDaTabela>
            <ColunaDaTabela>E-mail</ColunaDaTabela>
            <ColunaDaTabela>Acesso</ColunaDaTabela>
            {edita && <ColunaDaTabela className="text-right">Mudar</ColunaDaTabela>}
          </CabecaDaTabela>
          <tbody>
            {comAcesso.map((pessoa) => (
              <LinhaDaTabela key={pessoa.usuarioId}>
                <CelulaDaTabela cabecalhoDaLinha>
                  {pessoa.nome}
                  {pessoa.usuarioId === ator.usuarioId && <span className="font-normal text-[var(--ds-label-2)]"> (você)</span>}
                </CelulaDaTabela>
                <CelulaDaTabela>{pessoa.email ?? "Sem e-mail"}</CelulaDaTabela>
                <CelulaDaTabela>
                  <span className="inline-flex flex-wrap items-center gap-1.5">
                    <Chip tom={pessoa.nivel === "LIDER" ? "informacao" : "neutro"}>{rotuloDoNivelDeAcesso(pessoa.nivel)}</Chip>
                    {!pessoa.ativo && <Chip tom="atencao">Conta inativa: não entra</Chip>}
                  </span>
                </CelulaDaTabela>
                {edita && (
                  <CelulaDaTabela className="text-right">
                    {pessoa.usuarioId === ator.usuarioId ? (
                      <span className="text-[13px] text-[var(--ds-label-2)]">Outra líder altera o seu</span>
                    ) : (
                      <MudarAcesso acao={definirAcessoAcao} usuarioId={pessoa.usuarioId} nome={pessoa.nome} nivel={pessoa.nivel} />
                    )}
                  </CelulaDaTabela>
                )}
              </LinhaDaTabela>
            ))}
          </tbody>
        </Tabela>
      </section>

      {edita && (
        <Cartao
          id="liberar"
          titulo="Liberar acesso para mais alguém"
          explicacao="A pessoa precisa ter conta aprovada no IAM Control. Contas novas aparecem aqui em até 30 minutos."
        >
          <div className="mt-3">
            <BuscaDeFiltro rotulo="Buscar conta por nome ou e-mail" placeholder="Nome ou e-mail (2 letras ou mais)" />
          </div>
          <p className="sr-only" aria-live="polite">
            {encontrados === null ? "" : encontrados.length === 1 ? "1 conta encontrada" : `${encontrados.length} contas encontradas`}
          </p>
          {encontrados !== null &&
            (encontrados.length === 0 ? (
              <p className="mt-4 text-[14px] text-[var(--ds-label-2)]">
                Nenhuma conta sem acesso com esse nome ou e-mail. Se a pessoa ainda não tem conta, ela cria em iamcontrol.com.br e um administrador aprova.
              </p>
            ) : (
              <ul className="mt-4 divide-y divide-[var(--ds-separator)]">
                {encontrados.map((pessoa) => (
                  <li key={pessoa.usuarioId} className="flex flex-wrap items-center justify-between gap-3 py-3">
                    <div className="min-w-0">
                      <p className="truncate text-[14px] font-medium">{pessoa.nome}</p>
                      <p className="truncate text-[13px] text-[var(--ds-label-2)]">{pessoa.email}</p>
                    </div>
                    <LiberarAcesso acao={definirAcessoAcao} usuarioId={pessoa.usuarioId} nome={pessoa.nome} />
                  </li>
                ))}
              </ul>
            ))}
        </Cartao>
      )}
    </>
  );
}
