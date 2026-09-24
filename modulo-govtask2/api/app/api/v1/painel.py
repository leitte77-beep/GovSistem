"""Painel. Duas visões e nada além: a caixa de quem trabalha e o
acompanhamento de quem cobra.
"""

from datetime import datetime, timezone
from decimal import Decimal

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.api.v1._montagem import dias_na_situacao, filtro_caixa, linha
from app.core.auth import get_user_permissions, require_permission
from app.core.database import get_db
from app.core.permissions import GESTORES, Perm
from app.services import ajustes as ajustes_service
from app.services import paineis
from app.models.auth_models import User
from app.models.config import Setor
from app.models.pedido import Encaminhamento, Pedido, SituacaoPedido
from app.schemas.pedido import (
    KpisPrefeito,
    PainelAssessor,
    PainelPrefeito,
    ContagemPainel,
    ContagemPorSetor,
    ContagemSetor,
    MeuSetorResposta,
    PainelResposta,
    SetorOut,
)

router = APIRouter(tags=["painel"])

ABERTOS = [
    SituacaoPedido.COM_ASSESSOR.value,
    SituacaoPedido.EM_SETOR.value,
    SituacaoPedido.AGUARDANDO_TERCEIRO.value,
]


@router.get("/painel", response_model=PainelResposta)
async def painel(
    user: User = Depends(require_permission(Perm.PEDIDO_VER)),
    db: AsyncSession = Depends(get_db),
):
    hoje = datetime.now(timezone.utc).date()
    base = [Pedido.organization_id == user.organization_id, Pedido.deleted_at.is_(None)]
    abertos = [*base, Pedido.situacao.in_(ABERTOS)]

    async def contar(*filtros) -> int:
        return int(await db.scalar(select(func.count(Pedido.id)).where(*filtros)) or 0)

    na_minha_mao = filtro_caixa(user)

    contagens = ContagemPainel(
        comigo=await contar(*abertos, na_minha_mao),
        atrasados=await contar(*abertos, Pedido.prazo_atual < hoje),
        aguardando_terceiro=await contar(
            *base, Pedido.situacao == SituacaoPedido.AGUARDANDO_TERCEIRO.value
        ),
        em_setor=await contar(
            *base, Pedido.situacao == SituacaoPedido.EM_SETOR.value
        ),
        concluidos_no_ano=await contar(
            *base,
            Pedido.situacao == SituacaoPedido.CONCLUIDO.value,
            Pedido.exercicio == hoje.year,
        ),
        valor_em_andamento=Decimal(
            await db.scalar(
                select(func.coalesce(func.sum(Pedido.valor_previsto), 0)).where(*abertos)
            )
            or 0
        ),
    )

    async def buscar(*filtros, limite: int = 12) -> list:
        result = await db.execute(
            select(Pedido)
            .where(*filtros)
            .options(
                selectinload(Pedido.responsavel_atual),
                selectinload(Pedido.encaminhamentos).selectinload(Encaminhamento.responsavel),
                selectinload(Pedido.anexos),
            )
            .order_by(Pedido.prazo_atual.asc().nullslast())
            .limit(limite)
        )
        return [linha(p) for p in result.scalars().unique().all()]

    nomes = dict(
        (
            await db.execute(
                select(Setor.codigo, Setor.nome).where(
                    Setor.organization_id == user.organization_id
                )
            )
        ).all()
    )
    por_setor_query = await db.execute(
        select(
            Pedido.setor_atual,
            func.count(Pedido.id),
            func.count(Pedido.id).filter(Pedido.prazo_atual < hoje),
            func.coalesce(func.sum(Pedido.valor_previsto), 0),
        )
        .where(*abertos)
        .group_by(Pedido.setor_atual)
    )
    por_setor = sorted(
        (
            ContagemPorSetor(
                setor=codigo or "SEM_SETOR",
                nome=nomes.get(codigo, "Sem setor"),
                abertos=int(quantidade),
                atrasados=int(atrasados),
                valor=Decimal(valor or 0),
            )
            for codigo, quantidade, atrasados, valor in por_setor_query.all()
        ),
        key=lambda c: c.abertos,
        reverse=True,
    )

    return PainelResposta(
        contagens=contagens,
        minha_caixa=await buscar(*abertos, na_minha_mao),
        atrasados=await buscar(*abertos, Pedido.prazo_atual < hoje),
        por_setor=por_setor,
    )


@router.get("/meu-setor", response_model=MeuSetorResposta)
async def meu_setor(
    codigo: str | None = None,
    user: User = Depends(require_permission(Perm.PEDIDO_VER)),
    db: AsyncSession = Depends(get_db),
):
    """A mesa de um departamento: o que está aberto no setor, agora.

    Sem `codigo`, devolve o setor do próprio usuário. Quem conduz o fluxo ou
    administra pode espiar qualquer setor; os demais, só o seu — e só o que
    está na fila, é deles ou foi mencionado.
    """
    alvo = (codigo or user.setor or "").strip().upper()
    if not alvo:
        return MeuSetorResposta(
            setor=None,
            contagens=ContagemSetor(abertas=0, atrasadas=0, sem_responsavel=0, comigo=0),
        )

    setor = await db.scalar(
        select(Setor).where(
            Setor.organization_id == user.organization_id,
            Setor.codigo == alvo,
            Setor.ativo.is_(True),
        )
    )
    if setor is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Setor não encontrado."
        )
    sou_gestor = bool(get_user_permissions(user).intersection(GESTORES))
    if alvo != user.setor and not sou_gestor:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Você só acessa o seu setor.",
        )

    filtros = [
        Pedido.organization_id == user.organization_id,
        Pedido.deleted_at.is_(None),
        Pedido.situacao.in_(ABERTOS),
        Pedido.setor_atual == alvo,
    ]
    if not sou_gestor:
        filtros.append(filtro_caixa(user))

    result = await db.execute(
        select(Pedido)
        .where(*filtros)
        .options(
            selectinload(Pedido.responsavel_atual),
            selectinload(Pedido.encaminhamentos).selectinload(Encaminhamento.responsavel),
            selectinload(Pedido.anexos),
        )
        .order_by(Pedido.prazo_atual.asc().nullslast())
    )
    itens = [linha(p) for p in result.scalars().unique().all()]

    contagens = ContagemSetor(
        abertas=len(itens),
        atrasadas=sum(1 for i in itens if i.dias_de_atraso > 0),
        sem_responsavel=sum(1 for i in itens if i.responsavel_atual is None),
        comigo=sum(
            1
            for i in itens
            if i.responsavel_atual is not None and i.responsavel_atual.id == user.id
        ),
    )

    return MeuSetorResposta(
        setor=SetorOut.model_validate(setor),
        contagens=contagens,
        tarefas=itens[:100],
    )


def _visao_ampla(user: User) -> bool:
    """Prefeito, Assessor, admin e consulta veem a prefeitura inteira.

    O departamento não: ele só enxerga a fila do próprio setor.
    """
    perms = get_user_permissions(user)
    if perms.intersection({Perm.PEDIDO_CRIAR, Perm.PEDIDO_ENCAMINHAR, Perm.ADMIN}):
        return True
    return Perm.PEDIDO_VER in perms and Perm.PEDIDO_TRABALHAR not in perms


@router.get("/painel/prefeito", response_model=PainelPrefeito)
async def painel_prefeito(
    user: User = Depends(require_permission(Perm.PEDIDO_VER)),
    db: AsyncSession = Depends(get_db),
):
    """Onde está, há quanto tempo e por quê — a prefeitura em uma tela."""
    if not _visao_ampla(user):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Painel restrito ao Gabinete.",
        )
    org = user.organization_id
    ajustes = await ajustes_service.obter(db, org)
    limite = ajustes.dias_alerta_parado
    agora = datetime.now(timezone.utc)
    hoje = agora.date()

    todos = await paineis.pedidos_da_org(db, org, so_abertos=False)
    abertos = [p for p in todos if p.situacao in paineis.ABERTOS]
    concluidos = [p for p in todos if p.situacao == SituacaoPedido.CONCLUIDO.value]

    def concluido_em(p):
        c = p.concluido_em
        return c.replace(tzinfo=timezone.utc) if c and c.tzinfo is None else c

    kpis = KpisPrefeito(
        em_andamento=len(abertos),
        parados=sum(1 for p in abertos if dias_na_situacao(p, agora) >= limite),
        atrasados=sum(1 for p in abertos if p.prazo_atual and p.prazo_atual < hoje),
        aguardando_governo=sum(
            1 for p in abertos if p.situacao == SituacaoPedido.AGUARDANDO_TERCEIRO.value
        ),
        concluidos_no_mes=sum(
            1
            for p in concluidos
            if concluido_em(p) and concluido_em(p).year == hoje.year
            and concluido_em(p).month == hoje.month
        ),
        concluidos_no_ano=sum(
            1 for p in concluidos if concluido_em(p) and concluido_em(p).year == hoje.year
        ),
        valor_previsto=sum((Decimal(p.valor_previsto or 0) for p in todos), Decimal(0)),
        valor_liberado=sum((Decimal(p.valor_liberado or 0) for p in todos), Decimal(0)),
        valor_pago=sum((Decimal(p.valor_pago or 0) for p in todos), Decimal(0)),
    )
    nomes = await paineis.nomes_de_setor(db, org)
    por_tipo, por_origem, por_parlamentar, por_motivo = paineis.fatias(todos)
    return PainelPrefeito(
        dias_alerta_parado=limite,
        kpis=kpis,
        parados=paineis.ordenar_parados(abertos),
        gargalos=await paineis.gargalos(db, org, abertos, limite, nomes),
        por_tipo=por_tipo,
        por_origem=por_origem,
        por_parlamentar=por_parlamentar,
        por_motivo=por_motivo,
        obras=await paineis.obras(db, abertos),
        recentes=await paineis.recentes(db, org),
    )


@router.get("/painel/assessor", response_model=PainelAssessor)
async def painel_assessor(
    user: User = Depends(require_permission(*GESTORES)),
    db: AsyncSession = Depends(get_db),
):
    """A central de despacho: o que voltou, o que cobrar e o que está parado."""
    org = user.organization_id
    ajustes = await ajustes_service.obter(db, org)
    limite = ajustes.dias_alerta_parado
    agora = datetime.now(timezone.utc)
    hoje = agora.date()
    abertos = await paineis.pedidos_da_org(db, org, so_abertos=True)

    def por_prazo(lista):
        return [
            linha(p)
            for p in sorted(
                lista,
                key=lambda p: (p.prazo_atual is None, p.prazo_atual or hoje),
            )
        ]

    com_assessor = [p for p in abertos if p.situacao == SituacaoPedido.COM_ASSESSOR.value]
    em_setor = [p for p in abertos if p.situacao == SituacaoPedido.EM_SETOR.value]
    governo = [
        p for p in abertos if p.situacao == SituacaoPedido.AGUARDANDO_TERCEIRO.value
    ]
    complementos = [p for p in abertos if p.complemento_pendente]
    atrasados = [p for p in abertos if p.prazo_atual and p.prazo_atual < hoje]
    parados = [p for p in abertos if dias_na_situacao(p, agora) >= limite]

    nomes = await paineis.nomes_de_setor(db, org)
    return PainelAssessor(
        dias_alerta_parado=limite,
        contagens={
            "caixa": len(com_assessor),
            "complementos": len(complementos),
            "em_setor": len(em_setor),
            "aguardando_governo": len(governo),
            "atrasados": len(atrasados),
            "parados": len(parados),
            "abertos": len(abertos),
        },
        caixa=por_prazo(com_assessor),
        complementos=por_prazo(complementos),
        atrasados=por_prazo(atrasados),
        parados=paineis.ordenar_parados(parados, limite=50),
        aguardando_governo=paineis.ordenar_parados(governo, limite=50),
        em_setor=por_prazo(em_setor),
        gargalos=await paineis.gargalos(db, org, abertos, limite, nomes),
        recentes=await paineis.recentes(db, org, limite=20),
    )
