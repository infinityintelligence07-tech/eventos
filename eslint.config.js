import tseslint from "typescript-eslint";

/**
 * Fronteiras (mesmo padrão do GH-System):
 *   - dentro do módulo -> caminho relativo ("./domain/vagas")
 *   - fora do módulo   -> alias pela interface pública ("@/modules/escala")
 * domain/ é puro: sem banco, sem HTTP, sem relógio, sem ambiente.
 * fluxos/ é a raiz de composição (docs/07 §2): combina módulos numa transação; app/ chama só "@/fluxos/<aba>".
 */

const PROIBIDO_ATRAVESSAR_FRONTEIRA = {
  group: ["@/modules/*/*"],
  message: "Importe módulos apenas pela interface pública: '@/modules/<nome>'.",
};

const FLUXO_PELA_INTERFACE = {
  group: ["@/fluxos/*/*"],
  message: "Importe fluxos apenas pela interface pública: '@/fluxos/<aba>'.",
};

const MODULO_NAO_IMPORTA_MODULO = {
  group: ["@/modules/*", "@/fluxos", "@/fluxos/*"],
  message: "Módulo não importa módulo nem fluxo. Combine os dois num fluxo (src/fluxos) ou num job.",
};

const CORE_NAO_IMPORTA_MODULO = {
  group: ["@/modules/*", "@/fluxos", "@/fluxos/*", "@/app/*"],
  message: "core/ é infraestrutura. Não pode depender de módulo, fluxo nem app.",
};

const FLUXO_NAO_CONHECE_A_TELA = {
  group: ["@/app/*", "next", "next/*", "react", "react/*"],
  message: "Fluxo não conhece a tela: recebe o usuário e o instante como parâmetro; revalidatePath fica na server action.",
};

const ACESSO_AO_BANCO = {
  group: ["@/core/db", "@/core/db/*", "@/core/db/schema/*", "drizzle-orm", "drizzle-orm/*", "pg"],
  message: "Acesso ao banco só em repository/ (ou em core/db).",
};

export default tseslint.config(
  {
    ignores: ["**/.next/**", "**/node_modules/**", "**/*.config.*", "next-env.d.ts", "design/**"],
  },

  ...tseslint.configs.recommended,

  {
    files: ["src/**/*.{ts,tsx}"],
    rules: {
      "@typescript-eslint/no-explicit-any": "error",
      "no-console": "error",
      "no-restricted-imports": ["error", { patterns: [PROIBIDO_ATRAVESSAR_FRONTEIRA, FLUXO_PELA_INTERFACE, ACESSO_AO_BANCO] }],
      "no-restricted-properties": [
        "error",
        { object: "process", property: "env", message: "Leia variáveis de ambiente via '@/core/config'." },
      ],
    },
  },

  {
    files: ["src/modules/**/*.{ts,tsx}"],
    ignores: ["src/modules/*/repository/**"],
    rules: {
      "no-restricted-imports": [
        "error",
        { patterns: [PROIBIDO_ATRAVESSAR_FRONTEIRA, MODULO_NAO_IMPORTA_MODULO, ACESSO_AO_BANCO] },
      ],
    },
  },

  {
    files: ["src/modules/*/repository/**/*.ts"],
    rules: {
      "no-restricted-imports": [
        "error",
        { patterns: [PROIBIDO_ATRAVESSAR_FRONTEIRA, MODULO_NAO_IMPORTA_MODULO] },
      ],
    },
  },

  {
    files: ["src/modules/*/domain/**/*.ts"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            {
              group: ["@/core/*", "@/modules/*", "@/fluxos", "@/fluxos/*", "drizzle-orm", "drizzle-orm/*", "pg", "next", "next/*"],
              message: "domain/ é puro: sem banco, sem HTTP, sem framework.",
            },
          ],
        },
      ],
      "no-restricted-globals": [
        "error",
        { name: "fetch", message: "domain/ não faz I/O." },
        { name: "process", message: "domain/ não lê ambiente." },
      ],
      "no-restricted-properties": [
        "error",
        { object: "Date", property: "now", message: "Receba o instante como parâmetro." },
        { object: "Math", property: "random", message: "Receba o valor como parâmetro." },
      ],
      "no-restricted-syntax": [
        "error",
        {
          selector: "NewExpression[callee.name='Date'][arguments.length=0]",
          message: "Receba o instante como parâmetro. domain/ é determinístico.",
        },
      ],
    },
  },

  // jobs/ monta as dependências (banco, integrações) e chama os serviços dos módulos.
  {
    files: ["src/jobs/**/*.ts"],
    rules: {
      "no-restricted-imports": ["error", { patterns: [PROIBIDO_ATRAVESSAR_FRONTEIRA, FLUXO_PELA_INTERFACE] }],
    },
  },

  // fluxos/ tem o mesmo papel de jobs/ para as telas: pode usar o banco e vários módulos, só pela interface pública.
  {
    files: ["src/fluxos/**/*.ts"],
    rules: {
      "no-restricted-imports": [
        "error",
        { patterns: [PROIBIDO_ATRAVESSAR_FRONTEIRA, FLUXO_PELA_INTERFACE, FLUXO_NAO_CONHECE_A_TELA] },
      ],
    },
  },

  {
    files: ["src/core/**/*.{ts,tsx}"],
    rules: {
      "no-restricted-imports": ["error", { patterns: [CORE_NAO_IMPORTA_MODULO] }],
    },
  },

  {
    files: ["src/core/config/**"],
    rules: { "no-restricted-properties": "off" },
  },

  {
    files: ["**/*.test.ts", "src/test/**/*.ts"],
    rules: {
      "no-restricted-imports": "off",
      "no-restricted-properties": "off",
    },
  },
);
