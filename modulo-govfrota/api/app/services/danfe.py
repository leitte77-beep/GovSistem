"""Leitura do texto de um DANFE em PDF (NF-e ou NFC-e).

O sistema trabalha só com o PDF da nota. Quando o PDF tem texto (gerado
pelo emissor, não escaneado), dá para extrair a chave de acesso — e dela o
CNPJ do emitente, a série e o número — além do valor total e da data de
emissão. Tudo é "melhor esforço": se não achar, devolve None no campo e a
nota segue valendo como arquivo.
"""

import io
import re
from dataclasses import dataclass, field
from datetime import datetime
from decimal import Decimal, InvalidOperation

MAX_PAGINAS = 3

# Blocos da chave podem vir separados por espaço simples, duplo ou ponto, conforme o emissor.
_RE_CHAVE = re.compile(r"(?<!\d)((?:\d[\s.]{0,3}){43}\d)(?!\d)")
_RE_MOEDA = r"(\d{1,3}(?:\.\d{3})*,\d{2})"
_ROTULOS_TOTAL = (
    r"VALOR\s+TOTAL\s+DA\s+NOTA",
    r"VALOR\s+A\s+PAGAR",
    r"VALOR\s+TOTAL\s+R\$",
    r"VALOR\s+TOTAL",
    r"TOTAL\s+DA\s+NOTA",
    r"VALOR\s+NOTA",
    r"RESUMO\s+PAGAMENTO",
)
_RE_EMISSAO = re.compile(
    r"(?:DATA\s+(?:DA|DE)\s+EMISS[ÃA]O|EMISS[ÃA]O)[^\d]{0,40}(\d{2}/\d{2}/\d{4})(?:\s+(\d{2}:\d{2}(?::\d{2})?))?",
    re.IGNORECASE,
)
# Protocolo de autorização: "141260398338360 - 01/10/2026 11:18:47" (≈ emissão).
_RE_PROTOCOLO = re.compile(r"\b\d{15}\s*-\s*(\d{2}/\d{2}/\d{4})\s+(\d{2}:\d{2}(?::\d{2})?)")
# Linha do item: unidade em litros, quantidade, valor unitário e valor total.
_RE_ITEM_LITROS = re.compile(
    r"\b(?:L|LT|LTS|LITROS?)\s+(\d{1,3}(?:\.\d{3})*,\d{1,4})\s+(\d{1,3},\d{2,4})\s+(\d{1,3}(?:\.\d{3})*,\d{2})(?!\d)"
)
_RE_KM = re.compile(r"\bKM\s*[:=]?\s*(\d{1,3}(?:\.\d{3})+|\d{1,7})\b")
_RE_CNPJ = re.compile(r"\b(\d{2}\.\d{3}\.\d{3}/\d{4}-\d{2})\b")
_RE_NUMERO_AB = re.compile(r"AB\s*-?\s*(\d{4})\s*/\s*(\d{1,9})", re.IGNORECASE)
_RE_PLACA = re.compile(r"\b([A-Z]{3}-?\d[A-Z0-9]\d{2})\b")


@dataclass
class Danfe:
    texto: bool = False
    chave: str | None = None
    numero: str | None = None
    serie: str | None = None
    emitente_cnpj: str | None = None
    valor_total: Decimal | None = None
    emissao: datetime | None = None
    numeros_ab: list[tuple[int, int]] = field(default_factory=list)
    placas: list[str] = field(default_factory=list)
    # Itens em litros (combustível): soma das quantidades e preço unitário.
    litros: Decimal | None = None
    preco_unitario: Decimal | None = None
    km: int | None = None
    cnpjs: list[str] = field(default_factory=list)


def chave_valida(chave: str) -> bool:
    """Dígito verificador (módulo 11) da chave de 44 dígitos."""
    if len(chave) != 44 or not chave.isdigit():
        return False
    pesos = [2, 3, 4, 5, 6, 7, 8, 9]
    soma = sum(int(d) * pesos[i % 8] for i, d in enumerate(reversed(chave[:43])))
    resto = soma % 11
    dv = 0 if resto < 2 else 11 - resto
    return dv == int(chave[43])


def _moeda(v: str) -> Decimal | None:
    try:
        return Decimal(v.replace(".", "").replace(",", "."))
    except InvalidOperation:
        return None


def _itens_litros(texto: str) -> list[tuple[Decimal, Decimal, Decimal]]:
    """(quantidade, unitário, total) de cada item em litros cuja conta fecha."""
    itens = []
    for m in _RE_ITEM_LITROS.finditer(texto.upper()):
        q, u, t = (_moeda(g) for g in m.groups())
        if q and u and t and abs(q * u - t) <= Decimal("0.05"):
            itens.append((q, u, t))
    return itens


def extrair_texto(conteudo: bytes) -> str:
    from pypdf import PdfReader

    leitor = PdfReader(io.BytesIO(conteudo))
    partes = []
    for pagina in leitor.pages[:MAX_PAGINAS]:
        partes.append(pagina.extract_text() or "")
    return "\n".join(partes)


def interpretar(texto: str) -> Danfe:
    d = Danfe(texto=bool(texto.strip()))
    if not d.texto:
        return d
    maiusculo = texto.upper()

    for m in _RE_CHAVE.finditer(texto):
        chave = re.sub(r"\D", "", m.group(1))
        if chave_valida(chave):
            d.chave = chave
            d.emitente_cnpj = chave[6:20]
            d.serie = str(int(chave[22:25]))
            d.numero = str(int(chave[25:34]))
            break

    for rotulo in _ROTULOS_TOTAL:
        m = re.search(rotulo + r"[^\d]{0,40}" + _RE_MOEDA, maiusculo)
        if m and (v := _moeda(m.group(1))) is not None:
            d.valor_total = v
            break

    for regex in (_RE_EMISSAO, _RE_PROTOCOLO):
        m = regex.search(texto)
        if m:
            try:
                d.emissao = datetime.strptime(f"{m.group(1)} {m.group(2) or '00:00'}"[:16], "%d/%m/%Y %H:%M")
                break
            except ValueError:
                d.emissao = None

    itens = _itens_litros(texto)
    if itens:
        d.litros = sum((q for q, _, _ in itens), Decimal("0"))
        total_itens = sum((t for _, _, t in itens), Decimal("0"))
        d.preco_unitario = itens[0][1] if len(itens) == 1 else (total_itens / d.litros).quantize(Decimal("0.0001"))
        if d.valor_total is None:
            d.valor_total = total_itens

    m = _RE_KM.search(maiusculo)
    if m:
        d.km = int(m.group(1).replace(".", ""))
    d.cnpjs = sorted({re.sub(r"\D", "", c) for c in _RE_CNPJ.findall(texto)})

    d.numeros_ab = [(int(a), int(s)) for a, s in _RE_NUMERO_AB.findall(texto)]
    d.placas = sorted({p.replace("-", "") for p in _RE_PLACA.findall(maiusculo)})
    return d


def ler_danfe(conteudo: bytes) -> Danfe:
    """Nunca levanta exceção: PDF ilegível vira Danfe(texto=False)."""
    try:
        return interpretar(extrair_texto(conteudo))
    except Exception:
        return Danfe()
