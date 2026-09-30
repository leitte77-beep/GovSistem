"""Posto credenciado, secretarias, horímetro, alertas; oficinas viram fornecedores.

- abastecimentos: modalidade (TANQUE_PROPRIO | POSTO_CREDENCIADO), tanque_id
  opcional, fornecedor_id, preço/NF, horímetro, consumo L/h, unidade_id, alertas.
- unidades: cadastro de secretarias/centros de custo. Os textos livres
  veiculos.unidade/centro_custo/filial viram linhas deste cadastro.
- oficinas: cada oficina vira um fornecedor (categoria MECANICA) e as
  manutenções passam a apontar só para fornecedor_id.
- veiculos: combustível principal/secundário/capacidade deixam de existir no
  veículo — ficam só nos reservatórios (secundário = combustível alternativo
  do reservatório principal, caso flex).
- configurações: remove foto_obrigatoria e nome_modulo (sem efeito); adiciona
  janela de horário e limite de litros acima da média.

Reverter em produção = restaurar o dump feito antes do upgrade. O downgrade
recria a estrutura e devolve o que for derivável, mas não as oficinas.

Revision ID: 007
Revises: 006
Create Date: 2026-09-29
"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "007"
down_revision: Union[str, None] = "006"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    bind = op.get_bind()

    # ── 1) Unidades (secretarias / centros de custo) ──────────────────────
    op.create_table(
        "unidades",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("organization_id", sa.Uuid(), nullable=False),
        sa.Column("nome", sa.String(150), nullable=False),
        sa.Column("sigla", sa.String(20), nullable=True),
        sa.Column("ativo", sa.Boolean(), nullable=False, server_default=sa.text("true")),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
        sa.Column("deleted_at", sa.DateTime(timezone=True), nullable=True),
        sa.ForeignKeyConstraint(["organization_id"], ["organizations.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_unidades_organization_id", "unidades", ["organization_id"])
    op.create_index("ix_unidades_org_nome", "unidades", ["organization_id", "nome"])

    op.add_column("veiculos", sa.Column("unidade_id", sa.Uuid(), nullable=True))
    op.create_foreign_key("fk_veiculos_unidade", "veiculos", "unidades", ["unidade_id"], ["id"])
    op.create_index("ix_veiculos_unidade_id", "veiculos", ["unidade_id"])

    # Backfill: unidade > centro_custo > filial vira a lotação do veículo. O que
    # não couber (centro de custo/filial diferentes da unidade) vai para as
    # observações — nenhum texto é perdido.
    bind.execute(sa.text("""
        INSERT INTO unidades (id, organization_id, nome)
        SELECT gen_random_uuid(), organization_id, nome FROM (
            SELECT DISTINCT organization_id,
                   trim(coalesce(nullif(trim(unidade), ''), nullif(trim(centro_custo), ''),
                                 nullif(trim(filial), ''))) AS nome
            FROM veiculos
        ) t WHERE nome IS NOT NULL
    """))
    bind.execute(sa.text("""
        UPDATE veiculos v SET unidade_id = u.id
        FROM unidades u
        WHERE u.organization_id = v.organization_id
          AND u.nome = trim(coalesce(nullif(trim(v.unidade), ''), nullif(trim(v.centro_custo), ''),
                                     nullif(trim(v.filial), '')))
    """))
    for coluna, rotulo in (("centro_custo", "Centro de custo"), ("filial", "Filial")):
        bind.execute(sa.text(f"""
            UPDATE veiculos v SET observacoes =
                concat_ws(E'\\n', nullif(v.observacoes, ''), '{rotulo} (cadastro antigo): ' || trim(v.{coluna}))
            FROM unidades u
            WHERE u.id = v.unidade_id AND nullif(trim(v.{coluna}), '') IS NOT NULL
              AND trim(v.{coluna}) <> u.nome
        """))
    op.drop_column("veiculos", "unidade")
    op.drop_column("veiculos", "centro_custo")
    op.drop_column("veiculos", "filial")

    # ── 2) Fornecedor: posto credenciado ──────────────────────────────────
    op.add_column(
        "fornecedores",
        sa.Column("posto_credenciado", sa.Boolean(), nullable=False, server_default=sa.text("false")),
    )

    # ── 3) Abastecimento: modalidade, posto, NF, horímetro, alertas ───────
    op.add_column("abastecimentos", sa.Column(
        "modalidade", sa.String(20), nullable=False, server_default="TANQUE_PROPRIO"))
    op.alter_column("abastecimentos", "tanque_id", existing_type=sa.Uuid(), nullable=True)
    op.add_column("abastecimentos", sa.Column("fornecedor_id", sa.Uuid(), nullable=True))
    op.create_foreign_key("fk_abast_fornecedor", "abastecimentos", "fornecedores", ["fornecedor_id"], ["id"])
    op.create_index("ix_abastecimentos_fornecedor_id", "abastecimentos", ["fornecedor_id"])
    op.add_column("abastecimentos", sa.Column("unidade_id", sa.Uuid(), nullable=True))
    op.create_foreign_key("fk_abast_unidade", "abastecimentos", "unidades", ["unidade_id"], ["id"])
    op.create_index("ix_abastecimentos_unidade_id", "abastecimentos", ["unidade_id"])
    op.add_column("abastecimentos", sa.Column("horimetro", sa.Numeric(12, 1), nullable=True))
    op.add_column("abastecimentos", sa.Column("consumo_l_h", sa.Numeric(8, 2), nullable=True))
    op.add_column("abastecimentos", sa.Column("preco_litro", sa.Numeric(12, 4), nullable=True))
    op.add_column("abastecimentos", sa.Column("numero_nf", sa.String(50), nullable=True))
    op.add_column("abastecimentos", sa.Column("chave_nfe", sa.String(60), nullable=True))
    op.add_column("abastecimentos", sa.Column("alertas", sa.Text(), nullable=True))
    op.create_check_constraint(
        "ck_abast_modalidade_origem",
        "abastecimentos",
        "(modalidade = 'TANQUE_PROPRIO' AND tanque_id IS NOT NULL) OR "
        "(modalidade = 'POSTO_CREDENCIADO' AND fornecedor_id IS NOT NULL)",
    )
    bind.execute(sa.text("""
        UPDATE abastecimentos a SET unidade_id = v.unidade_id
        FROM veiculos v WHERE v.id = a.veiculo_id AND v.unidade_id IS NOT NULL
    """))

    # ── 4) Oficinas → fornecedores ────────────────────────────────────────
    op.add_column("manutencoes", sa.Column("unidade_id", sa.Uuid(), nullable=True))
    op.create_foreign_key("fk_manut_unidade", "manutencoes", "unidades", ["unidade_id"], ["id"])
    op.create_index("ix_manutencoes_unidade_id", "manutencoes", ["unidade_id"])
    bind.execute(sa.text("""
        UPDATE manutencoes m SET unidade_id = v.unidade_id
        FROM veiculos v WHERE v.id = m.veiculo_id AND v.unidade_id IS NOT NULL
    """))

    oficinas = bind.execute(sa.text("""
        SELECT o.id, o.organization_id, o.nome, o.razao_social, o.cpf_cnpj, o.telefone,
               o.email, o.endereco, o.responsavel, o.especialidade, o.observacoes, o.ativo,
               o.deleted_at, f.id AS fornecedor_existente
        FROM oficinas o
        LEFT JOIN fornecedores f ON f.id = o.fornecedor_id AND f.organization_id = o.organization_id
    """)).mappings().all()
    for o in oficinas:
        fornecedor_id = o["fornecedor_existente"]
        if fornecedor_id is None:
            obs = "\n".join(
                x for x in (
                    o["observacoes"],
                    f"Especialidade: {o['especialidade']}" if o["especialidade"] else None,
                ) if x
            ) or None
            fornecedor_id = bind.execute(sa.text("""
                INSERT INTO fornecedores (id, organization_id, razao_social, nome_fantasia, cpf_cnpj,
                    telefone, email, endereco, contato, categoria, observacoes, ativo,
                    created_at, updated_at, deleted_at)
                VALUES (gen_random_uuid(), :org, :razao, :fantasia, :doc, :tel, :email, :end,
                    :contato, 'MECANICA', :obs, :ativo, now(), now(), :deleted)
                RETURNING id
            """), {
                "org": o["organization_id"],
                "razao": o["razao_social"] or o["nome"],
                "fantasia": o["nome"],
                "doc": o["cpf_cnpj"],
                "tel": o["telefone"],
                "email": o["email"],
                "end": o["endereco"],
                "contato": o["responsavel"],
                "obs": obs,
                "ativo": o["ativo"],
                "deleted": o["deleted_at"],
            }).scalar_one()
        bind.execute(
            sa.text("UPDATE manutencoes SET fornecedor_id = :f WHERE oficina_id = :o AND fornecedor_id IS NULL"),
            {"f": fornecedor_id, "o": o["id"]},
        )
    op.drop_column("manutencoes", "oficina_id")
    op.drop_table("oficinas")

    # ── 5) Combustível só nos reservatórios ───────────────────────────────
    op.add_column("veiculos_tanques", sa.Column("combustivel_alternativo_id", sa.Uuid(), nullable=True))
    op.create_foreign_key(
        "fk_veiculo_tanque_comb_alt", "veiculos_tanques", "combustiveis",
        ["combustivel_alternativo_id"], ["id"],
    )
    # Garante o PRIMARY para quem tem principal (ou só secundário).
    bind.execute(sa.text("""
        INSERT INTO veiculos_tanques (id, organization_id, veiculo_id, combustivel_id, tank_type,
            capacidade, identificacao, ativo, created_at, updated_at)
        SELECT gen_random_uuid(), v.organization_id, v.id,
               coalesce(v.combustivel_principal_id, v.combustivel_secundario_id), 'PRIMARY',
               coalesce(v.capacidade_tanque_litros, 0), 'Tanque principal', true, now(), now()
        FROM veiculos v
        WHERE coalesce(v.combustivel_principal_id, v.combustivel_secundario_id) IS NOT NULL
          AND NOT EXISTS (SELECT 1 FROM veiculos_tanques t
                          WHERE t.veiculo_id = v.id AND t.tank_type = 'PRIMARY' AND t.deleted_at IS NULL)
    """))
    bind.execute(sa.text("""
        UPDATE veiculos_tanques t SET
            combustivel_alternativo_id = CASE
                WHEN v.combustivel_secundario_id IS NOT NULL
                     AND v.combustivel_secundario_id <> t.combustivel_id
                THEN v.combustivel_secundario_id END,
            capacidade = CASE WHEN coalesce(v.capacidade_tanque_litros, 0) > 0
                              THEN v.capacidade_tanque_litros ELSE t.capacidade END
        FROM veiculos v
        WHERE v.id = t.veiculo_id AND t.tank_type = 'PRIMARY' AND t.deleted_at IS NULL
    """))
    op.drop_column("veiculos", "combustivel_principal_id")
    op.drop_column("veiculos", "combustivel_secundario_id")
    op.drop_column("veiculos", "capacidade_tanque_litros")

    # ── 6) Configurações ──────────────────────────────────────────────────
    op.drop_column("govfrota_configuracoes", "foto_obrigatoria")
    op.drop_column("govfrota_configuracoes", "nome_modulo")
    op.add_column("govfrota_configuracoes", sa.Column("horario_abastecimento_inicio", sa.String(5), nullable=True))
    op.add_column("govfrota_configuracoes", sa.Column("horario_abastecimento_fim", sa.String(5), nullable=True))
    op.add_column("govfrota_configuracoes", sa.Column(
        "alerta_litros_acima_media_pct", sa.Integer(), nullable=False, server_default="50"))


def downgrade() -> None:
    bind = op.get_bind()

    op.drop_column("govfrota_configuracoes", "alerta_litros_acima_media_pct")
    op.drop_column("govfrota_configuracoes", "horario_abastecimento_fim")
    op.drop_column("govfrota_configuracoes", "horario_abastecimento_inicio")
    op.add_column("govfrota_configuracoes", sa.Column(
        "nome_modulo", sa.String(100), nullable=False, server_default="GovFrota"))
    op.add_column("govfrota_configuracoes", sa.Column(
        "foto_obrigatoria", sa.Boolean(), nullable=False, server_default=sa.text("false")))

    op.add_column("veiculos", sa.Column("capacidade_tanque_litros", sa.Numeric(12, 2), nullable=True))
    op.add_column("veiculos", sa.Column("combustivel_secundario_id", sa.Uuid(), nullable=True))
    op.add_column("veiculos", sa.Column("combustivel_principal_id", sa.Uuid(), nullable=True))
    bind.execute(sa.text("""
        UPDATE veiculos v SET combustivel_principal_id = t.combustivel_id,
            combustivel_secundario_id = t.combustivel_alternativo_id,
            capacidade_tanque_litros = nullif(t.capacidade, 0)
        FROM veiculos_tanques t
        WHERE t.veiculo_id = v.id AND t.tank_type = 'PRIMARY' AND t.deleted_at IS NULL
    """))
    op.drop_constraint("fk_veiculo_tanque_comb_alt", "veiculos_tanques", type_="foreignkey")
    op.drop_column("veiculos_tanques", "combustivel_alternativo_id")

    op.create_table(
        "oficinas",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("organization_id", sa.Uuid(), nullable=False),
        sa.Column("nome", sa.String(255), nullable=False),
        sa.Column("razao_social", sa.String(255), nullable=True),
        sa.Column("cpf_cnpj", sa.String(20), nullable=True),
        sa.Column("telefone", sa.String(30), nullable=True),
        sa.Column("email", sa.String(255), nullable=True),
        sa.Column("endereco", sa.String(300), nullable=True),
        sa.Column("responsavel", sa.String(150), nullable=True),
        sa.Column("especialidade", sa.String(150), nullable=True),
        sa.Column("observacoes", sa.Text(), nullable=True),
        sa.Column("fornecedor_id", sa.Uuid(), nullable=True),
        sa.Column("ativo", sa.Boolean(), nullable=False, server_default=sa.text("true")),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
        sa.Column("deleted_at", sa.DateTime(timezone=True), nullable=True),
        sa.ForeignKeyConstraint(["organization_id"], ["organizations.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.add_column("manutencoes", sa.Column("oficina_id", sa.Uuid(), nullable=True))
    op.drop_index("ix_manutencoes_unidade_id", table_name="manutencoes")
    op.drop_constraint("fk_manut_unidade", "manutencoes", type_="foreignkey")
    op.drop_column("manutencoes", "unidade_id")

    op.drop_constraint("ck_abast_modalidade_origem", "abastecimentos", type_="check")
    for coluna in ("alertas", "chave_nfe", "numero_nf", "preco_litro", "consumo_l_h", "horimetro"):
        op.drop_column("abastecimentos", coluna)
    op.drop_index("ix_abastecimentos_unidade_id", table_name="abastecimentos")
    op.drop_constraint("fk_abast_unidade", "abastecimentos", type_="foreignkey")
    op.drop_column("abastecimentos", "unidade_id")
    op.drop_index("ix_abastecimentos_fornecedor_id", table_name="abastecimentos")
    op.drop_constraint("fk_abast_fornecedor", "abastecimentos", type_="foreignkey")
    op.drop_column("abastecimentos", "fornecedor_id")
    # Abastecimentos em posto não têm tanque: não cabem no esquema antigo.
    bind.execute(sa.text("DELETE FROM abastecimentos WHERE tanque_id IS NULL"))
    op.alter_column("abastecimentos", "tanque_id", existing_type=sa.Uuid(), nullable=False)
    op.drop_column("abastecimentos", "modalidade")

    op.drop_column("fornecedores", "posto_credenciado")

    op.add_column("veiculos", sa.Column("unidade", sa.String(150), nullable=True))
    op.add_column("veiculos", sa.Column("filial", sa.String(150), nullable=True))
    op.add_column("veiculos", sa.Column("centro_custo", sa.String(150), nullable=True))
    bind.execute(sa.text("""
        UPDATE veiculos v SET unidade = u.nome FROM unidades u WHERE u.id = v.unidade_id
    """))
    op.drop_index("ix_veiculos_unidade_id", table_name="veiculos")
    op.drop_constraint("fk_veiculos_unidade", "veiculos", type_="foreignkey")
    op.drop_column("veiculos", "unidade_id")
    op.drop_index("ix_unidades_org_nome", table_name="unidades")
    op.drop_index("ix_unidades_organization_id", table_name="unidades")
    op.drop_table("unidades")
