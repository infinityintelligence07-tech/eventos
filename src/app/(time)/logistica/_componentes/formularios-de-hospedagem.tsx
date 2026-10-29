"use client";

import { Hotel, Plus } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { type AcaoDoFormulario, ErroDoFormulario, useAcao } from "@/app/(time)/_componentes/ui";

import { Aviso } from "../../_componentes/ui/aviso";
import { Botao, BotaoDeEnvio } from "../../_componentes/ui/botao";
import { CampoDeSelecao, CampoDeTexto, CampoDeTextoLongo } from "../../_componentes/ui/campo";
import { PainelLateral } from "../../_componentes/ui/dialogo";

export function FormularioRegistrarReserva({
  acao,
  pedidoId,
  valorInicial,
  aoConcluirIrPara,
}: {
  acao: AcaoDoFormulario;
  pedidoId: string;
  valorInicial: string;
  aoConcluirIrPara: string;
}) {
  const router = useRouter();
  const { despachar, erros, estado } = useAcao(acao, () => router.push(aoConcluirIrPara, { scroll: false }));
  return (
    <form action={despachar} aria-label="Registrar reserva informada pela SDC">
      <ErroDoFormulario estado={estado} />
      <input type="hidden" name="pedidoId" value={pedidoId} />
      <Aviso tom="neutro" className="mb-4">
        Você está registrando a reserva informada pela SDC. O registro fica marcado como feito pelo time.
      </Aviso>
      <div className="grid grid-cols-2 gap-3">
        <CampoDeTexto nome="numeroReserva" rotulo="Número da reserva" obrigatorio erros={erros("numeroReserva")} />
        <CampoDeTexto nome="valorCentavos" rotulo="Valor (R$)" obrigatorio numerico inputMode="decimal" defaultValue={valorInicial} placeholder="2.400,00" erros={erros("valorCentavos")} />
      </div>
      <CampoDeTextoLongo className="mt-3" nome="observacaoSdc" rotulo="Observação da SDC" maxLength={500} erros={erros("observacaoSdc")} />
      <div className="mt-5 flex justify-end">
        <BotaoDeEnvio textoCarregando="Registrando…">Registrar reserva</BotaoDeEnvio>
      </div>
    </form>
  );
}

export type OpcaoDeLocal = { valor: string; rotulo: string };

/** "Definir hotel" (cria) ou "Editar hotel" (com hospedagemId e a versão). */
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
  hospedagem?: { id: string; localId: string; checkIn: string; checkOut: string; observacao: string | null; atualizadoEm: string };
  periodoSugerido: { checkIn: string; checkOut: string };
  primario?: boolean;
}) {
  const [aberto, setAberto] = useState(false);
  const { despachar, erros, estado } = useAcao(acao, () => setAberto(false));
  return (
    <>
      <Botao variante={primario ? "primario" : "secundario"} tamanho={primario ? "normal" : "pequeno"} icone={primario ? <Hotel size={18} aria-hidden /> : undefined} onClick={() => setAberto(true)}>
        {rotulo}
      </Botao>
      <PainelLateral aberto={aberto} aoFechar={() => setAberto(false)} titulo={hospedagem ? "Editar hospedagem" : "Definir hospedagem"}>
        <form action={despachar} aria-label={hospedagem ? "Editar hospedagem" : "Definir hospedagem"}>
          <ErroDoFormulario estado={estado} />
          {hospedagem ? (
            <>
              <input type="hidden" name="hospedagemId" value={hospedagem.id} />
              <input type="hidden" name="atualizadoEm" value={hospedagem.atualizadoEm} />
            </>
          ) : (
            <input type="hidden" name="eventoId" value={eventoId} />
          )}
          {locais.length === 0 ? (
            <Aviso tom="atencao">Nenhum hotel ou apartamento cadastrado. Cadastre em Configurações › Locais e hotéis.</Aviso>
          ) : (
            <CampoDeSelecao
              nome="localId"
              rotulo="Hotel ou apartamento"
              obrigatorio
              opcoes={locais}
              defaultValue={hospedagem?.localId}
              ajuda="Apartamento da IAM não passa pela SDC."
              erros={erros("localId")}
            />
          )}
          <div className="mt-3 grid grid-cols-2 gap-3">
            <CampoDeTexto nome="checkIn" rotulo="Check-in" type="date" obrigatorio defaultValue={hospedagem?.checkIn ?? periodoSugerido.checkIn} erros={erros("checkIn")} />
            <CampoDeTexto nome="checkOut" rotulo="Check-out" type="date" obrigatorio defaultValue={hospedagem?.checkOut ?? periodoSugerido.checkOut} erros={erros("checkOut")} />
          </div>
          <CampoDeTextoLongo className="mt-3" nome="observacao" rotulo="Observação" maxLength={500} defaultValue={hospedagem?.observacao ?? ""} erros={erros("observacao")} />
          <div className="mt-5 flex justify-end gap-2">
            <Botao onClick={() => setAberto(false)}>Cancelar</Botao>
            <BotaoDeEnvio textoCarregando="Salvando…">Salvar hospedagem</BotaoDeEnvio>
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
