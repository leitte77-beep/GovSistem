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

from app.document_model.body_html import blocks_to_html
from app.models.enums import MatterStatus, MatterWorkflowStatus
from app.models.matter import Matter
from app.semantic.schemas import SCHEMA_VERSION


def semantic_to_html(document) -> str:
    """HTML canônico determinístico do corpo.

    Unificado com o preview/PDF dos modelos (``render_html``): a matéria gerada
    guarda exatamente o mesmo HTML que o preview apresenta, consumido depois
    pelo PDF de edições.
    """
    return blocks_to_html(document)


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
        workflow_status=MatterWorkflowStatus.GERADO_PELA_IA.value,
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
