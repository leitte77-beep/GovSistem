"""Renderização de modelos de documento e textos padrão com variáveis.

Sintaxe: ``{{chave.subchave}}`` (mesma usada nos seeds). As chaves resolvem
contra o contexto do processo (NUP, especificação, interessado, unidade, data).
Chaves desconhecidas viram string vazia — nunca quebra a renderização.
"""

import re
from datetime import datetime
from typing import Any, Dict, Optional

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.interessado import Interessado
from app.models.processo import Processo
from app.models.unidade import Unidade

_VAR_RE = re.compile(r"\{\{\s*([a-zA-Z0-9_.]+)\s*\}\}")

_MESES = [
    "janeiro", "fevereiro", "março", "abril", "maio", "junho",
    "julho", "agosto", "setembro", "outubro", "novembro", "dezembro",
]


def data_extenso(dt: datetime) -> str:
    return f"{dt.day} de {_MESES[dt.month - 1]} de {dt.year}"


def _resolve(contexto: Dict[str, Any], path: str) -> Any:
    atual: Any = contexto
    for parte in path.split("."):
        if atual is None:
            return None
        if isinstance(atual, dict):
            atual = atual.get(parte)
        else:
            atual = getattr(atual, parte, None)
    return atual


def render_conteudo(template: Optional[str], contexto: Dict[str, Any]) -> str:
    """Substitui ``{{var}}`` pelos valores do contexto (chave ausente → vazio)."""
    if not template:
        return ""

    def _sub(match: "re.Match[str]") -> str:
        valor = _resolve(contexto, match.group(1))
        return "" if valor is None else str(valor)

    return _VAR_RE.sub(_sub, template)


async def construir_contexto_processo(
    db: AsyncSession, tenant_id, processo_id
) -> Dict[str, Any]:
    """Monta o contexto de renderização a partir do processo no banco."""
    processo = await db.get(Processo, processo_id)
    if processo is None or processo.tenant_id != tenant_id:
        from fastapi import HTTPException, status

        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Processo não encontrado"
        )

    interessado: Optional[Interessado] = None
    result = await db.execute(
        select(Interessado)
        .where(Interessado.processo_id == processo.id)
        .order_by(Interessado.created_at)
        .limit(1)
    )
    interessado = result.scalar_one_or_none()

    unidade: Optional[Unidade] = None
    if processo.unidade_protocolizadora_id:
        unidade = await db.get(Unidade, processo.unidade_protocolizadora_id)

    agora = datetime.now()
    return {
        "processo": {
            "nup": processo.nup,
            "especificacao": processo.especificacao,
            "numero_antigo": processo.numero_antigo or "",
        },
        "interessado": {
            "nome": interessado.nome if interessado else "",
            "cpf_cnpj": (interessado.cpf_cnpj or "") if interessado else "",
        },
        "unidade": {
            "sigla": unidade.sigla if unidade else "",
            "nome": unidade.nome if unidade else "",
        },
        "hoje": agora.strftime("%d/%m/%Y"),
        "data_extenso": data_extenso(agora),
    }
