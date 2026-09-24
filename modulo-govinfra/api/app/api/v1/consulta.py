"""Consulta pública de ordem de serviço (QR Code — item 32).

O QR Code impresso abre uma página segura que mostra apenas dados não
sensíveis da ordem: número, situação, serviço, período e resumo. Não expõe
CPF, telefone, endereço completo nem qualquer dado de outra organização.
"""

import logging

from fastapi import APIRouter, Depends
from fastapi.responses import JSONResponse
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.models.enums import rotulo
from app.models.porteira import OrdemServico

logger = logging.getLogger("govinfra.consulta")

router = APIRouter(tags=["Consulta pública"])


@router.get("/consulta/{token}", summary="Consulta pública da ordem de serviço")
async def consultar_ordem(
    token: str,
    db: AsyncSession = Depends(get_db),
):
    if not token or len(token) > 60:
        return JSONResponse(
            status_code=404,
            content={"erro": "nao_encontrado", "mensagem": "Ordem de serviço não encontrada."},
        )

    from sqlalchemy import select

    ordem = await db.scalar(select(OrdemServico).where(OrdemServico.token_consulta == token))
    if ordem is None:
        return JSONResponse(
            status_code=404,
            content={"erro": "nao_encontrado", "mensagem": "Ordem de serviço não encontrada."},
        )

    from app.models.porteira import SolicitacaoServico, TipoServico

    solicitacao = await db.get(SolicitacaoServico, ordem.solicitacao_id) if ordem.solicitacao_id else None
    tipo = (
        await db.get(TipoServico, solicitacao.tipo_servico_id)
        if solicitacao and solicitacao.tipo_servico_id
        else None
    )

    return {
        "ordem": {
            "numero": ordem.numero_formatado,
            "situacao": ordem.situacao,
            "situacao_rotulo": rotulo(ordem.situacao),
            "data_prevista": ordem.data_prevista,
            "hora_prevista_inicio": ordem.hora_prevista_inicio,
            "hora_prevista_fim": ordem.hora_prevista_fim,
            "servico": tipo.nome if tipo else None,
            "descricao": solicitacao.descricao if solicitacao else None,
            "horas_autorizadas": ordem.horas_autorizadas,
            "concluida_em": ordem.concluida_em,
            "municipio": None,  # preenchido pelo frontend com o nome configurado
        }
    }
