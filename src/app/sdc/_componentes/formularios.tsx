"use client";

import { useState } from "react";

import { type AcaoDoFormulario, ErroDoFormulario, useAcao } from "@/app/(time)/_componentes/ui";
import { Aviso } from "@/app/(time)/_componentes/ui/aviso";
import { Botao } from "@/app/(time)/_componentes/ui/botao";
import { CampoDeSelecao, CampoDeTexto, CampoDeTextoLongo, type OpcaoDoCampo } from "@/app/(time)/_componentes/ui/campo";
import { PainelLateral } from "@/app/(time)/_componentes/ui/dialogo";

// Formulários da área da SDC: registrar (ou corrigir) a compra de um pedido. O pedido vai pela referência (SDC-…).
// As actions vêm da página e conferem no servidor que quem envia é um ator SDC ativo.

export type TrechoDaCompra = {
  sentido: "IDA" | "VOLTA";
  /** "Ida: VCP → POA em 14/12 (manhã)". */
  rotulo: string;
  partidaSugerida: string;
  /** Uma das companhias da lista, "OUTRA" ou vazio (ainda não informada). */
  companhia: string;
  outraCompanhia: string;
  numeroVoo: string;
  localizador: string;
  partidaEm: string;
  chegadaEm: string;
};

/** Valor da opção "Outra" (o mesmo do schema da SDC). */
const OUTRA = "OUTRA";

/** Companhia de uma lista curta; "Outra" abre o campo para escrever o nome. */
function CampoDaCompanhia({ indice, trecho, companhias, erros }: { indice: number; trecho: TrechoDaCompra; companhias: OpcaoDoCampo[]; erros: (campo: string) => string[] | undefined }) {
  const [escolhida, setEscolhida] = useState(trecho.companhia);
  return (
    <>
      <CampoDeSelecao
        nome={`trechos[${indice}].companhia`}
        rotulo="Companhia"
        obrigatorio
        vazio="Escolha…"
        opcoes={companhias}
        value={escolhida}
        onChange={(evento) => setEscolhida(evento.target.value)}
        erros={erros(`trechos.${indice}.companhia`)}
      />
      {escolhida === OUTRA && (
        <CampoDeTexto
          nome={`trechos[${indice}].outraCompanhia`}
          rotulo="Nome da companhia"
          obrigatorio
          maxLength={40}
          defaultValue={trecho.outraCompanhia}
          erros={erros(`trechos.${indice}.outraCompanhia`)}
        />
      )}
    </>
  );
}

/** Compra do voo: companhia, número do voo, código da reserva e horários de cada trecho, mais o valor. */
export function BotaoRegistrarCompraDeVoo({
  acao,
  referencia,
  passageiro,
  trechos,
  valor,
  observacao,
  corrigindo,
  companhias,
}: {
  acao: AcaoDoFormulario;
  referencia: string;
  passageiro: string;
  companhias: OpcaoDoCampo[];
  trechos: TrechoDaCompra[];
  valor: string;
  observacao: string;
  corrigindo: boolean;
}) {
  const [aberto, setAberto] = useState(false);
  const { enviar, erros, estado, pendente } = useAcao(acao, () => setAberto(false));
  const titulo = corrigindo ? "Corrigir compra" : "Registrar compra";
  return (
    <>
      <Botao variante={corrigindo ? "secundario" : "primario"} tamanho="pequeno" onClick={() => setAberto(true)}>
        {titulo}
      </Botao>
      <PainelLateral aberto={aberto} aoFechar={() => setAberto(false)} titulo={`${titulo} · ${referencia}`} subtitulo={passageiro}>
        <form onSubmit={enviar} aria-label={`${titulo} do pedido ${referencia}`}>
          <ErroDoFormulario estado={estado} />
          <input type="hidden" name="referencia" value={referencia} />
          {trechos.map((trecho, indice) => (
            <fieldset key={trecho.sentido} className="mb-4 rounded-[var(--ds-radius-md)] border border-[var(--ds-separator)] p-4">
              <legend className="px-1 text-[13px] font-semibold">{trecho.rotulo}</legend>
              <input type="hidden" name={`trechos[${indice}].sentido`} value={trecho.sentido} />
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <CampoDaCompanhia indice={indice} trecho={trecho} companhias={companhias} erros={erros} />
                <CampoDeTexto nome={`trechos[${indice}].numeroVoo`} rotulo="Número do voo" obrigatorio defaultValue={trecho.numeroVoo} placeholder="AD4120" erros={erros(`trechos.${indice}.numeroVoo`)} />
                <CampoDeTexto
                  className="sm:col-span-2"
                  nome={`trechos[${indice}].localizador`}
                  rotulo="Código da reserva (localizador)"
                  obrigatorio
                  defaultValue={trecho.localizador}
                  placeholder="KXQ7PZ"
                  erros={erros(`trechos.${indice}.localizador`)}
                />
                <CampoDeTexto
                  nome={`trechos[${indice}].partidaEm`}
                  rotulo="Partida"
                  type="datetime-local"
                  obrigatorio
                  defaultValue={trecho.partidaEm || trecho.partidaSugerida}
                  erros={erros(`trechos.${indice}.partidaEm`)}
                />
                <CampoDeTexto
                  nome={`trechos[${indice}].chegadaEm`}
                  rotulo="Chegada"
                  type="datetime-local"
                  obrigatorio
                  defaultValue={trecho.chegadaEm || trecho.partidaSugerida}
                  erros={erros(`trechos.${indice}.chegadaEm`)}
                />
              </div>
            </fieldset>
          ))}
          <CampoDeTexto nome="valorCentavos" rotulo="Valor total da compra (R$)" obrigatorio numerico inputMode="decimal" defaultValue={valor} placeholder="980,00" erros={erros("valorCentavos")} />
          <CampoDeTextoLongo className="mt-3" nome="observacaoSdc" rotulo="Observação para o time (opcional)" maxLength={500} defaultValue={observacao} erros={erros("observacaoSdc")} />
          <Aviso tom="neutro" className="mt-4">
            Depois de registrar, o time de eventos confere e aprova o pagamento. Dá para corrigir enquanto ele não aprovar.
          </Aviso>
          <div className="mt-5 flex justify-end gap-2">
            <Botao onClick={() => setAberto(false)}>Cancelar</Botao>
            <Botao type="submit" variante="primario" carregando={pendente} textoCarregando="Registrando…">
              {titulo}
            </Botao>
          </div>
        </form>
      </PainelLateral>
    </>
  );
}

export type HotelDaReserva = { nome: string; cidade: string; uf: string; logradouro: string; numero: string; bairro: string };

/** Reserva da hospedagem: qual hotel, número da reserva, valor total e forma de pagamento. */
export function BotaoRegistrarReserva({
  acao,
  referencia,
  evento,
  hotel,
  numeroReserva,
  valor,
  formaPagamento,
  observacao,
  corrigindo,
}: {
  acao: AcaoDoFormulario;
  referencia: string;
  evento: string;
  hotel: HotelDaReserva;
  numeroReserva: string;
  valor: string;
  formaPagamento: string;
  observacao: string;
  corrigindo: boolean;
}) {
  const [aberto, setAberto] = useState(false);
  const { enviar, erros, estado, pendente } = useAcao(acao, () => setAberto(false));
  const titulo = corrigindo ? "Corrigir reserva" : "Registrar reserva";
  return (
    <>
      <Botao variante={corrigindo ? "secundario" : "primario"} tamanho="pequeno" onClick={() => setAberto(true)}>
        {titulo}
      </Botao>
      <PainelLateral aberto={aberto} aoFechar={() => setAberto(false)} titulo={`${titulo} · ${referencia}`} subtitulo={evento}>
        <form onSubmit={enviar} aria-label={`${titulo} do pedido ${referencia}`}>
          <ErroDoFormulario estado={estado} />
          <input type="hidden" name="referencia" value={referencia} />
          <fieldset className="mb-4 rounded-[var(--ds-radius-md)] border border-[var(--ds-separator)] p-4">
            <legend className="px-1 text-[13px] font-semibold">Hotel reservado</legend>
            <CampoDeTexto nome="hotel.nome" rotulo="Nome do hotel" obrigatorio maxLength={120} defaultValue={hotel.nome} erros={erros("hotel.nome")} />
            <div className="mt-3 grid grid-cols-[1fr_96px] gap-3">
              <CampoDeTexto nome="hotel.cidade" rotulo="Cidade" obrigatorio maxLength={80} defaultValue={hotel.cidade} erros={erros("hotel.cidade")} />
              <CampoDeTexto nome="hotel.uf" rotulo="UF" obrigatorio maxLength={2} defaultValue={hotel.uf} erros={erros("hotel.uf")} />
            </div>
            <div className="mt-3 grid grid-cols-[1fr_96px] gap-3">
              <CampoDeTexto nome="hotel.logradouro" rotulo="Rua (opcional)" maxLength={160} defaultValue={hotel.logradouro} erros={erros("hotel.logradouro")} />
              <CampoDeTexto nome="hotel.numero" rotulo="Número" maxLength={20} defaultValue={hotel.numero} erros={erros("hotel.numero")} />
            </div>
            <CampoDeTexto className="mt-3" nome="hotel.bairro" rotulo="Bairro (opcional)" maxLength={80} defaultValue={hotel.bairro} erros={erros("hotel.bairro")} />
          </fieldset>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <CampoDeTexto nome="numeroReserva" rotulo="Número da reserva" obrigatorio maxLength={60} defaultValue={numeroReserva} erros={erros("numeroReserva")} />
            <CampoDeTexto nome="valorCentavos" rotulo="Valor total (R$)" obrigatorio numerico inputMode="decimal" defaultValue={valor} placeholder="2.400,00" erros={erros("valorCentavos")} />
          </div>
          <CampoDeTexto className="mt-3" nome="formaPagamento" rotulo="Forma de pagamento" obrigatorio maxLength={60} defaultValue={formaPagamento} erros={erros("formaPagamento")} />
          <CampoDeTextoLongo className="mt-3" nome="observacaoSdc" rotulo="Observação para o time (opcional)" maxLength={500} defaultValue={observacao} erros={erros("observacaoSdc")} />
          <Aviso tom="neutro" className="mt-4">
            Depois de registrar, o time de eventos confere e aprova o pagamento. Dá para corrigir enquanto ele não aprovar.
          </Aviso>
          <div className="mt-5 flex justify-end gap-2">
            <Botao onClick={() => setAberto(false)}>Cancelar</Botao>
            <Botao type="submit" variante="primario" carregando={pendente} textoCarregando="Registrando…">
              {titulo}
            </Botao>
          </div>
        </form>
      </PainelLateral>
    </>
  );
}
