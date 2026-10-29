import { Users } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";

import {
  AtalhosDeFiltro,
  BarraDeFiltros,
  BotaoLink,
  BuscaDeFiltro,
  CabecalhoDaPagina,
  CARTAO,
  Chip,
  EstadoVazio,
  formatar,
  SeletorDeFiltro,
} from "@/app/(time)/_componentes/ui";
import { CabecaDaTabela, CelulaDaTabela, ColunaDaTabela, LinhaDaTabela, RodapeDaTabela, Tabela } from "@/app/(time)/_componentes/ui/tabela";
import { listarPessoas } from "@/fluxos/pessoas";
import { lerFiltrosDaLista, limiteDaLista, PAGINA_DA_LISTA, rotuloDaCamiseta, rotuloDaFuncao, rotuloDoVeiculo, rotuloSimNao } from "@/modules/pessoas";

import { ChipDoCadastro } from "./_componentes/chip-do-cadastro";
import { exigirAtor } from "@/app/(time)/_servidor/usuario-atual";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Pessoas" };

type Parametros = Record<string, string | string[] | undefined>;

const FILTROS = ["busca", "polo", "funcao", "situacao", "mostrar"];
const FUNCOES_VISIVEIS = 3;

function enderecoComLimite(parametros: Parametros, limite: number): string {
  const proximos = new URLSearchParams();
  for (const [nome, valor] of Object.entries(parametros)) {
    if (typeof valor === "string" && valor && nome !== "limite") proximos.set(nome, valor);
  }
  proximos.set("limite", String(limite));
  return `/pessoas?${proximos.toString()}`;
}

export default async function PaginaPessoas({ searchParams }: { searchParams: Promise<Parametros> }) {
  await exigirAtor();
  const parametros = await searchParams;
  const filtros = lerFiltrosDaLista(parametros);
  const limite = limiteDaLista(parametros.limite);
  const { pessoas, totalDoStaff, opcoes } = await listarPessoas(filtros, new Date());
  const visiveis = pessoas.slice(0, limite);

  return (
    <>
      <CabecalhoDaPagina titulo="Pessoas" subtitulo="Staff que pode ser escalado nos eventos." />

      {totalDoStaff === 0 ? (
        <section className={CARTAO}>
          <EstadoVazio icone={<Users size={32} aria-hidden />} titulo="Nenhuma pessoa cadastrada ainda." nivel="h2">
            As pessoas vêm do cadastro do GH e, depois, do cadastro feito pelo próprio staff.
          </EstadoVazio>
        </section>
      ) : (
        <>
          <BarraDeFiltros nomes={FILTROS} resultado={pessoas.length === 1 ? "1 pessoa encontrada" : `${pessoas.length} pessoas encontradas`}>
            <BuscaDeFiltro rotulo="Buscar por nome" placeholder="Buscar por nome" />
            <SeletorDeFiltro nome="polo" rotulo="Polo" todos="Todos" opcoes={opcoes.polos.map((polo) => ({ valor: polo.codigo, rotulo: polo.nome }))} />
            <SeletorDeFiltro nome="funcao" rotulo="Função" todos="Todas" opcoes={opcoes.funcoes.map((funcao) => ({ valor: funcao.codigo, rotulo: funcao.nome }))} />
            <SeletorDeFiltro
              nome="situacao"
              rotulo="Situação"
              todos="Ativas"
              valor={filtros.situacao === "ativas" ? null : filtros.situacao}
              opcoes={[
                { valor: "inativas", rotulo: "Inativas" },
                { valor: "todas", rotulo: "Todas" },
              ]}
            />
            <AtalhosDeFiltro
              nome="mostrar"
              rotulo="Mostrar"
              opcoes={[
                { valor: null, rotulo: "Todas" },
                { valor: "incompleto", rotulo: "Cadastro incompleto" },
                { valor: "com-carro", rotulo: "Tem carro" },
                { valor: "fez-confronto", rotulo: "Fez Confronto" },
              ]}
            />
          </BarraDeFiltros>

          {pessoas.length === 0 ? (
            <section className={CARTAO}>
              <EstadoVazio titulo="Nenhuma pessoa com esses filtros.">
                <BotaoLink href="/pessoas" variante="texto">
                  Limpar filtros
                </BotaoLink>
              </EstadoVazio>
            </section>
          ) : (
            <Tabela
              legenda="Staff que pode ser escalado"
              rodape={
                pessoas.length > PAGINA_DA_LISTA && (
                  <RodapeDaTabela mostrando={visiveis.length} total={pessoas.length}>
                    {visiveis.length < pessoas.length && (
                      <BotaoLink href={enderecoComLimite(parametros, limite + PAGINA_DA_LISTA)} variante="texto" scroll={false}>
                        Mostrar mais {Math.min(PAGINA_DA_LISTA, pessoas.length - visiveis.length)}
                      </BotaoLink>
                    )}
                  </RodapeDaTabela>
                )
              }
            >
              <CabecaDaTabela>
                <ColunaDaTabela>Nome</ColunaDaTabela>
                <ColunaDaTabela>Funções</ColunaDaTabela>
                <ColunaDaTabela>Polo</ColunaDaTabela>
                <ColunaDaTabela>Carro</ColunaDaTabela>
                <ColunaDaTabela>Camiseta</ColunaDaTabela>
                <ColunaDaTabela>Fez Confronto</ColunaDaTabela>
                <ColunaDaTabela>Último evento</ColunaDaTabela>
                <ColunaDaTabela>Cadastro</ColunaDaTabela>
              </CabecaDaTabela>
              <tbody>
                {visiveis.map((pessoa) => (
                  <LinhaDaTabela key={pessoa.pessoaId}>
                    <CelulaDaTabela cabecalhoDaLinha className="whitespace-nowrap">
                      <Link href={`/pessoas/${pessoa.pessoaId}`} className="text-[var(--ds-tint-text)] hover:underline">
                        {pessoa.nome}
                      </Link>
                      {!pessoa.ativo && <span className="ml-1.5 text-[12px] font-normal text-[var(--ds-label-2)]">(inativa)</span>}
                    </CelulaDaTabela>
                    <CelulaDaTabela>
                      <span className="flex flex-wrap gap-1">
                        {pessoa.funcoes.slice(0, FUNCOES_VISIVEIS).map((funcao) => (
                          <Chip key={funcao.funcaoId} tom="neutro">
                            {rotuloDaFuncao(funcao)}
                          </Chip>
                        ))}
                        {pessoa.funcoes.length > FUNCOES_VISIVEIS && (
                          <span title={pessoa.funcoes.slice(FUNCOES_VISIVEIS).map(rotuloDaFuncao).join(", ")} className="text-[12px] text-[var(--ds-label-2)]">
                            +{pessoa.funcoes.length - FUNCOES_VISIVEIS}
                          </span>
                        )}
                        {pessoa.funcoes.length === 0 && "—"}
                      </span>
                    </CelulaDaTabela>
                    <CelulaDaTabela className="whitespace-nowrap">{pessoa.poloNome ?? "—"}</CelulaDaTabela>
                    <CelulaDaTabela className="whitespace-nowrap">{rotuloDoVeiculo(pessoa.veiculo) ?? "—"}</CelulaDaTabela>
                    <CelulaDaTabela className="whitespace-nowrap">
                      {rotuloDaCamiseta(pessoa.perfil.camisetaModelo, pessoa.perfil.camisetaTamanho) ?? "—"}
                    </CelulaDaTabela>
                    <CelulaDaTabela>{rotuloSimNao(pessoa.perfil.fezConfronto)}</CelulaDaTabela>
                    <CelulaDaTabela className="whitespace-nowrap">
                      {pessoa.ultimoEvento ? `${formatar.dataCurta(pessoa.ultimoEvento.dataInicio)} · ${pessoa.ultimoEvento.codigo ?? pessoa.ultimoEvento.nome}` : "—"}
                    </CelulaDaTabela>
                    <CelulaDaTabela className="whitespace-nowrap">
                      <ChipDoCadastro pendencias={pessoa.pendencias} />
                    </CelulaDaTabela>
                  </LinhaDaTabela>
                ))}
              </tbody>
            </Tabela>
          )}
        </>
      )}
    </>
  );
}
