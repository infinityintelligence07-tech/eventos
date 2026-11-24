"use client";

import { ExternalLink, Trash2, TriangleAlert, UserPlus } from "lucide-react";
import Link from "next/link";
import { useState } from "react";

import type { ConvocacaoDaTela, Deslocamento, StatusConvocacao } from "@/modules/escala";

import { useAcao } from "@/app/(time)/_componentes/ui";
import { Botao } from "../../../../_componentes/ui/botao";
import { BotaoLink } from "../../../../_componentes/ui/botao-link";
import { Confirmacao } from "../../../../_componentes/ui/dialogo";
import { RotulosDasCelulas } from "../../../../_componentes/ui/rotulos-das-celulas";
import { distancia } from "../../../../_componentes/ui/formatos";
import { Chip } from "../../../../_componentes/ui/situacao";
import { atualizarConvocacao, tirarDaVaga } from "../acoes";

// Componente do navegador: de @/modules/escala só entram tipos (o módulo carrega código de servidor).

type PessoaNaEscala = ConvocacaoDaTela;

const ROTULO_DO_DESLOCAMENTO: Record<Deslocamento, string> = {
  CARRO_PROPRIO: "Carro próprio",
  CARONA: "Carona",
  CARRO_IAM: "Carro da IAM",
  UBER: "Uber",
  ONIBUS: "Ônibus",
  VOO: "Avião",
};

/** Na escala (ocupa a vaga). Quem está na escala conta como confirmado: a tela não mostra nem pede situação. */
function naEscala(status: StatusConvocacao): boolean {
  switch (status) {
    case "SUGERIDA":
    case "CONVIDADA":
    case "ACEITA":
      return true;
    case "RECUSADA":
    case "CANCELADA":
      return false;
    default: {
      const desconhecido: never = status;
      throw new Error(`status de convocação desconhecido: ${String(desconhecido)}`);
    }
  }
}

const SELETOR = "h-8 rounded-[8px] border border-[var(--ds-separator)] bg-[var(--ds-surface)] pl-2 pr-7 text-[13px]";

/** Caixa de seleção que salva ao marcar (montagem e hotel). Sem permissão de mudar, vira "Sim" ou "—". */
function MarcacaoDaPessoa({
  eventoId,
  pessoa,
  campo,
  marcada,
  rotulo,
  editavel,
}: {
  eventoId: string;
  pessoa: PessoaNaEscala;
  campo: "montagem" | "hotel";
  marcada: boolean;
  rotulo: string;
  editavel: boolean;
}) {
  const { despachar } = useAcao(atualizarConvocacao, { toastDeCampo: true });
  if (!editavel) return marcada ? "Sim" : "—";
  return (
    <form action={despachar}>
      <input type="hidden" name="eventoId" value={eventoId} />
      <input type="hidden" name="convocacaoId" value={pessoa.id} />
      <input type="hidden" name="campo" value={campo} />
      <label className="inline-flex items-center">
        <span className="sr-only">{rotulo}</span>
        {/* key: depois de salvar, o campo remonta com o valor do servidor (o formulário volta ao valor antigo ao concluir a action). */}
        <input
          key={String(marcada)}
          type="checkbox"
          name={campo}
          value="sim"
          defaultChecked={marcada}
          className="h-4 w-4 accent-[var(--ds-brand)]"
          onChange={(evento) => evento.currentTarget.form?.requestSubmit()}
        />
      </label>
    </form>
  );
}

function LinhaDaPessoa({
  eventoId,
  pessoa,
  editavel,
  deslocamentoEditavel,
}: {
  eventoId: string;
  pessoa: PessoaNaEscala;
  editavel: boolean;
  deslocamentoEditavel: boolean;
}) {
  const [removendo, setRemovendo] = useState(false);
  const tirar = useAcao(tirarDaVaga, { aoConcluir: () => setRemovendo(false), toastDeCampo: true });
  const deslocamento = useAcao(atualizarConvocacao, { toastDeCampo: true });
  const emOutraFuncao = pessoa.outrasFuncoes.length > 0 ? " (vale para todas as funções dela neste evento)" : "";

  return (
    <tr className="border-t border-[var(--ds-separator)]">
      <th scope="row" className="px-4 py-3 text-left font-medium">
        <Link href={`/pessoas/${pessoa.pessoaId}`} target="_blank" className="inline-flex items-center gap-1 hover:underline" aria-label={`${pessoa.nome} (abre em nova aba)`}>
          {pessoa.nome}
          <ExternalLink size={14} aria-hidden />
        </Link>
        {pessoa.nivel === "TRAINEE" && (
          <span className="ml-2 rounded-full bg-[var(--ds-fill-4)] px-1.5 py-0.5 text-[11px] font-medium text-[var(--ds-label-2)]">Trainee</span>
        )}
        {pessoa.nivel === null && !pessoa.cargoDoEvento && (
          <span className="ml-2 rounded-full bg-[var(--ds-orange-soft)] px-1.5 py-0.5 text-[11px] font-medium text-[var(--ds-orange-deep)]">Não habilitado</span>
        )}
        {(pessoa.outrasFuncoes.length > 0 || pessoa.conflitos.length > 0) && (
          <span className="mt-1 flex flex-wrap items-center gap-1 font-normal">
            {pessoa.outrasFuncoes.length > 0 && <Chip tom="informacao">Também: {pessoa.outrasFuncoes.join(", ")}</Chip>}
            {pessoa.conflitos.length > 0 && (
              <Chip tom="atencao" icone={<TriangleAlert size={14} aria-hidden />}>
                Também em {pessoa.conflitos.join(", ")}
              </Chip>
            )}
          </span>
        )}
      </th>
      <td className="whitespace-nowrap px-4 py-3 text-right tabular-nums">{pessoa.distanciaKm !== null ? distancia(pessoa.distanciaKm) : "—"}</td>
      <td className="px-4 py-3">
        {deslocamentoEditavel ? (
          <form action={deslocamento.despachar}>
            <input type="hidden" name="eventoId" value={eventoId} />
            <input type="hidden" name="convocacaoId" value={pessoa.id} />
            <input type="hidden" name="campo" value="deslocamento" />
            <label>
              <span className="sr-only">
                Deslocamento de {pessoa.nome}
                {emOutraFuncao}
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
        <MarcacaoDaPessoa eventoId={eventoId} pessoa={pessoa} campo="montagem" marcada={pessoa.montagem} rotulo={`${pessoa.nome} participa da montagem`} editavel={deslocamentoEditavel} />
      </td>
      <td className="px-4 py-3 text-center">
        <MarcacaoDaPessoa
          eventoId={eventoId}
          pessoa={pessoa}
          campo="hotel"
          marcada={pessoa.precisaHotel}
          rotulo={`${pessoa.nome} precisa de hotel${emOutraFuncao}`}
          editavel={deslocamentoEditavel}
        />
      </td>
      <td className="px-4 py-3 text-right">
        {editavel && (
          <>
            <Botao variante="icone" tamanho="pequeno" aria-label={`Remover ${pessoa.nome} da escala`} onClick={() => setRemovendo(true)} icone={<Trash2 size={16} aria-hidden />} />
            <Confirmacao
              aberto={removendo}
              aoFechar={() => setRemovendo(false)}
              titulo={`Remover ${pessoa.nome} da escala?`}
              descricao={
                pessoa.avisada ? "A vaga volta a ficar aberta. A copy já foi enviada para essa pessoa: avise que ela saiu da escala." : "A vaga volta a ficar aberta."
              }
              rotuloConfirmar="Remover"
              destrutiva
              carregando={tirar.pendente}
              acao={tirar.despachar}
            >
              <input type="hidden" name="eventoId" value={eventoId} />
              <input type="hidden" name="convocacaoId" value={pessoa.id} />
            </Confirmacao>
          </>
        )}
      </td>
    </tr>
  );
}

/** Quem saiu desta função (dados antigos de "não pode" e quem foi removida depois de avisada): só o nome e o motivo. */
function textoDeQuemSaiu(pessoa: PessoaNaEscala): string {
  if (pessoa.status === "RECUSADA") return pessoa.motivoRecusa ? `${pessoa.nome} (não pode: ${pessoa.motivoRecusa})` : `${pessoa.nome} (não pode)`;
  return `${pessoa.nome} (removida)`;
}

export function EquipeDaFuncao({
  eventoId,
  titulo,
  escalaId,
  quantidade,
  ativas,
  pessoas,
  editavel,
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
  deslocamentoEditavel: boolean;
  /** Endereço da Montar escala; o painel de sugestões abre com ?vaga=. */
  caminho: string;
}) {
  const abertas = Math.max(0, quantidade - ativas);
  const idDoTitulo = `equipe-${escalaId}`;
  const daEscala = pessoas.filter((pessoa) => naEscala(pessoa.status));
  const sairam = pessoas.filter((pessoa) => !naEscala(pessoa.status));
  return (
    <section aria-labelledby={idDoTitulo} className="rounded-[var(--ds-radius-lg)] bg-[var(--ds-surface)] shadow-[var(--ds-shadow-1)]">
      <h3 id={idDoTitulo} className="px-5 pt-4 pb-2 text-[15px] font-semibold">
        {titulo} · {Math.min(ativas, quantidade)} de {quantidade}
      </h3>
      <div className="tabela-em-cartoes relative overflow-x-auto">
        <RotulosDasCelulas />
        <table className="w-full min-w-[760px] border-collapse text-[14px]">
          <caption className="sr-only">
            Equipe de {titulo}: {Math.min(ativas, quantidade)} de {quantidade} vagas preenchidas
          </caption>
          <thead className="bg-[var(--ds-surface-1)]">
            <tr>
              <th scope="col" className="px-4 py-2.5 text-left text-[12px] font-medium text-[var(--ds-label-2)]">
                Pessoa
              </th>
              <th scope="col" className="px-4 py-2.5 text-right text-[12px] font-medium text-[var(--ds-label-2)]">
                Distância
              </th>
              <th scope="col" className="px-4 py-2.5 text-left text-[12px] font-medium text-[var(--ds-label-2)]">
                Deslocamento
              </th>
              <th scope="col" className="px-4 py-2.5 text-center text-[12px] font-medium text-[var(--ds-label-2)]">
                Montagem
              </th>
              <th scope="col" className="px-4 py-2.5 text-center text-[12px] font-medium text-[var(--ds-label-2)]">
                Hotel
              </th>
              <th scope="col" className="px-4 py-2.5 text-right text-[12px] font-medium text-[var(--ds-label-2)]">
                <span className="sr-only">Remover</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {daEscala.map((pessoa) => (
              <LinhaDaPessoa key={pessoa.id} eventoId={eventoId} pessoa={pessoa} editavel={editavel} deslocamentoEditavel={deslocamentoEditavel} />
            ))}
            {abertas > 0 && (
              <tr className="border-t border-dashed border-[var(--ds-separator)]">
                <td colSpan={5} className="px-4 py-3 text-[var(--ds-label-2)]">
                  {abertas === 1 ? "1 vaga aberta" : `${abertas} vagas abertas`}
                  {!editavel && ". Para preencher, a escala precisa estar em andamento ou devolvida."}
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
            {daEscala.length === 0 && abertas === 0 && (
              <tr className="border-t border-[var(--ds-separator)]">
                <td colSpan={6} className="px-4 py-3 text-[var(--ds-label-2)]">
                  Sem vagas nesta função.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      {sairam.length > 0 && (
        <p className="border-t border-[var(--ds-separator)] px-5 py-3 text-[12px] text-[var(--ds-label-2)]">Saíram desta função: {sairam.map(textoDeQuemSaiu).join("; ")}.</p>
      )}
    </section>
  );
}
