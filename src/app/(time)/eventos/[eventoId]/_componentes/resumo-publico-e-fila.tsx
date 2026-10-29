"use client";

import { type KeyboardEvent, useActionState, useEffect, useRef, useState } from "react";

import type { ResultadoAcao } from "../../../_servidor/formulario";
import { CampoDeTexto } from "../../../_componentes/ui/campo";
import { type EstadoDoSalvamento, IndicadorDeSalvamento } from "../../../_componentes/ui/indicador-de-salvamento";
import { useToastDoResultado } from "../../../_componentes/ui/toast";

type Acao = (estado: ResultadoAcao, form: FormData) => Promise<ResultadoAcao>;

const texto = (valor: number | null) => (valor === null ? "" : String(valor));

/** Salva ao sair do campo (doc 08 §3.6); em erro o valor digitado fica. */
export function PublicoEFila({
  acao,
  eventoId,
  atualizadoEm,
  expectativaPublico,
  pessoasNaFila,
  usaFila,
  editavel,
}: {
  acao: Acao;
  eventoId: string;
  atualizadoEm: string;
  expectativaPublico: number | null;
  pessoasNaFila: number | null;
  usaFila: boolean;
  editavel: boolean;
}) {
  const [estado, despachar, pendente] = useActionState(acao, { ok: true } as ResultadoAcao);
  useToastDoResultado(estado);
  const formulario = useRef<HTMLFormElement>(null);
  const [salvamento, setSalvamento] = useState<EstadoDoSalvamento>({ situacao: "ocioso" });
  const [publico, setPublico] = useState(texto(expectativaPublico));
  const [naFila, setNaFila] = useState(texto(pessoasNaFila));
  const salvos = useRef({ publico: texto(expectativaPublico), naFila: texto(pessoasNaFila) });
  const anterior = useRef(estado);

  useEffect(() => {
    if (pendente) setSalvamento({ situacao: "salvando" });
  }, [pendente]);

  useEffect(() => {
    if (estado === anterior.current) return;
    anterior.current = estado;
    setSalvamento(estado.ok ? { situacao: "salvo", em: new Date() } : { situacao: "erro" });
    if (estado.ok) salvos.current = { publico, naFila };
  }, [estado, publico, naFila]);

  useEffect(() => {
    if (window.location.hash === "#fila") document.getElementById("campo-pessoasNaFila")?.focus();
  }, []);

  function salvarComEnter(evento: KeyboardEvent<HTMLInputElement>) {
    if (evento.key !== "Enter") return;
    evento.preventDefault();
    salvarSeMudou();
  }

  function salvarSeMudou() {
    if (publico.trim() === salvos.current.publico && naFila.trim() === salvos.current.naFila) return;
    formulario.current?.requestSubmit();
  }

  const erros = estado.ok ? {} : (estado.campos ?? {});
  if (!editavel) {
    return (
      <dl className="grid gap-3 text-[14px]">
        <div>
          <dt className="text-[12px] text-[var(--ds-label-2)]">Expectativa de público</dt>
          <dd className="tabular-nums">{expectativaPublico ?? "Não informada"}</dd>
        </div>
        {usaFila && (
          <div>
            <dt className="text-[12px] text-[var(--ds-label-2)]">Pessoas na fila</dt>
            <dd className="tabular-nums">{pessoasNaFila ?? "Não informada"}</dd>
          </div>
        )}
      </dl>
    );
  }

  return (
    <form ref={formulario} action={despachar} className="grid gap-4" onSubmit={() => setSalvamento({ situacao: "salvando" })}>
      <input type="hidden" name="eventoId" value={eventoId} />
      <input type="hidden" name="atualizadoEm" value={atualizadoEm} />
      <CampoDeTexto
        nome="expectativaPublico"
        rotulo="Expectativa de público"
        numerico
        value={publico}
        onChange={(evento) => setPublico(evento.target.value)}
        onBlur={salvarSeMudou}
        onKeyDown={salvarComEnter}
        erros={erros.expectativaPublico}
        ajuda="Vem do IAM Control (o maior entre a meta e os inscritos ativos). Corrija se souber de um número melhor. Muda a sugestão de líderes."
      />
      {usaFila && (
        <div id="fila">
          <CampoDeTexto
            nome="pessoasNaFila"
            rotulo="Pessoas na fila"
            numerico
            value={naFila}
            onChange={(evento) => setNaFila(evento.target.value)}
            onBlur={salvarSeMudou}
            onKeyDown={salvarComEnter}
            erros={erros.pessoasNaFila}
            ajuda="Usada para calcular as vagas de pai e mãe (1 a cada 15 pessoas)."
          />
        </div>
      )}
      <IndicadorDeSalvamento estado={salvamento} aoTentarDeNovo={() => formulario.current?.requestSubmit()} />
    </form>
  );
}
