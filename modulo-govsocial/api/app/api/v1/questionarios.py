"""Endpoints de instrumentos tecnico-operativos (questionarios)."""
import uuid
from datetime import date

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.auth import get_tenant_id, require_roles
from app.core.database import get_db
from app.models.enums import RoleName
from app.models.questionario import (
    Questao,
    Questionario,
    RespostaQuestao,
    RespostaQuestionario,
)
from app.models.user import User

from pydantic import BaseModel

router = APIRouter(tags=["questionarios"])

_MANAGE = require_roles(
    RoleName.COORDENADOR_UNIDADE.value,
    RoleName.GESTOR_MUNICIPAL.value,
    RoleName.ADMIN.value,
)
_READ = require_roles(
    RoleName.TECNICO_SUPERIOR.value,
    RoleName.TECNICO_MEDIO.value,
    RoleName.COORDENADOR_UNIDADE.value,
    RoleName.GESTOR_MUNICIPAL.value,
    RoleName.ADMIN.value,
)


class QuestaoCreate(BaseModel):
    ordem: int = 0
    enunciado: str
    tipo: str
    obrigatorio: bool = False
    opcoes: dict | None = None


class QuestionarioCreate(BaseModel):
    nome: str
    descricao: str | None = None
    service_type_code: str | None = None
    questoes: list[QuestaoCreate] = []


class QuestaoOut(BaseModel):
    id: uuid.UUID
    ordem: int
    enunciado: str
    tipo: str
    obrigatorio: bool
    opcoes: dict | None


class QuestionarioOut(BaseModel):
    id: uuid.UUID
    nome: str
    descricao: str | None
    service_type_code: str | None
    ativo: bool
    created_at: str
    questoes: list[QuestaoOut]

    model_config = {"from_attributes": True}


class RespostaValor(BaseModel):
    questao_id: uuid.UUID
    valor: str | None = None


class RespostaCreate(BaseModel):
    questionario_id: uuid.UUID
    person_id: uuid.UUID | None = None
    attendance_id: uuid.UUID | None = None
    data_preenchimento: date
    respostas: list[RespostaValor]


class RespostaOut(BaseModel):
    id: uuid.UUID
    questionario_id: uuid.UUID
    family_id: uuid.UUID
    person_id: uuid.UUID | None
    data_preenchimento: str
    profissional_id: uuid.UUID | None
    created_at: str


class RespostaDetalheOut(BaseModel):
    id: uuid.UUID
    questionario_id: uuid.UUID
    questionario_nome: str
    data_preenchimento: str
    respostas: list[dict]


# ─── CRUD QUESTIONÁRIOS ───────────────────────────────

@router.get("/questionarios", response_model=list[QuestionarioOut])
async def listar_questionarios(
    db: AsyncSession = Depends(get_db),
    tenant_id: uuid.UUID = Depends(get_tenant_id),
    user: User = Depends(_READ),
):
    from sqlalchemy.orm import selectinload

    result = await db.execute(
        select(Questionario)
        .where(Questionario.tenant_id == tenant_id, Questionario.ativo == True)
        .options(selectinload(Questionario.questoes))
    )
    return result.unique().scalars().all()


@router.post("/questionarios", response_model=QuestionarioOut)
async def criar_questionario(
    payload: QuestionarioCreate,
    db: AsyncSession = Depends(get_db),
    tenant_id: uuid.UUID = Depends(get_tenant_id),
    user: User = Depends(_MANAGE),
):
    q = Questionario(
        tenant_id=tenant_id,
        nome=payload.nome,
        descricao=payload.descricao,
        service_type_code=payload.service_type_code,
    )
    db.add(q)
    await db.flush()

    for i, qt in enumerate(payload.questoes):
        db.add(Questao(
            questionario_id=q.id,
            ordem=qt.ordem or i,
            enunciado=qt.enunciado,
            tipo=qt.tipo,
            obrigatorio=qt.obrigatorio,
            opcoes=qt.opcoes,
        ))

    await db.commit()
    await db.refresh(q)
    return q


class QuestionarioUpdate(BaseModel):
    nome: str | None = None
    descricao: str | None = None
    questoes: list[QuestaoCreate] | None = None


@router.get("/questionarios/{q_id}", response_model=QuestionarioOut)
async def obter_questionario(
    q_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    tenant_id: uuid.UUID = Depends(get_tenant_id),
    user: User = Depends(_READ),
):
    from sqlalchemy.orm import selectinload

    q = (
        await db.execute(
            select(Questionario)
            .where(Questionario.id == q_id, Questionario.tenant_id == tenant_id)
            .options(selectinload(Questionario.questoes))
        )
    ).unique().scalar_one_or_none()
    if not q:
        raise HTTPException(status_code=404, detail="Questionário não encontrado")
    return q


@router.patch("/questionarios/{q_id}", response_model=QuestionarioOut)
async def atualizar_questionario(
    q_id: uuid.UUID,
    payload: QuestionarioUpdate,
    db: AsyncSession = Depends(get_db),
    tenant_id: uuid.UUID = Depends(get_tenant_id),
    user: User = Depends(_MANAGE),
):
    from sqlalchemy.orm import selectinload

    q = (
        await db.execute(
            select(Questionario)
            .where(Questionario.id == q_id, Questionario.tenant_id == tenant_id)
            .options(selectinload(Questionario.questoes))
        )
    ).unique().scalar_one_or_none()
    if not q:
        raise HTTPException(status_code=404, detail="Questionário não encontrado")

    if payload.nome is not None:
        q.nome = payload.nome
    if payload.descricao is not None:
        q.descricao = payload.descricao

    if payload.questoes is not None:
        for existing in q.questoes:
            await db.delete(existing)
        for i, qt in enumerate(payload.questoes):
            db.add(Questao(
                questionario_id=q.id,
                ordem=qt.ordem or i,
                enunciado=qt.enunciado,
                tipo=qt.tipo,
                obrigatorio=qt.obrigatorio,
                opcoes=qt.opcoes,
            ))

    await db.commit()
    await db.refresh(q)
    return q


@router.delete("/questionarios/{q_id}", status_code=204)
async def desativar_questionario(
    q_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    tenant_id: uuid.UUID = Depends(get_tenant_id),
    user: User = Depends(_MANAGE),
):
    q = (
        await db.execute(
            select(Questionario).where(
                Questionario.id == q_id, Questionario.tenant_id == tenant_id,
            )
        )
    ).scalar_one_or_none()
    if not q:
        raise HTTPException(status_code=404)
    q.ativo = False
    await db.commit()


# ─── PREENCHIMENTO ─────────────────────────────────────

@router.post("/families/{family_id}/questionarios/responder", response_model=RespostaOut)
async def responder_questionario(
    family_id: uuid.UUID,
    payload: RespostaCreate,
    db: AsyncSession = Depends(get_db),
    tenant_id: uuid.UUID = Depends(get_tenant_id),
    user: User = Depends(_READ),
):
    resp = RespostaQuestionario(
        tenant_id=tenant_id,
        questionario_id=payload.questionario_id,
        family_id=family_id,
        person_id=payload.person_id,
        attendance_id=payload.attendance_id,
        data_preenchimento=payload.data_preenchimento,
        profissional_id=user.id,
    )
    db.add(resp)
    await db.flush()

    for rv in payload.respostas:
        db.add(RespostaQuestao(
            resposta_id=resp.id,
            questao_id=rv.questao_id,
            valor=rv.valor,
        ))

    await db.commit()
    await db.refresh(resp)
    return resp


@router.get("/families/{family_id}/questionarios", response_model=list[RespostaDetalheOut])
async def historico_questionarios(
    family_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    tenant_id: uuid.UUID = Depends(get_tenant_id),
    user: User = Depends(_READ),
):
    from sqlalchemy.orm import selectinload

    result = await db.execute(
        select(RespostaQuestionario)
        .where(
            RespostaQuestionario.tenant_id == tenant_id,
            RespostaQuestionario.family_id == family_id,
        )
        .options(
            selectinload(RespostaQuestionario.respostas).selectinload(RespostaQuestao.questao),
            selectinload(RespostaQuestionario.questionario),
        )
        .order_by(RespostaQuestionario.data_preenchimento.desc())
    )
    respostas = result.unique().scalars().all()

    out = []
    for r in respostas:
        out.append({
            "id": r.id,
            "questionario_id": r.questionario_id,
            "questionario_nome": r.questionario.nome if r.questionario else "",
            "data_preenchimento": str(r.data_preenchimento),
            "respostas": [
                {
                    "questao_id": rq.questao_id,
                    "enunciado": rq.questao.enunciado if rq.questao else "",
                    "valor": rq.valor,
                }
                for rq in (r.respostas or [])
            ],
        })
    return out
