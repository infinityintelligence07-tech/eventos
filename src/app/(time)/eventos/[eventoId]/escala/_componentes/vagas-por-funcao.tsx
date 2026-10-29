"use client";

import { Check, Info, Minus, Plus } from "lucide-react";
import { useState } from "react";

import { FormularioDeAcao, useAcao } from "@/app/(time)/_componentes/ui";
import { Botao, BotaoDeEnvio } from "../../../../_componentes/ui/botao";
import { Chip } from "../../../../_componentes/ui/situacao";
import { Confirmacao } from "../../../../_componentes/ui/dialogo";
import { dataCurta, horario } from "../../../../_componentes/ui/formatos";
import { alterarVagas, confirmarVagas, definirVagaDigitada, removerVagaManual } from "../acoes";
import { MenuMaisAcoes } from "./menu-mais-acoes";

export type LinhaDeVagas = {
  id: string;
  nomeDaFuncao: string;
  data: string;
  horaInicio: string;
  horaFim: string;
  quantidade: number;
  origem: "REGRA" | "MANUAL";
  confirmada: boolean;
  ativas: number;
  sugerido: number | null;
  digitada: boolean;
  explicacao: string | null;
};

export type FuncaoDigitada = { funcao: string; nomeDaFuncao: string };

const CAMPO_DE_VAGAS = "h-8 w-14 rounded-[8px] border border-[var(--ds-separator)] bg-[var(--ds-surface)] px-2 text-center text-[14px] tabular-nums";

function SeletorDeNumero({ nome, valor, aoMudar, rotulo }: { nome: string; valor: string; aoMudar: (valor: string) => void; rotulo: string }) {
  const numero = Number(valor);
  const passo = (delta: number) => aoMudar(String(Math.max(1, (Number.isFinite(numero) ? numero : 0) + delta)));
  return (
    <span className="inline-flex items-center gap-1">
      <Botao variante="icone" tamanho="pequeno" aria-label={`Diminuir vagas de ${rotulo}`} onClick={() => passo(-1)} icone={<Minus size={16} aria-hidden />} />
      <input
        name={nome}
        type="text"
        inputMode="numeric"
        aria-label={`Vagas de ${rotulo}`}
        value={valor}
        onChange={(evento) => aoMudar(evento.target.value)}
        className={CAMPO_DE_VAGAS}
      />
      <Botao variante="icone" tamanho="pequeno" aria-label={`Aumentar vagas de ${rotulo}`} onClick={() => passo(1)} icone={<Plus size={16} aria-hidden />} />
    </span>
  );
}

function LinhaEditavel({ eventoId, linha, editavel }: { eventoId: string; linha: LinhaDeVagas; editavel: boolean }) {
  const [valor, setValor] = useState(String(linha.quantidade));
  const [removendo, setRemovendo] = useState(false);
  const confirmar = useAcao(confirmarVagas, { toastDeCampo: true });
  const desfazer = useAcao(alterarVagas, { toastDeCampo: true });
  const remover = useAcao(removerVagaManual, { aoConcluir: () => setRemovendo(false), toastDeCampo: true });
  const mudou = valor.trim() !== String(linha.quantidade);
  const rotulo = `${linha.nomeDaFuncao} em ${dataCurta(linha.data)}`;

  return (
    <tr className="border-t border-[var(--ds-separator)]">
      <th scope="row" className="px-4 py-3 text-left font-medium">
        {linha.nomeDaFuncao}
        <span className="block text-[12px] font-normal text-[var(--ds-label-2)]">
          {dataCurta(linha.data)} · {horario(linha.horaInicio, linha.horaFim)}{" "}
          <span className="rounded-full border border-[var(--ds-separator)] px-1.5 text-[11px]">provisório</span>
          {linha.origem === "MANUAL" && " · adicionada pelo time"}
        </span>
      </th>
      <td className="px-4 py-3 text-[13px] text-[var(--ds-label-2)]">
        {linha.digitada ? (
          "sem sugestão"
        ) : linha.sugerido !== null ? (
          <span className="inline-flex items-center gap-1" title={linha.explicacao ?? undefined}>
            sugerido {linha.sugerido}
            {linha.explicacao && (
              <>
                <Info size={14} aria-hidden />
                <span className="sr-only">{linha.explicacao}</span>
              </>
            )}
          </span>
        ) : (
          "—"
        )}
      </td>
      <td className="px-4 py-3">
        {editavel ? (
          <form className="flex flex-wrap items-center gap-2">
            <input type="hidden" name="eventoId" value={eventoId} />
            <input type="hidden" name="escalaId" value={linha.id} />
            <input type="hidden" name="linhas[0].escalaId" value={linha.id} />
            <input type="hidden" name="linhas[0].quantidade" value={valor} />
            <SeletorDeNumero nome="quantidade" valor={valor} aoMudar={setValor} rotulo={rotulo} />
            {linha.confirmada && !mudou ? (
              <>
                <Chip tom="sucesso" icone={<Check size={14} aria-hidden />}>
                  Confirmado
                </Chip>
                <Botao
                  type="submit"
                  variante="texto"
                  tamanho="pequeno"
                  formAction={desfazer.despachar}
                  carregando={desfazer.pendente}
                  aria-label={`Desfazer a confirmação de ${rotulo}`}
                >
                  Desfazer
                </Botao>
              </>
            ) : (
              <>
                <Botao
                  type="submit"
                  variante="secundario"
                  tamanho="pequeno"
                  formAction={confirmar.despachar}
                  carregando={confirmar.pendente}
                  icone={<Check size={16} aria-hidden />}
                  aria-label={`Confirmar ${valor} vagas de ${rotulo}`}
                >
                  Confirmar
                </Botao>
                {linha.confirmada && <span className="text-[12px] text-[var(--ds-orange-deep)]">O número mudou: confirme de novo.</span>}
              </>
            )}
          </form>
        ) : (
          <span className="tabular-nums">
            {linha.quantidade} {linha.confirmada ? "(confirmado)" : "(não confirmado)"}
          </span>
        )}
      </td>
      <td className="px-4 py-3 text-right tabular-nums">
        {Math.min(linha.ativas, linha.quantidade)} de {linha.quantidade}
      </td>
      <td className="px-4 py-3 text-right">
        {editavel && linha.origem === "MANUAL" && (
          <>
            <MenuMaisAcoes rotulo={`Mais ações para ${rotulo}`} itens={[{ rotulo: "Remover função", perigo: true, aoEscolher: () => setRemovendo(true) }]} />
            <Confirmacao
              aberto={removendo}
              aoFechar={() => setRemovendo(false)}
              titulo={`Remover ${linha.nomeDaFuncao} da escala?`}
              descricao="A função sai da escala deste evento. Só dá para remover sem pessoas nela."
              rotuloConfirmar="Remover"
              destrutiva
              carregando={remover.pendente}
              acao={remover.despachar}
            >
              <input type="hidden" name="eventoId" value={eventoId} />
              <input type="hidden" name="escalaId" value={linha.id} />
            </Confirmacao>
          </>
        )}
      </td>
    </tr>
  );
}

function LinhaDigitada({ eventoId, funcao }: { eventoId: string; funcao: FuncaoDigitada }) {
  const [valor, setValor] = useState("");
  return (
    <tr className="border-t border-[var(--ds-separator)] bg-[var(--ds-orange-soft)]/30">
      <th scope="row" className="px-4 py-3 text-left font-medium">
        {funcao.nomeDaFuncao}
        <span className="block text-[12px] font-normal text-[var(--ds-label-2)]">Definido em cada evento</span>
      </th>
      <td className="px-4 py-3 text-[13px] text-[var(--ds-label-2)]">sem sugestão</td>
      <td className="px-4 py-3" colSpan={3}>
        <FormularioDeAcao toastDeCampo acao={definirVagaDigitada} className="flex flex-wrap items-center gap-2">
          <input type="hidden" name="eventoId" value={eventoId} />
          <input type="hidden" name="funcao" value={funcao.funcao} />
          <SeletorDeNumero nome="quantidade" valor={valor} aoMudar={setValor} rotulo={funcao.nomeDaFuncao} />
          <BotaoDeEnvio variante="secundario" tamanho="pequeno" icone={<Check size={16} aria-hidden />}>
            Confirmar
          </BotaoDeEnvio>
        </FormularioDeAcao>
      </td>
    </tr>
  );
}

export function VagasPorFuncao({
  eventoId,
  linhas,
  digitadas,
  editavel,
}: {
  eventoId: string;
  linhas: LinhaDeVagas[];
  digitadas: FuncaoDigitada[];
  editavel: boolean;
}) {
  const sugestoesParaConfirmar = linhas.filter((linha) => !linha.confirmada && !linha.digitada && linha.sugerido !== null && linha.sugerido === linha.quantidade);
  return (
    <>
      {editavel && sugestoesParaConfirmar.length > 0 && (
        <FormularioDeAcao toastDeCampo acao={confirmarVagas} className="mb-3 flex justify-end">
          <input type="hidden" name="eventoId" value={eventoId} />
          {sugestoesParaConfirmar.map((linha, indice) => (
            <span key={linha.id}>
              <input type="hidden" name={`linhas[${indice}].escalaId`} value={linha.id} />
              <input type="hidden" name={`linhas[${indice}].quantidade`} value={linha.quantidade} />
            </span>
          ))}
          <BotaoDeEnvio variante="secundario">Confirmar todas as sugestões ({sugestoesParaConfirmar.length})</BotaoDeEnvio>
        </FormularioDeAcao>
      )}
      <div className="relative overflow-x-auto">
        <table className="w-full min-w-[760px] border-collapse text-[14px]">
          <caption className="sr-only">Vagas por função: sugerido pela regra, número de vagas, confirmação e preenchidas</caption>
          <thead className="bg-[var(--ds-surface-1)]">
            <tr>
              <th scope="col" className="px-4 py-2.5 text-left text-[12px] font-medium text-[var(--ds-label-2)]">
                Função
              </th>
              <th scope="col" className="px-4 py-2.5 text-left text-[12px] font-medium text-[var(--ds-label-2)]">
                Sugerido
              </th>
              <th scope="col" className="px-4 py-2.5 text-left text-[12px] font-medium text-[var(--ds-label-2)]">
                Vagas e confirmação
              </th>
              <th scope="col" className="px-4 py-2.5 text-right text-[12px] font-medium text-[var(--ds-label-2)]">
                Preenchidas
              </th>
              <th scope="col" className="px-4 py-2.5">
                <span className="sr-only">Ações</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {linhas.map((linha) => (
              <LinhaEditavel key={`${linha.id}-${linha.quantidade}-${linha.confirmada}`} eventoId={eventoId} linha={linha} editavel={editavel} />
            ))}
            {editavel && digitadas.map((funcao) => <LinhaDigitada key={funcao.funcao} eventoId={eventoId} funcao={funcao} />)}
          </tbody>
        </table>
      </div>
    </>
  );
}
