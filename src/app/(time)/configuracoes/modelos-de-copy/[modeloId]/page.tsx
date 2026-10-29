import { ArrowLeft } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { FaixaSomenteLeitura, TITULO_DE_SECAO } from "@/app/(time)/_componentes/ui";
import { carregarEditorDeModelo } from "@/fluxos/comunicacao";
import { rotuloDoTipoDeModelo, TIPOS_DE_MODELO } from "@/modules/comunicacao";

import { EditorDoModelo } from "../_componentes/editor-de-modelo";
import { exigirAtor } from "@/app/(time)/_servidor/usuario-atual";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Modelo de copy" };

const NOVO = "novo";
const FORMATO_UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default async function PaginaDoModelo({ params }: { params: Promise<{ modeloId: string }> }) {
  await exigirAtor();
  const { modeloId } = await params;
  if (modeloId !== NOVO && !FORMATO_UUID.test(modeloId)) notFound();
  const editor = await carregarEditorDeModelo(modeloId === NOVO ? null : modeloId, new Date());
  if (!editor) notFound();

  return (
    <>
      <Link
        href="/configuracoes/modelos-de-copy"
        className="mb-2 inline-flex items-center gap-1 text-[13px] font-medium text-[var(--ds-tint-text)] hover:underline"
      >
        <ArrowLeft size={14} aria-hidden />
        Modelos de copy
      </Link>
      <h2 className={`${TITULO_DE_SECAO} mb-4`}>
        {!editor.modelo
          ? "Novo modelo"
          : editor.modelo.nome === rotuloDoTipoDeModelo(editor.modelo.tipo)
            ? editor.modelo.nome
            : `${editor.modelo.nome} · ${rotuloDoTipoDeModelo(editor.modelo.tipo)}`}
      </h2>
      {!editor.escritaLiberada && <FaixaSomenteLeitura />}
      <EditorDoModelo editor={editor} tipos={TIPOS_DE_MODELO.map((tipo) => ({ valor: tipo, rotulo: rotuloDoTipoDeModelo(tipo) }))} />
    </>
  );
}
