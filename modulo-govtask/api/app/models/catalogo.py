"""Cadastros configuráveis do GovTask (§4, §5, §47, §151).

Tipos, categorias, status e tags não são codificados de forma rígida: cada
organização ajusta o catálogo sem alteração de código. Linhas com
`organization_id = NULL` são o catálogo padrão mantido pelo sistema e ficam
visíveis para todos os tenants (nunca editáveis por eles).
"""

import uuid
from typing import TYPE_CHECKING, List, Optional

from sqlalchemy import Boolean, ForeignKey, Integer, String, Text, UniqueConstraint
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import Base, SoftDeleteMixin, TimestampMixin

if TYPE_CHECKING:
    from app.models.template_fluxo import TemplateFluxo


class CatalogoMixin:
    """Colunas comuns aos catálogos por tenant."""

    organization_id: Mapped[Optional[uuid.UUID]] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("organizations.id", ondelete="CASCADE"),
        nullable=True,
        index=True,
        comment="NULL = catálogo padrão do sistema, compartilhado por todos os tenants",
    )
    chave: Mapped[str] = mapped_column(String(60), nullable=False, index=True)
    rotulo: Mapped[str] = mapped_column(String(120), nullable=False)
    descricao: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    ordem: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    cor: Mapped[Optional[str]] = mapped_column(String(30), nullable=True)
    icone: Mapped[Optional[str]] = mapped_column(String(60), nullable=True)
    ativo: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    is_system: Mapped[bool] = mapped_column(
        Boolean, default=False, nullable=False,
        comment="Item do catálogo padrão: o tenant pode ocultar, não excluir",
    )


class TipoDemanda(Base, CatalogoMixin, TimestampMixin, SoftDeleteMixin):
    """Tipo da demanda (§4) — define quais blocos do formulário aparecem."""

    __tablename__ = "demanda_tipos"
    __table_args__ = (
        UniqueConstraint("organization_id", "chave", name="uq_demanda_tipo_org_chave"),
    )

    # Facetas habilitadas por tipo (§14: abas condicionais da demanda).
    exige_obra: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    exige_financeiro: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    exige_convenio: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    exige_licitacao: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    exige_contrato: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    exige_prestacao_contas: Mapped[bool] = mapped_column(
        Boolean, default=False, nullable=False
    )

    template_fluxo_id: Mapped[Optional[uuid.UUID]] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("templates_fluxo.id", ondelete="SET NULL"),
        nullable=True,
        comment="Workflow aplicado por padrão a demandas deste tipo",
    )
    template_fluxo: Mapped[Optional["TemplateFluxo"]] = relationship("TemplateFluxo")

    categorias: Mapped[List["CategoriaDemanda"]] = relationship(
        "CategoriaDemanda", back_populates="tipo", lazy="selectin"
    )

    def __repr__(self) -> str:
        return f"<TipoDemanda {self.chave}>"


class CategoriaDemanda(Base, CatalogoMixin, TimestampMixin, SoftDeleteMixin):
    """Categoria/subcategoria da demanda (§5). Hierárquica e opcionalmente por tipo."""

    __tablename__ = "demanda_categorias"
    __table_args__ = (
        UniqueConstraint(
            "organization_id", "chave", name="uq_demanda_categoria_org_chave"
        ),
    )

    tipo_id: Mapped[Optional[uuid.UUID]] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("demanda_tipos.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )
    categoria_pai_id: Mapped[Optional[uuid.UUID]] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("demanda_categorias.id", ondelete="SET NULL"),
        nullable=True,
    )

    tipo: Mapped[Optional["TipoDemanda"]] = relationship(
        "TipoDemanda", back_populates="categorias"
    )
    categoria_pai: Mapped[Optional["CategoriaDemanda"]] = relationship(
        "CategoriaDemanda", remote_side="CategoriaDemanda.id"
    )

    def __repr__(self) -> str:
        return f"<CategoriaDemanda {self.chave}>"


class StatusDemanda(Base, CatalogoMixin, TimestampMixin, SoftDeleteMixin):
    """Status da demanda (§3) — distinto do status das tarefas, e configurável."""

    __tablename__ = "demanda_status"
    __table_args__ = (
        UniqueConstraint("organization_id", "chave", name="uq_demanda_status_org_chave"),
    )

    is_inicial: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    is_final: Mapped[bool] = mapped_column(
        Boolean, default=False, nullable=False,
        comment="Encerra a demanda (concluída/cancelada/arquivada)",
    )
    is_aguardando_externo: Mapped[bool] = mapped_column(
        Boolean, default=False, nullable=False,
        comment="Conta como 'aguardando terceiros' nos indicadores (§70)",
    )
    conta_como_atrasavel: Mapped[bool] = mapped_column(
        Boolean, default=True, nullable=False,
        comment="Demandas neste status entram no cálculo de atraso/inatividade",
    )

    def __repr__(self) -> str:
        return f"<StatusDemanda {self.chave}>"


class Tag(Base, TimestampMixin, SoftDeleteMixin):
    """Tag livre por tenant (§47)."""

    __tablename__ = "demanda_tags"
    __table_args__ = (
        UniqueConstraint("organization_id", "slug", name="uq_demanda_tag_org_slug"),
    )

    organization_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("organizations.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    slug: Mapped[str] = mapped_column(String(80), nullable=False, index=True)
    rotulo: Mapped[str] = mapped_column(String(80), nullable=False)
    cor: Mapped[Optional[str]] = mapped_column(String(30), nullable=True)

    def __repr__(self) -> str:
        return f"<Tag {self.slug}>"


class DemandaTag(Base, TimestampMixin):
    """Vínculo demanda ↔ tag."""

    __tablename__ = "demanda_tag_vinculos"
    __table_args__ = (
        UniqueConstraint("demanda_id", "tag_id", name="uq_demanda_tag"),
    )

    demanda_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("demandas.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    tag_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("demanda_tags.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )

    tag: Mapped["Tag"] = relationship("Tag", lazy="selectin")
