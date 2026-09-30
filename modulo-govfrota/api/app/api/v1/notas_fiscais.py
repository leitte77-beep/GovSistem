"""Notas fiscais dos abastecimentos em posto credenciado (enviadas pelo portal do posto).

É a tela de Faturamento da Prefeitura: lista as notas por período, posto e
secretaria e baixa uma a uma ou todas num ZIP.
"""
import io
import re
import uuid
import zipfile
from datetime import date, datetime

from fastapi import APIRouter, Depends, HTTPException, Response
from sqlalchemy import func as sa_func
from sqlalchemy import or_, select
from sqlalchemy.ext.asyncio import AsyncSession
from starlette.concurrency import run_in_threadpool

from app.core.auth import filtro_escopo, require_permission
from app.core.database import get_db
from app.core.permissions import Perm
from app.core.storage import storage
from app.core.timezone import get_tz, now_local, to_display
from app.models.abastecimento import Abastecimento
from app.models.anexo import Anexo
from app.models.auth_models import User
from app.models.combustivel import Combustivel, Fornecedor
from app.models.motorista import Motorista
from app.models.nota_abastecimento import NotaAbastecimento
from app.models.unidade import Unidade
from app.models.veiculo import Veiculo
from app.services.auditoria import registrar_auditoria
from app.services.notas_abastecimento import ler_arquivo, notas_ativas, resumo_nota

router = APIRouter(prefix="/notas-fiscais", tags=["notas-fiscais"])

MAX_ZIP = 3000


def _limites(inicio: date, fim: date) -> tuple[datetime, datetime]:
    tz = get_tz()
    return datetime.combine(inicio, datetime.min.time(), tzinfo=tz), datetime.combine(fim, datetime.max.time(), tzinfo=tz)


def _condicoes(user: User, inicio: date | None, fim: date | None, fornecedor_id, unidade_id, situacao: str | None, busca: str | None):
    hoje = now_local().date()
    di, df = inicio or hoje.replace(day=1), fim or hoje
    if df < di:
        raise HTTPException(status_code=422, detail="O fim do período é anterior ao início.")
    ini, fim_dt = _limites(di, df)
    com_nota = select(NotaAbastecimento.abastecimento_id).where(NotaAbastecimento.ativo.is_(True))
    cond = [
        Abastecimento.organization_id == user.organization_id,
        Abastecimento.deleted_at.is_(None),
        Abastecimento.status == "CONFIRMADO",
        Abastecimento.modalidade == "POSTO_CREDENCIADO",
        Abastecimento.data_abastecimento >= ini,
        Abastecimento.data_abastecimento <= fim_dt,
        filtro_escopo(user, Abastecimento.unidade_id),
    ]
    if fornecedor_id:
        cond.append(Abastecimento.fornecedor_id == fornecedor_id)
    if unidade_id:
        cond.append(Abastecimento.unidade_id == unidade_id)
    if situacao == "COM_NOTA":
        cond.append(Abastecimento.id.in_(com_nota))
    elif situacao == "SEM_NOTA":
        cond.append(Abastecimento.id.notin_(com_nota))
    if busca and (t := busca.strip()):
        like = f"%{t}%"
        cond.append(or_(
            Veiculo.placa.ilike(like), Abastecimento.numero_nf.ilike(like), Motorista.nome.ilike(like),
            Abastecimento.id.in_(select(NotaAbastecimento.abastecimento_id).where(NotaAbastecimento.nfe_chave.ilike(like))),
        ))
    return cond


def _consulta(cond):
    return (
        select(
            Abastecimento, Veiculo.placa, Veiculo.marca, Veiculo.modelo, Motorista.nome, Combustivel.nome, Unidade.nome, sa_func.coalesce(Fornecedor.nome_fantasia, Fornecedor.razao_social),
        )
        .join(Veiculo, Veiculo.id == Abastecimento.veiculo_id)
        .outerjoin(Motorista, Motorista.id == Abastecimento.motorista_id)
        .join(Combustivel, Combustivel.id == Abastecimento.combustivel_id)
        .outerjoin(Unidade, Unidade.id == Abastecimento.unidade_id)
        .outerjoin(Fornecedor, Fornecedor.id == Abastecimento.fornecedor_id)
        .where(*cond)
    )


@router.get("")
async def listar(
    inicio: date | None = None, fim: date | None = None,
    fornecedor_id: uuid.UUID | None = None, unidade_id: uuid.UUID | None = None,
    situacao: str | None = None, busca: str | None = None,
    skip: int = 0, limit: int = 100,
    response: Response = None,  # type: ignore[assignment]
    user: User = Depends(require_permission(Perm.REFUELING_VIEW, escopo=True)),
    db: AsyncSession = Depends(get_db),
):
    cond = _condicoes(user, inicio, fim, fornecedor_id, unidade_id, situacao, busca)
    base = _consulta(cond).subquery()
    tot = (
        await db.execute(select(sa_func.count(), sa_func.coalesce(sa_func.sum(base.c.custo_total), 0)).select_from(base))
    ).one()
    # Contagem sem o filtro de situação, para os cartões "com nota / sem nota".
    todos = _condicoes(user, inicio, fim, fornecedor_id, unidade_id, None, busca)
    com = (
        await db.execute(
            select(sa_func.count()).select_from(
                _consulta([*todos, Abastecimento.id.in_(select(NotaAbastecimento.abastecimento_id).where(NotaAbastecimento.ativo.is_(True)))]).subquery()
            )
        )
    ).scalar_one()
    total_geral = (await db.execute(select(sa_func.count()).select_from(_consulta(todos).subquery()))).scalar_one()
    if response is not None:
        response.headers["X-Total-Count"] = str(int(tot[0] or 0))
    linhas = (
        await db.execute(_consulta(cond).order_by(Abastecimento.data_abastecimento.desc()).offset(skip).limit(min(limit, 500)))
    ).all()
    notas = await notas_ativas(db, [r[0].id for r in linhas])
    return {
        "resumo": {"abastecimentos": int(total_geral), "com_nota": int(com), "sem_nota": int(total_geral - com),
                   "total_filtrado": int(tot[0] or 0), "valor_filtrado": float(tot[1] or 0)},
        "itens": [
            {
                "id": str(a.id),
                "data": to_display(a.data_abastecimento).isoformat(),
                "placa": placa, "marca": marca, "modelo": modelo, "motorista": mot,
                "combustivel": comb, "secretaria": unid, "posto": posto,
                "litros": float(a.quantidade_litros),
                "valor": float(a.custo_total) if a.custo_total is not None else None,
                "nota": resumo_nota(notas.get(a.id)),
            }
            for a, placa, marca, modelo, mot, comb, unid, posto in linhas
        ],
    }


def _nome_seguro(t: str | None) -> str:
    return re.sub(r"[^\w.-]+", "_", (t or "").strip())[:60] or "sem_nome"


@router.get("/zip")
async def baixar_zip(
    inicio: date | None = None, fim: date | None = None,
    fornecedor_id: uuid.UUID | None = None, unidade_id: uuid.UUID | None = None, busca: str | None = None,
    tipos: str = "NFE_XML,DANFE",
    user: User = Depends(require_permission(Perm.REFUELING_VIEW, escopo=True)),
    db: AsyncSession = Depends(get_db),
):
    """Todas as notas do filtro num ZIP: <posto>/<data>_<placa>_NF<número>.<ext>."""
    quer = {t.strip().upper() for t in tipos.split(",")} & {"NFE_XML", "DANFE"}
    if not quer:
        raise HTTPException(status_code=422, detail="Escolha XML e/ou PDF.")
    cond = _condicoes(user, inicio, fim, fornecedor_id, unidade_id, "COM_NOTA", busca)
    sub = _consulta(cond).with_only_columns(Abastecimento.id).subquery()
    linhas = (
        await db.execute(
            select(NotaAbastecimento, Anexo.caminho, Abastecimento.data_abastecimento, Veiculo.placa, sa_func.coalesce(Fornecedor.nome_fantasia, Fornecedor.razao_social))
            .join(Anexo, Anexo.id == NotaAbastecimento.anexo_id)
            .join(Abastecimento, Abastecimento.id == NotaAbastecimento.abastecimento_id)
            .join(Veiculo, Veiculo.id == Abastecimento.veiculo_id)
            .outerjoin(Fornecedor, Fornecedor.id == Abastecimento.fornecedor_id)
            .where(NotaAbastecimento.abastecimento_id.in_(select(sub.c.id)), NotaAbastecimento.ativo.is_(True),
                   NotaAbastecimento.tipo.in_(quer), Anexo.organization_id == user.organization_id)
            .order_by(sa_func.coalesce(Fornecedor.nome_fantasia, Fornecedor.razao_social), Abastecimento.data_abastecimento)
            .limit(MAX_ZIP + 1)
        )
    ).all()
    if not linhas:
        raise HTTPException(status_code=404, detail="Nenhuma nota no período escolhido.")
    if len(linhas) > MAX_ZIP:
        raise HTTPException(status_code=422, detail=f"Mais de {MAX_ZIP} arquivos. Reduza o período ou filtre por posto.")

    def montar() -> bytes:
        buf = io.BytesIO()
        usados: set[str] = set()
        with zipfile.ZipFile(buf, "w", zipfile.ZIP_DEFLATED) as z:
            for nota, caminho, quando, placa, posto in linhas:
                if not storage.exists(caminho):
                    continue
                ext = ".xml" if nota.tipo == "NFE_XML" else ".pdf"
                num = f"_NF{nota.nfe_numero}" if nota.nfe_numero else ""
                nome = f"{_nome_seguro(posto)}/{to_display(quando):%Y-%m-%d_%Hh%M}_{_nome_seguro(placa)}{num}{ext}"
                while nome in usados:
                    nome = nome.replace(ext, f"_{nota.id.hex[:6]}{ext}")
                usados.add(nome)
                z.writestr(nome, storage.read(caminho))
        return buf.getvalue()

    conteudo = await run_in_threadpool(montar)
    await registrar_auditoria(
        db, organization_id=user.organization_id, acao="notas_fiscais.zip", entidade="abastecimento", entidade_id=None,
        usuario_id=user.id, dados_novos={"arquivos": len(linhas), "inicio": str(inicio), "fim": str(fim)},
    )
    await db.commit()
    nome_zip = f"notas-fiscais_{inicio or 'inicio'}_a_{fim or 'hoje'}.zip"
    return Response(
        content=conteudo, media_type="application/zip",
        headers={"Content-Disposition": f'attachment; filename="{nome_zip}"', "X-Content-Type-Options": "nosniff"},
    )


@router.get("/{nota_id}/arquivo")
async def baixar(
    nota_id: uuid.UUID,
    user: User = Depends(require_permission(Perm.REFUELING_VIEW, escopo=True)),
    db: AsyncSession = Depends(get_db),
):
    nota = await db.scalar(
        select(NotaAbastecimento)
        .join(Abastecimento, Abastecimento.id == NotaAbastecimento.abastecimento_id)
        .where(NotaAbastecimento.id == nota_id, NotaAbastecimento.organization_id == user.organization_id,
               filtro_escopo(user, Abastecimento.unidade_id))
    )
    if nota is None:
        raise HTTPException(status_code=404, detail="Nota não encontrada.")
    conteudo, mime = await ler_arquivo(db, nota)
    return Response(
        content=conteudo, media_type=mime,
        headers={"Content-Disposition": f'attachment; filename="{nota.nome_arquivo.replace(chr(34), "")}"', "X-Content-Type-Options": "nosniff"},
    )
