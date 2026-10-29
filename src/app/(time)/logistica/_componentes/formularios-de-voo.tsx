"use client";

import { Ban, PlaneTakeoff, Send } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { type AcaoDoFormulario, ErroDoFormulario, type ErrosDoCampo, useAcao } from "@/app/(time)/_componentes/ui";

import { Aviso } from "../../_componentes/ui/aviso";
import { Botao, BotaoDeEnvio } from "../../_componentes/ui/botao";
import { CampoDeSelecao, CampoDeTexto, CampoDeTextoLongo } from "../../_componentes/ui/campo";
import { Confirmacao } from "../../_componentes/ui/dialogo";

// Formulários do pedido de voo à SDC (doc 08 §10.1). As actions vêm da página (server actions).

const PREFERENCIAS = [
  { valor: "MANHA", rotulo: "Manhã" },
  { valor: "TARDE", rotulo: "Tarde" },
  { valor: "NOITE", rotulo: "Noite" },
  { valor: "QUALQUER", rotulo: "Qualquer horário" },
];

type Trajeto = "IDA_E_VOLTA" | "IDA" | "VOLTA";

export type TrechosIniciais = {
  origemIata: string;
  destinoIata: string;
  ida: { data: string; preferencia: string } | null;
  volta: { data: string; preferencia: string } | null;
};

/** Origem/destino uma vez só; a volta inverte. Gera os campos trechos[i].* que o schema espera. */
function CamposDosTrechos({ inicial, erros }: { inicial: TrechosIniciais; erros: ErrosDoCampo }) {
  const [trajeto, setTrajeto] = useState<Trajeto>(inicial.ida && inicial.volta ? "IDA_E_VOLTA" : inicial.volta ? "VOLTA" : inicial.ida ? "IDA" : "IDA_E_VOLTA");
  const [origem, setOrigem] = useState(inicial.origemIata);
  const [destino, setDestino] = useState(inicial.destinoIata);
  const sentidos = trajeto === "IDA_E_VOLTA" ? (["IDA", "VOLTA"] as const) : ([trajeto] as const);
  const erroDe = (campo: string) => sentidos.flatMap((_sentido, indice) => erros(`trechos.${indice}.${campo}`) ?? []).slice(0, 1);
  // Na volta, a origem do pedido é o destino do trecho.
  const erroDaOrigem = erroDe(trajeto === "VOLTA" ? "destinoIata" : "origemIata");
  const erroDoDestino = erroDe(trajeto === "VOLTA" ? "origemIata" : "destinoIata");
  const erroGeral = erros("trechos")?.[0];

  return (
    <fieldset className="mt-4">
      <legend className="mb-2 text-[13px] font-medium">Trecho</legend>
      <div className="mb-3 flex flex-wrap gap-4 text-[14px]">
        {(
          [
            ["IDA_E_VOLTA", "Ida e volta"],
            ["IDA", "Só ida"],
            ["VOLTA", "Só volta"],
          ] as const
        ).map(([valor, rotulo]) => (
          <label key={valor} className="flex min-h-6 items-center gap-2">
            <input type="radio" name="trajeto" checked={trajeto === valor} onChange={() => setTrajeto(valor)} className="h-[18px] w-[18px] accent-[var(--ds-brand)]" />
            {rotulo}
          </label>
        ))}
      </div>
      <div className="grid grid-cols-2 gap-3">
        <CampoDeTexto
          nome="origem"
          rotulo="Origem (aeroporto)"
          obrigatorio
          value={origem}
          onChange={(evento) => setOrigem(evento.target.value.toUpperCase())}
          maxLength={3}
          placeholder="POA"
          ajuda="Código de 3 letras, de onde a pessoa sai."
          erros={erroDaOrigem}
        />
        <CampoDeTexto
          nome="destinoDoEvento"
          rotulo="Destino (aeroporto)"
          obrigatorio
          value={destino}
          onChange={(evento) => setDestino(evento.target.value.toUpperCase())}
          maxLength={3}
          placeholder="MAO"
          ajuda="Aeroporto da cidade do evento."
          erros={erroDoDestino}
        />
      </div>
      {sentidos.map((sentido, indice) => {
        const valores = sentido === "IDA" ? inicial.ida : inicial.volta;
        return (
          <div key={sentido} className="mt-3 grid grid-cols-2 gap-3">
            <input type="hidden" name={`trechos[${indice}].sentido`} value={sentido} />
            <input type="hidden" name={`trechos[${indice}].origemIata`} value={sentido === "IDA" ? origem : destino} />
            <input type="hidden" name={`trechos[${indice}].destinoIata`} value={sentido === "IDA" ? destino : origem} />
            <CampoDeTexto
              nome={`trechos[${indice}].dataDesejada`}
              rotulo={sentido === "IDA" ? "Data da ida" : "Data da volta"}
              type="date"
              obrigatorio
              defaultValue={valores?.data}
              erros={erros(`trechos.${indice}.dataDesejada`)}
            />
            <CampoDeSelecao
              nome={`trechos[${indice}].preferenciaHorario`}
              rotulo={sentido === "IDA" ? "Horário da ida" : "Horário da volta"}
              opcoes={PREFERENCIAS}
              vazio="Sem preferência"
              defaultValue={valores?.preferencia ?? ""}
            />
          </div>
        );
      })}
      {erroGeral && (
        <p role="alert" className="mt-2 text-[12px] font-medium text-[var(--ds-red-deep)]">
          {erroGeral}
        </p>
      )}
    </fieldset>
  );
}

export type PassageiroSemPedido = { convocacaoId: string; rotulo: string; dataInicio: string; dataFim: string };

function diaAnterior(data: string): string {
  const dia = new Date(`${data}T12:00:00Z`);
  dia.setUTCDate(dia.getUTCDate() - 1);
  return dia.toISOString().slice(0, 10);
}

export function FormularioNovoPedido({
  acao,
  passageiros,
  convocacaoInicial,
  destino,
}: {
  acao: AcaoDoFormulario;
  passageiros: PassageiroSemPedido[];
  convocacaoInicial?: string;
  /** Tela para onde voltar com o painel do pedido aberto. */
  destino: string;
}) {
  const { despachar, erros, estado } = useAcao(acao);
  const [convocacaoId, setConvocacaoId] = useState(convocacaoInicial ?? passageiros[0]?.convocacaoId ?? "");
  const passageiro = passageiros.find((item) => item.convocacaoId === convocacaoId);

  if (passageiros.length === 0) {
    return (
      <Aviso tom="informacao">
        Ninguém sem pedido com deslocamento Avião. Para pedir o voo de alguém, mude o deslocamento da pessoa para Avião na escala do evento.
      </Aviso>
    );
  }

  return (
    <form action={despachar} aria-label="Novo pedido de voo">
      <ErroDoFormulario estado={estado} />
      <input type="hidden" name="destino" value={destino} />
      <CampoDeSelecao
        nome="convocacaoId"
        rotulo="Pessoa"
        obrigatorio
        value={convocacaoId}
        onChange={(evento) => setConvocacaoId(evento.target.value)}
        opcoes={passageiros.map((item) => ({ valor: item.convocacaoId, rotulo: item.rotulo }))}
        ajuda="Só aparecem pessoas escaladas com deslocamento Avião e sem pedido. Para as demais, mude o deslocamento para Avião na escala."
        erros={erros("convocacaoId")}
      />
      <CamposDosTrechos
        key={convocacaoId}
        erros={erros}
        inicial={{
          origemIata: "",
          destinoIata: "",
          ida: passageiro ? { data: diaAnterior(passageiro.dataInicio), preferencia: "" } : null,
          volta: passageiro ? { data: passageiro.dataFim, preferencia: "" } : null,
        }}
      />
      <CampoDeTextoLongo className="mt-4" nome="observacaoTime" rotulo="Observação para a SDC" maxLength={500} placeholder="Horário preferido, bagagem…" erros={erros("observacaoTime")} />
      <div className="mt-5 flex justify-end">
        <BotaoDeEnvio icone={<Send size={18} aria-hidden />} textoCarregando="Registrando…">
          Registrar pedido
        </BotaoDeEnvio>
      </div>
    </form>
  );
}

export function FormularioAlterarPedido({
  acao,
  pedidoId,
  atualizadoEm,
  inicial,
  observacaoTime,
  aoConcluirIrPara,
}: {
  acao: AcaoDoFormulario;
  pedidoId: string;
  atualizadoEm: string;
  inicial: TrechosIniciais;
  observacaoTime: string | null;
  aoConcluirIrPara: string;
}) {
  const router = useRouter();
  const { despachar, erros, estado } = useAcao(acao, () => router.push(aoConcluirIrPara, { scroll: false }));
  return (
    <form action={despachar} aria-label="Alterar pedido">
      <ErroDoFormulario estado={estado} />
      <input type="hidden" name="pedidoId" value={pedidoId} />
      <input type="hidden" name="atualizadoEm" value={atualizadoEm} />
      <Aviso tom="neutro">Se o voo já foi emitido, o pedido fica como &quot;Alterado pelo time&quot; até você registrar o novo voo informado pela SDC.</Aviso>
      <CamposDosTrechos inicial={inicial} erros={erros} />
      <CampoDeTextoLongo className="mt-4" nome="observacaoTime" rotulo="Observação para a SDC" maxLength={500} defaultValue={observacaoTime ?? ""} erros={erros("observacaoTime")} />
      <div className="mt-5 flex justify-end gap-2">
        <Botao onClick={() => router.push(aoConcluirIrPara, { scroll: false })}>Voltar</Botao>
        <BotaoDeEnvio textoCarregando="Salvando…">Salvar alteração</BotaoDeEnvio>
      </div>
    </form>
  );
}

export type TrechoParaRegistrar = { sentido: "IDA" | "VOLTA"; rotulo: string; partidaSugerida: string; companhia: string; numeroVoo: string; localizador: string; partidaEm: string; chegadaEm: string; cartaoEmbarqueUrl: string };

export function FormularioRegistrarVoo({
  acao,
  pedidoId,
  trechos,
  valorInicial,
  aoConcluirIrPara,
}: {
  acao: AcaoDoFormulario;
  pedidoId: string;
  trechos: TrechoParaRegistrar[];
  valorInicial: string;
  aoConcluirIrPara: string;
}) {
  const router = useRouter();
  const { despachar, erros, estado } = useAcao(acao, () => router.push(aoConcluirIrPara, { scroll: false }));
  return (
    <form action={despachar} aria-label="Registrar voo informado pela SDC">
      <ErroDoFormulario estado={estado} />
      <input type="hidden" name="pedidoId" value={pedidoId} />
      <Aviso tom="neutro" className="mb-4">
        Você está registrando o voo informado pela SDC. O registro fica marcado como feito pelo time.
      </Aviso>
      {trechos.map((trecho, indice) => (
        <fieldset key={trecho.sentido} className="mb-4 rounded-[var(--ds-radius-md)] border border-[var(--ds-separator)] p-4">
          <legend className="px-1 text-[13px] font-semibold">{trecho.rotulo}</legend>
          <input type="hidden" name={`trechos[${indice}].sentido`} value={trecho.sentido} />
          <div className="grid grid-cols-2 gap-3">
            <CampoDeTexto nome={`trechos[${indice}].companhia`} rotulo="Companhia" obrigatorio defaultValue={trecho.companhia} placeholder="Azul" erros={erros(`trechos.${indice}.companhia`)} />
            <CampoDeTexto nome={`trechos[${indice}].numeroVoo`} rotulo="Número do voo" obrigatorio defaultValue={trecho.numeroVoo} placeholder="AD4120" erros={erros(`trechos.${indice}.numeroVoo`)} />
            <CampoDeTexto nome={`trechos[${indice}].localizador`} rotulo="Localizador" obrigatorio defaultValue={trecho.localizador} placeholder="KXQ7PZ" erros={erros(`trechos.${indice}.localizador`)} />
            <div />
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
          <CampoDeTexto
            className="mt-3"
            nome={`trechos[${indice}].cartaoEmbarqueUrl`}
            rotulo="Link do cartão de embarque"
            type="url"
            defaultValue={trecho.cartaoEmbarqueUrl}
            placeholder="https://…"
            ajuda="Opcional. O envio do arquivo entra numa próxima rodada."
            erros={erros(`trechos.${indice}.cartaoEmbarqueUrl`)}
          />
        </fieldset>
      ))}
      <div className="grid grid-cols-2 gap-3">
        <CampoDeTexto nome="valorCentavos" rotulo="Valor (R$)" obrigatorio numerico inputMode="decimal" defaultValue={valorInicial} placeholder="980,00" erros={erros("valorCentavos")} />
      </div>
      <CampoDeTextoLongo className="mt-3" nome="observacaoSdc" rotulo="Observação da SDC" maxLength={500} erros={erros("observacaoSdc")} />
      <div className="mt-5 flex justify-end gap-2">
        <Botao onClick={() => router.push(aoConcluirIrPara, { scroll: false })}>Voltar</Botao>
        <BotaoDeEnvio icone={<PlaneTakeoff size={18} aria-hidden />} textoCarregando="Registrando…">
          Registrar voo
        </BotaoDeEnvio>
      </div>
    </form>
  );
}

export function BotaoCancelarPedido({ acao, pedidoId, referencia, aoConcluirIrPara }: { acao: AcaoDoFormulario; pedidoId: string; referencia: string; aoConcluirIrPara: string }) {
  const router = useRouter();
  const [aberto, setAberto] = useState(false);
  const { despachar, erros, pendente } = useAcao(acao, () => {
    setAberto(false);
    router.push(aoConcluirIrPara, { scroll: false });
  });
  return (
    <>
      <Botao variante="perigo" icone={<Ban size={18} aria-hidden />} onClick={() => setAberto(true)}>
        Cancelar pedido
      </Botao>
      <Confirmacao
        aberto={aberto}
        aoFechar={() => setAberto(false)}
        titulo={`Cancelar o pedido ${referencia}?`}
        descricao="Avise a SDC pelo canal de sempre. O voo some da copy da pessoa."
        rotuloConfirmar="Cancelar pedido"
        rotuloCancelar="Voltar"
        destrutiva
        carregando={pendente}
        acao={despachar}
      >
        <input type="hidden" name="pedidoId" value={pedidoId} />
        <CampoDeTextoLongo nome="motivo" rotulo="Motivo" obrigatorio maxLength={500} erros={erros("motivo")} />
      </Confirmacao>
    </>
  );
}
