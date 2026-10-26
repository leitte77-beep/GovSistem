"""Versão, notas de release e informações técnicas."""

from __future__ import annotations

from fastapi import APIRouter, Depends

from app.core.autorizacao import exigir
from app.core.config import settings
from app.core.permissoes import Permissao
from app.models.nucleo import Usuario

router = APIRouter(prefix="/sistema", tags=["Sistema"])


@router.get("/versao", summary="Versão e notas de release")
async def versao():
    """B.12-057 — versão e notas de release."""
    return {
        "modulo": "govsaude",
        "nome": settings.APP_NAME,
        "versao": settings.VERSION,
        "data_release": "2026-10-26",
        "notas_release_md": settings.RELEASE_NOTES,
        "ambiente": settings.APP_ENV,
    }


@router.get("/info", summary="Informações técnicas para administradores")
async def info(usuario: Usuario = Depends(exigir(Permissao.SISTEMA_LER))):
    return {
        "modulo": "govsaude",
        "versao": settings.VERSION,
        "api": "/api/govsaude/v1",
        "health": "/api/govsaude/health",
        "fuso_padrao": settings.DEFAULT_TIMEZONE,
        "referencia_schema": settings.REFERENCIA_SCHEMA,
        "integracoes_automaticas": settings.INTEGRACOES_AUTOMATICAS,
        "rnds_ambiente": settings.RNDS_ENV,
        "mfa": settings.MFA_ENABLED,
        "solicitante": {"id": str(usuario.id), "tenant_id": str(usuario.tenant_id)},
    }
