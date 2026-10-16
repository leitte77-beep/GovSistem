"""Exportação de relatórios — Excel (openpyxl) e PDF (reportlab).

- XLSX: valores numéricos tipados (não strings), datas corretas, moeda formatada,
  totais opcionais, cabeçalho com título/organização/período/filtros.
- PDF: A4, cabeçalho administrativo (organização, GovFrota, relatório, período,
  filtros, data/hora), rodapé com paginação e usuário gerador, quebra de página
  e repetição de cabeçalho de tabela.
"""

import io
from contextvars import ContextVar
from datetime import date, datetime
from decimal import Decimal

from reportlab.lib import colors
from reportlab.lib.enums import TA_CENTER, TA_LEFT, TA_RIGHT
from reportlab.lib.pagesizes import A4, landscape
from reportlab.pdfgen.canvas import Canvas
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.lib.units import mm
from reportlab.platypus import (
    Image,
    KeepTogether,
    PageBreak,
    Paragraph,
    SimpleDocTemplate,
    Spacer,
    Table,
    TableStyle,
)
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.timezone import now_local

FONT = "Helvetica"

# Personalização do PDF da organização (Configurações → Relatórios em PDF).
# Carregada por get_organizacao_nome/get_organizacao_meta, que todo relatório
# chama antes de build_pdf, e lida aqui sem mudar a assinatura de cada um.
_PERSONALIZACAO: ContextVar[dict | None] = ContextVar("govfrota_pdf_personalizacao", default=None)
COR_PRIMARIA = "#1D4ED8"
COR_SECUNDARIA = "#F59E0B"


def _pers() -> dict:
    return _PERSONALIZACAO.get() or {}


async def carregar_personalizacao(db: AsyncSession, organization_id) -> dict:
    from sqlalchemy import select
    from sqlalchemy.orm import undefer

    from app.models.configuracoes import ConfiguracaoGovFrota

    c = (
        await db.execute(
            select(ConfiguracaoGovFrota).options(undefer(ConfiguracaoGovFrota.pdf_logo))
            .where(ConfiguracaoGovFrota.organization_id == organization_id)
        )
    ).scalar_one_or_none()
    pers = {
        "titulo": c.pdf_titulo, "subtitulo": c.pdf_subtitulo, "linha_extra": c.pdf_linha_extra,
        "rodape": c.pdf_rodape, "cor_primaria": c.pdf_cor_primaria, "cor_secundaria": c.pdf_cor_secundaria,
        "logo": c.pdf_logo,
    } if c else {}
    _PERSONALIZACAO.set(pers)
    return pers


class RelatorioMeta:
    """Metadados comuns de cabeçalho de relatório."""

    def __init__(
        self,
        *,
        titulo: str,
        organizacao: str,
        periodo: str,
        filtros: list[str] | None = None,
        gerado_em: datetime | None = None,
        cnpj: str | None = None,
        logo: bytes | None = None,
    ):
        self.cnpj = cnpj
        self.logo = logo
        self.titulo = titulo
        self.organizacao = organizacao
        self.periodo = periodo
        self.filtros = [f for f in (filtros or []) if f]
        self.gerado_em = gerado_em or now_local()


# ─────────────────────────────── XLSX ──────────────────────────────────────


def _celula_numero(v):
    if isinstance(v, Decimal):
        return float(v)
    return v


def build_xlsx(
    meta: RelatorioMeta,
    headers: list[str],
    rows: list[list],
    *,
    currency_columns: set[int] | None = None,
    date_columns: set[int] | None = None,
    totals: list | None = None,
    aba_resumo: tuple[str, list[str], list[list], set[int]] | None = None,
) -> bytes:
    """Gera um arquivo .xlsx com formatação básica e tipagem correta.

    `aba_resumo` (nome, cabeçalho, linhas, colunas de moeda) vira a primeira aba.
    """
    from openpyxl import Workbook
    from openpyxl.styles import Alignment, Border, Font, PatternFill, Side
    from openpyxl.utils import get_column_letter

    wb = Workbook()
    ws = wb.active
    ws.title = meta.titulo[:28] or "Relatório"

    title_font = Font(bold=True, size=14, color="1F2937")
    subtitle_font = Font(size=10, color="6B7280")
    header_font = Font(bold=True, color="FFFFFF")
    header_fill = PatternFill("solid", fgColor="1D4ED8")
    thin = Side(style="thin", color="D1D5DB")
    border = Border(left=thin, right=thin, top=thin, bottom=thin)

    ws["A1"] = meta.titulo
    ws["A1"].font = title_font
    ws.merge_cells(start_row=1, start_column=1, end_row=1, end_column=max(len(headers), 1))
    ws["A2"] = meta.organizacao
    ws["A2"].font = subtitle_font
    ws["A3"] = f"Período: {meta.periodo}"
    ws["A3"].font = subtitle_font
    filtro_texto = "; ".join(meta.filtros) if meta.filtros else "Nenhum"
    ws["A4"] = f"Filtros: {filtro_texto}"
    ws["A4"].font = subtitle_font
    ws["A5"] = f"Gerado em: {meta.gerado_em.strftime('%d/%m/%Y %H:%M')}"
    ws["A5"].font = subtitle_font

    header_row = 7
    for c, h in enumerate(headers, start=1):
        cell = ws.cell(row=header_row, column=c, value=h)
        cell.font = header_font
        cell.fill = header_fill
        cell.alignment = Alignment(horizontal="center", vertical="center")
        cell.border = border

    r = header_row + 1
    for row in rows:
        for c, v in enumerate(row, start=1):
            cell = ws.cell(row=r, column=c, value=_celula_numero(v))
            cell.border = border
            if currency_columns and c - 1 in currency_columns:
                cell.number_format = "#,##0.00"
                cell.alignment = Alignment(horizontal="right")
            elif date_columns and c - 1 in date_columns:
                cell.number_format = "dd/mm/yyyy"
        r += 1

    if totals:
        for c, v in enumerate(totals, start=1):
            cell = ws.cell(row=r, column=c, value=_celula_numero(v))
            cell.font = Font(bold=True)
            cell.border = border
            if currency_columns and c - 1 in currency_columns:
                cell.number_format = "#,##0.00"
                cell.alignment = Alignment(horizontal="right")

    # Largura automática básica
    for c in range(1, len(headers) + 1):
        ws.column_dimensions[get_column_letter(c)].width = 18
    ws.freeze_panes = ws.cell(row=header_row + 1, column=1)

    if aba_resumo:
        nome, hdrs, rws, moedas = aba_resumo
        wr = wb.create_sheet(nome[:31], 0)
        wr["A1"] = meta.titulo
        wr["A1"].font = title_font
        wr["A2"] = f"{meta.organizacao} · Período: {meta.periodo}"
        wr["A2"].font = subtitle_font
        for c, h in enumerate(hdrs, start=1):
            cell = wr.cell(row=4, column=c, value=h)
            cell.font = header_font
            cell.fill = header_fill
            cell.border = border
        for r2, row in enumerate(rws, start=5):
            for c, v in enumerate(row, start=1):
                cell = wr.cell(row=r2, column=c, value=_celula_numero(v))
                cell.border = border
                if c - 1 in moedas:
                    cell.number_format = "#,##0.00"
                if r2 == 4 + len(rws):
                    cell.font = Font(bold=True)
        wr.column_dimensions["A"].width = 40
        for c in range(2, len(hdrs) + 1):
            wr.column_dimensions[get_column_letter(c)].width = 16
        wb.active = 0

    buf = io.BytesIO()
    wb.save(buf)
    return buf.getvalue()


def build_xlsx_abas(
    meta: RelatorioMeta,
    abas: list[tuple[str, list[str], list[list], set[int]]],
) -> bytes:
    """Várias tabelas, uma por aba: (nome da aba, cabeçalho, linhas, colunas de moeda)."""
    from openpyxl import Workbook
    from openpyxl.styles import Alignment, Border, Font, PatternFill, Side
    from openpyxl.utils import get_column_letter

    wb = Workbook()
    wb.remove(wb.active)
    thin = Side(style="thin", color="D1D5DB")
    borda = Border(left=thin, right=thin, top=thin, bottom=thin)
    for nome, headers, rows, moeda in abas:
        ws = wb.create_sheet(nome[:31])
        ws["A1"] = meta.titulo
        ws["A1"].font = Font(bold=True, size=13)
        ws["A2"] = f"{meta.organizacao} · Período: {meta.periodo}"
        ws["A2"].font = Font(size=10, color="6B7280")
        if meta.filtros:
            ws["A3"] = "; ".join(meta.filtros)
            ws["A3"].font = Font(size=10, color="6B7280")
        for c, h in enumerate(headers, start=1):
            cell = ws.cell(row=5, column=c, value=h)
            cell.font = Font(bold=True, color="FFFFFF")
            cell.fill = PatternFill("solid", fgColor="1D4ED8")
            cell.alignment = Alignment(horizontal="center", vertical="center", wrap_text=True)
            cell.border = borda
        for r, row in enumerate(rows, start=6):
            for c, v in enumerate(row, start=1):
                cell = ws.cell(row=r, column=c, value=_celula_numero(v))
                cell.border = borda
                if c - 1 in moeda:
                    cell.number_format = "#,##0.00"
        for c in range(1, len(headers) + 1):
            ws.column_dimensions[get_column_letter(c)].width = 20
        ws.freeze_panes = "A6"
    buf = io.BytesIO()
    wb.save(buf)
    return buf.getvalue()


# ─────────────────────────────── PDF ───────────────────────────────────────


def _br(v: float, casas: int = 2) -> str:
    return f"{v:,.{casas}f}".replace(",", "X").replace(".", ",").replace("X", ".")


def formatar_celula(v, moeda: bool = False) -> str:
    """Texto pt-BR para o PDF: R$ 1.234,56 · 1.234,5 · 30/09/2026."""
    if v is None:
        return "-"
    if isinstance(v, Decimal):
        v = float(v)
    if isinstance(v, bool):
        return "Sim" if v else "Não"
    if isinstance(v, datetime):
        return v.strftime("%d/%m/%Y %H:%M")
    if isinstance(v, date):
        return v.strftime("%d/%m/%Y")
    if isinstance(v, (int, float)):
        if moeda:
            return f"R$ {_br(float(v))}"
        if isinstance(v, int) or float(v).is_integer():
            return _br(float(v), 0)
        return _br(float(v))
    return str(v)


class _CanvasNumerado(Canvas):
    """Canvas que conhece o total de páginas ("Página 2 de 5")."""

    def __init__(self, *a, **kw):
        super().__init__(*a, **kw)
        self._paginas = []

    def showPage(self):
        self._paginas.append(dict(self.__dict__))
        self._startPage()

    def save(self):
        total = len(self._paginas)
        for estado in self._paginas:
            self.__dict__.update(estado)
            self.setFont(FONT, 8)
            self.setFillColor(colors.HexColor("#6B7280"))
            texto = f"Página {self._pageNumber} de {total}"
            if _pers().get("rodape"):
                self.drawRightString(self._pagesize[0] - 15 * mm, 8 * mm, texto)
            else:
                self.drawCentredString(self._pagesize[0] / 2, 8 * mm, texto)
            super().showPage()
        super().save()


def _estilos():
    ss = getSampleStyleSheet()
    title = ParagraphStyle(
        "GovFrotaTitle", parent=ss["Title"], fontName=FONT, fontSize=16,
        textColor=colors.HexColor("#1D4ED8"), alignment=TA_LEFT, spaceAfter=2,
    )
    subtitle = ParagraphStyle(
        "GovFrotaSub", parent=ss["Normal"], fontName=FONT, fontSize=9,
        textColor=colors.HexColor("#4B5563"), alignment=TA_LEFT, spaceAfter=1,
    )
    meta = ParagraphStyle(
        "GovFrotaMeta", parent=ss["Normal"], fontName=FONT, fontSize=8,
        textColor=colors.HexColor("#6B7280"), alignment=TA_LEFT,
    )
    table_cell = ParagraphStyle(
        "Cell", parent=ss["Normal"], fontName=FONT, fontSize=8, leading=10,
    )
    table_cell_center = ParagraphStyle(
        "CellC", parent=table_cell, alignment=TA_CENTER,
    )
    table_cell_right = ParagraphStyle(
        "CellR", parent=table_cell, alignment=TA_RIGHT,
    )
    header_cell = ParagraphStyle(
        "HCell", parent=ss["Normal"], fontSize=8.5, leading=11,
        textColor=colors.white, fontName="Helvetica-Bold", alignment=TA_CENTER,
    )
    section = ParagraphStyle(
        "Section", parent=ss["Normal"], fontName="Helvetica-Bold", fontSize=11,
        textColor=colors.HexColor("#111827"), spaceBefore=8, spaceAfter=4, keepWithNext=1,
    )
    return title, subtitle, meta, table_cell, table_cell_center, table_cell_right, header_cell, section


def _paginas(canvas, doc, meta, usuario):
    canvas.saveState()
    pers = _pers()
    largura, altura = doc.pagesize
    # Faixa no topo: azul-escuro → cor primária → cor secundária.
    caminho = canvas.beginPath()
    caminho.roundRect(15 * mm, altura - 9 * mm, largura - 30 * mm, 1.6 * mm, 0.8 * mm)
    canvas.clipPath(caminho, stroke=0, fill=0)
    canvas.linearGradient(
        15 * mm, 0, largura - 15 * mm, 0,
        (colors.HexColor("#0F172A"), colors.HexColor(pers.get("cor_primaria") or COR_PRIMARIA),
         colors.HexColor(pers.get("cor_secundaria") or COR_SECUNDARIA)),
        (0, 0.5, 1), extend=False,
    )
    canvas.restoreState()
    canvas.saveState()
    # Rodapé: texto do órgão, emissão e usuário gerador (a paginação "x de y" vem do _CanvasNumerado)
    canvas.setStrokeColor(colors.HexColor("#D1D5DB"))
    canvas.line(15 * mm, 15.5 * mm, largura - 15 * mm, 15.5 * mm)
    canvas.setFont(FONT, 8)
    canvas.setFillColor(colors.HexColor("#6B7280"))
    emissao = f"Emitido em {meta.gerado_em.strftime('%d/%m/%Y %H:%M')} por {usuario}"
    rodape = pers.get("rodape")
    if rodape:
        canvas.drawCentredString(largura / 2, 12 * mm, rodape[:160])
        canvas.drawString(15 * mm, 8 * mm, emissao)
    else:
        canvas.drawString(15 * mm, 12 * mm, f"GovFrota · {meta.organizacao}")
        canvas.drawRightString(largura - 15 * mm, 12 * mm, emissao)
    canvas.restoreState()


def build_pdf(
    meta: RelatorioMeta,
    headers: list[str],
    rows: list[list],
    *,
    usuario: str = "-",
    currency_columns: set[int] | None = None,
    sections: list[tuple[str, list[str], list[list]]] | None = None,
    totais: list | None = None,
    paisagem: bool = False,
    resumo: list[tuple[str, str]] | None = None,
    grupos: list[tuple[str, list[list], list]] | None = None,
    resumo_grupos: tuple[list[str], list[list], set[int]] | None = None,
    assinaturas: list[str] | None = None,
    larguras: list[float] | None = None,
) -> bytes:
    """Gera um PDF A4 com cabeçalho/rodapé e tabelas pagináveis.

    Opcionais do relatório oficial: `paisagem`, `resumo` (cartões de totais),
    `resumo_grupos` (tabela de subtotais), `grupos` (título, linhas, subtotal
    — uma tabela por grupo), `assinaturas` (linhas de assinatura no fim) e
    `larguras` (proporção de cada coluna). Em `sections`, um item com
    cabeçalho None é um bloco livre de flowables.
    """
    title, subtitle, meta_style, tcell, tcell_c, tcell_r, hcell, section_style = _estilos()
    pagina = landscape(A4) if paisagem else A4
    util = pagina[0] - 30 * mm

    buf = io.BytesIO()
    doc = SimpleDocTemplate(
        buf,
        pagesize=pagina,
        leftMargin=15 * mm,
        rightMargin=15 * mm,
        topMargin=15 * mm,
        bottomMargin=18 * mm,
        title=meta.titulo,
        author="GovFrota",
    )

    pers = _pers()
    cor1 = colors.HexColor(pers.get("cor_primaria") or COR_PRIMARIA)
    title.textColor = cor1
    story = []
    from xml.sax.saxutils import escape as _esc

    centro = ParagraphStyle("CabC", parent=subtitle, alignment=TA_CENTER)
    org_titulo = ParagraphStyle("CabT", parent=title, fontName="Helvetica-Bold", fontSize=15, leading=18,
                                textColor=colors.HexColor("#0F172A"), alignment=TA_CENTER, spaceAfter=1)
    org_sub = ParagraphStyle("CabS", parent=centro, fontName="Helvetica-Bold", fontSize=8.5, leading=11,
                             textColor=colors.HexColor("#475569"))
    logo_bytes = pers.get("logo") or meta.logo
    if logo_bytes:
        try:
            img = Image(io.BytesIO(logo_bytes), width=24 * mm, height=22 * mm, kind="proportional")
            img.hAlign = "CENTER"
            story += [img, Spacer(1, 3)]
        except Exception:  # logo inválido não impede o relatório
            pass
    story.append(Paragraph(_esc(pers.get("titulo") or meta.organizacao.upper()), org_titulo))
    sub = pers.get("subtitulo") if pers.get("titulo") else (pers.get("subtitulo") or "GovFrota · Gestão de Frotas")
    if sub:
        story.append(Paragraph(_esc(sub).upper(), org_sub))
    extra = pers.get("linha_extra") or (f"CNPJ {meta.cnpj}" if meta.cnpj else None)
    if extra:
        story.append(Paragraph(_esc(extra), centro))
    linha = Table([[""]], colWidths=[util], rowHeights=[1])
    linha.setStyle(TableStyle([("LINEBELOW", (0, 0), (-1, -1), 0.5, colors.HexColor("#E2E8F0"))]))
    story += [Spacer(1, 4), linha, Spacer(1, 6)]
    story.append(Paragraph(meta.titulo, title))
    story.append(Paragraph(f"Período: {meta.periodo}", meta_style))
    if meta.filtros:
        story.append(Paragraph(f"Filtros: {'; '.join(meta.filtros)}", meta_style))
    story.append(Paragraph(
        f"Gerado em: {meta.gerado_em.strftime('%d/%m/%Y %H:%M:%S')}",
        meta_style,
    ))
    story.append(Spacer(1, 6))

    def _col_style(i, value):
        if currency_columns and i in currency_columns:
            return tcell_r
        return tcell_c if isinstance(value, (int, float)) else tcell

    def _txt(i, v, moedas=None):
        from xml.sax.saxutils import escape

        m = moedas if moedas is not None else (currency_columns or set())
        return escape(formatar_celula(v, i in m)) if v not in (None, "") or i in m else ""

    def _render_table(hdrs, rws, ttls=None, moedas=None, props=None):
        estilo = lambda i, v: tcell_r if i in (moedas if moedas is not None else (currency_columns or set())) else _col_style(i, v)  # noqa: E731
        styled_hdr = [Paragraph(f"<b>{h}</b>", hcell) for h in hdrs]
        styled_rows = [
            [Paragraph(_txt(i, v, moedas), estilo(i, v)) for i, v in enumerate(row)]
            for row in rws
        ]
        data = [styled_hdr] + styled_rows
        if ttls:
            data.append([Paragraph(f"<b>{_txt(i, v, moedas)}</b>", estilo(i, v)) for i, v in enumerate(ttls)])
        if props and len(props) == len(hdrs):
            col_widths = [util * p / sum(props) for p in props]
        else:
            col_widths = [max(28 * mm, util / len(hdrs))] * len(hdrs)
            total_w = sum(col_widths)
            if total_w > util:
                scale = util / total_w
                col_widths = [w * scale for w in col_widths]
        table = Table(data, colWidths=col_widths, repeatRows=1)
        style = [
            ("BACKGROUND", (0, 0), (-1, 0), cor1),
            ("GRID", (0, 0), (-1, -1), 0.4, colors.HexColor("#D1D5DB")),
            ("ROWBACKGROUNDS", (0, 1), (-1, -1), [colors.white, colors.HexColor("#F3F4F6")]),
            ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
            ("TOPPADDING", (0, 0), (-1, -1), 3),
            ("BOTTOMPADDING", (0, 0), (-1, -1), 3),
        ]
        if ttls:
            style += [("BACKGROUND", (0, -1), (-1, -1), colors.HexColor("#E5EEFF"))]
        table.setStyle(TableStyle(style))
        return table

    if resumo:
        cel = ParagraphStyle("Res", parent=tcell, fontSize=7.5, textColor=colors.HexColor("#6B7280"))
        val = ParagraphStyle("ResV", parent=tcell, fontName="Helvetica-Bold", fontSize=11, leading=14)
        t = Table([[[Paragraph(k, cel), Paragraph(v, val)] for k, v in resumo]], colWidths=[util / len(resumo)] * len(resumo))
        t.setStyle(TableStyle([
            ("BOX", (0, 0), (-1, -1), 0.4, colors.HexColor("#D1D5DB")),
            ("INNERGRID", (0, 0), (-1, -1), 0.4, colors.HexColor("#D1D5DB")),
            ("BACKGROUND", (0, 0), (-1, -1), colors.HexColor("#F9FAFB")),
            ("TOPPADDING", (0, 0), (-1, -1), 4), ("BOTTOMPADDING", (0, 0), (-1, -1), 5),
        ]))
        story.append(t)
        story.append(Spacer(1, 8))

    if resumo_grupos:
        hdrs, rws, moedas = resumo_grupos
        story.append(Paragraph("Resumo", section_style))
        story.append(_render_table(hdrs, rws, moedas=moedas))
        story.append(Spacer(1, 8))

    if sections:
        for nome, hdrs, rws in sections:
            if hdrs is None:  # bloco livre: `rws` já são flowables (texto, gráfico, quebra de página)
                if nome:
                    story.append(Paragraph(nome, section_style))
                story.extend(rws)
                continue
            story.append(Paragraph(nome, section_style))
            story.append(_render_table(hdrs, rws))
            story.append(Spacer(1, 6))
    elif grupos:
        story.append(Paragraph("Detalhamento", section_style))
        for nome, rws, subtotal in grupos:
            story.append(Paragraph(nome, ParagraphStyle("Grp", parent=section_style, fontSize=9.5, spaceBefore=6)))
            story.append(_render_table(headers, rws, subtotal, props=larguras))
        if totais:
            story.append(Spacer(1, 4))
            story.append(_render_table(headers, [], totais, props=larguras))
    else:
        story.append(_render_table(headers, rows, totais, props=larguras))

    if assinaturas:
        linha = ParagraphStyle("Ass", parent=tcell_c, fontSize=8.5, leading=11)
        celulas = [[Paragraph("_" * 42, linha), Paragraph(nome, linha)] for nome in assinaturas]
        t = Table([celulas], colWidths=[util / len(assinaturas)] * len(assinaturas))
        t.setStyle(TableStyle([("VALIGN", (0, 0), (-1, -1), "BOTTOM"), ("TOPPADDING", (0, 0), (-1, -1), 28)]))
        story.append(KeepTogether([Spacer(1, 16), t]))

    doc.build(story, onFirstPage=lambda c, d: _paginas(c, d, meta, usuario),
              onLaterPages=lambda c, d: _paginas(c, d, meta, usuario), canvasmaker=_CanvasNumerado)
    return buf.getvalue()


# ─────────────────── Consultas comuns de relatório ─────────────────────────


async def get_organizacao_nome(db: AsyncSession, organization_id) -> str:
    from sqlalchemy import select

    from app.models.auth_models import Organization

    await carregar_personalizacao(db, organization_id)
    org = await db.get(Organization, organization_id)
    return org.name if org else "Organização"


async def get_organizacao_meta(db: AsyncSession, organization_id) -> tuple[str, str | None, bytes | None]:
    """(nome, CNPJ, brasão) do órgão para o cabeçalho oficial.

    O brasão vem de `logo_url` (sincronizado pela plataforma). Só HTTPS, até
    2 MB e 3 s: se falhar, o relatório sai sem ele.
    """
    from app.models.auth_models import Organization

    pers = await carregar_personalizacao(db, organization_id)
    org = await db.get(Organization, organization_id)
    if org is None:
        return "Organização", None, None
    if pers.get("logo"):  # logo próprio do relatório dispensa buscar o brasão
        return org.name, org.cnpj, pers["logo"]
    logo = None
    if org.logo_url and org.logo_url.startswith("https://"):
        try:
            import httpx

            async with httpx.AsyncClient(timeout=3, follow_redirects=False) as cli:
                r = await cli.get(org.logo_url)
            if r.status_code == 200 and len(r.content) <= 2 * 1024 * 1024 and r.headers.get("content-type", "").startswith("image/"):
                logo = r.content
        except Exception:
            logo = None
    return org.name, org.cnpj, logo
