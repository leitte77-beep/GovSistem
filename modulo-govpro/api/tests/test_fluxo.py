"""Fluxo de ponta a ponta da Fase 1: nasce → despacho assinado → tramita → encerra."""

import pytest
from fastapi import HTTPException
from sqlalchemy import select

from app.models.andamento import Andamento
from app.models.dominio import TipoDocumento, TipoProcesso
from app.models.enums import NivelAcesso, SituacaoDocumento, SituacaoProcesso
from app.models.unidade import Unidade
from app.services import assinatura, autuacao, documento, tramitacao
from app.services.processo import concluir


async def _tipo_processo(db, tenant_id, codigo):
    result = await db.execute(
        select(TipoProcesso).where(
            TipoProcesso.tenant_id == tenant_id, TipoProcesso.codigo == codigo
        )
    )
    return result.scalar_one()


async def _unidade(db, tenant_id, sigla):
    result = await db.execute(
        select(Unidade).where(Unidade.tenant_id == tenant_id, Unidade.sigla == sigla)
    )
    return result.scalar_one()


async def _tipo_documento(db, tenant_id, codigo):
    result = await db.execute(
        select(TipoDocumento).where(
            TipoDocumento.tenant_id == tenant_id, TipoDocumento.codigo == codigo
        )
    )
    return result.scalar_one()


async def test_fluxo_completo(cenario):
    db = cenario["db"]
    tenant_id = cenario["tenant_id"]
    user = cenario["user"]

    tipo = await _tipo_processo(db, tenant_id, "REQ_GERAL")
    tipo_doc = await _tipo_documento(db, tenant_id, "DESPACHO")
    destino = await _unidade(db, tenant_id, "SEC_ADM")

    # 1. Autuação
    processo = await autuacao.autuar(
        db,
        tenant_id,
        user,
        tipo_processo_id=tipo.id,
        especificacao="Solicitação de certidão de débitos",
        interessados=[{"tipo_pessoa": "PF", "nome": "Maria da Silva", "cpf_cnpj": "11144477735"}],
        nivel_acesso=NivelAcesso.PUBLICO.value,
    )
    assert processo.situacao == SituacaoProcesso.EM_TRAMITACAO.value
    assert processo.nup.startswith("00001.")  # código da unidade Protocolo Central
    assert processo.nup.count(".") == 1 and "/" in processo.nup and "-" in processo.nup

    # 2. Produção de despacho (documento interno)
    doc = await documento.criar_documento_interno(
        db,
        tenant_id,
        user,
        processo_id=processo.id,
        titulo="Despacho de instrução",
        conteudo_html="<p>Determine-se a instrução.</p>",
        tipo_documento_id=tipo_doc.id,
        nivel_acesso=NivelAcesso.PUBLICO.value,
        unidade_id=cenario["unidade"].id,
    )
    assert doc.situacao == SituacaoDocumento.RASCUNHO.value
    assert doc.codigo_verificador is not None
    assert doc.numero is not None  # tipo com numeração automática

    # 3. Assinatura simples
    assinatura_obj = await assinatura.assinar_documento(
        db, tenant_id, user, documento_id=doc.id, papel_cargo="Chefe de Divisão"
    )
    assert assinatura_obj.nivel == "SIMPLES"
    await db.refresh(doc)
    assert doc.situacao == SituacaoDocumento.ASSINADO.value

    # 4. Imutabilidade: assinado não pode ser editado
    with pytest.raises(HTTPException) as exc:
        await documento.editar_documento(
            db, tenant_id, user, documento_id=doc.id, conteudo_html="<p>tentativa</p>"
        )
    assert exc.value.status_code == 409

    # 5. Tramitação simultânea
    criadas = await tramitacao.tramitar(
        db,
        tenant_id,
        user,
        processo_id=processo.id,
        unidade_origem_id=cenario["unidade"].id,
        destinos=[{"unidade_id": destino.id, "prazo_dias": 5}],
    )
    assert len(criadas) == 1

    # 6. Conclusão na unidade
    processo = await concluir(
        db, tenant_id, user, processo_id=processo.id, motivo="Demanda atendida"
    )
    assert processo.situacao == SituacaoProcesso.ENCERRADO.value

    # 7. Andamentos registrados
    result = await db.execute(select(Andamento).where(Andamento.processo_id == processo.id))
    andamentos = list(result.scalars())
    assert len(andamentos) >= 4


async def test_arquivar_e_reabrir_processo(cenario):
    from app.services.processo import arquivar, reabrir

    db = cenario["db"]
    tenant_id = cenario["tenant_id"]
    user = cenario["user"]

    tipo = await _tipo_processo(db, tenant_id, "REQ_GERAL")
    processo = await autuacao.autuar(
        db,
        tenant_id,
        user,
        tipo_processo_id=tipo.id,
        especificacao="Processo a arquivar",
        interessados=[{"tipo_pessoa": "PF", "nome": "João", "cpf_cnpj": "11144477735"}],
        nivel_acesso=NivelAcesso.PUBLICO.value,
    )

    processo = await arquivar(db, tenant_id, user, processo_id=processo.id)
    assert processo.situacao == SituacaoProcesso.ARQUIVADO.value

    processo = await reabrir(db, tenant_id, user, processo_id=processo.id, motivo="Retomar análise")
    assert processo.situacao == SituacaoProcesso.EM_TRAMITACAO.value


async def test_documento_nao_pode_ser_menos_restritivo(cenario):
    db = cenario["db"]
    tenant_id = cenario["tenant_id"]
    user = cenario["user"]

    tipo = await _tipo_processo(db, tenant_id, "LICENCA_OBRA")
    # Licença permite RESTRITO; autuar como RESTRITO exige hipótese legal.
    from app.models.dominio import HipoteseLegal

    result = await db.execute(
        select(HipoteseLegal).where(
            HipoteseLegal.tenant_id == tenant_id, HipoteseLegal.codigo == "INF_PESSOAL"
        )
    )
    hipotese = result.scalar_one()

    processo = await autuacao.autuar(
        db,
        tenant_id,
        user,
        tipo_processo_id=tipo.id,
        especificacao="Alvará com dado pessoal",
        interessados=[{"nome": "João"}],
        nivel_acesso=NivelAcesso.RESTRITO.value,
        hipotese_legal_id=hipotese.id,
    )

    # Documento PUBLICO dentro de processo RESTRITO é proibido.
    with pytest.raises(HTTPException) as exc:
        await documento.criar_documento_interno(
            db,
            tenant_id,
            user,
            processo_id=processo.id,
            titulo="Parecer",
            conteudo_html="<p>x</p>",
            nivel_acesso=NivelAcesso.PUBLICO.value,
            unidade_id=cenario["unidade"].id,
        )
    assert exc.value.status_code == 422


async def test_restricao_exige_hipotese_legal(cenario):
    db = cenario["db"]
    tenant_id = cenario["tenant_id"]
    user = cenario["user"]
    tipo = await _tipo_processo(db, tenant_id, "LICENCA_OBRA")

    with pytest.raises(HTTPException) as exc:
        await autuacao.autuar(
            db,
            tenant_id,
            user,
            tipo_processo_id=tipo.id,
            especificacao="Sem hipótese",
            interessados=[{"nome": "X"}],
            nivel_acesso=NivelAcesso.RESTRITO.value,
        )
    assert exc.value.status_code == 422
