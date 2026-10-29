import { Car } from "lucide-react";

import type { CaronasCarregadas } from "@/fluxos/logistica";
import { FormularioDeAcao } from "@/app/(time)/_componentes/ui";

import { FaixaSomenteLeitura } from "../../_componentes/ui/aviso";
import { BarraDeFiltros, SeletorDeFiltro } from "../../_componentes/ui/barra-de-filtros";
import { BotaoDeEnvio } from "../../_componentes/ui/botao";
import { BotaoLink } from "../../_componentes/ui/botao-link";
import { Cartao } from "../../_componentes/ui/cartao";
import { CAMPO, TITULO_DE_SECAO } from "../../_componentes/ui/classes";
import { EstadoVazio } from "../../_componentes/ui/estados";
import { dataCurta, distancia } from "../../_componentes/ui/formatos";
import { CabecaDaTabela, CelulaDaTabela, ColunaDaTabela, LinhaDaTabela, Tabela } from "../../_componentes/ui/tabela";
import { criarCaronaAcao, definirCaronaAcao, removerCaronaAcao, tirarDaCaronaAcao } from "../acoes";
import { BotaoNovoMotorista } from "./formularios-de-carona";

function Seletor({
  id,
  nome,
  rotulo,
  vazio,
  opcoes,
}: {
  id: string;
  nome: string;
  rotulo: string;
  vazio: string;
  opcoes: { valor: string; rotulo: string; desabilitada?: boolean }[];
}) {
  return (
    <>
      <label htmlFor={id} className="sr-only">
        {rotulo}
      </label>
      <select id={id} name={nome} required defaultValue="" className={`${CAMPO} h-8 w-auto max-w-[260px] pl-2 pr-7 text-[13px]`}>
        <option value="" disabled>
          {vazio}
        </option>
        {opcoes.map((opcao) => (
          <option key={opcao.valor} value={opcao.valor} disabled={opcao.desabilitada}>
            {opcao.rotulo}
          </option>
        ))}
      </select>
    </>
  );
}

/** Ação principal das Caronas: no cabeçalho da página (/logistica/caronas) ou no título da seção (aba do evento). */
export function NovoMotorista({ dados }: { dados: CaronasCarregadas }) {
  if (!dados.evento) return null;
  return (
    <BotaoNovoMotorista
      acao={criarCaronaAcao}
      eventoId={dados.evento.id}
      rotuloDoEvento={dados.evento.codigo ?? dados.evento.nome}
      candidatos={dados.candidatosAMotorista.map((pessoa) => ({ valor: pessoa.convocacaoId, rotulo: `${pessoa.nome} · ${pessoa.lugaresDoVeiculo} lugares` }))}
    />
  );
}

const km = (valor: number | null) => (valor === null ? "distância desconhecida" : distancia(valor));

export function SecaoDeCaronas({ dados, escrita, comSeletorDeEvento }: { dados: CaronasCarregadas; escrita: boolean; comSeletorDeEvento: boolean }) {
  const { evento } = dados;
  const motoristasComLugar = dados.caronas.map((carona) => ({
    valor: carona.id,
    rotulo: `${carona.motoristaNome} — ${carona.livres === 1 ? "1 lugar livre" : `${carona.livres} lugares livres`}`,
    desabilitada: carona.livres === 0,
  }));

  return (
    <section aria-labelledby="titulo-caronas" className="mb-8">
      {comSeletorDeEvento && (
        <BarraDeFiltros>
          <SeletorDeFiltro
            nome="evento"
            rotulo="Evento"
            todos="Próximo evento"
            valor={evento?.id ?? null}
            opcoes={dados.eventos.map((item) => ({ valor: item.id, rotulo: `${item.codigo ?? item.nome} · ${dataCurta(item.dataInicio)}` }))}
          />
        </BarraDeFiltros>
      )}
      <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
        <h2 id="titulo-caronas" className={TITULO_DE_SECAO}>
          Caronas
        </h2>
        {escrita && !comSeletorDeEvento && <NovoMotorista dados={dados} />}
      </div>
      {!escrita && comSeletorDeEvento && <FaixaSomenteLeitura />}

      {!evento ? (
        <Cartao espacamento="nenhum">
          <EstadoVazio icone={<Car size={32} aria-hidden />} titulo="Nenhum evento com equipe nos próximos dias." />
        </Cartao>
      ) : dados.caronas.length === 0 && dados.semCarona.length === 0 ? (
        <Cartao espacamento="nenhum">
          <EstadoVazio
            icone={<Car size={32} aria-hidden />}
            titulo="Ninguém com carona neste evento."
            acao={
              <BotaoLink variante="texto" href={`/eventos/${evento.id}/escala`}>
                Ir para a escala
              </BotaoLink>
            }
          >
            Quem vai de carona aparece aqui quando o deslocamento for marcado como Carona na escala. Para começar, escolha um motorista acima.
          </EstadoVazio>
        </Cartao>
      ) : null}

      {evento && dados.caronas.length > 0 && (
        <ul className="mb-4 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {dados.caronas.map((carona) => (
            <li key={carona.id}>
              <Cartao
                id={`carona-${carona.id}`}
                titulo={carona.motoristaNome}
                explicacao={
                  carona.lugares === null
                    ? "Sem veículo no cadastro"
                    : `${carona.lugares} lugares · ${carona.passageiros.length} ${carona.passageiros.length === 1 ? "ocupado" : "ocupados"} · ${km(carona.motoristaDistanciaKm)} até o evento`
                }
                acoes={
                  escrita && (
                    <FormularioDeAcao acao={removerCaronaAcao} aria-label={`Remover a carona de ${carona.motoristaNome}`}>
                      <input type="hidden" name="caronaId" value={carona.id} />
                      <BotaoDeEnvio tamanho="pequeno" variante="perigo">
                        Remover
                      </BotaoDeEnvio>
                    </FormularioDeAcao>
                  )
                }
              >
                {carona.passageiros.length === 0 ? (
                  <p className="text-[13px] text-[var(--ds-label-2)]">Sem passageiros.</p>
                ) : (
                  <ul className="flex flex-col gap-2 text-[14px]">
                    {carona.passageiros.map((passageiro) => (
                      <li key={passageiro.convocacaoId} className="flex items-center justify-between gap-2">
                        <span>
                          {passageiro.nome}
                          <span className="ml-1 text-[12px] text-[var(--ds-label-2)]">{km(passageiro.distanciaKm)}</span>
                        </span>
                        {escrita && (
                          <FormularioDeAcao acao={tirarDaCaronaAcao} aria-label={`Tirar ${passageiro.nome} da carona`}>
                            <input type="hidden" name="convocacaoId" value={passageiro.convocacaoId} />
                            <BotaoDeEnvio tamanho="pequeno" variante="texto">
                              Tirar da carona
                            </BotaoDeEnvio>
                          </FormularioDeAcao>
                        )}
                      </li>
                    ))}
                  </ul>
                )}
                {escrita && carona.livres > 0 && dados.candidatosAPassageiro.length > 0 && (
                  <FormularioDeAcao acao={definirCaronaAcao} className="mt-3 flex items-center gap-1" aria-label={`Adicionar passageiro na carona de ${carona.motoristaNome}`}>
                    <input type="hidden" name="caronaId" value={carona.id} />
                    <Seletor
                      id={`passageiro-${carona.id}`}
                      nome="convocacaoId"
                      rotulo={`Adicionar passageiro na carona de ${carona.motoristaNome}`}
                      vazio="Adicionar passageiro…"
                      opcoes={dados.candidatosAPassageiro.map((pessoa) => ({ valor: pessoa.convocacaoId, rotulo: `${pessoa.nome} · ${km(pessoa.distanciaKm)}` }))}
                    />
                    <BotaoDeEnvio tamanho="pequeno" variante="secundario">
                      Adicionar
                    </BotaoDeEnvio>
                  </FormularioDeAcao>
                )}
              </Cartao>
            </li>
          ))}
        </ul>
      )}

      {evento && dados.semCarona.length > 0 && (
        <Tabela legenda="Pessoas com deslocamento Carona e sem motorista" larguraMinima="min-w-[640px]">
          <CabecaDaTabela>
            <ColunaDaTabela>Sem carona definida</ColunaDaTabela>
            <ColunaDaTabela numero>Distância até o evento</ColunaDaTabela>
            <ColunaDaTabela className="text-right">Escolher carona</ColunaDaTabela>
          </CabecaDaTabela>
          <tbody>
            {dados.semCarona.map((pessoa) => (
              <LinhaDaTabela key={pessoa.convocacaoId}>
                <CelulaDaTabela cabecalhoDaLinha>{pessoa.nome}</CelulaDaTabela>
                <CelulaDaTabela numero className="whitespace-nowrap">
                  {pessoa.distanciaKm === null ? "—" : distancia(pessoa.distanciaKm)}
                </CelulaDaTabela>
                <CelulaDaTabela className="text-right">
                  {escrita && motoristasComLugar.length > 0 ? (
                    <FormularioDeAcao acao={definirCaronaAcao} className="inline-flex items-center gap-1" aria-label={`Escolher carona para ${pessoa.nome}`}>
                      <input type="hidden" name="convocacaoId" value={pessoa.convocacaoId} />
                      <Seletor id={`carona-de-${pessoa.convocacaoId}`} nome="caronaId" rotulo={`Escolher carona para ${pessoa.nome}`} vazio="Escolher carona…" opcoes={motoristasComLugar} />
                      <BotaoDeEnvio tamanho="pequeno" variante="secundario">
                        Definir
                      </BotaoDeEnvio>
                    </FormularioDeAcao>
                  ) : (
                    <span className="text-[13px] text-[var(--ds-label-2)]">Sem motorista com lugar</span>
                  )}
                </CelulaDaTabela>
              </LinhaDaTabela>
            ))}
          </tbody>
        </Tabela>
      )}
    </section>
  );
}
