-- Migration 002: Tabelas para integração SSO com SaaS GovSistem
-- Cria organizacoes e usuarios locais populados via internal sync.

CREATE TABLE govavalia.organizacoes (
    id          UUID PRIMARY KEY,
    nome        TEXT NOT NULL,
    slug        TEXT NOT NULL UNIQUE,
    cnpj        TEXT,
    logo_url    TEXT,
    is_active   BOOLEAN NOT NULL DEFAULT true,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE govavalia.usuarios (
    id                UUID PRIMARY KEY,
    organization_id   UUID REFERENCES govavalia.organizacoes(id),
    nome              TEXT NOT NULL,
    email             TEXT NOT NULL UNIQUE,
    is_active         BOOLEAN NOT NULL DEFAULT true,
    created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Perfis (roles) do usuário dentro do módulo
CREATE TABLE govavalia.usuario_perfil (
    usuario_id UUID NOT NULL REFERENCES govavalia.usuarios(id) ON DELETE CASCADE,
    perfil     TEXT NOT NULL CHECK (perfil IN ('gestor', 'ouvidoria')),
    PRIMARY KEY (usuario_id, perfil)
);

CREATE INDEX idx_usuarios_email       ON govavalia.usuarios(email);
CREATE INDEX idx_usuarios_org         ON govavalia.usuarios(organization_id);
CREATE INDEX idx_usuario_perfil_user  ON govavalia.usuario_perfil(usuario_id);
