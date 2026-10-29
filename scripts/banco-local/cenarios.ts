import { createHash } from "node:crypto";

import { criarRepositorioComunicacao, gerarCopysDaEquipe, modeloEmUso } from "@/modules/comunicacao";

import { type Banco, CIDADES, type Coordenada, distanciaKm, type Executor, type Pessoa, USUARIO_TESTE_ID } from "./comum";

// Um cenário pronto por frente (doc 07 §5.4), para as frentes não dependerem umas das outras.
// Tudo nos eventos futuros copiados da produção; pessoas, copys, voos, hotéis e custos são fictícios.
//   ASM 1  APROVADA              convocações em todos os status, caronas, voos (SDC), hospedagem com quartos
//                                e ocupantes, solicitações de custo e copys enviadas (uma desatualizada)
//   ASM 2  AGUARDANDO_APROVACAO  vagas confirmadas, parte sem pessoa
//   CONF 1 DEVOLVIDA             comentário da devolução no registro_acao
//   CONF 2 RASCUNHO              com pessoas na fila

type Status = "SUGERIDA" | "CONVIDADA" | "ACEITA" | "RECUSADA" | "CANCELADA";

type EventoCenario = {
  id: string;
  codigo: string;
  polo: string;
  localNome: string;
  cidade: string;
  uf: string;
  coordenada: Coordenada | null;
  inicio: string;
  fim: string;
};

type Convocada = { id: string; pessoa: Pessoa; status: Status; voo: boolean; km: number | null; deslocamento: string | null };

type Registrar = (entrada: {
  entidade: string;
  entidadeId: string;
  eventoId: string;
  acao: string;
  de?: string | null;
  para?: string | null;
  comentario?: string | null;
  emNomeDe?: string | null;
  dados?: Record<string, unknown>;
  horasAtras: number;
}) => Promise<void>;

type OpcoesConvocar = {
  /** Fração das vagas preenchida. */
  preencher: number;
  statusDe: (indice: number, voo: boolean) => Status;
  /** Quantas vagas de STAFF vão para gente de longe, que viaja de avião. */
  voo?: number;
};

const CICLO_APROVADA: Status[] = ["ACEITA", "CONVIDADA", "ACEITA", "RECUSADA", "SUGERIDA", "ACEITA", "CANCELADA", "CONVIDADA", "ACEITA"];
const STATUS_VOO: Status[] = ["ACEITA", "ACEITA", "CONVIDADA", "ACEITA"];
const AVISADA = new Set<Status>(["CONVIDADA", "ACEITA", "RECUSADA", "CANCELADA"]);
const RESPONDIDA = new Set<Status>(["ACEITA", "RECUSADA"]);
const PRECO_LITRO_CENTAVOS = 619;

function somarDias(data: string, dias: number): string {
  const d = new Date(`${data}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + dias);
  return d.toISOString().slice(0, 10);
}

function hash(valor: unknown): string {
  return createHash("sha256").update(JSON.stringify(valor)).digest("hex");
}

export async function semearCenarios(banco: Banco, pessoas: Pessoa[], aleatorio: () => number): Promise<void> {
  const db = banco.sql;
  const registrar: Registrar = async (entrada) => {
    await db.query(
      `INSERT INTO eventos.registro_acao
         (entidade, entidade_id, evento_id, acao, status_de, status_para, comentario, em_nome_de_pessoa_id, usuario_id, dados, criado_em)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, now() - make_interval(hours => $11))`,
      [
        entrada.entidade,
        entrada.entidadeId,
        entrada.eventoId,
        entrada.acao,
        entrada.de ?? null,
        entrada.para ?? null,
        entrada.comentario ?? null,
        entrada.emNomeDe ?? null,
        USUARIO_TESTE_ID,
        JSON.stringify(entrada.dados ?? {}),
        entrada.horasAtras,
      ],
    );
  };

  // Locais copiados ainda sem geocodificação: centro da cidade do polo dos eventos, com um desvio pequeno e estável.
  for (const [codigo, cidade] of Object.entries(CIDADES)) {
    await db.query(
      `UPDATE eventos.local l
          SET lat = $1 + ((('x' || substr(md5(l.id::text), 1, 4))::bit(16)::int) / 65535.0 - 0.5) * 0.04,
              lng = $2 + ((('x' || substr(md5(l.id::text), 5, 4))::bit(16)::int) / 65535.0 - 0.5) * 0.04
        WHERE l.lat IS NULL
          AND EXISTS (SELECT 1 FROM eventos.evento e JOIN core.polo p ON p.id = e.polo_id WHERE e.local_id = l.id AND p.codigo = $3)`,
      [cidade.lat, cidade.lng, codigo],
    );
  }

  const futuros = (
    await db.query<{
      id: string; codigo: string; sigla: string; polo: string; local_nome: string; cidade: string; uf: string;
      lat: number | null; lng: number | null; inicio: string; fim: string;
    }>(
      `SELECT e.id, e.codigo, t.sigla, p.codigo AS polo, l.nome AS local_nome, l.cidade, l.uf, l.lat, l.lng,
              to_char(e.inicio AT TIME ZONE 'America/Sao_Paulo', 'YYYY-MM-DD') AS inicio,
              to_char(e.fim AT TIME ZONE 'America/Sao_Paulo', 'YYYY-MM-DD') AS fim
         FROM eventos.evento e
         JOIN eventos.tipo_evento t ON t.id = e.tipo_evento_id
         JOIN core.polo p ON p.id = e.polo_id
         JOIN eventos.local l ON l.id = e.local_id
        WHERE t.sigla IN ('ASM', 'CONF') AND e.inicio > now() AND e.status = 'PLANEJADO' AND e.deleted_at IS NULL
          AND EXISTS (SELECT 1 FROM eventos.escala s WHERE s.evento_id = e.id AND s.deleted_at IS NULL)
        ORDER BY e.inicio, e.codigo`,
    )
  ).rows.map((r) => ({
    sigla: r.sigla,
    evento: {
      id: r.id, codigo: r.codigo, polo: r.polo, localNome: r.local_nome, cidade: r.cidade, uf: r.uf,
      coordenada: r.lat !== null && r.lng !== null ? { lat: r.lat, lng: r.lng } : null, inicio: r.inicio, fim: r.fim,
    } satisfies EventoCenario,
  }));
  const asm = futuros.filter((f) => f.sigla === "ASM").map((f) => f.evento);
  const conf = futuros.filter((f) => f.sigla === "CONF").map((f) => f.evento);

  const confirmarVagas = (evento: EventoCenario, horasAtras: number) =>
    db.query(
      `UPDATE eventos.escala SET confirmada_em = now() - make_interval(hours => $2), confirmada_por = $3
        WHERE evento_id = $1 AND deleted_at IS NULL`,
      [evento.id, horasAtras, USUARIO_TESTE_ID],
    );

  const convocar = async (evento: EventoCenario, opcoes: OpcoesConvocar): Promise<{ convocadas: Convocada[]; semPessoa: number }> => {
    const vagas = (
      await db.query<{ id: string; codigo: string; quantidade_vagas: number }>(
        `SELECT s.id, f.codigo, s.quantidade_vagas FROM eventos.escala s JOIN eventos.funcao f ON f.id = s.funcao_id
          WHERE s.evento_id = $1 AND s.deleted_at IS NULL ORDER BY f.codigo`,
        [evento.id],
      )
    ).rows;
    const distancia = (p: Pessoa) => (evento.coordenada && p.coordenada ? distanciaKm(p.coordenada, evento.coordenada) : null);
    const ja = new Set<string>();
    const convocadas: Convocada[] = [];
    let semPessoa = 0;

    for (const vaga of vagas) {
      const candidatos = pessoas
        .filter((p) => p.funcoes.includes(vaga.codigo) && !ja.has(p.id))
        .sort((a, b) => (distancia(a) ?? Infinity) - (distancia(b) ?? Infinity));
      const deLonge: Pessoa[] = [];
      if (vaga.codigo === "STAFF" && opcoes.voo) {
        const polos = new Set<string>();
        for (const p of [...candidatos].reverse()) {
          if (deLonge.length >= opcoes.voo) break;
          if (p.sexo && (distancia(p) ?? 0) > 300 && !polos.has(p.poloCodigo)) {
            deLonge.push(p);
            polos.add(p.poloCodigo);
          }
        }
      }
      const total = Math.ceil(vaga.quantidade_vagas * opcoes.preencher);
      const escolhidos = [...deLonge, ...candidatos.filter((p) => !deLonge.includes(p))].slice(0, total);
      semPessoa += vaga.quantidade_vagas - escolhidos.length;

      for (const pessoa of escolhidos) {
        ja.add(pessoa.id);
        const voo = deLonge.includes(pessoa);
        const sugerido = voo ? (STATUS_VOO[deLonge.indexOf(pessoa)] ?? "ACEITA") : opcoes.statusDe(convocadas.length, false);
        // Sem sexo no cadastro a copy de escalação fica bloqueada: a pessoa não pode ter sido avisada.
        const status: Status = !pessoa.sexo && AVISADA.has(sugerido) ? "SUGERIDA" : sugerido;
        const km = distancia(pessoa);
        const deslocamento = voo ? "VOO" : status === "ACEITA" ? (pessoa.temVeiculo ? "CARRO_PROPRIO" : "UBER") : null;
        // Cancelada: avisada na primeira aprovação e tirada quando a escala foi reaberta.
        const horasAvisada = status === "CANCELADA" ? 120 : 48;
        const r = await db.query<{ id: string }>(
          `INSERT INTO eventos.convocacao
             (escala_id, pessoa_id, status, convidada_em, respondida_em, motivo_recusa, deslocamento, distancia_km,
              tempo_trajeto_min, sugestao_score, criado_por, registrado_por)
           VALUES ($1, $2, $3,
             CASE WHEN $4::boolean THEN now() - make_interval(hours => $5) END,
             CASE WHEN $6::boolean THEN now() - interval '1 day' END,
             $7, $8, $9, $10, $11, $12, CASE WHEN $6::boolean THEN $12::uuid END)
           RETURNING id`,
          [
            vaga.id,
            pessoa.id,
            status,
            AVISADA.has(status),
            horasAvisada,
            RESPONDIDA.has(status),
            status === "RECUSADA" ? "Compromisso pessoal na data (dado fictício)" : null,
            deslocamento,
            km === null ? null : km.toFixed(1),
            km === null || voo ? null : Math.round(km * 1.3 + 10),
            (50 + aleatorio() * 49).toFixed(2),
            USUARIO_TESTE_ID,
          ],
        );
        convocadas.push({ id: r.rows[0]?.id as string, pessoa, status, voo, km, deslocamento });
      }
    }
    return { convocadas, semPessoa };
  };

  // ASM 1 — APROVADA (Escala, Comunicação, Logística e Custos).
  const aprovada = asm[0];
  if (aprovada) {
    await confirmarVagas(aprovada, 150);
    const { convocadas } = await convocar(aprovada, {
      preencher: 1,
      voo: 4,
      statusDe: (i) => CICLO_APROVADA[i % CICLO_APROVADA.length] as Status,
    });
    await db.query(
      `UPDATE eventos.evento SET status_escala = 'APROVADA', aprovado_por = $2, aprovado_em = now() - interval '72 hours' WHERE id = $1`,
      [aprovada.id, USUARIO_TESTE_ID],
    );
    const escalaDoEvento = { entidade: "ESCALA_DO_EVENTO", entidadeId: aprovada.id, eventoId: aprovada.id };
    await registrar({ ...escalaDoEvento, acao: "ENVIADA_APROVACAO", de: "RASCUNHO", para: "AGUARDANDO_APROVACAO", horasAtras: 144 });
    await registrar({ ...escalaDoEvento, acao: "APROVADA", de: "AGUARDANDO_APROVACAO", para: "APROVADA", horasAtras: 130 });
    await registrar({ ...escalaDoEvento, acao: "REABERTA", de: "APROVADA", para: "RASCUNHO", comentario: "Troca de staff (comentário fictício)", horasAtras: 100 });
    await registrar({ ...escalaDoEvento, acao: "ENVIADA_APROVACAO", de: "RASCUNHO", para: "AGUARDANDO_APROVACAO", horasAtras: 80 });
    await registrar({ ...escalaDoEvento, acao: "APROVADA", de: "AGUARDANDO_APROVACAO", para: "APROVADA", dados: { vagas: convocadas.length }, horasAtras: 72 });

    for (const c of convocadas) {
      if (c.status === "CANCELADA") {
        await registrar({ entidade: "CONVOCACAO", entidadeId: c.id, eventoId: aprovada.id, acao: "CANCELADA", de: "CONVIDADA", para: "CANCELADA", horasAtras: 100 });
      }
      if (RESPONDIDA.has(c.status)) {
        await registrar({ entidade: "CONVOCACAO", entidadeId: c.id, eventoId: aprovada.id, acao: "RESPOSTA_REGISTRADA", de: "CONVIDADA", para: c.status, emNomeDe: c.pessoa.id, horasAtras: 24 });
      }
    }

    await semearCaronas(db, aprovada, convocadas, registrar);
    await semearLogistica(db, aprovada, convocadas.filter((c) => c.voo), registrar);
    await semearCustos(db, aprovada, convocadas.filter((c) => c.status === "ACEITA" && !c.voo && c.km !== null && c.deslocamento !== "CARONA"), registrar);
    // Por último: a copy depende de convocação, escala, local, voos, hotel e link de custos.
    await semearMensagens(banco, aprovada, convocadas);
  }

  // ASM 2 — AGUARDANDO_APROVACAO, com vagas sem pessoa.
  const aguardando = asm[1];
  if (aguardando) {
    await confirmarVagas(aguardando, 30);
    const { semPessoa } = await convocar(aguardando, { preencher: 0.7, statusDe: () => "SUGERIDA" });
    await db.query(`UPDATE eventos.evento SET status_escala = 'AGUARDANDO_APROVACAO' WHERE id = $1`, [aguardando.id]);
    await registrar({
      entidade: "ESCALA_DO_EVENTO", entidadeId: aguardando.id, eventoId: aguardando.id, acao: "ENVIADA_APROVACAO",
      de: "RASCUNHO", para: "AGUARDANDO_APROVACAO", dados: { vagas_sem_pessoa: semPessoa }, horasAtras: 20,
    });
  }

  // CONF 1 — DEVOLVIDA, com o comentário de quem devolveu.
  const devolvida = conf[0];
  if (devolvida) {
    await confirmarVagas(devolvida, 50);
    await convocar(devolvida, { preencher: 0.8, statusDe: () => "SUGERIDA" });
    await db.query(`UPDATE eventos.evento SET status_escala = 'DEVOLVIDA' WHERE id = $1`, [devolvida.id]);
    const escalaDoEvento = { entidade: "ESCALA_DO_EVENTO", entidadeId: devolvida.id, eventoId: devolvida.id };
    await registrar({ ...escalaDoEvento, acao: "ENVIADA_APROVACAO", de: "RASCUNHO", para: "AGUARDANDO_APROVACAO", horasAtras: 48 });
    await registrar({
      ...escalaDoEvento, acao: "DEVOLVIDA", de: "AGUARDANDO_APROVACAO", para: "DEVOLVIDA", horasAtras: 26,
      comentario: "Faltam líderes com experiência em Confronto; revisar antes de reenviar. (comentário fictício)",
    });
  }

  // CONF 2 — RASCUNHO com pessoas na fila (base do cálculo de pai/mãe).
  const rascunho = conf[1];
  if (rascunho) {
    await db.query(`UPDATE eventos.evento SET pessoas_na_fila = 90 WHERE id = $1`, [rascunho.id]);
    await convocar(rascunho, { preencher: 0.4, statusDe: () => "SUGERIDA" });
  }

  for (const [nome, evento] of Object.entries({ aprovada, aguardando, devolvida, rascunho })) {
    if (!evento) console.warn(`  aviso: sem evento futuro com vagas para o cenário "${nome}"`);
  }
}

// Pedidos à SDC: EMITIDO, ALTERADO, CANCELADO + PEDIDO de novo, e uma pessoa "a pedir" (VOO sem pedido).
// Hospedagem no hotel (com pedido EMITIDO) e no apartamento da IAM (sem pedido), com quartos e ocupantes.
async function semearLogistica(db: Executor, evento: EventoCenario, voando: Convocada[], registrar: Registrar): Promise<void> {
  const destino = CIDADES[evento.polo]?.iata ?? "VCP";
  const ida = somarDias(evento.inicio, -1);
  const volta = evento.fim;

  const pedirVoo = async (c: Convocada, situacao: "PEDIDO" | "EMITIDO" | "ALTERADO" | "CANCELADO", emissao?: { companhia: string; voos: [string, string]; localizador: string; valor: number }) => {
    const r = await db.query<{ id: string; referencia: string }>(
      `INSERT INTO eventos.pedido_sdc
         (tipo, evento_id, pessoa_id, convocacao_id, situacao, valor_centavos, observacao_time, observacao_sdc, solicitado_por, solicitado_em,
          emitido_em, retorno_registrado_por, cancelado_em, cancelado_por, motivo_cancelamento)
       VALUES ('VOO', $1, $2, $3, $4, $5, 'Prefere voo pela manhã na ida (dado fictício)', $6, $7, now() - interval '96 hours',
          CASE WHEN $8::boolean THEN now() - interval '60 hours' END,
          CASE WHEN $8::boolean THEN $7::uuid END,
          CASE WHEN $4 = 'CANCELADO' THEN now() - interval '50 hours' END,
          CASE WHEN $4 = 'CANCELADO' THEN $7::uuid END,
          CASE WHEN $4 = 'CANCELADO' THEN 'Pessoa vai de carro com outra equipe (dado fictício)' END)
       RETURNING id, referencia`,
      [
        evento.id, c.pessoa.id, c.id, situacao, emissao?.valor ?? null,
        emissao ? "Emitido conforme pedido (dado fictício)" : null, USUARIO_TESTE_ID, Boolean(emissao),
      ],
    );
    const pedidoId = r.rows[0]?.id as string;
    const origem = CIDADES[c.pessoa.poloCodigo]?.iata ?? "GRU";
    for (const [sentido, de, para, data, saida, chegada, numero] of [
      ["IDA", origem, destino, ida, "08:10", "09:55", emissao?.voos[0]],
      ["VOLTA", destino, origem, volta, "19:20", "21:05", emissao?.voos[1]],
    ] as const) {
      await db.query(
        `INSERT INTO eventos.trecho_voo
           (pedido_id, sentido, origem_iata, destino_iata, data_desejada, preferencia_horario, companhia, numero_voo, localizador, partida_em, chegada_em)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)`,
        [
          pedidoId, sentido, de, para, data, sentido === "IDA" ? "MANHA" : "NOITE",
          emissao?.companhia ?? null, numero ?? null, emissao?.localizador ?? null,
          emissao ? `${data}T${saida}:00-03:00` : null, emissao ? `${data}T${chegada}:00-03:00` : null,
        ],
      );
    }
    const base = { entidade: "PEDIDO_SDC", entidadeId: pedidoId, eventoId: evento.id };
    await registrar({ ...base, acao: "PEDIDO_REGISTRADO", para: "PEDIDO", horasAtras: 96 });
    if (emissao) await registrar({ ...base, acao: "RETORNO_REGISTRADO", de: "PEDIDO", para: "EMITIDO", horasAtras: 60 });
    if (situacao === "ALTERADO") await registrar({ ...base, acao: "ALTERADO", de: "EMITIDO", para: "ALTERADO", comentario: "Trocar a volta para o dia seguinte (fictício)", horasAtras: 30 });
    if (situacao === "CANCELADO") await registrar({ ...base, acao: "CANCELADO", de: "PEDIDO", para: "CANCELADO", horasAtras: 50 });
  };

  const [emitido, alterado, recomprado] = voando;
  if (emitido) await pedirVoo(emitido, "EMITIDO", { companhia: "AZUL", voos: ["AD4120", "AD4121"], localizador: "KXQ7PZ", valor: 98000 });
  if (alterado) await pedirVoo(alterado, "ALTERADO", { companhia: "GOL", voos: ["G31450", "G31451"], localizador: "LMN4RT", valor: 112000 });
  if (recomprado) {
    await pedirVoo(recomprado, "CANCELADO");
    await pedirVoo(recomprado, "PEDIDO");
  }
  // voando[3], se existir, fica "a pedir": deslocamento VOO sem pedido ativo.

  const novoLocal = async (nome: string, tipo: "HOTEL" | "APARTAMENTO", desvio: number) =>
    (
      await db.query<{ id: string }>(
        `INSERT INTO eventos.local (nome, tipo, logradouro, numero, bairro, cidade, uf, cep, lat, lng, capacidade)
         VALUES ($1, $2, 'Rua Exemplo', '100', 'Centro', $3, $4, '00000-000', $5, $6, $7) RETURNING id`,
        [nome, tipo, evento.cidade, evento.uf, (evento.coordenada?.lat ?? 0) + desvio, (evento.coordenada?.lng ?? 0) + desvio, tipo === "HOTEL" ? 120 : 6],
      )
    ).rows[0]?.id as string;
  const hotelId = await novoLocal(`Hotel Exemplo ${evento.cidade} (fictício)`, "HOTEL", 0.01);
  const apartamentoId = await novoLocal(`Apartamento IAM Exemplo ${evento.cidade} (fictício)`, "APARTAMENTO", -0.01);

  const pedidoHotel = (
    await db.query<{ id: string }>(
      `INSERT INTO eventos.pedido_sdc (tipo, evento_id, situacao, valor_centavos, observacao_time, solicitado_por, solicitado_em, emitido_em, retorno_registrado_por)
       VALUES ('HOSPEDAGEM', $1, 'EMITIDO', 240000, 'Quartos duplos por sexo (dado fictício)', $2, now() - interval '96 hours', now() - interval '72 hours', $2)
       RETURNING id`,
      [evento.id, USUARIO_TESTE_ID],
    )
  ).rows[0]?.id as string;
  await registrar({ entidade: "PEDIDO_SDC", entidadeId: pedidoHotel, eventoId: evento.id, acao: "RETORNO_REGISTRADO", de: "PEDIDO", para: "EMITIDO", horasAtras: 72 });

  const hospedar = async (localId: string, pedidoId: string | null, reserva: string | null) =>
    (
      await db.query<{ id: string }>(
        `INSERT INTO eventos.hospedagem (evento_id, local_id, pedido_id, check_in, check_out, numero_reserva, observacao, criado_por)
         VALUES ($1, $2, $3, $4, $5, $6, 'Hospedagem fictícia', $7) RETURNING id`,
        [evento.id, localId, pedidoId, ida, somarDias(evento.fim, 1), reserva, USUARIO_TESTE_ID],
      )
    ).rows[0]?.id as string;
  const hotel = await hospedar(hotelId, pedidoHotel, "RES-48213");
  const apartamento = await hospedar(apartamentoId, null, null);
  await registrar({ entidade: "HOSPEDAGEM", entidadeId: hotel, eventoId: evento.id, acao: "HOSPEDAGEM_CRIADA", horasAtras: 70 });
  await registrar({ entidade: "HOSPEDAGEM", entidadeId: apartamento, eventoId: evento.id, acao: "HOSPEDAGEM_CRIADA", horasAtras: 70 });

  const quartos: { id: string; sexo: "F" | "M" | null; vagas: number }[] = [];
  for (const [hospedagemId, nome, capacidade, sexo, diaria] of [
    [hotel, "Quarto 1", 2, "F", 32000],
    [hotel, "Quarto 2", 2, "M", 32000],
    [hotel, "Quarto 3", 3, null, 41000],
    [apartamento, "Quarto único", 4, null, null],
  ] as const) {
    const id = (
      await db.query<{ id: string }>(
        `INSERT INTO eventos.quarto (hospedagem_id, nome, capacidade, sexo, valor_diaria_centavos) VALUES ($1, $2, $3, $4, $5) RETURNING id`,
        [hospedagemId, nome, capacidade, sexo, diaria],
      )
    ).rows[0]?.id as string;
    if (hospedagemId === hotel) quartos.push({ id, sexo, vagas: capacidade });
  }
  for (const c of voando.filter((v) => v.status === "ACEITA" || v.status === "CONVIDADA")) {
    const quarto = quartos.find((q) => q.vagas > 0 && q.sexo === c.pessoa.sexo) ?? quartos.find((q) => q.vagas > 0 && q.sexo === null);
    if (!quarto) continue;
    quarto.vagas -= 1;
    await db.query(`INSERT INTO eventos.quarto_ocupante (quarto_id, convocacao_id) VALUES ($1, $2)`, [quarto.id, c.id]);
  }
}

// Solicitações de custo: PENDENTE sem alerta, com ALERTA e CRITICO de consumo, e uma APROVADO.
async function semearCustos(db: Executor, evento: EventoCenario, aceitas: Convocada[], registrar: Registrar): Promise<void> {
  const regras = new Map(
    (
      await db.query<{ id: string; codigo: string; valor_centavos: number }>(
        `SELECT r.id, r.codigo, r.valor_centavos FROM eventos.regra_custo r JOIN eventos.tipo_evento t ON t.id = r.tipo_evento_id
          WHERE t.sigla = 'ASM' AND r.codigo IN ('REMUNERACAO', 'ALIMENTACAO') AND r.ativo`,
      )
    ).rows.map((r) => [r.codigo, r]),
  );

  const casos = [
    { consumo: 12, nivel: "NENHUM", auditoria: "PENDENTE" },
    { consumo: 9, nivel: "ALERTA", auditoria: "PENDENTE" },
    { consumo: 6.5, nivel: "CRITICO", auditoria: "PENDENTE" },
    { consumo: 12, nivel: "NENHUM", auditoria: "APROVADO" },
  ] as const;

  for (const [i, caso] of casos.entries()) {
    const c = aceitas[i];
    if (!c || c.km === null) break;
    const aprovado = caso.auditoria === "APROVADO";
    const solicitacao = (
      await db.query<{ id: string }>(
        `INSERT INTO eventos.solicitacao_custo
           (protocolo, evento_id, pessoa_id, convocacao_id, status_auditoria, status_financeiro, nivel_excecao, parecer,
            auditado_por, auditado_em, registrado_por, criado_em)
         VALUES (eventos.proximo_protocolo(), $1, $2, $3, $4, $5, $6, $7,
            CASE WHEN $8::boolean THEN $9::uuid END, CASE WHEN $8::boolean THEN now() - interval '6 hours' END, $9, now() - interval '20 hours')
         RETURNING id`,
        [
          evento.id, c.pessoa.id, c.id, caso.auditoria, aprovado ? "AGUARDANDO_PAGAMENTO" : "AGUARDANDO_AUDITORIA", caso.nivel,
          aprovado ? "Valores conferidos (parecer fictício)" : null, aprovado, USUARIO_TESTE_ID,
        ],
      )
    ).rows[0]?.id as string;

    const km = Number(c.km.toFixed(1));
    const combustivel = Math.round(((km * 2) / caso.consumo) * PRECO_LITRO_CENTAVOS);
    await db.query(
      `INSERT INTO eventos.deslocamento
         (solicitacao_id, ordem, origem, destino, ida_volta, km, consumo_km_l, preco_litro_centavos, combustivel_centavos,
          pedagio_centavos, depreciacao_centavos, total_centavos, nivel_excecao)
       VALUES ($1, 1, $2, $3, true, $4, $5, $6, $7, 0, 0, $7, $8)`,
      [solicitacao, `Endereço fictício, polo ${c.pessoa.poloCodigo}`, evento.localNome, km.toFixed(1), caso.consumo.toFixed(1), PRECO_LITRO_CENTAVOS, combustivel, caso.nivel],
    );
    let itens = 0;
    for (const [categoria, codigo, descricao] of [
      ["REMUNERACAO", "REMUNERACAO", "Remuneração"],
      ["ALIMENTACAO", "ALIMENTACAO", "Alimentação"],
    ] as const) {
      const regra = regras.get(codigo);
      if (!regra) continue;
      itens += regra.valor_centavos;
      await db.query(
        `INSERT INTO eventos.custo_item (solicitacao_id, categoria, regra_custo_id, descricao, valor_centavos) VALUES ($1, $2, $3, $4, $5)`,
        [solicitacao, categoria, regra.id, descricao, regra.valor_centavos],
      );
    }
    await db.query(`UPDATE eventos.solicitacao_custo SET total_centavos = $2 WHERE id = $1`, [solicitacao, combustivel + itens]);

    const base = { entidade: "SOLICITACAO_CUSTO", entidadeId: solicitacao, eventoId: evento.id, emNomeDe: c.pessoa.id };
    await registrar({ ...base, acao: "SOLICITACAO_REGISTRADA", para: "PENDENTE", horasAtras: 20 });
    if (aprovado) await registrar({ ...base, acao: "AUDITORIA_APROVADA", de: "PENDENTE", para: "APROVADO", horasAtras: 6 });
  }
}

// Caronas: dois motoristas com veículo levando passageiros (deslocamento CARONA) e duas pessoas que pediram
// carona e ainda não têm motorista (lista "sem carona" da tela).
async function semearCaronas(db: Executor, evento: EventoCenario, convocadas: Convocada[], registrar: Registrar): Promise<void> {
  const ativas = convocadas.filter((c) => (c.status === "ACEITA" || c.status === "CONVIDADA") && !c.voo);
  const lugares = new Map(
    (
      await db.query<{ pessoa_id: string; lugares: number }>(
        "SELECT pessoa_id, lugares FROM eventos.pessoa_veiculo WHERE pessoa_id = ANY($1::uuid[])",
        [ativas.map((c) => c.pessoa.id)],
      )
    ).rows.map((r) => [r.pessoa_id, r.lugares]),
  );
  const motoristas = ativas.filter((c) => lugares.has(c.pessoa.id)).slice(0, 2);
  const passageiros = ativas.filter((c) => !lugares.has(c.pessoa.id));
  if (motoristas.length === 0) {
    console.warn(`  aviso: ${evento.codigo} sem motorista com veículo; cenário de caronas ficou de fora`);
    return;
  }

  const definir = async (c: Convocada, deslocamento: string, caronaId: string | null) => {
    c.deslocamento = deslocamento;
    await db.query("UPDATE eventos.convocacao SET deslocamento = $2, carona_id = $3 WHERE id = $1", [c.id, deslocamento, caronaId]);
  };

  // Primeiro motorista leva dois, o segundo leva um.
  for (const [i, motorista] of motoristas.entries()) {
    const levar = passageiros.splice(0, Math.min(i === 0 ? 2 : 1, lugares.get(motorista.pessoa.id) ?? 0));
    const carona = (
      await db.query<{ id: string }>(
        `INSERT INTO eventos.carona (evento_id, motorista_pessoa_id, distancia_km, tempo_trajeto_min) VALUES ($1, $2, $3, $4) RETURNING id`,
        [evento.id, motorista.pessoa.id, motorista.km?.toFixed(1) ?? null, motorista.km === null ? null : Math.round(motorista.km * 1.3 + 10)],
      )
    ).rows[0]?.id as string;
    await definir(motorista, "CARRO_PROPRIO", null);
    await registrar({
      entidade: "CARONA", entidadeId: carona, eventoId: evento.id, acao: "MOTORISTA_DEFINIDO",
      dados: { convocacaoId: motorista.id, lugares: lugares.get(motorista.pessoa.id) }, horasAtras: 40,
    });
    for (const passageiro of levar) {
      await definir(passageiro, "CARONA", carona);
      await registrar({ entidade: "CARONA", entidadeId: carona, eventoId: evento.id, acao: "PASSAGEIRO_DEFINIDO", dados: { convocacaoId: passageiro.id }, horasAtras: 39 });
    }
  }
  for (const semMotorista of passageiros.slice(0, 2)) await definir(semMotorista, "CARONA", null);
}

// Copys de escalação geradas pelo motor de copy do módulo comunicacao (mesmo texto e dados_hash da tela).
// Quem foi avisado tem a mensagem ENVIADA com o hash atual; uma pessoa foi reenviada (a mensagem anterior
// fica DESATUALIZADA no histórico) e uma recebeu antes de os dados mudarem (a tela mostra "desatualizada").
async function semearMensagens(banco: Banco, evento: EventoCenario, convocadas: Convocada[]): Promise<void> {
  const repo = criarRepositorioComunicacao(banco.drizzle);
  const [eventoDaComunicacao] = await repo.eventos({ eventoId: evento.id });
  const modelo = modeloEmUso(await repo.modelos(), "ESCALACAO");
  if (!eventoDaComunicacao || !modelo) {
    console.warn(`  aviso: ${evento.codigo} sem modelo de escalação ativo; mensagens ficaram de fora`);
    return;
  }
  const copys = new Map(
    (await gerarCopysDaEquipe(repo, { eventos: [eventoDaComunicacao], modelo, instante: new Date() })).map((item) => [item.pessoa.convocacaoId, item.copy]),
  );

  const gravar = (c: Convocada, texto: string, dadosHash: string, status: "ENVIADA" | "DESATUALIZADA", horasAtras: number) =>
    banco.sql.query(
      `INSERT INTO eventos.mensagem (convocacao_id, modelo_id, texto, dados_hash, canal, status, enviada_em, enviada_por, criado_em)
       VALUES ($1, $2, $3, $4, 'COPIADO', $5, now() - make_interval(hours => $6), $7, now() - make_interval(hours => $6))`,
      [c.id, modelo.id, texto, dadosHash, status, horasAtras, USUARIO_TESTE_ID],
    );

  let reenviada = false;
  let antesDaMudanca = false;
  for (const c of convocadas.filter((item) => AVISADA.has(item.status))) {
    const copy = copys.get(c.id);
    // Recusadas e canceladas saem da equipe ativa e não aparecem na Comunicação: texto e hash só de histórico.
    if (!copy?.pronta) {
      await gravar(c, `Copy de escalação enviada antes da resposta (histórico fictício, ${evento.codigo}).`, hash({ convocacao: c.id }), "ENVIADA", c.status === "CANCELADA" ? 120 : 48);
      continue;
    }
    if (!antesDaMudanca && c.status === "CONVIDADA") {
      antesDaMudanca = true;
      await gravar(c, copy.texto, hash({ convocacao: c.id, versao: "antes do ajuste de horário" }), "ENVIADA", 48);
      continue;
    }
    if (!reenviada && c.status === "ACEITA") {
      reenviada = true;
      await gravar(c, copy.texto, hash({ convocacao: c.id, versao: "anterior" }), "DESATUALIZADA", 60);
    }
    await gravar(c, copy.texto, copy.dadosHash, "ENVIADA", 48);
  }
}
