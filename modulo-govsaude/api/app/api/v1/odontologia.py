"""Rotas da Fase 7 — odontologia (B.3-001…027)."""

from __future__ import annotations

import uuid
from datetime import date

from fastapi import APIRouter, Depends, Header, Query, Request
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.auth import get_tenant_id
from app.core.autorizacao import exigir
from app.core.database import get_db
from app.core.permissoes import Permissao
from app.models.nucleo import Usuario
from app.schemas.odontologia import (
    AtendimentoCancelar,
    AtendimentoCreate,
    AtendimentoOut,
    AtendimentoUpdate,
    CondicaoCreate,
    CondicaoOut,
    CondicaoUpdate,
    DocumentoCreate,
    DocumentoOut,
    ExportacaoLediOut,
    OdontogramaAtualOut,
    OdontogramaCreate,
    OdontogramaOut,
    ProcedimentoCancelar,
    ProcedimentoCreate,
    ProcedimentoOut,
    ProcedimentoRealizar,
    RelatorioOut,
)
from app.services import odontologia
from app.services.auditoria import dados_do_cliente
from app.services.rede_comum import exigir_versao

router = APIRouter(prefix="/odontologia", tags=["Odontologia"])

Tenant = Depends(get_tenant_id)
Db = Depends(get_db)
Ler = Depends(exigir(Permissao.ODONTOLOGIA_LER))
Gerenciar = Depends(exigir(Permissao.ODONTOLOGIA_GERENCIAR))


@router.get("/condicoes", response_model=list[CondicaoOut])
async def listar_condicoes(
    tipo: str | None = Query(default=None, pattern="^(CONDICAO|PROCEDIMENTO)$"),
    tenant_id: uuid.UUID = Tenant,
    _: Usuario = Ler,
    db: AsyncSession = Db,
):
    """B.3-001 — catálogo de condições e procedimentos com cor e aplicabilidade."""
    return await odontologia.listar_condicoes(db, tenant_id, tipo)


@router.post("/condicoes", response_model=CondicaoOut, status_code=201)
async def criar_condicao(
    corpo: CondicaoCreate,
    request: Request,
    tenant_id: uuid.UUID = Tenant,
    ator: Usuario = Depends(exigir(Permissao.CONFIGURACAO_EDITAR)),
    db: AsyncSession = Db,
):
    """B.3-001 — cadastro parametrizável do tenant."""
    return await odontologia.criar_condicao(db, tenant_id, corpo, ator, dados_do_cliente(request))


@router.patch("/condicoes/{condicao_id}", response_model=CondicaoOut)
async def atualizar_condicao(
    condicao_id: uuid.UUID,
    corpo: CondicaoUpdate,
    request: Request,
    if_match: str | None = Header(default=None, alias="If-Match"),
    tenant_id: uuid.UUID = Tenant,
    ator: Usuario = Depends(exigir(Permissao.CONFIGURACAO_EDITAR)),
    db: AsyncSession = Db,
):
    """B.3-001 — alteração com concorrência otimista."""
    return await odontologia.atualizar_condicao(
        db, tenant_id, condicao_id, corpo, exigir_versao(if_match), ator, dados_do_cliente(request)
    )


@router.get("/cidadaos/{cidadao_id}/odontograma", response_model=OdontogramaAtualOut)
async def odontograma(
    cidadao_id: uuid.UUID,
    request: Request,
    tenant_id: uuid.UUID = Tenant,
    ator: Usuario = Ler,
    db: AsyncSession = Db,
):
    """B.3-006/024 — estado atual + procedimentos planejados; leitura auditada."""
    return await odontologia.obter_odontograma(
        db, tenant_id, cidadao_id, ator, dados_do_cliente(request)
    )


@router.get("/cidadaos/{cidadao_id}/odontograma/versoes", response_model=list[OdontogramaOut])
async def versoes(
    cidadao_id: uuid.UUID, tenant_id: uuid.UUID = Tenant, _: Usuario = Ler, db: AsyncSession = Db
):
    """B.3-024 — histórico completo de versões."""
    return await odontologia.listar_versoes(db, tenant_id, cidadao_id)


@router.post("/cidadaos/{cidadao_id}/odontograma", response_model=OdontogramaOut, status_code=201)
async def gravar_odontograma(
    cidadao_id: uuid.UUID,
    corpo: OdontogramaCreate,
    request: Request,
    tenant_id: uuid.UUID = Tenant,
    ator: Usuario = Gerenciar,
    db: AsyncSession = Db,
):
    """B.3-006 — nova versão; a anterior é preservada."""
    return await odontologia.gravar_odontograma(
        db, tenant_id, cidadao_id, corpo, ator, dados_do_cliente(request)
    )


@router.get("/atendimentos", response_model=list[AtendimentoOut])
async def listar_atendimentos(
    cidadao_id: uuid.UUID | None = None,
    estabelecimento_id: uuid.UUID | None = None,
    tenant_id: uuid.UUID = Tenant,
    _: Usuario = Ler,
    db: AsyncSession = Db,
):
    """B.3-009 — atendimentos odontológicos."""
    return await odontologia.listar_atendimentos(db, tenant_id, cidadao_id, estabelecimento_id)


@router.post("/atendimentos", response_model=AtendimentoOut, status_code=201)
async def criar_atendimento(
    corpo: AtendimentoCreate,
    request: Request,
    tenant_id: uuid.UUID = Tenant,
    ator: Usuario = Gerenciar,
    db: AsyncSession = Db,
):
    """B.3-003/004/005/009/010/013 — triagem, risco, anamnese e digitação retroativa."""
    return await odontologia.criar_atendimento(
        db, tenant_id, corpo, ator, dados_do_cliente(request)
    )


@router.get("/atendimentos/{atendimento_id}", response_model=AtendimentoOut)
async def obter_atendimento(
    atendimento_id: uuid.UUID,
    request: Request,
    tenant_id: uuid.UUID = Tenant,
    ator: Usuario = Ler,
    db: AsyncSession = Db,
):
    """B.3-009 — leitura auditada como READ_SENSIVEL."""
    return await odontologia.obter_atendimento(
        db, tenant_id, atendimento_id, ator, dados_do_cliente(request)
    )


@router.patch("/atendimentos/{atendimento_id}", response_model=AtendimentoOut)
async def atualizar_atendimento(
    atendimento_id: uuid.UUID,
    corpo: AtendimentoUpdate,
    request: Request,
    if_match: str | None = Header(default=None, alias="If-Match"),
    tenant_id: uuid.UUID = Tenant,
    ator: Usuario = Gerenciar,
    db: AsyncSession = Db,
):
    """B.3-005/010 — só enquanto o atendimento estiver aberto."""
    return await odontologia.atualizar_atendimento(
        db,
        tenant_id,
        atendimento_id,
        corpo,
        exigir_versao(if_match),
        ator,
        dados_do_cliente(request),
    )


@router.post("/atendimentos/{atendimento_id}/finalizar", response_model=AtendimentoOut)
async def finalizar(
    atendimento_id: uuid.UUID,
    request: Request,
    tenant_id: uuid.UUID = Tenant,
    ator: Usuario = Gerenciar,
    db: AsyncSession = Db,
):
    """B.3-009 — finaliza e bloqueia alteração."""
    return await odontologia.finalizar_atendimento(
        db, tenant_id, atendimento_id, ator, dados_do_cliente(request)
    )


@router.post("/atendimentos/{atendimento_id}/cancelar", response_model=AtendimentoOut)
async def cancelar(
    atendimento_id: uuid.UUID,
    corpo: AtendimentoCancelar,
    request: Request,
    tenant_id: uuid.UUID = Tenant,
    ator: Usuario = Gerenciar,
    db: AsyncSession = Db,
):
    """B.3-009 — cancelamento com motivo; bloqueado se houver produção."""
    return await odontologia.cancelar_atendimento(
        db, tenant_id, atendimento_id, corpo.motivo, ator, dados_do_cliente(request)
    )


@router.get("/atendimentos/{atendimento_id}/documentos", response_model=list[DocumentoOut])
async def listar_documentos(
    atendimento_id: uuid.UUID,
    tenant_id: uuid.UUID = Tenant,
    ator: Usuario = Ler,
    db: AsyncSession = Db,
):
    """B.3-014 — documentos do atendimento."""
    return await odontologia.listar_documentos(db, tenant_id, atendimento_id, ator)


@router.post(
    "/atendimentos/{atendimento_id}/documentos", response_model=DocumentoOut, status_code=201
)
async def emitir_documento(
    atendimento_id: uuid.UUID,
    corpo: DocumentoCreate,
    request: Request,
    tenant_id: uuid.UUID = Tenant,
    ator: Usuario = Gerenciar,
    db: AsyncSession = Db,
):
    """B.3-014 — atestado, declaração, receita, orientação (conteúdo cifrado)."""
    return await odontologia.emitir_documento(
        db, tenant_id, atendimento_id, corpo, ator, dados_do_cliente(request)
    )


@router.get("/atendimentos/{atendimento_id}/exportacao-ledi", response_model=ExportacaoLediOut)
async def exportacao_ledi(
    atendimento_id: uuid.UUID,
    tenant_id: uuid.UUID = Tenant,
    ator: Usuario = Ler,
    db: AsyncSession = Db,
):
    """B.3-027 — exportação LEDI; pendente sem o artefato oficial."""
    return await odontologia.exportacao_ledi(db, tenant_id, atendimento_id, ator)


@router.get("/procedimentos", response_model=list[ProcedimentoOut])
async def listar_procedimentos(
    cidadao_id: uuid.UUID | None = None,
    situacao: str | None = Query(default=None, pattern="^(PROGRAMADO|REALIZADO|CANCELADO)$"),
    tenant_id: uuid.UUID = Tenant,
    _: Usuario = Ler,
    db: AsyncSession = Db,
):
    """B.3-011/022 — procedimentos programados e realizados."""
    return await odontologia.listar_procedimentos(db, tenant_id, cidadao_id, situacao)


@router.post("/procedimentos", response_model=ProcedimentoOut, status_code=201)
async def criar_procedimento(
    corpo: ProcedimentoCreate,
    request: Request,
    tenant_id: uuid.UUID = Tenant,
    ator: Usuario = Gerenciar,
    db: AsyncSession = Db,
):
    """B.3-011/018/022 — programa ou registra procedimento por dente/face."""
    return await odontologia.criar_procedimento(
        db, tenant_id, corpo, ator, dados_do_cliente(request)
    )


@router.post("/procedimentos/{procedimento_id}/realizar", response_model=ProcedimentoOut)
async def realizar(
    procedimento_id: uuid.UUID,
    corpo: ProcedimentoRealizar,
    request: Request,
    tenant_id: uuid.UUID = Tenant,
    ator: Usuario = Gerenciar,
    db: AsyncSession = Db,
):
    """B.3-022 — programado → realizado, vinculado ao atendimento."""
    return await odontologia.realizar_procedimento(
        db, tenant_id, procedimento_id, corpo, ator, dados_do_cliente(request)
    )


@router.post("/procedimentos/{procedimento_id}/cancelar", response_model=ProcedimentoOut)
async def cancelar_procedimento(
    procedimento_id: uuid.UUID,
    corpo: ProcedimentoCancelar,
    request: Request,
    tenant_id: uuid.UUID = Tenant,
    ator: Usuario = Gerenciar,
    db: AsyncSession = Db,
):
    """B.3-022 — cancela programado, com motivo."""
    return await odontologia.cancelar_procedimento(
        db, tenant_id, procedimento_id, corpo.motivo, ator, dados_do_cliente(request)
    )


@router.get("/relatorios/procedimentos", response_model=RelatorioOut)
async def relatorio(
    inicio: date,
    fim: date,
    agrupar_por: str = Query(default="dente", pattern="^(dente|face|procedimento)$"),
    estabelecimento_id: uuid.UUID | None = None,
    tenant_id: uuid.UUID = Tenant,
    _: Usuario = Ler,
    db: AsyncSession = Db,
):
    """B.3-019…021 — produção por dente, face ou procedimento."""
    return await odontologia.relatorio(db, tenant_id, inicio, fim, agrupar_por, estabelecimento_id)
