import { chaveDoComprovante, MAXIMO_DE_COMPROVANTES, nomeParaMostrar, type TipoDeComprovante } from "../domain/comprovantes";
import { ErroDosCustos } from "../domain/erros";
import { podeCorrigirNoPrazo } from "../domain/prazo";
import { exigirPrazoAberto, periodoDoEvento, type RepositorioSolicitacoes } from "./solicitacoes";

// Comprovantes do formulário de custo do staff (docs/08 §11.4). O arquivo fica no armazenamento; aqui ficam as
// regras de quem pode anexar ou remover e a linha em eventos.comprovante_custo. Quem chama (o fluxo) guarda o
// arquivo antes e apaga depois: este serviço só fala com o banco.

export type ComprovanteGravado = {
  id: string;
  eventoId: string;
  pessoaId: string;
  solicitacaoId: string | null;
  /** Caminho do objeto no armazenamento. Não vai para a tela. */
  chave: string;
  nome: string;
  tipo: TipoDeComprovante;
  tamanhoBytes: number;
  criadoEm: Date;
};

export type RepositorioComprovantes = {
  /** Serializa quem mexe nos anexos (e na solicitação) da pessoa no evento, até o fim da transação. */
  travar(eventoId: string, pessoaId: string): Promise<void>;
  daPessoaNoEvento(eventoId: string, pessoaId: string): Promise<ComprovanteGravado[]>;
  buscar(comprovanteId: string): Promise<ComprovanteGravado | null>;
  inserir(comprovante: {
    id: string;
    eventoId: string;
    pessoaId: string;
    solicitacaoId: string | null;
    chave: string;
    nome: string;
    tipo: TipoDeComprovante;
    tamanhoBytes: number;
    usuarioId: string;
    instante: Date;
  }): Promise<ComprovanteGravado>;
  apagar(comprovanteId: string): Promise<void>;
  registrar(registro: { comprovanteId: string; eventoId: string; acao: string; dados: Record<string, unknown>; usuarioId: string }): Promise<void>;
};

type Leitura = Pick<RepositorioSolicitacoes, "eventoDoCusto" | "convocacaoDaPessoa" | "situacaoDaSolicitacaoDaPessoa">;

export type QuemAnexa = { eventoId: string; pessoaId: string; instante: Date };

/**
 * A pessoa mexe nos próprios anexos enquanto ainda pode enviar ou corrigir: antes de enviar (na escala, evento não
 * cancelado e prazo aberto) ou com a solicitação reprovada e dentro do prazo de correção. Com a solicitação em
 * conferência ou aprovada, os comprovantes ficam como foram enviados. Devolve a solicitação, se já existir.
 */
export async function exigirAnexoLiberado(repo: Leitura, { eventoId, pessoaId, instante }: QuemAnexa): Promise<{ solicitacaoId: string | null }> {
  const evento = await repo.eventoDoCusto(eventoId);
  if (!evento) throw new ErroDosCustos("Evento não encontrado.");

  const solicitacao = await repo.situacaoDaSolicitacaoDaPessoa(eventoId, pessoaId);
  if (solicitacao) {
    if (solicitacao.auditoria !== "REPROVADO") throw new ErroDosCustos("A solicitação já foi enviada: os comprovantes não podem mais ser alterados. Se algo estiver errado, fale com o time de eventos.");
    if (!podeCorrigirNoPrazo(periodoDoEvento(evento), solicitacao.auditadoEm, instante)) throw new ErroDosCustos("O prazo para corrigir esta solicitação acabou. Fale com o time de eventos.");
    return { solicitacaoId: solicitacao.id };
  }

  if (!(await repo.convocacaoDaPessoa(eventoId, pessoaId))) throw new ErroDosCustos("Você não está na escala deste evento. Se serviu nele, fale com o time de eventos.");
  if (evento.cancelado) throw new ErroDosCustos("Este evento foi cancelado. Se você teve custo com ele, fale com o time de eventos.");
  exigirPrazoAberto(evento, instante);
  return { solicitacaoId: null };
}

export type ArquivoParaAnexar = { id: string; nomeOriginal: string; tipo: TipoDeComprovante; tamanhoBytes: number };

/** A chave do objeto para o arquivo que vai ser guardado (o fluxo guarda antes de gravar a linha). */
export function chaveParaAnexar(eventoId: string, arquivo: Pick<ArquivoParaAnexar, "id" | "tipo">): string {
  return chaveDoComprovante({ eventoId, id: arquivo.id, tipo: arquivo.tipo });
}

/** Grava a linha do anexo já guardado no armazenamento. Roda na transação, com a pessoa travada no evento. */
export async function anexarComprovante(
  repo: Leitura,
  comprovantes: RepositorioComprovantes,
  arquivo: ArquivoParaAnexar,
  { eventoId, pessoaId, usuarioId, instante }: QuemAnexa & { usuarioId: string },
): Promise<ComprovanteGravado> {
  await comprovantes.travar(eventoId, pessoaId);
  const { solicitacaoId } = await exigirAnexoLiberado(repo, { eventoId, pessoaId, instante });
  const atuais = await comprovantes.daPessoaNoEvento(eventoId, pessoaId);
  if (atuais.length >= MAXIMO_DE_COMPROVANTES) throw new ErroDosCustos(`Cada solicitação aceita até ${MAXIMO_DE_COMPROVANTES} comprovantes. Remova um para anexar outro.`);

  const gravado = await comprovantes.inserir({
    id: arquivo.id,
    eventoId,
    pessoaId,
    solicitacaoId,
    chave: chaveParaAnexar(eventoId, arquivo),
    nome: nomeParaMostrar(arquivo.nomeOriginal, arquivo.tipo),
    tipo: arquivo.tipo,
    tamanhoBytes: arquivo.tamanhoBytes,
    usuarioId,
    instante,
  });
  // Sem o nome do arquivo: o histórico é imutável e o nome pode trazer dado pessoal.
  await comprovantes.registrar({
    comprovanteId: gravado.id,
    eventoId,
    acao: "COMPROVANTE_ANEXADO",
    usuarioId,
    dados: { propria: true, tipo: gravado.tipo, tamanhoBytes: gravado.tamanhoBytes, ...(solicitacaoId ? { solicitacaoId } : {}) },
  });
  return gravado;
}

/** Tira a linha do anexo da própria pessoa e devolve a chave, para o fluxo apagar o arquivo depois da transação. */
export async function removerComprovante(
  repo: Leitura,
  comprovantes: RepositorioComprovantes,
  comprovanteId: string,
  { eventoId, pessoaId, usuarioId, instante }: QuemAnexa & { usuarioId: string },
): Promise<ComprovanteGravado> {
  await comprovantes.travar(eventoId, pessoaId);
  const comprovante = await comprovantes.buscar(comprovanteId);
  // Anexo de outra pessoa (ou de outro evento) responde como se não existisse.
  if (!comprovante || comprovante.pessoaId !== pessoaId || comprovante.eventoId !== eventoId) throw new ErroDosCustos("Comprovante não encontrado. Recarregue a página.");
  await exigirAnexoLiberado(repo, { eventoId, pessoaId, instante });

  await comprovantes.apagar(comprovante.id);
  await comprovantes.registrar({
    comprovanteId: comprovante.id,
    eventoId,
    acao: "COMPROVANTE_REMOVIDO",
    usuarioId,
    dados: { propria: true, tipo: comprovante.tipo, tamanhoBytes: comprovante.tamanhoBytes, ...(comprovante.solicitacaoId ? { solicitacaoId: comprovante.solicitacaoId } : {}) },
  });
  return comprovante;
}
