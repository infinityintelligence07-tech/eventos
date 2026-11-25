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
  type HospedeDoEvento,
  noRecorte,
  type PessoaParaHospedar,
  type RecorteDaLogistica,
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
  /** Eventos (padrão) ou Masterclass, como as abas da planilha. Com um evento escolhido, vale o recorte dele. */
  recorte: RecorteDaLogistica;
  /** Hoje em São Paulo (AAAA-MM-DD): os campos de data real dos formulários não passam daqui. */
  hoje: string;
  /** Os eventos do recorte em vigor, para o seletor. */
  eventos: EventoDaLogistica[];
  evento: EventoDaLogistica | null;
  hospedagens: HospedagemCarregada[];
  locais: LocalDeHospedagem[];
  /**
   * Quem precisa de hotel no evento: a união das origens (escala, pedido de voo, acrescentada aqui), uma linha por
   * pessoa. Só essas pessoas entram em quarto; a escala não é exigida.
   */
  equipe: PessoaParaHospedar[];
  semQuarto: PessoaParaHospedar[];
  /** Pessoas ativas do cadastro de staff que ainda não estão na lista: quem dá para acrescentar por aqui. */
  staffParaAcrescentar: { pessoaId: string; nome: string }[];
  /** O evento ainda aceita acrescentar gente (não foi cancelado nem terminou). */
  podeAcrescentar: boolean;
  /** Pessoas ativas na escala do evento que não estão na lista de hotel (para lembrar de conferir). */
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
export async function carregarHospedagem(eventoId: string | null, agora: Date, recortePedido: RecorteDaLogistica = "EVENTOS"): Promise<HospedagemDoEventoCarregada> {
  const db = await bancoParaLeitura();
  const pedidos = criarRepositorioPedidos(db);
  const repo = criarRepositorioHospedagem(db);
  const hoje = dataEmSaoPaulo(agora);
  // O seletor traz todos os eventos de hoje em diante, com ou sem escala (o hotel é pedido antes dela). Sem evento
  // escolhido, abre o próximo que já tem o que montar: gente na escala ou na lista de hotel, ou hospedagem aberta.
  const [futuros, comEquipe, comHotel, locais] = await Promise.all([
    pedidos.eventosFuturos({ desde: hoje }),
    pedidos.eventosDaLogistica({ desde: hoje }),
    repo.eventosComHotel({ desde: hoje }),
    repo.locaisDeHospedagem(),
  ]);
  const escolhido = eventoId ? (futuros.find((item) => item.id === eventoId) ?? (await pedidos.eventoPorId(eventoId))) : null;
  // Com um evento escolhido, o recorte é o dele (a Masterclass aberta pelo link de um pedido cai no recorte certo).
  const recorte: RecorteDaLogistica = escolhido ? (escolhido.masterclass ? "MASTERCLASS" : "EVENTOS") : recortePedido;
  const eventos = futuros.filter((item) => noRecorte(recorte, item));
  const comTrabalho = new Set([...comEquipe.map((item) => item.id), ...comHotel]);
  const candidatos = eventos.filter((item) => comTrabalho.has(item.id));
  const evento = escolhido ?? candidatos.find((item) => !item.semHospedagem) ?? candidatos[0] ?? eventos[0] ?? null;
  if (!evento) return { recorte, hoje, eventos, evento: null, hospedagens: [], locais, equipe: [], semQuarto: [], staffParaAcrescentar: [], podeAcrescentar: false, naEscalaSemHotel: 0, sugestaoAloca: 0 };

  const [hospedagens, equipe, naEscalaSemHotel, staff, situacao] = await Promise.all([
    repo.hospedagensDoEvento(evento.id),
    repo.precisamDeHotel(evento.id),
    repo.naEscalaSemHotel(evento.id),
    pedidos.staffAtivoPorNome(),
    repo.eventoParaHospedar(evento.id),
  ]);
  const semQuarto = equipe.filter((pessoa) => pessoa.quartoId === null);
  const naLista = new Set(equipe.map((pessoa) => pessoa.pessoaId));
  const quartos = hospedagens.flatMap((hospedagem) =>
    hospedagem.quartos.map((quarto) => ({ id: quarto.id, capacidade: quarto.capacidade, sexo: quarto.sexo, ocupantes: quarto.ocupantes })),
  );
  return {
    recorte,
    hoje,
    eventos,
    evento,
    locais,
    equipe,
    semQuarto,
    staffParaAcrescentar: staff.filter((pessoa) => !naLista.has(pessoa.pessoaId)),
    podeAcrescentar: situacao !== null && !situacao.cancelado && situacao.dataFim >= dataEmSaoPaulo(agora),
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
  /** Preenchido = quem registra é a SDC: reaproveita hotel igual e corrige o hotel que ela mesma criou para este pedido. */
  daSdc: { pedidoId: string } | null,
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
    if (daSdc) return existente;
    throw new RegraDeNegocioError(`Já existe o hotel "${dados.nome}" em ${dados.cidade}/${dados.uf}. Escolha-o na lista em vez de cadastrar de novo.`);
  }
  // O hotel que o time informa já veio do IAM Control como local de evento (o evento é num hotel): usa esse cadastro,
  // que passa a hotel, em vez de nascer outro com o mesmo nome. A SDC não altera cadastro que não é dela (docs/09
  // §15.4): o hotel que ela informa nasce à parte e a sincronização o liga ao IAM Control na rodada seguinte.
  const doIamControl = daSdc ? null : await locais.localDoIamControlComNome(dados);
  if (doIamControl?.tipo === "EVENTO") {
    if (!(await locais.marcarComoHotel(doIamControl.id, agora))) throw new RegraDeNegocioError("O local deste hotel mudou. Recarregue a página.");
    await locais.registrar(doIamControl.id, { acao: "LOCAL_ALTERADO", ...autor, dados: { mudancas: { tipo: { de: "EVENTO", para: "HOTEL" } }, origem: "retorno da SDC" } });
    return doIamControl.id;
  }
  // Correção da reserva pela SDC: o hotel que ela mesma cadastrou para este pedido é corrigido, em vez de nascer
  // outro registro em Locais e hotéis a cada nome diferente.
  const doPedido = daSdc ? await locais.hotelDaSdcDoPedido(daSdc.pedidoId) : null;
  if (doPedido) {
    const informado = { nome: dados.nome, cidade: dados.cidade, uf: dados.uf, logradouro: dados.logradouro, numero: dados.numero, bairro: dados.bairro };
    if (!(await locais.corrigirHotelInformado(doPedido.id, informado, agora))) throw new RegraDeNegocioError("O hotel deste pedido mudou. Recarregue a página.");
    await locais.registrar(doPedido.id, { acao: "LOCAL_ALTERADO", ...autor, dados: { mudancas: mudancasDoLocal(doPedido, informado), origem: "correção da SDC" } });
    return doPedido.id;
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
      const hotelId = await hotelDoRetorno(tx, { localId, novoHotel }, autor, agora, null);
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
      const hotelId = await hotelDoRetorno(tx, { novoHotel }, autor, agora, { pedidoId: resto.pedidoId });
      return servicoDePedidos.registrarRetornoDeHospedagem(criarRepositorioPedidos(tx), { ...resto, localId: hotelId }, { autor, instante: agora });
    }),
  );
}

/** Acrescenta alguém à lista de quem precisa de hotel no evento, sem escala nem pedido de voo. Desfaz o "sem hospedagem". */
export function acrescentarHospede(entrada: HospedeDoEvento, ator: AtorDaEscrita, agora: Date) {
  return traduzirErros(() =>
    transacao(ator, async (tx) => {
      const resultado = await servicoDeHospedagem.acrescentarHospede(criarRepositorioHospedagem(tx), entrada, contexto(ator.usuarioId, agora));
      if (resultado.mudou) await desfazerDispensa(tx, entrada.eventoId, "HOSPEDAGEM", ator.usuarioId);
      else {
        // Nada mudou: a transação precisa de um registro para não ser desfeita; quem já estava acrescentada é recusada com clareza.
        throw new RegraDeNegocioError(`${resultado.nome} já foi acrescentada à lista deste evento.`);
      }
      return resultado;
    }),
  );
}

/** Tira da lista quem foi acrescentado por aqui (se não estiver num quarto só por esta origem). */
export function tirarHospede(entrada: HospedeDoEvento, ator: AtorDaEscrita, agora: Date) {
  return traduzirErros(() => transacao(ator, (tx) => servicoDeHospedagem.tirarHospede(criarRepositorioHospedagem(tx), entrada, contexto(ator.usuarioId, agora))));
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
