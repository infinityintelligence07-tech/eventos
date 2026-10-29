"use client";

import { CircleAlert } from "lucide-react";
import { useState } from "react";

import {
  Botao,
  BotaoLink,
  CaixaDeMarcar,
  CampoDeTexto,
  MENSAGEM_SOMENTE_LEITURA,
  ResumoDeErros,
  TITULO_DE_CARTAO,
  useAcao,
} from "@/app/(time)/_componentes/ui";

import { abrirEnqueteAcao } from "../acoes";

export type EventoParaEscolher = { id: string; rotulo: string; periodo: string; polo: string | null; masterclass: boolean };

const ROTULOS = { titulo: "Título", fechaEm: "Fecha em", eventoIds: "Eventos" };

function ListaDeEventos({ eventos, marcados, alternar }: { eventos: EventoParaEscolher[]; marcados: Set<string>; alternar: (id: string) => void }) {
  return (
    <ul className="grid gap-1 md:grid-cols-2">
      {eventos.map((evento) => (
        <li key={evento.id}>
          <CaixaDeMarcar
            name="eventoIds[]"
            value={evento.id}
            checked={marcados.has(evento.id)}
            onChange={() => alternar(evento.id)}
            rotulo={evento.rotulo}
            ajuda={[evento.periodo, evento.polo].filter(Boolean).join(" · ")}
          />
        </li>
      ))}
    </ul>
  );
}

export function FormularioDaEnquete({
  eventos,
  tituloSugerido,
  fechaEmPadrao,
  somenteLeitura,
}: {
  eventos: EventoParaEscolher[];
  tituloSugerido: string;
  fechaEmPadrao: string;
  somenteLeitura: boolean;
}) {
  // onSubmit (`enviar`, e não `action`) para o React não limpar título e data quando volta erro.
  const { estado, enviar: aoEnviar, pendente } = useAcao(abrirEnqueteAcao);
  const campos = estado.ok ? undefined : estado.campos;
  const [marcados, setMarcados] = useState<Set<string>>(() => new Set());

  const principais = eventos.filter((evento) => !evento.masterclass);
  const masterclasses = eventos.filter((evento) => evento.masterclass);
  const todosMarcados = eventos.length > 0 && eventos.every((evento) => marcados.has(evento.id));

  function alternar(id: string) {
    setMarcados((atuais) => {
      const proximos = new Set(atuais);
      if (proximos.has(id)) proximos.delete(id);
      else proximos.add(id);
      return proximos;
    });
  }

  const erroDosEventos = campos?.eventoIds?.[0];

  return (
    <form onSubmit={aoEnviar} noValidate className="flex flex-col gap-5">
      <ResumoDeErros campos={campos} rotulos={ROTULOS} />

      <fieldset id="campo-eventoIds" tabIndex={-1} aria-describedby={erroDosEventos ? "campo-eventoIds-erro" : undefined}>
        <legend className={`${TITULO_DE_CARTAO} mb-1`}>Eventos</legend>
        {eventos.length === 0 ? (
          <p className="text-[14px] text-[var(--ds-label-2)]">Nenhum evento neste período. Mude as datas ou os filtros acima.</p>
        ) : (
          <>
            <CaixaDeMarcar
              rotulo={`Selecionar todos (${eventos.length})`}
              checked={todosMarcados}
              onChange={() => setMarcados(todosMarcados ? new Set() : new Set(eventos.map((evento) => evento.id)))}
              className="mb-2 font-medium"
            />
            <ListaDeEventos eventos={principais} marcados={marcados} alternar={alternar} />
            {masterclasses.length > 0 && (
              <details className="mt-3">
                <summary className="w-fit cursor-pointer py-1.5 text-[14px] font-medium text-[var(--ds-tint-text)]">
                  Masterclasses ({masterclasses.filter((evento) => marcados.has(evento.id)).length} de {masterclasses.length} marcadas)
                </summary>
                <div className="mt-2">
                  <ListaDeEventos eventos={masterclasses} marcados={marcados} alternar={alternar} />
                </div>
              </details>
            )}
          </>
        )}
        {erroDosEventos && (
          <p id="campo-eventoIds-erro" className="mt-1 flex items-center gap-1 text-[12px] font-medium text-[var(--ds-red-deep)]">
            <CircleAlert size={14} aria-hidden className="shrink-0" />
            {erroDosEventos}
          </p>
        )}
      </fieldset>

      <div className="flex max-w-[640px] flex-col gap-4">
        <CampoDeTexto nome="titulo" rotulo="Título" obrigatorio defaultValue={tituloSugerido} maxLength={120} erros={campos?.titulo} />
        <CampoDeTexto
          nome="fechaEm"
          rotulo="Fecha em"
          type="datetime-local"
          obrigatorio
          defaultValue={fechaEmPadrao}
          ajuda="Depois disso, as respostas param de entrar como novas, mas o time ainda pode registrar."
          erros={campos?.fechaEm}
        />
      </div>

      <div className="flex flex-wrap gap-2">
        <Botao
          type="submit"
          variante="primario"
          carregando={pendente}
          textoCarregando="Criando…"
          motivoDesabilitado={somenteLeitura ? MENSAGEM_SOMENTE_LEITURA : undefined}
        >
          Criar enquete
        </Botao>
        <BotaoLink href="/disponibilidade">Cancelar</BotaoLink>
      </div>
    </form>
  );
}
