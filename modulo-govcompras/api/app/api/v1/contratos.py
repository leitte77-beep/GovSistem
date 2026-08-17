"""Contratos e gestão contratual (seções 44-56).

Gerar contrato NÃO encerra o processo: o processo continua `EM_ANDAMENTO`,
avançando para a etapa de fiscalização configurada no workflow — é o próprio
motor de workflow que trata a "Execução Contratual" como mais uma etapa
(seção 45), não um estado especial paralelo.
"""

import uuid

from fastapi import APIRouter, Depends
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.v1.deps import buscar_da_organizacao
from app.core.auth import exigir
from app.core.database import get_db
from app.core.errors import AppError, NotFound
from app.core.permissoes import P
from app.models.compras import Fornecedor
from app.models.contrato import Aditivo, Apostilamento, Contrato, ContratoItemSaldo, ContratoSaldo
from app.models.licitacao import Homologacao
from app.models.organizacao import User
from app.models.processo import ProcessoInstancia
from app.schemas.comuns import Criado
from app.schemas.contrato import (
    AditivoIn,
    AditivoOut,
    ApostilamentoIn,
    ContratoItemSaldoIn,
    ContratoItemSaldoOut,
    ContratoOut,
    ContratoSaldoOut,
    DecisaoVencimentoIn,
    GerarContratoIn,
)
from app.services import numeracao, workflow

router = APIRouter(tags=["Contratos"])


async def _contrato_out(db: AsyncSession, contrato: Contrato) -> ContratoOut:
    fornecedor = await db.get(Fornecedor, contrato.fornecedor_id)
    gestor = await db.get(User, contrato.gestor_usuario_id) if contrato.gestor_usuario_id else None
    fiscal = await db.get(User, contrato.fiscal_usuario_id) if contrato.fiscal_usuario_id else None
    return ContratoOut(
        id=contrato.id, numero=contrato.numero, exercicio=contrato.exercicio, processo_id=contrato.processo_id,
        fornecedor_id=contrato.fornecedor_id, fornecedor_nome=fornecedor.razao_social if fornecedor else None,
        secretaria_id=contrato.secretaria_id, objeto=contrato.objeto, valor_global=contrato.valor_global,
        vigencia_inicio=contrato.vigencia_inicio, vigencia_fim=contrato.vigencia_fim,
        gestor_usuario_id=contrato.gestor_usuario_id, gestor_nome=gestor.nome if gestor else None,
        fiscal_usuario_id=contrato.fiscal_usuario_id, fiscal_nome=fiscal.nome if fiscal else None,
        status=contrato.status, dias_para_vencer=contrato.dias_para_vencer,
        percentual_vigencia_transcorrida=contrato.percentual_vigencia_transcorrida,
    )


@router.get("/contratos", response_model=list[ContratoOut])
async def listar_contratos(
    status_contrato: str | None = None,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(exigir(P.CONTRATOS_VISUALIZAR)),
):
    consulta = select(Contrato).where(Contrato.organizacao_id == user.organizacao_id)
    if status_contrato:
        consulta = consulta.where(Contrato.status == status_contrato)
    contratos = list((await db.scalars(consulta.order_by(Contrato.vigencia_fim))).all())
    return [await _contrato_out(db, c) for c in contratos]


@router.get("/contratos/vencendo", response_model=list[ContratoOut])
async def contratos_vencendo(
    dias: int = 180, db: AsyncSession = Depends(get_db), user: User = Depends(exigir(P.CONTRATOS_VISUALIZAR))
):
    from app.services.dashboard import contratos_vencendo as buscar_vencendo

    contratos = await buscar_vencendo(db, user.organizacao_id, dias)
    return [await _contrato_out(db, c) for c in contratos]


@router.get("/contratos/{contrato_id}", response_model=ContratoOut)
async def obter_contrato(
    contrato_id: uuid.UUID, db: AsyncSession = Depends(get_db), user: User = Depends(exigir(P.CONTRATOS_VISUALIZAR))
):
    contrato = await buscar_da_organizacao(db, Contrato, contrato_id, user)
    return await _contrato_out(db, contrato)


@router.get("/processos/{processo_id}/contrato", response_model=ContratoOut | None)
async def obter_contrato_do_processo(
    processo_id: uuid.UUID, db: AsyncSession = Depends(get_db), user: User = Depends(exigir(P.CONTRATOS_VISUALIZAR))
):
    await buscar_da_organizacao(db, ProcessoInstancia, processo_id, user)
    contrato = await db.scalar(select(Contrato).where(Contrato.processo_id == processo_id))
    return await _contrato_out(db, contrato) if contrato else None


@router.post("/processos/{processo_id}/gerar-contrato", response_model=ContratoOut, status_code=201)
async def gerar_contrato(
    processo_id: uuid.UUID,
    payload: GerarContratoIn,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(exigir(P.CONTRATOS_GERENCIAR)),
):
    processo = await buscar_da_organizacao(db, ProcessoInstancia, processo_id, user)
    homologacao = await db.scalar(select(Homologacao).where(Homologacao.processo_id == processo_id))
    if homologacao is None:
        raise AppError(
            "É preciso homologar o processo antes de gerar o contrato.", 422, "homologacao_pendente"
        )
    fornecedor_id = payload.fornecedor_id
    if fornecedor_id is None:
        from app.models.licitacao import Adjudicacao

        adjudicacao = await db.scalar(select(Adjudicacao).where(Adjudicacao.processo_id == processo_id))
        fornecedor_id = adjudicacao.fornecedor_vencedor_id if adjudicacao else None
    if fornecedor_id is None:
        raise AppError("Não foi possível identificar o fornecedor vencedor.", 422, "fornecedor_nao_identificado")

    exercicio, numero = await numeracao.numero_contrato(db, user.organizacao_id)
    contrato = Contrato(
        organizacao_id=user.organizacao_id,
        numero=payload.numero or numero,
        exercicio=exercicio,
        processo_id=processo_id,
        fornecedor_id=fornecedor_id,
        secretaria_id=processo.secretaria_id,
        objeto=payload.objeto or processo.objeto,
        valor_global=payload.valor_global or homologacao.valor_homologado,
        data_assinatura=payload.data_assinatura,
        vigencia_inicio=payload.vigencia_inicio,
        vigencia_fim=payload.vigencia_fim,
        gestor_usuario_id=payload.gestor_usuario_id,
        fiscal_usuario_id=payload.fiscal_usuario_id,
        garantia=payload.garantia,
        reajuste=payload.reajuste,
        indice=payload.indice,
        condicoes_pagamento=payload.condicoes_pagamento,
        created_by_id=user.id,
    )
    db.add(contrato)
    await db.flush()
    db.add(ContratoSaldo(contrato_id=contrato.id))

    await db.commit()
    await db.refresh(contrato)
    return await _contrato_out(db, contrato)


@router.post("/contratos/{contrato_id}/aditivos", response_model=Criado, status_code=201)
async def criar_aditivo(
    contrato_id: uuid.UUID,
    payload: AditivoIn,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(exigir(P.CONTRATOS_GERENCIAR)),
):
    contrato = await buscar_da_organizacao(db, Contrato, contrato_id, user)
    aditivo = Aditivo(contrato_id=contrato_id, created_by_id=user.id, **payload.model_dump())
    db.add(aditivo)
    if payload.nova_vigencia_fim:
        contrato.vigencia_fim = payload.nova_vigencia_fim
    await db.commit()
    return Criado(id=aditivo.id, mensagem="Aditivo registrado.")


@router.get("/contratos/{contrato_id}/aditivos", response_model=list[AditivoOut])
async def listar_aditivos(
    contrato_id: uuid.UUID, db: AsyncSession = Depends(get_db), user: User = Depends(exigir(P.CONTRATOS_VISUALIZAR))
):
    await buscar_da_organizacao(db, Contrato, contrato_id, user)
    return list((await db.scalars(select(Aditivo).where(Aditivo.contrato_id == contrato_id))).all())


@router.post("/contratos/{contrato_id}/apostilamentos", response_model=Criado, status_code=201)
async def criar_apostilamento(
    contrato_id: uuid.UUID,
    payload: ApostilamentoIn,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(exigir(P.CONTRATOS_GERENCIAR)),
):
    await buscar_da_organizacao(db, Contrato, contrato_id, user)
    apostilamento = Apostilamento(contrato_id=contrato_id, created_by_id=user.id, **payload.model_dump())
    db.add(apostilamento)
    await db.commit()
    return Criado(id=apostilamento.id, mensagem="Apostilamento registrado.")


@router.get("/contratos/{contrato_id}/saldo", response_model=ContratoSaldoOut)
async def obter_saldo(
    contrato_id: uuid.UUID, db: AsyncSession = Depends(get_db), user: User = Depends(exigir(P.CONTRATOS_VISUALIZAR))
):
    contrato = await buscar_da_organizacao(db, Contrato, contrato_id, user)
    saldo = await db.scalar(select(ContratoSaldo).where(ContratoSaldo.contrato_id == contrato_id))
    if saldo is None:
        raise NotFound("Saldo do contrato não encontrado.")
    return ContratoSaldoOut(
        valor_global=contrato.valor_global,
        valor_empenhado=saldo.valor_empenhado,
        valor_liquidado=saldo.valor_liquidado,
        valor_pago=saldo.valor_pago,
        saldo_disponivel=saldo.saldo_disponivel(contrato.valor_global),
    )


@router.get("/contratos/{contrato_id}/itens-saldo", response_model=list[ContratoItemSaldoOut])
async def listar_itens_saldo(
    contrato_id: uuid.UUID, db: AsyncSession = Depends(get_db), user: User = Depends(exigir(P.CONTRATOS_VISUALIZAR))
):
    await buscar_da_organizacao(db, Contrato, contrato_id, user)
    return list((await db.scalars(select(ContratoItemSaldo).where(ContratoItemSaldo.contrato_id == contrato_id))).all())


@router.post("/contratos/{contrato_id}/itens-saldo", response_model=Criado, status_code=201)
async def criar_item_saldo(
    contrato_id: uuid.UUID,
    payload: ContratoItemSaldoIn,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(exigir(P.CONTRATOS_GERENCIAR)),
):
    await buscar_da_organizacao(db, Contrato, contrato_id, user)
    item = ContratoItemSaldo(contrato_id=contrato_id, **payload.model_dump())
    db.add(item)
    await db.commit()
    return Criado(id=item.id, mensagem="Item de saldo registrado.")


@router.post("/contratos/{contrato_id}/decisao-vencimento", response_model=dict)
async def decidir_vencimento(
    contrato_id: uuid.UUID,
    payload: DecisaoVencimentoIn,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(exigir(P.CONTRATOS_GERENCIAR)),
):
    """Decisão pré-vencimento (seção 50): nova contratação, prorrogação,
    encerramento ou "analisar depois". "Nova contratação" cria o processo
    sucessor automaticamente, já referenciando o contrato de origem (seções
    51-52), mas NUNCA copia documentos como se já estivessem prontos — só
    dados estruturados (objeto, secretaria, valor)."""
    contrato = await buscar_da_organizacao(db, Contrato, contrato_id, user)

    if payload.decisao == "nova_contratacao":
        processo_atual = await db.get(ProcessoInstancia, contrato.processo_id)
        novo_processo = await workflow.abrir_processo(
            db,
            organizacao_id=user.organizacao_id,
            tipo_processo=processo_atual.tipo_processo if processo_atual else "pregao",
            secretaria_id=contrato.secretaria_id,
            setor_id=processo_atual.setor_id if processo_atual else None,
            objeto=f"Nova contratação — sucessora do contrato {contrato.numero}: {contrato.objeto}",
            valor_estimado=contrato.valor_global,
            usuario=user,
            processo_origem_id=contrato.processo_id,
            origem_contrato_id=contrato.id,
        )
        await db.commit()
        await db.refresh(novo_processo)
        return {"decisao": payload.decisao, "processo_sucessor_id": str(novo_processo.id), "numero_processo": novo_processo.numero_processo}

    if payload.decisao == "prorrogacao":
        return {"decisao": payload.decisao, "mensagem": "Registre o aditivo de prazo em Contratos > Aditivos."}

    if payload.decisao == "encerramento":
        contrato.status = "encerrado"
        await db.commit()
        return {"decisao": payload.decisao, "mensagem": "Contrato encerrado."}

    return {"decisao": "analisar_depois", "mensagem": "Decisão adiada — o alerta continuará aparecendo na Central de Vencimentos."}
