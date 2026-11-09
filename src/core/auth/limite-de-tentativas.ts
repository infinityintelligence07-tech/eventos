// Limite de tentativas do login com senha (docs/10): por e-mail e por IP, numa janela móvel. Em memória (um processo
// web); reiniciar o app zera. O IAM Control continua sendo quem confere a senha.

export type LimiteDeTentativas = {
  bloqueado(chave: string, agora: Date): boolean;
  registrarFalha(chave: string, agora: Date): void;
  limpar(chave: string): void;
};

export function criarLimiteDeTentativas(maximo: number, janelaEmMs: number): LimiteDeTentativas {
  const falhas = new Map<string, number[]>();
  const recentes = (chave: string, agora: Date) => (falhas.get(chave) ?? []).filter((instante) => agora.getTime() - instante < janelaEmMs);
  return {
    bloqueado(chave, agora) {
      const lista = recentes(chave, agora);
      if (lista.length === 0) falhas.delete(chave);
      else falhas.set(chave, lista);
      return lista.length >= maximo;
    },
    registrarFalha(chave, agora) {
      falhas.set(chave, [...recentes(chave, agora), agora.getTime()]);
    },
    limpar(chave) {
      falhas.delete(chave);
    },
  };
}
