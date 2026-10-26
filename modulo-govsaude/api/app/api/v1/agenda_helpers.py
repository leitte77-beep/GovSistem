"""Serializadores e utilidades das rotas da Fase 4."""

from __future__ import annotations

import uuid
from datetime import datetime

from app.models.agenda import Agendamento, ChamadaPainel, FilaAtendimento
from app.schemas.agenda import (
    AgendamentoOut,
    AlertaOut,
    ChamadaOut,
    FilaOut,
    FilaTemposOut,
)
from app.services.agenda_comum import (
    abreviar_nome,
    ranking_fila,
    tempos_fila,
)


def agendamento_out(
    registro: Agendamento,
    *,
    codigo_acesso: str | None = None,
    alertas: list[dict] | None = None,
) -> AgendamentoOut:
    saida = AgendamentoOut.model_validate(registro)
    cidadao = registro.cidadao
    nome = (cidadao.nome_social or cidadao.nome) if cidadao else None
    return saida.model_copy(
        update={
            "agenda_nome": registro.agenda.nome if registro.agenda else None,
            "cidadao_nome_exibicao": nome,
            "cidadao_nome_abreviado": abreviar_nome(nome),
            "alertas": [AlertaOut(**item) for item in (alertas or [])],
            "codigo_acesso": codigo_acesso,
        }
    )


def fila_out(
    registro: FilaAtendimento,
    *,
    posicao: int | None = None,
    agora_ref: datetime | None = None,
) -> FilaOut:
    saida = FilaOut.model_validate(registro)
    cidadao = registro.cidadao
    nome = (cidadao.nome_social or cidadao.nome) if cidadao else None
    return saida.model_copy(
        update={
            "posicao": posicao,
            "cidadao_nome_exibicao": nome,
            "prioridade_rotulo": (
                registro.prioridade.rotulo if registro.prioridade else None
            ),
            "nivel_risco_rotulo": (
                registro.nivel_risco.rotulo if registro.nivel_risco else None
            ),
            "nivel_risco_cor": (
                registro.nivel_risco.cor if registro.nivel_risco else None
            ),
            "tempos": FilaTemposOut(**tempos_fila(registro, agora_ref)),
            "ordem_ranking": ranking_fila(registro),
        }
    )


def chamada_out(registro: ChamadaPainel) -> ChamadaOut:
    return ChamadaOut.model_validate(registro)


def fila_lista(
    registros: list[FilaAtendimento], regra: list[dict]
) -> tuple[list[FilaOut], uuid.UUID | None, uuid.UUID | None]:
    itens = []
    estabelecimento_id = None
    setor_id = None
    for indice, registro in enumerate(registros, start=1):
        estabelecimento_id = registro.estabelecimento_id
        setor_id = registro.setor_id
        itens.append(fila_out(registro, posicao=indice))
    return itens, estabelecimento_id, setor_id
