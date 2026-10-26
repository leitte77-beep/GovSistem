"""Regras de domínio da Fase 8 — estoque, almoxarifado e assistência farmacêutica.

B.4-001…027, B.4-035…037, B.4-019/B.6-019 (disponibilidade). O ledger
``movimentacoes_estoque`` é a fonte da verdade: saldo, custo médio, consumo,
curva ABC e sugestão de compra são calculados a partir dele, com a memória de
cálculo exposta. Limiares (vencimento, duplicidade, desvio, ABC, cobertura)
são configurações ``estoque.*`` do tenant.
"""

from __future__ import annotations

import statistics
import uuid
from collections import defaultdict
from datetime import date, datetime, time, timedelta, timezone
from zoneinfo import ZoneInfo

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.autorizacao import escopo_permite, tem_permissao
from app.core.errors import Conflict, NotFound, PermissionDenied, Unprocessable
from app.core.permissoes import Permissao
from app.models.cidadao import Cidadao
from app.models.estoque import (
    CompetenciaEstoque,
    Dispensacao,
    Inventario,
    LocalEstoque,
    Lote,
    Movimentacao,
    ParametroEstoque,
    Produto,
    RegistroTemperatura,
    Requisicao,
)
from app.models.nucleo import Estabelecimento, Usuario
from app.models.prontuario import Prescricao
from app.schemas.estoque import (
    DispensacaoCreate,
    LocalCreate,
    MovimentacaoCreate,
    ParametroSet,
    ProdutoCreate,
    ProdutoUpdate,
    RequisicaoAtender,
    RequisicaoCreate,
    TemperaturaCreate,
)
from app.services import configuracoes
from app.services.auditoria import registrar

POSITIVOS = {
    "ENTRADA",
    "DEVOLUCAO",
    "AJUSTE_POSITIVO",
    "TRANSFERENCIA_ENTRADA",
    "ESTORNO_DISPENSACAO",
}
NEGATIVOS = {
    "SAIDA",
    "PERDA",
    "DOACAO",
    "CONSUMO_INTERNO",
    "AJUSTE_NEGATIVO",
    "TRANSFERENCIA_SAIDA",
    "DISPENSACAO",
    "QUEBRA",
    "VENCIMENTO",
    "APLICACAO_VACINA",
    "ABERTURA_FRASCO",
}
# Baixas que retiram do estoque justamente o lote bloqueado/vencido (B.4-012).
BAIXA_DE_LOTE_INDISPONIVEL = {"PERDA", "QUEBRA", "VENCIMENTO", "AJUSTE_NEGATIVO"}
CONSUMO = {
    "SAIDA",
    "CONSUMO_INTERNO",
    "DISPENSACAO",
    "ESTORNO_DISPENSACAO",
    "APLICACAO_VACINA",
    "ABERTURA_FRASCO",
}
EXIGE_MOTIVO = {"PERDA", "QUEBRA", "AJUSTE_POSITIVO", "AJUSTE_NEGATIVO", "DOACAO", "DEVOLUCAO"}
EPSILON = 0.0005


def _agora() -> datetime:
    return datetime.now(timezone.utc)


def _utc(valor: datetime) -> datetime:
    return valor if valor.tzinfo else valor.replace(tzinfo=timezone.utc)


def _q(valor: float) -> float:
    return round(valor + 0.0, 3)


async def _fuso(db: AsyncSession, tenant_id: uuid.UUID) -> ZoneInfo:
    return ZoneInfo(
        await configuracoes.valor(db, tenant_id, "geral.fuso_horario", "America/Sao_Paulo")
    )


async def competencia_de(db: AsyncSession, tenant_id: uuid.UUID, quando: datetime) -> str:
    """Competência AAAAMM no fuso do tenant (seção 4 do prompt)."""
    return _utc(quando).astimezone(await _fuso(db, tenant_id)).strftime("%Y%m")


async def _fim_do_dia(db: AsyncSession, tenant_id: uuid.UUID, dia: date) -> datetime:
    fuso = await _fuso(db, tenant_id)
    return datetime.combine(dia + timedelta(days=1), time.min, tzinfo=fuso).astimezone(timezone.utc)


async def _auditar(db, ator, tenant_id, acao, recurso, recurso_id, cliente, **extra) -> None:
    await registrar(
        db,
        acao=acao,
        usuario=ator,
        tenant_id=tenant_id,
        recurso=recurso,
        recurso_id=recurso_id,
        cliente=cliente,
        **extra,
    )


# ── Cadastros (B.4-001…005) ─────────────────────────────────────────────────
async def produto(db: AsyncSession, tenant_id: uuid.UUID, produto_id: uuid.UUID) -> Produto:
    item = await db.scalar(
        select(Produto).where(Produto.id == produto_id, Produto.tenant_id == tenant_id)
    )
    if item is None:
        raise NotFound("Produto não encontrado.")
    return item


async def criar_produto(db, tenant_id, dados: ProdutoCreate, ator, cliente) -> Produto:
    if await db.scalar(
        select(Produto.id).where(Produto.tenant_id == tenant_id, Produto.codigo == dados.codigo)
    ):
        raise Conflict("Já existe produto com este código.", code="codigo_duplicado")
    if dados.lista_controle and not dados.controlado:
        raise Unprocessable(
            "Lista de controle exige produto controlado.", code="lista_sem_controle"
        )
    item = Produto(
        tenant_id=tenant_id, **dados.model_dump(), criado_por_id=ator.id, atualizado_por_id=ator.id
    )
    db.add(item)
    await db.flush()
    await _auditar(
        db,
        ator,
        tenant_id,
        "CRIAR",
        "produto_estoque",
        item.id,
        cliente,
        dados_depois={"codigo": item.codigo},
    )
    await db.commit()
    await db.refresh(item)
    return item


async def listar_produtos(db, tenant_id, busca: str | None = None) -> list[Produto]:
    stmt = select(Produto).where(Produto.tenant_id == tenant_id, Produto.baixa_em.is_(None))
    if busca:
        stmt = stmt.where(func.lower(Produto.nome).contains(busca.lower()))
    return list((await db.scalars(stmt.order_by(Produto.nome).limit(100))).all())


async def atualizar_produto(
    db, tenant_id, produto_id, dados: ProdutoUpdate, versao: int, ator, cliente
) -> Produto:
    item = await produto(db, tenant_id, produto_id)
    if item.versao != versao:
        raise Conflict(
            "Produto alterado por outro usuário.",
            code="conflito_versao",
            extra={"versao_atual": item.versao},
        )
    antes = {k: getattr(item, k) for k in dados.model_dump(exclude_unset=True)}
    for chave, valor in dados.model_dump(exclude_unset=True).items():
        setattr(item, chave, valor)
    if item.lista_controle and not item.controlado:
        raise Unprocessable(
            "Lista de controle exige produto controlado.", code="lista_sem_controle"
        )
    item.versao += 1
    item.atualizado_por_id = ator.id
    await _auditar(
        db,
        ator,
        tenant_id,
        "ATUALIZAR",
        "produto_estoque",
        item.id,
        cliente,
        dados_antes=antes,
        dados_depois=dados.model_dump(exclude_unset=True),
    )
    await db.commit()
    await db.refresh(item)
    return item


async def local(
    db: AsyncSession, tenant_id: uuid.UUID, local_id: uuid.UUID, ator: Usuario, permissao: Permissao
) -> LocalEstoque:
    """Cross-tenant ou fora do escopo do estabelecimento → 404."""
    item = await db.scalar(
        select(LocalEstoque).where(LocalEstoque.id == local_id, LocalEstoque.tenant_id == tenant_id)
    )
    if item is None or not escopo_permite(
        ator, permissao, estabelecimento_id=item.estabelecimento_id
    ):
        raise NotFound("Local de estoque não encontrado.")
    return item


async def criar_local(db, tenant_id, dados: LocalCreate, ator, cliente) -> LocalEstoque:
    estab = await db.scalar(
        select(Estabelecimento.id).where(
            Estabelecimento.id == dados.estabelecimento_id, Estabelecimento.tenant_id == tenant_id
        )
    )
    if not estab or not escopo_permite(
        ator, Permissao.ESTOQUE_AJUSTAR, estabelecimento_id=dados.estabelecimento_id
    ):
        raise NotFound("Estabelecimento não encontrado.")
    if await db.scalar(
        select(LocalEstoque.id).where(
            LocalEstoque.tenant_id == tenant_id, LocalEstoque.nome == dados.nome
        )
    ):
        raise Conflict("Já existe local com este nome.", code="nome_duplicado")
    item = LocalEstoque(
        tenant_id=tenant_id, **dados.model_dump(), criado_por_id=ator.id, atualizado_por_id=ator.id
    )
    db.add(item)
    await db.flush()
    await _auditar(
        db,
        ator,
        tenant_id,
        "CRIAR",
        "local_estoque",
        item.id,
        cliente,
        dados_depois={"nome": item.nome},
    )
    await db.commit()
    await db.refresh(item)
    return item


async def listar_locais(db, tenant_id, ator) -> list[LocalEstoque]:
    linhas = (
        await db.scalars(
            select(LocalEstoque)
            .where(LocalEstoque.tenant_id == tenant_id, LocalEstoque.baixa_em.is_(None))
            .order_by(LocalEstoque.nome)
        )
    ).all()
    return [
        x
        for x in linhas
        if escopo_permite(ator, Permissao.ESTOQUE_LER, estabelecimento_id=x.estabelecimento_id)
    ]


async def definir_parametro(
    db, tenant_id, local_id, dados: ParametroSet, ator, cliente
) -> ParametroEstoque:
    """B.4-004 — mínimo/máximo/ponto de pedido; nova gravação incrementa a versão."""
    loc = await local(db, tenant_id, local_id, ator, Permissao.ESTOQUE_AJUSTAR)
    await produto(db, tenant_id, dados.produto_id)
    item = await db.scalar(
        select(ParametroEstoque).where(
            ParametroEstoque.tenant_id == tenant_id,
            ParametroEstoque.local_id == loc.id,
            ParametroEstoque.produto_id == dados.produto_id,
        )
    )
    valores = dados.model_dump(exclude={"produto_id"})
    if item is None:
        item = ParametroEstoque(
            tenant_id=tenant_id,
            local_id=loc.id,
            produto_id=dados.produto_id,
            **valores,
            criado_por_id=ator.id,
            atualizado_por_id=ator.id,
        )
        db.add(item)
    else:
        for chave, valor in valores.items():
            setattr(item, chave, valor)
        item.versao += 1
        item.atualizado_por_id = ator.id
    await db.flush()
    await _auditar(
        db,
        ator,
        tenant_id,
        "ATUALIZAR",
        "parametro_estoque",
        item.id,
        cliente,
        dados_depois=valores,
    )
    await db.commit()
    await db.refresh(item)
    return item


async def listar_lotes(db, tenant_id, produto_id) -> list[Lote]:
    await produto(db, tenant_id, produto_id)
    return list(
        (
            await db.scalars(
                select(Lote)
                .where(Lote.tenant_id == tenant_id, Lote.produto_id == produto_id)
                .order_by(Lote.validade)
            )
        ).all()
    )


async def bloquear_lote(
    db, tenant_id, lote_id, bloqueado: bool, motivo: str, ator, cliente
) -> Lote:
    """B.4-002 — bloqueio/desbloqueio de lote com motivo auditado."""
    item = await db.scalar(select(Lote).where(Lote.id == lote_id, Lote.tenant_id == tenant_id))
    if item is None:
        raise NotFound("Lote não encontrado.")
    if item.bloqueado == bloqueado:
        raise Conflict("O lote já está nesta situação.", code="sem_alteracao")
    item.bloqueado = bloqueado
    item.bloqueio_motivo = motivo
    item.versao += 1
    item.atualizado_por_id = ator.id
    await _auditar(
        db,
        ator,
        tenant_id,
        "ATUALIZAR",
        "lote_estoque",
        item.id,
        cliente,
        dados_depois={"bloqueado": bloqueado},
        justificativa=motivo,
    )
    await db.commit()
    await db.refresh(item)
    return item


def exigir_controlado(ator: Usuario, prod: Produto) -> None:
    """B.4-035 — acesso reforçado: controlado só movimenta/dispensa com permissão própria."""
    if prod.controlado and not tem_permissao(ator, Permissao.ESTOQUE_CONTROLADOS):
        raise PermissionDenied("Medicamento controlado exige a permissão estoque:controlados.")


# ── Ledger (B.4-006/007/009/012/018/036) ────────────────────────────────────
async def saldo(
    db: AsyncSession,
    tenant_id: uuid.UUID,
    *,
    local_id: uuid.UUID | None = None,
    produto_id: uuid.UUID | None = None,
    lote_id: uuid.UUID | None = None,
    ate: datetime | None = None,
) -> float:
    stmt = select(func.coalesce(func.sum(Movimentacao.quantidade), 0)).where(
        Movimentacao.tenant_id == tenant_id
    )
    if local_id:
        stmt = stmt.where(Movimentacao.local_id == local_id)
    if produto_id:
        stmt = stmt.where(Movimentacao.produto_id == produto_id)
    if lote_id:
        stmt = stmt.where(Movimentacao.lote_id == lote_id)
    if ate:
        stmt = stmt.where(Movimentacao.ocorrido_em < ate)
    return _q(float(await db.scalar(stmt) or 0))


async def custos(
    db: AsyncSession, tenant_id: uuid.UUID, produto_id: uuid.UUID, ate: datetime | None = None
) -> dict:
    """B.4-006 — custo médio ponderado móvel e custo da última aquisição."""
    stmt = select(Movimentacao).where(
        Movimentacao.tenant_id == tenant_id, Movimentacao.produto_id == produto_id
    )
    if ate:
        stmt = stmt.where(Movimentacao.ocorrido_em < ate)
    quantidade, medio, ultimo = 0.0, None, None
    for mov in (
        await db.scalars(stmt.order_by(Movimentacao.ocorrido_em, Movimentacao.created_at))
    ).all():
        if mov.tipo == "ENTRADA" and mov.custo_unitario is not None:
            base = max(quantidade, 0.0)
            medio = (
                mov.custo_unitario
                if medio is None or base <= EPSILON
                else (
                    (base * medio + mov.quantidade * mov.custo_unitario) / (base + mov.quantidade)
                )
            )
            ultimo = mov.custo_unitario
        quantidade += mov.quantidade
    return {
        "custo_medio": round(medio, 4) if medio is not None else None,
        "custo_ultima_aquisicao": ultimo,
    }


async def _movimentavel(
    db: AsyncSession,
    tenant_id: uuid.UUID,
    local_id: uuid.UUID,
    competencia: str,
    *,
    inventario: bool = False,
) -> None:
    if not inventario and await db.scalar(
        select(Inventario.id).where(
            Inventario.tenant_id == tenant_id,
            Inventario.local_id == local_id,
            Inventario.situacao == "ABERTO",
        )
    ):
        raise Conflict("Local com inventário aberto não movimenta.", code="inventario_aberto")
    if await db.scalar(
        select(CompetenciaEstoque.id).where(
            CompetenciaEstoque.tenant_id == tenant_id,
            CompetenciaEstoque.competencia == competencia,
            CompetenciaEstoque.encerrada_em.is_not(None),
        )
    ):
        raise Conflict(f"Competência {competencia} encerrada.", code="competencia_encerrada")


async def _lancar(
    db,
    tenant_id,
    ator,
    *,
    local_id,
    produto_id,
    lote_id,
    tipo,
    quantidade,
    ocorrido_em,
    competencia,
    custo_unitario=None,
    documento=None,
    motivo=None,
    referencia_tipo=None,
    referencia_id=None,
    centro_custo=None,
) -> Movimentacao:
    sinal = 1 if tipo in POSITIVOS else -1
    mov = Movimentacao(
        tenant_id=tenant_id,
        local_id=local_id,
        produto_id=produto_id,
        lote_id=lote_id,
        tipo=tipo,
        quantidade=_q(sinal * abs(quantidade)),
        custo_unitario=custo_unitario,
        ocorrido_em=ocorrido_em,
        competencia=competencia,
        documento=documento,
        motivo=motivo,
        referencia_tipo=referencia_tipo,
        referencia_id=referencia_id,
        centro_custo=centro_custo,
        criado_por_id=ator.id,
        atualizado_por_id=ator.id,
    )
    db.add(mov)
    await db.flush()
    return mov


async def _consumir(
    db,
    tenant_id,
    ator,
    *,
    local_id,
    produto_id,
    quantidade,
    lote_id,
    tipo,
    ocorrido_em,
    competencia,
    documento=None,
    motivo=None,
    referencia_tipo=None,
    referencia_id=None,
    centro_custo=None,
) -> list[Movimentacao]:
    """Saída por lote informado ou FEFO; lote bloqueado/vencido não sai (B.4-012)."""
    hoje = _utc(ocorrido_em).date()
    if lote_id:
        lote = await db.scalar(
            select(Lote)
            .where(Lote.id == lote_id, Lote.tenant_id == tenant_id, Lote.produto_id == produto_id)
            .with_for_update()
        )
        if lote is None:
            raise NotFound("Lote não encontrado para o produto.")
        candidatos = [lote]
    else:
        candidatos = list(
            (
                await db.scalars(
                    select(Lote)
                    .where(
                        Lote.tenant_id == tenant_id,
                        Lote.produto_id == produto_id,
                        Lote.bloqueado.is_(False),
                        Lote.validade >= hoje,
                    )
                    .order_by(Lote.validade, Lote.numero)
                    .with_for_update()
                )
            ).all()
        )
    for lote in candidatos:
        if tipo in BAIXA_DE_LOTE_INDISPONIVEL:
            break
        if lote.bloqueado:
            raise Conflict(
                f"Lote {lote.numero} bloqueado: {lote.bloqueio_motivo}", code="lote_bloqueado"
            )
        if lote.validade < hoje:
            raise Conflict(f"Lote {lote.numero} vencido.", code="lote_vencido")
    custo = (await custos(db, tenant_id, produto_id))["custo_medio"]
    restante, lancados = quantidade, []
    for lote in candidatos:
        if restante <= EPSILON:
            break
        disponivel = await saldo(db, tenant_id, local_id=local_id, lote_id=lote.id)
        usar = min(disponivel, restante)
        if usar <= EPSILON:
            continue
        lancados.append(
            await _lancar(
                db,
                tenant_id,
                ator,
                local_id=local_id,
                produto_id=produto_id,
                lote_id=lote.id,
                tipo=tipo,
                quantidade=usar,
                ocorrido_em=ocorrido_em,
                competencia=competencia,
                custo_unitario=custo,
                documento=documento,
                motivo=motivo,
                referencia_tipo=referencia_tipo,
                referencia_id=referencia_id,
                centro_custo=centro_custo,
            )
        )
        restante = _q(restante - usar)
    if restante > EPSILON:
        raise Conflict(
            "Saldo insuficiente.",
            code="saldo_insuficiente",
            extra={"faltam": restante, "produto_id": str(produto_id)},
        )
    return lancados


async def _lote_entrada(db, tenant_id, ator, produto_id, dados: MovimentacaoCreate) -> Lote:
    if dados.lote_id:
        lote = await db.scalar(
            select(Lote).where(
                Lote.id == dados.lote_id, Lote.tenant_id == tenant_id, Lote.produto_id == produto_id
            )
        )
        if lote is None:
            raise NotFound("Lote não encontrado para o produto.")
        return lote
    if not dados.lote_numero or not dados.validade:
        raise Unprocessable(
            "Entrada exige lote_id ou lote_numero + validade.", code="lote_obrigatorio"
        )
    lote = await db.scalar(
        select(Lote).where(
            Lote.tenant_id == tenant_id,
            Lote.produto_id == produto_id,
            Lote.numero == dados.lote_numero,
        )
    )
    if lote is not None:
        if lote.validade != dados.validade:
            raise Conflict(
                "Lote já cadastrado com outra validade.", code="lote_validade_divergente"
            )
        return lote
    lote = Lote(
        tenant_id=tenant_id,
        produto_id=produto_id,
        numero=dados.lote_numero,
        validade=dados.validade,
        fabricante=dados.fabricante,
        criado_por_id=ator.id,
        atualizado_por_id=ator.id,
    )
    db.add(lote)
    await db.flush()
    return lote


async def movimentar(db, tenant_id, dados: MovimentacaoCreate, ator, cliente) -> list[Movimentacao]:
    """B.4-009/012 — entrada, saída, perda, devolução, doação, consumo interno e ajuste."""
    ajuste = dados.tipo.startswith("AJUSTE")
    if ajuste and not tem_permissao(ator, Permissao.ESTOQUE_AJUSTAR):
        raise PermissionDenied("Ajuste de estoque exige permissão específica.")
    loc = await local(
        db,
        tenant_id,
        dados.local_id,
        ator,
        Permissao.ESTOQUE_AJUSTAR if ajuste else Permissao.ESTOQUE_MOVIMENTAR,
    )
    prod = await produto(db, tenant_id, dados.produto_id)
    if prod.baixa_em is not None:
        raise Conflict("Produto baixado não movimenta.", code="produto_baixado")
    exigir_controlado(ator, prod)
    if dados.tipo == "VENCIMENTO":
        if dados.lote_id is None:
            raise Unprocessable("Baixa por vencimento exige o lote.", code="lote_obrigatorio")
        lote = await db.scalar(
            select(Lote).where(Lote.id == dados.lote_id, Lote.tenant_id == tenant_id)
        )
        if lote is not None and lote.validade >= _utc(dados.ocorrido_em or _agora()).date():
            raise Unprocessable("O lote ainda não venceu.", code="lote_nao_vencido")
    if dados.tipo in EXIGE_MOTIVO and len((dados.motivo or "").strip()) < 5:
        raise Unprocessable("Este tipo de movimentação exige motivo.", code="motivo_obrigatorio")
    ocorrido = _utc(dados.ocorrido_em or _agora())
    if ocorrido > _agora() + timedelta(minutes=5):
        raise Unprocessable("Movimentação não pode ser futura.", code="data_futura")
    competencia = await competencia_de(db, tenant_id, ocorrido)
    await _movimentavel(db, tenant_id, loc.id, competencia)
    comum = {
        "ocorrido_em": ocorrido,
        "competencia": competencia,
        "documento": dados.documento,
        "motivo": dados.motivo,
        "centro_custo": dados.centro_custo,
    }
    if dados.tipo in POSITIVOS:
        if dados.tipo == "ENTRADA" and dados.custo_unitario is None:
            raise Unprocessable("Entrada exige custo unitário (B.4-006).", code="custo_obrigatorio")
        lote = await _lote_entrada(db, tenant_id, ator, prod.id, dados)
        movs = [
            await _lancar(
                db,
                tenant_id,
                ator,
                local_id=loc.id,
                produto_id=prod.id,
                lote_id=lote.id,
                tipo=dados.tipo,
                quantidade=dados.quantidade,
                custo_unitario=dados.custo_unitario,
                **comum,
            )
        ]
    else:
        movs = await _consumir(
            db,
            tenant_id,
            ator,
            local_id=loc.id,
            produto_id=prod.id,
            quantidade=dados.quantidade,
            lote_id=dados.lote_id,
            tipo=dados.tipo,
            **comum,
        )
    for mov in movs:
        await _auditar(
            db,
            ator,
            tenant_id,
            "CRIAR",
            "movimentacao_estoque",
            mov.id,
            cliente,
            dados_depois={"tipo": mov.tipo, "quantidade": mov.quantidade},
            justificativa=dados.motivo,
        )
    await db.commit()
    return movs


async def extrato(
    db, tenant_id, local_id, ator, produto_id=None, inicio=None, fim=None
) -> list[Movimentacao]:
    loc = await local(db, tenant_id, local_id, ator, Permissao.ESTOQUE_LER)
    stmt = select(Movimentacao).where(
        Movimentacao.tenant_id == tenant_id, Movimentacao.local_id == loc.id
    )
    if produto_id:
        stmt = stmt.where(Movimentacao.produto_id == produto_id)
    if inicio:
        stmt = stmt.where(
            Movimentacao.ocorrido_em >= await _fim_do_dia(db, tenant_id, inicio - timedelta(days=1))
        )
    if fim:
        stmt = stmt.where(Movimentacao.ocorrido_em < await _fim_do_dia(db, tenant_id, fim))
    return list(
        (
            await db.scalars(
                stmt.order_by(Movimentacao.ocorrido_em, Movimentacao.created_at).limit(500)
            )
        ).all()
    )


async def posicao(db, tenant_id, local_id, ator, em: date | None = None, produto_id=None) -> dict:
    """B.4-027 — saldo por produto × lote em qualquer data, com custo médio."""
    loc = await local(db, tenant_id, local_id, ator, Permissao.ESTOQUE_LER)
    ate = await _fim_do_dia(db, tenant_id, em) if em else None
    stmt = (
        select(Movimentacao.produto_id, Movimentacao.lote_id, func.sum(Movimentacao.quantidade))
        .where(Movimentacao.tenant_id == tenant_id, Movimentacao.local_id == loc.id)
        .group_by(Movimentacao.produto_id, Movimentacao.lote_id)
    )
    if ate:
        stmt = stmt.where(Movimentacao.ocorrido_em < ate)
    if produto_id:
        stmt = stmt.where(Movimentacao.produto_id == produto_id)
    por_produto: dict[uuid.UUID, dict] = {}
    for pid, lid, total in (await db.execute(stmt)).all():
        if abs(float(total)) <= EPSILON:
            continue
        lote = await db.get(Lote, lid)
        prod = por_produto.get(pid)
        if prod is None:
            p = await db.get(Produto, pid)
            prod = por_produto[pid] = {
                "produto_id": pid,
                "codigo": p.codigo,
                "nome": p.nome,
                "quantidade": 0.0,
                "lotes": [],
                **await custos(db, tenant_id, pid, ate),
            }
        prod["quantidade"] = _q(prod["quantidade"] + float(total))
        prod["lotes"].append(
            {
                "lote_id": lid,
                "numero": lote.numero,
                "validade": lote.validade,
                "bloqueado": lote.bloqueado,
                "quantidade": _q(float(total)),
            }
        )
    itens = sorted(por_produto.values(), key=lambda x: x["nome"])
    for item in itens:
        medio = item["custo_medio"]
        item["valor_total"] = round(item["quantidade"] * medio, 2) if medio is not None else None
    pendentes = (
        await db.scalars(
            select(Requisicao)
            .where(
                Requisicao.tenant_id == tenant_id,
                Requisicao.situacao.in_(("SOLICITADA", "ATENDIDA", "ATENDIDA_PARCIAL")),
                (Requisicao.origem_local_id == loc.id) | (Requisicao.destino_local_id == loc.id),
            )
            .order_by(Requisicao.created_at)
        )
    ).all()
    # B.4-027 — pedidos pendentes junto do saldo.
    pedidos = [
        {
            "requisicao_id": r.id,
            "numero": r.numero,
            "situacao": r.situacao,
            "papel": "FORNECEDOR" if r.origem_local_id == loc.id else "SOLICITANTE",
            "itens": r.itens,
        }
        for r in pendentes
    ]
    return {"local_id": loc.id, "data_referencia": em, "itens": itens, "pedidos_pendentes": pedidos}


# ── Requisições e transferências (B.4-014/015) ──────────────────────────────
async def _requisicao(db, tenant_id, requisicao_id) -> Requisicao:
    item = await db.scalar(
        select(Requisicao)
        .where(Requisicao.id == requisicao_id, Requisicao.tenant_id == tenant_id)
        .with_for_update()
    )
    if item is None:
        raise NotFound("Requisição não encontrada.")
    return item


async def _visivel(ator, db, tenant_id, req: Requisicao, permissao) -> None:
    origem = await db.get(LocalEstoque, req.origem_local_id)
    destino = await db.get(LocalEstoque, req.destino_local_id)
    if not any(
        escopo_permite(ator, permissao, estabelecimento_id=x.estabelecimento_id)
        for x in (origem, destino)
    ):
        raise NotFound("Requisição não encontrada.")


async def criar_requisicao(db, tenant_id, dados: RequisicaoCreate, ator, cliente) -> Requisicao:
    if dados.origem_local_id == dados.destino_local_id:
        raise Unprocessable("Origem e destino devem ser diferentes.", code="mesmo_local")
    destino = await local(db, tenant_id, dados.destino_local_id, ator, Permissao.ESTOQUE_MOVIMENTAR)
    origem = await db.scalar(
        select(LocalEstoque).where(
            LocalEstoque.id == dados.origem_local_id, LocalEstoque.tenant_id == tenant_id
        )
    )
    if origem is None:
        raise NotFound("Local de origem não encontrado.")
    ids = [i.produto_id for i in dados.itens]
    if len(set(ids)) != len(ids):
        raise Unprocessable("Produto repetido na requisição.", code="produto_repetido")
    for pid in ids:
        await produto(db, tenant_id, pid)
    ano = _agora().year
    sequencia = (
        await db.scalar(
            select(func.count(Requisicao.id)).where(
                Requisicao.tenant_id == tenant_id, Requisicao.numero.like(f"{ano}-%")
            )
        )
    ) + 1
    item = Requisicao(
        tenant_id=tenant_id,
        numero=f"{ano}-{sequencia:06d}",
        origem_local_id=origem.id,
        destino_local_id=destino.id,
        itens=[
            {
                "produto_id": str(i.produto_id),
                "quantidade_solicitada": i.quantidade,
                "quantidade_atendida": None,
                "lotes": [],
            }
            for i in dados.itens
        ],
        observacao=dados.observacao,
        criado_por_id=ator.id,
        atualizado_por_id=ator.id,
    )
    db.add(item)
    await db.flush()
    await _auditar(
        db,
        ator,
        tenant_id,
        "CRIAR",
        "requisicao_estoque",
        item.id,
        cliente,
        dados_depois={"numero": item.numero},
    )
    await db.commit()
    await db.refresh(item)
    return item


async def obter_requisicao(db, tenant_id, requisicao_id, ator) -> Requisicao:
    item = await _requisicao(db, tenant_id, requisicao_id)
    await _visivel(ator, db, tenant_id, item, Permissao.ESTOQUE_LER)
    return item


async def atender_requisicao(
    db, tenant_id, requisicao_id, dados: RequisicaoAtender, ator, cliente
) -> Requisicao:
    """Origem atende total ou parcialmente; o saldo sai da origem (em trânsito)."""
    req = await _requisicao(db, tenant_id, requisicao_id)
    await local(db, tenant_id, req.origem_local_id, ator, Permissao.ESTOQUE_MOVIMENTAR)
    if req.situacao != "SOLICITADA":
        raise Conflict("Requisição não está aguardando atendimento.", code="situacao_invalida")
    pedido = {i.produto_id: i.quantidade for i in dados.itens}
    ocorrido = _agora()
    competencia = await competencia_de(db, tenant_id, ocorrido)
    await _movimentavel(db, tenant_id, req.origem_local_id, competencia)
    itens, parcial, total = [], False, 0.0
    for linha in req.itens:
        quantidade = pedido.pop(uuid.UUID(linha["produto_id"]), 0.0)
        if quantidade > linha["quantidade_solicitada"] + EPSILON:
            raise Unprocessable(
                "Quantidade atendida maior que a solicitada.", code="quantidade_excedente"
            )
        lotes = []
        if quantidade > 0:
            movs = await _consumir(
                db,
                tenant_id,
                ator,
                local_id=req.origem_local_id,
                produto_id=uuid.UUID(linha["produto_id"]),
                quantidade=quantidade,
                lote_id=None,
                tipo="TRANSFERENCIA_SAIDA",
                ocorrido_em=ocorrido,
                competencia=competencia,
                referencia_tipo="requisicao",
                referencia_id=req.id,
            )
            lotes = [
                {
                    "lote_id": str(m.lote_id),
                    "quantidade": -m.quantidade,
                    "custo_unitario": m.custo_unitario,
                }
                for m in movs
            ]
        parcial = parcial or quantidade + EPSILON < linha["quantidade_solicitada"]
        total += quantidade
        itens.append({**linha, "quantidade_atendida": quantidade, "lotes": lotes})
    if pedido:
        raise Unprocessable("Produto não pertence à requisição.", code="produto_fora_da_requisicao")
    if total <= EPSILON:
        raise Unprocessable("Nada a atender; cancele a requisição.", code="atendimento_vazio")
    req.itens = itens
    req.situacao = "ATENDIDA_PARCIAL" if parcial else "ATENDIDA"
    req.atendida_em = ocorrido
    req.versao += 1
    req.atualizado_por_id = ator.id
    await _auditar(
        db,
        ator,
        tenant_id,
        "ATUALIZAR",
        "requisicao_estoque",
        req.id,
        cliente,
        dados_depois={"situacao": req.situacao},
    )
    await db.commit()
    await db.refresh(req)
    return req


async def _devolver_lotes(db, tenant_id, ator, req: Requisicao, local_id, motivo=None) -> None:
    ocorrido = _agora()
    competencia = await competencia_de(db, tenant_id, ocorrido)
    await _movimentavel(db, tenant_id, local_id, competencia)
    for linha in req.itens:
        for lote in linha["lotes"]:
            await _lancar(
                db,
                tenant_id,
                ator,
                local_id=local_id,
                produto_id=uuid.UUID(linha["produto_id"]),
                lote_id=uuid.UUID(lote["lote_id"]),
                tipo="TRANSFERENCIA_ENTRADA",
                quantidade=lote["quantidade"],
                custo_unitario=lote.get("custo_unitario"),
                ocorrido_em=ocorrido,
                competencia=competencia,
                motivo=motivo,
                referencia_tipo="requisicao",
                referencia_id=req.id,
            )


async def receber_requisicao(db, tenant_id, requisicao_id, ator, cliente) -> Requisicao:
    """Aceite pelo destino: o saldo entra no destino com os mesmos lotes."""
    req = await _requisicao(db, tenant_id, requisicao_id)
    await local(db, tenant_id, req.destino_local_id, ator, Permissao.ESTOQUE_MOVIMENTAR)
    if req.situacao not in ("ATENDIDA", "ATENDIDA_PARCIAL"):
        raise Conflict("Requisição não está em trânsito.", code="situacao_invalida")
    await _devolver_lotes(db, tenant_id, ator, req, req.destino_local_id)
    req.situacao = "RECEBIDA"
    req.concluida_em = _agora()
    req.versao += 1
    req.atualizado_por_id = ator.id
    await _auditar(
        db,
        ator,
        tenant_id,
        "ATUALIZAR",
        "requisicao_estoque",
        req.id,
        cliente,
        dados_depois={"situacao": req.situacao},
    )
    await db.commit()
    await db.refresh(req)
    return req


async def recusar_requisicao(db, tenant_id, requisicao_id, motivo, ator, cliente) -> Requisicao:
    """Recusa pelo destino: o saldo volta à origem, com motivo."""
    req = await _requisicao(db, tenant_id, requisicao_id)
    await local(db, tenant_id, req.destino_local_id, ator, Permissao.ESTOQUE_MOVIMENTAR)
    if req.situacao not in ("ATENDIDA", "ATENDIDA_PARCIAL"):
        raise Conflict("Requisição não está em trânsito.", code="situacao_invalida")
    await _devolver_lotes(db, tenant_id, ator, req, req.origem_local_id, motivo)
    req.situacao = "RECUSADA"
    req.motivo_recusa = motivo
    req.concluida_em = _agora()
    req.versao += 1
    req.atualizado_por_id = ator.id
    await _auditar(
        db,
        ator,
        tenant_id,
        "ATUALIZAR",
        "requisicao_estoque",
        req.id,
        cliente,
        dados_depois={"situacao": req.situacao},
        justificativa=motivo,
    )
    await db.commit()
    await db.refresh(req)
    return req


async def cancelar_requisicao(db, tenant_id, requisicao_id, motivo, ator, cliente) -> Requisicao:
    req = await _requisicao(db, tenant_id, requisicao_id)
    await _visivel(ator, db, tenant_id, req, Permissao.ESTOQUE_MOVIMENTAR)
    if req.situacao != "SOLICITADA":
        raise Conflict("Só requisição não atendida pode ser cancelada.", code="situacao_invalida")
    req.situacao = "CANCELADA"
    req.motivo_recusa = motivo
    req.concluida_em = _agora()
    req.versao += 1
    await _auditar(
        db,
        ator,
        tenant_id,
        "ATUALIZAR",
        "requisicao_estoque",
        req.id,
        cliente,
        dados_depois={"situacao": req.situacao},
        justificativa=motivo,
    )
    await db.commit()
    await db.refresh(req)
    return req


# ── Inventário e competência (B.4-017/018) ──────────────────────────────────
async def abrir_inventario(db, tenant_id, local_id, ator, cliente) -> Inventario:
    loc = await local(db, tenant_id, local_id, ator, Permissao.ESTOQUE_INVENTARIO)
    if await db.scalar(
        select(Inventario.id).where(
            Inventario.tenant_id == tenant_id,
            Inventario.local_id == loc.id,
            Inventario.situacao == "ABERTO",
        )
    ):
        raise Conflict("Já há inventário aberto neste local.", code="inventario_aberto")
    item = Inventario(
        tenant_id=tenant_id,
        local_id=loc.id,
        contagens=[],
        criado_por_id=ator.id,
        atualizado_por_id=ator.id,
    )
    db.add(item)
    await db.flush()
    await _auditar(db, ator, tenant_id, "CRIAR", "inventario_estoque", item.id, cliente)
    await db.commit()
    await db.refresh(item)
    return item


async def _inventario(db, tenant_id, inventario_id, ator) -> Inventario:
    item = await db.scalar(
        select(Inventario).where(Inventario.id == inventario_id, Inventario.tenant_id == tenant_id)
    )
    if item is None:
        raise NotFound("Inventário não encontrado.")
    await local(db, tenant_id, item.local_id, ator, Permissao.ESTOQUE_INVENTARIO)
    if item.situacao != "ABERTO":
        raise Conflict("Inventário encerrado.", code="inventario_encerrado")
    return item


async def registrar_contagens(db, tenant_id, inventario_id, contagens, ator, cliente) -> Inventario:
    item = await _inventario(db, tenant_id, inventario_id, ator)
    atuais = {c["lote_id"]: c for c in item.contagens}
    for contagem in contagens:
        lote = await db.scalar(
            select(Lote).where(Lote.id == contagem.lote_id, Lote.tenant_id == tenant_id)
        )
        if lote is None:
            raise NotFound("Lote não encontrado.")
        atuais[str(lote.id)] = {
            "lote_id": str(lote.id),
            "produto_id": str(lote.produto_id),
            "quantidade": contagem.quantidade,
        }
    item.contagens = list(atuais.values())
    item.versao += 1
    item.atualizado_por_id = ator.id
    await _auditar(
        db,
        ator,
        tenant_id,
        "ATUALIZAR",
        "inventario_estoque",
        item.id,
        cliente,
        dados_depois={"contagens": len(item.contagens)},
    )
    await db.commit()
    await db.refresh(item)
    return item


async def encerrar_inventario(db, tenant_id, inventario_id, ator, cliente) -> Inventario:
    """Divergência contado × sistema vira ajuste no ledger, referenciando o inventário."""
    item = await _inventario(db, tenant_id, inventario_id, ator)
    if not item.contagens:
        raise Unprocessable("Inventário sem contagem.", code="inventario_vazio")
    ocorrido = _agora()
    competencia = await competencia_de(db, tenant_id, ocorrido)
    await _movimentavel(db, tenant_id, item.local_id, competencia, inventario=True)
    divergencias = []
    for c in item.contagens:
        sistema = await saldo(
            db, tenant_id, local_id=item.local_id, lote_id=uuid.UUID(c["lote_id"])
        )
        diferenca = _q(c["quantidade"] - sistema)
        if abs(diferenca) <= EPSILON:
            continue
        produto_id = uuid.UUID(c["produto_id"])
        await _lancar(
            db,
            tenant_id,
            ator,
            local_id=item.local_id,
            produto_id=produto_id,
            lote_id=uuid.UUID(c["lote_id"]),
            tipo="AJUSTE_POSITIVO" if diferenca > 0 else "AJUSTE_NEGATIVO",
            quantidade=abs(diferenca),
            custo_unitario=(await custos(db, tenant_id, produto_id))["custo_medio"],
            ocorrido_em=ocorrido,
            competencia=competencia,
            motivo="Ajuste de inventário",
            referencia_tipo="inventario",
            referencia_id=item.id,
        )
        divergencias.append({**c, "sistema": sistema, "diferenca": diferenca})
    item.divergencias = divergencias
    item.situacao = "ENCERRADO"
    item.encerrado_em = ocorrido
    item.versao += 1
    item.atualizado_por_id = ator.id
    await _auditar(
        db,
        ator,
        tenant_id,
        "ATUALIZAR",
        "inventario_estoque",
        item.id,
        cliente,
        dados_depois={"situacao": "ENCERRADO", "divergencias": len(divergencias)},
    )
    await db.commit()
    await db.refresh(item)
    return item


async def encerrar_competencia(
    db, tenant_id, competencia: str, ator, cliente
) -> CompetenciaEstoque:
    if competencia >= await competencia_de(db, tenant_id, _agora()):
        raise Unprocessable(
            "Só competência passada pode ser encerrada.", code="competencia_corrente"
        )
    item = await db.scalar(
        select(CompetenciaEstoque).where(
            CompetenciaEstoque.tenant_id == tenant_id, CompetenciaEstoque.competencia == competencia
        )
    )
    if item is not None and item.encerrada_em is not None:
        raise Conflict("Competência já encerrada.", code="competencia_encerrada")
    if item is None:
        item = CompetenciaEstoque(
            tenant_id=tenant_id, competencia=competencia, criado_por_id=ator.id
        )
        db.add(item)
    item.encerrada_em = _agora()
    item.atualizado_por_id = ator.id
    await db.flush()
    await _auditar(
        db,
        ator,
        tenant_id,
        "ATUALIZAR",
        "competencia_estoque",
        item.id,
        cliente,
        recurso_descricao=competencia,
        dados_depois={"encerrada": True},
    )
    await db.commit()
    await db.refresh(item)
    return item


async def reabrir_competencia(
    db, tenant_id, competencia: str, motivo: str, ator, cliente
) -> CompetenciaEstoque:
    item = await db.scalar(
        select(CompetenciaEstoque).where(
            CompetenciaEstoque.tenant_id == tenant_id, CompetenciaEstoque.competencia == competencia
        )
    )
    if item is None or item.encerrada_em is None:
        raise Conflict("Competência não está encerrada.", code="competencia_aberta")
    item.encerrada_em = None
    item.reaberta_motivo = motivo
    item.atualizado_por_id = ator.id
    await _auditar(
        db,
        ator,
        tenant_id,
        "ATUALIZAR",
        "competencia_estoque",
        item.id,
        cliente,
        recurso_descricao=competencia,
        dados_depois={"encerrada": False},
        justificativa=motivo,
    )
    await db.commit()
    await db.refresh(item)
    return item


# ── Dispensação (B.4-020…023) ───────────────────────────────────────────
async def _duplicidades(db, tenant_id, cidadao_id, produtos: set[str], janela: int) -> list[dict]:
    if janela <= 0:
        return []
    desde = _agora() - timedelta(days=janela)
    anteriores = (
        await db.scalars(
            select(Dispensacao).where(
                Dispensacao.tenant_id == tenant_id,
                Dispensacao.cidadao_id == cidadao_id,
                Dispensacao.estornada_em.is_(None),
                Dispensacao.created_at >= desde,
            )
        )
    ).all()
    achados = []
    for d in anteriores:
        for item in d.itens:
            if item["produto_id"] in produtos:
                achados.append(
                    {
                        "dispensacao_id": str(d.id),
                        "local_id": str(d.local_id),
                        "produto_id": item["produto_id"],
                        "em": _utc(d.created_at).isoformat(),
                    }
                )
    return achados


async def dispensar(db, tenant_id, dados: DispensacaoCreate, ator, cliente) -> Dispensacao:
    """B.4-020 total/parcial por lote; B.4-021 duplicidade em qualquer unidade bloqueia
    salvo justificativa auditada; controlado exige os campos do documento configurados."""
    loc = await local(db, tenant_id, dados.local_id, ator, Permissao.DISPENSACAO_CRIAR)
    if not await db.scalar(
        select(Cidadao.id).where(Cidadao.id == dados.cidadao_id, Cidadao.tenant_id == tenant_id)
    ):
        raise NotFound("Cidadão não encontrado.")
    if dados.prescricao_id:
        prescricao = await db.scalar(
            select(Prescricao).where(
                Prescricao.id == dados.prescricao_id, Prescricao.tenant_id == tenant_id
            )
        )
        if prescricao is None:
            raise NotFound("Prescrição não encontrada.")
        if prescricao.cidadao_id != dados.cidadao_id:
            raise Unprocessable("A prescrição é de outro cidadão.", code="cidadao_divergente")
    ids = [str(i.produto_id) for i in dados.itens]
    if len(set(ids)) != len(ids):
        raise Unprocessable("Produto repetido na dispensação.", code="produto_repetido")
    exigidos = await configuracoes.valor(db, tenant_id, "estoque.campos_documento_controlado", [])
    for item in dados.itens:
        prod = await produto(db, tenant_id, item.produto_id)
        exigir_controlado(ator, prod)
        if prod.controlado or prod.antimicrobiano:
            faltando = [c for c in exigidos if not (dados.documento or {}).get(c)]
            if not dados.documento or faltando:
                raise Unprocessable(
                    "Produto controlado/antimicrobiano exige documento de retenção.",
                    code="documento_obrigatorio",
                    errors=[
                        {
                            "campo": f"documento.{c}",
                            "mensagem": "Obrigatório.",
                            "codigo_regra": "estoque.campos_documento_controlado",
                        }
                        for c in (faltando or ["documento"])
                    ],
                )
    janela = int(await configuracoes.valor(db, tenant_id, "estoque.janela_duplicidade_dias", 30))
    duplicidades = await _duplicidades(db, tenant_id, dados.cidadao_id, set(ids), janela)
    if duplicidades and len((dados.justificativa or "").strip()) < 20:
        raise Conflict(
            "Já houve dispensação deste produto ao cidadão na janela configurada.",
            code="dispensacao_duplicada",
            extra={"duplicidades": duplicidades, "janela_dias": janela},
        )
    ocorrido = _agora()
    competencia = await competencia_de(db, tenant_id, ocorrido)
    await _movimentavel(db, tenant_id, loc.id, competencia)
    disp = Dispensacao(
        tenant_id=tenant_id,
        cidadao_id=dados.cidadao_id,
        local_id=loc.id,
        prescricao_id=dados.prescricao_id,
        situacao="TOTAL",
        itens=[],
        documento=dados.documento,
        alertas={"duplicidade": duplicidades, "janela_dias": janela} if duplicidades else None,
        justificativa=dados.justificativa if duplicidades else None,
        criado_por_id=ator.id,
        atualizado_por_id=ator.id,
    )
    db.add(disp)
    await db.flush()
    itens, parcial = [], False
    for item in dados.itens:
        movs = await _consumir(
            db,
            tenant_id,
            ator,
            local_id=loc.id,
            produto_id=item.produto_id,
            quantidade=item.quantidade,
            lote_id=item.lote_id,
            tipo="DISPENSACAO",
            ocorrido_em=ocorrido,
            competencia=competencia,
            documento=dados.documento,
            referencia_tipo="dispensacao",
            referencia_id=disp.id,
        )
        if item.quantidade_prescrita and item.quantidade + EPSILON < item.quantidade_prescrita:
            parcial = True
        itens.append(
            {
                "produto_id": str(item.produto_id),
                "quantidade": item.quantidade,
                "quantidade_prescrita": item.quantidade_prescrita,
                "lotes": [{"lote_id": str(m.lote_id), "quantidade": -m.quantidade} for m in movs],
            }
        )
    disp.itens = itens
    disp.situacao = "PARCIAL" if parcial else "TOTAL"
    await _auditar(
        db,
        ator,
        tenant_id,
        "CRIAR",
        "dispensacao",
        disp.id,
        cliente,
        dados_depois={"situacao": disp.situacao, "duplicidade": bool(duplicidades)},
        justificativa=disp.justificativa,
    )
    await db.commit()
    await db.refresh(disp)
    return disp


async def estornar_dispensacao(db, tenant_id, dispensacao_id, motivo, ator, cliente) -> Dispensacao:
    disp = await db.scalar(
        select(Dispensacao).where(
            Dispensacao.id == dispensacao_id, Dispensacao.tenant_id == tenant_id
        )
    )
    if disp is None:
        raise NotFound("Dispensação não encontrada.")
    await local(db, tenant_id, disp.local_id, ator, Permissao.DISPENSACAO_ESTORNAR)
    if disp.estornada_em:
        raise Conflict("Dispensação já estornada.", code="ja_estornada")
    for item in disp.itens:
        exigir_controlado(ator, await produto(db, tenant_id, uuid.UUID(item["produto_id"])))
    ocorrido = _agora()
    competencia = await competencia_de(db, tenant_id, ocorrido)
    await _movimentavel(db, tenant_id, disp.local_id, competencia)
    for item in disp.itens:
        for lote in item["lotes"]:
            await _lancar(
                db,
                tenant_id,
                ator,
                local_id=disp.local_id,
                produto_id=uuid.UUID(item["produto_id"]),
                lote_id=uuid.UUID(lote["lote_id"]),
                tipo="ESTORNO_DISPENSACAO",
                quantidade=lote["quantidade"],
                ocorrido_em=ocorrido,
                competencia=competencia,
                motivo=motivo,
                referencia_tipo="dispensacao",
                referencia_id=disp.id,
            )
    disp.estornada_em = ocorrido
    disp.estorno_motivo = motivo
    disp.versao += 1
    disp.atualizado_por_id = ator.id
    await _auditar(
        db,
        ator,
        tenant_id,
        "ATUALIZAR",
        "dispensacao",
        disp.id,
        cliente,
        dados_depois={"estornada": True},
        justificativa=motivo,
    )
    await db.commit()
    await db.refresh(disp)
    return disp


async def comprovante_dispensacao(db, tenant_id, dispensacao_id, ator, cliente) -> dict:
    """B.4-023 — dados do comprovante (a renderização em PDF fica no front/relatório)."""
    disp = await db.scalar(
        select(Dispensacao).where(
            Dispensacao.id == dispensacao_id, Dispensacao.tenant_id == tenant_id
        )
    )
    if disp is None:
        raise NotFound("Dispensação não encontrada.")
    loc = await local(db, tenant_id, disp.local_id, ator, Permissao.DISPENSACAO_LER)
    cidadao = await db.get(Cidadao, disp.cidadao_id)
    profissional = await db.get(Usuario, disp.criado_por_id) if disp.criado_por_id else None
    itens = []
    for item in disp.itens:
        prod = await produto(db, tenant_id, uuid.UUID(item["produto_id"]))
        for lote_info in item["lotes"]:
            lote = await db.get(Lote, uuid.UUID(lote_info["lote_id"]))
            itens.append(
                {
                    "produto": prod.nome,
                    "unidade": prod.unidade,
                    "lote": lote.numero,
                    "validade": lote.validade,
                    "quantidade": lote_info["quantidade"],
                }
            )
    await _auditar(db, ator, tenant_id, "IMPRIMIR", "dispensacao", disp.id, cliente)
    await db.commit()
    return {
        "dispensacao_id": disp.id,
        "data": disp.created_at,
        "situacao": disp.situacao,
        "estornada": disp.estornada_em is not None,
        "local": loc.nome,
        "cidadao": getattr(cidadao, "nome_social", None) or cidadao.nome,
        "profissional": profissional.nome if profissional else None,
        "documento": disp.documento,
        "itens": itens,
        "assinatura": {
            "situacao": "PENDENTE",
            "motivo": "assinatura do cidadão quando exigida pela política municipal",
        },
    }


async def historico_dispensacoes(db, tenant_id, cidadao_id, ator) -> list[Dispensacao]:
    """Histórico em qualquer unidade do tenant (B.4-021)."""
    if not await db.scalar(
        select(Cidadao.id).where(Cidadao.id == cidadao_id, Cidadao.tenant_id == tenant_id)
    ):
        raise NotFound("Cidadão não encontrado.")
    return list(
        (
            await db.scalars(
                select(Dispensacao)
                .where(Dispensacao.tenant_id == tenant_id, Dispensacao.cidadao_id == cidadao_id)
                .order_by(Dispensacao.created_at.desc())
                .limit(100)
            )
        ).all()
    )


# ── Temperatura (B.4-037) ───────────────────────────────────────────────────
async def registrar_temperatura(
    db, tenant_id, local_id, dados: TemperaturaCreate, ator, cliente
) -> RegistroTemperatura:
    loc = await local(db, tenant_id, local_id, ator, Permissao.ESTOQUE_MOVIMENTAR)
    fora = (loc.temperatura_min is not None and dados.temperatura < loc.temperatura_min) or (
        loc.temperatura_max is not None and dados.temperatura > loc.temperatura_max
    )
    item = RegistroTemperatura(
        tenant_id=tenant_id,
        local_id=loc.id,
        temperatura=dados.temperatura,
        medido_em=_utc(dados.medido_em or _agora()),
        fora_da_faixa=fora,
        origem=dados.origem,
        observacao=dados.observacao,
        criado_por_id=ator.id,
        atualizado_por_id=ator.id,
    )
    db.add(item)
    await db.flush()
    await _auditar(
        db,
        ator,
        tenant_id,
        "CRIAR",
        "temperatura_estoque",
        item.id,
        cliente,
        dados_depois={"fora_da_faixa": fora},
    )
    await db.commit()
    await db.refresh(item)
    return item


async def listar_temperaturas(db, tenant_id, local_id, ator) -> list[RegistroTemperatura]:
    loc = await local(db, tenant_id, local_id, ator, Permissao.ESTOQUE_LER)
    return list(
        (
            await db.scalars(
                select(RegistroTemperatura)
                .where(
                    RegistroTemperatura.tenant_id == tenant_id,
                    RegistroTemperatura.local_id == loc.id,
                )
                .order_by(RegistroTemperatura.medido_em.desc())
                .limit(200)
            )
        ).all()
    )


# ── Indicadores: consumo, alertas, ABC, sugestão (B.4-004/005/016/026) ───
async def _consumo_por_mes(db, tenant_id, local_id, produto_id, meses: int) -> list[float]:
    """Consumo dos últimos ``meses`` meses fechados (mais antigo primeiro)."""
    agora = _agora()
    fuso = await _fuso(db, tenant_id)
    inicio_mes = agora.astimezone(fuso).replace(day=1, hour=0, minute=0, second=0, microsecond=0)
    valores = []
    for k in range(meses, 0, -1):
        ano, mes = divmod(inicio_mes.month - 1 - k, 12)
        ini = inicio_mes.replace(year=inicio_mes.year + ano, month=mes + 1)
        ano2, mes2 = divmod(ini.month, 12)
        fim = ini.replace(year=ini.year + ano2, month=mes2 + 1)
        valores.append(await _consumo(db, tenant_id, local_id, produto_id, ini, fim))
    return valores


async def _consumo(db, tenant_id, local_id, produto_id, inicio: datetime, fim: datetime) -> float:
    total = await db.scalar(
        select(func.coalesce(func.sum(Movimentacao.quantidade), 0)).where(
            Movimentacao.tenant_id == tenant_id,
            Movimentacao.local_id == local_id,
            Movimentacao.produto_id == produto_id,
            Movimentacao.tipo.in_(CONSUMO),
            Movimentacao.ocorrido_em >= inicio,
            Movimentacao.ocorrido_em < fim,
        )
    )
    return _q(-float(total or 0))


async def _produtos_do_local(db, tenant_id, local_id) -> list[uuid.UUID]:
    movimentados = set(
        (
            await db.scalars(
                select(Movimentacao.produto_id)
                .where(Movimentacao.tenant_id == tenant_id, Movimentacao.local_id == local_id)
                .distinct()
            )
        ).all()
    )
    parametrizados = set(
        (
            await db.scalars(
                select(ParametroEstoque.produto_id).where(
                    ParametroEstoque.tenant_id == tenant_id, ParametroEstoque.local_id == local_id
                )
            )
        ).all()
    )
    return sorted(movimentados | parametrizados, key=str)


async def alertas(db, tenant_id, local_id, ator) -> dict:
    loc = await local(db, tenant_id, local_id, ator, Permissao.ESTOQUE_LER)
    dias_venc = int(await configuracoes.valor(db, tenant_id, "estoque.alerta_vencimento_dias", 90))
    desvios = float(await configuracoes.valor(db, tenant_id, "estoque.consumo_anormal_desvios", 2))
    meses = int(await configuracoes.valor(db, tenant_id, "estoque.consumo_meses_historico", 6))
    hoje = _agora().date()
    saida: dict[str, list] = defaultdict(list)
    for pid in await _produtos_do_local(db, tenant_id, loc.id):
        total = await saldo(db, tenant_id, local_id=loc.id, produto_id=pid)
        param = await db.scalar(
            select(ParametroEstoque).where(
                ParametroEstoque.tenant_id == tenant_id,
                ParametroEstoque.local_id == loc.id,
                ParametroEstoque.produto_id == pid,
            )
        )
        if param and param.minimo is not None and total < param.minimo:
            saida["abaixo_minimo"].append(
                {"produto_id": pid, "saldo": total, "minimo": param.minimo}
            )
        elif param and param.ponto_pedido is not None and total <= param.ponto_pedido:
            saida["ponto_pedido"].append(
                {"produto_id": pid, "saldo": total, "ponto_pedido": param.ponto_pedido}
            )
        for lote in (
            await db.scalars(
                select(Lote).where(Lote.tenant_id == tenant_id, Lote.produto_id == pid)
            )
        ).all():
            qtd = await saldo(db, tenant_id, local_id=loc.id, lote_id=lote.id)
            if qtd <= EPSILON:
                continue
            base = {
                "produto_id": pid,
                "lote_id": lote.id,
                "numero": lote.numero,
                "validade": lote.validade,
                "saldo": qtd,
            }
            if lote.validade < hoje:
                saida["vencidos"].append(base)
            elif lote.validade <= hoje + timedelta(days=dias_venc):
                saida["a_vencer"].append(base)
            if lote.bloqueado:
                saida["lote_bloqueado"].append({**base, "motivo": lote.bloqueio_motivo})
        historico = await _consumo_por_mes(db, tenant_id, loc.id, pid, meses)
        atual = await _consumo(db, tenant_id, loc.id, pid, _agora() - timedelta(days=30), _agora())
        com_dado = [v for v in historico if v > 0]
        if len(com_dado) >= 3:
            media, dp = statistics.mean(historico), statistics.pstdev(historico)
            if dp > 0 and atual > media + desvios * dp:
                saida["consumo_anormal"].append(
                    {
                        "produto_id": pid,
                        "consumo_30_dias": atual,
                        "media_mensal": round(media, 3),
                        "desvio_padrao": round(dp, 3),
                        "limiar": round(media + desvios * dp, 3),
                        "regra": (
                            f"consumo_30_dias > media + {desvios} × desvio_padrao ({meses} meses)"
                        ),
                    }
                )
    temperaturas = (
        await db.scalars(
            select(RegistroTemperatura).where(
                RegistroTemperatura.tenant_id == tenant_id,
                RegistroTemperatura.local_id == loc.id,
                RegistroTemperatura.fora_da_faixa.is_(True),
                RegistroTemperatura.medido_em >= _agora() - timedelta(days=7),
            )
        )
    ).all()
    saida["temperatura_fora_da_faixa"] = [
        {"registro_id": t.id, "temperatura": t.temperatura, "medido_em": t.medido_em}
        for t in temperaturas
    ]
    return {
        "local_id": loc.id,
        "parametros": {
            "alerta_vencimento_dias": dias_venc,
            "consumo_anormal_desvios": desvios,
            "consumo_meses_historico": meses,
        },
        **{
            k: saida.get(k, [])
            for k in (
                "abaixo_minimo",
                "ponto_pedido",
                "a_vencer",
                "vencidos",
                "lote_bloqueado",
                "consumo_anormal",
                "temperatura_fora_da_faixa",
            )
        },
        "frascos_abertos": {
            "situacao": "PENDENTE",
            "motivo": "regra de validade pós-abertura entra com imunização (Fase 10)",
        },
    }


async def curva_abc(db, tenant_id, local_id, inicio: date, fim: date, ator) -> dict:
    """B.4-026 — classes por valor consumido no período; limites configuráveis."""
    loc = await local(db, tenant_id, local_id, ator, Permissao.ESTOQUE_LER)
    if fim < inicio:
        raise Unprocessable("Período inválido.", code="periodo_invalido")
    limite_a, limite_b = await configuracoes.valor(
        db, tenant_id, "estoque.curva_abc_limites", [80, 95]
    )
    ini = await _fim_do_dia(db, tenant_id, inicio - timedelta(days=1))
    fim_ = await _fim_do_dia(db, tenant_id, fim)
    linhas = (
        await db.execute(
            select(
                Movimentacao.produto_id,
                func.sum(-Movimentacao.quantidade * func.coalesce(Movimentacao.custo_unitario, 0)),
                func.sum(-Movimentacao.quantidade),
            )
            .where(
                Movimentacao.tenant_id == tenant_id,
                Movimentacao.local_id == loc.id,
                Movimentacao.tipo.in_(CONSUMO),
                Movimentacao.ocorrido_em >= ini,
                Movimentacao.ocorrido_em < fim_,
            )
            .group_by(Movimentacao.produto_id)
        )
    ).all()
    itens = sorted(
        (
            {"produto_id": pid, "valor": round(float(v or 0), 2), "quantidade": _q(float(q or 0))}
            for pid, v, q in linhas
        ),
        key=lambda x: x["valor"],
        reverse=True,
    )
    total = sum(i["valor"] for i in itens) or 1.0
    acumulado = 0.0
    for item in itens:
        acumulado += item["valor"]
        item["percentual_acumulado"] = round(100 * acumulado / total, 2)
        anterior = item["percentual_acumulado"] - 100 * item["valor"] / total
        item["classe"] = "A" if anterior < limite_a else "B" if anterior < limite_b else "C"
    return {
        "local_id": loc.id,
        "inicio": inicio,
        "fim": fim,
        "limites": [limite_a, limite_b],
        "itens": itens,
        "regra": "ordena por valor consumido; classe pela participação acumulada antes do item",
    }


async def sugestao_compra(db, tenant_id, local_id, ator) -> dict:
    """B.4-005/026 — sugestão com memória de cálculo, cobertura e giro."""
    loc = await local(db, tenant_id, local_id, ator, Permissao.ESTOQUE_LER)
    meses = int(await configuracoes.valor(db, tenant_id, "estoque.sugestao_meses_historico", 3))
    cobertura_meses = float(
        await configuracoes.valor(db, tenant_id, "estoque.sugestao_cobertura_meses", 1)
    )
    itens = []
    for pid in await _produtos_do_local(db, tenant_id, loc.id):
        atual = await saldo(db, tenant_id, local_id=loc.id, produto_id=pid)
        historico = await _consumo_por_mes(db, tenant_id, loc.id, pid, meses)
        media = round(sum(historico) / meses, 3) if meses else 0.0
        param = await db.scalar(
            select(ParametroEstoque).where(
                ParametroEstoque.tenant_id == tenant_id,
                ParametroEstoque.local_id == loc.id,
                ParametroEstoque.produto_id == pid,
            )
        )
        if param and param.ideal is not None:
            alvo, origem = param.ideal, "parametro_ideal"
        elif param and param.maximo is not None:
            alvo, origem = param.maximo, "parametro_maximo"
        else:
            alvo, origem = round(media * cobertura_meses, 3), "consumo_medio_x_cobertura"
        sugerido = _q(max(0.0, alvo - atual))
        custo = (await custos(db, tenant_id, pid))["custo_medio"]
        itens.append(
            {
                "produto_id": pid,
                "quantidade_sugerida": sugerido,
                "valor_estimado": round(sugerido * custo, 2) if custo is not None else None,
                "cobertura_dias": round(atual / (media / 30), 1) if media > 0 else None,
                "giro_mensal": round(media / atual, 3) if atual > 0 else None,
                "memoria_calculo": {
                    "saldo_atual": atual,
                    "consumo_mensal": historico,
                    "consumo_medio_mensal": media,
                    "alvo": alvo,
                    "origem_alvo": origem,
                    "cobertura_meses": cobertura_meses,
                    "formula": "max(0, alvo - saldo_atual)",
                    "custo_medio": custo,
                },
            }
        )
    return {"local_id": loc.id, "itens": [i for i in itens if i["quantidade_sugerida"] > 0]}


# ── Integração com a prescrição (B.4-019, B.6-019) ───────────────────────────────────
async def disponibilidade(
    db: AsyncSession, tenant_id: uuid.UUID, estabelecimento_id: uuid.UUID | None, codigos: list[str]
) -> dict:
    """Saldo utilizável (lote não bloqueado e no prazo) nos locais do estabelecimento."""
    if estabelecimento_id is None or not codigos:
        return {"situacao": "NAO_AVALIADO", "motivo": "sem_estabelecimento_ou_codigo"}
    locais = (
        await db.scalars(
            select(LocalEstoque.id).where(
                LocalEstoque.tenant_id == tenant_id,
                LocalEstoque.estabelecimento_id == estabelecimento_id,
                LocalEstoque.baixa_em.is_(None),
            )
        )
    ).all()
    hoje = _agora().date()
    itens = []
    for codigo in dict.fromkeys(codigos):
        prod = await db.scalar(
            select(Produto).where(
                Produto.tenant_id == tenant_id,
                Produto.codigo_obm == codigo,
                Produto.baixa_em.is_(None),
            )
        )
        if prod is None:
            itens.append(
                {
                    "medicamento_codigo": codigo,
                    "disponivel": None,
                    "motivo": "produto_nao_cadastrado",
                }
            )
            continue
        total = 0.0
        if locais:
            total = float(
                await db.scalar(
                    select(func.coalesce(func.sum(Movimentacao.quantidade), 0))
                    .join(Lote, Lote.id == Movimentacao.lote_id)
                    .where(
                        Movimentacao.tenant_id == tenant_id,
                        Movimentacao.produto_id == prod.id,
                        Movimentacao.local_id.in_(locais),
                        Lote.bloqueado.is_(False),
                        Lote.validade >= hoje,
                    )
                )
                or 0
            )
        itens.append(
            {
                "medicamento_codigo": codigo,
                "produto_id": str(prod.id),
                "saldo": _q(total),
                "disponivel": total > EPSILON,
            }
        )
    return {"situacao": "AVALIADO", "itens": itens}


# ── Rastreabilidade por lote (B.4-036) ──────────────────────────────────────
async def rastreabilidade_lote(db, tenant_id, lote_id, ator, cliente) -> dict:
    """Da aquisição à dispensação/perda, nos locais do escopo do usuário.

    O cidadão de cada dispensação só aparece para quem tem ``dispensacao:ler``.
    """
    lote = await db.scalar(select(Lote).where(Lote.id == lote_id, Lote.tenant_id == tenant_id))
    if lote is None:
        raise NotFound("Lote não encontrado.")
    prod = await produto(db, tenant_id, lote.produto_id)
    movimentos = (
        await db.scalars(
            select(Movimentacao)
            .where(Movimentacao.tenant_id == tenant_id, Movimentacao.lote_id == lote.id)
            .order_by(Movimentacao.ocorrido_em, Movimentacao.created_at)
        )
    ).all()
    locais = {}
    ve_cidadao = tem_permissao(ator, Permissao.DISPENSACAO_LER)
    eventos, saldos, totais = [], defaultdict(float), defaultdict(float)
    for m in movimentos:
        if m.local_id not in locais:
            locais[m.local_id] = await db.get(LocalEstoque, m.local_id)
        loc = locais[m.local_id]
        if not escopo_permite(
            ator, Permissao.ESTOQUE_LER, estabelecimento_id=loc.estabelecimento_id
        ):
            continue
        evento = {
            "movimentacao_id": m.id,
            "ocorrido_em": m.ocorrido_em,
            "local_id": loc.id,
            "local": loc.nome,
            "tipo": m.tipo,
            "quantidade": m.quantidade,
            "custo_unitario": m.custo_unitario,
            "documento": m.documento,
            "motivo": m.motivo,
            "referencia_tipo": m.referencia_tipo,
            "referencia_id": m.referencia_id,
        }
        if m.referencia_tipo == "requisicao":
            req = await db.get(Requisicao, m.referencia_id)
            evento["requisicao_numero"] = req.numero if req else None
        if m.referencia_tipo == "dispensacao" and ve_cidadao:
            disp = await db.get(Dispensacao, m.referencia_id)
            evento["cidadao_id"] = disp.cidadao_id if disp else None
        eventos.append(evento)
        saldos[str(loc.id)] = _q(saldos[str(loc.id)] + m.quantidade)
        totais[m.tipo] = _q(totais[m.tipo] + abs(m.quantidade))
    await _auditar(
        db,
        ator,
        tenant_id,
        "READ_SENSIVEL",
        "lote_estoque",
        lote.id,
        cliente,
        finalidade="rastreabilidade_lote",
    )
    await db.commit()
    return {
        "lote": {
            "id": lote.id,
            "numero": lote.numero,
            "validade": lote.validade,
            "fabricante": lote.fabricante,
            "bloqueado": lote.bloqueado,
        },
        "produto": {"id": prod.id, "codigo": prod.codigo, "nome": prod.nome},
        "totais_por_tipo": dict(totais),
        "saldo_por_local": dict(saldos),
        "eventos": eventos,
    }


# ── Prescrições para a farmácia (B.4-019, B.6-019) ──────────────────────────
async def prescricoes_para_dispensacao(
    db, tenant_id, cidadao_id, local_id, ator, cliente
) -> list[dict]:
    """Só os dados necessários à dispensação (sem SOAP nem diagnóstico): itens,
    prescritor, assinatura, já dispensado e saldo no local da farmácia."""
    loc = await local(db, tenant_id, local_id, ator, Permissao.DISPENSACAO_CRIAR)
    if not await db.scalar(
        select(Cidadao.id).where(Cidadao.id == cidadao_id, Cidadao.tenant_id == tenant_id)
    ):
        raise NotFound("Cidadão não encontrado.")
    prescricoes = (
        await db.scalars(
            select(Prescricao)
            .where(Prescricao.tenant_id == tenant_id, Prescricao.cidadao_id == cidadao_id)
            .order_by(Prescricao.created_at.desc())
            .limit(20)
        )
    ).all()
    hoje = _agora().date()
    saida = []
    for p in prescricoes:
        prescritor = await db.get(Usuario, p.criado_por_id) if p.criado_por_id else None
        dispensado: dict[str, float] = defaultdict(float)
        for d in (
            await db.scalars(
                select(Dispensacao).where(
                    Dispensacao.tenant_id == tenant_id,
                    Dispensacao.prescricao_id == p.id,
                    Dispensacao.estornada_em.is_(None),
                )
            )
        ).all():
            for item in d.itens:
                dispensado[item["produto_id"]] += item["quantidade"]
        itens = []
        for item in p.itens:
            codigo = item.get("medicamento_codigo")
            prod = None
            if codigo:
                prod = await db.scalar(
                    select(Produto).where(
                        Produto.tenant_id == tenant_id,
                        Produto.codigo_obm == codigo,
                        Produto.baixa_em.is_(None),
                    )
                )
            disponivel = None
            if prod:
                disponivel = _q(
                    float(
                        await db.scalar(
                            select(func.coalesce(func.sum(Movimentacao.quantidade), 0))
                            .join(Lote, Lote.id == Movimentacao.lote_id)
                            .where(
                                Movimentacao.tenant_id == tenant_id,
                                Movimentacao.produto_id == prod.id,
                                Movimentacao.local_id == loc.id,
                                Lote.bloqueado.is_(False),
                                Lote.validade >= hoje,
                            )
                        )
                        or 0
                    )
                )
            itens.append(
                {
                    "descricao": item.get("descricao"),
                    "medicamento_codigo": codigo,
                    "posologia": item.get("posologia"),
                    "quantidade": item.get("quantidade"),
                    "uso_continuo": item.get("uso_continuo"),
                    "tipo_receituario": item.get("tipo_receituario"),
                    "produto_id": prod.id if prod else None,
                    "controlado": prod.controlado if prod else None,
                    "ja_dispensado": dispensado.get(str(prod.id), 0.0) if prod else 0.0,
                    "saldo_no_local": disponivel,
                }
            )
        saida.append(
            {
                "prescricao_id": p.id,
                "emitida_em": p.created_at,
                "assinada_em": p.assinada_em,
                "prescritor": prescritor.nome if prescritor else None,
                "itens": itens,
            }
        )
    await _auditar(
        db,
        ator,
        tenant_id,
        "READ_SENSIVEL",
        "prescricao",
        cidadao_id,
        cliente,
        finalidade="dispensacao_farmacia",
    )
    await db.commit()
    return saida
