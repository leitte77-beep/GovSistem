"""Adaptador pendente: sem provedor biométrico oficial configurado."""

from __future__ import annotations

import uuid
from dataclasses import dataclass

STATUS_PENDENTE = "PENDENTE_ESPECIFICACAO_OFICIAL"


@dataclass(frozen=True)
class ResultadoBiometriaPendente:
    identificado: bool = False
    cidadao_id: uuid.UUID | None = None
    status: str = STATUS_PENDENTE
    mensagem: str = (
        "Identificação biométrica não configurada para este tenant. "
        "Use código de barras, QR do comprovante/cartão ou identificação manual."
    )


class AdaptadorBiometriaPendente:
    async def identificar(
        self, token: str, *, tenant_id: uuid.UUID
    ) -> ResultadoBiometriaPendente:
        return ResultadoBiometriaPendente()
