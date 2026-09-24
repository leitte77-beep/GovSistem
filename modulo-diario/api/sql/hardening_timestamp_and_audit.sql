-- Hardening Fase 3/5 — Tabelas aditivas (idempotente).
-- Aplicar no passo de deploy: psql -d modulo_diario -f sql/hardening_timestamp_and_audit.sql
-- Nenhuma alteração destrutiva; não toca documentos oficiais nem edições existentes.

DO $$
BEGIN
    -- TimestampRecord
    CREATE TABLE IF NOT EXISTS timestamp_records (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
        edition_id UUID NOT NULL REFERENCES editions(id) ON DELETE RESTRICT,
        signature_id UUID REFERENCES signatures(id) ON DELETE RESTRICT,
        provider VARCHAR(50) NOT NULL DEFAULT 'rfc3161',
        tsa_name VARCHAR(255),
        tsa_url VARCHAR(500),
        serial_number VARCHAR(100),
        policy_oid VARCHAR(100),
        message_imprint_algorithm VARCHAR(50),
        message_imprint VARCHAR(200),
        gen_time TIMESTAMPTZ,
        token TEXT,
        token_ref VARCHAR(1000),
        status VARCHAR(50) NOT NULL DEFAULT 'pending_validation',
        validation_status VARCHAR(50) NOT NULL DEFAULT 'pending_validation',
        validation_details JSON,
        validated_at TIMESTAMPTZ
    );
    CREATE INDEX IF NOT EXISTS ix_timestamp_records_organization_id ON timestamp_records(organization_id);
    CREATE INDEX IF NOT EXISTS ix_timestamp_records_edition_id ON timestamp_records(edition_id);
    CREATE INDEX IF NOT EXISTS ix_timestamp_records_signature_id ON timestamp_records(signature_id);

    -- SignatureOperationAudit
    CREATE TABLE IF NOT EXISTS signature_operation_audits (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        operation_id VARCHAR(64) NOT NULL UNIQUE,
        organization_id UUID,
        edition_id UUID,
        credential_id UUID,
        provider VARCHAR(50),
        requested_by UUID,
        requested_at TIMESTAMPTZ,
        started_at TIMESTAMPTZ,
        finished_at TIMESTAMPTZ,
        result VARCHAR(50),
        source_hash VARCHAR(64),
        signed_hash VARCHAR(64),
        certificate_serial VARCHAR(100),
        correlation_id VARCHAR(64),
        client_service VARCHAR(100),
        error TEXT
    );
    CREATE INDEX IF NOT EXISTS ix_signature_operation_audits_operation_id ON signature_operation_audits(operation_id);
    CREATE INDEX IF NOT EXISTS ix_signature_operation_audits_organization_id ON signature_operation_audits(organization_id);
    CREATE INDEX IF NOT EXISTS ix_signature_operation_audits_edition_id ON signature_operation_audits(edition_id);
    CREATE INDEX IF NOT EXISTS ix_signature_operation_audits_credential_id ON signature_operation_audits(credential_id);
END $$;

DO $$
BEGIN
    CREATE TABLE IF NOT EXISTS trust_anchors (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        organization_id UUID REFERENCES organizations(id) ON DELETE CASCADE,
        issuer VARCHAR(500),
        subject VARCHAR(500),
        serial VARCHAR(100),
        thumbprint VARCHAR(100),
        valid_from TIMESTAMPTZ,
        valid_to TIMESTAMPTZ,
        source VARCHAR(50),
        pem VARCHAR(4096) NOT NULL,
        enabled BOOLEAN NOT NULL DEFAULT true
    );
    CREATE INDEX IF NOT EXISTS ix_trust_anchors_organization_id ON trust_anchors(organization_id);
    CREATE INDEX IF NOT EXISTS ix_trust_anchors_thumbprint ON trust_anchors(thumbprint);
END $$;

DO $$
BEGIN
    ALTER TABLE editions ADD COLUMN IF NOT EXISTS verification_code_hash VARCHAR(64);
    ALTER TABLE editions ALTER COLUMN verification_code TYPE VARCHAR(64);
END $$;

DO $$
BEGIN
    CREATE TABLE IF NOT EXISTS matter_versions (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
        matter_id UUID NOT NULL REFERENCES matters(id) ON DELETE CASCADE,
        version_number INTEGER NOT NULL,
        canonical_content JSONB,
        rendered_html TEXT,
        content_hash VARCHAR(64) NOT NULL,
        created_by UUID REFERENCES users(id) ON DELETE SET NULL,
        change_reason VARCHAR(255),
        source VARCHAR(20),
        matter_status VARCHAR(20)
    );
    CREATE INDEX IF NOT EXISTS ix_matter_versions_organization_id ON matter_versions(organization_id);
    CREATE INDEX IF NOT EXISTS ix_matter_versions_matter_id ON matter_versions(matter_id);
    CREATE UNIQUE INDEX IF NOT EXISTS uq_matter_versions_matter_number ON matter_versions(matter_id, version_number);
END $$;

DO $$
BEGIN
    CREATE TABLE IF NOT EXISTS matter_reviews (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
        matter_id UUID NOT NULL REFERENCES matters(id) ON DELETE CASCADE,
        version_id UUID REFERENCES matter_versions(id) ON DELETE SET NULL,
        content_hash VARCHAR(64) NOT NULL,
        render_hash VARCHAR(64),
        reviewed_by UUID REFERENCES users(id) ON DELETE SET NULL,
        reviewed_at TIMESTAMPTZ,
        approved BOOLEAN NOT NULL DEFAULT true,
        comments TEXT,
        status VARCHAR(30) NOT NULL DEFAULT 'active',
        invalidated_at TIMESTAMPTZ
    );
    CREATE INDEX IF NOT EXISTS ix_matter_reviews_organization_id ON matter_reviews(organization_id);
    CREATE INDEX IF NOT EXISTS ix_matter_reviews_matter_id ON matter_reviews(matter_id);
    CREATE INDEX IF NOT EXISTS ix_matter_reviews_version_id ON matter_reviews(version_id);
END $$;

DO $$
BEGIN
    CREATE TABLE IF NOT EXISTS integration_clients (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        deleted_at TIMESTAMPTZ,
        organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
        name VARCHAR(255) NOT NULL,
        client_id VARCHAR(255) NOT NULL UNIQUE,
        hashed_api_key VARCHAR(128) NOT NULL,
        status VARCHAR(20) NOT NULL DEFAULT 'active',
        scopes JSON NOT NULL DEFAULT '{}',
        last_used_at TIMESTAMPTZ
    );
    CREATE INDEX IF NOT EXISTS ix_integration_clients_organization_id ON integration_clients(organization_id);
    CREATE UNIQUE INDEX IF NOT EXISTS uq_integration_clients_client_id ON integration_clients(client_id);

    CREATE TABLE IF NOT EXISTS integration_idempotency_keys (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        integration_client_id UUID NOT NULL REFERENCES integration_clients(id) ON DELETE CASCADE,
        organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
        idempotency_key VARCHAR(255) NOT NULL,
        request_hash VARCHAR(64) NOT NULL,
        result_entity_id UUID,
        response_json JSONB
    );
    CREATE INDEX IF NOT EXISTS ix_integration_idempotency_keys_client ON integration_idempotency_keys(integration_client_id);
    CREATE UNIQUE INDEX IF NOT EXISTS uq_integration_idempotency_client_key ON integration_idempotency_keys(integration_client_id, idempotency_key);
END $$;

DO $$
BEGIN
    CREATE TABLE IF NOT EXISTS legacy_url_maps (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
        legacy_url VARCHAR(1000) NOT NULL UNIQUE,
        entity_type VARCHAR(30),
        entity_id UUID,
        new_path VARCHAR(1000) NOT NULL,
        status VARCHAR(20) NOT NULL DEFAULT 'active'
    );
    CREATE INDEX IF NOT EXISTS ix_legacy_url_maps_organization_id ON legacy_url_maps(organization_id);
    CREATE INDEX IF NOT EXISTS ix_legacy_url_maps_legacy_url ON legacy_url_maps(legacy_url);
END $$;
