"""Motor de workflow configurável e versionado.

Cria o desenho do fluxo (workflow → versão → etapa → tarefa-modelo), liga a
etapa instanciada à receita que a originou e publica os quatro modelos padrão
do sistema.

Revision ID: e2f3a4b5c6d7
Revises: d1e2f3a4b5c6
"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "e2f3a4b5c6d7"
down_revision: Union[str, Sequence[str], None] = "d1e2f3a4b5c6"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

UUID = postgresql.UUID(as_uuid=True)


def upgrade() -> None:
    op.create_table(
        "workflows",
        sa.Column("id", UUID, primary_key=True),
        sa.Column("organization_id", UUID, sa.ForeignKey("organizations.id", ondelete="CASCADE"), nullable=True),
        sa.Column("chave", sa.String(60), nullable=False),
        sa.Column("nome", sa.String(255), nullable=False),
        sa.Column("descricao", sa.Text(), nullable=True),
        sa.Column("tipo_demanda_id", UUID, sa.ForeignKey("demanda_tipos.id", ondelete="SET NULL"), nullable=True),
        sa.Column("ativo", sa.Boolean(), nullable=False, server_default=sa.true()),
        sa.Column("is_system", sa.Boolean(), nullable=False, server_default=sa.false()),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("deleted_at", sa.DateTime(timezone=True), nullable=True),
        sa.UniqueConstraint("organization_id", "chave", name="uq_workflow_org_chave"),
    )
    for col in ("organization_id", "chave", "tipo_demanda_id"):
        op.create_index(f"ix_workflows_{col}", "workflows", [col])

    op.create_table(
        "workflow_versoes",
        sa.Column("id", UUID, primary_key=True),
        sa.Column("workflow_id", UUID, sa.ForeignKey("workflows.id", ondelete="CASCADE"), nullable=False),
        sa.Column("versao", sa.Integer(), nullable=False, server_default="1"),
        sa.Column("status", sa.String(20), nullable=False, server_default="RASCUNHO"),
        sa.Column("notas", sa.Text(), nullable=True),
        sa.Column("publicada_em", sa.DateTime(timezone=True), nullable=True),
        sa.Column("publicada_por_id", UUID, sa.ForeignKey("users.id", ondelete="SET NULL"), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.UniqueConstraint("workflow_id", "versao", name="uq_workflow_versao"),
    )
    op.create_index("ix_workflow_versoes_workflow_id", "workflow_versoes", ["workflow_id"])
    op.create_index("ix_workflow_versoes_status", "workflow_versoes", ["status"])

    op.create_table(
        "workflow_etapas",
        sa.Column("id", UUID, primary_key=True),
        sa.Column("versao_id", UUID, sa.ForeignKey("workflow_versoes.id", ondelete="CASCADE"), nullable=False),
        sa.Column("chave", sa.String(60), nullable=False),
        sa.Column("nome", sa.String(255), nullable=False),
        sa.Column("descricao", sa.Text(), nullable=True),
        sa.Column("ordem", sa.Integer(), nullable=False, server_default="1"),
        sa.Column("peso", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("modo", sa.String(20), nullable=False, server_default="SEQUENCIAL"),
        sa.Column("natureza", sa.String(20), nullable=False, server_default="INTERNA"),
        sa.Column("regra_conclusao", sa.String(20), nullable=False, server_default="TODAS_TAREFAS"),
        sa.Column("setor_responsavel_id", UUID, sa.ForeignKey("setores.id", ondelete="SET NULL"), nullable=True),
        sa.Column("responsavel_id", UUID, sa.ForeignKey("users.id", ondelete="SET NULL"), nullable=True),
        sa.Column("prazo_dias", sa.Integer(), nullable=True),
        sa.Column("tipo_contagem", sa.String(20), nullable=False, server_default="DIAS_UTEIS"),
        sa.Column("exige_aprovacao", sa.Boolean(), nullable=False, server_default=sa.false()),
        sa.Column("documentos_obrigatorios", sa.JSON(), nullable=True),
        sa.Column("condicao", sa.JSON(), nullable=True),
        sa.Column("status_demanda_id", UUID, sa.ForeignKey("demanda_status.id", ondelete="SET NULL"), nullable=True),
        sa.Column("is_final", sa.Boolean(), nullable=False, server_default=sa.false()),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.UniqueConstraint("versao_id", "chave", name="uq_workflow_etapa_chave"),
    )
    op.create_index("ix_workflow_etapas_versao_id", "workflow_etapas", ["versao_id"])

    op.create_table(
        "workflow_etapa_tarefas",
        sa.Column("id", UUID, primary_key=True),
        sa.Column("etapa_id", UUID, sa.ForeignKey("workflow_etapas.id", ondelete="CASCADE"), nullable=False),
        sa.Column("titulo", sa.String(500), nullable=False),
        sa.Column("descricao", sa.Text(), nullable=True),
        sa.Column("ordem", sa.Integer(), nullable=False, server_default="1"),
        sa.Column("tipo", sa.String(20), nullable=False, server_default="EXECUCAO"),
        sa.Column("setor_destino_id", UUID, sa.ForeignKey("setores.id", ondelete="SET NULL"), nullable=True),
        sa.Column("prazo_dias", sa.Integer(), nullable=True),
        sa.Column("exige_documento", sa.Boolean(), nullable=False, server_default=sa.false()),
        sa.Column("exige_comentario", sa.Boolean(), nullable=False, server_default=sa.false()),
        sa.Column("exige_aprovacao", sa.Boolean(), nullable=False, server_default=sa.false()),
        sa.Column("exige_aceite", sa.Boolean(), nullable=False, server_default=sa.true()),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
    )
    op.create_index("ix_workflow_etapa_tarefas_etapa_id", "workflow_etapa_tarefas", ["etapa_id"])

    # Etapa instanciada passa a apontar para a receita que a gerou.
    op.add_column("etapas", sa.Column("workflow_versao_id", UUID, sa.ForeignKey("workflow_versoes.id", ondelete="SET NULL"), nullable=True))
    op.add_column("etapas", sa.Column("workflow_etapa_id", UUID, sa.ForeignKey("workflow_etapas.id", ondelete="SET NULL"), nullable=True))
    op.add_column("etapas", sa.Column("modo", sa.String(20), nullable=False, server_default="SEQUENCIAL"))
    op.add_column("etapas", sa.Column("regra_conclusao", sa.String(20), nullable=False, server_default="TODAS_TAREFAS"))
    op.add_column("etapas", sa.Column("documentos_obrigatorios", sa.JSON(), nullable=True))
    op.create_index("ix_etapas_workflow_etapa_id", "etapas", ["workflow_etapa_id"])

    # Etapa sem convênio: em fluxo de demanda, ela pende da demanda.
    op.alter_column("etapas", "convenio_id", nullable=True)

    _semear_workflows_padrao()


def _semear_workflows_padrao() -> None:
    from app.core.seeds_workflow import WORKFLOWS_PADRAO, etapa_com_padroes

    conn = op.get_bind()
    for modelo in WORKFLOWS_PADRAO:
        tipo_id = conn.execute(
            sa.text(
                "SELECT id FROM demanda_tipos"
                " WHERE organization_id IS NULL AND chave = :chave"
            ),
            {"chave": modelo["tipo_demanda"]},
        ).scalar()

        workflow_id = conn.execute(
            sa.text(
                "INSERT INTO workflows (id, organization_id, chave, nome, descricao,"
                " tipo_demanda_id, ativo, is_system)"
                " VALUES (gen_random_uuid(), NULL, :chave, :nome, :descricao, :tipo,"
                " true, true) RETURNING id"
            ),
            {
                "chave": modelo["chave"], "nome": modelo["nome"],
                "descricao": modelo.get("descricao"), "tipo": tipo_id,
            },
        ).scalar()

        versao_id = conn.execute(
            sa.text(
                "INSERT INTO workflow_versoes (id, workflow_id, versao, status,"
                " publicada_em) VALUES (gen_random_uuid(), :wf, 1, 'PUBLICADA', now())"
                " RETURNING id"
            ),
            {"wf": workflow_id},
        ).scalar()

        for bruta in modelo["etapas"]:
            etapa = etapa_com_padroes(bruta)
            etapa_id = conn.execute(
                sa.text(
                    "INSERT INTO workflow_etapas (id, versao_id, chave, nome, descricao,"
                    " ordem, peso, modo, natureza, regra_conclusao, prazo_dias,"
                    " exige_aprovacao, documentos_obrigatorios, condicao, is_final)"
                    " VALUES (gen_random_uuid(), :versao, :chave, :nome, :descricao,"
                    " :ordem, :peso, :modo, :natureza, :regra, :prazo, :aprovacao,"
                    " CAST(:documentos AS JSON), CAST(:condicao AS JSON), :final)"
                    " RETURNING id"
                ),
                {
                    "versao": versao_id, "chave": etapa["chave"], "nome": etapa["nome"],
                    "descricao": etapa["descricao"], "ordem": etapa["ordem"],
                    "peso": etapa["peso"], "modo": etapa["modo"],
                    "natureza": etapa["natureza"], "regra": etapa["regra_conclusao"],
                    "prazo": etapa["prazo_dias"], "aprovacao": etapa["exige_aprovacao"],
                    "documentos": _json(etapa["documentos_obrigatorios"]),
                    "condicao": _json(etapa["condicao"]),
                    "final": etapa["is_final"],
                },
            ).scalar()

            for tarefa in etapa["tarefas"]:
                conn.execute(
                    sa.text(
                        "INSERT INTO workflow_etapa_tarefas (id, etapa_id, titulo,"
                        " descricao, ordem, tipo, prazo_dias, exige_documento,"
                        " exige_comentario, exige_aprovacao, exige_aceite)"
                        " VALUES (gen_random_uuid(), :etapa, :titulo, :descricao,"
                        " :ordem, :tipo, :prazo, :doc, :com, :apr, :aceite)"
                    ),
                    {
                        "etapa": etapa_id, "titulo": tarefa["titulo"],
                        "descricao": tarefa["descricao"], "ordem": tarefa["ordem"],
                        "tipo": tarefa["tipo"], "prazo": tarefa["prazo_dias"],
                        "doc": tarefa["exige_documento"],
                        "com": tarefa["exige_comentario"],
                        "apr": tarefa["exige_aprovacao"],
                        "aceite": tarefa["exige_aceite"],
                    },
                )


def _json(valor):
    import json

    return json.dumps(valor) if valor is not None else None


def downgrade() -> None:
    op.alter_column("etapas", "convenio_id", nullable=False)
    op.drop_index("ix_etapas_workflow_etapa_id", table_name="etapas")
    for col in ("documentos_obrigatorios", "regra_conclusao", "modo",
                "workflow_etapa_id", "workflow_versao_id"):
        op.drop_column("etapas", col)
    op.drop_table("workflow_etapa_tarefas")
    op.drop_table("workflow_etapas")
    op.drop_table("workflow_versoes")
    op.drop_table("workflows")
