"""Tests for PDF generation template and logic."""

from pathlib import Path

import pytest
from jinja2 import Environment, FileSystemLoader

TEMPLATE_DIR = Path(__file__).parent.parent / "app" / "templates" / "pdf"


@pytest.fixture
def template_env():
    return Environment(loader=FileSystemLoader(str(TEMPLATE_DIR)))


class TestTemplateRendering:
    def test_template_exists(self):
        assert (TEMPLATE_DIR / "edition.html").exists()
        assert (TEMPLATE_DIR / "edition.css").exists()

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
            css_path=str(TEMPLATE_DIR / "edition.css"),
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

    def test_template_with_landscape_content(self, template_env):
        template = template_env.get_template("edition.html")
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
            css_path=str(TEMPLATE_DIR / "edition.css"),
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
        assert "landscape-content" in html
        assert "Relatório" in html
        assert "XY99ZZ00" in html
        assert "Extra" in html

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
            css_path=str(TEMPLATE_DIR / "edition.css"),
            sections=[],
        )
        assert "EMPTY01" in html
        assert "Verifique" in html

    def test_detect_landscape_heuristic(self):
        from app.services.pdf_utils import detect_landscape
        assert detect_landscape("<table><tr>" + "<td>X</td>" * 9 + "</tr></table>")
        assert detect_landscape('<table landscape><tr><td>A</td></tr></table>')
        assert not detect_landscape("<table><tr><td>A</td><td>B</td></tr></table>")
        assert not detect_landscape("<p>No table</p>")

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
