"use client";

import { CircleCheck, CircleX } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { type AcaoDoFormulario, useAcao } from "@/app/(time)/_componentes/ui";

import { Botao, BotaoDeEnvio } from "../../_componentes/ui/botao";
import { CampoDeTextoLongo } from "../../_componentes/ui/campo";
import { Confirmacao } from "../../_componentes/ui/dialogo";
import { SemPermissaoNaAcao } from "../../_componentes/ui/permissao";

type Versao = { solicitacaoId: string; atualizadoEm: string };

function CamposDaVersao({ versao }: { versao: Versao }) {
  return (
    <>
      <input type="hidden" name="solicitacaoId" value={versao.solicitacaoId} />
      <input type="hidden" name="atualizadoEm" value={versao.atualizadoEm} />
    </>
  );
}

/**
 * Rodapé do detalhe (doc 08 §11.2): Reprovar (motivo obrigatório) e Aprovar (direto; com alerta crítico,
 * pede o motivo — decisão do gerente, docs/07 §11.1). Depois de decidir, o painel avança para a próxima.
 */
export function BarraDeAuditoria({
  versao,
  protocolo,
  critico,
  alertasCriticos,
  hrefDepois,
  aprovar,
  reprovar,
}: {
  versao: Versao;
  protocolo: string;
  critico: boolean;
  /** Todos os alertas críticos, um por linha no modal. */
  alertasCriticos: string[];
  hrefDepois: string;
  aprovar: AcaoDoFormulario;
  reprovar: AcaoDoFormulario;
}) {
  const router = useRouter();
  const [confirmando, setConfirmando] = useState<"aprovar" | "reprovar" | null>(null);
  const depois = () => {
    setConfirmando(null);
    router.push(hrefDepois, { scroll: false });
  };
  const aprovacao = useAcao(aprovar, depois);
  const reprovacao = useAcao(reprovar, depois);

  return (
    <div className="flex w-full flex-wrap justify-end gap-2">
      <Botao variante="perigo" icone={<CircleX size={18} aria-hidden />} onClick={() => setConfirmando("reprovar")}>
        Reprovar
      </Botao>
      {critico ? (
        <Botao variante="primario" icone={<CircleCheck size={18} aria-hidden />} onClick={() => setConfirmando("aprovar")}>
          Aprovar
        </Botao>
      ) : (
        <form action={aprovacao.despachar}>
          <CamposDaVersao versao={versao} />
          <BotaoDeEnvio icone={<CircleCheck size={18} aria-hidden />} textoCarregando="Aprovando…">
            Aprovar
          </BotaoDeEnvio>
        </form>
      )}

      <Confirmacao
        aberto={confirmando === "reprovar"}
        aoFechar={() => setConfirmando(null)}
        titulo={`Reprovar ${protocolo}?`}
        descricao="A pessoa vai ver o motivo e poderá corrigir e reenviar."
        rotuloConfirmar="Reprovar"
        destrutiva
        carregando={reprovacao.pendente}
        acao={reprovacao.despachar}
      >
        <CamposDaVersao versao={versao} />
        <CampoDeTextoLongo nome="motivo" rotulo="Motivo" obrigatorio maxLength={1000} erros={reprovacao.erros("motivo")} />
      </Confirmacao>
      <Confirmacao
        aberto={confirmando === "aprovar"}
        aoFechar={() => setConfirmando(null)}
        titulo="Aprovar com alerta crítico?"
        descricao={
          alertasCriticos.length > 0 ? (
            <ul className="list-disc pl-5">
              {alertasCriticos.map((alerta) => (
                <li key={alerta}>{alerta}</li>
              ))}
            </ul>
          ) : (
            "Esta solicitação tem alerta crítico."
          )
        }
        rotuloConfirmar="Aprovar"
        carregando={aprovacao.pendente}
        acao={aprovacao.despachar}
      >
        <CamposDaVersao versao={versao} />
        <CampoDeTextoLongo
          nome="parecer"
          rotulo="Motivo da aprovação"
          obrigatorio
          maxLength={1000}
          placeholder="Ex.: carro da pessoa é antigo; consumo conferido."
          erros={aprovacao.erros("parecer")}
        />
      </Confirmacao>
    </div>
  );
}

/** Já auditada: data da decisão e, enquanto o financeiro não pagou, "Reabrir auditoria" (confirmação simples). */
export function BarraDeAuditada({
  versao,
  texto,
  podeReabrir,
  liderPodeReabrir,
  hrefCorrigir,
  reabrir,
}: {
  versao: Versao;
  texto: string;
  /** A solicitação ainda pode ser reaberta (aprovada e não paga). */
  podeReabrir: boolean;
  /** O ator tem custos.reabrir_auditoria (só a líder). */
  liderPodeReabrir: boolean;
  hrefCorrigir: string | null;
  reabrir: AcaoDoFormulario;
}) {
  const [aberto, setAberto] = useState(false);
  const reabertura = useAcao(reabrir, () => setAberto(false));
  return (
    <div className="flex w-full flex-wrap items-center justify-between gap-2">
      <p className="text-[13px] text-[var(--ds-label-2)]">{texto}</p>
      <div className="flex flex-wrap gap-2">
        {hrefCorrigir && (
          <Link href={hrefCorrigir} className="inline-flex h-10 items-center px-1 text-[14px] font-medium text-[var(--ds-tint-text)] hover:underline">
            Registrar correção
          </Link>
        )}
        {podeReabrir &&
          (liderPodeReabrir ? (
            <Botao variante="texto" onClick={() => setAberto(true)}>
              Reabrir auditoria
            </Botao>
          ) : (
            <SemPermissaoNaAcao permissao="custos.reabrir_auditoria" />
          ))}
      </div>
      {podeReabrir && liderPodeReabrir && (
        <Confirmacao
          aberto={aberto}
          aoFechar={() => setAberto(false)}
          titulo="Reabrir a auditoria?"
          descricao="A solicitação volta para Para auditar e sai da fila do financeiro."
          rotuloConfirmar="Reabrir auditoria"
          carregando={reabertura.pendente}
          acao={reabertura.despachar}
        >
          <CamposDaVersao versao={versao} />
        </Confirmacao>
      )}
    </div>
  );
}
