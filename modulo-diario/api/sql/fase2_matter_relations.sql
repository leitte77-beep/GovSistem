-- Fase 2 — additive table: matter_relations (PostgreSQL, idempotent)
-- Deploy note: this project's alembic head graph is mid-rebase (multiple
-- heads present in the working tree), so an alembic revision file was NOT
-- authored. Apply this idempotent DDL as the deployment step AFTER heads are
-- consolidated, or create a proper alembic revision on a clean graph.
-- The SQLAlchemy model (app.models.matter_relation.MatterRelation) is the
-- source of truth and is exercised by tests via create_all.

CREATE TABLE IF NOT EXISTS matter_relations (
    id UUID NOT NULL,
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    source_matter_id UUID NOT NULL REFERENCES matters(id) ON DELETE RESTRICT,
    target_matter_id UUID NOT NULL REFERENCES matters(id) ON DELETE RESTRICT,
    relation_type VARCHAR(20) NOT NULL,
    notes TEXT,
    created_by UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (id)
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_matter_relation_org_src_tgt_type
    ON matter_relations (organization_id, source_matter_id, target_matter_id, relation_type);

CREATE INDEX IF NOT EXISTS ix_matter_relations_organization_id
    ON matter_relations (organization_id);
CREATE INDEX IF NOT EXISTS ix_matter_relations_source_matter_id
    ON matter_relations (source_matter_id);
CREATE INDEX IF NOT EXISTS ix_matter_relations_target_matter_id
    ON matter_relations (target_matter_id);
CREATE INDEX IF NOT EXISTS ix_matter_relations_relation_type
    ON matter_relations (relation_type);

ALTER TABLE matter_relations DROP CONSTRAINT IF EXISTS ck_matter_relation_not_self;
ALTER TABLE matter_relations ADD CONSTRAINT ck_matter_relation_not_self
    CHECK (source_matter_id <> target_matter_id);
