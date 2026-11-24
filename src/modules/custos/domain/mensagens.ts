// Textos prontos que o time copia e manda pelo WhatsApp. O sistema não envia nada sozinho: o envio automático
// pelo WhatsApp é construção futura (docs/08 §11.2).

const REAIS = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });

/** NBSP e NNBSP do Intl viram espaço comum: o texto vai ser colado no WhatsApp. */
const reais = (centavos: number) => REAIS.format(centavos / 100).replace(/[  ]/g, " ");

export function primeiroNome(nome: string): string {
  return nome.trim().split(/\s+/)[0] ?? "";
}

export type CustoAprovado = {
  /** Nome da pessoa (social ou completo); a mensagem usa só o primeiro. */
  nome: string;
  /** Código do evento (ou o nome, se não tiver código). */
  evento: string;
  protocolo: string;
  /** Total aprovado na auditoria. */
  totalCentavos: number;
};

/** Mensagem de "custo aprovado" para a pessoa. */
export function mensagemDeCustoAprovado({ nome, evento, protocolo, totalCentavos }: CustoAprovado): string {
  const saudacao = primeiroNome(nome);
  return [
    saudacao ? `Olá, ${saudacao}!` : "Olá!",
    "",
    `Sua solicitação de custo do evento ${evento} foi aprovada.`,
    "",
    `Protocolo: ${protocolo}`,
    `Valor aprovado: ${reais(totalCentavos)}`,
    "",
    "O valor seguiu para o financeiro fazer o pagamento. Qualquer dúvida, fale com o time de eventos.",
  ].join("\n");
}
