"""Validação pública de autenticidade (sem login).

Recebe código verificador + CRC e confirma a integridade por hash. Para
documentos sigilosos confirma apenas autenticidade, sem revelar conteúdo.
"""

from typing import Optional

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.documento import Documento
from app.models.enums import NivelAcesso


def crc_do_documento(documento: Documento) -> Optional[str]:
    if not documento.hash_conteudo:
        return None
    return documento.hash_conteudo[:8]


async def validar_por_codigo(
    db: AsyncSession,
    codigo: str,
    crc: str,
) -> Optional[dict]:
    result = await db.execute(select(Documento).where(Documento.codigo_verificador == codigo))
    documento = result.scalars().all()
    if not documento:
        return None
    documento = documento[0]

    esperado = crc_do_documento(documento)
    valido = esperado is not None and esperado.lower() == (crc or "").lower()

    resultado = {
        "valido": valido,
        "codigo_verificador": codigo,
        "nivel_acesso": documento.nivel_acesso,
    }

    # Confirmar autenticidade sem revelar conteúdo para sigiloso (LAI).
    if documento.nivel_acesso == NivelAcesso.PUBLICO.value:
        resultado["titulo"] = documento.titulo
        resultado["hash"] = documento.hash_conteudo
        resultado["assinado_em"] = (
            documento.assinado_em.isoformat() if documento.assinado_em else None
        )

    return resultado
