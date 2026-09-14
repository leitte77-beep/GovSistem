import importlib.util
from pathlib import Path

import pytest
import sqlalchemy as sa

_path = (
    Path(__file__).parents[1]
    / "alembic/versions/k8l9m0n1o2p3_allow_reusing_deleted_document_model_slugs.py"
)
_spec = importlib.util.spec_from_file_location("document_model_slug_migration", _path)
assert _spec and _spec.loader
migration = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(migration)


def test_downgrade_guard_rejects_duplicates_before_dropping_index(monkeypatch):
    engine = sa.create_engine("sqlite://")
    with engine.begin() as connection:
        connection.execute(
            sa.text(
                "CREATE TABLE document_models ("
                "organization_id TEXT NOT NULL, slug TEXT NOT NULL, deleted_at TEXT)"
            )
        )
        connection.execute(
            sa.text(
                "INSERT INTO document_models VALUES "
                "('org-1', 'portaria', NULL), ('org-1', 'portaria', '2026-09-11')"
            )
        )

        dropped_indexes = []
        monkeypatch.setattr(migration.op, "get_bind", lambda: connection)
        monkeypatch.setattr(
            migration.op,
            "drop_index",
            lambda *args, **kwargs: dropped_indexes.append((args, kwargs)),
        )

        with pytest.raises(RuntimeError, match="downgrade.*slugs duplicados"):
            migration.downgrade()

        assert dropped_indexes == []
