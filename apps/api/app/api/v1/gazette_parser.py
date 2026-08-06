"""Endpoint de interpretacao e diagramacao automatica do conteudo colado."""

from fastapi import APIRouter, Depends, HTTPException

from app.core.auth import require_roles
from app.models.user import User
from app.schemas.gazette import GazetteParseRequest, GazetteParseResponse
from app.services.gazette import (
    build_toc_entry,
    parse_document,
    render_document,
    verify_integrity,
)
from app.services.gazette.ai_classifier import refine_with_ai

router = APIRouter(tags=["gazette-parser"])


@router.post("/gazette/parse", response_model=GazetteParseResponse)
async def parse_gazette_content(
    payload: GazetteParseRequest,
    _: User = Depends(require_roles("DIAGRAMADOR", "ADMIN")),
):
    if not (payload.content_text or "").strip() and not (
        payload.content_html or ""
    ).strip():
        raise HTTPException(422, "Informe content_text ou content_html")

    document = parse_document(
        plain_text=payload.content_text,
        source_html=payload.content_html,
    )

    if payload.use_ai:
        document = await refine_with_ai(document)

    rendered_html = render_document(document)
    integrity = verify_integrity(document, rendered_html)
    toc = build_toc_entry(document)

    warnings = list(document.warnings)
    if not integrity.ok:
        # Perda de conteudo impede a conclusao: o cliente mantem o original.
        warnings.append(
            "Diagramação bloqueada: divergência de conteúdo detectada."
        )
        warnings.extend(integrity.messages)

    return GazetteParseResponse(
        success=integrity.ok,
        document=document,
        rendered_html=rendered_html if integrity.ok else None,
        toc=toc,
        integrity=integrity,
        warnings=warnings,
    )
