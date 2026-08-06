"""Auditoria, notificações, configurações, regiões e feriados (itens 42, 47, 48).

A auditoria é append-only: não há rota de edição nem de exclusão. Configurações
ficam em tabela chave/valor tipada — nenhum limite operacional é constante no
código.
"""

import uuid
from datetime import date, datetime
from typing import Any

from sqlalchemy import (
    Boolean,
    Date,
    DateTime,
    ForeignKey,
    Index,
    String,
    Text,
    UniqueConstraint,
    Uuid,
)
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import (
    ActorMixin,
    Base,
    JSONType,
    TimestampMixin,
    UUIDPrimaryKeyMixin,
)
from app.models.enums import (
    CanalNotificacao,
    ResultadoAuditoria,
    SituacaoNotificacao,
)


class RegistroAuditoria(Base, UUIDPrimaryKeyMixin, TimestampMixin):
    """Trilha de auditoria (item 47).

    Sem `updated_by`, sem soft delete e sem rota de escrita na API: as linhas só
    entram pelo serviço `app.services.auditoria`.
    """

    __tablename__ = "govinfra_audit_logs"
    __table_args__ = (
        Index("ix_govinfra_auditoria_entidade", "entidade", "entidade_id"),
        Index("ix_govinfra_auditoria_usuario", "organizacao_id", "user_id", "created_at"),
        Index("ix_govinfra_auditoria_acao", "organizacao_id", "acao", "created_at"),
    )

    organizacao_id: Mapped[uuid.UUID | None] = mapped_column(
        Uuid, ForeignKey("govinfra_organizacoes.id", ondelete="SET NULL"), nullable=True, index=True
    )
    user_id: Mapped[uuid.UUID | None] = mapped_column(
        Uuid, ForeignKey("govinfra_users.id", ondelete="SET NULL"), nullable=True, index=True
    )
    user_nome: Mapped[str | None] = mapped_column(String(200), nullable=True)
    user_perfil: Mapped[str | None] = mapped_column(String(40), nullable=True)

    acao: Mapped[str] = mapped_column(String(40), nullable=False, index=True)
    modulo: Mapped[str] = mapped_column(String(40), default="govinfra", nullable=False)
    entidade: Mapped[str | None] = mapped_column(String(60), nullable=True)
    entidade_id: Mapped[uuid.UUID | None] = mapped_column(Uuid, nullable=True)
    entidade_descricao: Mapped[str | None] = mapped_column(String(300), nullable=True)

    resultado: Mapped[str] = mapped_column(
        String(20), default=ResultadoAuditoria.SUCESSO.value, nullable=False, index=True
    )
    justificativa: Mapped[str | None] = mapped_column(Text, nullable=True)
    detalhe: Mapped[str | None] = mapped_column(Text, nullable=True)
    dados_antes: Mapped[dict | None] = mapped_column(JSONType, nullable=True)
    dados_depois: Mapped[dict | None] = mapped_column(JSONType, nullable=True)

    ip: Mapped[str | None] = mapped_column(String(60), nullable=True)
    dispositivo: Mapped[str | None] = mapped_column(String(400), nullable=True)
    origem: Mapped[str | None] = mapped_column(String(40), nullable=True)
    correlacao: Mapped[str | None] = mapped_column(String(64), nullable=True, index=True)


class Notificacao(Base, UUIDPrimaryKeyMixin, TimestampMixin):
    """Notificação interna (item 42).

    A arquitetura já prevê e-mail, WhatsApp e SMS, mas nenhum serviço externo é
    acionado sem credenciais configuradas — o canal fica pendente e registrado.
    """

    __tablename__ = "govinfra_notifications"
    __table_args__ = (
        Index("ix_govinfra_notif_destino", "destinatario_id", "situacao", "created_at"),
    )

    organizacao_id: Mapped[uuid.UUID] = mapped_column(
        Uuid, ForeignKey("govinfra_organizacoes.id", ondelete="CASCADE"), nullable=False, index=True
    )
    destinatario_id: Mapped[uuid.UUID | None] = mapped_column(
        Uuid, ForeignKey("govinfra_users.id", ondelete="CASCADE"), nullable=True, index=True
    )
    # Notificação dirigida a um perfil inteiro (ex.: todos os gestores).
    perfil_destino: Mapped[str | None] = mapped_column(String(40), nullable=True, index=True)

    tipo: Mapped[str] = mapped_column(String(50), nullable=False, index=True)
    titulo: Mapped[str] = mapped_column(String(200), nullable=False)
    mensagem: Mapped[str] = mapped_column(Text, nullable=False)
    entidade: Mapped[str | None] = mapped_column(String(60), nullable=True)
    entidade_id: Mapped[uuid.UUID | None] = mapped_column(Uuid, nullable=True)
    link: Mapped[str | None] = mapped_column(String(300), nullable=True)

    canal: Mapped[str] = mapped_column(
        String(20), default=CanalNotificacao.SISTEMA.value, nullable=False
    )
    situacao: Mapped[str] = mapped_column(
        String(20), default=SituacaoNotificacao.NAO_LIDA.value, nullable=False, index=True
    )
    lida_em: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    # Canais externos: registrados como pendentes até haver integração ativa.
    envio_externo_status: Mapped[str | None] = mapped_column(String(30), nullable=True)


class Configuracao(Base, UUIDPrimaryKeyMixin, TimestampMixin, ActorMixin):
    """Configuração operacional (item 48) — chave/valor tipado por área.

    Toda regra que a lei ou o gestor pode mudar mora aqui: limites de
    solicitação, capacidade diária, pesos do algoritmo de recomendação,
    tolerâncias de combustível.
    """

    __tablename__ = "govinfra_settings"
    __table_args__ = (
        UniqueConstraint("organizacao_id", "chave", name="uq_govinfra_config_chave"),
        Index("ix_govinfra_config_area", "organizacao_id", "area"),
    )

    organizacao_id: Mapped[uuid.UUID] = mapped_column(
        Uuid, ForeignKey("govinfra_organizacoes.id", ondelete="CASCADE"), nullable=False, index=True
    )
    area: Mapped[str] = mapped_column(
        String(40), nullable=False, doc="cacambas | porteira | combustivel | geral"
    )
    chave: Mapped[str] = mapped_column(String(80), nullable=False, index=True)
    # O valor real fica dentro do JSON, na chave "valor" — assim número, texto,
    # lista e objeto convivem sem coluna por tipo.
    valor: Mapped[dict] = mapped_column(JSONType, nullable=False)
    tipo: Mapped[str] = mapped_column(String(20), default="numero", nullable=False)
    rotulo: Mapped[str] = mapped_column(String(200), nullable=False)
    descricao: Mapped[str | None] = mapped_column(Text, nullable=True)
    editavel: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)

    @property
    def conteudo(self) -> Any:
        return (self.valor or {}).get("valor")


class Regiao(Base, UUIDPrimaryKeyMixin, TimestampMixin, ActorMixin):
    """Região, distrito ou agrupamento de bairros (itens 18, 39 e 48)."""

    __tablename__ = "govinfra_regioes"
    __table_args__ = (UniqueConstraint("organizacao_id", "chave", name="uq_govinfra_regiao"),)

    organizacao_id: Mapped[uuid.UUID] = mapped_column(
        Uuid, ForeignKey("govinfra_organizacoes.id", ondelete="CASCADE"), nullable=False, index=True
    )
    chave: Mapped[str] = mapped_column(String(60), nullable=False)
    nome: Mapped[str] = mapped_column(String(150), nullable=False)
    tipo: Mapped[str] = mapped_column(String(20), default="urbana", nullable=False)
    bairros: Mapped[list[str] | None] = mapped_column(JSONType, nullable=True)
    cor: Mapped[str | None] = mapped_column(String(9), nullable=True)
    latitude_centro: Mapped[float | None] = mapped_column(nullable=True)
    longitude_centro: Mapped[float | None] = mapped_column(nullable=True)
    atendida: Mapped[bool] = mapped_column(
        Boolean, default=True, nullable=False,
        doc="Região fora da área de atendimento bloqueia a solicitação",
    )
    # Dias da semana atendidos (0 = segunda ... 6 = domingo).
    dias_atendimento: Mapped[list[int] | None] = mapped_column(JSONType, nullable=True)
    ativo: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    ordem: Mapped[int] = mapped_column(default=0, nullable=False)


class DataBloqueada(Base, UUIDPrimaryKeyMixin, TimestampMixin, ActorMixin):
    """Feriado ou data sem atendimento (itens 13 e 48)."""

    __tablename__ = "govinfra_blocked_dates"
    __table_args__ = (
        UniqueConstraint("organizacao_id", "data", "servico", name="uq_govinfra_data_bloqueada"),
    )

    organizacao_id: Mapped[uuid.UUID] = mapped_column(
        Uuid, ForeignKey("govinfra_organizacoes.id", ondelete="CASCADE"), nullable=False, index=True
    )
    data: Mapped[date] = mapped_column(Date, nullable=False, index=True)
    servico: Mapped[str] = mapped_column(
        String(30), default="todos", nullable=False, doc="cacambas | porteira_adentro | todos"
    )
    descricao: Mapped[str] = mapped_column(String(200), nullable=False)
    feriado: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)


class Contador(Base, UUIDPrimaryKeyMixin, TimestampMixin):
    """Sequência de protocolos por ano.

    Existe como tabela (e não como `MAX(protocolo)+1`) para que dois atendentes
    salvando ao mesmo tempo não recebam o mesmo número: o incremento acontece
    com a linha travada dentro da transação.
    """

    __tablename__ = "govinfra_counters"
    __table_args__ = (
        UniqueConstraint("organizacao_id", "escopo", "ano", name="uq_govinfra_contador"),
    )

    organizacao_id: Mapped[uuid.UUID] = mapped_column(
        Uuid, ForeignKey("govinfra_organizacoes.id", ondelete="CASCADE"), nullable=False, index=True
    )
    escopo: Mapped[str] = mapped_column(
        String(40), nullable=False, doc="solicitacao_cacamba | servico | ordem | imovel"
    )
    ano: Mapped[int] = mapped_column(nullable=False)
    valor: Mapped[int] = mapped_column(default=0, nullable=False)
