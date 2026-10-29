import { ConflitoDeVersaoError, RegraDeNegocioError, transacao, type AtorDaEscrita } from "@/fluxos/_base";
import {
  criarRepositorioComunicacao,
  gerarCopysDaEquipe,
  listarEmPortugues,
  type MarcarCopyComoEnviada,
  type RecusaDoEnvio,
  recusaDoEnvio,
  rotuloDaVariavel,
} from "@/modules/comunicacao";
import {
  concluirComunicacao,
  ConvocacaoInativaError,
  ConvocacaoNaoEncontradaError,
  criarRepositorioConvite,
  EscalaMudouError,
  EventoNaoEncontradoError,
  podeComunicar,
  registrarConvite,
  type StatusEscala,
} from "@/modules/escala";

const PESSOA_FORA_DA_ESCALA = "A pessoa não está mais nesta escala. Recarregue a página.";

function mensagemDaRecusa(recusa: RecusaDoEnvio, faltando: string[]): string {
  switch (recusa) {
    case "ESCALA_NAO_APROVADA":
      return "A escala deste evento não está aprovada. As copys saem depois da aprovação.";
    case "CONVOCACAO_INATIVA":
      return PESSOA_FORA_DA_ESCALA;
    case "MODELO_INATIVO":
      return "O modelo desta copy foi desativado. Recarregue a página.";
    case "FALTA_DADO":
      return `Esta copy está bloqueada: falta ${listarEmPortugues(faltando.map(rotuloDaVariavel))}.`;
    case "COPY_MUDOU":
      return "A copy mudou desde que você copiou. Copie de novo.";
    case "JA_ENVIADA":
      return "Esta copy já foi marcada como enviada.";
    default: {
      const desconhecida: never = recusa;
      throw new Error(`recusa desconhecida: ${String(desconhecida)}`);
    }
  }
}

function traduzirErroDaEscala(erro: unknown): unknown {
  if (erro instanceof ConvocacaoInativaError || erro instanceof ConvocacaoNaoEncontradaError) return new RegraDeNegocioError(PESSOA_FORA_DA_ESCALA);
  if (erro instanceof EventoNaoEncontradoError) return new RegraDeNegocioError("Evento não encontrado.");
  if (erro instanceof EscalaMudouError) return new ConflitoDeVersaoError(erro.message);
  return erro;
}

export type EnvioRegistradoNaTela = {
  eventoId: string;
  nome: string;
  /** A pessoa passou de "na escala" para "aguardando resposta". */
  convidada: boolean;
  /** Foi a última copy de escalação: a escala virou COMUNICADA. */
  comunicada: boolean;
};

/**
 * "Marcar como enviada" (docs/07 §4.3): numa transação, grava a mensagem ENVIADA (canal COPIADO) e, na copy de
 * escalação, convida a pessoa e conclui a comunicação da escala quando era a última.
 */
export async function registrarEnvioDaCopy(entrada: MarcarCopyComoEnviada, ator: AtorDaEscrita, agora: Date): Promise<EnvioRegistradoNaTela> {
  try {
    return await transacao(ator, async (tx) => {
      const repo = criarRepositorioComunicacao(tx);
      const travada = await repo.travarConvocacao(entrada.convocacaoId);
      if (!travada) throw new RegraDeNegocioError(PESSOA_FORA_DA_ESCALA);
      const modelo = await repo.modelo(entrada.modeloId);
      if (!modelo) throw new RegraDeNegocioError("O modelo desta copy não existe mais. Recarregue a página.");
      const [evento] = await repo.eventos({ eventoId: travada.eventoId });
      if (!evento) throw new RegraDeNegocioError("Evento não encontrado.");

      const [daPessoa] = await gerarCopysDaEquipe(repo, { eventos: [evento], modelo, instante: agora, convocacaoId: entrada.convocacaoId });
      const recusa = recusaDoEnvio({
        // status_escala tem CHECK no banco com os valores de StatusEscala.
        escalaComunicavel: podeComunicar(evento.statusEscala as StatusEscala),
        convocacaoAtiva: daPessoa !== undefined,
        modeloAtivo: modelo.ativo,
        copy: daPessoa?.copy ?? { pronta: false, dadosHash: "" },
        ultimaEnviada: daPessoa?.ultimaEnviada ?? null,
        dadosHashDaTela: entrada.dadosHash,
      });
      if (recusa || !daPessoa) throw new RegraDeNegocioError(mensagemDaRecusa(recusa ?? "CONVOCACAO_INATIVA", daPessoa?.copy.faltando ?? []));

      await repo.registrarEnvio({
        convocacaoId: entrada.convocacaoId,
        eventoId: evento.id,
        modeloId: modelo.id,
        tipo: modelo.tipo,
        texto: daPessoa.copy.texto,
        dadosHash: daPessoa.copy.dadosHash,
        canal: "COPIADO",
        instante: agora,
        usuarioId: ator.usuarioId,
      });

      if (modelo.tipo !== "ESCALACAO") return { eventoId: evento.id, nome: daPessoa.pessoa.nome, convidada: false, comunicada: false };

      const convite = criarRepositorioConvite(tx);
      const convidada = (await registrarConvite(convite, { convocacaoId: entrada.convocacaoId, instante: agora })) === "CONVIDADA";
      const comunicada = (await concluirComunicacao(convite, { eventoId: evento.id, usuarioId: ator.usuarioId, instante: agora })) === "COMUNICADA";
      return { eventoId: evento.id, nome: daPessoa.pessoa.nome, convidada, comunicada };
    });
  } catch (erro: unknown) {
    throw traduzirErroDaEscala(erro);
  }
}
