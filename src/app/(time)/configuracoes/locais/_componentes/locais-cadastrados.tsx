"use client";

import { Archive, MapPin, MapPinOff, Pencil, Plus, Save } from "lucide-react";
import { type FormEvent, type ReactNode, startTransition, useActionState, useEffect, useState } from "react";

import {
  Botao,
  Cartao,
  CampoDeSelecao,
  CampoDeTexto,
  caminhoDoCampo,
  Chip,
  Confirmacao,
  EstadoVazio,
  PainelLateral,
  ResumoDeErros,
  useToastDoResultado,
} from "@/app/(time)/_componentes/ui";
import { CabecaDaTabela, CelulaDaTabela, ColunaDaTabela, LinhaDaTabela, Tabela } from "@/app/(time)/_componentes/ui/tabela";
import type { ResultadoAcao } from "@/app/(time)/_servidor/formulario";
import type { LocalNaTela } from "@/fluxos/eventos";

import { arquivarLocalAcao, salvarLocalAcao } from "../acoes";

const ACAO_NAO_EXECUTADA: ResultadoAcao = { ok: true };
const NOVO = "novo";

const ROTULOS: Record<string, string> = {
  nome: "Nome",
  tipo: "Tipo",
  cep: "CEP",
  logradouro: "Logradouro",
  numero: "Número",
  complemento: "Complemento",
  bairro: "Bairro",
  cidade: "Cidade",
  uf: "UF",
  capacidade: "Capacidade",
  lat: "Latitude",
  lng: "Longitude",
};

type Opcao = { valor: string; rotulo: string };

/**
 * Envia sem o `<form action>`: depois de uma server action o React 19 limpa os campos não controlados,
 * e quem errou um campo perderia todo o resto do que digitou.
 */
function enviarSemLimpar(evento: FormEvent<HTMLFormElement>, acao: (form: FormData) => void) {
  evento.preventDefault();
  const dados = new FormData(evento.currentTarget);
  startTransition(() => acao(dados));
}

const decimal = (valor: number | null) => (valor === null ? "" : String(valor).replace(".", ","));

function FormularioDoLocal({ local, tipos, aoSalvar }: { local: LocalNaTela | null; tipos: Opcao[]; aoSalvar: () => void }) {
  const [resultado, acao, salvando] = useActionState(salvarLocalAcao, ACAO_NAO_EXECUTADA);
  useToastDoResultado(resultado);
  useEffect(() => {
    if (resultado.ok && resultado.mensagem) aoSalvar();
  }, [resultado, aoSalvar]);
  const erros = (nome: string) => (resultado.ok ? undefined : resultado.campos?.[caminhoDoCampo(nome)]);

  return (
    <form onSubmit={(evento) => enviarSemLimpar(evento, acao)} className="flex flex-col gap-4">
      {!resultado.ok && resultado.campos && <ResumoDeErros campos={resultado.campos} rotulos={ROTULOS} />}
      {local && <input type="hidden" name="localId" value={local.id} />}
      <CampoDeTexto nome="nome" rotulo="Nome" obrigatorio defaultValue={local?.nome ?? ""} erros={erros("nome")} />
      <CampoDeSelecao nome="tipo" rotulo="Tipo" obrigatorio opcoes={tipos} defaultValue={local?.tipo ?? "HOTEL"} erros={erros("tipo")} />
      <div className="grid gap-3 sm:grid-cols-[160px_1fr]">
        <CampoDeTexto nome="cep" rotulo="CEP" inputMode="numeric" placeholder="00000-000" defaultValue={local?.cep ?? ""} erros={erros("cep")} />
        <CampoDeTexto nome="logradouro" rotulo="Logradouro" defaultValue={local?.logradouro ?? ""} erros={erros("logradouro")} />
      </div>
      <div className="grid gap-3 sm:grid-cols-[120px_1fr]">
        <CampoDeTexto nome="numero" rotulo="Número" defaultValue={local?.numero ?? ""} erros={erros("numero")} />
        <CampoDeTexto nome="complemento" rotulo="Complemento" defaultValue={local?.complemento ?? ""} erros={erros("complemento")} />
      </div>
      <CampoDeTexto nome="bairro" rotulo="Bairro" defaultValue={local?.bairro ?? ""} erros={erros("bairro")} />
      <div className="grid gap-3 sm:grid-cols-[1fr_96px]">
        <CampoDeTexto nome="cidade" rotulo="Cidade" obrigatorio defaultValue={local?.cidade ?? ""} erros={erros("cidade")} />
        <CampoDeTexto nome="uf" rotulo="UF" obrigatorio maxLength={2} defaultValue={local?.uf ?? ""} erros={erros("uf")} />
      </div>
      <CampoDeTexto
        nome="capacidade"
        rotulo="Capacidade"
        numerico
        ajuda="Pessoas no local de evento; leitos no hotel ou apartamento."
        defaultValue={local?.capacidade ?? ""}
        erros={erros("capacidade")}
      />
      <fieldset className="flex flex-col gap-2">
        <legend className="mb-1 text-[13px] font-medium">Localização no mapa</legend>
        <p className="text-[12px] text-[var(--ds-label-2)]">
          A busca automática pelo endereço entra numa próxima versão. Por enquanto, copie do Google Maps (botão direito no ponto → os
          dois números do topo). Sem isso, a distância até o local não é calculada.
        </p>
        <div className="grid gap-3 sm:grid-cols-2">
          <CampoDeTexto nome="lat" rotulo="Latitude" inputMode="decimal" placeholder="-3,1190" defaultValue={decimal(local?.lat ?? null)} erros={erros("lat")} />
          <CampoDeTexto nome="lng" rotulo="Longitude" inputMode="decimal" placeholder="-60,0217" defaultValue={decimal(local?.lng ?? null)} erros={erros("lng")} />
        </div>
      </fieldset>
      <div className="flex justify-end">
        <Botao type="submit" variante="primario" icone={<Save size={18} aria-hidden />} carregando={salvando} textoCarregando="Salvando…">
          Salvar local
        </Botao>
      </div>
    </form>
  );
}

function Localizacao({ local }: { local: LocalNaTela }) {
  return local.lat !== null && local.lng !== null ? (
    <Chip tom="sucesso" icone={<MapPin size={14} aria-hidden />}>
      Informada
    </Chip>
  ) : (
    <Chip tom="atencao" icone={<MapPinOff size={14} aria-hidden />}>
      Sem localização
    </Chip>
  );
}

export function LocaisCadastrados({
  locais,
  tipos,
  escritaLiberada,
  comFiltro,
  filtros,
}: {
  /** Busca e atalhos de tipo; ficam na mesma linha do "Novo local". */
  filtros: ReactNode;
  locais: LocalNaTela[];
  tipos: Opcao[];
  escritaLiberada: boolean;
  comFiltro: boolean;
}) {
  const [editando, setEditando] = useState<string | null>(null);
  const [aberturas, setAberturas] = useState(0);
  const [arquivando, setArquivando] = useState<LocalNaTela | null>(null);
  const [resultadoDoArquivo, arquivar, arquivandoAgora] = useActionState(arquivarLocalAcao, ACAO_NAO_EXECUTADA);
  useToastDoResultado(resultadoDoArquivo);
  useEffect(() => {
    if (resultadoDoArquivo !== ACAO_NAO_EXECUTADA) setArquivando(null);
  }, [resultadoDoArquivo]);

  const rotuloDoTipo = (valor: string) => tipos.find((tipo) => tipo.valor === valor)?.rotulo ?? valor;
  const localEmEdicao = editando && editando !== NOVO ? (locais.find((local) => local.id === editando) ?? null) : null;
  const somenteLeitura = escritaLiberada ? undefined : "Somente leitura neste ambiente.";

  function abrir(id: string) {
    setAberturas((atual) => atual + 1);
    setEditando(id);
  }

  return (
    <>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-3">{filtros}</div>
        <Botao variante="primario" icone={<Plus size={18} aria-hidden />} motivoDesabilitado={somenteLeitura} onClick={() => abrir(NOVO)}>
          Novo local
        </Botao>
      </div>

      {locais.length === 0 ? (
        <Cartao espacamento="nenhum">
          <EstadoVazio titulo={comFiltro ? "Nenhum resultado com esses filtros." : "Nenhum local cadastrado."} nivel="h2">
            {comFiltro ? "Mude a busca ou o tipo." : "Cadastre hotéis e apartamentos para montar a hospedagem."}
          </EstadoVazio>
        </Cartao>
      ) : (
        <Tabela legenda="Locais de evento, hotéis e apartamentos">
          <CabecaDaTabela>
            <ColunaDaTabela>Nome</ColunaDaTabela>
            <ColunaDaTabela>Tipo</ColunaDaTabela>
            <ColunaDaTabela>Cidade/UF</ColunaDaTabela>
            <ColunaDaTabela numero>Capacidade</ColunaDaTabela>
            <ColunaDaTabela>Localização no mapa</ColunaDaTabela>
            <ColunaDaTabela numero>Em uso</ColunaDaTabela>
            <ColunaDaTabela className="text-right">
              <span className="sr-only">Ações</span>
            </ColunaDaTabela>
          </CabecaDaTabela>
          <tbody>
            {locais.map((local) => (
              <LinhaDaTabela key={local.id}>
                <CelulaDaTabela cabecalhoDaLinha>{local.nome}</CelulaDaTabela>
                <CelulaDaTabela>{rotuloDoTipo(local.tipo)}</CelulaDaTabela>
                <CelulaDaTabela>
                  {local.cidade}/{local.uf}
                </CelulaDaTabela>
                <CelulaDaTabela numero>{local.capacidade?.toLocaleString("pt-BR") ?? "—"}</CelulaDaTabela>
                <CelulaDaTabela>
                  <Localizacao local={local} />
                </CelulaDaTabela>
                <CelulaDaTabela numero className="whitespace-nowrap">
                  {local.uso.eventos + local.uso.hospedagens === 0 ? (
                    <span className="text-[var(--ds-label-2)]">—</span>
                  ) : (
                    [local.uso.eventos > 0 ? `${local.uso.eventos} ev.` : null, local.uso.hospedagens > 0 ? `${local.uso.hospedagens} hosp.` : null]
                      .filter(Boolean)
                      .join(" · ")
                  )}
                </CelulaDaTabela>
                <CelulaDaTabela className="text-right">
                  <span className="inline-flex gap-2">
                    <Botao
                      tamanho="pequeno"
                      icone={<Pencil size={16} aria-hidden />}
                      aria-label={`Editar ${local.nome}`}
                      motivoDesabilitado={somenteLeitura}
                      onClick={() => abrir(local.id)}
                    >
                      Editar
                    </Botao>
                    {!local.motivoParaNaoArquivar && (
                      <Botao
                        tamanho="pequeno"
                        variante="perigo"
                        icone={<Archive size={16} aria-hidden />}
                        aria-label={`Arquivar ${local.nome}`}
                        motivoDesabilitado={somenteLeitura}
                        onClick={() => setArquivando(local)}
                      >
                        Arquivar
                      </Botao>
                    )}
                  </span>
                </CelulaDaTabela>
              </LinhaDaTabela>
            ))}
          </tbody>
        </Tabela>
      )}

      <PainelLateral
        aberto={editando !== null}
        aoFechar={() => setEditando(null)}
        titulo={localEmEdicao ? `Editar ${localEmEdicao.nome}` : "Novo local"}
        subtitulo={localEmEdicao?.tipo === "EVENTO" ? "Locais de evento também chegam pela sincronização com o IAM Control." : undefined}
      >
        {editando !== null && (
          <FormularioDoLocal key={`${editando}-${aberturas}`} local={localEmEdicao} tipos={tipos} aoSalvar={() => setEditando(null)} />
        )}
      </PainelLateral>

      <Confirmacao
        aberto={arquivando !== null}
        aoFechar={() => setArquivando(null)}
        titulo={`Arquivar ${arquivando?.nome ?? "local"}?`}
        descricao="Ele sai das listas e não pode mais ser escolhido em eventos e hospedagens."
        rotuloConfirmar="Arquivar"
        destrutiva
        carregando={arquivandoAgora}
        acao={arquivar}
      >
        {arquivando && <input type="hidden" name="localId" value={arquivando.id} />}
      </Confirmacao>
    </>
  );
}
