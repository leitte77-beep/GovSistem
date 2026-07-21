import uuid

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.auth import get_tenant_id, require_roles
from app.core.database import get_db
from app.models.enums import RoleName
from app.models.facial_recognition import FacialRecognition
from app.models.person import Person
from app.models.user import User
from app.schemas.facial_recognition import (
    FaceCadastrarRequest,
    FaceOut,
    FacePendenteOut,
    FaceVerificarOut,
    FaceVerificarRequest,
)
from app.services import facial_recognition as fr

router = APIRouter(prefix="/facial", tags=["facial-recognition"])

_GESTAO = require_roles(
    RoleName.TECNICO_SUPERIOR.value,
    RoleName.COORDENADOR_UNIDADE.value,
    RoleName.GESTOR_MUNICIPAL.value,
    RoleName.ADMIN.value,
)
_LEITURA = require_roles(
    RoleName.TECNICO_SUPERIOR.value,
    RoleName.COORDENADOR_UNIDADE.value,
    RoleName.GESTOR_MUNICIPAL.value,
    RoleName.ADMIN.value,
    RoleName.VIGILANCIA.value,
)


@router.post("/cadastrar", response_model=FaceOut, status_code=201)
async def cadastrar_face(
    body: FaceCadastrarRequest,
    db: AsyncSession = Depends(get_db),
    tenant_id: uuid.UUID = Depends(get_tenant_id),
    _user: User = Depends(_GESTAO),
):
    pessoa = await db.execute(
        select(Person).where(
            Person.id == body.person_id,
            Person.tenant_id == tenant_id,
            Person.deleted_at.is_(None),
        )
    )
    if not pessoa.scalar_one_or_none():
        raise HTTPException(status_code=404, detail="Pessoa não encontrada")

    face = await fr.cadastrar_face(
        db,
        tenant_id=tenant_id,
        person_id=body.person_id,
        foto_base64=body.foto_base64,
        metodo=body.metodo,
    )
    await db.commit()
    return _out(face)


@router.post("/verificar", response_model=FaceVerificarOut)
async def verificar_face(
    body: FaceVerificarRequest,
    db: AsyncSession = Depends(get_db),
    tenant_id: uuid.UUID = Depends(get_tenant_id),
    _user: User = Depends(_LEITURA),
):
    resultado = await fr.verificar_face(
        db,
        tenant_id=tenant_id,
        person_id=body.person_id,
        foto_base64=body.foto_base64,
    )
    await db.commit()
    return resultado


@router.get("/pendentes", response_model=list[FacePendenteOut])
async def listar_pendentes(
    db: AsyncSession = Depends(get_db),
    tenant_id: uuid.UUID = Depends(get_tenant_id),
    _user: User = Depends(_LEITURA),
):
    pendentes = await fr.listar_pendentes(db, tenant_id=tenant_id)
    return [FacePendenteOut(**p) for p in pendentes]


@router.delete("/{person_id}", status_code=204)
async def desativar_face(
    person_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    tenant_id: uuid.UUID = Depends(get_tenant_id),
    _user: User = Depends(_GESTAO),
):
    face = await fr.desativar_face(db, person_id=person_id)
    if not face:
        raise HTTPException(status_code=404, detail="Registro de face não encontrado")
    await db.commit()


def _out(f: FacialRecognition) -> FaceOut:
    return FaceOut(
        id=f.id,
        tenant_id=f.tenant_id,
        person_id=f.person_id,
        foto_url=f.foto_url,
        face_encoding=f.face_encoding,
        status=f.status,
        metodo_verificacao=f.metodo_verificacao,
        data_cadastro=f.data_cadastro,
        data_ultima_verificacao=f.data_ultima_verificacao,
        created_at=f.created_at,
        updated_at=f.updated_at,
    )
