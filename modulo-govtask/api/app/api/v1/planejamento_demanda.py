"""Modelos, recorrência, duplicação segura e ausências da Demanda."""

import uuid
from calendar import monthrange
from datetime import date

from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.encoders import jsonable_encoder
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.auth import get_user_permissions, require_permission
from app.core.database import get_db
from app.core.permissions import Perm
from app.models.planejamento_demanda import AusenciaSubstituicao, ModeloDemanda, RecorrenciaDemanda
from app.models.user import User
from app.schemas.demanda import DemandaCreate
from app.services import demandas as demanda_service
from app.services.timeline import registrar_evento

router = APIRouter(tags=["Planejamento de demandas"])

# Campos copiados são intencionalmente enumerados: registros, tarefas, anexos,
# eventos, status, números e prazos passados nunca atravessam uma duplicação.
CAMPOS_MODELO = {
    "titulo", "descricao", "resumo_executivo", "objeto", "assunto", "tipo_id",
    "categoria_id", "subcategoria_id", "prioridade", "criticidade", "impacto",
    "confidencialidade", "origem", "origem_descricao", "autoridade_id",
    "solicitante_id", "solicitante_externo", "responsavel_geral_id", "gestor_id",
    "setor_solicitante_id", "setor_atual_id", "template_fluxo_id", "fluxo_livre",
    "proxima_acao", "proxima_acao_responsavel_id", "prazo_final", "prazo_legal",
    "prazo_interno", "previsao_conclusao", "valor_previsto", "fonte_recurso",
    "esfera", "orgao_concedente", "programa", "campos_extras", "observacoes",
}


class ModeloIn(BaseModel):
    nome: str = Field(min_length=3, max_length=160)
    descricao: str | None = None
    configuracao: dict
    ativo: bool = True


class RecorrenciaIn(BaseModel):
    modelo_id: uuid.UUID
    periodicidade: str = Field(pattern="^(MENSAL|TRIMESTRAL|ANUAL)$")
    proxima_execucao: date
    ativa: bool = True


class AusenciaIn(BaseModel):
    titular_id: uuid.UUID
    substituto_id: uuid.UUID
    inicio: date
    fim: date
    motivo: str = Field(pattern="^(FERIAS|LICENCA|AFASTAMENTO)$")
    observacao: str | None = None


def _configuracao_segura(configuracao: dict) -> dict:
    dados = {k: v for k, v in configuracao.items() if k in CAMPOS_MODELO}
    if not dados.get("titulo"):
        raise HTTPException(422, "O modelo precisa informar um título de demanda")
    # JSON do modelo não preserva UUID/enums; o schema reconstrói os tipos antes
    # de a camada de criação consultar catálogo e persistir a demanda.
    return dados


def _dados_para_criar(configuracao: dict) -> dict:
    return DemandaCreate(**_configuracao_segura(configuracao)).model_dump(
        exclude={"rascunho", "tags"}
    )


def _proxima(data: date, periodicidade: str) -> date:
    meses = {"MENSAL": 1, "TRIMESTRAL": 3, "ANUAL": 12}[periodicidade]
    indice = data.month - 1 + meses
    ano, mes = data.year + indice // 12, indice % 12 + 1
    return date(ano, mes, min(data.day, monthrange(ano, mes)[1]))


async def _modelo_ou_404(db: AsyncSession, modelo_id: uuid.UUID, org_id: uuid.UUID) -> ModeloDemanda:
    modelo = await db.scalar(select(ModeloDemanda).where(ModeloDemanda.id == modelo_id, ModeloDemanda.organization_id == org_id, ModeloDemanda.deleted_at.is_(None)))
    if not modelo:
        raise HTTPException(404, "Modelo de demanda não encontrado")
    return modelo


@router.get("/modelos-demanda")
async def listar_modelos(db: AsyncSession = Depends(get_db), user: User = Depends(require_permission(Perm.RESOURCE_VIEW))):
    return (await db.execute(select(ModeloDemanda).where(ModeloDemanda.organization_id == user.organization_id, ModeloDemanda.deleted_at.is_(None)).order_by(ModeloDemanda.nome))).scalars().all()


@router.post("/modelos-demanda", status_code=status.HTTP_201_CREATED)
async def criar_modelo(payload: ModeloIn, db: AsyncSession = Depends(get_db), user: User = Depends(require_permission(Perm.ADMIN_CONFIG))):
    modelo = ModeloDemanda(organization_id=user.organization_id, nome=payload.nome, descricao=payload.descricao, configuracao=jsonable_encoder(_configuracao_segura(payload.configuracao)), ativo=payload.ativo, criado_por_id=user.id)
    db.add(modelo)
    await db.commit()
    await db.refresh(modelo)
    return modelo


@router.post("/modelos-demanda/{modelo_id}/instanciar", status_code=status.HTTP_201_CREATED)
async def instanciar_modelo(modelo_id: uuid.UUID, db: AsyncSession = Depends(get_db), user: User = Depends(require_permission(Perm.RESOURCE_CREATE))):
    modelo = await _modelo_ou_404(db, modelo_id, user.organization_id)
    if not modelo.ativo:
        raise HTTPException(422, "Modelo de demanda está inativo")
    demanda = await demanda_service.criar_demanda(db, _dados_para_criar(modelo.configuracao), user)
    await registrar_evento(db, "DEMANDA_INSTANCIADA", user.id, f"Demanda criada a partir do modelo {modelo.nome}", demanda_id=demanda.id, metadados={"modelo_id": str(modelo.id)})
    await db.commit()
    return {"id": demanda.id, "numero": demanda.numero, "modelo_id": modelo.id}


@router.post("/demandas/{demanda_id}/duplicar", status_code=status.HTTP_201_CREATED)
async def duplicar_demanda(demanda_id: uuid.UUID, db: AsyncSession = Depends(get_db), user: User = Depends(require_permission(Perm.RESOURCE_CREATE))):
    origem = await demanda_service.get_demanda_ou_404(db, demanda_id, user, get_user_permissions(user))
    dados = {campo: getattr(origem, campo) for campo in CAMPOS_MODELO if getattr(origem, campo, None) is not None}
    dados["titulo"] = f"Cópia — {origem.titulo}"
    # Datas operacionais não são herdadas: a nova demanda precisa de novo prazo.
    for campo in ("prazo_final", "prazo_legal", "prazo_interno", "previsao_conclusao"):
        dados.pop(campo, None)
    nova = await demanda_service.criar_demanda(db, dados, user)
    nova.duplicada_de_id = origem.id
    await registrar_evento(db, "DEMANDA_DUPLICADA", user.id, f"Demanda duplicada de {origem.numero}; histórico e anexos não foram copiados", demanda_id=nova.id, metadados={"origem_id": str(origem.id)})
    await db.commit()
    return {"id": nova.id, "numero": nova.numero, "duplicada_de_id": origem.id}


@router.get("/recorrencias-demanda")
async def listar_recorrencias(db: AsyncSession = Depends(get_db), user: User = Depends(require_permission(Perm.ADMIN_CONFIG))):
    return (await db.execute(select(RecorrenciaDemanda).where(RecorrenciaDemanda.organization_id == user.organization_id).order_by(RecorrenciaDemanda.proxima_execucao))).scalars().all()


@router.post("/recorrencias-demanda", status_code=status.HTTP_201_CREATED)
async def criar_recorrencia(payload: RecorrenciaIn, db: AsyncSession = Depends(get_db), user: User = Depends(require_permission(Perm.ADMIN_CONFIG))):
    await _modelo_ou_404(db, payload.modelo_id, user.organization_id)
    recorrencia = RecorrenciaDemanda(organization_id=user.organization_id, criada_por_id=user.id, **payload.model_dump())
    db.add(recorrencia)
    await db.commit()
    await db.refresh(recorrencia)
    return recorrencia


@router.post("/recorrencias-demanda/processar")
async def processar_recorrencias(db: AsyncSession = Depends(get_db), user: User = Depends(require_permission(Perm.ADMIN_CONFIG))):
    regras = (await db.execute(select(RecorrenciaDemanda).where(RecorrenciaDemanda.organization_id == user.organization_id, RecorrenciaDemanda.ativa.is_(True), RecorrenciaDemanda.proxima_execucao <= date.today()))).scalars().all()
    criadas = []
    for regra in regras:
        modelo = await _modelo_ou_404(db, regra.modelo_id, user.organization_id)
        if not modelo.ativo:
            continue
        nova = await demanda_service.criar_demanda(db, _dados_para_criar(modelo.configuracao), user)
        regra.ultima_demanda_id, regra.proxima_execucao = nova.id, _proxima(regra.proxima_execucao, regra.periodicidade)
        criadas.append({"id": str(nova.id), "numero": nova.numero})
    await db.commit()
    return {"criadas": criadas, "total": len(criadas)}


@router.get("/ausencias-substituicoes")
async def listar_ausencias(db: AsyncSession = Depends(get_db), user: User = Depends(require_permission(Perm.ADMIN_CONFIG))):
    return (await db.execute(select(AusenciaSubstituicao).where(AusenciaSubstituicao.organization_id == user.organization_id, AusenciaSubstituicao.deleted_at.is_(None)).order_by(AusenciaSubstituicao.inicio.desc()))).scalars().all()


@router.post("/ausencias-substituicoes", status_code=status.HTTP_201_CREATED)
async def criar_ausencia(payload: AusenciaIn, db: AsyncSession = Depends(get_db), user: User = Depends(require_permission(Perm.ADMIN_CONFIG))):
    if payload.fim < payload.inicio:
        raise HTTPException(422, "O fim da ausência deve ser igual ou posterior ao início")
    if payload.titular_id == payload.substituto_id:
        raise HTTPException(422, "Titular e substituto devem ser pessoas diferentes")
    pessoas = (await db.execute(select(User.id).where(User.id.in_((payload.titular_id, payload.substituto_id)), User.organization_id == user.organization_id, User.is_active.is_(True), User.deleted_at.is_(None)))).scalars().all()
    if len(pessoas) != 2:
        raise HTTPException(422, "Titular e substituto devem ser usuários ativos da organização")
    registro = AusenciaSubstituicao(organization_id=user.organization_id, criado_por_id=user.id, **payload.model_dump())
    db.add(registro)
    await db.commit()
    await db.refresh(registro)
    return registro
