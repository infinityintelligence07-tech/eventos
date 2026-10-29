"use client";

import { ChevronUp, MapPin, MapPinned, Plus } from "lucide-react";
import { type FormEvent, useState } from "react";

import {
  type AcaoDoFormulario,
  Botao,
  CaixaDeMarcar,
  CampoDeSelecao,
  CampoDeTexto,
  Cartao,
  Chip,
  lerCoordenadas,
  MENSAGEM_SOMENTE_LEITURA,
  type OpcaoDoCampo,
  useAcao,
} from "@/app/(time)/_componentes/ui";

import { definirFuncoesAcao, salvarCoordenadasAcao, salvarPerfilAcao, salvarVeiculoAcao } from "../acoes";

// Cada cartão editável é um form rotulado pelo título do cartão (doc 08 §9.2). Erro de campo fica no campo, com o valor mantido.

/** Envia por onSubmit (`enviar`) para o React não limpar o formulário: no erro, o valor digitado fica. */
function useFormulario(acao: AcaoDoFormulario) {
  const { estado, enviar, pendente } = useAcao(acao);
  return { aoEnviar: enviar, pendente, campos: estado.ok ? undefined : estado.campos };
}

/** Todo cartão salva com "Salvar + o nome do cartão". */
function Salvar({ somenteLeitura, pendente, children }: { somenteLeitura: boolean; pendente: boolean; children: string }) {
  return (
    <div className="mt-4">
      <Botao
        type="submit"
        variante="primario"
        carregando={pendente}
        textoCarregando="Salvando…"
        motivoDesabilitado={somenteLeitura ? MENSAGEM_SOMENTE_LEITURA : undefined}
      >
        {children}
      </Botao>
    </div>
  );
}

const SIM_NAO: OpcaoDoCampo[] = [
  { valor: "SIM", rotulo: "Sim" },
  { valor: "NAO", rotulo: "Não" },
];

const simNao = (valor: boolean | null) => (valor === null ? "" : valor ? "SIM" : "NAO");

export type FuncaoDisponivel = { id: string; nome: string };
export type FuncaoAtual = { funcaoId: string; nivel: "TRAINEE" | "HABILITADO" };

type Niveis = Record<string, "TRAINEE" | "HABILITADO" | undefined>;

function LinhaDaFuncao({
  funcao,
  indice,
  niveis,
  setNiveis,
}: {
  funcao: FuncaoDisponivel;
  indice: number;
  niveis: Niveis;
  setNiveis: (mudar: (atuais: Niveis) => Niveis) => void;
}) {
  const nivel = niveis[funcao.id];
  return (
    <li className="flex flex-wrap items-center justify-between gap-x-4 py-1">
      <CaixaDeMarcar
        name={`funcoes[${indice}].funcaoId`}
        value={funcao.id}
        checked={nivel !== undefined}
        onChange={(evento) => setNiveis((atuais) => ({ ...atuais, [funcao.id]: evento.target.checked ? "HABILITADO" : undefined }))}
        rotulo={funcao.nome}
      />
      {nivel && (
        <fieldset className="flex gap-4 text-[13px]">
          <legend className="sr-only">Nível em {funcao.nome}</legend>
          {(["HABILITADO", "TRAINEE"] as const).map((valor) => (
            <label key={valor} className="flex min-h-8 cursor-pointer items-center gap-1.5">
              <input
                type="radio"
                name={`funcoes[${indice}].nivel`}
                value={valor}
                checked={nivel === valor}
                onChange={() => setNiveis((atuais) => ({ ...atuais, [funcao.id]: valor }))}
                className="h-4 w-4 accent-[var(--ds-brand)]"
              />
              {valor === "HABILITADO" ? "Habilitado" : "Trainee"}
            </label>
          ))}
        </fieldset>
      )}
    </li>
  );
}

/** As funções da pessoa primeiro; as outras ficam recolhidas em "Adicionar função" (a ordem não muda ao marcar). */
export function FormularioDeFuncoes({
  pessoaId,
  disponiveis,
  atuais,
  somenteLeitura,
}: {
  pessoaId: string;
  disponiveis: FuncaoDisponivel[];
  atuais: FuncaoAtual[];
  somenteLeitura: boolean;
}) {
  const { aoEnviar, pendente, campos } = useFormulario(definirFuncoesAcao);
  const [niveis, setNiveis] = useState<Niveis>(() => Object.fromEntries(atuais.map((funcao) => [funcao.funcaoId, funcao.nivel])));
  const [daPessoa] = useState(() => new Set(atuais.map((funcao) => funcao.funcaoId)));
  const [mostrarOutras, setMostrarOutras] = useState(daPessoa.size === 0);
  const marcadas = disponiveis.filter((funcao) => niveis[funcao.id]).length;
  const indexadas = disponiveis.map((funcao, indice) => ({ funcao, indice }));
  const principais = indexadas.filter(({ funcao }) => daPessoa.has(funcao.id));
  const outras = indexadas.filter(({ funcao }) => !daPessoa.has(funcao.id));
  const marcadasEntreOutras = outras.filter(({ funcao }) => niveis[funcao.id]).length;

  return (
    <Cartao
      id="funcoes"
      titulo="Funções"
      explicacao={`${marcadas} ${marcadas === 1 ? "função habilitada" : "funções habilitadas"}. Trainee ainda acompanha alguém.`}
    >
      <form onSubmit={aoEnviar} aria-labelledby="funcoes-titulo">
        <input type="hidden" name="pessoaId" value={pessoaId} />
        {principais.length > 0 ? (
          <ul aria-label="Funções da pessoa" className="flex flex-col divide-y divide-[var(--ds-separator)]">
            {principais.map(({ funcao, indice }) => (
              <LinhaDaFuncao key={funcao.id} funcao={funcao} indice={indice} niveis={niveis} setNiveis={setNiveis} />
            ))}
          </ul>
        ) : (
          <p className="text-[14px] text-[var(--ds-label-2)]">Nenhuma função ainda.</p>
        )}
        {outras.length > 0 && (
          <div className="mt-2 border-t border-[var(--ds-separator)] pt-2">
            <button
              type="button"
              aria-expanded={mostrarOutras}
              aria-controls="funcoes-outras"
              onClick={() => setMostrarOutras((atual) => !atual)}
              className="inline-flex min-h-8 items-center gap-1 text-[14px] font-medium text-[var(--ds-tint-text)] hover:underline"
            >
              {mostrarOutras ? <ChevronUp size={16} aria-hidden /> : <Plus size={16} aria-hidden />}
              {mostrarOutras ? "Esconder outras funções" : `Adicionar função (${outras.length})`}
              {!mostrarOutras && marcadasEntreOutras > 0 && (
                <span className="font-normal text-[var(--ds-label-2)]">
                  {" "}
                  · {marcadasEntreOutras === 1 ? "1 marcada" : `${marcadasEntreOutras} marcadas`}
                </span>
              )}
            </button>
            {/* Recolhidas continuam no formulário (hidden), para não perder o que já foi marcado. */}
            <ul id="funcoes-outras" hidden={!mostrarOutras} className="flex flex-col divide-y divide-[var(--ds-separator)]">
              {outras.map(({ funcao, indice }) => (
                <LinhaDaFuncao key={funcao.id} funcao={funcao} indice={indice} niveis={niveis} setNiveis={setNiveis} />
              ))}
            </ul>
          </div>
        )}
        {campos?.funcoes && <p className="mt-2 text-[12px] font-medium text-[var(--ds-red-deep)]">{campos.funcoes[0]}</p>}
        <Salvar somenteLeitura={somenteLeitura} pendente={pendente}>
          Salvar funções
        </Salvar>
      </form>
    </Cartao>
  );
}

export function FormularioDeVeiculo({
  pessoaId,
  veiculo,
  somenteLeitura,
}: {
  pessoaId: string;
  veiculo: { lugares: number; consumoKmL: number | null } | null;
  somenteLeitura: boolean;
}) {
  const { aoEnviar, pendente, campos } = useFormulario(salvarVeiculoAcao);
  const [temCarro, setTemCarro] = useState(veiculo ? "SIM" : "NAO");

  return (
    <Cartao id="veiculo" titulo="Veículo">
      <form onSubmit={aoEnviar} aria-labelledby="veiculo-titulo" className="flex flex-col gap-3">
        <input type="hidden" name="pessoaId" value={pessoaId} />
        <CampoDeSelecao nome="temCarro" rotulo="Tem carro" value={temCarro} onChange={(evento) => setTemCarro(evento.target.value)} opcoes={SIM_NAO} erros={campos?.temCarro} />
        {temCarro === "SIM" && (
          <>
            <CampoDeTexto
              nome="lugares"
              rotulo="Lugares para passageiros"
              ajuda="Sem contar o motorista."
              numerico
              obrigatorio
              defaultValue={veiculo?.lugares ?? 4}
              erros={campos?.lugares}
            />
            <CampoDeTexto
              nome="consumoKmL"
              rotulo="Consumo (km/l)"
              inputMode="decimal"
              defaultValue={veiculo?.consumoKmL?.toLocaleString("pt-BR") ?? ""}
              ajuda="Usado para conferir os custos de combustível. Deixe vazio se não souber."
              erros={campos?.consumoKmL}
            />
          </>
        )}
        <Salvar somenteLeitura={somenteLeitura} pendente={pendente}>Salvar veículo</Salvar>
      </form>
    </Cartao>
  );
}

export type PerfilNoFormulario = {
  sexo: string | null;
  camisetaModelo: string | null;
  camisetaTamanho: string | null;
  possuiCamiseta: boolean | null;
  fezConfronto: boolean | null;
  temCnpj: boolean | null;
};

export function FormularioDePerfil({
  pessoaId,
  perfil,
  opcoes,
  somenteLeitura,
}: {
  pessoaId: string;
  perfil: PerfilNoFormulario;
  opcoes: { sexos: OpcaoDoCampo[]; modelos: OpcaoDoCampo[]; tamanhos: OpcaoDoCampo[] };
  somenteLeitura: boolean;
}) {
  const { aoEnviar, pendente, campos } = useFormulario(salvarPerfilAcao);

  return (
    <Cartao id="perfil" titulo="Camiseta e experiência">
      <form onSubmit={aoEnviar} aria-labelledby="perfil-titulo" className="flex flex-col gap-3">
        <input type="hidden" name="pessoaId" value={pessoaId} />
        <CampoDeSelecao
          nome="sexo"
          rotulo="Sexo"
          vazio="Não informado"
          opcoes={opcoes.sexos}
          defaultValue={perfil.sexo ?? ""}
          ajuda="Usado nos quartos de hotel e nas copys."
          erros={campos?.sexo}
        />
        <div className="grid grid-cols-2 gap-3">
          <CampoDeSelecao nome="camisetaModelo" rotulo="Modelo" vazio="—" opcoes={opcoes.modelos} defaultValue={perfil.camisetaModelo ?? ""} erros={campos?.camisetaModelo} />
          <CampoDeSelecao nome="camisetaTamanho" rotulo="Tamanho" vazio="—" opcoes={opcoes.tamanhos} defaultValue={perfil.camisetaTamanho ?? ""} erros={campos?.camisetaTamanho} />
        </div>
        <CampoDeSelecao nome="possuiCamiseta" rotulo="Já tem a camiseta do staff" vazio="—" opcoes={SIM_NAO} defaultValue={simNao(perfil.possuiCamiseta)} />
        <CampoDeSelecao nome="fezConfronto" rotulo="Fez o Confronto" vazio="—" opcoes={SIM_NAO} defaultValue={simNao(perfil.fezConfronto)} />
        <CampoDeSelecao nome="temCnpj" rotulo="Tem CNPJ" vazio="—" opcoes={SIM_NAO} defaultValue={simNao(perfil.temCnpj)} />
        <Salvar somenteLeitura={somenteLeitura} pendente={pendente}>
          Salvar camiseta e experiência
        </Salvar>
      </form>
    </Cartao>
  );
}

/**
 * As coordenadas exatas apontam a casa da pessoa: a tela nunca as recebe nem mostra (só "informada" ou não).
 * Corrigir é colar coordenadas novas, copiadas do Google Maps.
 */
export function FormularioDeLocalizacao({
  pessoaId,
  temLocalizacao,
  somenteLeitura,
}: {
  pessoaId: string;
  temLocalizacao: boolean;
  somenteLeitura: boolean;
}) {
  const [editando, setEditando] = useState(!temLocalizacao);
  const [texto, setTexto] = useState("");
  const [erroLocal, setErroLocal] = useState<string | null>(null);
  const { estado, enviar, pendente } = useAcao(salvarCoordenadasAcao, () => {
    setEditando(false);
    setTexto("");
  });
  const lidas = lerCoordenadas(texto);
  const errosDoServidor = estado.ok ? undefined : [...(estado.campos?.lat ?? []), ...(estado.campos?.lng ?? [])];

  function aoEnviar(evento: FormEvent<HTMLFormElement>) {
    if (!lidas) {
      evento.preventDefault();
      setErroLocal("Cole os dois números do Google Maps, separados por vírgula (ex.: -26.9421, -48.6389).");
      return;
    }
    setErroLocal(null);
    enviar(evento);
  }

  if (!editando) {
    return (
      <div className="mt-3 flex flex-col items-start gap-2">
        <Chip tom="sucesso" icone={<MapPin size={14} aria-hidden />}>
          Localização informada
        </Chip>
        <p className="text-[12px] text-[var(--ds-label-2)]">Por privacidade, as coordenadas não aparecem na tela. Elas servem para calcular a distância até os eventos.</p>
        <Botao tamanho="pequeno" icone={<MapPinned size={16} aria-hidden />} motivoDesabilitado={somenteLeitura ? MENSAGEM_SOMENTE_LEITURA : undefined} onClick={() => setEditando(true)}>
          Corrigir localização
        </Botao>
      </div>
    );
  }

  return (
    <form onSubmit={aoEnviar} aria-label="Localização no mapa" className="mt-3 flex flex-col gap-3">
      <input type="hidden" name="pessoaId" value={pessoaId} />
      <input type="hidden" name="lat" value={lidas ? String(lidas.lat) : ""} />
      <input type="hidden" name="lng" value={lidas ? String(lidas.lng) : ""} />
      <CampoDeTexto
        nome="coordenadas"
        rotulo="Localização no mapa"
        obrigatorio
        autoComplete="off"
        value={texto}
        onChange={(evento) => setTexto(evento.target.value)}
        ajuda="No Google Maps, clique com o botão direito no endereço da pessoa e clique nos números que aparecem no topo do menu (eles são copiados). Cole aqui."
        erros={erroLocal ? [erroLocal] : errosDoServidor?.length ? errosDoServidor : undefined}
      />
      <div className="flex flex-wrap gap-2">
        <Salvar somenteLeitura={somenteLeitura} pendente={pendente}>
          Salvar localização
        </Salvar>
        {temLocalizacao && (
          <div className="mt-4">
            <Botao
              onClick={() => {
                setEditando(false);
                setTexto("");
                setErroLocal(null);
              }}
            >
              Cancelar
            </Botao>
          </div>
        )}
      </div>
    </form>
  );
}
