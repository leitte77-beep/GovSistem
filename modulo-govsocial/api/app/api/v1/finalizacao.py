"""Endpoints finais: limites beneficio, relatorios pendentes, assinatura docs, SMS, upload habitacional."""
import uuid
from datetime import date, datetime, timedelta, timezone
from decimal import Decimal

from fastapi import APIRouter, Depends, HTTPException, Query, UploadFile
from fastapi.responses import Response
from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.auth import get_tenant_id, require_roles
from app.core.database import get_db
from app.models.agenda import Appointment
from app.models.beneficio import ConcessaoBeneficio, LimiteBeneficio
from app.models.enums import RoleName
from app.models.family import Family
from app.models.habitacional import DemandaHabitacional, DocumentoHabitacional
from app.models.organization import Organization
from app.models.person_family_membership import PersonFamilyMembership
from app.models.user import User
from app.services.calculo_renda import calcular_demonstrativo_renda

from pydantic import BaseModel
from pathlib import Path

router = APIRouter(tags=["finalizacao"])

_GESTOR = require_roles(RoleName.GESTOR_MUNICIPAL.value, RoleName.ADMIN.value)
_WRITE = require_roles(
    RoleName.COORDENADOR_UNIDADE.value,
    RoleName.GESTOR_MUNICIPAL.value,
    RoleName.ADMIN.value,
)
_READ = require_roles(
    RoleName.TECNICO_SUPERIOR.value,
    RoleName.COORDENADOR_UNIDADE.value,
    RoleName.GESTOR_MUNICIPAL.value,
    RoleName.VIGILANCIA.value,
    RoleName.ADMIN.value,
)

_TEMPLATE_DIR = Path(__file__).resolve().parent.parent / "templates" / "pdf"


def _render_pdf(template_name: str, context: dict) -> bytes:
    from jinja2 import Environment, FileSystemLoader, select_autoescape
    try:
        from weasyprint import HTML
    except Exception:
        raise HTTPException(status_code=503, detail="PDF indisponivel")
    env = Environment(loader=FileSystemLoader(str(_TEMPLATE_DIR)), autoescape=select_autoescape(["html", "xml"]))
    html = env.get_template(template_name).render(**context)
    return HTML(string=html, base_url=str(_TEMPLATE_DIR)).write_pdf()


# ─── 1. LIMITES DE BENEFÍCIO ──────────────────────────

class LimiteCreate(BaseModel):
    benefit_type_code: str
    tipo_limite: str
    valor_maximo: float
    periodo_dias: int = 365
    por_familia: bool = True
    bloquear_concessao: bool = True


@router.get("/limites-beneficio")
async def listar_limites(
    benefit_type_code: str | None = Query(None),
    db: AsyncSession = Depends(get_db),
    tenant_id: uuid.UUID = Depends(get_tenant_id),
    user: User = Depends(_GESTOR),
):
    q = select(LimiteBeneficio).where(
        LimiteBeneficio.tenant_id == tenant_id, LimiteBeneficio.ativo == True,
    )
    if benefit_type_code:
        q = q.where(LimiteBeneficio.benefit_type_code == benefit_type_code)
    return (await db.execute(q)).scalars().all()


@router.post("/limites-beneficio")
async def criar_limite(
    payload: LimiteCreate,
    db: AsyncSession = Depends(get_db),
    tenant_id: uuid.UUID = Depends(get_tenant_id),
    user: User = Depends(_GESTOR),
):
    l = LimiteBeneficio(tenant_id=tenant_id, **payload.model_dump())
    db.add(l)
    await db.commit()
    await db.refresh(l)
    return l


@router.delete("/limites-beneficio/{limite_id}", status_code=204)
async def desativar_limite(
    limite_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    tenant_id: uuid.UUID = Depends(get_tenant_id),
    user: User = Depends(_GESTOR),
):
    l = (
        await db.execute(
            select(LimiteBeneficio).where(
                LimiteBeneficio.id == limite_id, LimiteBeneficio.tenant_id == tenant_id,
            )
        )
    ).scalar_one_or_none()
    if not l:
        raise HTTPException(status_code=404)
    l.ativo = False
    await db.commit()


async def verificar_limite_beneficio(db, tenant_id, family_id, benefit_type_code, valor):
    """Verifica se a concessao ultrapassa limites configurados."""
    limites = (
        await db.execute(
            select(LimiteBeneficio).where(
                LimiteBeneficio.tenant_id == tenant_id,
                LimiteBeneficio.benefit_type_code == benefit_type_code,
                LimiteBeneficio.ativo == True,
            )
        )
    ).scalars().all()

    alertas = []
    bloqueios = []

    for limite in limites:
        inicio = date.today() - timedelta(days=limite.periodo_dias)

        if limite.tipo_limite == "QUANTITATIVO":
            q = select(func.count(ConcessaoBeneficio.id)).where(
                ConcessaoBeneficio.tenant_id == tenant_id,
                ConcessaoBeneficio.benefit_type_code == benefit_type_code,
                ConcessaoBeneficio.status.in_(["APROVADO", "ENTREGUE"]),
                func.date(ConcessaoBeneficio.data_solicitacao) >= inicio,
            )
            if limite.por_familia:
                q = q.where(ConcessaoBeneficio.family_id == family_id)
            total = await db.scalar(q) or 0
            if total >= limite.valor_maximo:
                if limite.bloquear_concessao:
                    bloqueios.append(f"Limite de {int(limite.valor_maximo)} concessoes atingido (periodo: {limite.periodo_dias} dias)")
                else:
                    alertas.append(f"Atencao: limite de {int(limite.valor_maximo)} concessoes atingido")

        elif limite.tipo_limite == "FINANCEIRO":
            q = select(func.coalesce(func.sum(ConcessaoBeneficio.valor_total), 0)).where(
                ConcessaoBeneficio.tenant_id == tenant_id,
                ConcessaoBeneficio.benefit_type_code == benefit_type_code,
                ConcessaoBeneficio.status.in_(["APROVADO", "ENTREGUE"]),
                func.date(ConcessaoBeneficio.data_solicitacao) >= inicio,
            )
            if limite.por_familia:
                q = q.where(ConcessaoBeneficio.family_id == family_id)
            total = float(await db.scalar(q) or 0) + valor
            if total > float(limite.valor_maximo):
                if limite.bloquear_concessao:
                    bloqueios.append(f"Limite financeiro de R$ {float(limite.valor_maximo):.2f} ultrapassado (periodo: {limite.periodo_dias} dias)")
                else:
                    alertas.append(f"Atencao: limite financeiro de R$ {float(limite.valor_maximo):.2f} ultrapassado")

    return {"pode_conceder": len(bloqueios) == 0, "alertas": alertas, "bloqueios": bloqueios}


@router.get("/beneficios/verificar-limite")
async def consultar_limite(
    family_id: uuid.UUID = Query(),
    benefit_type_code: str = Query(),
    valor: float = Query(default=0),
    db: AsyncSession = Depends(get_db),
    tenant_id: uuid.UUID = Depends(get_tenant_id),
    user: User = Depends(_READ),
):
    return await verificar_limite_beneficio(db, tenant_id, family_id, benefit_type_code, valor)


# ─── 2. RELATÓRIOS PENDENTES ──────────────────────────

@router.get("/reports/agendamento/{appointment_id}/comprovante")
async def comprovante_agendamento(
    appointment_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    tenant_id: uuid.UUID = Depends(get_tenant_id),
    user: User = Depends(_READ),
):
    a = (
        await db.execute(
            select(Appointment).where(
                Appointment.id == appointment_id, Appointment.tenant_id == tenant_id,
            )
        )
    ).scalar_one_or_none()
    if not a:
        raise HTTPException(status_code=404)

    org = await db.get(Organization, tenant_id)
    pdf = _render_pdf("comprovante_agendamento.html", {
        "municipio": org.name if org else "",
        "data": a.data_hora_inicio.strftime("%d/%m/%Y"),
        "hora": a.data_hora_inicio.strftime("%H:%M"),
        "local": a.local_atendimento or "Unidade de referencia",
        "documentos": (a.documentos_necessarios or "").split(";"),
        "senha": a.senha,
        "gerado_em": datetime.now(timezone.utc).strftime("%d/%m/%Y %H:%M"),
    })
    return Response(pdf, media_type="application/pdf",
                    headers={"Content-Disposition": "inline; filename=comprovante_agendamento.pdf"})


@router.get("/reports/grupos/{acao_id}/autorizacao-scfv/{inscricao_id}")
async def autorizacao_scfv(
    acao_id: uuid.UUID,
    inscricao_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    tenant_id: uuid.UUID = Depends(get_tenant_id),
    user: User = Depends(_READ),
):
    from app.models.acao_coletiva import AcaoColetiva, Inscricao
    from sqlalchemy.orm import selectinload

    acao = (
        await db.execute(
            select(AcaoColetiva).where(
                AcaoColetiva.id == acao_id, AcaoColetiva.tenant_id == tenant_id,
            )
        )
    ).scalar_one_or_none()
    if not acao:
        raise HTTPException(status_code=404)

    inscricao = (
        await db.execute(
            select(Inscricao).where(
                Inscricao.id == inscricao_id, Inscricao.tenant_id == tenant_id,
            ).options(selectinload(Inscricao.person))
        )
    ).scalar_one_or_none()
    if not inscricao:
        raise HTTPException(status_code=404)

    org = await db.get(Organization, tenant_id)
    pdf = _render_pdf("autorizacao_scfv.html", {
        "municipio": org.name if org else "",
        "acao": acao,
        "participante": inscricao.person.nome_exibicao if inscricao.person else "",
        "gerado_em": datetime.now(timezone.utc).strftime("%d/%m/%Y"),
    })
    return Response(pdf, media_type="application/pdf")


@router.get("/reports/atendimentos/solicitacao-comparecimento/{person_id}")
async def solicitacao_comparecimento(
    person_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    tenant_id: uuid.UUID = Depends(get_tenant_id),
    user: User = Depends(_READ),
):
    from app.models.person import Person
    person = (
        await db.execute(
            select(Person).where(Person.id == person_id, Person.tenant_id == tenant_id, Person.deleted_at.is_(None))
        )
    ).scalar_one_or_none()
    if not person:
        raise HTTPException(status_code=404)

    org = await db.get(Organization, tenant_id)
    pdf = _render_pdf("solicitacao_comparecimento.html", {
        "municipio": org.name if org else "",
        "nome": person.nome_exibicao,
        "cpf": person.cpf or "",
        "nis": person.nis or "",
        "gerado_em": datetime.now(timezone.utc).strftime("%d/%m/%Y"),
    })
    return Response(pdf, media_type="application/pdf")


@router.get("/reports/acompanhamento/desligamento/{acompanhamento_id}")
async def desligamento_programa(
    acompanhamento_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    tenant_id: uuid.UUID = Depends(get_tenant_id),
    user: User = Depends(_READ),
):
    from app.models.acompanhamento import Acompanhamento
    from sqlalchemy.orm import selectinload

    a = (
        await db.execute(
            select(Acompanhamento).where(
                Acompanhamento.id == acompanhamento_id, Acompanhamento.tenant_id == tenant_id,
            ).options(selectinload(Acompanhamento.case_file).selectinload("family"))
        )
    ).scalar_one_or_none()
    if not a:
        raise HTTPException(status_code=404)

    org = await db.get(Organization, tenant_id)
    pdf = _render_pdf("desligamento_programa.html", {
        "municipio": org.name if org else "",
        "tipo": a.tipo,
        "familia_codigo": a.case_file.family.codigo if a.case_file and a.case_file.family else "",
        "data_desligamento": a.data_fim.strftime("%d/%m/%Y") if a.data_fim else "",
        "motivo": a.motivo_desligamento or "Nao informado",
        "gerado_em": datetime.now(timezone.utc).strftime("%d/%m/%Y"),
    })
    return Response(pdf, media_type="application/pdf")


# ─── 3. ASSINATURA DE DOCUMENTOS ──────────────────────

@router.post("/documentos/assinar/{documento_id}")
async def assinar_documento(
    documento_id: uuid.UUID,
    assinatura_base64: str | None = None,
    db: AsyncSession = Depends(get_db),
    tenant_id: uuid.UUID = Depends(get_tenant_id),
    user: User = Depends(_READ),
):
    """Registra assinatura eletronica em um documento autenticavel."""
    from app.models.autenticador import DocumentoAutenticavel

    doc = (
        await db.execute(
            select(DocumentoAutenticavel).where(
                DocumentoAutenticavel.id == documento_id,
                DocumentoAutenticavel.tenant_id == tenant_id,
            )
        )
    ).scalar_one_or_none()
    if not doc:
        raise HTTPException(status_code=404)

    snap = doc.dados_snapshot or {}
    snap["assinatura_eletronica"] = {
        "assinado_em": datetime.now(timezone.utc).isoformat(),
        "assinado_por": user.id.hex if hasattr(user.id, 'hex') else str(user.id),
        "hash_documento": str(hash(str(snap.get("conteudo", "")))),
    }
    doc.dados_snapshot = snap
    await db.commit()

    return {"status": "assinado", "documento_id": str(doc.id)}


# ─── 4. SMS REAL ─────────────────────────────────────

@router.post("/notifications/send-sms")
async def enviar_sms(
    phone: str = Query(),
    message: str = Query(max_length=160),
    db: AsyncSession = Depends(get_db),
    tenant_id: uuid.UUID = Depends(get_tenant_id),
    user: User = Depends(_GESTOR),
):
    """Envia SMS via provider configurado (Twilio/TotalVoice/Zenvia)."""
    org = await db.get(Organization, tenant_id)
    if not org or not org.sms_api_key:
        raise HTTPException(status_code=422, detail="SMS nao configurado para este tenant")

    provider = org.sms_provider or "twilio"
    api_key = org.sms_api_key
    sender = org.sms_sender_id or "GovSocial"

    if provider == "twilio":
        from twilio.rest import Client
        try:
            sid, token = api_key.split(":", 1) if ":" in api_key else (api_key, "")
            client = Client(sid, token)
            client.messages.create(body=message, from_=sender, to=phone)
        except Exception as e:
            raise HTTPException(status_code=500, detail=f"Erro SMS: {e}")

    elif provider == "zenvia":
        import requests
        try:
            requests.post("https://api.zenvia.com/v2/channels/sms/messages", json={
                "from": sender, "to": phone, "contents": [{"type": "text", "text": message}],
            }, headers={"X-API-TOKEN": api_key, "Content-Type": "application/json"}, timeout=10)
        except Exception as e:
            raise HTTPException(status_code=500, detail=f"Erro SMS: {e}")

    elif provider == "log":
        import logging
        logging.getLogger("govsocial.sms").info(f"SMS → {phone}: {message}")

    return {"ok": True, "provider": provider}


# ─── 5. UPLOAD DOCUMENTOS HABITACIONAIS ──────────────

@router.post("/demandas-habitacionais/{demanda_id}/documentos")
async def upload_documento_habitacional(
    demanda_id: uuid.UUID,
    file: UploadFile,
    tipo: str = Query(default="OUTRO"),
    db: AsyncSession = Depends(get_db),
    tenant_id: uuid.UUID = Depends(get_tenant_id),
    user: User = Depends(_READ),
):
    d = (
        await db.execute(
            select(DemandaHabitacional).where(
                DemandaHabitacional.id == demanda_id,
                DemandaHabitacional.tenant_id == tenant_id,
            )
        )
    ).scalar_one_or_none()
    if not d:
        raise HTTPException(status_code=404)

    import os
    from app.core.config import settings

    ext = os.path.splitext(file.filename or "doc.pdf")[1]
    nome_arquivo = f"habitacional/{tenant_id}/{demanda_id}/{uuid.uuid4()}{ext}"
    storage_path = os.path.join(settings.UPLOAD_DIR, nome_arquivo)
    os.makedirs(os.path.dirname(storage_path), exist_ok=True)
    content = await file.read()
    with open(storage_path, "wb") as f:
        f.write(content)

    doc = DocumentoHabitacional(
        tenant_id=tenant_id,
        demanda_id=demanda_id,
        nome=file.filename or "documento",
        tipo=tipo,
        storage_path=nome_arquivo,
        content_type=file.content_type,
        tamanho_bytes=len(content),
    )
    db.add(doc)
    await db.commit()
    await db.refresh(doc)
    return {"id": str(doc.id), "nome": doc.nome, "tipo": doc.tipo}
