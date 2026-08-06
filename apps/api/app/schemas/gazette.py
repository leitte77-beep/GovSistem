from typing import Optional

from pydantic import BaseModel, Field

from app.services.gazette.integrity import IntegrityReport
from app.services.gazette.toc import TocEntry
from app.services.gazette.types import ParsedDocument


class GazetteParseRequest(BaseModel):
    content_text: Optional[str] = Field(
        default=None, description="Texto simples da area de transferencia"
    )
    content_html: Optional[str] = Field(
        default=None, description="HTML da area de transferencia (sera sanitizado)"
    )
    use_ai: bool = Field(
        default=True,
        description="Permite usar IA como fallback para blocos ambiguos",
    )


class GazetteParseResponse(BaseModel):
    success: bool
    document: ParsedDocument
    rendered_html: Optional[str] = None
    toc: TocEntry
    integrity: IntegrityReport
    warnings: list[str] = Field(default_factory=list)
