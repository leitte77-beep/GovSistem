"""Motor de permissões: perfis, herança, negativas e classificação."""

import uuid

import pytest

from app.models.enums import (
    Classification,
    Permission,
    PermissionEffect,
    ResourceType,
    SubjectType,
)
from app.models.permission import PermissionEntry
from app.services import folders as folder_service
from app.services import permissions as perm


async def _pasta(db, mundo, **kwargs):
    return await folder_service.create_folder(
        db,
        user=mundo["usuarios"]["admin"],
        name=kwargs.pop("nome", f"Pasta {uuid.uuid4().hex[:6]}"),
        secretariat_id=kwargs.pop("secretariat_id", mundo["saude"].id),
        department_id=kwargs.pop("department_id", mundo["adm_saude"].id),
        **kwargs,
    )


async def _perms(db, user, folder):
    ctx = await perm.build_folder_context(db, folder)
    return await perm.effective_permissions(db, user, ctx)


async def test_admin_geral_tem_todas_as_permissoes(db, mundo):
    pasta = await _pasta(db, mundo)
    perms = await _perms(db, mundo["usuarios"]["admin"], pasta)
    assert perms == perm.ALL_PERMISSIONS


async def test_colaborador_no_proprio_setor(db, mundo):
    pasta = await _pasta(db, mundo)
    perms = await _perms(db, mundo["usuarios"]["colaborador"], pasta)
    assert Permission.UPLOAD.value in perms
    assert Permission.VIEW.value in perms
    assert Permission.DELETE.value not in perms
    assert Permission.MANAGE_PERMISSIONS.value not in perms


async def test_colaborador_de_outro_setor_nao_ve(db, mundo):
    pasta = await _pasta(db, mundo)
    perms = await _perms(db, mundo["usuarios"]["vigilancia"], pasta)
    assert perms == set()


async def test_leitor_so_le(db, mundo):
    pasta = await _pasta(db, mundo)
    perms = await _perms(db, mundo["usuarios"]["leitor"], pasta)
    assert perms == {
        Permission.VIEW.value,
        Permission.VIEW_METADATA.value,
        Permission.DOWNLOAD.value,
    }


async def test_gestor_do_setor_gerencia(db, mundo):
    pasta = await _pasta(db, mundo)
    perms = await _perms(db, mundo["usuarios"]["gestor"], pasta)
    assert Permission.DELETE.value in perms
    assert Permission.APPROVE.value in perms
    assert Permission.MANAGE_BACKUP.value not in perms


async def test_admin_de_secretaria_alcanca_todos_os_setores_dela(db, mundo):
    pasta = await _pasta(db, mundo, department_id=mundo["vigilancia"].id)
    perms = await _perms(db, mundo["usuarios"]["admin_saude"], pasta)
    assert Permission.MANAGE_PERMISSIONS.value in perms


async def test_admin_de_secretaria_nao_alcanca_outra_secretaria(db, mundo):
    pasta = await _pasta(
        db,
        mundo,
        secretariat_id=mundo["educacao"].id,
        department_id=mundo["adm_educacao"].id,
    )
    perms = await _perms(db, mundo["usuarios"]["admin_saude"], pasta)
    assert perms == set()


async def test_auditor_le_mas_nao_altera(db, mundo):
    pasta = await _pasta(db, mundo)
    perms = await _perms(db, mundo["usuarios"]["auditor"], pasta)
    assert Permission.VIEW.value in perms
    assert Permission.VIEW_HISTORY.value in perms
    assert Permission.EDIT_METADATA.value not in perms
    assert Permission.DELETE.value not in perms


async def test_permissao_explicita_concede_acesso_fora_do_setor(db, mundo):
    pasta = await _pasta(db, mundo)
    alvo = mundo["usuarios"]["vigilancia"]
    db.add(
        PermissionEntry(
            institution_id=mundo["instituicao"].id,
            resource_type=ResourceType.FOLDER.value,
            resource_id=pasta.id,
            subject_type=SubjectType.USER.value,
            subject_id=alvo.id,
            permissions=[Permission.VIEW.value, Permission.DOWNLOAD.value],
            effect=PermissionEffect.ALLOW.value,
        )
    )
    await db.flush()
    perms = await _perms(db, alvo, pasta)
    assert perms == {Permission.VIEW.value, Permission.DOWNLOAD.value}


async def test_heranca_de_permissao_para_subpasta(db, mundo):
    raiz = await _pasta(db, mundo, nome="Raiz")
    filha = await folder_service.create_folder(
        db,
        user=mundo["usuarios"]["admin"],
        name="Subpasta",
        parent_id=raiz.id,
    )
    alvo = mundo["usuarios"]["vigilancia"]
    db.add(
        PermissionEntry(
            institution_id=mundo["instituicao"].id,
            resource_type=ResourceType.FOLDER.value,
            resource_id=raiz.id,
            subject_type=SubjectType.USER.value,
            subject_id=alvo.id,
            permissions=[Permission.VIEW.value],
            apply_to_children=True,
        )
    )
    await db.flush()
    assert Permission.VIEW.value in await _perms(db, alvo, filha)


async def test_permissao_sem_propagacao_nao_alcanca_subpasta(db, mundo):
    raiz = await _pasta(db, mundo, nome="Raiz sem propagacao")
    filha = await folder_service.create_folder(
        db, user=mundo["usuarios"]["admin"], name="Filha", parent_id=raiz.id
    )
    alvo = mundo["usuarios"]["vigilancia"]
    db.add(
        PermissionEntry(
            institution_id=mundo["instituicao"].id,
            resource_type=ResourceType.FOLDER.value,
            resource_id=raiz.id,
            subject_type=SubjectType.USER.value,
            subject_id=alvo.id,
            permissions=[Permission.VIEW.value],
            apply_to_children=False,
        )
    )
    await db.flush()
    assert Permission.VIEW.value in await _perms(db, alvo, raiz)
    assert Permission.VIEW.value not in await _perms(db, alvo, filha)


async def test_negativa_vence_concessao_no_mesmo_nivel(db, mundo):
    pasta = await _pasta(db, mundo)
    alvo = mundo["usuarios"]["colaborador"]
    db.add(
        PermissionEntry(
            institution_id=mundo["instituicao"].id,
            resource_type=ResourceType.FOLDER.value,
            resource_id=pasta.id,
            subject_type=SubjectType.USER.value,
            subject_id=alvo.id,
            permissions=[Permission.DOWNLOAD.value],
            effect=PermissionEffect.DENY.value,
        )
    )
    await db.flush()
    perms = await _perms(db, alvo, pasta)
    assert Permission.DOWNLOAD.value not in perms
    assert Permission.VIEW.value in perms


async def test_nivel_mais_especifico_reverte_negativa_do_pai(db, mundo):
    raiz = await _pasta(db, mundo, nome="Pai restrito")
    filha = await folder_service.create_folder(
        db, user=mundo["usuarios"]["admin"], name="Filha liberada", parent_id=raiz.id
    )
    alvo = mundo["usuarios"]["colaborador"]
    db.add_all(
        [
            PermissionEntry(
                institution_id=mundo["instituicao"].id,
                resource_type=ResourceType.FOLDER.value,
                resource_id=raiz.id,
                subject_type=SubjectType.USER.value,
                subject_id=alvo.id,
                permissions=[Permission.DOWNLOAD.value],
                effect=PermissionEffect.DENY.value,
                apply_to_children=True,
            ),
            PermissionEntry(
                institution_id=mundo["instituicao"].id,
                resource_type=ResourceType.FOLDER.value,
                resource_id=filha.id,
                subject_type=SubjectType.USER.value,
                subject_id=alvo.id,
                permissions=[Permission.DOWNLOAD.value],
                effect=PermissionEffect.ALLOW.value,
            ),
        ]
    )
    await db.flush()
    assert Permission.DOWNLOAD.value not in await _perms(db, alvo, raiz)
    assert Permission.DOWNLOAD.value in await _perms(db, alvo, filha)


async def test_permissao_expirada_e_ignorada(db, mundo):
    from datetime import datetime, timedelta, timezone

    pasta = await _pasta(db, mundo)
    alvo = mundo["usuarios"]["vigilancia"]
    db.add(
        PermissionEntry(
            institution_id=mundo["instituicao"].id,
            resource_type=ResourceType.FOLDER.value,
            resource_id=pasta.id,
            subject_type=SubjectType.USER.value,
            subject_id=alvo.id,
            permissions=[Permission.VIEW.value],
            expires_at=datetime.now(timezone.utc) - timedelta(hours=1),
        )
    )
    await db.flush()
    assert await _perms(db, alvo, pasta) == set()


async def test_sigiloso_bloqueia_link_externo_e_download_sem_concessao(db, mundo):
    pasta = await _pasta(
        db, mundo, nome="Sigilosa", classification=Classification.SIGILOSO.value
    )
    perms = await _perms(db, mundo["usuarios"]["gestor"], pasta)
    assert Permission.SHARE_EXTERNAL.value not in perms
    assert Permission.DOWNLOAD.value not in perms
    assert Permission.VIEW.value in perms


async def test_sigiloso_permite_download_com_concessao_explicita(db, mundo):
    pasta = await _pasta(
        db, mundo, nome="Sigilosa 2", classification=Classification.SIGILOSO.value
    )
    alvo = mundo["usuarios"]["gestor"]
    db.add(
        PermissionEntry(
            institution_id=mundo["instituicao"].id,
            resource_type=ResourceType.FOLDER.value,
            resource_id=pasta.id,
            subject_type=SubjectType.USER.value,
            subject_id=alvo.id,
            permissions=[Permission.DOWNLOAD.value],
        )
    )
    await db.flush()
    assert Permission.DOWNLOAD.value in await _perms(db, alvo, pasta)


async def test_confidencial_exige_pasta_liberada_para_link_externo(db, mundo):
    pasta = await _pasta(
        db,
        mundo,
        nome="Confidencial",
        classification=Classification.CONFIDENCIAL.value,
        allow_external_share=False,
    )
    perms = await _perms(db, mundo["usuarios"]["gestor"], pasta)
    assert Permission.SHARE_EXTERNAL.value not in perms

    liberada = await _pasta(
        db,
        mundo,
        nome="Confidencial liberada",
        classification=Classification.CONFIDENCIAL.value,
        allow_external_share=True,
    )
    perms = await _perms(db, mundo["usuarios"]["gestor"], liberada)
    assert Permission.SHARE_EXTERNAL.value in perms


@pytest.mark.parametrize(
    "perfil,esperado",
    [
        ("colaborador", True),
        ("leitor", False),
        ("vigilancia", False),
    ],
)
async def test_escopo_de_visibilidade(db, mundo, perfil, esperado):
    """`visible_scope` alimenta pesquisa e listagens — precisa fechar por padrão."""
    escopo = await perm.visible_scope(db, mundo["usuarios"][perfil])
    tem_setor = mundo["adm_saude"].id in escopo["department_ids"]
    assert tem_setor is (perfil in {"colaborador", "leitor", "gestor"})
    assert esperado in {True, False}
