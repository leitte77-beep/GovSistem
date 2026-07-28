"""Geração de PDF do prontuário no padrão do Prontuário SUAS físico.

Usa weasyprint + Jinja2 (mesmo padrão do modulo-diario). Import de weasyprint é
tardio para não quebrar ambientes sem a lib (ex.: suíte de testes) — nesse caso
levanta 503 amigável via HTTPException.
"""

import re
import uuid
from datetime import datetime, timezone
from html import unescape
from pathlib import Path

from fastapi import HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.core.encryption import decrypt_text
from app.models.attendance import Attendance
from app.models.case_file import CaseFile
from app.models.family import Family
from app.models.organization import Organization
from app.models.unit import Unit
from app.models.user import User
from app.services.scoping import can_read_evolution

_TEMPLATE_DIR = Path(__file__).resolve().parent.parent / "templates" / "pdf"

_RE_QUEBRA = re.compile(r"</(p|div|li|h[1-6]|blockquote)>|<br\s*/?>", re.IGNORECASE)
_RE_TAG = re.compile(r"<[^>]+>")


def evolucao_para_texto(valor: str | None) -> str | None:
    """Converte a evolução (HTML do editor rich-text) em texto legível no PDF.

    O frontend grava HTML (<p>, <b>, &nbsp;…). Sem esta conversão, o PDF
    exibiria tags e entidades literalmente. Preserva quebras de parágrafo.
    """
    if not valor:
        return valor
    if "<" not in valor and "&" not in valor:
        return valor
    texto = _RE_QUEBRA.sub("\n", valor)
    texto = _RE_TAG.sub("", texto)
    texto = unescape(texto).replace("\u00a0", " ")
    # Normaliza espaços preservando quebras de linha.
    texto = re.sub(r"[ \t]+", " ", texto)
    texto = re.sub(r"\n{3,}", "\n\n", texto)
    return texto.strip()


def _render_html(context: dict) -> str:
    from jinja2 import Environment, FileSystemLoader, select_autoescape

    env = Environment(
        loader=FileSystemLoader(str(_TEMPLATE_DIR)),
        autoescape=select_autoescape(["html", "xml"]),
    )
    template = env.get_template("case_file.html")
    return template.render(**context)


async def build_case_file_context(
    db: AsyncSession, tenant_id: uuid.UUID, user: User, case_file_id: uuid.UUID
) -> dict:
    cf = (
        await db.execute(
            select(CaseFile).where(
                CaseFile.id == case_file_id,
                CaseFile.tenant_id == tenant_id,
                CaseFile.deleted_at.is_(None),
            )
        )
    ).scalar_one_or_none()
    if not cf:
        raise HTTPException(status_code=404, detail="Prontuário não encontrado")

    org = await db.get(Organization, tenant_id)
    family = await db.get(Family, cf.family_id)
    unit = await db.get(Unit, cf.unit_id)

    attendances = (
        await db.execute(
            select(Attendance)
            .where(
                Attendance.tenant_id == tenant_id,
                Attendance.case_file_id == cf.id,
                Attendance.deleted_at.is_(None),
            )
            .order_by(Attendance.data_atendimento.desc())
            .options(selectinload(Attendance.members))
        )
    ).scalars().all()

    att_ctx = []
    for att in attendances:
        pode = await can_read_evolution(
            db, tenant_id, user,
            attendance_unit_id=att.unit_id,
            sigiloso_reforcado=att.sigiloso_reforcado,
            registrado_por_user_id=att.registrado_por_user_id,
        )
        att_ctx.append({
            "data": att.data_atendimento.strftime("%d/%m/%Y %H:%M"),
            "tipo": att.tipo,
            "servico": att.service_type_code,
            "sigiloso": att.sigiloso_reforcado,
            "evolucao": evolucao_para_texto(decrypt_text(att.evolution_text_enc)) if pode else None,
            "restrita": not pode,
            "n_membros": len(att.members),
        })

    brasao = None
    root_brasao = Path("/home/ubuntu/sistemaweb/brasao.png")
    if root_brasao.exists():
        brasao = root_brasao.as_uri()

    return {
        "municipio": org.name if org else "",
        "brasao": brasao,
        "unidade": unit.nome if unit else "",
        "servico": cf.service_type_code,
        "familia_codigo": family.codigo if family else "",
        "responsavel": (
            family.responsavel.nome_exibicao
            if family and family.responsavel else ""
        ),
        "acolhida_data": cf.acolhida_data.strftime("%d/%m/%Y") if cf.acolhida_data else "",
        "acolhida_motivo": cf.acolhida_motivo or "",
        "atendimentos": att_ctx,
        "gerado_em": datetime.now(timezone.utc).strftime("%d/%m/%Y %H:%M"),
    }


async def generate_case_file_pdf(
    db: AsyncSession, tenant_id: uuid.UUID, user: User, case_file_id: uuid.UUID
) -> bytes:
    context = await build_case_file_context(db, tenant_id, user, case_file_id)
    html = _render_html(context)
    try:
        from weasyprint import HTML  # noqa: N811
    except Exception as exc:  # pragma: no cover - depende de libs de sistema
        raise HTTPException(
            status_code=503,
            detail="Geração de PDF indisponível: weasyprint não instalado",
        ) from exc
    return HTML(string=html, base_url=str(_TEMPLATE_DIR)).write_pdf()
