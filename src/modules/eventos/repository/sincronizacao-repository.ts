import { and, eq, inArray, isNull, ne, or, sql } from "drizzle-orm";

import type { Db } from "@/core/db/database";
import { registrarAcao } from "@/core/db/registro-acao";
import { polo } from "@/core/db/schema/core";
import { evento, local, tipoEvento } from "@/core/db/schema/eventos";

import {
  CAMPOS_DO_IAM_CONTROL,
  correspondentesDoIamControl,
  mudancasVindasDoIamControl,
  type OrigemDoLocal,
  type TipoDeLocal,
  TIPOS_DE_LOCAL_DO_IAM_CONTROL,
} from "../domain/local";
import type { EventoDaTurma, LocalDaTurma } from "../domain/turma";

/** SEM_MUDANCA: a turma chegou igual ao que o evento já tinha; só a hora da sincronização foi anotada. */
export type AcaoSincronizacao = "CRIADO" | "ATUALIZADO" | "SEM_MUDANCA" | "IGNORADO_EXCLUIDO";

export type EventoSalvo = {
  acao: AcaoSincronizacao;
  eventoId: string;
  /** Código que outro evento ativo já usa; este ficou sem código até o time resolver. */
  codigoEmConflito: string | null;
  poloNaoEncontrado: boolean;
};

/** O que a sincronização fez com um local do IAM Control nos cadastros do Eventos. */
export type LocalSalvo = {
  /** O cadastro que os eventos deste local usam. */
  localId: string;
  criado: boolean;
  /** Cadastros feitos à mão (pelo time ou pela SDC) que passaram a vir do IAM Control. */
  vinculados: number;
  /** Cadastros que já vinham do IAM Control e tiveram nome, endereço ou capacidade atualizados. */
  atualizados: number;
};

export type RepositorioSincronizacao = {
  tiposAtivos(): Promise<Map<string, { id: string; nome: string }>>;
  /**
   * Põe o local do IAM Control nos cadastros do Eventos: liga o cadastro que já existe (mesmo id ou mesmo nome +
   * cidade + UF) ou cria um. Nunca apaga nem arquiva local, e não mexe em tipo, complemento nem localização no mapa.
   */
  salvarLocalDoIamControl(dados: LocalDaTurma, agora: Date): Promise<LocalSalvo>;
  /** `localId`: o cadastro do local da turma (de `salvarLocalDoIamControl`), ou nulo quando a turma não tem cidade. */
  salvarEventoDaTurma(dados: EventoDaTurma, tipoEventoId: string, agora: Date, localId: string | null): Promise<EventoSalvo>;
};

export function criarRepositorioSincronizacao(db: Db): RepositorioSincronizacao {
  return {
    async tiposAtivos() {
      const tipos = await db
        .select({ id: tipoEvento.id, sigla: tipoEvento.sigla, nome: tipoEvento.nome })
        .from(tipoEvento)
        .where(eq(tipoEvento.ativo, true));
      return new Map(tipos.map((tipo) => [tipo.sigla, { id: tipo.id, nome: tipo.nome }]));
    },

    salvarLocalDoIamControl(dados, agora) {
      return db.transaction(async (tx) => {
        const candidatos = await tx
          .select({
            id: local.id,
            tipo: local.tipo,
            origem: local.origem,
            iamControlEnderecoId: local.iamControlEnderecoId,
            nome: local.nome,
            cidade: local.cidade,
            uf: local.uf,
            cep: local.cep,
            logradouro: local.logradouro,
            numero: local.numero,
            bairro: local.bairro,
            capacidade: local.capacidade,
            criadoEm: local.criadoEm,
          })
          .from(local)
          .where(
            and(
              isNull(local.deletedAt),
              inArray(local.tipo, [...TIPOS_DE_LOCAL_DO_IAM_CONTROL]),
              // A comparação de nome e cidade é feita no código (chaveDoLocal); aqui só se reduz a lista.
              dados.iamControlEnderecoId === null
                ? eq(local.uf, dados.uf)
                : or(eq(local.uf, dados.uf), eq(local.iamControlEnderecoId, dados.iamControlEnderecoId)),
            ),
          )
          .for("update");
        // tipo e origem têm CHECK no banco com estes valores.
        const correspondentes = correspondentesDoIamControl(
          dados,
          candidatos.map((candidato) => ({ ...candidato, tipo: candidato.tipo as TipoDeLocal, origem: candidato.origem as OrigemDoLocal })),
        );
        const doIamControl = Object.fromEntries(CAMPOS_DO_IAM_CONTROL.map((campo) => [campo, dados[campo]])) as Pick<LocalDaTurma, (typeof CAMPOS_DO_IAM_CONTROL)[number]>;

        const principal = correspondentes[0];
        if (!principal) {
          const [criado] = await tx
            .insert(local)
            .values({
              ...doIamControl,
              complemento: dados.complemento,
              capacidade: dados.capacidade,
              tipo: "EVENTO",
              origem: "IAM_CONTROL",
              iamControlEnderecoId: dados.iamControlEnderecoId,
              criadoEm: agora,
              atualizadoEm: agora,
            })
            .returning({ id: local.id });
          return { localId: criado!.id, criado: true, vinculados: 0, atualizados: 0 };
        }

        let vinculados = 0;
        let atualizados = 0;
        for (const cadastro of correspondentes) {
          // Endereço digitado na turma (sem cadastro no IAM Control) não atualiza nada: turmas diferentes trazem
          // números e bairros diferentes para o mesmo nome, e cada rodada regravaria o cadastro.
          const mudancas = dados.cadastrado ? mudancasVindasDoIamControl(cadastro, doIamControl) : {};
          // Lugares só no cadastro que o evento usa, só se for local de evento (no hotel, capacidade são leitos) e só
          // enquanto estiver vazio: depois disso o número é do time.
          const capacidade = cadastro.id === principal.id && cadastro.tipo === "EVENTO" && cadastro.capacidade === null ? dados.capacidade : null;
          const enderecoId = dados.iamControlEnderecoId !== null && cadastro.iamControlEnderecoId !== dados.iamControlEnderecoId ? dados.iamControlEnderecoId : null;
          const vinculando = cadastro.origem !== "IAM_CONTROL";
          if (!vinculando && Object.keys(mudancas).length === 0 && capacidade === null && enderecoId === null) continue;

          await tx
            .update(local)
            .set({
              ...(dados.cadastrado ? doIamControl : {}),
              ...(capacidade === null ? {} : { capacidade }),
              ...(enderecoId === null ? {} : { iamControlEnderecoId: enderecoId }),
              origem: "IAM_CONTROL",
              atualizadoEm: agora,
            })
            .where(eq(local.id, cadastro.id));
          if (vinculando) {
            vinculados += 1;
            // O cadastro era do time (ou da SDC): fica no histórico que passou a vir do IAM Control e o que mudou.
            await registrarAcao(tx, { origem: "SISTEMA", entidade: "LOCAL", entidadeId: cadastro.id, acao: "LOCAL_VINCULADO", dados: { mudancas, origem: "sincronização com o IAM Control" } });
          } else {
            atualizados += 1;
          }
        }
        return { localId: principal.id, criado: false, vinculados, atualizados };
      });
    },

    salvarEventoDaTurma(dados, tipoEventoId, agora, localId) {
      return db.transaction(async (tx) => {
        const [existente] = await tx
          .select({
            id: evento.id,
            deletedAt: evento.deletedAt,
            nome: evento.nome,
            inicio: evento.inicio,
            fim: evento.fim,
            status: evento.status,
            tipoEventoId: evento.tipoEventoId,
            codigo: evento.codigo,
            edicao: evento.edicao,
            poloId: evento.poloId,
            localId: evento.localId,
            expectativaPublico: evento.expectativaPublico,
            alunosConfirmados: evento.alunosConfirmados,
          })
          .from(evento)
          .where(eq(evento.iamControlTurmaId, dados.iamControlTurmaId))
          .for("update");

        // Evento apagado pelo time no Eventos não volta pela sincronização.
        if (existente?.deletedAt) {
          return { acao: "IGNORADO_EXCLUIDO", eventoId: existente.id, codigoEmConflito: null, poloNaoEncontrado: false };
        }

        let poloId: string | null = null;
        if (dados.poloSigla) {
          const [encontrado] = await tx
            .select({ id: polo.id })
            .from(polo)
            .where(and(sql`upper(${polo.codigo}) = ${dados.poloSigla}`, isNull(polo.deletedAt)))
            .limit(1);
          poloId = encontrado?.id ?? null;
        }

        // Turma remarcada: a cancelada e a nova têm a mesma edição. O código fica com o evento ativo;
        // só dois eventos ativos com o mesmo código viram conflito para o time resolver.
        let codigo = dados.codigo;
        let codigoEmConflito: string | null = null;
        if (codigo) {
          const [outro] = await tx
            .select({ id: evento.id, status: evento.status, deletedAt: evento.deletedAt })
            .from(evento)
            .where(
              and(
                eq(evento.codigo, codigo),
                existente ? ne(evento.id, existente.id) : sql`true`,
              ),
            )
            .limit(1)
            .for("update");
          if (outro) {
            const esteAtivo = dados.status !== "CANCELADO";
            const outroAtivo = outro.status !== "CANCELADO" && !outro.deletedAt;
            if (esteAtivo && !outroAtivo) {
              await tx.update(evento).set({ codigo: null, atualizadoEm: agora }).where(eq(evento.id, outro.id));
            } else {
              if (esteAtivo) codigoEmConflito = codigo;
              codigo = null;
            }
          }
        }

        // Campos que vêm do IAM Control. Expectativa de público e pessoas na fila são do time:
        // a sincronização só preenche a expectativa quando ainda está vazia.
        const campos = {
          nome: dados.nome,
          inicio: dados.inicio,
          fim: dados.fim,
          status: dados.status,
          tipoEventoId,
          codigo,
          edicao: dados.edicao,
          poloId,
          localId,
        };

        if (existente) {
          // atualizado_em é a versão que a tela usa para detectar edição simultânea (Público e fila). A sincronização
          // roda a cada 30 minutos: se renovasse a versão sempre, quem estivesse com a tela aberta perderia o que
          // digitou sem ninguém ter mexido. Só renova quando um dado do evento mudou de verdade.
          const mudou =
            existente.nome !== campos.nome ||
            existente.inicio.getTime() !== campos.inicio.getTime() ||
            existente.fim.getTime() !== campos.fim.getTime() ||
            existente.status !== campos.status ||
            existente.tipoEventoId !== campos.tipoEventoId ||
            existente.codigo !== campos.codigo ||
            existente.edicao !== campos.edicao ||
            existente.poloId !== campos.poloId ||
            existente.localId !== campos.localId ||
            (existente.expectativaPublico === null && dados.expectativaPublico !== null);
          // Os confirmados mudam a toda hora na semana do evento e são só informativos: gravam sem renovar a versão.
          const confirmadosMudaram = existente.alunosConfirmados !== dados.alunosConfirmados;

          await tx
            .update(evento)
            .set(
              mudou
                ? {
                    ...campos,
                    alunosConfirmados: dados.alunosConfirmados,
                    expectativaPublico: sql`coalesce(${evento.expectativaPublico}, ${dados.expectativaPublico})`,
                    sincronizadoEm: agora,
                    atualizadoEm: agora,
                  }
                : { alunosConfirmados: dados.alunosConfirmados, sincronizadoEm: agora },
            )
            .where(eq(evento.id, existente.id));
          return {
            acao: mudou || confirmadosMudaram ? "ATUALIZADO" : "SEM_MUDANCA",
            eventoId: existente.id,
            codigoEmConflito,
            poloNaoEncontrado: !!dados.poloSigla && !poloId,
          };
        }

        const [criado] = await tx
          .insert(evento)
          .values({
            ...campos,
            alunosConfirmados: dados.alunosConfirmados,
            sincronizadoEm: agora,
            atualizadoEm: agora,
            iamControlTurmaId: dados.iamControlTurmaId,
            expectativaPublico: dados.expectativaPublico,
          })
          .returning({ id: evento.id });
        return { acao: "CRIADO", eventoId: criado!.id, codigoEmConflito, poloNaoEncontrado: !!dados.poloSigla && !poloId };
      });
    },
  };
}
