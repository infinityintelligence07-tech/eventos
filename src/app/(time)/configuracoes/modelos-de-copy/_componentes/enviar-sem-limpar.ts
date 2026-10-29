import { type FormEvent, startTransition } from "react";

/**
 * Envia sem o `<form action>`: depois de uma server action o React 19 limpa os campos não controlados,
 * e quem errou um campo perderia todo o resto do que digitou.
 */
export function enviarSemLimpar(evento: FormEvent<HTMLFormElement>, acao: (form: FormData) => void) {
  evento.preventDefault();
  const dados = new FormData(evento.currentTarget);
  startTransition(() => acao(dados));
}
