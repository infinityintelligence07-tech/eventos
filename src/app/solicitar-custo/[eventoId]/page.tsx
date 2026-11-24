import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import type { ReactNode } from "react";

import { dataCurta, dinheiro, distancia } from "@/app/(time)/_componentes/ui/formatos";
import { identidadeDaSessao } from "@/app/(time)/_servidor/usuario-atual";
import { carregarFormularioDoStaff, type SolicitacaoDoStaff, type SugestoesDoStaff } from "@/fluxos/custos";
import { staffDaIdentidade } from "@/fluxos/pessoas";
import { caminhoDoFormularioDeCusto, DIAS_DE_PRAZO_DO_FORMULARIO } from "@/modules/custos";

import { MolduraDeEntrada } from "../../login/_componentes/moldura";
import { calcularPreviaDoStaffAcao, corrigirMeuCustoAcao, solicitarCustoAcao } from "../acoes";
import { type DeslocamentoDoFormulario, FormularioDeCusto } from "../_componentes/formulario";
import { NaoEhStaff, nomeDoEvento, periodoDoEvento, Sair, Situacao, situacaoParaOStaff } from "../_componentes/partes";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Solicitação de custo" };

const decimal = (valor: number | null) => (valor === null ? "" : valor.toLocaleString("pt-BR", { maximumFractionDigits: 2 }));
const campoDeDinheiro = (centavos: number | null) => (centavos === null ? "" : (centavos / 100).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 }));
const primeiro = (valor: string | string[] | undefined) => (Array.isArray(valor) ? valor[0] : valor);

function Pagina({ titulo, children }: { titulo: string; children: ReactNode }) {
  return (
    <MolduraDeEntrada>
      <h1>{titulo}</h1>
      {children}
      <p className="custo-voltar">
        <Link href={caminhoDoFormularioDeCusto()}>Ver os meus eventos</Link>
      </p>
      <Sair />
    </MolduraDeEntrada>
  );
}

function deslocamentoNovo(sugestoes: SugestoesDoStaff): DeslocamentoDoFormulario {
  return { origem: "", destino: "", idaVolta: true, km: "", consumoKmL: decimal(sugestoes.consumoKmL), precoLitroCentavos: campoDeDinheiro(sugestoes.precoLitroCentavos), pedagioCentavos: "" };
}

/** O que foi enviado: deslocamentos, despesas, itens do time e total. */
function Enviado({ solicitacao }: { solicitacao: SolicitacaoDoStaff }) {
  return (
    <div className="custo-enviado">
      {solicitacao.deslocamentos.map((deslocamento) => (
        <div key={deslocamento.ordem} className="custo-bloco">
          <p className="custo-linha">
            <strong>
              {deslocamento.origem} → {deslocamento.destino}
            </strong>
            <span>{dinheiro(deslocamento.totalCentavos)}</span>
          </p>
          <p className="cadastro-ajuda">
            {deslocamento.idaVolta ? "Ida e volta" : "Só ida"} · {distancia(deslocamento.km * (deslocamento.idaVolta ? 2 : 1))} · combustível {dinheiro(deslocamento.combustivelCentavos)} ·
            pedágio {dinheiro(deslocamento.pedagioCentavos)} · depreciação {dinheiro(deslocamento.depreciacaoCentavos)}
          </p>
        </div>
      ))}
      {solicitacao.despesas.map((despesa, indice) => (
        <p key={indice} className="custo-bloco custo-linha">
          <span>{despesa.descricao}</span>
          <span>{dinheiro(despesa.valorCentavos)}</span>
        </p>
      ))}
      {solicitacao.itensDoTime.map((item, indice) => (
        <p key={indice} className="custo-bloco custo-linha">
          <span>
            {item.descricao}
            <small> · lançado pelo time</small>
          </span>
          <span>{dinheiro(item.totalCentavos)}</span>
        </p>
      ))}
      <p className="custo-total">
        <span>Total</span>
        <strong>{dinheiro(solicitacao.totalCentavos)}</strong>
      </p>
    </div>
  );
}

/** O staff envia (ou acompanha) a solicitação de custo de um evento. Fora do (time): só pede que o usuário logado seja staff. */
export default async function PaginaSolicitarCustoDoEvento({
  params,
  searchParams,
}: {
  params: Promise<{ eventoId: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { eventoId } = await params;
  const sessao = await identidadeDaSessao();
  if (!sessao) redirect(`/login?proximo=${encodeURIComponent(caminhoDoFormularioDeCusto(eventoId))}`);
  const staff = await staffDaIdentidade(sessao.identidade);
  if (!staff) return <NaoEhStaff />;

  const busca = await searchParams;
  const carregado = await carregarFormularioDoStaff(eventoId, staff.pessoaId, new Date());

  switch (carregado.situacao) {
    case "NAO_ENCONTRADO":
      return (
        <Pagina titulo="Evento não encontrado">
          <p className="login-lead">Este link não leva a um evento. Confira com o time de eventos se o link está certo.</p>
        </Pagina>
      );

    case "FORA_DA_ESCALA":
      return (
        <Pagina titulo={nomeDoEvento(carregado.evento)}>
          <p className="login-lead">Você não está na escala deste evento, então não há solicitação de custo para enviar. Se você serviu nele, fale com o time de eventos.</p>
        </Pagina>
      );

    case "CANCELADO":
      return (
        <Pagina titulo={nomeDoEvento(carregado.evento)}>
          <p className="login-lead">Este evento foi cancelado, então o formulário de custo não abre. Se você teve custo com ele, fale com o time de eventos.</p>
        </Pagina>
      );

    case "AINDA_NAO_ABRIU":
      return (
        <Pagina titulo={nomeDoEvento(carregado.evento)}>
          <p className="login-lead">
            O formulário de custo deste evento abre em {dataCurta(carregado.prazo.abreEm)}, o primeiro dia do evento, e fica aberto até {dataCurta(carregado.prazo.fechaEm)}.
          </p>
        </Pagina>
      );

    case "ENCERRADO":
      return (
        <Pagina titulo={nomeDoEvento(carregado.evento)}>
          <p className="cadastro-pendencias">
            O prazo para enviar a solicitação deste evento acabou em {dataCurta(carregado.prazo.fechaEm)} ({DIAS_DE_PRAZO_DO_FORMULARIO} dias depois do último dia do evento).
          </p>
          <p className="login-lead">Fale com o time de eventos: eles podem registrar a solicitação em seu nome.</p>
        </Pagina>
      );

    case "ABERTO":
      return (
        <Pagina titulo={nomeDoEvento(carregado.evento)}>
          <p className="login-lead">
            Evento de {periodoDoEvento(carregado.evento)}. Informe o seu deslocamento; o valor é calculado pelas regras de custo. Envie até {dataCurta(carregado.prazo.fechaEm)}: depois de
            enviar, não dá para mandar outra solicitação deste evento.
          </p>
          {carregado.sugestoes.consumoKmL === null && (
            <p className="cadastro-ajuda">
              Dica: cadastre o consumo do seu carro no <Link href="/meu-cadastro">Meu cadastro</Link> e ele já vem preenchido aqui.
            </p>
          )}
          <FormularioDeCusto
            acao={solicitarCustoAcao}
            calcularPrevia={calcularPreviaDoStaffAcao}
            eventoId={carregado.evento.id}
            correcao={null}
            deslocamentosIniciais={[deslocamentoNovo(carregado.sugestoes)]}
            despesasIniciais={[]}
            deslocamentoNovo={deslocamentoNovo(carregado.sugestoes)}
          />
        </Pagina>
      );

    case "ENVIADA": {
      const { evento, solicitacao, correcao, sugestoes } = carregado;
      const aqui = caminhoDoFormularioDeCusto(evento.id);

      if (correcao.pode && primeiro(busca.corrigir) === "1") {
        return (
          <Pagina titulo={`Corrigir ${solicitacao.protocolo}`}>
            <p className="login-lead">{nomeDoEvento(evento)}. Ajuste o que o time apontou e reenvie: a solicitação volta para a conferência.</p>
            {solicitacao.motivoDaReprovacao && <p className="login-error">Motivo da reprovação: {solicitacao.motivoDaReprovacao}</p>}
            {solicitacao.itensDoTime.length > 0 && <p className="cadastro-ajuda">Os itens lançados pelo time continuam como estão; você altera o deslocamento e as suas despesas.</p>}
            <FormularioDeCusto
              acao={corrigirMeuCustoAcao}
              calcularPrevia={calcularPreviaDoStaffAcao}
              eventoId={evento.id}
              correcao={{ atualizadoEm: solicitacao.atualizadoEm }}
              deslocamentosIniciais={solicitacao.deslocamentos.map((linha) => ({
                origem: linha.origem,
                destino: linha.destino,
                idaVolta: linha.idaVolta,
                km: decimal(linha.km),
                consumoKmL: decimal(linha.consumoKmL),
                precoLitroCentavos: campoDeDinheiro(linha.precoLitroCentavos),
                // O banco guarda o pedágio já somado; o campo pede o de um sentido.
                pedagioCentavos: linha.pedagioCentavos === 0 ? "" : campoDeDinheiro(linha.idaVolta ? linha.pedagioCentavos / 2 : linha.pedagioCentavos),
              }))}
              despesasIniciais={solicitacao.despesas.map((despesa) => ({ descricao: despesa.descricao, valorCentavos: campoDeDinheiro(despesa.valorCentavos) }))}
              deslocamentoNovo={deslocamentoNovo(sugestoes)}
              totalDoTimeCentavos={solicitacao.itensDoTime.reduce((soma, item) => soma + item.totalCentavos, 0)}
              cancelarHref={aqui}
            />
          </Pagina>
        );
      }

      return (
        <Pagina titulo={nomeDoEvento(evento)}>
          {primeiro(busca.enviada) === "1" && (
            <p className="cadastro-ok" role="status">
              Solicitação {solicitacao.protocolo} enviada. O time de eventos vai conferir.
            </p>
          )}
          {primeiro(busca.corrigida) === "1" && (
            <p className="cadastro-ok" role="status">
              Correção enviada. A solicitação {solicitacao.protocolo} voltou para a conferência do time.
            </p>
          )}
          <p className="login-lead">
            Solicitação {solicitacao.protocolo}, {solicitacao.registradaPeloTime ? "registrada pelo time de eventos em seu nome" : "enviada por você"} em {dataCurta(solicitacao.criadoEm)}.
          </p>
          <p className="custo-linha">
            <span>Situação</span>
            <Situacao auditoria={solicitacao.auditoria}>{situacaoParaOStaff(solicitacao.auditoria, solicitacao.financeiro, solicitacao.pagoEm)}</Situacao>
          </p>

          {solicitacao.auditoria === "PENDENTE" && <p className="cadastro-ajuda">Enquanto o time confere, a solicitação não pode ser alterada. Se algo estiver errado, avise o time de eventos.</p>}
          {solicitacao.auditoria === "APROVADO" && (
            <p className="cadastro-ok">
              Aprovada{solicitacao.auditadoEm ? ` em ${dataCurta(solicitacao.auditadoEm)}` : ""}. Valor aprovado: {dinheiro(solicitacao.totalCentavos)}. O pagamento é feito pelo financeiro.
            </p>
          )}
          {solicitacao.auditoria === "REPROVADO" && (
            <>
              <p className="login-error">
                Reprovada{solicitacao.auditadoEm ? ` em ${dataCurta(solicitacao.auditadoEm)}` : ""}
                {solicitacao.motivoDaReprovacao ? `: ${solicitacao.motivoDaReprovacao}` : "."}
              </p>
              {correcao.pode ? (
                <>
                  <Link href={`${aqui}?corrigir=1`} className="login-submit custo-link-botao">
                    Corrigir e reenviar
                  </Link>
                  {correcao.ate && <p className="cadastro-ajuda">Você pode corrigir até {dataCurta(correcao.ate)}.</p>}
                </>
              ) : (
                <p className="cadastro-ajuda">
                  O prazo para corrigir{correcao.ate ? ` acabou em ${dataCurta(correcao.ate)}` : " acabou"}. Fale com o time de eventos: eles podem registrar a correção em seu nome.
                </p>
              )}
            </>
          )}

          <Enviado solicitacao={solicitacao} />
        </Pagina>
      );
    }

    default: {
      const desconhecida: never = carregado;
      throw new Error(`situação do formulário desconhecida: ${JSON.stringify(desconhecida)}`);
    }
  }
}
