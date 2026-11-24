import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";

import { dataCurta, dinheiro } from "@/app/(time)/_componentes/ui/formatos";
import { identidadeDaSessao } from "@/app/(time)/_servidor/usuario-atual";
import { carregarCustosDoStaff } from "@/fluxos/custos";
import { staffDaIdentidade } from "@/fluxos/pessoas";
import { caminhoDoFormularioDeCusto, DIAS_DE_PRAZO_DO_FORMULARIO, primeiroNome } from "@/modules/custos";

import { MolduraDeEntrada } from "../login/_componentes/moldura";
import { NaoEhStaff, nomeDoEvento, periodoDoEvento, Sair, Situacao, situacaoParaOStaff } from "./_componentes/partes";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Solicitação de custo" };

/** O staff envia o custo do deslocamento (docs/08 §11.4). Fora do (time): só pede que o usuário logado seja staff. */
export default async function PaginaSolicitarCusto() {
  const sessao = await identidadeDaSessao();
  if (!sessao) redirect(`/login?proximo=${encodeURIComponent(caminhoDoFormularioDeCusto())}`);
  const staff = await staffDaIdentidade(sessao.identidade);
  if (!staff) return <NaoEhStaff />;

  const { abertos, enviadas } = await carregarCustosDoStaff(staff.pessoaId, new Date());
  const deEventosFechados = enviadas.filter((solicitacao) => !abertos.some((evento) => evento.id === solicitacao.evento.id));

  return (
    <MolduraDeEntrada>
      <h1>Solicitação de custo</h1>
      <p className="login-lead">
        Olá, {primeiroNome(staff.nome)}! Envie aqui o custo do seu deslocamento nos eventos em que você serviu. O formulário de cada evento
        abre no primeiro dia e fica aberto até {DIAS_DE_PRAZO_DO_FORMULARIO} dias depois do último.
      </p>

      <section className="custo-secao" aria-labelledby="titulo-abertos">
        <h2 id="titulo-abertos">Eventos com o prazo aberto</h2>
        {abertos.length === 0 ? (
          <p className="cadastro-ajuda">
            Nenhum evento seu está com o prazo aberto agora. Se o prazo de um evento já passou, fale com o time de eventos: eles registram a
            solicitação em seu nome.
          </p>
        ) : (
          <ul className="custo-lista">
            {abertos.map((evento) => (
              <li key={evento.id}>
                <Link href={caminhoDoFormularioDeCusto(evento.id)} className="custo-evento">
                  <strong>{nomeDoEvento(evento)}</strong>
                  <small>
                    {periodoDoEvento(evento)} · {evento.solicitacao ? `solicitação ${evento.solicitacao.protocolo}` : `envie até ${dataCurta(evento.fechaEm)}`}
                  </small>
                  <span className="custo-evento-acao">{evento.solicitacao ? "Ver o que foi enviado" : "Enviar solicitação"}</span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>

      {deEventosFechados.length > 0 && (
        <section className="custo-secao" aria-labelledby="titulo-enviadas">
          <h2 id="titulo-enviadas">Solicitações anteriores</h2>
          <ul className="custo-lista">
            {deEventosFechados.map((solicitacao) => (
              <li key={solicitacao.protocolo}>
                <Link href={caminhoDoFormularioDeCusto(solicitacao.evento.id)} className="custo-evento">
                  <strong>{nomeDoEvento(solicitacao.evento)}</strong>
                  <small>
                    {solicitacao.protocolo} · {dinheiro(solicitacao.totalCentavos)}
                  </small>
                  <Situacao auditoria={solicitacao.auditoria}>{situacaoParaOStaff(solicitacao.auditoria, solicitacao.financeiro, solicitacao.pagoEm)}</Situacao>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}

      <p className="cadastro-ajuda">
        O consumo do seu carro vem do <Link href="/meu-cadastro">Meu cadastro</Link>. Mantenha ele em dia.
      </p>
      <Sair />
    </MolduraDeEntrada>
  );
}
