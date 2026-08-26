"""Create GovFrota tables

Revision ID: 001
Revises:
Create Date: 2026-08-26
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision: str = "001"
down_revision: Union[str, None] = None
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def _uuid_pk():
    return sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True, default=sa.text("gen_random_uuid()"))


def _timestamps():
    return [
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
    ]


def upgrade() -> None:
    # ── Auth / tenant ────────────────────────────────────
    op.create_table(
        "organizations",
        _uuid_pk(),
        sa.Column("name", sa.String(255), nullable=False),
        sa.Column("slug", sa.String(100), unique=True, nullable=False, index=True),
        sa.Column("cnpj", sa.String(18), unique=True, nullable=True),
        sa.Column("description", sa.Text(), nullable=True),
        sa.Column("logo_url", sa.String(500), nullable=True),
        sa.Column("public_url", sa.String(255), nullable=True),
        sa.Column("is_active", sa.Boolean(), nullable=False, server_default=sa.text("true")),
        *_timestamps(),
        sa.Column("deleted_at", sa.DateTime(timezone=True), nullable=True),
    )

    op.create_table(
        "roles",
        _uuid_pk(),
        sa.Column("name", sa.String(50), unique=True, nullable=False, index=True),
        sa.Column("label", sa.String(100), nullable=False),
        sa.Column("description", sa.Text(), nullable=True),
        sa.Column("is_system", sa.Boolean(), nullable=False, server_default=sa.text("false")),
        *_timestamps(),
    )

    op.create_table(
        "role_permissions",
        _uuid_pk(),
        sa.Column("role_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("roles.id", ondelete="CASCADE"), nullable=False, index=True),
        sa.Column("permission", sa.String(100), nullable=False, index=True),
        *_timestamps(),
    )

    op.create_table(
        "users",
        _uuid_pk(),
        sa.Column("organization_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("organizations.id", ondelete="SET NULL"), nullable=True, index=True),
        sa.Column("name", sa.String(255), nullable=False),
        sa.Column("email", sa.String(255), unique=True, nullable=False, index=True),
        sa.Column("password_hash", sa.String(255), nullable=True),
        sa.Column("is_active", sa.Boolean(), nullable=False, server_default=sa.text("true")),
        *_timestamps(),
        sa.Column("deleted_at", sa.DateTime(timezone=True), nullable=True),
    )

    op.create_table(
        "user_roles",
        _uuid_pk(),
        sa.Column("user_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
        sa.Column("role_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("roles.id", ondelete="CASCADE"), nullable=False),
        sa.UniqueConstraint("user_id", "role_id", name="uq_user_role"),
        *_timestamps(),
    )

    # ── Configurações ────────────────────────────────────
    op.create_table(
        "govfrota_configuracoes",
        _uuid_pk(),
        sa.Column("organization_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("organizations.id", ondelete="CASCADE"), unique=True, nullable=False, index=True),
        sa.Column("tipo_organizacao", sa.String(20), nullable=False, server_default="PUBLICO"),
        sa.Column("nome_modulo", sa.String(100), nullable=False, server_default="GovFrota"),
        sa.Column("foto_obrigatoria", sa.Boolean(), nullable=False, server_default=sa.text("false")),
        sa.Column("foto_bomba_obrigatoria", sa.Boolean(), nullable=False, server_default=sa.text("false")),
        sa.Column("foto_km_obrigatoria", sa.Boolean(), nullable=False, server_default=sa.text("false")),
        sa.Column("exigir_tanque_cheio", sa.Boolean(), nullable=False, server_default=sa.text("false")),
        sa.Column("permitir_retroativo", sa.Boolean(), nullable=False, server_default=sa.text("true")),
        sa.Column("tolerancia_km_percentual", sa.Integer(), nullable=False, server_default="20"),
        sa.Column("alerta_consumo_desvio_pct", sa.Integer(), nullable=False, server_default="30"),
        sa.Column("bloquear_cnh_vencida", sa.Boolean(), nullable=False, server_default=sa.text("true")),
        sa.Column("permitir_estoque_negativo", sa.Boolean(), nullable=False, server_default=sa.text("false")),
        sa.Column("exigir_nf_entrada", sa.Boolean(), nullable=False, server_default=sa.text("true")),
        sa.Column("exigir_fornecedor_entrada", sa.Boolean(), nullable=False, server_default=sa.text("true")),
        sa.Column("alerta_estoque_minimo_dias", sa.Integer(), nullable=False, server_default="7"),
        sa.Column("antecedencia_alerta_manutencao_dias", sa.Integer(), nullable=False, server_default="15"),
        *_timestamps(),
    )

    # ── Combustíveis / tanques ───────────────────────────
    op.create_table(
        "combustiveis",
        _uuid_pk(),
        sa.Column("organization_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("organizations.id", ondelete="CASCADE"), nullable=False, index=True),
        sa.Column("nome", sa.String(100), nullable=False),
        sa.Column("unidade", sa.String(20), nullable=False, server_default="litro"),
        sa.Column("descricao", sa.Text(), nullable=True),
        sa.Column("ativo", sa.Boolean(), nullable=False, server_default=sa.text("true")),
        *_timestamps(),
        sa.Column("deleted_at", sa.DateTime(timezone=True), nullable=True),
    )

    op.create_table(
        "tanques",
        _uuid_pk(),
        sa.Column("organization_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("organizations.id", ondelete="CASCADE"), nullable=False, index=True),
        sa.Column("nome", sa.String(150), nullable=False),
        sa.Column("codigo", sa.String(50), nullable=True),
        sa.Column("localizacao", sa.String(255), nullable=True),
        sa.Column("combustivel_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("combustiveis.id"), nullable=False),
        sa.Column("capacidade_maxima", sa.Numeric(14, 2), nullable=False),
        sa.Column("estoque_inicial", sa.Numeric(14, 2), nullable=False, server_default="0"),
        sa.Column("estoque_atual", sa.Numeric(14, 2), nullable=False, server_default="0"),
        sa.Column("estoque_minimo", sa.Numeric(14, 2), nullable=False, server_default="0"),
        sa.Column("ativo", sa.Boolean(), nullable=False, server_default=sa.text("true")),
        sa.Column("observacoes", sa.Text(), nullable=True),
        *_timestamps(),
        sa.Column("deleted_at", sa.DateTime(timezone=True), nullable=True),
    )
    op.create_index("ix_tanques_org_combustivel", "tanques", ["organization_id", "combustivel_id"])

    # ── Veículos ─────────────────────────────────────────
    op.create_table(
        "veiculos",
        _uuid_pk(),
        sa.Column("organization_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("organizations.id", ondelete="CASCADE"), nullable=False, index=True),
        sa.Column("placa", sa.String(10), nullable=False, index=True),
        sa.Column("renavam", sa.String(20), nullable=True),
        sa.Column("chassi", sa.String(30), nullable=True),
        sa.Column("codigo_interno", sa.String(50), nullable=True),
        sa.Column("patrimonio", sa.String(50), nullable=True),
        sa.Column("marca", sa.String(60), nullable=True),
        sa.Column("modelo", sa.String(100), nullable=True),
        sa.Column("versao", sa.String(100), nullable=True),
        sa.Column("ano_fabricacao", sa.Integer(), nullable=True),
        sa.Column("ano_modelo", sa.Integer(), nullable=True),
        sa.Column("cor", sa.String(40), nullable=True),
        sa.Column("tipo", sa.String(30), nullable=False, server_default="CARRO"),
        sa.Column("combustivel_principal_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("combustiveis.id"), nullable=True),
        sa.Column("combustivel_secundario_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("combustiveis.id"), nullable=True),
        sa.Column("capacidade_tanque_litros", sa.Numeric(12, 2), nullable=True),
        sa.Column("quilometragem_atual", sa.BigInteger(), nullable=False, server_default="0"),
        sa.Column("horimetro_atual", sa.Numeric(12, 1), nullable=True),
        sa.Column("usa_horimetro", sa.Boolean(), nullable=False, server_default=sa.text("false")),
        sa.Column("unidade", sa.String(150), nullable=True),
        sa.Column("departamento", sa.String(150), nullable=True),
        sa.Column("filial", sa.String(150), nullable=True),
        sa.Column("centro_custo", sa.String(150), nullable=True),
        sa.Column("situacao", sa.String(20), nullable=False, server_default="DISPONIVEL"),
        sa.Column("observacoes", sa.Text(), nullable=True),
        sa.Column("vencimento_licenciamento", sa.Date(), nullable=True),
        sa.Column("vencimento_seguro", sa.Date(), nullable=True),
        sa.Column("foto_url", sa.String(500), nullable=True),
        *_timestamps(),
        sa.Column("deleted_at", sa.DateTime(timezone=True), nullable=True),
    )
    op.create_index("ix_veiculos_org_placa_ativo", "veiculos", ["organization_id", "placa", "deleted_at"])
    op.create_index("ix_veiculos_org_situacao", "veiculos", ["organization_id", "situacao"])

    op.create_table(
        "veiculos_documentos",
        _uuid_pk(),
        sa.Column("organization_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("organizations.id", ondelete="CASCADE"), nullable=False, index=True),
        sa.Column("veiculo_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("veiculos.id", ondelete="CASCADE"), nullable=False, index=True),
        sa.Column("descricao", sa.String(255), nullable=False),
        sa.Column("tipo", sa.String(50), nullable=True),
        sa.Column("vencimento", sa.Date(), nullable=True),
        sa.Column("anexo_id", postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column("arquivo_url", sa.String(500), nullable=True),
        sa.Column("observacoes", sa.Text(), nullable=True),
        *_timestamps(),
    )

    op.create_table(
        "veiculos_alteracoes_km",
        _uuid_pk(),
        sa.Column("organization_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("organizations.id", ondelete="CASCADE"), nullable=False, index=True),
        sa.Column("veiculo_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("veiculos.id", ondelete="CASCADE"), nullable=False, index=True),
        sa.Column("km_anterior", sa.BigInteger(), nullable=False),
        sa.Column("km_novo", sa.BigInteger(), nullable=False),
        sa.Column("usuario_id", postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column("justificativa", sa.Text(), nullable=True),
        *_timestamps(),
    )

    # ── Motoristas ───────────────────────────────────────
    op.create_table(
        "motoristas",
        _uuid_pk(),
        sa.Column("organization_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("organizations.id", ondelete="CASCADE"), nullable=False, index=True),
        sa.Column("nome", sa.String(255), nullable=False),
        sa.Column("cpf", sa.String(14), nullable=False, index=True),
        sa.Column("matricula", sa.String(50), nullable=True),
        sa.Column("telefone", sa.String(30), nullable=True),
        sa.Column("email", sa.String(255), nullable=True),
        sa.Column("cnh_numero", sa.String(20), nullable=True),
        sa.Column("cnh_categoria", sa.String(5), nullable=True),
        sa.Column("cnh_validade", sa.Date(), nullable=True),
        sa.Column("observacoes", sa.Text(), nullable=True),
        sa.Column("foto_url", sa.String(500), nullable=True),
        sa.Column("ativo", sa.Boolean(), nullable=False, server_default=sa.text("true")),
        *_timestamps(),
        sa.Column("deleted_at", sa.DateTime(timezone=True), nullable=True),
        sa.UniqueConstraint("organization_id", "cpf", "deleted_at", name="uq_motorista_org_cpf"),
    )

    op.create_table(
        "acessos_motorista",
        _uuid_pk(),
        sa.Column("organization_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("organizations.id", ondelete="CASCADE"), nullable=False, index=True),
        sa.Column("motorista_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("motoristas.id", ondelete="CASCADE"), unique=True, nullable=False, index=True),
        sa.Column("login", sa.String(60), nullable=False, index=True),
        sa.Column("senha_hash", sa.String(255), nullable=False),
        sa.Column("bloqueado", sa.Boolean(), nullable=False, server_default=sa.text("false")),
        sa.Column("falhas_login", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("locked_until", sa.DateTime(timezone=True), nullable=True),
        sa.Column("ultimo_acesso", sa.DateTime(timezone=True), nullable=True),
        *_timestamps(),
    )

    # ── Fornecedores / oficinas ──────────────────────────
    op.create_table(
        "fornecedores",
        _uuid_pk(),
        sa.Column("organization_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("organizations.id", ondelete="CASCADE"), nullable=False, index=True),
        sa.Column("razao_social", sa.String(255), nullable=False),
        sa.Column("nome_fantasia", sa.String(255), nullable=True),
        sa.Column("cpf_cnpj", sa.String(20), nullable=True, index=True),
        sa.Column("telefone", sa.String(30), nullable=True),
        sa.Column("email", sa.String(255), nullable=True),
        sa.Column("endereco", sa.String(300), nullable=True),
        sa.Column("contato", sa.String(150), nullable=True),
        sa.Column("categoria", sa.String(30), nullable=False, server_default="COMBUSTIVEL"),
        sa.Column("observacoes", sa.Text(), nullable=True),
        sa.Column("ativo", sa.Boolean(), nullable=False, server_default=sa.text("true")),
        *_timestamps(),
        sa.Column("deleted_at", sa.DateTime(timezone=True), nullable=True),
    )

    op.create_table(
        "oficinas",
        _uuid_pk(),
        sa.Column("organization_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("organizations.id", ondelete="CASCADE"), nullable=False, index=True),
        sa.Column("nome", sa.String(255), nullable=False),
        sa.Column("razao_social", sa.String(255), nullable=True),
        sa.Column("cpf_cnpj", sa.String(20), nullable=True),
        sa.Column("telefone", sa.String(30), nullable=True),
        sa.Column("email", sa.String(255), nullable=True),
        sa.Column("endereco", sa.String(300), nullable=True),
        sa.Column("responsavel", sa.String(150), nullable=True),
        sa.Column("especialidade", sa.String(150), nullable=True),
        sa.Column("observacoes", sa.Text(), nullable=True),
        sa.Column("fornecedor_id", postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column("ativo", sa.Boolean(), nullable=False, server_default=sa.text("true")),
        *_timestamps(),
        sa.Column("deleted_at", sa.DateTime(timezone=True), nullable=True),
    )

    # ── Estoque ──────────────────────────────────────────
    op.create_table(
        "entradas_combustivel",
        _uuid_pk(),
        sa.Column("organization_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("organizations.id", ondelete="CASCADE"), nullable=False, index=True),
        sa.Column("tanque_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("tanques.id"), nullable=False),
        sa.Column("combustivel_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("combustiveis.id"), nullable=False),
        sa.Column("fornecedor_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("fornecedores.id"), nullable=True),
        sa.Column("quantidade_litros", sa.Numeric(14, 2), nullable=False),
        sa.Column("data_entrada", sa.Date(), nullable=False),
        sa.Column("numero_nota", sa.String(50), nullable=True),
        sa.Column("serie_nota", sa.String(20), nullable=True),
        sa.Column("chave_nfe", sa.String(60), nullable=True),
        sa.Column("valor_total", sa.Numeric(15, 2), nullable=True),
        sa.Column("valor_por_litro", sa.Numeric(12, 4), nullable=True),
        sa.Column("responsavel_usuario_id", postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column("observacoes", sa.Text(), nullable=True),
        sa.Column("anexo_id", postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column("cancelada", sa.Boolean(), nullable=False, server_default=sa.text("false")),
        sa.Column("cancelada_em", sa.DateTime(timezone=True), nullable=True),
        sa.Column("cancelada_por_id", postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column("motivo_cancelamento", sa.Text(), nullable=True),
        *_timestamps(),
    )
    op.create_index("ix_entradas_org_data", "entradas_combustivel", ["organization_id", "data_entrada"])
    op.create_index("ix_entradas_org_tanque", "entradas_combustivel", ["organization_id", "tanque_id"])

    op.create_table(
        "movimentacoes_estoque",
        _uuid_pk(),
        sa.Column("organization_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("organizations.id", ondelete="CASCADE"), nullable=False, index=True),
        sa.Column("tipo", sa.String(30), nullable=False),
        sa.Column("origem", sa.String(40), nullable=False),
        sa.Column("sinal", sa.Integer(), nullable=False),
        sa.Column("quantidade", sa.Numeric(14, 2), nullable=False),
        sa.Column("combustivel_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("combustiveis.id"), nullable=False),
        sa.Column("tanque_destino_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("tanques.id"), nullable=False),
        sa.Column("tanque_origem_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("tanques.id"), nullable=True),
        sa.Column("referencia_id", postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column("referencia_tipo", sa.String(50), nullable=True),
        sa.Column("descricao", sa.Text(), nullable=True),
        sa.Column("custo_unitario", sa.Numeric(12, 4), nullable=True),
        sa.Column("responsavel_usuario_id", postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column("responsavel_motorista_id", postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column("saldo_apos", sa.Numeric(14, 2), nullable=True),
        *_timestamps(),
    )
    op.create_index("ix_movim_org_tanque_data", "movimentacoes_estoque", ["organization_id", "tanque_destino_id", "created_at"])
    op.create_index("ix_movim_origem_ref", "movimentacoes_estoque", ["origem", "referencia_id"])

    op.create_table(
        "inventarios_tanque",
        _uuid_pk(),
        sa.Column("organization_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("organizations.id", ondelete="CASCADE"), nullable=False, index=True),
        sa.Column("tanque_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("tanques.id"), nullable=False),
        sa.Column("estoque_sistema", sa.Numeric(14, 2), nullable=False),
        sa.Column("estoque_fisico", sa.Numeric(14, 2), nullable=False),
        sa.Column("diferenca", sa.Numeric(14, 2), nullable=False),
        sa.Column("data_conferencia", sa.Date(), nullable=False),
        sa.Column("justificativa", sa.Text(), nullable=True),
        sa.Column("ajuste_aplicado", sa.Boolean(), nullable=False, server_default=sa.text("false")),
        sa.Column("movimentacao_ajuste_id", postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column("usuario_id", postgresql.UUID(as_uuid=True), nullable=True),
        *_timestamps(),
    )

    # ── Abastecimentos ───────────────────────────────────
    op.create_table(
        "abastecimentos",
        _uuid_pk(),
        sa.Column("organization_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("organizations.id", ondelete="CASCADE"), nullable=False, index=True),
        sa.Column("veiculo_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("veiculos.id"), nullable=False, index=True),
        sa.Column("motorista_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("motoristas.id"), nullable=True, index=True),
        sa.Column("tanque_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("tanques.id"), nullable=False, index=True),
        sa.Column("combustivel_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("combustiveis.id"), nullable=False),
        sa.Column("quantidade_litros", sa.Numeric(12, 2), nullable=False),
        sa.Column("quilometragem", sa.BigInteger(), nullable=False),
        sa.Column("completou_tanque", sa.Boolean(), nullable=True),
        sa.Column("origem", sa.String(20), nullable=False, server_default="APP_MOTORISTA"),
        sa.Column("lancado_por_usuario_id", postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column("data_abastecimento", sa.DateTime(timezone=True), nullable=False),
        sa.Column("custo_medio_litro", sa.Numeric(12, 4), nullable=True),
        sa.Column("custo_total", sa.Numeric(15, 2), nullable=True),
        sa.Column("consumo_km_l", sa.Numeric(8, 2), nullable=True),
        sa.Column("foto_bomba_url", sa.String(500), nullable=True),
        sa.Column("foto_painel_url", sa.String(500), nullable=True),
        sa.Column("observacoes", sa.Text(), nullable=True),
        sa.Column("status", sa.String(20), nullable=False, server_default="CONFIRMADO"),
        sa.Column("cancelado_em", sa.DateTime(timezone=True), nullable=True),
        sa.Column("cancelado_por_id", postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column("motivo_cancelamento", sa.Text(), nullable=True),
        sa.Column("ip_origem", sa.String(60), nullable=True),
        *_timestamps(),
        sa.Column("deleted_at", sa.DateTime(timezone=True), nullable=True),
    )
    op.create_index("ix_abast_org_data", "abastecimentos", ["organization_id", "data_abastecimento"])

    op.create_table(
        "correcoes_abastecimento",
        _uuid_pk(),
        sa.Column("organization_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("organizations.id", ondelete="CASCADE"), nullable=False, index=True),
        sa.Column("abastecimento_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("abastecimentos.id"), nullable=False, index=True),
        sa.Column("tipo_correcao", sa.String(30), nullable=False),
        sa.Column("dados_anteriores_json", sa.Text(), nullable=True),
        sa.Column("dados_novos_json", sa.Text(), nullable=True),
        sa.Column("justificativa", sa.Text(), nullable=False),
        sa.Column("usuario_id", postgresql.UUID(as_uuid=True), nullable=True),
        *_timestamps(),
    )

    # ── Manutenção ───────────────────────────────────────
    op.create_table(
        "manutencoes",
        _uuid_pk(),
        sa.Column("organization_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("organizations.id", ondelete="CASCADE"), nullable=False, index=True),
        sa.Column("veiculo_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("veiculos.id"), nullable=False, index=True),
        sa.Column("tipo", sa.String(30), nullable=False),
        sa.Column("descricao_problema", sa.Text(), nullable=True),
        sa.Column("quilometragem", sa.BigInteger(), nullable=True),
        sa.Column("data_solicitacao", sa.Date(), nullable=False),
        sa.Column("prioridade", sa.String(15), nullable=False, server_default="NORMAL"),
        sa.Column("oficina_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("oficinas.id"), nullable=True),
        sa.Column("fornecedor_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("fornecedores.id"), nullable=True),
        sa.Column("responsavel", sa.String(150), nullable=True),
        sa.Column("previsao_conclusao", sa.Date(), nullable=True),
        sa.Column("data_conclusao", sa.Date(), nullable=True),
        sa.Column("valor_total", sa.Numeric(15, 2), nullable=False, server_default="0"),
        sa.Column("status", sa.String(30), nullable=False, server_default="ABERTA"),
        sa.Column("observacoes", sa.Text(), nullable=True),
        sa.Column("ocorrencia_origem_id", postgresql.UUID(as_uuid=True), nullable=True),
        *_timestamps(),
        sa.Column("deleted_at", sa.DateTime(timezone=True), nullable=True),
    )
    op.create_index("ix_manut_org_status", "manutencoes", ["organization_id", "status"])

    op.create_table(
        "manutencoes_itens",
        _uuid_pk(),
        sa.Column("organization_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("organizations.id", ondelete="CASCADE"), nullable=False, index=True),
        sa.Column("manutencao_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("manutencoes.id", ondelete="CASCADE"), nullable=False, index=True),
        sa.Column("categoria", sa.String(30), nullable=False, server_default="SERVICO"),
        sa.Column("descricao", sa.String(300), nullable=False),
        sa.Column("quantidade", sa.Integer(), nullable=False, server_default="1"),
        sa.Column("valor_unitario", sa.Numeric(15, 2), nullable=False, server_default="0"),
        sa.Column("valor_total", sa.Numeric(15, 2), nullable=False, server_default="0"),
        *_timestamps(),
    )

    op.create_table(
        "planos_preventivos",
        _uuid_pk(),
        sa.Column("organization_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("organizations.id", ondelete="CASCADE"), nullable=False, index=True),
        sa.Column("veiculo_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("veiculos.id"), nullable=False),
        sa.Column("nome", sa.String(150), nullable=False),
        sa.Column("base", sa.String(20), nullable=False),
        sa.Column("intervalo_km", sa.Integer(), nullable=True),
        sa.Column("intervalo_horimetro", sa.Numeric(12, 1), nullable=True),
        sa.Column("intervalo_meses", sa.Integer(), nullable=True),
        sa.Column("ativo", sa.Boolean(), nullable=False, server_default=sa.text("true")),
        sa.Column("ultima_execucao_km", sa.BigInteger(), nullable=True),
        sa.Column("ultima_execucao_horimetro", sa.Numeric(12, 1), nullable=True),
        sa.Column("ultima_execucao_data", sa.Date(), nullable=True),
        sa.Column("observacoes", sa.Text(), nullable=True),
        *_timestamps(),
        sa.Column("deleted_at", sa.DateTime(timezone=True), nullable=True),
    )

    # ── Ocorrências ──────────────────────────────────────
    op.create_table(
        "ocorrencias",
        _uuid_pk(),
        sa.Column("organization_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("organizations.id", ondelete="CASCADE"), nullable=False, index=True),
        sa.Column("veiculo_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("veiculos.id"), nullable=False, index=True),
        sa.Column("motorista_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("motoristas.id"), nullable=True),
        sa.Column("categoria", sa.String(40), nullable=False),
        sa.Column("descricao", sa.Text(), nullable=False),
        sa.Column("quilometragem", sa.BigInteger(), nullable=True),
        sa.Column("gravidade", sa.String(15), nullable=False, server_default="MEDIA"),
        sa.Column("status", sa.String(30), nullable=False, server_default="ABERTA"),
        sa.Column("foto_url", sa.String(500), nullable=True),
        sa.Column("data_ocorrencia", sa.Date(), nullable=False),
        sa.Column("manutencao_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("manutencoes.id"), nullable=True),
        sa.Column("origem", sa.String(20), nullable=False, server_default="ADMIN"),
        *_timestamps(),
        sa.Column("deleted_at", sa.DateTime(timezone=True), nullable=True),
    )
    op.create_index("ix_ocorr_org_gravidade", "ocorrencias", ["organization_id", "gravidade"])

    # ── Auditoria / notificações / anexos ────────────────
    op.create_table(
        "auditorias",
        _uuid_pk(),
        sa.Column("organization_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("organizations.id", ondelete="CASCADE"), nullable=False, index=True),
        sa.Column("usuario_id", postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column("motorista_id", postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column("acao", sa.String(80), nullable=False, index=True),
        sa.Column("entidade", sa.String(60), nullable=False),
        sa.Column("entidade_id", postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column("dados_anteriores", sa.Text(), nullable=True),
        sa.Column("dados_novos", sa.Text(), nullable=True),
        sa.Column("justificativa", sa.Text(), nullable=True),
        sa.Column("ip_address", sa.String(60), nullable=True),
        sa.Column("user_agent", sa.String(300), nullable=True),
        *_timestamps(),
    )
    op.create_index("ix_auditoria_entidade", "auditorias", ["entidade", "entidade_id"])

    op.create_table(
        "notificacoes",
        _uuid_pk(),
        sa.Column("organization_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("organizations.id", ondelete="CASCADE"), nullable=False, index=True),
        sa.Column("tipo", sa.String(40), nullable=False),
        sa.Column("titulo", sa.String(255), nullable=False),
        sa.Column("descricao", sa.Text(), nullable=True),
        sa.Column("severidade", sa.String(15), nullable=False, server_default="INFO"),
        sa.Column("link", sa.String(300), nullable=True),
        sa.Column("lida", sa.Boolean(), nullable=False, server_default=sa.text("false")),
        sa.Column("lida_em", sa.DateTime(timezone=True), nullable=True),
        *_timestamps(),
    )

    op.create_table(
        "anexos",
        _uuid_pk(),
        sa.Column("organization_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("organizations.id", ondelete="CASCADE"), nullable=False, index=True),
        sa.Column("nome_arquivo", sa.String(255), nullable=False),
        sa.Column("caminho", sa.String(500), nullable=False),
        sa.Column("mime_type", sa.String(120), nullable=True),
        sa.Column("tamanho_bytes", sa.Integer(), nullable=True),
        sa.Column("tipo", sa.String(50), nullable=False, server_default="OUTRO"),
        sa.Column("enviado_por_usuario_id", postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column("enviado_por_motorista_id", postgresql.UUID(as_uuid=True), nullable=True),
        *_timestamps(),
        sa.Column("deleted_at", sa.DateTime(timezone=True), nullable=True),
    )


def downgrade() -> None:
    for tabela in [
        "anexos", "notificacoes", "auditorias", "ocorrencias", "planos_preventivos",
        "manutencoes_itens", "manutencoes", "correcoes_abastecimento", "abastecimentos",
        "inventarios_tanque", "movimentacoes_estoque", "entradas_combustivel",
        "oficinas", "fornecedores", "acessos_motorista", "motoristas",
        "veiculos_alteracoes_km", "veiculos_documentos", "veiculos",
        "tanques", "combustiveis", "govfrota_configuracoes",
        "user_roles", "users", "role_permissions", "roles", "organizations",
    ]:
        op.drop_table(tabela)
