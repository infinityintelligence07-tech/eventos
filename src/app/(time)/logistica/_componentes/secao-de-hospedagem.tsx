import { Hotel, Sparkles } from "lucide-react";
import Link from "next/link";

import type { HospedagemDoEventoCarregada } from "@/fluxos/logistica";
import { destinoDaTroca, destinoNoQuarto, diasEntre, type OrigemDoHotel, rotuloDaCapacidade, rotuloDaOrigemDoHotel, rotuloDoSexoDoQuarto, situacaoDoPagamento, somarDias, textoDoPeriodo } from "@/modules/logistica";
import { BotaoCopiar, FormularioDeAcao } from "@/app/(time)/_componentes/ui";

import { Aviso, FaixaSomenteLeitura } from "../../_componentes/ui/aviso";
import { BarraDeFiltros, SeletorDeFiltro } from "../../_componentes/ui/barra-de-filtros";
import { BotaoDeEnvio } from "../../_componentes/ui/botao";
import { Cartao } from "../../_componentes/ui/cartao";
import { CAMPO, TITULO_DE_SECAO } from "../../_componentes/ui/classes";
import { EstadoVazio } from "../../_componentes/ui/estados";
import { dataCurta, dinheiro, periodo, quantidadeDe } from "../../_componentes/ui/formatos";
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
import { BotaoAprovarPagamento, BotaoCancelarPedido, BotaoDesfazerAprovacao } from "./formularios-de-voo";
import { ChipDoPagamento } from "./pagamento";
import { ChipDoVoo, paraCampoDeDinheiro } from "./situacoes";

// Hospedagem do evento: nós montamos os quartos (quem divide com quem), a SDC escolhe e reserva o hotel. A tela começa
// pelos quartos; com eles montados o time pede a hospedagem à SDC e, no retorno, registra o hotel, a reserva e o valor.
// Quem precisa de hotel não depende da escala (o hotel é pedido junto com o voo, antes dela): a lista é a união de quem
// está marcado na escala, de quem tem pedido de voo com "também precisa de hotel" e de quem foi acrescentado aqui.
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

type OpcaoDeQuarto = { id: string; rotulo: string; cheio: boolean };
/** Quem já está num quarto e pode trocar de lugar com outra pessoa. */
type OpcaoDeTroca = { pessoaId: string; quartoId: string; rotulo: string };

const diarias = (noites: number) => (noites === 1 ? "1 diária" : `${noites} diárias`);
const primeiroNome = (nome: string) => nome.trim().split(/\s+/)[0] ?? nome;
const pessoas = (quantidade: number) => (quantidade === 1 ? "1 pessoa" : `${quantidade} pessoas`);

/** "da escala · do pedido de voo": de onde veio a necessidade de hotel da pessoa. */
const textoDasOrigens = (origens: OrigemDoHotel[]) => (origens.length === 0 ? "sem origem: confira" : origens.map(rotuloDaOrigemDoHotel).join(" · "));

/** Acrescenta à lista de quem precisa de hotel alguém do cadastro de staff, sem passar pela escala nem pelo voo. */
function AcrescentarPessoa({ eventoId, staff }: { eventoId: string; staff: { pessoaId: string; nome: string }[] }) {
  if (staff.length === 0) return null;
  return (
    <FormularioDeAcao acao={acrescentarHospedeAcao} className="flex flex-wrap items-center gap-2" aria-label="Acrescentar pessoa à lista de quem precisa de hotel">
      <input type="hidden" name="eventoId" value={eventoId} />
      <label htmlFor="acrescentar-hospede" className="text-[13px] font-medium">
        Acrescentar pessoa
      </label>
      <select id="acrescentar-hospede" name="pessoaId" required defaultValue="" className={`${CAMPO} h-9 w-auto max-w-[280px] pl-2 pr-7 text-[14px]`}>
        <option value="" disabled>
          Escolha pelo nome…
        </option>
        {staff.map((pessoa) => (
          <option key={pessoa.pessoaId} value={pessoa.pessoaId}>
            {pessoa.nome}
          </option>
        ))}
      </select>
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

const CLASSE_DO_SELETOR = `${CAMPO} h-8 w-auto max-w-[220px] pl-2 pr-7 text-[13px]`;

/** "Colocar no quarto…" de quem está sem quarto (alternativa a arrastar, WCAG 2.5.7). */
function ColocarNoQuarto({ pessoaId, nome, quartos }: { pessoaId: string; nome: string; quartos: OpcaoDeQuarto[] }) {
  if (quartos.length === 0) return null;
  const id = `colocar-${pessoaId}`;
  const descricao = `Colocar ${nome} num quarto`;
  return (
    <FormularioDeAcao acao={porNoQuartoAcao} className="flex items-center gap-1" aria-label={descricao}>
      <input type="hidden" name="pessoaId" value={pessoaId} />
      <label htmlFor={id} className="sr-only">
        {descricao}
      </label>
      <select id={id} name="quartoId" required defaultValue="" className={CLASSE_DO_SELETOR}>
        <option value="" disabled>
          Colocar no quarto…
        </option>
        {quartos.map((quarto) => (
          <option key={quarto.id} value={quarto.id} disabled={quarto.cheio}>
            {quarto.rotulo}
            {quarto.cheio ? " (cheio)" : ""}
          </option>
        ))}
      </select>
      <BotaoDeEnvio tamanho="pequeno" variante="secundario">
        Colocar
      </BotaoDeEnvio>
    </FormularioDeAcao>
  );
}

/**
 * "Mover para…" de quem já está num quarto, em um passo: outro quarto com vaga ou trocar de lugar com alguém de outro
 * quarto (a troca funciona mesmo com os dois quartos cheios).
 */
function MoverDeQuarto({ pessoaId, nome, quartoAtual, quartos, trocas }: { pessoaId: string; nome: string; quartoAtual: string; quartos: OpcaoDeQuarto[]; trocas: OpcaoDeTroca[] }) {
  const destinos = quartos.filter((quarto) => quarto.id !== quartoAtual);
  const comQuem = trocas.filter((troca) => troca.quartoId !== quartoAtual);
  if (destinos.length === 0) return null;
  const id = `mover-${pessoaId}`;
  const descricao = `Mover ${nome} para outro quarto ou trocar de lugar com alguém`;
  return (
    <FormularioDeAcao acao={moverDeQuartoAcao} className="flex items-center gap-1" aria-label={descricao}>
      <input type="hidden" name="quartoId" value={quartoAtual} />
      <input type="hidden" name="pessoaId" value={pessoaId} />
      <label htmlFor={id} className="sr-only">
        {descricao}
      </label>
      <select id={id} name="destino" required defaultValue="" className={CLASSE_DO_SELETOR}>
        <option value="" disabled>
          Mover para…
        </option>
        <optgroup label="Outro quarto">
          {destinos.map((quarto) => (
            <option key={quarto.id} value={destinoNoQuarto(quarto.id)} disabled={quarto.cheio}>
              {quarto.rotulo}
              {quarto.cheio ? " (cheio)" : ""}
            </option>
          ))}
        </optgroup>
        {comQuem.length > 0 && (
          <optgroup label="Trocar de lugar com">
            {comQuem.map((troca) => (
              <option key={troca.pessoaId} value={destinoDaTroca(troca.quartoId, troca.pessoaId)}>
                {troca.rotulo}
              </option>
            ))}
          </optgroup>
        )}
      </select>
      <BotaoDeEnvio tamanho="pequeno" variante="secundario">
        Mover
      </BotaoDeEnvio>
    </FormularioDeAcao>
  );
}

export function SecaoDeHospedagem({ dados, escrita, comSeletorDeEvento }: { dados: HospedagemDoEventoCarregada; escrita: boolean; comSeletorDeEvento: boolean }) {
  const { evento } = dados;
  const seletor = comSeletorDeEvento && (
    <BarraDeFiltros>
      <SeletorDeFiltro
        nome="evento"
        rotulo="Evento"
        todos="Próximo evento"
        valor={evento?.id ?? null}
        opcoes={dados.eventos.map((item) => ({ valor: item.id, rotulo: `${item.codigo ?? item.nome} · ${dataCurta(item.dataInicio)}${item.semHospedagem ? " · sem hospedagem" : ""}` }))}
      />
    </BarraDeFiltros>
  );

  if (!evento) {
    return (
      <section aria-labelledby="titulo-hospedagem" className="mb-8">
        <h2 id="titulo-hospedagem" className={`${TITULO_DE_SECAO} mb-3`}>
          Hospedagem
        </h2>
        <Cartao espacamento="nenhum">
          <EstadoVazio icone={<Hotel size={32} aria-hidden />} titulo="Nenhum evento nos próximos dias.">
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
  // A opção do quarto diz quem já está nele: escolher o quarto é escolher com quem a pessoa divide.
  const quartos: OpcaoDeQuarto[] = dados.hospedagens.flatMap((hospedagem) =>
    hospedagem.quartos.map((quarto) => ({
      id: quarto.id,
      rotulo: [
        `${quarto.nome}${variosHoteis ? ` · ${nomeDaHospedagem(hospedagem)}` : ""}`,
        quantidadeDe(quarto.ocupantes.length, quarto.capacidade),
        rotuloDoSexoDoQuarto(quarto.sexo),
        quarto.ocupantes.length > 0 ? `com ${quarto.ocupantes.map((ocupante) => primeiroNome(ocupante.nome)).join(", ")}` : "vazio",
      ].join(" · "),
      cheio: quarto.ocupantes.length >= quarto.capacidade,
    })),
  );
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
  const comQuarto = dados.equipe.length - dados.semQuarto.length;
  const escalaHref = `/eventos/${evento.id}/escala`;
  const origensDe = new Map(dados.equipe.map((pessoa) => [pessoa.pessoaId, pessoa.origens]));
  const acrescentar = escrita && dados.podeAcrescentar ? <AcrescentarPessoa eventoId={evento.id} staff={dados.staffParaAcrescentar} /> : null;

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

      {/* De onde a tela parte: quem precisa de hotel (escala, pedido de voo ou acrescentado aqui), e quantos já têm quarto. */}
      <Aviso
        tom={dados.equipe.length === 0 ? "informacao" : dados.semQuarto.length > 0 ? "atencao" : "sucesso"}
        className="mb-4"
        titulo={
          dados.equipe.length === 0
            ? `Ninguém na lista de hotel de ${evento.codigo ?? evento.nome}`
            : `${dados.equipe.length === 1 ? "1 pessoa precisa" : `${dados.equipe.length} pessoas precisam`} de hotel em ${evento.codigo ?? evento.nome}`
        }
        acao={
          <Link href={escalaHref} className="font-medium text-[var(--ds-tint-text)] hover:underline">
            Abrir a escala
          </Link>
        }
      >
        <p>
          {dados.equipe.length === 0
            ? "Entra em quarto quem precisa de hotel neste evento. A lista não depende da escala: acrescente a pessoa aqui, marque \"Também precisa de hotel\" no pedido de voo ou marque Hotel na escala."
            : dados.semQuarto.length === 0
              ? "Todo mundo tem quarto. Em cada quarto abaixo dá para ver quem divide com quem."
              : `${comQuarto} com quarto e ${dados.semQuarto.length} sem quarto. Coloque cada pessoa num quarto para definir quem divide com quem.`}
        </p>
        {dados.naEscalaSemHotel > 0 && (
          <p className="mt-1 text-[13px] text-[var(--ds-label-2)]">
            {dados.naEscalaSemHotel === 1 ? "1 pessoa da escala não está" : `${dados.naEscalaSemHotel} pessoas da escala não estão`} na lista de hotel. Se falta alguém, marque Hotel na escala ou acrescente aqui.
          </p>
        )}
        {acrescentar && <div className="mt-3">{acrescentar}</div>}
      </Aviso>

      {dados.semQuarto.length > 0 && (
        <Cartao
          id="sem-quarto"
          titulo={`Sem quarto · ${dados.semQuarto.length}`}
          explicacao={`Quem precisa de hotel em ${evento.codigo ?? evento.nome} (${periodo(evento.dataInicio, evento.dataFim)}) e ainda não tem quarto. Ao lado do nome, de onde veio: da escala, do pedido de voo ou acrescentada aqui.`}
          className="mb-4"
          acoes={
            escrita &&
            dados.sugestaoAloca > 0 && (
              <FormularioDeAcao acao={aplicarRoomingSugeridoAcao} aria-label="Sugerir rooming por sexo">
                <input type="hidden" name="eventoId" value={evento.id} />
                <BotaoDeEnvio tamanho="pequeno" variante="secundario" icone={<Sparkles size={16} aria-hidden />}>
                  Distribuir por sexo ({dados.sugestaoAloca})
                </BotaoDeEnvio>
              </FormularioDeAcao>
            )
          }
        >
          {totalDeQuartos === 0 && (
            <p className="mb-3 text-[13px] text-[var(--ds-label-2)]">
              {dados.hospedagens.length === 0 ? "Clique em \"Montar quartos\" logo abaixo para começar a distribuir." : "Crie os quartos logo abaixo para começar a distribuir."}
            </p>
          )}
          <ul className="flex flex-col gap-2 text-[14px]">
            {dados.semQuarto.map((pessoa) => (
              <li key={pessoa.pessoaId} className="flex flex-wrap items-center justify-between gap-2">
                <span>
                  {pessoa.nome}
                  <span className="ml-1 text-[12px] text-[var(--ds-label-2)]">
                    {[pessoa.funcao, pessoa.sexo === "F" ? "feminino" : pessoa.sexo === "M" ? "masculino" : "sem sexo no cadastro"].filter(Boolean).join(" · ")}
                  </span>
                  <span className="block text-[12px] text-[var(--ds-label-2)]">
                    {textoDasOrigens(pessoa.origens)}
                    {!pessoa.naEscala && " · fora da escala"}
                  </span>
                </span>
                {escrita && (
                  <span className="flex flex-wrap items-center gap-1">
                    <ColocarNoQuarto pessoaId={pessoa.pessoaId} nome={pessoa.nome} quartos={quartos} />
                    {pessoa.origens.includes("AVULSA") && <TirarDaLista eventoId={evento.id} pessoaId={pessoa.pessoaId} nome={pessoa.nome} />}
                  </span>
                )}
              </li>
            ))}
          </ul>
        </Cartao>
      )}

      {dados.hospedagens.length === 0 && (
        <Cartao espacamento="nenhum" className="mb-4">
          <EstadoVazio
            icone={<Hotel size={32} aria-hidden />}
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
            Comece pelos quartos: as datas de entrada e saída e quem divide com quem. Com eles montados, peça a hospedagem à SDC, que escolhe e reserva o hotel. Evento de casa, sem hotel? Marque que ele não tem hospedagem.
          </EstadoVazio>
        </Cartao>
      )}

      {dados.hospedagens.map((hospedagem) => {
        const ehApartamento = hospedagem.local?.tipo === "APARTAMENTO";
        const pessoasNosQuartos = hospedagem.quartos.reduce((total, quarto) => total + quarto.ocupantes.length, 0);
        const pedido = hospedagem.pedido;
        const aguardando = pedido !== null && (pedido.situacao === "PEDIDO" || pedido.situacao === "ALTERADO");
        return (
          <div key={hospedagem.id} className="mb-6">
            <Cartao
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
              <dl className="grid grid-cols-[130px_1fr] gap-x-3 gap-y-1 text-[14px]">
                <dt className="text-[var(--ds-label-2)]">Período</dt>
                <dd>
                  Entrada {dataCurta(hospedagem.checkIn)} · saída {dataCurta(hospedagem.checkOut)}
                </dd>
                <dt className="text-[var(--ds-label-2)]">Quartos</dt>
                <dd>
                  {hospedagem.quartos.length === 0
                    ? "Nenhum quarto ainda. Crie o primeiro logo abaixo."
                    : `${hospedagem.quartos.length === 1 ? "1 quarto" : `${hospedagem.quartos.length} quartos`} · ${pessoas(pessoasNosQuartos)}`}
                </dd>
                {!ehApartamento && (
                  <>
                    <dt className="text-[var(--ds-label-2)]">Pedido à SDC</dt>
                    <dd className="flex flex-wrap items-center gap-2">
                      {pedido ? (
                        <>
                          <span className="[font-family:var(--ds-font-mono)] text-[13px]">{pedido.referencia}</span>
                          <ChipDoVoo situacao={pedido.situacao} />
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
                        <FormularioDeAcao acao={registrarPedidoDeHospedagemAcao} aria-label="Pedir hospedagem à SDC">
                          <input type="hidden" name="hospedagemId" value={hospedagem.id} />
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

            <ul className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
              {hospedagem.quartos.map((quarto) => (
                <li key={quarto.id}>
                  <Cartao
                    id={`quarto-${quarto.id}`}
                    titulo={`${quarto.nome} · ${rotuloDaCapacidade(quarto.capacidade)} · ${quantidadeDe(quarto.ocupantes.length, quarto.capacidade)}`}
                    explicacao={[
                      rotuloDoSexoDoQuarto(quarto.sexo),
                      quarto.valorDiariaCentavos !== null ? `diária ${dinheiro(quarto.valorDiariaCentavos)}` : null,
                      quarto.ocupantes.length > 1 ? `${pessoas(quarto.ocupantes.length)} dividem o quarto` : null,
                    ]
                      .filter(Boolean)
                      .join(" · ")}
                    acoes={
                      escrita &&
                      quarto.ocupantes.length === 0 && (
                        <FormularioDeAcao acao={removerQuartoAcao} aria-label={`Remover ${quarto.nome}`}>
                          <input type="hidden" name="quartoId" value={quarto.id} />
                          <BotaoDeEnvio tamanho="pequeno" variante="perigo">
                            Remover
                          </BotaoDeEnvio>
                        </FormularioDeAcao>
                      )
                    }
                  >
                    {hospedagem.quartosComSexosMisturados.includes(quarto.id) && (
                      <Aviso tom="atencao" className="mb-3">
                        Quarto com pessoas de sexos diferentes.
                      </Aviso>
                    )}
                    {quarto.ocupantes.length === 0 ? (
                      <p className="text-[13px] text-[var(--ds-label-2)]">Quarto vazio. Coloque alguém pela lista &quot;Sem quarto&quot;, no topo.</p>
                    ) : (
                      <ul className="flex flex-col gap-2 text-[14px]">
                        {quarto.ocupantes.map((ocupante) => (
                          <li key={ocupante.pessoaId} className="flex flex-wrap items-center justify-between gap-2">
                            <span>
                              {ocupante.nome}
                              {ocupante.sexo === null && <span className="ml-1 text-[12px] text-[var(--ds-orange-deep)]">(sem sexo no cadastro)</span>}
                              <span className="block text-[12px] text-[var(--ds-label-2)]">{textoDasOrigens(origensDe.get(ocupante.pessoaId) ?? [])}</span>
                              {ocupante.checkIn && ocupante.checkOut && (
                                <span className="block text-[12px] text-[var(--ds-label-2)]">
                                  {textoDoPeriodo({ checkIn: ocupante.checkIn, checkOut: ocupante.checkOut })} · {diarias(diasEntre(ocupante.checkIn, ocupante.checkOut))}
                                </span>
                              )}
                            </span>
                            {escrita && (
                              <span className="flex flex-wrap items-center gap-1">
                                <BotaoPeriodoDoOcupante
                                  acao={definirPeriodoDoOcupanteAcao}
                                  quartoId={quarto.id}
                                  pessoaId={ocupante.pessoaId}
                                  nome={ocupante.nome}
                                  hospedagem={{ checkIn: hospedagem.checkIn, checkOut: hospedagem.checkOut }}
                                  proprio={ocupante.checkIn && ocupante.checkOut ? { checkIn: ocupante.checkIn, checkOut: ocupante.checkOut } : null}
                                />
                                <MoverDeQuarto pessoaId={ocupante.pessoaId} nome={ocupante.nome} quartoAtual={quarto.id} quartos={quartos} trocas={trocas} />
                                <FormularioDeAcao acao={tirarDoQuartoAcao} aria-label={`Tirar ${ocupante.nome} do quarto`}>
                                  <input type="hidden" name="quartoId" value={quarto.id} />
                                  <input type="hidden" name="pessoaId" value={ocupante.pessoaId} />
                                  <BotaoDeEnvio tamanho="pequeno" variante="texto" aria-label={`Tirar ${ocupante.nome} do ${quarto.nome}`}>
                                    Tirar
                                  </BotaoDeEnvio>
                                </FormularioDeAcao>
                              </span>
                            )}
                          </li>
                        ))}
                      </ul>
                    )}
                  </Cartao>
                </li>
              ))}
              {escrita && (
                <li className="flex items-start">
                  <FormularioNovoQuarto acao={adicionarQuartoAcao} hospedagemId={hospedagem.id} proximoNome={`Quarto ${hospedagem.quartos.length + 1}`} />
                </li>
              )}
            </ul>
          </div>
        );
      })}
    </section>
  );
}
