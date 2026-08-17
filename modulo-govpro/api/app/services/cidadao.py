"""Cadastro e autenticação do cidadão (área externa).

Sem gov.br: cadastro próprio com validação real de CPF/CNPJ, aceite de termo de
responsabilidade versionado (data/hora/IP) e fila de aprovação pelo órgão.
"""

import logging
import uuid
from datetime import datetime, timezone
from typing import Optional

from fastapi import HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.br_validators import validate_cnpj, validate_cpf
from app.core.security import create_citizen_token, hash_password, verify_password
from app.models.cidadao import UsuarioExterno
from app.models.organization import Organization
from app.services.auditoria import registrar as registrar_auditoria

logger = logging.getLogger("govpro.cidadao")

TERMO_RESPONSABILIDADE = {
    "versao": "1.0",
    "titulo": "Termo de Responsabilidade do Peticionamento Eletrônico",
    "texto": (
        "Declaro, sob as penas da lei, que os documentos digitalizados enviados são "
        "autênticos e fiéis aos originais, nos termos do Decreto 9.094/2017 (presunção "
        "de boa-fé), e responsabilizo-me pela veracidade das informações prestadas."
    ),
}


async def _resolver_tenant(db: AsyncSession, org_slug: str) -> Organization:
    result = await db.execute(select(Organization).where(Organization.slug == org_slug))
    org = result.scalar_one_or_none()
    if org is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Órgão não encontrado")
    return org


async def registrar(
    db: AsyncSession,
    *,
    org_slug: str,
    nome: str,
    email: str,
    cpf_cnpj: str,
    senha: str,
    telefone: Optional[str] = None,
    aceite_termo: bool = False,
    ip: Optional[str] = None,
) -> UsuarioExterno:
    org = await _resolver_tenant(db, org_slug)

    doc_digitos = "".join(ch for ch in cpf_cnpj if ch.isalnum())
    valido = validate_cpf(doc_digitos) if len(doc_digitos) == 11 else validate_cnpj(doc_digitos)
    if not valido:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
            detail="CPF/CNPJ inválido",
        )

    if not aceite_termo:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
            detail="É necessário aceitar o Termo de Responsabilidade",
        )
    if len(senha) < 8:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
            detail="Senha deve ter ao menos 8 caracteres",
        )

    result = await db.execute(
        select(UsuarioExterno).where(
            UsuarioExterno.tenant_id == org.id, UsuarioExterno.email == email.lower()
        )
    )
    if result.scalar_one_or_none() is not None:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="E-mail já cadastrado")

    cidadao = UsuarioExterno(
        tenant_id=org.id,
        nome=nome.strip(),
        email=email.lower(),
        cpf_cnpj=doc_digitos,
        senha_hash=hash_password(senha),
        telefone=telefone,
        termo_versao=TERMO_RESPONSABILIDADE["versao"],
        termo_aceito_em=datetime.now(timezone.utc),
        termo_aceito_ip=ip,
        aprovado=False,
    )
    db.add(cidadao)
    await db.flush()

    await registrar_auditoria(
        db,
        tenant_id=org.id,
        action="CRIACAO",
        entity="usuario_externo",
        entity_id=str(cidadao.id),
        actor_tipo="EXTERNO",
        ip_address=ip,
        finalidade="Cadastro de usuário externo (peticionamento)",
        base_legal="LGPD art. 7º, II (obrigação legal)",
        detalhe={"termo_versao": TERMO_RESPONSABILIDADE["versao"]},
    )

    await db.commit()
    await db.refresh(cidadao)
    # Confirmação de e-mail: stub (sem infra de SMTP no piloto).
    logger.info("Cadastro pendente de aprovação para %s (email %s)", cidadao.id, cidadao.email)
    return cidadao


async def autenticar(db: AsyncSession, *, org_slug: str, email: str, senha: str) -> str:
    org = await _resolver_tenant(db, org_slug)
    result = await db.execute(
        select(UsuarioExterno).where(
            UsuarioExterno.tenant_id == org.id, UsuarioExterno.email == email.lower()
        )
    )
    cidadao = result.scalar_one_or_none()
    if cidadao is None or not verify_password(senha, cidadao.senha_hash):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED, detail="Credenciais inválidas"
        )
    if not cidadao.aprovado:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN, detail="Cadastro aguardando aprovação do órgão"
        )
    if not cidadao.ativo:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Usuário inativo")

    return create_citizen_token(cidadao.id, org.id)


async def aprovar(db: AsyncSession, tenant_id: uuid.UUID, cidadao_id: uuid.UUID) -> UsuarioExterno:
    cidadao = await db.get(UsuarioExterno, cidadao_id)
    if cidadao is None or cidadao.tenant_id != tenant_id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Usuário não encontrado")
    cidadao.aprovado = True
    await db.commit()
    await db.refresh(cidadao)
    return cidadao
