"""Gestão de sigilo (LAI): classificação, desclassificação, expiração e credenciais.

Publicidade é a regra; sigilo é exceção fundamentada (hipótese legal). A
desclassificação pode ser manual ou automática (vencimento do prazo).
"""

import uuid
from datetime import datetime, timedelta, timezone
from typing import Optional

from fastapi import HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.classificacao_sigilo import ClassificacaoSigilo
from app.models.credencial import CredencialAcesso
from app.models.documento import Documento
from app.models.dominio import HipoteseLegal
from app.models.enums import NivelAcesso, RoleName
from app.models.processo import Processo
from app.models.role import Role
from app.models.user import User
from app.models.user_role import UserRole
from app.services.auditoria import registrar

_PAPEIS_SIGILO = {
    RoleName.GESTOR_SIGILO.value,
    RoleName.AUTORIDADE_SIGNATARIA.value,
    RoleName.ADMIN.value,
    RoleName.DPO.value,
}


async def _alvo(db: AsyncSession, tenant_id: uuid.UUID, alvo_tipo: str, alvo_id: uuid.UUID):
    model = Processo if alvo_tipo == "processo" else Documento
    alvo = await db.get(model, alvo_id)
    if alvo is None or alvo.tenant_id != tenant_id:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail=f"{alvo_tipo.title()} não encontrado"
        )
    return alvo


def _expira_em(hipotese: Optional[HipoteseLegal], prazo_anos: Optional[int]) -> Optional[datetime]:
    anos = prazo_anos or (hipotese.prazo_sigilo_anos if hipotese else None)
    if not anos:
        return None
    return datetime.now(timezone.utc) + timedelta(days=anos * 365)


async def classificar(
    db: AsyncSession,
    tenant_id: uuid.UUID,
    user: User,
    *,
    alvo_tipo: str,
    alvo_id: uuid.UUID,
    grau: Optional[str] = None,
    hipotese_legal_id: Optional[uuid.UUID] = None,
    prazo_anos: Optional[int] = None,
    justificativa: Optional[str] = None,
    client: Optional[dict] = None,
):
    alvo = await _alvo(db, tenant_id, alvo_tipo, alvo_id)

    hipotese = None
    if hipotese_legal_id is not None:
        hipotese = await db.get(HipoteseLegal, hipotese_legal_id)
        if hipotese is None or hipotese.tenant_id != tenant_id:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND, detail="Hipótese legal não encontrada"
            )

    expira = _expira_em(hipotese, prazo_anos)

    alvo.nivel_acesso = NivelAcesso.SIGILOSO.value
    alvo.hipotese_legal_id = hipotese_legal_id
    alvo.sigilo_expira_em = expira

    db.add(
        ClassificacaoSigilo(
            tenant_id=tenant_id,
            alvo_tipo=alvo_tipo,
            alvo_id=alvo.id,
            acao="CLASSIFICAR",
            grau=grau or (hipotese.grau_sigilo if hipotese else None),
            hipotese_legal_id=hipotese_legal_id,
            prazo_anos=prazo_anos,
            expira_em=expira,
            justificativa=justificativa,
            autoridade_user_id=user.id,
        )
    )

    await registrar(
        db,
        tenant_id=tenant_id,
        action="CLASSIFICACAO",
        entity=alvo_tipo,
        entity_id=str(alvo.id),
        actor_user_id=user.id,
        processo_id=alvo.id if alvo_tipo == "processo" else None,
        ip_address=client.get("ip_address") if client else None,
        user_agent=client.get("user_agent") if client else None,
        finalidade="Restrição de acesso com hipótese legal",
        base_legal="Lei 12.527/2011",
        dados_depois={"nivel_acesso": NivelAcesso.SIGILOSO.value, "grau": grau},
    )

    await db.commit()
    await db.refresh(alvo)
    return alvo


async def desclassificar(
    db: AsyncSession,
    tenant_id: uuid.UUID,
    user: Optional[User],
    *,
    alvo_tipo: str,
    alvo_id: uuid.UUID,
    justificativa: str = "Desclassificação",
    automatica: bool = False,
    client: Optional[dict] = None,
):
    alvo = await _alvo(db, tenant_id, alvo_tipo, alvo_id)

    alvo.nivel_acesso = NivelAcesso.PUBLICO.value
    alvo.sigilo_expira_em = None

    db.add(
        ClassificacaoSigilo(
            tenant_id=tenant_id,
            alvo_tipo=alvo_tipo,
            alvo_id=alvo.id,
            acao="DESCLASSIFICAR",
            justificativa=justificativa,
            autoridade_user_id=user.id if user else None,
        )
    )

    await registrar(
        db,
        tenant_id=tenant_id,
        action="CLASSIFICACAO",
        entity=alvo_tipo,
        entity_id=str(alvo.id),
        actor_user_id=user.id if user else None,
        actor_tipo="SISTEMA" if automatica else "INTERNO",
        processo_id=alvo.id if alvo_tipo == "processo" else None,
        ip_address=client.get("ip_address") if client else None,
        user_agent=client.get("user_agent") if client else None,
        finalidade="Publicidade restaurada",
        base_legal="Lei 12.527/2011",
        detalhe={"automatica": automatica},
    )

    await db.commit()
    await db.refresh(alvo)
    return alvo


async def desclassificar_expirados(db: AsyncSession) -> int:
    """Desclassifica automaticamente alvos cujo prazo de sigilo venceu."""
    agora = datetime.now(timezone.utc)
    contagem = 0

    processos = (
        (
            await db.execute(
                select(Processo).where(
                    Processo.nivel_acesso == NivelAcesso.SIGILOSO.value,
                    Processo.sigilo_expira_em.isnot(None),
                    Processo.sigilo_expira_em < agora,
                )
            )
        )
        .scalars()
        .all()
    )

    for processo in processos:
        await desclassificar(
            db,
            processo.tenant_id,
            None,
            alvo_tipo="processo",
            alvo_id=processo.id,
            justificativa="Expiração automática do prazo de sigilo",
            automatica=True,
        )
        contagem += 1

    documentos = (
        (
            await db.execute(
                select(Documento).where(
                    Documento.nivel_acesso == NivelAcesso.SIGILOSO.value,
                    Documento.sigilo_expira_em.isnot(None),
                    Documento.sigilo_expira_em < agora,
                )
            )
        )
        .scalars()
        .all()
    )

    for documento in documentos:
        await desclassificar(
            db,
            documento.tenant_id,
            None,
            alvo_tipo="documento",
            alvo_id=documento.id,
            justificativa="Expiração automática do prazo de sigilo",
            automatica=True,
        )
        contagem += 1

    return contagem


async def conceder_credencial(
    db: AsyncSession,
    tenant_id: uuid.UUID,
    user: User,
    *,
    processo_id: uuid.UUID,
    usuario_id: uuid.UUID,
    motivo: Optional[str] = None,
    client: Optional[dict] = None,
) -> CredencialAcesso:
    processo = await db.get(Processo, processo_id)
    if processo is None or processo.tenant_id != tenant_id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Processo não encontrado")

    result = await db.execute(
        select(CredencialAcesso).where(
            CredencialAcesso.processo_id == processo_id,
            CredencialAcesso.usuario_id == usuario_id,
            CredencialAcesso.revogada_em.is_(None),
        )
    )
    credencial = result.scalar_one_or_none()
    if credencial is not None:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT, detail="Usuário já possui credencial ativa"
        )

    credencial = CredencialAcesso(
        tenant_id=tenant_id,
        processo_id=processo_id,
        usuario_id=usuario_id,
        concedida_por_user_id=user.id,
        motivo=motivo,
    )
    db.add(credencial)

    await registrar(
        db,
        tenant_id=tenant_id,
        action="CONCESSAO_CREDENCIAL",
        entity="credencial",
        entity_id=str(credencial.id),
        actor_user_id=user.id,
        processo_id=processo_id,
        nup=processo.nup,
        ip_address=client.get("ip_address") if client else None,
        user_agent=client.get("user_agent") if client else None,
    )

    await db.commit()
    await db.refresh(credencial)
    return credencial


async def revogar_credencial(
    db: AsyncSession,
    tenant_id: uuid.UUID,
    user: User,
    *,
    processo_id: uuid.UUID,
    usuario_id: uuid.UUID,
    motivo: Optional[str] = None,
    client: Optional[dict] = None,
) -> CredencialAcesso:
    result = await db.execute(
        select(CredencialAcesso).where(
            CredencialAcesso.processo_id == processo_id,
            CredencialAcesso.usuario_id == usuario_id,
            CredencialAcesso.revogada_em.is_(None),
        )
    )
    credencial = result.scalar_one_or_none()
    if credencial is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Credencial ativa não encontrada"
        )

    credencial.revogada_em = datetime.now(timezone.utc)
    credencial.motivo = motivo

    await registrar(
        db,
        tenant_id=tenant_id,
        action="REVOGACAO_CREDENCIAL",
        entity="credencial",
        entity_id=str(credencial.id),
        actor_user_id=user.id,
        processo_id=processo_id,
        ip_address=client.get("ip_address") if client else None,
        user_agent=client.get("user_agent") if client else None,
    )

    await db.commit()
    await db.refresh(credencial)
    return credencial


async def _papeis_usuario(db: AsyncSession, user_id: uuid.UUID) -> set[str]:
    result = await db.execute(
        select(Role.name)
        .join(UserRole, UserRole.role_id == Role.id)
        .where(UserRole.user_id == user_id)
    )
    return set(result.scalars())


async def tem_acesso_sigiloso(db: AsyncSession, user: User, processo: Processo) -> bool:
    if processo.nivel_acesso != NivelAcesso.SIGILOSO.value:
        return True
    papeis = await _papeis_usuario(db, user.id)
    if papeis.intersection(_PAPEIS_SIGILO):
        return True
    result = await db.execute(
        select(CredencialAcesso).where(
            CredencialAcesso.processo_id == processo.id,
            CredencialAcesso.usuario_id == user.id,
            CredencialAcesso.revogada_em.is_(None),
        )
    )
    return result.scalar_one_or_none() is not None


async def verificar_acesso_sigiloso(db: AsyncSession, user: User, processo: Processo) -> None:
    if not await tem_acesso_sigiloso(db, user, processo):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Processo sigiloso: acesso exige credencial nominal",
        )
