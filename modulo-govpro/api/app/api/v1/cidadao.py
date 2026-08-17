"""Rotas públicas do cidadão — cadastro, login, peticionamento e consulta."""

import uuid
from typing import Annotated, Optional

from fastapi import APIRouter, Depends, File, Form, Query, Request, UploadFile
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.auth import get_client_info, get_current_cidadao
from app.core.database import get_db
from app.models.cidadao import Intimacao, Manifestacao, Peticionamento, UsuarioExterno
from app.models.enums import NivelAcesso
from app.models.organization import Organization
from app.models.processo import Processo
from app.services import cidadao, peticionamento
from app.services.intimacao import registrar_ciencia

router = APIRouter(tags=["cidadao"])

DbDep = Annotated[AsyncSession, Depends(get_db)]
CidadaoDep = Annotated[UsuarioExterno, Depends(get_current_cidadao)]


class RegistrarInput(BaseModel):
    org_slug: str
    nome: str
    email: str
    cpf_cnpj: str
    senha: str
    telefone: Optional[str] = None
    aceite_termo: bool = False


class LoginInput(BaseModel):
    org_slug: str
    email: str
    senha: str


class PeticionarNovoInput(BaseModel):
    tipo_processo_id: uuid.UUID
    especificacao: str


@router.post("/public/cidadao/registrar", status_code=201)
async def registrar(payload: RegistrarInput, request: Request, db: DbDep):
    novo = await cidadao.registrar(
        db,
        org_slug=payload.org_slug,
        nome=payload.nome,
        email=payload.email,
        cpf_cnpj=payload.cpf_cnpj,
        senha=payload.senha,
        telefone=payload.telefone,
        aceite_termo=payload.aceite_termo,
        ip=get_client_info(request)["ip_address"],
    )
    return {
        "id": str(novo.id),
        "status": "aguardando_aprovacao",
        "mensagem": "Cadastro recebido. Após aprovação do órgão você poderá peticionar.",
    }


@router.post("/public/cidadao/login")
async def login(payload: LoginInput, db: DbDep):
    token = await cidadao.autenticar(
        db, org_slug=payload.org_slug, email=payload.email, senha=payload.senha
    )
    return {"token": token, "token_type": "bearer"}


@router.get("/public/cidadao/me")
async def me(cidadao: CidadaoDep):
    return {
        "id": str(cidadao.id),
        "nome": cidadao.nome,
        "email": cidadao.email,
        "aprovado": cidadao.aprovado,
    }


@router.post("/public/peticionamentos", status_code=201)
async def peticionar_novo(
    payload: PeticionarNovoInput,
    request: Request,
    db: DbDep,
    cidadao: CidadaoDep,
):
    return await peticionamento.peticionar_novo(
        db,
        cidadao.tenant_id,
        cidadao,
        tipo_processo_id=payload.tipo_processo_id,
        especificacao=payload.especificacao,
        client=get_client_info(request),
    )


@router.post("/public/processos/{nup}/peticionar", status_code=201)
async def peticionar_intercorrente(
    nup: str,
    request: Request,
    db: DbDep,
    cidadao: CidadaoDep,
    arquivo: UploadFile = File(...),
    titulo: str = Form(...),
):
    resultado = await db.execute(
        select(Processo).where(Processo.nup == nup, Processo.tenant_id == cidadao.tenant_id)
    )
    processo = resultado.scalar_one_or_none()
    if processo is None:
        from fastapi import HTTPException, status

        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Processo não encontrado")

    conteudo = await arquivo.read()
    return await peticionamento.peticionar_intercorrente(
        db,
        cidadao.tenant_id,
        cidadao,
        processo_id=processo.id,
        titulo=titulo,
        conteudo=conteudo,
        mime=arquivo.content_type or "application/octet-stream",
        nome_original=arquivo.filename or "arquivo",
        client=get_client_info(request),
    )


@router.get("/public/processos/{nup}")
async def consulta_publica(
    nup: str,
    db: DbDep,
    org_slug: str = Query(...),
):
    """Consulta pública sem login (LAI): só processos PÚBLICOS; os demais
    exibem apenas a existência, sem conteúdo."""
    resultado = await db.execute(select(Organization).where(Organization.slug == org_slug))
    org = resultado.scalar_one_or_none()
    if org is None:
        from fastapi import HTTPException, status

        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Órgão não encontrado")

    processo = (
        await db.execute(select(Processo).where(Processo.nup == nup, Processo.tenant_id == org.id))
    ).scalar_one_or_none()

    if processo is None:
        return {"nup": nup, "encontrado": False}

    if processo.nivel_acesso != NivelAcesso.PUBLICO.value:
        return {"nup": nup, "encontrado": True, "publico": False, "mensagem": "Acesso restrito"}

    return {
        "nup": processo.nup,
        "encontrado": True,
        "publico": True,
        "especificacao": processo.especificacao,
        "situacao": processo.situacao,
        "data_autuacao": processo.data_autuacao.isoformat() if processo.data_autuacao else None,
    }


@router.get("/public/meus-processos")
async def meus_processos(db: DbDep, cidadao: CidadaoDep):
    resultado = await db.execute(
        select(Peticionamento).where(Peticionamento.usuario_externo_id == cidadao.id)
    )
    peticionamentos = resultado.scalars().all()

    itens = []
    for p in peticionamentos:
        nup = None
        if p.processo_id is not None:
            processo = await db.get(Processo, p.processo_id)
            nup = processo.nup if processo else None
        itens.append(
            {
                "id": str(p.id),
                "tipo": p.tipo,
                "especificacao": p.especificacao,
                "nup": nup,
                "status": p.status,
                "concluido_em": p.concluido_em.isoformat() if p.concluido_em else None,
            }
        )
    return itens


@router.get("/public/minhas-intimacoes")
async def minhas_intimacoes(db: DbDep, cidadao: CidadaoDep):
    resultado = await db.execute(
        select(Intimacao)
        .where(Intimacao.usuario_externo_id == cidadao.id)
        .order_by(Intimacao.created_at.desc())
    )
    intimacoes = resultado.scalars().all()
    return [
        {
            "id": str(i.id),
            "texto": i.texto,
            "prazo_dias": i.prazo_dias,
            "status": i.status,
            "disponibilizada_em": i.disponibilizada_em.isoformat()
            if i.disponibilizada_em
            else None,
        }
        for i in intimacoes
    ]


@router.post("/public/intimacoes/{intimacao_id}/ciencia")
async def dar_ciencia(
    intimacao_id,
    request: Request,
    db: DbDep,
    cidadao: CidadaoDep,
):
    intimacao = await registrar_ciencia(
        db,
        cidadao.tenant_id,
        cidadao,
        intimacao_id=intimacao_id,
        ip=get_client_info(request)["ip_address"],
    )
    return {"id": str(intimacao.id), "status": intimacao.status}


class ManifestacaoInput(BaseModel):
    org_slug: str
    tipo: str
    texto: str
    anonima: bool = False


@router.post("/public/manifestacoes", status_code=201)
async def criar_manifestacao(payload: ManifestacaoInput, db: DbDep):
    """Canal de ouvidoria/manifestação (Lei 13.460/2017)."""
    resultado = await db.execute(select(Organization).where(Organization.slug == payload.org_slug))
    org = resultado.scalar_one_or_none()
    if org is None:
        from fastapi import HTTPException, status

        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Órgão não encontrado")

    manifestacao = Manifestacao(
        tenant_id=org.id,
        tipo=payload.tipo,
        texto=payload.texto,
        anonima=payload.anonima,
    )
    db.add(manifestacao)
    await db.commit()
    await db.refresh(manifestacao)
    return {"id": str(manifestacao.id), "status": manifestacao.status}
