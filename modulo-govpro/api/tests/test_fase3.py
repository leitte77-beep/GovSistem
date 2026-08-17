"""Testes da Fase 3 — cidadão, peticionamento, consulta pública e intimação."""

import pytest
from fastapi import HTTPException
from sqlalchemy import select

from app.models.dominio import TipoProcesso
from app.models.enums import NivelAcesso
from app.models.processo import Processo
from app.services import acesso_externo, cidadao, intimacao, peticionamento

CPF_VALIDO = "11144477735"


async def _tipo_processo_externo(db, tenant_id):
    result = await db.execute(
        select(TipoProcesso).where(
            TipoProcesso.tenant_id == tenant_id, TipoProcesso.codigo == "REQ_GERAL"
        )
    )
    return result.scalar_one()


async def _cidadao_aprovado(db, tenant_id, email="cidadao@teste.local"):
    cid = await cidadao.registrar(
        db,
        org_slug="mun-teste",
        nome="Maria da Silva",
        email=email,
        cpf_cnpj=CPF_VALIDO,
        senha="senha-forte-123",
        aceite_termo=True,
        ip="1.2.3.4",
    )
    await cidadao.aprovar(db, tenant_id, cid.id)
    return cid


async def test_cadastro_cidadao(cenario):
    db = cenario["db"]
    tenant_id = cenario["tenant_id"]

    cid = await cidadao.registrar(
        db,
        org_slug="mun-teste",
        nome="João",
        email="joao@teste.local",
        cpf_cnpj=CPF_VALIDO,
        senha="senha-forte-123",
        aceite_termo=True,
        ip="1.2.3.4",
    )
    assert cid.aprovado is False
    assert cid.termo_versao == "1.0"

    # Login antes de aprovar é bloqueado.
    with pytest.raises(HTTPException) as exc:
        await cidadao.autenticar(
            db, org_slug="mun-teste", email="joao@teste.local", senha="senha-forte-123"
        )
    assert exc.value.status_code == 403

    await cidadao.aprovar(db, tenant_id, cid.id)
    token = await cidadao.autenticar(
        db, org_slug="mun-teste", email="joao@teste.local", senha="senha-forte-123"
    )
    assert token


async def test_cadastro_rejeita_cpf_invalido(cenario):
    db = cenario["db"]
    with pytest.raises(HTTPException) as exc:
        await cidadao.registrar(
            db,
            org_slug="mun-teste",
            nome="João",
            email="joao2@teste.local",
            cpf_cnpj="11144477736",
            senha="senha-forte-123",
            aceite_termo=True,
        )
    assert exc.value.status_code == 422


async def test_peticionar_novo(cenario):
    db = cenario["db"]
    tenant_id = cenario["tenant_id"]
    cid = await _cidadao_aprovado(db, tenant_id)
    tipo = await _tipo_processo_externo(db, tenant_id)

    resultado = await peticionamento.peticionar_novo(
        db, tenant_id, cid, tipo_processo_id=tipo.id, especificacao="Solicito certidão"
    )
    assert resultado["nup"].startswith("00001.")
    assert resultado["recibo"] is not None
    assert resultado["horario_conclusao"] is not None


async def test_tipo_sem_peticionamento_externo_rejeita(cenario):
    db = cenario["db"]
    tenant_id = cenario["tenant_id"]
    cid = await _cidadao_aprovado(db, tenant_id)

    # CERTIDAO é publico_externo True no seed; usamos um tipo não-público criado na hora.
    result = await db.execute(
        select(TipoProcesso).where(
            TipoProcesso.tenant_id == tenant_id, TipoProcesso.codigo == "ESIC"
        )
    )
    tipo_esic = result.scalar_one()
    tipo_esic.publico_externo = False
    await db.commit()

    with pytest.raises(HTTPException) as exc:
        await peticionamento.peticionar_novo(
            db, tenant_id, cid, tipo_processo_id=tipo_esic.id, especificacao="x"
        )
    assert exc.value.status_code == 422


async def test_peticionar_intercorrente(cenario):
    db = cenario["db"]
    tenant_id = cenario["tenant_id"]
    cid = await _cidadao_aprovado(db, tenant_id)
    tipo = await _tipo_processo_externo(db, tenant_id)

    resultado = await peticionamento.peticionar_novo(
        db, tenant_id, cid, tipo_processo_id=tipo.id, especificacao="Processo do cidadão"
    )
    processo = (
        await db.execute(select(Processo).where(Processo.nup == resultado["nup"]))
    ).scalar_one()

    resultado_inter = await peticionamento.peticionar_intercorrente(
        db,
        tenant_id,
        cid,
        processo_id=processo.id,
        titulo="Comprovante",
        conteudo=b"%PDF-1.4 teste",
        mime="application/pdf",
        nome_original="comprovante.pdf",
    )
    assert resultado_inter["documento_id"] is not None


async def test_intercorrente_sem_legitimidade_bloqueia(cenario):
    db = cenario["db"]
    tenant_id = cenario["tenant_id"]
    cid = await _cidadao_aprovado(db, tenant_id)
    tipo = await _tipo_processo_externo(db, tenant_id)

    # Processo autuado para OUTRO interessado.
    from app.services.autuacao import autuar_externo

    processo = await autuar_externo(
        db,
        tenant_id,
        tipo_processo_id=tipo.id,
        especificacao="Processo de terceiro",
        interessados=[{"nome": "Outro", "cpf_cnpj": "52998224725"}],
    )

    with pytest.raises(HTTPException) as exc:
        await peticionamento.peticionar_intercorrente(
            db,
            tenant_id,
            cid,
            processo_id=processo.id,
            titulo="x",
            conteudo=b"x",
            mime="application/pdf",
            nome_original="x.pdf",
        )
    assert exc.value.status_code == 403


async def test_consulta_publica(cenario):
    db = cenario["db"]
    tenant_id = cenario["tenant_id"]
    cid = await _cidadao_aprovado(db, tenant_id)
    tipo = await _tipo_processo_externo(db, tenant_id)

    resultado = await peticionamento.peticionar_novo(
        db, tenant_id, cid, tipo_processo_id=tipo.id, especificacao="Público"
    )
    nup = resultado["nup"]

    # Simula a consulta pública (lógica do endpoint).
    processo = (await db.execute(select(Processo).where(Processo.nup == nup))).scalar_one()
    assert processo.nivel_acesso == NivelAcesso.PUBLICO.value

    # Processo restrito: apenas existência.
    from app.models.dominio import HipoteseLegal
    from app.services import sigilo

    hipotese = (
        await db.execute(
            select(HipoteseLegal).where(
                HipoteseLegal.tenant_id == tenant_id, HipoteseLegal.codigo == "INF_PESSOAL"
            )
        )
    ).scalar_one()
    await sigilo.classificar(
        db,
        tenant_id,
        cenario["user"],
        alvo_tipo="processo",
        alvo_id=processo.id,
        hipotese_legal_id=hipotese.id,
        prazo_anos=5,
    )
    await db.refresh(processo)
    assert processo.nivel_acesso == NivelAcesso.SIGILOSO.value


async def test_intimacao_ciencia(cenario):
    db = cenario["db"]
    tenant_id = cenario["tenant_id"]
    cid = await _cidadao_aprovado(db, tenant_id)
    tipo = await _tipo_processo_externo(db, tenant_id)

    resultado = await peticionamento.peticionar_novo(
        db, tenant_id, cid, tipo_processo_id=tipo.id, especificacao="P/ intimação"
    )
    processo = (
        await db.execute(select(Processo).where(Processo.nup == resultado["nup"]))
    ).scalar_one()

    intim = await intimacao.criar_intimacao(
        db,
        tenant_id,
        cenario["user"],
        processo_id=processo.id,
        destinatario_nome=cid.nome,
        texto="Apresente documentos.",
        prazo_dias=10,
        usuario_externo_id=cid.id,
    )
    assert intim.status == "DISPONIBILIZADA"

    ciencia = await intimacao.registrar_ciencia(
        db, tenant_id, cid, intimacao_id=intim.id, ip="9.9.9.9"
    )
    assert ciencia.status == "CIENTE"


async def test_acesso_externo_concedido(cenario):
    db = cenario["db"]
    tenant_id = cenario["tenant_id"]
    cid = await _cidadao_aprovado(db, tenant_id)
    tipo = await _tipo_processo_externo(db, tenant_id)

    from app.services.autuacao import autuar_externo

    processo = await autuar_externo(
        db,
        tenant_id,
        tipo_processo_id=tipo.id,
        especificacao="Processo de terceiro",
        interessados=[{"nome": "Terceiro", "cpf_cnpj": "52998224725"}],
    )

    acesso = await acesso_externo.conceder(
        db, tenant_id, cenario["user"], processo_id=processo.id, usuario_externo_id=cid.id
    )
    assert acesso.id is not None

    # Agora o cidadão consegue juntar (via acesso externo), mesmo não sendo interessado.
    resultado = await peticionamento.peticionar_intercorrente(
        db,
        tenant_id,
        cid,
        processo_id=processo.id,
        titulo="Procuração",
        conteudo=b"%PDF teste",
        mime="application/pdf",
        nome_original="procuracao.pdf",
    )
    assert resultado["documento_id"] is not None
