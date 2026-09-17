"""Comentários, checklists, financeiro gerencial, visões salvas, busca e obra na demanda.

Fecha as lacunas de §32/§42/§43/§48/§50/§54/§59/§61/§67/§131 do núcleo v2.

Revision ID: e8f9a0b1c2d3
Revises: d7e8f9a0b1c2
"""

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision = "e8f9a0b1c2d3"
down_revision = "d7e8f9a0b1c2"
branch_labels = None
depends_on = None

UUID = postgresql.UUID(as_uuid=True)

# ── Busca (§48, §131) ───────────────────────────────────────────────────────
#
# Duas estruturas, porque uma só não resolve:
#
# 1. `busca_tsv` (full-text, GIN) com uma configuração própria que aplica
#    `unaccent` antes do stemmer português. Sem isso, quem digita "ambulancia"
#    não encontra "ambulância" — e no Brasil se digita sem acento o tempo todo.
#    Cuida também de flexão verbal ("protocolar" acha "protocolado"), de plural
#    regular ("veiculo" acha "veículos"), da relevância por campo e da sintaxe
#    de buscador.
#
# 2. `busca_texto` (trigrama, GIN) com o mesmo conteúdo em minúsculas. Existe
#    porque o stemmer snowball **não** unifica palavras curtas nem -ção/-ções:
#    "obra" não casa "obras", "aquisição" não casa "aquisições". Verificado
#    contra o PostgreSQL 16, não suposto. O trigrama cobre esse caso e, de
#    quebra, torna a busca por pedaço de palavra indexada em vez de varredura.
#
# A consulta usa as duas em OR: o que o full-text não pegar, o trigrama pega.
CONFIG_FTS = "portugues_govtask"

CAMPOS_BUSCA = [
    ("numero", "A"),
    ("titulo", "A"),
    ("objeto", "B"),
    ("assunto", "B"),
    ("resumo_executivo", "C"),
    ("descricao", "C"),
    ("programa", "D"),
    ("orgao_concedente", "D"),
]

EXPRESSAO_FTS = " ||\n    ".join(
    f"setweight(to_tsvector('{CONFIG_FTS}', coalesce({campo}, '')), '{peso}')"
    for campo, peso in CAMPOS_BUSCA
)

# `unaccent()` é STABLE, não IMMUTABLE, então não pode entrar em coluna gerada.
# O acento fica a cargo do caminho full-text; aqui basta minúsculas.
EXPRESSAO_TEXTO = " || ' ' || ".join(
    f"lower(coalesce({campo}, ''))" for campo, _ in CAMPOS_BUSCA
)


def _timestamps() -> list[sa.Column]:
    return [
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
    ]


def upgrade() -> None:
    # ── Conversa da demanda (§42, §43) ──────────────────────────────────────
    op.create_table(
        "comentarios_demanda",
        sa.Column("id", UUID, primary_key=True),
        sa.Column(
            "organization_id",
            UUID,
            sa.ForeignKey("organizations.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column(
            "demanda_id",
            UUID,
            sa.ForeignKey("demandas.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("tarefa_id", UUID, sa.ForeignKey("tarefas.id", ondelete="CASCADE")),
        sa.Column(
            "responde_a_id",
            UUID,
            sa.ForeignKey("comentarios_demanda.id", ondelete="CASCADE"),
        ),
        sa.Column(
            "autor_id", UUID, sa.ForeignKey("users.id", ondelete="RESTRICT"), nullable=False
        ),
        sa.Column("texto", sa.Text(), nullable=False),
        sa.Column("fixado", sa.Boolean(), nullable=False, server_default=sa.false()),
        sa.Column("editado_em", sa.DateTime(timezone=True)),
        sa.Column("deleted_at", sa.DateTime(timezone=True)),
        *_timestamps(),
    )
    op.create_index(
        "ix_comentarios_demanda_organization_id", "comentarios_demanda", ["organization_id"]
    )
    op.create_index("ix_comentarios_demanda_demanda_id", "comentarios_demanda", ["demanda_id"])
    op.create_index(
        "ix_comentarios_demanda_responde_a_id", "comentarios_demanda", ["responde_a_id"]
    )

    op.create_table(
        "comentario_revisoes",
        sa.Column("id", UUID, primary_key=True),
        sa.Column(
            "comentario_id",
            UUID,
            sa.ForeignKey("comentarios_demanda.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("texto_anterior", sa.Text(), nullable=False),
        sa.Column(
            "editado_por_id",
            UUID,
            sa.ForeignKey("users.id", ondelete="RESTRICT"),
            nullable=False,
        ),
        *_timestamps(),
    )
    op.create_index(
        "ix_comentario_revisoes_comentario_id", "comentario_revisoes", ["comentario_id"]
    )

    op.create_table(
        "comentario_mencoes",
        sa.Column("id", UUID, primary_key=True),
        sa.Column(
            "comentario_id",
            UUID,
            sa.ForeignKey("comentarios_demanda.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column(
            "user_id", UUID, sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False
        ),
        sa.Column("lido_em", sa.DateTime(timezone=True)),
        *_timestamps(),
    )
    op.create_index(
        "ix_comentario_mencoes_comentario_id", "comentario_mencoes", ["comentario_id"]
    )
    op.create_index("ix_comentario_mencoes_user_id", "comentario_mencoes", ["user_id"])

    # ── Checklists (§32, §67) ───────────────────────────────────────────────
    op.create_table(
        "checklists",
        sa.Column("id", UUID, primary_key=True),
        sa.Column(
            "organization_id",
            UUID,
            sa.ForeignKey("organizations.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column(
            "demanda_id",
            UUID,
            sa.ForeignKey("demandas.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("etapa_id", UUID, sa.ForeignKey("etapas.id", ondelete="CASCADE")),
        sa.Column("titulo", sa.String(200), nullable=False),
        sa.Column("descricao", sa.Text()),
        sa.Column("obrigatorio", sa.Boolean(), nullable=False, server_default=sa.false()),
        sa.Column(
            "criado_por_id",
            UUID,
            sa.ForeignKey("users.id", ondelete="RESTRICT"),
            nullable=False,
        ),
        sa.Column("deleted_at", sa.DateTime(timezone=True)),
        *_timestamps(),
    )
    op.create_index("ix_checklists_organization_id", "checklists", ["organization_id"])
    op.create_index("ix_checklists_demanda_id", "checklists", ["demanda_id"])

    op.create_table(
        "checklist_itens",
        sa.Column("id", UUID, primary_key=True),
        sa.Column(
            "checklist_id",
            UUID,
            sa.ForeignKey("checklists.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("descricao", sa.String(300), nullable=False),
        sa.Column("ordem", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("obrigatorio", sa.Boolean(), nullable=False, server_default=sa.true()),
        sa.Column(
            "exige_documento", sa.Boolean(), nullable=False, server_default=sa.false()
        ),
        sa.Column("documento_id", UUID, sa.ForeignKey("anexos.id", ondelete="SET NULL")),
        sa.Column("observacao", sa.Text()),
        sa.Column("concluido_em", sa.DateTime(timezone=True)),
        sa.Column("concluido_por_id", UUID, sa.ForeignKey("users.id", ondelete="SET NULL")),
        sa.Column("deleted_at", sa.DateTime(timezone=True)),
        *_timestamps(),
    )
    op.create_index("ix_checklist_itens_checklist_id", "checklist_itens", ["checklist_id"])

    # ── Financeiro gerencial (§59, §61) ─────────────────────────────────────
    op.create_table(
        "demanda_registros_financeiros",
        sa.Column("id", UUID, primary_key=True),
        sa.Column(
            "organization_id",
            UUID,
            sa.ForeignKey("organizations.id", ondelete="RESTRICT"),
            nullable=False,
        ),
        sa.Column(
            "demanda_id",
            UUID,
            sa.ForeignKey("demandas.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("tipo", sa.String(30), nullable=False),
        sa.Column("valor", sa.Numeric(15, 2), nullable=False),
        sa.Column("data_registro", sa.Date(), nullable=False),
        sa.Column("numero_documento", sa.String(120)),
        sa.Column("fonte_recurso", sa.String(40)),
        sa.Column("favorecido", sa.String(255)),
        sa.Column("descricao", sa.Text()),
        sa.Column("documento_id", UUID, sa.ForeignKey("anexos.id", ondelete="SET NULL")),
        sa.Column(
            "registrado_por_id",
            UUID,
            sa.ForeignKey("users.id", ondelete="RESTRICT"),
            nullable=False,
        ),
        sa.Column("deleted_at", sa.DateTime(timezone=True)),
        *_timestamps(),
    )
    for coluna in ("organization_id", "demanda_id", "tipo", "data_registro"):
        op.create_index(
            f"ix_demanda_registros_financeiros_{coluna}",
            "demanda_registros_financeiros",
            [coluna],
        )

    for coluna in (
        "valor_contrapartida",
        "valor_licitado",
        "valor_empenhado",
        "valor_liquidado",
        "valor_pago",
    ):
        op.add_column("demandas", sa.Column(coluna, sa.Numeric(15, 2), nullable=True))

    # ── Visões salvas (§49, §50) ────────────────────────────────────────────
    op.create_table(
        "visoes_salvas",
        sa.Column("id", UUID, primary_key=True),
        sa.Column(
            "organization_id",
            UUID,
            sa.ForeignKey("organizations.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column(
            "user_id", UUID, sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False
        ),
        sa.Column("nome", sa.String(120), nullable=False),
        sa.Column("descricao", sa.String(400)),
        sa.Column("recurso", sa.String(20), nullable=False, server_default="DEMANDAS"),
        sa.Column("filtros", sa.JSON(), nullable=False),
        sa.Column("layout", sa.String(20), nullable=False, server_default="LISTA"),
        sa.Column("compartilhada", sa.Boolean(), nullable=False, server_default=sa.false()),
        sa.Column("padrao", sa.Boolean(), nullable=False, server_default=sa.false()),
        sa.Column("deleted_at", sa.DateTime(timezone=True)),
        *_timestamps(),
        sa.UniqueConstraint(
            "organization_id", "user_id", "nome", name="uq_visao_org_user_nome"
        ),
    )
    for coluna in ("organization_id", "user_id", "recurso", "compartilhada"):
        op.create_index(f"ix_visoes_salvas_{coluna}", "visoes_salvas", [coluna])

    # ── Obra como faceta da demanda (§54) ───────────────────────────────────
    # As obras existentes continuam penduradas no convênio; por isso a coluna
    # antiga passa a aceitar nulo em vez de ser substituída.
    op.add_column(
        "obras",
        sa.Column("demanda_id", UUID, sa.ForeignKey("demandas.id", ondelete="CASCADE")),
    )
    op.create_index("ix_obras_demanda_id", "obras", ["demanda_id"])
    op.alter_column("obras", "convenio_id", existing_type=UUID, nullable=True)
    # Obra de convênio convertido em demanda ganha o vínculo novo sem perder o
    # antigo: as duas telas continuam encontrando a mesma obra.
    #
    # A conversão da v2 não guardou uma coluna convênio→demanda, mas religou a
    # timeline: os eventos convertidos carregam os dois ids. É essa
    # correspondência que usamos aqui, restrita aos convênios que produziram
    # exatamente uma demanda — se houver ambiguidade, a obra fica só no convênio
    # e um humano decide, em vez de a migração adivinhar.
    op.execute(
        """
        WITH pares AS (
            -- array_agg e não MIN: o PostgreSQL não tem MIN(uuid). Como o filtro
            -- adiante exige uma única demanda por convênio, o primeiro elemento
            -- é o único.
            SELECT convenio_id,
                   (array_agg(DISTINCT demanda_id))[1] AS demanda_id,
                   COUNT(DISTINCT demanda_id) AS quantas
              FROM eventos_timeline
             WHERE convenio_id IS NOT NULL AND demanda_id IS NOT NULL
             GROUP BY convenio_id
        )
        UPDATE obras o
           SET demanda_id = p.demanda_id
          FROM pares p
         WHERE p.convenio_id = o.convenio_id
           AND p.quantas = 1
           AND o.demanda_id IS NULL
        """
    )
    op.create_check_constraint(
        "ck_obras_tem_pai",
        "obras",
        "convenio_id IS NOT NULL OR demanda_id IS NOT NULL",
    )

    # ── Busca (§48, §131) ───────────────────────────────────────────────────
    op.execute("CREATE EXTENSION IF NOT EXISTS unaccent")
    op.execute("CREATE EXTENSION IF NOT EXISTS pg_trgm")
    # A configuração é criada a partir da portuguesa e passa a remover acento
    # antes de reduzir a palavra ao radical.
    op.execute(
        f"DROP TEXT SEARCH CONFIGURATION IF EXISTS {CONFIG_FTS}"
    )
    op.execute(
        f"CREATE TEXT SEARCH CONFIGURATION {CONFIG_FTS} (COPY = portuguese)"
    )
    op.execute(
        f"ALTER TEXT SEARCH CONFIGURATION {CONFIG_FTS} "
        "ALTER MAPPING FOR hword, hword_part, word WITH unaccent, portuguese_stem"
    )
    # Colunas geradas: o PostgreSQL as mantém em sincronia sozinho, sem trigger
    # que alguém possa esquecer de recriar depois de um restore.
    op.execute(
        f"ALTER TABLE demandas ADD COLUMN busca_tsv tsvector "
        f"GENERATED ALWAYS AS ({EXPRESSAO_FTS}) STORED"
    )
    op.execute("CREATE INDEX ix_demandas_busca_tsv ON demandas USING GIN (busca_tsv)")
    op.execute(
        f"ALTER TABLE demandas ADD COLUMN busca_texto text "
        f"GENERATED ALWAYS AS ({EXPRESSAO_TEXTO}) STORED"
    )
    op.execute(
        "CREATE INDEX ix_demandas_busca_texto ON demandas "
        "USING GIN (busca_texto gin_trgm_ops)"
    )


def downgrade() -> None:
    op.execute("DROP INDEX IF EXISTS ix_demandas_busca_texto")
    op.execute("ALTER TABLE demandas DROP COLUMN IF EXISTS busca_texto")
    op.execute("DROP INDEX IF EXISTS ix_demandas_busca_tsv")
    op.execute("ALTER TABLE demandas DROP COLUMN IF EXISTS busca_tsv")
    # A configuração sai; as extensões ficam, porque outros módulos do banco
    # compartilhado podem depender delas.
    op.execute(f"DROP TEXT SEARCH CONFIGURATION IF EXISTS {CONFIG_FTS}")

    op.drop_constraint("ck_obras_tem_pai", "obras", type_="check")
    op.execute("UPDATE obras SET demanda_id = NULL WHERE convenio_id IS NOT NULL")
    # Obra que só existia sob uma demanda não tem convênio para onde voltar:
    # o downgrade a remove logicamente em vez de violar o NOT NULL restaurado.
    op.execute(
        "UPDATE obras SET deleted_at = now() "
        "WHERE convenio_id IS NULL AND deleted_at IS NULL"
    )
    op.execute("DELETE FROM obras WHERE convenio_id IS NULL")
    op.drop_index("ix_obras_demanda_id", table_name="obras")
    op.drop_column("obras", "demanda_id")
    op.alter_column("obras", "convenio_id", existing_type=UUID, nullable=False)

    op.drop_table("visoes_salvas")

    for coluna in (
        "valor_pago",
        "valor_liquidado",
        "valor_empenhado",
        "valor_licitado",
        "valor_contrapartida",
    ):
        op.drop_column("demandas", coluna)
    op.drop_table("demanda_registros_financeiros")

    op.drop_table("checklist_itens")
    op.drop_table("checklists")

    op.drop_table("comentario_mencoes")
    op.drop_table("comentario_revisoes")
    op.drop_table("comentarios_demanda")
