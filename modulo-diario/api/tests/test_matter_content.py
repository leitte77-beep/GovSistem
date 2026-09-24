"""Content pipeline unit tests: content_json, content_mode and the
rich-text vs ready-PDF distinction (Fases 2 and 7)."""

import uuid

import pytest
from pydantic import ValidationError

from app.schemas.matter import MatterCreate, MatterResponse
from app.models.enums import MatterStatus


class TestMatterCreateContentMode:
    def test_defaults_to_rich_text(self):
        body = MatterCreate(
            title="PORTARIA – 01",
            act_type_id=uuid.uuid4(),
            content_html="<p>Conteúdo</p>",
        )
        assert body.content_mode == "rich_text"

    def test_accepts_pdf_mode_and_content_json(self):
        body = MatterCreate(
            title="EDITAL – 02",
            act_type_id=uuid.uuid4(),
            content_html="<img src=\"/api/v1/matter-content/x/page_1.png\">",
            content_json=None,
            content_mode="pdf",
        )
        assert body.content_mode == "pdf"

    def test_content_json_is_preserved(self):
        json_doc = {
            "type": "doc",
            "content": [
                {"type": "paragraph", "attrs": {"textAlign": "center"}, "content": [{"type": "text", "text": "DECRETA:", "marks": [{"type": "bold"}]}]}
            ],
        }
        body = MatterCreate(
            title="LEI – 03",
            act_type_id=uuid.uuid4(),
            content_html="<p>DECRETA:</p>",
            content_json=json_doc,
        )
        assert body.content_json == json_doc

    def test_requires_title(self):
        with pytest.raises(ValidationError):
            MatterCreate(title="   ", act_type_id=uuid.uuid4(), content_html="<p>x</p>")


class TestMatterResponseContentMode:
    def test_has_content_mode_field(self):
        fields = MatterResponse.model_fields
        assert "content_mode" in fields
        assert "content_json" in fields

    def test_response_serializes_status(self):
        from app.schemas.matter import MatterResponse as MR

        # content_mode must be a plain string for JSON round-trip.
        assert MR.model_fields["content_mode"].annotation in (str,)
