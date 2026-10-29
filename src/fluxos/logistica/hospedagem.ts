import { bancoParaLeitura, transacao } from "@/fluxos/_base";
import {
  type AdicionarQuarto,
  type AlterarHospedagem,
  type CriarHospedagem,
  criarRepositorioHospedagem,
  criarRepositorioPedidos,
  dataEmSaoPaulo,
  type EventoDaLogistica,
  type HospedagemDoEvento,
  type LocalDeHospedagem,
  misturaSexos,
  type PessoaDaEquipe,
  type PorNoQuarto,
  type RegistrarPedidoDeHospedagem,
  servicoDeHospedagem,
  servicoDePedidos,
  sugerirRooming,
  textoDoPedidoDeHospedagem,
  textoDoRooming,
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
  equipe: PessoaDaEquipe[];
  semQuarto: PessoaDaEquipe[];
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
  if (!evento) return { eventos, evento: null, hospedagens: [], locais, equipe: [], semQuarto: [], sugestaoAloca: 0 };

  const [hospedagens, equipe] = await Promise.all([repo.hospedagensDoEvento(evento.id), repo.equipeDoEvento(evento.id)]);
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
    sugestaoAloca: sugerirRooming(semQuarto, quartos).alocacoes.length,
    hospedagens: hospedagens.map((hospedagem) => {
      const quartosEmTexto = hospedagem.quartos.map((quarto) => ({ nome: quarto.nome, capacidade: quarto.capacidade, ocupantes: quarto.ocupantes.map((ocupante) => ocupante.nome) }));
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

export function criarHospedagem(entrada: CriarHospedagem, usuarioId: string, agora: Date) {
  return traduzirErros(() => transacao((tx) => servicoDeHospedagem.criarHospedagem(criarRepositorioHospedagem(tx), entrada, contexto(usuarioId, agora))));
}

export function alterarHospedagem(entrada: AlterarHospedagem, usuarioId: string, agora: Date) {
  return traduzirErros(() => transacao((tx) => servicoDeHospedagem.alterarHospedagem(criarRepositorioHospedagem(tx), entrada, contexto(usuarioId, agora))));
}

export function registrarPedidoDeHospedagem(entrada: RegistrarPedidoDeHospedagem, usuarioId: string, agora: Date) {
  return traduzirErros(() => transacao((tx) => servicoDePedidos.registrarPedidoDeHospedagem(criarRepositorioPedidos(tx), entrada, contexto(usuarioId, agora))));
}

export function adicionarQuarto(entrada: AdicionarQuarto, usuarioId: string, agora: Date) {
  return traduzirErros(() => transacao((tx) => servicoDeHospedagem.adicionarQuarto(criarRepositorioHospedagem(tx), entrada, contexto(usuarioId, agora))));
}

export function removerQuarto(quartoId: string, usuarioId: string, agora: Date) {
  return traduzirErros(() => transacao((tx) => servicoDeHospedagem.removerQuarto(criarRepositorioHospedagem(tx), quartoId, contexto(usuarioId, agora))));
}

/** Pôr no quarto ou "Mover para…" outro quarto. */
export function porNoQuarto(entrada: PorNoQuarto, usuarioId: string, agora: Date) {
  return traduzirErros(() => transacao((tx) => servicoDeHospedagem.porNoQuarto(criarRepositorioHospedagem(tx), entrada, contexto(usuarioId, agora))));
}

export function tirarDoQuarto(entrada: PorNoQuarto, usuarioId: string, agora: Date) {
  return traduzirErros(() => transacao((tx) => servicoDeHospedagem.tirarDoQuarto(criarRepositorioHospedagem(tx), entrada, contexto(usuarioId, agora))));
}

/** Rooming sugerido por sexo para quem está sem quarto. */
export function aplicarRoomingSugerido(eventoId: string, usuarioId: string, agora: Date) {
  return traduzirErros(() => transacao((tx) => servicoDeHospedagem.aplicarRoomingSugerido(criarRepositorioHospedagem(tx), eventoId, contexto(usuarioId, agora))));
}
