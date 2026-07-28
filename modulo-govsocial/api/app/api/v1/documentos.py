"""Endpoints de geração de documentos PDF — ofícios, guias, comprovantes,
prontuários, RMA espelho, dashboard e declarações.

Todos os documentos seguem o padrão de formatação do Governo Federal, com
brasão, cabeçalho padronizado, tipografia serifada e blocos de assinatura.
"""

import uuid
from datetime import date, datetime, timezone
from pathlib import Path
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import Response
from pydantic import BaseModel
from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.core.auth import get_tenant_id, require_roles
from app.core.database import get_db
from app.core.encryption import decrypt_text
from app.models.agenda import Appointment
from app.models.attendance import Attendance
from app.models.beneficio import ConcessaoBeneficio
from app.models.case_file import CaseFile
from app.models.encaminhamento import Encaminhamento
from app.models.enums import RoleName
from app.models.family import Family
from app.models.organization import Organization
from app.models.person import Person
from app.models.person_family_membership import PersonFamilyMembership
from app.models.professional import Professional
from app.models.rma import RmaFechamento, RmaAjuste
from app.models.unit import Unit
from app.models.user import User
from app.services.calculo_renda import calcular_demonstrativo_renda
from app.services.prontuario_pdf import evolucao_para_texto
from app.services.scoping import can_read_evolution

router = APIRouter(prefix="/documentos", tags=["documentos"])

_READ_ALL = require_roles(
    RoleName.TECNICO_SUPERIOR.value,
    RoleName.COORDENADOR_UNIDADE.value,
    RoleName.GESTOR_MUNICIPAL.value,
    RoleName.VIGILANCIA.value,
    RoleName.ADMIN.value,
)

_TEMPLATE_DIR = Path(__file__).resolve().parent.parent.parent / "templates" / "pdf"


def _render_pdf(template_name: str, ctx: dict) -> bytes:
    from jinja2 import Environment, FileSystemLoader, select_autoescape
    try:
        from weasyprint import HTML  # noqa: F811
    except Exception:
        raise HTTPException(status_code=503, detail="Geração de PDF indisponível (weasyprint não instalado)")
    env = Environment(
        loader=FileSystemLoader(str(_TEMPLATE_DIR)),
        autoescape=select_autoescape(["html", "xml"]),
    )
    html = env.get_template(template_name).render(**ctx)
    return HTML(string=html, base_url=str(_TEMPLATE_DIR)).write_pdf()


async def _org_info(db, tenant_id) -> dict:
    org = await db.get(Organization, tenant_id)
    brasao = None
    root_brasao = Path("/home/ubuntu/sistemaweb/brasao.png")
    if root_brasao.exists():
        brasao = root_brasao.as_uri()
    return {
        "municipio": org.name if org else "",
        "brasao": brasao,
    }


def _br_date(dt) -> str:
    if dt is None:
        return ""
    if isinstance(dt, str):
        return dt
    return dt.strftime("%d/%m/%Y")


def _br_datetime(dt) -> str:
    if dt is None:
        return ""
    if isinstance(dt, str):
        return dt
    return dt.strftime("%d/%m/%Y %H:%M")


# ═══════════════════════════════════════════════════════════════════════
# OFÍCIO DE ENCAMINHAMENTO
# ═══════════════════════════════════════════════════════════════════════

@router.get("/oficio/{enc_id}")
async def gerar_oficio_pdf(
    enc_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    tenant_id: uuid.UUID = Depends(get_tenant_id),
    user: User = Depends(_READ_ALL),
):
    e = (
        await db.execute(
            select(Encaminhamento).where(
                Encaminhamento.id == enc_id,
                Encaminhamento.tenant_id == tenant_id,
                Encaminhamento.tipo == "EXTERNO",
                Encaminhamento.deleted_at.is_(None),
            )
        )
    ).scalar_one_or_none()
    if not e:
        raise HTTPException(status_code=404, detail="Encaminhamento externo não encontrado")

    unit = await db.get(Unit, e.unit_id) if e.unit_id else None
    org = await _org_info(db, tenant_id)

    nome_prof, cargo, registro = "", "", ""
    if e.profissional_origem_id:
        prof = await db.get(Professional, e.profissional_origem_id)
        if prof:
            nome_prof = prof.nome
            cargo = prof.cargo or ""
            registro = prof.registro_profissional or ""

    texto = (
        f"Encaminhamos o(a) Sr(a). {e.descricao or 'usuário(a) da Assistência Social'} "
        f"para atendimento nesta instituição, conforme avaliação técnica realizada "
        f"nesta unidade."
    )

    assunto = e.motivo or "Encaminhamento para a rede de proteção social"

    # Marca como ofício gerado
    if not e.oficio_gerado:
        e.oficio_gerado = True
        e.status = "OFICIO_GERADO"
        await db.commit()

    ctx = {
        **org,
        "numero_oficio": e.numero_oficio or "—",
        "ano": datetime.now(timezone.utc).year,
        "instituicao_destino": e.instituicao_destino or "Instituição da Rede",
        "unidade": unit.nome if unit else "",
        "endereco_unidade": "",
        "assunto": assunto,
        "texto_corpo": texto,
        "nome_profissional": nome_prof or user.name,
        "cargo_profissional": cargo or "Técnico de Assistência Social",
        "registro_profissional": registro,
        "contato_destino": None,
        "endereco_destino": None,
        "gerado_em": _br_datetime(datetime.now(timezone.utc)),
    }
    pdf = _render_pdf("oficio_encaminhamento.html", ctx)
    filename = f"oficio_{e.numero_oficio or 'sn'}_{ctx['ano']}.pdf"
    return Response(pdf, media_type="application/pdf",
                    headers={"Content-Disposition": f"attachment; filename={filename}"})


# ═══════════════════════════════════════════════════════════════════════
# GUIA DE ENCAMINHAMENTO
# ═══════════════════════════════════════════════════════════════════════

@router.get("/guia/{enc_id}")
async def guia_encaminhamento_pdf(
    enc_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    tenant_id: uuid.UUID = Depends(get_tenant_id),
    user: User = Depends(_READ_ALL),
):
    e = (
        await db.execute(
            select(Encaminhamento).where(
                Encaminhamento.id == enc_id,
                Encaminhamento.tenant_id == tenant_id,
                Encaminhamento.deleted_at.is_(None),
            )
        )
    ).scalar_one_or_none()
    if not e:
        raise HTTPException(status_code=404, detail="Encaminhamento não encontrado")

    unit = await db.get(Unit, e.unit_id) if e.unit_id else None
    org = await _org_info(db, tenant_id)

    family, resp_nome, nis_mask = None, "", ""
    endereco = ""
    if e.case_file_id:
        cf = await db.execute(
            select(CaseFile).where(CaseFile.id == e.case_file_id, CaseFile.tenant_id == tenant_id)
        )
        cf = cf.scalar_one_or_none()
        if cf:
            family = await db.get(Family, cf.family_id) if cf.family_id else None
            if family and family.responsavel:
                resp_nome = family.responsavel.nome_exibicao
                nis_mask = family.responsavel.nis or ""
                endereco = ", ".join(filter(bool, [
                    family.logradouro or "", family.numero or "", family.bairro or "",
                    family.municipio or "", family.uf or "",
                ])) or ""

    nome_prof, registro = "", ""
    if e.profissional_origem_id:
        prof = await db.get(Professional, e.profissional_origem_id)
        if prof:
            nome_prof = prof.nome
            registro = prof.registro_profissional or ""

    ctx = {
        **org,
        "numero_oficio": e.numero_oficio,
        "ano": datetime.now(timezone.utc).year,
        "familia_codigo": family.codigo if family else "—",
        "responsavel": resp_nome or "—",
        "nis": nis_mask,
        "endereco": endereco,
        "unidade": unit.nome if unit else "",
        "nome_profissional": nome_prof or user.name,
        "registro": registro,
        "data_encaminhamento": _br_date(e.data_encaminhamento),
        "instituicao_destino": e.instituicao_destino or (
            "Unidade " + str(e.unidade_destino_id) if e.unidade_destino_id else "—"
        ),
        "endereco_destino": "",
        "motivo": e.motivo or "Encaminhamento técnico",
        "descricao": e.descricao or "",
        "gerado_em": _br_datetime(datetime.now(timezone.utc)),
    }
    pdf = _render_pdf("guia_encaminhamento.html", ctx)
    codigo = family.codigo if family else "sn"
    return Response(pdf, media_type="application/pdf",
                    headers={"Content-Disposition": f"attachment; filename=guia_enc_{codigo}.pdf"})


# ═══════════════════════════════════════════════════════════════════════
# COMPROVANTE DE BENEFÍCIO
# ═══════════════════════════════════════════════════════════════════════

@router.get("/comprovante-beneficio/{concessao_id}")
async def comprovante_beneficio_pdf(
    concessao_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    tenant_id: uuid.UUID = Depends(get_tenant_id),
    user: User = Depends(_READ_ALL),
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
        raise HTTPException(status_code=404, detail="Concessão de benefício não encontrada")

    org = await _org_info(db, tenant_id)

    resp_nome, nis_mask, cpf_mask, endereco = "", "", "", ""
    if c.family:
        resp_nome = c.family.responsavel.nome_exibicao if c.family.responsavel else ""
        nis_mask = c.family.responsavel.nis or "" if c.family.responsavel else ""
        cpf_mask = c.family.responsavel.cpf or "" if c.family.responsavel else ""
        endereco = ", ".join(filter(bool, [
            c.family.logradouro or "", c.family.numero or "", c.family.bairro or "",
        ])) or ""

    unit_name = ""
    if c.unit_id:
        unit = await db.get(Unit, c.unit_id)
        unit_name = unit.nome if unit else ""

    nome_prof = c.solicitado_por.nome if c.solicitado_por else ""

    ctx = {
        **org,
        "familia_codigo": c.family.codigo if c.family else "—",
        "responsavel": resp_nome,
        "nis": nis_mask,
        "cpf": cpf_mask,
        "endereco": endereco,
        "tipo_beneficio": c.benefit_type_code,
        "quantidade": c.quantidade,
        "valor_total": f"{c.valor_total:.2f}" if c.valor_total else None,
        "data_entrega": _br_datetime(c.data_entrega or c.data_solicitacao),
        "unidade": unit_name,
        "nome_profissional": nome_prof,
        "gerado_em": _br_datetime(datetime.now(timezone.utc)),
    }
    pdf = _render_pdf("comprovante_beneficio.html", ctx)
    filename = f"comprovante_beneficio_{c.benefit_type_code}.pdf"
    return Response(pdf, media_type="application/pdf",
                    headers={"Content-Disposition": f"attachment; filename={filename}"})


# ═══════════════════════════════════════════════════════════════════════
# PRONTUÁRIO SUAS
# ═══════════════════════════════════════════════════════════════════════

@router.get("/prontuario/{family_id}")
async def prontuario_suas_pdf(
    family_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    tenant_id: uuid.UUID = Depends(get_tenant_id),
    user: User = Depends(_READ_ALL),
):
    family = (
        await db.execute(
            select(Family).where(
                Family.id == family_id,
                Family.tenant_id == tenant_id,
                Family.deleted_at.is_(None),
            ).options(selectinload(Family.responsavel))
        )
    ).scalar_one_or_none()
    if not family:
        raise HTTPException(status_code=404, detail="Família não encontrada")

    org = await _org_info(db, tenant_id)

    members = (
        await db.execute(
            select(PersonFamilyMembership).where(
                PersonFamilyMembership.tenant_id == tenant_id,
                PersonFamilyMembership.family_id == family_id,
                PersonFamilyMembership.status == "ATIVO",
            ).options(selectinload(PersonFamilyMembership.person))
        )
    ).scalars().all()

    membros_ctx = []
    for m in members:
        parentesco_map = {
            "RESPONSAVEL": "Responsável",
            "CONJUGE": "Cônjuge",
            "FILHO": "Filho(a)",
            "ENTEADO": "Enteado(a)",
            "NETO": "Neto(a)",
            "PAI": "Pai",
            "MAE": "Mãe",
            "SOGRO": "Sogro(a)",
            "IRMAO": "Irmão/Irmã",
            "OUTRO": "Outro",
        }
        membros_ctx.append({
            "nome": m.person.nome_exibicao if m.person else "—",
            "parentesco": parentesco_map.get(m.parentesco, m.parentesco) if m.parentesco else "",
            "nis": m.person.nis or "" if m.person else "",
            "desde": _br_date(m.data_entrada),
        })

    # Atendimentos via case_files
    case_files = (
        await db.execute(
            select(CaseFile).where(
                CaseFile.family_id == family_id,
                CaseFile.tenant_id == tenant_id,
                CaseFile.deleted_at.is_(None),
            )
        )
    ).scalars().all()

    attendances = []
    for cf in case_files:
        atts = (
            await db.execute(
                select(Attendance).where(
                    Attendance.case_file_id == cf.id,
                    Attendance.tenant_id == tenant_id,
                    Attendance.deleted_at.is_(None),
                ).order_by(Attendance.data_atendimento.desc())
            )
        ).scalars().all()
        for at in atts:
            pode = await can_read_evolution(
                db, tenant_id, user,
                attendance_unit_id=at.unit_id,
                sigiloso_reforcado=at.sigiloso_reforcado,
                registrado_por_user_id=at.registrado_por_user_id,
            )
            evolucao = (
                evolucao_para_texto(decrypt_text(at.evolution_text_enc))
                if pode and at.evolution_text_enc
                else None
            )
            attendances.append({
                "data": _br_datetime(at.data_atendimento),
                "tipo": at.tipo,
                "servico": at.service_type_code,
                "sigiloso": at.sigiloso_reforcado,
                "evolucao": evolucao,
            })

    # Benefícios
    beneficios_list = []
    benefs = (
        await db.execute(
            select(ConcessaoBeneficio).where(
                ConcessaoBeneficio.family_id == family_id,
                ConcessaoBeneficio.tenant_id == tenant_id,
            ).order_by(ConcessaoBeneficio.data_solicitacao.desc()).limit(20)
        )
    ).scalars().all()
    for b in benefs:
        beneficios_list.append({
            "tipo": b.benefit_type_code,
            "quantidade": b.quantidade,
            "valor": f"{b.valor_total:.2f}" if b.valor_total else "—",
            "data": _br_date(b.data_entrega or b.data_solicitacao),
            "status": b.status,
        })

    faixa_renda_map = {
        "ATE_1_4_SM": "Até ¼ salário mínimo per capita",
        "ATE_1_2_SM": "De ¼ a ½ salário mínimo per capita",
        "ATE_1_SM": "De ½ a 1 salário mínimo per capita",
        "ACIMA_1_SM": "Acima de 1 salário mínimo per capita",
    }

    unidade_nome = ""
    if case_files:
        first_cf = case_files[0]
        if first_cf.unit_id:
            u = await db.get(Unit, first_cf.unit_id)
            unidade_nome = u.nome if u else ""

    endereco = ", ".join(filter(bool, [
        family.logradouro or "", family.numero or "", family.bairro or "",
    ])) or ""

    ctx = {
        **org,
        "unidade": unidade_nome,
        "familia_codigo": family.codigo or "—",
        "responsavel": family.responsavel.nome_exibicao if family.responsavel else "—",
        "nis": family.responsavel.nis or "" if family.responsavel else "",
        "endereco": endereco,
        "territorio": family.territorio or "",
        "faixa_renda": faixa_renda_map.get(family.faixa_renda, family.faixa_renda or "—"),
        "no_cadunico": family.no_cadunico or False,
        "cadunico_atualizado": "",
        "pbf": family.beneficiaria_pbf or False,
        "bpc": family.possui_bpc or False,
        "inseguranca_alimentar": family.inseguranca_alimentar or False,
        "total_membros": len(members),
        "membros": membros_ctx,
        "atendimentos": attendances,
        "beneficio": len(beneficios_list) > 0,
        "beneficios_lista": beneficios_list,
        "gerado_em": _br_datetime(datetime.now(timezone.utc)),
    }
    pdf = _render_pdf("prontuario_suas.html", ctx)
    return Response(pdf, media_type="application/pdf",
                    headers={"Content-Disposition": f"attachment; filename=prontuario_{family.codigo}.pdf"})


# ═══════════════════════════════════════════════════════════════════════
# RMA ESPELHO
# ═══════════════════════════════════════════════════════════════════════

@router.get("/rma-espelho/{rma_id}")
async def rma_espelho_pdf(
    rma_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    tenant_id: uuid.UUID = Depends(get_tenant_id),
    user: User = Depends(_READ_ALL),
):
    rma = (
        await db.execute(
            select(RmaFechamento).where(
                RmaFechamento.id == rma_id,
                RmaFechamento.tenant_id == tenant_id,
            )
        )
    ).scalar_one_or_none()
    if not rma:
        raise HTTPException(status_code=404, detail="RMA não encontrado")

    org = await _org_info(db, tenant_id)
    unit = await db.get(Unit, rma.unit_id) if rma.unit_id else None

    dados = rma.dados_calculados or {}

    ajustes = (
        await db.execute(
            select(RmaAjuste).where(
                RmaAjuste.fechamento_id == rma.id,
                RmaAjuste.tenant_id == tenant_id,
            )
        )
    ).scalars().all()

    por_campo = {}
    for a in ajustes:
        chave = f"{a.bloco}::{a.campo}"
        por_campo[chave] = a

    blocos_ctx = []
    for bloco_id, bloco_data in dados.items():
        if bloco_id == "_meta":
            continue
        campos = []
        if isinstance(bloco_data, dict):
            for campo_nome, campo_valor in bloco_data.items():
                if campo_nome == "__codigo__":
                    continue
                chave = f"{bloco_id}::{campo_nome}"
                ajustado_de = None
                if chave in por_campo:
                    ajustado_de = por_campo[chave].valor_calculado
                valor = campo_valor
                if chave in por_campo:
                    valor = por_campo[chave].valor_ajustado
                campos.append({
                    "codigo": bloco_data.get("__codigo__", bloco_id[:8]),
                    "rotulo": campo_nome.replace("_", " ").title(),
                    "valor": valor if isinstance(valor, (int, float)) else 0,
                    "ajustado_de": ajustado_de,
                })
        blocos_ctx.append({
            "id": bloco_id,
            "rotulo": bloco_id.replace("_", " ").title(),
            "campos": campos,
        })

    ajustes_ctx = []
    for a in ajustes:
        ajustes_ctx.append({
            "campo": a.campo,
            "original": a.valor_calculado,
            "ajustado": a.valor_ajustado,
            "justificativa": a.justificativa or "Sem justificativa",
        })

    competencia = f"{rma.mes:02d}/{rma.ano}" if rma.mes and rma.ano else "—"
    status_map = {"ABERTO": "Em andamento", "FECHADO": "Fechado", "CORRIGIDO": "Corrigido"}

    ctx = {
        **org,
        "competencia": competencia,
        "situacao": status_map.get(rma.status, rma.status),
        "unidade": unit.nome if unit else "",
        "fechado_em": _br_datetime(rma.fechado_em) if rma.fechado_em else None,
        "blocos": blocos_ctx,
        "ajustes": ajustes_ctx,
        "gerado_em": _br_datetime(datetime.now(timezone.utc)),
    }
    pdf = _render_pdf("rma_espelho.html", ctx)
    return Response(pdf, media_type="application/pdf",
                    headers={"Content-Disposition": f"attachment; filename=rma_{competencia.replace('/', '_')}.pdf"})


# ═══════════════════════════════════════════════════════════════════════
# DASHBOARD DE PRESTAÇÃO DE CONTAS
# ═══════════════════════════════════════════════════════════════════════

@router.get("/dashboard-prestacao-contas")
async def dashboard_prestacao_contas_pdf(
    data_inicio: date = Query(),
    data_fim: date = Query(),
    db: AsyncSession = Depends(get_db),
    tenant_id: uuid.UUID = Depends(get_tenant_id),
    user: User = Depends(_READ_ALL),
):
    org = await _org_info(db, tenant_id)

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

    n_enc_pendentes = await db.scalar(
        select(func.count(Encaminhamento.id)).where(
            Encaminhamento.tenant_id == tenant_id,
            Encaminhamento.status == "PENDENTE",
            Encaminhamento.deleted_at.is_(None),
        )
    ) or 0

    # Acompanhamentos ativos
    from app.models.acompanhamento import Acompanhamento
    n_acompanhamentos = await db.scalar(
        select(func.count(Acompanhamento.id)).where(
            Acompanhamento.tenant_id == tenant_id,
            Acompanhamento.situacao == "ATIVO",
        )
    ) or 0

    # Grupos ativos
    from app.models.acao_coletiva import AcaoColetiva, Inscricao
    n_grupos = await db.scalar(
        select(func.count(AcaoColetiva.id)).where(
            AcaoColetiva.tenant_id == tenant_id,
            AcaoColetiva.status == "ATIVA",
        )
    ) or 0

    n_inscritos_scfv = await db.scalar(
        select(func.count(Inscricao.id)).where(
            Inscricao.tenant_id == tenant_id,
            Inscricao.status == "ATIVA",
        )
    ) or 0

    # Benefícios por tipo
    benef_rows = (
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

    benefs_tipos = [{
        "tipo": r[0],
        "total": r[1],
        "valor": f"{float(r[2] or 0):.2f}",
    } for r in benef_rows]

    ctx = {
        **org,
        "data_inicio": _br_date(data_inicio),
        "data_fim": _br_date(data_fim),
        "atendimentos_mes": n_atendimentos,
        "acompanhamentos_ativos": n_acompanhamentos,
        "familias_cadastradas": n_familias,
        "beneficios_concedidos": n_beneficios,
        "encaminhamentos_pendentes": n_enc_pendentes,
        "grupos_ativos": n_grupos,
        "inscritos_scfv": n_inscritos_scfv,
        "beneficios_tipos": benefs_tipos,
        "territorios": [],
        "indicadores": [],
        "gerado_em": _br_datetime(datetime.now(timezone.utc)),
    }
    pdf = _render_pdf("dashboard_prestacao_contas.html", ctx)
    return Response(pdf, media_type="application/pdf",
                    headers={"Content-Disposition": "attachment; filename=prestacao_contas.pdf"})


# ═══════════════════════════════════════════════════════════════════════
# DECLARAÇÃO DE COMPARECIMENTO
# ═══════════════════════════════════════════════════════════════════════

@router.get("/declaracao-comparecimento/{person_id}")
async def declaracao_comparecimento_pdf(
    person_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    tenant_id: uuid.UUID = Depends(get_tenant_id),
    user: User = Depends(_READ_ALL),
):
    person = (
        await db.execute(
            select(Person).where(
                Person.id == person_id,
                Person.tenant_id == tenant_id,
                Person.deleted_at.is_(None),
            )
        )
    ).scalar_one_or_none()
    if not person:
        raise HTTPException(status_code=404, detail="Pessoa não encontrada")

    org = await _org_info(db, tenant_id)

    tipo_doc = "CPF" if person.cpf else ("RG" if person.rg else "Documento")
    documento = person.cpf or person.rg or ""

    ctx = {
        **org,
        "nome_pessoa": person.nome_exibicao,
        "documento": documento,
        "tipo_documento": tipo_doc,
        "unidade": "",
        "data_comparecimento": _br_date(datetime.now(timezone.utc)),
        "horario": datetime.now(timezone.utc).strftime("%H:%M"),
        "finalidade": "atendimento no âmbito da Política de Assistência Social",
        "nome_profissional": user.name,
        "cargo_profissional": "Técnico de Assistência Social",
        "registro": "",
        "observacoes": "",
        "gerado_em": _br_datetime(datetime.now(timezone.utc)),
    }
    pdf = _render_pdf("declaracao_comparecimento.html", ctx)
    return Response(pdf, media_type="application/pdf",
                    headers={"Content-Disposition": "attachment; filename=declaracao_comparecimento.pdf"})


# ═══════════════════════════════════════════════════════════════════════
# SOLICITAÇÃO DE COMPARECIMENTO (convite institucional)
# ═══════════════════════════════════════════════════════════════════════

@router.get("/solicitacao-comparecimento/{person_id}")
async def solicitacao_comparecimento_pdf(
    person_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    tenant_id: uuid.UUID = Depends(get_tenant_id),
    user: User = Depends(_READ_ALL),
):
    person = (
        await db.execute(
            select(Person).where(
                Person.id == person_id,
                Person.tenant_id == tenant_id,
                Person.deleted_at.is_(None),
            )
        )
    ).scalar_one_or_none()
    if not person:
        raise HTTPException(status_code=404, detail="Pessoa não encontrada")

    org = await _org_info(db, tenant_id)

    ctx = {
        **org,
        "nome_pessoa": person.nome_exibicao,
        "documento": person.cpf or person.rg or "",
        "tipo_documento": "CPF" if person.cpf else "Documento",
        "unidade": "",
        "data_comparecimento": _br_date(datetime.now(timezone.utc)),
        "horario": "08:00 às 17:00",
        "finalidade": "comparecimento à unidade para atualização cadastral e orientação sobre programas sociais",
        "observacoes": "Trazer documento de identificação com foto, comprovante de residência e cartão do Bolsa Família (se possuir).",
        "nome_profissional": user.name,
        "cargo_profissional": "Técnico de Assistência Social",
        "registro": "",
        "gerado_em": _br_datetime(datetime.now(timezone.utc)),
    }
    pdf = _render_pdf("declaracao_comparecimento.html", ctx)
    return Response(pdf, media_type="application/pdf",
                    headers={"Content-Disposition": f"attachment; filename=solicitacao_{person.nome_exibicao[:20]}.pdf"})
