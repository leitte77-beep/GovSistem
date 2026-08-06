"""Cadastro e movimentação das caçambas municipais (item 11)."""

import uuid
from datetime import date

from fastapi import APIRouter, Depends, Query, Request, status
from sqlalchemy import func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.v1.deps import (
    Paginacao,
    buscar_da_organizacao,
    cliente,
    com_rotulo,
    nomes_de_usuarios,
    pagina_payload,
)
from app.core.auth import exigir
from app.core.database import get_db
from app.core.errors import AppError, Conflict
from app.core.permissoes import P
from app.core.security import token_consulta
from app.models.cacambas import (
    Cacamba,
    MovimentacaoCacamba,
    SolicitacaoCacamba,
    TipoResiduo,
)
from app.models.enums import (
    SOLICITACAO_ATIVA,
    AcaoAuditoria,
    SituacaoCacamba,
)
from app.models.organizacao import User
from app.schemas import cacambas as esquemas
from app.services import auditoria

router = APIRouter(tags=["Caçambas"])


async def registrar_movimentacao(
    db: AsyncSession,
    cacamba: Cacamba,
    *,
    nova_situacao: str,
    usuario_id: uuid.UUID | None,
    motivo: str | None = None,
    localizacao: str | None = None,
    latitude: float | None = None,
    longitude: float | None = None,
    solicitacao_id: uuid.UUID | None = None,
    veiculo_id: uuid.UUID | None = None,
    observacoes: str | None = None,
) -> MovimentacaoCacamba:
    """Muda a situação da caçamba gravando o histórico (item 11.3).

    Toda alteração de situação passa por aqui: não existe caminho que altere
    `cacamba.situacao` sem deixar rastro.
    """
    movimentacao = MovimentacaoCacamba(
        cacamba_id=cacamba.id,
        situacao_anterior=cacamba.situacao,
        situacao_nova=nova_situacao,
        localizacao_anterior=cacamba.localizacao_atual,
        localizacao_nova=localizacao or cacamba.localizacao_atual,
        solicitacao_id=solicitacao_id,
        veiculo_id=veiculo_id,
        motivo=motivo,
        observacoes=observacoes,
        latitude=latitude,
        longitude=longitude,
        created_by_id=usuario_id,
    )
    db.add(movimentacao)

    cacamba.situacao = nova_situacao
    if localizacao:
        cacamba.localizacao_atual = localizacao
    if latitude is not None and longitude is not None:
        cacamba.latitude = latitude
        cacamba.longitude = longitude
    cacamba.updated_by_id = usuario_id
    await db.flush()
    return movimentacao


def _resumo(cacamba: Cacamba) -> dict:
    return {
        "id": cacamba.id,
        "codigo": cacamba.codigo,
        "patrimonio": cacamba.patrimonio,
        "identificacao_visual": cacamba.identificacao_visual,
        "tipo": cacamba.tipo,
        "modelo": cacamba.modelo,
        "capacidade_m3": cacamba.capacidade_m3,
        "situacao": cacamba.situacao,
        "situacao_rotulo": com_rotulo(cacamba.situacao),
        "localizacao_atual": cacamba.localizacao_atual,
        "latitude": cacamba.latitude,
        "longitude": cacamba.longitude,
        "qr_code": cacamba.qr_code,
        "estado_conservacao": cacamba.estado_conservacao,
        "localizacao_padrao": cacamba.localizacao_padrao,
    }


@router.get("/cacambas", summary="Listar caçambas")
async def listar(
    termo: str | None = None,
    situacao: str | None = Query(None, description="Filtra por situação controlada"),
    disponiveis: bool = Query(False, description="Somente as disponíveis para reserva"),
    paginacao: Paginacao = Depends(),
    db: AsyncSession = Depends(get_db),
    user: User = Depends(exigir(P.CACAMBAS_VISUALIZAR)),
):
    condicoes = [Cacamba.organizacao_id == user.organizacao_id, Cacamba.deleted_at.is_(None)]
    if termo:
        condicoes.append(
            or_(
                Cacamba.codigo.ilike(f"%{termo}%"),
                Cacamba.patrimonio.ilike(f"%{termo}%"),
                Cacamba.identificacao_visual.ilike(f"%{termo}%"),
            )
        )
    if situacao:
        condicoes.append(Cacamba.situacao == situacao)
    if disponiveis:
        condicoes.append(Cacamba.situacao == SituacaoCacamba.DISPONIVEL.value)

    consulta = select(Cacamba).where(*condicoes)
    total = await db.scalar(select(func.count()).select_from(consulta.subquery())) or 0
    registros = (
        await db.execute(
            consulta.order_by(Cacamba.codigo).offset(paginacao.offset).limit(paginacao.por_pagina)
        )
    ).scalars().all()
    return pagina_payload([_resumo(c) for c in registros], total, paginacao)


@router.get("/cacambas/situacoes", summary="Situações possíveis e contagem atual")
async def situacoes(
    db: AsyncSession = Depends(get_db),
    user: User = Depends(exigir(P.CACAMBAS_VISUALIZAR)),
):
    """Alimenta os cards clicáveis do painel."""
    linhas = (
        await db.execute(
            select(Cacamba.situacao, func.count())
            .where(Cacamba.organizacao_id == user.organizacao_id, Cacamba.deleted_at.is_(None))
            .group_by(Cacamba.situacao)
        )
    ).all()
    contagem = {situacao: quantidade for situacao, quantidade in linhas}
    return [
        {
            "chave": situacao.value,
            "rotulo": com_rotulo(situacao.value),
            "quantidade": contagem.get(situacao.value, 0),
        }
        for situacao in SituacaoCacamba
    ]


@router.post("/cacambas", status_code=status.HTTP_201_CREATED, summary="Cadastrar caçamba")
async def criar(
    dados: esquemas.CacambaEntrada,
    request: Request,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(exigir(P.CACAMBAS_CRIAR)),
):
    existente = await db.scalar(
        select(Cacamba).where(
            Cacamba.organizacao_id == user.organizacao_id,
            Cacamba.codigo == dados.codigo,
            Cacamba.deleted_at.is_(None),
        )
    )
    if existente is not None:
        raise Conflict(f"Já existe uma caçamba com o código {dados.codigo}.")

    cacamba = Cacamba(
        organizacao_id=user.organizacao_id,
        created_by_id=user.id,
        updated_by_id=user.id,
        situacao=SituacaoCacamba.DISPONIVEL.value,
        qr_code=token_consulta(),
        **dados.model_dump(),
    )
    db.add(cacamba)
    await db.flush()

    await registrar_movimentacao(
        db,
        cacamba,
        nova_situacao=SituacaoCacamba.DISPONIVEL.value,
        usuario_id=user.id,
        motivo="Cadastro inicial",
        localizacao=dados.localizacao_padrao,
    )
    await auditoria.registrar(
        db,
        acao=AcaoAuditoria.CRIAR,
        usuario=user,
        entidade="cacamba",
        entidade_id=cacamba.id,
        entidade_descricao=cacamba.codigo,
        dados_depois=auditoria.instantaneo(cacamba),
        cliente=cliente(request),
    )
    await db.commit()
    return {"id": cacamba.id, "qr_code": cacamba.qr_code, "mensagem": "Caçamba cadastrada."}


@router.get("/cacambas/{cacamba_id}", summary="Detalhar caçamba")
async def detalhar(
    cacamba_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(exigir(P.CACAMBAS_VISUALIZAR)),
):
    cacamba = await buscar_da_organizacao(db, Cacamba, cacamba_id, user, "Caçamba não encontrada.")
    atual = await db.scalar(
        select(SolicitacaoCacamba)
        .where(
            SolicitacaoCacamba.cacamba_id == cacamba.id,
            SolicitacaoCacamba.situacao.in_(SOLICITACAO_ATIVA),
            SolicitacaoCacamba.deleted_at.is_(None),
        )
        .order_by(SolicitacaoCacamba.created_at.desc())
        .limit(1)
    )

    dias_em_uso = None
    if atual is not None and atual.data_prevista_entrega:
        dias_em_uso = (date.today() - atual.data_prevista_entrega).days

    base = _resumo(cacamba)
    base.update(
        {
            "tipo": cacamba.tipo,
            "modelo": cacamba.modelo,
            "comprimento_m": cacamba.comprimento_m,
            "largura_m": cacamba.largura_m,
            "altura_m": cacamba.altura_m,
            "cor": cacamba.cor,
            "data_aquisicao": cacamba.data_aquisicao,
            "valor_aquisicao": cacamba.valor_aquisicao,
            "estado_conservacao": cacamba.estado_conservacao,
            "localizacao_padrao": cacamba.localizacao_padrao,
            "ultima_vistoria_em": cacamba.ultima_vistoria_em,
            "proxima_vistoria_em": cacamba.proxima_vistoria_em,
            "observacoes": cacamba.observacoes,
            "data_baixa": cacamba.data_baixa,
            "motivo_baixa": cacamba.motivo_baixa,
            "created_at": cacamba.created_at,
            "row_version": cacamba.row_version,
            "dias_em_uso": max(dias_em_uso, 0) if dias_em_uso is not None else None,
            "solicitacao_atual": (
                {
                    "id": atual.id,
                    "protocolo": atual.protocolo_formatado,
                    "situacao": atual.situacao,
                    "endereco": f"{atual.logradouro or ''}, {atual.numero or ''}".strip(", "),
                    "data_prevista_retirada": atual.data_prevista_retirada,
                    "atrasada": atual.atrasada,
                }
                if atual
                else None
            ),
        }
    )
    return base


@router.put("/cacambas/{cacamba_id}", summary="Atualizar caçamba")
async def atualizar(
    cacamba_id: uuid.UUID,
    dados: esquemas.CacambaEntrada,
    request: Request,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(exigir(P.CACAMBAS_EDITAR)),
):
    cacamba = await buscar_da_organizacao(db, Cacamba, cacamba_id, user, "Caçamba não encontrada.")
    antes = auditoria.instantaneo(cacamba)
    for campo, valor in dados.model_dump(exclude_unset=True).items():
        setattr(cacamba, campo, valor)
    cacamba.updated_by_id = user.id
    cacamba.row_version = (cacamba.row_version or 1) + 1

    await auditoria.registrar(
        db,
        acao=AcaoAuditoria.ALTERAR,
        usuario=user,
        entidade="cacamba",
        entidade_id=cacamba.id,
        entidade_descricao=cacamba.codigo,
        dados_antes=antes,
        dados_depois=auditoria.instantaneo(cacamba),
        cliente=cliente(request),
    )
    await db.commit()
    return {"mensagem": "Caçamba atualizada."}


@router.post("/cacambas/{cacamba_id}/situacao", summary="Alterar situação da caçamba")
async def alterar_situacao(
    cacamba_id: uuid.UUID,
    dados: esquemas.MudancaSituacaoCacamba,
    request: Request,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(exigir(P.CACAMBAS_MOVIMENTAR)),
):
    cacamba = await buscar_da_organizacao(db, Cacamba, cacamba_id, user, "Caçamba não encontrada.")

    if dados.situacao not in SituacaoCacamba.valores():
        raise AppError("Situação inválida para caçamba.", 422, "situacao_invalida")
    if cacamba.situacao == SituacaoCacamba.BAIXADA.value:
        raise Conflict("Uma caçamba baixada não pode voltar a circular.")

    # Não é possível liberar uma caçamba que está atendendo alguém.
    if dados.situacao == SituacaoCacamba.DISPONIVEL.value:
        vinculada = await db.scalar(
            select(func.count())
            .select_from(SolicitacaoCacamba)
            .where(
                SolicitacaoCacamba.cacamba_id == cacamba.id,
                SolicitacaoCacamba.situacao.in_(SOLICITACAO_ATIVA),
                SolicitacaoCacamba.deleted_at.is_(None),
            )
        )
        if vinculada:
            raise Conflict(
                "Esta caçamba está vinculada a um atendimento em andamento. "
                "Conclua ou cancele a solicitação antes de liberá-la."
            )

    antes = cacamba.situacao
    await registrar_movimentacao(
        db,
        cacamba,
        nova_situacao=dados.situacao,
        usuario_id=user.id,
        motivo=dados.motivo,
        localizacao=dados.localizacao,
        latitude=dados.latitude,
        longitude=dados.longitude,
        observacoes=dados.observacoes,
    )
    await auditoria.registrar(
        db,
        acao=AcaoAuditoria.ALTERAR,
        usuario=user,
        entidade="cacamba",
        entidade_id=cacamba.id,
        entidade_descricao=cacamba.codigo,
        detalhe=f"Situação alterada de '{antes}' para '{dados.situacao}'",
        justificativa=dados.motivo,
        dados_antes={"situacao": antes},
        dados_depois={"situacao": dados.situacao},
        cliente=cliente(request),
    )
    await db.commit()
    return {"mensagem": f"Caçamba agora está como '{com_rotulo(dados.situacao)}'."}


@router.post("/cacambas/{cacamba_id}/baixa", summary="Dar baixa na caçamba")
async def dar_baixa(
    cacamba_id: uuid.UUID,
    dados: esquemas.BaixaCacamba,
    request: Request,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(exigir(P.CACAMBAS_BAIXAR)),
):
    cacamba = await buscar_da_organizacao(db, Cacamba, cacamba_id, user, "Caçamba não encontrada.")
    if cacamba.situacao == SituacaoCacamba.EM_USO.value:
        raise Conflict("Não é possível dar baixa em uma caçamba que está em uso.")

    antes = auditoria.instantaneo(cacamba)
    cacamba.data_baixa = dados.data_baixa
    cacamba.motivo_baixa = dados.motivo
    await registrar_movimentacao(
        db,
        cacamba,
        nova_situacao=SituacaoCacamba.BAIXADA.value,
        usuario_id=user.id,
        motivo=dados.motivo,
    )
    await auditoria.registrar(
        db,
        acao=AcaoAuditoria.EXCLUIR,
        usuario=user,
        entidade="cacamba",
        entidade_id=cacamba.id,
        entidade_descricao=cacamba.codigo,
        justificativa=dados.motivo,
        dados_antes=antes,
        dados_depois=auditoria.instantaneo(cacamba),
        cliente=cliente(request),
    )
    await db.commit()
    return {"mensagem": "Baixa registrada. O histórico da caçamba permanece disponível."}


@router.get("/cacambas/{cacamba_id}/movimentacoes", summary="Histórico da caçamba")
async def movimentacoes(
    cacamba_id: uuid.UUID,
    paginacao: Paginacao = Depends(),
    db: AsyncSession = Depends(get_db),
    user: User = Depends(exigir(P.CACAMBAS_VISUALIZAR)),
):
    await buscar_da_organizacao(db, Cacamba, cacamba_id, user, "Caçamba não encontrada.")
    consulta = select(MovimentacaoCacamba).where(MovimentacaoCacamba.cacamba_id == cacamba_id)
    total = await db.scalar(select(func.count()).select_from(consulta.subquery())) or 0
    registros = (
        await db.execute(
            consulta.order_by(MovimentacaoCacamba.created_at.desc())
            .offset(paginacao.offset)
            .limit(paginacao.por_pagina)
        )
    ).scalars().all()

    nomes = await nomes_de_usuarios(db, [m.created_by_id for m in registros])
    itens = [
        {
            "id": m.id,
            "situacao_anterior": m.situacao_anterior,
            "situacao_anterior_rotulo": com_rotulo(m.situacao_anterior) if m.situacao_anterior else None,
            "situacao_nova": m.situacao_nova,
            "situacao_nova_rotulo": com_rotulo(m.situacao_nova),
            "localizacao_anterior": m.localizacao_anterior,
            "localizacao_nova": m.localizacao_nova,
            "solicitacao_id": m.solicitacao_id,
            "motivo": m.motivo,
            "observacoes": m.observacoes,
            "created_at": m.created_at,
            "usuario": nomes.get(m.created_by_id),
        }
        for m in registros
    ]
    return pagina_payload(itens, total, paginacao)


# ── Tipos de resíduo (configuráveis) ─────────────────────────────────────────


@router.get("/tipos-residuo", summary="Tipos de resíduo e materiais proibidos")
async def listar_residuos(
    apenas_ativos: bool = True,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(exigir(P.SOLICITACOES_VISUALIZAR)),
):
    condicoes = [TipoResiduo.organizacao_id == user.organizacao_id]
    if apenas_ativos:
        condicoes.append(TipoResiduo.ativo.is_(True))
    registros = (
        await db.execute(
            select(TipoResiduo).where(*condicoes).order_by(TipoResiduo.ordem, TipoResiduo.nome)
        )
    ).scalars().all()
    return [
        {
            "id": t.id,
            "chave": t.chave,
            "nome": t.nome,
            "descricao": t.descricao,
            "proibido": t.proibido,
            "exige_autorizacao": t.exige_autorizacao,
            "destinacao_padrao": t.destinacao_padrao,
            "ativo": t.ativo,
            "ordem": t.ordem,
        }
        for t in registros
    ]


@router.post("/tipos-residuo", status_code=status.HTTP_201_CREATED, summary="Cadastrar tipo de resíduo")
async def criar_residuo(
    dados: esquemas.TipoResiduoEntrada,
    request: Request,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(exigir(P.CONFIGURACOES_EDITAR)),
):
    existente = await db.scalar(
        select(TipoResiduo).where(
            TipoResiduo.organizacao_id == user.organizacao_id, TipoResiduo.chave == dados.chave
        )
    )
    if existente is not None:
        raise Conflict("Já existe um tipo de resíduo com esta chave.")

    tipo = TipoResiduo(organizacao_id=user.organizacao_id, created_by_id=user.id, **dados.model_dump())
    db.add(tipo)
    await db.flush()
    await auditoria.registrar(
        db,
        acao=AcaoAuditoria.ALTERAR_CONFIGURACAO,
        usuario=user,
        entidade="tipo_residuo",
        entidade_id=tipo.id,
        entidade_descricao=tipo.nome,
        dados_depois=auditoria.instantaneo(tipo),
        cliente=cliente(request),
    )
    await db.commit()
    return {"id": tipo.id, "mensagem": "Tipo de resíduo cadastrado."}
