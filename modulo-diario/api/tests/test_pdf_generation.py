"""Tests for PDF generation template and logic."""

import base64
import io
from pathlib import Path

import pytest
from jinja2 import Environment, FileSystemLoader
from pypdf import PdfReader

TEMPLATE_DIR = Path(__file__).parent.parent / "app" / "templates" / "pdf"
LAYOUTS_DIR = TEMPLATE_DIR / "layouts"
LAYOUTS = ("classico", "moderno", "minimalista")


@pytest.fixture
def template_env():
    # There is a single template per layout (layouts/<name>/); "classico" is
    # the default. No template lives directly under TEMPLATE_DIR.
    return Environment(loader=FileSystemLoader(str(LAYOUTS_DIR / "classico")))


@pytest.fixture(autouse=True)
def setup_db():
    """PDF template unit tests do not need the suite's database fixture."""
    yield


class TestTemplateRendering:
    def test_template_exists(self):
        assert (LAYOUTS_DIR / "classico" / "edition.html").exists()
        assert (LAYOUTS_DIR / "classico" / "edition.css").exists()

    def test_template_renders_basic_edition(self, template_env):
        template = template_env.get_template("edition.html")
        html = template.render(
            organ_name="Prefeitura Teste",
            edition=type("obj", (object,), {
                "year": 2026, "number": 1, "title": "Edição Teste",
                "subtitle": None, "type": "normal",
                "publication_date": "2026-05-15",
            }),
            edition_type_label="Normal",
            publication_date="15 de maio de 2026",
            preliminary_code="AB12CD34",
            verification_url="http://localhost:7200/verificar",
            css_path=str(LAYOUTS_DIR / "classico" / "edition.css"),
            sections=[
                {
                    "title": "Atos do Executivo",
                    "matters": [
                        {
                            "title": "Decreto nº 1",
                            "summary": "Resumo do decreto",
                            "content_html": "<p>Conteúdo do decreto</p>",
                            "act_type": "Decreto",
                            "org_unit": "SEAD",
                            "author": "João",
                            "is_landscape": False,
                        }
                    ],
                }
            ],
        )
        assert "Prefeitura Teste" in html
        assert "Edição Teste" in html
        assert "2026" in html
        assert "1" in html
        assert "Decreto nº 1" in html
        assert "Conteúdo do decreto" in html
        assert "AB12CD34" in html
        assert "15 de maio de 2026" in html
        assert "Sumário" in html
        assert "Atos do Executivo" in html

    @pytest.mark.parametrize("layout", LAYOUTS)
    def test_semantic_matter_summary_is_rendered_only_by_its_document(self, layout):
        template_dir = LAYOUTS_DIR / layout
        template = Environment(loader=FileSystemLoader(str(template_dir))).get_template(
            "edition.html"
        )
        html = template.render(
            organ_name="Prefeitura Teste",
            edition=type("obj", (), {"year": 2026, "number": 1, "title": "Edição", "subtitle": None, "type": "normal"}),
            edition_type_label="Normal", publication_date="14 de setembro de 2026",
            verification_code="TESTE", verification_url="http://localhost/verificar",
            qr_code_uri="", content_manifest_hash="a" * 64, total_matters=1,
            summary_items=[], sections=[{"title": None, "matters": [{
                "id": "m1", "title": "PORTARIA Nº 1/2026",
                "summary": "SÚMULA ÚNICA", "has_semantic_content": True,
                "content_html": "<p class='doe-summary'>SÚMULA ÚNICA</p>",
                "act_type": "Portaria", "org_unit": "", "author": "",
                "is_pdf_image_content": False,
            }]}],
        )
        assert html.count("SÚMULA ÚNICA") == 1

    @pytest.mark.parametrize("layout", LAYOUTS)
    def test_wide_content_never_selects_landscape_page(self, layout):
        template_dir = LAYOUTS_DIR / layout
        template = Environment(loader=FileSystemLoader(str(template_dir))).get_template(
            "edition.html"
        )
        html = template.render(
            organ_name="Teste",
            edition=type("obj", (object,), {
                "year": 2026, "number": 2, "title": "Edição",
                "subtitle": None, "type": "extra",
                "publication_date": "2026-01-01",
            }),
            edition_type_label="Extra",
            publication_date="1 de janeiro de 2026",
            preliminary_code="XY99ZZ00",
            verification_url="http://localhost:7200/verificar",
            css_path=str(template_dir / "edition.css"),
            verification_code="XY99ZZ00",
            qr_code_uri="data:image/png;base64,iVBORw0KGgo=",
            content_manifest_hash="a" * 64,
            total_pages="2",
            total_matters=1,
            sections=[
                {
                    "title": "Contábil",
                    "matters": [
                        {
                            "title": "Relatório",
                            "summary": None,
                            "content_html": "<div class='landscape'>" + "<table><tr><td>Larga</td></tr></table></div>",  # noqa: E501
                            "act_type": "Relatório Contábil",
                            "org_unit": "",
                            "author": "",
                            "is_landscape": True,
                        }
                    ],
                }
            ],
        )
        assert "matter-landscape" not in html
        assert "Relatório" in html
        assert "XY99ZZ00" in html
        assert "Extra" in html

    @pytest.mark.parametrize("layout", LAYOUTS)
    def test_layout_is_portrait_and_has_repeating_authenticity_seal(self, layout):
        css = (LAYOUTS_DIR / layout / "edition.css").read_text(encoding="utf-8")
        template = (LAYOUTS_DIR / layout / "edition.html").read_text(encoding="utf-8")

        assert "A4 landscape" not in css
        assert "page: landscape" not in css
        assert "position: running(authenticity-seal)" in css
        assert "element(authenticity-seal)" in css
        assert "counter(page)" in css
        assert "counter(pages)" in css
        assert 'class="page-authenticity-seal"' in template
        assert "content_manifest_hash" in template
        assert "SHA-256 do conteúdo canônico" in template
        assert "organ_name" in template
        assert "publication_date" in template

    @pytest.mark.parametrize("layout", LAYOUTS)
    def test_real_weasyprint_render_keeps_every_page_portrait_and_sealed(self, layout):
        pytest.importorskip("weasyprint")
        from weasyprint import CSS, HTML

        template_dir = LAYOUTS_DIR / layout
        template = Environment(loader=FileSystemLoader(str(template_dir))).get_template(
            "edition.html"
        )
        cells = "".join(
            f'<td style="width: 180px">coluna-{column}-conteúdo-muito-longo</td>'
            for column in range(12)
        )
        rows = "".join(f"<tr><td>{i}</td>{cells}</tr>" for i in range(45))
        svg = (
            '<svg xmlns="http://www.w3.org/2000/svg" width="2400" height="1800">'
            '<rect width="2400" height="1800" fill="#ddeeff"/>'
            '<text x="50" y="100">IMAGEM GRANDE</text></svg>'
        )
        image_uri = "data:image/svg+xml;base64," + base64.b64encode(svg.encode()).decode()
        manifest_hash = "abcdef1234567890" * 4
        html = template.render(
            organ_name="Prefeitura Teste",
            edition=type("obj", (object,), {
                "year": 2026, "number": 25, "title": "Edição Teste",
                "subtitle": None, "type": "normal",
            }),
            edition_type_label="Normal",
            publication_date="4 de setembro de 2026",
            header_date="SEXTA-FEIRA, 04 DE SETEMBRO DE 2026",
            edition_year_label="ANO: 2026",
            logo_path="",
            verification_code="VERIFY-25",
            verification_url="http://localhost:7200/verificar",
            qr_code_uri=image_uri,
            content_manifest_hash=manifest_hash,
            total_pages="",
            total_matters=1,
            summary_items=[],
            sections=[{"title": "Testes", "matters": [{
                "id": "m1", "title": "Tabela ampla", "summary": None,
                "content_html": (
                    '<table style="width: 2400px"><thead><tr>'
                    '<th colspan="13">Tabela de 13 colunas</th></tr></thead>'
                    f"<tbody>{rows}</tbody></table>"
                    f'<img src="{image_uri}" width="2400" height="1800">'
                ),
                "act_type": "Relatório", "org_unit": "", "author": "",
                "is_landscape": True, "is_pdf_image_content": False,
            }]}],
        )
        pdf = HTML(string=html, base_url=str(template_dir)).write_pdf(
            stylesheets=[CSS(filename=str(template_dir / "edition.css"))]
        )
        pages = PdfReader(io.BytesIO(pdf)).pages

        assert len(pages) > 1
        pages_with_table_header = 0
        for page_number, page in enumerate(pages, start=1):
            assert float(page.mediabox.height) > float(page.mediabox.width)
            text = page.extract_text()
            assert "VERIFY-25" in text
            assert "Prefeitura Teste" in text
            assert "Edição 25" in text
            assert "4 de setembro de 2026" in text
            assert manifest_hash in text.replace("\n", "").replace(" ", "")
            assert f"{page_number}/{len(pages)}" in text.replace(" ", "")
            if "Tabela de 13 colunas" in text:
                pages_with_table_header += 1

        # A table that spans multiple pages must repeat its <thead> on every
        # page it appears on (native `display: table-header-group` behavior),
        # not just the first — otherwise later pages are unreadable.
        assert pages_with_table_header > 1, (
            "the table header ('Tabela de 13 colunas') must repeat on every "
            "page the table spans across, not only the first"
        )

    def test_template_empty_edition(self, template_env):
        template = template_env.get_template("edition.html")
        html = template.render(
            organ_name="Teste",
            edition=type("obj", (object,), {
                "year": 2026, "number": 0, "title": "Vazia",
                "subtitle": None, "type": "normal",
                "publication_date": "2026-01-01",
            }),
            edition_type_label="Normal",
            publication_date="1 de janeiro de 2026",
            preliminary_code="EMPTY01",
            verification_url="http://localhost:7200/verificar",
            css_path=str(LAYOUTS_DIR / "classico" / "edition.css"),
            sections=[],
        )
        assert "EMPTY01" in html
        assert "Verifique" in html

    def test_format_date(self):
        from datetime import date

        from app.services.pdf_utils import format_date
        assert format_date(date(2026, 5, 15)) == "15 de maio de 2026"
        assert format_date(date(2024, 1, 1)) == "1 de janeiro de 2024"
        assert format_date(date(2023, 12, 25)) == "25 de dezembro de 2023"

    def test_summary_metadata_omits_repeated_act_type(self):
        from app.services.edition_pdf import _summary_metadata

        assert _summary_metadata("PORTARIA - 04/2026", "Portaria", "PMF", None) == "PMF"
        assert _summary_metadata("OUTROS - 01/2026", "Outros", "PMF", None) == "PMF"
        assert _summary_metadata(
            "RELATÓRIO CONTÁBIL - 01/2026",
            "Relatório Contábil",
            "PMF",
            None,
        ) == "PMF"

    def test_summary_metadata_keeps_distinct_act_type(self):
        from app.services.edition_pdf import _summary_metadata

        assert _summary_metadata("Nome da matéria", "Portaria", "PMF", None) == "Portaria • PMF"

    def test_pdf_service_does_not_route_wide_content_to_landscape(self):
        import inspect

        from app.services import edition_pdf

        source = inspect.getsource(edition_pdf.generate_edition_pdf_sync)
        assert "detect_landscape" not in source
        assert '"is_landscape"' not in source

    def test_pdf_fetcher_blocks_external_resources(self):
        from app.services.edition_pdf import _restricted_url_fetcher

        with pytest.raises(ValueError, match="External resource blocked"):
            _restricted_url_fetcher("https://example.invalid/tracker.png")

    def test_only_safe_uuid_matter_images_are_localized(self, monkeypatch, tmp_path):
        from app.services import edition_pdf

        monkeypatch.setattr(edition_pdf.settings, "UPLOAD_DIR", str(tmp_path))
        matter_id = "123e4567-e89b-42d3-a456-426614174000"
        safe = f"https://diario.test/matter-content/{matter_id}/page_1.png"
        unsafe = "https://diario.test/matter-content/../../etc/passwd/page_1.png"

        localized = edition_pdf._localize_matter_images(f'<img src="{safe}">')

        assert localized.startswith('<img src="file://')
        assert edition_pdf._localize_matter_images(f'<img src="{unsafe}">') == (
            f'<img src="{unsafe}">'
        )
