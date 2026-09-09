"""Centralized DeepSeek (``deepseek-v4-flash``) integration services.

Only this package may talk to the AI provider. Business operations (document
model authoring, extraction, drafting) in later increments will reuse
:mod:`app.services.ai.deepseek_client` and the per-organization key stored via
:mod:`app.services.ai.config_store`.
"""
