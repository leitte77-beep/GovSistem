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
from sqlalchemy import func as sa_func
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
from app.models.veiculo import Veiculo, VeiculoTanque
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

    token = create_driver_token(
        motorista.id, acesso.id, acesso.organization_id, acesso.credential_version
    )
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
        "exigir_tanque_cheio": config.exigir_tanque_cheio,
    }


@router.get("/motorista/veiculos", response_model=list[VeiculoAppResponse])
async def veiculos_disponiveis(
    search: str | None = None,
    motorista: Motorista = Depends(get_current_motorista),
    db: AsyncSession = Depends(get_db),
):
    """Veículos autorizados da organização do motorista (exclui baixados/inativos).

    Inclui `combustiveis`: produtos que o veículo aceita (principal + reservatórios
    auxiliares, ex.: Diesel e ARLA 32) com a capacidade de cada reservatório.
    """
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

    # Reservatórios do veículo (principal + auxiliares) — única fonte dos
    # produtos aceitos. Carregados em lote para evitar N+1.
    tanques_veic: dict = {}
    combustiveis: dict = {}
    if veiculos:
        rows = (
            await db.execute(
                select(VeiculoTanque).where(
                    VeiculoTanque.organization_id == motorista.organization_id,
                    VeiculoTanque.veiculo_id.in_([v.id for v in veiculos]),
                    VeiculoTanque.deleted_at.is_(None),
                    VeiculoTanque.ativo.is_(True),
                )
            )
        ).scalars().all()
        for t in rows:
            tanques_veic.setdefault(t.veiculo_id, []).append(t)
        ids = {c for t in rows for c in (t.combustivel_id, t.combustivel_alternativo_id) if c}
        if ids:
            combustiveis = {
                c.id: c.nome
                for c in (
                    await db.execute(select(Combustivel).where(Combustivel.id.in_(ids)))
                ).scalars().all()
            }

    resposta = []
    for v in veiculos:
        tanques = sorted(tanques_veic.get(v.id, []), key=lambda t: t.tank_type != "PRIMARY")
        principal = next((t for t in tanques if t.tank_type == "PRIMARY"), None)
        unicos: dict = {}
        for t in tanques:
            for cid in (t.combustivel_id, t.combustivel_alternativo_id):
                if cid is not None and combustiveis.get(cid):
                    unicos.setdefault(
                        cid,
                        {
                            "combustivel_id": cid,
                            "nome": combustiveis[cid],
                            "tank_type": t.tank_type,
                            "capacidade": t.capacidade if t.capacidade and t.capacidade > 0 else None,
                        },
                    )
        resposta.append(
            VeiculoAppResponse(
                id=v.id,
                placa=v.placa,
                modelo=v.modelo,
                marca=v.marca,
                foto_url=v.foto_url,
                usa_horimetro=v.usa_horimetro,
                combustivel_principal_id=principal.combustivel_id if principal else None,
                combustivel_principal_nome=combustiveis.get(principal.combustivel_id) if principal else None,
                quilometragem_atual=v.quilometragem_atual,
                horimetro_atual=v.horimetro_atual,
                combustiveis=list(unicos.values()),
            )
        )
    return resposta


from pydantic import BaseModel, Field  # noqa: E402


class AbastecimentoAppCreate(BaseModel):
    veiculo_id: uuid.UUID
    # Onde abasteceu: tanque próprio OU posto credenciado. Se nenhum vier e
    # só houver uma opção compatível, o backend escolhe.
    tanque_id: uuid.UUID | None = None
    fornecedor_id: uuid.UUID | None = None
    # Ignorado: o preço vem do contrato do posto. Mantido para a fila offline
    # de versões antigas do app não ser recusada.
    preco_litro: Decimal | None = None
    numero_nf: str | None = Field(default=None, max_length=50)
    quantidade_litros: Decimal = Field(gt=0)
    quilometragem: int = Field(default=0, ge=0)
    combustivel_id: uuid.UUID | None = None
    horimetro: Decimal | None = Field(default=None, ge=0)
    completou_tanque: bool | None = None
    observacoes: str | None = None
    foto_bomba_url: str | None = None
    foto_painel_url: str | None = None
    idempotency_key: str | None = Field(default=None, max_length=64)
    # Momento em que o motorista registrou no celular — difere do envio quando
    # o abastecimento foi feito sem internet e sincronizado depois.
    data_abastecimento: datetime | None = None


async def _tanques_proprios(db: AsyncSession, org: uuid.UUID, combustivel_id: uuid.UUID | None = None):
    from app.models.combustivel import Tanque

    stmt = select(Tanque).where(
        Tanque.organization_id == org,
        Tanque.deleted_at.is_(None),
        Tanque.ativo.is_(True),
    )
    if combustivel_id is not None:
        stmt = stmt.where(Tanque.combustivel_id == combustivel_id)
    return (await db.execute(stmt.order_by(Tanque.nome))).scalars().all()


async def _postos_credenciados(db: AsyncSession, org: uuid.UUID):
    from app.models.combustivel import Fornecedor

    return (
        await db.execute(
            select(Fornecedor)
            .where(
                Fornecedor.organization_id == org,
                Fornecedor.deleted_at.is_(None),
                Fornecedor.ativo.is_(True),
                Fornecedor.posto_credenciado.is_(True),
            )
            .order_by(Fornecedor.nome_fantasia, Fornecedor.razao_social)
        )
    ).scalars().all()


@router.get("/motorista/tanques")
async def listar_tanques(
    motorista: Motorista = Depends(get_current_motorista),
    db: AsyncSession = Depends(get_db),
):
    """Tanques ativos da organização — para seleção no app quando houver mais de um."""
    return [
        {"id": str(t.id), "nome": t.nome, "combustivel_id": str(t.combustivel_id)}
        for t in await _tanques_proprios(db, motorista.organization_id)
    ]


@router.get("/motorista/locais")
async def listar_locais(
    motorista: Motorista = Depends(get_current_motorista),
    db: AsyncSession = Depends(get_db),
):
    """Onde o motorista pode abastecer: tanques próprios e postos credenciados.

    Cada posto traz o preço contratado por combustível — só para exibição; o
    backend aplica o preço do contrato no registro.
    """
    from app.core.timezone import now_local
    from app.models.combustivel import Combustivel
    from app.services.contrato_posto import contrato_vigente

    org = motorista.organization_id
    hoje = now_local().date()
    combustiveis = [
        c.id
        for c in (
            await db.execute(
                select(Combustivel).where(
                    Combustivel.organization_id == org, Combustivel.deleted_at.is_(None)
                )
            )
        ).scalars().all()
    ]
    postos = []
    for f in await _postos_credenciados(db, org):
        precos = []
        for cid in combustiveis:
            contrato = await contrato_vigente(db, org, f.id, cid, hoje)
            if contrato is not None:
                precos.append({"combustivel_id": str(cid), "preco_litro": float(contrato.preco_litro)})
        postos.append(
            {
                "id": str(f.id),
                "nome": f.nome_fantasia or f.razao_social,
                "endereco": ", ".join(x for x in (f.logradouro, f.numero, f.bairro) if x) or f.endereco,
                "precos": precos,
            }
        )
    return {
        "tanques": [
            {"id": str(t.id), "nome": t.nome, "combustivel_id": str(t.combustivel_id)}
            for t in await _tanques_proprios(db, org)
        ],
        "postos": postos,
    }


def _data_informada(valor: datetime | None) -> datetime:
    """Data do registro no celular, limitada a uma janela plausível."""
    from datetime import timedelta

    agora = datetime.now(timezone.utc)
    if valor is None:
        return agora
    if valor.tzinfo is None:
        valor = valor.replace(tzinfo=timezone.utc)
    if valor > agora + timedelta(minutes=10):
        raise HTTPException(status_code=422, detail="Data do abastecimento no futuro. Confira o relógio do celular.")
    if valor < agora - timedelta(hours=settings.OFFLINE_MAX_HORAS):
        raise HTTPException(
            status_code=422,
            detail=(
                f"Abastecimento registrado há mais de {settings.OFFLINE_MAX_HORAS} horas. "
                "Peça ao setor de frota para lançar pelo painel."
            ),
        )
    return valor


@router.post("/motorista/abastecimentos", response_model=AbastecimentoResponse, status_code=201)
async def novo_abastecimento(
    body: AbastecimentoAppCreate,
    request: Request,
    motorista: Motorista = Depends(get_current_motorista),
    db: AsyncSession = Depends(get_db),
):
    """Fluxo de abastecimento do motorista (§18-§19).

    Combustível é inferido do veículo quando ele possui apenas um compatível;
    caso contrário deve ser informado pelo app. O local (tanque próprio ou posto
    credenciado) é escolhido automaticamente quando só existe uma opção.
    """
    org = motorista.organization_id
    veiculo = (
        await db.execute(
            select(Veiculo).where(
                Veiculo.id == body.veiculo_id,
                Veiculo.organization_id == org,
                Veiculo.deleted_at.is_(None),
            )
        )
    ).scalar_one_or_none()
    if veiculo is None:
        raise HTTPException(status_code=404, detail="Veículo não encontrado.")

    combustivel_id = body.combustivel_id
    if combustivel_id is None:
        principal = (
            await db.execute(
                select(VeiculoTanque).where(
                    VeiculoTanque.veiculo_id == veiculo.id,
                    VeiculoTanque.tank_type == "PRIMARY",
                    VeiculoTanque.deleted_at.is_(None),
                )
            )
        ).scalars().first()
        combustivel_id = principal.combustivel_id if principal else None
    if combustivel_id is None:
        raise HTTPException(status_code=422, detail="Selecione o combustível utilizado.")

    data_abastecimento = _data_informada(body.data_abastecimento)

    # Idempotência antes de tudo: um reenvio (ex.: fila offline) devolve o que
    # já foi gravado, mesmo que o cenário tenha mudado desde então.
    if body.idempotency_key:
        existente = await find_abastecimento_by_idempotency(db, org, body.idempotency_key)
        if existente:
            return existente

    # Local do abastecimento
    tanque_id = body.tanque_id
    fornecedor_id = body.fornecedor_id
    if fornecedor_id is None and tanque_id is None:
        tanques = await _tanques_proprios(db, org, combustivel_id)
        postos = await _postos_credenciados(db, org)
        if len(tanques) + len(postos) == 1:
            tanque_id = tanques[0].id if tanques else None
            fornecedor_id = postos[0].id if postos else None
        elif not tanques and not postos:
            raise HTTPException(
                status_code=422,
                detail="Nenhum tanque ou posto credenciado disponível para este combustível.",
            )
        else:
            raise HTTPException(status_code=422, detail="Selecione onde foi feito o abastecimento.")
    elif tanque_id is not None and fornecedor_id is None:
        tanque = next((t for t in await _tanques_proprios(db, org) if t.id == tanque_id), None)
        if tanque is None:
            raise HTTPException(status_code=404, detail="Tanque não encontrado.")
        if tanque.combustivel_id != combustivel_id:
            raise HTTPException(
                status_code=422,
                detail="Combustível incompatível com o tanque selecionado.",
            )
    elif tanque_id is not None and fornecedor_id is not None:
        raise HTTPException(status_code=422, detail="Informe o tanque OU o posto, não os dois.")
    modalidade = "POSTO_CREDENCIADO" if fornecedor_id else "TANQUE_PROPRIO"

    config = await get_configuracoes(db, org)

    # Fotos obrigatórias conforme configuração da organização
    if config.foto_bomba_obrigatoria and not body.foto_bomba_url:
        raise HTTPException(status_code=422, detail="Foto da bomba é obrigatória.")
    if config.foto_km_obrigatoria and not body.foto_painel_url:
        raise HTTPException(status_code=422, detail="Foto da quilometragem é obrigatória.")

    await validar_motorista_habilitado(motorista, config)

    info = get_client_info(request)
    try:
        abastecimento, avisos = await registrar_abastecimento(
            db,
            organization_id=org,
            veiculo=veiculo,
            modalidade=modalidade,
            tanque_id=tanque_id,
            fornecedor_id=fornecedor_id,
            # Preço vem do contrato do posto; o app não informa valor.
            preco_litro=None,
            numero_nf=body.numero_nf,
            combustivel_id=combustivel_id,
            quantidade_litros=Decimal(body.quantidade_litros),
            quilometragem=body.quilometragem,
            horimetro=body.horimetro,
            data_abastecimento=data_abastecimento,
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
            existente = await find_abastecimento_by_idempotency(db, org, body.idempotency_key)
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
    from app.models.combustivel import Combustivel, Fornecedor, Tanque

    result = await db.execute(
        select(
            Abastecimento,
            Veiculo.placa,
            Veiculo.modelo,
            Veiculo.marca,
            Combustivel.nome,
            Tanque.nome,
            sa_func.coalesce(Fornecedor.nome_fantasia, Fornecedor.razao_social),
        )
        .join(Veiculo, Veiculo.id == Abastecimento.veiculo_id)
        .join(Tanque, Tanque.id == Abastecimento.tanque_id, isouter=True)
        .outerjoin(Fornecedor, Fornecedor.id == Abastecimento.fornecedor_id)
        .outerjoin(Combustivel, Combustivel.id == Abastecimento.combustivel_id)
        .where(
            Abastecimento.organization_id == motorista.organization_id,
            Abastecimento.motorista_id == motorista.id,
        )
        .order_by(Abastecimento.data_abastecimento.desc())
        .limit(10)
    )
    itens = []
    for a, placa, modelo, marca, combustivel, tanque, posto in result.all():
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
                "horimetro": float(a.horimetro) if a.horimetro is not None else None,
                "local": posto or tanque,
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
    await db.flush()
    await registrar_auditoria(
        db,
        organization_id=motorista.organization_id,
        acao="ocorrencia.registrar",
        entidade="ocorrencia",
        entidade_id=ocorrencia.id,
        motorista_id=motorista.id,
        dados_novos={
            "veiculo": str(body.veiculo_id),
            "categoria": body.categoria,
            "gravidade": body.gravidade,
            "foto_url": body.foto_url,
        },
    )
    await db.commit()
    return {"ok": True, "id": str(ocorrencia.id), "mensagem": "Problema registrado com sucesso."}
