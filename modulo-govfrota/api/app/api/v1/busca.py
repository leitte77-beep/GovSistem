import uuid

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.auth import escopo_unidades, get_current_user, require_permission
from app.core.database import get_db
from app.core.permissions import Perm
from app.models.abastecimento import Abastecimento
from app.models.auth_models import User
from app.models.auditoria import Auditoria, Notificacao
from app.models.combustivel import Combustivel, Fornecedor, Tanque
from app.models.manutencao import Manutencao, PlanoPreventivo
from app.models.motorista import Motorista
from app.models.estoque import EntradaCombustivel
from app.models.veiculo import Veiculo
from app.schemas.schemas import AuditoriaResponse, NotificacaoResponse

router = APIRouter(tags=["busca global, auditoria e notificações"])


@router.get("/busca")
async def busca_global(
    q: str = Query(min_length=2),
    user: User = Depends(require_permission(Perm.VEHICLE_VIEW)),
    db: AsyncSession = Depends(get_db),
):
    """Pesquisa global do GovFrota (§40): placa, veículo, motorista, fornecedor,
    oficina (fornecedor), número de nota (entrada ou abastecimento em posto)."""
    like = f"%{q}%"
    resultados: dict[str, list] = {"veiculos": [], "motoristas": [], "fornecedores": [], "entradas": [], "abastecimentos": [], "manutencoes": []}

    veiculos = (
        await db.execute(
            select(Veiculo).where(
                Veiculo.organization_id == user.organization_id,
                Veiculo.deleted_at.is_(None),
                (Veiculo.placa.ilike(like)) | (Veiculo.modelo.ilike(like)) | (Veiculo.codigo_interno.ilike(like)),
            ).limit(10)
        )
    ).scalars().all()
    resultados["veiculos"] = [{"id": str(v.id), "placa": v.placa, "modelo": v.modelo} for v in veiculos]

    motoristas = (
        await db.execute(
            select(Motorista).where(
                Motorista.organization_id == user.organization_id,
                Motorista.deleted_at.is_(None),
                (Motorista.nome.ilike(like)) | (Motorista.cpf.ilike(like)),
            ).limit(10)
        )
    ).scalars().all()
    resultados["motoristas"] = [{"id": str(m.id), "nome": m.nome} for m in motoristas]

    fornecedores = (
        await db.execute(
            select(Fornecedor).where(
                Fornecedor.organization_id == user.organization_id,
                Fornecedor.deleted_at.is_(None),
                (Fornecedor.razao_social.ilike(like)) | (Fornecedor.nome_fantasia.ilike(like)),
            ).limit(10)
        )
    ).scalars().all()
    resultados["fornecedores"] = [{"id": str(f.id), "nome": f.razao_social} for f in fornecedores]

    entradas = (
        await db.execute(
            select(EntradaCombustivel).where(
                EntradaCombustivel.organization_id == user.organization_id,
                EntradaCombustivel.numero_nota.ilike(like),
            ).limit(10)
        )
    ).scalars().all()
    resultados["entradas"] = [
        {"id": str(e.id), "numero_nota": e.numero_nota, "litros": float(e.quantidade_litros)} for e in entradas
    ]

    abastecimentos = (
        await db.execute(
            select(Abastecimento, Veiculo.placa)
            .join(Veiculo, Veiculo.id == Abastecimento.veiculo_id)
            .where(
                Abastecimento.organization_id == user.organization_id,
                (Abastecimento.numero_nf.ilike(like)) | (Abastecimento.chave_nfe.ilike(like)),
            )
            .limit(10)
        )
    ).all()
    resultados["abastecimentos"] = [
        {"id": str(a.id), "numero_nf": a.numero_nf, "placa": placa, "litros": float(a.quantidade_litros)}
        for a, placa in abastecimentos
    ]

    return resultados


@router.get("/auditoria", response_model=list[AuditoriaResponse])
async def listar_auditoria(
    entidade: str | None = None,
    acao: str | None = None,
    limit: int = 100,
    user: User = Depends(require_permission(Perm.AUDIT_VIEW)),
    db: AsyncSession = Depends(get_db),
):
    stmt = select(Auditoria).where(Auditoria.organization_id == user.organization_id)
    if entidade:
        stmt = stmt.where(Auditoria.entidade == entidade)
    if acao:
        stmt = stmt.where(Auditoria.acao == acao)
    registros = list(
        (await db.execute(stmt.order_by(Auditoria.created_at.desc()).limit(min(limit, 500))))
        .scalars().all()
    )
    if not registros:
        return registros

    from app.models.motorista import Motorista
    from app.models.auth_models import User as UserModel

    ids_user = {r.usuario_id for r in registros if r.usuario_id}
    ids_mot = {r.motorista_id for r in registros if r.motorista_id}

    nomes_user: dict = {}
    if ids_user:
        nomes_user = {
            u.id: u.name
            for u in (
                await db.execute(select(UserModel).where(UserModel.id.in_(ids_user)))
            ).scalars().all()
        }
    nomes_mot: dict = {}
    if ids_mot:
        nomes_mot = {
            m.id: m.nome
            for m in (
                await db.execute(select(Motorista).where(Motorista.id.in_(ids_mot)))
            ).scalars().all()
        }

    from pydantic import TypeAdapter

    adapter = TypeAdapter(list[AuditoriaResponse])
    itens = []
    for r in registros:
        dados = AuditoriaResponse.model_validate(r, from_attributes=True).model_dump()
        if r.usuario_id is not None:
            dados["actor_type"] = "user"
            dados["actor_id"] = r.usuario_id
            dados["actor_name"] = nomes_user.get(r.usuario_id) or "Usuário removido"
        elif r.motorista_id is not None:
            dados["actor_type"] = "driver"
            dados["actor_id"] = r.motorista_id
            dados["actor_name"] = nomes_mot.get(r.motorista_id) or "Motorista removido"
        else:
            dados["actor_type"] = "system"
            dados["actor_name"] = "Sistema"
        itens.append(dados)
    return adapter.validate_python(itens)


@router.get("/notificacoes", response_model=list[NotificacaoResponse])
async def listar_notificacoes(
    nao_lidas: bool = False,
    user: User = Depends(require_permission(Perm.VEHICLE_VIEW, escopo=True)),
    db: AsyncSession = Depends(get_db),
):
    # Notificações são da organização inteira; a central por secretaria vem
    # na tela "Minha Secretaria". Até lá, o perfil restrito não as recebe.
    if escopo_unidades(user) is not None:
        return []
    stmt = select(Notificacao).where(Notificacao.organization_id == user.organization_id)
    if nao_lidas:
        stmt = stmt.where(Notificacao.lida.is_(False))
    return (
        await db.execute(stmt.order_by(Notificacao.created_at.desc()).limit(50))
    ).scalars().all()


@router.get("/alertas")
async def alertas(
    user: User = Depends(require_permission(Perm.VEHICLE_VIEW, escopo=True)),
    db: AsyncSession = Depends(get_db),
):
    """Pendências da frota agora (CNH, estoque, preventivas, documentos,
    ocorrências graves, abastecimentos a conferir) + nº de notificações não lidas."""
    if escopo_unidades(user) is not None:
        return {"itens": [], "notificacoes_nao_lidas": 0}
    from sqlalchemy import func as sa_func

    from app.services.alertas import alertas_atuais

    nao_lidas = await db.scalar(
        select(sa_func.count(Notificacao.id)).where(
            Notificacao.organization_id == user.organization_id,
            Notificacao.lida.is_(False),
        )
    )
    return {
        "itens": await alertas_atuais(db, user.organization_id),
        "notificacoes_nao_lidas": int(nao_lidas or 0),
    }


@router.post("/notificacoes/marcar-todas-lidas")
async def marcar_todas_lidas(
    user: User = Depends(require_permission(Perm.VEHICLE_VIEW)),
    db: AsyncSession = Depends(get_db),
):
    from datetime import datetime, timezone

    from sqlalchemy import update

    await db.execute(
        update(Notificacao)
        .where(
            Notificacao.organization_id == user.organization_id,
            Notificacao.lida.is_(False),
        )
        .values(lida=True, lida_em=datetime.now(timezone.utc))
    )
    await db.commit()
    return {"ok": True}


@router.post("/notificacoes/{notificacao_id}/marcar-lida")
async def marcar_lida(
    notificacao_id: uuid.UUID,
    user: User = Depends(require_permission(Perm.VEHICLE_VIEW)),
    db: AsyncSession = Depends(get_db),
):
    from datetime import datetime, timezone

    notificacao = (
        await db.execute(
            select(Notificacao).where(
                Notificacao.id == notificacao_id,
                Notificacao.organization_id == user.organization_id,
            )
        )
    ).scalar_one_or_none()
    if notificacao is None:
        raise HTTPException(status_code=404, detail="Notificação não encontrada.")
    notificacao.lida = True
    notificacao.lida_em = datetime.now(timezone.utc)
    await db.commit()
    return {"ok": True}
