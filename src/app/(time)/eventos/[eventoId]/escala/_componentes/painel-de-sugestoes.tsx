"use client";

import { Check, CircleX, Minus, Search, TriangleAlert } from "lucide-react";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";

import type { CandidatoSugerido, SugestoesDaVaga } from "@/fluxos/escalas";

import { useAcao } from "@/app/(time)/_componentes/ui";
import { Botao } from "../../../../_componentes/ui/botao";
import { CaixaDeMarcar } from "../../../../_componentes/ui/campo";
import { Confirmacao, PainelLateral } from "../../../../_componentes/ui/dialogo";
import { EstadoVazio } from "../../../../_componentes/ui/estados";
import { dataCurta, distancia } from "../../../../_componentes/ui/formatos";
import { Chip } from "../../../../_componentes/ui/situacao";
import { porNaVaga } from "../acoes";

function ChipDaDisponibilidade({ candidato }: { candidato: CandidatoSugerido }) {
  switch (candidato.disponibilidade) {
    case "PODE":
      return (
        <Chip tom="sucesso" icone={<Check size={14} aria-hidden />}>
          Pode
        </Chip>
      );
    case "SEM_RESPOSTA":
      return (
        <Chip tom="neutro" icone={<Minus size={14} aria-hidden />}>
          Não respondeu
        </Chip>
      );
    case "NAO_PODE":
      return (
        <Chip tom="perigo" icone={<CircleX size={14} aria-hidden />}>
          Não pode
        </Chip>
      );
    default: {
      const desconhecida: never = candidato.disponibilidade;
      throw new Error(`disponibilidade desconhecida: ${String(desconhecida)}`);
    }
  }
}

function textoDoNivel(nivel: CandidatoSugerido["nivel"]): string {
  switch (nivel) {
    case "HABILITADO":
      return "Habilitado";
    case "TRAINEE":
      return "Trainee";
    case "SEM_FUNCAO":
      return "Não habilitado";
    default: {
      const desconhecido: never = nivel;
      throw new Error(`nível desconhecido: ${String(desconhecido)}`);
    }
  }
}

function ItemDaSugestao({
  eventoId,
  escalaId,
  candidato,
  adicionar,
  pendente,
}: {
  eventoId: string;
  escalaId: string;
  candidato: CandidatoSugerido;
  adicionar: (form: FormData) => void;
  pendente: boolean;
}) {
  const [confirmando, setConfirmando] = useState(false);
  const despachar = (form: FormData) => {
    setConfirmando(false);
    adicionar(form);
  };
  const naoPode = candidato.disponibilidade === "NAO_PODE";
  const campos = (
    <>
      <input type="hidden" name="eventoId" value={eventoId} />
      <input type="hidden" name="escalaId" value={escalaId} />
      <input type="hidden" name="pessoaId" value={candidato.pessoaId} />
      <input type="hidden" name="sugestaoScore" value={candidato.pontuacao} />
    </>
  );

  return (
    <li className="flex items-start justify-between gap-3 border-t border-[var(--ds-separator)] py-3 first:border-t-0">
      <div className="min-w-0 text-[13px]">
        <p className="text-[14px] font-medium">{candidato.nome}</p>
        <p className="mt-1 flex flex-wrap items-center gap-1 text-[var(--ds-label-2)]">
          <ChipDaDisponibilidade candidato={candidato} />
          {candidato.nivel === "SEM_FUNCAO" ? (
            <Chip tom="atencao" icone={<TriangleAlert size={14} aria-hidden />}>
              Não habilitado
            </Chip>
          ) : (
            <span>· {textoDoNivel(candidato.nivel)}</span>
          )}
          <span className="whitespace-nowrap">· {candidato.distanciaKm !== null ? distancia(candidato.distanciaKm) : "Distância desconhecida"}</span>
        </p>
        <p className="mt-0.5 text-[var(--ds-label-2)]">
          {candidato.ultimaData
            ? `Último evento: ${dataCurta(candidato.ultimaData)}${candidato.ultimoEvento ? ` (${candidato.ultimoEvento})` : ""} · ${
                candidato.convocacoesUltimos90Dias === 1 ? "1 evento nos últimos 90 dias" : `${candidato.convocacoesUltimos90Dias} eventos nos últimos 90 dias`
              }`
            : "Sem evento nos últimos 90 dias"}
        </p>
        {candidato.conflitos.length > 0 && (
          <p className="mt-1">
            <Chip tom="atencao" icone={<TriangleAlert size={14} aria-hidden />}>
              Também em {candidato.conflitos.join(", ")} nas mesmas datas
            </Chip>
          </p>
        )}
        <p className="mt-0.5 text-[12px] text-[var(--ds-label-2)]">Desempenho: em breve</p>
      </div>
      {naoPode ? (
        <>
          <Botao tamanho="pequeno" onClick={() => setConfirmando(true)} aria-label={`Adicionar ${candidato.nome}`}>
            Adicionar
          </Botao>
          <Confirmacao
            aberto={confirmando}
            aoFechar={() => setConfirmando(false)}
            titulo={`${candidato.nome} disse que não pode neste evento. Adicionar mesmo assim?`}
            descricao="A resposta da enquete continua registrada como “não pode”."
            rotuloConfirmar="Adicionar mesmo assim"
            carregando={pendente}
            acao={despachar}
          >
            {campos}
          </Confirmacao>
        </>
      ) : (
        <form action={despachar}>
          {campos}
          <Botao type="submit" variante="primario" tamanho="pequeno" carregando={pendente} aria-label={`Adicionar ${candidato.nome}`}>
            Adicionar
          </Botao>
        </form>
      )}
    </li>
  );
}

export function PainelDeSugestoes({
  eventoId,
  sugestoes,
  periodoDoEvento,
  caminho,
}: {
  eventoId: string;
  sugestoes: SugestoesDaVaga;
  periodoDoEvento: string;
  caminho: string;
}) {
  const router = useRouter();
  const [adicionando, setAdicionando] = useState<string | null>(null);
  // O toast fica no painel: o item some da lista assim que a pessoa entra na vaga.
  const { despachar, pendente } = useAcao(porNaVaga, { toastDeCampo: true });
  const adicionar = (form: FormData) => {
    setAdicionando(String(form.get("pessoaId")));
    despachar(form);
  };
  const [busca, setBusca] = useState("");
  const [soQuemPode, setSoQuemPode] = useState(sugestoes.temEnquete);
  const [soHabilitados, setSoHabilitados] = useState(false);
  const fechar = () => router.replace(caminho, { scroll: false });

  const filtrar = useMemo(() => {
    const texto = busca.trim().toLowerCase();
    return (lista: CandidatoSugerido[]) =>
      lista.filter(
        (candidato) =>
          (!texto || candidato.nome.toLowerCase().includes(texto)) &&
          (!soQuemPode || candidato.disponibilidade === "PODE") &&
          (!soHabilitados || candidato.nivel === "HABILITADO"),
      );
  }, [busca, soQuemPode, soHabilitados]);
  const sugeridos = filtrar(sugestoes.sugeridos);
  const naoPodem = filtrar(sugestoes.naoPodem);
  const abertas = sugestoes.vagasAbertas;

  return (
    <PainelLateral
      aberto
      aoFechar={fechar}
      titulo="Adicionar pessoa"
      subtitulo={`${sugestoes.nomeDaFuncao} · ${periodoDoEvento} · ${abertas === 1 ? "1 vaga aberta" : `${abertas} vagas abertas`}`}
    >
      <p className="mb-3 text-[13px] text-[var(--ds-label-2)]">
        Ordem: quem disse que pode, função habilitada, mais perto do evento e quem trabalhou há mais tempo.
      </p>
      <label data-ds-field="" className="mb-2 flex h-10 items-center gap-2 rounded-[10px] border border-[var(--ds-separator)] bg-[var(--ds-surface)] px-3">
        <Search size={18} aria-hidden className="shrink-0 text-[var(--ds-label-2)]" />
        <span className="sr-only">Buscar por nome</span>
        <input type="search" value={busca} onChange={(evento) => setBusca(evento.target.value)} placeholder="Buscar por nome" className="h-full w-full bg-transparent text-[14px] outline-none" />
      </label>
      <div className="mb-3 flex flex-wrap gap-x-4">
        <CaixaDeMarcar rotulo="Só quem disse que pode" checked={soQuemPode} onChange={(evento) => setSoQuemPode(evento.target.checked)} />
        <CaixaDeMarcar rotulo="Só habilitados nesta função" checked={soHabilitados} onChange={(evento) => setSoHabilitados(evento.target.checked)} />
      </div>
      <p className="sr-only" aria-live="polite">
        {sugeridos.length === 1 ? "1 pessoa sugerida" : `${sugeridos.length} pessoas sugeridas`}
      </p>
      {abertas === 0 && <p className="mb-3 text-[13px] font-medium text-[var(--ds-green-deep)]">Todas as vagas desta função estão preenchidas.</p>}
      {sugeridos.length === 0 && naoPodem.length === 0 ? (
        <EstadoVazio titulo={`Nenhuma pessoa encontrada para ${sugestoes.nomeDaFuncao}.`}>
          {soQuemPode || soHabilitados || busca ? "Tire os filtros para ver mais pessoas." : "Cadastre o staff em Pessoas."}
        </EstadoVazio>
      ) : (
        <ul>
          {sugeridos.map((candidato) => (
            <ItemDaSugestao key={candidato.pessoaId} eventoId={eventoId} escalaId={sugestoes.escalaId} candidato={candidato} adicionar={adicionar} pendente={pendente && adicionando === candidato.pessoaId} />
          ))}
        </ul>
      )}
      {naoPodem.length > 0 && (
        <details className="mt-4">
          <summary className="cursor-pointer text-[14px] font-medium">Disseram que não podem ({naoPodem.length})</summary>
          <ul>
            {naoPodem.map((candidato) => (
              <ItemDaSugestao key={candidato.pessoaId} eventoId={eventoId} escalaId={sugestoes.escalaId} candidato={candidato} adicionar={adicionar} pendente={pendente && adicionando === candidato.pessoaId} />
            ))}
          </ul>
        </details>
      )}
    </PainelLateral>
  );
}
