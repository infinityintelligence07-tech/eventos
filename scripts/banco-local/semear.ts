import { semearCenarios } from "./cenarios";
import { type Banco, CIDADES, type Executor, gerador, type Pessoa, PESSOA_TESTE_ID, USUARIO_TESTE_ID } from "./comum";

// Dados fictícios e claramente falsos: nomes inventados, e-mails @exemplo.test, telefones 90000-xxxx,
// sem CPF nem PIX. Gerador com semente fixa: cada execução produz as mesmas pessoas com os mesmos ids.

export { PESSOA_TESTE_ID, USUARIO_TESTE_ID } from "./comum";

const TOTAL_PESSOAS = 60;
// Cadastros incompletos de propósito (telas de "falta dado").
const SEM_SEXO = new Set([55, 56]);
const SEM_COORDENADA = new Set([57, 58]);

const NOMES_F = ["Alana", "Bianca", "Carla", "Daniela", "Elisa", "Fernanda", "Giovana", "Helena", "Isadora", "Júlia", "Karina", "Larissa", "Marina", "Natália", "Olívia", "Paula", "Raquel", "Sofia", "Tatiana", "Vanessa"];
const NOMES_M = ["André", "Bruno", "Caio", "Diego", "Eduardo", "Felipe", "Gustavo", "Henrique", "Igor", "João", "Kaique", "Lucas", "Mateus", "Nícolas", "Otávio", "Pedro", "Rafael", "Samuel", "Thiago", "Vinícius"];
const SOBRENOMES = ["Arvoredo", "Brisamar", "Campolindo", "Dourada", "Estrelário", "Folhaverde", "Girassolar", "Horizonte", "Ipêamarelo", "Jardineira", "Lagoazul", "Marolinha", "Nascente", "Orvalhada", "Pedralva", "Quintanar", "Riachuelo", "Serrano", "Ventania", "Zéfiro"];
const TAMANHOS = ["PP", "P", "M", "G", "GG", "XG"] as const;

// Funções extras por posição na lista (as demais pessoas ficam só com STAFF).
// Especialistas profissionais (DJ, foto, vídeo) não fazem STAFF.
const ESPECIALIDADES: { codigo: string; quantidade: number; tambemStaff: boolean }[] = [
  { codigo: "STAFF_LIDER", quantidade: 8, tambemStaff: true },
  { codigo: "LIDER", quantidade: 6, tambemStaff: true },
  { codigo: "PAI_MAE", quantidade: 6, tambemStaff: true },
  { codigo: "CAMARIM", quantidade: 3, tambemStaff: true },
  { codigo: "SOCIAL_MEDIA", quantidade: 3, tambemStaff: false },
  { codigo: "DJ", quantidade: 3, tambemStaff: false },
  { codigo: "FOTOGRAFO", quantidade: 3, tambemStaff: false },
  { codigo: "FILMMAKER", quantidade: 2, tambemStaff: false },
];

function idPessoa(n: number): string {
  return `5eed0000-0000-7000-8000-${String(n).padStart(12, "0")}`;
}

function semAcento(texto: string): string {
  return texto.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
}

/**
 * Ajustes sobre os cadastros copiados da produção (a cópia sobrescreve o que as migrations semearam):
 * - Confronto: STAFF sem número na regra, quem monta digita (doc 07 §11, item 8). Na produção vai num passo
 *   de dados depois do deploy do código que entende "digitado" (ver README).
 * - Copy de escalação com gênero e um modelo ativo por tipo: a mesma correção de dados da migration 0004.
 */
async function ajustarCadastrosCopiados(db: Executor): Promise<void> {
  await db.query(
    `UPDATE eventos.tipo_evento
        SET regra_vagas = jsonb_set(regra_vagas, '{funcoes}', coalesce(regra_vagas->'funcoes', '[]'::jsonb) || '[{"funcao": "STAFF", "digitado": true}]'::jsonb),
            atualizado_em = now()
      WHERE sigla = 'CONF' AND NOT coalesce(regra_vagas->'funcoes', '[]'::jsonb) @> '[{"funcao": "STAFF"}]'::jsonb`,
  );
  await db.query(
    `UPDATE eventos.modelo_copy
        SET corpo = replace(corpo, 'ESCALADO(A)', '{{genero:ESCALADO|ESCALADA}}'), atualizado_em = now()
      WHERE tipo = 'ESCALACAO' AND strpos(corpo, 'ESCALADO(A)') > 0`,
  );
  await db.query(
    `UPDATE eventos.modelo_copy m SET ativo = false, atualizado_em = now()
      WHERE m.ativo AND EXISTS (SELECT 1 FROM eventos.modelo_copy o
                                 WHERE o.tipo = m.tipo AND o.ativo AND (o.atualizado_em, o.id) > (m.atualizado_em, m.id))`,
  );
}

export async function semear({ sql: db, drizzle }: Banco): Promise<void> {
  await ajustarCadastrosCopiados(db);
  const aleatorio = gerador(20261028);
  const escolher = <T>(lista: readonly T[]): T => lista[Math.floor(aleatorio() * lista.length)] as T;

  const polos = (await db.query<{ id: string; codigo: string }>("SELECT id, codigo FROM core.polo WHERE deleted_at IS NULL ORDER BY codigo")).rows;
  const funcoes = new Map(
    (await db.query<{ id: string; codigo: string }>("SELECT id, codigo FROM eventos.funcao")).rows.map((f) => [f.codigo, f.id]),
  );
  if (polos.length === 0) throw new Error("Sem polos para distribuir as pessoas.");
  for (const { codigo } of [...ESPECIALIDADES, { codigo: "STAFF" }]) {
    if (!funcoes.has(codigo)) throw new Error(`Função ${codigo} não existe em eventos.funcao.`);
  }

  // Usuário de teste.
  await db.query(
    `INSERT INTO core.usuario (id, email, nome_usuario, telefone) VALUES ($1, 'teste@exemplo.test', 'usuario.teste', '(11) 90000-0000')`,
    [USUARIO_TESTE_ID],
  );
  await db.query(
    `INSERT INTO core.pessoa (id, usuario_id, nome_completo, email, telefone) VALUES ($1, $2, 'Usuário de teste', 'teste@exemplo.test', '(11) 90000-0000')`,
    [PESSOA_TESTE_ID, USUARIO_TESTE_ID],
  );

  // Link do formulário de custos usado na copy de escalação (doc 07 §11.1). Só no banco local.
  await db.query(
    `INSERT INTO eventos.configuracao (chave, valor, atualizado_por) VALUES ('link_custos', 'https://exemplo.test/custos', $1)`,
    [USUARIO_TESTE_ID],
  );

  // Staff.
  const especialidadeDe: { codigo: string; tambemStaff: boolean }[] = [];
  for (const e of ESPECIALIDADES) for (let i = 0; i < e.quantidade; i++) especialidadeDe.push(e);

  const pessoas: Pessoa[] = [];
  for (let n = 1; n <= TOTAL_PESSOAS; n++) {
    const polo = polos[(n - 1) % polos.length] as { id: string; codigo: string };
    const cidade = CIDADES[polo.codigo] ?? { lat: -23.55, lng: -46.63, ddd: "11", iata: "GRU" };
    const sexo: "F" | "M" = n % 2 === 0 ? "F" : "M";
    const primeiro = sexo === "F" ? escolher(NOMES_F) : escolher(NOMES_M);
    const sobrenome = escolher(SOBRENOMES);
    const nome = `${primeiro} ${sobrenome}`;
    const email = `${semAcento(primeiro)}.${semAcento(sobrenome)}.${String(n).padStart(2, "0")}@exemplo.test`;
    const telefone = `(${cidade.ddd}) 90000-${String(n).padStart(4, "0")}`;
    const nascimento = `${1975 + Math.floor(aleatorio() * 30)}-${String(1 + Math.floor(aleatorio() * 12)).padStart(2, "0")}-${String(1 + Math.floor(aleatorio() * 28)).padStart(2, "0")}`;
    const especialidade = especialidadeDe[n - 1];
    const coordenada = { lat: cidade.lat + (aleatorio() - 0.5) * 0.1, lng: cidade.lng + (aleatorio() - 0.5) * 0.1 };
    const pessoa: Pessoa = {
      id: idPessoa(n),
      nome,
      poloCodigo: polo.codigo,
      sexo: SEM_SEXO.has(n) ? null : sexo,
      coordenada: SEM_COORDENADA.has(n) ? null : coordenada,
      funcoes: especialidade ? [especialidade.codigo, ...(especialidade.tambemStaff ? ["STAFF"] : [])] : ["STAFF"],
      temVeiculo: aleatorio() < 0.3,
    };
    pessoas.push(pessoa);

    await db.query(
      `INSERT INTO core.pessoa (id, nome_completo, data_nascimento, email, telefone) VALUES ($1, $2, $3, $4, $5)`,
      [pessoa.id, nome, nascimento, email, telefone],
    );
    await db.query(
      `INSERT INTO core.vinculo (pessoa_id, tipo, polo_id, data_inicio, status) VALUES ($1, 'STAFF', $2, CURRENT_DATE - 365, 'ATIVO')`,
      [pessoa.id, polo.id],
    );
    await db.query(
      `INSERT INTO eventos.pessoa_evento
         (pessoa_id, sexo, camiseta_modelo, camiseta_tamanho, possui_camiseta, fez_confronto, tem_cnpj, lat, lng, geocodificado_em, cadastro_revisado_em)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)`,
      [
        pessoa.id,
        pessoa.sexo,
        sexo === "F" && aleatorio() < 0.6 ? "BABY_LOOK" : "CAMISETA",
        escolher(TAMANHOS),
        aleatorio() < 0.7,
        aleatorio() < 0.55,
        aleatorio() < 0.25,
        pessoa.coordenada?.lat ?? null,
        pessoa.coordenada?.lng ?? null,
        pessoa.coordenada ? new Date() : null,
        aleatorio() < 0.8 ? new Date() : null,
      ],
    );
    for (const codigo of pessoa.funcoes) {
      await db.query(`INSERT INTO eventos.pessoa_funcao (pessoa_id, funcao_id, nivel) VALUES ($1, $2, $3)`, [
        pessoa.id,
        funcoes.get(codigo),
        aleatorio() < 0.2 ? "TRAINEE" : "HABILITADO",
      ]);
    }
    if (pessoa.temVeiculo) {
      await db.query(`INSERT INTO eventos.pessoa_veiculo (pessoa_id, lugares, consumo_km_l) VALUES ($1, $2, $3)`, [
        pessoa.id,
        escolher([4, 4, 5, 7]),
        (9 + aleatorio() * 6).toFixed(1),
      ]);
    }
  }

  // Enquete aberta de disponibilidade: ASM e Confronto dos próximos 60 dias.
  // Parte das respostas foi registrada pelo time em nome da pessoa (registrado_por).
  const eventosEnquete = (
    await db.query<{ id: string }>(
      `SELECT e.id FROM eventos.evento e JOIN eventos.tipo_evento t ON t.id = e.tipo_evento_id
        WHERE t.sigla IN ('ASM', 'CONF') AND e.inicio BETWEEN now() AND now() + interval '60 days'
          AND e.status <> 'CANCELADO' AND e.deleted_at IS NULL
        ORDER BY e.inicio`,
    )
  ).rows;
  if (eventosEnquete.length > 0) {
    const enquete = await db.query<{ id: string }>(
      `INSERT INTO eventos.enquete (titulo, fecha_em, criado_por, criado_em)
       VALUES ('Disponibilidade ASM e Confronto (próximos 60 dias)', now() + interval '7 days', $1, now() - interval '3 days') RETURNING id`,
      [USUARIO_TESTE_ID],
    );
    const enqueteId = enquete.rows[0]?.id;
    for (const { id: eventoId } of eventosEnquete) {
      await db.query(`INSERT INTO eventos.enquete_evento (enquete_id, evento_id) VALUES ($1, $2)`, [enqueteId, eventoId]);
      for (const pessoa of pessoas) {
        if (aleatorio() < 0.25) continue; // nem todo mundo respondeu
        await db.query(
          `INSERT INTO eventos.disponibilidade (enquete_id, evento_id, pessoa_id, disponivel, respondido_em, registrado_por)
           VALUES ($1, $2, $3, $4, now() - make_interval(hours => $5), $6)`,
          [enqueteId, eventoId, pessoa.id, aleatorio() < 0.65, Math.floor(aleatorio() * 72), aleatorio() < 0.3 ? USUARIO_TESTE_ID : null],
        );
      }
    }
  }

  await semearCenarios({ sql: db, drizzle }, pessoas, aleatorio);
}
