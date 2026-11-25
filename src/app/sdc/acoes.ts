"use server";

import { revalidatePath } from "next/cache";

import type { ResultadoAcao } from "@/app/(time)/_servidor/formulario";
import { registrarCompraDeVoo, registrarReservaDeHospedagem } from "@/fluxos/sdc";
import { registrarCompraDeVooPelaSdcSchema, registrarReservaPelaSdcSchema } from "@/modules/logistica";

import { executarAcaoDaSdc } from "./_servidor/acao";

// As únicas escritas da SDC: registrar (ou corrigir) a compra de um pedido que já existe. Nada de criar, alterar ou
// cancelar pedido, nem mexer em quartos.

/** A compra aparece para a SDC e para o time (Voos, Hospedagem, aba do evento e o cartão do Início). */
function revalidarCompra() {
  revalidatePath("/sdc", "layout");
  revalidatePath("/logistica", "layout");
  revalidatePath("/eventos/[eventoId]/logistica", "page");
  revalidatePath("/inicio");
}

export async function registrarCompraDeVooAcao(_estado: ResultadoAcao, form: FormData): Promise<ResultadoAcao> {
  return executarAcaoDaSdc(form, registrarCompraDeVooPelaSdcSchema, async (dados, sdc) => {
    const { referencia } = await registrarCompraDeVoo(dados, sdc, new Date());
    revalidarCompra();
    return `Compra do pedido ${referencia} registrada. O time de eventos confere e aprova o pagamento.`;
  });
}

export async function registrarReservaAcao(_estado: ResultadoAcao, form: FormData): Promise<ResultadoAcao> {
  return executarAcaoDaSdc(form, registrarReservaPelaSdcSchema, async (dados, sdc) => {
    const { referencia } = await registrarReservaDeHospedagem(dados, sdc, new Date());
    revalidarCompra();
    return `Reserva do pedido ${referencia} registrada. O time de eventos confere e aprova o pagamento.`;
  });
}
