import { bancoParaLeitura, transacao } from "@/fluxos/_base";
import {
  type CaronaDoEvento,
  type CriarCarona,
  criarRepositorioCaronas,
  criarRepositorioPedidos,
  dataEmSaoPaulo,
  type DefinirCarona,
  type EventoDaLogistica,
  lugaresLivres,
  type PessoaDaCarona,
  servicoDeCaronas,
} from "@/modules/logistica";

import { traduzirErros } from "./comum";

export type CaronasCarregadas = {
  eventos: EventoDaLogistica[];
  evento: EventoDaLogistica | null;
  caronas: (CaronaDoEvento & { livres: number })[];
  /** Deslocamento "Carona" e sem motorista. */
  semCarona: PessoaDaCarona[];
  /** Escalados com veículo que ainda não são motoristas nem passageiros. */
  candidatosAMotorista: PessoaDaCarona[];
  /** Quem pode entrar numa carona: sem carona, não é motorista e não vai de avião. */
  candidatosAPassageiro: PessoaDaCarona[];
};

export async function carregarCaronas(eventoId: string | null, agora: Date): Promise<CaronasCarregadas> {
  const db = await bancoParaLeitura();
  const pedidos = criarRepositorioPedidos(db);
  const repo = criarRepositorioCaronas(db);
  const eventos = await pedidos.eventosDaLogistica({ desde: dataEmSaoPaulo(agora) });
  const evento = eventoId ? (eventos.find((item) => item.id === eventoId) ?? (await pedidos.eventoPorId(eventoId))) : (eventos[0] ?? null);
  if (!evento) return { eventos, evento: null, caronas: [], semCarona: [], candidatosAMotorista: [], candidatosAPassageiro: [] };

  const [caronas, equipe] = await Promise.all([repo.caronasDoEvento(evento.id), repo.equipeDoEvento(evento.id)]);
  const motoristas = new Set(caronas.map((carona) => carona.motoristaPessoaId));
  const livres = equipe.filter((pessoa) => !motoristas.has(pessoa.pessoaId) && pessoa.caronaId === null);
  const porDistancia = (a: PessoaDaCarona, b: PessoaDaCarona) => (a.distanciaKm ?? Infinity) - (b.distanciaKm ?? Infinity) || a.nome.localeCompare(b.nome, "pt-BR");
  return {
    eventos,
    evento,
    caronas: caronas.map((carona) => ({ ...carona, livres: lugaresLivres(carona.lugares ?? 0, carona.passageiros.length) })),
    semCarona: livres.filter((pessoa) => pessoa.deslocamento === "CARONA").sort(porDistancia),
    candidatosAMotorista: livres.filter((pessoa) => pessoa.lugaresDoVeiculo !== null && pessoa.deslocamento !== "VOO"),
    candidatosAPassageiro: livres.filter((pessoa) => pessoa.deslocamento !== "VOO").sort(porDistancia),
  };
}

const contexto = (usuarioId: string, agora: Date) => ({ usuarioId, instante: agora });

export function criarCarona(entrada: CriarCarona, usuarioId: string, agora: Date) {
  return traduzirErros(() => transacao((tx) => servicoDeCaronas.criarCarona(criarRepositorioCaronas(tx), entrada, contexto(usuarioId, agora))));
}

export function removerCarona(caronaId: string, usuarioId: string, agora: Date) {
  return traduzirErros(() => transacao((tx) => servicoDeCaronas.removerCarona(criarRepositorioCaronas(tx), caronaId, contexto(usuarioId, agora))));
}

export function definirCarona(entrada: DefinirCarona, usuarioId: string, agora: Date) {
  return traduzirErros(() => transacao((tx) => servicoDeCaronas.definirCarona(criarRepositorioCaronas(tx), entrada, contexto(usuarioId, agora))));
}

export function tirarDaCarona(convocacaoId: string, usuarioId: string, agora: Date) {
  return traduzirErros(() => transacao((tx) => servicoDeCaronas.tirarDaCarona(criarRepositorioCaronas(tx), convocacaoId, contexto(usuarioId, agora))));
}
