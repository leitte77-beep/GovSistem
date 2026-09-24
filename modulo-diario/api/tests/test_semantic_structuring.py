"""Structuring acceptance tests (Portaria nº 223/2026 scenario).

Covers the paste-HTML path (Word/rich), which previously duplicated the
structured header/summary, lost bold and left the closing (place + date) split
from/after the signature.

The structured form fields (title/summary) are the single source of truth; the
same canonical document feeds the public HTML and the PDF.
"""

from app.semantic.parser import parse_document
from app.semantic.renderer import render_document
from app.semantic.templates import default_config_for

PORTARIA_223_HTML = """
<h1>PORTARIA Nº 223/2026</h1>
<p><strong>SÚMULA: EXONERA A SERVIDORA ISABELE DIAS DUTRA.</strong></p>
<p><strong>OCLÉCIO DE FREITAS MENESES, PREFEITO DO MUNICIPIO DE FAROL, NO USO DE
SUAS ATRIBUIÇÕES E EM CONFORMIDADE COM O ART. 55, I C/C ART. 61, DA LEI
ORGÂNICA DO MUNICÍPIO;</strong></p>
<p>Considerando o requerimento sob o protocolo nº 249;</p>
<p><strong>RESOLVE:</strong></p>
<p>I - Exonerar, a pedido, a servidora <strong>ISABELE DIAS DUTRA</strong>, do
cargo de provimento efetivo de Auxiliar de Serviços Gerais;</p>
<p>II - Esta Portaria entra em vigor na data de sua publicação;</p>
<p>III - Registre-se e Publique-se.</p>
<p>Paço Municipal "José Semiguem"</p>
<p>Farol, 01 de setembro de 2026.</p>
<p><strong>OCLÉCIO DE FREITAS MENESES</strong></p>
<p>Prefeito Municipal</p>
"""

TITLE = "PORTARIA Nº 223/2026"
SUMMARY = "EXONERA A SERVIDORA ISABELE DIAS DUTRA."


def _doc():
    return parse_document(
        html=PORTARIA_223_HTML,
        title=TITLE,
        summary=SUMMARY,
        document_type="portaria",
    )


def _render(doc, media="print"):
    return render_document(doc, default_config_for("portaria"), media=media)


# ── De-duplication of structured fields ──────────────────────────────────────


def test_title_and_summary_are_not_duplicated_in_the_body():
    doc = _doc()
    types = [b.type for b in doc.blocks]
    assert "heading" not in types  # pasted header removed
    # Summary never becomes a body block.
    assert not any(
        "EXONERA A SERVIDORA ISABELE DIAS DUTRA" in (
            getattr(b, "content", "") or getattr(b, "text", "") or ""
        )
        for b in doc.blocks
        if b.type not in ("signature_block",)
    )

    html = _render(doc)
    assert html.count(TITLE) == 1
    assert html.count("EXONERA A SERVIDORA ISABELE DIAS DUTRA") == 1


def test_auto_adjustments_are_reported_not_silent():
    adjustments = {a["action"] for a in _doc().auto_adjustments}
    assert "removed_duplicate_title" in adjustments
    assert "merged_closing" in adjustments


# ── Block classification ─────────────────────────────────────────────────────


def test_incisos_are_classified_not_plain_paragraphs():
    doc = _doc()
    incisos = [b for b in doc.blocks if b.type == "inciso"]
    assert [i.number for i in incisos] == ["I", "II", "III"]
    assert "EXONERAR" in incisos[0].content.upper()
    # The renderer emits the number once (never "I – I - ...").
    html = _render(doc)
    assert "I – I -" not in html
    assert "I – Exonerar" in html


# ── Inline formatting preservation ───────────────────────────────────────────


def test_intentional_bold_is_preserved():
    doc = _doc()
    preamble = next(b for b in doc.blocks if b.type == "preamble")
    assert "<strong>" in preamble.content
    inciso = next(b for b in doc.blocks if b.type == "inciso")
    assert "ISABELE DIAS DUTRA" in inciso.content
    assert "<strong>" in inciso.content

    html = _render(doc)
    assert "<strong>OCLÉCIO DE FREITAS MENESES" in html
    assert "servidora <strong>ISABELE DIAS DUTRA</strong>" in html


# ── Closing (fecho) as an atomic unit before the signature ───────────────────


def test_closing_is_atomic_and_precedes_signature():
    doc = _doc()
    sig = next(b for b in doc.blocks if b.type == "signature_block")
    location = sig.entries[0].location
    assert 'Paço Municipal "José Semiguem"' in location
    assert "Farol, 01 de setembro de 2026" in location
    # The place and its date stay together, as a single unit.
    assert location.index("Paço Municipal") < location.index("Farol, 01 de setembro")

    html = _render(doc)
    assert html.index("Paço Municipal") < html.index("Farol, 01 de setembro")
    assert html.index("Farol, 01 de setembro") < html.index(
        "doe-sign-name"
    )


# ── Page geometry / alignment ────────────────────────────────────────────────


def test_alignment_is_fixed_per_block_type():
    html = _render(_doc())
    # Heading, summary, command, closing (fecho) and signature are centered.
    assert ".doe-block--heading" in html and "var(--doe-title-alignment, center)" in html
    assert ".doe-summary" in html and "var(--doe-blocks-summary-alignment, center)" in html
    assert "var(--doe-blocks-command-alignment, center)" in html
    assert ".doe-signature" in html
    # Body text is justified.
    assert "var(--doe-blocks-preamble-alignment, justify)" in html
    assert ".doe-block--inciso p" in html and "text-align: justify" in html


# ── Single source for public HTML and PDF ────────────────────────────────────


def test_public_html_and_pdf_share_content_and_order():
    doc = _doc()
    screen = _render(doc, media="screen")
    print_html = _render(doc, media="print")

    for token in [
        TITLE,
        "EXONERA A SERVIDORA ISABELE DIAS DUTRA",
        "Considerando o requerimento",
        "RESOLVE:",
        "Paço Municipal",
        "Farol, 01 de setembro de 2026",
        "OCLÉCIO DE FREITAS MENESES",
        "Prefeito Municipal",
    ]:
        assert token in screen, f"missing in public HTML: {token}"
        assert token in print_html, f"missing in PDF HTML: {token}"

    # Same order in both outputs.
    def _order(html: str):
        return [
            html.index(TITLE),
            html.index("RESOLVE:"),
            html.index("Paço Municipal"),
            html.index("doe-sign-name"),
        ]

    assert _order(screen) == _order(print_html)


def test_edition_pdf_render_uses_same_semantic_document():
    from app.services.edition_pdf import _render_semantic_content

    item = {
        "semantic": _doc().model_dump(mode="json"),
        "content_html": "<p>CONTEUDO LEGADO DIVERGENTE</p>",
    }
    html = _render_semantic_content(item)
    assert html is not None
    assert "CONTEUDO LEGADO DIVERGENTE" not in html
    # O título é impresso pelo template da edição (<h2 class="matter-title">);
    # o fragmento semântico não pode repeti-lo.
    assert html.count(TITLE) == 0
    assert html.index("Paço Municipal") < html.index("doe-sign-name")
