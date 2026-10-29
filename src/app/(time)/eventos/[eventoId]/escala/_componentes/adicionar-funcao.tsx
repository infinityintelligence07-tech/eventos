"use client";

import { Plus } from "lucide-react";
import { useState } from "react";

import { useAcao } from "@/app/(time)/_componentes/ui";
import { Botao } from "../../../../_componentes/ui/botao";
import { CampoDeSelecao, CampoDeTexto } from "../../../../_componentes/ui/campo";
import { PainelLateral } from "../../../../_componentes/ui/dialogo";
import { dataCurta } from "../../../../_componentes/ui/formatos";
import { adicionarVagaManual } from "../acoes";

/** "+ Adicionar função": linha manual (origem MANUAL), já com o número confirmado. */
export function AdicionarFuncao({
  eventoId,
  funcoes,
  dias,
  primaria = false,
}: {
  eventoId: string;
  funcoes: { id: string; nome: string }[];
  dias: string[];
  primaria?: boolean;
}) {
  const [aberto, setAberto] = useState(false);
  const { erros, enviar, pendente } = useAcao(adicionarVagaManual, { aoConcluir: () => setAberto(false), toastDeCampo: true });
  const idDoFormulario = "formulario-adicionar-funcao";

  return (
    <>
      <Botao variante={primaria ? "primario" : "texto"} icone={<Plus size={18} aria-hidden />} onClick={() => setAberto(true)}>
        Adicionar função
      </Botao>
      <PainelLateral
        aberto={aberto}
        aoFechar={() => setAberto(false)}
        titulo="Adicionar função"
        subtitulo="A função entra na escala com o número que você informar, já confirmado."
        rodape={
          <>
            <Botao onClick={() => setAberto(false)}>Cancelar</Botao>
            <Botao type="submit" form={idDoFormulario} variante="primario" carregando={pendente} textoCarregando="Adicionando…">
              Adicionar função
            </Botao>
          </>
        }
      >
        <form id={idDoFormulario} onSubmit={enviar} className="grid gap-4">
          <input type="hidden" name="eventoId" value={eventoId} />
          <CampoDeSelecao
            nome="funcaoId"
            rotulo="Função"
            obrigatorio
            vazio="Escolha a função"
            opcoes={funcoes.map((funcao) => ({ valor: funcao.id, rotulo: funcao.nome }))}
            erros={erros("funcaoId")}
          />
          <CampoDeSelecao
            nome="data"
            rotulo="Dia"
            obrigatorio
            defaultValue={dias[0]}
            opcoes={dias.map((dia) => ({ valor: dia, rotulo: dataCurta(dia) }))}
            erros={erros("data")}
            ajuda="Em eventos de vários dias, adicione uma linha por dia quando o número mudar."
          />
          <CampoDeTexto nome="quantidade" rotulo="Número de vagas" numerico obrigatorio defaultValue="1" erros={erros("quantidade")} />
        </form>
      </PainelLateral>
    </>
  );
}
