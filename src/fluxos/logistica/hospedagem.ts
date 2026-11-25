import { type AtorSdcDaEscrita, type AutorDaAcao, bancoParaLeitura, type Executor, RegraDeNegocioError, transacao, type AtorDaEscrita } from "@/fluxos/_base";
import { criarRepositorioLocal, mudancasDoLocal } from "@/modules/eventos";
import {
  type AdicionarQuarto,
  type AlterarHospedagem,
  type CriarHospedagem,
  criarRepositorioHospedagem,
  type DefinirPeriodoDoOcupante,
  criarRepositorioPedidos,
  dataEmSaoPaulo,
  type EventoDaLogistica,
  type HospedagemDoEvento,
  type LocalDeHospedagem,
  misturaSexos,
  nomeComPeriodo,
  type NovoHotel,
  type PessoaDaEquipe,
  type PorNoQuarto,
  type RegistrarPedidoDeHospedagem,
  type RegistrarRetornoDeHospedagem,
  servicoDeHospedagem,
  servicoDePedidos,
  sugerirRooming,
  textoDoPedidoDeHospedagem,
  textoDoRooming,
  type TrocarDeQuarto,
} from "@/modules/logistica";

import { traduzirErros } from "./comum";
import { desfazerDispensa } from "./dispensa";

// Hospedagem: nós montamos os quartos (quem divide com quem), a SDC escolhe e reserva o hotel. A hospedagem nasce sem
// hotel; com os quartos montados o time pede à SDC e, no retorno, registra o hotel, a reserva, o valor e o pagamento.

export type HospedagemCarregada = HospedagemDoEvento & {
  textoDoRooming: string;
  textoParaSdc: string | null;
  quartosComSexosMisturados: string[];
};

export type HospedagemDoEventoCarregada = {
  eventos: EventoDaLogistica[];
  evento: EventoDaLogistica | null;
  hospedagens: HospedagemCarregada[];
  locais: LocalDeHospedagem[];
  /** Quem o time marcou para hotel na escala do evento (só essas pessoas entram em quarto). */
  equipe: PessoaDaEquipe[];
  semQuarto: PessoaDaEquipe[];
  /** Pessoas ativas na escala do evento que não estão marcadas para hotel (para lembrar de conferir a escala). */
  naEscalaSemHotel: number;
  /** Quantas pessoas sem quarto a sugestão por sexo consegue alocar. */
  sugestaoAloca: number;
};

const HOTEL_A_DEFINIR = "hotel a definir pela SDC";

/** "Centro de Convenções — Manaus (AM)": onde o evento acontece, para a SDC procurar hotel perto. */
function localDoEvento(evento: EventoDaLogistica): string | null {
  const cidade = evento.cidade && evento.uf ? `${evento.cidade} (${evento.uf})` : null;
  return [evento.localNome, cidade].filter(Boolean).join(" — ") || null;
}

/**
 * Hospedagem: rooming de um evento (o escolhido ou o próximo com equipe). Sem evento escolhido, pula os que o time
 * marcou como "sem hospedagem": eles saem dos pendentes, mas continuam no seletor.
 */
export async function carregarHospedagem(eventoId: string | null, agora: Date): Promise<HospedagemDoEventoCarregada> {
  const db = await bancoParaLeitura();
  const pedidos = criarRepositorioPedidos(db);
  const repo = criarRepositorioHospedagem(db);
  const [eventos, locais] = await Promise.all([pedidos.eventosDaLogistica({ desde: dataEmSaoPaulo(agora) }), repo.locaisDeHospedagem()]);
  const evento = eventoId
    ? (eventos.find((item) => item.id === eventoId) ?? (await pedidos.eventoPorId(eventoId)))
    : (eventos.find((item) => !item.semHospedagem) ?? eventos[0] ?? null);
  if (!evento) return { eventos, evento: null, hospedagens: [], locais, equipe: [], semQuarto: [], naEscalaSemHotel: 0, sugestaoAloca: 0 };

  const [hospedagens, equipe, naEscalaSemHotel] = await Promise.all([repo.hospedagensDoEvento(evento.id), repo.equipeDoEvento(evento.id), repo.naEscalaSemHotel(evento.id)]);
  const semQuarto = equipe.filter((pessoa) => pessoa.quartoId === null);
  const quartos = hospedagens.flatMap((hospedagem) =>
    hospedagem.quartos.map((quarto) => ({ id: quarto.id, capacidade: quarto.capacidade, sexo: quarto.sexo, ocupantes: quarto.ocupantes })),
  );
  return {
    eventos,
    evento,
    locais,
    equipe,
    semQuarto,
    naEscalaSemHotel,
    sugestaoAloca: sugerirRooming(semQuarto, quartos).alocacoes.length,
    hospedagens: hospedagens.map((hospedagem) => {
      const quartosEmTexto = hospedagem.quartos.map((quarto) => ({ nome: quarto.nome, capacidade: quarto.capacidade, ocupantes: quarto.ocupantes.map((ocupante) => nomeComPeriodo(ocupante.nome, ocupante)) }));
      return {
        ...hospedagem,
        quartosComSexosMisturados: hospedagem.quartos.filter((quarto) => misturaSexos(quarto.ocupantes)).map((quarto) => quarto.id),
        textoDoRooming: textoDoRooming({ hotel: hospedagem.local?.nome ?? HOTEL_A_DEFINIR, checkIn: hospedagem.checkIn, checkOut: hospedagem.checkOut, quartos: quartosEmTexto }),
        textoParaSdc: hospedagem.pedido
          ? textoDoPedidoDeHospedagem({
              referencia: hospedagem.pedido.referencia,
              eventoCodigo: evento.codigo,
              eventoNome: evento.nome,
              localDoEvento: localDoEvento(evento),
              hotel: hospedagem.local ? `${hospedagem.local.nome} — ${hospedagem.local.cidade} (${hospedagem.local.uf})` : null,
              checkIn: hospedagem.checkIn,
              checkOut: hospedagem.checkOut,
              quartos: quartosEmTexto,
              observacaoTime: hospedagem.pedido.observacaoTime,
            })
          : null,
      };
    }),
  };
}

const contexto = (usuarioId: string, agora: Date) => ({ usuarioId, instante: agora });

/** "Montar quartos": abre a hospedagem do evento (sem hotel, se for pela SDC). Desfaz o "sem hospedagem", se estava marcado. */
export function criarHospedagem(entrada: CriarHospedagem, ator: AtorDaEscrita, agora: Date) {
  return traduzirErros(() =>
    transacao(ator, async (tx) => {
      const id = await servicoDeHospedagem.criarHospedagem(criarRepositorioHospedagem(tx), entrada, contexto(ator.usuarioId, agora));
      await desfazerDispensa(tx, entrada.eventoId, "HOSPEDAGEM", ator.usuarioId);
      return id;
    }),
  );
}

/** Desfaz uma hospedagem aberta por engano (sem quartos e sem pedido). */
export function removerHospedagem(hospedagemId: string, ator: AtorDaEscrita, agora: Date) {
  return traduzirErros(() => transacao(ator, (tx) => servicoDeHospedagem.removerHospedagem(criarRepositorioHospedagem(tx), hospedagemId, contexto(ator.usuarioId, agora))));
}

export function alterarHospedagem(entrada: AlterarHospedagem, ator: AtorDaEscrita, agora: Date) {
  return traduzirErros(() => transacao(ator, (tx) => servicoDeHospedagem.alterarHospedagem(criarRepositorioHospedagem(tx), entrada, contexto(ator.usuarioId, agora))));
}

export function registrarPedidoDeHospedagem(entrada: RegistrarPedidoDeHospedagem, ator: AtorDaEscrita, agora: Date) {
  return traduzirErros(() => transacao(ator, (tx) => servicoDePedidos.registrarPedidoDeHospedagem(criarRepositorioPedidos(tx), entrada, contexto(ator.usuarioId, agora))));
}

/**
 * Hotel do retorno: um de Locais e hotéis (só o time escolhe da lista) ou um novo, cadastrado na hora com o mínimo.
 * `reaproveitar`: a SDC não vê a lista de locais, então ela sempre digita o hotel; se já existe um com o mesmo nome na
 * mesma cidade, usa esse em vez de recusar ou duplicar.
 */
async function hotelDoRetorno(
  tx: Executor,
  { localId, novoHotel }: Pick<RegistrarRetornoDeHospedagem, "localId" | "novoHotel">,
  autor: AutorDaAcao,
  agora: Date,
  reaproveitar: boolean,
): Promise<string> {
  if (!novoHotel) {
    if (!localId) throw new RegraDeNegocioError("Escolha o hotel que a SDC reservou ou cadastre um novo.");
    return localId;
  }
  const locais = criarRepositorioLocal(tx);
  const dados = {
    tipo: "HOTEL" as const,
    nome: novoHotel.nome,
    cidade: novoHotel.cidade,
    uf: novoHotel.uf,
    logradouro: novoHotel.logradouro ?? null,
    numero: novoHotel.numero ?? null,
    bairro: novoHotel.bairro ?? null,
    cep: null,
    complemento: null,
    lat: null,
    lng: null,
    capacidade: null,
  };
  const existente = await locais.hotelComNome(dados);
  if (existente) {
    if (reaproveitar) return existente;
    throw new RegraDeNegocioError(`Já existe o hotel "${dados.nome}" em ${dados.cidade}/${dados.uf}. Escolha-o na lista em vez de cadastrar de novo.`);
  }
  const hotelId = await locais.criar(dados, agora);
  await locais.registrar(hotelId, { acao: "LOCAL_CRIADO", ...autor, dados: { mudancas: mudancasDoLocal(null, dados), origem: "retorno da SDC" } });
  return hotelId;
}

/**
 * "Registrar reserva" pelo time, em nome da SDC: é aqui que o hotel entra. O time escolhe um hotel de Locais e hotéis
 * ou cadastra na hora o que a SDC reservou (com o mínimo: nome, cidade e UF; o resto se completa em Configurações).
 */
export function registrarRetornoDeHospedagem({ localId, novoHotel, ...retorno }: RegistrarRetornoDeHospedagem, ator: AtorDaEscrita, agora: Date) {
  const autor = { usuarioId: ator.usuarioId };
  return traduzirErros(() =>
    transacao(ator, async (tx) => {
      const hotelId = await hotelDoRetorno(tx, { localId, novoHotel }, autor, agora, false);
      return servicoDePedidos.registrarRetornoDeHospedagem(criarRepositorioPedidos(tx), { ...retorno, localId: hotelId }, { autor, instante: agora });
    }),
  );
}

/**
 * A mesma reserva registrada pela própria SDC, na área dela (src/fluxos/sdc). A SDC sempre informa o hotel pelo nome
 * (não tem acesso à lista de locais) e nunca corrige compra com o pagamento já aprovado (o serviço recusa).
 */
export function registrarRetornoDeHospedagemPelaSdc(retorno: Omit<RegistrarRetornoDeHospedagem, "localId"> & { novoHotel: NovoHotel }, sdc: AtorSdcDaEscrita, agora: Date) {
  const autor = { acessoSdcId: sdc.acessoSdcId };
  const { novoHotel, ...resto } = retorno;
  return traduzirErros(() =>
    transacao(sdc, async (tx) => {
      const hotelId = await hotelDoRetorno(tx, { novoHotel }, autor, agora, true);
      return servicoDePedidos.registrarRetornoDeHospedagem(criarRepositorioPedidos(tx), { ...resto, localId: hotelId }, { autor, instante: agora });
    }),
  );
}

export function adicionarQuarto(entrada: AdicionarQuarto, ator: AtorDaEscrita, agora: Date) {
  return traduzirErros(() => transacao(ator, (tx) => servicoDeHospedagem.adicionarQuarto(criarRepositorioHospedagem(tx), entrada, contexto(ator.usuarioId, agora))));
}

export function removerQuarto(quartoId: string, ator: AtorDaEscrita, agora: Date) {
  return traduzirErros(() => transacao(ator, (tx) => servicoDeHospedagem.removerQuarto(criarRepositorioHospedagem(tx), quartoId, contexto(ator.usuarioId, agora))));
}

/** Pôr no quarto ou "Mover para…" outro quarto. */
export function porNoQuarto(entrada: PorNoQuarto, ator: AtorDaEscrita, agora: Date) {
  return traduzirErros(() => transacao(ator, (tx) => servicoDeHospedagem.porNoQuarto(criarRepositorioHospedagem(tx), entrada, contexto(ator.usuarioId, agora))));
}

/** Duas pessoas de quartos diferentes trocam de lugar em um passo (funciona com os dois quartos cheios). */
export function trocarDeQuarto(entrada: TrocarDeQuarto, ator: AtorDaEscrita, agora: Date) {
  return traduzirErros(() => transacao(ator, (tx) => servicoDeHospedagem.trocarDeQuarto(criarRepositorioHospedagem(tx), entrada, contexto(ator.usuarioId, agora))));
}

export function tirarDoQuarto(entrada: PorNoQuarto, ator: AtorDaEscrita, agora: Date) {
  return traduzirErros(() => transacao(ator, (tx) => servicoDeHospedagem.tirarDoQuarto(criarRepositorioHospedagem(tx), entrada, contexto(ator.usuarioId, agora))));
}

/** Período próprio de quem chega depois ou sai antes. */
export function definirPeriodoDoOcupante(entrada: DefinirPeriodoDoOcupante, ator: AtorDaEscrita, agora: Date) {
  return traduzirErros(() => transacao(ator, (tx) => servicoDeHospedagem.definirPeriodoDoOcupante(criarRepositorioHospedagem(tx), entrada, contexto(ator.usuarioId, agora))));
}

/** Rooming sugerido por sexo para quem está sem quarto. */
export function aplicarRoomingSugerido(eventoId: string, ator: AtorDaEscrita, agora: Date) {
  return traduzirErros(() => transacao(ator, (tx) => servicoDeHospedagem.aplicarRoomingSugerido(criarRepositorioHospedagem(tx), eventoId, contexto(ator.usuarioId, agora))));
}
