"""Busca global do GovInfra (item 49).

Pesquisa tolerante a maiúsculas, acentos e pontuação em pessoas, imóveis,
solicitações, ordens, caçambas, máquinas, veículos e servidores. Os resultados
chegam agrupados por categoria, cada um com o link da rota correspondente.
"""


from fastapi import APIRouter, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.auth import exigir
from app.core.database import get_db
from app.core.errors import AppError
from app.core.permissoes import P
from app.models.organizacao import User
from app.services.busca import buscar

router = APIRouter(prefix="/busca", tags=["Busca"])


@router.get("", summary="Busca global")
async def busca_global(
    termo: str = Query(..., min_length=2, max_length=120),
    limite: int = Query(8, ge=1, le=20),
    db: AsyncSession = Depends(get_db),
    user: User = Depends(exigir(P.BUSCA_GLOBAL)),
):
    if not termo.strip():
        raise AppError("Informe o que deseja buscar.", 422, "termo_vazio")
    resultados = await buscar(db, user.organizacao_id, termo.strip(), limite=limite)
    return {
        "termo": termo.strip(),
        "total": sum(len(grupo.get("itens", [])) for grupo in resultados),
        "categorias": resultados,
    }
