"""Janela de acesso por horário: usuário/grupo e unidade (B.12-012).

A restrição descreve a **janela permitida**. Fora dos dias listados ou fora do
intervalo de horas, o acesso é bloqueado. Todas as restrições aplicáveis
precisam permitir o acesso; basta uma negar para bloquear.
"""

from __future__ import annotations

import uuid
from datetime import datetime, time
from zoneinfo import ZoneInfo

from sqlalchemy import or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.autorizacao import grupos_ativos
from app.core.config import settings
from app.models.nucleo import Organizacao, Usuario
from app.models.rede import RestricaoHorarioAcesso


def _hora_no_intervalo(agora_local: time, inicio: time, fim: time) -> bool:
    if inicio <= fim:
        return inicio <= agora_local <= fim
    return agora_local >= inicio or agora_local <= fim


async def fuso_do_tenant(db: AsyncSession, tenant_id: uuid.UUID | None) -> ZoneInfo:
    organizacao = await db.get(Organizacao, tenant_id) if tenant_id else None
    fuso = (organizacao.fuso_horario if organizacao else None) or settings.DEFAULT_TIMEZONE
    try:
        return ZoneInfo(fuso)
    except Exception:  # noqa: BLE001
        return ZoneInfo(settings.DEFAULT_TIMEZONE)


async def acesso_bloqueado(
    db: AsyncSession,
    usuario: Usuario,
    *,
    estabelecimento_id: uuid.UUID | None = None,
    momento: datetime | None = None,
) -> RestricaoHorarioAcesso | None:
    """Retorna a restrição que bloqueia o acesso, ou ``None`` se permitido.

    Sem ``estabelecimento_id`` (login/rotas sem unidade), aplicam-se apenas as
    restrições gerais. Com unidade, aplicam-se também as restrições daquela
    unidade. Um dia fora de ``dias_semana`` **bloqueia** (a lista é a janela
    permitida), assim como um horário fora de ``hora_inicio``/``hora_fim``.
    """
    tz = await fuso_do_tenant(db, usuario.tenant_id)
    referencia = momento.astimezone(tz) if momento else datetime.now(tz)
    dia = referencia.weekday()
    hora = referencia.time().replace(tzinfo=None)
    grupos = [ug.grupo_id for ug in grupos_ativos(usuario)]
    filtros = [RestricaoHorarioAcesso.usuario_id == usuario.id]
    if grupos:
        filtros.append(RestricaoHorarioAcesso.grupo_id.in_(grupos))
    condicoes = [
        RestricaoHorarioAcesso.tenant_id == usuario.tenant_id,
        RestricaoHorarioAcesso.ativo.is_(True),
        RestricaoHorarioAcesso.baixa_em.is_(None),
        RestricaoHorarioAcesso.vigencia_inicio <= referencia.date(),
        (RestricaoHorarioAcesso.vigencia_fim.is_(None))
        | (RestricaoHorarioAcesso.vigencia_fim >= referencia.date()),
        or_(*filtros),
    ]
    if estabelecimento_id is None:
        condicoes.append(RestricaoHorarioAcesso.estabelecimento_id.is_(None))
    else:
        condicoes.append(
            or_(
                RestricaoHorarioAcesso.estabelecimento_id.is_(None),
                RestricaoHorarioAcesso.estabelecimento_id == estabelecimento_id,
            )
        )
    restricoes = (
        await db.execute(select(RestricaoHorarioAcesso).where(*condicoes))
    ).scalars().all()
    for restricao in restricoes:
        dias = restricao.dias_semana or []
        if dia not in dias:
            return restricao
        if not _hora_no_intervalo(hora, restricao.hora_inicio, restricao.hora_fim):
            return restricao
    return None
