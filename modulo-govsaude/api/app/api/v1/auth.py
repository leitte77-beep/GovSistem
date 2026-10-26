"""Autenticação, sessão, MFA e termo de uso."""

from __future__ import annotations

from datetime import datetime, timezone

from fastapi import APIRouter, Depends, Request
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.auth import get_current_user
from app.core.autorizacao import exigir, permissoes_efetivas
from app.core.database import get_db
from app.core.permissoes import Permissao
from app.core.security import agora
from app.models.enums import AcaoAuditoria
from app.models.nucleo import Organizacao, Usuario
from app.schemas.auth import (
    AlterarSenhaRequest,
    GrupoResumo,
    LoginRequest,
    MfaAtivacaoResponse,
    MfaCodigoRequest,
    RefreshRequest,
    TermoAceiteRequest,
    TermoCreate,
    TermoResumo,
    TokenResponse,
    UsuarioMe,
)
from app.services.auditoria import dados_do_cliente, registrar
from app.services.autenticacao import (
    _tokens,
    alterar_senha,
    ativar_mfa,
    autenticar_local,
    confirmar_mfa,
    obter_usuario,
    renovar_token,
)
from app.services.termos import registrar_aceite, termo_pendente, termo_vigente
from app.services.usuarios import menus_para

router = APIRouter(prefix="/auth", tags=["Autenticação"])


def _grupos(usuario: Usuario) -> list[GrupoResumo]:
    from app.core.autorizacao import grupos_ativos

    return [
        GrupoResumo(
            id=ug.grupo.id,
            codigo=ug.grupo.codigo,
            nome=ug.grupo.nome,
            estabelecimento_id=ug.estabelecimento_id,
            equipe_id=ug.equipe_id,
        )
        for ug in grupos_ativos(usuario)
    ]


async def _montar_me(db: AsyncSession, usuario: Usuario) -> UsuarioMe:
    perms = permissoes_efetivas(usuario)
    organizacao = await db.get(Organizacao, usuario.tenant_id)
    pendente = await termo_pendente(db, usuario)
    senha_expirada = bool(usuario.senha_expira_em and usuario.senha_expira_em < agora())
    return UsuarioMe(
        id=usuario.id,
        nome=usuario.nome,
        email=usuario.email,
        tenant_id=usuario.tenant_id,
        organizacao_nome=organizacao.nome if organizacao else None,
        grupos=_grupos(usuario),
        permissoes=sorted(perms),
        menus=menus_para(perms),
        mfa_ativo=usuario.mfa_ativo,
        senha_expirada=senha_expirada,
        termo_pendente=pendente is not None,
        termo_versao=pendente.versao if pendente else usuario.termo_versao_aceita,
    )


@router.post("/login", response_model=TokenResponse, summary="Login local de fallback")
async def login(
    corpo: LoginRequest,
    request: Request,
    db: AsyncSession = Depends(get_db),
):
    """B.12-049, B.12-052 — login por CPF, e-mail ou nome de acesso."""
    cliente = dados_do_cliente(request)
    usuario, _tenant, tokens = await autenticar_local(
        db,
        identificador=corpo.identificador,
        senha=corpo.senha,
        tenant_ref=corpo.organizacao,
        codigo_mfa=corpo.codigo_mfa,
        cliente=cliente,
    )
    pendente = await termo_pendente(db, usuario)
    return TokenResponse(
        **tokens,
        senha_expirada=bool(usuario.senha_expira_em and usuario.senha_expira_em < agora()),
        termo_pendente=pendente is not None,
    )


@router.post("/refresh", response_model=TokenResponse, summary="Renovar token")
async def refresh(corpo: RefreshRequest, db: AsyncSession = Depends(get_db)):
    """B.12-049 — renovação de sessão."""
    return TokenResponse(**await renovar_token(db, corpo.refresh_token))


@router.get("/me", response_model=UsuarioMe, summary="Usuário, grupos, permissões e menus")
async def me(
    usuario: Usuario = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """B.12-050 — perfil e escopos do usuário."""
    return await _montar_me(db, usuario)


@router.post("/logout", summary="Encerrar sessões locais")
async def logout(
    request: Request,
    usuario: Usuario = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """B.12-049 — encerramento de sessão."""
    usuario.token_version += 1
    await registrar(
        db,
        acao=AcaoAuditoria.LOGOUT,
        usuario=usuario,
        cliente=dados_do_cliente(request),
    )
    await db.commit()
    return {"mensagem": "Sessão encerrada."}


@router.post("/alterar-senha", response_model=TokenResponse, summary="Alterar senha local")
async def mudar_senha(
    corpo: AlterarSenhaRequest,
    request: Request,
    usuario: Usuario = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """B.12-049, B.12-051 — troca de senha com política e hash forte."""
    await alterar_senha(
        db,
        usuario,
        senha_atual=corpo.senha_atual,
        nova_senha=corpo.nova_senha,
        cliente=dados_do_cliente(request),
    )
    atualizado = await obter_usuario(db, usuario.id)
    assert atualizado is not None
    return TokenResponse(**_tokens(atualizado))


@router.post("/mfa/ativar", response_model=MfaAtivacaoResponse, summary="Iniciar MFA TOTP")
async def iniciar_mfa(
    usuario: Usuario = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """B.12-049 — MFA."""
    segredo, uri = await ativar_mfa(db, usuario)
    await db.commit()
    return MfaAtivacaoResponse(
        segredo=segredo,
        uri=uri,
        mensagem="Confirme o código do aplicativo para ativar o MFA.",
    )


@router.post("/mfa/confirmar", summary="Confirmar e ativar MFA")
async def confirmar_mfa_endpoint(
    corpo: MfaCodigoRequest,
    request: Request,
    usuario: Usuario = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """B.12-049 — MFA."""
    await confirmar_mfa(
        db, usuario, corpo.codigo, dados_do_cliente(request)
    )
    return {"mensagem": "MFA ativado."}


@router.get("/termos", summary="Termo vigente e pendência de aceite")
async def termos(
    usuario: Usuario = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """B.12-023 — termo de uso vigente."""
    termo = await termo_vigente(db, usuario.tenant_id)
    pendente = await termo_pendente(db, usuario)
    return {
        "termo": TermoResumo.model_validate(termo).model_dump(mode="json") if termo else None,
        "pendente": pendente is not None,
    }


@router.post("/termos/aceitar", summary="Aceitar ou recusar o termo de uso")
async def aceitar_termo(
    corpo: TermoAceiteRequest,
    request: Request,
    usuario: Usuario = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """B.12-023 — aceite/recusa do termo."""
    cliente = dados_do_cliente(request)
    aceite = await registrar_aceite(
        db,
        usuario=usuario,
        termo_id=corpo.termo_id,
        aceito=corpo.aceito,
        ip=cliente.get("ip"),
        user_agent=cliente.get("user_agent"),
        cliente=cliente,
    )
    return {
        "situacao": aceite.situacao,
        "versao": aceite.versao,
        "mensagem": "Aceite registrado." if corpo.aceito else "Acesso bloqueado por recusa.",
    }


@router.post("/termos", response_model=TermoResumo, status_code=201, summary="Publicar termo")
async def publicar_termo(
    corpo: TermoCreate,
    usuario: Usuario = Depends(exigir(Permissao.TERMO_GERENCIAR)),
    db: AsyncSession = Depends(get_db),
):
    """B.12-023 — nova versão do termo."""
    from app.models.nucleo import TermoUso

    termo = TermoUso(
        tenant_id=usuario.tenant_id,
        versao=corpo.versao,
        titulo=corpo.titulo,
        conteudo_md=corpo.conteudo_md,
        vigencia_inicio=datetime.now(timezone.utc),
        obrigatorio=corpo.obrigatorio,
        ativo=True,
    )
    db.add(termo)
    await db.flush()
    await registrar(
        db,
        acao=AcaoAuditoria.TERMO,
        usuario=usuario,
        recurso="termo_uso",
        recurso_id=termo.id,
        detalhe=f"Publicação da versão {corpo.versao}.",
    )
    await db.commit()
    return TermoResumo.model_validate(termo)
