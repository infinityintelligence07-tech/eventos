-- Estrutura do banco criada pelas migrations do GH-System (0000 a 0003, commit b5026dd).
-- Base dos testes de integração: o Eventos aplica as migrations dele por cima, como no iam-pessoas.
-- Gerado com pg_dump --schema-only --no-owner --no-privileges; sem dados. Regerar quando o GH mudar core/eventos.

--
-- PostgreSQL database dump
--



SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;

--
-- Name: auditoria; Type: SCHEMA; Schema: -; Owner: -
--

CREATE SCHEMA auditoria;


--
-- Name: core; Type: SCHEMA; Schema: -; Owner: -
--

CREATE SCHEMA core;


--
-- Name: eventos; Type: SCHEMA; Schema: -; Owner: -
--

CREATE SCHEMA eventos;


--
-- Name: gh; Type: SCHEMA; Schema: -; Owner: -
--

CREATE SCHEMA gh;


--
-- Name: pgboss_gh; Type: SCHEMA; Schema: -; Owner: -
--

CREATE SCHEMA pgboss_gh;


--
-- Name: sensivel; Type: SCHEMA; Schema: -; Owner: -
--

CREATE SCHEMA sensivel;


--
-- Name: uuid_v7(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.uuid_v7() RETURNS uuid
    LANGUAGE plpgsql
    SET search_path TO ''
    AS $$
DECLARE
  timestamp_hex text;
  random_hex text;
BEGIN
  timestamp_hex := lpad(
    to_hex(floor(extract(epoch FROM clock_timestamp()) * 1000)::bigint),
    12,
    '0'
  );
  random_hex := replace(gen_random_uuid()::text, '-', '');

  RETURN (
    timestamp_hex ||
    '7' || substr(random_hex, 14, 3) ||
    '8' || substr(random_hex, 18, 3) ||
    substr(random_hex, 21, 12)
  )::uuid;
END;
$$;


SET default_tablespace = '';

SET default_table_access_method = heap;

--
-- Name: audit_log; Type: TABLE; Schema: auditoria; Owner: -
--

CREATE TABLE auditoria.audit_log (
    id uuid DEFAULT public.uuid_v7() NOT NULL,
    ator_id uuid,
    acao text NOT NULL,
    recurso text NOT NULL,
    recurso_id uuid,
    campo text,
    valor_anterior jsonb,
    valor_novo jsonb,
    ip inet,
    criado_em timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: cargo; Type: TABLE; Schema: core; Owner: -
--

CREATE TABLE core.cargo (
    id uuid DEFAULT public.uuid_v7() NOT NULL,
    nome text NOT NULL,
    setor_id uuid,
    job_description text,
    trilha_vertical text,
    ativo boolean DEFAULT true NOT NULL,
    criado_em timestamp with time zone DEFAULT now() NOT NULL,
    atualizado_em timestamp with time zone DEFAULT now() NOT NULL,
    deleted_at timestamp with time zone
);


--
-- Name: nivel; Type: TABLE; Schema: core; Owner: -
--

CREATE TABLE core.nivel (
    id uuid DEFAULT public.uuid_v7() NOT NULL,
    nome text NOT NULL,
    ordem integer NOT NULL,
    ativo boolean DEFAULT true NOT NULL,
    criado_em timestamp with time zone DEFAULT now() NOT NULL,
    atualizado_em timestamp with time zone DEFAULT now() NOT NULL,
    deleted_at timestamp with time zone
);


--
-- Name: notificacao; Type: TABLE; Schema: core; Owner: -
--

CREATE TABLE core.notificacao (
    id uuid DEFAULT public.uuid_v7() NOT NULL,
    tipo text NOT NULL,
    destinatario_usuario_id uuid,
    convocacao_id uuid,
    payload jsonb DEFAULT '{}'::jsonb NOT NULL,
    status text DEFAULT 'PENDENTE'::text NOT NULL,
    idempotency_key text NOT NULL,
    criado_em timestamp with time zone DEFAULT now() NOT NULL,
    enviado_em timestamp with time zone,
    lido_em timestamp with time zone
);


--
-- Name: perfil; Type: TABLE; Schema: core; Owner: -
--

CREATE TABLE core.perfil (
    id uuid DEFAULT public.uuid_v7() NOT NULL,
    codigo text NOT NULL,
    nome text NOT NULL
);


--
-- Name: pessoa; Type: TABLE; Schema: core; Owner: -
--

CREATE TABLE core.pessoa (
    id uuid DEFAULT public.uuid_v7() NOT NULL,
    usuario_id uuid,
    nome_completo text NOT NULL,
    nome_social text,
    data_nascimento date,
    email text,
    telefone text,
    foto text,
    ativo boolean DEFAULT true NOT NULL,
    criado_em timestamp with time zone DEFAULT now() NOT NULL,
    atualizado_em timestamp with time zone DEFAULT now() NOT NULL,
    deleted_at timestamp with time zone
);


--
-- Name: polo; Type: TABLE; Schema: core; Owner: -
--

CREATE TABLE core.polo (
    id uuid DEFAULT public.uuid_v7() NOT NULL,
    codigo text NOT NULL,
    nome text NOT NULL,
    lider_id uuid,
    ativo boolean DEFAULT true NOT NULL,
    criado_em timestamp with time zone DEFAULT now() NOT NULL,
    atualizado_em timestamp with time zone DEFAULT now() NOT NULL,
    deleted_at timestamp with time zone
);


--
-- Name: setor; Type: TABLE; Schema: core; Owner: -
--

CREATE TABLE core.setor (
    id uuid DEFAULT public.uuid_v7() NOT NULL,
    codigo text NOT NULL,
    nome text NOT NULL,
    ativo boolean DEFAULT true NOT NULL,
    criado_em timestamp with time zone DEFAULT now() NOT NULL,
    atualizado_em timestamp with time zone DEFAULT now() NOT NULL,
    deleted_at timestamp with time zone
);


--
-- Name: usuario; Type: TABLE; Schema: core; Owner: -
--

CREATE TABLE core.usuario (
    id uuid DEFAULT public.uuid_v7() NOT NULL,
    email text,
    nome_usuario text,
    telefone text,
    ativo boolean DEFAULT true NOT NULL,
    criado_em timestamp with time zone DEFAULT now() NOT NULL,
    atualizado_em timestamp with time zone DEFAULT now() NOT NULL,
    deleted_at timestamp with time zone
);


--
-- Name: usuario_perfil; Type: TABLE; Schema: core; Owner: -
--

CREATE TABLE core.usuario_perfil (
    usuario_id uuid NOT NULL,
    perfil_id uuid NOT NULL,
    escopo text NOT NULL,
    escopo_ref uuid
);


--
-- Name: vinculo; Type: TABLE; Schema: core; Owner: -
--

CREATE TABLE core.vinculo (
    id uuid DEFAULT public.uuid_v7() NOT NULL,
    pessoa_id uuid NOT NULL,
    tipo text NOT NULL,
    cargo_id uuid,
    nivel_id uuid,
    setor_id uuid,
    polo_id uuid,
    lider_id uuid,
    data_inicio date NOT NULL,
    data_fim date,
    status text NOT NULL,
    salario_ou_diaria integer,
    unidade_pagamento text,
    criado_em timestamp with time zone DEFAULT now() NOT NULL,
    atualizado_em timestamp with time zone DEFAULT now() NOT NULL,
    deleted_at timestamp with time zone
);


--
-- Name: convocacao; Type: TABLE; Schema: eventos; Owner: -
--

CREATE TABLE eventos.convocacao (
    id uuid DEFAULT public.uuid_v7() NOT NULL,
    escala_id uuid NOT NULL,
    pessoa_id uuid NOT NULL,
    status text NOT NULL,
    respondida_em timestamp with time zone,
    criado_em timestamp with time zone DEFAULT now() NOT NULL,
    atualizado_em timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: escala; Type: TABLE; Schema: eventos; Owner: -
--

CREATE TABLE eventos.escala (
    id uuid DEFAULT public.uuid_v7() NOT NULL,
    evento_id uuid NOT NULL,
    cargo_id uuid,
    data date NOT NULL,
    hora_inicio text NOT NULL,
    hora_fim text NOT NULL,
    quantidade_vagas integer NOT NULL,
    status text NOT NULL,
    criado_em timestamp with time zone DEFAULT now() NOT NULL,
    atualizado_em timestamp with time zone DEFAULT now() NOT NULL,
    deleted_at timestamp with time zone
);


--
-- Name: evento; Type: TABLE; Schema: eventos; Owner: -
--

CREATE TABLE eventos.evento (
    id uuid DEFAULT public.uuid_v7() NOT NULL,
    nome text NOT NULL,
    descricao text,
    polo_id uuid,
    inicio timestamp with time zone NOT NULL,
    fim timestamp with time zone NOT NULL,
    status text NOT NULL,
    criado_em timestamp with time zone DEFAULT now() NOT NULL,
    atualizado_em timestamp with time zone DEFAULT now() NOT NULL,
    deleted_at timestamp with time zone
);


--
-- Name: presenca; Type: TABLE; Schema: eventos; Owner: -
--

CREATE TABLE eventos.presenca (
    id uuid DEFAULT public.uuid_v7() NOT NULL,
    convocacao_id uuid NOT NULL,
    entrada timestamp with time zone,
    saida timestamp with time zone,
    status text NOT NULL,
    criado_em timestamp with time zone DEFAULT now() NOT NULL,
    atualizado_em timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: aviso_mural; Type: TABLE; Schema: gh; Owner: -
--

CREATE TABLE gh.aviso_mural (
    id uuid DEFAULT public.uuid_v7() NOT NULL,
    titulo text NOT NULL,
    resumo text NOT NULL,
    publicado_em timestamp with time zone DEFAULT now() NOT NULL,
    autor_id uuid,
    ativo boolean DEFAULT true NOT NULL,
    criado_em timestamp with time zone DEFAULT now() NOT NULL,
    atualizado_em timestamp with time zone DEFAULT now() NOT NULL,
    deleted_at timestamp with time zone
);


--
-- Name: beneficio; Type: TABLE; Schema: gh; Owner: -
--

CREATE TABLE gh.beneficio (
    id uuid DEFAULT public.uuid_v7() NOT NULL,
    slug text NOT NULL,
    nome text NOT NULL,
    descricao text,
    ativo boolean DEFAULT true NOT NULL,
    criado_em timestamp with time zone DEFAULT now() NOT NULL,
    atualizado_em timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: documento_gh; Type: TABLE; Schema: gh; Owner: -
--

CREATE TABLE gh.documento_gh (
    id uuid DEFAULT public.uuid_v7() NOT NULL,
    titulo text NOT NULL,
    descricao text,
    url text NOT NULL,
    tamanho_label text,
    autor_id uuid,
    publicado_em timestamp with time zone DEFAULT now() NOT NULL,
    criado_em timestamp with time zone DEFAULT now() NOT NULL,
    atualizado_em timestamp with time zone DEFAULT now() NOT NULL,
    deleted_at timestamp with time zone
);


--
-- Name: pessoa_beneficio; Type: TABLE; Schema: gh; Owner: -
--

CREATE TABLE gh.pessoa_beneficio (
    id uuid DEFAULT public.uuid_v7() NOT NULL,
    pessoa_id uuid NOT NULL,
    beneficio_id uuid NOT NULL,
    status text DEFAULT 'ATIVO'::text NOT NULL,
    observacao text,
    inicio date,
    fim date,
    criado_por uuid,
    criado_em timestamp with time zone DEFAULT now() NOT NULL,
    atualizado_em timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: registro_ponto; Type: TABLE; Schema: gh; Owner: -
--

CREATE TABLE gh.registro_ponto (
    id uuid DEFAULT public.uuid_v7() NOT NULL,
    usuario_id uuid NOT NULL,
    data date NOT NULL,
    entrada timestamp with time zone,
    saida_almoco timestamp with time zone,
    volta_almoco timestamp with time zone,
    saida timestamp with time zone,
    criado_em timestamp with time zone DEFAULT now() NOT NULL,
    atualizado_em timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: solicitacao; Type: TABLE; Schema: gh; Owner: -
--

CREATE TABLE gh.solicitacao (
    id uuid DEFAULT public.uuid_v7() NOT NULL,
    solicitante_usuario_id uuid NOT NULL,
    tipo text NOT NULL,
    status text DEFAULT 'PENDENTE'::text NOT NULL,
    titulo text NOT NULL,
    detalhe text,
    payload jsonb DEFAULT '{}'::jsonb NOT NULL,
    decidido_por uuid,
    decidido_em timestamp with time zone,
    criado_em timestamp with time zone DEFAULT now() NOT NULL,
    atualizado_em timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: trilha_carreira; Type: TABLE; Schema: gh; Owner: -
--

CREATE TABLE gh.trilha_carreira (
    id uuid DEFAULT public.uuid_v7() NOT NULL,
    codigo text NOT NULL,
    nome text NOT NULL,
    descricao text,
    ativo boolean DEFAULT true NOT NULL,
    criado_em timestamp with time zone DEFAULT now() NOT NULL,
    atualizado_em timestamp with time zone DEFAULT now() NOT NULL,
    deleted_at timestamp with time zone
);


--
-- Name: pessoa_dado_sensivel; Type: TABLE; Schema: sensivel; Owner: -
--

CREATE TABLE sensivel.pessoa_dado_sensivel (
    id uuid DEFAULT public.uuid_v7() NOT NULL,
    pessoa_id uuid NOT NULL,
    cpf text,
    rg text,
    endereco jsonb,
    criado_em timestamp with time zone DEFAULT now() NOT NULL,
    atualizado_em timestamp with time zone DEFAULT now() NOT NULL,
    deleted_at timestamp with time zone
);


--
-- Name: pessoa_dados_bancarios; Type: TABLE; Schema: sensivel; Owner: -
--

CREATE TABLE sensivel.pessoa_dados_bancarios (
    id uuid DEFAULT public.uuid_v7() NOT NULL,
    pessoa_id uuid NOT NULL,
    chave_pix text,
    banco text,
    agencia text,
    conta text,
    titular text,
    criado_em timestamp with time zone DEFAULT now() NOT NULL,
    atualizado_em timestamp with time zone DEFAULT now() NOT NULL,
    deleted_at timestamp with time zone
);


--
-- Name: pessoa_documento; Type: TABLE; Schema: sensivel; Owner: -
--

CREATE TABLE sensivel.pessoa_documento (
    id uuid DEFAULT public.uuid_v7() NOT NULL,
    pessoa_id uuid NOT NULL,
    tipo text NOT NULL,
    arquivo text NOT NULL,
    validade date,
    status text NOT NULL,
    criado_em timestamp with time zone DEFAULT now() NOT NULL,
    atualizado_em timestamp with time zone DEFAULT now() NOT NULL,
    deleted_at timestamp with time zone
);


--
-- Name: audit_log audit_log_pkey; Type: CONSTRAINT; Schema: auditoria; Owner: -
--

ALTER TABLE ONLY auditoria.audit_log
    ADD CONSTRAINT audit_log_pkey PRIMARY KEY (id);


--
-- Name: cargo cargo_pkey; Type: CONSTRAINT; Schema: core; Owner: -
--

ALTER TABLE ONLY core.cargo
    ADD CONSTRAINT cargo_pkey PRIMARY KEY (id);


--
-- Name: nivel nivel_pkey; Type: CONSTRAINT; Schema: core; Owner: -
--

ALTER TABLE ONLY core.nivel
    ADD CONSTRAINT nivel_pkey PRIMARY KEY (id);


--
-- Name: notificacao notificacao_idempotency_key_unique; Type: CONSTRAINT; Schema: core; Owner: -
--

ALTER TABLE ONLY core.notificacao
    ADD CONSTRAINT notificacao_idempotency_key_unique UNIQUE (idempotency_key);


--
-- Name: notificacao notificacao_pkey; Type: CONSTRAINT; Schema: core; Owner: -
--

ALTER TABLE ONLY core.notificacao
    ADD CONSTRAINT notificacao_pkey PRIMARY KEY (id);


--
-- Name: perfil perfil_codigo_unique; Type: CONSTRAINT; Schema: core; Owner: -
--

ALTER TABLE ONLY core.perfil
    ADD CONSTRAINT perfil_codigo_unique UNIQUE (codigo);


--
-- Name: perfil perfil_pkey; Type: CONSTRAINT; Schema: core; Owner: -
--

ALTER TABLE ONLY core.perfil
    ADD CONSTRAINT perfil_pkey PRIMARY KEY (id);


--
-- Name: pessoa pessoa_pkey; Type: CONSTRAINT; Schema: core; Owner: -
--

ALTER TABLE ONLY core.pessoa
    ADD CONSTRAINT pessoa_pkey PRIMARY KEY (id);


--
-- Name: pessoa pessoa_usuario_id_unique; Type: CONSTRAINT; Schema: core; Owner: -
--

ALTER TABLE ONLY core.pessoa
    ADD CONSTRAINT pessoa_usuario_id_unique UNIQUE (usuario_id);


--
-- Name: polo polo_codigo_unique; Type: CONSTRAINT; Schema: core; Owner: -
--

ALTER TABLE ONLY core.polo
    ADD CONSTRAINT polo_codigo_unique UNIQUE (codigo);


--
-- Name: polo polo_pkey; Type: CONSTRAINT; Schema: core; Owner: -
--

ALTER TABLE ONLY core.polo
    ADD CONSTRAINT polo_pkey PRIMARY KEY (id);


--
-- Name: setor setor_codigo_unique; Type: CONSTRAINT; Schema: core; Owner: -
--

ALTER TABLE ONLY core.setor
    ADD CONSTRAINT setor_codigo_unique UNIQUE (codigo);


--
-- Name: setor setor_pkey; Type: CONSTRAINT; Schema: core; Owner: -
--

ALTER TABLE ONLY core.setor
    ADD CONSTRAINT setor_pkey PRIMARY KEY (id);


--
-- Name: usuario usuario_email_unique; Type: CONSTRAINT; Schema: core; Owner: -
--

ALTER TABLE ONLY core.usuario
    ADD CONSTRAINT usuario_email_unique UNIQUE (email);


--
-- Name: usuario usuario_nome_usuario_unique; Type: CONSTRAINT; Schema: core; Owner: -
--

ALTER TABLE ONLY core.usuario
    ADD CONSTRAINT usuario_nome_usuario_unique UNIQUE (nome_usuario);


--
-- Name: usuario_perfil usuario_perfil_usuario_id_perfil_id_pk; Type: CONSTRAINT; Schema: core; Owner: -
--

ALTER TABLE ONLY core.usuario_perfil
    ADD CONSTRAINT usuario_perfil_usuario_id_perfil_id_pk PRIMARY KEY (usuario_id, perfil_id);


--
-- Name: usuario usuario_pkey; Type: CONSTRAINT; Schema: core; Owner: -
--

ALTER TABLE ONLY core.usuario
    ADD CONSTRAINT usuario_pkey PRIMARY KEY (id);


--
-- Name: vinculo vinculo_pkey; Type: CONSTRAINT; Schema: core; Owner: -
--

ALTER TABLE ONLY core.vinculo
    ADD CONSTRAINT vinculo_pkey PRIMARY KEY (id);


--
-- Name: convocacao convocacao_escala_pessoa_unique; Type: CONSTRAINT; Schema: eventos; Owner: -
--

ALTER TABLE ONLY eventos.convocacao
    ADD CONSTRAINT convocacao_escala_pessoa_unique UNIQUE (escala_id, pessoa_id);


--
-- Name: convocacao convocacao_pkey; Type: CONSTRAINT; Schema: eventos; Owner: -
--

ALTER TABLE ONLY eventos.convocacao
    ADD CONSTRAINT convocacao_pkey PRIMARY KEY (id);


--
-- Name: escala escala_pkey; Type: CONSTRAINT; Schema: eventos; Owner: -
--

ALTER TABLE ONLY eventos.escala
    ADD CONSTRAINT escala_pkey PRIMARY KEY (id);


--
-- Name: evento evento_pkey; Type: CONSTRAINT; Schema: eventos; Owner: -
--

ALTER TABLE ONLY eventos.evento
    ADD CONSTRAINT evento_pkey PRIMARY KEY (id);


--
-- Name: presenca presenca_convocacao_id_unique; Type: CONSTRAINT; Schema: eventos; Owner: -
--

ALTER TABLE ONLY eventos.presenca
    ADD CONSTRAINT presenca_convocacao_id_unique UNIQUE (convocacao_id);


--
-- Name: presenca presenca_pkey; Type: CONSTRAINT; Schema: eventos; Owner: -
--

ALTER TABLE ONLY eventos.presenca
    ADD CONSTRAINT presenca_pkey PRIMARY KEY (id);


--
-- Name: aviso_mural aviso_mural_pkey; Type: CONSTRAINT; Schema: gh; Owner: -
--

ALTER TABLE ONLY gh.aviso_mural
    ADD CONSTRAINT aviso_mural_pkey PRIMARY KEY (id);


--
-- Name: beneficio beneficio_pkey; Type: CONSTRAINT; Schema: gh; Owner: -
--

ALTER TABLE ONLY gh.beneficio
    ADD CONSTRAINT beneficio_pkey PRIMARY KEY (id);


--
-- Name: beneficio beneficio_slug_unique; Type: CONSTRAINT; Schema: gh; Owner: -
--

ALTER TABLE ONLY gh.beneficio
    ADD CONSTRAINT beneficio_slug_unique UNIQUE (slug);


--
-- Name: documento_gh documento_gh_pkey; Type: CONSTRAINT; Schema: gh; Owner: -
--

ALTER TABLE ONLY gh.documento_gh
    ADD CONSTRAINT documento_gh_pkey PRIMARY KEY (id);


--
-- Name: pessoa_beneficio pessoa_beneficio_pessoa_beneficio_unique; Type: CONSTRAINT; Schema: gh; Owner: -
--

ALTER TABLE ONLY gh.pessoa_beneficio
    ADD CONSTRAINT pessoa_beneficio_pessoa_beneficio_unique UNIQUE (pessoa_id, beneficio_id);


--
-- Name: pessoa_beneficio pessoa_beneficio_pkey; Type: CONSTRAINT; Schema: gh; Owner: -
--

ALTER TABLE ONLY gh.pessoa_beneficio
    ADD CONSTRAINT pessoa_beneficio_pkey PRIMARY KEY (id);


--
-- Name: registro_ponto registro_ponto_pkey; Type: CONSTRAINT; Schema: gh; Owner: -
--

ALTER TABLE ONLY gh.registro_ponto
    ADD CONSTRAINT registro_ponto_pkey PRIMARY KEY (id);


--
-- Name: registro_ponto registro_ponto_usuario_data_unique; Type: CONSTRAINT; Schema: gh; Owner: -
--

ALTER TABLE ONLY gh.registro_ponto
    ADD CONSTRAINT registro_ponto_usuario_data_unique UNIQUE (usuario_id, data);


--
-- Name: solicitacao solicitacao_pkey; Type: CONSTRAINT; Schema: gh; Owner: -
--

ALTER TABLE ONLY gh.solicitacao
    ADD CONSTRAINT solicitacao_pkey PRIMARY KEY (id);


--
-- Name: trilha_carreira trilha_carreira_codigo_unique; Type: CONSTRAINT; Schema: gh; Owner: -
--

ALTER TABLE ONLY gh.trilha_carreira
    ADD CONSTRAINT trilha_carreira_codigo_unique UNIQUE (codigo);


--
-- Name: trilha_carreira trilha_carreira_pkey; Type: CONSTRAINT; Schema: gh; Owner: -
--

ALTER TABLE ONLY gh.trilha_carreira
    ADD CONSTRAINT trilha_carreira_pkey PRIMARY KEY (id);


--
-- Name: pessoa_dado_sensivel pessoa_dado_sensivel_pessoa_id_unique; Type: CONSTRAINT; Schema: sensivel; Owner: -
--

ALTER TABLE ONLY sensivel.pessoa_dado_sensivel
    ADD CONSTRAINT pessoa_dado_sensivel_pessoa_id_unique UNIQUE (pessoa_id);


--
-- Name: pessoa_dado_sensivel pessoa_dado_sensivel_pkey; Type: CONSTRAINT; Schema: sensivel; Owner: -
--

ALTER TABLE ONLY sensivel.pessoa_dado_sensivel
    ADD CONSTRAINT pessoa_dado_sensivel_pkey PRIMARY KEY (id);


--
-- Name: pessoa_dados_bancarios pessoa_dados_bancarios_pkey; Type: CONSTRAINT; Schema: sensivel; Owner: -
--

ALTER TABLE ONLY sensivel.pessoa_dados_bancarios
    ADD CONSTRAINT pessoa_dados_bancarios_pkey PRIMARY KEY (id);


--
-- Name: pessoa_documento pessoa_documento_pkey; Type: CONSTRAINT; Schema: sensivel; Owner: -
--

ALTER TABLE ONLY sensivel.pessoa_documento
    ADD CONSTRAINT pessoa_documento_pkey PRIMARY KEY (id);


--
-- Name: audit_log_ator_idx; Type: INDEX; Schema: auditoria; Owner: -
--

CREATE INDEX audit_log_ator_idx ON auditoria.audit_log USING btree (ator_id);


--
-- Name: audit_log_criado_em_idx; Type: INDEX; Schema: auditoria; Owner: -
--

CREATE INDEX audit_log_criado_em_idx ON auditoria.audit_log USING btree (criado_em);


--
-- Name: audit_log_recurso_idx; Type: INDEX; Schema: auditoria; Owner: -
--

CREATE INDEX audit_log_recurso_idx ON auditoria.audit_log USING btree (recurso, recurso_id);


--
-- Name: cargo_ativo_idx; Type: INDEX; Schema: core; Owner: -
--

CREATE INDEX cargo_ativo_idx ON core.cargo USING btree (ativo);


--
-- Name: cargo_setor_idx; Type: INDEX; Schema: core; Owner: -
--

CREATE INDEX cargo_setor_idx ON core.cargo USING btree (setor_id);


--
-- Name: nivel_ativo_idx; Type: INDEX; Schema: core; Owner: -
--

CREATE INDEX nivel_ativo_idx ON core.nivel USING btree (ativo);


--
-- Name: nivel_ordem_idx; Type: INDEX; Schema: core; Owner: -
--

CREATE INDEX nivel_ordem_idx ON core.nivel USING btree (ordem);


--
-- Name: notificacao_destinatario_idx; Type: INDEX; Schema: core; Owner: -
--

CREATE INDEX notificacao_destinatario_idx ON core.notificacao USING btree (destinatario_usuario_id);


--
-- Name: notificacao_destinatario_lido_idx; Type: INDEX; Schema: core; Owner: -
--

CREATE INDEX notificacao_destinatario_lido_idx ON core.notificacao USING btree (destinatario_usuario_id, lido_em);


--
-- Name: notificacao_status_idx; Type: INDEX; Schema: core; Owner: -
--

CREATE INDEX notificacao_status_idx ON core.notificacao USING btree (status);


--
-- Name: pessoa_ativo_idx; Type: INDEX; Schema: core; Owner: -
--

CREATE INDEX pessoa_ativo_idx ON core.pessoa USING btree (ativo);


--
-- Name: pessoa_nome_completo_idx; Type: INDEX; Schema: core; Owner: -
--

CREATE INDEX pessoa_nome_completo_idx ON core.pessoa USING btree (nome_completo);


--
-- Name: pessoa_usuario_idx; Type: INDEX; Schema: core; Owner: -
--

CREATE INDEX pessoa_usuario_idx ON core.pessoa USING btree (usuario_id);


--
-- Name: polo_ativo_idx; Type: INDEX; Schema: core; Owner: -
--

CREATE INDEX polo_ativo_idx ON core.polo USING btree (ativo);


--
-- Name: polo_lider_idx; Type: INDEX; Schema: core; Owner: -
--

CREATE INDEX polo_lider_idx ON core.polo USING btree (lider_id);


--
-- Name: setor_ativo_idx; Type: INDEX; Schema: core; Owner: -
--

CREATE INDEX setor_ativo_idx ON core.setor USING btree (ativo);


--
-- Name: usuario_ativo_idx; Type: INDEX; Schema: core; Owner: -
--

CREATE INDEX usuario_ativo_idx ON core.usuario USING btree (ativo);


--
-- Name: usuario_perfil_perfil_idx; Type: INDEX; Schema: core; Owner: -
--

CREATE INDEX usuario_perfil_perfil_idx ON core.usuario_perfil USING btree (perfil_id);


--
-- Name: vinculo_pessoa_idx; Type: INDEX; Schema: core; Owner: -
--

CREATE INDEX vinculo_pessoa_idx ON core.vinculo USING btree (pessoa_id);


--
-- Name: vinculo_polo_idx; Type: INDEX; Schema: core; Owner: -
--

CREATE INDEX vinculo_polo_idx ON core.vinculo USING btree (polo_id);


--
-- Name: vinculo_setor_idx; Type: INDEX; Schema: core; Owner: -
--

CREATE INDEX vinculo_setor_idx ON core.vinculo USING btree (setor_id);


--
-- Name: vinculo_status_idx; Type: INDEX; Schema: core; Owner: -
--

CREATE INDEX vinculo_status_idx ON core.vinculo USING btree (status);


--
-- Name: convocacao_escala_idx; Type: INDEX; Schema: eventos; Owner: -
--

CREATE INDEX convocacao_escala_idx ON eventos.convocacao USING btree (escala_id);


--
-- Name: convocacao_pessoa_idx; Type: INDEX; Schema: eventos; Owner: -
--

CREATE INDEX convocacao_pessoa_idx ON eventos.convocacao USING btree (pessoa_id);


--
-- Name: convocacao_status_idx; Type: INDEX; Schema: eventos; Owner: -
--

CREATE INDEX convocacao_status_idx ON eventos.convocacao USING btree (status);


--
-- Name: escala_data_idx; Type: INDEX; Schema: eventos; Owner: -
--

CREATE INDEX escala_data_idx ON eventos.escala USING btree (data);


--
-- Name: escala_evento_idx; Type: INDEX; Schema: eventos; Owner: -
--

CREATE INDEX escala_evento_idx ON eventos.escala USING btree (evento_id);


--
-- Name: escala_status_idx; Type: INDEX; Schema: eventos; Owner: -
--

CREATE INDEX escala_status_idx ON eventos.escala USING btree (status);


--
-- Name: evento_inicio_idx; Type: INDEX; Schema: eventos; Owner: -
--

CREATE INDEX evento_inicio_idx ON eventos.evento USING btree (inicio);


--
-- Name: evento_polo_idx; Type: INDEX; Schema: eventos; Owner: -
--

CREATE INDEX evento_polo_idx ON eventos.evento USING btree (polo_id);


--
-- Name: evento_status_idx; Type: INDEX; Schema: eventos; Owner: -
--

CREATE INDEX evento_status_idx ON eventos.evento USING btree (status);


--
-- Name: presenca_status_idx; Type: INDEX; Schema: eventos; Owner: -
--

CREATE INDEX presenca_status_idx ON eventos.presenca USING btree (status);


--
-- Name: aviso_mural_ativo_idx; Type: INDEX; Schema: gh; Owner: -
--

CREATE INDEX aviso_mural_ativo_idx ON gh.aviso_mural USING btree (ativo);


--
-- Name: aviso_mural_publicado_em_idx; Type: INDEX; Schema: gh; Owner: -
--

CREATE INDEX aviso_mural_publicado_em_idx ON gh.aviso_mural USING btree (publicado_em);


--
-- Name: documento_gh_publicado_em_idx; Type: INDEX; Schema: gh; Owner: -
--

CREATE INDEX documento_gh_publicado_em_idx ON gh.documento_gh USING btree (publicado_em);


--
-- Name: pessoa_beneficio_pessoa_idx; Type: INDEX; Schema: gh; Owner: -
--

CREATE INDEX pessoa_beneficio_pessoa_idx ON gh.pessoa_beneficio USING btree (pessoa_id);


--
-- Name: pessoa_beneficio_status_idx; Type: INDEX; Schema: gh; Owner: -
--

CREATE INDEX pessoa_beneficio_status_idx ON gh.pessoa_beneficio USING btree (status);


--
-- Name: registro_ponto_usuario_idx; Type: INDEX; Schema: gh; Owner: -
--

CREATE INDEX registro_ponto_usuario_idx ON gh.registro_ponto USING btree (usuario_id);


--
-- Name: solicitacao_solicitante_idx; Type: INDEX; Schema: gh; Owner: -
--

CREATE INDEX solicitacao_solicitante_idx ON gh.solicitacao USING btree (solicitante_usuario_id);


--
-- Name: solicitacao_status_idx; Type: INDEX; Schema: gh; Owner: -
--

CREATE INDEX solicitacao_status_idx ON gh.solicitacao USING btree (status);


--
-- Name: trilha_carreira_ativo_idx; Type: INDEX; Schema: gh; Owner: -
--

CREATE INDEX trilha_carreira_ativo_idx ON gh.trilha_carreira USING btree (ativo);


--
-- Name: pessoa_dado_sensivel_pessoa_idx; Type: INDEX; Schema: sensivel; Owner: -
--

CREATE INDEX pessoa_dado_sensivel_pessoa_idx ON sensivel.pessoa_dado_sensivel USING btree (pessoa_id);


--
-- Name: pessoa_dados_bancarios_pessoa_idx; Type: INDEX; Schema: sensivel; Owner: -
--

CREATE INDEX pessoa_dados_bancarios_pessoa_idx ON sensivel.pessoa_dados_bancarios USING btree (pessoa_id);


--
-- Name: pessoa_documento_pessoa_idx; Type: INDEX; Schema: sensivel; Owner: -
--

CREATE INDEX pessoa_documento_pessoa_idx ON sensivel.pessoa_documento USING btree (pessoa_id);


--
-- Name: pessoa_documento_status_idx; Type: INDEX; Schema: sensivel; Owner: -
--

CREATE INDEX pessoa_documento_status_idx ON sensivel.pessoa_documento USING btree (status);


--
-- Name: audit_log audit_log_ator_id_usuario_id_fk; Type: FK CONSTRAINT; Schema: auditoria; Owner: -
--

ALTER TABLE ONLY auditoria.audit_log
    ADD CONSTRAINT audit_log_ator_id_usuario_id_fk FOREIGN KEY (ator_id) REFERENCES core.usuario(id) ON DELETE SET NULL;


--
-- Name: cargo cargo_setor_id_setor_id_fk; Type: FK CONSTRAINT; Schema: core; Owner: -
--

ALTER TABLE ONLY core.cargo
    ADD CONSTRAINT cargo_setor_id_setor_id_fk FOREIGN KEY (setor_id) REFERENCES core.setor(id) ON DELETE SET NULL;


--
-- Name: notificacao notificacao_convocacao_id_convocacao_id_fk; Type: FK CONSTRAINT; Schema: core; Owner: -
--

ALTER TABLE ONLY core.notificacao
    ADD CONSTRAINT notificacao_convocacao_id_convocacao_id_fk FOREIGN KEY (convocacao_id) REFERENCES eventos.convocacao(id) ON DELETE CASCADE;


--
-- Name: notificacao notificacao_destinatario_usuario_id_usuario_id_fk; Type: FK CONSTRAINT; Schema: core; Owner: -
--

ALTER TABLE ONLY core.notificacao
    ADD CONSTRAINT notificacao_destinatario_usuario_id_usuario_id_fk FOREIGN KEY (destinatario_usuario_id) REFERENCES core.usuario(id) ON DELETE SET NULL;


--
-- Name: pessoa pessoa_usuario_id_usuario_id_fk; Type: FK CONSTRAINT; Schema: core; Owner: -
--

ALTER TABLE ONLY core.pessoa
    ADD CONSTRAINT pessoa_usuario_id_usuario_id_fk FOREIGN KEY (usuario_id) REFERENCES core.usuario(id) ON DELETE SET NULL;


--
-- Name: usuario_perfil usuario_perfil_perfil_id_perfil_id_fk; Type: FK CONSTRAINT; Schema: core; Owner: -
--

ALTER TABLE ONLY core.usuario_perfil
    ADD CONSTRAINT usuario_perfil_perfil_id_perfil_id_fk FOREIGN KEY (perfil_id) REFERENCES core.perfil(id) ON DELETE CASCADE;


--
-- Name: usuario_perfil usuario_perfil_usuario_id_usuario_id_fk; Type: FK CONSTRAINT; Schema: core; Owner: -
--

ALTER TABLE ONLY core.usuario_perfil
    ADD CONSTRAINT usuario_perfil_usuario_id_usuario_id_fk FOREIGN KEY (usuario_id) REFERENCES core.usuario(id) ON DELETE CASCADE;


--
-- Name: vinculo vinculo_cargo_id_cargo_id_fk; Type: FK CONSTRAINT; Schema: core; Owner: -
--

ALTER TABLE ONLY core.vinculo
    ADD CONSTRAINT vinculo_cargo_id_cargo_id_fk FOREIGN KEY (cargo_id) REFERENCES core.cargo(id) ON DELETE SET NULL;


--
-- Name: vinculo vinculo_lider_id_pessoa_id_fk; Type: FK CONSTRAINT; Schema: core; Owner: -
--

ALTER TABLE ONLY core.vinculo
    ADD CONSTRAINT vinculo_lider_id_pessoa_id_fk FOREIGN KEY (lider_id) REFERENCES core.pessoa(id) ON DELETE SET NULL;


--
-- Name: vinculo vinculo_nivel_id_nivel_id_fk; Type: FK CONSTRAINT; Schema: core; Owner: -
--

ALTER TABLE ONLY core.vinculo
    ADD CONSTRAINT vinculo_nivel_id_nivel_id_fk FOREIGN KEY (nivel_id) REFERENCES core.nivel(id) ON DELETE SET NULL;


--
-- Name: vinculo vinculo_pessoa_id_pessoa_id_fk; Type: FK CONSTRAINT; Schema: core; Owner: -
--

ALTER TABLE ONLY core.vinculo
    ADD CONSTRAINT vinculo_pessoa_id_pessoa_id_fk FOREIGN KEY (pessoa_id) REFERENCES core.pessoa(id) ON DELETE CASCADE;


--
-- Name: vinculo vinculo_polo_id_polo_id_fk; Type: FK CONSTRAINT; Schema: core; Owner: -
--

ALTER TABLE ONLY core.vinculo
    ADD CONSTRAINT vinculo_polo_id_polo_id_fk FOREIGN KEY (polo_id) REFERENCES core.polo(id) ON DELETE SET NULL;


--
-- Name: vinculo vinculo_setor_id_setor_id_fk; Type: FK CONSTRAINT; Schema: core; Owner: -
--

ALTER TABLE ONLY core.vinculo
    ADD CONSTRAINT vinculo_setor_id_setor_id_fk FOREIGN KEY (setor_id) REFERENCES core.setor(id) ON DELETE SET NULL;


--
-- Name: convocacao convocacao_escala_id_escala_id_fk; Type: FK CONSTRAINT; Schema: eventos; Owner: -
--

ALTER TABLE ONLY eventos.convocacao
    ADD CONSTRAINT convocacao_escala_id_escala_id_fk FOREIGN KEY (escala_id) REFERENCES eventos.escala(id) ON DELETE CASCADE;


--
-- Name: convocacao convocacao_pessoa_id_pessoa_id_fk; Type: FK CONSTRAINT; Schema: eventos; Owner: -
--

ALTER TABLE ONLY eventos.convocacao
    ADD CONSTRAINT convocacao_pessoa_id_pessoa_id_fk FOREIGN KEY (pessoa_id) REFERENCES core.pessoa(id) ON DELETE CASCADE;


--
-- Name: escala escala_cargo_id_cargo_id_fk; Type: FK CONSTRAINT; Schema: eventos; Owner: -
--

ALTER TABLE ONLY eventos.escala
    ADD CONSTRAINT escala_cargo_id_cargo_id_fk FOREIGN KEY (cargo_id) REFERENCES core.cargo(id) ON DELETE SET NULL;


--
-- Name: escala escala_evento_id_evento_id_fk; Type: FK CONSTRAINT; Schema: eventos; Owner: -
--

ALTER TABLE ONLY eventos.escala
    ADD CONSTRAINT escala_evento_id_evento_id_fk FOREIGN KEY (evento_id) REFERENCES eventos.evento(id) ON DELETE CASCADE;


--
-- Name: evento evento_polo_id_polo_id_fk; Type: FK CONSTRAINT; Schema: eventos; Owner: -
--

ALTER TABLE ONLY eventos.evento
    ADD CONSTRAINT evento_polo_id_polo_id_fk FOREIGN KEY (polo_id) REFERENCES core.polo(id) ON DELETE SET NULL;


--
-- Name: presenca presenca_convocacao_id_convocacao_id_fk; Type: FK CONSTRAINT; Schema: eventos; Owner: -
--

ALTER TABLE ONLY eventos.presenca
    ADD CONSTRAINT presenca_convocacao_id_convocacao_id_fk FOREIGN KEY (convocacao_id) REFERENCES eventos.convocacao(id) ON DELETE CASCADE;


--
-- Name: aviso_mural aviso_mural_autor_id_usuario_id_fk; Type: FK CONSTRAINT; Schema: gh; Owner: -
--

ALTER TABLE ONLY gh.aviso_mural
    ADD CONSTRAINT aviso_mural_autor_id_usuario_id_fk FOREIGN KEY (autor_id) REFERENCES core.usuario(id) ON DELETE SET NULL;


--
-- Name: documento_gh documento_gh_autor_id_usuario_id_fk; Type: FK CONSTRAINT; Schema: gh; Owner: -
--

ALTER TABLE ONLY gh.documento_gh
    ADD CONSTRAINT documento_gh_autor_id_usuario_id_fk FOREIGN KEY (autor_id) REFERENCES core.usuario(id) ON DELETE SET NULL;


--
-- Name: pessoa_beneficio pessoa_beneficio_beneficio_id_beneficio_id_fk; Type: FK CONSTRAINT; Schema: gh; Owner: -
--

ALTER TABLE ONLY gh.pessoa_beneficio
    ADD CONSTRAINT pessoa_beneficio_beneficio_id_beneficio_id_fk FOREIGN KEY (beneficio_id) REFERENCES gh.beneficio(id) ON DELETE CASCADE;


--
-- Name: pessoa_beneficio pessoa_beneficio_criado_por_usuario_id_fk; Type: FK CONSTRAINT; Schema: gh; Owner: -
--

ALTER TABLE ONLY gh.pessoa_beneficio
    ADD CONSTRAINT pessoa_beneficio_criado_por_usuario_id_fk FOREIGN KEY (criado_por) REFERENCES core.usuario(id) ON DELETE SET NULL;


--
-- Name: pessoa_beneficio pessoa_beneficio_pessoa_id_pessoa_id_fk; Type: FK CONSTRAINT; Schema: gh; Owner: -
--

ALTER TABLE ONLY gh.pessoa_beneficio
    ADD CONSTRAINT pessoa_beneficio_pessoa_id_pessoa_id_fk FOREIGN KEY (pessoa_id) REFERENCES core.pessoa(id) ON DELETE CASCADE;


--
-- Name: registro_ponto registro_ponto_usuario_id_usuario_id_fk; Type: FK CONSTRAINT; Schema: gh; Owner: -
--

ALTER TABLE ONLY gh.registro_ponto
    ADD CONSTRAINT registro_ponto_usuario_id_usuario_id_fk FOREIGN KEY (usuario_id) REFERENCES core.usuario(id) ON DELETE CASCADE;


--
-- Name: solicitacao solicitacao_decidido_por_usuario_id_fk; Type: FK CONSTRAINT; Schema: gh; Owner: -
--

ALTER TABLE ONLY gh.solicitacao
    ADD CONSTRAINT solicitacao_decidido_por_usuario_id_fk FOREIGN KEY (decidido_por) REFERENCES core.usuario(id) ON DELETE SET NULL;


--
-- Name: solicitacao solicitacao_solicitante_usuario_id_usuario_id_fk; Type: FK CONSTRAINT; Schema: gh; Owner: -
--

ALTER TABLE ONLY gh.solicitacao
    ADD CONSTRAINT solicitacao_solicitante_usuario_id_usuario_id_fk FOREIGN KEY (solicitante_usuario_id) REFERENCES core.usuario(id) ON DELETE CASCADE;


--
-- Name: pessoa_dado_sensivel pessoa_dado_sensivel_pessoa_id_pessoa_id_fk; Type: FK CONSTRAINT; Schema: sensivel; Owner: -
--

ALTER TABLE ONLY sensivel.pessoa_dado_sensivel
    ADD CONSTRAINT pessoa_dado_sensivel_pessoa_id_pessoa_id_fk FOREIGN KEY (pessoa_id) REFERENCES core.pessoa(id) ON DELETE CASCADE;


--
-- Name: pessoa_dados_bancarios pessoa_dados_bancarios_pessoa_id_pessoa_id_fk; Type: FK CONSTRAINT; Schema: sensivel; Owner: -
--

ALTER TABLE ONLY sensivel.pessoa_dados_bancarios
    ADD CONSTRAINT pessoa_dados_bancarios_pessoa_id_pessoa_id_fk FOREIGN KEY (pessoa_id) REFERENCES core.pessoa(id) ON DELETE CASCADE;


--
-- Name: pessoa_documento pessoa_documento_pessoa_id_pessoa_id_fk; Type: FK CONSTRAINT; Schema: sensivel; Owner: -
--

ALTER TABLE ONLY sensivel.pessoa_documento
    ADD CONSTRAINT pessoa_documento_pessoa_id_pessoa_id_fk FOREIGN KEY (pessoa_id) REFERENCES core.pessoa(id) ON DELETE CASCADE;


--
-- Name: audit_log; Type: ROW SECURITY; Schema: auditoria; Owner: -
--

ALTER TABLE auditoria.audit_log ENABLE ROW LEVEL SECURITY;

--
-- Name: cargo; Type: ROW SECURITY; Schema: core; Owner: -
--

ALTER TABLE core.cargo ENABLE ROW LEVEL SECURITY;

--
-- Name: nivel; Type: ROW SECURITY; Schema: core; Owner: -
--

ALTER TABLE core.nivel ENABLE ROW LEVEL SECURITY;

--
-- Name: notificacao; Type: ROW SECURITY; Schema: core; Owner: -
--

ALTER TABLE core.notificacao ENABLE ROW LEVEL SECURITY;

--
-- Name: perfil; Type: ROW SECURITY; Schema: core; Owner: -
--

ALTER TABLE core.perfil ENABLE ROW LEVEL SECURITY;

--
-- Name: pessoa; Type: ROW SECURITY; Schema: core; Owner: -
--

ALTER TABLE core.pessoa ENABLE ROW LEVEL SECURITY;

--
-- Name: polo; Type: ROW SECURITY; Schema: core; Owner: -
--

ALTER TABLE core.polo ENABLE ROW LEVEL SECURITY;

--
-- Name: setor; Type: ROW SECURITY; Schema: core; Owner: -
--

ALTER TABLE core.setor ENABLE ROW LEVEL SECURITY;

--
-- Name: usuario; Type: ROW SECURITY; Schema: core; Owner: -
--

ALTER TABLE core.usuario ENABLE ROW LEVEL SECURITY;

--
-- Name: usuario_perfil; Type: ROW SECURITY; Schema: core; Owner: -
--

ALTER TABLE core.usuario_perfil ENABLE ROW LEVEL SECURITY;

--
-- Name: vinculo; Type: ROW SECURITY; Schema: core; Owner: -
--

ALTER TABLE core.vinculo ENABLE ROW LEVEL SECURITY;

--
-- Name: convocacao; Type: ROW SECURITY; Schema: eventos; Owner: -
--

ALTER TABLE eventos.convocacao ENABLE ROW LEVEL SECURITY;

--
-- Name: escala; Type: ROW SECURITY; Schema: eventos; Owner: -
--

ALTER TABLE eventos.escala ENABLE ROW LEVEL SECURITY;

--
-- Name: evento; Type: ROW SECURITY; Schema: eventos; Owner: -
--

ALTER TABLE eventos.evento ENABLE ROW LEVEL SECURITY;

--
-- Name: presenca; Type: ROW SECURITY; Schema: eventos; Owner: -
--

ALTER TABLE eventos.presenca ENABLE ROW LEVEL SECURITY;

--
-- Name: aviso_mural; Type: ROW SECURITY; Schema: gh; Owner: -
--

ALTER TABLE gh.aviso_mural ENABLE ROW LEVEL SECURITY;

--
-- Name: beneficio; Type: ROW SECURITY; Schema: gh; Owner: -
--

ALTER TABLE gh.beneficio ENABLE ROW LEVEL SECURITY;

--
-- Name: documento_gh; Type: ROW SECURITY; Schema: gh; Owner: -
--

ALTER TABLE gh.documento_gh ENABLE ROW LEVEL SECURITY;

--
-- Name: pessoa_beneficio; Type: ROW SECURITY; Schema: gh; Owner: -
--

ALTER TABLE gh.pessoa_beneficio ENABLE ROW LEVEL SECURITY;

--
-- Name: registro_ponto; Type: ROW SECURITY; Schema: gh; Owner: -
--

ALTER TABLE gh.registro_ponto ENABLE ROW LEVEL SECURITY;

--
-- Name: solicitacao; Type: ROW SECURITY; Schema: gh; Owner: -
--

ALTER TABLE gh.solicitacao ENABLE ROW LEVEL SECURITY;

--
-- Name: trilha_carreira; Type: ROW SECURITY; Schema: gh; Owner: -
--

ALTER TABLE gh.trilha_carreira ENABLE ROW LEVEL SECURITY;

--
-- Name: pessoa_dado_sensivel; Type: ROW SECURITY; Schema: sensivel; Owner: -
--

ALTER TABLE sensivel.pessoa_dado_sensivel ENABLE ROW LEVEL SECURITY;

--
-- Name: pessoa_dados_bancarios; Type: ROW SECURITY; Schema: sensivel; Owner: -
--

ALTER TABLE sensivel.pessoa_dados_bancarios ENABLE ROW LEVEL SECURITY;

--
-- Name: pessoa_documento; Type: ROW SECURITY; Schema: sensivel; Owner: -
--

ALTER TABLE sensivel.pessoa_documento ENABLE ROW LEVEL SECURITY;

--
-- PostgreSQL database dump complete
--


