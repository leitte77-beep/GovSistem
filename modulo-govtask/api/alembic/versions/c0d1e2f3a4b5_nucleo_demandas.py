"""Núcleo de Demandas do GovTask v2.

Introduz a demanda como entidade raiz do módulo, com catálogos configuráveis
(tipos, categorias, status, tags), autoridades externas, numeração transacional
por exercício, participantes, seguidores e protocolos externos.

As entidades que já existiam (etapas, tarefas, anexos, eventos) passam a
apontar para a demanda. Cada convênio existente é convertido em uma demanda
equivalente e seus filhos são religados, de modo que nenhum dado se perde e a
API antiga continua funcionando durante a transição.

Revision ID: c0d1e2f3a4b5
Revises: b8c1d4e7f0a2
"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "c0d1e2f3a4b5"
down_revision: Union[str, Sequence[str], None] = "b8c1d4e7f0a2"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


UUID = postgresql.UUID(as_uuid=True)


def _catalogo_cols() -> list:
    return [
        sa.Column("id", UUID, primary_key=True),
        sa.Column("organization_id", UUID, sa.ForeignKey("organizations.id", ondelete="CASCADE"), nullable=True),
        sa.Column("chave", sa.String(60), nullable=False),
        sa.Column("rotulo", sa.String(120), nullable=False),
        sa.Column("descricao", sa.Text(), nullable=True),
        sa.Column("ordem", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("cor", sa.String(30), nullable=True),
        sa.Column("icone", sa.String(60), nullable=True),
        sa.Column("ativo", sa.Boolean(), nullable=False, server_default=sa.true()),
        sa.Column("is_system", sa.Boolean(), nullable=False, server_default=sa.false()),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("deleted_at", sa.DateTime(timezone=True), nullable=True),
    ]


def upgrade() -> None:
    # ── Catálogos configuráveis ──────────────────────────────────────────
    op.create_table(
        "demanda_tipos",
        *_catalogo_cols(),
        sa.Column("exige_obra", sa.Boolean(), nullable=False, server_default=sa.false()),
        sa.Column("exige_financeiro", sa.Boolean(), nullable=False, server_default=sa.false()),
        sa.Column("exige_convenio", sa.Boolean(), nullable=False, server_default=sa.false()),
        sa.Column("exige_licitacao", sa.Boolean(), nullable=False, server_default=sa.false()),
        sa.Column("exige_contrato", sa.Boolean(), nullable=False, server_default=sa.false()),
        sa.Column("exige_prestacao_contas", sa.Boolean(), nullable=False, server_default=sa.false()),
        sa.Column("template_fluxo_id", UUID, sa.ForeignKey("templates_fluxo.id", ondelete="SET NULL"), nullable=True),
        sa.UniqueConstraint("organization_id", "chave", name="uq_demanda_tipo_org_chave"),
    )
    op.create_index("ix_demanda_tipos_organization_id", "demanda_tipos", ["organization_id"])
    op.create_index("ix_demanda_tipos_chave", "demanda_tipos", ["chave"])

    op.create_table(
        "demanda_categorias",
        *_catalogo_cols(),
        sa.Column("tipo_id", UUID, sa.ForeignKey("demanda_tipos.id", ondelete="SET NULL"), nullable=True),
        sa.Column("categoria_pai_id", UUID, sa.ForeignKey("demanda_categorias.id", ondelete="SET NULL"), nullable=True),
        sa.UniqueConstraint("organization_id", "chave", name="uq_demanda_categoria_org_chave"),
    )
    op.create_index("ix_demanda_categorias_organization_id", "demanda_categorias", ["organization_id"])
    op.create_index("ix_demanda_categorias_chave", "demanda_categorias", ["chave"])
    op.create_index("ix_demanda_categorias_tipo_id", "demanda_categorias", ["tipo_id"])

    op.create_table(
        "demanda_status",
        *_catalogo_cols(),
        sa.Column("is_inicial", sa.Boolean(), nullable=False, server_default=sa.false()),
        sa.Column("is_final", sa.Boolean(), nullable=False, server_default=sa.false()),
        sa.Column("is_aguardando_externo", sa.Boolean(), nullable=False, server_default=sa.false()),
        sa.Column("conta_como_atrasavel", sa.Boolean(), nullable=False, server_default=sa.true()),
        sa.UniqueConstraint("organization_id", "chave", name="uq_demanda_status_org_chave"),
    )
    op.create_index("ix_demanda_status_organization_id", "demanda_status", ["organization_id"])
    op.create_index("ix_demanda_status_chave", "demanda_status", ["chave"])

    op.create_table(
        "demanda_tags",
        sa.Column("id", UUID, primary_key=True),
        sa.Column("organization_id", UUID, sa.ForeignKey("organizations.id", ondelete="CASCADE"), nullable=False),
        sa.Column("slug", sa.String(80), nullable=False),
        sa.Column("rotulo", sa.String(80), nullable=False),
        sa.Column("cor", sa.String(30), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("deleted_at", sa.DateTime(timezone=True), nullable=True),
        sa.UniqueConstraint("organization_id", "slug", name="uq_demanda_tag_org_slug"),
    )
    op.create_index("ix_demanda_tags_organization_id", "demanda_tags", ["organization_id"])
    op.create_index("ix_demanda_tags_slug", "demanda_tags", ["slug"])

    # ── Autoridades externas ─────────────────────────────────────────────
    op.create_table(
        "autoridades",
        sa.Column("id", UUID, primary_key=True),
        sa.Column("organization_id", UUID, sa.ForeignKey("organizations.id", ondelete="CASCADE"), nullable=False),
        sa.Column("nome", sa.String(255), nullable=False),
        sa.Column("tipo", sa.String(30), nullable=False, server_default="OUTRO"),
        sa.Column("cargo", sa.String(150), nullable=True),
        sa.Column("instituicao", sa.String(255), nullable=True),
        sa.Column("partido", sa.String(60), nullable=True),
        sa.Column("esfera", sa.String(20), nullable=True),
        sa.Column("telefone", sa.String(40), nullable=True),
        sa.Column("email", sa.String(255), nullable=True),
        sa.Column("assessor_nome", sa.String(255), nullable=True),
        sa.Column("assessor_telefone", sa.String(40), nullable=True),
        sa.Column("observacoes", sa.Text(), nullable=True),
        sa.Column("ativo", sa.Boolean(), nullable=False, server_default=sa.true()),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("deleted_at", sa.DateTime(timezone=True), nullable=True),
    )
    op.create_index("ix_autoridades_organization_id", "autoridades", ["organization_id"])
    op.create_index("ix_autoridades_nome", "autoridades", ["nome"])
    op.create_index("ix_autoridades_tipo", "autoridades", ["tipo"])
    op.create_index("ix_autoridades_esfera", "autoridades", ["esfera"])

    op.create_table(
        "autoridade_contatos",
        sa.Column("id", UUID, primary_key=True),
        sa.Column("autoridade_id", UUID, sa.ForeignKey("autoridades.id", ondelete="CASCADE"), nullable=False),
        sa.Column("nome", sa.String(255), nullable=False),
        sa.Column("funcao", sa.String(150), nullable=True),
        sa.Column("telefone", sa.String(40), nullable=True),
        sa.Column("email", sa.String(255), nullable=True),
        sa.Column("observacoes", sa.Text(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
    )
    op.create_index("ix_autoridade_contatos_autoridade_id", "autoridade_contatos", ["autoridade_id"])

    # ── Numeração transacional ───────────────────────────────────────────
    op.create_table(
        "sequencias_numeracao",
        sa.Column("id", UUID, primary_key=True),
        sa.Column("organization_id", UUID, sa.ForeignKey("organizations.id", ondelete="CASCADE"), nullable=False),
        sa.Column("escopo", sa.String(40), nullable=False, server_default="DEMANDA"),
        sa.Column("exercicio", sa.Integer(), nullable=False),
        sa.Column("ultimo_numero", sa.BigInteger(), nullable=False, server_default="0"),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.UniqueConstraint("organization_id", "escopo", "exercicio", name="uq_sequencia_org_escopo_ano"),
    )
    op.create_index("ix_sequencias_numeracao_organization_id", "sequencias_numeracao", ["organization_id"])

    # ── Demanda ──────────────────────────────────────────────────────────
    op.create_table(
        "demandas",
        sa.Column("id", UUID, primary_key=True),
        sa.Column("organization_id", UUID, sa.ForeignKey("organizations.id", ondelete="RESTRICT"), nullable=False),
        sa.Column("numero", sa.String(40), nullable=False),
        sa.Column("exercicio", sa.Integer(), nullable=False),
        sa.Column("sequencial", sa.Integer(), nullable=False),
        sa.Column("titulo", sa.String(500), nullable=False),
        sa.Column("descricao", sa.Text(), nullable=True),
        sa.Column("resumo_executivo", sa.Text(), nullable=True),
        sa.Column("objeto", sa.Text(), nullable=True),
        sa.Column("assunto", sa.String(255), nullable=True),
        sa.Column("tipo_id", UUID, sa.ForeignKey("demanda_tipos.id", ondelete="RESTRICT"), nullable=True),
        sa.Column("categoria_id", UUID, sa.ForeignKey("demanda_categorias.id", ondelete="SET NULL"), nullable=True),
        sa.Column("subcategoria_id", UUID, sa.ForeignKey("demanda_categorias.id", ondelete="SET NULL"), nullable=True),
        sa.Column("status_id", UUID, sa.ForeignKey("demanda_status.id", ondelete="RESTRICT"), nullable=True),
        sa.Column("prioridade", sa.String(15), nullable=False, server_default="NORMAL"),
        sa.Column("criticidade", sa.String(20), nullable=True),
        sa.Column("impacto", sa.String(20), nullable=True),
        sa.Column("confidencialidade", sa.String(20), nullable=False, server_default="NORMAL"),
        sa.Column("is_rascunho", sa.Boolean(), nullable=False, server_default=sa.false()),
        sa.Column("arquivada_em", sa.DateTime(timezone=True), nullable=True),
        sa.Column("origem", sa.String(40), nullable=True),
        sa.Column("origem_descricao", sa.Text(), nullable=True),
        sa.Column("autoridade_id", UUID, sa.ForeignKey("autoridades.id", ondelete="SET NULL"), nullable=True),
        sa.Column("criado_por_id", UUID, sa.ForeignKey("users.id", ondelete="RESTRICT"), nullable=False),
        sa.Column("solicitante_id", UUID, sa.ForeignKey("users.id", ondelete="SET NULL"), nullable=True),
        sa.Column("solicitante_externo", sa.String(255), nullable=True),
        sa.Column("responsavel_geral_id", UUID, sa.ForeignKey("users.id", ondelete="RESTRICT"), nullable=False),
        sa.Column("gestor_id", UUID, sa.ForeignKey("users.id", ondelete="SET NULL"), nullable=True),
        sa.Column("responsavel_atual_id", UUID, sa.ForeignKey("users.id", ondelete="SET NULL"), nullable=True),
        sa.Column("setor_solicitante_id", UUID, sa.ForeignKey("setores.id", ondelete="SET NULL"), nullable=True),
        sa.Column("setor_atual_id", UUID, sa.ForeignKey("setores.id", ondelete="SET NULL"), nullable=True),
        sa.Column("template_fluxo_id", UUID, sa.ForeignKey("templates_fluxo.id", ondelete="SET NULL"), nullable=True),
        sa.Column("fluxo_livre", sa.Boolean(), nullable=False, server_default=sa.true()),
        sa.Column("progresso", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("proxima_acao", sa.Text(), nullable=True),
        sa.Column("proxima_acao_responsavel_id", UUID, sa.ForeignKey("users.id", ondelete="SET NULL"), nullable=True),
        sa.Column("proxima_acao_prazo", sa.DateTime(timezone=True), nullable=True),
        sa.Column("bloqueada", sa.Boolean(), nullable=False, server_default=sa.false()),
        sa.Column("bloqueio_motivo", sa.Text(), nullable=True),
        sa.Column("bloqueio_desde", sa.DateTime(timezone=True), nullable=True),
        sa.Column("bloqueio_previsao", sa.DateTime(timezone=True), nullable=True),
        sa.Column("aguardando_terceiro", sa.String(255), nullable=True),
        sa.Column("aguardando_desde", sa.DateTime(timezone=True), nullable=True),
        sa.Column("proximo_followup", sa.Date(), nullable=True),
        sa.Column("data_solicitacao", sa.Date(), nullable=True),
        sa.Column("prazo_final", sa.DateTime(timezone=True), nullable=True),
        sa.Column("prazo_legal", sa.DateTime(timezone=True), nullable=True),
        sa.Column("prazo_interno", sa.DateTime(timezone=True), nullable=True),
        sa.Column("previsao_conclusao", sa.DateTime(timezone=True), nullable=True),
        sa.Column("concluida_em", sa.DateTime(timezone=True), nullable=True),
        sa.Column("ultima_movimentacao_em", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.Column("valor_previsto", sa.Numeric(15, 2), nullable=True),
        sa.Column("valor_aprovado", sa.Numeric(15, 2), nullable=True),
        sa.Column("valor_contratado", sa.Numeric(15, 2), nullable=True),
        sa.Column("valor_executado", sa.Numeric(15, 2), nullable=True),
        sa.Column("fonte_recurso", sa.String(40), nullable=True),
        sa.Column("esfera", sa.String(20), nullable=True),
        sa.Column("orgao_concedente", sa.String(255), nullable=True),
        sa.Column("programa", sa.String(255), nullable=True),
        sa.Column("resultado_final", sa.Text(), nullable=True),
        sa.Column("motivo_cancelamento", sa.Text(), nullable=True),
        sa.Column("campos_extras", sa.JSON(), nullable=True),
        sa.Column("observacoes", sa.Text(), nullable=True),
        sa.Column("duplicada_de_id", UUID, sa.ForeignKey("demandas.id", ondelete="SET NULL"), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("deleted_at", sa.DateTime(timezone=True), nullable=True),
        sa.UniqueConstraint("organization_id", "exercicio", "sequencial", name="uq_demanda_org_exercicio_sequencial"),
        sa.UniqueConstraint("organization_id", "numero", name="uq_demanda_org_numero"),
    )
    for col in (
        "organization_id", "numero", "exercicio", "tipo_id", "categoria_id",
        "status_id", "prioridade", "confidencialidade", "origem", "autoridade_id",
        "responsavel_geral_id", "responsavel_atual_id", "setor_atual_id",
        "prazo_final", "esfera",
    ):
        op.create_index(f"ix_demandas_{col}", "demandas", [col])
    op.create_index("ix_demandas_org_status", "demandas", ["organization_id", "status_id"])
    op.create_index("ix_demandas_org_responsavel", "demandas", ["organization_id", "responsavel_geral_id"])
    op.create_index("ix_demandas_org_setor_atual", "demandas", ["organization_id", "setor_atual_id"])
    op.create_index("ix_demandas_org_prazo", "demandas", ["organization_id", "prazo_final"])
    op.create_index("ix_demandas_org_movimentacao", "demandas", ["organization_id", "ultima_movimentacao_em"])

    op.create_table(
        "demanda_tag_vinculos",
        sa.Column("id", UUID, primary_key=True),
        sa.Column("demanda_id", UUID, sa.ForeignKey("demandas.id", ondelete="CASCADE"), nullable=False),
        sa.Column("tag_id", UUID, sa.ForeignKey("demanda_tags.id", ondelete="CASCADE"), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.UniqueConstraint("demanda_id", "tag_id", name="uq_demanda_tag"),
    )
    op.create_index("ix_demanda_tag_vinculos_demanda_id", "demanda_tag_vinculos", ["demanda_id"])
    op.create_index("ix_demanda_tag_vinculos_tag_id", "demanda_tag_vinculos", ["tag_id"])

    op.create_table(
        "demanda_participantes",
        sa.Column("id", UUID, primary_key=True),
        sa.Column("demanda_id", UUID, sa.ForeignKey("demandas.id", ondelete="CASCADE"), nullable=False),
        sa.Column("user_id", UUID, sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
        sa.Column("setor_id", UUID, sa.ForeignKey("setores.id", ondelete="SET NULL"), nullable=True),
        sa.Column("papel", sa.String(20), nullable=False, server_default="COLABORADOR"),
        sa.Column("ativo", sa.Boolean(), nullable=False, server_default=sa.true()),
        sa.Column("adicionado_por_id", UUID, sa.ForeignKey("users.id", ondelete="SET NULL"), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.UniqueConstraint("demanda_id", "user_id", "papel", name="uq_demanda_participante"),
    )
    op.create_index("ix_demanda_participantes_demanda_id", "demanda_participantes", ["demanda_id"])
    op.create_index("ix_demanda_participantes_user_id", "demanda_participantes", ["user_id"])

    op.create_table(
        "demanda_seguidores",
        sa.Column("id", UUID, primary_key=True),
        sa.Column("demanda_id", UUID, sa.ForeignKey("demandas.id", ondelete="CASCADE"), nullable=False),
        sa.Column("user_id", UUID, sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
        sa.Column("favorito", sa.Boolean(), nullable=False, server_default=sa.false()),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.UniqueConstraint("demanda_id", "user_id", name="uq_demanda_seguidor"),
    )
    op.create_index("ix_demanda_seguidores_demanda_id", "demanda_seguidores", ["demanda_id"])
    op.create_index("ix_demanda_seguidores_user_id", "demanda_seguidores", ["user_id"])

    # ── Protocolos externos ──────────────────────────────────────────────
    op.create_table(
        "protocolos_externos",
        sa.Column("id", UUID, primary_key=True),
        sa.Column("organization_id", UUID, sa.ForeignKey("organizations.id", ondelete="RESTRICT"), nullable=False),
        sa.Column("demanda_id", UUID, sa.ForeignKey("demandas.id", ondelete="CASCADE"), nullable=False),
        sa.Column("sistema", sa.String(120), nullable=False),
        sa.Column("orgao", sa.String(255), nullable=True),
        sa.Column("numero", sa.String(120), nullable=False),
        sa.Column("ano", sa.Integer(), nullable=True),
        sa.Column("data_protocolo", sa.DateTime(timezone=True), nullable=False),
        sa.Column("url", sa.Text(), nullable=True),
        sa.Column("situacao", sa.String(30), nullable=False, server_default="PROTOCOLADO"),
        sa.Column("observacoes", sa.Text(), nullable=True),
        sa.Column("prazo_resposta", sa.DateTime(timezone=True), nullable=True),
        sa.Column("proxima_verificacao", sa.Date(), nullable=True),
        sa.Column("responsavel_id", UUID, sa.ForeignKey("users.id", ondelete="SET NULL"), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("deleted_at", sa.DateTime(timezone=True), nullable=True),
    )
    for col in ("organization_id", "demanda_id", "numero", "situacao"):
        op.create_index(f"ix_protocolos_externos_{col}", "protocolos_externos", [col])

    op.create_table(
        "protocolo_atualizacoes",
        sa.Column("id", UUID, primary_key=True),
        sa.Column("protocolo_id", UUID, sa.ForeignKey("protocolos_externos.id", ondelete="CASCADE"), nullable=False),
        sa.Column("situacao", sa.String(30), nullable=False),
        sa.Column("descricao", sa.Text(), nullable=False),
        sa.Column("ocorrido_em", sa.DateTime(timezone=True), nullable=False),
        sa.Column("registrado_por_id", UUID, sa.ForeignKey("users.id", ondelete="SET NULL"), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
    )
    op.create_index("ix_protocolo_atualizacoes_protocolo_id", "protocolo_atualizacoes", ["protocolo_id"])

    # ── Religar entidades existentes à demanda ───────────────────────────
    op.add_column("etapas", sa.Column("demanda_id", UUID, sa.ForeignKey("demandas.id", ondelete="CASCADE"), nullable=True))
    op.add_column("etapas", sa.Column("peso", sa.Integer(), nullable=False, server_default="0"))
    op.add_column("etapas", sa.Column("descricao", sa.Text(), nullable=True))
    op.add_column("etapas", sa.Column("setor_responsavel_id", UUID, sa.ForeignKey("setores.id", ondelete="SET NULL"), nullable=True))
    op.add_column("etapas", sa.Column("prazo", sa.DateTime(timezone=True), nullable=True))
    op.create_index("ix_etapas_demanda_id", "etapas", ["demanda_id"])

    op.add_column("tarefas", sa.Column("demanda_id", UUID, sa.ForeignKey("demandas.id", ondelete="CASCADE"), nullable=True))
    op.create_index("ix_tarefas_demanda_id", "tarefas", ["demanda_id"])

    op.add_column("anexos", sa.Column("demanda_id", UUID, sa.ForeignKey("demandas.id", ondelete="CASCADE"), nullable=True))
    op.add_column("anexos", sa.Column("protocolo_id", UUID, sa.ForeignKey("protocolos_externos.id", ondelete="SET NULL"), nullable=True))
    op.add_column("anexos", sa.Column("hash_sha256", sa.String(64), nullable=True))
    op.add_column("anexos", sa.Column("pasta", sa.String(120), nullable=True))
    op.add_column("anexos", sa.Column("documento_grupo_id", UUID, nullable=True))
    op.add_column("anexos", sa.Column("versao_atual", sa.Boolean(), nullable=False, server_default=sa.true()))
    op.alter_column("anexos", "convenio_id", nullable=True)
    for col in ("demanda_id", "protocolo_id", "hash_sha256", "pasta", "documento_grupo_id"):
        op.create_index(f"ix_anexos_{col}", "anexos", [col])

    op.add_column("eventos_timeline", sa.Column("demanda_id", UUID, sa.ForeignKey("demandas.id", ondelete="CASCADE"), nullable=True))
    op.alter_column("eventos_timeline", "convenio_id", nullable=True)
    op.create_index("ix_eventos_timeline_demanda_id", "eventos_timeline", ["demanda_id"])

    _seed_catalogo_padrao()
    _backfill_convenios_em_demandas()


def _seed_catalogo_padrao() -> None:
    """Catálogo padrão do sistema (organization_id NULL), visível a todo tenant."""
    from app.core.seeds_demanda import STATUS_PADRAO, TIPOS_PADRAO

    conn = op.get_bind()
    for ordem, item in enumerate(TIPOS_PADRAO):
        conn.execute(
            sa.text(
                "INSERT INTO demanda_tipos (id, organization_id, chave, rotulo, ordem,"
                " ativo, is_system, exige_obra, exige_financeiro, exige_convenio,"
                " exige_licitacao, exige_contrato, exige_prestacao_contas)"
                " VALUES (gen_random_uuid(), NULL, :chave, :rotulo, :ordem, true, true,"
                " :obra, :fin, :conv, :lic, :contr, :prest)"
            ),
            {
                "chave": item["chave"], "rotulo": item["rotulo"], "ordem": ordem,
                "obra": item.get("exige_obra", False),
                "fin": item.get("exige_financeiro", False),
                "conv": item.get("exige_convenio", False),
                "lic": item.get("exige_licitacao", False),
                "contr": item.get("exige_contrato", False),
                "prest": item.get("exige_prestacao_contas", False),
            },
        )
    for ordem, item in enumerate(STATUS_PADRAO):
        conn.execute(
            sa.text(
                "INSERT INTO demanda_status (id, organization_id, chave, rotulo, ordem,"
                " cor, ativo, is_system, is_inicial, is_final, is_aguardando_externo,"
                " conta_como_atrasavel)"
                " VALUES (gen_random_uuid(), NULL, :chave, :rotulo, :ordem, :cor, true,"
                " true, :inicial, :final, :externo, :atrasavel)"
            ),
            {
                "chave": item["chave"], "rotulo": item["rotulo"], "ordem": ordem,
                "cor": item.get("cor"),
                "inicial": item.get("is_inicial", False),
                "final": item.get("is_final", False),
                "externo": item.get("is_aguardando_externo", False),
                "atrasavel": item.get("conta_como_atrasavel", True),
            },
        )


def _backfill_convenios_em_demandas() -> None:
    """Converte cada convênio existente em uma demanda equivalente.

    A numeração segue o ano de criação do convênio, na ordem em que foram
    criados, e o contador da organização fica alinhado para que a próxima
    demanda criada pela aplicação continue de onde este backfill parou.
    """
    conn = op.get_bind()
    tipo_convenio = conn.execute(
        sa.text("SELECT id FROM demanda_tipos WHERE organization_id IS NULL AND chave = 'CONVENIO'")
    ).scalar()
    status_andamento = {
        row[0]: row[1]
        for row in conn.execute(
            sa.text("SELECT chave, id FROM demanda_status WHERE organization_id IS NULL")
        )
    }
    mapa_status = {
        "RASCUNHO": "RASCUNHO",
        "EM_ANDAMENTO": "EM_ANDAMENTO",
        "SUSPENSO": "SUSPENSA",
        "CONCLUIDO": "CONCLUIDA",
        "CANCELADO": "CANCELADA",
    }

    convenios = conn.execute(
        sa.text(
            "SELECT id, organization_id, titulo, descricao, status, responsavel_id,"
            " gestor_id, created_at, valor, valor_aprovado, valor_executado,"
            " valor_pago, esfera, orgao_concedente, programa, prioridade,"
            " parlamentar, origem, template_fluxo_id, previsao_conclusao,"
            " conclusao_efetiva, prazo_execucao, finalidade, deleted_at"
            " FROM convenios ORDER BY created_at"
        )
    ).mappings().all()

    contadores: dict[tuple, int] = {}
    for c in convenios:
        exercicio = c["created_at"].year
        chave = (c["organization_id"], exercicio)
        contadores[chave] = contadores.get(chave, 0) + 1
        seq = contadores[chave]
        numero = f"{exercicio}/{seq:06d}"
        autoridade_id = None
        if c["parlamentar"]:
            autoridade_id = conn.execute(
                sa.text(
                    "SELECT id FROM autoridades WHERE organization_id = :org AND nome = :nome"
                ),
                {"org": c["organization_id"], "nome": c["parlamentar"]},
            ).scalar()
            if autoridade_id is None:
                autoridade_id = conn.execute(
                    sa.text(
                        "INSERT INTO autoridades (id, organization_id, nome, tipo, ativo)"
                        " VALUES (gen_random_uuid(), :org, :nome, 'OUTRO', true) RETURNING id"
                    ),
                    {"org": c["organization_id"], "nome": c["parlamentar"]},
                ).scalar()

        demanda_id = conn.execute(
            sa.text(
                "INSERT INTO demandas (id, organization_id, numero, exercicio, sequencial,"
                " titulo, descricao, objeto, tipo_id, status_id, prioridade,"
                " confidencialidade, origem_descricao, autoridade_id, criado_por_id,"
                " responsavel_geral_id, gestor_id, responsavel_atual_id,"
                " template_fluxo_id, fluxo_livre, prazo_final, previsao_conclusao,"
                " concluida_em, ultima_movimentacao_em, valor_previsto, valor_aprovado,"
                " valor_executado, esfera, orgao_concedente, programa, created_at,"
                " deleted_at)"
                " VALUES (gen_random_uuid(), :org, :numero, :exercicio, :seq, :titulo,"
                " :descricao, :objeto, :tipo, :status, :prioridade, 'NORMAL', :origem,"
                " :autoridade, :criador, :criador, :gestor, :criador, :template, false,"
                " :prazo, :previsao, :concluida, :created, :valor, :valor_aprovado,"
                " :valor_exec, :esfera, :orgao, :programa, :created, :deleted)"
                " RETURNING id"
            ),
            {
                "org": c["organization_id"], "numero": numero, "exercicio": exercicio,
                "seq": seq, "titulo": c["titulo"], "descricao": c["descricao"],
                "objeto": c["finalidade"], "tipo": tipo_convenio,
                "status": status_andamento.get(mapa_status.get(c["status"], "EM_ANDAMENTO")),
                "prioridade": (c["prioridade"] or "NORMAL"),
                "origem": c["origem"], "autoridade": autoridade_id,
                "criador": c["responsavel_id"], "gestor": c["gestor_id"],
                "template": c["template_fluxo_id"], "prazo": c["prazo_execucao"],
                "previsao": c["previsao_conclusao"], "concluida": c["conclusao_efetiva"],
                "created": c["created_at"], "valor": c["valor"],
                "valor_aprovado": c["valor_aprovado"], "valor_exec": c["valor_executado"],
                "esfera": c["esfera"], "orgao": c["orgao_concedente"],
                "programa": c["programa"], "deleted": c["deleted_at"],
            },
        ).scalar()

        for tabela in ("etapas", "tarefas", "anexos", "eventos_timeline"):
            conn.execute(
                sa.text(f"UPDATE {tabela} SET demanda_id = :d WHERE convenio_id = :c"),
                {"d": demanda_id, "c": c["id"]},
            )

    for (org_id, exercicio), ultimo in contadores.items():
        conn.execute(
            sa.text(
                "INSERT INTO sequencias_numeracao (id, organization_id, escopo, exercicio,"
                " ultimo_numero) VALUES (gen_random_uuid(), :org, 'DEMANDA', :ano, :ultimo)"
                " ON CONFLICT (organization_id, escopo, exercicio) DO UPDATE"
                " SET ultimo_numero = GREATEST(sequencias_numeracao.ultimo_numero, :ultimo)"
            ),
            {"org": org_id, "ano": exercicio, "ultimo": ultimo},
        )


def downgrade() -> None:
    op.drop_index("ix_eventos_timeline_demanda_id", table_name="eventos_timeline")
    op.drop_column("eventos_timeline", "demanda_id")
    for col in ("demanda_id", "protocolo_id", "hash_sha256", "pasta", "documento_grupo_id"):
        op.drop_index(f"ix_anexos_{col}", table_name="anexos")
    for col in ("versao_atual", "documento_grupo_id", "pasta", "hash_sha256", "protocolo_id", "demanda_id"):
        op.drop_column("anexos", col)
    op.drop_index("ix_tarefas_demanda_id", table_name="tarefas")
    op.drop_column("tarefas", "demanda_id")
    op.drop_index("ix_etapas_demanda_id", table_name="etapas")
    for col in ("prazo", "setor_responsavel_id", "descricao", "peso", "demanda_id"):
        op.drop_column("etapas", col)

    op.drop_table("protocolo_atualizacoes")
    op.drop_table("protocolos_externos")
    op.drop_table("demanda_seguidores")
    op.drop_table("demanda_participantes")
    op.drop_table("demanda_tag_vinculos")
    op.drop_table("demandas")
    op.drop_table("sequencias_numeracao")
    op.drop_table("autoridade_contatos")
    op.drop_table("autoridades")
    op.drop_table("demanda_tags")
    op.drop_table("demanda_status")
    op.drop_table("demanda_categorias")
    op.drop_table("demanda_tipos")
