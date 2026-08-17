"""Adaptadores externos (isolados atrás de interface).

Cada integração externa (ICP-Brasil, Tramita.GOV.BR, Diário Oficial, etc.) vive
aqui, com resiliência: timeout, retry com backoff e circuit breaker — e fallback
explícito quando o serviço externo está indisponível.
"""
