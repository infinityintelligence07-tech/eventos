import { randomUUID } from "node:crypto";

import { type ArmazenamentoDeArquivos, armazenamentoDeComprovantes } from "@/core/integrations/armazenamento";
import { logger } from "@/core/logging";
import { bancoParaLeitura, RegraDeNegocioError, transacao } from "@/fluxos/_base";
import {
  type ComprovanteDaTela,
  type ComprovanteGravado,
  conferirArquivo,
  criarRepositorioComprovantes,
  criarRepositorioSolicitacoes,
  MAXIMO_DE_COMPROVANTES,
  mensagemDaRecusa,
  servicoDeComprovantes,
} from "@/modules/custos";

import { traduzirErros } from "./comum";
import type { AtorDoStaff } from "./staff";

// Comprovantes do formulário de custo do staff (docs/08 §11.4). O arquivo vai para o armazenamento (Storage do
// Supabase em produção, disco no modo local) e a linha para eventos.comprovante_custo. A chamada ao armazenamento
// fica fora da transação, como as outras chamadas externas dos fluxos.

const FORMATO_UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Quanto vale o link de leitura do arquivo no armazenamento. */
const SEGUNDOS_DO_LINK = 300;

const MENSAGEM_ANEXO_DESLIGADO = "O envio de comprovantes não está disponível neste ambiente.";

/** Falso = produção sem as variáveis COMPROVANTES_S3_*: o formulário funciona sem o campo de anexo. */
export function anexoDeComprovantesLigado(): boolean {
  return armazenamentoDeComprovantes() !== null;
}

function armazenamento(): ArmazenamentoDeArquivos {
  const disponivel = armazenamentoDeComprovantes();
  if (!disponivel) throw new RegraDeNegocioError(MENSAGEM_ANEXO_DESLIGADO);
  return disponivel;
}

const daTela = ({ id, nome, tipo, tamanhoBytes, criadoEm }: ComprovanteGravado): ComprovanteDaTela => ({ id, nome, tipo, tamanhoBytes, criadoEm });

/** Apaga o arquivo sem derrubar quem chamou: sobra um objeto sem dono no armazenamento, e fica o aviso no log. */
async function apagarSemFalhar(onde: ArmazenamentoDeArquivos, chave: string, motivo: string): Promise<void> {
  try {
    await onde.apagar(chave);
  } catch (erro: unknown) {
    logger.warn({ componente: "comprovantes", motivo, erro: erro instanceof Error ? erro.name : "desconhecido" }, "não foi possível apagar um comprovante do armazenamento");
  }
}

/** Os anexos que a própria pessoa enviou para o evento (antes ou depois de a solicitação existir). */
export async function comprovantesDoStaff(eventoId: string, pessoaId: string): Promise<ComprovanteDaTela[]> {
  if (!FORMATO_UUID.test(eventoId)) return [];
  return (await criarRepositorioComprovantes(await bancoParaLeitura()).daPessoaNoEvento(eventoId, pessoaId)).map(daTela);
}

/**
 * A própria pessoa anexa um comprovante. O tipo e o tamanho saem do conteúdo recebido (não do que o navegador
 * declarou) e o nome do objeto é gerado aqui. Ordem: confere tudo, guarda o arquivo, grava a linha; se a gravação
 * falhar, o arquivo guardado é apagado.
 */
export async function anexarComprovante({ eventoId, nome, conteudo }: { eventoId: string; nome: string; conteudo: Uint8Array }, ator: AtorDoStaff, agora: Date): Promise<ComprovanteDaTela> {
  const onde = armazenamento();
  if (!FORMATO_UUID.test(eventoId)) throw new RegraDeNegocioError("Evento não encontrado.");
  const conferido = conferirArquivo(conteudo);
  if ("recusa" in conferido) throw new RegraDeNegocioError(mensagemDaRecusa(conferido.recusa));

  // Antes de guardar o arquivo: quem não pode anexar (fora da escala, fora do prazo, limite atingido) nem ocupa espaço.
  const leitura = await bancoParaLeitura();
  await traduzirErros(async () => {
    await servicoDeComprovantes.exigirAnexoLiberado(criarRepositorioSolicitacoes(leitura), { eventoId, pessoaId: ator.pessoaId, instante: agora });
  });
  if ((await criarRepositorioComprovantes(leitura).daPessoaNoEvento(eventoId, ator.pessoaId)).length >= MAXIMO_DE_COMPROVANTES) {
    throw new RegraDeNegocioError(`Cada solicitação aceita até ${MAXIMO_DE_COMPROVANTES} comprovantes. Remova um para anexar outro.`);
  }

  const arquivo = { id: randomUUID(), nomeOriginal: nome, tipo: conferido.tipo, tamanhoBytes: conteudo.byteLength };
  const chave = servicoDeComprovantes.chaveParaAnexar(eventoId, arquivo);
  await onde.guardar(chave, conteudo, arquivo.tipo);
  try {
    return daTela(
      await traduzirErros(() =>
        transacao(ator, (tx) =>
          servicoDeComprovantes.anexarComprovante(criarRepositorioSolicitacoes(tx), criarRepositorioComprovantes(tx), arquivo, {
            eventoId,
            pessoaId: ator.pessoaId,
            usuarioId: ator.usuarioId,
            instante: agora,
          }),
        ),
      ),
    );
  } catch (erro: unknown) {
    await apagarSemFalhar(onde, chave, "linha não gravada");
    throw erro;
  }
}

/** A própria pessoa remove um anexo dela (antes de enviar ou ao corrigir a reprovada). */
export async function removerComprovante({ eventoId, comprovanteId }: { eventoId: string; comprovanteId: string }, ator: AtorDoStaff, agora: Date): Promise<void> {
  const onde = armazenamento();
  if (!FORMATO_UUID.test(eventoId) || !FORMATO_UUID.test(comprovanteId)) throw new RegraDeNegocioError("Comprovante não encontrado. Recarregue a página.");
  const removido = await traduzirErros(() =>
    transacao(ator, (tx) =>
      servicoDeComprovantes.removerComprovante(criarRepositorioSolicitacoes(tx), criarRepositorioComprovantes(tx), comprovanteId, {
        eventoId,
        pessoaId: ator.pessoaId,
        usuarioId: ator.usuarioId,
        instante: agora,
      }),
    ),
  );
  await apagarSemFalhar(onde, removido.chave, "anexo removido");
}

/** Como entregar o arquivo: o link de curta duração do armazenamento, ou o conteúdo (modo local, sem link). */
export type ComprovanteAberto = { forma: "LINK"; url: string } | { forma: "CONTEUDO"; conteudo: Uint8Array; tipo: string; nome: string };

async function abrir(comprovante: ComprovanteGravado | null): Promise<ComprovanteAberto | null> {
  const onde = armazenamentoDeComprovantes();
  if (!comprovante || !onde) return null;
  const url = await onde.linkTemporario(comprovante.chave, SEGUNDOS_DO_LINK);
  if (url) return { forma: "LINK", url };
  const conteudo = await onde.ler(comprovante.chave);
  return conteudo ? { forma: "CONTEUDO", conteudo, tipo: comprovante.tipo, nome: comprovante.nome } : null;
}

/** A pessoa abre um anexo dela. Anexo de outra pessoa (ou de outro evento) responde como inexistente. */
export async function abrirComprovanteDoStaff(eventoId: string, comprovanteId: string, pessoaId: string): Promise<ComprovanteAberto | null> {
  if (!FORMATO_UUID.test(eventoId) || !FORMATO_UUID.test(comprovanteId)) return null;
  const comprovante = await criarRepositorioComprovantes(await bancoParaLeitura()).buscar(comprovanteId);
  if (!comprovante || comprovante.pessoaId !== pessoaId || comprovante.eventoId !== eventoId) return null;
  return abrir(comprovante);
}

/** O time abre um anexo na auditoria. Quem chama já conferiu que é alguém do time (perfil do Eventos). */
export async function abrirComprovanteParaOTime(comprovanteId: string): Promise<ComprovanteAberto | null> {
  if (!FORMATO_UUID.test(comprovanteId)) return null;
  return abrir(await criarRepositorioComprovantes(await bancoParaLeitura()).buscar(comprovanteId));
}
