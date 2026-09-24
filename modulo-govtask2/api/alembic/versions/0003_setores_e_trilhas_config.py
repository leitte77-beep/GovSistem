"""Setores por prefeitura, override de trilha e regra copiada na fase.

Revision ID: 0003_config
Revises: 0002_setor_usuario
Create Date: 2026-09-23
"""

import json
import uuid

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision = "0003_config"
down_revision = "0002_setor_usuario"
branch_labels = None
depends_on = None

# Dados congelados desta migration, como estavam em `app.core.trilhas` na
# época. Migration não importa código da aplicação: o código muda, ela não.
SETORES_PADRAO = (
    ("GABINETE", "Gabinete", False),
    ("ASSESSORIA", "Assessoria", False),
    ("JURIDICO", "Jurídico", False),
    ("CONTABILIDADE", "Contabilidade", False),
    ("ENGENHARIA", "Engenharia", False),
    ("LICITACAO", "Licitação", False),
    ("TESOURARIA", "Tesouraria", False),
    ("EXTERNO", "Órgão externo", True),
)


def _mapa_de_fases() -> dict:
    """codigo → regra padrão, para backfill do que já estava em curso."""
    return {
        "RECEBIMENTO": {
            "descricao": "O Assessor registra o que o Prefeito pediu.",
            "prazo_dias": 1,
            "exige_anexo": False,
            "rotulo_anexo": "",
            "aguarda_externo": False,
            "documentos_sugeridos": ["Anotação do pedido", "Mensagem ou e-mail recebido"],
        },
        "ELABORACAO_OFICIO": {
            "descricao": "O Jurídico ou o Gabinete redige o ofício / pedido formal.",
            "prazo_dias": 5,
            "exige_anexo": True,
            "rotulo_anexo": "Ofício elaborado (PDF ou DOCX)",
            "aguarda_externo": False,
            "documentos_sugeridos": ["Ofício", "Justificativa técnica"],
        },
        "ASSINATURA": {
            "descricao": "O ofício volta ao Gabinete para assinatura.",
            "prazo_dias": 2,
            "exige_anexo": True,
            "rotulo_anexo": "Ofício assinado",
            "aguarda_externo": False,
            "documentos_sugeridos": [],
        },
        "PROTOCOLO_GOV": {
            "descricao": "O Assessor protocola o ofício no sistema do órgão.",
            "prazo_dias": 3,
            "exige_anexo": True,
            "rotulo_anexo": "Comprovante de protocolo",
            "aguarda_externo": False,
            "documentos_sugeridos": [],
        },
        "ANALISE_ORGAO": {
            "descricao": "Fora da prefeitura. O Assessor só acompanha.",
            "prazo_dias": 60,
            "exige_anexo": False,
            "rotulo_anexo": "",
            "aguarda_externo": True,
            "documentos_sugeridos": ["Resposta do órgão", "Parecer", "Diligência recebida"],
        },
        "LIBERACAO_RECURSO": {
            "descricao": "Convênio, termo ou emenda publicados e recurso empenhado.",
            "prazo_dias": 30,
            "exige_anexo": True,
            "rotulo_anexo": "Convênio / termo / empenho",
            "aguarda_externo": False,
            "documentos_sugeridos": ["Termo de convênio", "Publicação no diário", "Empenho"],
        },
        "COMPRA": {
            "descricao": "O setor de Licitação conduz o processo de compra.",
            "prazo_dias": 45,
            "exige_anexo": True,
            "rotulo_anexo": "Homologação / contrato / nota de empenho",
            "aguarda_externo": False,
            "documentos_sugeridos": [],
        },
        "RECEBIMENTO_OBJETO": {
            "descricao": "O bem chegou. Anexe a nota fiscal e o termo de recebimento.",
            "prazo_dias": 30,
            "exige_anexo": True,
            "rotulo_anexo": "Nota fiscal / termo de recebimento",
            "aguarda_externo": False,
            "documentos_sugeridos": ["Nota fiscal", "Termo de recebimento", "Foto do bem"],
        },
        "PAGAMENTO": {
            "descricao": "A Tesouraria paga e anexa o comprovante.",
            "prazo_dias": 15,
            "exige_anexo": True,
            "rotulo_anexo": "Ordem bancária / comprovante de pagamento",
            "aguarda_externo": False,
            "documentos_sugeridos": [],
        },
        "CONCLUIDO": {
            "descricao": "Objeto entregue e prestação encerrada.",
            "prazo_dias": 1,
            "exige_anexo": False,
            "rotulo_anexo": "",
            "aguarda_externo": False,
            "documentos_sugeridos": [],
        },
        "PROJETO_ORCAMENTO": {
            "descricao": "A Engenharia elabora projeto, planilha e cronograma.",
            "prazo_dias": 30,
            "exige_anexo": True,
            "rotulo_anexo": "Projeto e planilha orçamentária",
            "aguarda_externo": False,
            "documentos_sugeridos": [
                "Projeto", "Planilha orçamentária", "Cronograma", "ART/RRT",
            ],
        },
        "LICITACAO": {
            "descricao": "Processo licitatório até a assinatura do contrato.",
            "prazo_dias": 60,
            "exige_anexo": True,
            "rotulo_anexo": "Contrato assinado",
            "aguarda_externo": False,
            "documentos_sugeridos": [],
        },
        "EXECUCAO": {
            "descricao": "Obra em andamento. Anexe cada medição e as fotos.",
            "prazo_dias": 180,
            "exige_anexo": True,
            "rotulo_anexo": "Termo de recebimento da obra",
            "aguarda_externo": False,
            "documentos_sugeridos": ["Medição", "Fotos da obra", "Diário de obra"],
        },
        "PRESTACAO_CONTAS": {
            "descricao": "A Contabilidade presta contas ao órgão concedente.",
            "prazo_dias": 60,
            "exige_anexo": True,
            "rotulo_anexo": "Prestação de contas enviada",
            "aguarda_externo": False,
            "documentos_sugeridos": [],
        },
    }


def upgrade() -> None:
    op.create_table(
        "setores",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column(
            "organization_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("organizations.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("codigo", sa.String(40), nullable=False),
        sa.Column("nome", sa.String(120), nullable=False),
        sa.Column("ativo", sa.Boolean(), nullable=False, server_default=sa.true()),
        sa.Column("sistema", sa.Boolean(), nullable=False, server_default=sa.false()),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.UniqueConstraint("organization_id", "codigo", name="uq_setor_org_codigo"),
    )
    op.create_index("ix_setores_organization_id", "setores", ["organization_id"])
    op.create_index("ix_setores_org_ativo", "setores", ["organization_id", "ativo"])

    op.create_table(
        "trilhas_config",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column(
            "organization_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("organizations.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("tipo", sa.String(20), nullable=False),
        sa.Column("fases", postgresql.JSONB(), nullable=False, server_default=sa.text("'[]'::jsonb")),
        sa.Column(
            "atualizado_por_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("users.id", ondelete="SET NULL"),
            nullable=True,
        ),
        sa.Column("atualizado_por_nome", sa.String(180), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.UniqueConstraint("organization_id", "tipo", name="uq_trilha_org_tipo"),
    )
    op.create_index(
        "ix_trilhas_config_organization_id", "trilhas_config", ["organization_id"]
    )

    # A fase passa a carregar a própria regra, copiada da trilha na abertura.
    op.add_column("fases_pedido", sa.Column("descricao", sa.Text(), nullable=True))
    op.add_column(
        "fases_pedido",
        sa.Column("prazo_dias", sa.Integer(), nullable=False, server_default="5"),
    )
    op.add_column(
        "fases_pedido",
        sa.Column("exige_anexo", sa.Boolean(), nullable=False, server_default=sa.false()),
    )
    op.add_column(
        "fases_pedido",
        sa.Column("rotulo_anexo", sa.String(160), nullable=False, server_default=""),
    )
    op.add_column(
        "fases_pedido",
        sa.Column("aguarda_externo", sa.Boolean(), nullable=False, server_default=sa.false()),
    )
    op.add_column(
        "fases_pedido",
        sa.Column(
            "documentos_sugeridos",
            postgresql.JSONB(),
            nullable=False,
            server_default=sa.text("'[]'::jsonb"),
        ),
    )

    conn = op.get_bind()

    # Semeia os setores padrão nas prefeituras que já existem.
    organizacoes = conn.execute(sa.text("SELECT id FROM organizations")).fetchall()
    for (org_id,) in organizacoes:
        for codigo, nome, sistema in SETORES_PADRAO:
            conn.execute(
                sa.text(
                    "INSERT INTO setores (id, organization_id, codigo, nome, ativo, sistema) "
                    "VALUES (:id, :org, :codigo, :nome, true, :sistema) "
                    "ON CONFLICT (organization_id, codigo) DO NOTHING"
                ),
                {
                    "id": str(uuid.uuid4()),
                    "org": str(org_id),
                    "codigo": codigo,
                    "nome": nome,
                    "sistema": sistema,
                },
            )

    # Backfill das fases já materializadas, pelo código.
    mapa = _mapa_de_fases()
    codigos = conn.execute(
        sa.text("SELECT DISTINCT codigo FROM fases_pedido")
    ).fetchall()
    for (codigo,) in codigos:
        regra = mapa.get(codigo)
        if regra is None:
            continue
        conn.execute(
            sa.text(
                "UPDATE fases_pedido SET descricao = :descricao, prazo_dias = :prazo, "
                "exige_anexo = :exige, rotulo_anexo = :rotulo, aguarda_externo = :aguarda, "
                "documentos_sugeridos = CAST(:docs AS JSONB) WHERE codigo = :codigo"
            ),
            {
                "descricao": regra["descricao"],
                "prazo": regra["prazo_dias"],
                "exige": regra["exige_anexo"],
                "rotulo": regra["rotulo_anexo"],
                "aguarda": regra["aguarda_externo"],
                "docs": json.dumps(regra["documentos_sugeridos"]),
                "codigo": codigo,
            },
        )

    # Remove os defaults de servidor: quem preenche é a aplicação.
    for coluna in (
        "prazo_dias",
        "exige_anexo",
        "rotulo_anexo",
        "aguarda_externo",
        "documentos_sugeridos",
    ):
        op.alter_column("fases_pedido", coluna, server_default=None)


def downgrade() -> None:
    for coluna in (
        "documentos_sugeridos",
        "aguarda_externo",
        "rotulo_anexo",
        "exige_anexo",
        "prazo_dias",
        "descricao",
    ):
        op.drop_column("fases_pedido", coluna)
    op.drop_table("trilhas_config")
    op.drop_table("setores")
