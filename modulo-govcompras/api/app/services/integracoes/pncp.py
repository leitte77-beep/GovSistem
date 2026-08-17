"""Adapter para o Portal Nacional de Contratações Públicas (seção 41).

Camada de serviço isolada, pronta para receber a integração real quando as
credenciais/API do PNCP estiverem disponíveis. Nesta POC nenhuma chamada de
rede é feita — cada tentativa apenas grava um `IntegracaoLog` com situação
`NAO_CONFIGURADO`, para a interface poder mostrar claramente "funcionalidade
prevista para a próxima fase" (seção 126) em vez de simular sucesso.
"""

import uuid

from sqlalchemy.ext.asyncio import AsyncSession

from app.models.enums import StatusIntegracao, TipoIntegracao
from app.models.governanca import IntegracaoLog


async def enviar_publicacao(
    db: AsyncSession, *, organizacao_id: uuid.UUID, processo_id: uuid.UUID, operacao: str = "publicar_edital"
) -> IntegracaoLog:
    log = IntegracaoLog(
        organizacao_id=organizacao_id,
        sistema=TipoIntegracao.PNCP.value,
        operacao=operacao,
        entidade_tipo="processo",
        entidade_id=processo_id,
        situacao=StatusIntegracao.NAO_CONFIGURADO.value,
        mensagem=(
            "Integração com o PNCP ainda não configurada nesta instalação. "
            "A publicação deve ser registrada manualmente em Licitações > Publicações "
            "até que a API oficial do PNCP seja habilitada."
        ),
    )
    db.add(log)
    await db.flush()
    return log
