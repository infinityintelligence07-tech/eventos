import { sql } from "drizzle-orm";

import { type Coordenadas, localizarCep, localizarEndereco } from "@/core/integrations/localizacao/localizacao";
import { logger } from "@/core/logging";
import { type AtorDaEscrita, bancoParaLeitura, RegraDeNegocioError, transacao } from "@/fluxos/_base";
import {
  atualizarMeuCadastro,
  comPendencias,
  criarConsultaPessoas,
  criarRepositorioMeuCadastro,
  type FichaDaPessoa,
  FuncaoInvalidaError,
  type MeuCadastro,
  type OpcoesDePessoas,
  pedidoDeLocalizacao,
  type PendenciaDoCadastro,
  PessoaNaoEncontradaError,
  PoloInvalidoError,
} from "@/modules/pessoas";

// "Meu cadastro" (docs/10): o staff completa os próprios dados. Quem ele é sai da sessão (usuário -> pessoa com
// pessoa_evento), nunca do formulário.

export type IdentidadeDaSessao = { email: string } | { usuarioId: string };

export type StaffDaSessao = { usuarioId: string; pessoaId: string; nome: string; email: string | null };

/** Nulo = sem usuário ativo ou o usuário não é staff (sem pessoa com pessoa_evento). */
export async function staffDaIdentidade(identidade: IdentidadeDaSessao): Promise<StaffDaSessao | null> {
  const filtro = "email" in identidade ? sql`lower(u.email) = ${identidade.email.trim().toLowerCase()}` : sql`u.id = ${identidade.usuarioId}`;
  const linhas = await (await bancoParaLeitura()).execute<{ usuario_id: string; pessoa_id: string; nome: string; email: string | null }>(sql`
    select u.id as usuario_id, p.id as pessoa_id, coalesce(nullif(trim(p.nome_social), ''), p.nome_completo) as nome, u.email
      from core.usuario u
      join core.pessoa p on p.usuario_id = u.id and p.deleted_at is null
      join eventos.pessoa_evento pe on pe.pessoa_id = p.id
     where u.ativo and u.deleted_at is null and ${filtro}
     order by p.ativo desc
     limit 1`);
  const linha = linhas.rows[0];
  return linha ? { usuarioId: linha.usuario_id, pessoaId: linha.pessoa_id, nome: linha.nome, email: linha.email } : null;
}

export type MeuCadastroCarregado = {
  ficha: FichaDaPessoa;
  pendencias: PendenciaDoCadastro[];
  local: { cep: string | null; cidade: string | null; uf: string | null; revisadoEm: Date | null; temLocalizacao: boolean };
  opcoes: OpcoesDePessoas;
};

export async function carregarMeuCadastro(pessoaId: string, agora: Date): Promise<MeuCadastroCarregado | null> {
  const banco = await bancoParaLeitura();
  const consulta = criarConsultaPessoas(banco);
  const [ficha, opcoes, local] = await Promise.all([
    consulta.ficha(pessoaId, agora),
    consulta.opcoes(),
    banco.execute<{ cep: string | null; cidade: string | null; uf: string | null; cadastro_revisado_em: Date | null }>(
      sql`select cep, cidade, uf, cadastro_revisado_em from eventos.pessoa_evento where pessoa_id = ${pessoaId}`,
    ),
  ]);
  if (!ficha) return null;
  const linha = local.rows[0];
  return {
    ficha,
    pendencias: comPendencias(ficha).pendencias,
    local: {
      cep: linha?.cep ?? null,
      cidade: linha?.cidade ?? null,
      uf: linha?.uf ?? null,
      revisadoEm: linha?.cadastro_revisado_em ? new Date(linha.cadastro_revisado_em) : null,
      temLocalizacao: ficha.perfil.lat !== null && ficha.perfil.lng !== null,
    },
    opcoes,
  };
}

/** O que aconteceu com a localização: o staff vê o aviso certo. */
export type SituacaoDaLocalizacao = "CALCULADA" | "APROXIMADA" | "MANTIDA" | "SEM_ENDERECO" | "NAO_ENCONTRADA" | "INDISPONIVEL";

type Localizacao = { coordenadas: Coordenadas | null; situacao: SituacaoDaLocalizacao };

const falhou = (erro: unknown) =>
  // Sem o endereço no log.
  logger.warn({ componente: "meu-cadastro", erro: erro instanceof Error ? erro.message : String(erro) }, "localização falhou");

/** Nulo = não achou; "ERRO" = o serviço falhou (já registrado no log). */
async function tentar(busca: () => Promise<Coordenadas | null>): Promise<Coordenadas | null | "ERRO"> {
  try {
    return await busca();
  } catch (erro: unknown) {
    falhou(erro);
    return "ERRO";
  }
}

/** Endereço no Nominatim; sem ele (ou fora do ar), o ponto do CEP na BrasilAPI. Tudo gratuito e sem chave. */
async function localizacaoDo(dados: MeuCadastro, jaTemLocalizacao: boolean): Promise<Localizacao> {
  const pedido = pedidoDeLocalizacao(dados, jaTemLocalizacao);
  if (!pedido) return { coordenadas: null, situacao: jaTemLocalizacao ? "MANTIDA" : "SEM_ENDERECO" };

  let errou = false;
  if (pedido.tipo === "ENDERECO") {
    const peloEndereco = await tentar(() => localizarEndereco(pedido));
    if (peloEndereco !== null && peloEndereco !== "ERRO") return { coordenadas: peloEndereco, situacao: "CALCULADA" };
    errou = peloEndereco === "ERRO";
  }
  const cep = pedido.cep;
  if (cep) {
    const peloCep = await tentar(() => localizarCep(cep));
    if (peloCep !== null && peloCep !== "ERRO") return { coordenadas: peloCep, situacao: "APROXIMADA" };
    errou ||= peloCep === "ERRO";
  }
  return { coordenadas: null, situacao: errou ? "INDISPONIVEL" : "NAO_ENCONTRADA" };
}

async function jaTemLocalizacao(pessoaId: string): Promise<boolean> {
  const linhas = await (await bancoParaLeitura()).execute<{ tem: boolean }>(
    sql`select lat is not null and lng is not null as tem from eventos.pessoa_evento where pessoa_id = ${pessoaId}`,
  );
  return linhas.rows[0]?.tem ?? false;
}

/** A localização roda antes e fora da transação (chamada externa); o resto grava junto. */
export async function salvarMeuCadastro(dados: MeuCadastro, staff: StaffDaSessao, ator: AtorDaEscrita, agora: Date): Promise<{ localizacao: SituacaoDaLocalizacao }> {
  const { coordenadas, situacao } = await localizacaoDo(dados, await jaTemLocalizacao(staff.pessoaId));
  try {
    await transacao(ator, (tx) =>
      atualizarMeuCadastro(criarRepositorioMeuCadastro(tx), { ...dados, pessoaId: staff.pessoaId, coordenadas }, { usuarioId: staff.usuarioId, instante: agora }),
    );
  } catch (erro: unknown) {
    if (erro instanceof PoloInvalidoError) throw new RegraDeNegocioError("Esse polo não existe mais. Recarregue a página.");
    if (erro instanceof FuncaoInvalidaError) throw new RegraDeNegocioError("Alguma função escolhida não existe mais. Recarregue a página.");
    if (erro instanceof PessoaNaoEncontradaError) throw new RegraDeNegocioError("Seu cadastro de staff não foi encontrado.");
    throw erro;
  }
  return { localizacao: situacao };
}
