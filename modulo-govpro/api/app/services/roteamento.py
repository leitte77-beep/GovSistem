"""Motor de regras de encaminhamento automático.

Avalia as regras ativas do tenant (maior prioridade vence) e resolve a unidade
de destino. Sem correspondência, o processo permanece na unidade protocolizadora
(Protocolo Central) para triagem humana — nunca fica sem destino.
"""

import uuid
from typing import Optional

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.andamento import Andamento
from app.models.enums import EstadoProcessoUnidade, TipoEvento
from app.models.processo import Processo, ProcessoUnidade
from app.models.roteamento import RegraEncaminhamento
from app.models.unidade import Unidade
from app.models.user import User
from app.services.auditoria import registrar

# Operadores suportados por campo. Valores comparados de forma case-insensitive
# em texto; UUIDs comparados pela representação string.
_OPERADORES_TEXTO = {"CONTEM", "NAO_CONTEM", "IGUAL", "DIFERENTE"}


def _normaliza(valor) -> str:
    return str(valor).strip().lower() if valor is not None else ""


def _avaliar_condicao(condicao: dict, contexto: dict) -> bool:
    campo = condicao.get("campo")
    operador = (condicao.get("operador") or "IGUAL").upper()
    valor = condicao.get("valor")

    if campo not in contexto:
        return False

    atual = _normaliza(contexto.get(campo))
    esperado = _normaliza(valor)

    if operador == "CONTEM":
        return esperado in atual
    if operador == "NAO_CONTEM":
        return esperado not in atual
    if operador == "IGUAL":
        return atual == esperado
    if operador == "DIFERENTE":
        return atual != esperado
    return False


def _regra_atende(regra: RegraEncaminhamento, contexto: dict) -> bool:
    if regra.tipo_processo_id is not None:
        tipo_ctx = contexto.get("tipo_processo_id")
        if tipo_ctx is None or str(regra.tipo_processo_id) != str(tipo_ctx):
            return False
    return all(_avaliar_condicao(c, contexto) for c in (regra.condicoes or []))


async def _regras_ativas(db: AsyncSession, tenant_id: uuid.UUID) -> list[RegraEncaminhamento]:
    result = await db.execute(
        select(RegraEncaminhamento)
        .where(
            RegraEncaminhamento.tenant_id == tenant_id,
            RegraEncaminhamento.ativa.is_(True),
            RegraEncaminhamento.deleted_at.is_(None),
        )
        .order_by(RegraEncaminhamento.prioridade.desc(), RegraEncaminhamento.created_at)
    )
    return list(result.scalars())


async def resolver_destino(
    db: AsyncSession,
    tenant_id: uuid.UUID,
    *,
    tipo_processo_id: Optional[uuid.UUID],
    especificacao: Optional[str] = None,
    nivel_acesso: Optional[str] = None,
    classe_id: Optional[uuid.UUID] = None,
) -> Optional[Unidade]:
    contexto = {
        "tipo_processo_id": str(tipo_processo_id) if tipo_processo_id else None,
        "especificacao": especificacao or "",
        "nivel_acesso": nivel_acesso or "",
        "classe_id": str(classe_id) if classe_id else None,
    }
    for regra in await _regras_ativas(db, tenant_id):
        if _regra_atende(regra, contexto):
            unidade = await db.get(Unidade, regra.unidade_destino_id)
            if unidade is not None and unidade.tenant_id == tenant_id:
                return unidade
    return None


async def _unidade_protocolo_central(db: AsyncSession, tenant_id: uuid.UUID) -> Optional[Unidade]:
    result = await db.execute(
        select(Unidade)
        .where(Unidade.tenant_id == tenant_id, Unidade.protocolizadora.is_(True))
        .order_by(Unidade.created_at)
        .limit(1)
    )
    return result.scalar_one_or_none()


async def rotear_automaticamente(
    db: AsyncSession,
    tenant_id: uuid.UUID,
    processo: Processo,
    *,
    destino_explicito_id: Optional[uuid.UUID] = None,
    user: Optional[User] = None,
    client: Optional[dict] = None,
) -> Optional[Unidade]:
    """Aplica regras (ou destino explícito) e cria a tramitação/andamento.

    Retorna a unidade de destino final. Se não houver regra nem destino
    explícito, retorna o Protocolo Central (triagem) sem criar tramitação
    adicional — o processo já está nessa unidade ao autuar.
    """
    destino: Optional[Unidade] = None
    origem: Optional[str] = "regra"

    if destino_explicito_id is not None:
        destino = await db.get(Unidade, destino_explicito_id)
        origem = "explicito"
    else:
        destino = await resolver_destino(
            db,
            tenant_id,
            tipo_processo_id=processo.tipo_processo_id,
            especificacao=processo.especificacao,
            nivel_acesso=processo.nivel_acesso,
            classe_id=processo.classe_id,
        )

    if destino is None:
        destino = await _unidade_protocolo_central(db, tenant_id)
        if destino is None:
            return None
        db.add(
            Andamento(
                tenant_id=tenant_id,
                processo_id=processo.id,
                tipo_evento=TipoEvento.OUTRO.value,
                descricao="Sem regra de encaminhamento aplicável — aguardando triagem.",
                unidade_id=destino.id,
                usuario_id=user.id if user else None,
            )
        )
        return destino

    if processo.unidade_protocolizadora_id == destino.id:
        return destino

    db.add(
        ProcessoUnidade(
            tenant_id=tenant_id,
            processo_id=processo.id,
            unidade_id=destino.id,
            estado=EstadoProcessoUnidade.RECEBIDO.value,
        )
    )
    db.add(
        Andamento(
            tenant_id=tenant_id,
            processo_id=processo.id,
            tipo_evento=TipoEvento.TRAMITACAO.value,
            descricao=f"Encaminhamento automático para {destino.sigla} ({origem}).",
            unidade_id=processo.unidade_protocolizadora_id,
            usuario_id=user.id if user else None,
        )
    )
    await registrar(
        db,
        tenant_id=tenant_id,
        action="TRAMITACAO",
        entity="roteamento",
        entity_id=str(processo.id),
        actor_user_id=user.id if user else None,
        actor_tipo="SISTEMA" if user is None else "INTERNO",
        processo_id=processo.id,
        nup=processo.nup,
        ip_address=client.get("ip_address") if client else None,
        user_agent=client.get("user_agent") if client else None,
        detalhe={"destino": str(destino.id), "origem": origem},
    )
    return destino
