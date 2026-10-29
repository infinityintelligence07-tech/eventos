"use client";

import { CircleCheck, CircleMinus, Save } from "lucide-react";
import { startTransition, useActionState, useEffect, useRef, useState } from "react";

import {
  Aviso,
  Botao,
  CaixaDeMarcar,
  CampoDeSelecao,
  CampoDeTexto,
  CAMPO,
  caminhoDoCampo,
  CARTAO,
  ResumoDeErros,
  TITULO_DE_CARTAO,
  useToastDoResultado,
} from "@/app/(time)/_componentes/ui";
import type { CampoDoModelo, EditorDeModelo, PreviaNaTela } from "@/fluxos/comunicacao";

import { definirModeloAtivoAcao, previaDoModeloAcao, salvarModeloAcao } from "../acoes";
import { enviarSemLimpar } from "./enviar-sem-limpar";

const ACAO_NAO_EXECUTADA = { ok: true } as const;
const GENERO = "{{genero:ESCALADO|ESCALADA}}";
const ROTULOS = { nome: "Nome", tipo: "Tipo", corpo: "Texto" };

const maiuscula = (texto: string) => texto.charAt(0).toLocaleUpperCase("pt-BR") + texto.slice(1);

function Previa({ previa }: { previa: PreviaNaTela }) {
  const rotulo = (variavel: string) => previa.faltando.find((falta) => falta.variavel === variavel)?.rotulo ?? variavel;
  return (
    <div className="whitespace-pre-wrap rounded-[var(--ds-radius-md)] bg-[var(--ds-surface-1)] p-4 text-[14px] leading-[1.5]">
      {previa.partes.map((parte, indice) =>
        parte.tipo === "texto" ? (
          <span key={indice}>{parte.texto}</span>
        ) : (
          <mark key={indice} className="rounded bg-[var(--ds-orange-soft)] px-1 font-medium text-[var(--ds-orange-deep)]">
            [falta: {rotulo(parte.variavel)}]
          </mark>
        ),
      )}
    </div>
  );
}

export function EditorDoModelo({
  editor,
  tipos,
}: {
  editor: EditorDeModelo;
  tipos: { valor: string; rotulo: string }[];
}) {
  const { modelo, exemplos, campos, escritaLiberada } = editor;
  const [resultado, salvar, salvando] = useActionState(salvarModeloAcao, ACAO_NAO_EXECUTADA);
  const [resultadoAtivo, alternar, alternando] = useActionState(definirModeloAtivoAcao, ACAO_NAO_EXECUTADA);
  useToastDoResultado(resultado);
  useToastDoResultado(resultadoAtivo);

  const [corpo, setCorpo] = useState(modelo?.corpo ?? "");
  const [exemplo, setExemplo] = useState(exemplos[0] ? `${exemplos[0].eventoId}:${exemplos[0].convocacaoId}` : "");
  const [previa, setPrevia] = useState<PreviaNaTela | null>(null);
  const [erroDaPrevia, setErroDaPrevia] = useState<string | null>(null);
  const textoRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    let cancelada = false;
    const espera = setTimeout(async () => {
      const form = new FormData();
      form.set("corpo", corpo);
      const [eventoId, convocacaoId] = exemplo.split(":");
      if (eventoId && convocacaoId) {
        form.set("eventoId", eventoId);
        form.set("convocacaoId", convocacaoId);
      }
      const resposta = await previaDoModeloAcao(form);
      if (cancelada) return;
      if ("erro" in resposta) {
        setErroDaPrevia(resposta.erro);
      } else {
        setErroDaPrevia(null);
        setPrevia(resposta);
      }
    }, 300);
    return () => {
      cancelada = true;
      clearTimeout(espera);
    };
  }, [corpo, exemplo]);

  function alternarAtivo(modeloId: string, ativo: boolean) {
    const form = new FormData();
    form.set("modeloId", modeloId);
    form.set("ativo", ativo ? "true" : "false");
    startTransition(() => alternar(form));
  }

  function inserir(trecho: string) {
    const campo = textoRef.current;
    const inicio = campo?.selectionStart ?? corpo.length;
    const fim = campo?.selectionEnd ?? corpo.length;
    setCorpo(corpo.slice(0, inicio) + trecho + corpo.slice(fim));
    requestAnimationFrame(() => {
      campo?.focus();
      campo?.setSelectionRange(inicio + trecho.length, inicio + trecho.length);
    });
  }

  const campoComErro = (nome: string) => (resultado.ok ? undefined : resultado.campos?.[caminhoDoCampo(nome)]);
  const somenteLeitura = escritaLiberada ? undefined : "Somente leitura neste ambiente.";

  return (
    <div className="grid gap-3 lg:grid-cols-2">
      <section aria-labelledby="texto-do-modelo" className={`${CARTAO} min-w-0 p-5`}>
        <h3 id="texto-do-modelo" className={`${TITULO_DE_CARTAO} mb-3`}>
          Texto do modelo
        </h3>
        <form onSubmit={(evento) => enviarSemLimpar(evento, salvar)} className="flex flex-col gap-4">
          {!resultado.ok && resultado.campos && <ResumoDeErros campos={resultado.campos} rotulos={ROTULOS} />}
          {modelo && <input type="hidden" name="modeloId" value={modelo.id} />}
          <div className="grid gap-3 sm:grid-cols-2">
            <CampoDeTexto nome="nome" rotulo="Nome" obrigatorio defaultValue={modelo?.nome ?? ""} erros={campoComErro("nome")} />
            <CampoDeSelecao nome="tipo" rotulo="Tipo" obrigatorio opcoes={tipos} defaultValue={modelo?.tipo ?? "ESCALACAO"} erros={campoComErro("tipo")} />
          </div>

          <div>
            <p id="inserir-campo" className="mb-1 text-[13px] font-medium">
              Inserir campo
            </p>
            <div role="group" aria-labelledby="inserir-campo" className="flex flex-wrap gap-1.5">
              {campos.map((campo: CampoDoModelo) => (
                <button
                  key={campo.variavel}
                  type="button"
                  title={`${campo.descricao} — {{${campo.variavel}}}`}
                  onClick={() => inserir(`{{${campo.variavel}}}`)}
                  className="inline-flex h-8 items-center rounded-full border border-[var(--ds-separator)] px-3 text-[13px] hover:bg-[var(--ds-surface-2)]"
                >
                  {maiuscula(campo.rotulo)}
                </button>
              ))}
              <button
                type="button"
                title={`Escolhe a palavra pelo sexo da pessoa — ${GENERO}`}
                onClick={() => inserir(GENERO)}
                className="inline-flex h-8 items-center rounded-full border border-[var(--ds-separator)] px-3 text-[13px] hover:bg-[var(--ds-surface-2)]"
              >
                Masculino/feminino
              </button>
            </div>
          </div>

          <div>
            <label htmlFor="campo-corpo" className="mb-1 block text-[13px] font-medium">
              Texto <span className="font-normal text-[var(--ds-label-2)]">(obrigatório)</span>
            </label>
            <textarea
              ref={textoRef}
              id="campo-corpo"
              name="corpo"
              value={corpo}
              onChange={(evento) => setCorpo(evento.target.value)}
              aria-invalid={campoComErro("corpo") ? true : undefined}
              aria-describedby={campoComErro("corpo") ? "campo-corpo-ajuda campo-corpo-erro" : "campo-corpo-ajuda"}
              className={`${CAMPO} h-auto min-h-[320px] py-2 leading-[1.5] ${campoComErro("corpo") ? "border-[var(--ds-red-deep)]" : ""}`}
            />
            <div id="campo-corpo-ajuda" className="mt-1 flex flex-col gap-1 text-[12px] text-[var(--ds-label-2)]">
              <p>Use os botões acima para inserir campos: o que está entre chaves duplas é trocado pelo dado de cada pessoa.</p>
              <p>
                <strong className="font-medium text-[var(--ds-label)]">Masculino/feminino</strong> escreve as duas formas separadas por uma barra
                vertical. Por exemplo, <code className="whitespace-nowrap rounded bg-[var(--ds-fill-4)] px-1 [font-family:var(--ds-font-mono)]">{GENERO}</code>{" "}
                vira “ESCALADO” para homens e “ESCALADA” para mulheres.
              </p>
            </div>
            {campoComErro("corpo") && (
              <ul id="campo-corpo-erro" className="mt-1 text-[12px] font-medium text-[var(--ds-red-deep)]">
                {campoComErro("corpo")!.map((erro) => (
                  <li key={erro}>{erro}</li>
                ))}
              </ul>
            )}
          </div>

          {modelo?.ativo ? (
            <Aviso tom="informacao">Este é o modelo em uso na Comunicação. Copys já enviadas não mudam; as ainda não enviadas usam o texto novo.</Aviso>
          ) : (
            <CaixaDeMarcar
              name="ativar"
              rotulo="Usar este modelo na Comunicação"
              ajuda="O modelo em uso deste tipo será desativado. Sem marcar, o modelo fica salvo como inativo."
            />
          )}
          <div className="flex flex-wrap gap-2">
            <Botao
              type="submit"
              variante="primario"
              icone={<Save size={18} aria-hidden />}
              carregando={salvando}
              textoCarregando="Salvando…"
              motivoDesabilitado={somenteLeitura}
            >
              Salvar modelo
            </Botao>
            {modelo && (
              <Botao
                icone={modelo.ativo ? <CircleMinus size={18} aria-hidden /> : <CircleCheck size={18} aria-hidden />}
                carregando={alternando}
                textoCarregando={modelo.ativo ? "Desativando…" : "Ativando…"}
                motivoDesabilitado={somenteLeitura}
                onClick={() => alternarAtivo(modelo.id, !modelo.ativo)}
              >
                {modelo.ativo ? "Desativar" : "Ativar"}
              </Botao>
            )}
          </div>
        </form>
      </section>

      <section aria-labelledby="previa-do-modelo" className={`${CARTAO} min-w-0 p-5`}>
        <h3 id="previa-do-modelo" className={`${TITULO_DE_CARTAO} mb-3`}>
          Prévia
        </h3>
        {exemplos.length > 0 ? (
          <CampoDeSelecao
            nome="exemplo"
            rotulo="Ver com"
            className="mb-3"
            value={exemplo}
            onChange={(evento) => setExemplo(evento.target.value)}
            opcoes={exemplos.map((item) => ({ valor: `${item.eventoId}:${item.convocacaoId}`, rotulo: `${item.nome} · ${item.evento}` }))}
          />
        ) : (
          <p className="mb-3 text-[13px] text-[var(--ds-label-2)]">Sem pessoas escaladas em eventos futuros: a prévia mostra só a saudação e o link de custos.</p>
        )}
        <div aria-live="polite">
          {erroDaPrevia && (
            <Aviso tom="perigo" className="mb-3">
              {erroDaPrevia}
            </Aviso>
          )}
          {previa && previa.erros.length > 0 && (
            <Aviso tom="perigo" className="mb-3" titulo="O texto tem campos que não existem.">
              <ul className="list-disc pl-5 text-[13px]">
                {previa.erros.map((erro) => (
                  <li key={erro}>{erro}</li>
                ))}
              </ul>
            </Aviso>
          )}
          {previa && previa.faltando.length > 0 && previa.erros.length === 0 && (
            <p className="mb-2 text-[13px] text-[var(--ds-label-2)]">
              Para esta pessoa falta: {previa.faltando.map((falta) => falta.rotulo).join(", ")}. A copy dela ficaria bloqueada.
            </p>
          )}
        </div>
        {previa ? <Previa previa={previa} /> : <p className="text-[13px] text-[var(--ds-label-2)]">Gerando a prévia…</p>}
      </section>
    </div>
  );
}
