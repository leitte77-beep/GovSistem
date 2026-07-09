"""Adaptadores de integração — interfaces isoladas para serviços externos.

ViaCEP: consulta de CEP.
MessagingProvider: envio de lembretes (WhatsApp/SMS).
CadUnicoAdapter: futura integração com API Conecta gov.br.
"""
from abc import ABC, abstractmethod
from typing import Optional


class ViaCEPAdapter(ABC):
    """Interface para consulta de CEP."""

    @abstractmethod
    async def consultar(self, cep: str) -> Optional[dict]:
        ...


class ViaCEPHttp(ViaCEPAdapter):
    """Implementação HTTP do ViaCEP."""

    async def consultar(self, cep: str) -> Optional[dict]:
        try:
            import httpx
            async with httpx.AsyncClient() as client:
                resp = await client.get(
                    f"https://viacep.com.br/ws/{cep}/json/", timeout=5.0,
                )
                if resp.status_code == 200:
                    data = resp.json()
                    if "erro" not in data:
                        return data
        except Exception:
            pass
        return None


class MessagingProvider(ABC):
    """Interface plugável para envio de mensagens (WhatsApp/SMS)."""

    @abstractmethod
    async def enviar(self, telefone: str, mensagem: str) -> bool:
        ...


class LogMessagingProvider(MessagingProvider):
    """Implementação fake que loga em vez de enviar (dev/testes)."""

    async def enviar(self, telefone: str, mensagem: str) -> bool:
        print(f"[Mensageria] Para {telefone}: {mensagem}")
        return True


class CadUnicoAdapter(ABC):
    """Interface para integração com API do CadÚnico/Conecta gov.br.
    Exige credenciamento do município. Implementação futura."""

    @abstractmethod
    async def consultar_familia(self, nis: str) -> Optional[dict]:
        ...

    @abstractmethod
    async def consultar_por_cpf(self, cpf: str) -> Optional[dict]:
        ...
