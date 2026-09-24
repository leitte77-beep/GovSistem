"""Testes de persistência e ciclo de vida dos modelos documentais (DB).

Cobrem: criação, versão ativa imutável, nova versão sem alterar a ativa,
aprovação explícita para ativar, apenas versão aprovada vira padrão e um
segundo modelo no mesmo escopo não sobrescreve o padrão existente.
"""

from __future__ import annotations

import uuid

import pytest
import pytest_asyncio
from sqlalchemy import select

from app.document_model.schemas import (
    DM_STATUS_ACTIVE,
    DM_STATUS_ARCHIVED,
    DM_STATUS_IN_APPROVAL,
    DocumentField,
    DocumentModelConfig,
    FieldType,
    SectionKind,
    SectionSpec,
    SignatureEntrySpec,
)
from app.document_model.service import (
    ModelTransitionError,
    approve_version,
    archive_model,
    config_of_active,
    create_model,
    create_new_version,
    submit_for_approval,
)
from app.models.document_model import DocumentModel
from app.models.organization import Organization


def _config(purpose="Concessão de férias", titulo="PORTARIA Nº 001/2026") -> DocumentModelConfig:
    return DocumentModelConfig(
        purpose=purpose,
        scope_document_type="portaria",
        document_title=titulo,
        fields=[
            DocumentField(key="servidor", label="Servidor", type=FieldType.TEXT, required=True),
        ],
        sections=[
            SectionSpec(id="art1", kind=SectionKind.ARTICLE, text="Concede férias a {{servidor}}."),
            SectionSpec(
                id="assinatura",
                kind=SectionKind.SIGNATURE_BLOCK,
                entries=[SignatureEntrySpec(name="{{servidor}}", role="Prefeito Municipal")],
            ),
        ],
    )


@pytest_asyncio.fixture
async def org_id(db_session) -> uuid.UUID:
    org = Organization(name="Prefeitura Teste", slug="pf-dm", cnpj="12345678000192")
    db_session.add(org)
    await db_session.flush()
    return org.id


async def _reload(db_session, model_id: uuid.UUID) -> DocumentModel:
    result = await db_session.execute(select(DocumentModel).where(DocumentModel.id == model_id))
    model = result.scalar_one()
    # Força o carregamento eager da relação de versões dentro do await.
    return model


async def test_lifecycle_create_submit_approve(db_session, org_id):
    model = await create_model(
        db_session,
        organization_id=org_id,
        slug="portaria-ferias",
        name="Portaria de Férias",
        config=_config(),
    )
    assert model.status == "draft" and model.active_version is None

    await submit_for_approval(db_session, model.id, 1)
    reloaded = await _reload(db_session, model.id)
    assert reloaded.status == DM_STATUS_IN_APPROVAL

    await approve_version(db_session, model.id, 1)
    reloaded = await _reload(db_session, model.id)
    assert reloaded.status == DM_STATUS_ACTIVE
    assert reloaded.active_version == 1
    assert reloaded.is_default is True
    assert config_of_active(reloaded) is not None


async def test_new_version_does_not_change_active(db_session, org_id):
    model = await create_model(
        db_session,
        organization_id=org_id,
        slug="portaria-ferias",
        name="Portaria de Férias",
        config=_config(),
    )
    await submit_for_approval(db_session, model.id, 1)
    await approve_version(db_session, model.id, 1)

    v2 = await create_new_version(
        db_session, model.id, _config(titulo="PORTARIA Nº 002/2026"), change_reason="revisão"
    )
    assert v2.version_number == 2 and v2.status == "draft"
    # A versão ativa NÃO mudou nem seu conteúdo.
    model = await _reload(db_session, model.id)
    assert model.active_version == 1
    active_cfg = config_of_active(model)
    assert active_cfg.document_title == "PORTARIA Nº 001/2026"


async def test_only_in_approval_version_can_be_activated(db_session, org_id):
    model = await create_model(
        db_session,
        organization_id=org_id,
        slug="portaria-ferias",
        name="Portaria de Férias",
        config=_config(),
    )
    with pytest.raises(ModelTransitionError):
        await approve_version(db_session, model.id, 1)  # ainda draft


async def test_second_model_same_scope_keeps_first_default(db_session, org_id):
    m1 = await create_model(
        db_session, organization_id=org_id, slug="portaria-a", name="A", config=_config(titulo="A")
    )
    await submit_for_approval(db_session, m1.id, 1)
    await approve_version(db_session, m1.id, 1)

    m2 = await create_model(
        db_session, organization_id=org_id, slug="portaria-b", name="B", config=_config(titulo="B")
    )
    await submit_for_approval(db_session, m2.id, 1)
    await approve_version(db_session, m2.id, 1)

    first = await _reload(db_session, m1.id)
    second = await _reload(db_session, m2.id)
    assert first.is_default is True
    assert second.is_default is False
    assert second.status == DM_STATUS_ACTIVE and second.active_version == 1


async def test_archive_clears_default(db_session, org_id):
    model = await create_model(
        db_session,
        organization_id=org_id,
        slug="portaria-ferias",
        name="Portaria de Férias",
        config=_config(),
    )
    await submit_for_approval(db_session, model.id, 1)
    await approve_version(db_session, model.id, 1)
    await archive_model(db_session, model.id)
    reloaded = await _reload(db_session, model.id)
    assert reloaded.status == DM_STATUS_ARCHIVED
    assert reloaded.is_default is False
