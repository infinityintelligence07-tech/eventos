"use client";

import { CirclePause, CirclePlay, UserPen } from "lucide-react";
import { useState } from "react";

import { type AcaoDoFormulario, Botao, BotaoCopiar, BotaoLink, CampoDeTexto, Confirmacao, useAcao } from "@/app/(time)/_componentes/ui";
import type { SituacaoDaEnquete } from "@/modules/disponibilidade";

import { encerrarEnqueteAcao, reabrirEnqueteAcao } from "../acoes";

/** Fecha o diálogo quando a ação deu certo (o toast mostra a mensagem). */
function useAcaoNoDialogo(acao: AcaoDoFormulario) {
  const [aberto, setAberto] = useState(false);
  const { estado, despachar, pendente } = useAcao(acao, () => setAberto(false));
  return { aberto, setAberto, estado, despachar, pendente };
}

export function AcoesDaEnquete({
  enqueteId,
  titulo,
  convite,
  situacao,
  reabrirAte,
  hrefRegistrar,
  somenteLeitura,
}: {
  enqueteId: string;
  titulo: string;
  convite: string;
  situacao: SituacaoDaEnquete;
  reabrirAte: string;
  hrefRegistrar: string;
  somenteLeitura: boolean;
}) {
  const encerrar = useAcaoNoDialogo(encerrarEnqueteAcao);
  const reabrir = useAcaoNoDialogo(reabrirEnqueteAcao);
  const errosDaData = reabrir.estado.ok ? undefined : reabrir.estado.campos?.fechaEm;

  return (
    <>
      <BotaoCopiar texto={convite} mensagem="Convite copiado. Cole no grupo do staff.">
        Copiar convite
      </BotaoCopiar>
      {!somenteLeitura && situacao === "ABERTA" && (
        <Botao icone={<CirclePause size={18} aria-hidden />} onClick={() => encerrar.setAberto(true)}>
          Encerrar agora
        </Botao>
      )}
      {!somenteLeitura && situacao === "ENCERRADA" && (
        <Botao icone={<CirclePlay size={18} aria-hidden />} onClick={() => reabrir.setAberto(true)}>
          Reabrir
        </Botao>
      )}
      {!somenteLeitura && (
        <BotaoLink href={hrefRegistrar} scroll={false} variante="primario" icone={<UserPen size={18} aria-hidden />}>
          Registrar resposta
        </BotaoLink>
      )}

      <Confirmacao
        aberto={encerrar.aberto}
        aoFechar={() => encerrar.setAberto(false)}
        titulo={`Encerrar "${titulo}" agora?`}
        descricao="A enquete passa a aparecer como encerrada. O time ainda pode registrar respostas que chegarem depois."
        rotuloConfirmar="Encerrar enquete"
        carregando={encerrar.pendente}
        acao={encerrar.despachar}
      >
        <input type="hidden" name="enqueteId" value={enqueteId} />
      </Confirmacao>

      <Confirmacao
        aberto={reabrir.aberto}
        aoFechar={() => reabrir.setAberto(false)}
        titulo={`Reabrir "${titulo}"?`}
        descricao="Escolha até quando as respostas entram como novas."
        rotuloConfirmar="Reabrir enquete"
        carregando={reabrir.pendente}
        acao={reabrir.despachar}
      >
        <input type="hidden" name="enqueteId" value={enqueteId} />
        <CampoDeTexto nome="fechaEm" rotulo="Fecha em" type="datetime-local" obrigatorio defaultValue={reabrirAte} erros={errosDaData} />
      </Confirmacao>
    </>
  );
}
