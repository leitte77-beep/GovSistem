"""Trilha de auditoria append-only e utilitários de sanitização."""

from __future__ import annotations

import uuid
from datetime import date, datetime
from typing import Any

from fastapi import Request
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.errors import NotFound, PermissionDenied
from app.models.auditoria import AuditTrail
from app.models.enums import AcaoAuditoria, ResultadoAuditoria
from app.models.nucleo import Notificacao, Usuario

GRUPOS_AVISADOS_QUEBRA_SIGILO = ("gestor_municipal", "encarregado_dados")

CAMPOS_SENSIVEIS = {
    "senha",
    "password",
    "password_hash",
    "token",
    "access_token",
    "refresh_token",
    "mfa_secret",
    "mfa_secret_cifrado",
    "authorization",
    "internal_api_key",
    "cpf_cifrado",
    "cns_cifrado",
    "conteudo_cifrado",
    "numero_cifrado",
    "valor_cifrado",
    "numero_carteira_cifrado",
    "segredo",
    "secret",
    "payload_ref",
}
CAMPOS_MASCARADOS = {
    "cpf",
    "cns",
    "cnpj",
    "cnpj_normalizado",
    "documento",
    "cpf_normalizado",
    "cns_normalizado",
    "telefone",
    "email",
    "nome",
    "nome_social",
    "nome_exibicao",
    "nome_busca",
    "nome_fonetico",
    "nome_mae",
    "mae_nome_busca",
    "mae_nome_fonetico",
}
CAMPOS_CONTEUDO_CLINICO = {
    "anamnese",
    "evolucao",
    "observacoes",
    "plano_terapeutico",
    "resultado",
    "laudo",
    "diagnostico",
    "prescricao",
    "denuncia",
}


def _mascarar(valor: Any) -> str:
    texto = str(valor or "")
    if len(texto) <= 4:
        return "***"
    return f"***{texto[-4:]}"


def _serializar(valor: Any) -> Any:
    if isinstance(valor, (datetime, date)):
        return valor.isoformat()
    if isinstance(valor, uuid.UUID):
        return str(valor)
    if valor is None or isinstance(valor, (str, int, float, bool)):
        return valor
    return str(valor)


def sanitizar(dados: dict | None, *, marcar_clinico: bool = False) -> dict | None:
    if not dados:
        return None
    limpo: dict = {}
    for chave, valor in dados.items():
        nome = str(chave).lower()
        if nome in CAMPOS_SENSIVEIS or nome in CAMPOS_CONTEUDO_CLINICO:
            limpo[chave] = "[ALTERADO]" if marcar_clinico else "***"
        elif nome in CAMPOS_MASCARADOS:
            limpo[chave] = _mascarar(valor)
        elif isinstance(valor, uuid.UUID):
            limpo[chave] = str(valor)
        elif isinstance(valor, dict):
            limpo[chave] = sanitizar(valor, marcar_clinico=marcar_clinico)
        elif isinstance(valor, (list, tuple)):
            limpo[chave] = [
                sanitizar(item, marcar_clinico=marcar_clinico)
                if isinstance(item, dict)
                else _serializar(item)
                for item in valor
            ]
        else:
            limpo[chave] = _serializar(valor)
    return limpo


def instantaneo(objeto: Any, campos: list[str] | None = None) -> dict:
    if objeto is None:
        return {}
    if campos is None:
        campos = [
            c.name for c in objeto.__table__.columns if c.name not in {"updated_at"}
        ]
    return {campo: _serializar(getattr(objeto, campo, None)) for campo in campos}


def diff(antes: dict | None, depois: dict | None) -> dict | None:
    if not antes or not depois:
        return None
    alterados = {
        chave: {"antes": antes.get(chave), "depois": depois.get(chave)}
        for chave in set(antes) | set(depois)
        if antes.get(chave) != depois.get(chave)
    }
    return sanitizar(alterados, marcar_clinico=True) or None


def dados_do_cliente(request: Request) -> dict:
    encaminhado = request.headers.get("x-forwarded-for")
    ip = (
        encaminhado.split(",")[0].strip()
        if encaminhado
        else (request.client.host if request.client else "desconhecido")
    )
    return {
        "ip": ip,
        "user_agent": (request.headers.get("user-agent") or "")[:400],
        "request_id": getattr(request.state, "request_id", None),
        "origem": request.headers.get("x-origem-app") or "web",
    }


async def registrar(
    db: AsyncSession,
    *,
    acao: AcaoAuditoria | str,
    usuario: Usuario | None = None,
    tenant_id: uuid.UUID | None = None,
    estabelecimento_id: uuid.UUID | None = None,
    grupo_ativo: str | None = None,
    recurso: str | None = None,
    recurso_id: uuid.UUID | None = None,
    recurso_descricao: str | None = None,
    finalidade: str | None = None,
    resultado: ResultadoAuditoria | str = ResultadoAuditoria.SUCESSO,
    justificativa: str | None = None,
    detalhe: str | None = None,
    dados_antes: dict | None = None,
    dados_depois: dict | None = None,
    cliente: dict | None = None,
) -> AuditTrail:
    cliente = cliente or {}
    tenant = tenant_id or (usuario.tenant_id if usuario else None)
    registro = AuditTrail(
        tenant_id=tenant,
        usuario_id=usuario.id if usuario else None,
        usuario_nome=usuario.nome if usuario else None,
        grupo_ativo=grupo_ativo,
        estabelecimento_id=estabelecimento_id,
        acao=acao.value if isinstance(acao, AcaoAuditoria) else str(acao),
        recurso=recurso,
        recurso_id=recurso_id,
        recurso_descricao=(recurso_descricao or "")[:300] or None,
        finalidade=finalidade,
        resultado=resultado.value
        if isinstance(resultado, ResultadoAuditoria)
        else str(resultado),
        justificativa=justificativa,
        detalhe=detalhe,
        dados_antes=sanitizar(dados_antes, marcar_clinico=True),
        dados_depois=sanitizar(dados_depois, marcar_clinico=True),
        diff=diff(dados_antes, dados_depois),
        ip=cliente.get("ip"),
        user_agent=cliente.get("user_agent"),
        request_id=cliente.get("request_id"),
        origem=cliente.get("origem"),
    )
    db.add(registro)
    return registro


async def ler_evento(db: AsyncSession, tenant_id: uuid.UUID, evento_id: uuid.UUID) -> AuditTrail:
    evento = await db.scalar(
        select(AuditTrail).where(
            AuditTrail.id == evento_id, AuditTrail.tenant_id == tenant_id
        )
    )
    if evento is None:
        raise NotFound("Evento de auditoria não encontrado.")
    return evento


async def registrar_leitura_sensivel(
    db: AsyncSession,
    *,
    usuario: Usuario,
    recurso: str,
    recurso_id: uuid.UUID,
    finalidade: str | None,
    cliente: dict,
) -> None:
    await registrar(
        db,
        acao=AcaoAuditoria.READ_SENSIVEL,
        usuario=usuario,
        recurso=recurso,
        recurso_id=recurso_id,
        finalidade=finalidade,
        cliente=cliente,
    )


async def registrar_quebra_sigilo(
    db: AsyncSession,
    *,
    usuario: Usuario,
    recurso: str,
    recurso_id: uuid.UUID,
    justificativa: str,
    finalidade: str | None,
    cliente: dict,
) -> AuditTrail:
    if not usuario_pode_quebrar(usuario):
        raise PermissionDenied("Seu perfil não permite quebra de sigilo.")
    if len((justificativa or "").strip()) < 20:
        raise PermissionDenied(
            "A quebra de sigilo exige justificativa com pelo menos 20 caracteres."
        )
    evento = await registrar(
        db,
        acao=AcaoAuditoria.QUEBRA_SIGILO,
        usuario=usuario,
        recurso=recurso,
        recurso_id=recurso_id,
        justificativa=justificativa,
        finalidade=finalidade,
        resultado=ResultadoAuditoria.SUCESSO,
        cliente=cliente,
    )
    await db.flush()
    # Seção 5.3: gestor e encarregado são avisados. A mensagem não carrega dado
    # clínico nem identificação do titular — só o evento de auditoria.
    for grupo in GRUPOS_AVISADOS_QUEBRA_SIGILO:
        db.add(
            Notificacao(
                tenant_id=usuario.tenant_id,
                grupo_destino=grupo,
                tipo="QUEBRA_SIGILO",
                titulo="Quebra de sigilo registrada",
                mensagem=(
                    f"{usuario.nome} acessou um registro sigiloso ({recurso}) "
                    "em modo de emergência. Consulte a auditoria para a justificativa."
                ),
                entidade="audit_trail",
                entidade_id=evento.id,
            )
        )
    await db.flush()
    return evento


def usuario_pode_quebrar(usuario: Usuario) -> bool:
    from app.core.autorizacao import permissoes_efetivas

    return "*:quebra_sigilo" in permissoes_efetivas(usuario)
