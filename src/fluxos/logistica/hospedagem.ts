import { bancoParaLeitura, transacao, type AtorDaEscrita } from "@/fluxos/_base";
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
  type PessoaDaEquipe,
  type PorNoQuarto,
  type RegistrarPedidoDeHospedagem,
  servicoDeHospedagem,
  servicoDePedidos,
  sugerirRooming,
  textoDoPedidoDeHospedagem,
  textoDoRooming,
  type TrocarDeQuarto,
} from "@/modules/logistica";

import { traduzirErros } from "./comum";

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

/** Logística › Hospedagem: rooming de um evento (o escolhido ou o próximo com equipe). */
export async function carregarHospedagem(eventoId: string | null, agora: Date): Promise<HospedagemDoEventoCarregada> {
  const db = await bancoParaLeitura();
  const pedidos = criarRepositorioPedidos(db);
  const repo = criarRepositorioHospedagem(db);
  const [eventos, locais] = await Promise.all([pedidos.eventosDaLogistica({ desde: dataEmSaoPaulo(agora) }), repo.locaisDeHospedagem()]);
  const evento = eventoId ? (eventos.find((item) => item.id === eventoId) ?? (await pedidos.eventoPorId(eventoId))) : (eventos[0] ?? null);
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
        textoDoRooming: textoDoRooming({ hotel: hospedagem.local.nome, checkIn: hospedagem.checkIn, checkOut: hospedagem.checkOut, quartos: quartosEmTexto }),
        textoParaSdc: hospedagem.pedido
          ? textoDoPedidoDeHospedagem({
              referencia: hospedagem.pedido.referencia,
              eventoCodigo: evento.codigo,
              eventoNome: evento.nome,
              hotel: hospedagem.local.nome,
              cidade: `${hospedagem.local.cidade} (${hospedagem.local.uf})`,
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

export function criarHospedagem(entrada: CriarHospedagem, ator: AtorDaEscrita, agora: Date) {
  return traduzirErros(() => transacao(ator, (tx) => servicoDeHospedagem.criarHospedagem(criarRepositorioHospedagem(tx), entrada, contexto(ator.usuarioId, agora))));
}

export function alterarHospedagem(entrada: AlterarHospedagem, ator: AtorDaEscrita, agora: Date) {
  return traduzirErros(() => transacao(ator, (tx) => servicoDeHospedagem.alterarHospedagem(criarRepositorioHospedagem(tx), entrada, contexto(ator.usuarioId, agora))));
}

export function registrarPedidoDeHospedagem(entrada: RegistrarPedidoDeHospedagem, ator: AtorDaEscrita, agora: Date) {
  return traduzirErros(() => transacao(ator, (tx) => servicoDePedidos.registrarPedidoDeHospedagem(criarRepositorioPedidos(tx), entrada, contexto(ator.usuarioId, agora))));
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
