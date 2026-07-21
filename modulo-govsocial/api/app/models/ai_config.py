"""AIConfig — Configuracao de IA por tenant para geracao de documentos."""

from sqlalchemy import Boolean, Integer, String, Text, func
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base, TimestampMixin


class AIConfig(Base, TimestampMixin):
    """Configuracao de IA por orgao (tenant).

    Cada tenant pode configurar suas proprias credenciais de acesso a API
    de IA. O campo `password` armazena a API key da OpenAI criptografada
    com Fernet (coluna-level encryption).

    NOTA: A API da OpenAI nao suporta login/senha de conta — apenas API keys.
    Para atender ao requisito de "login/senha do ChatGPT", mapeamos:
      - email   → identificador da conta (armazenado em texto plano)
      - password → API key da OpenAI (armazenada criptografada)

    O campo fica nomeado `encrypted_password` para deixar explicito que
    esta criptografado em repouso, e o servico `ai_assistant` o descriptografa
    antes de chamar a API.
    """

    __tablename__ = "ai_configs"

    id: Mapped[str] = mapped_column(
        UUID(as_uuid=True), primary_key=True, server_default=func.gen_random_uuid()
    )
    tenant_id: Mapped[str] = mapped_column(
        String(36), nullable=False, unique=True, index=True
    )
    provider: Mapped[str] = mapped_column(
        String(30), nullable=False, default="openai"
    )
    email: Mapped[str] = mapped_column(
        String(255), nullable=False
    )
    encrypted_password: Mapped[str] = mapped_column(
        Text, nullable=False,
        comment="API key da OpenAI criptografada com Fernet (coluna-level encryption)"
    )
    enabled: Mapped[bool] = mapped_column(
        Boolean, default=False, nullable=False
    )
    max_tokens: Mapped[int] = mapped_column(
        Integer, default=4096, nullable=False
    )
    model: Mapped[str] = mapped_column(
        String(50), nullable=False, default="gpt-4o-mini"
    )
