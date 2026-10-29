import type { Metadata } from "next";

import { permissoesDoAtor } from "@/app/(time)/_servidor/usuario-atual";
import { situacaoDaEscrita } from "@/fluxos/_base";
import { listarRegrasDeCusto, type RegraNaTela } from "@/fluxos/custos";
import { descricaoDosParametros, type RegraDeCusto, rotuloDaCategoriaDaRegra, rotuloDaUnidade } from "@/modules/custos";
import { FormularioDeAcao } from "@/app/(time)/_componentes/ui";

import { FaixaSomenteLeitura } from "../../_componentes/ui/aviso";
import { FaixaSemPermissao } from "../../_componentes/ui/permissao";
import { BotaoDeEnvio } from "../../_componentes/ui/botao";
import { Cartao } from "../../_componentes/ui/cartao";
import { TITULO_DE_CARTAO } from "../../_componentes/ui/classes";
import { EstadoVazio } from "../../_componentes/ui/estados";
import { dataCompleta, dinheiro } from "../../_componentes/ui/formatos";
import { Chip } from "../../_componentes/ui/situacao";
import { CabecaDaTabela, CelulaDaTabela, ColunaDaTabela, LinhaDaTabela, Tabela } from "../../_componentes/ui/tabela";
import { paraCampoDeDinheiro } from "../../logistica/_componentes/situacoes";
import { criarVigenciaDeRegraAcao, desativarRegraAcao } from "./acoes";
import { type CamposDaRegra, EditarRegra } from "./_componentes/editar-regra";
import { exigirAtor } from "@/app/(time)/_servidor/usuario-atual";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Regras de custo" };

const numero = (valor: unknown) => (typeof valor === "number" ? valor.toLocaleString("pt-BR", { maximumFractionDigits: 2 }) : "");

function camposDaRegra(regra: RegraDeCusto): CamposDaRegra {
  const p = regra.parametros;
  return {
    valor: regra.categoria === "LIMITE" ? null : paraCampoDeDinheiro(regra.valorCentavos ?? 0),
    faixa: regra.categoria === "DEPRECIACAO" ? { kmMin: numero(p.km_min), kmMax: numero(p.km_max) } : null,
    limite:
      regra.categoria === "LIMITE"
        ? { kmLMin: numero(p.km_l_min), kmLMax: p.km_l_max === undefined ? null : numero(p.km_l_max), custoKmMax: typeof p.custo_km_max_centavos === "number" ? paraCampoDeDinheiro(p.custo_km_max_centavos) : "" }
        : null,
  };
}

function valorDaRegra(regra: RegraDeCusto): string {
  return regra.valorCentavos === null ? "—" : dinheiro(regra.valorCentavos);
}

function hojeEmSaoPaulo(agora: Date): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo", year: "numeric", month: "2-digit", day: "2-digit" }).format(agora);
}

function LinhaDaRegra({ regra, escrita, hoje }: { regra: RegraNaTela; escrita: boolean; hoje: string }) {
  const { atual } = regra;
  const parametros = descricaoDosParametros(atual);
  return (
    <LinhaDaTabela>
      <CelulaDaTabela cabecalhoDaLinha>
        {atual.nome}
        {parametros && <span className="block text-[12px] font-normal text-[var(--ds-label-2)]">{parametros}</span>}
      </CelulaDaTabela>
      <CelulaDaTabela>{atual.tipoEventoNome ?? "Todos"}</CelulaDaTabela>
      <CelulaDaTabela>{atual.uf ?? "Todas"}</CelulaDaTabela>
      <CelulaDaTabela>{rotuloDaUnidade(atual.unidade)}</CelulaDaTabela>
      <CelulaDaTabela numero className="whitespace-nowrap">
        {valorDaRegra(atual)}
      </CelulaDaTabela>
      <CelulaDaTabela>
        {dataCompleta(atual.vigenteDesde)}
        {regra.proxima && (
          <span className="block text-[12px] text-[var(--ds-label-2)]">
            {valorDaRegra(regra.proxima)} a partir de {dataCompleta(regra.proxima.vigenteDesde)}
          </span>
        )}
      </CelulaDaTabela>
      <CelulaDaTabela>
        {regra.valeHoje ? (
          <Chip tom="sucesso">Ativa</Chip>
        ) : (
          <Chip tom="neutro">{atual.vigenteDesde > hoje ? "Ainda não vale" : "Inativa"}</Chip>
        )}
      </CelulaDaTabela>
      <CelulaDaTabela className="text-right">
        {escrita && (
          <span className="inline-flex flex-wrap justify-end gap-1">
            <EditarRegra
              acao={criarVigenciaDeRegraAcao}
              regraId={atual.id}
              nome={[atual.nome, atual.tipoEventoNome].filter(Boolean).join(" · ")}
              hoje={hoje}
              campos={camposDaRegra(atual)}
              historico={regra.historico.map((vigencia) => ({
                vigenteDesde: vigencia.vigenteDesde,
                ativo: vigencia.ativo,
                texto: vigencia.categoria === "LIMITE" ? (descricaoDosParametros(vigencia) ?? "—") : valorDaRegra(vigencia),
              }))}
            />
            {regra.valeHoje && (
              <FormularioDeAcao acao={desativarRegraAcao} aria-label={`Desativar ${atual.nome}`}>
                <input type="hidden" name="regraId" value={atual.id} />
                <BotaoDeEnvio tamanho="pequeno" variante="texto">
                  Desativar
                </BotaoDeEnvio>
              </FormularioDeAcao>
            )}
          </span>
        )}
      </CelulaDaTabela>
    </LinhaDaTabela>
  );
}

export default async function PaginaRegrasDeCusto() {
  await exigirAtor();
  const agora = new Date();
  const hoje = hojeEmSaoPaulo(agora);
  const [categorias, escrita, permissoes] = await Promise.all([listarRegrasDeCusto(agora), situacaoDaEscrita(), permissoesDoAtor("config.regras_custo")]);
  const edita = escrita.liberada && permissoes["config.regras_custo"];
  return (
    <div className="flex flex-col gap-5">
      {!escrita.liberada ? <FaixaSomenteLeitura className="" /> : !edita && <FaixaSemPermissao permissao="config.regras_custo" className="" />}
      {categorias.map(({ categoria, regras }) => (
        <section key={categoria} aria-labelledby={`regras-${categoria}`}>
          <h3 id={`regras-${categoria}`} className={`${TITULO_DE_CARTAO} mb-2`}>
            {rotuloDaCategoriaDaRegra(categoria)}
          </h3>
          {regras.length === 0 ? (
            <Cartao espacamento="nenhum">
              <EstadoVazio titulo={`Nenhuma regra de ${rotuloDaCategoriaDaRegra(categoria).toLowerCase()}.`}>
                {categoria === "COMBUSTIVEL" ? "Sem preço do litro por UF: o valor é digitado em cada solicitação." : "Nada cadastrado nesta categoria."}
              </EstadoVazio>
            </Cartao>
          ) : (
            <Tabela legenda={`Regras de ${rotuloDaCategoriaDaRegra(categoria).toLowerCase()}`} larguraMinima="min-w-[880px] table-fixed">
              <CabecaDaTabela>
                <ColunaDaTabela>Nome</ColunaDaTabela>
                <ColunaDaTabela className="w-[130px]">Tipo de evento</ColunaDaTabela>
                <ColunaDaTabela className="w-[64px]">UF</ColunaDaTabela>
                <ColunaDaTabela className="w-[130px]">Unidade</ColunaDaTabela>
                <ColunaDaTabela numero className="w-[110px]">
                  Valor
                </ColunaDaTabela>
                <ColunaDaTabela className="w-[130px]">Vale desde</ColunaDaTabela>
                <ColunaDaTabela className="w-[120px]">Situação</ColunaDaTabela>
                <ColunaDaTabela className="w-[170px] text-right">
                  <span className="sr-only">Ações</span>
                </ColunaDaTabela>
              </CabecaDaTabela>
              <tbody>
                {regras.map((regra) => (
                  <LinhaDaRegra key={regra.atual.id} regra={regra} escrita={edita} hoje={hoje} />
                ))}
              </tbody>
            </Tabela>
          )}
        </section>
      ))}
    </div>
  );
}
