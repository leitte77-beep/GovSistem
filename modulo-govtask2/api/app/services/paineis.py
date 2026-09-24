"""Números dos painéis por perfil.

Tudo é calculado em Python sobre os pedidos abertos da prefeitura: uma
prefeitura tem centenas de pedidos abertos, não milhões, e assim a mesma
conta roda igual no PostgreSQL e no SQLite dos testes.
"""

import uuid
from collections import defaultdict
from datetime import datetime, timedelta, timezone
from decimal import Decimal

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.api.v1._montagem import dias_na_situacao, linha
from app.core.fluxo import ROTULO_TIPO
from app.models.config import Setor
from app.models.pedido import (
    ROTULO_MOTIVO_PARADA,
    Andamento,
    Encaminhamento,
    Medicao,
    OrigemPedido,
    Pedido,
    SituacaoPedido,
    StatusEncaminhamento,
)
from app.schemas.pedido import (
    EventoRecente,
    FatiaContagem,
    GargaloSetor,
    ObraResumo,
    PedidoLista,
)

ABERTOS = (
    SituacaoPedido.COM_ASSESSOR.value,
    SituacaoPedido.EM_SETOR.value,
    SituacaoPedido.AGUARDANDO_TERCEIRO.value,
)

ROTULO_ORIGEM = {
    OrigemPedido.PREFEITO.value: "Prefeito",
    OrigemPedido.DEPUTADO.value: "Deputado",
    OrigemPedido.SECRETARIA.value: "Secretaria",
    OrigemPedido.VEREADOR.value: "Vereador",
    OrigemPedido.CIDADAO.value: "Cidadão",
    OrigemPedido.OUTRO.value: "Outro",
}
PARLAMENTARES = {OrigemPedido.DEPUTADO.value, OrigemPedido.VEREADOR.value}


def _zero(valor) -> Decimal:
    return Decimal(valor or 0)


async def pedidos_da_org(
    db: AsyncSession, organization_id: uuid.UUID, *, so_abertos: bool
) -> list[Pedido]:
    filtros = [Pedido.organization_id == organization_id, Pedido.deleted_at.is_(None)]
    if so_abertos:
        filtros.append(Pedido.situacao.in_(ABERTOS))
    else:
        filtros.append(Pedido.situacao != SituacaoPedido.CANCELADO.value)
    result = await db.execute(
        select(Pedido)
        .where(*filtros)
        .options(
            selectinload(Pedido.responsavel_atual),
            selectinload(Pedido.encaminhamentos).selectinload(Encaminhamento.responsavel),
            selectinload(Pedido.anexos),
        )
    )
    return list(result.scalars().unique().all())


async def nomes_de_setor(db: AsyncSession, organization_id: uuid.UUID) -> dict[str, str]:
    return dict(
        (
            await db.execute(
                select(Setor.codigo, Setor.nome).where(
                    Setor.organization_id == organization_id
                )
            )
        ).all()
    )


def ordenar_parados(pedidos: list[Pedido], limite: int = 20) -> list[PedidoLista]:
    """Os que estão há mais tempo no mesmo lugar primeiro."""
    return [
        linha(p)
        for p in sorted(pedidos, key=lambda p: dias_na_situacao(p), reverse=True)[:limite]
    ]


async def gargalos(
    db: AsyncSession,
    organization_id: uuid.UUID,
    abertos: list[Pedido],
    dias_alerta: int,
    nomes: dict[str, str],
) -> list[GargaloSetor]:
    agora = datetime.now(timezone.utc)
    hoje = agora.date()
    atual: dict[str, list[Pedido]] = defaultdict(list)
    for p in abertos:
        if p.situacao == SituacaoPedido.EM_SETOR.value and p.setor_atual:
            atual[p.setor_atual].append(p)

    # Histórico do último ano: quanto tempo cada setor levou para devolver.
    desde = agora - timedelta(days=365)
    result = await db.execute(
        select(Encaminhamento.setor, Encaminhamento.created_at, Encaminhamento.devolvido_em)
        .join(Pedido, Pedido.id == Encaminhamento.pedido_id)
        .where(
            Pedido.organization_id == organization_id,
            Encaminhamento.status == StatusEncaminhamento.CONCLUIDO.value,
            Encaminhamento.devolvido_em.is_not(None),
            Encaminhamento.devolvido_em >= desde,
        )
    )
    historico: dict[str, list[float]] = defaultdict(list)
    for setor, criado, devolvido in result.all():
        if criado.tzinfo is None:
            criado = criado.replace(tzinfo=timezone.utc)
        if devolvido.tzinfo is None:
            devolvido = devolvido.replace(tzinfo=timezone.utc)
        historico[setor].append(max(0.0, (devolvido - criado).total_seconds() / 86400))

    saida = []
    for setor in set(atual) | set(historico):
        lista = atual.get(setor, [])
        dias = [dias_na_situacao(p, agora) for p in lista]
        hist = historico.get(setor, [])
        saida.append(
            GargaloSetor(
                setor=setor,
                nome=nomes.get(setor, setor.title()),
                abertos=len(lista),
                parados=sum(1 for d in dias if d >= dias_alerta),
                atrasados=sum(
                    1 for p in lista if p.prazo_atual is not None and p.prazo_atual < hoje
                ),
                dias_medios_agora=round(sum(dias) / len(dias), 1) if dias else 0.0,
                dias_medios_historico=round(sum(hist) / len(hist), 1) if hist else None,
                passagens_concluidas=len(hist),
            )
        )
    return sorted(saida, key=lambda g: (g.abertos, g.dias_medios_agora), reverse=True)


async def recentes(
    db: AsyncSession, organization_id: uuid.UUID, limite: int = 15
) -> list[EventoRecente]:
    result = await db.execute(
        select(Andamento, Pedido.numero, Pedido.titulo, Encaminhamento.setor, Encaminhamento.assunto)
        .join(Pedido, Pedido.id == Andamento.pedido_id)
        .outerjoin(Encaminhamento, Encaminhamento.id == Andamento.encaminhamento_id)
        .where(
            Pedido.organization_id == organization_id,
            Pedido.deleted_at.is_(None),
            Andamento.interno.is_(False),
        )
        .order_by(Andamento.created_at.desc())
        .limit(limite)
    )
    return [
        EventoRecente(
            pedido_id=a.pedido_id,
            numero=numero,
            titulo=titulo,
            tipo=a.tipo,
            texto=a.texto,
            autor_nome=a.autor_nome,
            created_at=a.created_at,
            setor=setor,
            tarefa=tarefa,
        )
        for a, numero, titulo, setor, tarefa in result.all()
    ]


def fatias(pedidos: list[Pedido]) -> tuple[list, list, list, list]:
    """Distribuição por tipo, origem, parlamentar e motivo da parada."""
    por_tipo: dict[str, list] = defaultdict(lambda: [0, Decimal(0)])
    por_origem: dict[str, list] = defaultdict(lambda: [0, Decimal(0)])
    por_parlamentar: dict[str, list] = defaultdict(lambda: [0, Decimal(0)])
    por_motivo: dict[str, list] = defaultdict(lambda: [0, Decimal(0)])
    for p in pedidos:
        for grupo, chave in ((por_tipo, p.tipo), (por_origem, p.origem)):
            grupo[chave][0] += 1
            grupo[chave][1] += _zero(p.valor_previsto)
        if p.origem in PARLAMENTARES and (p.origem_nome or "").strip():
            nome = " ".join(p.origem_nome.split())
            por_parlamentar[nome][0] += 1
            por_parlamentar[nome][1] += _zero(p.valor_previsto)
        if p.situacao in ABERTOS and p.motivo_parada:
            por_motivo[p.motivo_parada][0] += 1
            por_motivo[p.motivo_parada][1] += _zero(p.valor_previsto)

    def montar(grupo: dict, rotulos: dict | None, limite: int | None = None):
        itens = [
            FatiaContagem(
                chave=chave,
                rotulo=(rotulos or {}).get(chave, chave),
                quantidade=q,
                valor=v,
            )
            for chave, (q, v) in grupo.items()
        ]
        itens.sort(key=lambda f: (f.quantidade, f.valor), reverse=True)
        return itens[:limite] if limite else itens

    rotulo_tipo = {k: v.split(" (")[0] for k, v in ROTULO_TIPO.items()}
    return (
        montar(por_tipo, rotulo_tipo),
        montar(por_origem, ROTULO_ORIGEM),
        montar(por_parlamentar, None, 10),
        montar(por_motivo, ROTULO_MOTIVO_PARADA),
    )


async def obras(db: AsyncSession, abertos: list[Pedido]) -> list[ObraResumo]:
    """Obras em andamento com o último % executado e a última foto."""
    obras = [p for p in abertos if p.tipo == "OBRA"]
    if not obras:
        return []
    result = await db.execute(
        select(Medicao)
        .where(Medicao.pedido_id.in_([p.id for p in obras]))
        .options(selectinload(Medicao.fotos))
        .order_by(Medicao.numero)
    )
    ultima: dict = {}
    for m in result.scalars().all():
        ultima[m.pedido_id] = m

    saida = []
    for p in obras:
        m = ultima.get(p.id)
        fotos = [f for f in (m.fotos if m else []) if f.deleted_at is None]
        saida.append(
            ObraResumo(
                id=p.id,
                numero=p.numero,
                titulo=p.titulo,
                situacao=p.situacao,
                setor_atual=p.setor_atual,
                percentual_executado=m.percentual_executado if m else None,
                ultima_medicao_em=m.created_at if m else None,
                valor_previsto=p.valor_previsto,
                valor_pago=p.valor_pago,
                foto_id=fotos[-1].id if fotos else None,
                dias_na_situacao=dias_na_situacao(p),
                motivo_parada=p.motivo_parada,
            )
        )
    return sorted(saida, key=lambda o: o.dias_na_situacao, reverse=True)
