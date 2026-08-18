"""Geração de códigos de catálogo legíveis a partir do nome/descrição.

Os códigos técnicos (ex.: ``REQ_GERAL``) deixam de ser preenchidos à mão pelo
admin. Quando nenhum código é informado, o sistema deriva um slug legível do
texto livre (acentos removidos, maiúsculas, separadores viram ``_``) e garante
unicidade por tenant (ver ``dominio._codigo_unico``).
"""

import re
import unicodedata


def _sem_acentos(texto: str) -> str:
    return "".join(
        ch for ch in unicodedata.normalize("NFKD", texto) if not unicodedata.combining(ch)
    )


def slugify_codigo(texto: str, max_len: int = 25) -> str:
    """Deriva um código técnico legível de um texto livre.

    ``"Licença de Obra / Alvará"`` → ``"LICENCA_DE_OBRA_ALVARA"``.
    ``max_len`` deixa folga para o sufixo de unicidade (``_2``, ``_3``…) dentro
    do limite de 30 caracteres da coluna ``codigo``.
    """
    base = _sem_acentos(texto or "")
    base = base.upper()
    base = re.sub(r"[^A-Z0-9]+", "_", base).strip("_")
    base = base[:max_len].rstrip("_")
    return base or "ITEM"
