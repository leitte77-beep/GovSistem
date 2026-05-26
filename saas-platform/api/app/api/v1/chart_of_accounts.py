import uuid
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.auth import get_current_platform_admin
from app.core.database import get_db
from app.models.chart_of_account import ChartOfAccount
from app.models.user import User

router = APIRouter(prefix="/chart-of-accounts", tags=["chart-of-accounts"])


class AccountCreate(BaseModel):
    code: str
    name: str
    account_type: str
    nature: str
    parent_id: Optional[str] = None
    accepts_manual_entry: bool = True


class AccountUpdate(BaseModel):
    code: Optional[str] = None
    name: Optional[str] = None
    account_type: Optional[str] = None
    nature: Optional[str] = None
    parent_id: Optional[str] = None
    accepts_manual_entry: Optional[bool] = None
    is_active: Optional[bool] = None


class AccountResponse(BaseModel):
    id: uuid.UUID
    code: str
    name: str
    account_type: str
    nature: str
    parent_id: Optional[uuid.UUID] = None
    accepts_manual_entry: bool = True
    is_system: bool = False
    is_active: bool = True

    model_config = {"from_attributes": True}


class PaginatedAccounts(BaseModel):
    data: list[AccountResponse]
    total: int


ACCOUNT_TYPES = [
    {"code": "1", "name": "Ativo", "type": "asset", "nature": "debit", "children": [
        {"code": "1.1", "name": "Ativo Circulante", "type": "asset", "nature": "debit", "children": [
            {"code": "1.1.1", "name": "Caixa e Equivalentes", "type": "asset", "nature": "debit"},
            {"code": "1.1.2", "name": "Bancos", "type": "asset", "nature": "debit"},
            {"code": "1.1.3", "name": "Conta Asaas", "type": "asset", "nature": "debit"},
            {"code": "1.1.4", "name": "Contas a Receber", "type": "asset", "nature": "debit"},
            {"code": "1.1.5", "name": "Pix a Compensar", "type": "asset", "nature": "debit"},
            {"code": "1.1.6", "name": "Cartoes a Receber", "type": "asset", "nature": "debit"},
        ]},
        {"code": "1.2", "name": "Ativo Nao Circulante", "type": "asset", "nature": "debit", "children": [
            {"code": "1.2.1", "name": "Imobilizado", "type": "asset", "nature": "debit"},
            {"code": "1.2.2", "name": "Intangivel", "type": "asset", "nature": "debit"},
        ]},
    ]},
    {"code": "2", "name": "Passivo", "type": "liability", "nature": "credit", "children": [
        {"code": "2.1", "name": "Passivo Circulante", "type": "liability", "nature": "credit", "children": [
            {"code": "2.1.1", "name": "Contas a Pagar", "type": "liability", "nature": "credit"},
            {"code": "2.1.2", "name": "Fornecedores", "type": "liability", "nature": "credit"},
            {"code": "2.1.3", "name": "Impostos a Recolher", "type": "liability", "nature": "credit"},
            {"code": "2.1.4", "name": "Obrigacoes com Clientes", "type": "liability", "nature": "credit"},
        ]},
        {"code": "2.2", "name": "Passivo Nao Circulante", "type": "liability", "nature": "credit"},
        {"code": "2.3", "name": "Patrimonio Liquido", "type": "equity", "nature": "credit", "children": [
            {"code": "2.3.1", "name": "Capital Social", "type": "equity", "nature": "credit"},
            {"code": "2.3.2", "name": "Lucros Acumulados", "type": "equity", "nature": "credit"},
        ]},
    ]},
    {"code": "3", "name": "Receita", "type": "revenue", "nature": "credit", "children": [
        {"code": "3.1", "name": "Receita de Assinaturas", "type": "revenue", "nature": "credit"},
        {"code": "3.1.1", "name": "Plano Basico", "type": "revenue", "nature": "credit"},
        {"code": "3.1.2", "name": "Plano Profissional", "type": "revenue", "nature": "credit"},
        {"code": "3.1.3", "name": "Plano Enterprise", "type": "revenue", "nature": "credit"},
        {"code": "3.2", "name": "Receita de Servicos", "type": "revenue", "nature": "credit"},
        {"code": "3.3", "name": "Juros Recebidos", "type": "revenue", "nature": "credit"},
        {"code": "3.4", "name": "Multas Recebidas", "type": "revenue", "nature": "credit"},
    ]},
    {"code": "4", "name": "Deducoes da Receita", "type": "deduction", "nature": "debit", "children": [
        {"code": "4.1", "name": "Descontos Concedidos", "type": "deduction", "nature": "debit"},
        {"code": "4.2", "name": "Cancelamentos", "type": "deduction", "nature": "debit"},
        {"code": "4.3", "name": "Reembolsos", "type": "deduction", "nature": "debit"},
        {"code": "4.4", "name": "Chargebacks", "type": "deduction", "nature": "debit"},
        {"code": "4.5", "name": "Impostos sobre Receita", "type": "deduction", "nature": "debit"},
    ]},
    {"code": "5", "name": "Despesas", "type": "expense", "nature": "debit", "children": [
        {"code": "5.1", "name": "Despesas Operacionais", "type": "expense", "nature": "debit", "children": [
            {"code": "5.1.1", "name": "Taxas de Gateway", "type": "expense", "nature": "debit"},
            {"code": "5.1.2", "name": "Tarifas Bancarias", "type": "expense", "nature": "debit"},
            {"code": "5.1.3", "name": "Infraestrutura", "type": "expense", "nature": "debit"},
            {"code": "5.1.4", "name": "Marketing", "type": "expense", "nature": "debit"},
        ]},
        {"code": "5.2", "name": "Despesas Administrativas", "type": "expense", "nature": "debit", "children": [
            {"code": "5.2.1", "name": "Administrativo", "type": "expense", "nature": "debit"},
            {"code": "5.2.2", "name": "Contabilidade", "type": "expense", "nature": "debit"},
            {"code": "5.2.3", "name": "Juridico", "type": "expense", "nature": "debit"},
        ]},
        {"code": "5.3", "name": "Impostos e Taxas", "type": "expense", "nature": "debit"},
    ]},
]


DEFAULT_ACCOUNTS: list[dict] = []


def _flatten(tree: list[dict], parent_code: str | None = None):
    for node in tree:
        children = node.pop("children", [])
        node["parent_code"] = parent_code
        DEFAULT_ACCOUNTS.append(node)
        if children:
            _flatten(children, node["code"])


_flatten(ACCOUNT_TYPES)


@router.post("/seed", status_code=201)
async def seed_chart_of_accounts(
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_platform_admin),
):
    existing = await db.execute(
        select(func.count(ChartOfAccount.id)).where(
            ChartOfAccount.organization_id == user.organization_id
        )
    )
    if existing.scalar() and existing.scalar() > 0:
        raise HTTPException(status_code=400, detail="Plano de contas ja existe para esta organizacao")

    code_to_id: dict[str, uuid.UUID] = {}
    created = []

    for acc in DEFAULT_ACCOUNTS:
        parent_id = code_to_id.get(acc["parent_code"]) if acc.get("parent_code") else None
        obj = ChartOfAccount(
            organization_id=user.organization_id,
            code=acc["code"],
            name=acc["name"],
            account_type=acc["type"],
            nature=acc["nature"],
            parent_id=parent_id,
            is_system=True,
            accepts_manual_entry=False,
        )
        db.add(obj)
        await db.flush()
        code_to_id[acc["code"]] = obj.id
        created.append(obj)

    await db.commit()
    for obj in created:
        await db.refresh(obj)

    return {"message": f"Plano de contas criado com {len(created)} contas", "count": len(created)}


@router.get("", response_model=PaginatedAccounts)
async def list_accounts(
    account_type: Optional[str] = Query(None, alias="type"),
    search: Optional[str] = Query(None),
    db: AsyncSession = Depends(get_db),
    _: User = Depends(get_current_platform_admin),
):
    query = select(ChartOfAccount)
    count_query = select(func.count(ChartOfAccount.id))

    if account_type:
        query = query.where(ChartOfAccount.account_type == account_type)
        count_query = count_query.where(ChartOfAccount.account_type == account_type)
    if search:
        pattern = f"%{search}%"
        query = query.where(
            ChartOfAccount.name.ilike(pattern) | ChartOfAccount.code.ilike(pattern)
        )
        count_query = count_query.where(
            ChartOfAccount.name.ilike(pattern) | ChartOfAccount.code.ilike(pattern)
        )

    total = await db.scalar(count_query) or 0
    result = await db.execute(query.order_by(ChartOfAccount.code))
    items = result.scalars().all()

    return PaginatedAccounts(
        data=[AccountResponse.model_validate(a) for a in items],
        total=total,
    )


@router.get("/{account_id}", response_model=AccountResponse)
async def get_account(
    account_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    _: User = Depends(get_current_platform_admin),
):
    result = await db.execute(select(ChartOfAccount).where(ChartOfAccount.id == account_id))
    account = result.scalar_one_or_none()
    if not account:
        raise HTTPException(status_code=404, detail="Conta contabil nao encontrada")
    return AccountResponse.model_validate(account)


@router.post("", response_model=AccountResponse, status_code=201)
async def create_account(
    body: AccountCreate,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_platform_admin),
):
    parent_id = uuid.UUID(body.parent_id) if body.parent_id else None
    account = ChartOfAccount(
        organization_id=user.organization_id,
        code=body.code,
        name=body.name,
        account_type=body.account_type,
        nature=body.nature,
        parent_id=parent_id,
        accepts_manual_entry=body.accepts_manual_entry,
    )
    db.add(account)
    await db.commit()
    await db.refresh(account)
    return AccountResponse.model_validate(account)


@router.put("/{account_id}", response_model=AccountResponse)
async def update_account(
    account_id: uuid.UUID,
    body: AccountUpdate,
    db: AsyncSession = Depends(get_db),
    _: User = Depends(get_current_platform_admin),
):
    result = await db.execute(select(ChartOfAccount).where(ChartOfAccount.id == account_id))
    account = result.scalar_one_or_none()
    if not account:
        raise HTTPException(status_code=404, detail="Conta contabil nao encontrada")
    if account.is_system:
        raise HTTPException(status_code=400, detail="Contas de sistema nao podem ser alteradas")

    update_data = body.model_dump(exclude_unset=True)
    if "parent_id" in update_data and update_data["parent_id"]:
        update_data["parent_id"] = uuid.UUID(update_data["parent_id"])

    for field, value in update_data.items():
        setattr(account, field, value)

    await db.commit()
    await db.refresh(account)
    return AccountResponse.model_validate(account)
