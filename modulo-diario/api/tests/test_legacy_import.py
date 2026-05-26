"""Tests for legacy collection import."""


import pytest

from app.services.legacy_importer import (
    LegacyImportItem,
    parse_filename,
    validate_items,
)


class TestFilenameParsing:
    def test_valid_pattern(self):
        result = parse_filename("2026-05-15__EDICAO.pdf")
        assert result == (2026, 5, 15)

    def test_lowercase_extension(self):
        result = parse_filename("2026-01-01__edicao.pdf")
        assert result == (2026, 1, 1)

    def test_invalid_pattern(self):
        assert parse_filename("documento.pdf") is None
        assert parse_filename("2026-13-01__EDICAO.pdf") == (2026, 13, 1)  # pattern match, invalid date ignored
        assert parse_filename("not-a-date__EDICAO.pdf") is None
        assert parse_filename("") is None

    def test_different_file_type(self):
        # Should only match .pdf
        assert parse_filename("2026-05-15__EDICAO.docx") is None


class TestLegacyImportItem:
    def test_create_item(self):
        item = LegacyImportItem("2026-05-15__EDICAO.pdf", b"fake pdf content")
        assert item.filename == "2026-05-15__EDICAO.pdf"
        assert len(item.sha256) == 64
        assert item.errors == []

    def test_hash_sha256(self):
        import hashlib
        content = b"test pdf content"
        item = LegacyImportItem("file.pdf", content)
        assert item.sha256 == hashlib.sha256(content).hexdigest()


class TestValidateItems:
    @pytest.mark.anyio
    async def test_validate_with_mock_db(self):
        from unittest.mock import AsyncMock, MagicMock
        db = AsyncMock()
        db.execute.return_value = MagicMock(
            scalar_one_or_none=MagicMock(return_value=MagicMock())
        )

        items = [
            LegacyImportItem("2026-05-15__EDICAO.pdf", b"content 1"),
            LegacyImportItem("2026-05-16__EDICAO.pdf", b"content 2"),
        ]
        import uuid
        result = await validate_items(items, uuid.uuid4(), db)
        assert result.total == 2
        assert result.success == 2
        assert len(result.errors) == 0

    @pytest.mark.anyio
    async def test_validate_invalid_names(self):
        from unittest.mock import AsyncMock, MagicMock
        db = AsyncMock()
        db.execute.return_value = MagicMock(
            scalar_one_or_none=MagicMock(return_value=MagicMock())
        )

        items = [
            LegacyImportItem("not-a-valid-filename.pdf", b"content"),
            LegacyImportItem("also-wrong.docx", b"content"),
        ]
        import uuid
        result = await validate_items(items, uuid.uuid4(), db)
        assert result.total == 2
        assert result.success == 0
        assert len(result.errors) == 2

    @pytest.mark.anyio
    async def test_validate_mixed(self):
        from unittest.mock import AsyncMock, MagicMock
        db = AsyncMock()
        db.execute.return_value = MagicMock(
            scalar_one_or_none=MagicMock(return_value=MagicMock())
        )

        items = [
            LegacyImportItem("2026-05-15__EDICAO.pdf", b"valid"),
            LegacyImportItem("bad-name.pdf", b"invalid"),
        ]
        import uuid
        result = await validate_items(items, uuid.uuid4(), db)
        assert result.total == 2
        assert result.success == 1
        assert len(result.errors) == 1


class TestImportWithFakePdfs:
    """Create 3 fake PDFs and test import flow."""

    @pytest.fixture
    def fake_pdfs(self):
        """Create 3 files simulating legacy PDFs."""
        from fpdf import FPDF
        pdfs = []
        for name in ["2024-01-10__EDICAO.pdf", "2024-06-15__EDICAO.pdf", "2025-03-20__EDICAO.pdf"]:
            pdf = FPDF()
            pdf.add_page()
            pdf.set_font("Helvetica", size=12)
            pdf.cell(0, 10, text=f"Edição {name}", new_x="LMARGIN", new_y="NEXT")
            pdfs.append((name, bytes(pdf.output())))
        return pdfs

    def test_parse_all_filenames(self, fake_pdfs):
        for name, _ in fake_pdfs:
            result = parse_filename(name)
            assert result is not None, f"Failed to parse {name}"

    def test_all_sha256(self, fake_pdfs):
        import hashlib
        for name, content in fake_pdfs:
            item = LegacyImportItem(name, content)
            assert item.sha256 == hashlib.sha256(content).hexdigest()

    @pytest.mark.anyio
    async def test_validate_three_pdfs(self, fake_pdfs):
        from unittest.mock import AsyncMock, MagicMock
        db = AsyncMock()
        db.execute.return_value = MagicMock(
            scalar_one_or_none=MagicMock(return_value=MagicMock())
        )

        items = [LegacyImportItem(n, c) for n, c in fake_pdfs]
        import uuid
        result = await validate_items(items, uuid.uuid4(), db)
        assert result.total == 3
        assert result.success == 3
        assert len(result.errors) == 0
