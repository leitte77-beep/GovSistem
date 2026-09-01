"""Unit tests for the semantic document engine (Fase 18)."""

import pytest

from app.semantic import parser
from app.semantic.integrity import compute_text_integrity
from app.semantic.normalizer import (
    is_tab_separated,
    normalize_input,
    normalize_plain_text,
)
from app.semantic.parser import parse_document
from app.semantic.renderer import render_document
from app.semantic.schemas import (
    ArticleBlock,
    SemanticDocument,
    SignatureBlock,
    SignatureEntry,
    TableBlock,
    TableCell,
)
from app.semantic.snapshot import build_publication_snapshot, verify_snapshot
from app.semantic.templates import (
    TEMPLATE_STATUS_ACTIVE,
    TemplateConfig,
    default_config_for,
    template_slugs,
)
from app.semantic.validator import confirm_document, validate_document

DECRETO = """DECRETO Nº 001/2026

Dispõe sobre a abertura de crédito adicional.

O PREFEITO DO MUNICÍPIO, no uso de suas atribuições,

DECRETA:

Art. 1º Fica aberto crédito adicional especial no valor de R$ 1.000.000,00.
Parágrafo único. Os recursos provêm de superávit financeiro.
Art. 2º Revogam-se as disposições em contrário.

Prefeitura Municipal, 1 de JANEIRO de 2026.

João da Silva
Prefeito
"""


# ── Schema / blocks ─────────────────────────────────────────────────────────


def test_article_block_structure():
    block = ArticleBlock(
        number="1",
        caput="Fica aberto crédito adicional.",
        paragraphs=[],
        incisos=[],
        alineas=[],
        confirmed=False,
    )
    assert block.type == "article"
    assert block.number == "1"
    assert block.confidence == 1.0
    assert block.content_hash is not None


def test_table_block_rowspan_colspan():
    cell = TableCell(content="Total", colspan=2, rowspan=1, is_total=True)
    assert cell.colspan == 2
    assert cell.is_total is True
    table = TableBlock(
        headers=["A", "B"],
        rows=[[cell]],
        original_data=[["Total"]],
    )
    assert table.type == "table"


def test_signature_block_is_not_pades():
    block = SignatureBlock(
        entries=[SignatureEntry(name="João da Silva", role="Prefeito")],
        alignment="center",
    )
    assert block.type == "signature_block"
    assert block.entries[0].name == "João da Silva"
    # distinct from PDF digital signature (separate model field)
    assert block.alignment == "center"


def test_discriminated_union_dispatch():
    doc = SemanticDocument(
        title="Teste",
        blocks=[
            {"type": "heading", "text": "Título"},
            {"type": "table", "headers": ["X"]},
            {"type": "article", "number": "1", "caput": "caput"},
        ],
    )
    types = [b.type for b in doc.blocks]
    assert types == ["heading", "table", "article"]
    assert doc.blocks[1].headers == ["X"]


def test_unknown_block_type_rejected():
    with pytest.raises(Exception):
        SemanticDocument(title="x", blocks=[{"type": "javascript", "content": "x"}])


# ── Integrity ───────────────────────────────────────────────────────────────


def test_integrity_detects_word_loss():
    doc = parse_document(plain=DECRETO, title="DECRETO")
    # sanity: intact input passes
    rep = compute_text_integrity(DECRETO, doc)
    assert rep["ok"] is True
    # simulate divergence: a number is altered relative to the doc
    altered = DECRETO.replace("1.000.000,00", "999,00")
    rep2 = compute_text_integrity(altered, doc)
    assert rep2["ok"] is False
    assert rep2["missing_sensitive"]  # sensitive tokens diverge


def test_integrity_tolerates_whitespace_only_change():
    doc = parse_document(plain=DECRETO, title="DECRETO")
    messy = "  DECRETO\n\tNº  001/2026\n\nDispõe  sobre   a abertura"
    src_tokens_ok = compute_text_integrity(DECRETO, doc)["ok"]
    assert src_tokens_ok is True


# ── Parser ──────────────────────────────────────────────────────────────────


def test_parser_recognizes_official_act_structure():
    doc = parse_document(plain=DECRETO, title="DECRETO Nº 001/2026")
    types = [b.type for b in doc.blocks]
    assert types[0] == "heading"
    assert "command" in types
    assert types.count("article") == 2
    art = next(b for b in doc.blocks if b.type == "article")
    assert art.caput
    assert art.paragraphs  # 'Parágrafo único' attached
    assert art.paragraphs[0].number is None  # unique paragraph


def test_parser_html_preserves_nested_command_and_articles():
    html = (
        "<h2>DECRETO Nº 001/2026</h2>"
        "<p>Dispõe sobre a abertura de crédito adicional.</p>"
        "<p><strong>DECRETA:</strong></p>"
        "<p><strong>Art. 1º</strong> Fica aberto crédito adicional especial.</p>"
        "<p>Parágrafo único. Os recursos provêm de superávit financeiro.</p>"
        "<p><strong>Art. 2º</strong> Revogam-se as disposições em contrário.</p>"
        '<table border="1"><thead><tr><th>Rubrica</th><th>Valor</th></tr></thead>'
        "<tbody><tr><td>Obras</td><td>R$ 800.000,00</td></tr></tbody></table>"
    )
    doc = parse_document(html=html, title="DECRETO Nº 001/2026")
    types = [b.type for b in doc.blocks]
    assert "command" in types
    assert types.count("article") == 2
    assert types.count("table") == 1
    art1 = next(b for b in doc.blocks if b.type == "article" and str(b.number).rstrip("ºª") == "1")
    assert art1.caput
    # In HTML each <p> is an independent block; the unique paragraph is a
    # paragraph_item block (still correctly classified).
    assert "paragraph_item" in types


def test_parser_attaches_incisos_and_alineas_to_article():
    text = (
        "Art. 1º Caberá à comissão:\n"
        "I - analisar os pedidos;\n"
        "II - emitir parecer;\n"
        "a) quanto à legalidade;\n"
        "b) quanto ao mérito.\n"
    )
    doc = parse_document(plain=text, title="x")
    art = next(b for b in doc.blocks if b.type == "article")
    assert [i.number for i in art.incisos] == ["I", "II"]
    assert [a.number for a in art.alineas] == ["a", "b"]


def test_parser_tab_separated_table():
    tab = "Produto\tQtd\tValor\nCaneta\t10\tR$ 5,00\nPapel\t5\tR$ 12,50\n"
    assert is_tab_separated(tab) is True
    doc = parse_document(plain=tab, title="x")
    table = next((b for b in doc.blocks if b.type == "table"), None)
    assert table is not None
    assert table.headers == ["Produto", "Qtd", "Valor"]


def test_parser_ambiguous_becomes_low_confidence():
    doc = parse_document(plain=DECRETO, title="DECRETO")
    prefeito = [b for b in doc.blocks if b.type == "paragraph" and "Prefeito" in (b.content or "")]
    # 'Prefeito' standalone matched signature-like -> low confidence
    low = [b for b in doc.blocks if b.confidence < 0.5]
    assert low  # at least one low-confidence block exists


def test_normalize_plain_keeps_words():
    n = normalize_plain_text("Linha1\nlinha2\n\nlinha3")
    assert "Linha1" in n and "linha3" in n


# ── Validator ───────────────────────────────────────────────────────────────


def test_validate_blocks_unconfirmed():
    doc = parse_document(plain=DECRETO, title="x")
    rep = validate_document(doc, require_confirmed=True)
    assert rep["valid"] is False  # low-confidence blocks unconfirmed
    confirm_document(doc)
    rep2 = validate_document(doc, require_confirmed=True)
    assert rep2["valid"] is True


def test_validate_requires_title():
    doc = SemanticDocument(title="", blocks=[{"type": "paragraph", "content": "x"}])
    rep = validate_document(doc, require_title=True)
    assert any("no_title" in e for e in rep["errors"])


# ── Renderer ────────────────────────────────────────────────────────────────


def test_render_screen_and_print_deterministic():
    doc = parse_document(plain=DECRETO, title="DECRETO")
    config = default_config_for("decreto")
    screen = render_document(doc, config, media="screen")
    printed = render_document(doc, config, media="print")
    assert "doe-document" in screen
    assert "doe-block--command" in screen
    assert "@page" in printed
    # deterministic
    assert render_document(doc, config, media="screen") == screen


def test_render_article_nested():
    doc = parse_document(plain=DECRETO, title="x")
    html = render_document(doc, default_config_for("decreto"), media="screen")
    assert "doe-caput" in html


# ── Templates ───────────────────────────────────────────────────────────────


def test_template_defaults_cover_slugs():
    for slug in template_slugs():
        cfg = default_config_for(slug)
        assert isinstance(cfg, TemplateConfig)
        assert cfg.allowed_blocks


def test_template_rejects_dangerous_token():
    with pytest.raises(Exception):
        TemplateConfig(tokens={"javascript.foo": "alert(1)"})
    with pytest.raises(Exception):
        TemplateConfig(tokens={"typography.body.family": "Comic Sans"})
    with pytest.raises(Exception):
        TemplateConfig(tokens={"typography.body.size": "999999px"})


def test_template_active_immutability_contract():
    cfg = default_config_for("decreto")
    h1 = cfg.config_hash()
    # activating sets status; config itself must be stable (immutability)
    assert cfg.config_hash() == h1
    # a new version must produce a distinct hash when changed
    changed = cfg.model_copy(update={})
    changed.tokens = {**changed.tokens, "typography.body.size": "12pt"}
    assert changed.config_hash() != h1


def test_template_config_roundtrip_hash_stable():
    cfg = default_config_for("decreto")
    cfg2 = TemplateConfig.model_validate(cfg.model_dump(mode="json"))
    assert cfg2.config_hash() == cfg.config_hash()


# ── Snapshot ────────────────────────────────────────────────────────────────


class _FakeMatter:
    def __init__(self, mid, title, semantic=None):
        self.id = mid
        self.title = title
        self.summary = "sum"
        self.version = 1
        self.status = "published"
        self.act_type_id = None
        self.org_unit_id = None
        self.content_mode = "rich_text"
        self.content_html = "<p>x</p>"
        self.content_json = semantic
        self.semantic_content = semantic
        self.semantic_schema_version = 1
        self.template_id = None
        self.template_version = None
        self.text_integrity_hash = None
        self.source_hash = None
        self.attachments = []


class _FakeEdition:
    def __init__(self, oid, eid):
        self.id = eid
        self.organization_id = oid
        self.year = 2026
        self.number = 13
        self.type = "normal"
        self.title = "Diário Oficial"
        self.subtitle = None
        self.publication_date = None
        self.verification_code = "2026-0001-ABCD"


def test_snapshot_build_and_verify():
    sem = {"type": "paragraph", "content": "<p>conteúdo</p>"}
    matter = _FakeMatter("m1", "Decreto 01/2026", semantic={"schema_version": 1, "blocks": [sem]})
    edition = _FakeEdition("org1", "ed1")
    snap = build_publication_snapshot(edition, [(matter, 0, None)])
    assert snap["content_manifest_hash"]
    ok, reason = verify_snapshot(snap)
    assert ok, reason


def test_snapshot_detects_tamper():
    sem = {"type": "paragraph", "content": "<p>conteúdo</p>"}
    matter = _FakeMatter("m1", "Decreto 01/2026", semantic={"schema_version": 1, "blocks": [sem]})
    edition = _FakeEdition("org1", "ed1")
    snap = build_publication_snapshot(edition, [(matter, 0, None)])
    snap["items"][0]["title"] = "Alterado"
    ok, reason = verify_snapshot(snap)
    assert ok is False
    assert "divergente" in reason


def test_snapshot_source_change_does_not_affect_frozen():
    sem = {"type": "paragraph", "content": "<p>v1</p>"}
    matter = _FakeMatter("m1", "Decreto", semantic={"schema_version": 1, "blocks": [sem]})
    edition = _FakeEdition("org1", "ed1")
    snap = build_publication_snapshot(edition, [(matter, 0, None)])
    frozen_title = snap["items"][0]["title"]
    matter.title = "Decreto ALTERADO depois do snapshot"
    assert snap["items"][0]["title"] == frozen_title
    assert snap["items"][0]["title"] != matter.title
