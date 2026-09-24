"""Golden test — Portaria nº 220/2026 (Município de Farol).

The raw text below is pasted as plain text (no formatting, no Word markup).
The engine must recognise the legal structure without rewriting a single
character, and the same canonical document must feed both the public HTML and
the PDF renderer.

This test is intentionally permanent: it is the regression guard for the
autodiagramação requirement.
"""

from app.semantic.integrity import compute_text_integrity
from app.semantic.parser import parse_document
from app.semantic.renderer import render_document
from app.semantic.templates import default_config_for

PORTARIA_220 = """PORTARIA Nº 220/2026

SÚMULA: EXONERA A SERVIDORA ISABELE DIAS DUTRA.

OCLÉCIO DE FREITAS MENESES, PREFEITO DO MUNICIPIO DE FAROL, NO USO DE SUAS ATRIBUIÇÕES E EM CONFORMIDADE COM O ART. 55, I C/C ART. 61, INCISO II, ALÍNEA "A", DA LEI ORGÂNICA DO MUNICÍPIO E DA LEI COMPLEMENTAR MUNICIPAL 049/2022;

Considerando o requerimento sob o protocolo nº 249;

RESOLVE:

I - Exonerar, a pedido, a servidora ISABELE DIAS DUTRA, do cargo de provimento efetivo de Auxiliar de Serviços Gerais;

II - Esta Portaria entra em vigor na data de sua publicação;

III - Registre-se e Publique-se.

Paço Municipal "José Semiguem"

Farol, 01 de setembro de 2026.

OCLÉCIO DE FREITAS MENESES

Prefeito Municipal"""


def _doc():
    return parse_document(
        plain=PORTARIA_220,
        title="PORTARIA Nº 220/2026",
        document_type="portaria",
    )


def test_summary_label_preserved_exactly():
    doc = _doc()
    # The original 'SÚMULA:' heading must survive — never rewritten to 'Súmula:'.
    assert doc.summary_label == "SÚMULA"
    assert doc.summary == "EXONERA A SERVIDORA ISABELE DIAS DUTRA."


def test_act_title_is_not_duplicated_in_body():
    doc = _doc()
    # The structured title field is the single source of truth: a header pasted
    # inside the body must be removed, never rendered twice.
    assert not any(
        b.type == "heading" and "PORTARIA Nº 220/2026" in (b.text or "")
        for b in doc.blocks
    )
    html = render_document(doc, default_config_for("portaria"), media="print")
    assert html.count("PORTARIA Nº 220/2026") == 1


def test_preamble_recognised():
    doc = _doc()
    preambles = [b for b in doc.blocks if b.type == "preamble"]
    assert preambles
    assert "NO USO DE SUAS ATRIBUIÇÕES" in preambles[0].content.upper()


def test_considerando_is_not_command():
    doc = _doc()
    considerandos = [b for b in doc.blocks if b.type == "considerando"]
    commands = [b for b in doc.blocks if b.type == "command"]
    assert considerandos
    assert "considerando o requerimento" in considerandos[0].content.lower()
    # The enacting formula is RESOLVE, not CONSIDERANDO.
    assert any("RESOLVE" in (b.text or "").upper() for b in commands)
    assert not any("CONSIDERANDO" in (b.text or "").upper() for b in commands)


def test_incisos_i_ii_iii_recognised():
    doc = _doc()
    incisos = [b for b in doc.blocks if b.type == "inciso"]
    assert [i.number for i in incisos] == ["I", "II", "III"]
    assert "EXONERAR" in incisos[0].content.upper()
    assert "ENTRA EM VIGOR" in incisos[1].content.upper()
    assert "REGISTRE-SE" in incisos[2].content.upper()


def test_signature_block_has_name_role_and_location():
    doc = _doc()
    sig = next((b for b in doc.blocks if b.type == "signature_block"), None)
    assert sig is not None
    entry = sig.entries[0]
    assert entry.name == "OCLÉCIO DE FREITAS MENESES"
    assert entry.role == "Prefeito Municipal"
    assert "Farol" in entry.location


def test_text_integrity_has_no_legal_loss():
    doc = _doc()
    report = compute_text_integrity(PORTARIA_220, doc)
    assert report["ok"] is True
    assert report["missing_sensitive"] == []


def test_rendered_html_contains_all_legal_parts_in_order():
    doc = _doc()
    html = render_document(doc, default_config_for("portaria"), media="print")

    for token in [
        "PORTARIA Nº 220/2026",
        "SÚMULA",
        "EXONERA A SERVIDORA ISABELE DIAS DUTRA",
        "NO USO DE SUAS ATRIBUIÇÕES",
        "Considerando o requerimento",
        "RESOLVE",
        "Exonerar, a pedido",
        "entra em vigor",
        "Registre-se",
        "OCLÉCIO DE FREITAS MENESES",
        "Prefeito Municipal",
        "Farol, 01 de setembro de 2026",
    ]:
        assert token in html, f"missing in rendered HTML: {token}"

    # Order: summary before preamble before RESOLVE before the signature block.
    # The authority name also appears in the preamble, so use the *last*
    # occurrence (the signature) for the final ordering check.
    assert html.index("SÚMULA") < html.index("NO USO DE SUAS ATRIBUIÇÕES")
    assert html.index("RESOLVE") < html.rindex("OCLÉCIO DE FREITAS MENESES")


def test_public_html_has_no_internal_hash_noise():
    doc = _doc()
    html = render_document(doc, default_config_for("portaria"), media="screen")
    assert "doe-integrity" not in html
    assert "Hash de integridade" not in html


def test_edition_pdf_uses_semantic_source_not_legacy_html():
    """The edition PDF must derive from the canonical semantic document.

    A frozen snapshot can carry both ``semantic`` and a legacy
    ``content_html``; the PDF generator must prefer the semantic document so
    the signed PDF and the public HTML can never diverge.
    """
    from app.services.edition_pdf import _render_semantic_content

    doc = _doc()
    item = {
        "semantic": doc.model_dump(mode="json"),
        "content_html": "<p>CONTEUDO LEGADO DIVERGENTE</p>",
    }
    html = _render_semantic_content(item)
    assert html is not None
    assert "EXONERA A SERVIDORA ISABELE DIAS DUTRA" in html
    assert "CONTEUDO LEGADO DIVERGENTE" not in html
    assert "doe-integrity" not in html
    # The embedded fragment must carry the .doe-* styles (so the semantic
    # markup keeps its editorial formatting) but must NOT redefine @page
    # (the edition template owns the page geometry).
    assert "<style>" in html
    assert ".doe-block--heading" in html
    assert "@page" not in html


def test_edition_pdf_falls_back_to_legacy_html_without_semantic():
    from app.services.edition_pdf import _render_semantic_content

    assert _render_semantic_content({"content_html": "<p>x</p>"}) is None
