"use client";

import { Ban, BadgeCheck, PlaneTakeoff, Send } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { type AcaoDoFormulario, ErroDoFormulario, type ErrosDoCampo, useAcao } from "@/app/(time)/_componentes/ui";

import { Aviso } from "../../_componentes/ui/aviso";
import { Botao, BotaoDeEnvio } from "../../_componentes/ui/botao";
import { CaixaDeMarcar, CampoDeSelecao, CampoDeTexto, CampoDeTextoLongo } from "../../_componentes/ui/campo";
import { Confirmacao } from "../../_componentes/ui/dialogo";

// Formulários do pedido de voo à SDC (doc 08 §10.1): nós solicitamos, a SDC compra e o time registra o retorno.
// As actions vêm da página (server actions).

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

/** `masterclass`: palestra (o "Novo pedido" separa Eventos de Masterclass antes de escolher, como a planilha). */
export type EventoDoPedido = { id: string; rotulo: string; dataInicio: string; dataFim: string; masterclass: boolean };

const TIPOS_DE_VIAGEM = [
  { valor: "EVENTOS", rotulo: "Evento" },
  { valor: "MASTERCLASS", rotulo: "Masterclass (palestras)" },
];
export type PedidoAtivoDaPessoa = { eventoId: string; pessoaId: string; referencia: string; trajeto: string | null };

function diaAnterior(data: string): string {
  const dia = new Date(`${data}T12:00:00Z`);
  dia.setUTCDate(dia.getUTCDate() - 1);
  return dia.toISOString().slice(0, 10);
}

/**
 * Novo pedido de voo, como uma linha da planilha: evento + pessoa do staff + trecho. Não depende da escala. Se a
 * pessoa já tem pedido ativo no evento, o formulário avisa e pede a confirmação de que é outra compra.
 */
export function FormularioNovoPedido({
  acao,
  eventos,
  pessoas,
  pedidosAtivos,
  eventoInicial,
  eventoFixo,
  pessoaInicial,
  destino,
  recorteInicial,
  hoje,
}: {
  acao: AcaoDoFormulario;
  eventos: EventoDoPedido[];
  pessoas: { pessoaId: string; nome: string }[];
  pedidosAtivos: PedidoAtivoDaPessoa[];
  eventoInicial?: string;
  /** Na aba Logística do evento o pedido é sempre daquele evento. */
  eventoFixo: boolean;
  pessoaInicial?: string;
  /** Tela para onde voltar com o painel do pedido aberto. */
  destino: string;
  /** O recorte em vigor na tela (Eventos ou Masterclass): o formulário começa nele. */
  recorteInicial: "EVENTOS" | "MASTERCLASS";
  /** Hoje em São Paulo (AAAA-MM-DD): a data da solicitação não passa daqui. */
  hoje: string;
}) {
  const { despachar, erros, estado } = useAcao(acao);
  const inicial = eventos.find((evento) => evento.id === eventoInicial) ?? (eventoFixo ? eventos[0] : undefined);
  const [recorte, setRecorte] = useState<"EVENTOS" | "MASTERCLASS">(inicial ? (inicial.masterclass ? "MASTERCLASS" : "EVENTOS") : recorteInicial);
  const [eventoId, setEventoId] = useState(inicial?.id ?? "");
  // Masterclass em turnê: a volta sai da última palestra. Vazio = a mesma palestra da ida.
  const [eventoVoltaId, setEventoVoltaId] = useState("");
  const masterclass = recorte === "MASTERCLASS";
  const doRecorte = eventos.filter((evento) => evento.masterclass === masterclass);
  const [pessoaId, setPessoaId] = useState(pessoas.some((pessoa) => pessoa.pessoaId === pessoaInicial) ? (pessoaInicial ?? "") : "");
  const evento = eventos.find((item) => item.id === eventoId);
  // A última palestra é do mesmo dia da primeira em diante.
  const ultimasPalestras = masterclass && evento ? eventos.filter((item) => item.masterclass && item.id !== evento.id && item.dataInicio >= evento.dataInicio) : [];
  const eventoDaVolta = ultimasPalestras.find((item) => item.id === eventoVoltaId) ?? evento;
  const jaPedidos = eventoId && pessoaId ? pedidosAtivos.filter((pedido) => pedido.eventoId === eventoId && pedido.pessoaId === pessoaId) : [];
  const nome = pessoas.find((pessoa) => pessoa.pessoaId === pessoaId)?.nome ?? "Esta pessoa";

  if (eventos.length === 0) return <Aviso tom="informacao">Nenhum evento futuro para pedir voo. Os eventos chegam pela sincronização com o IAM Control.</Aviso>;

  return (
    <form action={despachar} aria-label="Novo pedido de voo">
      <ErroDoFormulario estado={estado} />
      <input type="hidden" name="destino" value={destino} />
      {eventoFixo ? (
        <input type="hidden" name="eventoId" value={eventoId} />
      ) : (
        <>
          <CampoDeSelecao
            nome="tipoDeViagem"
            rotulo="Viagem para"
            value={recorte}
            onChange={(mudanca) => {
              setRecorte(mudanca.target.value === "MASTERCLASS" ? "MASTERCLASS" : "EVENTOS");
              setEventoId("");
              setEventoVoltaId("");
            }}
            opcoes={TIPOS_DE_VIAGEM}
            ajuda="Eventos e Masterclass ficam separados, como nas abas da planilha."
          />
          <CampoDeSelecao
            className="mt-3"
            nome="eventoId"
            rotulo={masterclass ? "Primeira palestra (a ida chega aqui)" : "Evento"}
            obrigatorio
            vazio={masterclass ? "Escolha a palestra" : "Escolha o evento"}
            value={eventoId}
            onChange={(mudanca) => {
              setEventoId(mudanca.target.value);
              setEventoVoltaId("");
            }}
            opcoes={doRecorte.map((item) => ({ valor: item.id, rotulo: item.rotulo }))}
            ajuda={masterclass ? "Qualquer Masterclass futura, por data." : "Qualquer evento futuro, com ou sem escala montada."}
            erros={erros("eventoId")}
          />
        </>
      )}
      {masterclass && evento && (
        <CampoDeSelecao
          className="mt-3"
          nome="eventoVoltaId"
          rotulo="Última palestra (a volta sai daqui)"
          vazio="A mesma palestra (ida e volta)"
          value={eventoVoltaId}
          onChange={(mudanca) => setEventoVoltaId(mudanca.target.value)}
          opcoes={ultimasPalestras.map((item) => ({ valor: item.id, rotulo: item.rotulo }))}
          ajuda="Na turnê, a pessoa vai para a primeira palestra e volta da última. As palestras do meio não entram no pedido."
          erros={erros("eventoVoltaId")}
        />
      )}
      <CampoDeSelecao
        className={eventoFixo && !masterclass ? undefined : "mt-3"}
        nome="pessoaId"
        rotulo="Passageiro"
        obrigatorio
        vazio="Escolha a pessoa"
        value={pessoaId}
        onChange={(mudanca) => setPessoaId(mudanca.target.value)}
        opcoes={pessoas.map((pessoa) => ({ valor: pessoa.pessoaId, rotulo: pessoa.nome }))}
        ajuda="Qualquer pessoa ativa do cadastro de staff, esteja ou não na escala do evento."
        erros={erros("pessoaId")}
      />
      {jaPedidos.length > 0 && (
        <Aviso tom="atencao" className="mt-3" titulo={`${nome} já tem pedido de voo neste evento`}>
          <p>
            {jaPedidos.map((pedido) => `${pedido.referencia}${pedido.trajeto ? ` (${pedido.trajeto})` : ""}`).join(", ")}. Registre outro só se for uma compra a mais, como um trecho extra.
          </p>
          <CaixaDeMarcar key={`${eventoId}|${pessoaId}`} name="outraCompra" rotulo="É outra compra para a mesma pessoa" className="mt-1" />
        </Aviso>
      )}
      <CamposDosTrechos
        key={`${eventoId}|${eventoVoltaId}`}
        erros={erros}
        inicial={{
          origemIata: "",
          destinoIata: "",
          ida: evento ? { data: diaAnterior(evento.dataInicio), preferencia: "" } : null,
          // Na turnê, a volta é sugerida para o dia da última palestra.
          volta: eventoDaVolta ? { data: eventoDaVolta.dataFim, preferencia: "" } : null,
        }}
      />
      <CampoDeTexto
        className="mt-4"
        nome="dataSolicitacao"
        rotulo="Data da solicitação"
        type="date"
        defaultValue={hoje}
        max={hoje}
        ajuda="O dia em que o pedido foi feito à SDC. Mude só para lançar um pedido antigo (da planilha, por exemplo)."
        erros={erros("dataSolicitacao")}
      />
      {/* Marcada por padrão: quem vai de avião quase sempre dorme no hotel, e o hotel é pedido à SDC junto com o voo. */}
      <CaixaDeMarcar
        name="precisaHotel"
        defaultChecked
        className="mt-4"
        rotulo="Também precisa de hotel"
        ajuda="A pessoa entra na lista de quem precisa de hotel neste evento, mesmo sem escala. Os quartos são montados em Hospedagem. Desmarque se ela não vai dormir no hotel."
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

/** Como a planilha anota o pagamento de cada compra. */
const FORMA_DE_PAGAMENTO_PADRAO = "Faturado SDC";

export type TrechoParaRegistrar = { sentido: "IDA" | "VOLTA"; rotulo: string; partidaSugerida: string; companhia: string; numeroVoo: string; localizador: string; partidaEm: string; chegadaEm: string; cartaoEmbarqueUrl: string };

export function FormularioRegistrarVoo({
  acao,
  pedidoId,
  trechos,
  valorInicial,
  aoConcluirIrPara,
  formaPagamento,
  dataCompra,
  dataSolicitacao,
  hoje,
}: {
  acao: AcaoDoFormulario;
  pedidoId: string;
  trechos: TrechoParaRegistrar[];
  valorInicial: string;
  aoConcluirIrPara: string;
  /** A forma de pagamento já registrada (vazio = ainda não há: o campo sugere "Faturado SDC"). */
  formaPagamento: string;
  /** A data da compra já registrada, ou hoje; não passa de hoje nem vem antes da solicitação. */
  dataCompra: string;
  dataSolicitacao: string;
  hoje: string;
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
        <CampoDeTexto nome="formaPagamento" rotulo="Forma de pagamento" maxLength={60} defaultValue={formaPagamento || FORMA_DE_PAGAMENTO_PADRAO} erros={erros("formaPagamento")} />
        <CampoDeTexto
          nome="dataCompra"
          rotulo="Data da compra"
          type="date"
          defaultValue={dataCompra}
          min={dataSolicitacao}
          max={hoje}
          ajuda="O dia em que a SDC comprou. Mude só para lançar uma compra antiga ou feita fora do sistema."
          erros={erros("dataCompra")}
        />
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

/** Cancelar pedido de voo (no painel do pedido, que fecha ao concluir) ou de hospedagem (na própria tela da Hospedagem). */
export function BotaoCancelarPedido({
  acao,
  pedidoId,
  referencia,
  aoConcluirIrPara,
  descricao = "Avise a SDC pelo canal de sempre. O voo some da copy da pessoa.",
  tamanho = "normal",
}: {
  acao: AcaoDoFormulario;
  pedidoId: string;
  referencia: string;
  aoConcluirIrPara?: string;
  descricao?: string;
  tamanho?: "normal" | "pequeno";
}) {
  const router = useRouter();
  const [aberto, setAberto] = useState(false);
  const { despachar, erros, pendente } = useAcao(acao, () => {
    setAberto(false);
    if (aoConcluirIrPara) router.push(aoConcluirIrPara, { scroll: false });
  });
  return (
    <>
      <Botao variante="perigo" tamanho={tamanho} icone={<Ban size={tamanho === "pequeno" ? 16 : 18} aria-hidden />} onClick={() => setAberto(true)}>
        Cancelar pedido
      </Botao>
      <Confirmacao
        aberto={aberto}
        aoFechar={() => setAberto(false)}
        titulo={`Cancelar o pedido ${referencia}?`}
        descricao={descricao}
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

/**
 * "Aprovar pagamento" (Voos e Hospedagem): depois que a compra está registrada, o time confere e confirma que usou e
 * que o valor pode ser pago. A confirmação é obrigatória; a observação, opcional.
 */
export function BotaoAprovarPagamento({
  acao,
  pedidoId,
  referencia,
  valor,
  valorCentavos,
  atualizadoEm,
  tamanho = "pequeno",
}: {
  acao: AcaoDoFormulario;
  pedidoId: string;
  referencia: string;
  /** Já formatado ("R$ 980,00"). */
  valor: string;
  /** O valor e a versão do pedido que esta tela mostrou: a aprovação só vale se a compra ainda for esta. */
  valorCentavos: number;
  atualizadoEm: string;
  tamanho?: "normal" | "pequeno";
}) {
  const [aberto, setAberto] = useState(false);
  const { despachar, erros, pendente } = useAcao(acao, { aoConcluir: () => setAberto(false), toastDeCampo: true });
  return (
    <>
      <Botao variante="primario" tamanho={tamanho} icone={<BadgeCheck size={tamanho === "pequeno" ? 16 : 18} aria-hidden />} onClick={() => setAberto(true)}>
        Aprovar pagamento
      </Botao>
      <Confirmacao
        aberto={aberto}
        aoFechar={() => setAberto(false)}
        titulo={`Aprovar o pagamento do pedido ${referencia}?`}
        descricao={`A SDC registrou ${valor}. Ao aprovar, ela passa a ver o pedido como aprovado para pagamento.`}
        rotuloConfirmar="Aprovar pagamento"
        rotuloCancelar="Voltar"
        carregando={pendente}
        acao={despachar}
      >
        <input type="hidden" name="pedidoId" value={pedidoId} />
        <input type="hidden" name="valorCentavos" value={valorCentavos} />
        <input type="hidden" name="atualizadoEm" value={atualizadoEm} />
        <CaixaDeMarcar name="confirmo" required rotulo="Confirmo que usamos e que este valor pode ser pago" />
        <CampoDeTextoLongo className="mt-2" nome="observacao" rotulo="Observação (opcional)" maxLength={500} erros={erros("observacao")} />
      </Confirmacao>
    </>
  );
}

/** Desfaz a aprovação: o pedido volta para "a aprovar" e a SDC pode corrigir a compra. */
export function BotaoDesfazerAprovacao({ acao, pedidoId, referencia, tamanho = "pequeno" }: { acao: AcaoDoFormulario; pedidoId: string; referencia: string; tamanho?: "normal" | "pequeno" }) {
  const [aberto, setAberto] = useState(false);
  const { despachar, pendente } = useAcao(acao, () => setAberto(false));
  return (
    <>
      <Botao variante="texto" tamanho={tamanho} onClick={() => setAberto(true)}>
        Desfazer aprovação
      </Botao>
      <Confirmacao
        aberto={aberto}
        aoFechar={() => setAberto(false)}
        titulo={`Desfazer a aprovação do pedido ${referencia}?`}
        descricao={'O pedido volta para "a aprovar" e a SDC pode corrigir a compra. Fica registrado quem desfez.'}
        rotuloConfirmar="Desfazer aprovação"
        rotuloCancelar="Voltar"
        destrutiva
        carregando={pendente}
        acao={despachar}
      >
        <input type="hidden" name="pedidoId" value={pedidoId} />
      </Confirmacao>
    </>
  );
}
