import { CircleCheck, CircleMinus, FilePlus2, MessageSquareText } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";

import { Aviso, BotaoLink, Cartao, Chip, EstadoVazio, FaixaSomenteLeitura, formatar, TITULO_DE_SECAO } from "@/app/(time)/_componentes/ui";
import { CabecaDaTabela, CelulaDaTabela, ColunaDaTabela, LinhaDaTabela, Tabela } from "@/app/(time)/_componentes/ui/tabela";
import { listarModelos } from "@/fluxos/comunicacao";
import { rotuloDoTipoDeModelo } from "@/modules/comunicacao";

import { FormularioDoLink } from "./_componentes/formulario-do-link";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Modelos de copy" };

export default async function PaginaModelosDeCopy() {
  const { modelos, linkCustos, escritaLiberada } = await listarModelos();

  return (
    <>
      {!escritaLiberada && <FaixaSomenteLeitura />}

      <Cartao id="link-custos" titulo="Link do formulário de custos" explicacao="Enquanto o staff não tem portal, a copy de escalação manda este link." className="mb-5">
        {!linkCustos && (
          <Aviso tom="atencao" className="mb-3">
            Sem o link, todas as copys de escalação ficam bloqueadas com &quot;falta link do formulário de custos&quot;.
          </Aviso>
        )}
        <FormularioDoLink linkCustos={linkCustos} escritaLiberada={escritaLiberada} />
      </Cartao>

      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <h2 className={TITULO_DE_SECAO}>Modelos</h2>
        {escritaLiberada && (
          <BotaoLink href="/configuracoes/modelos-de-copy/novo" variante="primario" icone={<FilePlus2 size={18} aria-hidden />}>
            Novo modelo
          </BotaoLink>
        )}
      </div>

      {modelos.length === 0 ? (
        <Cartao espacamento="nenhum">
          <EstadoVazio
            icone={<MessageSquareText size={32} aria-hidden />}
            titulo="Nenhum modelo de copy."
            acao={escritaLiberada && <BotaoLink href="/configuracoes/modelos-de-copy/novo">Novo modelo</BotaoLink>}
          />
        </Cartao>
      ) : (
        <Tabela legenda="Modelos de copy" larguraMinima="min-w-[720px]">
          <CabecaDaTabela>
            <ColunaDaTabela>Nome</ColunaDaTabela>
            <ColunaDaTabela>Tipo</ColunaDaTabela>
            <ColunaDaTabela>Situação</ColunaDaTabela>
            <ColunaDaTabela>Atualizado em</ColunaDaTabela>
            <ColunaDaTabela className="text-right">
              <span className="sr-only">Ações</span>
            </ColunaDaTabela>
          </CabecaDaTabela>
          <tbody>
            {modelos.map((modelo) => (
              <LinhaDaTabela key={modelo.id}>
                <CelulaDaTabela cabecalhoDaLinha>
                  <Link href={`/configuracoes/modelos-de-copy/${modelo.id}`} className="text-[var(--ds-tint-text)] hover:underline">
                    {modelo.nome}
                  </Link>
                </CelulaDaTabela>
                <CelulaDaTabela>{rotuloDoTipoDeModelo(modelo.tipo)}</CelulaDaTabela>
                <CelulaDaTabela>
                  <span className="inline-flex flex-wrap items-center gap-2">
                    {modelo.ativo ? (
                      <Chip tom="sucesso" icone={<CircleCheck size={14} aria-hidden />}>
                        Ativo
                      </Chip>
                    ) : (
                      <Chip tom="neutro" icone={<CircleMinus size={14} aria-hidden />}>
                        Inativo
                      </Chip>
                    )}
                    {modelo.emUso && <span className="text-[12px] text-[var(--ds-label-2)]">usado na Comunicação</span>}
                  </span>
                </CelulaDaTabela>
                <CelulaDaTabela className="tabular-nums">{formatar.dataEHora(modelo.atualizadoEm)}</CelulaDaTabela>
                <CelulaDaTabela className="text-right">
                  <BotaoLink href={`/configuracoes/modelos-de-copy/${modelo.id}`} tamanho="pequeno" aria-label={`Editar ${modelo.nome}`}>
                    Editar
                  </BotaoLink>
                </CelulaDaTabela>
              </LinhaDaTabela>
            ))}
          </tbody>
        </Tabela>
      )}
      <p className="mt-2 text-[12px] text-[var(--ds-label-2)]">Um modelo ativo por tipo: ativar um modelo desativa o que estava em uso no mesmo tipo.</p>
    </>
  );
}
