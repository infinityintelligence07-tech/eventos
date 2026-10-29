"use client";

import { CircleCheck, CircleX, Clock, ExternalLink, TriangleAlert, UserMinus, UserPlus } from "lucide-react";
import Link from "next/link";
import { useState } from "react";

import type { Deslocamento, StatusConvocacao } from "@/modules/escala";

import { useAcao } from "@/app/(time)/_componentes/ui";
import { BotaoLink } from "../../../../_componentes/ui/botao-link";
import { Confirmacao } from "../../../../_componentes/ui/dialogo";
import { distancia } from "../../../../_componentes/ui/formatos";
import { SeloRegistradoPeloTime } from "../../../../_componentes/ui/selo";
import { Chip, type TomDoChip } from "../../../../_componentes/ui/situacao";
import { atualizarConvocacao, tirarDaVaga } from "../acoes";
import { MenuMaisAcoes } from "./menu-mais-acoes";

export type PessoaNaEscala = {
  id: string;
  pessoaId: string;
  nome: string;
  status: StatusConvocacao;
  nivel: "HABILITADO" | "TRAINEE" | null;
  respondidaEm: Date | null;
  motivoRecusa: string | null;
  registradoPor: string | null;
  deslocamento: string | null;
  distanciaKm: number | null;
  conflitos: string[];
};

export const ROTULO_DO_DESLOCAMENTO: Record<Deslocamento, string> = {
  CARRO_PROPRIO: "Carro próprio",
  CARONA: "Carona",
  CARRO_IAM: "Carro da IAM",
  UBER: "Uber",
  ONIBUS: "Ônibus",
  VOO: "Avião",
  NAO_SE_APLICA: "Não se aplica",
};

function aparenciaDaConvocacao(status: StatusConvocacao): { tom: TomDoChip; rotulo: string; Icone: typeof Clock } {
  switch (status) {
    case "SUGERIDA":
      return { tom: "neutro", rotulo: "Na escala (não avisada)", Icone: UserPlus };
    case "CONVIDADA":
      return { tom: "informacao", rotulo: "Aguardando resposta", Icone: Clock };
    case "ACEITA":
      return { tom: "sucesso", rotulo: "Confirmou", Icone: CircleCheck };
    case "RECUSADA":
      return { tom: "perigo", rotulo: "Não pode", Icone: CircleX };
    case "CANCELADA":
      return { tom: "neutro", rotulo: "Removida", Icone: UserMinus };
    default: {
      const desconhecido: never = status;
      throw new Error(`status de convocação desconhecido: ${String(desconhecido)}`);
    }
  }
}

const SELETOR = "h-8 rounded-[8px] border border-[var(--ds-separator)] bg-[var(--ds-surface)] pl-2 pr-7 text-[13px]";

function LinhaDaPessoa({
  eventoId,
  pessoa,
  editavel,
  aceitaResposta,
  deslocamentoEditavel,
  hrefResponder,
}: {
  eventoId: string;
  pessoa: PessoaNaEscala;
  editavel: boolean;
  aceitaResposta: boolean;
  deslocamentoEditavel: boolean;
  hrefResponder: string;
}) {
  const [removendo, setRemovendo] = useState(false);
  const tirar = useAcao(tirarDaVaga, { aoConcluir: () => setRemovendo(false), toastDeCampo: true });
  const deslocamento = useAcao(atualizarConvocacao, { toastDeCampo: true });
  const { tom, rotulo, Icone } = aparenciaDaConvocacao(pessoa.status);
  const ativa = pessoa.status === "SUGERIDA" || pessoa.status === "CONVIDADA" || pessoa.status === "ACEITA";
  const avisada = pessoa.status === "CONVIDADA" || pessoa.status === "ACEITA";

  return (
    <tr className={`border-t border-[var(--ds-separator)] ${ativa ? "" : "text-[var(--ds-label-2)]"}`}>
      <th scope="row" className="px-4 py-3 text-left font-medium">
        <Link href={`/pessoas/${pessoa.pessoaId}`} target="_blank" className="inline-flex items-center gap-1 hover:underline" aria-label={`${pessoa.nome} (abre em nova aba)`}>
          {pessoa.nome}
          <ExternalLink size={14} aria-hidden />
        </Link>
        {pessoa.nivel === "TRAINEE" && (
          <span className="ml-2 rounded-full bg-[var(--ds-fill-4)] px-1.5 py-0.5 text-[11px] font-medium text-[var(--ds-label-2)]">Trainee</span>
        )}
        {pessoa.nivel === null && ativa && (
          <span className="ml-2 rounded-full bg-[var(--ds-orange-soft)] px-1.5 py-0.5 text-[11px] font-medium text-[var(--ds-orange-deep)]">Não habilitado</span>
        )}
      </th>
      <td className="px-4 py-3">
        <span className="flex flex-wrap items-center gap-1">
          <Chip tom={tom} icone={<Icone size={14} aria-hidden />} riscado={pessoa.status === "CANCELADA"}>
            {rotulo}
          </Chip>
          {pessoa.registradoPor && <SeloRegistradoPeloTime em={pessoa.respondidaEm} por={pessoa.registradoPor} />}
          {pessoa.conflitos.length > 0 && ativa && (
            <Chip tom="atencao" icone={<TriangleAlert size={14} aria-hidden />}>
              Também em {pessoa.conflitos.join(", ")}
            </Chip>
          )}
        </span>
        {pessoa.status === "RECUSADA" && pessoa.motivoRecusa && <span className="mt-1 block text-[12px]">Motivo: {pessoa.motivoRecusa}</span>}
      </td>
      <td className="whitespace-nowrap px-4 py-3 text-right tabular-nums">{pessoa.distanciaKm !== null ? distancia(pessoa.distanciaKm) : "—"}</td>
      <td className="px-4 py-3">
        {ativa && deslocamentoEditavel ? (
          <form action={deslocamento.despachar}>
            <input type="hidden" name="eventoId" value={eventoId} />
            <input type="hidden" name="convocacaoId" value={pessoa.id} />
            <label>
              <span className="sr-only">Deslocamento de {pessoa.nome}</span>
              <select
                name="deslocamento"
                defaultValue={pessoa.deslocamento ?? ""}
                className={SELETOR}
                onChange={(evento) => evento.currentTarget.form?.requestSubmit()}
              >
                <option value="">Não definido</option>
                {Object.entries(ROTULO_DO_DESLOCAMENTO).map(([valor, texto]) => (
                  <option key={valor} value={valor}>
                    {texto}
                  </option>
                ))}
              </select>
            </label>
          </form>
        ) : (
          (pessoa.deslocamento && ROTULO_DO_DESLOCAMENTO[pessoa.deslocamento as Deslocamento]) || "—"
        )}
      </td>
      <td className="px-4 py-3 text-right">
        <span className="inline-flex flex-wrap justify-end gap-2">
          {aceitaResposta && pessoa.status !== "SUGERIDA" && pessoa.status !== "CANCELADA" && (
            <BotaoLink href={hrefResponder} tamanho="pequeno" scroll={false} aria-label={`Registrar resposta de ${pessoa.nome}`}>
              Registrar resposta
            </BotaoLink>
          )}
          {editavel && ativa && (
            <MenuMaisAcoes
              rotulo={`Mais ações para ${pessoa.nome}`}
              itens={[{ rotulo: "Remover da escala", perigo: true, aoEscolher: () => setRemovendo(true) }]}
            />
          )}
        </span>
        {editavel && ativa && (
          <Confirmacao
            aberto={removendo}
            aoFechar={() => setRemovendo(false)}
            titulo={`Remover ${pessoa.nome} da escala?`}
            descricao={
              avisada ? "A vaga volta a ficar aberta. A copy já foi enviada para essa pessoa: avise que ela saiu da escala." : "A vaga volta a ficar aberta."
            }
            rotuloConfirmar="Remover"
            destrutiva
            carregando={tirar.pendente}
            acao={tirar.despachar}
          >
            <input type="hidden" name="eventoId" value={eventoId} />
            <input type="hidden" name="convocacaoId" value={pessoa.id} />
          </Confirmacao>
        )}
      </td>
    </tr>
  );
}

export function EquipeDaFuncao({
  eventoId,
  titulo,
  escalaId,
  quantidade,
  ativas,
  pessoas,
  editavel,
  aceitaResposta,
  deslocamentoEditavel,
  caminho,
}: {
  eventoId: string;
  titulo: string;
  escalaId: string;
  quantidade: number;
  ativas: number;
  pessoas: PessoaNaEscala[];
  editavel: boolean;
  aceitaResposta: boolean;
  deslocamentoEditavel: boolean;
  /** Endereço da Montar escala; os painéis abrem com ?vaga= e ?responder=. */
  caminho: string;
}) {
  const abertas = Math.max(0, quantidade - ativas);
  const idDoTitulo = `equipe-${escalaId}`;
  return (
    <section aria-labelledby={idDoTitulo} className="rounded-[var(--ds-radius-lg)] bg-[var(--ds-surface)] shadow-[var(--ds-shadow-1)]">
      <h3 id={idDoTitulo} className="px-5 pt-4 pb-2 text-[15px] font-semibold">
        {titulo} · {Math.min(ativas, quantidade)} de {quantidade}
      </h3>
      <div className="relative overflow-x-auto">
        <table className="w-full min-w-[820px] border-collapse text-[14px]">
          <caption className="sr-only">
            Equipe de {titulo}: {Math.min(ativas, quantidade)} de {quantidade} vagas preenchidas
          </caption>
          <thead className="bg-[var(--ds-surface-1)]">
            <tr>
              {["Pessoa", "Situação"].map((coluna) => (
                <th key={coluna} scope="col" className="px-4 py-2.5 text-left text-[12px] font-medium text-[var(--ds-label-2)]">
                  {coluna}
                </th>
              ))}
              <th scope="col" className="px-4 py-2.5 text-right text-[12px] font-medium text-[var(--ds-label-2)]">
                Distância
              </th>
              <th scope="col" className="px-4 py-2.5 text-left text-[12px] font-medium text-[var(--ds-label-2)]">
                Deslocamento
              </th>
              <th scope="col" className="px-4 py-2.5 text-right text-[12px] font-medium text-[var(--ds-label-2)]">
                Ações
              </th>
            </tr>
          </thead>
          <tbody>
            {pessoas.map((pessoa) => (
              <LinhaDaPessoa
                key={pessoa.id}
                eventoId={eventoId}
                pessoa={pessoa}
                editavel={editavel}
                aceitaResposta={aceitaResposta}
                deslocamentoEditavel={deslocamentoEditavel}
                hrefResponder={`${caminho}?responder=${pessoa.id}`}
              />
            ))}
            {abertas > 0 && (
              <tr className="border-t border-dashed border-[var(--ds-separator)]">
                <td colSpan={4} className="px-4 py-3 text-[var(--ds-label-2)]">
                  {abertas === 1 ? "1 vaga aberta" : `${abertas} vagas abertas`}
                  {!editavel && ". Para preencher, a escala precisa estar em rascunho ou devolvida."}
                </td>
                <td className="px-4 py-3 text-right">
                  {editavel && (
                    <BotaoLink href={`${caminho}?vaga=${escalaId}`} scroll={false} variante="primario" tamanho="pequeno" icone={<UserPlus size={16} aria-hidden />}>
                      Adicionar pessoa
                    </BotaoLink>
                  )}
                </td>
              </tr>
            )}
            {pessoas.length === 0 && abertas === 0 && (
              <tr className="border-t border-[var(--ds-separator)]">
                <td colSpan={5} className="px-4 py-3 text-[var(--ds-label-2)]">
                  Sem vagas nesta função.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}
