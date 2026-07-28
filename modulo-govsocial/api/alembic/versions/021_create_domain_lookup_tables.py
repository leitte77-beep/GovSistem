"""Create domain lookup tables for Fase 3.4 cadastros gerais.

Revision ID: 021
Revises: 020
Create Date: 2026-07-14
"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa

revision: str = "021"
down_revision: Union[str, None] = "020"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


DOMAIN_TABLES = {
    "tipos_atividade_coletiva": None,
    "vulnerabilidade_tipos": ["nivel VARCHAR(20)"],
    "graus_instrucao": None,
    "pontos_embarque": ["endereco VARCHAR(255)"],
    "cartorios": ["nome VARCHAR(150) NOT NULL", "telefone VARCHAR(20)", "titular VARCHAR(100)",
                  "substituto VARCHAR(100)", "endereco VARCHAR(255)"],
    "orientacoes_sexuais": None,
    "motivos_reinsercao": None,
    "motivos_cancelamento": None,
    "programas_sociais": ["tipo VARCHAR(50)"],
    "equipes_atendimento": ["unidade_id UUID"],
    "objetivos_encaminhamento": ["tipo VARCHAR(50)"],
    "procedimentos_realizados": None,
    "atos_infracionais": ["artigo VARCHAR(50)"],
    "potencialidades": None,
    "necessidades_especiais": ["tipo VARCHAR(50)"],
    "cargos": None,
    "parcerias": None,
    "instituicoes": None,
    "motivos_inativacao_programa": None,
    "motivos_encerramento_acolhimento": None,
    "origens_encaminhamento": None,
    "estrategias_atendimento": ["tipo VARCHAR(50)"],
    "grupos_insumos": ["grupo_pai_id UUID"],
    "especialidades": ["cbo VARCHAR(10)", "area_social BOOLEAN NOT NULL DEFAULT TRUE"],
    "pessoas_juridicas": ["razao_social VARCHAR(200) NOT NULL", "nome_fantasia VARCHAR(150)",
                          "cnpj VARCHAR(18)", "email VARCHAR(100)", "telefone VARCHAR(20)",
                          "endereco VARCHAR(255)"],
    "regimes_contratacao": ["tipo VARCHAR(50)"],
    "motivos_acolhimento": None,
    "religioes": None,
    "bairros_dominio": ["localizacao VARCHAR(50)", "municipio VARCHAR(100)"],
    "logradouros_dominio": ["tipo VARCHAR(30)", "nome VARCHAR(150) NOT NULL", "municipio VARCHAR(100)"],
    "unidades_federativas": ["sigla VARCHAR(2) NOT NULL"],
    "estados_civis": None,
    "orgaos_emissores": None,
    "motivos_inativacao": None,
    "parentescos_dominio": ["consanguineo BOOLEAN"],
    "unidades_medida": ["sigla VARCHAR(10)", "permite_fracionado BOOLEAN NOT NULL DEFAULT FALSE"],
    "escolaridades_dominio": None,
    "feriados": ["data DATE NOT NULL"],
}

BASE_COLS = [
    "id UUID PRIMARY KEY DEFAULT gen_random_uuid()",
    "tenant_id VARCHAR(36) NOT NULL",
    "descricao VARCHAR(150) NOT NULL",
    "ativo BOOLEAN NOT NULL DEFAULT TRUE",
    "created_at TIMESTAMPTZ DEFAULT now()",
    "updated_at TIMESTAMPTZ DEFAULT now()",
    "deleted_at TIMESTAMPTZ",
]


def upgrade() -> None:
    for table_name, extra_cols in DOMAIN_TABLES.items():
        cols = list(BASE_COLS)
        if extra_cols:
            cols.extend(extra_cols)
        col_sql = ",\n  ".join(cols)
        op.execute(sa.text(
            f"CREATE TABLE IF NOT EXISTS {table_name} (\n  {col_sql}\n)"
        ))
        op.create_index(f"ix_{table_name}_tenant", table_name, ["tenant_id"])


def downgrade() -> None:
    for table_name in reversed(DOMAIN_TABLES):
        op.drop_table(table_name)
