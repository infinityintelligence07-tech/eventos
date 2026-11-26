import { Car } from "lucide-react";
import Link from "next/link";

import type { CaronasCarregadas } from "@/fluxos/logistica";
import { FormularioDeAcao } from "@/app/(time)/_componentes/ui";

import { Aviso } from "../../_componentes/ui/aviso";
import { BotaoDeEnvio } from "../../_componentes/ui/botao";
import { Cartao } from "../../_componentes/ui/cartao";
import { TITULO_DE_SECAO } from "../../_componentes/ui/classes";
import { EstadoVazio } from "../../_componentes/ui/estados";
import { distancia } from "../../_componentes/ui/formatos";
import { Seletor } from "../../_componentes/ui/seletor";
import type { OpcaoDoSeletor } from "../../_componentes/ui/seletor-logica";
import { criarCaronaAcao, definirCaronaAcao, removerCaronaAcao, tirarDaCaronaAcao } from "../acoes";
import { BotaoNovoMotorista } from "./formularios-de-carona";

/** Motorista ou passageiro: lista de pessoas, sempre com busca. Sem escolha, o navegador segura o envio. */
function SeletorDePessoa({ id, nome, rotulo, vazio, opcoes }: { id: string; nome: string; rotulo: string; vazio: string; opcoes: OpcaoDoSeletor[] }) {
  return (
    <>
      <label htmlFor={id} className="sr-only">
        {rotulo}
      </label>
      <Seletor id={id} nome={nome} rotulo={rotulo} marcador={vazio} opcoes={opcoes} busca obrigatorio tamanho="pequeno" className="w-auto min-w-[160px] max-w-[260px]" />
    </>
  );
}

/** Ação principal das Caronas, no título da seção (na escala do evento). */
function NovoMotorista({ dados }: { dados: CaronasCarregadas }) {
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

/**
 * Caronas de um evento: ficam na escala do evento (/eventos/[id]/escala), logo abaixo da equipe.
 * Parte de quem está com o deslocamento "Carona" na escala; o motorista é alguém da escala com veículo no cadastro.
 */
export function SecaoDeCaronas({ dados, escrita }: { dados: CaronasCarregadas; escrita: boolean }) {
  const { evento } = dados;
  const motoristasComLugar = dados.caronas.map((carona) => ({
    valor: carona.id,
    // A opção diz quem já vai no carro: escolher o motorista é escolher com quem a pessoa vai.
    rotulo: [
      `${carona.motoristaNome} — ${carona.livres === 1 ? "1 lugar livre" : `${carona.livres} lugares livres`}`,
      carona.passageiros.length > 0 ? `com ${carona.passageiros.map((passageiro) => passageiro.nome.trim().split(/\s+/)[0]).join(", ")}` : null,
    ]
      .filter(Boolean)
      .join(" · "),
    desabilitada: carona.livres === 0,
  }));

  return (
    <section aria-labelledby="titulo-caronas" className="mb-8">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
        <h2 id="titulo-caronas" className={TITULO_DE_SECAO}>
          Caronas
        </h2>
        {escrita && <NovoMotorista dados={dados} />}
      </div>

      {!evento && (
        <Cartao espacamento="nenhum">
          <EstadoVazio icone={<Car size={32} aria-hidden />} titulo="Nenhum evento com equipe nos próximos dias." />
        </Cartao>
      )}

      {/* De onde a seção parte: quem o time marcou como Carona na escala, e quantos já têm motorista. */}
      {evento && (
        <Aviso
          tom={dados.marcadasComoCarona === 0 ? "informacao" : dados.semCarona.length > 0 ? "atencao" : "sucesso"}
          className="mb-4"
          titulo={
            dados.marcadasComoCarona === 0
              ? `Ninguém marcado como Carona na escala de ${evento.codigo ?? evento.nome}`
              : `${dados.marcadasComoCarona === 1 ? "1 pessoa marcada" : `${dados.marcadasComoCarona} pessoas marcadas`} como Carona na escala de ${evento.codigo ?? evento.nome}`
          }
          acao={
            <Link href={`/eventos/${evento.id}/escala#equipe`} className="font-medium text-[var(--ds-tint-text)] hover:underline">
              {dados.marcadasComoCarona === 0 ? "Marcar na equipe" : "Ver a equipe"}
            </Link>
          }
        >
          <p>
            {dados.marcadasComoCarona === 0
              ? "Quem vai de carona aparece aqui quando o deslocamento for marcado como Carona na equipe, logo acima. O motorista é alguém da escala com veículo no cadastro."
              : dados.semCarona.length === 0
                ? "Todo mundo que vai de carona tem motorista. Em cada carro abaixo dá para ver quem vai com quem."
                : `${dados.marcadasComoCarona - dados.semCarona.length} com motorista e ${dados.semCarona.length} sem carona. Escolha o motorista de cada pessoa para definir quem vai com quem.`}
          </p>
        </Aviso>
      )}

      {evento && dados.semCarona.length > 0 && (
        <Cartao
          id="sem-carona"
          titulo={`Sem carona · ${dados.semCarona.length}`}
          explicacao={`Marcadas como Carona na escala de ${evento.codigo ?? evento.nome} que ainda não têm motorista, da mais perto do evento para a mais longe.`}
          className="mb-4"
        >
          {motoristasComLugar.every((motorista) => motorista.desabilitada) && (
            <p className="mb-3 text-[13px] text-[var(--ds-label-2)]">
              {dados.caronas.length === 0 ? "Escolha um motorista em \"Novo motorista\" para começar a distribuir." : "Os carros estão cheios: escolha mais um motorista em \"Novo motorista\"."}
            </p>
          )}
          <ul className="flex flex-col gap-2 text-[14px]">
            {dados.semCarona.map((pessoa) => (
              <li key={pessoa.convocacaoId} className="flex flex-wrap items-center justify-between gap-2">
                <span>
                  {pessoa.nome}
                  <span className="ml-1 text-[12px] text-[var(--ds-label-2)]">{[pessoa.funcao, `${km(pessoa.distanciaKm)} até o evento`].filter(Boolean).join(" · ")}</span>
                </span>
                {escrita && motoristasComLugar.length > 0 && (
                  <FormularioDeAcao acao={definirCaronaAcao} className="inline-flex items-center gap-1" aria-label={`Escolher carona para ${pessoa.nome}`}>
                    <input type="hidden" name="convocacaoId" value={pessoa.convocacaoId} />
                    <SeletorDePessoa id={`carona-de-${pessoa.convocacaoId}`} nome="caronaId" rotulo={`Escolher carona para ${pessoa.nome}`} vazio="Escolher carona…" opcoes={motoristasComLugar} />
                    <BotaoDeEnvio tamanho="pequeno" variante="secundario">
                      Definir
                    </BotaoDeEnvio>
                  </FormularioDeAcao>
                )}
              </li>
            ))}
          </ul>
        </Cartao>
      )}

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
                    <SeletorDePessoa
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
    </section>
  );
}
