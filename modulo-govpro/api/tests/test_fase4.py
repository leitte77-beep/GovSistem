"""Testes da Fase 4 — prazos, sobrestamento, indisponibilidade e acompanhamento."""

from datetime import date, datetime, timedelta, timezone

import jwt
from sqlalchemy import select

from app.core.config import settings
from app.models.enums import SituacaoProcesso
from app.models.processo import Processo
from app.services import (
    acompanhamento,
    indisponibilidade,
    prazo,
    sobrestamento,
)
from app.services.autuacao import autuar


def _token(user, org_id) -> str:
    now = datetime.now(timezone.utc)
    payload = {
        "sub": str(user.id),
        "roles": ["SERVIDOR"],
        "type": "module_access",
        "organization_id": str(org_id),
        "iat": now,
        "exp": now + timedelta(minutes=30),
    }
    return jwt.encode(payload, settings.JWT_SECRET, algorithm=settings.ALGORITHM)


async def _autuar_processo(cenario):
    from app.models.dominio import TipoProcesso

    db = cenario["db"]
    result = await db.execute(
        select(TipoProcesso).where(
            TipoProcesso.tenant_id == cenario["tenant_id"], TipoProcesso.codigo == "REQ_GERAL"
        )
    )
    tipo = result.scalar_one()
    return await autuar(
        db,
        cenario["tenant_id"],
        cenario["user"],
        tipo_processo_id=tipo.id,
        especificacao="Processo Fase 4",
        interessados=[{"nome": "X"}],
    )


async def test_criar_prazo_calcula_vencimento(cenario):
    db = cenario["db"]
    tenant_id = cenario["tenant_id"]
    processo = await _autuar_processo(cenario)

    p = await prazo.criar_prazo(
        db,
        tenant_id,
        cenario["user"],
        processo_id=processo.id,
        titulo="Prazo interno",
        dias=5,
        modo="CORRIDOS",
        data_inicio=date(2026, 8, 10),
    )
    # 5 dias corridos a partir de 10 -> sáb 15 -> prorroga para seg 17
    assert p.data_vencimento == date(2026, 8, 17)


async def test_prorrogar_prazo(cenario):
    db = cenario["db"]
    tenant_id = cenario["tenant_id"]
    processo = await _autuar_processo(cenario)

    p = await prazo.criar_prazo(
        db,
        tenant_id,
        cenario["user"],
        processo_id=processo.id,
        titulo="Prazo",
        dias=5,
        data_inicio=date(2026, 8, 10),
    )
    p = await prazo.prorrogar(
        db, tenant_id, cenario["user"], prazo_id=p.id, novos_dias=5, motivo="Indisponibilidade"
    )
    assert p.prorrogado is True
    assert p.prorrogacoes == 1
    # vence 17 (seg) + 5 corridos -> 22 (sáb) -> prorroga para 24 (seg)
    assert p.data_vencimento == date(2026, 8, 24)


async def test_sobrestar_reativar(cenario):
    db = cenario["db"]
    tenant_id = cenario["tenant_id"]
    processo = await _autuar_processo(cenario)

    s = await sobrestamento.sobrestar(
        db, tenant_id, cenario["user"], processo_id=processo.id, motivo_texto="Aguardando parecer"
    )
    assert s.ativo is True

    p = await db.get(Processo, processo.id)
    assert p.situacao == SituacaoProcesso.SOBRESTADO.value

    await sobrestamento.reativar(db, tenant_id, cenario["user"], processo_id=processo.id)
    await db.refresh(p)
    assert p.situacao == SituacaoProcesso.EM_TRAMITACAO.value


async def test_reativar_expirados(cenario):
    db = cenario["db"]
    tenant_id = cenario["tenant_id"]
    processo = await _autuar_processo(cenario)

    await sobrestamento.sobrestar(
        db,
        tenant_id,
        cenario["user"],
        processo_id=processo.id,
        motivo_texto="Aguardando evento",
        fim_previsto=datetime.now(timezone.utc) - timedelta(days=1),
    )

    total = await sobrestamento.reativar_expirados(db)
    assert total >= 1

    p = await db.get(Processo, processo.id)
    assert p.situacao == SituacaoProcesso.EM_TRAMITACAO.value


async def test_indisponibilidade_prorroga_prazos(cenario):
    db = cenario["db"]
    tenant_id = cenario["tenant_id"]
    processo = await _autuar_processo(cenario)

    p = await prazo.criar_prazo(
        db,
        tenant_id,
        cenario["user"],
        processo_id=processo.id,
        titulo="Prazo",
        dias=3,
        data_inicio=date(2026, 8, 10),  # vence 13 (quinta)
    )

    ind = await indisponibilidade.registrar(
        db,
        tenant_id,
        cenario["user"],
        inicio=datetime(2026, 8, 12, 8, 0, tzinfo=timezone.utc),
        causa="Falha no servidor",
    )

    await indisponibilidade.encerrar(
        db,
        tenant_id,
        cenario["user"],
        indisponibilidade_id=ind.id,
        fim=datetime(2026, 8, 15, 18, 0, tzinfo=timezone.utc),  # sábado
    )

    await db.refresh(p)
    # venceu em 13 (dentro do período) -> prorrogado para próxima útil após 15 (sáb) = 17 (seg)
    assert p.prorrogado is True
    assert p.data_vencimento == date(2026, 8, 17)


async def test_acompanhamento_marcar_listar_desmarcar(cenario):
    db = cenario["db"]
    tenant_id = cenario["tenant_id"]
    processo = await _autuar_processo(cenario)

    a = await acompanhamento.marcar(
        db, tenant_id, cenario["user"], processo_id=processo.id, etiqueta="urgente"
    )
    assert a.ativo is True

    itens = await acompanhamento.listar(db, tenant_id, cenario["user"].id)
    assert len(itens) == 1

    await acompanhamento.desmarcar(db, tenant_id, cenario["user"], processo_id=processo.id)
    itens = await acompanhamento.listar(db, tenant_id, cenario["user"].id)
    assert len(itens) == 0


async def test_listar_indisponibilidades_via_http(cenario, client):
    db = cenario["db"]
    tenant_id = cenario["tenant_id"]

    await indisponibilidade.registrar(
        db,
        tenant_id,
        cenario["user"],
        inicio=datetime(2026, 8, 10, tzinfo=timezone.utc),
        causa="Manutenção programada",
        tipo="PROGRAMADA",
    )
    await db.commit()

    token = _token(cenario["user"], tenant_id)
    res = await client.get(
        "/api/govpro/v1/indisponibilidades", headers={"Authorization": f"Bearer {token}"}
    )
    assert res.status_code == 200
    data = res.json()
    assert len(data) == 1
    assert data[0]["causa"] == "Manutenção programada"
    assert data[0]["encerrada"] is False
