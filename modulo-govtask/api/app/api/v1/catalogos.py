"""Catálogos configuráveis para a interface (§4, §5, §151).

Os itens do sistema (`organization_id` nulo) aparecem junto com os do tenant.
Serve para montar seletores — tipo, status, categoria — sem o frontend
codificar rótulos.
"""

from fastapi import APIRouter, Depends
from sqlalchemy import or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.auth import require_permission
from app.core.database import get_db
from app.core.permissions import Perm
from app.models.catalogo import CategoriaDemanda, StatusDemanda, TipoDemanda
from app.models.user import User

router = APIRouter(prefix="/catalogos", tags=["Catálogos"])


@router.get("/demandas")
async def catalogos_demandas(
    db: AsyncSession = Depends(get_db),
    user: User = Depends(require_permission(Perm.RESOURCE_VIEW)),
):
    async def _itens(modelo):
        stmt = (
            select(modelo)
            .where(
                or_(
                    modelo.organization_id == user.organization_id,
                    modelo.organization_id.is_(None),
                ),
                modelo.ativo.is_(True),
                modelo.deleted_at.is_(None),
            )
            .order_by(modelo.ordem, modelo.rotulo)
        )
        return (await db.execute(stmt)).scalars().all()

    def _serializar(item):
        dados = {
            "id": str(item.id),
            "chave": item.chave,
            "rotulo": item.rotulo,
            "cor": item.cor,
            "is_system": item.is_system,
        }
        # Só status tem ciclo de vida; a interface usa isto para saber quais
        # colunas do Kanban aceitam arrastar (§51).
        if isinstance(item, StatusDemanda):
            dados.update(
                is_inicial=item.is_inicial,
                is_final=item.is_final,
                is_aguardando_externo=item.is_aguardando_externo,
            )
        return dados

    return {
        "tipos": [_serializar(t) for t in await _itens(TipoDemanda)],
        "categorias": [_serializar(c) for c in await _itens(CategoriaDemanda)],
        "status": [_serializar(s) for s in await _itens(StatusDemanda)],
    }
