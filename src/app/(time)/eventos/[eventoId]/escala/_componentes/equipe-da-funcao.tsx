"use client";

import { CircleCheck, CircleX, Clock, ExternalLink, TriangleAlert, UserMinus, UserPlus } from "lucide-react";
import Link from "next/link";
import { useState } from "react";

import type { Deslocamento, LIMITE_DA_OBSERVACAO as LimiteDaObservacao, StatusConvocacao } from "@/modules/escala";

import { useAcao } from "@/app/(time)/_componentes/ui";
import { BotaoLink } from "../../../../_componentes/ui/botao-link";
import { Confirmacao } from "../../../../_componentes/ui/dialogo";
import { distancia } from "../../../../_componentes/ui/formatos";
import { SeloRegistradoPeloTime } from "../../../../_componentes/ui/selo";
import { Chip, type TomDoChip } from "../../../../_componentes/ui/situacao";
import { atualizarConvocacao, tirarDaVaga } from "../acoes";
import { MenuMaisAcoes } from "./menu-mais-acoes";

// Componente do navegador: de @/modules/escala só entram tipos (o módulo carrega código de servidor).
// O tipo literal amarra este número ao limite da validação: se um mudar sem o outro, não compila.
const LIMITE_DA_OBSERVACAO: typeof LimiteDaObservacao = 500;

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
  montagem: boolean;
  observacao: string | null;
  distanciaKm: number | null;
  conflitos: string[];
  principal: boolean;
  outrasFuncoes: string[];
};

export const ROTULO_DO_DESLOCAMENTO: Record<Deslocamento, string> = {
  CARRO_PROPRIO: "Carro próprio",
  CARONA: "Carona",
  CARRO_IAM: "Carro da IAM",
  UBER: "Uber",
  ONIBUS: "Ônibus",
  VOO: "Avião",
  MOTO: "Moto",
  A_PE: "A pé",
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
  const [anotando, setAnotando] = useState(false);
  const tirar = useAcao(tirarDaVaga, { aoConcluir: () => setRemovendo(false), toastDeCampo: true });
  const deslocamento = useAcao(atualizarConvocacao, { toastDeCampo: true });
  const montagem = useAcao(atualizarConvocacao, { toastDeCampo: true });
  const observacao = useAcao(atualizarConvocacao, { aoConcluir: () => setAnotando(false), toastDeCampo: true });
  const idDaObservacao = `observacao-${pessoa.id}`;
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
          {pessoa.outrasFuncoes.length > 0 && ativa && <Chip tom="informacao">Também: {pessoa.outrasFuncoes.join(", ")}</Chip>}
          {pessoa.conflitos.length > 0 && ativa && (
            <Chip tom="atencao" icone={<TriangleAlert size={14} aria-hidden />}>
              Também em {pessoa.conflitos.join(", ")}
            </Chip>
          )}
        </span>
        {pessoa.status === "RECUSADA" && pessoa.motivoRecusa && <span className="mt-1 block text-[12px]">Motivo: {pessoa.motivoRecusa}</span>}
        {pessoa.observacao && <span className="mt-1 block text-[12px] text-[var(--ds-label-2)]">Obs.: {pessoa.observacao}</span>}
      </td>
      <td className="whitespace-nowrap px-4 py-3 text-right tabular-nums">{pessoa.distanciaKm !== null ? distancia(pessoa.distanciaKm) : "—"}</td>
      <td className="px-4 py-3">
        {ativa && deslocamentoEditavel ? (
          <form action={deslocamento.despachar}>
            <input type="hidden" name="eventoId" value={eventoId} />
            <input type="hidden" name="convocacaoId" value={pessoa.id} />
            <input type="hidden" name="campo" value="deslocamento" />
            <label>
              <span className="sr-only">
                Deslocamento de {pessoa.nome}
                {pessoa.outrasFuncoes.length > 0 ? " (vale para todas as funções dela neste evento)" : ""}
              </span>
              {/* key: depois de salvar, o campo remonta com o valor do servidor (o formulário volta ao valor antigo ao concluir a action). */}
              <select
                key={pessoa.deslocamento ?? ""}
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
      <td className="px-4 py-3 text-center">
        {ativa && deslocamentoEditavel ? (
          <form action={montagem.despachar}>
            <input type="hidden" name="eventoId" value={eventoId} />
            <input type="hidden" name="convocacaoId" value={pessoa.id} />
            <input type="hidden" name="campo" value="montagem" />
            <label className="inline-flex items-center">
              <span className="sr-only">{pessoa.nome} participa da montagem</span>
              <input
                key={String(pessoa.montagem)}
                type="checkbox"
                name="montagem"
                value="sim"
                defaultChecked={pessoa.montagem}
                className="h-4 w-4 accent-[var(--ds-brand)]"
                onChange={(evento) => evento.currentTarget.form?.requestSubmit()}
              />
            </label>
          </form>
        ) : pessoa.montagem ? (
          "Sim"
        ) : (
          "—"
        )}
      </td>
      <td className="px-4 py-3 text-right">
        <span className="inline-flex flex-wrap justify-end gap-2">
          {aceitaResposta && pessoa.status !== "SUGERIDA" && pessoa.status !== "CANCELADA" && (
            <BotaoLink href={hrefResponder} tamanho="pequeno" scroll={false} aria-label={`Registrar resposta de ${pessoa.nome}`}>
              Registrar resposta
            </BotaoLink>
          )}
          {ativa && (editavel || deslocamentoEditavel) && (
            <MenuMaisAcoes
              rotulo={`Mais ações para ${pessoa.nome}`}
              itens={[
                ...(deslocamentoEditavel ? [{ rotulo: pessoa.observacao ? "Editar observação" : "Adicionar observação", aoEscolher: () => setAnotando(true) }] : []),
                ...(editavel ? [{ rotulo: "Remover da escala", perigo: true, aoEscolher: () => setRemovendo(true) }] : []),
              ]}
            />
          )}
        </span>
        {ativa && deslocamentoEditavel && (
          <Confirmacao
            aberto={anotando}
            aoFechar={() => setAnotando(false)}
            titulo={`Observação de ${pessoa.nome}`}
            descricao="Aparece na escala para o time. Exemplos: meio período, só montagem, ida de ônibus e volta de carona."
            rotuloConfirmar="Salvar"
            carregando={observacao.pendente}
            acao={observacao.despachar}
          >
            <input type="hidden" name="eventoId" value={eventoId} />
            <input type="hidden" name="convocacaoId" value={pessoa.id} />
            <input type="hidden" name="campo" value="observacao" />
            <label htmlFor={idDaObservacao} className="mb-1 block text-left text-[13px] font-medium">
              Observação
            </label>
            <textarea
              id={idDaObservacao}
              name="observacao"
              defaultValue={pessoa.observacao ?? ""}
              maxLength={LIMITE_DA_OBSERVACAO}
              rows={3}
              className="w-full rounded-[8px] border border-[var(--ds-separator)] bg-[var(--ds-surface)] px-3 py-2 text-[14px]"
            />
            <span className="mt-1 block text-left text-[12px] text-[var(--ds-label-2)]">Deixe em branco para apagar. Até {LIMITE_DA_OBSERVACAO} caracteres.</span>
          </Confirmacao>
        )}
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
        <table className="w-full min-w-[900px] border-collapse text-[14px]">
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
              <th scope="col" className="px-4 py-2.5 text-center text-[12px] font-medium text-[var(--ds-label-2)]">
                Montagem
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
                <td colSpan={5} className="px-4 py-3 text-[var(--ds-label-2)]">
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
                <td colSpan={6} className="px-4 py-3 text-[var(--ds-label-2)]">
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
