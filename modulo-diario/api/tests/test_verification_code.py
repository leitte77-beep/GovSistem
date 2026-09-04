"""Tests for high-entropy verification codes."""

from __future__ import annotations

import re

from app.services.verification_code import (
    code_to_hash_lookup,
    generate_secure_code,
    hash_code,
)

_PATTERN = re.compile(r"^[A-HJKMNP-STUVWXYZ2-9]{4}-[A-HJKMNP-STUVWXYZ2-9]{4}-[A-HJKMNP-STUVWXYZ2-9]{4}-[A-HJKMNP-STUVWXYZ2-9]{4}$")


def test_generated_code_matches_format():
    code = generate_secure_code()
    assert _PATTERN.match(code), f"Unexpected format: {code}"


def test_codes_are_unique():
    codes = {generate_secure_code() for _ in range(200)}
    assert len(codes) == 200


def test_hash_is_deterministic_and_normalized():
    assert hash_code("7K4P-M92X-F8QD-T3WA") == hash_code(" 7k4p-m92x-f8qd-t3wa ")
    assert hash_code("ABCD") != hash_code("ABCE")


def test_compare_digest_is_case_insensitive_and_hyphen_tolerant():
    code = generate_secure_code()
    h = hash_code(code)
    assert code_to_hash_lookup(code.lower(), h) is True
    assert code_to_hash_lookup(code.replace("-", " "), h) is True
    assert code_to_hash_lookup("WRONG-CODE", h) is False


def test_code_has_high_entropy_charset():
    # All chars must come from the unambiguous alphabet.
    allowed = set("ABCDEFGHJKMNPQRSTUVWXYZ23456789-")
    for _ in range(50):
        assert set(generate_secure_code()) <= allowed
