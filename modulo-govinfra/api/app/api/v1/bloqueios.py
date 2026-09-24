"""Bloqueios, motivos e verificação de elegibilidade (item 10)."""

import uuid
from datetime import date, datetime, timezone

from fastapi import APIRouter, Depends, Query, Request, status
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.v1.deps import (
    Paginacao,
    buscar_da_organizacao,
    cliente,
    nomes_de_usuarios,
    pagina_payload,
)
from app.core.auth import exigir
from app.core.database import get_db
from app.core.errors import AppError, Conflict
from app.core.permissoes import P
from app.models.bloqueios import Bloqueio, MotivoBloqueio
from app.models.enums import AcaoAuditoria, ServicoAfetado, SituacaoBloqueio
from app.models.organizacao import User
from app.models.pessoas import Imovel, Pessoa
from app.schemas import comuns
from app.schemas import pessoas as esquemas
from app.services import auditoria, elegibilidade

router = APIRouter(tags=["Bloqueios"])


@router.get("/bloqueios/motivos", summary="Motivos de bloqueio configurados")
async def listar_motivos(
    apenas_ativos: bool = True,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(exigir(P.BLOQUEIOS_VISUALIZAR)),
):
    condicoes = [MotivoBloqueio.organizacao_id == user.organizacao_id]
    if apenas_ativos:
        condicoes.append(MotivoBloqueio.ativo.is_(True))
    registros = (
        await db.execute(
            select(MotivoBloqueio).where(*condicoes).order_by(MotivoBloqueio.ordem, MotivoBloqueio.nome)
        )
    ).scalars().all()
    return [
        {
            "id": m.id,
            "chave": m.chave,
            "nome": m.nome,
            "descricao": m.descricao,
            "servico_padrao": m.servico_padrao,
            "tipo_padrao": m.tipo_padrao,
            "dias_padrao": m.dias_padrao,
            "exige_documento": m.exige_documento,
            "ativo": m.ativo,
            "ordem": m.ordem,
        }
        for m in registros
    ]


@router.post(
    "/bloqueios/motivos", status_code=status.HTTP_201_CREATED, summary="Cadastrar motivo de bloqueio"
)
async def criar_motivo(
    dados: esquemas.MotivoBloqueioEntrada,
    request: Request,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(exigir(P.CONFIGURACOES_EDITAR)),
):
    existente = await db.scalar(
        select(MotivoBloqueio).where(
            MotivoBloqueio.organizacao_id == user.organizacao_id,
            MotivoBloqueio.chave == dados.chave,
        )
    )
    if existente is not None:
        raise Conflict("Já existe um motivo com esta chave.")

    motivo = MotivoBloqueio(
        organizacao_id=user.organizacao_id, created_by_id=user.id, **dados.model_dump()
    )
    db.add(motivo)
    await db.flush()
    await auditoria.registrar(
        db,
        acao=AcaoAuditoria.ALTERAR_CONFIGURACAO,
        usuario=user,
        entidade="motivo_bloqueio",
        entidade_id=motivo.id,
        entidade_descricao=motivo.nome,
        dados_depois=auditoria.instantaneo(motivo),
        cliente=cliente(request),
    )
    await db.commit()
    return {"id": motivo.id, "mensagem": "Motivo cadastrado."}


async def _serializar_bloqueio(db: AsyncSession, bloqueio: Bloqueio, nomes: dict) -> dict:
    pessoa = await db.get(Pessoa, bloqueio.pessoa_id) if bloqueio.pessoa_id else None
    imovel = await db.get(Imovel, bloqueio.imovel_id) if bloqueio.imovel_id else None
    return {
        "id": bloqueio.id,
        "pessoa_id": bloqueio.pessoa_id,
        "pessoa_nome": pessoa.nome if pessoa else None,
        "imovel_id": bloqueio.imovel_id,
        "imovel_codigo": imovel.codigo if imovel else None,
        "motivo": bloqueio.motivo.nome if bloqueio.motivo else None,
        "servico_afetado": bloqueio.servico_afetado,
        "tipo": bloqueio.tipo,
        "descricao": bloqueio.descricao,
        "data_inicio": bloqueio.data_inicio,
        "data_fim": bloqueio.data_fim,
        "situacao": bloqueio.situacao,
        "observacoes": bloqueio.observacoes,
        "criado_por": nomes.get(bloqueio.created_by_id),
        "created_at": bloqueio.created_at,
        "revogado_em": bloqueio.revogado_em,
        "revogado_por": nomes.get(bloqueio.revogado_por_id),
        "justificativa_revogacao": bloqueio.justificativa_revogacao,
        "vigente": bloqueio.vigente_em(date.today()),
    }


@router.get("/bloqueios", summary="Listar bloqueios")
async def listar_bloqueios(
    pessoa_id: uuid.UUID | None = None,
    imovel_id: uuid.UUID | None = None,
    situacao: str | None = Query(None, description="ativo | encerrado | revogado"),
    servico: str | None = None,
    paginacao: Paginacao = Depends(),
    db: AsyncSession = Depends(get_db),
    user: User = Depends(exigir(P.BLOQUEIOS_VISUALIZAR)),
):
    condicoes = [Bloqueio.organizacao_id == user.organizacao_id]
    if pessoa_id:
        condicoes.append(Bloqueio.pessoa_id == pessoa_id)
    if imovel_id:
        condicoes.append(Bloqueio.imovel_id == imovel_id)
    if situacao:
        condicoes.append(Bloqueio.situacao == situacao)
    if servico:
        condicoes.append(Bloqueio.servico_afetado.in_([servico, ServicoAfetado.TODOS.value]))

    consulta = select(Bloqueio).where(*condicoes)
    total = await db.scalar(select(func.count()).select_from(consulta.subquery())) or 0
    registros = (
        await db.execute(
            consulta.order_by(Bloqueio.created_at.desc())
            .offset(paginacao.offset)
            .limit(paginacao.por_pagina)
        )
    ).scalars().all()

    nomes = await nomes_de_usuarios(
        db, [b.created_by_id for b in registros] + [b.revogado_por_id for b in registros]
    )
    itens = [await _serializar_bloqueio(db, b, nomes) for b in registros]
    return pagina_payload(itens, total, paginacao)


@router.post("/bloqueios", status_code=status.HTTP_201_CREATED, summary="Registrar bloqueio")
async def criar_bloqueio(
    dados: esquemas.BloqueioEntrada,
    request: Request,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(exigir(P.BLOQUEIOS_CRIAR)),
):
    if not dados.pessoa_id and not dados.imovel_id:
        raise AppError(
            "Informe ao menos a pessoa ou o imóvel a ser bloqueado.", 422, "alvo_obrigatorio"
        )
    if dados.pessoa_id:
        await buscar_da_organizacao(db, Pessoa, dados.pessoa_id, user, "Pessoa não encontrada.")
    if dados.imovel_id:
        await buscar_da_organizacao(db, Imovel, dados.imovel_id, user, "Imóvel não encontrado.")
    if dados.data_fim and dados.data_fim < dados.data_inicio:
        raise AppError("A data final não pode ser anterior à inicial.", 422, "periodo_invalido")

    bloqueio = Bloqueio(
        organizacao_id=user.organizacao_id,
        created_by_id=user.id,
        updated_by_id=user.id,
        situacao=SituacaoBloqueio.ATIVO.value,
        **dados.model_dump(),
    )
    db.add(bloqueio)
    await db.flush()

    await auditoria.registrar(
        db,
        acao=AcaoAuditoria.BLOQUEAR,
        usuario=user,
        entidade="bloqueio",
        entidade_id=bloqueio.id,
        entidade_descricao=f"Bloqueio de {dados.servico_afetado}",
        dados_depois=auditoria.instantaneo(bloqueio),
        cliente=cliente(request),
    )
    await db.commit()
    return {"id": bloqueio.id, "mensagem": "Bloqueio registrado."}


@router.post("/bloqueios/{bloqueio_id}/revogar", summary="Revogar bloqueio")
async def revogar_bloqueio(
    bloqueio_id: uuid.UUID,
    dados: comuns.Justificativa,
    request: Request,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(exigir(P.BLOQUEIOS_REMOVER)),
):
    """Revoga o bloqueio SEM apagar o histórico (exigência do item 10.3)."""
    bloqueio = await buscar_da_organizacao(db, Bloqueio, bloqueio_id, user, "Bloqueio não encontrado.")
    if bloqueio.situacao != SituacaoBloqueio.ATIVO.value:
        raise Conflict("Este bloqueio já não está ativo.")

    antes = auditoria.instantaneo(bloqueio)
    bloqueio.situacao = SituacaoBloqueio.REVOGADO.value
    bloqueio.revogado_por_id = user.id
    bloqueio.revogado_em = datetime.now(timezone.utc)
    bloqueio.justificativa_revogacao = dados.justificativa
    bloqueio.updated_by_id = user.id

    await auditoria.registrar(
        db,
        acao=AcaoAuditoria.DESBLOQUEAR,
        usuario=user,
        entidade="bloqueio",
        entidade_id=bloqueio.id,
        justificativa=dados.justificativa,
        dados_antes=antes,
        dados_depois=auditoria.instantaneo(bloqueio),
        cliente=cliente(request),
    )
    await db.commit()
    return {"mensagem": "Bloqueio revogado. O histórico permanece registrado."}


@router.get("/bloqueios/verificar", summary="Verificar elegibilidade de um atendimento")
async def verificar(
    pessoa_id: uuid.UUID,
    servico: str = Query("cacambas", description="cacambas | porteira_adentro"),
    imovel_id: uuid.UUID | None = None,
    data_desejada: date | None = None,
    dias_previstos: int | None = None,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(exigir(P.SOLICITACOES_VISUALIZAR)),
):
    """Pré-checagem usada pela tela antes de abrir o formulário.

    Devolve exatamente os mesmos impedimentos que a criação aplicaria — a tela
    apenas antecipa a informação; a decisão continua sendo do backend.
    """
    pessoa = await buscar_da_organizacao(db, Pessoa, pessoa_id, user, "Pessoa não encontrada.")
    imovel = (
        await buscar_da_organizacao(db, Imovel, imovel_id, user, "Imóvel não encontrado.")
        if imovel_id
        else None
    )

    if servico == ServicoAfetado.CACAMBAS.value:
        resultado = await elegibilidade.verificar_cacamba(
            db,
            user.organizacao_id,
            pessoa=pessoa,
            imovel=imovel,
            data_desejada=data_desejada,
            dias_previstos=dias_previstos,
        )
        return resultado.dict()

    # Para o Porteira Adentro a verificação completa depende do programa e do
    # saldo; aqui devolvemos a parte que não exige esse contexto.
    bloqueios = await elegibilidade.bloqueios_ativos(
        db,
        user.organizacao_id,
        pessoa_id=pessoa.id,
        imovel_id=imovel.id if imovel else None,
        servico=ServicoAfetado.PORTEIRA_ADENTRO.value,
        referencia=data_desejada or date.today(),
    )
    return {
        "elegivel": not bloqueios,
        "impedimentos": [
            {
                "codigo": "bloqueio_ativo",
                "mensagem": (
                    "Há bloqueio ativo: "
                    + (b.motivo.nome if b.motivo else "motivo não informado")
                ),
                "permite_excecao": True,
                "detalhes": {"bloqueio_id": str(b.id)},
            }
            for b in bloqueios
        ],
        "avisos": [],
        "permite_excecao": bool(bloqueios),
    }
