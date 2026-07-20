"""Modulo de interpretacao e diagramacao automatica de publicacoes do Diario Oficial.

Pipeline: sanitizacao -> normalizacao -> segmentacao -> motor de regras ->
maquina de estados -> (IA opcional para blocos ambiguos) -> renderizacao por
template -> validacao de integridade -> dados do sumario.
"""

from app.services.gazette.integrity import verify_integrity
from app.services.gazette.parser import parse_document
from app.services.gazette.renderer import render_document
from app.services.gazette.toc import build_toc_entry

__all__ = [
    "parse_document",
    "render_document",
    "verify_integrity",
    "build_toc_entry",
]
