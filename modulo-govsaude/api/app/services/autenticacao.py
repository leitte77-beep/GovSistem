"""Login local de fallback, bloqueio, MFA e emissão de tokens.

O caminho principal continua sendo o SSO da plataforma. O login local existe
para o caso previsto em B.12-052 (CPF, e-mail ou nome de acesso) e é protegido
por bcrypt custo 12, política de senha, bloqueio por tentativas, MFA TOTP e
janela de acesso opcional por usuário.
"""

from __future__ import annotations

import logging
import uuid
from datetime import datetime, time, timedelta, timezone
from zoneinfo import ZoneInfo

from sqlalchemy import func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.core.br_validators import somente_digitos, validar_cpf
from app.core.config import settings
from app.core.errors import Locked, PermissionDenied, Unauthenticated, Unprocessable
from app.core.security import (
    agora,
    create_access_token,
    create_refresh_token,
    hash_password,
    hmac_hex,
    senha_expira_em,
    verify_password,
)
from app.models.enums import AcaoAuditoria, ResultadoAuditoria
from app.models.nucleo import Grupo, HistoricoSenha, Organizacao, Usuario, UsuarioGrupo
from app.services.auditoria import registrar

logger = logging.getLogger("govsaude.auth")


def _carregar_grupos(stmt):
    return stmt.options(
        selectinload(Usuario.grupos)
        .selectinload(UsuarioGrupo.grupo)
        .selectinload(Grupo.permissoes)
    )


async def obter_usuario(db: AsyncSession, usuario_id: uuid.UUID) -> Usuario | None:
    return await db.scalar(
        _carregar_grupos(select(Usuario).where(Usuario.id == usuario_id))
    )


async def obter_tenant(db: AsyncSession, referencia: str | uuid.UUID | None) -> Organizacao | None:
    if referencia is None:
        return None
    texto = str(referencia)
    filtros = [Organizacao.slug == texto, Organizacao.externo_id == texto]
    try:
        filtros.append(Organizacao.id == uuid.UUID(texto))
    except ValueError:
        pass
    return await db.scalar(select(Organizacao).where(or_(*filtros)))


def _normalizar_identificador(identificador: str) -> str:
    return (identificador or "").strip().lower()


async def _buscar_usuario(
    db: AsyncSession, tenant_id: uuid.UUID | None, identificador: str
) -> tuple[Usuario | None, bool]:
    """Retorna (usuário, ambíguo)."""
    limpo = _normalizar_identificador(identificador)
    filtros = []
    if validar_cpf(identificador):
        filtros.append(Usuario.cpf_hash == hmac_hex(somente_digitos(identificador)))
    else:
        filtros.append(func.lower(Usuario.email) == limpo)
        filtros.append(func.lower(Usuario.nome_acesso) == limpo)
    stmt = _carregar_grupos(select(Usuario).where(or_(*filtros), Usuario.baixa_em.is_(None)))
    if tenant_id:
        stmt = stmt.where(Usuario.tenant_id == tenant_id)
    encontrados = (await db.execute(stmt)).scalars().unique().all()
    if len(encontrados) == 1:
        return encontrados[0], False
    if len(encontrados) > 1:
        return None, True
    return None, False


def validar_janela(usuario: Usuario, tenant: Organizacao) -> bool:
    """Janela individual do usuário (reaproveitada pela Fase 0)."""
    if not usuario.hora_inicio_permitida or not usuario.hora_fim_permitida:
        return True
    try:
        tz = ZoneInfo(tenant.fuso_horario or settings.DEFAULT_TIMEZONE)
    except Exception:  # noqa: BLE001
        tz = ZoneInfo(settings.DEFAULT_TIMEZONE)
    agora_local = datetime.now(tz).time().replace(tzinfo=None)
    inicio: time = usuario.hora_inicio_permitida
    fim: time = usuario.hora_fim_permitida
    if inicio <= fim:
        return inicio <= agora_local <= fim
    return agora_local >= inicio or agora_local <= fim


def _validar_janela(usuario: Usuario, tenant: Organizacao) -> bool:
    return validar_janela(usuario, tenant)


def _verificar_mfa(usuario: Usuario, codigo: str | None) -> bool:
    if not usuario.mfa_ativo:
        return True
    if not codigo or not usuario.mfa_secret_cifrado:
        return False
    from app.core.encryption import descriptografar

    try:
        import pyotp

        segredo = descriptografar(usuario.mfa_secret_cifrado)
        return bool(segredo and pyotp.TOTP(segredo).verify(codigo.strip(), valid_window=1))
    except Exception:  # noqa: BLE001
        return False


def _aware(valor: datetime | None) -> datetime | None:
    if valor is None:
        return None
    return valor if valor.tzinfo else valor.replace(tzinfo=timezone.utc)


def _tokens(usuario: Usuario) -> dict:
    tenant_id = usuario.tenant_id
    roles = [ug.grupo.codigo for ug in usuario.grupos if ug.ativo and ug.grupo]
    access = create_access_token(
        usuario.id,
        tenant_id=tenant_id,
        roles=roles,
        token_version=usuario.token_version,
        token_type="access",
    )
    refresh = create_refresh_token(
        usuario.id, tenant_id=tenant_id, token_version=usuario.token_version
    )
    return {
        "access_token": access,
        "refresh_token": refresh,
        "token_type": "Bearer",
        "expires_in": settings.ACCESS_TOKEN_EXPIRE_MINUTES * 60,
    }


async def autenticar_local(
    db: AsyncSession,
    *,
    identificador: str,
    senha: str,
    tenant_ref: str | None,
    codigo_mfa: str | None,
    cliente: dict,
) -> tuple[Usuario, Organizacao, dict]:
    tenant = await obter_tenant(db, tenant_ref)
    if tenant_ref and tenant is None:
        raise Unauthenticated("Organização não encontrada.")
    usuario, ambiguo = await _buscar_usuario(db, tenant.id if tenant else None, identificador)
    if ambiguo:
        raise Unauthenticated(
            "Há mais de um vínculo para este identificador. Informe a organização."
        )
    if usuario is None or not usuario.ativo or usuario.baixa_em is not None:
        if tenant is not None:
            await registrar(
                db,
                acao=AcaoAuditoria.LOGIN_FALHA,
                tenant_id=tenant.id,
                resultado=ResultadoAuditoria.FALHA,
                detalhe="Identificador inexistente, inativo ou baixado.",
                cliente=cliente,
            )
            await db.commit()
        raise Unauthenticated("Credenciais inválidas.")
    tenant = await db.get(Organizacao, usuario.tenant_id)
    if tenant is None or not tenant.ativa:
        raise Unauthenticated("Organização inativa.")

    bloqueado_ate = _aware(usuario.bloqueado_ate)
    if bloqueado_ate and bloqueado_ate > agora():
        restante = max(1, int((bloqueado_ate - agora()).total_seconds() // 60))
        raise Locked(
            f"Conta temporariamente bloqueada. Tente novamente em {restante} minuto(s).",
            extra={"bloqueado_ate": bloqueado_ate.isoformat()},
        )

    if not _validar_janela(usuario, tenant):
        await registrar(
            db,
            acao=AcaoAuditoria.LOGIN_FALHA,
            usuario=usuario,
            resultado=ResultadoAuditoria.NEGADO,
            detalhe="Fora da janela de acesso permitida.",
            cliente=cliente,
        )
        await db.commit()
        raise PermissionDenied("Acesso fora do horário permitido para este usuário.")

    from app.services.janela_acesso import acesso_bloqueado

    restricao = await acesso_bloqueado(db, usuario)
    if restricao is not None:
        await registrar(
            db,
            acao=AcaoAuditoria.LOGIN_FALHA,
            usuario=usuario,
            resultado=ResultadoAuditoria.NEGADO,
            detalhe="Fora da restrição de horário por grupo/estabelecimento.",
            cliente=cliente,
        )
        await db.commit()
        raise PermissionDenied(
            "Acesso fora do horário permitido pela restrição do grupo/unidade."
        )

    if not verify_password(senha, usuario.password_hash):
        usuario.tentativas_falhas += 1
        if usuario.tentativas_falhas >= settings.PASSWORD_MAX_FAILURES:
            usuario.bloqueado_ate = agora() + timedelta(
                minutes=settings.PASSWORD_LOCKOUT_MINUTES
            )
        await registrar(
            db,
            acao=AcaoAuditoria.LOGIN_FALHA,
            usuario=usuario,
            resultado=ResultadoAuditoria.FALHA,
            detalhe="Senha inválida.",
            cliente=cliente,
        )
        await db.commit()
        if usuario.tentativas_falhas >= settings.PASSWORD_MAX_FAILURES:
            raise Locked(
                "Conta temporariamente bloqueada por excesso de tentativas.",
                extra={"bloqueado_ate": usuario.bloqueado_ate.isoformat()},
            )
        raise Unauthenticated("Credenciais inválidas.")

    if not _verificar_mfa(usuario, codigo_mfa):
        await registrar(
            db,
            acao=AcaoAuditoria.LOGIN_FALHA,
            usuario=usuario,
            resultado=ResultadoAuditoria.FALHA,
            detalhe="MFA inválido.",
            cliente=cliente,
        )
        await db.commit()
        raise Unauthenticated("Código de verificação inválido.")

    usuario.tentativas_falhas = 0
    usuario.bloqueado_ate = None
    usuario.ultimo_acesso_em = agora()
    usuario.ultima_atividade_em = agora()
    if usuario.senha_expira_em is None and usuario.password_hash:
        usuario.senha_expira_em = senha_expira_em()

    await registrar(
        db,
        acao=AcaoAuditoria.LOGIN,
        usuario=usuario,
        resultado=ResultadoAuditoria.SUCESSO,
        cliente=cliente,
    )
    await db.commit()
    usuario = await obter_usuario(db, usuario.id) or usuario
    return usuario, tenant, _tokens(usuario)


async def renovar_token(db: AsyncSession, refresh_token: str) -> dict:
    from app.core.security import decode_token

    try:
        payload = decode_token(refresh_token)
    except Exception as exc:  # noqa: BLE001
        raise Unauthenticated("Token de renovação inválido ou expirado.") from exc
    if payload.get("type") != "refresh":
        raise Unauthenticated("Tipo de token inválido.")
    usuario = await obter_usuario(db, uuid.UUID(str(payload["sub"])))
    if usuario is None or not usuario.ativo:
        raise Unauthenticated("Usuário não encontrado ou inativo.")
    if int(payload.get("ver", 0) or 0) != int(usuario.token_version):
        raise Unauthenticated("Sessão revogada.")
    return _tokens(usuario)


def validar_politica_senha(senha: str, *, tenant_valor: dict | None = None) -> list[str]:
    politica = tenant_valor or {}
    minimo = int(politica.get("minimo", settings.PASSWORD_MIN_LENGTH))
    erros = []
    if len(senha) < minimo:
        erros.append(f"A senha deve ter ao menos {minimo} caracteres.")
    if sum(c.isupper() for c in senha) < int(
        politica.get("maiuscula", settings.PASSWORD_MIN_UPPERCASE)
    ):
        erros.append("A senha deve conter ao menos uma letra maiúscula.")
    if sum(c.islower() for c in senha) < int(
        politica.get("minuscula", settings.PASSWORD_MIN_LOWERCASE)
    ):
        erros.append("A senha deve conter ao menos uma letra minúscula.")
    if sum(c.isdigit() for c in senha) < int(politica.get("digito", settings.PASSWORD_MIN_DIGITS)):
        erros.append("A senha deve conter ao menos um dígito.")
    if sum(not c.isalnum() for c in senha) < int(
        politica.get("simbolo", settings.PASSWORD_MIN_SYMBOLS)
    ):
        erros.append("A senha deve conter ao menos um símbolo.")
    if len(senha.encode("utf-8")) > 72:
        erros.append("A senha excede o limite técnico de 72 bytes.")
    return erros


async def _limite_historico(db: AsyncSession, tenant_id: uuid.UUID) -> int:
    from app.services.configuracoes import valor as valor_config

    politica = await valor_config(db, tenant_id, "seguranca.politica_senha", {}) or {}
    try:
        return max(0, int(politica.get("historico", settings.PASSWORD_HISTORY_SIZE)))
    except (TypeError, ValueError):
        return settings.PASSWORD_HISTORY_SIZE


async def _senha_ja_usada(
    db: AsyncSession, usuario: Usuario, nova_senha: str, limite: int
) -> bool:
    if limite <= 0:
        return False
    hashes = (
        await db.execute(
            select(HistoricoSenha.password_hash)
            .where(HistoricoSenha.usuario_id == usuario.id)
            .order_by(HistoricoSenha.created_at.desc())
            .limit(limite)
        )
    ).scalars().all()
    if usuario.password_hash:
        hashes.append(usuario.password_hash)
    return any(verify_password(nova_senha, h) for h in hashes)


async def alterar_senha(
    db: AsyncSession, usuario: Usuario, *, senha_atual: str, nova_senha: str, cliente: dict
) -> None:
    if not verify_password(senha_atual, usuario.password_hash):
        raise Unauthenticated("Senha atual incorreta.")
    erros = validar_politica_senha(nova_senha)
    if erros:
        raise Unprocessable("A nova senha não atende à política.", errors=[
            {"campo": "nova_senha", "mensagem": e, "codigo_regra": "politica_senha"}
            for e in erros
        ])
    limite = await _limite_historico(db, usuario.tenant_id)
    if usuario.password_hash:
        # Usuários legados/SSO podem ainda não ter histórico: registra o hash
        # atual antes de comparar, para que a primeira troca já respeite a regra.
        db.add(
            HistoricoSenha(
                tenant_id=usuario.tenant_id,
                usuario_id=usuario.id,
                password_hash=usuario.password_hash,
            )
        )
        await db.flush()
    if await _senha_ja_usada(db, usuario, nova_senha, limite):
        raise Unprocessable(
            "A nova senha já foi utilizada recentemente.",
            code="senha_reutilizada",
            errors=[
                {
                    "campo": "nova_senha",
                    "mensagem": "Escolha uma senha diferente das últimas utilizadas.",
                    "codigo_regra": "historico_senha",
                }
            ],
        )
    novo_hash = hash_password(nova_senha)
    db.add(
        HistoricoSenha(
            tenant_id=usuario.tenant_id,
            usuario_id=usuario.id,
            password_hash=novo_hash,
        )
    )
    usuario.password_hash = novo_hash
    usuario.senha_alterada_em = agora()
    usuario.senha_expira_em = senha_expira_em()
    usuario.token_version += 1
    await registrar(
        db,
        acao=AcaoAuditoria.ATUALIZAR,
        usuario=usuario,
        recurso="usuario",
        recurso_id=usuario.id,
        detalhe="Alteração de senha.",
        cliente=cliente,
    )
    await db.commit()


async def ativar_mfa(db: AsyncSession, usuario: Usuario) -> tuple[str, str]:
    import pyotp

    segredo = pyotp.random_base32()
    from app.core.encryption import criptografar

    usuario.mfa_secret_cifrado = criptografar(segredo)
    await db.flush()
    uri = pyotp.totp.TOTP(segredo).provisioning_uri(
        name=usuario.email, issuer_name=settings.MFA_ISSUER
    )
    return segredo, uri


async def confirmar_mfa(db: AsyncSession, usuario: Usuario, codigo: str, cliente: dict) -> None:
    import pyotp

    from app.core.encryption import descriptografar

    if not usuario.mfa_secret_cifrado:
        raise Unauthenticated("MFA não iniciado.")
    segredo = descriptografar(usuario.mfa_secret_cifrado)
    if not segredo or not pyotp.TOTP(segredo).verify(codigo.strip(), valid_window=1):
        raise Unauthenticated("Código de verificação inválido.")
    usuario.mfa_ativo = True
    await registrar(
        db,
        acao=AcaoAuditoria.MFA,
        usuario=usuario,
        detalhe="MFA TOTP ativado.",
        cliente=cliente,
    )
    await db.commit()


def inatividade_excedida(usuario: Usuario) -> bool:
    if not usuario.ultima_atividade_em:
        return False
    ultima = _aware(usuario.ultima_atividade_em)
    return bool(ultima) and ultima + timedelta(minutes=settings.INACTIVITY_MINUTES) < agora()


def utcnow() -> datetime:
    return datetime.now(timezone.utc)
