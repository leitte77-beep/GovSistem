"""PAdES signature-policy configuration.

The policy is only embedded when OID + policy-document SHA-256 + URI are all
provided; an incomplete config must never claim a policy was applied.
"""

from app.core import config as config_mod
from app.providers.a1 import PfxA1SignerProvider

AD_RB_OID = "2.16.76.1.7.1.11.1.3"


def _provider():
    return PfxA1SignerProvider.__new__(PfxA1SignerProvider)


def _set(monkeypatch, oid="", digest="", uri=""):
    monkeypatch.setattr(config_mod.settings, "SIGNER_POLICY_OID", oid, raising=False)
    monkeypatch.setattr(config_mod.settings, "SIGNER_POLICY_HASH", digest, raising=False)
    monkeypatch.setattr(config_mod.settings, "SIGNER_POLICY_URI", uri, raising=False)


def test_no_policy_when_unset(monkeypatch):
    _set(monkeypatch)
    provider = _provider()
    assert provider._policy_attr_spec() is None
    assert provider._effective_policy_oid() == ""


def test_no_policy_when_incomplete(monkeypatch):
    _set(monkeypatch, oid=AD_RB_OID)  # missing hash and URI
    provider = _provider()
    assert provider._policy_attr_spec() is None
    assert provider._effective_policy_oid() == ""


def test_policy_built_when_complete(monkeypatch):
    _set(monkeypatch, oid=AD_RB_OID, digest="ab" * 32, uri="https://politicas.example/adrb.pdf")
    provider = _provider()
    spec = provider._policy_attr_spec()
    assert spec is not None
    assert spec.signature_policy_identifier is not None
    assert provider._effective_policy_oid() == AD_RB_OID


def test_invalid_hash_is_ignored(monkeypatch):
    _set(monkeypatch, oid=AD_RB_OID, digest="not-hex", uri="https://politicas.example/adrb.pdf")
    provider = _provider()
    assert provider._policy_attr_spec() is None
    assert provider._effective_policy_oid() == ""
