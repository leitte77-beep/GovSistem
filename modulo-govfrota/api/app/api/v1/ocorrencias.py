import uuid

from fastapi import APIRouter, Depends, HTTPException, Response
from sqlalchemy import func as sa_func
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.auth import require_permission
from app.core.database import get_db
from app.core.permissions import Perm
from app.models.auth_models import User
from app.models.manutencao import Manutencao
from app.models.motorista import Motorista
from app.models.ocorrencia import Ocorrencia
from app.models.veiculo import Veiculo
from app.schemas.schemas import (
    OcorrenciaCreate,
    OcorrenciaResolver,
    OcorrenciaResponse,
    OcorrenciaUpdate,
)
from app.services.auditoria import registrar_auditoria

router = APIRouter(prefix="/ocorrencias", tags=["ocorrências"])

_SORTABLE = {
    "created_at": Ocorrencia.created_at,
    "data_ocorrencia": Ocorrencia.data_ocorrencia,
    "gravidade": Ocorrencia.gravidade,
    "status": Ocorrencia.status,
    "categoria": Ocorrencia.categoria,
    "veiculo": Veiculo.placa,
    "motorista": Motorista.nome,
}


async def _get_tenant_ocorrencia(
    db: AsyncSession, user: User, ocorrencia_id: uuid.UUID
) -> Ocorrencia:
    result = await db.execute(
        select(Ocorrencia).where(
            Ocorrencia.id == ocorrencia_id,
            Ocorrencia.organization_id == user.organization_id,
            Ocorrencia.deleted_at.is_(None),
        )
    )
    ocorrencia = result.scalar_one_or_none()
    if ocorrencia is None:
        raise HTTPException(status_code=404, detail="Ocorrência não encontrada.")
    return ocorrencia


async def _enriquecer(db: AsyncSession, registros: list[Ocorrencia]) -> list[dict]:
    """Junta veículo, motorista e created_at em lote (sem N+1)."""
    ids_veic = {r.veiculo_id for r in registros}
    ids_mot = {r.motorista_id for r in registros if r.motorista_id}

    veiculos = {}
    if ids_veic:
        veiculos = {
            v.id: v
            for v in (
                await db.execute(select(Veiculo).where(Veiculo.id.in_(ids_veic)))
            ).scalars().all()
        }
    motores = {}
    if ids_mot:
        motores = {
            m.id: m.nome
            for m in (
                await db.execute(select(Motorista).where(Motorista.id.in_(ids_mot)))
            ).scalars().all()
        }

    from pydantic import TypeAdapter

    adapter = TypeAdapter(list[OcorrenciaResponse])
    itens = []
    for r in registros:
        dados = OcorrenciaResponse.model_validate(r, from_attributes=True).model_dump()
        v = veiculos.get(r.veiculo_id)
        dados["veiculo_placa"] = v.placa if v else None
        dados["veiculo_modelo"] = v.modelo if v else None
        dados["veiculo_marca"] = v.marca if v else None
        dados["veiculo_foto_url"] = v.foto_url if v else None
        dados["veiculo_usa_horimetro"] = v.usa_horimetro if v else None
        dados["motorista_nome"] = motores.get(r.motorista_id) if r.motorista_id else None
        itens.append(dados)
    return adapter.validate_python(itens)


@router.get("", response_model=list[OcorrenciaResponse])
async def listar(
    search: str | None = None,
    veiculo_id: uuid.UUID | None = None,
    motorista_id: uuid.UUID | None = None,
    gravidade: str | None = None,
    categoria: str | None = None,
    status: str | None = None,
    origem: str | None = None,
    com_foto: bool | None = None,
    data_inicio: str | None = None,
    data_fim: str | None = None,
    sort_by: str = "created_at",
    order: str = "desc",
    skip: int = 0,
    limit: int = 50,
    response: Response = None,  # type: ignore[assignment]
    user: User = Depends(require_permission(Perm.VEHICLE_VIEW)),
    db: AsyncSession = Depends(get_db),
):
    from datetime import datetime, time

    stmt = (
        select(Ocorrencia)
        .join(Veiculo, Ocorrencia.veiculo_id == Veiculo.id)
        .outerjoin(Motorista, Ocorrencia.motorista_id == Motorista.id)
        .where(
            Ocorrencia.organization_id == user.organization_id,
            Ocorrencia.deleted_at.is_(None),
        )
    )
    if search:
        like = f"%{search}%"
        stmt = stmt.where(
            Veiculo.placa.ilike(like)
            | Veiculo.modelo.ilike(like)
            | Veiculo.marca.ilike(like)
            | Motorista.nome.ilike(like)
            | Ocorrencia.descricao.ilike(like)
        )
    if veiculo_id:
        stmt = stmt.where(Ocorrencia.veiculo_id == veiculo_id)
    if motorista_id:
        stmt = stmt.where(Ocorrencia.motorista_id == motorista_id)
    if gravidade:
        stmt = stmt.where(Ocorrencia.gravidade == gravidade.upper())
    if categoria:
        stmt = stmt.where(Ocorrencia.categoria == categoria.upper())
    if status:
        stmt = stmt.where(Ocorrencia.status == status.upper())
    if origem:
        stmt = stmt.where(Ocorrencia.origem == origem.upper())
    if com_foto is not None:
        stmt = stmt.where(
            Ocorrencia.foto_url.isnot(None) if com_foto else Ocorrencia.foto_url.is_(None)
        )
    if data_inicio:
        stmt = stmt.where(
            Ocorrencia.data_ocorrencia >= __import__("datetime").date.fromisoformat(data_inicio)
        )
    if data_fim:
        stmt = stmt.where(
            Ocorrencia.data_ocorrencia <= __import__("datetime").date.fromisoformat(data_fim)
        )

    total = await db.scalar(
        select(sa_func.count()).select_from(stmt.order_by(None).subquery())
    )
    total = int(total or 0)

    coluna = _SORTABLE.get(sort_by, Ocorrencia.created_at)
    ordenado = coluna.desc() if order.lower() == "desc" else coluna.asc()
    stmt = stmt.order_by(ordenado).offset(skip).limit(min(limit, 200))
    registros = list((await db.execute(stmt)).scalars().unique().all())

    if response is not None:
        response.headers["X-Total-Count"] = str(total)
    if not registros:
        return registros
    return await _enriquecer(db, registros)


@router.get("/{ocorrencia_id}", response_model=OcorrenciaResponse)
async def obter(
    ocorrencia_id: uuid.UUID,
    user: User = Depends(require_permission(Perm.VEHICLE_VIEW)),
    db: AsyncSession = Depends(get_db),
):
    ocorrencia = await _get_tenant_ocorrencia(db, user, ocorrencia_id)
    return (await _enriquecer(db, [ocorrencia]))[0]


@router.post("", response_model=OcorrenciaResponse, status_code=201)
async def criar(
    body: OcorrenciaCreate,
    user: User = Depends(require_permission(Perm.OCCURRENCE_MANAGE)),
    db: AsyncSession = Depends(get_db),
):
    from datetime import date as date_cls

    veiculo_ok = (
        await db.execute(
            select(Veiculo.id).where(
                Veiculo.id == body.veiculo_id,
                Veiculo.organization_id == user.organization_id,
                Veiculo.deleted_at.is_(None),
            )
        )
    ).scalar_one_or_none()
    if veiculo_ok is None:
        raise HTTPException(status_code=422, detail="Veículo inválido.")

    ocorrencia = Ocorrencia(
        **{k: v for k, v in body.model_dump().items() if k not in ("data_ocorrencia", "origem")},
        organization_id=user.organization_id,
        data_ocorrencia=body.data_ocorrencia or date_cls.today(),
        origem=body.origem or "ADMIN",
    )
    db.add(ocorrencia)
    await db.flush()
    await registrar_auditoria(
        db,
        organization_id=user.organization_id,
        acao="ocorrencia.registrar",
        entidade="ocorrencia",
        entidade_id=ocorrencia.id,
        usuario_id=user.id,
        dados_novos={
            "veiculo": str(body.veiculo_id),
            "categoria": body.categoria,
            "gravidade": body.gravidade,
            "foto_url": body.foto_url,
        },
    )
    await db.commit()
    await db.refresh(ocorrencia)
    return (await _enriquecer(db, [ocorrencia]))[0]


@router.patch("/{ocorrencia_id}", response_model=OcorrenciaResponse)
async def atualizar(
    ocorrencia_id: uuid.UUID,
    body: OcorrenciaUpdate,
    user: User = Depends(require_permission(Perm.OCCURRENCE_MANAGE)),
    db: AsyncSession = Depends(get_db),
):
    ocorrencia = await _get_tenant_ocorrencia(db, user, ocorrencia_id)
    novos = {}
    for campo, valor in body.model_dump(exclude_unset=True).items():
        setattr(ocorrencia, campo, valor)
        novos[campo] = valor
    await registrar_auditoria(
        db,
        organization_id=user.organization_id,
        acao="ocorrencia.atualizar",
        entidade="ocorrencia",
        entidade_id=ocorrencia.id,
        usuario_id=user.id,
        dados_novos=novos,
    )
    await db.commit()
    await db.refresh(ocorrencia)
    return (await _enriquecer(db, [ocorrencia]))[0]


@router.post("/{ocorrencia_id}/resolver", response_model=OcorrenciaResponse)
async def resolver(
    ocorrencia_id: uuid.UUID,
    body: OcorrenciaResolver,
    user: User = Depends(require_permission(Perm.OCCURRENCE_MANAGE)),
    db: AsyncSession = Depends(get_db),
):
    """Resolve a ocorrência registrando a solução em auditoria."""
    ocorrencia = await _get_tenant_ocorrencia(db, user, ocorrencia_id)
    if ocorrencia.status == "RESOLVIDA":
        raise HTTPException(status_code=422, detail="Ocorrência já resolvida.")

    anterior_status = ocorrencia.status
    ocorrencia.status = "RESOLVIDA"
    await registrar_auditoria(
        db,
        organization_id=user.organization_id,
        acao="ocorrencia.resolver",
        entidade="ocorrencia",
        entidade_id=ocorrencia.id,
        usuario_id=user.id,
        dados_anteriores={"status": anterior_status},
        dados_novos={"status": "RESOLVIDA", "resolucao": body.resolucao},
        justificativa=body.resolucao,
    )
    await db.commit()
    await db.refresh(ocorrencia)
    return (await _enriquecer(db, [ocorrencia]))[0]


@router.post("/{ocorrencia_id}/converter-manutencao", status_code=201)
async def converter_em_manutencao(
    ocorrencia_id: uuid.UUID,
    user: User = Depends(require_permission(Perm.MAINTENANCE_MANAGE)),
    db: AsyncSession = Depends(get_db),
):
    """Converte uma ocorrência aberta em manutenção corretiva.

    Reutiliza a foto/anexo da ocorrência por referência (sem duplicar bytes):
    a manutenção guarda `ocorrencia_origem_id`, permitindo acessar a foto pela
    ocorrência de origem.
    """
    from datetime import date

    ocorrencia = await _get_tenant_ocorrencia(db, user, ocorrencia_id)
    if ocorrencia.manutencao_id:
        raise HTTPException(status_code=422, detail="Ocorrência já convertida em manutenção.")

    manutencao = Manutencao(
        organization_id=user.organization_id,
        veiculo_id=ocorrencia.veiculo_id,
        tipo="CORRETIVA",
        descricao_problema=f"[{ocorrencia.categoria}] {ocorrencia.descricao}",
        quilometragem=ocorrencia.quilometragem,
        data_solicitacao=date.today(),
        prioridade={"CRITICA": "URGENTE", "ALTA": "ALTA"}.get(ocorrencia.gravidade, "NORMAL"),
        status="ABERTA",
        ocorrencia_origem_id=ocorrencia.id,
    )
    db.add(manutencao)
    await db.flush()

    ocorrencia.manutencao_id = manutencao.id
    ocorrencia.status = "CONVERTIDA_EM_MANUTENCAO"

    # Veículo entra em manutenção quando a ocorrência é grave/crítica
    if ocorrencia.gravidade in ("ALTA", "CRITICA"):
        veiculo = await db.get(Veiculo, ocorrencia.veiculo_id)
        if veiculo and veiculo.organization_id == user.organization_id:
            veiculo.situacao = "EM_MANUTENCAO"

    await registrar_auditoria(
        db,
        organization_id=user.organization_id,
        acao="ocorrencia.converter_manutencao",
        entidade="manutencao",
        entidade_id=manutencao.id,
        usuario_id=user.id,
        dados_novos={"origem_ocorrencia": str(ocorrencia.id), "foto_url": ocorrencia.foto_url},
    )
    await db.commit()
    return {"id": str(manutencao.id)}
