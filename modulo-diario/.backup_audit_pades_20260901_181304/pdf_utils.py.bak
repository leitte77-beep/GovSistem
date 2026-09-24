import hashlib
import re
from datetime import date

MONTHS_PT = [
    "janeiro", "fevereiro", "março", "abril", "maio", "junho",
    "julho", "agosto", "setembro", "outubro", "novembro", "dezembro",
]


def compute_hash(content: bytes) -> str:
    return hashlib.sha256(content).hexdigest()


def detect_landscape(content_html: str) -> bool:
    tables = re.findall(r"<table[^>]*>.*?</table>", content_html, re.DOTALL | re.IGNORECASE)
    for table in tables:
        cols = re.findall(r"<th|<td", table)
        if len(cols) > 8:
            return True
        if "landscape" in table:
            return True
    return False


def format_date(d: date) -> str:
    return f"{d.day} de {MONTHS_PT[d.month - 1]} de {d.year}"
