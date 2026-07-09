import uuid

from fastapi import APIRouter, Depends, HTTPException, Query, Request
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.auth import get_client_info, get_tenant_id, require_roles
from app.core.database import get_db
from app.models.acao_coletiva import (
    AcaoColetiva,
    EncontroFrequencia,
    Inscricao,
    RegistroFrequencia,
)
from app.models.enums import AuditAction, RoleName
from app.models.person import Person
from app.models.user import User
from app.schemas.acoes_coletivas import (
    AcaoColetivaCreate,
    AcaoColetivaOut,
    AcaoColetivaUpdate,
    EncontroCreate,
    EncontroOut,
    FrequenciaOut,
    FrequenciaRegistro,
    InscricaoCreate,
    InscricaoOut,
    InscricaoUpdate,
    ParticipanteRelatorio,
)
from app.services.audit import record_audit

router = APIRouter(tags=["acoes-coletivas"])

_READ = require_roles(
    RoleName.TECNICO_SUPERIOR.value,
    RoleName.TECNICO_MEDIO.value,
    RoleName.COORDENADOR_UNIDADE.value,
    RoleName.GESTOR_MUNICIPAL.value,
    RoleName.VIGILANCIA.value,
    RoleName.ADMIN.value,
)
_MANAGE = require_roles(
    RoleName.TECNICO_SUPERIOR.value,
    RoleName.COORDENADOR_UNIDADE.value,
    RoleName.ADMIN.value,
)


# ═══════════════════════════════════════════════════════════════════════
# CRUD Ações Coletivas
# ═══════════════════════════════════════════════════════════════════════

@router.get("/acoes-coletivas", response_model=list[AcaoColetivaOut])
async def listar_acoes(
    unit_id: uuid.UUID | None = Query(None),
    tipo: str | None = Query(None),
    status: str | None = Query(None),
    db: AsyncSession = Depends(get_db),
    tenant_id: uuid.UUID = Depends(get_tenant_id),
    user: User = Depends(_READ),
):
    q = select(AcaoColetiva).where(
        AcaoColetiva.tenant_id == tenant_id,
        AcaoColetiva.deleted_at.is_(None),
    )
    if unit_id:
        q = q.where(AcaoColetiva.unit_id == unit_id)
    if tipo:
        q = q.where(AcaoColetiva.tipo == tipo)
    if status:
        q = q.where(AcaoColetiva.status == status)
    q = q.order_by(AcaoColetiva.data_inicio.desc())
    rows = (await db.execute(q)).scalars().all()
    out = []
    for a in rows:
        d = {
            "id": a.id, "unit_id": a.unit_id, "nome": a.nome,
            "descricao": a.descricao, "tipo": a.tipo,
            "service_type_code": a.service_type_code,
            "faixa_etaria": a.faixa_etaria, "publico_alvo": a.publico_alvo,
            "data_inicio": a.data_inicio, "data_fim": a.data_fim,
            "periodicidade": a.periodicidade, "dia_semana": a.dia_semana,
            "horario_inicio": a.horario_inicio, "horario_fim": a.horario_fim,
            "local": a.local, "vagas_total": a.vagas_total,
            "vagas_disponiveis": a.vagas_disponiveis, "status": a.status,
            "profissional_responsavel_id": a.profissional_responsavel_id,
            "total_inscritos": len([i for i in a.inscricoes if i.status == "ATIVA"]),
            "created_at": a.created_at, "updated_at": a.updated_at,
        }
        out.append(d)
    return out


@router.post("/acoes-coletivas", response_model=AcaoColetivaOut, status_code=201)
async def criar_acao(
    body: AcaoColetivaCreate,
    request: Request,
    db: AsyncSession = Depends(get_db),
    tenant_id: uuid.UUID = Depends(get_tenant_id),
    user: User = Depends(_MANAGE),
):
    vagas = body.vagas_total
    a = AcaoColetiva(
        tenant_id=tenant_id,
        unit_id=body.unit_id,
        nome=body.nome, descricao=body.descricao, tipo=body.tipo,
        service_type_code=body.service_type_code,
        faixa_etaria=body.faixa_etaria, publico_alvo=body.publico_alvo,
        data_inicio=body.data_inicio, data_fim=body.data_fim,
        periodicidade=body.periodicidade, dia_semana=body.dia_semana,
        horario_inicio=body.horario_inicio, horario_fim=body.horario_fim,
        local=body.local, vagas_total=vagas, vagas_disponiveis=vagas,
        profissional_responsavel_id=body.profissional_responsavel_id,
    )
    db.add(a)
    await db.flush()
    await record_audit(
        db, tenant_id=tenant_id, action=AuditAction.CREATE,
        entity="acao_coletiva", entity_id=a.id, actor=user,
        client_info=get_client_info(request),
        diff_summary={"nome": a.nome, "tipo": a.tipo},
    )
    await db.commit()
    a = (await db.execute(select(AcaoColetiva).where(AcaoColetiva.id == a.id))).scalar_one()
    return {
        "id": a.id, "unit_id": a.unit_id, "nome": a.nome,
        "descricao": a.descricao, "tipo": a.tipo,
        "service_type_code": a.service_type_code,
        "faixa_etaria": a.faixa_etaria, "publico_alvo": a.publico_alvo,
        "data_inicio": a.data_inicio, "data_fim": a.data_fim,
        "periodicidade": a.periodicidade, "dia_semana": a.dia_semana,
        "horario_inicio": a.horario_inicio, "horario_fim": a.horario_fim,
        "local": a.local, "vagas_total": a.vagas_total,
        "vagas_disponiveis": a.vagas_disponiveis, "status": a.status,
        "profissional_responsavel_id": a.profissional_responsavel_id,
        "total_inscritos": 0, "created_at": a.created_at, "updated_at": a.updated_at,
    }


@router.get("/acoes-coletivas/{acao_id}", response_model=AcaoColetivaOut)
async def obter_acao(
    acao_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    tenant_id: uuid.UUID = Depends(get_tenant_id),
    user: User = Depends(_READ),
):
    a = (
        await db.execute(select(AcaoColetiva).where(
            AcaoColetiva.id == acao_id, AcaoColetiva.tenant_id == tenant_id,
            AcaoColetiva.deleted_at.is_(None),
        ))
    ).scalar_one_or_none()
    if not a:
        raise HTTPException(status_code=404, detail="Ação não encontrada")
    return {
        "id": a.id, "unit_id": a.unit_id, "nome": a.nome,
        "descricao": a.descricao, "tipo": a.tipo,
        "service_type_code": a.service_type_code,
        "faixa_etaria": a.faixa_etaria, "publico_alvo": a.publico_alvo,
        "data_inicio": a.data_inicio, "data_fim": a.data_fim,
        "periodicidade": a.periodicidade, "dia_semana": a.dia_semana,
        "horario_inicio": a.horario_inicio, "horario_fim": a.horario_fim,
        "local": a.local, "vagas_total": a.vagas_total,
        "vagas_disponiveis": a.vagas_disponiveis, "status": a.status,
        "profissional_responsavel_id": a.profissional_responsavel_id,
        "total_inscritos": len([i for i in a.inscricoes if i.status == "ATIVA"]),
        "created_at": a.created_at, "updated_at": a.updated_at,
    }


@router.patch("/acoes-coletivas/{acao_id}", response_model=AcaoColetivaOut)
async def atualizar_acao(
    acao_id: uuid.UUID,
    body: AcaoColetivaUpdate,
    request: Request,
    db: AsyncSession = Depends(get_db),
    tenant_id: uuid.UUID = Depends(get_tenant_id),
    user: User = Depends(_MANAGE),
):
    a = (
        await db.execute(select(AcaoColetiva).where(
            AcaoColetiva.id == acao_id, AcaoColetiva.tenant_id == tenant_id,
            AcaoColetiva.deleted_at.is_(None),
        ))
    ).scalar_one_or_none()
    if not a:
        raise HTTPException(status_code=404, detail="Ação não encontrada")
    changes = body.model_dump(exclude_unset=True)
    for f, v in changes.items():
        setattr(a, f, v)
    await record_audit(
        db, tenant_id=tenant_id, action=AuditAction.UPDATE,
        entity="acao_coletiva", entity_id=a.id, actor=user,
        client_info=get_client_info(request),
        diff_summary={"campos": list(changes.keys())},
    )
    await db.commit()
    a = (await db.execute(select(AcaoColetiva).where(AcaoColetiva.id == a.id))).scalar_one()
    return {
        "id": a.id, "unit_id": a.unit_id, "nome": a.nome,
        "descricao": a.descricao, "tipo": a.tipo,
        "service_type_code": a.service_type_code,
        "faixa_etaria": a.faixa_etaria, "publico_alvo": a.publico_alvo,
        "data_inicio": a.data_inicio, "data_fim": a.data_fim,
        "periodicidade": a.periodicidade, "dia_semana": a.dia_semana,
        "horario_inicio": a.horario_inicio, "horario_fim": a.horario_fim,
        "local": a.local, "vagas_total": a.vagas_total,
        "vagas_disponiveis": a.vagas_disponiveis, "status": a.status,
        "profissional_responsavel_id": a.profissional_responsavel_id,
        "total_inscritos": len([i for i in a.inscricoes if i.status == "ATIVA"]),
        "created_at": a.created_at, "updated_at": a.updated_at,
    }


# ═══════════════════════════════════════════════════════════════════════
# Inscrições
# ═══════════════════════════════════════════════════════════════════════

@router.get("/acoes-coletivas/{acao_id}/enrollments", response_model=list[InscricaoOut])
async def listar_inscricoes(
    acao_id: uuid.UUID,
    status: str | None = Query(None),
    db: AsyncSession = Depends(get_db),
    tenant_id: uuid.UUID = Depends(get_tenant_id),
    user: User = Depends(_READ),
):
    q = select(Inscricao).where(
        Inscricao.tenant_id == tenant_id,
        Inscricao.acao_coletiva_id == acao_id,
    )
    if status:
        q = q.where(Inscricao.status == status)
    rows = (await db.execute(q.order_by(Inscricao.data_inscricao))).scalars().all()
    return rows


@router.post("/acoes-coletivas/{acao_id}/enrollments", response_model=InscricaoOut, status_code=201)
async def inscrever_participante(
    acao_id: uuid.UUID,
    body: InscricaoCreate,
    request: Request,
    db: AsyncSession = Depends(get_db),
    tenant_id: uuid.UUID = Depends(get_tenant_id),
    user: User = Depends(_MANAGE),
):
    a = (
        await db.execute(select(AcaoColetiva).where(
            AcaoColetiva.id == acao_id, AcaoColetiva.tenant_id == tenant_id,
            AcaoColetiva.deleted_at.is_(None),
        ))
    ).scalar_one_or_none()
    if not a:
        raise HTTPException(status_code=404, detail="Ação não encontrada")

    person = (
        await db.execute(select(Person.id).where(
            Person.id == body.person_id, Person.tenant_id == tenant_id,
            Person.deleted_at.is_(None),
        ))
    ).scalar_one_or_none()
    if not person:
        raise HTTPException(status_code=422, detail="Pessoa inválida")

    dup = (
        await db.execute(select(Inscricao.id).where(
            Inscricao.acao_coletiva_id == acao_id,
            Inscricao.person_id == body.person_id,
            Inscricao.status == "ATIVA",
        ))
    ).scalar_one_or_none()
    if dup:
        raise HTTPException(status_code=409, detail="Pessoa já inscrita nesta ação")

    # Se vagas limitadas e sem vaga, vai para lista de espera
    final_status = body.status
    if a.vagas_disponiveis is not None and a.vagas_disponiveis <= 0:
        if final_status == "ATIVA":
            final_status = "LISTA_ESPERA"

    i = Inscricao(
        tenant_id=tenant_id, acao_coletiva_id=acao_id,
        person_id=body.person_id, family_id=body.family_id,
        status=final_status,
    )
    db.add(i)
    if final_status == "ATIVA" and a.vagas_disponiveis is not None:
        a.vagas_disponiveis -= 1
    await db.flush()
    await record_audit(
        db, tenant_id=tenant_id, action=AuditAction.CREATE,
        entity="inscricao", entity_id=i.id, actor=user,
        client_info=get_client_info(request),
        diff_summary={"pessoa": str(body.person_id), "status": final_status},
    )
    await db.commit()
    return i if i.status else (
        await db.execute(select(Inscricao).where(Inscricao.id == i.id))
    ).scalar_one()


@router.patch("/acoes-coletivas/{acao_id}/enrollments/{inscricao_id}", response_model=InscricaoOut)
async def atualizar_inscricao(
    acao_id: uuid.UUID,
    inscricao_id: uuid.UUID,
    body: InscricaoUpdate,
    request: Request,
    db: AsyncSession = Depends(get_db),
    tenant_id: uuid.UUID = Depends(get_tenant_id),
    user: User = Depends(_MANAGE),
):
    i = (
        await db.execute(select(Inscricao).where(
            Inscricao.id == inscricao_id, Inscricao.acao_coletiva_id == acao_id,
            Inscricao.tenant_id == tenant_id,
        ))
    ).scalar_one_or_none()
    if not i:
        raise HTTPException(status_code=404, detail="Inscrição não encontrada")
    old_status = i.status
    changes = body.model_dump(exclude_unset=True)
    for f, v in changes.items():
        setattr(i, f, v)
    if old_status == "ATIVA" and i.status in ("DESLIGADA", "CONCLUIDA"):
        a = (
            await db.execute(select(AcaoColetiva).where(
                AcaoColetiva.id == acao_id,
            ))
        ).scalar_one()
        if a.vagas_disponiveis is not None:
            a.vagas_disponiveis += 1
    await record_audit(
        db, tenant_id=tenant_id, action=AuditAction.UPDATE,
        entity="inscricao", entity_id=i.id, actor=user,
        client_info=get_client_info(request),
        diff_summary={"novo_status": i.status},
    )
    await db.commit()
    i = (await db.execute(select(Inscricao).where(Inscricao.id == i.id))).scalar_one()
    return i


# ═══════════════════════════════════════════════════════════════════════
# Encontros e Frequência
# ═══════════════════════════════════════════════════════════════════════

@router.get("/acoes-coletivas/{acao_id}/meetings", response_model=list[EncontroOut])
async def listar_encontros(
    acao_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    tenant_id: uuid.UUID = Depends(get_tenant_id),
    user: User = Depends(_READ),
):
    rows = (
        await db.execute(select(EncontroFrequencia).where(
            EncontroFrequencia.acao_coletiva_id == acao_id,
            EncontroFrequencia.tenant_id == tenant_id,
        ).order_by(EncontroFrequencia.data_encontro.desc()))
    ).scalars().all()
    return [
        {
            "id": e.id, "acao_coletiva_id": e.acao_coletiva_id,
            "data_encontro": e.data_encontro, "tema": e.tema,
            "observacoes": e.observacoes,
            "total_presentes": len([r for r in e.registros if r.presente]),
            "total_faltas": len([r for r in e.registros if not r.presente]),
            "created_at": e.created_at,
        }
        for e in rows
    ]


@router.post("/acoes-coletivas/{acao_id}/meetings", response_model=EncontroOut, status_code=201)
async def criar_encontro(
    acao_id: uuid.UUID,
    body: EncontroCreate,
    request: Request,
    db: AsyncSession = Depends(get_db),
    tenant_id: uuid.UUID = Depends(get_tenant_id),
    user: User = Depends(_MANAGE),
):
    ok = (
        await db.execute(select(AcaoColetiva.id).where(
            AcaoColetiva.id == acao_id, AcaoColetiva.tenant_id == tenant_id,
            AcaoColetiva.deleted_at.is_(None),
        ))
    ).scalar_one_or_none()
    if not ok:
        raise HTTPException(status_code=404, detail="Ação não encontrada")

    e = EncontroFrequencia(
        tenant_id=tenant_id, acao_coletiva_id=acao_id,
        data_encontro=body.data_encontro, tema=body.tema,
        observacoes=body.observacoes,
    )
    db.add(e)
    # Pré-cria registros de frequência (todos ausentes por padrão) para
    # cada inscrito ativo
    await db.flush()
    inscritos = (
        await db.execute(select(Inscricao).where(
            Inscricao.acao_coletiva_id == acao_id,
            Inscricao.status == "ATIVA",
            Inscricao.tenant_id == tenant_id,
        ))
    ).scalars().all()
    for ins in inscritos:
        db.add(RegistroFrequencia(
            tenant_id=tenant_id, encontro_id=e.id,
            inscricao_id=ins.id, presente=True,
        ))
    await record_audit(
        db, tenant_id=tenant_id, action=AuditAction.CREATE,
        entity="encontro_frequencia", entity_id=e.id, actor=user,
        client_info=get_client_info(request),
        diff_summary={"data": str(body.data_encontro)},
    )
    await db.commit()
    e = (
        await db.execute(select(EncontroFrequencia).where(EncontroFrequencia.id == e.id))
    ).scalar_one()
    return {
        "id": e.id, "acao_coletiva_id": e.acao_coletiva_id,
        "data_encontro": e.data_encontro, "tema": e.tema,
        "observacoes": e.observacoes,
        "total_presentes": len([r for r in e.registros if r.presente]),
        "total_faltas": 0,
        "created_at": e.created_at,
    }


@router.post(
    "/acoes-coletivas/{acao_id}/meetings/{encontro_id}/attendance",
    response_model=list[FrequenciaOut],
)
async def registrar_frequencia(
    acao_id: uuid.UUID,
    encontro_id: uuid.UUID,
    body: list[FrequenciaRegistro],
    request: Request,
    db: AsyncSession = Depends(get_db),
    tenant_id: uuid.UUID = Depends(get_tenant_id),
    user: User = Depends(_MANAGE),
):
    e = (
        await db.execute(select(EncontroFrequencia).where(
            EncontroFrequencia.id == encontro_id,
            EncontroFrequencia.acao_coletiva_id == acao_id,
            EncontroFrequencia.tenant_id == tenant_id,
        ))
    ).scalar_one_or_none()
    if not e:
        raise HTTPException(status_code=404, detail="Encontro não encontrado")

    out = []
    for fr in body:
        existing = (
            await db.execute(select(RegistroFrequencia).where(
                RegistroFrequencia.encontro_id == encontro_id,
                RegistroFrequencia.inscricao_id == fr.inscricao_id,
                RegistroFrequencia.tenant_id == tenant_id,
            ))
        ).scalar_one_or_none()
        if existing:
            existing.presente = fr.presente
            existing.justificativa = fr.justificativa
            out.append(existing)
        else:
            rf = RegistroFrequencia(
                tenant_id=tenant_id, encontro_id=encontro_id,
                inscricao_id=fr.inscricao_id,
                presente=fr.presente, justificativa=fr.justificativa,
            )
            db.add(rf)
            out.append(rf)
    await record_audit(
        db, tenant_id=tenant_id, action=AuditAction.UPDATE,
        entity="registro_frequencia", entity_id=encontro_id, actor=user,
        client_info=get_client_info(request),
        diff_summary={"total": len(body)},
    )
    await db.commit()
    return [{"id": r.id, "encontro_id": r.encontro_id,
             "inscricao_id": r.inscricao_id, "presente": r.presente,
             "justificativa": r.justificativa, "created_at": r.created_at}
            for r in out]


@router.get(
    "/acoes-coletivas/{acao_id}/meetings/{encontro_id}/attendance",
    response_model=list[FrequenciaOut],
)
async def listar_frequencia(
    acao_id: uuid.UUID,
    encontro_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    tenant_id: uuid.UUID = Depends(get_tenant_id),
    user: User = Depends(_READ),
):
    rows = (
        await db.execute(select(RegistroFrequencia).where(
            RegistroFrequencia.encontro_id == encontro_id,
            RegistroFrequencia.tenant_id == tenant_id,
        ).order_by(RegistroFrequencia.presente.desc()))
    ).scalars().all()
    return rows


# ═══════════════════════════════════════════════════════════════════════
# Relatório de participação
# ═══════════════════════════════════════════════════════════════════════

@router.get(
    "/acoes-coletivas/{acao_id}/report",
    response_model=list[ParticipanteRelatorio],
)
async def relatorio_participacao(
    acao_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    tenant_id: uuid.UUID = Depends(get_tenant_id),
    user: User = Depends(_READ),
):
    ok = (
        await db.execute(select(AcaoColetiva.id).where(
            AcaoColetiva.id == acao_id, AcaoColetiva.tenant_id == tenant_id,
            AcaoColetiva.deleted_at.is_(None),
        ))
    ).scalar_one_or_none()
    if not ok:
        raise HTTPException(status_code=404, detail="Ação não encontrada")

    inscricoes = (
        await db.execute(select(Inscricao).where(
            Inscricao.acao_coletiva_id == acao_id,
            Inscricao.status.in_(["ATIVA", "CONCLUIDA"]),
            Inscricao.tenant_id == tenant_id,
        ))
    ).scalars().all()

    encontros = (
        await db.execute(
            select(EncontroFrequencia.id).where(
                EncontroFrequencia.acao_coletiva_id == acao_id,
                EncontroFrequencia.tenant_id == tenant_id,
            )
        )
    ).scalars().all()
    encontro_ids = [e for e in encontros]
    total_encontros = len(encontro_ids)

    out = []
    for ins in inscricoes:
        registros = (
            await db.execute(select(RegistroFrequencia).where(
                RegistroFrequencia.inscricao_id == ins.id,
                RegistroFrequencia.encontro_id.in_(encontro_ids) if encontro_ids else True,
                RegistroFrequencia.tenant_id == tenant_id,
            ))
        ).scalars().all()
        presentes = sum(1 for r in registros if r.presente)
        faltas = sum(1 for r in registros if not r.presente)
        perc = (presentes / max(total_encontros, 1)) * 100
        out.append(ParticipanteRelatorio(
            person_id=ins.person_id,
            inscricao_id=ins.id,
            total_encontros=total_encontros,
            total_presente=presentes,
            total_falta=faltas,
            percentual_presenca=round(perc, 1),
        ))
    return out
