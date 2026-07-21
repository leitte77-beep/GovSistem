import logging
import uuid
from datetime import datetime, timezone

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.facial_recognition import FacialRecognition
from app.models.person import Person

logger = logging.getLogger("govsocial.facial_recognition")


async def cadastrar_face(
    db: AsyncSession,
    tenant_id: uuid.UUID,
    person_id: uuid.UUID,
    foto_base64: str | None = None,
    metodo: str = "FOTO_SIMPLES",
) -> FacialRecognition:
    """Registra face de uma pessoa para futura verificação biométrica.

    Stub para uso futuro de AWS Rekognition / Azure Face API / FaceNet.
    Atualmente salva a foto em base64 e gera um encoding placeholder.
    """
    existing = await db.execute(
        select(FacialRecognition).where(
            FacialRecognition.tenant_id == tenant_id,
            FacialRecognition.person_id == person_id,
            FacialRecognition.deleted_at.is_(None),
        )
    )
    registro = existing.scalar_one_or_none()

    if registro:
        registro.foto_url = foto_base64 if foto_base64 else registro.foto_url
        registro.metodo_verificacao = metodo
        registro.face_encoding = {
            "versao": "1.0.0-stub",
            "dimensoes": 128,
            "algoritmo": "placeholder",
            "encoding": [0.0] * 128,
        }
        registro.status = "PENDENTE_VERIFICACAO"
        registro.data_cadastro = datetime.now(timezone.utc)
        target = registro
    else:
        registro = FacialRecognition(
            tenant_id=tenant_id,
            person_id=person_id,
            foto_url=foto_base64,
            face_encoding={
                "versao": "1.0.0-stub",
                "dimensoes": 128,
                "algoritmo": "placeholder",
                "encoding": [0.0] * 128,
            },
            status="PENDENTE_VERIFICACAO",
            metodo_verificacao=metodo,
            data_cadastro=datetime.now(timezone.utc),
        )
        db.add(registro)
        target = registro

    await db.flush()
    await db.refresh(target)
    logger.info(
        "Face cadastrada: person=%s tenant=%s metodo=%s",
        person_id, tenant_id, metodo,
    )
    return target


async def verificar_face(
    db: AsyncSession,
    tenant_id: uuid.UUID,
    person_id: uuid.UUID,
    foto_base64: str | None = None,
) -> dict:
    """Verifica se a foto fornecida corresponde à face cadastrada da pessoa.

    Stub para uso futuro de AWS Rekognition / Azure Face API / FaceNet.
    Atualmente sempre retorna True com confiança 0.95 (placeholder).
    """
    result = await db.execute(
        select(FacialRecognition).where(
            FacialRecognition.tenant_id == tenant_id,
            FacialRecognition.person_id == person_id,
            FacialRecognition.status == "ATIVO",
            FacialRecognition.deleted_at.is_(None),
        )
    )
    registro = result.scalar_one_or_none()

    if not registro:
        logger.warning(
            "Face não encontrada para verificação: person=%s tenant=%s",
            person_id, tenant_id,
        )
        return {"match": False, "confianca": 0.0, "motivo": "face_nao_cadastrada"}

    registro.data_ultima_verificacao = datetime.now(timezone.utc)
    await db.flush()

    logger.info(
        "Face verificada (stub): person=%s tenant=%s confianca=0.95",
        person_id, tenant_id,
    )
    return {"match": True, "confianca": 0.95, "motivo": "stub_placeholder"}


async def listar_pendentes(
    db: AsyncSession, tenant_id: uuid.UUID,
) -> list[dict]:
    """Lista pessoas que ainda não possuem face cadastrada ou cujo cadastro
    está com status PENDENTE_VERIFICACAO.
    """
    active_face_ids = (
        select(FacialRecognition.person_id)
        .where(
            FacialRecognition.tenant_id == tenant_id,
            FacialRecognition.status == "ATIVO",
            FacialRecognition.deleted_at.is_(None),
        )
        .subquery()
    )

    pending_result = await db.execute(
        select(FacialRecognition, Person)
        .join(Person, Person.id == FacialRecognition.person_id)
        .where(
            FacialRecognition.tenant_id == tenant_id,
            FacialRecognition.status == "PENDENTE_VERIFICACAO",
            FacialRecognition.deleted_at.is_(None),
            Person.deleted_at.is_(None),
        )
        .order_by(FacialRecognition.data_cadastro.desc())
    )
    pending_rows = pending_result.all()

    persons_with_face_ids = {row[0].person_id for row in pending_rows}
    for row in await db.execute(select(active_face_ids)):
        persons_with_face_ids.add(row[0])

    persons_result = await db.execute(
        select(Person).where(
            Person.tenant_id == tenant_id,
            Person.deleted_at.is_(None),
            Person.id.notin_(list(persons_with_face_ids)) if persons_with_face_ids else True,
        ).order_by(Person.nome_civil)
    )
    persons_sem_face = persons_result.scalars().all()

    pendentes = []
    for fr, person in pending_rows:
        pendentes.append({
            "person_id": person.id,
            "nome": person.nome_exibicao,
            "cpf": person.cpf,
            "nis": person.nis,
            "status_face": fr.status,
            "face_id": fr.id,
            "data_cadastro_face": fr.data_cadastro,
        })

    for person in persons_sem_face:
        pendentes.append({
            "person_id": person.id,
            "nome": person.nome_exibicao,
            "cpf": person.cpf,
            "nis": person.nis,
            "status_face": "NAO_CADASTRADA",
            "face_id": None,
            "data_cadastro_face": None,
        })

    return pendentes


async def desativar_face(
    db: AsyncSession, person_id: uuid.UUID,
) -> FacialRecognition | None:
    """Desativa o registro de biometria facial de uma pessoa (soft-delete)."""
    result = await db.execute(
        select(FacialRecognition).where(
            FacialRecognition.person_id == person_id,
            FacialRecognition.deleted_at.is_(None),
        )
    )
    registro = result.scalar_one_or_none()
    if not registro:
        return None
    registro.status = "INATIVO"
    registro.deleted_at = datetime.now(timezone.utc)
    await db.flush()
    await db.refresh(registro)
    logger.info("Face desativada: person=%s face=%s", person_id, registro.id)
    return registro
