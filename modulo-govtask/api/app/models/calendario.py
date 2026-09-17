"""Calendário de dias úteis do município (§36).

Prazo em dia útil só significa alguma coisa se o sistema souber quando o
município não trabalha. Feriados nacionais valem para todos
(`organization_id` nulo); estaduais e municipais são de cada tenant.

Ponto facultativo entra como feriado por padrão, mas fica marcado à parte
porque nem todo prazo legal o reconhece — a organização decide se conta.
"""

import uuid
from datetime import date
from typing import Optional

from sqlalchemy import Boolean, Date, ForeignKey, Integer, String, UniqueConstraint
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base, SoftDeleteMixin, TimestampMixin
from app.models.enums import TipoFeriado


class Feriado(Base, TimestampMixin, SoftDeleteMixin):
    __tablename__ = "feriados"
    __table_args__ = (
        UniqueConstraint(
            "organization_id", "data", "nome", name="uq_feriado_org_data_nome"
        ),
    )

    organization_id: Mapped[Optional[uuid.UUID]] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("organizations.id", ondelete="CASCADE"),
        nullable=True,
        index=True,
        comment="NULL = feriado nacional, válido para todos os tenants",
    )
    nome: Mapped[str] = mapped_column(String(160), nullable=False)
    tipo: Mapped[TipoFeriado] = mapped_column(
        String(25), nullable=False, default=TipoFeriado.MUNICIPAL
    )
    data: Mapped[Optional[date]] = mapped_column(
        Date, nullable=True, index=True,
        comment="Data exata; nulo quando o feriado é definido por dia/mês fixos",
    )
    dia: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    mes: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    recorrente_anual: Mapped[bool] = mapped_column(
        Boolean, default=False, nullable=False,
        comment="Repete todo ano no mesmo dia/mês, sem precisar recadastrar",
    )
    conta_como_util: Mapped[bool] = mapped_column(
        Boolean, default=False, nullable=False,
        comment="Ponto facultativo que a organização optou por contar como dia útil",
    )
    ativo: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)

    def ocorre_em(self, dia: date) -> bool:
        if not self.ativo:
            return False
        if self.recorrente_anual and self.dia and self.mes:
            return dia.day == self.dia and dia.month == self.mes
        return self.data == dia

    def __repr__(self) -> str:
        return f"<Feriado {self.nome} {self.data or f'{self.dia:02d}/{self.mes:02d}'}>"
