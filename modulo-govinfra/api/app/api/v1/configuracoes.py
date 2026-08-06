"""Configurações administrativas do GovInfra (item 48).

Tela de leitura/edição das configurações operacionais. Cada alteração é
auditada; nada de limite importante fixado no código.
"""


from fastapi import APIRouter, Depends, Query, Request
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.v1.deps import cliente
from app.core.auth import exigir
from app.core.database import get_db
from app.core.permissoes import P
from app.models.enums import AcaoAuditoria
from app.models.governanca import Configuracao
from app.models.organizacao import User
from app.services import auditoria
from app.services.configuracoes import CATALOGO, definir

router = APIRouter(prefix="/configuracoes", tags=["Configurações"])


def _serializar(registro: Configuracao) -> dict:
    return {
        "id": registro.id,
        "area": registro.area,
        "chave": registro.chave,
        "valor": (registro.valor or {}).get("valor"),
        "tipo": registro.tipo,
        "rotulo": registro.rotulo,
        "descricao": registro.descricao,
        "editavel": registro.editavel,
        "alterada_em": registro.updated_at,
    }


@router.get("", summary="Listar configurações (agrupadas por área)")
async def listar(
    area: str | None = Query(None, description="Filtra por área: cacambas, porteira, combustivel, geral"),
    db: AsyncSession = Depends(get_db),
    user: User = Depends(exigir(P.CONFIGURACOES_VISUALIZAR)),
):
    from app.services.configuracoes import garantir_configuracoes_padrao

    await garantir_configuracoes_padrao(db, user.organizacao_id)
    await db.commit()

    condicoes = [Configuracao.organizacao_id == user.organizacao_id]
    if area:
        condicoes.append(Configuracao.area == area)
    registros = (
        await db.execute(
            select(Configuracao).where(*condicoes).order_by(Configuracao.area, Configuracao.chave)
        )
    ).scalars().all()

    agrupadas: dict[str, list[dict]] = {}
    for registro in registros:
        agrupadas.setdefault(registro.area, []).append(_serializar(registro))
    return {"areas": [{"area": chave, "configuracoes": itens} for chave, itens in agrupadas.items()]}


class ConfiguracaoEntrada(BaseModel):
    valor: object
    justificativa: str | None = None


@router.put("/{chave}", summary="Alterar uma configuração")
async def atualizar(
    chave: str,
    dados: ConfiguracaoEntrada,
    request: Request,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(exigir(P.CONFIGURACOES_EDITAR)),
):
    registro, anterior = await definir(
        db, user.organizacao_id, chave, dados.valor, usuario_id=user.id
    )
    await auditoria.registrar(
        db,
        acao=AcaoAuditoria.ALTERAR_CONFIGURACAO,
        usuario=user,
        entidade="configuracao",
        entidade_id=registro.id,
        entidade_descricao=f"{registro.rotulo} ({chave})",
        organizacao_id=user.organizacao_id,
        justificativa=dados.justificativa,
        dados_antes={"valor": anterior},
        dados_depois={"valor": dados.valor},
        cliente=cliente(request),
    )
    await db.commit()
    return _serializar(registro)


@router.get("/catalogo", summary="Catálogo das configurações disponíveis")
async def catalogo(
    db: AsyncSession = Depends(get_db),
    user: User = Depends(exigir(P.CONFIGURACOES_VISUALIZAR)),
):
    return {
        "configuracoes": [
            {"area": area, "chave": chave, "padrao": valor, "tipo": tipo,
             "rotulo": rotulo, "descricao": descricao}
            for area, chave, valor, tipo, rotulo, descricao in CATALOGO
        ]
    }
