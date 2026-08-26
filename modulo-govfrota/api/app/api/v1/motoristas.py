import uuid
from datetime import date, datetime, timezone, timedelta

from fastapi import APIRouter, Depends, HTTPException, Response
from sqlalchemy import func as sa_func
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.auth import require_permission
from app.core.database import get_db
from app.core.permissions import Perm
from app.core.security import hash_secret
from app.models.abastecimento import Abastecimento
from app.models.auth_models import User
from app.models.motorista import AcessoMotorista, Motorista
from app.models.ocorrencia import Ocorrencia
from app.schemas.schemas import (
    AcessoResponse,
    CredencialCreate,
    CredencialUpdate,
    MotoristaCreate,
    MotoristaListaResponse,
    MotoristaResponse,
    MotoristaUpdate,
)
from app.services.auditoria import registrar_auditoria

router = APIRouter(prefix="/motoristas", tags=["motoristas"])

# Colunas ordenáveis na listagem (whitelist).
_SORTABLE = {
    "nome": Motorista.nome,
    "cnh_validade": Motorista.cnh_validade,
    "ativo": Motorista.ativo,
    "ultimo_acesso": AcessoMotorista.ultimo_acesso,
}


def _normalizar_cpf(cpf: str) -> str:
    return cpf.replace(".", "").replace("-", "").strip()


def _situacao_cnh(validade: date | None) -> str | None:
    """Classifica a situação da CNH conforme a proximidade do vencimento."""
    if validade is None:
        return None
    hoje = date.today()
    dias = (validade - hoje).days
    if dias < 0:
        return "VENCIDA"
    if dias <= 7:
        return "A_VENCER_7"
    if dias <= 30:
        return "A_VENCER_30"
    if dias <= 60:
        return "A_VENCER_60"
    return "VALIDA"


async def _get_motorista_tenant(
    db: AsyncSession, user: User, motorista_id: uuid.UUID
) -> Motorista:
    result = await db.execute(
        select(Motorista).where(
            Motorista.id == motorista_id,
            Motorista.organization_id == user.organization_id,
            Motorista.deleted_at.is_(None),
        )
    )
    motorista = result.scalar_one_or_none()
    if motorista is None:
        raise HTTPException(status_code=404, detail="Motorista não encontrado.")
    return motorista


@router.get("", response_model=list[MotoristaListaResponse])
async def listar(
    search: str | None = None,
    ativo: bool | None = None,
    cnh_categoria: str | None = None,
    situacao_cnh: str | None = None,
    acesso_status: str | None = None,
    sort_by: str = "nome",
    order: str = "asc",
    skip: int = 0,
    limit: int = 50,
    response: Response = None,  # type: ignore[assignment]
    user: User = Depends(require_permission(Perm.VEHICLE_VIEW)),
    db: AsyncSession = Depends(get_db),
):
    cond = [
        Motorista.organization_id == user.organization_id,
        Motorista.deleted_at.is_(None),
    ]
    if search:
        like = f"%{search}%"
        cond.append(
            (Motorista.nome.ilike(like))
            | (Motorista.cpf.ilike(like))
            | (Motorista.matricula.ilike(like))
            | (Motorista.cnh_numero.ilike(like))
        )
    if ativo is not None:
        cond.append(Motorista.ativo == ativo)
    if cnh_categoria:
        cond.append(Motorista.cnh_categoria == cnh_categoria.upper())
    hoje = date.today()
    if situacao_cnh == "VENCIDA":
        cond.append(Motorista.cnh_validade < hoje)
    elif situacao_cnh in ("A_VENCER_7", "A_VENCER_30", "A_VENCER_60"):
        dias = int(situacao_cnh.split("_")[-1])
        cond.append(
            Motorista.cnh_validade >= hoje,
            Motorista.cnh_validade <= hoje + timedelta(days=dias),
        )
    elif situacao_cnh == "VALIDA":
        cond.append(Motorista.cnh_validade > hoje + timedelta(days=60))
    if acesso_status == "SEM_ACESSO":
        cond.append(AcessoMotorista.motorista_id.is_(None))
    elif acesso_status == "COM_ACESSO":
        cond.append(AcessoMotorista.motorista_id.isnot(None))
    elif acesso_status == "BLOQUEADO":
        cond.append(AcessoMotorista.bloqueado.is_(True))

    # Join com a credencial — permite acesso/último acesso na listagem (sem N+1).
    base = (
        select(Motorista, AcessoMotorista)
        .outerjoin(AcessoMotorista, AcessoMotorista.motorista_id == Motorista.id)
        .where(*cond)
    )

    total = await db.scalar(
        select(sa_func.count())
        .select_from(base.order_by(None).subquery())
    )
    if response is not None:
        response.headers["X-Total-Count"] = str(int(total or 0))

    coluna = _SORTABLE.get(sort_by, Motorista.nome)
    ordenado = coluna.desc() if order.lower() == "desc" else coluna.asc()
    if sort_by == "ultimo_acesso" and order.lower() == "desc":
        # Nulos (nunca acessou) por último na ordenação desc.
        ordenado = AcessoMotorista.ultimo_acesso.desc().nulls_last()
    stmt = base.order_by(ordenado).offset(skip).limit(min(limit, 200))
    result = await db.execute(stmt)

    from pydantic import TypeAdapter

    adapter = TypeAdapter(list[MotoristaListaResponse])
    itens = []
    for m, acesso in result.all():
        dados = MotoristaListaResponse.model_validate(m, from_attributes=True).model_dump()
        dados["acesso_login"] = acesso.login if acesso else None
        dados["acesso_bloqueado"] = bool(acesso.bloqueado) if acesso else False
        dados["ultimo_acesso"] = acesso.ultimo_acesso if acesso else None
        dados["situacao_cnh"] = _situacao_cnh(m.cnh_validade)
        itens.append(dados)
    return adapter.validate_python(itens)


@router.post("", response_model=MotoristaResponse, status_code=201)
async def criar(
    body: MotoristaCreate,
    user: User = Depends(require_permission(Perm.DRIVER_MANAGE)),
    db: AsyncSession = Depends(get_db),
):
    cpf = _normalizar_cpf(body.cpf)
    if len(cpf) != 11 or not cpf.isdigit():
        raise HTTPException(status_code=422, detail="CPF inválido.")
    existente = await db.execute(
        select(Motorista.id).where(
            Motorista.organization_id == user.organization_id,
            Motorista.cpf == cpf,
            Motorista.deleted_at.is_(None),
        )
    )
    if existente.scalar_one_or_none():
        raise HTTPException(status_code=422, detail="Já existe um motorista com este CPF.")

    motorista = Motorista(**{**body.model_dump(), "cpf": cpf}, organization_id=user.organization_id)
    db.add(motorista)
    await db.flush()
    await registrar_auditoria(
        db,
        organization_id=user.organization_id,
        acao="motorista.criar",
        entidade="motorista",
        entidade_id=motorista.id,
        usuario_id=user.id,
        dados_novos={"nome": motorista.nome, "cpf": cpf},
    )
    await db.commit()
    await db.refresh(motorista)
    return motorista


@router.get("/{motorista_id}", response_model=MotoristaResponse)
async def obter(
    motorista_id: uuid.UUID,
    user: User = Depends(require_permission(Perm.VEHICLE_VIEW)),
    db: AsyncSession = Depends(get_db),
):
    return await _get_motorista_tenant(db, user, motorista_id)


@router.patch("/{motorista_id}", response_model=MotoristaResponse)
async def atualizar(
    motorista_id: uuid.UUID,
    body: MotoristaUpdate,
    user: User = Depends(require_permission(Perm.DRIVER_MANAGE)),
    db: AsyncSession = Depends(get_db),
):
    motorista = await _get_motorista_tenant(db, user, motorista_id)
    for campo, valor in body.model_dump(exclude_unset=True).items():
        setattr(motorista, campo, valor)
    await registrar_auditoria(
        db,
        organization_id=user.organization_id,
        acao="motorista.atualizar",
        entidade="motorista",
        entidade_id=motorista.id,
        usuario_id=user.id,
        dados_novos=body.model_dump(exclude_unset=True, mode="json"),
    )
    await db.commit()
    await db.refresh(motorista)
    return motorista


@router.delete("/{motorista_id}", status_code=204)
async def excluir(
    motorista_id: uuid.UUID,
    user: User = Depends(require_permission(Perm.DRIVER_MANAGE)),
    db: AsyncSession = Depends(get_db),
):
    motorista = await _get_motorista_tenant(db, user, motorista_id)
    motorista.deleted_at = datetime.now(timezone.utc)
    await registrar_auditoria(
        db,
        organization_id=user.organization_id,
        acao="motorista.inativar",
        entidade="motorista",
        entidade_id=motorista.id,
        usuario_id=user.id,
    )
    await db.commit()


# ── Credenciais de acesso do motorista ───────────────────────────────────────


@router.get("/{motorista_id}/acesso", response_model=AcessoResponse)
async def obter_acesso(
    motorista_id: uuid.UUID,
    user: User = Depends(require_permission(Perm.DRIVER_MANAGE)),
    db: AsyncSession = Depends(get_db),
):
    motorista = await _get_motorista_tenant(db, user, motorista_id)
    acesso = (
        await db.execute(
            select(AcessoMotorista).where(AcessoMotorista.motorista_id == motorista.id)
        )
    ).scalar_one_or_none()
    return acesso or AcessoResponse(login=None, bloqueado=False, ultimo_acesso=None)


@router.put("/{motorista_id}/acesso", response_model=AcessoResponse, status_code=201)
async def definir_credencial(
    motorista_id: uuid.UUID,
    body: CredencialCreate,
    user: User = Depends(require_permission(Perm.DRIVER_MANAGE)),
    db: AsyncSession = Depends(get_db),
):
    """Cria ou redefine o acesso do motorista — senha sempre com hash bcrypt.

    O login é globalmente único no GovFrota (normalizado), pois a tela de
    login do motorista não solicita tenant. A unicidade é garantida pelo banco
    e validada aqui também para uma resposta amigável.
    """
    motorista = await _get_motorista_tenant(db, user, motorista_id)
    login = body.login.strip().lower()

    conflito = await db.execute(
        select(AcessoMotorista.id).where(
            AcessoMotorista.login_normalized == login,
            AcessoMotorista.motorista_id != motorista.id,
        )
    )
    if conflito.scalar_one_or_none():
        raise HTTPException(status_code=422, detail="Login já utilizado por outro motorista.")

    acesso = (
        await db.execute(
            select(AcessoMotorista).where(AcessoMotorista.motorista_id == motorista.id)
        )
    ).scalar_one_or_none()

    acao = "motorista.acesso_redefinir"
    if acesso is None:
        acao = "motorista.acesso_criar"
        acesso = AcessoMotorista(
            organization_id=user.organization_id,
            motorista_id=motorista.id,
            login=login,
            senha_hash=hash_secret(body.senha),
        )
        db.add(acesso)
    else:
        acesso.login = login
        acesso.senha_hash = hash_secret(body.senha)
        acesso.bloqueado = False
        acesso.falhas_login = 0
        acesso.locked_until = None

    await registrar_auditoria(
        db,
        organization_id=user.organization_id,
        acao=acao,
        entidade="acesso_motorista",
        entidade_id=motorista.id,
        usuario_id=user.id,
        dados_novos={"login": login},
    )
    await db.commit()
    await db.refresh(acesso)
    return acesso


@router.patch("/{motorista_id}/acesso", response_model=AcessoResponse)
async def atualizar_credencial(
    motorista_id: uuid.UUID,
    body: CredencialUpdate | dict,
    bloquear: bool | None = None,
    user: User = Depends(require_permission(Perm.DRIVER_MANAGE)),
    db: AsyncSession = Depends(get_db),
):
    """Altera login/senha ou bloqueia/desbloqueia acesso."""
    motorista = await _get_motorista_tenant(db, user, motorista_id)
    acesso = (
        await db.execute(
            select(AcessoMotorista).where(AcessoMotorista.motorista_id == motorista.id)
        )
    ).scalar_one_or_none()
    if acesso is None:
        raise HTTPException(status_code=404, detail="Motorista não possui acesso configurado.")

    if isinstance(body, dict):
        body = CredencialUpdate(**body)

    dados_novos: dict = {}
    if body.login is not None:
        login = body.login.strip().lower()
        conflito = await db.execute(
            select(AcessoMotorista.id).where(
                AcessoMotorista.login_normalized == login,
                AcessoMotorista.motorista_id != motorista.id,
            )
        )
        if conflito.scalar_one_or_none():
            raise HTTPException(status_code=422, detail="Login já utilizado por outro motorista.")
        acesso.login = login
        dados_novos["login"] = login
    if body.nova_senha is not None:
        acesso.senha_hash = hash_secret(body.nova_senha)
        acesso.falhas_login = 0
        acesso.locked_until = None
        dados_novos["senha_alterada"] = True

    if bloquear is not None:
        acesso.bloqueado = bloquear
        dados_novos["bloqueado"] = bloquear

    await registrar_auditoria(
        db,
        organization_id=user.organization_id,
        acao="motorista.acesso_atualizar",
        entidade="acesso_motorista",
        entidade_id=motorista.id,
        usuario_id=user.id,
        dados_novos=dados_novos,
    )
    await db.commit()
    await db.refresh(acesso)
    return acesso


@router.post("/{motorista_id}/acesso/gerar-pin")
async def gerar_pin_acesso(
    motorista_id: uuid.UUID,
    user: User = Depends(require_permission(Perm.DRIVER_MANAGE)),
    db: AsyncSession = Depends(get_db),
):
    """Cria o acesso (login global único) ou redefine o PIN do motorista.

    Gera um PIN provisório de 6 dígitos, armazena apenas o hash (bcrypt) e
    devolve o PIN em texto claro UMA única vez — nunca mais será recuperável.
    """
    import re
    import secrets

    motorista = await _get_motorista_tenant(db, user, motorista_id)
    acesso = (
        await db.execute(
            select(AcessoMotorista).where(AcessoMotorista.motorista_id == motorista.id)
        )
    ).scalar_one_or_none()

    criado = acesso is None
    if acesso is None:
        # Login global único, derivado do nome.
        base = re.sub(r"[^a-z0-9]+", ".", motorista.nome.lower()).strip(".")
        base = base or "motorista"
        login = base
        n = 2
        while True:
            ocupado = await db.scalar(
                select(AcessoMotorista.id).where(
                    AcessoMotorista.login_normalized == login
                )
            )
            if not ocupado:
                break
            login = f"{base}.{n}"
            n += 1
        acesso = AcessoMotorista(
            organization_id=user.organization_id,
            motorista_id=motorista.id,
            login=login,
            senha_hash="",
        )
        db.add(acesso)

    pin = f"{secrets.randbelow(1_000_000):06d}"
    acesso.senha_hash = hash_secret(pin)
    acesso.bloqueado = False
    acesso.falhas_login = 0
    acesso.locked_until = None

    acao = "motorista.acesso_criar" if criado else "motorista.acesso_redefinir"
    await registrar_auditoria(
        db,
        organization_id=user.organization_id,
        acao=acao,
        entidade="acesso_motorista",
        entidade_id=motorista.id,
        usuario_id=user.id,
        dados_novos={"login": acesso.login, "pin_gerado": True},
    )
    await db.commit()
    await db.refresh(acesso)

    return {
        "criado": criado,
        "login": acesso.login,
        "pin_provisorio": pin,
        "url": "/motorista",
    }


# ── Histórico administrativo do motorista ────────────────────────────────────


@router.get("/{motorista_id}/resumo")
async def resumo(
    motorista_id: uuid.UUID,
    user: User = Depends(require_permission(Perm.REFUELING_VIEW)),
    db: AsyncSession = Depends(get_db),
):
    from sqlalchemy import func as sa_func

    motorista = await _get_motorista_tenant(db, user, motorista_id)

    stats = (
        await db.execute(
            select(
                sa_func.count(Abastecimento.id),
                sa_func.coalesce(sa_func.sum(Abastecimento.quantidade_litros), 0),
            ).where(
                Abastecimento.organization_id == user.organization_id,
                Abastecimento.motorista_id == motorista.id,
                Abastecimento.status == "CONFIRMADO",
            )
        )
    ).one()

    ultimos = (
        await db.execute(
            select(Abastecimento)
            .where(
                Abastecimento.organization_id == user.organization_id,
                Abastecimento.motorista_id == motorista.id,
            )
            .order_by(Abastecimento.data_abastecimento.desc())
            .limit(10)
        )
    ).scalars().all()

    ocorrencias = (
        await db.execute(
            select(Ocorrencia)
            .where(
                Ocorrencia.organization_id == user.organization_id,
                Ocorrencia.motorista_id == motorista.id,
            )
            .order_by(Ocorrencia.created_at.desc())
            .limit(5)
        )
    ).scalars().all()

    return {
        "total_abastecimentos": stats[0],
        "total_litros": float(stats[1]),
        "ultimos_abastecimentos": [
            {
                "id": str(a.id),
                "data": a.data_abastecimento.isoformat(),
                "veiculo_id": str(a.veiculo_id),
                "litros": float(a.quantidade_litros),
                "km": a.quilometragem,
            }
            for a in ultimos
        ],
        "ocorrencias": [
            {
                "id": str(o.id),
                "categoria": o.categoria,
                "gravidade": o.gravidade,
                "status": o.status,
            }
            for o in ocorrencias
        ],
    }
