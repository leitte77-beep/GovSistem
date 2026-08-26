"""Área do motorista — autenticação própria e fluxo mobile simplificado.

Interface mínima para celular (§17-§20, §43-§44):
- Login com login/PIN + proteção contra brute force.
- Veículos autorizados da organização.
- Novo abastecimento com validações completas e fotos.
- Registrar problema (ocorrência).
Motorista NUNCA acessa endpoints administrativos.
"""

import uuid
from datetime import datetime, timezone
from decimal import Decimal

from fastapi import APIRouter, Depends, HTTPException, Request
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.core.auth import get_client_info, get_current_motorista
from app.core.config import settings
from app.core.database import get_db
from app.core.security import create_driver_token, verify_secret
from app.models.abastecimento import Abastecimento
from app.models.motorista import AcessoMotorista, Motorista
from app.models.ocorrencia import Ocorrencia
from app.models.veiculo import Veiculo
from app.schemas.schemas import (
    AbastecimentoResponse,
    LoginMotoristaRequest,
    OcorrenciaAppCreate,
    TokenMotoristaResponse,
    VeiculoAppResponse,
)
from app.services.abastecimento import (
    find_abastecimento_by_idempotency,
    get_configuracoes,
    registrar_abastecimento,
    validar_motorista_habilitado,
)
from app.services.estoque import EstoqueError
from app.services.auditoria import registrar_auditoria

router = APIRouter(prefix="/app", tags=["app do motorista"])


@router.post("/motorista/login", response_model=TokenMotoristaResponse)
async def login_motorista(
    body: LoginMotoristaRequest,
    request: Request,
    db: AsyncSession = Depends(get_db),
):
    """Login simplificado do motorista com bloqueio por tentativas (§43).

    O tenant é resolvido exclusivamente a partir da credencial — o frontend
    nunca informa organização/tenant.
    """
    login = body.login.strip().lower()
    info = get_client_info(request)

    result = await db.execute(
        select(AcessoMotorista).where(
            AcessoMotorista.login_normalized == login,
            AcessoMotorista.organization_id.isnot(None),
        )
    )
    acesso = result.scalar_one_or_none()

    # Resposta genérica para não revelar existência de logins
    if acesso is None:
        raise HTTPException(status_code=401, detail="Login ou PIN inválido.")

    agora = datetime.now(timezone.utc)
    if acesso.bloqueado:
        raise HTTPException(status_code=403, detail="Acesso bloqueado. Procure o administrador.")
    locked_until = acesso.locked_until
    if locked_until is not None and locked_until.tzinfo is None:
        locked_until = locked_until.replace(tzinfo=timezone.utc)
    if locked_until is not None and locked_until > agora:
        minutos = int((locked_until - agora).total_seconds() // 60) + 1
        raise HTTPException(
            status_code=429,
            detail=f"Muitas tentativas. Tente novamente em {minutos} min.",
        )

    motorista = (
        await db.execute(
            select(Motorista)
            .where(Motorista.id == acesso.motorista_id, Motorista.deleted_at.is_(None))
            .options(selectinload(Motorista.acesso))
        )
    ).scalar_one_or_none()

    if motorista is None or not motorista.ativo or not verify_secret(body.pin, acesso.senha_hash):
        acesso.falhas_login += 1
        if acesso.falhas_login >= settings.DRIVER_MAX_LOGIN_FAILURES:
            from datetime import timedelta

            acesso.locked_until = agora + timedelta(minutes=settings.DRIVER_LOCKOUT_MINUTES)
            acesso.falhas_login = 0
            await registrar_auditoria(
                db,
                organization_id=acesso.organization_id,
                acao="motorista.acesso_bloquear_bruteforce",
                entidade="acesso_motorista",
                entidade_id=motorista.id if motorista else None,
                motorista_id=motorista.id if motorista else None,
                dados_novos={"motivo": "Muitas tentativas de login"},
                ip_address=info.get("ip_address"),
            )
        await db.commit()
        raise HTTPException(status_code=401, detail="Login ou PIN inválido.")

    config = await get_configuracoes(db, acesso.organization_id)
    try:
        await validar_motorista_habilitado(motorista, config)
    except HTTPException as exc:
        await db.commit()
        raise exc

    acesso.falhas_login = 0
    acesso.locked_until = None
    acesso.ultimo_acesso = agora
    await registrar_auditoria(
        db,
        organization_id=acesso.organization_id,
        acao="motorista.login_sucesso",
        entidade="acesso_motorista",
        entidade_id=motorista.id,
        motorista_id=motorista.id,
        dados_novos={},
        ip_address=info.get("ip_address"),
    )
    await db.commit()

    token = create_driver_token(motorista.id, acesso.id, acesso.organization_id)
    return TokenMotoristaResponse(
        access_token=token,
        motorista={"id": motorista.id, "nome": motorista.nome, "organization_id": acesso.organization_id},
    )


@router.get("/motorista/me")
async def me(
    motorista: Motorista = Depends(get_current_motorista),
    db: AsyncSession = Depends(get_db),
):
    from app.models.auth_models import Organization

    org = (
        await db.execute(
            select(Organization).where(Organization.id == motorista.organization_id)
        )
    ).scalar_one_or_none()
    config = await get_configuracoes(db, motorista.organization_id)
    return {
        "id": str(motorista.id),
        "nome": motorista.nome,
        "organization_id": str(motorista.organization_id),
        "organization_name": org.name if org else None,
        "foto_bomba_obrigatoria": config.foto_bomba_obrigatoria,
        "foto_km_obrigatoria": config.foto_km_obrigatoria,
    }


@router.get("/motorista/veiculos", response_model=list[VeiculoAppResponse])
async def veiculos_disponiveis(
    search: str | None = None,
    motorista: Motorista = Depends(get_current_motorista),
    db: AsyncSession = Depends(get_db),
):
    """Veículos autorizados da organização do motorista (exclui baixados/inativos)."""
    from app.models.combustivel import Combustivel

    stmt = select(Veiculo).where(
        Veiculo.organization_id == motorista.organization_id,
        Veiculo.deleted_at.is_(None),
        Veiculo.situacao != "BAIXADO",
    )
    if search:
        like = f"%{search.replace('-', '').replace(' ', '')}%"
        stmt = stmt.where(
            (Veiculo.placa.ilike(like)) | (Veiculo.modelo.ilike(like))
        )
    stmt = stmt.order_by(Veiculo.placa).limit(50)
    veiculos = (await db.execute(stmt)).scalars().all()

    # Nomes dos combustíveis — evita N+1.
    combustiveis = {}
    ids = {
        v.combustivel_principal_id
        for v in veiculos
        if v.combustivel_principal_id is not None
    } | {
        v.combustivel_secundario_id
        for v in veiculos
        if v.combustivel_secundario_id is not None
    }
    if ids:
        comb_result = await db.execute(
            select(Combustivel).where(Combustivel.id.in_(ids))
        )
        combustiveis = {c.id: c.nome for c in comb_result.scalars().all()}

    return [
        VeiculoAppResponse(
            id=v.id,
            placa=v.placa,
            modelo=v.modelo,
            marca=v.marca,
            foto_url=v.foto_url,
            usa_horimetro=v.usa_horimetro,
            combustivel_principal_id=v.combustivel_principal_id,
            combustivel_principal_nome=combustiveis.get(v.combustivel_principal_id),
            combustivel_secundario_id=v.combustivel_secundario_id,
            combustivel_secundario_nome=combustiveis.get(v.combustivel_secundario_id),
            quilometragem_atual=v.quilometragem_atual,
            horimetro_atual=v.horimetro_atual,
        )
        for v in veiculos
    ]


from pydantic import BaseModel, Field


class AbastecimentoAppCreate(BaseModel):
    veiculo_id: uuid.UUID
    tanque_id: uuid.UUID | None = None
    quantidade_litros: Decimal = Field(gt=0)
    quilometragem: int = Field(ge=0)
    combustivel_id: uuid.UUID | None = None
    horimetro: Decimal | None = None
    completou_tanque: bool | None = None
    observacoes: str | None = None
    foto_bomba_url: str | None = None
    foto_painel_url: str | None = None
    idempotency_key: str | None = Field(default=None, max_length=64)


@router.get("/motorista/tanques")
async def listar_tanques(
    motorista: Motorista = Depends(get_current_motorista),
    db: AsyncSession = Depends(get_db),
):
    """Tanques ativos da organização — para seleção no app quando houver mais de um."""
    from app.models.combustivel import Tanque

    result = await db.execute(
        select(Tanque).where(
            Tanque.organization_id == motorista.organization_id,
            Tanque.deleted_at.is_(None),
            Tanque.ativo.is_(True),
        )
    )
    return [
        {
            "id": str(t.id),
            "nome": t.nome,
            "combustivel_id": str(t.combustivel_id),
        }
        for t in result.scalars().all()
    ]


@router.post("/motorista/abastecimentos", response_model=AbastecimentoResponse, status_code=201)
async def novo_abastecimento(
    body: AbastecimentoAppCreate,
    request: Request,
    motorista: Motorista = Depends(get_current_motorista),
    db: AsyncSession = Depends(get_db),
):
    """Fluxo de abastecimento do motorista (§18-§19).

    Combustível é inferido do veículo quando ele possui apenas um compatível;
    caso contrário deve ser informado pelo app.
    """
    veiculo = (
        await db.execute(
            select(Veiculo).where(
                Veiculo.id == body.veiculo_id,
                Veiculo.organization_id == motorista.organization_id,
                Veiculo.deleted_at.is_(None),
            )
        )
    ).scalar_one_or_none()
    if veiculo is None:
        raise HTTPException(status_code=404, detail="Veículo não encontrado.")

    combustivel_id = body.combustivel_id or veiculo.combustivel_principal_id
    if combustivel_id is None:
        raise HTTPException(
            status_code=422,
            detail="Selecione o combustível utilizado.",
        )

    # Tanque: auto-seleção quando existe apenas um compatível (§18, passo 3)
    tanque_id = body.tanque_id
    if tanque_id is None:
        from app.models.combustivel import Tanque

        compatíveis = (
            await db.execute(
                select(Tanque).where(
                    Tanque.organization_id == motorista.organization_id,
                    Tanque.deleted_at.is_(None),
                    Tanque.ativo.is_(True),
                    Tanque.combustivel_id == combustivel_id,
                )
            )
        ).scalars().all()
        if len(compatíveis) == 1:
            tanque_id = compatíveis[0].id
        elif len(compatíveis) == 0:
            raise HTTPException(
                status_code=422,
                detail="Nenhum tanque disponível para este combustível.",
            )
        else:
            raise HTTPException(
                status_code=422,
                detail="Selecione o tanque de origem do abastecimento.",
            )
    else:
        # Tanque informado pelo app: valida tenant + estado + combustível.
        from app.models.combustivel import Tanque

        tanque = (
            await db.execute(
                select(Tanque).where(
                    Tanque.id == tanque_id,
                    Tanque.organization_id == motorista.organization_id,
                    Tanque.deleted_at.is_(None),
                    Tanque.ativo.is_(True),
                )
            )
        ).scalar_one_or_none()
        if tanque is None:
            raise HTTPException(status_code=404, detail="Tanque não encontrado.")
        if tanque.combustivel_id != combustivel_id:
            raise HTTPException(
                status_code=422,
                detail="Combustível incompatível com o tanque selecionado.",
            )

    config = await get_configuracoes(db, motorista.organization_id)

    # Fotos obrigatórias conforme configuração da organização
    if config.foto_bomba_obrigatoria and not body.foto_bomba_url:
        raise HTTPException(status_code=422, detail="Foto da bomba é obrigatória.")
    if config.foto_km_obrigatoria and not body.foto_painel_url:
        raise HTTPException(status_code=422, detail="Foto da quilometragem é obrigatória.")

    await validar_motorista_habilitado(motorista, config)

    # Idempotência: reenvio seguro (duplo toque/instabilidade de rede).
    if body.idempotency_key:
        existente = await find_abastecimento_by_idempotency(
            db, motorista.organization_id, body.idempotency_key
        )
        if existente:
            return existente

    info = get_client_info(request)
    try:
        abastecimento, avisos = await registrar_abastecimento(
            db,
            organization_id=motorista.organization_id,
            veiculo=veiculo,
            tanque_id=tanque_id,
            combustivel_id=combustivel_id,
            quantidade_litros=Decimal(body.quantidade_litros),
            quilometragem=body.quilometragem,
            data_abastecimento=datetime.now(timezone.utc),
            motorista_id=motorista.id,
            origem="APP_MOTORISTA",
            completou_tanque=body.completou_tanque,
            foto_bomba_url=body.foto_bomba_url,
            foto_painel_url=body.foto_painel_url,
            observacoes=body.observacoes,
            ip_origem=info.get("ip_address"),
            idempotency_key=body.idempotency_key,
            permitir_estoque_negativo=False,
        )
        await db.commit()
    except EstoqueError as e:
        await db.rollback()
        raise HTTPException(status_code=422, detail=e.mensagem)
    except Exception as exc:
        # Concorrência na chave de idempotência (unique): retorna o já criado.
        from sqlalchemy.exc import IntegrityError

        if isinstance(exc, IntegrityError) and body.idempotency_key:
            await db.rollback()
            existente = await find_abastecimento_by_idempotency(
                db, motorista.organization_id, body.idempotency_key
            )
            if existente:
                return existente
            raise HTTPException(
                status_code=409,
                detail="Este abastecimento já está sendo processado. Aguarde e verifique.",
            )
        await db.rollback()
        raise exc
    await db.refresh(abastecimento)
    return abastecimento


@router.get("/motorista/abastecimentos")
async def meus_abastecimentos(
    motorista: Motorista = Depends(get_current_motorista),
    db: AsyncSession = Depends(get_db),
):
    """Últimos abastecimentos do próprio motorista (com placa/modelo/combustível)."""
    from app.models.combustivel import Combustivel, Tanque

    result = await db.execute(
        select(
            Abastecimento,
            Veiculo.placa,
            Veiculo.modelo,
            Veiculo.marca,
            Combustivel.nome,
        )
        .join(Veiculo, Veiculo.id == Abastecimento.veiculo_id)
        .join(Tanque, Tanque.id == Abastecimento.tanque_id, isouter=True)
        .outerjoin(Combustivel, Combustivel.id == Abastecimento.combustivel_id)
        .where(
            Abastecimento.organization_id == motorista.organization_id,
            Abastecimento.motorista_id == motorista.id,
        )
        .order_by(Abastecimento.data_abastecimento.desc())
        .limit(10)
    )
    itens = []
    for a, placa, modelo, marca, combustivel in result.all():
        itens.append(
            {
                "id": str(a.id),
                "data": a.data_abastecimento.isoformat(),
                "veiculo_id": str(a.veiculo_id),
                "placa": placa,
                "modelo": modelo,
                "marca": marca,
                "combustivel": combustivel,
                "litros": float(a.quantidade_litros),
                "km": a.quilometragem,
            }
        )
    return itens


@router.post("/motorista/problemas", status_code=201)
async def informar_problema(
    body: OcorrenciaAppCreate,
    motorista: Motorista = Depends(get_current_motorista),
    db: AsyncSession = Depends(get_db),
):
    """Registro de problema pelo motorista (§26, opcional por perfil)."""
    veiculo_ok = (
        await db.execute(
            select(Veiculo.id).where(
                Veiculo.id == body.veiculo_id,
                Veiculo.organization_id == motorista.organization_id,
                Veiculo.deleted_at.is_(None),
            )
        )
    ).scalar_one_or_none()
    if veiculo_ok is None:
        raise HTTPException(status_code=404, detail="Veículo não encontrado.")

    ocorrencia = Ocorrencia(
        organization_id=motorista.organization_id,
        veiculo_id=body.veiculo_id,
        motorista_id=motorista.id,
        categoria=body.categoria,
        descricao=body.descricao,
        gravidade=body.gravidade.upper() if body.gravidade else "MEDIA",
        quilometragem=body.quilometragem,
        foto_url=body.foto_url,
        data_ocorrencia=datetime.now(timezone.utc).date(),
        origem="APP_MOTORISTA",
    )
    db.add(ocorrencia)
    await db.commit()
    return {"ok": True, "id": str(ocorrencia.id), "mensagem": "Problema registrado com sucesso."}
