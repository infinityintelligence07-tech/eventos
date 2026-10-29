// Pontos de atenção da aprovação (docs/07 §6.2, docs/08 §6.3). "Sem PIX" fica fora: o dado está no sensivel (GH).

export type SituacaoParaAtencao = {
  vagasAbertas: { funcao: string; abertas: number }[];
  funcoesSemConfirmacao: string[];
  /** Ativas na escala que disseram "não pode" na enquete. */
  disseramQueNaoPodem: number;
  /** Ativas sem resposta na enquete do evento (só conta quando há enquete). */
  semRespostaNaEnquete: number;
  /** Ativas com deslocamento VOO e sem pedido ativo à SDC. */
  vooSemPedido: number;
  trainees: { funcao: string; quantidade: number }[];
};

export type PontoDeAtencao = { tom: "atencao" | "informacao"; texto: string };

const pessoas = (quantidade: number) => (quantidade === 1 ? "1 pessoa" : `${quantidade} pessoas`);

export function pontosDeAtencao(situacao: SituacaoParaAtencao): PontoDeAtencao[] {
  const pontos: PontoDeAtencao[] = [];
  for (const { funcao, abertas } of situacao.vagasAbertas) {
    if (abertas > 0) pontos.push({ tom: "atencao", texto: `${abertas} ${abertas === 1 ? "vaga aberta" : "vagas abertas"} em ${funcao}` });
  }
  if (situacao.funcoesSemConfirmacao.length > 0) {
    pontos.push({ tom: "atencao", texto: `Número de vagas sem confirmação: ${situacao.funcoesSemConfirmacao.join(", ")}` });
  }
  if (situacao.disseramQueNaoPodem > 0) {
    pontos.push({
      tom: "atencao",
      texto:
        situacao.disseramQueNaoPodem === 1
          ? "1 pessoa disse que não pode e ainda está na escala"
          : `${situacao.disseramQueNaoPodem} pessoas disseram que não podem e ainda estão na escala`,
    });
  }
  if (situacao.vooSemPedido > 0) {
    pontos.push({ tom: "atencao", texto: `${pessoas(situacao.vooSemPedido)} ${situacao.vooSemPedido === 1 ? "vai" : "vão"} de avião e ainda sem pedido de voo` });
  }
  if (situacao.semRespostaNaEnquete > 0) {
    pontos.push({ tom: "informacao", texto: `${pessoas(situacao.semRespostaNaEnquete)} sem resposta na enquete de disponibilidade` });
  }
  for (const { funcao, quantidade } of situacao.trainees) {
    if (quantidade > 0) pontos.push({ tom: "informacao", texto: `${quantidade} trainee${quantidade === 1 ? "" : "s"} em ${funcao}` });
  }
  return pontos;
}
