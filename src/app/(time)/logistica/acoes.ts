"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";

import {
  adicionarQuarto,
  alterarHospedagem,
  alterarPedido,
  aplicarRoomingSugerido,
  cancelarPedido,
  criarCarona,
  criarHospedagem,
  definirCarona,
  definirPeriodoDoOcupante,
  dispensarLogisticaDoEvento,
  porNoQuarto,
  registrarPedidoDeHospedagem,
  registrarPedidoDeVoo,
  registrarRetornoDaSdc,
  registrarRetornoDeHospedagem,
  removerCarona,
  removerHospedagem,
  removerQuarto,
  tirarDaCarona,
  tirarDoQuarto,
  trocarDeQuarto,
} from "@/fluxos/logistica";
import {
  adicionarQuartoSchema,
  alterarHospedagemSchema,
  alterarPedidoSchema,
  aplicarRoomingSugeridoSchema,
  cancelarPedidoSchema,
  criarCaronaSchema,
  criarHospedagemSchema,
  definirCaronaSchema,
  definirPeriodoDoOcupanteSchema,
  dispensarLogisticaDoEventoSchema,
  moverDeQuartoSchema,
  porNoQuartoSchema,
  registrarPedidoDeHospedagemSchema,
  registrarPedidoDeVooSchema,
  registrarRetornoDeHospedagemSchema,
  registrarRetornoDeVooSchema,
  removerCaronaSchema,
  removerHospedagemSchema,
  removerQuartoSchema,
  tirarDaCaronaSchema,
  tirarDoQuartoSchema,
} from "@/modules/logistica";

import { executarAcao, type ResultadoAcao } from "../_servidor/acao";

/** Voos, hospedagem e caronas aparecem na Logística, na aba do evento, na Comunicação (copy) e no Início. */
function revalidarLogistica(eventoId: string) {
  revalidatePath("/logistica", "layout");
  revalidatePath(`/eventos/${eventoId}`, "layout");
  revalidatePath("/inicio");
}

/** Só volta para as telas de voo da Logística (nada de redirecionar para fora a partir do formulário). */
const destinoDoPedido = z
  .string()
  .regex(/^\/(logistica\/voos|eventos\/[0-9a-f-]{36}\/logistica)$/i)
  .catch("/logistica/voos");

/** Depois de registrar, abre o painel do pedido com "Copiar pedido" (a SDC ainda não tem portal), já no evento do pedido. */
export async function registrarPedidoDeVooAcao(_estado: ResultadoAcao, form: FormData): Promise<ResultadoAcao> {
  return executarAcao(form, registrarPedidoDeVooSchema, "logistica.gerir", async (dados, ator) => {
    const pedido = await registrarPedidoDeVoo(dados, ator, new Date());
    revalidarLogistica(pedido.eventoId);
    const destino = destinoDoPedido.parse(form.get("destino"));
    redirect(`${destino}?${destino === "/logistica/voos" ? `evento=${pedido.eventoId}&` : ""}ref=${pedido.referencia}&registrado=1`);
  });
}

/** "Este evento não precisa de voo" / "este evento não tem hospedagem" (e o desfazer dos dois). */
export async function dispensarLogisticaDoEventoAcao(_estado: ResultadoAcao, form: FormData): Promise<ResultadoAcao> {
  return executarAcao(form, dispensarLogisticaDoEventoSchema, "logistica.gerir", async (dados, ator) => {
    await dispensarLogisticaDoEvento(dados, ator);
    revalidarLogistica(dados.eventoId);
    if (dados.item === "VOO") return dados.dispensar ? "Evento marcado como sem voo: ele sai do aviso. Dá para desfazer." : "O evento voltou a contar no aviso de voos.";
    return dados.dispensar ? "Evento marcado como sem hospedagem. Dá para desfazer." : "O evento voltou a ter hospedagem para montar.";
  });
}

export async function alterarPedidoAcao(_estado: ResultadoAcao, form: FormData): Promise<ResultadoAcao> {
  return executarAcao(form, alterarPedidoSchema, "logistica.gerir", async (dados, ator) => {
    const pedido = await alterarPedido(dados, ator, new Date());
    revalidarLogistica(pedido.eventoId);
    return pedido.situacao === "ALTERADO"
      ? `Pedido ${pedido.referencia} alterado. Avise a SDC e registre o novo voo quando ela responder.`
      : `Pedido ${pedido.referencia} alterado.`;
  });
}

export async function cancelarPedidoAcao(_estado: ResultadoAcao, form: FormData): Promise<ResultadoAcao> {
  return executarAcao(form, cancelarPedidoSchema, "logistica.gerir", async (dados, ator) => {
    const pedido = await cancelarPedido(dados, ator, new Date());
    revalidarLogistica(pedido.eventoId);
    return `Pedido ${pedido.referencia} cancelado. Avise a SDC pelo canal de sempre.`;
  });
}

export async function registrarRetornoDeVooAcao(_estado: ResultadoAcao, form: FormData): Promise<ResultadoAcao> {
  return executarAcao(form, registrarRetornoDeVooSchema, "logistica.registrar_retorno_sdc", async (dados, ator) => {
    const pedido = await registrarRetornoDaSdc(dados, ator, new Date());
    revalidarLogistica(pedido.eventoId);
    return `Voo do pedido ${pedido.referencia} registrado. A copy de hospedagem da pessoa foi atualizada.`;
  });
}

export async function registrarRetornoDeHospedagemAcao(_estado: ResultadoAcao, form: FormData): Promise<ResultadoAcao> {
  return executarAcao(form, registrarRetornoDeHospedagemSchema, "logistica.registrar_retorno_sdc", async (dados, ator) => {
    const pedido = await registrarRetornoDeHospedagem(dados, ator, new Date());
    revalidarLogistica(pedido.eventoId);
    return `Reserva do pedido ${pedido.referencia} registrada: o hotel já aparece na hospedagem e na rooming list.`;
  });
}

export async function criarHospedagemAcao(_estado: ResultadoAcao, form: FormData): Promise<ResultadoAcao> {
  return executarAcao(form, criarHospedagemSchema, "logistica.gerir", async (dados, ator) => {
    await criarHospedagem(dados, ator, new Date());
    revalidarLogistica(dados.eventoId);
    return dados.localId ? "Hospedagem aberta. Agora crie os quartos." : "Hospedagem aberta, com o hotel a definir pela SDC. Agora crie os quartos.";
  });
}

export async function alterarHospedagemAcao(_estado: ResultadoAcao, form: FormData): Promise<ResultadoAcao> {
  return executarAcao(form, alterarHospedagemSchema, "logistica.gerir", async (dados, ator) => {
    const eventoId = await alterarHospedagem(dados, ator, new Date());
    revalidarLogistica(eventoId);
    return "Hospedagem atualizada.";
  });
}

export async function removerHospedagemAcao(_estado: ResultadoAcao, form: FormData): Promise<ResultadoAcao> {
  return executarAcao(form, removerHospedagemSchema, "logistica.gerir", async (dados, ator) => {
    const eventoId = await removerHospedagem(dados.hospedagemId, ator, new Date());
    revalidarLogistica(eventoId);
    return "Hospedagem removida.";
  });
}

export async function registrarPedidoDeHospedagemAcao(_estado: ResultadoAcao, form: FormData): Promise<ResultadoAcao> {
  return executarAcao(form, registrarPedidoDeHospedagemSchema, "logistica.gerir", async (dados, ator) => {
    const pedido = await registrarPedidoDeHospedagem(dados, ator, new Date());
    revalidarLogistica(pedido.eventoId);
    return `Pedido ${pedido.referencia} registrado. A SDC ainda não tem portal: copie o pedido e envie pelo canal de sempre.`;
  });
}

export async function adicionarQuartoAcao(_estado: ResultadoAcao, form: FormData): Promise<ResultadoAcao> {
  return executarAcao(form, adicionarQuartoSchema, "logistica.gerir", async (dados, ator) => {
    const eventoId = await adicionarQuarto(dados, ator, new Date());
    revalidarLogistica(eventoId);
    return `${dados.nome} criado.`;
  });
}

export async function removerQuartoAcao(_estado: ResultadoAcao, form: FormData): Promise<ResultadoAcao> {
  return executarAcao(form, removerQuartoSchema, "logistica.gerir", async (dados, ator) => {
    const eventoId = await removerQuarto(dados.quartoId, ator, new Date());
    revalidarLogistica(eventoId);
    return "Quarto removido.";
  });
}

export async function porNoQuartoAcao(_estado: ResultadoAcao, form: FormData): Promise<ResultadoAcao> {
  return executarAcao(form, porNoQuartoSchema, "logistica.gerir", async (dados, ator) => {
    const resultado = await porNoQuarto(dados, ator, new Date());
    revalidarLogistica(resultado.eventoId);
    return resultado.mudou ? `Pessoa colocada no ${resultado.nomeDoQuarto}. A copy de hospedagem ficou desatualizada.` : `A pessoa já estava no ${resultado.nomeDoQuarto}.`;
  });
}

/** "Mover para…" de quem já está num quarto: outro quarto com vaga, ou trocar de lugar com alguém de outro quarto. */
export async function moverDeQuartoAcao(_estado: ResultadoAcao, form: FormData): Promise<ResultadoAcao> {
  return executarAcao(form, moverDeQuartoSchema, "logistica.gerir", async (dados, ator) => {
    if ("trocar" in dados) {
      const troca = await trocarDeQuarto(dados.trocar, ator, new Date());
      revalidarLogistica(troca.eventoId);
      return `Troca feita: as duas pessoas mudaram de lugar entre o ${troca.nomeDoOutroQuarto} e o ${troca.nomeDoQuarto}. A copy de hospedagem ficou desatualizada.`;
    }
    const resultado = await porNoQuarto(dados.mover, ator, new Date());
    revalidarLogistica(resultado.eventoId);
    return resultado.mudou ? `Pessoa movida para o ${resultado.nomeDoQuarto}. A copy de hospedagem ficou desatualizada.` : `A pessoa já estava no ${resultado.nomeDoQuarto}.`;
  });
}

export async function tirarDoQuartoAcao(_estado: ResultadoAcao, form: FormData): Promise<ResultadoAcao> {
  return executarAcao(form, tirarDoQuartoSchema, "logistica.gerir", async (dados, ator) => {
    const eventoId = await tirarDoQuarto(dados, ator, new Date());
    revalidarLogistica(eventoId);
    return "Pessoa tirada do quarto.";
  });
}

export async function definirPeriodoDoOcupanteAcao(_estado: ResultadoAcao, form: FormData): Promise<ResultadoAcao> {
  return executarAcao(form, definirPeriodoDoOcupanteSchema, "logistica.gerir", async (dados, ator) => {
    const resultado = await definirPeriodoDoOcupante(dados, ator, new Date());
    revalidarLogistica(resultado.eventoId);
    return resultado.periodo ? "Período da pessoa salvo." : "A pessoa voltou a seguir o período da hospedagem.";
  });
}

export async function aplicarRoomingSugeridoAcao(_estado: ResultadoAcao, form: FormData): Promise<ResultadoAcao> {
  return executarAcao(form, aplicarRoomingSugeridoSchema, "logistica.gerir", async (dados, ator) => {
    const resultado = await aplicarRoomingSugerido(dados.eventoId, ator, new Date());
    revalidarLogistica(dados.eventoId);
    const alocadas = `${resultado.alocadas} ${resultado.alocadas === 1 ? "pessoa colocada" : "pessoas colocadas"} nos quartos por sexo.`;
    return resultado.semLugar > 0 ? `${alocadas} ${resultado.semLugar} ainda sem lugar: crie mais quartos.` : alocadas;
  });
}

export async function criarCaronaAcao(_estado: ResultadoAcao, form: FormData): Promise<ResultadoAcao> {
  return executarAcao(form, criarCaronaSchema, "logistica.gerir", async (dados, ator) => {
    await criarCarona(dados, ator, new Date());
    revalidarLogistica(dados.eventoId);
    return "Motorista adicionado.";
  });
}

export async function removerCaronaAcao(_estado: ResultadoAcao, form: FormData): Promise<ResultadoAcao> {
  return executarAcao(form, removerCaronaSchema, "logistica.gerir", async (dados, ator) => {
    const eventoId = await removerCarona(dados.caronaId, ator, new Date());
    revalidarLogistica(eventoId);
    return "Carona removida. Os passageiros ficaram sem carona.";
  });
}

export async function definirCaronaAcao(_estado: ResultadoAcao, form: FormData): Promise<ResultadoAcao> {
  return executarAcao(form, definirCaronaSchema, "logistica.gerir", async (dados, ator) => {
    const resultado = await definirCarona(dados, ator, new Date());
    revalidarLogistica(resultado.eventoId);
    return `Carona com ${resultado.motorista} definida.`;
  });
}

export async function tirarDaCaronaAcao(_estado: ResultadoAcao, form: FormData): Promise<ResultadoAcao> {
  return executarAcao(form, tirarDaCaronaSchema, "logistica.gerir", async (dados, ator) => {
    const eventoId = await tirarDaCarona(dados.convocacaoId, ator, new Date());
    revalidarLogistica(eventoId);
    return "Pessoa tirada da carona.";
  });
}
