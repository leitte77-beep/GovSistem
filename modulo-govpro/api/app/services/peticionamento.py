"""Peticionamento externo (novo e intercorrente) e recibo de protocolo.

O horário válido do recibo é o TÉRMINO do processamento (não o início do
preenchimento) — Lei 14.129/2021. Toda ação anterior é preparatória.
"""

import uuid
from datetime import datetime, timezone
from typing import Optional

from fastapi import HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.storage import sha256
from app.models.cidadao import (
    AcessoExterno,
    Peticionamento,
    ReciboProtocolo,
    UsuarioExterno,
)
from app.models.enums import StatusPeticionamento, TipoPeticionamento
from app.models.interessado import Interessado
from app.models.processo import Processo
from app.services import autuacao, captura


def _gerar_codigo_recibo() -> str:
    return uuid.uuid4().hex[:16].upper()


async def _criar_recibo(
    db: AsyncSession,
    tenant_id: uuid.UUID,
    peticionamento_id: uuid.UUID,
    processo: Processo,
    resumo: dict,
) -> ReciboProtocolo:
    horario = datetime.now(timezone.utc)
    codigo = _gerar_codigo_recibo()
    conteudo = {"nup": processo.nup, "horario_conclusao": horario.isoformat(), **resumo}
    recibo = ReciboProtocolo(
        tenant_id=tenant_id,
        peticionamento_id=peticionamento_id,
        codigo=codigo,
        horario_conclusao=horario,
        conteudo=conteudo,
        hash_recibo=sha256(codigo.encode("utf-8")),
    )
    db.add(recibo)
    await db.flush()
    return recibo


async def peticionar_novo(
    db: AsyncSession,
    tenant_id: uuid.UUID,
    cidadao: UsuarioExterno,
    *,
    tipo_processo_id: uuid.UUID,
    especificacao: str,
    client: Optional[dict] = None,
) -> dict:
    processo = await autuacao.autuar_externo(
        db,
        tenant_id,
        tipo_processo_id=tipo_processo_id,
        especificacao=especificacao,
        interessados=[
            {
                "tipo_pessoa": "PF",
                "nome": cidadao.nome,
                "cpf_cnpj": cidadao.cpf_cnpj,
                "email": cidadao.email,
            }
        ],
        client=client,
    )

    peticionamento = Peticionamento(
        tenant_id=tenant_id,
        usuario_externo_id=cidadao.id,
        tipo=TipoPeticionamento.NOVO.value,
        tipo_processo_id=tipo_processo_id,
        processo_id=processo.id,
        especificacao=especificacao.strip(),
        status=StatusPeticionamento.CONCLUIDO.value,
        concluido_em=datetime.now(timezone.utc),
    )
    db.add(peticionamento)
    await db.flush()

    recibo = await _criar_recibo(db, tenant_id, peticionamento.id, processo, {"tipo": "NOVO"})

    await db.commit()
    return {
        "nup": processo.nup,
        "recibo": recibo.codigo,
        "horario_conclusao": recibo.horario_conclusao.isoformat(),
        "peticionamento_id": str(peticionamento.id),
    }


async def _cidadao_e_interessado(
    db: AsyncSession, cidadao: UsuarioExterno, processo: Processo
) -> bool:
    result = await db.execute(
        select(Interessado).where(
            Interessado.processo_id == processo.id,
            Interessado.cpf_cnpj == cidadao.cpf_cnpj,
        )
    )
    if result.scalar_one_or_none() is not None:
        return True
    result = await db.execute(
        select(AcessoExterno).where(
            AcessoExterno.processo_id == processo.id,
            AcessoExterno.usuario_externo_id == cidadao.id,
            AcessoExterno.revogado_em.is_(None),
        )
    )
    return result.scalar_one_or_none() is not None


async def peticionar_intercorrente(
    db: AsyncSession,
    tenant_id: uuid.UUID,
    cidadao: UsuarioExterno,
    *,
    processo_id: uuid.UUID,
    titulo: str,
    conteudo: bytes,
    mime: str,
    nome_original: str,
    client: Optional[dict] = None,
) -> dict:
    processo = await db.get(Processo, processo_id)
    if processo is None or processo.tenant_id != tenant_id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Processo não encontrado")

    if not await _cidadao_e_interessado(db, cidadao, processo):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Você não é parte deste processo nem possui acesso concedido",
        )

    documento = await captura.capturar_documento_externo(
        db,
        tenant_id,
        None,  # origem externa — sem usuário interno
        processo_id=processo.id,
        titulo=titulo,
        nome_original=nome_original,
        mime=mime,
        conteudo=conteudo,
        formato="CAPTURADO",
        client=client,
    )

    peticionamento = Peticionamento(
        tenant_id=tenant_id,
        usuario_externo_id=cidadao.id,
        tipo=TipoPeticionamento.INTERCORRENTE.value,
        processo_id=processo.id,
        especificacao=f"Juntada: {titulo}",
        status=StatusPeticionamento.CONCLUIDO.value,
        concluido_em=datetime.now(timezone.utc),
    )
    db.add(peticionamento)
    await db.flush()

    recibo = await _criar_recibo(
        db,
        tenant_id,
        peticionamento.id,
        processo,
        {"tipo": "INTERCORRENTE", "documento_id": str(documento.id)},
    )

    await db.commit()
    return {
        "nup": processo.nup,
        "recibo": recibo.codigo,
        "horario_conclusao": recibo.horario_conclusao.isoformat(),
        "documento_id": str(documento.id),
    }
