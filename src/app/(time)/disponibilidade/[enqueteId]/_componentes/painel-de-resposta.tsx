"use client";

import { useRouter } from "next/navigation";
import { useId, useMemo, useState } from "react";

import { Aviso, Botao, CampoDeSelecao, FaixaEmNomeDe, PainelLateral, useAcao } from "@/app/(time)/_componentes/ui";
import type { Resposta } from "@/modules/disponibilidade";

import { registrarRespostaAcao } from "../acoes";

export type PessoaDoPainel = { pessoaId: string; nome: string; funcoes: string };
export type EventoDoPainel = { id: string; rotulo: string; data: string };
export type OpcaoDeResposta = { valor: Resposta; rotulo: string };

function semResposta(eventos: EventoDoPainel[]): Record<string, Resposta> {
  return Object.fromEntries(eventos.map((evento) => [evento.id, "SEM_RESPOSTA" as Resposta]));
}

/** Registrar resposta em nome da pessoa (doc 08 §8.3). Aberto por ?registrar=<pessoaId> (ou "nova") na URL. */
export function PainelDeResposta({
  aberto,
  pessoaInicial,
  enqueteId,
  pessoas,
  eventos,
  respostasPorPessoa,
  opcoes,
  foraDoPrazo,
  hrefFechar,
}: {
  aberto: boolean;
  pessoaInicial: string | null;
  enqueteId: string;
  pessoas: PessoaDoPainel[];
  eventos: EventoDoPainel[];
  respostasPorPessoa: Record<string, Record<string, Resposta>>;
  opcoes: OpcaoDeResposta[];
  foraDoPrazo: boolean;
  hrefFechar: string;
}) {
  const router = useRouter();
  const idDoFormulario = useId();
  const { estado, despachar, pendente } = useAcao(registrarRespostaAcao, () => router.replace(hrefFechar, { scroll: false }));
  const [pessoaId, setPessoaId] = useState(pessoaInicial ?? "");
  const originais = useMemo(() => ({ ...semResposta(eventos), ...respostasPorPessoa[pessoaId] }), [eventos, respostasPorPessoa, pessoaId]);
  const [respostas, setRespostas] = useState<Record<string, Resposta>>(originais);

  const pessoa = pessoas.find((item) => item.pessoaId === pessoaId);
  const alterado = eventos.some((evento) => respostas[evento.id] !== originais[evento.id]);

  function fechar() {
    router.replace(hrefFechar, { scroll: false });
  }

  function trocarPessoa(id: string) {
    setPessoaId(id);
    setRespostas({ ...semResposta(eventos), ...respostasPorPessoa[id] });
  }

  const marcarTodos = (resposta: Resposta) => setRespostas(Object.fromEntries(eventos.map((evento) => [evento.id, resposta])));
  const erro = estado.ok ? null : estado.erro;
  const errosDaPessoa = estado.ok ? undefined : estado.campos?.pessoaId;

  return (
    <PainelLateral
      aberto={aberto}
      aoFechar={fechar}
      titulo="Registrar resposta"
      subtitulo="Em nome da pessoa, com o selo “Registrado pelo time”."
      alteracoesNaoSalvas={alterado && !pendente}
      rodape={
        <>
          <Botao onClick={fechar}>Cancelar</Botao>
          <Botao type="submit" form={idDoFormulario} variante="primario" carregando={pendente} textoCarregando="Registrando…">
            Registrar resposta
          </Botao>
        </>
      }
    >
      <form id={idDoFormulario} action={despachar} className="flex flex-col gap-4">
        <input type="hidden" name="enqueteId" value={enqueteId} />
        {erro && (
          <Aviso tom="perigo" alerta>
            {erro}
          </Aviso>
        )}
        <CampoDeSelecao
          nome="pessoaId"
          rotulo="Pessoa"
          obrigatorio
          value={pessoaId}
          onChange={(evento) => trocarPessoa(evento.target.value)}
          vazio="Escolha a pessoa"
          opcoes={pessoas.map((item) => ({ valor: item.pessoaId, rotulo: item.funcoes ? `${item.nome} — ${item.funcoes}` : item.nome }))}
          erros={errosDaPessoa}
        />
        {pessoa && <FaixaEmNomeDe nome={pessoa.nome} className="" />}
        {foraDoPrazo && <Aviso tom="neutro">A enquete já encerrou: a resposta fica registrada como fora do prazo.</Aviso>}

        <div className="flex flex-wrap gap-2">
          <Botao tamanho="pequeno" onClick={() => marcarTodos("PODE")}>
            Pode em todos
          </Botao>
          <Botao tamanho="pequeno" onClick={() => marcarTodos("NAO_PODE")}>
            Não pode em nenhum
          </Botao>
        </div>

        {eventos.map((evento, indice) => (
          <fieldset key={evento.id} className="rounded-[var(--ds-radius-md)] border border-[var(--ds-separator)] px-4 py-3">
            <legend className="px-1 text-[14px] font-semibold">
              {evento.rotulo} <span className="font-normal text-[var(--ds-label-2)]">· {evento.data}</span>
            </legend>
            <input type="hidden" name={`respostas[${indice}].eventoId`} value={evento.id} />
            <div className="flex flex-wrap gap-x-5">
              {opcoes.map((opcao) => (
                <label key={opcao.valor} className="flex min-h-11 cursor-pointer items-center gap-2 text-[14px]">
                  <input
                    type="radio"
                    name={`respostas[${indice}].resposta`}
                    value={opcao.valor}
                    checked={respostas[evento.id] === opcao.valor}
                    onChange={() => setRespostas((atuais) => ({ ...atuais, [evento.id]: opcao.valor }))}
                    className="h-[18px] w-[18px] accent-[var(--ds-brand)]"
                  />
                  {opcao.rotulo}
                </label>
              ))}
            </div>
          </fieldset>
        ))}
      </form>
    </PainelLateral>
  );
}
