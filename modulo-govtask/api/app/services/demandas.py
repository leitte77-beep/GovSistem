"""Regras de negócio da demanda: visibilidade, criação, movimentação (§5, §95, §96).

Toda autorização acontece aqui e nas dependências de rota — nunca no frontend.
Duas barreiras se somam: o tenant (a organização do usuário, sempre aplicado) e
o sigilo da demanda (quem pode ver demandas restritas e confidenciais).
"""

import uuid
from datetime import datetime, timezone

from fastapi import HTTPException, status as http_status
from sqlalchemy import Select, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.permissions import Perm
from app.core.seeds_demanda import STATUS_INICIAL_PADRAO
from app.models.catalogo import CategoriaDemanda, StatusDemanda, TipoDemanda
from app.models.demanda import Demanda
from app.models.demanda_participante import DemandaParticipante
from app.models.enums import ConfidencialidadeDemanda, TipoEvento
from app.models.user import User
from app.services.numeracao import proximo_numero
from app.services.timeline import registrar_evento

# Sigilos que só participantes (ou quem administra o módulo) enxergam.
SIGILOSOS = (
    ConfidencialidadeDemanda.RESTRITA.value,
    ConfidencialidadeDemanda.CONFIDENCIAL.value,
)


def aplicar_escopo(
    stmt: Select, user: User, permissoes: set[str], *, incluir_arquivadas: bool = False
) -> Select:
    """Restringe uma consulta de demandas ao que o usuário pode enxergar.

    O filtro por organização é incondicional: mesmo um administrador do módulo
    só vê demandas do próprio município.
    """
    stmt = stmt.where(
        Demanda.organization_id == user.organization_id,
        Demanda.deleted_at.is_(None),
    )
    if not incluir_arquivadas:
        stmt = stmt.where(Demanda.arquivada_em.is_(None))

    if Perm.ADMIN_CONFIG in permissoes or Perm.AUDIT_VIEW in permissoes:
        return stmt

    participante = (
        select(DemandaParticipante.demanda_id)
        .where(
            DemandaParticipante.user_id == user.id,
            DemandaParticipante.ativo.is_(True),
        )
        .scalar_subquery()
    )
    return stmt.where(
        or_(
            Demanda.confidencialidade.not_in(SIGILOSOS),
            Demanda.criado_por_id == user.id,
            Demanda.solicitante_id == user.id,
            Demanda.responsavel_geral_id == user.id,
            Demanda.responsavel_atual_id == user.id,
            Demanda.gestor_id == user.id,
            Demanda.id.in_(participante),
        )
    )


async def get_demanda_ou_404(
    db: AsyncSession,
    demanda_id: uuid.UUID,
    user: User,
    permissoes: set[str],
    *,
    incluir_arquivadas: bool = True,
) -> Demanda:
    """Carrega uma demanda respeitando tenant e sigilo.

    Responde 404 (e não 403) quando a demanda existe mas pertence a outro
    tenant ou é sigilosa: confirmar a existência já seria um vazamento.
    """
    stmt = aplicar_escopo(
        select(Demanda).where(Demanda.id == demanda_id),
        user,
        permissoes,
        incluir_arquivadas=incluir_arquivadas,
    )
    demanda = (await db.execute(stmt)).scalar_one_or_none()
    if demanda is None:
        raise HTTPException(
            status_code=http_status.HTTP_404_NOT_FOUND, detail="Demanda não encontrada"
        )
    return demanda


async def resolver_catalogo(
    db: AsyncSession,
    modelo,
    item_id: uuid.UUID | None,
    organization_id: uuid.UUID,
    rotulo: str,
):
    """Valida que um item de catálogo pertence ao tenant ou ao catálogo do sistema."""
    if item_id is None:
        return None
    item = (
        await db.execute(
            select(modelo).where(
                modelo.id == item_id,
                modelo.deleted_at.is_(None),
                or_(
                    modelo.organization_id == organization_id,
                    modelo.organization_id.is_(None),
                ),
            )
        )
    ).scalar_one_or_none()
    if item is None:
        raise HTTPException(
            status_code=422,
            detail=f"{rotulo} inválido para esta organização",
        )
    return item


async def status_inicial(
    db: AsyncSession, organization_id: uuid.UUID, rascunho: bool
) -> StatusDemanda | None:
    """Status com que a demanda nasce: o do tenant, ou o padrão do sistema."""
    chave = "RASCUNHO" if rascunho else STATUS_INICIAL_PADRAO
    stmt = (
        select(StatusDemanda)
        .where(
            StatusDemanda.chave == chave,
            StatusDemanda.ativo.is_(True),
            StatusDemanda.deleted_at.is_(None),
            or_(
                StatusDemanda.organization_id == organization_id,
                StatusDemanda.organization_id.is_(None),
            ),
        )
        # Um status próprio do tenant tem precedência sobre o do sistema.
        .order_by(StatusDemanda.organization_id.is_(None))
    )
    return (await db.execute(stmt)).scalars().first()


async def criar_demanda(
    db: AsyncSession, dados: dict, user: User, *, rascunho: bool = False
) -> Demanda:
    """Cria a demanda já numerada, com status inicial e evento de abertura."""
    org_id = user.organization_id

    await resolver_catalogo(db, TipoDemanda, dados.get("tipo_id"), org_id, "Tipo de demanda")
    await resolver_catalogo(db, CategoriaDemanda, dados.get("categoria_id"), org_id, "Categoria")
    await resolver_catalogo(db, CategoriaDemanda, dados.get("subcategoria_id"), org_id, "Subcategoria")
    status_obj = await resolver_catalogo(
        db, StatusDemanda, dados.get("status_id"), org_id, "Status"
    ) or await status_inicial(db, org_id, rascunho)

    agora = datetime.now(timezone.utc)
    numero, exercicio, sequencial = await proximo_numero(db, org_id)

    demanda = Demanda(
        organization_id=org_id,
        numero=numero,
        exercicio=exercicio,
        sequencial=sequencial,
        criado_por_id=user.id,
        responsavel_geral_id=dados.get("responsavel_geral_id") or user.id,
        responsavel_atual_id=dados.get("responsavel_atual_id")
        or dados.get("responsavel_geral_id")
        or user.id,
        status_id=status_obj.id if status_obj else None,
        is_rascunho=rascunho,
        ultima_movimentacao_em=agora,
        **{
            k: v
            for k, v in dados.items()
            if k
            not in {
                "responsavel_geral_id",
                "responsavel_atual_id",
                "status_id",
                "tags",
            }
        },
    )
    db.add(demanda)
    await db.flush()

    await registrar_evento(
        db,
        tipo_evento=TipoEvento.DEMANDA_CRIADA,
        ator_id=user.id,
        descricao=f"Demanda {demanda.numero} criada: {demanda.titulo}",
        demanda_id=demanda.id,
        metadados={"numero": demanda.numero, "rascunho": rascunho},
    )
    return demanda


async def marcar_movimentacao(demanda: Demanda) -> None:
    """Zera o contador de inatividade (§39) e avança a versão de concorrência (§120).

    A versão sobe no mesmo ponto em que a movimentação é registrada, para que
    nenhuma rota que altere a demanda deixe o controle de concorrência para trás.
    """
    demanda.ultima_movimentacao_em = datetime.now(timezone.utc)
    demanda.versao = (demanda.versao or 0) + 1
