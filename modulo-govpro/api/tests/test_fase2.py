"""Testes da Fase 2 — captura, sigilo, credenciais, blocos e validador."""

from datetime import datetime, timedelta, timezone

import jwt
import pytest
from fastapi import HTTPException
from sqlalchemy import func, select

from app.core.config import settings
from app.models.documento import ComponenteDigital
from app.models.dominio import HipoteseLegal, TipoProcesso
from app.models.enums import NivelAcesso, SituacaoDocumento
from app.models.processo import Processo
from app.services import (
    bloco_assinatura,
    captura,
    documento,
    sigilo,
    validacao,
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

PDF = b"%PDF-1.4\n1 0 obj\n<<>>\nendobj\n%%EOF\n"


async def _tipo_processo(db, tenant_id, codigo):
    result = await db.execute(
        select(TipoProcesso).where(
            TipoProcesso.tenant_id == tenant_id, TipoProcesso.codigo == codigo
        )
    )
    return result.scalar_one()


async def _hipotese(db, tenant_id, codigo="INF_PESSOAL"):
    result = await db.execute(
        select(HipoteseLegal).where(
            HipoteseLegal.tenant_id == tenant_id, HipoteseLegal.codigo == codigo
        )
    )
    return result.scalar_one()


async def _autuar(cenario, nivel=NivelAcesso.PUBLICO.value, hipotese_id=None):
    db = cenario["db"]
    tipo = await _tipo_processo(db, cenario["tenant_id"], "LICENCA_OBRA")
    return await autuar(
        db,
        cenario["tenant_id"],
        cenario["user"],
        tipo_processo_id=tipo.id,
        especificacao="Processo para teste Fase 2",
        interessados=[{"nome": "X"}],
        nivel_acesso=nivel,
        hipotese_legal_id=hipotese_id,
    )


async def test_captura_documento_externo(cenario):
    db = cenario["db"]
    tenant_id = cenario["tenant_id"]
    processo = await _autuar(cenario)

    doc = await captura.capturar_documento_externo(
        db,
        tenant_id,
        cenario["user"],
        processo_id=processo.id,
        titulo="Comprovante de endereço",
        nome_original="comprovante.pdf",
        mime="application/pdf",
        conteudo=PDF,
        formato="CAPTURADO",
        unidade_id=cenario["unidade"].id,
    )
    assert doc.formato == "CAPTURADO"
    assert doc.hash_conteudo is not None
    assert doc.codigo_verificador is not None

    # Deduplicação por hash: mesmo conteúdo → mesmo componente.
    doc2 = await captura.capturar_documento_externo(
        db,
        tenant_id,
        cenario["user"],
        processo_id=processo.id,
        titulo="Comprovante duplicado",
        nome_original="comprovante2.pdf",
        mime="application/pdf",
        conteudo=PDF,
        formato="CAPTURADO",
    )
    count = (
        await db.execute(
            select(func.count(ComponenteDigital.id)).where(
                ComponenteDigital.sha256 == doc.hash_conteudo
            )
        )
    ).scalar_one()
    assert count == 1
    assert doc2.hash_conteudo == doc.hash_conteudo


async def test_captura_rejeita_mime_nao_permitido(cenario):
    processo = await _autuar(cenario)
    with pytest.raises(HTTPException) as exc:
        await captura.capturar_documento_externo(
            cenario["db"],
            cenario["tenant_id"],
            cenario["user"],
            processo_id=processo.id,
            titulo="Executável",
            nome_original="x.exe",
            mime="application/x-msdownload",
            conteudo=b"MZ...",
        )
    assert exc.value.status_code == 422


async def test_digitalizado_exige_metadados(cenario):
    processo = await _autuar(cenario)
    with pytest.raises(HTTPException) as exc:
        await captura.capturar_documento_externo(
            cenario["db"],
            cenario["tenant_id"],
            cenario["user"],
            processo_id=processo.id,
            titulo="Documento físico",
            nome_original="fisico.pdf",
            mime="application/pdf",
            conteudo=PDF,
            formato="DIGITALIZADO",
        )
    assert exc.value.status_code == 422


async def test_digitalizado_com_metadados(cenario):
    processo = await _autuar(cenario)
    doc = await captura.capturar_documento_externo(
        cenario["db"],
        cenario["tenant_id"],
        cenario["user"],
        processo_id=processo.id,
        titulo="Documento físico",
        nome_original="fisico.pdf",
        mime="application/pdf",
        conteudo=PDF,
        formato="DIGITALIZADO",
        metadados={
            "assunto": "Alvará",
            "autor": "Prefeitura",
            "data_digitalizacao": "2026-08-13",
            "local_digitalizacao": "Sede",
            "responsavel": "Servidor",
        },
    )
    assert doc.metadados_captura["hash"] == doc.hash_conteudo
    assert doc.metadados_captura["titulo"] == "Documento físico"


async def test_classificar_desclassificar(cenario):
    db = cenario["db"]
    tenant_id = cenario["tenant_id"]
    hipotese = await _hipotese(db, tenant_id)
    processo = await _autuar(cenario)

    alvo = await sigilo.classificar(
        db,
        tenant_id,
        cenario["user"],
        alvo_tipo="processo",
        alvo_id=processo.id,
        hipotese_legal_id=hipotese.id,
        prazo_anos=5,
        justificativa="Contém dado pessoal",
    )
    assert alvo.nivel_acesso == NivelAcesso.SIGILOSO.value
    assert alvo.sigilo_expira_em is not None

    alvo = await sigilo.desclassificar(
        db, tenant_id, cenario["user"], alvo_tipo="processo", alvo_id=processo.id
    )
    assert alvo.nivel_acesso == NivelAcesso.PUBLICO.value
    assert alvo.sigilo_expira_em is None


async def test_expira_automatica(cenario):
    db = cenario["db"]
    tenant_id = cenario["tenant_id"]
    hipotese = await _hipotese(db, tenant_id)
    processo = await _autuar(cenario)

    await sigilo.classificar(
        db,
        tenant_id,
        cenario["user"],
        alvo_tipo="processo",
        alvo_id=processo.id,
        hipotese_legal_id=hipotese.id,
        prazo_anos=5,
    )

    # Força o vencimento no passado.
    p = await db.get(Processo, processo.id)
    p.sigilo_expira_em = datetime.now(timezone.utc) - timedelta(days=1)
    await db.commit()

    total = await sigilo.desclassificar_expirados(db)
    assert total >= 1

    await db.refresh(p)
    assert p.nivel_acesso == NivelAcesso.PUBLICO.value


async def test_credencial_acesso(cenario):
    db = cenario["db"]
    tenant_id = cenario["tenant_id"]
    hipotese = await _hipotese(db, tenant_id)
    processo = await _autuar(cenario)

    await sigilo.classificar(
        db,
        tenant_id,
        cenario["user"],
        alvo_tipo="processo",
        alvo_id=processo.id,
        hipotese_legal_id=hipotese.id,
        prazo_anos=5,
    )

    p = await db.get(Processo, processo.id)
    # Sem credencial: bloqueado (usuário é SERVIDOR, não é gestor de sigilo).
    assert await sigilo.tem_acesso_sigiloso(db, cenario["user"], p) is False

    await sigilo.conceder_credencial(
        db, tenant_id, cenario["user"], processo_id=processo.id, usuario_id=cenario["user"].id
    )
    assert await sigilo.tem_acesso_sigiloso(db, cenario["user"], p) is True

    await sigilo.revogar_credencial(
        db, tenant_id, cenario["user"], processo_id=processo.id, usuario_id=cenario["user"].id
    )
    assert await sigilo.tem_acesso_sigiloso(db, cenario["user"], p) is False


async def test_listar_credenciais_via_http(cenario, client):
    from app.models.enums import RoleName
    from app.models.role import Role
    from app.models.user_role import UserRole

    db = cenario["db"]
    tenant_id = cenario["tenant_id"]
    processo = await _autuar(cenario)

    role = (
        await db.execute(select(Role).where(Role.name == RoleName.ADMIN.value))
    ).scalar_one()
    db.add(UserRole(user_id=cenario["user"].id, role_id=role.id))
    await db.commit()

    await sigilo.conceder_credencial(
        db, tenant_id, cenario["user"], processo_id=processo.id,
        usuario_id=cenario["user"].id, motivo="Acompanhamento direto",
    )

    token = _token(cenario["user"], tenant_id)
    res = await client.get(
        f"/api/govpro/v1/processos/{processo.id}/credenciais",
        headers={"Authorization": f"Bearer {token}"},
    )
    assert res.status_code == 200
    data = res.json()
    assert len(data) == 1
    assert data[0]["usuario_id"] == str(cenario["user"].id)
    assert data[0]["motivo"] == "Acompanhamento direto"


async def test_bloco_assinatura(cenario):
    db = cenario["db"]
    tenant_id = cenario["tenant_id"]
    processo = await _autuar(cenario)

    doc = await documento.criar_documento_interno(
        db,
        tenant_id,
        cenario["user"],
        processo_id=processo.id,
        titulo="Ofício 1",
        conteudo_html="<p>a</p>",
        unidade_id=cenario["unidade"].id,
    )

    bloco = await bloco_assinatura.criar_bloco(db, tenant_id, cenario["user"], nome="Bloco teste")
    await bloco_assinatura.adicionar_documento(
        db, tenant_id, cenario["user"], bloco_id=bloco.id, documento_id=doc.id
    )
    resultados = await bloco_assinatura.assinar_bloco(
        db, tenant_id, cenario["user"], bloco_id=bloco.id, papel_cargo="Chefe"
    )
    assert len(resultados) == 1

    await db.refresh(doc)
    assert doc.situacao == SituacaoDocumento.ASSINADO.value


async def test_validador_publico(cenario):
    db = cenario["db"]
    tenant_id = cenario["tenant_id"]
    processo = await _autuar(cenario)

    doc = await documento.criar_documento_interno(
        db,
        tenant_id,
        cenario["user"],
        processo_id=processo.id,
        titulo="Certidão",
        conteudo_html="<p>conteúdo</p>",
    )
    crc = validacao.crc_do_documento(doc)

    resultado = await validacao.validar_por_codigo(db, doc.codigo_verificador, crc)
    assert resultado["valido"] is True
    assert resultado["titulo"] == "Certidão"

    resultado_invalido = await validacao.validar_por_codigo(db, doc.codigo_verificador, "00000000")
    assert resultado_invalido["valido"] is False

    inexistente = await validacao.validar_por_codigo(db, "9999999", crc)
    assert inexistente is None
