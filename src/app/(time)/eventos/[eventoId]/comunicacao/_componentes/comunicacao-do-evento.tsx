"use client";

import { Check, CheckCheck, Copy, MessageCircle } from "lucide-react";
import Link from "next/link";
import { type KeyboardEvent, useEffect, useRef, useState, useTransition } from "react";

import { Aviso, Botao, Chip, CARTAO, formatar, TITULO_DE_SECAO, useToast } from "@/app/(time)/_componentes/ui";
import type { CopyNaTela, FaltaNaCopy } from "@/fluxos/comunicacao";
import type { OndePreencher } from "@/modules/comunicacao";

import { marcarCopyComoEnviada } from "../acoes";
import { ChipDaCopy } from "./chip-da-copy";

const ACAO_NAO_EXECUTADA = { ok: true } as const;
const ID_DO_COPIAR = "copiar-copy";

type Destino = { rotulo: string; href: string | null };

function ondePreencher(onde: OndePreencher | null, copy: CopyNaTela): Destino | null {
  switch (onde) {
    case "PESSOAS":
      return { rotulo: "Preencher em Pessoas", href: `/pessoas/${copy.pessoaId}` };
    case "LOGISTICA":
      return { rotulo: "Preencher em Logística", href: `/eventos/${copy.eventoId}/logistica` };
    case "ESCALA":
      return { rotulo: "Preencher na Escala", href: `/eventos/${copy.eventoId}/escala` };
    case "EVENTO":
      return { rotulo: "Preencher no Resumo do evento", href: `/eventos/${copy.eventoId}` };
    case "CONFIGURACOES":
      return { rotulo: "Preencher em Configurações", href: "/configuracoes/modelos-de-copy" };
    case "IAM_CONTROL":
      return { rotulo: "Vem do IAM Control: corrija lá", href: null };
    case "AUTOMATICO":
    case null:
      return null;
    default: {
      const desconhecido: never = onde;
      throw new Error(`lugar desconhecido: ${String(desconhecido)}`);
    }
  }
}

function listar(itens: string[]): string {
  return itens.length <= 1 ? (itens[0] ?? "") : `${itens.slice(0, -1).join(", ")} e ${itens.at(-1)}`;
}

function destinosDasFaltas(faltando: FaltaNaCopy[], copy: CopyNaTela): Destino[] {
  const vistos = new Map<string, Destino>();
  for (const falta of faltando) {
    const destino = ondePreencher(falta.onde, copy);
    if (destino) vistos.set(destino.rotulo, destino);
  }
  return [...vistos.values()];
}

const pedeEnvio = (copy: CopyNaTela) => copy.situacao === "PRONTA" || copy.situacao === "DESATUALIZADA";

/** A próxima pessoa que ainda pede envio, depois da atual (dá a volta na lista). */
function proximaParaEnviar(pessoas: CopyNaTela[], atual: string): string | null {
  const indice = pessoas.findIndex((pessoa) => pessoa.convocacaoId === atual);
  const depois = [...pessoas.slice(indice + 1), ...pessoas.slice(0, Math.max(indice, 0))];
  return depois.find(pedeEnvio)?.convocacaoId ?? null;
}

export function ComunicacaoDoEvento({
  pessoas,
  modelo,
  rotuloDoModelo,
  escritaLiberada,
  selecionadaInicial,
}: {
  pessoas: CopyNaTela[];
  modelo: { id: string; nome: string };
  rotuloDoModelo: string;
  escritaLiberada: boolean;
  selecionadaInicial: string | null;
}) {
  const toast = useToast();
  const [selecionadaId, setSelecionadaId] = useState(selecionadaInicial ?? pessoas[0]?.convocacaoId ?? null);
  const [copiada, setCopiada] = useState<string | null>(null);
  const [focarCopiar, setFocarCopiar] = useState(false);
  const [enviando, iniciarEnvio] = useTransition();
  const textoRef = useRef<HTMLDivElement>(null);

  const selecionada = pessoas.find((pessoa) => pessoa.convocacaoId === selecionadaId) ?? pessoas[0] ?? null;

  useEffect(() => {
    if (!selecionada) return;
    const endereco = new URL(window.location.href);
    if (endereco.searchParams.get("pessoa") === selecionada.convocacaoId) return;
    endereco.searchParams.set("pessoa", selecionada.convocacaoId);
    window.history.replaceState(window.history.state, "", endereco);
  }, [selecionada]);

  useEffect(() => {
    if (!focarCopiar) return;
    document.getElementById(ID_DO_COPIAR)?.focus();
    setFocarCopiar(false);
  }, [focarCopiar, selecionada]);

  useEffect(() => {
    if (!copiada) return;
    const espera = setTimeout(() => setCopiada(null), 2000);
    return () => clearTimeout(espera);
  }, [copiada]);

  function moverSelecao(evento: KeyboardEvent<HTMLUListElement>) {
    if (evento.key !== "ArrowDown" && evento.key !== "ArrowUp") return;
    evento.preventDefault();
    const indice = pessoas.findIndex((pessoa) => pessoa.convocacaoId === selecionada?.convocacaoId);
    const proximo = pessoas[Math.min(Math.max(indice + (evento.key === "ArrowDown" ? 1 : -1), 0), pessoas.length - 1)];
    if (proximo) setSelecionadaId(proximo.convocacaoId);
  }

  function selecionarTexto() {
    const caixa = textoRef.current;
    if (!caixa) return;
    const intervalo = document.createRange();
    intervalo.selectNodeContents(caixa);
    const selecao = window.getSelection();
    selecao?.removeAllRanges();
    selecao?.addRange(intervalo);
  }

  async function copiar(copy: CopyNaTela) {
    try {
      await navigator.clipboard.writeText(copy.texto);
      setCopiada(copy.convocacaoId);
    } catch {
      selecionarTexto();
      toast.erro("Não foi possível copiar automaticamente. Selecione o texto e use Ctrl+C.");
    }
  }

  async function copiarTelefone(telefone: string) {
    try {
      await navigator.clipboard.writeText(telefone);
      toast.sucesso("Telefone copiado.");
    } catch {
      toast.erro("Não foi possível copiar o telefone. Selecione e use Ctrl+C.");
    }
  }

  function marcarComoEnviada(copy: CopyNaTela) {
    const proxima = proximaParaEnviar(pessoas, copy.convocacaoId);
    const form = new FormData();
    form.set("convocacaoId", copy.convocacaoId);
    form.set("modeloId", modelo.id);
    form.set("dadosHash", copy.dadosHash);
    iniciarEnvio(async () => {
      const resultado = await marcarCopyComoEnviada(ACAO_NAO_EXECUTADA, form);
      if (!resultado.ok) {
        toast.erro(resultado.erro, { rotulo: "Tentar de novo", aoClicar: () => marcarComoEnviada(copy) });
        return;
      }
      if (resultado.mensagem) toast.sucesso(resultado.mensagem);
      if (proxima) {
        setSelecionadaId(proxima);
        setFocarCopiar(true);
      }
    });
  }

  if (!selecionada) return null;

  const bloqueada = selecionada.situacao === "FALTA_DADO";
  const faltas = listar(selecionada.faltando.map((falta) => falta.rotulo));
  const motivoParaNaoMarcar = !escritaLiberada
    ? "Somente leitura neste ambiente."
    : bloqueada
      ? `Falta ${faltas}.`
      : selecionada.situacao === "ENVIADA"
        ? "Já marcada como enviada."
        : undefined;

  return (
    <div className="grid gap-3 lg:grid-cols-[minmax(320px,2fr)_3fr]">
      <section aria-labelledby="pessoas-da-escala" className={`${CARTAO} min-w-0 p-0`}>
        <h2 id="pessoas-da-escala" className="sr-only">
          Pessoas da escala
        </h2>
        <ul
          role="listbox"
          aria-label="Pessoas da escala"
          aria-activedescendant={`pessoa-${selecionada.convocacaoId}`}
          tabIndex={0}
          onKeyDown={moverSelecao}
          className="max-h-[320px] overflow-y-auto py-1 lg:max-h-[70vh]"
        >
          {pessoas.map((pessoa) => {
            const atual = pessoa.convocacaoId === selecionada.convocacaoId;
            return (
              <li
                key={pessoa.convocacaoId}
                id={`pessoa-${pessoa.convocacaoId}`}
                role="option"
                aria-selected={atual}
                onClick={() => setSelecionadaId(pessoa.convocacaoId)}
                className={`flex cursor-pointer items-center justify-between gap-3 border-l-[3px] px-4 py-2.5 ${
                  atual ? "border-[var(--ds-brand)] bg-[var(--ds-tint-soft)]" : "border-transparent hover:bg-[var(--ds-surface-1)]"
                }`}
              >
                <span className="min-w-0">
                  <span className="block truncate text-[14px] font-medium">{pessoa.nome}</span>
                  <span className="block truncate text-[12px] text-[var(--ds-label-2)]">{pessoa.funcao ?? "Sem função"}</span>
                </span>
                <ChipDaCopy situacao={pessoa.situacao} />
              </li>
            );
          })}
        </ul>
      </section>

      <section aria-labelledby="copy-da-pessoa" className={`${CARTAO} min-w-0 p-5`}>
        <div className="mb-3 flex flex-wrap items-start justify-between gap-2">
          <div className="min-w-0">
            <h2 id="copy-da-pessoa" aria-live="polite" className={TITULO_DE_SECAO}>
              {selecionada.nome}
            </h2>
            <p className="mt-0.5 text-[13px] text-[var(--ds-label-2)]">
              {[selecionada.funcao, `${formatar.dataCurta(selecionada.data)} · ${formatar.horario(selecionada.horaInicio, selecionada.horaFim)}`]
                .filter(Boolean)
                .join(" · ")}
            </p>
          </div>
          {selecionada.telefone && (
            <span className="inline-flex items-center gap-2 whitespace-nowrap text-[13px] tabular-nums">
              {selecionada.telefone}
              <Botao
                variante="icone"
                tamanho="pequeno"
                aria-label={`Copiar telefone de ${selecionada.nome}`}
                icone={<Copy size={16} aria-hidden />}
                onClick={() => copiarTelefone(selecionada.telefone!)}
              />
            </span>
          )}
        </div>

        {bloqueada && (
          <Aviso tom="atencao" className="mb-3" titulo={`Esta copy está bloqueada: falta ${faltas}.`}>
            <p className="text-[13px]">Ela libera sozinha quando o dado for preenchido.</p>
            <ul className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-[13px]">
              {destinosDasFaltas(selecionada.faltando, selecionada).map((destino) => (
                <li key={destino.rotulo}>
                  {destino.href ? (
                    <Link href={destino.href} className="font-medium text-[var(--ds-tint-text)] hover:underline">
                      {destino.rotulo}
                    </Link>
                  ) : (
                    destino.rotulo
                  )}
                </li>
              ))}
            </ul>
          </Aviso>
        )}
        {selecionada.situacao === "DESATUALIZADA" && selecionada.ultimaEnviada && (
          <Aviso tom="atencao" className="mb-3" titulo="Os dados mudaram depois do envio (escala, voo ou quarto).">
            <p className="text-[13px]">Copie de novo e reenvie. Enviada antes em {formatar.dataEHora(selecionada.ultimaEnviada.enviadaEm)}.</p>
          </Aviso>
        )}
        {selecionada.situacao === "ENVIADA" && selecionada.ultimaEnviada && (
          <Aviso tom="sucesso" className="mb-3">
            Marcada como enviada em {formatar.dataEHora(selecionada.ultimaEnviada.enviadaEm)} (
            {selecionada.ultimaEnviada.canal === "COPIADO" ? "copiada" : "pelo WhatsApp"}).
          </Aviso>
        )}

        <div
          ref={textoRef}
          aria-label={`Copy de ${selecionada.nome}`}
          className="whitespace-pre-wrap rounded-[var(--ds-radius-md)] bg-[var(--ds-surface-1)] p-4 text-[14px] leading-[1.5]"
        >
          {selecionada.partes.map((parte, indice) =>
            parte.tipo === "texto" ? (
              <span key={indice}>{parte.texto}</span>
            ) : (
              <mark key={indice} className="rounded bg-[var(--ds-orange-soft)] px-1 font-medium text-[var(--ds-orange-deep)]">
                [falta: {selecionada.faltando.find((falta) => falta.variavel === parte.variavel)?.rotulo ?? parte.variavel}]
              </mark>
            ),
          )}
        </div>

        <div className="mt-4 flex flex-wrap items-center gap-2">
          <Botao
            id={ID_DO_COPIAR}
            variante="primario"
            icone={copiada === selecionada.convocacaoId ? <Check size={18} aria-hidden /> : <Copy size={18} aria-hidden />}
            motivoDesabilitado={bloqueada ? `Falta ${faltas}.` : undefined}
            onClick={() => copiar(selecionada)}
          >
            {copiada === selecionada.convocacaoId ? "Copiada" : "Copiar"}
          </Botao>
          <Botao
            icone={<CheckCheck size={18} aria-hidden />}
            carregando={enviando}
            textoCarregando="Marcando…"
            motivoDesabilitado={motivoParaNaoMarcar}
            onClick={() => marcarComoEnviada(selecionada)}
          >
            Marcar como enviada
          </Botao>
          <span role="status" aria-live="polite" className="sr-only">
            {copiada === selecionada.convocacaoId ? "Copy copiada" : ""}
          </span>
        </div>

        <div className="mt-3">
          <Botao icone={<MessageCircle size={18} aria-hidden />} motivoDesabilitado="O envio direto pelo WhatsApp do time entra numa próxima versão.">
            Enviar pelo WhatsApp
            <Chip tom="neutro">em breve</Chip>
          </Botao>
        </div>

        <p className="mt-4 border-t border-[var(--ds-separator)] pt-3 text-[13px] text-[var(--ds-label-2)]">
          Modelo: {modelo.nome === rotuloDoModelo ? modelo.nome : `${modelo.nome} (${rotuloDoModelo.toLocaleLowerCase("pt-BR")})`} ·{" "}
          <Link href={`/configuracoes/modelos-de-copy/${modelo.id}`} target="_blank" className="font-medium text-[var(--ds-tint-text)] hover:underline">
            Editar modelo
          </Link>
        </p>
      </section>
    </div>
  );
}
