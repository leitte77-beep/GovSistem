import hashlib
from datetime import datetime, timezone

import pytest

from app.services.reconciliation import ReconciliationService


class TestReconciliation:
    def test_compute_line_hash_consistent(self):
        class MockLine:
            transaction_date = datetime(2024, 1, 15, tzinfo=timezone.utc)
            amount_cents = 10000
            description = "Test"
            bank_identifier = "fit123"

        h1 = ReconciliationService.compute_line_hash(MockLine())
        h2 = ReconciliationService.compute_line_hash(MockLine())
        assert h1 == h2

    def test_compute_line_hash_different(self):
        class MockLine1:
            transaction_date = datetime(2024, 1, 15, tzinfo=timezone.utc)
            amount_cents = 10000
            description = "Test A"
            bank_identifier = "fit123"

        class MockLine2:
            transaction_date = datetime(2024, 1, 15, tzinfo=timezone.utc)
            amount_cents = 20000
            description = "Test B"
            bank_identifier = "fit456"

        h1 = ReconciliationService.compute_line_hash(MockLine1())
        h2 = ReconciliationService.compute_line_hash(MockLine2())
        assert h1 != h2

    def test_compute_file_hash(self):
        content = b"fake_ofx_content"
        h1 = ReconciliationService.compute_file_hash(content)
        h2 = ReconciliationService.compute_file_hash(content)
        assert h1 == h2
        assert len(h1) == 64

    def test_compute_file_hash_different(self):
        h1 = ReconciliationService.compute_file_hash(b"content_a")
        h2 = ReconciliationService.compute_file_hash(b"content_b")
        assert h1 != h2
