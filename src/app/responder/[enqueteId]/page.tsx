import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { sair } from "@/app/(time)/_servidor/sessao";
import { identidadeDaSessao } from "@/app/(time)/_servidor/usuario-atual";
import { carregarEnqueteParaResponder } from "@/fluxos/disponibilidade";
import { staffDaIdentidade } from "@/fluxos/pessoas";
import { caminhoDeResposta, periodoCurto } from "@/modules/disponibilidade";

import { MolduraDeEntrada } from "../../login/_componentes/moldura";
import { FormularioDaResposta } from "./_componentes/formulario";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Responder enquete" };

function Sair() {
  return (
    <form action={sair} className="cadastro-sair">
      <button type="submit">Sair</button>
    </form>
  );
}

/** O staff responde a enquete de disponibilidade. Fora do (time): só pede que o usuário logado seja staff. */
export default async function PaginaResponderEnquete({ params }: { params: Promise<{ enqueteId: string }> }) {
  const { enqueteId } = await params;
  const sessao = await identidadeDaSessao();
  if (!sessao) redirect(`/login?proximo=${encodeURIComponent(caminhoDeResposta(enqueteId))}`);

  const staff = await staffDaIdentidade(sessao.identidade);
  if (!staff) {
    return (
      <MolduraDeEntrada>
        <h1>Enquete de disponibilidade</h1>
        <p className="login-lead">
          Sua conta não está no cadastro de staff do Eventos. Quem tem função de evento no IAM Control aparece aqui em até 30
          minutos. Se já faz parte do staff, fale com o time de eventos.
        </p>
        <Sair />
      </MolduraDeEntrada>
    );
  }

  const enquete = await carregarEnqueteParaResponder(enqueteId, staff.pessoaId, new Date());
  if (!enquete) {
    return (
      <MolduraDeEntrada>
        <h1>Enquete não encontrada</h1>
        <p className="login-lead">Este link não leva a uma enquete. Confira com o time de eventos se o link está certo.</p>
        <Sair />
      </MolduraDeEntrada>
    );
  }

  const primeiroNome = staff.nome.split(" ")[0];
  if (enquete.situacao === "ENCERRADA") {
    const podem = enquete.eventos.filter((evento) => evento.resposta === "PODE");
    return (
      <MolduraDeEntrada>
        <h1>{enquete.titulo}</h1>
        <p className="login-lead">
          {primeiroNome}, esta enquete já encerrou ({enquete.descricaoDoFechamento.toLowerCase()}). Para mudar a sua resposta, fale
          com o time de eventos.
        </p>
        {enquete.respondeu && (
          <p className="cadastro-ok">
            {podem.length === 0
              ? "Sua resposta: não pode em nenhum destes eventos."
              : `Sua resposta: pode em ${podem.map((evento) => evento.codigo ?? evento.nome).join(", ")}.`}
          </p>
        )}
        <Sair />
      </MolduraDeEntrada>
    );
  }

  return (
    <MolduraDeEntrada>
      <h1>{enquete.titulo}</h1>
      <p className="login-lead">
        Olá, {primeiroNome}! {enquete.descricaoDoFechamento}. Você pode voltar a este link e alterar a resposta até lá.
      </p>
      {enquete.respondeu && <p className="cadastro-ok">Você já respondeu sobre estes eventos. As marcações abaixo são a sua resposta atual.</p>}
      <FormularioDaResposta
        enqueteId={enquete.id}
        jaRespondeu={enquete.respondeu}
        eventos={enquete.eventos.map((evento) => ({
          id: evento.id,
          nome: evento.codigo ? `${evento.codigo} · ${evento.nome}` : evento.nome,
          quando: periodoCurto(evento.dataInicio, evento.dataFim),
          onde: evento.poloCodigo,
          marcado: evento.resposta === "PODE",
        }))}
      />
      <Sair />
    </MolduraDeEntrada>
  );
}
