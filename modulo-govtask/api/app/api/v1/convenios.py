import uuid
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import or_, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.core.auth import get_current_user, require_permission, require_roles
from app.core.permissions import Perm
from app.core.database import get_db
from app.models.convenio import Convenio
from app.models.etapa import Etapa
from app.models.enums import SituacaoProcesso, StatusConvenio, TipoEvento
from app.models.template_fluxo import TemplateFluxo
from app.models.user import User
from app.schemas.convenio import (
    ConvenioCreate,
    ConvenioDetailOut,
    ConvenioListItem,
    ConvenioOut,
    ConvenioUpdate,
    ProtocoloRequest,
)
from app.services.timeline import registrar_evento


def _enrich_list_item(convenio: Convenio) -> dict:
    """Adiciona etapa_atual, proximo_prazo, progresso e contagens computados."""
    etapas: list = sorted((convenio.etapas or []), key=lambda e: e.ordem)
    etapa_atual = None
    proximo_prazo = None

    for e in etapas:
        if e.status not in ("CONCLUIDA",):
            etapa_atual = e.nome
            if e.prazo_governo:
                proximo_prazo = e.prazo_governo
            break

    if not proximo_prazo:
        for e in etapas:
            tarefas = getattr(e, "tarefas", None) or []
            for t in tarefas:
                if t.prazo and t.status not in ("CONCLUIDA", "CANCELADA"):
                    if proximo_prazo is None or t.prazo < proximo_prazo:
                        proximo_prazo = t.prazo

    # Progresso físico (obras) e financeiro
    percentual_fisico = None
    percentual_financeiro = None
    obras = getattr(convenio, "obras", None) or []
    if obras:
        fis = [o.percentual_fisico for o in obras if o.percentual_fisico is not None]
        fin = [o.percentual_financeiro for o in obras if o.percentual_financeiro is not None]
        if fis:
            percentual_fisico = max(fis)
        if fin:
            percentual_financeiro = max(fin)

    # Sem percentual lançado na obra, o avanço físico real é o acumulado da
    # última medição aprovada (obra sem medição fica em 0, como esperado).
    if percentual_fisico is None:
        aprovadas = [
            m for m in (getattr(convenio, "medicoes", None) or [])
            if m.status in ("APROVADA", "PAGA") and m.deleted_at is None
            and m.percentual_acumulado is not None
        ]
        if aprovadas:
            percentual_fisico = max(aprovadas, key=lambda m: m.numero).percentual_acumulado
    if percentual_fisico is None:
        percentual_fisico = 100 if convenio.status == "CONCLUIDO" else 0

    # Financeiro: valor_executado é preenchido à mão e quase sempre fica
    # vazio; o executado real é a soma dos pagamentos, mesma definição usada
    # pelo dashboard (ver dashboard.py, "Valor executado = soma dos pagamentos").
    if percentual_financeiro is None:
        total = convenio.valor_aprovado or convenio.valor or 0
        executado = convenio.valor_executado
        if executado is None:
            executado = sum(
                (mv.valor or 0) for mv in (getattr(convenio, "movimentos_financeiros", None) or [])
                if mv.tipo == "PAGAMENTO" and mv.deleted_at is None
            )
        percentual_financeiro = round(executado * 100 / total, 1) if total else 0

    # Decimal serializa como string ("25.00") e o front tipa como number,
    # entao normaliza para float com no maximo 1 casa.
    percentual_fisico = round(float(percentual_fisico), 1)
    percentual_financeiro = round(float(percentual_financeiro), 1)

    # Progresso administrativo: posição da situação atual no fluxo padrão
    # (proxy do avanço do processo pelas etapas de trâmite). Quando o status
    # já está concluído/cancelado, fixa em 100/0.
    from app.models.enums import SituacaoProcesso

    percentual_administrativo = None
    if convenio.status == "CONCLUIDO":
        percentual_administrativo = 100.0
    elif convenio.status == "CANCELADO":
        percentual_administrativo = 0.0
    else:
        flow = SituacaoProcesso.default_flow()
        if convenio.situacao in flow:
            percentual_administrativo = round(
                (flow.index(convenio.situacao) + 1) * 100 / len(flow), 1
            )
        else:
            # Sem situação cadastrada, usa as etapas concluídas como proxy.
            etapas_list = getattr(convenio, "etapas", None) or []
            if etapas_list:
                concluidas = sum(1 for e in etapas_list if e.status == "CONCLUIDA")
                percentual_administrativo = round(concluidas * 100 / len(etapas_list), 1)
            else:
                percentual_administrativo = 0.0

    # Contagens
    tarefas_abertas = sum(
        1 for t in (getattr(convenio, "tarefas", None) or [])
        if t.status not in ("CONCLUIDA", "CANCELADA")
    )
    tarefas_atrasadas = sum(
        1 for t in (getattr(convenio, "tarefas", None) or [])
        if t.status not in ("CONCLUIDA", "CANCELADA") and getattr(t, "atrasada", False)
    )
    pendencias = sum(
        1 for d in (getattr(convenio, "diligencias", None) or [])
        if d.status not in ("ENCERRADA", "ACEITA")
    )

    numero_emenda = convenio.numero_emenda or convenio.numero_convenio

    return {
        "id": convenio.id,
        "titulo": convenio.titulo,
        "tipo": convenio.tipo,
        "origem": convenio.origem,
        "numero_protocolo_governo": convenio.numero_protocolo_governo,
        "valor": convenio.valor,
        "status": convenio.status,
        "categoria": convenio.categoria,
        "esfera": convenio.esfera,
        "situacao": convenio.situacao,
        "prioridade": convenio.prioridade,
        "numero_emenda": numero_emenda,
        "parlamentar": convenio.parlamentar,
        "orgao_concedente": convenio.orgao_concedente,
        "etapa_atual": etapa_atual,
        "proximo_prazo": proximo_prazo,
        "percentual_fisico": percentual_fisico,
        "percentual_financeiro": percentual_financeiro,
        "percentual_administrativo": percentual_administrativo,
        "tarefas_abertas": tarefas_abertas,
        "tarefas_atrasadas": tarefas_atrasadas,
        "pendencias": pendencias,
        "responsavel_id": convenio.responsavel_id,
        "created_at": convenio.created_at,
        "updated_at": convenio.updated_at,
    }

router = APIRouter(prefix="/convenios", tags=["convenios"])


@router.get("", response_model=list[ConvenioListItem])
async def listar_convenios(
    status: StatusConvenio | None = Query(None),
    tipo: str | None = Query(None),
    search: str | None = Query(None),
    esfera: str | None = Query(None),
    categoria: str | None = Query(None),
    situacao: str | None = Query(None),
    skip: int = Query(0, ge=0),
    limit: int = Query(20, ge=1, le=100),
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    query = select(Convenio).where(
        Convenio.organization_id == user.organization_id,
        Convenio.deleted_at.is_(None),
    )
    if status:
        query = query.where(Convenio.status == status)
    if tipo:
        query = query.where(Convenio.tipo == tipo)
    if esfera:
        query = query.where(Convenio.esfera == esfera)
    if categoria:
        query = query.where(Convenio.categoria == categoria)
    if situacao:
        query = query.where(Convenio.situacao == situacao)
    if search:
        query = query.where(
            (Convenio.titulo.ilike(f"%{search}%"))
            | (Convenio.numero_protocolo_governo.ilike(f"%{search}%"))
            | (Convenio.numero_convenio.ilike(f"%{search}%"))
            | (Convenio.numero_emenda.ilike(f"%{search}%"))
            | (Convenio.parlamentar.ilike(f"%{search}%"))
            | (Convenio.orgao_concedente.ilike(f"%{search}%"))
        )
    query = query.options(selectinload(Convenio.etapas)).offset(skip).limit(limit).order_by(Convenio.updated_at.desc())
    result = await db.execute(query)
    convenios = result.scalars().all()
    return [_enrich_list_item(c) for c in convenios]


@router.post("", response_model=ConvenioOut, status_code=201)
async def criar_convenio(
    body: ConvenioCreate,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(require_permission(Perm.RESOURCE_CREATE)),
):
    convenio = Convenio(
        organization_id=user.organization_id,
        titulo=body.titulo,
        descricao=body.descricao,
        tipo=body.tipo,
        origem=body.origem,
        valor=body.valor,
        responsavel_id=user.id,
        template_fluxo_id=body.template_fluxo_id,
        categoria=body.categoria.value if body.categoria else None,
        esfera=body.esfera.value if body.esfera else None,
        prioridade=body.prioridade.value if body.prioridade else None,
        situacao=body.situacao or (SituacaoProcesso.default_flow()[0] if body.categoria else None),
        parlamentar=body.parlamentar,
        parlamentar_cargo=body.parlamentar_cargo,
        partido=body.partido,
        orgao_concedente=body.orgao_concedente,
        programa=body.programa,
        finalidade=body.finalidade,
        numero_proposta=body.numero_proposta,
        numero_instrumento=body.numero_instrumento,
        numero_convenio=body.numero_convenio,
        numero_contrato_repasse=body.numero_contrato_repasse,
        numero_emenda=body.numero_emenda,
        numero_plano_acao=body.numero_plano_acao,
        numero_plano_trabalho=body.numero_plano_trabalho,
        valor_solicitado=body.valor_solicitado,
        valor_aprovado=body.valor_aprovado,
        valor_repasse=body.valor_repasse,
        contrapartida=body.contrapartida,
        data_aprovacao=body.data_aprovacao,
        data_assinatura=body.data_assinatura,
        vigencia_inicio=body.vigencia_inicio,
        vigencia_fim=body.vigencia_fim,
        prazo_execucao=body.prazo_execucao,
        prazo_prestacao_contas=body.prazo_prestacao_contas,
        previsao_conclusao=body.previsao_conclusao,
        gestor_id=body.gestor_id,
        fiscal_id=body.fiscal_id,
        engenheiro_id=body.engenheiro_id,
        links_externos=body.links_externos,
        identificadores_externos=body.identificadores_externos,
    )
    db.add(convenio)
    await db.flush()

    if body.template_fluxo_id:
        template_result = await db.execute(
            select(TemplateFluxo)
            .where(
                TemplateFluxo.id == body.template_fluxo_id,
                or_(
                    TemplateFluxo.organization_id == user.organization_id,
                    TemplateFluxo.organization_id.is_(None),
                ),
                TemplateFluxo.deleted_at.is_(None),
            )
            .options(selectinload(TemplateFluxo.etapas))
        )
        template = template_result.scalar_one_or_none()
        if not template:
            raise HTTPException(status_code=422, detail="Template de fluxo não encontrado")

        for template_etapa in sorted(template.etapas, key=lambda e: e.ordem):
            db.add(
                Etapa(
                    convenio_id=convenio.id,
                    nome=template_etapa.nome,
                    ordem=template_etapa.ordem,
                    natureza=template_etapa.natureza,
                )
            )

    await registrar_evento(
        db,
        convenio_id=convenio.id,
        tipo_evento=TipoEvento.CONVENIO_CRIADO,
        ator_id=user.id,
        descricao=f"Convênio '{convenio.titulo}' criado",
    )
    await db.commit()
    result = await db.execute(
        select(Convenio)
        .where(Convenio.id == convenio.id)
        .options(selectinload(Convenio.etapas))
    )
    convenio = result.scalar_one()
    return convenio


@router.get("/{convenio_id}", response_model=ConvenioDetailOut)
async def obter_convenio(
    convenio_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    result = await db.execute(
        select(Convenio)
        .where(
            Convenio.id == convenio_id,
            Convenio.organization_id == user.organization_id,
            Convenio.deleted_at.is_(None),
        )
        .options(
            selectinload(Convenio.etapas),
            selectinload(Convenio.anexos),
            selectinload(Convenio.tarefas),
            selectinload(Convenio.obras),
            selectinload(Convenio.medicoes),
            selectinload(Convenio.movimentos_financeiros),
            selectinload(Convenio.repasses),
            selectinload(Convenio.eventos),
            selectinload(Convenio.diligencias),
            selectinload(Convenio.responsavel),
        )
    )
    convenio = result.scalar_one_or_none()
    if not convenio:
        raise HTTPException(status_code=404, detail="Convênio não encontrado")

    # Enriquecimento do detalhe: progresso, etapa atual, financeiro e
    # última movimentação (reuso da mesma lógica do item de lista).
    data = ConvenioOut.model_validate(convenio).model_dump()
    data.update(_enrich_list_item(convenio))
    data["valor_recebido"] = float(
        sum(
            (r.valor_recebido or 0) for r in (getattr(convenio, "repasses", None) or [])
        )
    )
    ultima = None
    for ev in (getattr(convenio, "eventos", None) or []):
        if ultima is None or ev.ocorrido_em > ultima:
            ultima = ev.ocorrido_em
    data["ultima_movimentacao"] = ultima.isoformat() if ultima else None
    if convenio.responsavel:
        data["responsavel"] = {"id": str(convenio.responsavel.id), "name": convenio.responsavel.name}
    return data


@router.patch("/{convenio_id}", response_model=ConvenioOut)
async def atualizar_convenio(
    convenio_id: uuid.UUID,
    body: ConvenioUpdate,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(require_permission(Perm.RESOURCE_EDIT)),
):
    result = await db.execute(
        select(Convenio).where(
            Convenio.id == convenio_id,
            Convenio.organization_id == user.organization_id,
            Convenio.deleted_at.is_(None),
        )
    )
    convenio = result.scalar_one_or_none()
    if not convenio:
        raise HTTPException(status_code=404, detail="Convênio não encontrado")

    old_status = (
        convenio.status
        if isinstance(convenio.status, StatusConvenio)
        else StatusConvenio(convenio.status)
    )

    if body.titulo is not None:
        convenio.titulo = body.titulo
    if body.descricao is not None:
        convenio.descricao = body.descricao
    if body.tipo is not None:
        convenio.tipo = body.tipo
    if body.origem is not None:
        convenio.origem = body.origem
    if body.valor is not None:
        convenio.valor = body.valor
    if body.template_fluxo_id is not None:
        convenio.template_fluxo_id = body.template_fluxo_id

    if body.categoria is not None:
        convenio.categoria = body.categoria.value if hasattr(body.categoria, "value") else body.categoria
    if body.esfera is not None:
        convenio.esfera = body.esfera.value if hasattr(body.esfera, "value") else body.esfera
    if body.prioridade is not None:
        convenio.prioridade = body.prioridade.value if hasattr(body.prioridade, "value") else body.prioridade
    if body.situacao is not None:
        convenio.situacao = body.situacao
    if body.parlamentar is not None:
        convenio.parlamentar = body.parlamentar
    if body.parlamentar_cargo is not None:
        convenio.parlamentar_cargo = body.parlamentar_cargo
    if body.partido is not None:
        convenio.partido = body.partido
    if body.orgao_concedente is not None:
        convenio.orgao_concedente = body.orgao_concedente
    if body.programa is not None:
        convenio.programa = body.programa
    if body.finalidade is not None:
        convenio.finalidade = body.finalidade
    if body.numero_proposta is not None:
        convenio.numero_proposta = body.numero_proposta
    if body.numero_instrumento is not None:
        convenio.numero_instrumento = body.numero_instrumento
    if body.numero_convenio is not None:
        convenio.numero_convenio = body.numero_convenio
    if body.numero_contrato_repasse is not None:
        convenio.numero_contrato_repasse = body.numero_contrato_repasse
    if body.numero_emenda is not None:
        convenio.numero_emenda = body.numero_emenda
    if body.numero_plano_acao is not None:
        convenio.numero_plano_acao = body.numero_plano_acao
    if body.numero_plano_trabalho is not None:
        convenio.numero_plano_trabalho = body.numero_plano_trabalho
    if body.valor_solicitado is not None:
        convenio.valor_solicitado = body.valor_solicitado
    if body.valor_aprovado is not None:
        convenio.valor_aprovado = body.valor_aprovado
    if body.valor_repasse is not None:
        convenio.valor_repasse = body.valor_repasse
    if body.contrapartida is not None:
        convenio.contrapartida = body.contrapartida
    if body.valor_executado is not None:
        convenio.valor_executado = body.valor_executado
    if body.valor_pago is not None:
        convenio.valor_pago = body.valor_pago
    if body.saldo is not None:
        convenio.saldo = body.saldo
    if body.data_aprovacao is not None:
        convenio.data_aprovacao = body.data_aprovacao
    if body.data_assinatura is not None:
        convenio.data_assinatura = body.data_assinatura
    if body.vigencia_inicio is not None:
        convenio.vigencia_inicio = body.vigencia_inicio
    if body.vigencia_fim is not None:
        convenio.vigencia_fim = body.vigencia_fim
    if body.prazo_execucao is not None:
        convenio.prazo_execucao = body.prazo_execucao
    if body.prazo_prestacao_contas is not None:
        convenio.prazo_prestacao_contas = body.prazo_prestacao_contas
    if body.previsao_conclusao is not None:
        convenio.previsao_conclusao = body.previsao_conclusao
    if body.conclusao_efetiva is not None:
        convenio.conclusao_efetiva = body.conclusao_efetiva
    if body.gestor_id is not None:
        convenio.gestor_id = body.gestor_id
    if body.fiscal_id is not None:
        convenio.fiscal_id = body.fiscal_id
    if body.engenheiro_id is not None:
        convenio.engenheiro_id = body.engenheiro_id
    if body.links_externos is not None:
        convenio.links_externos = body.links_externos
    if body.identificadores_externos is not None:
        convenio.identificadores_externos = body.identificadores_externos

    if body.status is not None and body.status != convenio.status:
        old_status.assert_transition(body.status)
        convenio.status = body.status
        await registrar_evento(
            db,
            convenio_id=convenio.id,
            tipo_evento=TipoEvento.STATUS_ALTERADO,
            ator_id=user.id,
            descricao=f"Status alterado de '{old_status.value}' para '{body.status.value}'",
            metadados={"status_anterior": old_status.value, "status_novo": body.status.value},
        )

    await db.commit()
    result = await db.execute(
        select(Convenio)
        .where(Convenio.id == convenio.id)
        .options(selectinload(Convenio.etapas))
    )
    return result.scalar_one()


@router.post("/{convenio_id}/protocolo", response_model=ConvenioOut)
async def registrar_protocolo(
    convenio_id: uuid.UUID,
    body: ProtocoloRequest,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(require_roles("ASSESSOR", "ADMIN")),
):
    result = await db.execute(
        select(Convenio).where(
            Convenio.id == convenio_id,
            Convenio.organization_id == user.organization_id,
            Convenio.deleted_at.is_(None),
        )
    )
    convenio = result.scalar_one_or_none()
    if not convenio:
        raise HTTPException(status_code=404, detail="Convênio não encontrado")

    convenio.numero_protocolo_governo = body.numero_protocolo
    convenio.data_protocolo = body.data_protocolo or datetime.now(timezone.utc)
    if convenio.status == StatusConvenio.RASCUNHO:
        convenio.status = StatusConvenio.EM_ANDAMENTO

    await registrar_evento(
        db,
        convenio_id=convenio.id,
        tipo_evento=TipoEvento.PROTOCOLO_REGISTRADO,
        ator_id=user.id,
        descricao=f"Protocolo {body.numero_protocolo} registrado no governo",
        metadados={"numero_protocolo": body.numero_protocolo},
    )
    await db.commit()
    await db.refresh(convenio)
    return convenio


@router.get("/{convenio_id}/timeline")
async def obter_timeline(
    convenio_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    result = await db.execute(
        select(Convenio)
        .where(
            Convenio.id == convenio_id,
            Convenio.organization_id == user.organization_id,
            Convenio.deleted_at.is_(None),
        )
        .options(selectinload(Convenio.eventos))
    )
    convenio = result.scalar_one_or_none()
    if not convenio:
        raise HTTPException(status_code=404, detail="Convênio não encontrado")

    return [
        {
            "id": str(e.id),
            "tipo_evento": e.tipo_evento.value if hasattr(e.tipo_evento, "value") else e.tipo_evento,
            "ator_id": str(e.ator_id),
            "descricao": e.descricao,
            "metadados": e.metadados,
            "ocorrido_em": e.ocorrido_em.isoformat(),
            "tarefa_id": str(e.tarefa_id) if e.tarefa_id else None,
        }
        for e in convenio.eventos
    ]


@router.delete("/{convenio_id}", status_code=204)
async def excluir_convenio(
    convenio_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(require_permission(Perm.RESOURCE_DELETE)),
):
    result = await db.execute(
        select(Convenio).where(
            Convenio.id == convenio_id,
            Convenio.organization_id == user.organization_id,
            Convenio.deleted_at.is_(None),
        )
    )
    convenio = result.scalar_one_or_none()
    if not convenio:
        raise HTTPException(status_code=404, detail="Convênio não encontrado")

    convenio.deleted_at = datetime.now(timezone.utc)
    await db.commit()
    return None
