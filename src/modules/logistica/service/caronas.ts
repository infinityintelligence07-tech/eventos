import { mensagemDaRecusaDaCarona, podeEntrarNaCarona } from "../domain/caronas";
import { ErroDaLogistica, LogisticaMudouError } from "../domain/erros";
import type { ContextoDaAcao } from "./pedidos";

// Caronas: tabela eventos.carona (evento + motorista) e convocacao.carona_id dos passageiros.

export type ConvocacaoDaCarona = { convocacaoId: string; pessoaId: string; nome: string; eventoId: string; ativa: boolean; caronaId: string | null };

export type CaronaTravada = {
  id: string;
  eventoId: string;
  motoristaPessoaId: string;
  motoristaNome: string;
  lugares: number | null;
  passageiros: string[];
};

export type RepositorioCaronas = {
  travarConvocacao(convocacaoId: string): Promise<ConvocacaoDaCarona | null>;
  lugaresDoVeiculo(pessoaId: string): Promise<number | null>;
  caronaDoMotorista(eventoId: string, pessoaId: string): Promise<string | null>;
  inserirCarona(eventoId: string, motoristaPessoaId: string, instante: Date): Promise<string>;
  travarCarona(caronaId: string): Promise<CaronaTravada | null>;
  removerCarona(caronaId: string): Promise<void>;
  /** Compare-and-set: só grava se a carona da convocação ainda for `de`. */
  definirCarona(convocacaoId: string, de: string | null, para: string | null): Promise<boolean>;
  /** registro_acao da carona (entidade CARONA); a convocação afetada vai em `dados.convocacaoId`. */
  registrar(registro: { caronaId: string; convocacaoId: string; eventoId: string; acao: string; dados?: Record<string, unknown>; usuarioId: string }): Promise<void>;
};

async function convocacaoAtiva(repo: RepositorioCaronas, convocacaoId: string): Promise<ConvocacaoDaCarona> {
  const convocacao = await repo.travarConvocacao(convocacaoId);
  if (!convocacao) throw new ErroDaLogistica("A pessoa não está mais nesta escala. Recarregue a página.");
  if (!convocacao.ativa) throw new ErroDaLogistica(`${convocacao.nome} saiu da escala deste evento.`);
  return convocacao;
}

export async function criarCarona(
  repo: RepositorioCaronas,
  entrada: { eventoId: string; motoristaConvocacaoId: string },
  { usuarioId, instante }: ContextoDaAcao,
): Promise<string> {
  const motorista = await convocacaoAtiva(repo, entrada.motoristaConvocacaoId);
  if (motorista.eventoId !== entrada.eventoId) throw new ErroDaLogistica("Esta pessoa não está na escala deste evento.");
  const lugares = await repo.lugaresDoVeiculo(motorista.pessoaId);
  if (lugares === null) throw new ErroDaLogistica(`${motorista.nome} não tem veículo no cadastro. Cadastre o veículo em Pessoas.`);
  if (await repo.caronaDoMotorista(entrada.eventoId, motorista.pessoaId)) throw new ErroDaLogistica(`${motorista.nome} já é motorista neste evento.`);
  if (motorista.caronaId) throw new ErroDaLogistica(`${motorista.nome} está de passageiro em outra carona. Tire da carona antes.`);

  const caronaId = await repo.inserirCarona(entrada.eventoId, motorista.pessoaId, instante);
  await repo.registrar({ caronaId, convocacaoId: motorista.convocacaoId, eventoId: entrada.eventoId, acao: "MOTORISTA_DEFINIDO", usuarioId, dados: { lugares } });
  return caronaId;
}

export async function removerCarona(repo: RepositorioCaronas, caronaId: string, { usuarioId }: ContextoDaAcao): Promise<string> {
  const carona = await repo.travarCarona(caronaId);
  if (!carona) throw new ErroDaLogistica("Carona não encontrada. Recarregue a página.");
  await repo.removerCarona(caronaId);
  for (const convocacaoId of carona.passageiros) {
    await repo.registrar({ caronaId, convocacaoId, eventoId: carona.eventoId, acao: "CARONA_REMOVIDA", usuarioId, dados: { motivo: "motorista removido" } });
  }
  return carona.eventoId;
}

export async function definirCarona(
  repo: RepositorioCaronas,
  entrada: { convocacaoId: string; caronaId: string },
  { usuarioId }: ContextoDaAcao,
): Promise<{ eventoId: string; motorista: string }> {
  const carona = await repo.travarCarona(entrada.caronaId);
  if (!carona) throw new ErroDaLogistica("Carona não encontrada. Recarregue a página.");
  const passageiro = await convocacaoAtiva(repo, entrada.convocacaoId);
  if (passageiro.eventoId !== carona.eventoId) throw new ErroDaLogistica("Esta pessoa não está na escala deste evento.");
  if (carona.lugares === null) throw new ErroDaLogistica(`${carona.motoristaNome} está sem veículo no cadastro.`);
  if (passageiro.caronaId === carona.id) return { eventoId: carona.eventoId, motorista: carona.motoristaNome };

  const verificacao = podeEntrarNaCarona({ ...carona, lugares: carona.lugares }, passageiro);
  if (!verificacao.ok) throw new ErroDaLogistica(mensagemDaRecusaDaCarona(verificacao.motivo, carona.motoristaNome, carona.lugares));
  if (await repo.caronaDoMotorista(carona.eventoId, passageiro.pessoaId)) throw new ErroDaLogistica(`${passageiro.nome} é motorista de outra carona neste evento.`);

  if (!(await repo.definirCarona(passageiro.convocacaoId, passageiro.caronaId, carona.id))) throw new LogisticaMudouError("a carona da pessoa mudou");
  await repo.registrar({ caronaId: carona.id, convocacaoId: passageiro.convocacaoId, eventoId: carona.eventoId, acao: "CARONA_DEFINIDA", usuarioId, dados: { deCaronaId: passageiro.caronaId } });
  return { eventoId: carona.eventoId, motorista: carona.motoristaNome };
}

export async function tirarDaCarona(repo: RepositorioCaronas, convocacaoId: string, { usuarioId }: ContextoDaAcao): Promise<string> {
  const passageiro = await repo.travarConvocacao(convocacaoId);
  if (!passageiro) throw new ErroDaLogistica("A pessoa não está mais nesta escala. Recarregue a página.");
  if (!passageiro.caronaId) throw new LogisticaMudouError("a pessoa já estava sem carona");
  if (!(await repo.definirCarona(convocacaoId, passageiro.caronaId, null))) throw new LogisticaMudouError("a carona da pessoa mudou");
  await repo.registrar({ caronaId: passageiro.caronaId, convocacaoId, eventoId: passageiro.eventoId, acao: "CARONA_REMOVIDA", usuarioId });
  return passageiro.eventoId;
}
