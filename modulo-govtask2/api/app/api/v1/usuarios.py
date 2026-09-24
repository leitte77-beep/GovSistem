"""Pessoas do GovTask: perfil, lotação e acesso.

O SaaS provisiona a pessoa e manda os papéis dele; aqui o administrador do
módulo define o que ela é no GovTask (Prefeito, Assessor, Departamento,
Consulta), em qual setor trabalha e se ainda tem acesso. O perfil definido
aqui vence os papéis da plataforma e não é desfeito pelo próximo login.
"""

import uuid
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.core.auth import (
    get_current_user,
    get_perfil,
    get_user_permissions,
    get_user_roles,
    require_permission,
)
from app.core.database import get_db
from app.core.permissions import GESTORES, PERFIS, Perm, default_permissions_for_role, perfil_efetivo
from app.models.auth_models import User, UserRole
from app.models.config import AuditoriaConfig
from app.models.pedido import (
    Encaminhamento,
    Pedido,
    SituacaoPedido,
    StatusEncaminhamento,
    TipoAndamento,
)
from app.schemas.pedido import (
    AuditoriaOut,
    EditarUsuarioRequest,
    LoteSetorRequest,
    UsuarioAdmin,
)
from app.services import auditoria
from app.services import notificacoes as notif
from app.services import pedidos as servico
from app.services import setores as setor_service

router = APIRouter(tags=["usuarios"])

ROTULO_PERFIL = {
    "PREFEITO": "Prefeito",
    "ASSESSOR": "Assessor",
    "DEPARTAMENTO": "Departamento",
    "CONSULTA": "Consulta",
}
ABERTOS = [
    SituacaoPedido.COM_ASSESSOR.value,
    SituacaoPedido.EM_SETOR.value,
    SituacaoPedido.AGUARDANDO_TERCEIRO.value,
]


@router.get("/eu")
async def eu(user: User = Depends(get_current_user)):
    """Identidade, perfil e permissões — o front usa para montar as telas."""
    perms = get_user_permissions(user)
    return {
        "id": str(user.id),
        "nome": user.name,
        "email": user.email,
        "papeis": sorted(get_user_roles(user)),
        "perfil": get_perfil(user),
        "setor": user.setor,
        "permissoes": sorted(perms),
        "pode_criar": Perm.PEDIDO_CRIAR in perms,
        "pode_encaminhar": Perm.PEDIDO_ENCAMINHAR in perms,
        "pode_trabalhar": Perm.PEDIDO_TRABALHAR in perms,
        "pode_gerir_usuarios": bool(perms.intersection(GESTORES)),
    }


def _perfil_de(u: User) -> str:
    """Perfil efetivo sem depender do cache de sessão (lista de terceiros)."""
    papeis = {ur.role.name for ur in u.user_roles}
    perms: set[str] = set()
    for p in papeis:
        perms |= default_permissions_for_role(p)
    return perfil_efetivo(u.perfil_govtask, papeis, perms)


def _admin(u: User, abertas: int = 0) -> UsuarioAdmin:
    return UsuarioAdmin(
        id=u.id,
        name=u.name,
        email=u.email,
        setor=u.setor,
        papeis=sorted({ur.role.name for ur in u.user_roles}),
        perfil=_perfil_de(u),
        perfil_definido=u.perfil_govtask,
        ativo=u.ativo_govtask,
        ultimo_acesso=u.ultimo_acesso,
        tarefas_abertas=abertas,
    )


async def _abertas_por_usuario(db: AsyncSession, organization_id: uuid.UUID) -> dict:
    result = await db.execute(
        select(Pedido.responsavel_atual_id, func.count(Pedido.id))
        .where(
            Pedido.organization_id == organization_id,
            Pedido.deleted_at.is_(None),
            Pedido.situacao.in_(ABERTOS),
            Pedido.responsavel_atual_id.is_not(None),
        )
        .group_by(Pedido.responsavel_atual_id)
    )
    return {uid: n for uid, n in result.all()}


@router.get("/usuarios", response_model=list[UsuarioAdmin])
async def listar_usuarios(
    q: str | None = Query(default=None, max_length=120),
    incluir_inativos: bool = False,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    query = (
        select(User)
        .where(
            User.organization_id == user.organization_id,
            User.is_active.is_(True),
            User.deleted_at.is_(None),
        )
        .options(selectinload(User.user_roles).selectinload(UserRole.role))
        .order_by(User.name)
    )
    if not incluir_inativos:
        query = query.where(User.ativo_govtask.is_(True))
    if q and q.strip():
        termo = f"%{q.strip()}%"
        query = query.where(or_(User.name.ilike(termo), User.email.ilike(termo)))
    result = await db.execute(query)
    abertas = await _abertas_por_usuario(db, user.organization_id)
    return [_admin(u, abertas.get(u.id, 0)) for u in result.scalars().unique().all()]


async def _alvo(db: AsyncSession, organization_id: uuid.UUID, user_id: uuid.UUID) -> User:
    alvo = await db.scalar(
        select(User)
        .where(
            User.id == user_id,
            User.organization_id == organization_id,
            User.deleted_at.is_(None),
        )
        .options(selectinload(User.user_roles).selectinload(UserRole.role))
    )
    if alvo is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Usuário não encontrado.")
    return alvo


async def _liberar_tarefas(db: AsyncSession, alvo: User, autor: User) -> int:
    """Quem perde o acesso devolve as tarefas à fila do setor."""
    result = await db.execute(
        select(Pedido)
        .where(
            Pedido.organization_id == alvo.organization_id,
            Pedido.responsavel_atual_id == alvo.id,
            Pedido.situacao.in_(ABERTOS),
            Pedido.deleted_at.is_(None),
        )
        .options(selectinload(Pedido.encaminhamentos))
    )
    pedidos = list(result.scalars().unique().all())
    for pedido in pedidos:
        enc = servico.encaminhamento_aberto(pedido)
        if enc is not None and enc.responsavel_id == alvo.id:
            enc.responsavel_id = None
            if enc.status == StatusEncaminhamento.EM_EXECUCAO.value:
                enc.status = StatusEncaminhamento.AGUARDANDO.value
        pedido.responsavel_atual_id = None
        servico.registrar(
            db,
            pedido,
            TipoAndamento.TRANSFERENCIA,
            autor,
            f"{alvo.name} perdeu o acesso ao GovTask; a tarefa voltou para a fila do setor.",
            enc,
        )
        await notif.para_assessor(
            db,
            pedido=pedido,
            encaminhamento=enc,
            tipo=notif.TipoNotificacao.TAREFA_LIBERADA,
            texto=f"“{pedido.titulo}” voltou para a fila: {alvo.name} foi desativado.",
            autor=autor,
        )
    return len(pedidos)


async def _aplicar(
    db: AsyncSession, alvo: User, autor: User, dados: dict
) -> int:
    """Aplica perfil/setor/ativo com auditoria. Devolve tarefas liberadas."""
    org = autor.organization_id
    liberadas = 0
    if "perfil" in dados:
        perfil = dados["perfil"]
        if perfil is not None and perfil not in PERFIS:
            raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="Perfil inválido.")
        auditoria.registrar(
            db, organization_id=org, autor=autor, alvo_tipo="USUARIO", alvo_nome=alvo.name,
            campo="perfil",
            antes=ROTULO_PERFIL.get(alvo.perfil_govtask or "", "da plataforma"),
            depois=ROTULO_PERFIL.get(perfil or "", "da plataforma"),
        )
        alvo.perfil_govtask = perfil
    if "setor" in dados:
        setor = (dados["setor"] or "").strip().upper() or None
        await setor_service.garantir_setores(db, org)
        if setor:
            await setor_service.exigir_ativo(db, org, setor)
        auditoria.registrar(
            db, organization_id=org, autor=autor, alvo_tipo="USUARIO", alvo_nome=alvo.name,
            campo="setor", antes=alvo.setor, depois=setor,
        )
        alvo.setor = setor
    if "ativo" in dados and dados["ativo"] is not None and dados["ativo"] != alvo.ativo_govtask:
        if alvo.id == autor.id and not dados["ativo"]:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail="Você não pode desativar o próprio acesso.",
            )
        auditoria.registrar(
            db, organization_id=org, autor=autor, alvo_tipo="USUARIO", alvo_nome=alvo.name,
            campo="acesso", antes="ativo" if alvo.ativo_govtask else "desativado",
            depois="ativo" if dados["ativo"] else "desativado",
        )
        alvo.ativo_govtask = bool(dados["ativo"])
        if not alvo.ativo_govtask:
            liberadas = await _liberar_tarefas(db, alvo, autor)
    return liberadas


@router.patch("/usuarios/{user_id}", response_model=UsuarioAdmin)
async def editar_usuario(
    user_id: uuid.UUID,
    body: EditarUsuarioRequest,
    user: User = Depends(require_permission(*GESTORES)),
    db: AsyncSession = Depends(get_db),
):
    """Perfil, setor e acesso de uma pessoa. Só o que vier no corpo muda."""
    alvo = await _alvo(db, user.organization_id, user_id)
    await _aplicar(db, alvo, user, body.model_dump(exclude_unset=True))
    await db.commit()
    alvo = await _alvo(db, user.organization_id, user_id)
    abertas = await _abertas_por_usuario(db, user.organization_id)
    return _admin(alvo, abertas.get(alvo.id, 0))


@router.post("/usuarios/lote")
async def editar_em_lote(
    body: LoteSetorRequest,
    user: User = Depends(require_permission(*GESTORES)),
    db: AsyncSession = Depends(get_db),
):
    """Mesmo perfil e/ou setor para várias pessoas de uma vez."""
    dados = body.model_dump(exclude_unset=True, exclude={"usuario_ids"})
    result = await db.execute(
        select(User)
        .where(
            User.id.in_(body.usuario_ids),
            User.organization_id == user.organization_id,
            User.deleted_at.is_(None),
        )
        .options(selectinload(User.user_roles).selectinload(UserRole.role))
    )
    alvos = list(result.scalars().unique().all())
    for alvo in alvos:
        await _aplicar(db, alvo, user, dados)
    await db.commit()
    return {"atualizados": len(alvos)}


@router.get("/auditoria", response_model=list[AuditoriaOut])
async def listar_auditoria(
    limite: int = Query(default=50, ge=1, le=200),
    user: User = Depends(require_permission(*GESTORES)),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(AuditoriaConfig)
        .where(AuditoriaConfig.organization_id == user.organization_id)
        .order_by(AuditoriaConfig.created_at.desc())
        .limit(limite)
    )
    return list(result.scalars().all())
