import { BedDouble, Hotel, Sparkles } from "lucide-react";
import Link from "next/link";

import type { HospedagemDoEventoCarregada } from "@/fluxos/logistica";
import {
  destinoDaTroca,
  destinoNoQuarto,
  diasEntre,
  localDaPalestra,
  type OrigemDoHotel,
  podeOcupar,
  rotuloDaCapacidade,
  rotuloDaOrigemDoHotel,
  rotuloDoSexoDoQuarto,
  type Sexo,
  situacaoDoPagamento,
  somarDias,
  textoDoPeriodo,
} from "@/modules/logistica";
import { BotaoCopiar, FormularioDeAcao } from "@/app/(time)/_componentes/ui";

import { Aviso, FaixaSomenteLeitura } from "../../_componentes/ui/aviso";
import { BarraDeFiltros, SeletorDeFiltro } from "../../_componentes/ui/barra-de-filtros";
import { BotaoDeEnvio } from "../../_componentes/ui/botao";
import { Cartao } from "../../_componentes/ui/cartao";
import { CAMPO, CARTAO, TITULO_DE_SECAO } from "../../_componentes/ui/classes";
import { EstadoVazio } from "../../_componentes/ui/estados";
import { dataCurta, dinheiro, quantidadeDe } from "../../_componentes/ui/formatos";
import { Seletor } from "../../_componentes/ui/seletor";
import {
  adicionarQuartoAcao,
  alterarHospedagemAcao,
  aplicarRoomingSugeridoAcao,
  acrescentarHospedeAcao,
  aprovarPagamentoAcao,
  cancelarPedidoAcao,
  desfazerAprovacaoAcao,
  criarHospedagemAcao,
  definirPeriodoDoOcupanteAcao,
  dispensarLogisticaDoEventoAcao,
  moverDeQuartoAcao,
  porNoQuartoAcao,
  registrarPedidoDeHospedagemAcao,
  registrarRetornoDeHospedagemAcao,
  removerHospedagemAcao,
  removerQuartoAcao,
  tirarDoQuartoAcao,
  tirarHospedeAcao,
} from "../acoes";
import { BotaoDefinirHospedagem, BotaoPeriodoDoOcupante, BotaoRegistrarReserva, FormularioNovoQuarto } from "./formularios-de-hospedagem";
import { AtalhosDoRecorte } from "./recorte";
import { BotaoAprovarPagamento, BotaoCancelarPedido, BotaoDesfazerAprovacao } from "./formularios-de-voo";
import { ChipDoPagamento } from "./pagamento";
import { ChipDoVoo, paraCampoDeDinheiro } from "./situacoes";

// Hospedagem do evento: nós montamos os quartos (quem divide com quem), a SDC escolhe e reserva o hotel.
// A tela é um quadro de blocos (docs/08 §10.2): em cima, os números do evento; à esquerda, quem está sem quarto, um
// bloco por pessoa; à direita, um bloco por quarto, com uma casa por cama. Coloca-se a pessoa pelo bloco dela
// ("Colocar no quarto…") ou pela cama livre ("Colocar alguém…"); a escolha já grava.
// Quem precisa de hotel é a união de quem está marcado na escala, de quem tem pedido de voo com "também precisa de
// hotel" e de quem foi acrescentado aqui. Em evento com escala, "Acrescentar pessoa" só traz nomes da escala.
// Apartamento da IAM é o caminho sem SDC. "Sem hospedagem" tira o evento dos pendentes (como na planilha).

const HOTEL_A_DEFINIR = "Hotel a definir pela SDC";

/** Botão de "este evento não tem hospedagem" e do desfazer. */
function BotaoSemHospedagem({ eventoId, dispensar, rotulo }: { eventoId: string; dispensar: boolean; rotulo: string }) {
  return (
    <FormularioDeAcao acao={dispensarLogisticaDoEventoAcao} aria-label={rotulo}>
      <input type="hidden" name="eventoId" value={eventoId} />
      <input type="hidden" name="item" value="HOSPEDAGEM" />
      <input type="hidden" name="dispensar" value={dispensar ? "true" : "false"} />
      <BotaoDeEnvio tamanho="pequeno" variante={dispensar ? "texto" : "secundario"}>
        {rotulo}
      </BotaoDeEnvio>
    </FormularioDeAcao>
  );
}

/** O quarto como destino: o que a lista mostra e o que a regra do quarto precisa para dizer se a pessoa cabe. */
type OpcaoDeQuarto = { id: string; nome: string; resumo: string; capacidade: number; sexo: Sexo | null; ocupantes: { pessoaId: string; sexo: Sexo | null }[] };
/** Quem já está num quarto e pode trocar de lugar com outra pessoa. */
type OpcaoDeTroca = { pessoaId: string; quartoId: string; rotulo: string };
type PessoaSemQuarto = HospedagemDoEventoCarregada["semQuarto"][number];

const diarias = (noites: number) => (noites === 1 ? "1 diária" : `${noites} diárias`);
const primeiroNome = (nome: string) => nome.trim().split(/\s+/)[0] ?? nome;
const quartosEmTexto = (quantidade: number) => (quantidade === 1 ? "1 quarto" : `${quantidade} quartos`);
const camasLivresEmTexto = (quantidade: number) => (quantidade === 1 ? "1 cama livre" : `${quantidade} camas livres`);
const maiuscula = (texto: string) => texto.charAt(0).toUpperCase() + texto.slice(1);

/** "da escala · do pedido de voo": de onde veio a necessidade de hotel da pessoa. */
const textoDasOrigens = (origens: OrigemDoHotel[]) => (origens.length === 0 ? "sem origem: confira" : origens.map(rotuloDaOrigemDoHotel).join(" · "));

/** Por que a pessoa não entra neste quarto agora (nulo = entra). É a mesma regra que o servidor aplica ao gravar. */
function motivoParaNaoCaber(quarto: OpcaoDeQuarto, pessoa: { pessoaId: string; sexo: Sexo | null }): string | null {
  const verificacao = podeOcupar(quarto, pessoa);
  if (verificacao.ok) return null;
  switch (verificacao.motivo) {
    case "QUARTO_CHEIO":
      return "cheio";
    case "SEXO_DIFERENTE":
      return "quarto de outro sexo";
    case "SEM_SEXO_NO_CADASTRO":
      return "falta o sexo no cadastro";
    default: {
      const desconhecido: never = verificacao.motivo;
      throw new Error(`recusa desconhecida: ${String(desconhecido)}`);
    }
  }
}

// A cor ajuda a bater o olho; o texto ao lado sempre diz o que é (a cor nunca é a única informação).
const COR_DO_SEXO = { F: "var(--ds-purple)", M: "var(--ds-teal)", indefinido: "var(--ds-gray-3)" } as const;
const corDoSexo = (sexo: Sexo | null) => COR_DO_SEXO[sexo ?? "indefinido"];

/** Etiqueta "Feminino" / "Masculino" da pessoa. Sem sexo no cadastro vira aviso: ela só entra em quarto misto. */
function EtiquetaDoSexo({ sexo }: { sexo: Sexo | null }) {
  if (sexo === null) {
    return <span className="shrink-0 rounded-full bg-[var(--ds-orange-soft)] px-2 py-0.5 text-[11px] font-medium text-[var(--ds-orange-deep)]">Sem sexo no cadastro</span>;
  }
  return (
    <span className="inline-flex shrink-0 items-center gap-1 rounded-full border border-[var(--ds-separator)] bg-[var(--ds-surface)] px-2 py-0.5 text-[11px] font-medium text-[var(--ds-label-2)]">
      <span aria-hidden className="size-2 rounded-full" style={{ background: corDoSexo(sexo) }} />
      {sexo === "F" ? "Feminino" : "Masculino"}
    </span>
  );
}

/** Um número do resumo do evento. */
function Numero({ rotulo, valor, detalhe, tom = "neutro" }: { rotulo: string; valor: number; detalhe?: string; tom?: "neutro" | "atencao" | "sucesso" }) {
  const cor = tom === "atencao" ? "text-[var(--ds-orange-deep)]" : tom === "sucesso" ? "text-[var(--ds-green-deep)]" : "";
  return (
    <div className={`${CARTAO} px-4 py-3`}>
      <dt className="text-[12px] font-medium text-[var(--ds-label-2)]">{rotulo}</dt>
      <dd className="mt-0.5 flex flex-wrap items-baseline gap-x-2">
        <span className={`text-[24px] font-semibold leading-[1.2] tabular-nums ${cor}`}>{valor.toLocaleString("pt-BR")}</span>
        {detalhe && <span className="text-[12px] text-[var(--ds-label-2)]">{detalhe}</span>}
      </dd>
    </div>
  );
}

/**
 * "Falta alguém?": acrescenta à lista de quem precisa de hotel. Em evento com escala, só os nomes da escala que ainda
 * não estão na lista; sem escala (Masterclass, ou evento que ainda não escalou ninguém), o cadastro de staff.
 */
function AcrescentarPessoa({ eventoId, pessoas, daEscala }: { eventoId: string; pessoas: { pessoaId: string; nome: string }[]; daEscala: boolean }) {
  if (pessoas.length === 0) return null;
  const rotulo = daEscala ? "Acrescentar pessoa da escala" : "Acrescentar pessoa";
  return (
    <FormularioDeAcao acao={acrescentarHospedeAcao} className="mt-2 flex flex-wrap items-center gap-2" aria-label={`${rotulo} à lista de quem precisa de hotel`}>
      <input type="hidden" name="eventoId" value={eventoId} />
      <label htmlFor="acrescentar-hospede" className="sr-only">
        {rotulo}
      </label>
      <Seletor
        id="acrescentar-hospede"
        nome="pessoaId"
        rotulo={rotulo}
        marcador={daEscala ? "Escolha na escala…" : "Escolha pelo nome…"}
        opcoes={pessoas.map((pessoa) => ({ valor: pessoa.pessoaId, rotulo: pessoa.nome }))}
        busca
        obrigatorio
        tamanho="pequeno"
        className="min-w-0 flex-[1_1_160px]"
      />
      <BotaoDeEnvio tamanho="pequeno" variante="secundario">
        Acrescentar
      </BotaoDeEnvio>
    </FormularioDeAcao>
  );
}

/** Tira da lista quem foi acrescentado aqui. Quem também veio da escala ou do voo continua na lista por essas origens. */
function TirarDaLista({ eventoId, pessoaId, nome }: { eventoId: string; pessoaId: string; nome: string }) {
  return (
    <FormularioDeAcao acao={tirarHospedeAcao} aria-label={`Tirar ${nome} da lista de quem precisa de hotel`}>
      <input type="hidden" name="eventoId" value={eventoId} />
      <input type="hidden" name="pessoaId" value={pessoaId} />
      <BotaoDeEnvio tamanho="pequeno" variante="texto" aria-label={`Tirar ${nome} da lista`}>
        Tirar da lista
      </BotaoDeEnvio>
    </FormularioDeAcao>
  );
}

/** "Colocar no quarto…" no bloco de quem está sem quarto. Escolher o quarto já grava (alternativa a arrastar, WCAG 2.5.7). */
function ColocarNoQuarto({ pessoa, quartos }: { pessoa: PessoaSemQuarto; quartos: OpcaoDeQuarto[] }) {
  if (quartos.length === 0) return null;
  const id = `colocar-${pessoa.pessoaId}`;
  const descricao = `Colocar ${pessoa.nome} num quarto`;
  return (
    <FormularioDeAcao acao={porNoQuartoAcao} toastDeCampo className="min-w-0 flex-[1_1_160px]" aria-label={descricao}>
      <input type="hidden" name="pessoaId" value={pessoa.pessoaId} />
      <label htmlFor={id} className="sr-only">
        {descricao}
      </label>
      <Seletor
        id={id}
        nome="quartoId"
        rotulo={descricao}
        marcador="Colocar no quarto…"
        opcoes={quartos.map((quarto) => {
          const motivo = motivoParaNaoCaber(quarto, pessoa);
          return { valor: quarto.id, rotulo: quarto.nome, descricao: motivo ? `${quarto.resumo} · ${motivo}` : quarto.resumo, desabilitada: motivo !== null };
        })}
        enviarAoEscolher
        obrigatorio
        tamanho="pequeno"
      />
    </FormularioDeAcao>
  );
}

/** "Colocar alguém…" na cama livre: a lista de quem está sem quarto, vista de dentro do quarto. Escolher já grava. */
function ColocarNaCama({ quarto, cama, semQuarto }: { quarto: OpcaoDeQuarto; cama: number; semQuarto: PessoaSemQuarto[] }) {
  const id = `cama-${quarto.id}-${cama}`;
  const descricao = `Colocar alguém no ${quarto.nome}`;
  return (
    <FormularioDeAcao acao={porNoQuartoAcao} toastDeCampo aria-label={descricao}>
      <input type="hidden" name="quartoId" value={quarto.id} />
      <label htmlFor={id} className="sr-only">
        {descricao}
      </label>
      <Seletor
        id={id}
        nome="pessoaId"
        rotulo={descricao}
        marcador="Colocar alguém…"
        opcoes={semQuarto.map((pessoa) => {
          const motivo = motivoParaNaoCaber(quarto, pessoa);
          const sexo = pessoa.sexo === "F" ? "feminino" : pessoa.sexo === "M" ? "masculino" : "sem sexo no cadastro";
          return { valor: pessoa.pessoaId, rotulo: pessoa.nome, descricao: [pessoa.funcao, motivo ?? sexo].filter(Boolean).join(" · "), desabilitada: motivo !== null };
        })}
        busca
        enviarAoEscolher
        obrigatorio
        tamanho="pequeno"
      />
    </FormularioDeAcao>
  );
}

/**
 * "Mover para…" de quem já está num quarto, em um passo: outro quarto com vaga ou trocar de lugar com alguém de outro
 * quarto (a troca funciona mesmo com os dois quartos cheios). Escolher já grava.
 */
function MoverDeQuarto({ pessoaId, nome, quartoAtual, quartos, trocas }: { pessoaId: string; nome: string; quartoAtual: string; quartos: OpcaoDeQuarto[]; trocas: OpcaoDeTroca[] }) {
  const destinos = quartos.filter((quarto) => quarto.id !== quartoAtual);
  const comQuem = trocas.filter((troca) => troca.quartoId !== quartoAtual);
  if (destinos.length === 0) return null;
  const id = `mover-${pessoaId}`;
  const descricao = `Mover ${nome} para outro quarto ou trocar de lugar com alguém`;
  return (
    <FormularioDeAcao acao={moverDeQuartoAcao} toastDeCampo className="min-w-0 flex-[1_1_130px]" aria-label={descricao}>
      <input type="hidden" name="quartoId" value={quartoAtual} />
      <input type="hidden" name="pessoaId" value={pessoaId} />
      <label htmlFor={id} className="sr-only">
        {descricao}
      </label>
      {/* Dois grupos: outro quarto com vaga ou trocar de lugar com um ocupante (lista de pessoas: com busca). */}
      <Seletor
        id={id}
        nome="destino"
        rotulo={descricao}
        marcador="Mover para…"
        opcoes={[
          ...destinos.map((quarto) => {
            const cheio = quarto.ocupantes.length >= quarto.capacidade;
            return { valor: destinoNoQuarto(quarto.id), rotulo: quarto.nome, descricao: cheio ? `${quarto.resumo} · cheio` : quarto.resumo, desabilitada: cheio, grupo: "Outro quarto" };
          }),
          ...comQuem.map((troca) => ({ valor: destinoDaTroca(troca.quartoId, troca.pessoaId), rotulo: troca.rotulo, grupo: "Trocar de lugar com" })),
        ]}
        busca={comQuem.length > 0 ? true : undefined}
        enviarAoEscolher
        obrigatorio
        tamanho="pequeno"
      />
    </FormularioDeAcao>
  );
}

// Bloco dentro de um cartão: borda e fundo um tom abaixo, para o quarto e a pessoa se destacarem do cartão.
const BLOCO = "rounded-[var(--ds-radius-md)] border border-[var(--ds-separator)]";

export function SecaoDeHospedagem({ dados, escrita, comSeletorDeEvento }: { dados: HospedagemDoEventoCarregada; escrita: boolean; comSeletorDeEvento: boolean }) {
  const { evento } = dados;
  const masterclass = dados.recorte === "MASTERCLASS";
  const seletor = comSeletorDeEvento && (
    <>
      {/* Eventos | Masterclass, como as abas da planilha. Trocar de recorte tira o evento escolhido (é do outro lado). */}
      <AtalhosDoRecorte recorte={dados.recorte} href={(recorte) => (recorte === "MASTERCLASS" ? "/logistica/hospedagem?recorte=masterclass" : "/logistica/hospedagem")} />
      <BarraDeFiltros>
        <SeletorDeFiltro
          nome="evento"
          rotulo={masterclass ? "Palestra" : "Evento"}
          todos={masterclass ? "Próxima palestra" : "Próximo evento"}
          busca
          valor={evento?.id ?? null}
          opcoes={[...(evento && !dados.eventos.some((item) => item.id === evento.id) ? [evento] : []), ...dados.eventos].map((item) => ({
            valor: item.id,
            // Na Masterclass (são centenas), a data vem primeiro e depois onde é a palestra.
            rotulo: `${masterclass ? `${dataCurta(item.dataInicio)} · ${localDaPalestra(item)}` : `${item.codigo ?? item.nome} · ${dataCurta(item.dataInicio)}`}${item.semHospedagem ? " · sem hospedagem" : ""}`,
          }))}
        />
      </BarraDeFiltros>
    </>
  );

  if (!evento) {
    return (
      <section aria-labelledby="titulo-hospedagem" className="mb-8">
        <h2 id="titulo-hospedagem" className={`${TITULO_DE_SECAO} mb-3`}>
          Hospedagem
        </h2>
        {seletor}
        <Cartao espacamento="nenhum">
          <EstadoVazio icone={<Hotel size={32} aria-hidden />} titulo={masterclass ? "Nenhuma Masterclass nos próximos dias." : "Nenhum evento nos próximos dias."}>
            Os quartos são montados por evento, com quem precisa de hotel: marcado na escala, com pedido de voo ou acrescentado aqui.
          </EstadoVazio>
        </Cartao>
      </section>
    );
  }

  const locais = dados.locais.map((local) => ({ valor: local.id, rotulo: `${local.nome} · ${local.cidade} (${local.uf})${local.tipo === "APARTAMENTO" ? " · apartamento" : ""}` }));
  const periodoSugerido = { checkIn: somarDias(evento.dataInicio, -1), checkOut: somarDias(evento.dataFim, 1) };
  const hoteis = dados.locais.filter((local) => local.tipo === "HOTEL").map((local) => ({ valor: local.id, rotulo: `${local.nome} · ${local.cidade} (${local.uf})` }));
  const cidadeDoEvento = evento.cidade && evento.uf ? { cidade: evento.cidade, uf: evento.uf } : null;
  const nomeDaHospedagem = (hospedagem: (typeof dados.hospedagens)[number]) => hospedagem.local?.nome ?? HOTEL_A_DEFINIR;
  const variosHoteis = dados.hospedagens.length > 1;
  // O destino diz quem já está no quarto: escolher o quarto é escolher com quem a pessoa divide.
  const quartos: OpcaoDeQuarto[] = dados.hospedagens.flatMap((hospedagem) =>
    hospedagem.quartos.map((quarto) => ({
      id: quarto.id,
      nome: `${quarto.nome}${variosHoteis ? ` · ${nomeDaHospedagem(hospedagem)}` : ""}`,
      resumo: [
        quantidadeDe(quarto.ocupantes.length, quarto.capacidade),
        rotuloDoSexoDoQuarto(quarto.sexo),
        quarto.ocupantes.length > 0 ? `com ${quarto.ocupantes.map((ocupante) => primeiroNome(ocupante.nome)).join(", ")}` : "vazio",
      ].join(" · "),
      capacidade: quarto.capacidade,
      sexo: quarto.sexo,
      ocupantes: quarto.ocupantes.map((ocupante) => ({ pessoaId: ocupante.pessoaId, sexo: ocupante.sexo })),
    })),
  );
  const quartoPorId = new Map(quartos.map((quarto) => [quarto.id, quarto]));
  const trocas: OpcaoDeTroca[] = dados.hospedagens.flatMap((hospedagem) =>
    hospedagem.quartos.flatMap((quarto) =>
      quarto.ocupantes.map((ocupante) => ({
        pessoaId: ocupante.pessoaId,
        quartoId: quarto.id,
        rotulo: `${ocupante.nome} (${quarto.nome}${variosHoteis ? ` · ${nomeDaHospedagem(hospedagem)}` : ""})`,
      })),
    ),
  );
  const totalDeQuartos = quartos.length;
  const camasLivres = quartos.reduce((total, quarto) => total + Math.max(quarto.capacidade - quarto.ocupantes.length, 0), 0);
  const comQuarto = dados.equipe.length - dados.semQuarto.length;
  const escalaHref = `/eventos/${evento.id}/escala`;
  const pessoaDaLista = new Map(dados.equipe.map((pessoa) => [pessoa.pessoaId, pessoa]));
  const nomeDoEvento = evento.codigo ?? evento.nome;
  const daEscala = dados.acrescentarDe === "ESCALA";

  // O time marcou que este evento não tem hospedagem (o "Sem hospedagem" da planilha): nada para montar, só o desfazer.
  if (evento.semHospedagem && dados.hospedagens.length === 0) {
    return (
      <section aria-labelledby="titulo-hospedagem" className="mb-8">
        <h2 id="titulo-hospedagem" className={`${TITULO_DE_SECAO} mb-3`}>
          Hospedagem
        </h2>
        {!escrita && comSeletorDeEvento && <FaixaSomenteLeitura />}
        {seletor}
        <Aviso
          tom="neutro"
          titulo={`${evento.codigo ?? evento.nome} está marcado como sem hospedagem`}
          acao={escrita && <BotaoSemHospedagem eventoId={evento.id} dispensar={false} rotulo="Desfazer" />}
        >
          <p>O time marcou que este evento não tem hospedagem: não há quartos a montar nem pedido à SDC. Dá para desfazer a qualquer momento.</p>
          {dados.equipe.length > 0 && (
            <p className="mt-1 text-[13px] text-[var(--ds-label-2)]">
              {dados.equipe.length === 1 ? "1 pessoa está" : `${dados.equipe.length} pessoas estão`} na lista de quem precisa de hotel neste evento.{" "}
              <Link href={escalaHref} className="font-medium text-[var(--ds-tint-text)] hover:underline">
                Abrir a escala
              </Link>
            </p>
          )}
        </Aviso>
      </section>
    );
  }

  return (
    <section aria-labelledby="titulo-hospedagem" className="mb-8">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
        <h2 id="titulo-hospedagem" className={TITULO_DE_SECAO}>
          Hospedagem
        </h2>
        {escrita && dados.hospedagens.length > 0 && (
          <BotaoDefinirHospedagem acao={criarHospedagemAcao} rotulo="Outra hospedagem" eventoId={evento.id} locais={locais} periodoSugerido={periodoSugerido} />
        )}
      </div>
      {!escrita && comSeletorDeEvento && <FaixaSomenteLeitura />}
      {seletor}

      {/* Os números do evento: de onde a tela parte e quanto falta. */}
      <dl aria-label={`Resumo da hospedagem de ${nomeDoEvento}`} className="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Numero rotulo="Precisam de hotel" valor={dados.equipe.length} />
        <Numero rotulo="Com quarto" valor={comQuarto} tom={dados.equipe.length > 0 && dados.semQuarto.length === 0 ? "sucesso" : "neutro"} />
        <Numero rotulo="Sem quarto" valor={dados.semQuarto.length} tom={dados.semQuarto.length > 0 ? "atencao" : "neutro"} />
        <Numero rotulo="Quartos" valor={totalDeQuartos} detalhe={totalDeQuartos > 0 ? camasLivresEmTexto(camasLivres) : undefined} />
      </dl>

      {/* O quadro: quem falta colocar à esquerda, os quartos à direita. No celular, um embaixo do outro. */}
      <div className="grid grid-cols-1 items-start gap-4 lg:grid-cols-[minmax(260px,320px)_minmax(0,1fr)]">
        <Cartao
          id="sem-quarto"
          titulo={`Sem quarto · ${dados.semQuarto.length}`}
          explicacao={`Quem precisa de hotel em ${nomeDoEvento} e ainda não está em nenhum quarto.`}
          acoes={
            escrita &&
            dados.sugestaoAloca > 0 && (
              <FormularioDeAcao acao={aplicarRoomingSugeridoAcao} aria-label="Distribuir por sexo quem está sem quarto">
                <input type="hidden" name="eventoId" value={evento.id} />
                <BotaoDeEnvio tamanho="pequeno" variante="secundario" icone={<Sparkles size={16} aria-hidden />}>
                  Distribuir por sexo ({dados.sugestaoAloca})
                </BotaoDeEnvio>
              </FormularioDeAcao>
            )
          }
        >
          {dados.semQuarto.length === 0 ? (
            <p className={`${BLOCO} px-3 py-3 text-[13px] ${dados.equipe.length > 0 ? "border-transparent bg-[var(--ds-green-soft)]" : "bg-[var(--ds-surface-1)] text-[var(--ds-label-2)]"}`}>
              {dados.equipe.length > 0
                ? "Todo mundo tem quarto. Nos blocos dos quartos dá para ver quem divide com quem."
                : "Ninguém na lista de hotel ainda. Entra quem está com Hotel marcado na escala, quem tem pedido de voo com hotel ou quem for acrescentado aqui."}
            </p>
          ) : (
            <ul className="flex flex-col gap-2">
              {dados.semQuarto.map((pessoa) => (
                <li key={pessoa.pessoaId} className={`${BLOCO} bg-[var(--ds-surface-1)] p-3`}>
                  <div className="flex flex-wrap items-start justify-between gap-x-2 gap-y-1">
                    <span className="min-w-0 text-[14px] font-medium">{pessoa.nome}</span>
                    <EtiquetaDoSexo sexo={pessoa.sexo} />
                  </div>
                  <p className="mt-0.5 text-[12px] text-[var(--ds-label-2)]">
                    {[pessoa.funcao, textoDasOrigens(pessoa.origens), pessoa.naEscala ? null : "fora da escala"].filter(Boolean).join(" · ")}
                  </p>
                  {escrita && (totalDeQuartos > 0 || pessoa.origens.includes("AVULSA")) && (
                    <div className="mt-2 flex flex-wrap items-center gap-2">
                      <ColocarNoQuarto pessoa={pessoa} quartos={quartos} />
                      {pessoa.origens.includes("AVULSA") && <TirarDaLista eventoId={evento.id} pessoaId={pessoa.pessoaId} nome={pessoa.nome} />}
                    </div>
                  )}
                </li>
              ))}
            </ul>
          )}

          {/* Falta alguém? Em evento com escala, só entram nomes da escala. */}
          <div className="mt-4 border-t border-[var(--ds-separator)] pt-3">
            <p className="text-[13px] font-semibold">Falta alguém?</p>
            <p className="mt-0.5 text-[12px] text-[var(--ds-label-2)]">
              {!daEscala
                ? masterclass
                  ? "Palestra não tem escala: escolha no cadastro de staff quem vai dormir no hotel."
                  : "Este evento ainda não tem ninguém na escala: escolha no cadastro de staff. Com a escala montada, só aparecem os nomes dela."
                : dados.naEscalaSemHotel === 0
                  ? "Toda a escala já está na lista de hotel. Para incluir outra pessoa, coloque-a antes na escala."
                  : `${dados.naEscalaSemHotel === 1 ? "1 pessoa da escala ainda não está" : `${dados.naEscalaSemHotel} pessoas da escala ainda não estão`} na lista de hotel. Só aparecem nomes da escala.`}
            </p>
            {escrita && dados.podeAcrescentar && <AcrescentarPessoa eventoId={evento.id} pessoas={dados.paraAcrescentar} daEscala={daEscala} />}
            <Link href={escalaHref} className="mt-2 inline-flex text-[13px] font-medium text-[var(--ds-tint-text)] hover:underline">
              Abrir a escala
            </Link>
          </div>
        </Cartao>

        <div className="min-w-0">
          {dados.hospedagens.length === 0 && (
            <Cartao id="quartos" espacamento="nenhum" className="border border-dashed border-[var(--ds-separator-strong)] shadow-none">
              <EstadoVazio
                icone={<BedDouble size={32} aria-hidden />}
                titulo="Nenhum quarto montado para este evento."
                acao={
                  escrita && (
                    <div className="flex flex-wrap items-center justify-center gap-2">
                      <BotaoDefinirHospedagem acao={criarHospedagemAcao} rotulo="Montar quartos" eventoId={evento.id} locais={locais} periodoSugerido={periodoSugerido} primario />
                      <BotaoSemHospedagem eventoId={evento.id} dispensar rotulo="Este evento não tem hospedagem" />
                    </div>
                  )
                }
              >
                Os quartos aparecem aqui, um bloco por quarto e uma casa por cama. Comece pelas datas de entrada e saída, crie os quartos e coloque cada pessoa. Com tudo montado, peça a hospedagem à SDC, que escolhe e
                reserva o hotel. Evento de casa, sem hotel? Marque que ele não tem hospedagem.
              </EstadoVazio>
            </Cartao>
          )}

          {dados.hospedagens.map((hospedagem) => {
            const ehApartamento = hospedagem.local?.tipo === "APARTAMENTO";
            const pessoasNosQuartos = hospedagem.quartos.reduce((total, quarto) => total + quarto.ocupantes.length, 0);
            const camasDaHospedagem = hospedagem.quartos.reduce((total, quarto) => total + quarto.capacidade, 0);
            const pedido = hospedagem.pedido;
            const aguardando = pedido !== null && (pedido.situacao === "PEDIDO" || pedido.situacao === "ALTERADO");
            return (
              <Cartao
                key={hospedagem.id}
                id={`hospedagem-${hospedagem.id}`}
                titulo={nomeDaHospedagem(hospedagem)}
                explicacao={
                  hospedagem.local
                    ? [ehApartamento ? "Apartamento da IAM (sem SDC)" : "Hotel", hospedagem.local.endereco, `${hospedagem.local.cidade} (${hospedagem.local.uf})`].filter(Boolean).join(" · ")
                    : "Quem escolhe e reserva o hotel é a SDC. Monte os quartos, peça a hospedagem e registre o hotel quando ela responder."
                }
                className="mb-4"
                acoes={
                  <>
                    <BotaoCopiar tamanho="pequeno" texto={hospedagem.textoDoRooming} rotulo="Copiar rooming list" mensagem="Rooming list copiada." />
                    {hospedagem.textoParaSdc && pedido && (
                      <BotaoCopiar tamanho="pequeno" texto={hospedagem.textoParaSdc} rotulo="Copiar pedido" mensagem={`Pedido ${pedido.referencia} copiado. Cole no canal da SDC.`} />
                    )}
                    {escrita && (
                      <BotaoDefinirHospedagem
                        acao={alterarHospedagemAcao}
                        rotulo="Editar"
                        eventoId={evento.id}
                        locais={locais}
                        periodoSugerido={periodoSugerido}
                        hospedagem={{
                          id: hospedagem.id,
                          localId: hospedagem.local?.id ?? null,
                          checkIn: hospedagem.checkIn,
                          checkOut: hospedagem.checkOut,
                          observacao: hospedagem.observacao,
                          atualizadoEm: hospedagem.atualizadoEm,
                        }}
                      />
                    )}
                    {escrita && hospedagem.quartos.length === 0 && !pedido && (
                      <FormularioDeAcao acao={removerHospedagemAcao} aria-label="Remover esta hospedagem">
                        <input type="hidden" name="hospedagemId" value={hospedagem.id} />
                        <BotaoDeEnvio tamanho="pequeno" variante="perigo">
                          Remover
                        </BotaoDeEnvio>
                      </FormularioDeAcao>
                    )}
                  </>
                }
              >
                <p className="mb-3 flex flex-wrap gap-x-4 gap-y-1 text-[13px]">
                  <span>
                    <span className="text-[var(--ds-label-2)]">Entrada</span> {dataCurta(hospedagem.checkIn)} <span className="text-[var(--ds-label-2)]">· saída</span> {dataCurta(hospedagem.checkOut)}
                  </span>
                  <span className="tabular-nums">
                    {hospedagem.quartos.length === 0
                      ? "Nenhum quarto ainda: crie o primeiro no bloco abaixo."
                      : `${quartosEmTexto(hospedagem.quartos.length)} · ${quantidadeDe(pessoasNosQuartos, camasDaHospedagem)} camas ocupadas`}
                  </span>
                </p>

                {/* Um bloco por quarto, uma casa por cama. Cabem tantos por linha quanto a largura deixar. */}
                <ul className="grid grid-cols-[repeat(auto-fill,minmax(min(100%,240px),1fr))] gap-3">
                  {hospedagem.quartos.map((quarto) => {
                    const destino = quartoPorId.get(quarto.id)!;
                    const livres = Math.max(quarto.capacidade - quarto.ocupantes.length, 0);
                    const cheio = livres === 0;
                    const idDoTitulo = `quarto-${quarto.id}-titulo`;
                    return (
                      <li key={quarto.id}>
                        <section
                          id={`quarto-${quarto.id}`}
                          aria-labelledby={idDoTitulo}
                          className={`${BLOCO} flex h-full flex-col border-t-[3px] bg-[var(--ds-surface-1)]`}
                          style={{ borderTopColor: corDoSexo(quarto.sexo) }}
                        >
                          <div className="flex items-start justify-between gap-2 px-3 pt-2.5">
                            <div className="min-w-0">
                              <h4 id={idDoTitulo} className="text-[14px] font-semibold">
                                {quarto.nome}
                              </h4>
                              <p className="text-[12px] text-[var(--ds-label-2)]">
                                {[maiuscula(rotuloDaCapacidade(quarto.capacidade)), rotuloDoSexoDoQuarto(quarto.sexo), quarto.valorDiariaCentavos !== null ? `diária ${dinheiro(quarto.valorDiariaCentavos)}` : null]
                                  .filter(Boolean)
                                  .join(" · ")}
                              </p>
                            </div>
                            <span
                              className={`shrink-0 rounded-full px-2 py-0.5 text-[12px] font-semibold tabular-nums ${
                                cheio ? "bg-[var(--ds-green-soft)] text-[var(--ds-green-deep)]" : "bg-[var(--ds-fill-4)] text-[var(--ds-label-2)]"
                              }`}
                            >
                              {quantidadeDe(quarto.ocupantes.length, quarto.capacidade)}
                              <span className="sr-only">{cheio ? " camas, quarto cheio" : " camas ocupadas"}</span>
                            </span>
                          </div>

                          {hospedagem.quartosComSexosMisturados.includes(quarto.id) && (
                            <Aviso tom="atencao" className="mx-3 mt-2 text-[13px]">
                              Quarto com pessoas de sexos diferentes.
                            </Aviso>
                          )}

                          <ul aria-label={`Camas do ${quarto.nome}`} className="flex flex-1 flex-col gap-2 p-3">
                            {quarto.ocupantes.map((ocupante) => (
                              <li key={ocupante.pessoaId} className={`${BLOCO} bg-[var(--ds-surface)] p-2.5`}>
                                <div className="flex flex-wrap items-start justify-between gap-x-2 gap-y-1">
                                  <span className="min-w-0 text-[14px] font-medium">{ocupante.nome}</span>
                                  {/* Num quarto de um sexo só, a etiqueta repetiria o quarto: só aparece no misto ou quando falta o dado. */}
                                  {(quarto.sexo === null || ocupante.sexo === null) && <EtiquetaDoSexo sexo={ocupante.sexo} />}
                                </div>
                                <p className="mt-0.5 text-[12px] text-[var(--ds-label-2)]">
                                  {[pessoaDaLista.get(ocupante.pessoaId)?.funcao, textoDasOrigens(pessoaDaLista.get(ocupante.pessoaId)?.origens ?? [])].filter(Boolean).join(" · ")}
                                </p>
                                {ocupante.checkIn && ocupante.checkOut && (
                                  <p className="text-[12px] text-[var(--ds-label-2)]">
                                    {textoDoPeriodo({ checkIn: ocupante.checkIn, checkOut: ocupante.checkOut })} · {diarias(diasEntre(ocupante.checkIn, ocupante.checkOut))}
                                  </p>
                                )}
                                {escrita && (
                                  <div className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1">
                                    <MoverDeQuarto pessoaId={ocupante.pessoaId} nome={ocupante.nome} quartoAtual={quarto.id} quartos={quartos} trocas={trocas} />
                                    <BotaoPeriodoDoOcupante
                                      acao={definirPeriodoDoOcupanteAcao}
                                      quartoId={quarto.id}
                                      pessoaId={ocupante.pessoaId}
                                      nome={ocupante.nome}
                                      hospedagem={{ checkIn: hospedagem.checkIn, checkOut: hospedagem.checkOut }}
                                      proprio={ocupante.checkIn && ocupante.checkOut ? { checkIn: ocupante.checkIn, checkOut: ocupante.checkOut } : null}
                                    />
                                    <FormularioDeAcao acao={tirarDoQuartoAcao} aria-label={`Tirar ${ocupante.nome} do quarto`}>
                                      <input type="hidden" name="quartoId" value={quarto.id} />
                                      <input type="hidden" name="pessoaId" value={ocupante.pessoaId} />
                                      <BotaoDeEnvio tamanho="pequeno" variante="texto" aria-label={`Tirar ${ocupante.nome} do ${quarto.nome}`}>
                                        Tirar
                                      </BotaoDeEnvio>
                                    </FormularioDeAcao>
                                  </div>
                                )}
                              </li>
                            ))}
                            {Array.from({ length: livres }, (_, cama) => (
                              <li key={`livre-${cama}`} className="rounded-[var(--ds-radius-md)] border border-dashed border-[var(--ds-separator-strong)] p-2.5">
                                <p className="text-[12px] font-medium text-[var(--ds-label-2)]">Cama livre</p>
                                {escrita && dados.semQuarto.length > 0 && (
                                  <div className="mt-1.5">
                                    <ColocarNaCama quarto={destino} cama={cama} semQuarto={dados.semQuarto} />
                                  </div>
                                )}
                              </li>
                            ))}
                          </ul>

                          {escrita && quarto.ocupantes.length === 0 && (
                            <div className="flex justify-end border-t border-[var(--ds-separator)] px-3 py-2">
                              <FormularioDeAcao acao={removerQuartoAcao} aria-label={`Remover ${quarto.nome}`}>
                                <input type="hidden" name="quartoId" value={quarto.id} />
                                <BotaoDeEnvio tamanho="pequeno" variante="texto" className="text-[var(--ds-red-deep)]" aria-label={`Remover ${quarto.nome}`}>
                                  Remover quarto
                                </BotaoDeEnvio>
                              </FormularioDeAcao>
                            </div>
                          )}
                        </section>
                      </li>
                    );
                  })}
                  {escrita && (
                    <li>
                      <FormularioNovoQuarto acao={adicionarQuartoAcao} hospedagemId={hospedagem.id} proximoNome={`Quarto ${hospedagem.quartos.length + 1}`} />
                    </li>
                  )}
                </ul>

                {/* O pedido à SDC vem depois dos quartos: é com eles montados que se pede. */}
                <dl className="mt-4 grid grid-cols-[130px_1fr] gap-x-3 gap-y-1 border-t border-[var(--ds-separator)] pt-4 text-[14px] empty:hidden">
                {!ehApartamento && (
                  <>
                    <dt className="text-[var(--ds-label-2)]">Pedido à SDC</dt>
                    <dd className="flex flex-wrap items-center gap-2">
                      {pedido ? (
                        <>
                          <span className="[font-family:var(--ds-font-mono)] text-[13px]">{pedido.referencia}</span>
                          <ChipDoVoo situacao={pedido.situacao} />
                          <span className="text-[12px] tabular-nums text-[var(--ds-label-2)]">
                            pedido em {dataCurta(pedido.dataSolicitacao)}
                            {pedido.situacao === "EMITIDO" && pedido.dataCompra ? ` · reservado em ${dataCurta(pedido.dataCompra)}` : ""}
                          </span>
                          {escrita && aguardando && (
                            <BotaoRegistrarReserva
                              acao={registrarRetornoDeHospedagemAcao}
                              pedidoId={pedido.id}
                              referencia={pedido.referencia}
                              hoteis={hoteis}
                              cidadeDoEvento={cidadeDoEvento}
                              inicial={{
                                localId: hospedagem.local?.id ?? null,
                                numeroReserva: hospedagem.numeroReserva,
                                valor: paraCampoDeDinheiro(pedido.valorCentavos),
                                formaPagamento: pedido.formaPagamento,
                                dataCompra: pedido.situacao === "EMITIDO" && pedido.dataCompra ? pedido.dataCompra : dados.hoje,
                                dataSolicitacao: pedido.dataSolicitacao,
                                hoje: dados.hoje,
                              }}
                            />
                          )}
                          {escrita && (
                            <BotaoCancelarPedido
                              acao={cancelarPedidoAcao}
                              pedidoId={pedido.id}
                              referencia={pedido.referencia}
                              tamanho="pequeno"
                              descricao="Avise a SDC pelo canal de sempre. Os quartos continuam montados e dá para pedir de novo."
                            />
                          )}
                        </>
                      ) : !escrita ? (
                        "Ainda não pedida"
                      ) : hospedagem.quartos.length === 0 ? (
                        <span className="text-[var(--ds-label-2)]">Monte os quartos para pedir a hospedagem à SDC.</span>
                      ) : (
                        <FormularioDeAcao acao={registrarPedidoDeHospedagemAcao} className="flex flex-wrap items-center gap-2" aria-label="Pedir hospedagem à SDC">
                          <input type="hidden" name="hospedagemId" value={hospedagem.id} />
                          {/* Data real do pedido: hoje, ou o dia em que ele foi feito (pedido antigo, da planilha). */}
                          <label className="flex items-center gap-1 text-[12px] text-[var(--ds-label-2)]">
                            Pedido em
                            <input type="date" name="dataSolicitacao" defaultValue={dados.hoje} max={dados.hoje} className={`${CAMPO} h-8 w-auto px-2 text-[13px]`} />
                          </label>
                          <BotaoDeEnvio tamanho="pequeno" variante="primario">
                            Pedir hospedagem à SDC
                          </BotaoDeEnvio>
                        </FormularioDeAcao>
                      )}
                    </dd>
                  </>
                )}
                {pedido && situacaoDoPagamento(pedido) !== "SEM_COMPRA" && situacaoDoPagamento(pedido) !== "CANCELADO" && (
                  <>
                    <dt className="text-[var(--ds-label-2)]">Pagamento</dt>
                    <dd className="flex flex-wrap items-center gap-2">
                      <ChipDoPagamento pedido={pedido} />
                      {escrita && situacaoDoPagamento(pedido) === "A_APROVAR" && (
                        <BotaoAprovarPagamento acao={aprovarPagamentoAcao} pedidoId={pedido.id} referencia={pedido.referencia} valor={dinheiro(pedido.valorCentavos ?? 0)} valorCentavos={pedido.valorCentavos ?? 0} atualizadoEm={pedido.atualizadoEm} />
                      )}
                      {escrita && situacaoDoPagamento(pedido) === "APROVADO" && <BotaoDesfazerAprovacao acao={desfazerAprovacaoAcao} pedidoId={pedido.id} referencia={pedido.referencia} />}
                    </dd>
                  </>
                )}
                {hospedagem.numeroReserva && (
                  <>
                    <dt className="text-[var(--ds-label-2)]">Reserva</dt>
                    <dd>{hospedagem.numeroReserva}</dd>
                  </>
                )}
                {pedido && pedido.valorCentavos !== null && (
                  <>
                    <dt className="text-[var(--ds-label-2)]">Valor total</dt>
                    <dd className="tabular-nums">
                      {dinheiro(pedido.valorCentavos)}
                      {pedido.formaPagamento ? ` · ${pedido.formaPagamento}` : ""}
                    </dd>
                  </>
                )}
                {pedido?.observacaoSdc && (
                  <>
                    <dt className="text-[var(--ds-label-2)]">Resposta da SDC</dt>
                    <dd>{pedido.observacaoSdc}</dd>
                  </>
                )}
                {hospedagem.observacao && (
                  <>
                    <dt className="text-[var(--ds-label-2)]">Observação</dt>
                    <dd>{hospedagem.observacao}</dd>
                  </>
                )}
                </dl>
              </Cartao>
            );
          })}
        </div>
      </div>
    </section>
  );
}
