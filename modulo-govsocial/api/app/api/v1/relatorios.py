"""Endpoints de relatorios gerenciais em PDF."""
import uuid
from datetime import date, datetime, timezone
from pathlib import Path

from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import Response
from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.core.auth import get_tenant_id, require_roles
from app.core.database import get_db
from app.models.acao_coletiva import AcaoColetiva, EncontroFrequencia, Inscricao, RegistroFrequencia
from app.models.acompanhamento import Acompanhamento
from app.models.attendance import Attendance, AttendanceMember
from app.models.beneficio import ConcessaoBeneficio, EstoqueUnidade
from app.models.case_file import CaseFile
from app.models.encaminhamento import Encaminhamento
from app.models.enums import RoleName
from app.models.family import Family
from app.models.organization import Organization
from app.models.person import Person
from app.models.person_family_membership import PersonFamilyMembership
from app.models.professional import Professional
from app.models.professional_assignment import ProfessionalAssignment
from app.models.unit import Unit
from app.models.user import User
from app.services.calculo_renda import calcular_demonstrativo_renda

router = APIRouter(tags=["relatorios"])

_READ = require_roles(
    RoleName.GESTOR_MUNICIPAL.value,
    RoleName.COORDENADOR_UNIDADE.value,
    RoleName.TECNICO_SUPERIOR.value,
    RoleName.VIGILANCIA.value,
    RoleName.ADMIN.value,
)

_TEMPLATE_DIR = Path(__file__).resolve().parent.parent / "templates" / "pdf"


def _render_pdf(template_name: str, context: dict) -> bytes:
    from jinja2 import Environment, FileSystemLoader, select_autoescape
    try:
        from weasyprint import HTML
    except Exception:
        raise HTTPException(status_code=503, detail="Geracao de PDF indisponivel")

    env = Environment(
        loader=FileSystemLoader(str(_TEMPLATE_DIR)),
        autoescape=select_autoescape(["html", "xml"]),
    )
    tmpl = env.get_template(template_name)
    html = tmpl.render(**context)
    return HTML(string=html, base_url=str(_TEMPLATE_DIR)).write_pdf()


async def _org_info(db, tenant_id):
    org = await db.get(Organization, tenant_id)
    return {
        "municipio": org.name if org else "",
        "brasao": None,
    }


# ─── FAMÍLIA ──────────────────────────────────────────

@router.get("/reports/familia/{family_id}/ficha-completa")
async def ficha_cadastral_familia(
    family_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    tenant_id: uuid.UUID = Depends(get_tenant_id),
    user: User = Depends(_READ),
):
    family = (
        await db.execute(
            select(Family).where(
                Family.id == family_id, Family.tenant_id == tenant_id,
                Family.deleted_at.is_(None),
            ).options(selectinload(Family.responsavel))
        )
    ).scalar_one_or_none()
    if not family:
        raise HTTPException(status_code=404)

    members = (
        await db.execute(
            select(PersonFamilyMembership).where(
                PersonFamilyMembership.tenant_id == tenant_id,
                PersonFamilyMembership.family_id == family_id,
                PersonFamilyMembership.status == "ATIVO",
            ).options(selectinload(PersonFamilyMembership.person))
        )
    ).scalars().all()

    renda = await calcular_demonstrativo_renda(db, tenant_id, family_id)
    beneficios = (
        await db.execute(
            select(ConcessaoBeneficio).where(
                ConcessaoBeneficio.tenant_id == tenant_id,
                ConcessaoBeneficio.family_id == family_id,
                ConcessaoBeneficio.status == "ENTREGUE",
            ).limit(20)
        )
    ).scalars().all()

    org = await _org_info(db, tenant_id)
    context = {
        **org,
        "familia": family,
        "membros": [{"nome": m.person.nome_exibicao, "parentesco": m.parentesco,
                      "nis": m.person.nis or "", "cpf": m.person.cpf or ""} for m in members],
        "renda": renda,
        "beneficios": beneficios,
        "gerado_em": datetime.now(timezone.utc).strftime("%d/%m/%Y %H:%M"),
    }
    pdf = _render_pdf("ficha_familia.html", context)
    return Response(pdf, media_type="application/pdf",
                    headers={"Content-Disposition": f"inline; filename=ficha_{family.codigo}.pdf"})


@router.get("/reports/familia/{family_id}/atestado-pobreza")
async def atestado_pobreza(
    family_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    tenant_id: uuid.UUID = Depends(get_tenant_id),
    user: User = Depends(_READ),
):
    family = (
        await db.execute(
            select(Family).where(
                Family.id == family_id, Family.tenant_id == tenant_id,
                Family.deleted_at.is_(None),
            ).options(selectinload(Family.responsavel))
        )
    ).scalar_one_or_none()
    if not family:
        raise HTTPException(status_code=404)

    renda = await calcular_demonstrativo_renda(db, tenant_id, family_id)
    org = await _org_info(db, tenant_id)
    context = {
        **org,
        "familia": family,
        "responsavel": family.responsavel.nome_exibicao if family.responsavel else "",
        "cpf_responsavel": family.responsavel.cpf or "",
        "renda_per_capita": renda["renda_per_capita"],
        "total_membros": renda["total_membros"],
        "gerado_em": datetime.now(timezone.utc).strftime("%d/%m/%Y"),
    }
    pdf = _render_pdf("atestado_pobreza.html", context)
    return Response(pdf, media_type="application/pdf")


# ─── BENEFÍCIOS ────────────────────────────────────────

@router.get("/reports/beneficios/concedidos-por-tipo")
async def beneficios_por_tipo(
    data_inicio: date = Query(),
    data_fim: date = Query(),
    db: AsyncSession = Depends(get_db),
    tenant_id: uuid.UUID = Depends(get_tenant_id),
    user: User = Depends(_READ),
):
    rows = (
        await db.execute(
            select(
                ConcessaoBeneficio.benefit_type_code,
                func.count(ConcessaoBeneficio.id).label("total"),
                func.sum(ConcessaoBeneficio.valor_total).label("valor"),
            ).where(
                ConcessaoBeneficio.tenant_id == tenant_id,
                ConcessaoBeneficio.data_solicitacao.between(data_inicio, data_fim),
                ConcessaoBeneficio.status.in_(["APROVADO", "ENTREGUE"]),
            ).group_by(ConcessaoBeneficio.benefit_type_code)
        )
    ).all()

    org = await _org_info(db, tenant_id)
    pdf = _render_pdf("beneficios_por_tipo.html", {
        **org,
        "data_inicio": data_inicio.strftime("%d/%m/%Y"),
        "data_fim": data_fim.strftime("%d/%m/%Y"),
        "linhas": [{"tipo": r[0], "total": r[1], "valor": float(r[2] or 0)} for r in rows],
        "gerado_em": datetime.now(timezone.utc).strftime("%d/%m/%Y %H:%M"),
    })
    return Response(pdf, media_type="application/pdf")


@router.get("/reports/beneficios/autorizacao/{concessao_id}")
async def autorizacao_beneficio(
    concessao_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    tenant_id: uuid.UUID = Depends(get_tenant_id),
    user: User = Depends(_READ),
):
    c = (
        await db.execute(
            select(ConcessaoBeneficio).where(
                ConcessaoBeneficio.id == concessao_id,
                ConcessaoBeneficio.tenant_id == tenant_id,
            ).options(
                selectinload(ConcessaoBeneficio.family).selectinload(Family.responsavel),
                selectinload(ConcessaoBeneficio.solicitado_por),
            )
        )
    ).scalar_one_or_none()
    if not c:
        raise HTTPException(status_code=404)

    org = await _org_info(db, tenant_id)
    pdf = _render_pdf("autorizacao_beneficio.html", {
        **org,
        "concessao": c,
        "beneficiario": c.family.responsavel.nome_exibicao if c.family and c.family.responsavel else "",
        "gerado_em": datetime.now(timezone.utc).strftime("%d/%m/%Y %H:%M"),
    })
    return Response(pdf, media_type="application/pdf")


@router.get("/reports/beneficios/relacao-familias")
async def relacao_familias_beneficiadas(
    data_inicio: date = Query(),
    data_fim: date = Query(),
    benefit_type_code: str | None = Query(None),
    db: AsyncSession = Depends(get_db),
    tenant_id: uuid.UUID = Depends(get_tenant_id),
    user: User = Depends(_READ),
):
    q = (
        select(ConcessaoBeneficio).where(
            ConcessaoBeneficio.tenant_id == tenant_id,
            ConcessaoBeneficio.data_solicitacao.between(data_inicio, data_fim),
            ConcessaoBeneficio.status.in_(["APROVADO", "ENTREGUE"]),
        ).options(
            selectinload(ConcessaoBeneficio.family).selectinload(Family.responsavel),
        )
    )
    if benefit_type_code:
        q = q.where(ConcessaoBeneficio.benefit_type_code == benefit_type_code)

    result = await db.execute(q.order_by(ConcessaoBeneficio.data_solicitacao.desc()))
    concessoes = result.unique().scalars().all()

    org = await _org_info(db, tenant_id)
    pdf = _render_pdf("relacao_familias_beneficio.html", {
        **org,
        "data_inicio": data_inicio.strftime("%d/%m/%Y"),
        "data_fim": data_fim.strftime("%d/%m/%Y"),
        "concessoes": concessoes,
        "gerado_em": datetime.now(timezone.utc).strftime("%d/%m/%Y %H:%M"),
    })
    return Response(pdf, media_type="application/pdf")


# ─── GRUPOS / SCFV ────────────────────────────────────

@router.get("/reports/grupos/{acao_id}/lista-presenca")
async def lista_presenca_grupo(
    acao_id: uuid.UUID,
    encontro_id: uuid.UUID | None = Query(None),
    db: AsyncSession = Depends(get_db),
    tenant_id: uuid.UUID = Depends(get_tenant_id),
    user: User = Depends(_READ),
):
    acao = (
        await db.execute(
            select(AcaoColetiva).where(
                AcaoColetiva.id == acao_id, AcaoColetiva.tenant_id == tenant_id,
            )
        )
    ).scalar_one_or_none()
    if not acao:
        raise HTTPException(status_code=404)

    inscricoes = (
        await db.execute(
            select(Inscricao).where(
                Inscricao.tenant_id == tenant_id,
                Inscricao.acao_coletiva_id == acao_id,
                Inscricao.status.in_(["ATIVA"]),
            ).options(selectinload(Inscricao.person))
        )
    ).scalars().all()

    org = await _org_info(db, tenant_id)
    pdf = _render_pdf("lista_presenca.html", {
        **org,
        "acao": acao,
        "inscritos": [{"nome": i.person.nome_exibicao, "id": str(i.id)} for i in inscricoes],
        "gerado_em": datetime.now(timezone.utc).strftime("%d/%m/%Y %H:%M"),
    })
    return Response(pdf, media_type="application/pdf")


@router.get("/reports/grupos/{acao_id}/diario-frequencia")
async def diario_frequencia_grupo(
    acao_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    tenant_id: uuid.UUID = Depends(get_tenant_id),
    user: User = Depends(_READ),
):
    acao = (
        await db.execute(
            select(AcaoColetiva).where(
                AcaoColetiva.id == acao_id, AcaoColetiva.tenant_id == tenant_id,
            )
        )
    ).scalar_one_or_none()
    if not acao:
        raise HTTPException(status_code=404)

    encontros = (
        await db.execute(
            select(EncontroFrequencia).where(
                EncontroFrequencia.tenant_id == tenant_id,
                EncontroFrequencia.acao_coletiva_id == acao_id,
            ).order_by(EncontroFrequencia.data_encontro)
        )
    ).scalars().all()

    inscricoes = (
        await db.execute(
            select(Inscricao).where(
                Inscricao.tenant_id == tenant_id,
                Inscricao.acao_coletiva_id == acao_id,
                Inscricao.status.in_(["ATIVA"]),
            ).options(selectinload(Inscricao.person))
        )
    ).scalars().all()

    registros = {}
    for e in encontros:
        regs = (
            await db.execute(
                select(RegistroFrequencia).where(
                    RegistroFrequencia.tenant_id == tenant_id,
                    RegistroFrequencia.encontro_id == e.id,
                )
            )
        ).scalars().all()
        registros[str(e.id)] = {str(r.inscricao_id): r for r in regs}

    org = await _org_info(db, tenant_id)
    pdf = _render_pdf("diario_frequencia.html", {
        **org,
        "acao": acao,
        "encontros": encontros,
        "inscritos": [{"id": str(i.id), "nome": i.person.nome_exibicao} for i in inscricoes],
        "registros": registros,
        "gerado_em": datetime.now(timezone.utc).strftime("%d/%m/%Y %H:%M"),
    })
    return Response(pdf, media_type="application/pdf")


# ─── ATENDIMENTOS ─────────────────────────────────────

@router.get("/reports/atendimentos/sumario")
async def sumario_atendimentos(
    data_inicio: date = Query(),
    data_fim: date = Query(),
    unit_id: uuid.UUID | None = Query(None),
    db: AsyncSession = Depends(get_db),
    tenant_id: uuid.UUID = Depends(get_tenant_id),
    user: User = Depends(_READ),
):
    q = (
        select(Attendance).where(
            Attendance.tenant_id == tenant_id,
            Attendance.data_atendimento.between(data_inicio, data_fim),
            Attendance.deleted_at.is_(None),
        ).options(
            selectinload(Attendance.members),
            selectinload(Attendance.case_file).selectinload(CaseFile.family),
        )
    )
    if unit_id:
        q = q.where(Attendance.unit_id == unit_id)

    result = await db.execute(q.order_by(Attendance.data_atendimento.desc()))
    atendimentos = result.unique().scalars().all()

    org = await _org_info(db, tenant_id)
    pdf = _render_pdf("sumario_atendimentos.html", {
        **org,
        "data_inicio": data_inicio.strftime("%d/%m/%Y"),
        "data_fim": data_fim.strftime("%d/%m/%Y"),
        "atendimentos": atendimentos,
        "total": len(atendimentos),
        "gerado_em": datetime.now(timezone.utc).strftime("%d/%m/%Y %H:%M"),
    })
    return Response(pdf, media_type="application/pdf")


# ─── ACOMPANHAMENTO ──────────────────────────────────

@router.get("/reports/acompanhamento/familias-no-servico")
async def familias_em_acompanhamento(
    tipo_acompanhamento: str | None = Query(None),
    unit_id: uuid.UUID | None = Query(None),
    db: AsyncSession = Depends(get_db),
    tenant_id: uuid.UUID = Depends(get_tenant_id),
    user: User = Depends(_READ),
):
    q = (
        select(Acompanhamento).where(
            Acompanhamento.tenant_id == tenant_id,
            Acompanhamento.situacao == "ATIVO",
        ).options(
            selectinload(Acompanhamento.case_file).selectinload(CaseFile.family),
        )
    )
    if tipo_acompanhamento:
        q = q.where(Acompanhamento.tipo == tipo_acompanhamento)
    if unit_id:
        q = q.where(Acompanhamento.case_file.has(CaseFile.unit_id == unit_id))

    result = await db.execute(q.order_by(Acompanhamento.data_inicio.desc()))
    acompanhamentos = result.unique().scalars().all()

    org = await _org_info(db, tenant_id)
    pdf = _render_pdf("acompanhamentos.html", {
        **org,
        "tipo": tipo_acompanhamento or "Todos",
        "acompanhamentos": acompanhamentos,
        "total": len(acompanhamentos),
        "gerado_em": datetime.now(timezone.utc).strftime("%d/%m/%Y %H:%M"),
    })
    return Response(pdf, media_type="application/pdf")


# ─── PRODUÇÃO TÉCNICO ────────────────────────────────

@router.get("/reports/producao/producao-tecnico")
async def producao_tecnico(
    data_inicio: date = Query(),
    data_fim: date = Query(),
    db: AsyncSession = Depends(get_db),
    tenant_id: uuid.UUID = Depends(get_tenant_id),
    user: User = Depends(_READ),
):
    profissionais = (
        await db.execute(
            select(Professional).where(
                Professional.tenant_id == tenant_id,
                Professional.is_active == True,
            )
        )
    ).scalars().all()

    linhas = []
    for p in profissionais:
        n_atendimentos = await db.scalar(
            select(func.count(Attendance.id)).where(
                Attendance.tenant_id == tenant_id,
                Attendance.registrado_por_id == p.id,
                Attendance.data_atendimento.between(data_inicio, data_fim),
                Attendance.deleted_at.is_(None),
            )
        ) or 0

        n_beneficios = await db.scalar(
            select(func.count(ConcessaoBeneficio.id)).where(
                ConcessaoBeneficio.tenant_id == tenant_id,
                ConcessaoBeneficio.solicitado_por_id == p.id,
                ConcessaoBeneficio.data_solicitacao.between(data_inicio, data_fim),
            )
        ) or 0

        linhas.append({"nome": p.nome, "atendimentos": n_atendimentos, "beneficios": n_beneficios})

    org = await _org_info(db, tenant_id)
    pdf = _render_pdf("producao_tecnico.html", {
        **org,
        "data_inicio": data_inicio.strftime("%d/%m/%Y"),
        "data_fim": data_fim.strftime("%d/%m/%Y"),
        "linhas": linhas,
        "gerado_em": datetime.now(timezone.utc).strftime("%d/%m/%Y %H:%M"),
    })
    return Response(pdf, media_type="application/pdf")


# ─── BOLETIM ──────────────────────────────────────────

@router.get("/reports/boletim")
async def boletim_indicadores(
    data_inicio: date = Query(),
    data_fim: date = Query(),
    unit_id: uuid.UUID | None = Query(None),
    db: AsyncSession = Depends(get_db),
    tenant_id: uuid.UUID = Depends(get_tenant_id),
    user: User = Depends(_READ),
):
    n_familias = await db.scalar(
        select(func.count(Family.id)).where(
            Family.tenant_id == tenant_id,
            Family.deleted_at.is_(None),
        )
    ) or 0

    n_atendimentos = await db.scalar(
        select(func.count(Attendance.id)).where(
            Attendance.tenant_id == tenant_id,
            Attendance.data_atendimento.between(data_inicio, data_fim),
            Attendance.deleted_at.is_(None),
        )
    ) or 0

    n_beneficios = await db.scalar(
        select(func.count(ConcessaoBeneficio.id)).where(
            ConcessaoBeneficio.tenant_id == tenant_id,
            ConcessaoBeneficio.data_solicitacao.between(data_inicio, data_fim),
            ConcessaoBeneficio.status.in_(["APROVADO", "ENTREGUE"]),
        )
    ) or 0

    n_encaminhamentos = await db.scalar(
        select(func.count(Encaminhamento.id)).where(
            Encaminhamento.tenant_id == tenant_id,
            Encaminhamento.data_encaminhamento.between(data_inicio, data_fim),
        )
    ) or 0

    org = await _org_info(db, tenant_id)
    pdf = _render_pdf("boletim.html", {
        **org,
        "data_inicio": data_inicio.strftime("%d/%m/%Y"),
        "data_fim": data_fim.strftime("%d/%m/%Y"),
        "familias": n_familias,
        "atendimentos": n_atendimentos,
        "beneficios": n_beneficios,
        "encaminhamentos": n_encaminhamentos,
        "gerado_em": datetime.now(timezone.utc).strftime("%d/%m/%Y %H:%M"),
    })
    return Response(pdf, media_type="application/pdf")
