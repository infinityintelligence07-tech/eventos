import { CircleAlert } from "lucide-react";
import type { InputHTMLAttributes, ReactNode, TextareaHTMLAttributes } from "react";

import { CAMPO, idDoCampo } from "./classes";
import { type PropsDoSeletor, Seletor } from "./seletor";
import type { OpcaoDoSeletor } from "./seletor-logica";

// doc 08 §3.6. Rótulo sempre visível; erro com aria-invalid, borda vermelha e aria-describedby.
// Os erros vêm de ResultadoAcao.campos (chave = caminho do Zod, ver caminhoDoCampo).

export type PropsDoControle = {
  id: string;
  name: string;
  "aria-invalid"?: true;
  "aria-required"?: true;
  "aria-describedby"?: string;
  className: string;
};

type BaseDoCampo = {
  /** `name` do formulário (`linhas[0].quantidade`). O id sai daqui, se não vier. */
  nome: string;
  rotulo: ReactNode;
  id?: string;
  ajuda?: ReactNode;
  erros?: string[];
  obrigatorio?: boolean;
  className?: string;
};

/** Rótulo + controle + ajuda + erro. O controle recebe id, name e os atributos de acessibilidade prontos. */
export function Campo({
  nome,
  rotulo,
  id = idDoCampo(nome),
  ajuda,
  erros,
  obrigatorio = false,
  className = "",
  classeDoControle = CAMPO,
  children,
}: BaseDoCampo & { classeDoControle?: string; children: (controle: PropsDoControle) => ReactNode }) {
  const erro = erros?.[0];
  const descricao = [ajuda ? `${id}-ajuda` : null, erro ? `${id}-erro` : null].filter(Boolean).join(" ");
  return (
    <div className={className}>
      <label htmlFor={id} className="mb-1 block text-[13px] font-medium text-[var(--ds-label)]">
        {rotulo}
        {obrigatorio && <span className="font-normal text-[var(--ds-label-2)]"> (obrigatório)</span>}
      </label>
      {children({
        id,
        name: nome,
        "aria-invalid": erro ? true : undefined,
        "aria-required": obrigatorio ? true : undefined,
        "aria-describedby": descricao || undefined,
        className: `${classeDoControle} ${erro ? "border-[var(--ds-red-deep)]" : ""}`,
      })}
      {ajuda && (
        <p id={`${id}-ajuda`} className="mt-1 text-[12px] text-[var(--ds-label-2)]">
          {ajuda}
        </p>
      )}
      {erro && (
        <p id={`${id}-erro`} className="mt-1 flex items-center gap-1 text-[12px] font-medium text-[var(--ds-red-deep)]">
          <CircleAlert size={14} aria-hidden className="shrink-0" />
          {erro}
        </p>
      )}
    </div>
  );
}

type SemAtributosDoCampo = "id" | "name" | "className" | "children";

/** Texto ou número. Número usa `numerico` (type=text + inputMode), para a rolagem do mouse não mudar o valor. */
export function CampoDeTexto({
  nome,
  rotulo,
  id,
  ajuda,
  erros,
  obrigatorio,
  className,
  numerico = false,
  ...entrada
}: BaseDoCampo & Omit<InputHTMLAttributes<HTMLInputElement>, SemAtributosDoCampo> & { numerico?: boolean }) {
  return (
    <Campo nome={nome} rotulo={rotulo} id={id} ajuda={ajuda} erros={erros} obrigatorio={obrigatorio} className={className}>
      {(controle) => <input type="text" inputMode={numerico ? "numeric" : undefined} {...entrada} {...controle} />}
    </Campo>
  );
}

export type OpcaoDoCampo = OpcaoDoSeletor;

type PropsDoSeletorNoCampo = Pick<PropsDoSeletor, "valor" | "valorInicial" | "aoMudar" | "busca" | "desabilitado" | "marcador" | "enviarAoEscolher">;

/**
 * Lista de escolha do sistema (o `Seletor`) com rótulo, ajuda e erro. `vazio` é a opção sem valor ("—", "Todos").
 * `obrigatorio` aqui só marca o rótulo e o `aria-required`, como nos outros campos: quem recusa o vazio é o servidor.
 */
export function CampoDeSelecao({
  nome,
  rotulo,
  id,
  ajuda,
  erros,
  obrigatorio,
  className,
  opcoes,
  vazio,
  ...selecao
}: BaseDoCampo & PropsDoSeletorNoCampo & { opcoes: OpcaoDoCampo[]; vazio?: string }) {
  return (
    <Campo nome={nome} rotulo={rotulo} id={id} ajuda={ajuda} erros={erros} obrigatorio={obrigatorio} className={className}>
      {(controle) => (
        <Seletor
          {...selecao}
          id={controle.id}
          nome={controle.name}
          opcoes={opcoes}
          vazio={vazio}
          rotulo={typeof rotulo === "string" ? rotulo : undefined}
          aria-invalid={controle["aria-invalid"]}
          aria-required={controle["aria-required"]}
          aria-describedby={controle["aria-describedby"]}
        />
      )}
    </Campo>
  );
}

export function CampoDeTextoLongo({
  nome,
  rotulo,
  id,
  ajuda,
  erros,
  obrigatorio,
  className,
  ...texto
}: BaseDoCampo & Omit<TextareaHTMLAttributes<HTMLTextAreaElement>, SemAtributosDoCampo>) {
  return (
    <Campo
      nome={nome}
      rotulo={rotulo}
      id={id}
      ajuda={ajuda}
      erros={erros}
      obrigatorio={obrigatorio}
      className={className}
      classeDoControle={CAMPO.replace("h-10 ", "") + " min-h-[96px] py-2"}
    >
      {(controle) => <textarea {...texto} {...controle} />}
    </Campo>
  );
}

/** Checkbox (ou rádio, com `type="radio"`): o label envolve controle e texto, com alvo de pelo menos 24 px. */
export function CaixaDeMarcar({
  rotulo,
  ajuda,
  className = "",
  ...entrada
}: Omit<InputHTMLAttributes<HTMLInputElement>, "className" | "children"> & { rotulo: ReactNode; ajuda?: ReactNode; className?: string }) {
  return (
    <label className={`flex min-h-6 cursor-pointer items-start gap-2 py-1 text-[14px] text-[var(--ds-label)] ${className}`}>
      <input type="checkbox" {...entrada} className="mt-0.5 h-[18px] w-[18px] shrink-0 accent-[var(--ds-brand)]" />
      <span>
        {rotulo}
        {ajuda && <span className="mt-0.5 block text-[12px] text-[var(--ds-label-2)]">{ajuda}</span>}
      </span>
    </label>
  );
}
