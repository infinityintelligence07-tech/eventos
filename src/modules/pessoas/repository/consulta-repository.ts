import { and, asc, desc, eq, inArray, isNull, lte } from "drizzle-orm";

import type { Executor } from "@/core/db/database";
import { pessoa, polo } from "@/core/db/schema/core";
import { convocacao, escala, evento, funcao, pessoaEvento, pessoaFuncao, pessoaVeiculo, presenca } from "@/core/db/schema/eventos";

import type { FuncaoDaPessoa, ModeloDeCamiseta, NivelNaFuncao, PerfilDoStaff, Sexo, TamanhoDeCamiseta, VeiculoDaPessoa } from "../domain/cadastro";
import { contaComoTrabalho, type ItemDoHistorico, type SituacaoNaEscala } from "../domain/historico";
import type { StaffNaLista, UltimoEvento } from "../domain/lista";
import { diaEmSaoPaulo, nomeDaPessoa, poloCodigoDaPessoa, poloNomeDaPessoa } from "./sql";

export type FichaDaPessoa = StaffNaLista & {
  nomeCompleto: string;
  nomeSocial: string | null;
  email: string | null;
  telefone: string | null;
  atualizadoEm: Date;
};

export type OpcoesDePessoas = { polos: { codigo: string; nome: string }[]; funcoes: { id: string; codigo: string; nome: string }[] };

export type ConsultaPessoas = {
  /** Todo o staff (com pessoa_evento), ativo e inativo. */
  listarStaff(agora: Date): Promise<StaffNaLista[]>;
  /** Nulo se não existe ou não é staff. */
  ficha(pessoaId: string, agora: Date): Promise<FichaDaPessoa | null>;
  /** Mais recente primeiro. */
  historico(pessoaId: string): Promise<ItemDoHistorico[]>;
  opcoes(): Promise<OpcoesDePessoas>;
};

const SITUACOES: SituacaoNaEscala[] = ["SUGERIDA", "CONVIDADA", "ACEITA", "RECUSADA", "CANCELADA"];
const QUE_CONTAM = SITUACOES.filter(contaComoTrabalho);

const COLUNAS_DO_STAFF = {
  pessoaId: pessoa.id,
  nome: nomeDaPessoa,
  ativo: pessoa.ativo,
  poloCodigo: poloCodigoDaPessoa,
  poloNome: poloNomeDaPessoa,
  sexo: pessoaEvento.sexo,
  camisetaModelo: pessoaEvento.camisetaModelo,
  camisetaTamanho: pessoaEvento.camisetaTamanho,
  possuiCamiseta: pessoaEvento.possuiCamiseta,
  fezConfronto: pessoaEvento.fezConfronto,
  temCnpj: pessoaEvento.temCnpj,
  lat: pessoaEvento.lat,
  lng: pessoaEvento.lng,
  lugares: pessoaVeiculo.lugares,
  consumoKmL: pessoaVeiculo.consumoKmL,
};

type LinhaDoStaff = {
  pessoaId: string;
  nome: string;
  ativo: boolean;
  poloCodigo: string | null;
  poloNome: string | null;
  sexo: string | null;
  camisetaModelo: string | null;
  camisetaTamanho: string | null;
  possuiCamiseta: boolean | null;
  fezConfronto: boolean | null;
  temCnpj: boolean | null;
  lat: number | null;
  lng: number | null;
  lugares: number | null;
  consumoKmL: string | null;
};

// Colunas com CHECK no banco: os valores já são os do tipo.
function perfilDaLinha(linha: LinhaDoStaff): PerfilDoStaff {
  return {
    sexo: linha.sexo as Sexo | null,
    camisetaModelo: linha.camisetaModelo as ModeloDeCamiseta | null,
    camisetaTamanho: linha.camisetaTamanho as TamanhoDeCamiseta | null,
    possuiCamiseta: linha.possuiCamiseta,
    fezConfronto: linha.fezConfronto,
    temCnpj: linha.temCnpj,
    lat: linha.lat,
    lng: linha.lng,
  };
}

function veiculoDaLinha(linha: { lugares: number | null; consumoKmL: string | null }): VeiculoDaPessoa | null {
  return linha.lugares === null ? null : { lugares: linha.lugares, consumoKmL: linha.consumoKmL === null ? null : Number(linha.consumoKmL) };
}

export function criarConsultaPessoas(executor: Executor): ConsultaPessoas {
  async function funcoesDe(pessoaIds: string[] | null): Promise<Map<string, FuncaoDaPessoa[]>> {
    const linhas = await executor
      .select({ pessoaId: pessoaFuncao.pessoaId, funcaoId: funcao.id, codigo: funcao.codigo, nome: funcao.nome, nivel: pessoaFuncao.nivel })
      .from(pessoaFuncao)
      .innerJoin(funcao, eq(funcao.id, pessoaFuncao.funcaoId))
      .where(pessoaIds ? inArray(pessoaFuncao.pessoaId, pessoaIds) : undefined)
      .orderBy(asc(funcao.nome));
    const porPessoa = new Map<string, FuncaoDaPessoa[]>();
    for (const { pessoaId, nivel, ...resto } of linhas) {
      const lista = porPessoa.get(pessoaId) ?? [];
      lista.push({ ...resto, nivel: nivel as NivelNaFuncao });
      porPessoa.set(pessoaId, lista);
    }
    return porPessoa;
  }

  async function ultimosEventos(agora: Date, pessoaId?: string): Promise<Map<string, UltimoEvento>> {
    const linhas = await executor
      .selectDistinctOn([convocacao.pessoaId], {
        pessoaId: convocacao.pessoaId,
        eventoId: evento.id,
        codigo: evento.codigo,
        nome: evento.nome,
        dataInicio: diaEmSaoPaulo(evento.inicio),
      })
      .from(convocacao)
      .innerJoin(escala, eq(escala.id, convocacao.escalaId))
      .innerJoin(evento, eq(evento.id, escala.eventoId))
      .where(
        and(
          inArray(convocacao.status, QUE_CONTAM),
          isNull(escala.deletedAt),
          isNull(evento.deletedAt),
          lte(evento.inicio, agora),
          pessoaId ? eq(convocacao.pessoaId, pessoaId) : undefined,
        ),
      )
      .orderBy(convocacao.pessoaId, desc(evento.inicio));
    return new Map(linhas.map(({ pessoaId: id, ...ultimo }) => [id, ultimo]));
  }

  function staffDaLinha(linha: LinhaDoStaff, funcoes: Map<string, FuncaoDaPessoa[]>, ultimos: Map<string, UltimoEvento>): StaffNaLista {
    return {
      pessoaId: linha.pessoaId,
      nome: linha.nome,
      ativo: linha.ativo,
      poloCodigo: linha.poloCodigo,
      poloNome: linha.poloNome,
      perfil: perfilDaLinha(linha),
      funcoes: funcoes.get(linha.pessoaId) ?? [],
      veiculo: veiculoDaLinha(linha),
      ultimoEvento: ultimos.get(linha.pessoaId) ?? null,
    };
  }

  return {
    async listarStaff(agora) {
      const [linhas, funcoes, ultimos] = await Promise.all([
        executor
          .select(COLUNAS_DO_STAFF)
          .from(pessoaEvento)
          .innerJoin(pessoa, eq(pessoa.id, pessoaEvento.pessoaId))
          .leftJoin(pessoaVeiculo, eq(pessoaVeiculo.pessoaId, pessoaEvento.pessoaId))
          .where(isNull(pessoa.deletedAt))
          .orderBy(asc(nomeDaPessoa)),
        funcoesDe(null),
        ultimosEventos(agora),
      ]);
      return linhas.map((linha) => staffDaLinha(linha, funcoes, ultimos));
    },

    async ficha(pessoaId, agora) {
      const [linha] = await executor
        .select({
          ...COLUNAS_DO_STAFF,
          nomeCompleto: pessoa.nomeCompleto,
          nomeSocial: pessoa.nomeSocial,
          email: pessoa.email,
          telefone: pessoa.telefone,
          atualizadoEm: pessoaEvento.atualizadoEm,
        })
        .from(pessoaEvento)
        .innerJoin(pessoa, eq(pessoa.id, pessoaEvento.pessoaId))
        .leftJoin(pessoaVeiculo, eq(pessoaVeiculo.pessoaId, pessoaEvento.pessoaId))
        .where(and(eq(pessoaEvento.pessoaId, pessoaId), isNull(pessoa.deletedAt)));
      if (!linha) return null;
      const [funcoes, ultimos] = await Promise.all([funcoesDe([pessoaId]), ultimosEventos(agora, pessoaId)]);
      return {
        ...staffDaLinha(linha, funcoes, ultimos),
        nomeCompleto: linha.nomeCompleto,
        nomeSocial: linha.nomeSocial,
        email: linha.email,
        telefone: linha.telefone,
        atualizadoEm: linha.atualizadoEm,
      };
    },

    async historico(pessoaId) {
      const linhas = await executor
        .select({
          convocacaoId: convocacao.id,
          eventoId: evento.id,
          eventoCodigo: evento.codigo,
          eventoNome: evento.nome,
          dataInicio: diaEmSaoPaulo(evento.inicio),
          dataFim: diaEmSaoPaulo(evento.fim),
          funcao: funcao.nome,
          situacao: convocacao.status,
          respondidaEm: convocacao.respondidaEm,
          registradoPor: convocacao.registradoPor,
          presenca: presenca.status,
        })
        .from(convocacao)
        .innerJoin(escala, eq(escala.id, convocacao.escalaId))
        .innerJoin(evento, eq(evento.id, escala.eventoId))
        .leftJoin(funcao, eq(funcao.id, escala.funcaoId))
        .leftJoin(presenca, eq(presenca.convocacaoId, convocacao.id))
        .where(and(eq(convocacao.pessoaId, pessoaId), isNull(escala.deletedAt), isNull(evento.deletedAt)))
        .orderBy(desc(evento.inicio), asc(funcao.nome));
      // status tem CHECK no banco com esses valores.
      return linhas.map((linha) => ({ ...linha, situacao: linha.situacao as SituacaoNaEscala }));
    },

    async opcoes() {
      const [polos, funcoes] = await Promise.all([
        executor.select({ codigo: polo.codigo, nome: polo.nome }).from(polo).where(and(eq(polo.ativo, true), isNull(polo.deletedAt))).orderBy(asc(polo.nome)),
        executor.select({ id: funcao.id, codigo: funcao.codigo, nome: funcao.nome }).from(funcao).where(eq(funcao.ativo, true)).orderBy(asc(funcao.nome)),
      ]);
      return { polos, funcoes };
    },
  };
}
