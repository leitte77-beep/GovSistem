"""Persistir uma minuta gerada (documento canônico) como matéria real.

O documento produzido pelo motor (:class:`SemanticDocument`) é gravado no campo
``semantic_content`` da ``Matter`` e um HTML canônico/determinístico é derivado
para ``content_html``/``plain_text`` (busca e prévia). A origem (modelo/versão)
fica nos metadados. Nada aqui altera o fluxo editorial/edição existente: a
matéria nasce como **rascunho**, sem número.
"""

from __future__ import annotations

import html as html_mod
import uuid

from sqlalchemy.ext.asyncio import AsyncSession

from app.models.enums import MatterStatus
from app.models.matter import Matter
from app.semantic.schemas import SCHEMA_VERSION


def semantic_to_html(document) -> str:
    """HTML canônico determinístico dos blocos (para content_html/prévia)."""

    def esc(value: str | None) -> str:
        return html_mod.escape((value or ""), quote=False)

    parts: list[str] = []
    for b in document.blocks:
        t = b.type
        if t == "heading":
            parts.append(f"<h{b.level}>{esc(b.text)}</h{b.level}>")
        elif t == "command":
            parts.append(f'<p style="text-align:center"><strong>{esc(b.text)}</strong></p>')
        elif t in ("paragraph", "preamble", "quote", "inciso", "alinea", "paragraph_item"):
            parts.append(f"<p>{esc(b.content or b.text)}</p>")
        elif t == "article":
            label = f"Art. {b.suffix or b.number or ''}".strip() + " "
            parts.append(f"<p><strong>{esc(label)}</strong>{esc(b.caput)}</p>")
            for p in b.paragraphs:
                num = f"§ {p.number}" if p.number else "Parágrafo único"
                parts.append(f"<p>{esc(num)} — {esc(p.content)}</p>")
            for i in b.incisos:
                parts.append(f"<p>{esc(i.number)} — {esc(i.content)}</p>")
            for a in b.alineas:
                parts.append(f"<p>{esc(a.number)} — {esc(a.content)}</p>")
        elif t == "signature_block":
            for e in b.entries:
                parts.append(
                    f'<p style="text-align:{esc(b.alignment)}">{esc(e.name)}'
                    + (f"<br/>{esc(e.role)}" if e.role else "")
                    + (f"<br/>{esc(e.location)}" if e.location else "")
                    + "</p>"
                )
        elif t == "attachment_reference":
            parts.append(f"<p>{esc(b.title)}</p>")
    return "\n".join(parts)


async def create_rendered_matter(
    db: AsyncSession,
    *,
    organization_id: uuid.UUID,
    author_id: uuid.UUID,
    act_type_id: uuid.UUID,
    document,
    title_override: str | None = None,
    meta: dict | None = None,
) -> Matter:
    """Cria matéria rascunho a partir de um SemanticDocument já renderizado."""
    title = (title_override or "").strip() or (document.title or "").strip()
    if not title:
        raise ValueError(
            "Minuta sem título. Informe título ou preencha o campo de título do modelo."
        )
    content_html = semantic_to_html(document)
    plain = document.plain_text() or html_mod.unescape(content_html)

    matter = Matter(
        organization_id=organization_id,
        act_type_id=act_type_id,
        title=title,
        summary=document.summary or None,
        content_html=content_html,
        content_json=None,
        content_mode="semantic",
        plain_text=plain,
        status=MatterStatus.DRAFT,
        version=1,
        author_id=author_id,
        document_type=document.document_type or None,
        semantic_content=document.model_dump(mode="json"),
        semantic_schema_version=SCHEMA_VERSION,
        classification_status="pending",
        metadata_json=(meta or {}),
    )
    db.add(matter)
    await db.flush()
    return matter


__all__ = ["semantic_to_html", "create_rendered_matter"]
