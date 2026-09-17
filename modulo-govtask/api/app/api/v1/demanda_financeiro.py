"""Acompanhamento financeiro gerencial da Demanda (§59, §60, §61).

Os totais da demanda (`valor_empenhado`, `valor_pago`, ...) são **derivados**
dos lançamentos, não digitados. Isso evita o caso clássico em que o card mostra
R$ 300.000 pagos e a aba de lançamentos soma R$ 180.000.

Ler valores exige `financial.view`; lançar exige `financial.manage`. Um servidor
que só executa tarefas não vê o dinheiro da demanda.
"""

import uuid
from datetime import date, datetime, timezone
from decimal import Decimal

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, ConfigDict, Field
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.auth import get_user_permissions, require_permission
from app.core.database import get_db
from app.core.permissions import Perm
from app.models.anexo import Anexo
from app.models.demanda import Demanda
from app.models.demanda_financeiro import RegistroFinanceiroDemanda
from app.models.enums import TipoEvento, TipoRegistroFinanceiro
from app.models.user import User
from app.services.demandas import get_demanda_ou_404, marcar_movimentacao
from app.services.timeline import registrar_evento

router = APIRouter(tags=["Financeiro da demanda"])

# De qual tipo de lançamento sai cada total consolidado da demanda.
TOTAIS = {
    "valor_aprovado": (TipoRegistroFinanceiro.APROVACAO,),
    "valor_contrapartida": (TipoRegistroFinanceiro.CONTRAPARTIDA,),
    "valor_licitado": (TipoRegistroFinanceiro.LICITADO,),
    "valor_contratado": (TipoRegistroFinanceiro.CONTRATADO,),
    "valor_empenhado": (TipoRegistroFinanceiro.EMPENHO,),
    "valor_liquidado": (TipoRegistroFinanceiro.LIQUIDACAO,),
    "valor_pago": (TipoRegistroFinanceiro.PAGAMENTO,),
}


class RegistroIn(BaseModel):
    tipo: TipoRegistroFinanceiro
    valor: Decimal = Field(gt=0, max_digits=15, decimal_places=2)
    data_registro: date
    numero_documento: str | None = Field(default=None, max_length=120)
    fonte_recurso: str | None = Field(default=None, max_length=40)
    favorecido: str | None = Field(default=None, max_length=255)
    descricao: str | None = None
    documento_id: uuid.UUID | None = None


class RegistroOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    demanda_id: uuid.UUID
    tipo: TipoRegistroFinanceiro
    valor: Decimal
    data_registro: date
    numero_documento: str | None
    fonte_recurso: str | None
    favorecido: str | None
    descricao: str | None
    documento_id: uuid.UUID | None
    registrado_por_id: uuid.UUID


async def _recalcular(db: AsyncSession, demanda: Demanda) -> None:
    """Refaz os totais da demanda a partir dos lançamentos vivos.

    Recalcular tudo (em vez de somar o delta) é o que mantém os totais corretos
    depois de uma exclusão lógica ou de uma correção de valor.
    """
    registros = (
        (
            await db.execute(
                select(RegistroFinanceiroDemanda).where(
                    RegistroFinanceiroDemanda.demanda_id == demanda.id,
                    RegistroFinanceiroDemanda.deleted_at.is_(None),
                )
            )
        )
        .scalars()
        .all()
    )
    for campo, tipos in TOTAIS.items():
        total = sum(
            (r.valor for r in registros if r.tipo in {t.value for t in tipos}),
            Decimal(0),
        )
        # Sem lançamento daquele tipo, o campo volta a ser desconhecido (None) em
        # vez de virar zero: "nada empenhado" e "não sabemos" são diferentes.
        setattr(demanda, campo, total if total else None)
    # Executado é o que efetivamente saiu do caixa para o objeto.
    demanda.valor_executado = demanda.valor_pago


@router.get("/demandas/{demanda_id}/financeiro")
async def resumo(
    demanda_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(require_permission(Perm.FINANCIAL_VIEW)),
):
    demanda = await get_demanda_ou_404(db, demanda_id, user, get_user_permissions(user))
    registros = (
        (
            await db.execute(
                select(RegistroFinanceiroDemanda)
                .where(
                    RegistroFinanceiroDemanda.demanda_id == demanda.id,
                    RegistroFinanceiroDemanda.deleted_at.is_(None),
                )
                .order_by(RegistroFinanceiroDemanda.data_registro.desc())
            )
        )
        .scalars()
        .all()
    )
    por_tipo: dict[str, float] = {}
    for r in registros:
        chave = r.tipo.value if hasattr(r.tipo, "value") else str(r.tipo)
        por_tipo[chave] = por_tipo.get(chave, 0.0) + float(r.valor)

    def v(campo: str) -> float | None:
        valor = getattr(demanda, campo)
        return float(valor) if valor is not None else None

    return {
        "demanda_id": str(demanda.id),
        "numero": demanda.numero,
        "fonte_recurso": demanda.fonte_recurso,
        "esfera": demanda.esfera,
        "orgao_concedente": demanda.orgao_concedente,
        "valor_previsto": v("valor_previsto"),
        "valor_aprovado": v("valor_aprovado"),
        "valor_contrapartida": v("valor_contrapartida"),
        "valor_licitado": v("valor_licitado"),
        "valor_contratado": v("valor_contratado"),
        "valor_empenhado": v("valor_empenhado"),
        "valor_liquidado": v("valor_liquidado"),
        "valor_pago": v("valor_pago"),
        "valor_executado": v("valor_executado"),
        "saldo": float(demanda.saldo_financeiro),
        "por_tipo": por_tipo,
        "registros": [RegistroOut.model_validate(r) for r in registros],
    }


@router.post(
    "/demandas/{demanda_id}/financeiro", response_model=RegistroOut, status_code=201
)
async def lancar(
    demanda_id: uuid.UUID,
    payload: RegistroIn,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(require_permission(Perm.FINANCIAL_MANAGE)),
):
    demanda = await get_demanda_ou_404(db, demanda_id, user, get_user_permissions(user))

    if payload.documento_id is not None:
        # O comprovante tem de ser documento desta demanda; aceitar qualquer id
        # de anexo permitiria referenciar arquivo de outra demanda do tenant.
        pertence = (
            await db.execute(
                select(Anexo.id).where(
                    Anexo.id == payload.documento_id,
                    Anexo.demanda_id == demanda.id,
                    Anexo.deleted_at.is_(None),
                )
            )
        ).scalar_one_or_none()
        if pertence is None:
            raise HTTPException(404, "Documento não encontrado nesta demanda")

    registro = RegistroFinanceiroDemanda(
        organization_id=user.organization_id,
        demanda_id=demanda.id,
        registrado_por_id=user.id,
        **payload.model_dump(),
    )
    db.add(registro)
    await db.flush()
    await _recalcular(db, demanda)
    await marcar_movimentacao(demanda)
    await registrar_evento(
        db,
        TipoEvento.REGISTRO_FINANCEIRO_LANCADO,
        user.id,
        f"{payload.tipo.value} de R$ {payload.valor} registrado",
        demanda_id=demanda.id,
        metadados={
            "registro_id": str(registro.id),
            "tipo": payload.tipo.value,
            "valor": str(payload.valor),
            "numero_documento": payload.numero_documento,
        },
    )
    await db.commit()
    await db.refresh(registro)
    return registro


@router.delete("/demandas/{demanda_id}/financeiro/{registro_id}", status_code=204)
async def estornar(
    demanda_id: uuid.UUID,
    registro_id: uuid.UUID,
    motivo: str,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(require_permission(Perm.FINANCIAL_MANAGE)),
):
    """Exclusão lógica com motivo; os totais são recalculados na sequência."""
    demanda = await get_demanda_ou_404(db, demanda_id, user, get_user_permissions(user))
    if len(motivo.strip()) < 5:
        raise HTTPException(422, "Informe o motivo do estorno")
    registro = (
        await db.execute(
            select(RegistroFinanceiroDemanda).where(
                RegistroFinanceiroDemanda.id == registro_id,
                RegistroFinanceiroDemanda.demanda_id == demanda.id,
                RegistroFinanceiroDemanda.deleted_at.is_(None),
            )
        )
    ).scalar_one_or_none()
    if registro is None:
        raise HTTPException(404, "Lançamento não encontrado")
    registro.deleted_at = datetime.now(timezone.utc)
    await db.flush()
    await _recalcular(db, demanda)
    await registrar_evento(
        db,
        TipoEvento.REGISTRO_FINANCEIRO_REMOVIDO,
        user.id,
        f"Lançamento de R$ {registro.valor} estornado: {motivo}",
        demanda_id=demanda.id,
        metadados={"registro_id": str(registro.id), "motivo": motivo},
    )
    await db.commit()
