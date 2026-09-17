"""Central de alertas, calendário municipal e configuração de prazos.

A varredura roda sozinha no scheduler; estas rotas servem para consultar o que
ela produziu, dispensar o que já foi tratado e afinar a configuração. O
disparo manual existe para quem prefere um agendador externo — e, sendo
idempotente, chamá-lo à toa não causa dano.
"""

import uuid
from datetime import date, datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, Query, Response, status
from sqlalchemy import func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.core.auth import get_current_user, get_user_permissions, require_permission
from app.core.database import get_db
from app.core.permissions import Perm
from app.models.alerta import Alerta
from app.models.calendario import Feriado
from app.models.demanda import Demanda
from app.models.enums import SeveridadeAlerta, TipoAlerta
from app.models.user import User
from app.schemas.alerta import (
    AlertaConfigOut,
    AlertaConfigUpdate,
    AlertaOut,
    DispensarAlertaRequest,
    FeriadoCriar,
    FeriadoOut,
    PaginaAlertas,
    ResumoAlertas,
    SimularPrazoOut,
    SimularPrazoRequest,
)
from app.services import prazos as motor
from app.services.calendario import carregar_calendario
from app.services.demandas import aplicar_escopo

router = APIRouter(tags=["Alertas e prazos"])


def _serializar(alerta: Alerta) -> AlertaOut:
    item = AlertaOut.model_validate(alerta)
    if alerta.demanda is not None:
        item.demanda_numero = alerta.demanda.numero
        item.demanda_titulo = alerta.demanda.titulo
    return item


async def _demandas_visiveis(db: AsyncSession, user: User) -> list[uuid.UUID]:
    """Ids das demandas que o usuário pode enxergar.

    O alerta herda o sigilo da demanda: quem não pode ver a demanda não pode
    ver o alerta que a denuncia, nem pelo título.
    """
    stmt = aplicar_escopo(
        select(Demanda.id), user, get_user_permissions(user), incluir_arquivadas=True
    )
    return list((await db.execute(stmt)).scalars().all())


# ── Central de alertas ──────────────────────────────────────────────────────

# A listagem fica em /alertas/painel, e não em /alertas: o endpoint antigo
# (alertas de convênio) ainda atende a interface em produção, e registrar dois
# handlers no mesmo caminho faria um sombrear o outro em silêncio.
@router.get("/alertas/painel", response_model=PaginaAlertas)
async def listar_alertas(
    apenas_meus: bool = Query(False, description="Só os alertas dirigidos a mim"),
    apenas_nao_lidos: bool = False,
    severidade: SeveridadeAlerta | None = None,
    tipo: TipoAlerta | None = None,
    demanda_id: uuid.UUID | None = None,
    incluir_resolvidos: bool = False,
    page: int = Query(1, ge=1),
    page_size: int = Query(25, ge=1, le=100),
    db: AsyncSession = Depends(get_db),
    user: User = Depends(require_permission(Perm.RESOURCE_VIEW)),
):
    visiveis = await _demandas_visiveis(db, user)

    base = select(Alerta).where(Alerta.organization_id == user.organization_id)
    # Alerta sem demanda é da organização (ex.: configuração); os demais só
    # aparecem para quem alcança a demanda.
    base = base.where(
        or_(Alerta.demanda_id.is_(None), Alerta.demanda_id.in_(visiveis))
    )
    if not incluir_resolvidos:
        base = base.where(Alerta.resolvido_em.is_(None))
    if apenas_meus:
        base = base.where(Alerta.responsavel_id == user.id)
    if apenas_nao_lidos:
        base = base.where(Alerta.lido_em.is_(None))
    if severidade:
        base = base.where(Alerta.severidade == severidade.value)
    if tipo:
        base = base.where(Alerta.tipo == tipo.value)
    if demanda_id:
        base = base.where(Alerta.demanda_id == demanda_id)

    total = (
        await db.execute(select(func.count()).select_from(base.subquery()))
    ).scalar_one()

    # A ordenação por severidade é explícita: alfabética poria AVISO antes de
    # CRITICO, que é o oposto do que o usuário precisa ver primeiro.
    ordem_severidade = {
        s.value: SeveridadeAlerta.peso(s) for s in SeveridadeAlerta
    }
    consulta = base.options(
        selectinload(Alerta.demanda), selectinload(Alerta.responsavel)
    )
    alertas = (await db.execute(consulta)).scalars().unique().all()
    alertas = sorted(
        alertas,
        key=lambda a: (-ordem_severidade.get(a.severidade, 0), -a.created_at.timestamp()),
    )
    inicio = (page - 1) * page_size
    pagina = alertas[inicio : inicio + page_size]

    abertos = [a for a in alertas if a.resolvido_em is None]
    resumo = ResumoAlertas(
        total=len(abertos),
        criticos=len([a for a in abertos if a.severidade == SeveridadeAlerta.CRITICO]),
        urgentes=len([a for a in abertos if a.severidade == SeveridadeAlerta.URGENTE]),
        importantes=len(
            [a for a in abertos if a.severidade == SeveridadeAlerta.IMPORTANTE]
        ),
        avisos=len([a for a in abertos if a.severidade == SeveridadeAlerta.AVISO]),
        informacoes=len(
            [a for a in abertos if a.severidade == SeveridadeAlerta.INFORMACAO]
        ),
        meus=len([a for a in abertos if a.responsavel_id == user.id]),
        nao_lidos=len([a for a in abertos if a.lido_em is None]),
    )
    return PaginaAlertas(
        items=[_serializar(a) for a in pagina],
        total=total,
        page=page,
        page_size=page_size,
        resumo=resumo,
    )


async def _alerta_visivel(
    db: AsyncSession, alerta_id: uuid.UUID, user: User
) -> Alerta:
    visiveis = await _demandas_visiveis(db, user)
    alerta = (
        await db.execute(
            select(Alerta)
            .where(
                Alerta.id == alerta_id,
                Alerta.organization_id == user.organization_id,
                or_(Alerta.demanda_id.is_(None), Alerta.demanda_id.in_(visiveis)),
            )
            .options(selectinload(Alerta.demanda), selectinload(Alerta.responsavel))
        )
    ).scalar_one_or_none()
    if alerta is None:
        raise HTTPException(status_code=404, detail="Alerta não encontrado")
    return alerta


@router.post("/alertas/{alerta_id}/lido", response_model=AlertaOut)
async def marcar_lido(
    alerta_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(require_permission(Perm.RESOURCE_VIEW)),
):
    """Baixa o contador do sino. Ler não resolve: o alerta continua aberto."""
    alerta = await _alerta_visivel(db, alerta_id, user)
    if alerta.lido_em is None:
        alerta.lido_em = datetime.now(timezone.utc)
        await db.commit()
    return _serializar(alerta)


@router.post("/alertas/{alerta_id}/dispensar", response_model=AlertaOut)
async def dispensar_alerta(
    alerta_id: uuid.UUID,
    payload: DispensarAlertaRequest,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(require_permission(Perm.RESOURCE_VIEW)),
):
    """Fecha o alerta à mão, com motivo.

    Se a situação persistir, a próxima varredura o reabre — dispensar não
    conserta a causa, e o sistema não deve fingir que sim.
    """
    alerta = await _alerta_visivel(db, alerta_id, user)
    if alerta.resolvido_em is not None:
        raise HTTPException(status_code=409, detail="Alerta já está resolvido")

    alerta.resolvido_em = datetime.now(timezone.utc)
    alerta.resolvido_por_id = user.id
    alerta.motivo_resolucao = payload.motivo
    await db.commit()
    return _serializar(alerta)


@router.post("/alertas/verificar")
async def verificar_agora(
    db: AsyncSession = Depends(get_db),
    user: User = Depends(require_permission(Perm.ADMIN_CONFIG)),
):
    """Dispara a varredura da organização sob demanda."""
    return await motor.varrer_organizacao(db, user.organization_id)


# ── Configuração ────────────────────────────────────────────────────────────

@router.get("/alertas/config", response_model=AlertaConfigOut)
async def obter_config(
    db: AsyncSession = Depends(get_db),
    user: User = Depends(require_permission(Perm.RESOURCE_VIEW)),
):
    config = await motor.obter_config(db, user.organization_id)
    await db.commit()
    return AlertaConfigOut.model_validate(config)


@router.patch("/alertas/config", response_model=AlertaConfigOut)
async def atualizar_config(
    payload: AlertaConfigUpdate,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(require_permission(Perm.ADMIN_CONFIG)),
):
    config = await motor.obter_config(db, user.organization_id)
    for campo, valor in payload.model_dump(exclude_unset=True).items():
        setattr(config, campo, valor)
    await db.commit()
    return AlertaConfigOut.model_validate(config)


# ── Calendário ──────────────────────────────────────────────────────────────

@router.get("/feriados", response_model=list[FeriadoOut])
async def listar_feriados(
    db: AsyncSession = Depends(get_db),
    user: User = Depends(require_permission(Perm.RESOURCE_VIEW)),
):
    feriados = (
        await db.execute(
            select(Feriado)
            .where(
                Feriado.deleted_at.is_(None),
                or_(
                    Feriado.organization_id == user.organization_id,
                    Feriado.organization_id.is_(None),
                ),
            )
            .order_by(Feriado.mes, Feriado.dia, Feriado.data)
        )
    ).scalars().all()
    return [FeriadoOut.model_validate(f) for f in feriados]


@router.post("/feriados", response_model=FeriadoOut, status_code=201)
async def criar_feriado(
    payload: FeriadoCriar,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(require_permission(Perm.ADMIN_CONFIG)),
):
    feriado = Feriado(
        organization_id=user.organization_id, **payload.model_dump()
    )
    db.add(feriado)
    await db.commit()
    return FeriadoOut.model_validate(feriado)


@router.delete("/feriados/{feriado_id}", status_code=status.HTTP_204_NO_CONTENT)
async def remover_feriado(
    feriado_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(require_permission(Perm.ADMIN_CONFIG)),
):
    feriado = (
        await db.execute(
            select(Feriado).where(
                Feriado.id == feriado_id,
                # Feriado nacional é do sistema: o município não o apaga.
                Feriado.organization_id == user.organization_id,
                Feriado.deleted_at.is_(None),
            )
        )
    ).scalar_one_or_none()
    if feriado is None:
        raise HTTPException(
            status_code=404, detail="Feriado não encontrado nesta organização"
        )
    feriado.deleted_at = datetime.now(timezone.utc)
    await db.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.post("/feriados/simular-prazo", response_model=SimularPrazoOut)
async def simular_prazo(
    payload: SimularPrazoRequest,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """Mostra em que dia um prazo cai, já com feriados e fim de semana."""
    config = await motor.obter_config(db, user.organization_id)
    calendario = await carregar_calendario(
        db, user.organization_id,
        ponto_facultativo_e_util=config.ponto_facultativo_e_util,
    )
    await db.commit()

    inicio = payload.inicio or date.today()
    if payload.contagem == "DIAS_CORRIDOS":
        from datetime import timedelta

        vencimento = inicio + timedelta(days=payload.dias)
    else:
        vencimento = calendario.somar_dias_uteis(inicio, payload.dias)

    return SimularPrazoOut(
        inicio=inicio,
        vencimento=vencimento,
        dias=payload.dias,
        contagem=payload.contagem,
        dias_corridos_equivalentes=(vencimento - inicio).days,
    )
