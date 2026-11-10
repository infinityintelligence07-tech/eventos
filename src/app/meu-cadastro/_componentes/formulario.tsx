"use client";

import { useActionState, useState } from "react";

import { type ResultadoDoMeuCadastro, salvarMeuCadastroAcao } from "../acoes";

export type ValoresDoMeuCadastro = {
  poloCodigo: string | null;
  sexo: string | null;
  camisetaModelo: string | null;
  camisetaTamanho: string | null;
  funcoes: { funcaoId: string; nivel: "TRAINEE" | "HABILITADO" }[];
  cep: string | null;
  cidade: string | null;
  uf: string | null;
  temLocalizacao: boolean;
  veiculo: { lugares: number; consumoKmL: number | null } | null;
};

export type OpcoesDoMeuCadastro = { polos: { codigo: string; nome: string }[]; funcoes: { id: string; nome: string }[] };

const AVISO_DA_LOCALIZACAO: Record<string, string> = {
  CALCULADA: "Localização calculada pelo endereço.",
  MANTIDA: "Localização anterior mantida (para recalcular, preencha rua e número).",
  NAO_ENCONTRADA: "Não achamos esse endereço no mapa. Confira rua, número e CEP e salve de novo.",
  INDISPONIVEL: "A localização será calculada depois pelo time.",
};

function Erro({ erros, campo }: { erros?: Record<string, string>; campo: string }) {
  return erros?.[campo] ? (
    <span className="cadastro-erro" role="alert">
      {erros[campo]}
    </span>
  ) : null;
}

export function FormularioDoMeuCadastro({ valores, opcoes }: { valores: ValoresDoMeuCadastro; opcoes: OpcoesDoMeuCadastro }) {
  const [resultado, enviar, enviando] = useActionState<ResultadoDoMeuCadastro, FormData>(salvarMeuCadastroAcao, null);
  const [temCarro, setTemCarro] = useState(valores.veiculo ? "SIM" : "NAO");
  const [endereco, setEndereco] = useState({ cep: valores.cep ?? "", logradouro: "", bairro: "", cidade: valores.cidade ?? "", uf: valores.uf ?? "" });
  const erros = resultado && !resultado.ok ? resultado.erros : undefined;
  const habilitadas = new Set(valores.funcoes.filter((funcao) => funcao.nivel === "HABILITADO").map((funcao) => funcao.funcaoId));
  const marcadas = new Set(valores.funcoes.map((funcao) => funcao.funcaoId));

  // ViaCEP no navegador: só completa os campos; quem vale é o que a pessoa enviar.
  async function buscarCep(valor: string) {
    const cep = valor.replace(/\D/g, "");
    if (cep.length !== 8) return;
    try {
      const resposta = await fetch(`https://viacep.com.br/ws/${cep}/json/`);
      const dados = (await resposta.json()) as { erro?: boolean; logradouro?: string; bairro?: string; localidade?: string; uf?: string };
      if (dados.erro) return;
      setEndereco((atual) => ({
        ...atual,
        logradouro: dados.logradouro || atual.logradouro,
        bairro: dados.bairro || atual.bairro,
        cidade: dados.localidade || atual.cidade,
        uf: dados.uf || atual.uf,
      }));
    } catch {
      // Sem internet ou ViaCEP fora: a pessoa digita.
    }
  }

  return (
    <form action={enviar} className="cadastro-form" noValidate>
      <fieldset>
        <legend>Onde você atua</legend>
        <label className="login-campo">
          <span>Polo</span>
          <select name="poloCodigo" defaultValue={valores.poloCodigo ?? ""} required>
            <option value="" disabled>
              Escolha o seu polo
            </option>
            {opcoes.polos.map((polo) => (
              <option key={polo.codigo} value={polo.codigo}>
                {polo.nome} ({polo.codigo})
              </option>
            ))}
          </select>
          <Erro erros={erros} campo="poloCodigo" />
        </label>
      </fieldset>

      <fieldset>
        <legend>Sobre você</legend>
        <div className="login-campo">
          <span>Sexo (para quarto de hotel e mensagens)</span>
          <div className="cadastro-opcoes">
            {[
              ["F", "Feminino"],
              ["M", "Masculino"],
            ].map(([valor, rotulo]) => (
              <label key={valor} className="cadastro-opcao">
                <input type="radio" name="sexo" value={valor} defaultChecked={valores.sexo === valor} required />
                {rotulo}
              </label>
            ))}
          </div>
          <Erro erros={erros} campo="sexo" />
        </div>
        <div className="cadastro-duas-colunas">
          <label className="login-campo">
            <span>Modelo da camiseta</span>
            <select name="camisetaModelo" defaultValue={valores.camisetaModelo ?? ""}>
              <option value="" disabled>
                Escolha
              </option>
              <option value="CAMISETA">Camiseta</option>
              <option value="BABY_LOOK">Baby look</option>
            </select>
            <Erro erros={erros} campo="camisetaModelo" />
          </label>
          <label className="login-campo">
            <span>Tamanho</span>
            <select name="camisetaTamanho" defaultValue={valores.camisetaTamanho ?? ""}>
              <option value="" disabled>
                Escolha
              </option>
              {["PP", "P", "M", "G", "GG", "XG"].map((tamanho) => (
                <option key={tamanho} value={tamanho}>
                  {tamanho}
                </option>
              ))}
            </select>
            <Erro erros={erros} campo="camisetaTamanho" />
          </label>
        </div>
      </fieldset>

      <fieldset>
        <legend>O que você sabe fazer</legend>
        <p className="cadastro-ajuda">O time confirma. As já confirmadas aparecem travadas.</p>
        <div className="cadastro-funcoes">
          {opcoes.funcoes.map((funcao) => (
            <label key={funcao.id} className="cadastro-opcao">
              <input type="checkbox" name="funcoes" value={funcao.id} defaultChecked={marcadas.has(funcao.id)} disabled={habilitadas.has(funcao.id)} />
              <span>
                {funcao.nome}
                {habilitadas.has(funcao.id) && <small> · confirmada</small>}
              </span>
            </label>
          ))}
        </div>
      </fieldset>

      <fieldset>
        <legend>Onde você mora</legend>
        <p className="cadastro-ajuda">
          Usado só para calcular distância, carona e deslocamento. Rua e número não ficam guardados: viram um ponto no mapa.
          {valores.temLocalizacao ? " Já temos a sua localização; preencha de novo só se mudou." : ""}
        </p>
        <label className="login-campo">
          <span>CEP</span>
          <input
            name="cep"
            inputMode="numeric"
            autoComplete="postal-code"
            maxLength={9}
            value={endereco.cep}
            onChange={(evento) => setEndereco({ ...endereco, cep: evento.target.value })}
            onBlur={(evento) => void buscarCep(evento.target.value)}
          />
          <Erro erros={erros} campo="cep" />
        </label>
        <label className="login-campo">
          <span>Rua</span>
          <input name="logradouro" autoComplete="address-line1" maxLength={150} value={endereco.logradouro} onChange={(evento) => setEndereco({ ...endereco, logradouro: evento.target.value })} />
        </label>
        <div className="cadastro-duas-colunas">
          <label className="login-campo">
            <span>Número</span>
            <input name="numero" inputMode="numeric" maxLength={20} />
          </label>
          <label className="login-campo">
            <span>Bairro</span>
            <input name="bairro" maxLength={80} value={endereco.bairro} onChange={(evento) => setEndereco({ ...endereco, bairro: evento.target.value })} />
          </label>
        </div>
        <div className="cadastro-duas-colunas">
          <label className="login-campo">
            <span>Cidade</span>
            <input name="cidade" autoComplete="address-level2" maxLength={80} value={endereco.cidade} onChange={(evento) => setEndereco({ ...endereco, cidade: evento.target.value })} />
            <Erro erros={erros} campo="cidade" />
          </label>
          <label className="login-campo">
            <span>UF</span>
            <input name="uf" autoComplete="address-level1" maxLength={2} value={endereco.uf} onChange={(evento) => setEndereco({ ...endereco, uf: evento.target.value.toUpperCase() })} />
            <Erro erros={erros} campo="uf" />
          </label>
        </div>
      </fieldset>

      <fieldset>
        <legend>Carro</legend>
        <div className="cadastro-opcoes">
          {(
            [
              ["SIM", "Tenho carro e posso levar gente"],
              ["NAO", "Não tenho / não vou de carro"],
            ] as const
          ).map(([valor, rotulo]) => (
            <label key={valor} className="cadastro-opcao">
              <input type="radio" name="temCarro" value={valor} checked={temCarro === valor} onChange={() => setTemCarro(valor)} />
              {rotulo}
            </label>
          ))}
        </div>
        {temCarro === "SIM" && (
          <div className="cadastro-duas-colunas">
            <label className="login-campo">
              <span>Lugares para passageiros</span>
              <input name="lugares" type="number" min={1} max={8} defaultValue={valores.veiculo?.lugares ?? ""} />
              <Erro erros={erros} campo="lugares" />
            </label>
            <label className="login-campo">
              <span>Consumo (km/l)</span>
              <input name="consumoKmL" inputMode="decimal" placeholder="ex.: 10,5" defaultValue={valores.veiculo?.consumoKmL?.toString().replace(".", ",") ?? ""} />
              <Erro erros={erros} campo="consumoKmL" />
            </label>
          </div>
        )}
      </fieldset>

      {resultado && (
        <p className={resultado.ok ? "cadastro-ok" : "login-error"} role={resultado.ok ? "status" : "alert"}>
          {resultado.ok ? `Cadastro salvo. ${AVISO_DA_LOCALIZACAO[resultado.localizacao] ?? ""}` : resultado.mensagem}
        </p>
      )}
      <button type="submit" className="login-submit" disabled={enviando}>
        {enviando ? "Salvando..." : "Salvar meu cadastro"}
      </button>
    </form>
  );
}
