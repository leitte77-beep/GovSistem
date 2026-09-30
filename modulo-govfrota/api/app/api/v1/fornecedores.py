import uuid
from decimal import Decimal

from fastapi import APIRouter, Depends, HTTPException, Response
from sqlalchemy import func as sa_func
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.auth import get_current_user, require_permission
from app.core.database import get_db
from app.core.permissions import Perm
from app.models.auth_models import User
from app.models.abastecimento import Abastecimento
from app.models.combustivel import Combustivel, ContratoPosto, Fornecedor
from app.models.estoque import EntradaCombustivel
from app.models.manutencao import Manutencao
from app.models.veiculo import Veiculo
from app.schemas.schemas import (
    ContratoPostoCreate,
    ContratoPostoResponse,
    ContratoPostoUpdate,
    FornecedorCreate,
    FornecedorDetalheResponse,
    FornecedorResponse,
    FornecedorUpdate,
)
from app.services.auditoria import registrar_auditoria
from app.services.contrato_posto import litros_consumidos

router = APIRouter(tags=["fornecedores"])

# Oficinas são fornecedores destas categorias (cadastro único).
CATEGORIAS_OFICINA = ("MECANICA", "FUNILARIA", "ELETRICA", "PNEUS", "AUTOPECAS", "CONCESSIONARIA", "OUTRO")


async def _montar_fornecedor(
    db: AsyncSession,
    organization_id: uuid.UUID,
    fornecedor: Fornecedor,
    *,
    total_entradas: int = 0,
    litros_fornecidos: float = 0,
    valor_total: float = 0,
    ultima_compra: dict | None = None,
) -> FornecedorResponse:
    abast = (
        await db.execute(
            select(
                sa_func.count(Abastecimento.id),
                sa_func.coalesce(sa_func.sum(Abastecimento.quantidade_litros), 0),
                sa_func.coalesce(sa_func.sum(Abastecimento.custo_total), 0),
            ).where(
                Abastecimento.organization_id == organization_id,
                Abastecimento.fornecedor_id == fornecedor.id,
                Abastecimento.status == "CONFIRMADO",
            )
        )
    ).one()
    manut = (
        await db.execute(
            select(
                sa_func.count(Manutencao.id),
                sa_func.coalesce(sa_func.sum(Manutencao.valor_total), 0),
            ).where(
                Manutencao.organization_id == organization_id,
                Manutencao.fornecedor_id == fornecedor.id,
                Manutencao.deleted_at.is_(None),
                Manutencao.status != "CANCELADA",
            )
        )
    ).one()
    return FornecedorResponse(
        id=fornecedor.id,
        razao_social=fornecedor.razao_social,
        nome_fantasia=fornecedor.nome_fantasia,
        cpf_cnpj=fornecedor.cpf_cnpj,
        telefone=fornecedor.telefone,
        email=fornecedor.email,
        site=fornecedor.site,
        contato=fornecedor.contato,
        cep=fornecedor.cep,
        logradouro=fornecedor.logradouro,
        numero=fornecedor.numero,
        complemento=fornecedor.complemento,
        bairro=fornecedor.bairro,
        cidade=fornecedor.cidade,
        uf=fornecedor.uf,
        endereco=fornecedor.endereco,
        foto_url=fornecedor.foto_url,
        categoria=fornecedor.categoria,
        posto_credenciado=fornecedor.posto_credenciado,
        observacoes=fornecedor.observacoes,
        ativo=fornecedor.ativo,
        total_entradas=total_entradas,
        litros_fornecidos=litros_fornecidos,
        valor_total=valor_total,
        ultima_compra=ultima_compra,
        total_abastecimentos=int(abast[0] or 0),
        litros_abastecidos=float(abast[1] or 0),
        valor_abastecimentos=float(abast[2] or 0),
        total_manutencoes=int(manut[0] or 0),
        valor_manutencoes=float(manut[1] or 0),
    )


async def _agregados(
    db: AsyncSession, organization_id: uuid.UUID, fornecedor_id: uuid.UUID
) -> tuple[int, float, float, dict | None]:
    """Total de entradas, litros, valor e última compra do fornecedor."""
    row = (
        await db.execute(
            select(
                sa_func.count(EntradaCombustivel.id),
                sa_func.coalesce(sa_func.sum(EntradaCombustivel.quantidade_litros), 0),
                sa_func.coalesce(sa_func.sum(EntradaCombustivel.valor_total), 0),
            ).where(
                EntradaCombustivel.organization_id == organization_id,
                EntradaCombustivel.fornecedor_id == fornecedor_id,
                EntradaCombustivel.cancelada.is_(False),
            )
        )
    ).one()
    total_entradas = int(row[0] or 0)
    litros = float(row[1] or 0)
    valor = float(row[2] or 0)

    ultima = (
        await db.execute(
            select(EntradaCombustivel)
            .where(
                EntradaCombustivel.organization_id == organization_id,
                EntradaCombustivel.fornecedor_id == fornecedor_id,
            )
            .order_by(EntradaCombustivel.data_entrada.desc())
            .limit(1)
        )
    ).scalar_one_or_none()
    ultima_compra = None
    if ultima is not None:
        ultima_compra = {
            "id": str(ultima.id),
            "data": ultima.data_entrada.isoformat(),
            "litros": float(ultima.quantidade_litros),
            "valor": float(ultima.valor_total) if ultima.valor_total else None,
            "nota": ultima.numero_nota,
            "cancelada": ultima.cancelada,
        }
    return total_entradas, litros, valor, ultima_compra


# ── Fornecedores ────────────────────────────────────────────────────────────


@router.get("/fornecedores", response_model=list[FornecedorResponse])
async def listar_fornecedores(
    search: str | None = None,
    categoria: str | None = None,
    ativo: bool | None = None,
    posto_credenciado: bool | None = None,
    oficina: bool | None = None,
    skip: int = 0,
    limit: int = 50,
    response: Response = None,  # type: ignore[assignment]
    user: User = Depends(require_permission(Perm.VEHICLE_VIEW)),
    db: AsyncSession = Depends(get_db),
):
    base = select(Fornecedor).where(
        Fornecedor.organization_id == user.organization_id,
        Fornecedor.deleted_at.is_(None),
    )
    if search:
        like = f"%{search}%"
        base = base.where(
            (Fornecedor.razao_social.ilike(like))
            | (Fornecedor.nome_fantasia.ilike(like))
            | (Fornecedor.cpf_cnpj.ilike(like))
            | (Fornecedor.cidade.ilike(like))
        )
    if categoria:
        base = base.where(Fornecedor.categoria == categoria.upper())
    if posto_credenciado is not None:
        base = base.where(Fornecedor.posto_credenciado.is_(posto_credenciado))
    if oficina:
        base = base.where(Fornecedor.categoria.in_(CATEGORIAS_OFICINA))
    if ativo is not None:
        base = base.where(Fornecedor.ativo == ativo)

    total = await db.scalar(
        select(sa_func.count()).select_from(base.order_by(None).subquery())
    )
    if response is not None:
        response.headers["X-Total-Count"] = str(int(total or 0))

    stmt = base.order_by(Fornecedor.razao_social).offset(skip).limit(min(limit, 200))
    fornecedores = (await db.execute(stmt)).scalars().all()

    respostas = []
    for f in fornecedores:
        total_entradas, litros, valor, ultima = await _agregados(
            db, user.organization_id, f.id
        )
        respostas.append(
            await _montar_fornecedor(
                db,
                user.organization_id,
                f,
                total_entradas=total_entradas,
                litros_fornecidos=litros,
                valor_total=valor,
                ultima_compra=ultima,
            )
        )
    return respostas


@router.post("/fornecedores", response_model=FornecedorResponse, status_code=201)
async def criar_fornecedor(
    body: FornecedorCreate,
    user: User = Depends(require_permission(Perm.FUEL_MANAGE, Perm.MAINTENANCE_MANAGE)),
    db: AsyncSession = Depends(get_db),
):
    fornecedor = Fornecedor(**body.model_dump(), organization_id=user.organization_id)
    db.add(fornecedor)
    await db.flush()
    await registrar_auditoria(
        db,
        organization_id=user.organization_id,
        acao="fornecedor.criar",
        entidade="fornecedor",
        entidade_id=fornecedor.id,
        usuario_id=user.id,
        dados_novos={"razao_social": body.razao_social},
    )
    await db.commit()
    await db.refresh(fornecedor)
    return await _montar_fornecedor(db, user.organization_id, fornecedor)


@router.get("/fornecedores/{fornecedor_id}", response_model=FornecedorDetalheResponse)
async def obter_fornecedor(
    fornecedor_id: uuid.UUID,
    user: User = Depends(require_permission(Perm.VEHICLE_VIEW)),
    db: AsyncSession = Depends(get_db),
):
    fornecedor = (
        await db.execute(
            select(Fornecedor).where(
                Fornecedor.id == fornecedor_id,
                Fornecedor.organization_id == user.organization_id,
                Fornecedor.deleted_at.is_(None),
            )
        )
    ).scalar_one_or_none()
    if fornecedor is None:
        raise HTTPException(status_code=404, detail="Fornecedor não encontrado.")

    total_entradas, litros, valor, ultima = await _agregados(db, user.organization_id, fornecedor.id)
    base = await _montar_fornecedor(
        db,
        user.organization_id,
        fornecedor,
        total_entradas=total_entradas,
        litros_fornecidos=litros,
        valor_total=valor,
        ultima_compra=ultima,
    )

    historico = (
        await db.execute(
            select(EntradaCombustivel)
            .where(
                EntradaCombustivel.organization_id == user.organization_id,
                EntradaCombustivel.fornecedor_id == fornecedor.id,
            )
            .order_by(EntradaCombustivel.data_entrada.desc())
            .limit(50)
        )
    ).scalars().all()

    abastecimentos = (
        await db.execute(
            select(Abastecimento, Veiculo.placa)
            .join(Veiculo, Veiculo.id == Abastecimento.veiculo_id)
            .where(
                Abastecimento.organization_id == user.organization_id,
                Abastecimento.fornecedor_id == fornecedor.id,
            )
            .order_by(Abastecimento.data_abastecimento.desc())
            .limit(50)
        )
    ).all()
    manutencoes = (
        await db.execute(
            select(Manutencao, Veiculo.placa)
            .join(Veiculo, Veiculo.id == Manutencao.veiculo_id)
            .where(
                Manutencao.organization_id == user.organization_id,
                Manutencao.fornecedor_id == fornecedor.id,
                Manutencao.deleted_at.is_(None),
            )
            .order_by(Manutencao.data_solicitacao.desc())
            .limit(50)
        )
    ).all()

    dados = base.model_dump()
    dados["historico_abastecimentos"] = [
        {
            "id": str(a.id),
            "data": a.data_abastecimento.isoformat(),
            "placa": placa,
            "litros": float(a.quantidade_litros),
            "preco_litro": float(a.preco_litro) if a.preco_litro else None,
            "valor": float(a.custo_total) if a.custo_total else None,
            "nota": a.numero_nf,
            "cancelado": a.status == "CANCELADO",
        }
        for a, placa in abastecimentos
    ]
    dados["historico_manutencoes"] = [
        {
            "id": str(m.id),
            "data": m.data_solicitacao.isoformat(),
            "placa": placa,
            "tipo": m.tipo,
            "status": m.status,
            "valor": float(m.valor_total),
        }
        for m, placa in manutencoes
    ]
    dados["historico_entradas"] = [
        {
            "id": str(e.id),
            "data": e.data_entrada.isoformat(),
            "litros": float(e.quantidade_litros),
            "valor": float(e.valor_total) if e.valor_total else None,
            "nota": e.numero_nota,
            "cancelada": e.cancelada,
        }
        for e in historico
    ]
    return FornecedorDetalheResponse(**dados)


@router.patch("/fornecedores/{fornecedor_id}", response_model=FornecedorResponse)
async def atualizar_fornecedor(
    fornecedor_id: uuid.UUID,
    body: FornecedorUpdate,
    user: User = Depends(require_permission(Perm.FUEL_MANAGE, Perm.MAINTENANCE_MANAGE)),
    db: AsyncSession = Depends(get_db),
):
    fornecedor = (
        await db.execute(
            select(Fornecedor).where(
                Fornecedor.id == fornecedor_id,
                Fornecedor.organization_id == user.organization_id,
                Fornecedor.deleted_at.is_(None),
            )
        )
    ).scalar_one_or_none()
    if fornecedor is None:
        raise HTTPException(status_code=404, detail="Fornecedor não encontrado.")
    for campo, valor in body.model_dump(exclude_unset=True).items():
        setattr(fornecedor, campo, valor)
    await registrar_auditoria(
        db,
        organization_id=user.organization_id,
        acao="fornecedor.atualizar",
        entidade="fornecedor",
        entidade_id=fornecedor.id,
        usuario_id=user.id,
    )
    await db.commit()
    await db.refresh(fornecedor)
    return await _montar_fornecedor(db, user.organization_id, fornecedor)


@router.delete("/fornecedores/{fornecedor_id}", status_code=204)
async def excluir_fornecedor(
    fornecedor_id: uuid.UUID,
    user: User = Depends(require_permission(Perm.FUEL_MANAGE, Perm.MAINTENANCE_MANAGE)),
    db: AsyncSession = Depends(get_db),
):
    from datetime import datetime, timezone

    fornecedor = (
        await db.execute(
            select(Fornecedor).where(
                Fornecedor.id == fornecedor_id,
                Fornecedor.organization_id == user.organization_id,
            )
        )
    ).scalar_one_or_none()
    if fornecedor is None:
        raise HTTPException(status_code=404, detail="Fornecedor não encontrado.")
    fornecedor.deleted_at = datetime.now(timezone.utc)
    await registrar_auditoria(
        db,
        organization_id=user.organization_id,
        acao="fornecedor.inativar",
        entidade="fornecedor",
        entidade_id=fornecedor.id,
        usuario_id=user.id,
    )
    await db.commit()


# ── Contratos com o posto (preço e saldo em litros) ─────────────────────────


async def _fornecedor_da_org(db: AsyncSession, organization_id: uuid.UUID, fornecedor_id: uuid.UUID) -> Fornecedor:
    fornecedor = (
        await db.execute(
            select(Fornecedor).where(
                Fornecedor.id == fornecedor_id,
                Fornecedor.organization_id == organization_id,
                Fornecedor.deleted_at.is_(None),
            )
        )
    ).scalar_one_or_none()
    if fornecedor is None:
        raise HTTPException(status_code=404, detail="Fornecedor não encontrado.")
    return fornecedor


async def _contrato_da_org(
    db: AsyncSession, organization_id: uuid.UUID, fornecedor_id: uuid.UUID, contrato_id: uuid.UUID
) -> ContratoPosto:
    contrato = (
        await db.execute(
            select(ContratoPosto).where(
                ContratoPosto.id == contrato_id,
                ContratoPosto.fornecedor_id == fornecedor_id,
                ContratoPosto.organization_id == organization_id,
                ContratoPosto.deleted_at.is_(None),
            )
        )
    ).scalar_one_or_none()
    if contrato is None:
        raise HTTPException(status_code=404, detail="Contrato não encontrado.")
    return contrato


def _validar_vigencia(data_inicio, data_fim) -> None:
    if data_inicio and data_fim and data_fim < data_inicio:
        raise HTTPException(status_code=422, detail="O fim da vigência é anterior ao início.")


async def _montar_contratos(db: AsyncSession, contratos: list[ContratoPosto]) -> list[ContratoPostoResponse]:
    consumidos = await litros_consumidos(db, [c.id for c in contratos])
    nomes = {}
    ids = {c.combustivel_id for c in contratos}
    if ids:
        nomes = dict(
            (await db.execute(select(Combustivel.id, Combustivel.nome).where(Combustivel.id.in_(ids)))).all()
        )
    respostas = []
    for c in contratos:
        consumido = consumidos.get(c.id, Decimal("0"))
        saldo = Decimal(c.litros_contratados) - consumido
        respostas.append(
            ContratoPostoResponse(
                id=c.id,
                fornecedor_id=c.fornecedor_id,
                combustivel_id=c.combustivel_id,
                combustivel_nome=nomes.get(c.combustivel_id),
                numero=c.numero,
                preco_litro=c.preco_litro,
                litros_contratados=c.litros_contratados,
                litros_consumidos=consumido,
                saldo_litros=saldo,
                saldo_valor=(saldo * Decimal(c.preco_litro)).quantize(Decimal("0.01")),
                data_inicio=c.data_inicio,
                data_fim=c.data_fim,
                ativo=c.ativo,
                observacoes=c.observacoes,
            )
        )
    return respostas


@router.get("/fornecedores/{fornecedor_id}/contratos", response_model=list[ContratoPostoResponse])
async def listar_contratos(
    fornecedor_id: uuid.UUID,
    user: User = Depends(require_permission(Perm.VEHICLE_VIEW)),
    db: AsyncSession = Depends(get_db),
):
    await _fornecedor_da_org(db, user.organization_id, fornecedor_id)
    contratos = (
        await db.execute(
            select(ContratoPosto)
            .where(
                ContratoPosto.organization_id == user.organization_id,
                ContratoPosto.fornecedor_id == fornecedor_id,
                ContratoPosto.deleted_at.is_(None),
            )
            .order_by(ContratoPosto.ativo.desc(), ContratoPosto.created_at.desc())
        )
    ).scalars().all()
    return await _montar_contratos(db, list(contratos))


@router.post(
    "/fornecedores/{fornecedor_id}/contratos", response_model=ContratoPostoResponse, status_code=201
)
async def criar_contrato(
    fornecedor_id: uuid.UUID,
    body: ContratoPostoCreate,
    user: User = Depends(require_permission(Perm.FUEL_MANAGE, Perm.CONTRACT_MANAGE)),
    db: AsyncSession = Depends(get_db),
):
    await _fornecedor_da_org(db, user.organization_id, fornecedor_id)
    combustivel = await db.get(Combustivel, body.combustivel_id)
    if combustivel is None or combustivel.organization_id != user.organization_id or combustivel.deleted_at:
        raise HTTPException(status_code=422, detail="Combustível inválido.")
    _validar_vigencia(body.data_inicio, body.data_fim)
    contrato = ContratoPosto(
        **body.model_dump(), organization_id=user.organization_id, fornecedor_id=fornecedor_id
    )
    db.add(contrato)
    await db.flush()
    await registrar_auditoria(
        db,
        organization_id=user.organization_id,
        acao="contrato_posto.criar",
        entidade="contrato_posto",
        entidade_id=contrato.id,
        usuario_id=user.id,
        dados_novos={
            "fornecedor": str(fornecedor_id),
            "combustivel": str(body.combustivel_id),
            "preco_litro": str(body.preco_litro),
            "litros_contratados": str(body.litros_contratados),
        },
    )
    await db.commit()
    return (await _montar_contratos(db, [contrato]))[0]


@router.patch(
    "/fornecedores/{fornecedor_id}/contratos/{contrato_id}", response_model=ContratoPostoResponse
)
async def atualizar_contrato(
    fornecedor_id: uuid.UUID,
    contrato_id: uuid.UUID,
    body: ContratoPostoUpdate,
    user: User = Depends(require_permission(Perm.FUEL_MANAGE, Perm.CONTRACT_MANAGE)),
    db: AsyncSession = Depends(get_db),
):
    contrato = await _contrato_da_org(db, user.organization_id, fornecedor_id, contrato_id)
    mudancas = body.model_dump(exclude_unset=True)
    anteriores = {k: str(getattr(contrato, k)) for k in mudancas}
    for campo, valor in mudancas.items():
        setattr(contrato, campo, valor)
    _validar_vigencia(contrato.data_inicio, contrato.data_fim)
    await registrar_auditoria(
        db,
        organization_id=user.organization_id,
        acao="contrato_posto.atualizar",
        entidade="contrato_posto",
        entidade_id=contrato.id,
        usuario_id=user.id,
        dados_anteriores=anteriores,
        dados_novos={k: str(v) for k, v in mudancas.items()},
    )
    await db.commit()
    return (await _montar_contratos(db, [contrato]))[0]


@router.delete("/fornecedores/{fornecedor_id}/contratos/{contrato_id}", status_code=204)
async def excluir_contrato(
    fornecedor_id: uuid.UUID,
    contrato_id: uuid.UUID,
    user: User = Depends(require_permission(Perm.FUEL_MANAGE, Perm.CONTRACT_MANAGE)),
    db: AsyncSession = Depends(get_db),
):
    from datetime import datetime, timezone

    contrato = await _contrato_da_org(db, user.organization_id, fornecedor_id, contrato_id)
    contrato.deleted_at = datetime.now(timezone.utc)
    await registrar_auditoria(
        db,
        organization_id=user.organization_id,
        acao="contrato_posto.excluir",
        entidade="contrato_posto",
        entidade_id=contrato.id,
        usuario_id=user.id,
    )
    await db.commit()


# ── Acessos ao portal do posto (Fase 7) ──────────────────────────────────────


import re as _re
import secrets as _secrets

from pydantic import BaseModel as _BaseModel
from pydantic import Field as _Field

_LOGIN_OK = _re.compile(r"^[a-z0-9._-]{4,60}$")
_ALFABETO = "abcdefghjkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789"


class AcessoFornecedorCreate(_BaseModel):
    nome: str = _Field(min_length=2, max_length=150)
    email: str | None = _Field(default=None, max_length=255)
    login: str = _Field(min_length=4, max_length=60)


def _senha_provisoria() -> str:
    return "".join(_secrets.choice(_ALFABETO) for _ in range(10))


def _acesso_json(a) -> dict:
    return {
        "id": str(a.id),
        "nome": a.nome,
        "email": a.email,
        "login": a.login,
        "bloqueado": a.bloqueado,
        "deve_trocar_senha": a.deve_trocar_senha,
        "ultimo_acesso": a.ultimo_acesso.isoformat() if a.ultimo_acesso else None,
        "criado_em": a.created_at.isoformat() if a.created_at else None,
    }


async def _acesso_do(db: AsyncSession, user: User, fornecedor_id: uuid.UUID, acesso_id: uuid.UUID):
    from app.models.acesso_fornecedor import AcessoFornecedor

    a = await db.scalar(
        select(AcessoFornecedor).where(
            AcessoFornecedor.id == acesso_id,
            AcessoFornecedor.fornecedor_id == fornecedor_id,
            AcessoFornecedor.organization_id == user.organization_id,
        )
    )
    if a is None:
        raise HTTPException(status_code=404, detail="Acesso não encontrado.")
    return a


@router.get("/fornecedores/{fornecedor_id}/acessos")
async def listar_acessos_portal(
    fornecedor_id: uuid.UUID,
    user: User = Depends(require_permission(Perm.FUEL_MANAGE, Perm.BILLING_MANAGE)),
    db: AsyncSession = Depends(get_db),
):
    from app.models.acesso_fornecedor import AcessoFornecedor

    await _fornecedor_da_org(db, user.organization_id, fornecedor_id)
    acessos = (
        await db.execute(
            select(AcessoFornecedor)
            .where(AcessoFornecedor.fornecedor_id == fornecedor_id, AcessoFornecedor.organization_id == user.organization_id)
            .order_by(AcessoFornecedor.nome)
        )
    ).scalars()
    return [_acesso_json(a) for a in acessos]


@router.post("/fornecedores/{fornecedor_id}/acessos", status_code=201)
async def criar_acesso_portal(
    fornecedor_id: uuid.UUID,
    body: AcessoFornecedorCreate,
    user: User = Depends(require_permission(Perm.FUEL_MANAGE, Perm.BILLING_MANAGE)),
    db: AsyncSession = Depends(get_db),
):
    """Cria o login do posto. A senha provisória é mostrada uma única vez."""
    from app.core.security import hash_secret
    from app.models.acesso_fornecedor import AcessoFornecedor

    fornecedor = await _fornecedor_da_org(db, user.organization_id, fornecedor_id)
    login = body.login.strip().lower()
    if not _LOGIN_OK.match(login):
        raise HTTPException(status_code=422, detail="Login: 4 a 60 caracteres, só letras, números, ponto, hífen e sublinhado.")
    if await db.scalar(select(AcessoFornecedor.id).where(AcessoFornecedor.login_normalized == login)):
        raise HTTPException(status_code=409, detail="Este login já está em uso. Escolha outro.")
    senha = _senha_provisoria()
    acesso = AcessoFornecedor(
        organization_id=user.organization_id, fornecedor_id=fornecedor.id, nome=body.nome.strip(),
        email=(body.email or "").strip() or None, login=login, login_normalized=login,
        senha_hash=hash_secret(senha), deve_trocar_senha=True, criado_por_id=user.id,
    )
    db.add(acesso)
    await db.flush()
    await registrar_auditoria(
        db, organization_id=user.organization_id, acao="fornecedor.acesso_criar", entidade="acesso_fornecedor",
        entidade_id=acesso.id, usuario_id=user.id,
        dados_novos={"fornecedor": str(fornecedor.id), "login": login, "nome": acesso.nome},
    )
    await db.commit()
    return {**_acesso_json(acesso), "senha_provisoria": senha}


@router.post("/fornecedores/{fornecedor_id}/acessos/{acesso_id}/redefinir-senha")
async def redefinir_senha_portal(
    fornecedor_id: uuid.UUID,
    acesso_id: uuid.UUID,
    user: User = Depends(require_permission(Perm.FUEL_MANAGE, Perm.BILLING_MANAGE)),
    db: AsyncSession = Depends(get_db),
):
    from app.core.security import hash_secret

    acesso = await _acesso_do(db, user, fornecedor_id, acesso_id)
    senha = _senha_provisoria()
    acesso.senha_hash = hash_secret(senha)
    acesso.deve_trocar_senha = True
    acesso.falhas_login = 0
    acesso.locked_until = None
    acesso.credential_version += 1
    await registrar_auditoria(
        db, organization_id=user.organization_id, acao="fornecedor.acesso_redefinir_senha",
        entidade="acesso_fornecedor", entidade_id=acesso.id, usuario_id=user.id,
    )
    await db.commit()
    return {**_acesso_json(acesso), "senha_provisoria": senha}


@router.post("/fornecedores/{fornecedor_id}/acessos/{acesso_id}/{acao}")
async def bloquear_acesso_portal(
    fornecedor_id: uuid.UUID,
    acesso_id: uuid.UUID,
    acao: str,
    user: User = Depends(require_permission(Perm.FUEL_MANAGE, Perm.BILLING_MANAGE)),
    db: AsyncSession = Depends(get_db),
):
    if acao not in ("bloquear", "desbloquear"):
        raise HTTPException(status_code=404, detail="Ação inválida.")
    acesso = await _acesso_do(db, user, fornecedor_id, acesso_id)
    acesso.bloqueado = acao == "bloquear"
    if acesso.bloqueado:
        acesso.credential_version += 1  # derruba a sessão aberta
    else:
        acesso.falhas_login = 0
        acesso.locked_until = None
    await registrar_auditoria(
        db, organization_id=user.organization_id, acao=f"fornecedor.acesso_{acao}",
        entidade="acesso_fornecedor", entidade_id=acesso.id, usuario_id=user.id,
    )
    await db.commit()
    return _acesso_json(acesso)
