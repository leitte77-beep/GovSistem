"""Dashboard e busca global (seções 5-6, 68, 135-137)."""


from fastapi import APIRouter, Depends
from sqlalchemy import or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.auth import exigir
from app.core.database import get_db
from app.core.permissoes import P
from app.models.compras import Fornecedor
from app.models.contrato import Contrato
from app.models.organizacao import User
from app.models.processo import ProcessoInstancia
from app.schemas.governanca import DashboardOut
from app.services import dashboard as dashboard_service

router = APIRouter(tags=["Dashboard e Busca"])


@router.get("/dashboard/indicadores", response_model=DashboardOut)
async def indicadores(db: AsyncSession = Depends(get_db), user: User = Depends(exigir(P.DASHBOARD_VISUALIZAR))):
    contadores = await dashboard_service.contadores_processos(db, user.organizacao_id)
    ativos = await dashboard_service.contratos_ativos_e_valor(db, user.organizacao_id)
    vencendo_contratos = await dashboard_service.contratos_vencendo(db, user.organizacao_id, dias=30)
    vencendo_atas = await dashboard_service.atas_vencendo(db, user.organizacao_id, dias=30)
    return DashboardOut(
        processos_em_andamento=contadores["processos_em_andamento"],
        processos_atrasados=contadores["processos_atrasados"],
        por_etapa=contadores["por_etapa"],
        valor_em_contratacao=contadores["valor_em_contratacao"],
        contratos_ativos=ativos["contratos_ativos"],
        valor_contratado=ativos["valor_contratado"],
        contratos_vencendo=len(vencendo_contratos),
        atas_vencendo=len(vencendo_atas),
    )


@router.get("/dashboard/gargalos", response_model=list[dict])
async def gargalos(db: AsyncSession = Depends(get_db), user: User = Depends(exigir(P.RELATORIOS_VISUALIZAR))):
    return await dashboard_service.tempo_medio_por_etapa(db, user.organizacao_id)


@router.get("/busca", response_model=dict)
async def busca_global(
    q: str, db: AsyncSession = Depends(get_db), user: User = Depends(exigir(P.BUSCA_GLOBAL))
):
    """Busca global (seção 68) por número de processo/contrato, objeto,
    fornecedor ou CNPJ."""
    termo = f"%{q}%"
    processos = list(
        (
            await db.scalars(
                select(ProcessoInstancia)
                .where(
                    ProcessoInstancia.organizacao_id == user.organizacao_id,
                    or_(ProcessoInstancia.numero_processo.ilike(termo), ProcessoInstancia.objeto.ilike(termo)),
                )
                .limit(10)
            )
        ).all()
    )
    contratos = list(
        (
            await db.scalars(
                select(Contrato)
                .where(
                    Contrato.organizacao_id == user.organizacao_id,
                    or_(Contrato.numero.ilike(termo), Contrato.objeto.ilike(termo)),
                )
                .limit(10)
            )
        ).all()
    )
    fornecedores = list(
        (
            await db.scalars(
                select(Fornecedor)
                .where(
                    Fornecedor.organizacao_id == user.organizacao_id,
                    or_(Fornecedor.razao_social.ilike(termo), Fornecedor.cnpj.ilike(termo)),
                )
                .limit(10)
            )
        ).all()
    )
    return {
        "processos": [{"id": str(p.id), "numero": p.numero_processo, "objeto": p.objeto} for p in processos],
        "contratos": [{"id": str(c.id), "numero": c.numero, "objeto": c.objeto} for c in contratos],
        "fornecedores": [{"id": str(f.id), "nome": f.razao_social, "cnpj": f.cnpj} for f in fornecedores],
    }


@router.get("/processos/consultar-rapido", response_model=dict)
async def consultar_rapido(
    numero: str, db: AsyncSession = Depends(get_db), user: User = Depends(exigir(P.PROCESSOS_VISUALIZAR))
):
    """Painel "Quem está com o processo?" (seção 134) — resposta rápida por
    número, sem precisar abrir o processo inteiro.

    `numero` é query param, não path param: o número do processo contém "/"
    (ex. "0001/2026"), o que quebraria o roteamento em um segmento de path.
    """
    numero_processo = numero
    from app.api.v1.processos import _resumo
    from app.core.errors import NotFound

    processo = await db.scalar(
        select(ProcessoInstancia).where(
            ProcessoInstancia.organizacao_id == user.organizacao_id,
            ProcessoInstancia.numero_processo == numero_processo,
        )
    )
    if processo is None:
        raise NotFound(f"Nenhum processo encontrado com o número {numero_processo}.")
    resumo = await _resumo(db, processo)
    return resumo.model_dump()
