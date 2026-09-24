"""Classificador semantico por IA — usado somente como fallback.

O motor de regras e a maquina de estados rodam primeiro; apenas blocos
ambiguos (unknown ou baixa confianca) sao enviados a IA. A resposta e
validada com rigor: tipos permitidos, texto identico ao original e JSON
valido. Qualquer resposta que altere o texto e rejeitada.
"""

import json
import logging
import os
import re
from abc import ABC, abstractmethod

import httpx
from pydantic import BaseModel, Field

from app.services.gazette.types import Block, BlockSource, BlockType, ParsedDocument

logger = logging.getLogger(__name__)

AI_CONFIDENCE_THRESHOLD = 0.60

ALLOWED_AI_TYPES = {t.value for t in BlockType}

CLASSIFIER_PROMPT = """Você é um classificador de estruturas de publicações oficiais brasileiras.

Sua única função é identificar o tipo de cada trecho recebido.

Regras obrigatórias:
1. Não altere nenhuma palavra.
2. Não corrija erros.
3. Não melhore a redação.
4. Não altere letras maiúsculas ou minúsculas.
5. Não altere pontuação.
6. Não resuma.
7. Não complete informações.
8. Não invente blocos.
9. Não invente títulos.
10. Não invente assinaturas.
11. Não altere números, datas ou valores.
12. Cada original_text deve ser uma cópia exata de um trecho da entrada.
13. Utilize "unknown" quando não houver segurança.
14. Considere a ordem do documento.
15. Considere os resultados prévios do motor de regras.
16. Retorne exclusivamente JSON válido.
17. Não retorne Markdown.
18. Não escreva explicações.

Tipos permitidos:
{allowed_types}

Formato de resposta (JSON, sem markdown):
{{"blocks": [{{"id": "<id do bloco recebido>", "type": "<tipo>",
"original_text": "<texto exato>", "confidence": 0.0}}]}}

Entrada original:
{input_text}

Blocos previamente identificados (contexto):
{pre_classified}

Blocos ambíguos a classificar:
{ambiguous_blocks}
"""


class ClassificationInput(BaseModel):
    normalized_text: str
    pre_classified: list[dict] = Field(default_factory=list)
    ambiguous_blocks: list[dict] = Field(default_factory=list)


class ClassifiedBlock(BaseModel):
    id: str
    type: str
    original_text: str
    confidence: float = 0.0


class ClassificationResult(BaseModel):
    blocks: list[ClassifiedBlock] = Field(default_factory=list)
    warnings: list[str] = Field(default_factory=list)


class DocumentStructureClassifier(ABC):
    """Interface do provedor de IA — mantem a logica desacoplada do fornecedor."""

    @abstractmethod
    async def classify(self, payload: ClassificationInput) -> ClassificationResult:
        ...


class GeminiClassifier(DocumentStructureClassifier):
    def __init__(self, api_key: str | None = None, model: str | None = None):
        self.api_key = (api_key or os.getenv("GEMINI_API_KEY", "")).strip()
        self.model = model or os.getenv("GEMINI_MODEL", "gemini-2.5-flash")

    @property
    def available(self) -> bool:
        return bool(self.api_key)

    async def classify(self, payload: ClassificationInput) -> ClassificationResult:
        prompt = CLASSIFIER_PROMPT.format(
            allowed_types=json.dumps(sorted(ALLOWED_AI_TYPES), ensure_ascii=False),
            input_text=payload.normalized_text,
            pre_classified=json.dumps(
                payload.pre_classified, ensure_ascii=False
            ),
            ambiguous_blocks=json.dumps(
                payload.ambiguous_blocks, ensure_ascii=False
            ),
        )
        url = (
            "https://generativelanguage.googleapis.com/v1beta/models/"
            f"{self.model}:generateContent"
        )
        body = {
            "contents": [{"role": "user", "parts": [{"text": prompt}]}],
            "generationConfig": {
                "temperature": 0.0,
                "topP": 0.9,
                "maxOutputTokens": 8192,
                "responseMimeType": "application/json",
            },
        }
        async with httpx.AsyncClient(timeout=60) as client:
            resp = await client.post(url, params={"key": self.api_key}, json=body)
        resp.raise_for_status()
        data = resp.json()
        text = ""
        candidates = data.get("candidates") or []
        if candidates:
            parts = candidates[0].get("content", {}).get("parts", [])
            text = "".join(part.get("text", "") for part in parts)
        match = re.search(r"\{.*\}", text, re.DOTALL)
        if not match:
            raise ValueError("Resposta da IA sem JSON")
        parsed = json.loads(match.group(0))
        return ClassificationResult(
            blocks=[ClassifiedBlock(**b) for b in parsed.get("blocks", [])]
        )


def _ambiguous_blocks(document: ParsedDocument) -> list[Block]:
    return [
        block
        for block in document.iter_blocks()
        if block.type == BlockType.UNKNOWN
        or block.confidence < AI_CONFIDENCE_THRESHOLD
    ]


def _validate_ai_block(
    candidate: ClassifiedBlock, block: Block, normalized_text: str
) -> bool:
    if candidate.type not in ALLOWED_AI_TYPES:
        return False
    if candidate.type == BlockType.UNKNOWN.value:
        return False
    if not 0.0 <= candidate.confidence <= 1.0:
        return False
    # O texto retornado deve ser copia exata do bloco original (e portanto
    # existir na entrada). Qualquer alteracao e rejeitada.
    if candidate.original_text != block.original_text:
        return False
    if candidate.original_text not in normalized_text:
        return False
    return True


async def refine_with_ai(
    document: ParsedDocument,
    classifier: DocumentStructureClassifier | None = None,
) -> ParsedDocument:
    """Envia apenas blocos ambiguos a IA e aplica somente respostas validas.

    Em caso de resposta invalida: uma unica retentativa; se persistir,
    mantem a classificacao deterministica e registra o erro tecnico.
    """
    classifier = classifier or GeminiClassifier()
    if isinstance(classifier, GeminiClassifier) and not classifier.available:
        return document

    ambiguous = _ambiguous_blocks(document)
    if not ambiguous:
        return document

    by_id = {block.id: block for block in ambiguous}
    payload = ClassificationInput(
        normalized_text=document.normalized_text,
        pre_classified=[
            {"type": b.type.value, "original_text": b.original_text}
            for b in document.iter_blocks()
            if b.id not in by_id
        ],
        ambiguous_blocks=[
            {"id": b.id, "original_text": b.original_text} for b in ambiguous
        ],
    )

    result: ClassificationResult | None = None
    for attempt in (1, 2):  # no maximo uma tentativa de correcao
        try:
            result = await classifier.classify(payload)
            break
        except Exception as exc:  # noqa: BLE001 - IA nunca derruba o pipeline
            logger.warning("Classificador IA falhou (tentativa %s): %s", attempt, exc)
            result = None

    if result is None:
        document.warnings.append(
            "IA indisponível; mantida a classificação determinística."
        )
        return document

    applied = 0
    for candidate in result.blocks:
        block = by_id.get(candidate.id)
        if block is None:
            continue
        if not _validate_ai_block(candidate, block, document.normalized_text):
            logger.warning(
                "Resposta da IA rejeitada para bloco %s (texto ou tipo inválido)",
                candidate.id,
            )
            continue
        block.type = BlockType(candidate.type)
        block.confidence = candidate.confidence
        block.source = BlockSource.AI
        applied += 1

    if applied:
        document.warnings.append(
            f"{applied} bloco(s) classificado(s) com auxílio de IA."
        )
    return document
