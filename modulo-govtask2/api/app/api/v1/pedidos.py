"""Rotas de pedido. Toda a API de escrita do fluxo cabe aqui."""

import uuid
from datetime import date, datetime, timedelta, timezone

from fastapi import APIRouter, Depends, HTTPException, Query, Response, status
from sqlalchemy import func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import selectinload

from app.api.v1._montagem import detalhe, filtro_caixa, linha
from app.core.auth import get_current_user, get_user_permissions, require_permission
from app.core.database import get_db
from app.core.permissions import Perm
from app.models.auth_models import User
from app.models.pedido import (
    Andamento,
    Anexo,
    Encaminhamento,
    Medicao,
    Pedido,
    SituacaoPedido,
)
from app.schemas.pedido import (
    ComentarioRequest,
    ComplementoResponderRequest,
    ComplementoSolicitarRequest,
    DevolverRequest,
    EncaminharRequest,
    MedicaoRequest,
    MencionarRequest,
    MotivoRequest,
    PaginaPedidos,
    ParadaRequest,
    PedidoCriar,
    PedidoDetalhe,
    PedidoEditar,
    PrazoRequest,
    RascunhoRequest,
    TextoRequest,
    TransferirRequest,
)
from app.services import pedidos as servico
from app.services import planilhas

router = APIRouter(prefix="/pedidos", tags=["pedidos"])

XLSX = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"


def _resposta_xlsx(buffer, nome: str) -> Response:
    return Response(
        content=buffer.getvalue(),
        media_type=XLSX,
        headers={"Content-Disposition": f'attachment; filename="{nome}"'},
    )

GERENCIA = (Perm.PEDIDO_ENCAMINHAR, Perm.ADMIN)


def _carregado():
    """Relações necessárias para montar o detalhe sem disparar lazy load."""
    return (
        selectinload(Pedido.encaminhamentos).selectinload(Encaminhamento.responsavel),
        selectinload(Pedido.encaminhamentos).selectinload(Encaminhamento.criado_por),
        selectinload(Pedido.encaminhamentos).selectinload(Encaminhamento.anexos),
        selectinload(Pedido.encaminhamentos).selectinload(Encaminhamento.medicoes),
        selectinload(Pedido.medicoes).selectinload(Medicao.responsavel),
        selectinload(Pedido.medicoes).selectinload(Medicao.fotos),
        selectinload(Pedido.anexos).selectinload(Anexo.enviado_por),
        selectinload(Pedido.andamentos),
        selectinload(Pedido.responsavel_atual),
        selectinload(Pedido.criado_por),
    )


async def _buscar(db: AsyncSession, pedido_id: uuid.UUID, user: User) -> Pedido:
    result = await db.execute(
        select(Pedido)
        .where(
            Pedido.id == pedido_id,
            Pedido.organization_id == user.organization_id,
            Pedido.deleted_at.is_(None),
        )
        .options(*_carregado())
        .execution_options(populate_existing=True)
    )
    pedido = result.scalar_one_or_none()
    if pedido is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Pedido não encontrado."
        )
    return pedido


def _pode_ver(user: User, pedido: Pedido) -> bool:
    perms = get_user_permissions(user)
    if perms.intersection(GERENCIA) or Perm.PEDIDO_ENCAMINHAR in perms:
        return True
    # Departamento só vê a fila do seu setor, o que é dele ou onde foi mencionado.
    if Perm.PEDIDO_TRABALHAR in perms:
        if pedido.responsavel_atual_id == user.id:
            return True
        if pedido.responsavel_atual_id is None and pedido.setor_atual == user.setor:
            return True
        for enc in pedido.encaminhamentos:
            if str(user.id) in {str(x) for x in (enc.participantes or [])}:
                return True
        return False
    return True


async def _usuarios_do_pedido(db: AsyncSession, pedido: Pedido) -> dict:
    ids = set()
    for enc in pedido.encaminhamentos:
        ids.update(str(x) for x in (enc.participantes or []))
        if enc.responsavel_id:
            ids.add(str(enc.responsavel_id))
        if enc.criado_por_id:
            ids.add(str(enc.criado_por_id))
    for med in pedido.medicoes:
        if med.responsavel_id:
            ids.add(str(med.responsavel_id))
    if pedido.responsavel_atual_id:
        ids.add(str(pedido.responsavel_atual_id))
    if pedido.criado_por_id:
        ids.add(str(pedido.criado_por_id))
    if not ids:
        return {}
    result = await db.execute(select(User).where(User.id.in_([uuid.UUID(i) for i in ids])))
    return {str(u.id): u for u in result.scalars().all()}


async def _montar(db: AsyncSession, pedido: Pedido) -> PedidoDetalhe:
    usuarios = await _usuarios_do_pedido(db, pedido)
    return detalhe(pedido, usuarios)


async def _recarregar(db: AsyncSession, pedido: Pedido, user: User) -> PedidoDetalhe:
    await db.commit()
    return await _montar(db, await _buscar(db, pedido.id, user))


@router.get("", response_model=PaginaPedidos)
async def listar(
    response: Response,
    situacao: str | None = None,
    tipo: str | None = None,
    setor: str | None = None,
    prioridade: str | None = None,
    origem: str | None = None,
    parlamentar: str | None = Query(default=None, max_length=180),
    motivo_parada: str | None = None,
    responsavel_id: uuid.UUID | None = None,
    comigo: bool = False,
    abertos: bool = False,
    atrasados: bool = False,
    parados_dias: int | None = Query(default=None, ge=1, le=3650),
    prazo_de: date | None = None,
    prazo_ate: date | None = None,
    q: str | None = Query(default=None, max_length=120),
    pagina: int = Query(default=1, ge=1),
    tamanho: int = Query(default=25, ge=1, le=100),
    user: User = Depends(require_permission(Perm.PEDIDO_VER)),
    db: AsyncSession = Depends(get_db),
):
    filtros = [
        Pedido.organization_id == user.organization_id,
        Pedido.deleted_at.is_(None),
    ]
    perms = get_user_permissions(user)
    if Perm.PEDIDO_TRABALHAR in perms and not perms.intersection(GERENCIA):
        filtros.append(filtro_caixa(user))
    if situacao:
        filtros.append(Pedido.situacao == situacao)
    if tipo:
        filtros.append(Pedido.tipo == tipo)
    if setor:
        filtros.append(Pedido.setor_atual == setor)
    if prioridade:
        filtros.append(Pedido.prioridade == prioridade)
    if origem:
        filtros.append(Pedido.origem == origem)
    if parlamentar:
        filtros.append(Pedido.origem_nome.ilike(parlamentar.strip()))
    if motivo_parada:
        filtros.append(Pedido.motivo_parada == motivo_parada)
    if responsavel_id:
        filtros.append(Pedido.responsavel_atual_id == responsavel_id)
    if parados_dias:
        limite = datetime.now(timezone.utc) - timedelta(days=parados_dias)
        filtros += [
            func.coalesce(Pedido.situacao_desde, Pedido.ultima_movimentacao_em) < limite,
            Pedido.situacao.notin_(
                [SituacaoPedido.CONCLUIDO.value, SituacaoPedido.CANCELADO.value]
            ),
        ]
    if prazo_de:
        filtros.append(Pedido.prazo_atual >= prazo_de)
    if prazo_ate:
        filtros.append(Pedido.prazo_atual <= prazo_ate)
    if comigo:
        filtros.append(Pedido.responsavel_atual_id == user.id)
    if abertos:
        filtros.append(
            Pedido.situacao.in_(
                [
                    SituacaoPedido.COM_ASSESSOR.value,
                    SituacaoPedido.EM_SETOR.value,
                    SituacaoPedido.AGUARDANDO_TERCEIRO.value,
                ]
            )
        )
    if atrasados:
        filtros += [
            Pedido.prazo_atual < datetime.now(timezone.utc).date(),
            Pedido.situacao.notin_(
                [SituacaoPedido.CONCLUIDO.value, SituacaoPedido.CANCELADO.value]
            ),
        ]
    if q:
        termo = f"%{q.strip()}%"
        filtros.append(
            or_(
                Pedido.titulo.ilike(termo),
                Pedido.numero.ilike(termo),
                Pedido.origem_nome.ilike(termo),
                Pedido.protocolo_externo.ilike(termo),
                Pedido.protocolo_orgao.ilike(termo),
                Pedido.emenda.ilike(termo),
                Pedido.descricao.ilike(termo),
                select(Anexo.id)
                .where(
                    Anexo.pedido_id == Pedido.id,
                    Anexo.deleted_at.is_(None),
                    Anexo.nome_original.ilike(termo),
                )
                .exists(),
                select(Andamento.id)
                .where(
                    Andamento.pedido_id == Pedido.id,
                    Andamento.texto.ilike(termo),
                )
                .exists(),
            )
        )

    total = await db.scalar(select(func.count(Pedido.id)).where(*filtros)) or 0
    result = await db.execute(
        select(Pedido)
        .where(*filtros)
        .options(
            selectinload(Pedido.responsavel_atual),
            selectinload(Pedido.encaminhamentos).selectinload(Encaminhamento.responsavel),
            selectinload(Pedido.anexos),
        )
        .order_by(
            Pedido.prazo_atual.asc().nullslast(),
            Pedido.created_at.desc(),
        )
        .offset((pagina - 1) * tamanho)
        .limit(tamanho)
    )
    itens = [linha(p) for p in result.scalars().unique().all()]
    response.headers["X-Total-Count"] = str(total)
    return PaginaPedidos(itens=itens, total=total, pagina=pagina, tamanho=tamanho)


@router.post("", response_model=PedidoDetalhe, status_code=status.HTTP_201_CREATED)
async def criar(
    body: PedidoCriar,
    user: User = Depends(require_permission(Perm.PEDIDO_CRIAR)),
    db: AsyncSession = Depends(get_db),
):
    try:
        pedido = await servico.abrir_pedido(
            db,
            autor=user,
            titulo=body.titulo,
            tipo=body.tipo.value,
            descricao=body.descricao,
            origem=body.origem.value,
            origem_nome=body.origem_nome,
            valor_previsto=body.valor_previsto,
            prioridade=body.prioridade.value,
            emenda=body.emenda,
            partido=body.partido,
            endereco=body.endereco,
        )
        return await _recarregar(db, pedido, user)
    except IntegrityError:
        await db.rollback()
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Outro pedido foi criado neste instante. Tente de novo.",
        )


@router.get("/exportar.xlsx")
async def exportar_xlsx(
    situacao: str | None = None,
    tipo: str | None = None,
    setor: str | None = None,
    prioridade: str | None = None,
    origem: str | None = None,
    comigo: bool = False,
    abertos: bool = False,
    atrasados: bool = False,
    parados_dias: int | None = Query(default=None, ge=1, le=3650),
    q: str | None = Query(default=None, max_length=120),
    user: User = Depends(require_permission(Perm.PEDIDO_VER)),
    db: AsyncSession = Depends(get_db),
):
    """Lista consolidada em Excel, com o mesmo recorte dos filtros da tela."""
    filtros = [
        Pedido.organization_id == user.organization_id,
        Pedido.deleted_at.is_(None),
    ]
    perms = get_user_permissions(user)
    if Perm.PEDIDO_TRABALHAR in perms and not perms.intersection(GERENCIA):
        filtros.append(filtro_caixa(user))
    if situacao:
        filtros.append(Pedido.situacao == situacao)
    if tipo:
        filtros.append(Pedido.tipo == tipo)
    if setor:
        filtros.append(Pedido.setor_atual == setor)
    if prioridade:
        filtros.append(Pedido.prioridade == prioridade)
    if origem:
        filtros.append(Pedido.origem == origem)
    if comigo:
        filtros.append(Pedido.responsavel_atual_id == user.id)
    if abertos:
        filtros.append(
            Pedido.situacao.in_(
                [
                    SituacaoPedido.COM_ASSESSOR.value,
                    SituacaoPedido.EM_SETOR.value,
                    SituacaoPedido.AGUARDANDO_TERCEIRO.value,
                ]
            )
        )
    if atrasados:
        filtros += [
            Pedido.prazo_atual < datetime.now(timezone.utc).date(),
            Pedido.situacao.notin_(
                [SituacaoPedido.CONCLUIDO.value, SituacaoPedido.CANCELADO.value]
            ),
        ]
    if parados_dias:
        limite = datetime.now(timezone.utc) - timedelta(days=parados_dias)
        filtros.append(Pedido.ultima_movimentacao_em < limite)
    if q:
        filtros.append(Pedido.titulo.ilike(f"%{q.strip()}%"))

    result = await db.execute(
        select(Pedido)
        .where(*filtros)
        .options(
            selectinload(Pedido.responsavel_atual),
            selectinload(Pedido.encaminhamentos).selectinload(Encaminhamento.responsavel),
            selectinload(Pedido.anexos),
        )
        .order_by(Pedido.prazo_atual.asc().nullslast(), Pedido.created_at.desc())
    )
    itens = [linha(p) for p in result.scalars().unique().all()]
    return _resposta_xlsx(planilhas.workbook_da_lista(itens), "pedidos.xlsx")


@router.get("/{pedido_id}/relatorio.xlsx")
async def relatorio_xlsx(
    pedido_id: uuid.UUID,
    user: User = Depends(require_permission(Perm.PEDIDO_VER)),
    db: AsyncSession = Depends(get_db),
):
    """Relatório completo do pedido em Excel: dados, tramitação, anexos, medições e histórico."""
    pedido = await _buscar(db, pedido_id, user)
    if not _pode_ver(user, pedido):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN, detail="Sem acesso a este pedido."
        )
    detalhe = await _montar(db, pedido)
    return _resposta_xlsx(
        planilhas.workbook_do_pedido(detalhe), f"pedido-{pedido.numero.replace('/', '-')}.xlsx"
    )


@router.get("/{pedido_id}", response_model=PedidoDetalhe)
async def obter(
    pedido_id: uuid.UUID,
    user: User = Depends(require_permission(Perm.PEDIDO_VER)),
    db: AsyncSession = Depends(get_db),
):
    pedido = await _buscar(db, pedido_id, user)
    if not _pode_ver(user, pedido):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN, detail="Sem acesso a este pedido."
        )
    return await _montar(db, pedido)


@router.patch("/{pedido_id}", response_model=PedidoDetalhe)
async def editar(
    pedido_id: uuid.UUID,
    body: PedidoEditar,
    user: User = Depends(require_permission(Perm.PEDIDO_ENCAMINHAR)),
    db: AsyncSession = Depends(get_db),
):
    pedido = await _buscar(db, pedido_id, user)
    await servico.editar(
        db, pedido, autor=user, dados=body.model_dump(exclude_unset=True)
    )
    return await _recarregar(db, pedido, user)


@router.post("/{pedido_id}/encaminhar", response_model=PedidoDetalhe)
async def encaminhar(
    pedido_id: uuid.UUID,
    body: EncaminharRequest,
    user: User = Depends(require_permission(*GERENCIA)),
    db: AsyncSession = Depends(get_db),
):
    pedido = await _buscar(db, pedido_id, user)
    await servico.encaminhar(
        db,
        pedido,
        autor=user,
        setor=body.setor,
        assunto=body.assunto,
        instrucoes=body.instrucoes,
        prazo=body.prazo,
        responsavel_id=body.responsavel_id,
        checklist=body.checklist,
    )
    return await _recarregar(db, pedido, user)


@router.post(
    "/{pedido_id}/encaminhamentos/{enc_id}/assumir", response_model=PedidoDetalhe
)
async def assumir(
    pedido_id: uuid.UUID,
    enc_id: uuid.UUID,
    user: User = Depends(require_permission(Perm.PEDIDO_TRABALHAR)),
    db: AsyncSession = Depends(get_db),
):
    pedido = await _buscar(db, pedido_id, user)
    await servico.assumir(db, pedido, servico.localizar(pedido, enc_id), autor=user)
    return await _recarregar(db, pedido, user)


@router.post(
    "/{pedido_id}/encaminhamentos/{enc_id}/transferir", response_model=PedidoDetalhe
)
async def transferir(
    pedido_id: uuid.UUID,
    enc_id: uuid.UUID,
    body: TransferirRequest,
    user: User = Depends(require_permission(Perm.PEDIDO_TRABALHAR)),
    db: AsyncSession = Depends(get_db),
):
    pedido = await _buscar(db, pedido_id, user)
    await servico.transferir(
        db,
        pedido,
        servico.localizar(pedido, enc_id),
        autor=user,
        novo_responsavel_id=body.responsavel_id,
        motivo=body.motivo,
    )
    return await _recarregar(db, pedido, user)


@router.post(
    "/{pedido_id}/encaminhamentos/{enc_id}/mencionar", response_model=PedidoDetalhe
)
async def mencionar(
    pedido_id: uuid.UUID,
    enc_id: uuid.UUID,
    body: MencionarRequest,
    user: User = Depends(require_permission(Perm.PEDIDO_TRABALHAR)),
    db: AsyncSession = Depends(get_db),
):
    pedido = await _buscar(db, pedido_id, user)
    await servico.mencionar(
        db,
        pedido,
        servico.localizar(pedido, enc_id),
        autor=user,
        usuarios_ids=body.usuarios_ids,
    )
    return await _recarregar(db, pedido, user)


@router.post(
    "/{pedido_id}/encaminhamentos/{enc_id}/complemento/solicitar",
    response_model=PedidoDetalhe,
)
async def solicitar_complemento(
    pedido_id: uuid.UUID,
    enc_id: uuid.UUID,
    body: ComplementoSolicitarRequest,
    user: User = Depends(require_permission(Perm.PEDIDO_TRABALHAR)),
    db: AsyncSession = Depends(get_db),
):
    pedido = await _buscar(db, pedido_id, user)
    await servico.solicitar_complemento(
        db, pedido, servico.localizar(pedido, enc_id), autor=user, texto=body.texto
    )
    return await _recarregar(db, pedido, user)


@router.post(
    "/{pedido_id}/encaminhamentos/{enc_id}/complemento/responder",
    response_model=PedidoDetalhe,
)
async def responder_complemento(
    pedido_id: uuid.UUID,
    enc_id: uuid.UUID,
    body: ComplementoResponderRequest,
    user: User = Depends(require_permission(*GERENCIA)),
    db: AsyncSession = Depends(get_db),
):
    pedido = await _buscar(db, pedido_id, user)
    await servico.responder_complemento(
        db, pedido, servico.localizar(pedido, enc_id), autor=user, texto=body.texto
    )
    return await _recarregar(db, pedido, user)


@router.post("/{pedido_id}/encaminhamentos/{enc_id}/prazo", response_model=PedidoDetalhe)
async def negociar_prazo(
    pedido_id: uuid.UUID,
    enc_id: uuid.UUID,
    body: PrazoRequest,
    user: User = Depends(require_permission(Perm.PEDIDO_TRABALHAR)),
    db: AsyncSession = Depends(get_db),
):
    pedido = await _buscar(db, pedido_id, user)
    await servico.negociar_prazo(
        db,
        pedido,
        servico.localizar(pedido, enc_id),
        autor=user,
        prazo=body.prazo,
        motivo=body.motivo,
    )
    return await _recarregar(db, pedido, user)


@router.post(
    "/{pedido_id}/encaminhamentos/{enc_id}/medicoes", response_model=PedidoDetalhe
)
async def registrar_medicao(
    pedido_id: uuid.UUID,
    enc_id: uuid.UUID,
    body: MedicaoRequest,
    user: User = Depends(require_permission(Perm.PEDIDO_TRABALHAR)),
    db: AsyncSession = Depends(get_db),
):
    pedido = await _buscar(db, pedido_id, user)
    await servico.registrar_medicao(
        db,
        pedido,
        servico.localizar(pedido, enc_id),
        autor=user,
        periodo_inicio=body.periodo_inicio,
        periodo_fim=body.periodo_fim,
        valor=body.valor,
        percentual_executado=body.percentual_executado,
        observacao=body.observacao,
    )
    return await _recarregar(db, pedido, user)


@router.post(
    "/{pedido_id}/encaminhamentos/{enc_id}/devolver", response_model=PedidoDetalhe
)
async def devolver(
    pedido_id: uuid.UUID,
    enc_id: uuid.UUID,
    body: DevolverRequest,
    user: User = Depends(require_permission(Perm.PEDIDO_TRABALHAR)),
    db: AsyncSession = Depends(get_db),
):
    pedido = await _buscar(db, pedido_id, user)
    await servico.devolver(
        db, pedido, servico.localizar(pedido, enc_id), autor=user, resultado=body.resultado
    )
    return await _recarregar(db, pedido, user)


@router.post("/{pedido_id}/aguardar-terceiro", response_model=PedidoDetalhe)
async def aguardar_terceiro(
    pedido_id: uuid.UUID,
    body: TextoRequest,
    user: User = Depends(require_permission(*GERENCIA)),
    db: AsyncSession = Depends(get_db),
):
    pedido = await _buscar(db, pedido_id, user)
    await servico.aguardar_terceiro(db, pedido, autor=user, texto=body.texto)
    return await _recarregar(db, pedido, user)


@router.post("/{pedido_id}/retomar", response_model=PedidoDetalhe)
async def retomar(
    pedido_id: uuid.UUID,
    body: TextoRequest,
    user: User = Depends(require_permission(*GERENCIA)),
    db: AsyncSession = Depends(get_db),
):
    pedido = await _buscar(db, pedido_id, user)
    await servico.retomar(db, pedido, autor=user, texto=body.texto)
    return await _recarregar(db, pedido, user)


@router.post("/{pedido_id}/concluir", response_model=PedidoDetalhe)
async def concluir(
    pedido_id: uuid.UUID,
    body: TextoRequest,
    user: User = Depends(require_permission(*GERENCIA)),
    db: AsyncSession = Depends(get_db),
):
    pedido = await _buscar(db, pedido_id, user)
    await servico.concluir(db, pedido, autor=user, observacao=body.texto)
    return await _recarregar(db, pedido, user)


@router.post("/{pedido_id}/cancelar", response_model=PedidoDetalhe)
async def cancelar(
    pedido_id: uuid.UUID,
    body: MotivoRequest,
    user: User = Depends(require_permission(*GERENCIA)),
    db: AsyncSession = Depends(get_db),
):
    pedido = await _buscar(db, pedido_id, user)
    await servico.cancelar(db, pedido, autor=user, motivo=body.motivo)
    return await _recarregar(db, pedido, user)


@router.post("/{pedido_id}/comentarios", response_model=PedidoDetalhe)
async def comentar(
    pedido_id: uuid.UUID,
    body: ComentarioRequest,
    user: User = Depends(require_permission(Perm.PEDIDO_VER)),
    db: AsyncSession = Depends(get_db),
):
    pedido = await _buscar(db, pedido_id, user)
    if not _pode_ver(user, pedido):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN, detail="Sem acesso a este pedido."
        )
    enc = servico.localizar(pedido, body.encaminhamento_id) if body.encaminhamento_id else None
    mencionados = []
    if body.mencionados_ids:
        result = await db.execute(
            select(User).where(
                User.id.in_(body.mencionados_ids),
                User.organization_id == user.organization_id,
            )
        )
        mencionados = list(result.scalars().all())
    await servico.comentar(
        db,
        pedido,
        autor=user,
        texto=body.texto,
        encaminhamento=enc,
        mencionados=mencionados,
        aguardando_resposta=body.aguardando_resposta,
    )
    return await _recarregar(db, pedido, user)


@router.put(
    "/{pedido_id}/encaminhamentos/{enc_id}/rascunho", response_model=PedidoDetalhe
)
async def salvar_rascunho(
    pedido_id: uuid.UUID,
    enc_id: uuid.UUID,
    body: RascunhoRequest,
    user: User = Depends(require_permission(Perm.PEDIDO_TRABALHAR, Perm.PEDIDO_ENCAMINHAR)),
    db: AsyncSession = Depends(get_db),
):
    """Salvamento automático da resposta que o setor está escrevendo."""
    pedido = await _buscar(db, pedido_id, user)
    await servico.salvar_rascunho(
        db,
        pedido,
        servico.localizar(pedido, enc_id),
        autor=user,
        texto=body.texto,
        checklist=[c.model_dump() for c in body.checklist] if body.checklist is not None else None,
    )
    return await _recarregar(db, pedido, user)


@router.post("/{pedido_id}/parada", response_model=PedidoDetalhe)
async def definir_parada(
    pedido_id: uuid.UUID,
    body: ParadaRequest,
    user: User = Depends(
        require_permission(Perm.PEDIDO_ENCAMINHAR, Perm.PEDIDO_TRABALHAR, Perm.ADMIN)
    ),
    db: AsyncSession = Depends(get_db),
):
    """Quem conduz ou quem executa diz por que o pedido não anda."""
    pedido = await _buscar(db, pedido_id, user)
    if not _pode_ver(user, pedido):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN, detail="Sem acesso a este pedido."
        )
    await servico.definir_parada(
        db,
        pedido,
        autor=user,
        motivo=body.motivo.value if body.motivo else None,
        texto=body.texto,
    )
    return await _recarregar(db, pedido, user)
