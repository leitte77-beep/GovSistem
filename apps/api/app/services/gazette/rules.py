"""Motor de regras deterministico para classificacao de trechos.

Cada regra possui nome, identificador, prioridade, expressao regular, tipo
retornado e confianca. As condicoes de contexto sao aplicadas pela maquina
de estados (state_machine.py).
"""

import re
from dataclasses import dataclass
from typing import Optional

from app.services.gazette.types import BlockType

MONTHS_PT = (
    "janeiro|fevereiro|mar[cç]o|abril|maio|junho|julho|agosto|"
    "setembro|outubro|novembro|dezembro"
)


@dataclass(frozen=True)
class Rule:
    id: str
    name: str
    priority: int
    pattern: re.Pattern
    block_type: BlockType
    confidence: float


def _rule(
    rule_id: str,
    name: str,
    priority: int,
    pattern: str,
    block_type: BlockType,
    confidence: float,
    flags: int = 0,
) -> Rule:
    return Rule(rule_id, name, priority, re.compile(pattern, flags), block_type, confidence)


ACT_TITLE_PATTERN = (
    r"^(DECRETO|PORTARIA|LEI\s+COMPLEMENTAR|LEI|RESOLU[CÇ][AÃ]O|EDITAL|AVISO|"
    r"COMUNICADO)(\s+[A-ZÀ-Ü/.\s]*)?\s+(N[º°O.]*\s*)?\d+[\d./-]*\s*$"
)

FIELD_LABELS = (
    r"Contratante|Contratada|Contratado|Benefici[aá]ri[oa]|Objeto|Vig[eê]ncia|"
    r"Valor(?:\s+Total|\s+Global)?|Pagamento|Contrapartida|"
    r"Fundamenta[cç][aã]o\s+Legal|Data\s+d[ae]\s+[Aa]ssinatura|"
    r"Data\s+de\s+rescis[aã]o|Part[ií]cipes|Autoriza[cç][aã]o\s+e\s+Fundamenta[cç][aã]o|"
    r"Processo(?:\s+Administrativo)?|Modalidade|Contrato|Prazo|Licitante|Fornecedor|"
    r"Dota[cç][aã]o\s+Or[cç]ament[aá]ria|Interveniente|Locador|Locat[aá]ri[oa]|"
    r"Convenente|Concedente|Empresa|CNPJ|CPF|Per[ií]odo|Finalidade|Amparo\s+Legal"
)

RE_CURRENCY = re.compile(r"R\$\s?[\d.]+,\d{2}")
RE_CNPJ = re.compile(r"\b\d{2}\.?\d{3}\.?\d{3}/?\d{4}-?\d{2}\b")
RE_CPF = re.compile(r"\b\d{3}\.?\*{0,3}\d{0,3}\.?\d{3}-?\*{0,2}\d{0,2}\b")
RE_NUMERIC_DATE = re.compile(r"\b\d{1,2}/\d{1,2}/\d{4}\b")
RE_DATE_LINE = re.compile(
    rf"^[A-ZÀ-Ü][A-Za-zÀ-ÿ.\s]*,\s*(aos\s+)?\d{{1,2}}(º)?\s+(dias?\s+)?"
    rf"(do\s+m[eê]s\s+)?(de\s+)?({MONTHS_PT})\s+de\s+\d{{4}}\.?$",
    re.IGNORECASE,
)

ROLE_PATTERN = re.compile(
    r"^(Prefeit[oa](\s+Municipal)?(\s+em\s+[Ee]xerc[ií]cio)?|Vice-?Prefeit[oa].*|"
    r"Secret[aá]ri[oa].{0,60}|Presidente.{0,60}|Diretor(a)?.{0,60}|"
    r"Pregoeir[oa].{0,30}|Chefe.{0,60}|Coordenador(a)?.{0,60}|"
    r"Procurador(a)?.{0,60}|Contador(a)?.{0,30}|Tesoureir[oa].{0,30}|"
    r"Fiscal.{0,40}|Gestor(a)?.{0,40}|Superintendente.{0,40}|Ordenador(a)?.{0,40})$"
)

RULES: list[Rule] = sorted(
    [
        _rule("act_title", "Titulo de ato", 10, ACT_TITLE_PATTERN, BlockType.DOCUMENT_TITLE, 0.99),
        _rule("summary", "Sumula", 12, r"^(S[UÚ]MULA|EMENTA)\s*:", BlockType.SUMMARY, 0.99),
        _rule(
            "sole_paragraph", "Paragrafo unico", 14,
            r"^Par[aá]grafo\s+[uú]nico\s*[-–—.:]?", BlockType.SOLE_PARAGRAPH, 0.99,
        ),
        _rule(
            "article", "Artigo", 15,
            r"^Art\.?\s*\d+[º°o]?\s*[-–—.:]?", BlockType.ARTICLE, 0.99,
        ),
        _rule(
            "paragraph", "Paragrafo", 16,
            r"^§\s*\d+[º°o]?\s*[-–—.:]?", BlockType.PARAGRAPH, 0.99,
        ),
        _rule(
            "consideration", "Considerando", 18,
            r"^CONSIDERANDO\b", BlockType.CONSIDERATION, 0.99,
        ),
        _rule(
            "command", "Comando normativo", 20,
            r"^(O\s+PREFEITO\s+.{0,80}\s)?(DECRETA|RESOLVE|DETERMINA|TORNA\s+P[UÚ]BLICO|SANCIONA|PROMULGA)\s*:\s*$",
            BlockType.COMMAND, 0.99,
        ),
        _rule("subsection", "Inciso", 30, r"^[IVXLCDM]+\s*[-–—.)]\s+", BlockType.SUBSECTION, 0.97),
        _rule("letter_item", "Alinea", 32, r"^[a-z]\)\s+", BlockType.LETTER_ITEM, 0.97),
        _rule(
            "field", "Campo de extrato", 40,
            rf"^({FIELD_LABELS})\s*:", BlockType.FIELD, 0.98, re.IGNORECASE,
        ),
        _rule(
            "total_value", "Valor total", 42,
            r"^(VALOR\s+(TOTAL|GLOBAL)|TOTAL\s+(GERAL|DO\s+PROCESSO)?)\b.*R\$\s?[\d.]+,\d{2}",
            BlockType.TOTAL_VALUE, 0.97, re.IGNORECASE,
        ),
        _rule(
            "date_line", "Local e data por extenso", 50,
            RE_DATE_LINE.pattern, BlockType.DATE, 0.96, re.IGNORECASE,
        ),
        _rule(
            "location", "Local", 52,
            r"^(Pa[cç]o\s+Municipal|Gabinete\s+d[oa]|Edif[ií]cio|Pal[aá]cio|Sala\s+das?\s+Sess[oõ]es)\b",
            BlockType.LOCATION, 0.90,
        ),
        _rule(
            "preamble", "Preambulo", 60,
            r"^([OA]\s+(EXCELENT[IÍ]SSIM[OA]\s+)?(SENHOR(A)?,?\s+)?"
            r"(PREFEIT[OA]|PRESIDENTE|SECRET[AÁ]RI[OA]|C[AÂ]MARA|VICE-?PREFEIT[OA])\b|"
            r".*\bNO\s+USO\s+D[AE]S?\s+(SUAS\s+)?ATRIBUI[CÇ][OÕ]ES\b)",
            BlockType.PREAMBLE, 0.94, re.IGNORECASE,
        ),
        _rule(
            "numbered_item", "Item numerado", 70,
            r"^\d+\s*[-–—.)]\s+", BlockType.NUMBERED_ITEM, 0.80,
        ),
        _rule(
            "annex_title", "Titulo de anexo", 24,
            r"^ANEXO\s+([IVXLCDM]+|\d+|[UÚ]NICO)?\b", BlockType.ANNEX_TITLE, 0.95,
        ),
    ],
    key=lambda r: r.priority,
)


def match_rule(text: str) -> Optional[Rule]:
    value = text.strip()
    for rule in RULES:
        if rule.pattern.match(value):
            return rule
    return None


def letters_only(text: str) -> str:
    return re.sub(r"[^A-Za-zÀ-ÿ]", "", text)


def is_uppercase_line(text: str) -> bool:
    letters = letters_only(text)
    return len(letters) >= 3 and letters == letters.upper()


def looks_like_person_name(text: str) -> bool:
    value = text.strip()
    if not value or len(value) > 60 or any(ch.isdigit() for ch in value):
        return False
    words = value.split()
    if len(words) < 2 or len(words) > 8:
        return False
    return is_uppercase_line(value) and not re.search(r"[:;,]$", value)


def looks_like_role(text: str) -> bool:
    return bool(ROLE_PATTERN.match(text.strip()))


def looks_like_category(text: str) -> bool:
    value = text.strip()
    return (
        is_uppercase_line(value)
        and len(value) <= 45
        and not any(ch.isdigit() for ch in value)
        and not value.endswith((":", ".", ","))
    )


def looks_like_title(text: str) -> bool:
    value = text.strip()
    return is_uppercase_line(value) and len(value) <= 130 and not value.endswith(":")
