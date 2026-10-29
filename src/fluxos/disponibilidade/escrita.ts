import { type Executor, RegraDeNegocioError, transacao } from "@/fluxos/_base";
import {
  abrirEnquete as abrirEnqueteNoModulo,
  type AbrirEnquete,
  alterarEnquete as alterarEnqueteNoModulo,
  type AlterarEnquete,
  criarRepositorioEnquete,
  encerrarEnquete as encerrarEnqueteNoModulo,
  type EncerrarEnquete,
  EnqueteJaEncerradaError,
  EnqueteNaoEncontradaError,
  EventoForaDaEnqueteError,
  EventoInexistenteError,
  FechamentoNoPassadoError,
  PessoaForaDaEnqueteError,
  registrarDisponibilidade as registrarDisponibilidadeNoModulo,
  type RegistrarDisponibilidade,
  type ResultadoDoRegistro,
} from "@/modules/disponibilidade";

function traduzir(erro: unknown): never {
  if (erro instanceof EnqueteNaoEncontradaError) throw new RegraDeNegocioError("Enquete não encontrada.");
  if (erro instanceof EnqueteJaEncerradaError) throw new RegraDeNegocioError("A enquete já estava encerrada.");
  if (erro instanceof FechamentoNoPassadoError) throw new RegraDeNegocioError("Escolha uma data a partir de hoje.");
  if (erro instanceof EventoInexistenteError) throw new RegraDeNegocioError("Algum evento escolhido não existe mais. Recarregue a página.");
  if (erro instanceof EventoForaDaEnqueteError) throw new RegraDeNegocioError("Algum evento não faz parte desta enquete. Recarregue a página.");
  if (erro instanceof PessoaForaDaEnqueteError) throw new RegraDeNegocioError("Esta pessoa não está no staff ativo.");
  throw erro;
}

async function emTransacao<T>(trabalho: (tx: Executor) => Promise<T>): Promise<T> {
  try {
    return await transacao(trabalho);
  } catch (erro: unknown) {
    traduzir(erro);
  }
}

/** Devolve o id da enquete criada. */
export function abrirEnquete(dados: AbrirEnquete, usuarioId: string, agora: Date): Promise<string> {
  return emTransacao((tx) => abrirEnqueteNoModulo(criarRepositorioEnquete(tx), { ...dados, usuarioId, agora }));
}

export function alterarEnquete(dados: AlterarEnquete, agora: Date): Promise<void> {
  return emTransacao((tx) => alterarEnqueteNoModulo(criarRepositorioEnquete(tx), { ...dados, agora }));
}

export function encerrarEnquete({ enqueteId }: EncerrarEnquete, agora: Date): Promise<void> {
  return emTransacao((tx) => encerrarEnqueteNoModulo(criarRepositorioEnquete(tx), { enqueteId, agora }));
}

/** Resposta em nome da pessoa: `registrado_por` = usuário do time e `registro_acao` por evento que mudou. */
export function registrarDisponibilidade(dados: RegistrarDisponibilidade, usuarioId: string, agora: Date): Promise<ResultadoDoRegistro> {
  return emTransacao((tx) => registrarDisponibilidadeNoModulo(criarRepositorioEnquete(tx), { ...dados, usuarioId, agora }));
}
