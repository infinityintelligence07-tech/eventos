import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { sair } from "@/app/(time)/_servidor/sessao";
import { identidadeDaSessao } from "@/app/(time)/_servidor/usuario-atual";
import { carregarMeuCadastro, staffDaIdentidade } from "@/fluxos/pessoas";
import type { PendenciaDoCadastro } from "@/modules/pessoas";

import { MolduraDeEntrada } from "../login/_componentes/moldura";
import { FormularioDoMeuCadastro } from "./_componentes/formulario";

export const dynamic = "force-dynamic";

/** Para o próprio staff (os rótulos da ficha falam com o time). */
const O_QUE_FALTA: Record<PendenciaDoCadastro, string> = {
  SEXO: "sexo",
  CAMISETA: "camiseta",
  FUNCAO: "o que você sabe fazer",
  LOCALIZACAO: "endereço (rua e número)",
  CONSUMO_DO_CARRO: "consumo do carro",
};
export const metadata: Metadata = { title: "Meu cadastro" };

/** O staff completa os próprios dados (docs/10). Fora do (time): só pede que o usuário logado seja staff. */
export default async function PaginaMeuCadastro() {
  const sessao = await identidadeDaSessao();
  if (!sessao) redirect("/login?proximo=%2Fmeu-cadastro");

  const staff = await staffDaIdentidade(sessao.identidade);
  const carregado = staff ? await carregarMeuCadastro(staff.pessoaId, new Date()) : null;
  if (!staff || !carregado) {
    return (
      <MolduraDeEntrada>
        <h1>Meu cadastro</h1>
        <p className="login-lead">
          Sua conta não está no cadastro de staff do Eventos. Quem tem função de evento no IAM Control (staff, DJ, fotógrafo,
          líder...) aparece aqui em até 30 minutos. Se já faz parte do staff, fale com o time de eventos.
        </p>
        <form action={sair}>
          <button type="submit" className="login-submit">
            Sair
          </button>
        </form>
      </MolduraDeEntrada>
    );
  }

  const { ficha, pendencias, local, opcoes } = carregado;
  return (
    <MolduraDeEntrada>
      <h1>Meu cadastro</h1>
      <p className="login-lead">
        Olá, {staff.nome.split(" ")[0]}! Complete os dados que o time de eventos usa para escalar, reservar hotel e calcular o seu
        deslocamento.
      </p>
      {pendencias.length > 0 ? (
        <p className="cadastro-pendencias">Falta: {pendencias.map((pendencia) => O_QUE_FALTA[pendencia]).join(", ")}.</p>
      ) : (
        local.revisadoEm && <p className="cadastro-ok">Cadastro completo. Revisado em {local.revisadoEm.toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo" })}.</p>
      )}
      <FormularioDoMeuCadastro
        valores={{
          poloCodigo: ficha.poloCodigo,
          sexo: ficha.perfil.sexo,
          camisetaModelo: ficha.perfil.camisetaModelo,
          camisetaTamanho: ficha.perfil.camisetaTamanho,
          funcoes: ficha.funcoes.map((funcao) => ({ funcaoId: funcao.funcaoId, nivel: funcao.nivel })),
          cep: local.cep,
          cidade: local.cidade,
          uf: local.uf,
          temLocalizacao: local.temLocalizacao,
          veiculo: ficha.veiculo,
        }}
        opcoes={{ polos: opcoes.polos, funcoes: opcoes.funcoes.map((funcao) => ({ id: funcao.id, nome: funcao.nome })) }}
      />
      <form action={sair} className="cadastro-sair">
        <button type="submit">Sair</button>
      </form>
    </MolduraDeEntrada>
  );
}
