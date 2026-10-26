"""Porta de identificação biométrica.

A recepção aceita biometria apenas como alternativa; código de barras, QR e
identificação manual permanecem sempre disponíveis. Não há captura, template
ou comparação biométrica implementada no módulo sem um provedor oficial.
"""

from __future__ import annotations

import uuid
from typing import Protocol


class ResultadoBiometria(Protocol):
    identificado: bool
    cidadao_id: uuid.UUID | None
    status: str
    mensagem: str | None


class PortaBiometria(Protocol):
    async def identificar(self, token: str, *, tenant_id: uuid.UUID) -> ResultadoBiometria:
        ...
