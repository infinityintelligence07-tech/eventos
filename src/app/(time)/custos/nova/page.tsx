import type { Metadata } from "next";
import { z } from "zod";

import { situacaoDaEscrita } from "@/fluxos/_base";
import { prepararSolicitacao } from "@/fluxos/custos";
import { CATEGORIAS_DO_ITEM, rotuloDaAuditoria, rotuloDaCategoriaDoItem } from "@/modules/custos";

import { Aviso, FaixaEmNomeDe, FaixaSomenteLeitura } from "../../_componentes/ui/aviso";
import { BarraDeFiltros, SeletorDeFiltro } from "../../_componentes/ui/barra-de-filtros";
import { BotaoLink } from "../../_componentes/ui/botao-link";
import { CabecalhoDaPagina, Migalha } from "../../_componentes/ui/cabecalho";
import { Cartao } from "../../_componentes/ui/cartao";
import { EstadoVazio } from "../../_componentes/ui/estados";
import { dataCurta } from "../../_componentes/ui/formatos";
import { paraCampoDeDinheiro, parametro } from "../../logistica/_componentes/situacoes";
import { calcularPreviaAcao, corrigirSolicitacaoAcao, registrarSolicitacaoAcao } from "../acoes";
import { FormularioDeSolicitacao, type LinhaDeDeslocamento } from "../_componentes/formulario-de-solicitacao";
import { exigirAtor } from "@/app/(time)/_servidor/usuario-atual";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Registrar solicitação" };

const decimal = (valor: number | null) => (valor === null ? "" : valor.toLocaleString("pt-BR", { maximumFractionDigits: 2 }));

export default async function PaginaNovaSolicitacao({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  await exigirAtor();
  const busca = await searchParams;
  const protocolo = parametro(busca.protocolo);
  const filtro = {
    eventoId: z.uuid().safeParse(parametro(busca.evento)).data,
    pessoaId: z.uuid().safeParse(parametro(busca.pessoa)).data,
    protocolo: protocolo && /^STF-\d{6}-\d{4,}$/.test(protocolo) ? protocolo : undefined,
  };
  const [preparada, escrita] = await Promise.all([prepararSolicitacao(filtro, new Date()), situacaoDaEscrita()]);
  const { evento, pessoa, paraCorrigir, sugestoes } = preparada;
  const corrigindo = paraCorrigir !== null;

  const linhaNova: LinhaDeDeslocamento = {
    origem: "",
    destino: "",
    idaVolta: true,
    km: "",
    consumoKmL: decimal(sugestoes.consumoKmL),
    precoLitroCentavos: paraCampoDeDinheiro(sugestoes.precoLitroCentavos),
    pedagioCentavos: "",
  };
  const categorias = CATEGORIAS_DO_ITEM.map((categoria) => ({ valor: categoria, rotulo: rotuloDaCategoriaDoItem(categoria) }));

  return (
    <>
      <CabecalhoDaPagina
        migalha={<Migalha itens={[{ rotulo: "Custos", href: "/custos" }, { rotulo: corrigindo ? `Corrigir ${paraCorrigir.protocolo}` : "Registrar solicitação" }]} />}
        titulo={corrigindo ? `Corrigir ${paraCorrigir.protocolo}` : "Registrar solicitação"}
        subtitulo={corrigindo ? "A solicitação foi reprovada. Registre a correção e ela volta para a fila de auditoria." : "Em nome da pessoa: o staff ainda não tem portal."}
      />
      {!escrita.liberada && <FaixaSomenteLeitura />}

      {!corrigindo && (
        <BarraDeFiltros>
          <SeletorDeFiltro
            nome="evento"
            rotulo="Evento"
            todos="Escolha o evento"
            valor={evento?.id ?? null}
            opcoes={preparada.eventos.map((item) => ({ valor: item.id, rotulo: `${item.codigo ?? item.nome} · ${dataCurta(item.data)}` }))}
          />
          {evento && (
            <SeletorDeFiltro
              nome="pessoa"
              rotulo="Pessoa"
              todos="Escolha a pessoa"
              valor={pessoa?.pessoaId ?? null}
              opcoes={preparada.pessoas.map((item) => ({
                valor: item.pessoaId,
                rotulo: `${item.nome}${item.funcao ? ` · ${item.funcao}` : ""}${item.solicitacao ? ` · já tem ${item.solicitacao.protocolo}` : ""}`,
              }))}
            />
          )}
        </BarraDeFiltros>
      )}

      {!evento ? (
        <Cartao espacamento="nenhum">
          <EstadoVazio titulo="Escolha o evento e a pessoa.">Aparecem os eventos dos últimos 60 dias (os concluídos primeiro) e os próximos, com quem esteve na escala.</EstadoVazio>
        </Cartao>
      ) : !pessoa ? (
        <Cartao espacamento="nenhum">
          <EstadoVazio titulo={preparada.pessoas.length ? "Escolha a pessoa." : "A escala deste evento ainda não tem pessoas."}>Só aparecem pessoas que estiveram na escala do evento.</EstadoVazio>
        </Cartao>
      ) : !corrigindo && pessoa.solicitacao ? (
        <Aviso
          tom="atencao"
          acao={
            <span className="flex gap-2">
              {pessoa.solicitacao.auditoria === "REPROVADO" && escrita.liberada && (
                <BotaoLink variante="texto" href={`/custos/nova?protocolo=${pessoa.solicitacao.protocolo}`}>
                  Registrar correção
                </BotaoLink>
              )}
              <BotaoLink variante="texto" href={`/custos?protocolo=${pessoa.solicitacao.protocolo}&situacao=TODAS`}>
                Abrir solicitação
              </BotaoLink>
            </span>
          }
        >
          {pessoa.nome} já tem a solicitação {pessoa.solicitacao.protocolo} ({rotuloDaAuditoria(pessoa.solicitacao.auditoria).toLowerCase()}) para este evento. O sistema aceita uma por pessoa e evento.
        </Aviso>
      ) : escrita.liberada ? (
        <>
          <FaixaEmNomeDe nome={pessoa.nome} />
          {sugestoes.precoLitroCentavos === null && (
            <Aviso tom="atencao" className="mb-4">
              Não há preço do litro cadastrado{evento.uf ? ` para ${evento.uf}` : ""}. Informe o valor ou cadastre em Configurações › Regras de custo.
            </Aviso>
          )}
          <FormularioDeSolicitacao
            acao={corrigindo ? corrigirSolicitacaoAcao : registrarSolicitacaoAcao}
            calcularPrevia={calcularPreviaAcao}
            eventoId={evento.id}
            pessoaId={pessoa.pessoaId}
            correcao={paraCorrigir ? { solicitacaoId: paraCorrigir.id, atualizadoEm: paraCorrigir.atualizadoEm } : null}
            categorias={categorias}
            linhaNova={linhaNova}
            deslocamentosIniciais={
              paraCorrigir
                ? paraCorrigir.deslocamentos.map((linha) => ({
                    origem: linha.origem,
                    destino: linha.destino,
                    idaVolta: linha.idaVolta,
                    km: decimal(linha.km),
                    consumoKmL: decimal(linha.consumoKmL),
                    precoLitroCentavos: paraCampoDeDinheiro(linha.precoLitroCentavos),
                    pedagioCentavos: paraCampoDeDinheiro(linha.idaVolta ? linha.pedagioCentavos / 2 : linha.pedagioCentavos),
                  }))
                : [linhaNova]
            }
            itensIniciais={
              paraCorrigir
                ? paraCorrigir.itens.map((item) => ({
                    categoria: item.categoria,
                    regraCustoId: item.regraCustoId ?? "",
                    descricao: item.descricao,
                    quantidade: decimal(item.quantidade),
                    valorCentavos: paraCampoDeDinheiro(item.valorCentavos),
                  }))
                : sugestoes.itens.map((item) => ({
                    categoria: item.categoria,
                    regraCustoId: item.regraCustoId,
                    descricao: item.descricao,
                    quantidade: decimal(item.quantidade),
                    valorCentavos: paraCampoDeDinheiro(item.valorCentavos),
                  }))
            }
          />
        </>
      ) : null}
    </>
  );
}
