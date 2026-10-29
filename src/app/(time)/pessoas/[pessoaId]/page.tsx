import { CircleCheck, CircleX, Clock, History, Lock, type LucideIcon, UserMinus, UserPlus } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import type { ReactNode } from "react";

import { Aviso, BotaoCopiar, CabecalhoDaPagina, Cartao, Chip, EstadoVazio, FaixaSomenteLeitura, formatar, Migalha, SeloRegistradoPeloTime, SomenteLeitura, TITULO_DE_SECAO, type TomDoChip } from "@/app/(time)/_componentes/ui";
import { CabecaDaTabela, CelulaDaTabela, ColunaDaTabela, LinhaDaTabela, Tabela } from "@/app/(time)/_componentes/ui/tabela";
import { situacaoDaEscrita } from "@/fluxos/_base";
import { carregarPessoa } from "@/fluxos/pessoas";
import {
  MODELOS_DE_CAMISETA,
  rotuloDaSituacaoNaEscala,
  rotuloDoModelo,
  rotuloDoSexo,
  SEXOS,
  type SituacaoNaEscala,
  TAMANHOS_DE_CAMISETA,
} from "@/modules/pessoas";

import { ChipDoCadastro } from "../_componentes/chip-do-cadastro";
import { FormularioDeFuncoes, FormularioDeLocalizacao, FormularioDePerfil, FormularioDeVeiculo } from "./_componentes/formularios";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: Promise<{ pessoaId: string }> }): Promise<Metadata> {
  const pessoa = await carregarPessoa((await params).pessoaId, new Date());
  return { title: pessoa ? `${pessoa.nome} · Pessoas` : "Pessoa não encontrada" };
}

/** doc 08 §13, "Pessoa na escala". */
function chipDaSituacao(situacao: SituacaoNaEscala): { tom: TomDoChip; Icone: LucideIcon } {
  switch (situacao) {
    case "SUGERIDA":
      return { tom: "neutro", Icone: UserPlus };
    case "CONVIDADA":
      return { tom: "informacao", Icone: Clock };
    case "ACEITA":
      return { tom: "sucesso", Icone: CircleCheck };
    case "RECUSADA":
      return { tom: "perigo", Icone: CircleX };
    case "CANCELADA":
      return { tom: "neutro", Icone: UserMinus };
    default: {
      const desconhecida: never = situacao;
      throw new Error(`situação na escala desconhecida: ${String(desconhecida)}`);
    }
  }
}

function ChipDaSituacao({ situacao }: { situacao: SituacaoNaEscala }) {
  const { tom, Icone } = chipDaSituacao(situacao);
  return (
    <Chip tom={tom} icone={<Icone size={14} aria-hidden />} riscado={situacao === "CANCELADA"}>
      {rotuloDaSituacaoNaEscala(situacao)}
    </Chip>
  );
}

function DadoSomenteLeitura({ rotulo, children }: { rotulo: string; children: ReactNode }) {
  return (
    <div>
      <dt className="text-[12px] font-medium text-[var(--ds-label-2)]">{rotulo}</dt>
      <dd className="mt-0.5 flex flex-wrap items-center gap-2 text-[14px]">{children}</dd>
    </div>
  );
}

export default async function PaginaPessoa({ params }: { params: Promise<{ pessoaId: string }> }) {
  const { pessoaId } = await params;
  const [pessoa, escrita] = await Promise.all([carregarPessoa(pessoaId, new Date()), situacaoDaEscrita()]);
  if (!pessoa) notFound();
  const somenteLeitura = !escrita.liberada;
  const semLocalizacao = pessoa.perfil.lat === null || pessoa.perfil.lng === null;

  return (
    <>
      <CabecalhoDaPagina
        migalha={<Migalha itens={[{ rotulo: "Pessoas", href: "/pessoas" }, { rotulo: pessoa.nome }]} />}
        titulo={pessoa.nome}
        aoLadoDoTitulo={<ChipDoCadastro pendencias={pessoa.pendencias} />}
        subtitulo={["Staff", pessoa.poloNome, pessoa.ativo ? "ativa" : "inativa"].filter(Boolean).join(" · ")}
      />
      {somenteLeitura && <FaixaSomenteLeitura />}

      <div className="grid gap-3 lg:grid-cols-3">
        <Cartao id="contato" titulo="Contato" explicacao={<SomenteLeitura origem="Vem do cadastro de pessoas (GH)" />}>
          <dl className="flex flex-col gap-3">
            {pessoa.nomeSocial && <DadoSomenteLeitura rotulo="Nome completo">{pessoa.nomeCompleto}</DadoSomenteLeitura>}
            <DadoSomenteLeitura rotulo="Telefone">
              {pessoa.telefone ? (
                <>
                  <span className="tabular-nums">{pessoa.telefone}</span>
                  <BotaoCopiar texto={pessoa.telefone} mensagem="Telefone copiado." tamanho="pequeno">
                    Copiar
                  </BotaoCopiar>
                </>
              ) : (
                "—"
              )}
            </DadoSomenteLeitura>
            <DadoSomenteLeitura rotulo="E-mail">{pessoa.email ?? "—"}</DadoSomenteLeitura>
          </dl>
        </Cartao>

        <FormularioDeFuncoes
          pessoaId={pessoa.pessoaId}
          disponiveis={pessoa.funcoesDisponiveis.map((funcao) => ({ id: funcao.id, nome: funcao.nome }))}
          atuais={pessoa.funcoes.map((funcao) => ({ funcaoId: funcao.funcaoId, nivel: funcao.nivel }))}
          somenteLeitura={somenteLeitura}
        />

        <div className="flex flex-col gap-3">
          <FormularioDeVeiculo pessoaId={pessoa.pessoaId} veiculo={pessoa.veiculo} somenteLeitura={somenteLeitura} />
          <FormularioDePerfil
            pessoaId={pessoa.pessoaId}
            perfil={{
              sexo: pessoa.perfil.sexo,
              camisetaModelo: pessoa.perfil.camisetaModelo,
              camisetaTamanho: pessoa.perfil.camisetaTamanho,
              possuiCamiseta: pessoa.perfil.possuiCamiseta,
              fezConfronto: pessoa.perfil.fezConfronto,
              temCnpj: pessoa.perfil.temCnpj,
            }}
            opcoes={{
              sexos: SEXOS.map((sexo) => ({ valor: sexo, rotulo: rotuloDoSexo(sexo) })),
              modelos: MODELOS_DE_CAMISETA.map((modelo) => ({ valor: modelo, rotulo: rotuloDoModelo(modelo) })),
              tamanhos: TAMANHOS_DE_CAMISETA.map((tamanho) => ({ valor: tamanho, rotulo: tamanho })),
            }}
            somenteLeitura={somenteLeitura}
          />
        </div>

        <Cartao id="endereco" titulo="Endereço e localização" explicacao={<SomenteLeitura origem="Endereço vem do cadastro de pessoas (GH)" />}>
          <p className="text-[14px] text-[var(--ds-label-2)]">
            O endereço ainda não é lido pelo Eventos nesta versão. Rua e número nunca aparecem por padrão.
          </p>
          {semLocalizacao && (
            <Aviso tom="atencao" className="mt-3">
              Endereço sem localização no mapa. A distância até os eventos não é calculada.
            </Aviso>
          )}
          <FormularioDeLocalizacao pessoaId={pessoa.pessoaId} temLocalizacao={!semLocalizacao} somenteLeitura={somenteLeitura} />
        </Cartao>

        <Cartao id="pagamento" titulo="Pagamento" explicacao={<SomenteLeitura origem="Vem do cadastro de pessoas (GH)" />}>
          <p className="flex items-start gap-2 text-[14px] text-[var(--ds-label-2)]">
            <Lock size={16} aria-hidden className="mt-0.5 shrink-0" />
            PIX e CPF ficam no cadastro do GH e não aparecem no Eventos. A situação do PIX entra aqui quando o GH oferecer só a informação “tem PIX”.
          </p>
        </Cartao>
      </div>

      <section aria-labelledby="historico-titulo" className="mt-6">
        <h2 id="historico-titulo" className={`${TITULO_DE_SECAO} mb-3`}>
          Histórico
        </h2>
        {pessoa.historico.length === 0 ? (
          <Cartao espacamento="nenhum">
            <EstadoVazio icone={<History size={32} aria-hidden />} titulo="Ainda não trabalhou em nenhum evento pelo sistema." />
          </Cartao>
        ) : (
          <Tabela legenda={`Eventos em que ${pessoa.nome} foi escalada, do mais recente para o mais antigo`}>
            <CabecaDaTabela>
              <ColunaDaTabela>Data</ColunaDaTabela>
              <ColunaDaTabela>Evento</ColunaDaTabela>
              <ColunaDaTabela>Função</ColunaDaTabela>
              <ColunaDaTabela>Situação na escala</ColunaDaTabela>
              <ColunaDaTabela>Presença</ColunaDaTabela>
            </CabecaDaTabela>
            <tbody>
              {pessoa.historico.map((item) => (
                <LinhaDaTabela key={item.convocacaoId}>
                  <CelulaDaTabela className="whitespace-nowrap tabular-nums">{formatar.periodo(item.dataInicio, item.dataFim)}</CelulaDaTabela>
                  <CelulaDaTabela cabecalhoDaLinha>
                    <Link href={`/eventos/${item.eventoId}`} className="text-[var(--ds-tint-text)] hover:underline">
                      {item.eventoCodigo ?? item.eventoNome}
                    </Link>
                    {item.eventoCodigo && <span className="block text-[12px] font-normal text-[var(--ds-label-2)]">{item.eventoNome}</span>}
                  </CelulaDaTabela>
                  <CelulaDaTabela>{item.funcao ?? "—"}</CelulaDaTabela>
                  <CelulaDaTabela>
                    <span className="flex flex-wrap items-center gap-1.5">
                      <ChipDaSituacao situacao={item.situacao} />
                      {item.registradoPor && <SeloRegistradoPeloTime em={item.respondidaEm} />}
                    </span>
                  </CelulaDaTabela>
                  <CelulaDaTabela>{item.presenca ?? "—"}</CelulaDaTabela>
                </LinhaDaTabela>
              ))}
            </tbody>
          </Tabela>
        )}
      </section>
    </>
  );
}
