import json
import os
import re

import httpx
from fastapi import APIRouter, Depends, HTTPException

from app.core.auth import require_roles
from app.core.config import settings
from app.schemas.ai_formatter import AIFormatRequest, AIFormatResponse
from app.models.user import User

router = APIRouter(tags=["ai-formatting"])


def _extract_json(text: str) -> dict:
    match = re.search(r"\{.*\}", text, re.DOTALL)
    if not match:
        raise ValueError("No JSON object found in model response")
    return json.loads(match.group(0))


def _fallback_structure(content: str) -> str:
    lines = [line.strip() for line in content.replace("\r\n", "\n").split("\n") if line.strip()]
    if not lines:
        return "<p></p>"
    if any(tag in content.lower() for tag in ("<p", "<table", "<ul", "<ol", "<h1", "<h2", "<h3", "<blockquote", "<pre")):
        return content
    blocks = [f"<p>{line}</p>" for line in lines]
    return "".join(blocks)


@router.post("/ai/format-content", response_model=AIFormatResponse)
async def format_content_with_ai(
    payload: AIFormatRequest,
    _: User = Depends(require_roles("DIAGRAMADOR", "ADMIN")),
):
    api_key = os.getenv("GEMINI_API_KEY", "").strip()
    if not api_key:
        raise HTTPException(503, "GEMINI_API_KEY não configurada")

    model = os.getenv("GEMINI_MODEL", "gemini-2.5-flash")
    prompt = f"""
Você é um assistente de diagramação de diário oficial.
Converta o conteúdo abaixo em HTML estruturado e padronizado.
Regras:
- preserve o conteúdo original;
- identifique título, subtítulos, ementa, parágrafos, listas e tabelas;
- nunca invente conteúdo;
- devolva somente JSON válido com as chaves structured_html e notes;
- use tags HTML simples: h1, h2, h3, p, ul, ol, li, table, thead, tbody, tr, th, td, blockquote;
- não inclua markdown.

Contexto:
Tipo de ato: {payload.act_type or ""}
Título: {payload.title or ""}
Súmula: {payload.summary or ""}

Conteúdo:
{payload.content}
""".strip()

    url = f"https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent"
    params = {"key": api_key}
    body = {
        "contents": [
            {
                "role": "user",
                "parts": [{"text": prompt}],
            }
        ],
        "generationConfig": {
            "temperature": 0.2,
            "topP": 0.9,
            "maxOutputTokens": 8192,
        },
    }

    try:
        async with httpx.AsyncClient(timeout=90) as client:
            resp = await client.post(url, params=params, json=body)
        if resp.status_code >= 400:
            return AIFormatResponse(
                structured_html=_fallback_structure(payload.content),
                model=model,
                notes=["Gemini indisponível; normalização local aplicada."],
            )
        data = resp.json()
        candidates = data.get("candidates") or []
        text = ""
        if candidates:
            parts = candidates[0].get("content", {}).get("parts", [])
            text = "".join(part.get("text", "") for part in parts)
        parsed = _extract_json(text)
        structured_html = parsed.get("structured_html") or _fallback_structure(payload.content)
        notes = parsed.get("notes") or []
        if not isinstance(notes, list):
            notes = [str(notes)]
        return AIFormatResponse(structured_html=structured_html, model=model, notes=notes)
    except HTTPException:
        raise
    except Exception as exc:
        return AIFormatResponse(
            structured_html=_fallback_structure(payload.content),
            model=model,
            notes=[f"Gemini indisponível; normalização local aplicada. ({exc})"],
        )
