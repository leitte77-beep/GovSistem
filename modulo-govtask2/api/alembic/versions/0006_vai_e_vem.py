"""Vai e vem: encaminhamentos, medições e notificações.

Substitui a trilha de fases pelo fluxo de vai e vem. `fases_pedido` vira
`encaminhamentos`; as fases futuras (PENDENTE) somem — no modelo novo não
existe sequência obrigatória, cada passagem por um setor é um encaminhamento.

Revision ID: 0006_vai_e_vem
Revises: 0005_protocolo_fin
Create Date: 2026-09-23
"""

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision = "0006_vai_e_vem"
down_revision = "0005_protocolo_fin"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # ── 1. fases_pedido → encaminhamentos ───────────────────────────────
    op.rename_table("fases_pedido", "encaminhamentos")
    op.execute(
        "ALTER TABLE encaminhamentos RENAME CONSTRAINT uq_fase_pedido_ordem "
        "TO uq_encaminhamento_ordem"
    )
    op.execute("ALTER INDEX ix_fases_pedido_pedido_id RENAME TO ix_encaminhamentos_pedido_id")
    op.execute("ALTER INDEX ix_fases_responsavel RENAME TO ix_encaminhamentos_responsavel")
    op.alter_column("encaminhamentos", "status", type_=sa.String(24))

    op.add_column("encaminhamentos", sa.Column("assunto", sa.String(160), nullable=True))
    op.add_column("encaminhamentos", sa.Column("instrucoes", sa.Text(), nullable=True))
    op.add_column(
        "encaminhamentos",
        sa.Column(
            "participantes",
            postgresql.JSONB(),
            nullable=False,
            server_default=sa.text("'[]'::jsonb"),
        ),
    )
    op.add_column(
        "encaminhamentos",
        sa.Column(
            "prazo_sugerido",
            sa.Boolean(),
            nullable=False,
            server_default=sa.true(),
        ),
    )
    op.add_column(
        "encaminhamentos", sa.Column("complemento_pedido", sa.Text(), nullable=True)
    )
    op.add_column(
        "encaminhamentos", sa.Column("complemento_resposta", sa.Text(), nullable=True)
    )
    op.add_column(
        "encaminhamentos",
        sa.Column(
            "criado_por_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("users.id", ondelete="SET NULL"),
            nullable=True,
        ),
    )
    op.add_column(
        "encaminhamentos",
        sa.Column("assumido_em", sa.DateTime(timezone=True), nullable=True),
    )
    op.add_column(
        "encaminhamentos",
        sa.Column("devolvido_em", sa.DateTime(timezone=True), nullable=True),
    )
    op.add_column(
        "encaminhamentos",
        sa.Column(
            "transferencias", sa.Integer(), nullable=False, server_default="0"
        ),
    )
    # `resultado` nasce da antiga observação; `assunto` do antigo título.
    op.add_column("encaminhamentos", sa.Column("resultado", sa.Text(), nullable=True))

    # Só ficam as passagens reais: a fase em andamento e as já concluídas. As
    # fases futuras (PENDENTE) deixam de existir — não há mais sequência.
    op.execute("DELETE FROM encaminhamentos WHERE status = 'PENDENTE'")
    op.execute(
        """
        UPDATE encaminhamentos
        SET assunto = titulo,
            resultado = observacao,
            assumido_em = iniciada_em,
            devolvido_em = concluida_em,
            status = CASE
                WHEN status = 'CONCLUIDA' THEN 'CONCLUIDO'
                WHEN status = 'EM_ANDAMENTO' AND responsavel_id IS NOT NULL THEN 'EM_EXECUCAO'
                ELSE 'AGUARDANDO'
            END
        """
    )
    # Backfill do setor e do assunto onde a trilha antiga deixou vazio.
    op.execute("UPDATE encaminhamentos SET setor = 'ASSESSORIA' WHERE setor IS NULL")
    op.execute("UPDATE encaminhamentos SET assunto = 'Tarefa' WHERE assunto IS NULL")
    op.alter_column("encaminhamentos", "assunto", nullable=False)
    op.alter_column("encaminhamentos", "setor", nullable=False)

    op.drop_column("encaminhamentos", "codigo")
    op.drop_column("encaminhamentos", "titulo")
    op.drop_column("encaminhamentos", "descricao")
    op.drop_column("encaminhamentos", "iniciada_em")
    op.drop_column("encaminhamentos", "concluida_em")
    op.drop_column("encaminhamentos", "observacao")
    op.drop_column("encaminhamentos", "prazo_dias")
    op.drop_column("encaminhamentos", "exige_anexo")
    op.drop_column("encaminhamentos", "rotulo_anexo")
    op.drop_column("encaminhamentos", "aguarda_externo")
    op.drop_column("encaminhamentos", "documentos_sugeridos")
    op.drop_column("encaminhamentos", "devolucoes")

    op.create_index(
        "ix_encaminhamentos_setor_status", "encaminhamentos", ["setor", "status"]
    )

    # ── 2. Anexos e andamentos apontam para o encaminhamento ─────────────
    op.alter_column("anexos", "fase_id", new_column_name="encaminhamento_id")
    op.execute(
        "ALTER INDEX ix_anexos_pedido_fase RENAME TO ix_anexos_pedido_encaminhamento"
    )
    op.alter_column("andamentos", "fase_id", new_column_name="encaminhamento_id")
    op.alter_column("andamentos", "tipo", type_=sa.String(24))

    # ── 3. Medições de obra ──────────────────────────────────────────────
    op.create_table(
        "medicoes",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column(
            "pedido_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("pedidos.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column(
            "encaminhamento_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("encaminhamentos.id", ondelete="SET NULL"),
            nullable=True,
        ),
        sa.Column("numero", sa.Integer(), nullable=False),
        sa.Column("periodo_inicio", sa.Date(), nullable=True),
        sa.Column("periodo_fim", sa.Date(), nullable=True),
        sa.Column("valor", sa.Numeric(14, 2), nullable=True),
        sa.Column("percentual_executado", sa.Numeric(5, 2), nullable=True),
        sa.Column(
            "responsavel_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("users.id", ondelete="SET NULL"),
            nullable=True,
        ),
        sa.Column("observacao", sa.Text(), nullable=True),
        sa.Column(
            "created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False
        ),
        sa.Column(
            "updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False
        ),
        sa.UniqueConstraint("pedido_id", "numero", name="uq_medicao_pedido_numero"),
    )
    op.create_index("ix_medicoes_pedido_id", "medicoes", ["pedido_id"])
    op.create_index("ix_medicoes_pedido", "medicoes", ["pedido_id", "created_at"])

    op.add_column(
        "anexos",
        sa.Column(
            "medicao_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("medicoes.id", ondelete="SET NULL"),
            nullable=True,
        ),
    )
    op.add_column(
        "anexos",
        sa.Column(
            "categoria", sa.String(12), nullable=False, server_default="DOCUMENTO"
        ),
    )

    # ── 4. Notificações in-app ───────────────────────────────────────────
    op.create_table(
        "notificacoes",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column(
            "organization_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("organizations.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column(
            "user_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("users.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column(
            "pedido_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("pedidos.id", ondelete="CASCADE"),
            nullable=True,
        ),
        sa.Column(
            "encaminhamento_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("encaminhamentos.id", ondelete="CASCADE"),
            nullable=True,
        ),
        sa.Column("tipo", sa.String(32), nullable=False),
        sa.Column("texto", sa.Text(), nullable=False),
        sa.Column("autor_nome", sa.String(180), nullable=False, server_default=""),
        sa.Column("lida_em", sa.DateTime(timezone=True), nullable=True),
        sa.Column(
            "created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False
        ),
        sa.Column(
            "updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False
        ),
    )
    op.create_index(
        "ix_notificacoes_usuario_lida", "notificacoes", ["user_id", "lida_em"]
    )
    op.create_index("ix_notificacoes_organization_id", "notificacoes", ["organization_id"])
    op.create_index("ix_notificacoes_user_id", "notificacoes", ["user_id"])

    # ── 5. Pedido: onde está agora ───────────────────────────────────────
    op.add_column(
        "pedidos",
        sa.Column(
            "complemento_pendente",
            sa.Boolean(),
            nullable=False,
            server_default=sa.false(),
        ),
    )
    op.drop_index("ix_pedidos_fase_atual_codigo", table_name="pedidos")
    op.drop_column("pedidos", "fase_atual_codigo")
    op.drop_table("trilhas_config")

    # Reconcilia o pedido com o encaminhamento aberto que sobrou.
    op.execute(
        """
        UPDATE pedidos p SET
            situacao = CASE
                WHEN p.situacao = 'AGUARDANDO_EXTERNO' THEN 'AGUARDANDO_TERCEIRO'
                WHEN p.situacao = 'EM_ANDAMENTO' THEN 'EM_SETOR'
                ELSE p.situacao
            END,
            setor_atual = e.setor,
            responsavel_atual_id = e.responsavel_id,
            prazo_atual = e.prazo
        FROM encaminhamentos e
        WHERE e.pedido_id = p.id
          AND e.status IN ('AGUARDANDO', 'EM_EXECUCAO')
        """
    )
    # Permissão renomeada: quem conduz o fluxo agora "encaminha".
    op.execute(
        "UPDATE role_permissions SET permission = 'pedido.encaminhar' "
        "WHERE permission = 'pedido.conduzir'"
    )
    # Pedido sem passagem aberta volta para a mesa do Assessor.
    op.execute(
        """
        UPDATE pedidos p SET
            situacao = 'COM_ASSESSOR',
            setor_atual = NULL,
            responsavel_atual_id = NULL,
            prazo_atual = NULL
        WHERE p.situacao = 'EM_SETOR'
          AND NOT EXISTS (
            SELECT 1 FROM encaminhamentos e
            WHERE e.pedido_id = p.id AND e.status IN ('AGUARDANDO', 'EM_EXECUCAO')
          )
        """
    )


def downgrade() -> None:
    # Reversão best-effort: recria a forma antiga a partir do que existe.
    op.execute("DROP TABLE IF EXISTS notificacoes")
    op.drop_column("anexos", "categoria")
    op.drop_column("anexos", "medicao_id")
    op.drop_table("medicoes")

    op.alter_column("andamentos", "encaminhamento_id", new_column_name="fase_id")
    op.alter_column("andamentos", "tipo", type_=sa.String(20))
    op.alter_column("anexos", "encaminhamento_id", new_column_name="fase_id")
    op.execute(
        "ALTER INDEX ix_anexos_pedido_encaminhamento RENAME TO ix_anexos_pedido_fase"
    )

    op.add_column(
        "pedidos",
        sa.Column("fase_atual_codigo", sa.String(40), nullable=False, server_default=""),
    )
    op.create_index(
        "ix_pedidos_fase_atual_codigo", "pedidos", ["fase_atual_codigo"]
    )
    op.drop_column("pedidos", "complemento_pendente")

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
        sa.Column("fases", postgresql.JSONB(), nullable=False, server_default="[]"),
        sa.Column(
            "atualizado_por_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("users.id", ondelete="SET NULL"),
            nullable=True,
        ),
        sa.Column("atualizado_por_nome", sa.String(180), nullable=True),
        sa.Column(
            "created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False
        ),
        sa.Column(
            "updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False
        ),
        sa.UniqueConstraint("organization_id", "tipo", name="uq_trilha_org_tipo"),
    )

    op.add_column("encaminhamentos", sa.Column("codigo", sa.String(40), nullable=True))
    op.add_column("encaminhamentos", sa.Column("titulo", sa.String(120), nullable=True))
    op.add_column("encaminhamentos", sa.Column("descricao", sa.Text(), nullable=True))
    op.add_column("encaminhamentos", sa.Column("iniciada_em", sa.DateTime(timezone=True), nullable=True))
    op.add_column("encaminhamentos", sa.Column("concluida_em", sa.DateTime(timezone=True), nullable=True))
    op.add_column("encaminhamentos", sa.Column("observacao", sa.Text(), nullable=True))
    op.add_column("encaminhamentos", sa.Column("prazo_dias", sa.Integer(), nullable=False, server_default="5"))
    op.add_column("encaminhamentos", sa.Column("exige_anexo", sa.Boolean(), nullable=False, server_default=sa.false()))
    op.add_column("encaminhamentos", sa.Column("rotulo_anexo", sa.String(160), nullable=False, server_default=""))
    op.add_column("encaminhamentos", sa.Column("aguarda_externo", sa.Boolean(), nullable=False, server_default=sa.false()))
    op.add_column("encaminhamentos", sa.Column("documentos_sugeridos", postgresql.JSONB(), nullable=False, server_default="[]"))
    op.add_column("encaminhamentos", sa.Column("devolucoes", sa.Integer(), nullable=False, server_default="0"))
    op.execute(
        """
        UPDATE encaminhamentos SET
            titulo = assunto,
            observacao = resultado,
            iniciada_em = assumido_em,
            concluida_em = devolvido_em,
            codigo = upper(replace(setor, ' ', '_')),
            status = CASE
                WHEN status = 'CONCLUIDO' THEN 'CONCLUIDA'
                WHEN status = 'EM_EXECUCAO' THEN 'EM_ANDAMENTO'
                ELSE 'PENDENTE'
            END
        """
    )
    op.drop_column("encaminhamentos", "assunto")
    op.drop_column("encaminhamentos", "instrucoes")
    op.drop_column("encaminhamentos", "participantes")
    op.drop_column("encaminhamentos", "prazo_sugerido")
    op.drop_column("encaminhamentos", "complemento_pedido")
    op.drop_column("encaminhamentos", "complemento_resposta")
    op.drop_column("encaminhamentos", "criado_por_id")
    op.drop_column("encaminhamentos", "assumido_em")
    op.drop_column("encaminhamentos", "devolvido_em")
    op.drop_column("encaminhamentos", "transferencias")
    op.drop_column("encaminhamentos", "resultado")
    op.drop_index("ix_encaminhamentos_setor_status", table_name="encaminhamentos")
    op.alter_column("encaminhamentos", "status", type_=sa.String(20))
    op.execute("ALTER INDEX ix_encaminhamentos_pedido_id RENAME TO ix_fases_pedido_pedido_id")
    op.execute("ALTER INDEX ix_encaminhamentos_responsavel RENAME TO ix_fases_responsavel")
    op.execute(
        "ALTER TABLE encaminhamentos RENAME CONSTRAINT uq_encaminhamento_ordem "
        "TO uq_fase_pedido_ordem"
    )
    op.rename_table("encaminhamentos", "fases_pedido")
