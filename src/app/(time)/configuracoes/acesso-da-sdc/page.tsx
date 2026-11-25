import type { Metadata } from "next";

import { CabecaDaTabela, CelulaDaTabela, Chip, ColunaDaTabela, FaixaSemPermissao, FaixaSomenteLeitura, FormularioDeAcao, formatar, LinhaDaTabela, Tabela } from "@/app/(time)/_componentes/ui";
import { BotaoDeEnvio } from "@/app/(time)/_componentes/ui/botao";
import { Cartao } from "@/app/(time)/_componentes/ui/cartao";
import { EstadoVazio } from "@/app/(time)/_componentes/ui/estados";
import { exigirAtor, permissoesDoAtor } from "@/app/(time)/_servidor/usuario-atual";
import { listarAcessoDaSdc } from "@/fluxos/sdc";

import { FormularioDeInclusao } from "./_componentes/formulario-de-inclusao";
import { definirAcessoDaSdcAcao, incluirAcessoDaSdcAcao } from "./acoes";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Acesso da SDC" };

/** Quem da SDC (a agência de fora que compra passagem e hotel) entra no sistema. Só a líder altera. */
export default async function PaginaAcessoDaSdc() {
  await exigirAtor();
  const [{ acessos, escritaLiberada }, permissoes] = await Promise.all([listarAcessoDaSdc(), permissoesDoAtor("config.acesso_da_sdc")]);
  const edita = escritaLiberada && permissoes["config.acesso_da_sdc"];

  return (
    <>
      {!escritaLiberada ? <FaixaSomenteLeitura /> : !edita && <FaixaSemPermissao permissao="config.acesso_da_sdc" />}

      <section aria-labelledby="quem-da-sdc" className="mb-6">
        <h2 id="quem-da-sdc" className="mb-1 text-[17px] font-semibold tracking-[-0.01em]">
          Quem da SDC entra no sistema
        </h2>
        <p className="mb-3 text-[13px] text-[var(--ds-label-2)]">
          A SDC é de fora da empresa: entra com o Google e só vê a área dela, com os pedidos de voo e de hospedagem, onde registra a compra e o valor. Não vê escala, custos, pessoas nem
          nenhuma outra tela. Desativar corta o acesso na hora.
        </p>
        {acessos.length === 0 ? (
          <Cartao espacamento="nenhum">
            <EstadoVazio titulo="Ninguém da SDC tem acesso ainda.">{edita ? "Inclua abaixo o e-mail de quem cuida dos pedidos na agência." : "A líder inclui os e-mails da agência."}</EstadoVazio>
          </Cartao>
        ) : (
          <Tabela legenda="Pessoas da SDC com acesso à área de voos e hospedagem" larguraMinima="min-w-[640px]">
            <CabecaDaTabela>
              <ColunaDaTabela>Pessoa</ColunaDaTabela>
              <ColunaDaTabela>E-mail</ColunaDaTabela>
              <ColunaDaTabela>Acesso</ColunaDaTabela>
              <ColunaDaTabela>Incluída em</ColunaDaTabela>
              {edita && <ColunaDaTabela className="text-right">Mudar</ColunaDaTabela>}
            </CabecaDaTabela>
            <tbody>
              {acessos.map((acesso) => (
                <LinhaDaTabela key={acesso.id}>
                  <CelulaDaTabela cabecalhoDaLinha>{acesso.nome}</CelulaDaTabela>
                  <CelulaDaTabela>{acesso.email}</CelulaDaTabela>
                  <CelulaDaTabela>{acesso.ativo ? <Chip tom="sucesso">Ativo</Chip> : <Chip tom="neutro">Desativado: não entra</Chip>}</CelulaDaTabela>
                  <CelulaDaTabela className="whitespace-nowrap tabular-nums">{formatar.dataCompleta(new Date(acesso.criadoEm))}</CelulaDaTabela>
                  {edita && (
                    <CelulaDaTabela className="text-right">
                      <FormularioDeAcao acao={definirAcessoDaSdcAcao} className="inline-flex" aria-label={`${acesso.ativo ? "Desativar" : "Reativar"} o acesso de ${acesso.nome}`}>
                        <input type="hidden" name="acessoSdcId" value={acesso.id} />
                        <input type="hidden" name="ativo" value={acesso.ativo ? "false" : "true"} />
                        <BotaoDeEnvio tamanho="pequeno" variante={acesso.ativo ? "perigo" : "secundario"} textoCarregando="Salvando…">
                          {acesso.ativo ? "Desativar" : "Reativar"}
                        </BotaoDeEnvio>
                      </FormularioDeAcao>
                    </CelulaDaTabela>
                  )}
                </LinhaDaTabela>
              ))}
            </tbody>
          </Tabela>
        )}
      </section>

      {edita && (
        <Cartao
          id="incluir"
          titulo="Incluir alguém da SDC"
          explicacao="A pessoa não precisa de cadastro na IAM: basta o e-mail da conta Google dela. O e-mail não muda depois; para trocar, desative este e inclua o novo."
        >
          <FormularioDeInclusao acao={incluirAcessoDaSdcAcao} />
        </Cartao>
      )}
    </>
  );
}
