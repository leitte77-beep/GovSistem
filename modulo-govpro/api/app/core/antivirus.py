"""Scanner de antivírus — interface obrigatória antes de aceitar upload.

Fase 2: stub que aceita. A integração ClamAV (ou similar) é um ponto de extensão:
implemente `scan` para chamar `clamd` quando disponível, mantendo a assinatura.
"""

import logging

logger = logging.getLogger("govpro.antivirus")


async def scan(content: bytes) -> bool:
    """Retorna True se o conteúdo está limpo (ou scanner indisponível de forma
    explícita e configurada). Por padrão (stub) aceita — substituir em produção."""
    return True
