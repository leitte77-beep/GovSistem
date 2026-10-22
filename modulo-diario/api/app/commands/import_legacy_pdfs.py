"""Importa o acervo de edições em PDF do sistema anterior.

Lê número e data do cabeçalho da 1ª página de cada PDF (ex.: "TERÇA-FEIRA,
29 DE DEZEMBRO DE 2015 ... EDIÇÃO Nº: 107- 6 Pág(s)"), confere o número com o
nome do arquivo ("Diario Eletronico - 107.pdf") e cria a edição publicada com
o PDF original intacto. O texto integral vai para a matéria (busca pública).

Idempotente: edição já existente (mesmo número) com o mesmo hash é pulada;
com hash diferente vira erro, nunca sobrescreve.

Uso (dentro do container da api):
    python -m app.commands.import_legacy_pdfs --org farol --dir /tmp/acervo --dry-run
    python -m app.commands.import_legacy_pdfs --org farol --dir /tmp/acervo
"""

from __future__ import annotations

import argparse
import asyncio
import hashlib
import html
import re
import subprocess
import sys
import unicodedata
from dataclasses import dataclass, field
from datetime import date, datetime, timezone
from pathlib import Path

from sqlalchemy import select

from app.core.database import async_session
from app.core.storage import set_storage_tenant, storage
from app.models.act_type import ActType
from app.models.edition import Edition
from app.models.edition_item import EditionItem
from app.models.enums import EditionStatus, EditionType, MatterStatus
from app.models.matter import Matter
from app.models.organization import Organization
from app.models.user import User

LEGACY_SUBTITLE = "Acervo do sistema anterior"

MONTHS = {
    "JANEIRO": 1, "FEVEREIRO": 2, "MARCO": 3, "ABRIL": 4, "MAIO": 5, "JUNHO": 6,
    "JULHO": 7, "AGOSTO": 8, "SETEMBRO": 9, "OUTUBRO": 10, "NOVEMBRO": 11, "DEZEMBRO": 12,
}
DATE_RE = re.compile(r"(\d{1,2})\s+DE\s+([A-Z]+)\s+DE\s+(\d{4})")
NUMBER_RE = re.compile(r"EDICAO\s*N[ºO°]?\s*[:.]?\s*(\d+)")
EXTRA_RE = re.compile(r"EDICAO\s+EXTRA")
# 1º número do nome: "Diario Eletronico - 436 (Reparado).pdf", "527- Farol (1).pdf".
FILENAME_RE = re.compile(r"(\d+)")
# Exportação do sistema anterior sem número no nome: vale o cabeçalho do PDF.
UUID_NAME_RE = re.compile(r"^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}", re.I)
SUMMARY_LINE_RE = re.compile(r"^\s*(.+?)\s*\.{4,}\s*\d+\s*$")


def _fold(text: str) -> str:
    """Maiúsculas sem acento, para casar o cabeçalho de forma tolerante."""
    text = unicodedata.normalize("NFKD", text).upper()
    return "".join(c for c in text if not unicodedata.combining(c))


def _pdftotext(path: Path, *, first_page_only: bool = False) -> str:
    args = ["pdftotext", "-layout"]
    if first_page_only:
        args += ["-l", "1"]
    out = subprocess.run([*args, str(path), "-"], capture_output=True, timeout=120)
    return out.stdout.decode("utf-8", errors="replace")


@dataclass
class Parsed:
    path: Path
    number: int | None = None
    pub_date: date | None = None
    extra: bool = False
    sha256: str = ""
    text: str = ""
    summary: list[str] = field(default_factory=list)
    error: str | None = None
    warning: str | None = None


def parse_pdf(path: Path, forced_number: int | None = None, trust_filename: bool = False) -> Parsed:
    p = Parsed(path)
    content = path.read_bytes()
    p.sha256 = hashlib.sha256(content).hexdigest()
    first = _pdftotext(path, first_page_only=True)
    header = _fold(first[:3000])

    m = NUMBER_RE.search(header)
    if m:
        p.number = int(m.group(1))
    p.extra = bool(EXTRA_RE.search(header))
    for d in DATE_RE.finditer(header):
        month = MONTHS.get(d.group(2))
        if month:
            try:
                p.pub_date = date(int(d.group(3)), month, int(d.group(1)))
                break
            except ValueError:
                continue

    fm = None if UUID_NAME_RE.match(path.name) else FILENAME_RE.search(path.name)
    file_number = int(fm.group(1)) if fm else None
    if forced_number is not None:
        # Cabeçalho impresso errado no sistema anterior: o operador decide o número.
        p.number = file_number = forced_number
    if p.number is None:
        p.number = file_number
    elif file_number is not None and file_number != p.number and trust_filename:
        p.warning = f"cabeçalho impresso com nº {p.number}; usado o nº do arquivo"
        p.number = file_number
    elif file_number is not None and file_number != p.number:
        p.error = f"número no PDF ({p.number}) difere do nome do arquivo ({file_number})"
        return p
    if p.number is None:
        p.error = "número da edição não encontrado"
        return p
    if p.pub_date is None:
        p.error = "data não encontrada na 1ª página (PDF escaneado?)"
        return p

    p.text = _pdftotext(path)
    if len(p.text.strip()) < 50:
        p.error = "PDF sem texto (escaneado) — precisa de OCR"
        return p
    # Sumário: linhas "TÍTULO ........ 3" da 1ª página.
    in_summary = False
    for line in first.splitlines():
        if "SUMÁRIO" in line.upper():
            in_summary = True
            continue
        sm = SUMMARY_LINE_RE.match(line) if in_summary else None
        if sm:
            p.summary.append(re.sub(r"\s+", " ", sm.group(1)))
        elif in_summary and p.summary and not line.strip():
            continue
        elif in_summary and p.summary:
            break
    return p


def _matter_html(p: Parsed) -> str:
    parts = [
        f"<p><em>Edição publicada no sistema anterior em "
        f"{p.pub_date:%d/%m/%Y}. O conteúdo oficial é o PDF original.</em></p>"
    ]
    if p.summary:
        parts.append("<p><strong>Sumário</strong></p><ul>")
        parts += [f"<li>{html.escape(s)}</li>" for s in p.summary]
        parts.append("</ul>")
    return "".join(parts)


def _drop_drafts(files: list[Path]) -> tuple[list[Path], list[str]]:
    """"X.docx.pdf" é exportação do Word feita minutos antes da versão final
    (sem assinatura); só entra se não houver "X.pdf" ao lado."""
    names = {f.name.lower() for f in files}
    kept, dropped = [], []
    for f in files:
        if f.name.lower().endswith(".docx.pdf") and f.name.lower()[:-9] + ".pdf" in names:
            dropped.append(f.name)
        else:
            kept.append(f)
    return kept, dropped


async def run(
    org_slug: str,
    folder: Path,
    dry_run: bool,
    forced: dict[str, int] | None = None,
    trust_filename: bool = False,
) -> int:
    forced = forced or {}
    files, drafts = _drop_drafts(sorted(folder.rglob("*.pdf"), key=lambda f: (len(f.name), f.name)))
    parsed = [parse_pdf(f, forced.get(f.name), trust_filename) for f in files]
    ok = [p for p in parsed if not p.error]
    created = skipped = 0
    errors = [(p.path.name, p.error) for p in parsed if p.error]

    async with async_session() as db:
        org = (await db.execute(select(Organization).where(Organization.slug == org_slug))).scalar_one()
        author = (await db.execute(
            select(User).where(User.organization_id == org.id).order_by(User.created_at)
        )).scalars().first()
        act_type = (await db.execute(select(ActType).where(ActType.name == "Outros"))).scalars().first()
        if author is None or act_type is None:
            print("ERRO: organização sem usuário ou tipo de ato 'Outros'", file=sys.stderr)
            return 2
        set_storage_tenant(org.slug)
        seen: dict[tuple, str] = {}

        for p in ok:
            etype = EditionType.EXTRA if p.extra else EditionType.NORMAL
            existing = (await db.execute(select(Edition).where(
                Edition.organization_id == org.id,
                Edition.year == p.pub_date.year,
                Edition.number == p.number,
                Edition.type == etype,
            ))).scalar_one_or_none()
            if existing:
                if existing.pdf_hash == p.sha256:
                    skipped += 1
                else:
                    errors.append((p.path.name, f"edição {p.number}/{p.pub_date.year} já existe com outro PDF"))
                continue
            twin = (await db.execute(select(Edition.number).where(
                Edition.organization_id == org.id, Edition.pdf_hash == p.sha256,
            ))).scalars().first()
            if twin is not None and twin != p.number:
                errors.append((p.path.name, f"cópia idêntica do PDF da edição {twin}"))
                continue
            key = (p.pub_date.year, p.number, etype)
            if key in seen:
                errors.append((p.path.name, f"mesmo nº {p.number} de {seen[key]}"))
                continue
            seen[key] = p.path.name
            if dry_run:
                created += 1
                continue

            path = f"legado/diario-eletronico-{p.number}{'-extra' if p.extra else ''}.pdf"
            await storage.store(path, p.path.read_bytes())
            published_at = datetime.combine(p.pub_date, datetime.min.time(), tzinfo=timezone.utc)
            edition = Edition(
                organization_id=org.id,
                number=p.number,
                year=p.pub_date.year,
                type=etype,
                title=f"Edição nº {p.number}" + (" — Extra" if p.extra else ""),
                subtitle=LEGACY_SUBTITLE,
                publication_date=p.pub_date,
                status=EditionStatus.PUBLISHED,
                pdf_path=path,
                pdf_hash=p.sha256,
                created_by=author.id,
                published_by=author.id,
                published_at=published_at,
            )
            edition.generate_verification_code()
            db.add(edition)
            await db.flush()
            edition.immutability_hash = edition.compute_immutability_hash()

            matter = Matter(
                organization_id=org.id,
                act_type_id=act_type.id,
                title=f"Edição nº {p.number} de {p.pub_date:%d/%m/%Y} — {LEGACY_SUBTITLE.lower()}",
                summary="; ".join(p.summary)[:2000] or None,
                content_html=_matter_html(p),
                plain_text=p.text,
                status=MatterStatus.PUBLISHED,
                author_id=author.id,
                published_at=published_at,
            )
            db.add(matter)
            await db.flush()
            db.add(EditionItem(edition_id=edition.id, matter_id=matter.id, position=0))
            await db.commit()
            created += 1

    numbers = sorted({p.number for p in ok})
    missing = [n for n in range(numbers[0], numbers[-1] + 1) if n not in set(numbers)] if numbers else []
    verb = "seriam criadas" if dry_run else "criadas"
    print(f"Arquivos: {len(files)} | {verb}: {created} | já existiam: {skipped} | erros: {len(errors)}")
    for name in drafts:
        print(f"  IGNORADO {name}: rascunho (existe a versão final)")
    for p in parsed:
        if p.warning and not p.error:
            print(f"  AVISO {p.path.name}: {p.warning}")
    for name, err in errors:
        print(f"  ERRO {name}: {err}")
    if missing:
        print(f"Números faltando entre {numbers[0]} e {numbers[-1]}: {_ranges(missing)}")
    return 1 if errors else 0


def _ranges(nums: list[int]) -> str:
    out, start = [], nums[0]
    for prev, cur in zip(nums, nums[1:] + [None]):
        if cur != prev + 1:
            out.append(str(start) if start == prev else f"{start}–{prev}")
            start = cur
    return ", ".join(out)


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--org", required=True, help="slug da organização (ex.: farol)")
    ap.add_argument("--dir", required=True, type=Path)
    ap.add_argument("--dry-run", action="store_true")
    ap.add_argument(
        "--numero", action="append", default=[], metavar="ARQUIVO=N",
        help="força o número de uma edição cujo cabeçalho saiu errado (repetível)",
    )
    ap.add_argument(
        "--confiar-nome", action="store_true",
        help="se o cabeçalho divergir do nome do arquivo, usa o número do nome",
    )
    args = ap.parse_args()
    forced = {k: int(v) for k, v in (item.rsplit("=", 1) for item in args.numero)}
    sys.exit(asyncio.run(run(args.org, args.dir, args.dry_run, forced, args.confiar_nome)))


if __name__ == "__main__":
    main()
