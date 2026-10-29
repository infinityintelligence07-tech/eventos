import { type ContextoDaCopy, dadosDaCopy, type TrechoDaCopy } from "../domain/contexto-da-copy";
import { type CopyGerada, gerarCopy } from "../domain/copy";
import type { ModeloDeCopy } from "../domain/modelo";
import { CHAVE_LINK_CUSTOS } from "../domain/schemas";
import { type EnvioAnterior, situacaoDaCopy, type SituacaoDaCopy } from "../domain/situacao";
import type { EventoDaComunicacao, PessoaDaEquipe, RepositorioComunicacao, VooDaPessoa } from "./porta";

export type CopyDaPessoa = {
  pessoa: PessoaDaEquipe;
  copy: CopyGerada;
  situacao: SituacaoDaCopy;
  ultimaEnviada: EnvioAnterior | null;
};

function trecho(voos: VooDaPessoa[], pessoa: PessoaDaEquipe, sentido: VooDaPessoa["sentido"]): TrechoDaCopy | null {
  return voos.find((voo) => voo.eventoId === pessoa.eventoId && voo.pessoaId === pessoa.pessoaId && voo.sentido === sentido) ?? null;
}

/** Copy do `modelo` para cada pessoa ativa dos eventos (ou só para `convocacaoId`), com a situação na tela. */
export async function gerarCopysDaEquipe(
  repo: RepositorioComunicacao,
  { eventos, modelo, instante, convocacaoId }: { eventos: EventoDaComunicacao[]; modelo: ModeloDeCopy; instante: Date; convocacaoId?: string },
): Promise<CopyDaPessoa[]> {
  const eventoPorId = new Map(eventos.map((evento) => [evento.id, evento]));
  const equipe = await repo.equipe([...eventoPorId.keys()], convocacaoId);
  if (equipe.length === 0) return [];

  const convocacaoIds = equipe.map((pessoa) => pessoa.convocacaoId);
  const hospedagens = await repo.hospedagens(convocacaoIds);
  const voos = await repo.voos([...new Set(equipe.map((pessoa) => pessoa.eventoId))]);
  const envios = (await repo.ultimosEnvios(convocacaoIds)).filter((envio) => envio.tipo === modelo.tipo);
  const linkCustos = await repo.configuracao(CHAVE_LINK_CUSTOS);

  return equipe.map((pessoa) => {
    const evento = eventoPorId.get(pessoa.eventoId)!;
    const contexto: ContextoDaCopy = {
      evento: {
        codigo: evento.codigo,
        tipoNome: evento.tipoNome,
        dataInicio: evento.dataInicio,
        dataFim: evento.dataFim,
        local: evento.local && { nome: evento.local.nome, cidade: evento.local.cidade },
      },
      pessoa: {
        nome: pessoa.nome,
        sexo: pessoa.sexo,
        funcao: pessoa.funcao,
        deslocamento: pessoa.deslocamento,
        horaInicio: pessoa.horaInicio,
      },
      hospedagem: hospedagens.get(pessoa.convocacaoId) ?? null,
      voos: { ida: trecho(voos, pessoa, "IDA"), volta: trecho(voos, pessoa, "VOLTA") },
      linkCustos,
    };
    const copy = gerarCopy(modelo.corpo, dadosDaCopy(contexto, instante));
    const envio = envios.find((item) => item.convocacaoId === pessoa.convocacaoId);
    const ultimaEnviada = envio ? { dadosHash: envio.dadosHash, enviadaEm: envio.enviadaEm, canal: envio.canal } : null;
    return { pessoa, copy, situacao: situacaoDaCopy(copy, ultimaEnviada), ultimaEnviada };
  });
}
