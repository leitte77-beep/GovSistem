"""Ambiente Alembic (síncrono) do GovSaúde.

``include_schemas=True`` faz o autogenerate comparar também o schema
``referencia``. ``include_object`` remove do diff os objetos que não pertencem
ao metadata do módulo (tabelas de extensões PostGIS, partições mensais criadas
por função, tabela de versão do Alembic etc.). Sem esse filtro, o
``alembic check`` produz centenas de falsos positivos e esconde divergência
real.
"""

from __future__ import annotations

from logging.config import fileConfig

from sqlalchemy import create_engine, pool, text

from alembic import context
from app.core.config import settings
from app.models import Base

config = context.config
if config.config_file_name is not None:
    fileConfig(config.config_file_name)

target_metadata = Base.metadata

_SCHEMAS_COMPARADOS = {None, "public", "referencia"}
_TABELAS_IGNORADAS = {
    "alembic_version",
    "spatial_ref_sys",
    "geography_columns",
    "geometry_columns",
    "raster_columns",
    "raster_overviews",
}
_TABELAS_EXTENSOES: set[str] = set()


def _carregar_tabelas_extensoes(connection) -> None:
    """Descobre tabelas/view de extensões (PostGIS, tiger, topology etc.)."""
    global _TABELAS_EXTENSOES
    if connection.dialect.name != "postgresql":
        return
    try:
        with connection.begin():
            _TABELAS_EXTENSOES = set(
                connection.execute(
                    text(
                        """
                        SELECT c.relname
                        FROM pg_class c
                        JOIN pg_namespace n ON n.oid = c.relnamespace
                        JOIN pg_depend d
                          ON d.objid = c.oid AND d.classid = 'pg_class'::regclass
                        JOIN pg_extension e ON e.oid = d.refobjid
                        WHERE d.deptype = 'e'
                          AND c.relkind IN ('r', 'v', 'm', 'p')
                        """
                    )
                ).scalars().all()
            )
    except Exception:  # noqa: BLE001 - banco sem catálogo de extensões
        _TABELAS_EXTENSOES = set()


def _include_object(object_, name, type_, reflected, compare_to):
    if type_ == "table":
        schema = getattr(object_, "schema", None)
        if schema not in _SCHEMAS_COMPARADOS:
            return False
        if name in _TABELAS_IGNORADAS or name in _TABELAS_EXTENSOES:
            return False
        # Partições são criadas por função no PostgreSQL e não vivem no metadata.
        if name.startswith("audit_trail_") or name.startswith("integracao_envios_"):
            return False
        return True
    if type_ == "index":
        tabela = getattr(object_, "table", None)
        if tabela is not None:
            return _include_object(tabela, tabela.name, "table", reflected, None)
        return True
    if type_ == "sequence":
        return getattr(object_, "schema", None) in _SCHEMAS_COMPARADOS
    return True


def _configure(connection=None) -> None:
    kwargs = {
        "target_metadata": target_metadata,
        "compare_type": True,
        "include_schemas": True,
        "include_object": _include_object,
    }
    if connection is not None:
        _carregar_tabelas_extensoes(connection)
        kwargs["connection"] = connection
    context.configure(**kwargs)


def run_migrations_offline() -> None:
    context.configure(
        url=settings.DATABASE_URL_SYNC,
        target_metadata=target_metadata,
        literal_binds=True,
        dialect_opts={"paramstyle": "named"},
        compare_type=True,
        include_schemas=True,
        include_object=_include_object,
    )
    with context.begin_transaction():
        context.run_migrations()


def run_migrations_online() -> None:
    engine = create_engine(settings.DATABASE_URL_SYNC, poolclass=pool.NullPool)
    with engine.connect() as connection:
        _configure(connection)
        with context.begin_transaction():
            context.run_migrations()
    engine.dispose()


if context.is_offline_mode():
    run_migrations_offline()
else:
    run_migrations_online()
