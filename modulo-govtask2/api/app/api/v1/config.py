"""Administração do módulo: os setores da prefeitura.

O padrão vive em código (`app.core.fluxo`); aqui a prefeitura cria os seus.
Leitura é aberta a quem enxerga pedidos; escrita é de quem conduz o fluxo.
"""

import uuid

from fastapi import APIRouter, Depends, HTTPException, Response, status
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.auth import require_permission
from app.core.database import get_db
from app.core.permissions import GESTORES, PERFIS, Perm
from app.models.config import Setor
from app.models.pedido import Pedido, SituacaoPedido
from app.services import auditoria
from app.models.auth_models import User
from app.schemas.pedido import AjustesEditar, AjustesOut, SetorCriar, SetorEditar, SetorOut
from app.services import ajustes as ajustes_service
from app.services import setores as setor_service

router = APIRouter(tags=["config"])


@router.get("/setores", response_model=list[SetorOut])
async def listar_setores(
    incluir_inativos: bool = False,
    user: User = Depends(require_permission(Perm.PEDIDO_VER)),
    db: AsyncSession = Depends(get_db),
):
    # Semeia o padrão na primeira visita.
    await setor_service.garantir_setores(db, user.organization_id)
    await db.commit()
    setores = await setor_service.listar(
        db, user.organization_id, incluir_inativos=incluir_inativos
    )
    pessoas = dict(
        (
            await db.execute(
                select(User.setor, func.count(User.id))
                .where(
                    User.organization_id == user.organization_id,
                    User.deleted_at.is_(None),
                    User.ativo_govtask.is_(True),
                    User.setor.is_not(None),
                )
                .group_by(User.setor)
            )
        ).all()
    )
    abertos = dict(
        (
            await db.execute(
                select(Pedido.setor_atual, func.count(Pedido.id))
                .where(
                    Pedido.organization_id == user.organization_id,
                    Pedido.deleted_at.is_(None),
                    Pedido.situacao == SituacaoPedido.EM_SETOR.value,
                )
                .group_by(Pedido.setor_atual)
            )
        ).all()
    )
    saida = []
    for s in setores:
        out = SetorOut.model_validate(s)
        out.pessoas = pessoas.get(s.codigo, 0)
        out.abertos = abertos.get(s.codigo, 0)
        saida.append(out)
    return saida


@router.post("/setores", response_model=SetorOut, status_code=status.HTTP_201_CREATED)
async def criar_setor(
    body: SetorCriar,
    user: User = Depends(require_permission(*GESTORES)),
    db: AsyncSession = Depends(get_db),
):
    return await setor_service.criar(db, user.organization_id, body.nome)


@router.patch("/setores/{setor_id}", response_model=SetorOut)
async def editar_setor(
    setor_id: uuid.UUID,
    body: SetorEditar,
    user: User = Depends(require_permission(*GESTORES)),
    db: AsyncSession = Depends(get_db),
):
    dados = body.model_dump(exclude_unset=True)
    atual = await db.scalar(
        select(Setor).where(Setor.id == setor_id, Setor.organization_id == user.organization_id)
    )
    if atual is not None:
        for campo in ("nome", "ativo", "prazo_dias", "responsavel_id"):
            if campo in dados:
                auditoria.registrar(
                    db, organization_id=user.organization_id, autor=user, alvo_tipo="SETOR",
                    alvo_nome=atual.nome, campo=campo, antes=getattr(atual, campo), depois=dados[campo],
                )
    if "responsavel_id" in dados and dados["responsavel_id"] is not None:
        dono = await db.scalar(
            select(User.id).where(
                User.id == dados["responsavel_id"], User.organization_id == user.organization_id
            )
        )
        if dono is None:
            raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="Responsável inválido.")
    return await setor_service.editar(
        db,
        user.organization_id,
        setor_id,
        nome=body.nome,
        ativo=body.ativo,
        prazo_dias=dados.get("prazo_dias", ...),
        responsavel_id=dados.get("responsavel_id", ...),
    )


@router.delete("/setores/{setor_id}", status_code=status.HTTP_204_NO_CONTENT)
async def remover_setor(
    setor_id: uuid.UUID,
    user: User = Depends(require_permission(*GESTORES)),
    db: AsyncSession = Depends(get_db),
):
    await setor_service.remover(db, user.organization_id, setor_id)
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.get("/ajustes", response_model=AjustesOut)
async def ler_ajustes(
    user: User = Depends(require_permission(Perm.PEDIDO_VER)),
    db: AsyncSession = Depends(get_db),
):
    return AjustesOut.model_validate(await ajustes_service.obter(db, user.organization_id))


@router.patch("/ajustes", response_model=AjustesOut)
async def salvar_ajustes(
    body: AjustesEditar,
    user: User = Depends(require_permission(*GESTORES)),
    db: AsyncSession = Depends(get_db),
):
    dados = body.model_dump(exclude_unset=True)
    if "resumo_perfis" in dados and dados["resumo_perfis"] is not None:
        dados["resumo_perfis"] = [p for p in dados["resumo_perfis"] if p in PERFIS] or ["PREFEITO"]
    anterior = await ajustes_service.obter(db, user.organization_id)
    for campo, valor in dados.items():
        auditoria.registrar(
            db, organization_id=user.organization_id, autor=user, alvo_tipo="AJUSTES",
            alvo_nome="Alertas", campo=campo, antes=getattr(anterior, campo, None), depois=valor,
        )
    ajustes = await ajustes_service.salvar(db, user.organization_id, dados)
    await db.commit()
    return AjustesOut.model_validate(ajustes)
