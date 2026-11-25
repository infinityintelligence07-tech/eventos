"use client";

import { BedDouble, Hotel, Plus } from "lucide-react";
import { useState } from "react";
import { type AcaoDoFormulario, ErroDoFormulario, useAcao } from "@/app/(time)/_componentes/ui";

import { Aviso } from "../../_componentes/ui/aviso";
import { Botao, BotaoDeEnvio } from "../../_componentes/ui/botao";
import { CampoDeSelecao, CampoDeTexto, CampoDeTextoLongo } from "../../_componentes/ui/campo";
import { PainelLateral } from "../../_componentes/ui/dialogo";

export type OpcaoDeLocal = { valor: string; rotulo: string };

// Constantes do domínio repetidas aqui: este arquivo roda no navegador e o índice do módulo traz os repositórios.
const NOVO_HOTEL = "novo";
const FORMA_DE_PAGAMENTO_PADRAO = "Faturado SDC";

/**
 * "Registrar reserva": o retorno da SDC para a hospedagem. É aqui que o hotel entra (quem escolhe e reserva é a SDC):
 * um hotel já cadastrado ou um novo, cadastrado na hora com o mínimo. Junto vão a reserva, o valor total e o pagamento.
 */
export function BotaoRegistrarReserva({
  acao,
  pedidoId,
  referencia,
  hoteis,
  inicial,
  cidadeDoEvento,
}: {
  acao: AcaoDoFormulario;
  pedidoId: string;
  referencia: string;
  /** Hotéis de Configurações › Locais e hotéis. */
  hoteis: OpcaoDeLocal[];
  /** `dataCompra`: a data da reserva já registrada, ou hoje; não passa de `hoje` nem vem antes de `dataSolicitacao`. */
  inicial: { localId: string | null; numeroReserva: string | null; valor: string; formaPagamento: string | null; dataCompra: string; dataSolicitacao: string; hoje: string };
  /** Sugestão para o cadastro de um hotel novo: a cidade do evento. */
  cidadeDoEvento: { cidade: string; uf: string } | null;
}) {
  const [aberto, setAberto] = useState(false);
  const { despachar, erros, estado } = useAcao(acao, () => setAberto(false));
  const [hotel, setHotel] = useState(inicial.localId && hoteis.some((item) => item.valor === inicial.localId) ? inicial.localId : hoteis.length === 0 ? NOVO_HOTEL : "");
  return (
    <>
      <Botao tamanho="pequeno" variante="secundario" icone={<Hotel size={16} aria-hidden />} onClick={() => setAberto(true)}>
        Registrar reserva
      </Botao>
      <PainelLateral aberto={aberto} aoFechar={() => setAberto(false)} titulo={`Registrar reserva · ${referencia}`}>
        <form action={despachar} aria-label="Registrar reserva informada pela SDC">
          <ErroDoFormulario estado={estado} />
          <input type="hidden" name="pedidoId" value={pedidoId} />
          <Aviso tom="neutro" className="mb-4">
            Você está registrando a reserva informada pela SDC: o hotel que ela escolheu, o número da reserva, o valor e a forma de pagamento. O registro fica marcado como feito pelo time.
          </Aviso>
          <CampoDeSelecao
            nome="localId"
            rotulo="Hotel reservado pela SDC"
            obrigatorio
            vazio="Escolha o hotel"
            value={hotel}
            onChange={(mudanca) => setHotel(mudanca.target.value)}
            opcoes={[...hoteis, { valor: NOVO_HOTEL, rotulo: "Cadastrar outro hotel…" }]}
            ajuda="Não está na lista? Escolha &quot;Cadastrar outro hotel…&quot; e preencha aqui mesmo."
            erros={erros("localId")}
          />
          {hotel === NOVO_HOTEL && (
            <fieldset className="mt-3 rounded-[var(--ds-radius-md)] border border-[var(--ds-separator)] p-4">
              <legend className="px-1 text-[13px] font-medium">Novo hotel</legend>
              <CampoDeTexto nome="novoHotel.nome" rotulo="Nome do hotel" obrigatorio maxLength={120} erros={erros("novoHotel.nome")} />
              <div className="mt-3 grid grid-cols-[1fr_96px] gap-3">
                <CampoDeTexto nome="novoHotel.cidade" rotulo="Cidade" obrigatorio maxLength={80} defaultValue={cidadeDoEvento?.cidade ?? ""} erros={erros("novoHotel.cidade")} />
                <CampoDeTexto nome="novoHotel.uf" rotulo="UF" obrigatorio maxLength={2} defaultValue={cidadeDoEvento?.uf ?? ""} erros={erros("novoHotel.uf")} />
              </div>
              <div className="mt-3 grid grid-cols-[1fr_96px] gap-3">
                <CampoDeTexto nome="novoHotel.logradouro" rotulo="Endereço (rua)" maxLength={160} erros={erros("novoHotel.logradouro")} />
                <CampoDeTexto nome="novoHotel.numero" rotulo="Número" maxLength={20} erros={erros("novoHotel.numero")} />
              </div>
              <CampoDeTexto
                className="mt-3"
                nome="novoHotel.bairro"
                rotulo="Bairro"
                maxLength={80}
                ajuda="O hotel entra em Configurações › Locais e hotéis, onde dá para completar CEP e mapa. O endereço vai na copy de hospedagem."
                erros={erros("novoHotel.bairro")}
              />
            </fieldset>
          )}
          <div className="mt-3 grid grid-cols-2 gap-3">
            <CampoDeTexto nome="numeroReserva" rotulo="Número da reserva" obrigatorio defaultValue={inicial.numeroReserva ?? ""} erros={erros("numeroReserva")} />
            <CampoDeTexto nome="valorCentavos" rotulo="Valor total (R$)" obrigatorio numerico inputMode="decimal" defaultValue={inicial.valor} placeholder="2.400,00" erros={erros("valorCentavos")} />
          </div>
          <CampoDeTexto
            className="mt-3"
            nome="formaPagamento"
            rotulo="Forma de pagamento"
            obrigatorio
            maxLength={60}
            defaultValue={inicial.formaPagamento ?? FORMA_DE_PAGAMENTO_PADRAO}
            erros={erros("formaPagamento")}
          />
          <CampoDeTexto
            className="mt-3"
            nome="dataCompra"
            rotulo="Data da reserva"
            type="date"
            defaultValue={inicial.dataCompra}
            min={inicial.dataSolicitacao}
            max={inicial.hoje}
            ajuda="O dia em que a SDC reservou. Mude só para lançar uma reserva antiga ou feita fora do sistema."
            erros={erros("dataCompra")}
          />
          <CampoDeTextoLongo className="mt-3" nome="observacaoSdc" rotulo="Observação da SDC" maxLength={500} erros={erros("observacaoSdc")} />
          <div className="mt-5 flex justify-end gap-2">
            <Botao onClick={() => setAberto(false)}>Cancelar</Botao>
            <BotaoDeEnvio textoCarregando="Registrando…">Registrar reserva</BotaoDeEnvio>
          </div>
        </form>
      </PainelLateral>
    </>
  );
}

/**
 * "Montar quartos" (abre a hospedagem do evento) ou "Editar" (com hospedagemId e a versão). O hotel é opcional: em
 * branco, quem escolhe e reserva é a SDC e ele entra no retorno do pedido.
 */
export function BotaoDefinirHospedagem({
  acao,
  rotulo,
  eventoId,
  locais,
  hospedagem,
  periodoSugerido,
  primario = false,
}: {
  acao: AcaoDoFormulario;
  rotulo: string;
  eventoId: string;
  locais: OpcaoDeLocal[];
  hospedagem?: { id: string; localId: string | null; checkIn: string; checkOut: string; observacao: string | null; atualizadoEm: string };
  periodoSugerido: { checkIn: string; checkOut: string };
  primario?: boolean;
}) {
  const [aberto, setAberto] = useState(false);
  const { despachar, erros, estado } = useAcao(acao, () => setAberto(false));
  const titulo = hospedagem ? "Editar hospedagem" : "Montar quartos";
  return (
    <>
      <Botao variante={primario ? "primario" : "secundario"} tamanho={primario ? "normal" : "pequeno"} icone={primario ? <BedDouble size={18} aria-hidden /> : undefined} onClick={() => setAberto(true)}>
        {rotulo}
      </Botao>
      <PainelLateral aberto={aberto} aoFechar={() => setAberto(false)} titulo={titulo}>
        <form action={despachar} aria-label={titulo}>
          <ErroDoFormulario estado={estado} />
          {hospedagem ? (
            <>
              <input type="hidden" name="hospedagemId" value={hospedagem.id} />
              <input type="hidden" name="atualizadoEm" value={hospedagem.atualizadoEm} />
            </>
          ) : (
            <>
              <input type="hidden" name="eventoId" value={eventoId} />
              <Aviso tom="neutro" className="mb-4">
                Confira as datas de entrada e saída do grupo e depois crie os quartos. Quem escolhe e reserva o hotel é a SDC: você pede com os quartos montados e registra o hotel quando ela responder.
              </Aviso>
            </>
          )}
          <div className="grid grid-cols-2 gap-3">
            <CampoDeTexto nome="checkIn" rotulo="Entrada (check-in)" type="date" obrigatorio defaultValue={hospedagem?.checkIn ?? periodoSugerido.checkIn} erros={erros("checkIn")} />
            <CampoDeTexto nome="checkOut" rotulo="Saída (check-out)" type="date" obrigatorio defaultValue={hospedagem?.checkOut ?? periodoSugerido.checkOut} erros={erros("checkOut")} />
          </div>
          <CampoDeSelecao
            className="mt-3"
            nome="localId"
            rotulo="Onde"
            vazio="Hotel pela SDC (ela escolhe e reserva)"
            opcoes={locais}
            defaultValue={hospedagem?.localId ?? ""}
            ajuda="Deixe assim quando a SDC for reservar. Escolha um apartamento da IAM (não passa pela SDC) ou um hotel só se ele já estiver definido."
            erros={erros("localId")}
          />
          <CampoDeTextoLongo className="mt-3" nome="observacao" rotulo="Observação" maxLength={500} defaultValue={hospedagem?.observacao ?? ""} erros={erros("observacao")} />
          <div className="mt-5 flex justify-end gap-2">
            <Botao onClick={() => setAberto(false)}>Cancelar</Botao>
            <BotaoDeEnvio textoCarregando="Salvando…">{hospedagem ? "Salvar hospedagem" : "Montar quartos"}</BotaoDeEnvio>
          </div>
        </form>
      </PainelLateral>
    </>
  );
}

/** Período de quem chega depois ou sai antes do grupo. Com as datas da hospedagem, a pessoa volta a segui-la. */
export function BotaoPeriodoDoOcupante({
  acao,
  quartoId,
  pessoaId,
  nome,
  hospedagem,
  proprio,
}: {
  acao: AcaoDoFormulario;
  quartoId: string;
  pessoaId: string;
  nome: string;
  hospedagem: { checkIn: string; checkOut: string };
  proprio: { checkIn: string; checkOut: string } | null;
}) {
  const [aberto, setAberto] = useState(false);
  const { despachar, erros, estado } = useAcao(acao, () => setAberto(false));
  return (
    <>
      <Botao tamanho="pequeno" variante="texto" aria-label={`Período de ${nome}`} onClick={() => setAberto(true)}>
        Período
      </Botao>
      <PainelLateral aberto={aberto} aoFechar={() => setAberto(false)} titulo={`Período de ${nome}`}>
        <form action={despachar} aria-label={`Período de ${nome}`}>
          <ErroDoFormulario estado={estado} />
          <input type="hidden" name="quartoId" value={quartoId} />
          <input type="hidden" name="pessoaId" value={pessoaId} />
          <Aviso tom="neutro" className="mb-4">
            Use quando a pessoa chega depois ou sai antes do grupo. Com as mesmas datas da hospedagem, ela volta a seguir o período do grupo.
          </Aviso>
          <div className="grid grid-cols-2 gap-3">
            <CampoDeTexto
              nome="checkIn"
              rotulo="Check-in"
              type="date"
              obrigatorio
              min={hospedagem.checkIn}
              max={hospedagem.checkOut}
              defaultValue={proprio?.checkIn ?? hospedagem.checkIn}
              erros={erros("checkIn")}
            />
            <CampoDeTexto
              nome="checkOut"
              rotulo="Check-out"
              type="date"
              obrigatorio
              min={hospedagem.checkIn}
              max={hospedagem.checkOut}
              defaultValue={proprio?.checkOut ?? hospedagem.checkOut}
              erros={erros("checkOut")}
            />
          </div>
          <div className="mt-5 flex justify-end gap-2">
            <Botao onClick={() => setAberto(false)}>Cancelar</Botao>
            <BotaoDeEnvio textoCarregando="Salvando…">Salvar período</BotaoDeEnvio>
          </div>
        </form>
      </PainelLateral>
    </>
  );
}

export function FormularioNovoQuarto({ acao, hospedagemId, proximoNome }: { acao: AcaoDoFormulario; hospedagemId: string; proximoNome: string }) {
  const [aberto, setAberto] = useState(false);
  const { despachar, erros, estado } = useAcao(acao, () => setAberto(false));
  if (!aberto) {
    return (
      <Botao icone={<Plus size={18} aria-hidden />} onClick={() => setAberto(true)}>
        Novo quarto
      </Botao>
    );
  }
  return (
    <form action={despachar} aria-label="Novo quarto" className="rounded-[var(--ds-radius-lg)] border border-dashed border-[var(--ds-separator)] p-4">
      <ErroDoFormulario estado={estado} />
      <input type="hidden" name="hospedagemId" value={hospedagemId} />
      <div className="grid grid-cols-2 gap-3">
        <CampoDeTexto nome="nome" rotulo="Nome" obrigatorio defaultValue={proximoNome} erros={erros("nome")} />
        <CampoDeSelecao
          nome="capacidade"
          rotulo="Camas"
          obrigatorio
          defaultValue="2"
          opcoes={[
            { valor: "1", rotulo: "1 (single)" },
            { valor: "2", rotulo: "2 (duplo)" },
            { valor: "3", rotulo: "3 (triplo)" },
            { valor: "4", rotulo: "4 (quádruplo)" },
          ]}
          erros={erros("capacidade")}
        />
        <CampoDeSelecao
          nome="sexo"
          rotulo="Quarto"
          opcoes={[
            { valor: "F", rotulo: "Feminino" },
            { valor: "M", rotulo: "Masculino" },
          ]}
          vazio="Misto / família"
          erros={erros("sexo")}
        />
        <CampoDeTexto nome="valorDiariaCentavos" rotulo="Diária (R$)" numerico inputMode="decimal" placeholder="320,00" erros={erros("valorDiariaCentavos")} />
      </div>
      <div className="mt-4 flex justify-end gap-2">
        <Botao onClick={() => setAberto(false)}>Cancelar</Botao>
        <BotaoDeEnvio textoCarregando="Criando…">Criar quarto</BotaoDeEnvio>
      </div>
    </form>
  );
}
