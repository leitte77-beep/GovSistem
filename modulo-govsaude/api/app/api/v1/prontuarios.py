"""PEC ambulatorial: registros clínicos versionáveis, auditáveis e isolados por tenant."""

from __future__ import annotations

import uuid
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, Request
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.auth import get_tenant_id
from app.core.autorizacao import escopo_permite, exigir, pode_ver_conteudo, velar
from app.core.database import get_db
from app.core.errors import Conflict, NotFound
from app.core.permissoes import Permissao
from app.models.cidadao import Cidadao
from app.models.nucleo import Estabelecimento, Usuario
from app.models.prontuario import (
    Atendimento,
    EvolucaoSOAP,
    PlanoCuidado,
    Prescricao,
    ProblemaClinico,
    RegistroAssistencial,
    SinalVital,
)
from app.schemas.prontuario import (
    AtendimentoCreate,
    AtendimentoEncerrar,
    AtendimentoOut,
    PlanoCreate,
    PrescricaoCreate,
    ProblemaCreate,
    RegistroAssistencialCreate,
    RegistroAssistencialOut,
    RetificacaoSOAPCreate,
    SinalVitalCreate,
    SOAPCreate,
    SOAPOut,
)
from app.services.auditoria import dados_do_cliente, registrar, registrar_leitura_sensivel

router = APIRouter(prefix="/prontuarios", tags=["Prontuário eletrônico"])


async def _at(db, tenant_id, atendimento_id):
    x = await db.scalar(
        select(Atendimento).where(
            Atendimento.id == atendimento_id, Atendimento.tenant_id == tenant_id
        )
    )
    if not x:
        raise NotFound("Atendimento não encontrado.")
    return x


def _escopo(u, a, permissao):
    if not escopo_permite(u, permissao, estabelecimento_id=a.estabelecimento_id):
        raise NotFound("Atendimento não encontrado.")


def _aberto(a):
    if a.status != "ABERTO":
        raise Conflict("Atendimento encerrado; registre uma retificação ou abra novo atendimento.")


async def _audit(db, r, u, t, acao, recurso, recurso_id, depois=None):
    await registrar(
        db,
        acao=acao,
        usuario=u,
        tenant_id=t,
        recurso=recurso,
        recurso_id=recurso_id,
        dados_depois=depois,
        cliente=dados_do_cliente(r),
    )


@router.post("/atendimentos", response_model=AtendimentoOut, status_code=201)
async def abrir(
    c: AtendimentoCreate,
    r: Request,
    t: uuid.UUID = Depends(get_tenant_id),
    u: Usuario = Depends(exigir(Permissao.PRONTUARIO_CRIAR)),
    db: AsyncSession = Depends(get_db),
):
    if c.retroativo and len((c.justificativa_retroativa or "").strip()) < 20:
        raise Conflict("Digitação retroativa exige justificativa com pelo menos 20 caracteres.")
    if not await db.scalar(
        select(Cidadao.id).where(Cidadao.id == c.cidadao_id, Cidadao.tenant_id == t)
    ):
        raise NotFound("Cidadão não encontrado.")
    if c.estabelecimento_id:
        e = await db.scalar(
            select(Estabelecimento).where(
                Estabelecimento.id == c.estabelecimento_id, Estabelecimento.tenant_id == t
            )
        )
        if not e or not escopo_permite(
            u, Permissao.PRONTUARIO_CRIAR, estabelecimento_id=c.estabelecimento_id
        ):
            raise NotFound("Estabelecimento não encontrado.")
    x = Atendimento(
        tenant_id=t,
        profissional_id=None,
        **c.model_dump(),
        criado_por_id=u.id,
        atualizado_por_id=u.id,
    )
    db.add(x)
    await db.flush()
    await _audit(db, r, u, t, "CRIAR", "atendimento", x.id, {"status": x.status})
    await db.commit()
    await db.refresh(x)
    return x


@router.get("/atendimentos/{id}", response_model=AtendimentoOut)
async def obter(
    id: uuid.UUID,
    r: Request,
    t: uuid.UUID = Depends(get_tenant_id),
    u: Usuario = Depends(exigir(Permissao.PRONTUARIO_LER)),
    db: AsyncSession = Depends(get_db),
):
    x = await _at(db, t, id)
    _escopo(u, x, Permissao.PRONTUARIO_LER)
    if x.sigiloso and not pode_ver_conteudo(u, "SIGILOSO"):
        raise NotFound("Atendimento não encontrado.")
    await registrar_leitura_sensivel(
        db,
        usuario=u,
        recurso="atendimento",
        recurso_id=x.id,
        finalidade="consulta_prontuario",
        cliente=dados_do_cliente(r),
    )
    await db.commit()
    return x


@router.post("/atendimentos/{id}/encerrar", response_model=AtendimentoOut)
async def encerrar(
    id: uuid.UUID,
    c: AtendimentoEncerrar,
    r: Request,
    t: uuid.UUID = Depends(get_tenant_id),
    u: Usuario = Depends(exigir(Permissao.PRONTUARIO_EDITAR)),
    db: AsyncSession = Depends(get_db),
):
    x = await _at(db, t, id)
    _escopo(u, x, Permissao.PRONTUARIO_EDITAR)
    _aberto(x)
    x.status = "ENCERRADO"
    x.finalizado_em = c.finalizado_em or datetime.now(timezone.utc)
    x.atualizado_por_id = u.id
    x.versao += 1
    await _audit(db, r, u, t, "ENCERRAR", "atendimento", x.id, {"status": x.status})
    await db.commit()
    await db.refresh(x)
    return x


@router.post("/atendimentos/{id}/soap", response_model=SOAPOut, status_code=201)
async def soap(
    id: uuid.UUID,
    c: SOAPCreate,
    r: Request,
    t: uuid.UUID = Depends(get_tenant_id),
    u: Usuario = Depends(exigir(Permissao.PRONTUARIO_EDITAR)),
    db: AsyncSession = Depends(get_db),
):
    a = await _at(db, t, id)
    _escopo(u, a, Permissao.PRONTUARIO_EDITAR)
    _aberto(a)
    x = EvolucaoSOAP(
        tenant_id=t, atendimento_id=id, **c.model_dump(), criado_por_id=u.id, atualizado_por_id=u.id
    )
    db.add(x)
    await db.flush()
    await _audit(db, r, u, t, "CRIAR", "evolucao_soap", x.id)
    await db.commit()
    await db.refresh(x)
    return x


@router.post("/evolucoes/{id}/assinar", response_model=SOAPOut)
async def assinar(
    id: uuid.UUID,
    r: Request,
    t: uuid.UUID = Depends(get_tenant_id),
    u: Usuario = Depends(exigir(Permissao.PRONTUARIO_ASSINAR)),
    db: AsyncSession = Depends(get_db),
):
    x = await db.scalar(
        select(EvolucaoSOAP).where(EvolucaoSOAP.id == id, EvolucaoSOAP.tenant_id == t)
    )
    if not x:
        raise NotFound("Evolução não encontrada.")
    a = await _at(db, t, x.atendimento_id)
    _escopo(u, a, Permissao.PRONTUARIO_ASSINAR)
    if x.assinado_em:
        raise Conflict("Evolução já assinada.")
    x.assinado_em = datetime.now(timezone.utc)
    x.atualizado_por_id = u.id
    x.versao += 1
    await _audit(db, r, u, t, "ASSINAR", "evolucao_soap", x.id)
    await db.commit()
    await db.refresh(x)
    return x


@router.post("/evolucoes/{id}/retificar", response_model=SOAPOut, status_code=201)
async def retificar(
    id: uuid.UUID,
    c: RetificacaoSOAPCreate,
    r: Request,
    t: uuid.UUID = Depends(get_tenant_id),
    u: Usuario = Depends(exigir(Permissao.PRONTUARIO_RETIFICAR)),
    db: AsyncSession = Depends(get_db),
):
    original = await db.scalar(
        select(EvolucaoSOAP).where(EvolucaoSOAP.id == id, EvolucaoSOAP.tenant_id == t)
    )
    if not original:
        raise NotFound("Evolução não encontrada.")
    if not original.assinado_em:
        raise Conflict("Apenas evolução assinada pode ser retificada.")
    a = await _at(db, t, original.atendimento_id)
    _escopo(u, a, Permissao.PRONTUARIO_RETIFICAR)
    x = EvolucaoSOAP(
        tenant_id=t,
        atendimento_id=original.atendimento_id,
        retifica_de_id=original.id,
        **c.model_dump(exclude={"justificativa"}),
        criado_por_id=u.id,
        atualizado_por_id=u.id,
    )
    db.add(x)
    await db.flush()
    await _audit(
        db,
        r,
        u,
        t,
        "RETIFICAR",
        "evolucao_soap",
        x.id,
        {"retifica_de_id": str(original.id), "justificativa": c.justificativa},
    )
    await db.commit()
    await db.refresh(x)
    return x


@router.post("/atendimentos/{id}/sinais-vitais", status_code=201)
async def sinais(
    id: uuid.UUID,
    c: SinalVitalCreate,
    r: Request,
    t: uuid.UUID = Depends(get_tenant_id),
    u: Usuario = Depends(exigir(Permissao.PRONTUARIO_EDITAR)),
    db: AsyncSession = Depends(get_db),
):
    a = await _at(db, t, id)
    _escopo(u, a, Permissao.PRONTUARIO_EDITAR)
    _aberto(a)
    x = SinalVital(
        tenant_id=t,
        atendimento_id=id,
        cidadao_id=a.cidadao_id,
        dados=c.dados,
        criado_por_id=u.id,
        atualizado_por_id=u.id,
    )
    db.add(x)
    await db.flush()
    await _audit(db, r, u, t, "CRIAR", "sinal_vital", x.id)
    await db.commit()
    return {"id": str(x.id), "dados": x.dados}


@router.post("/cidadaos/{cidadao_id}/problemas", status_code=201)
async def problema(
    cidadao_id: uuid.UUID,
    c: ProblemaCreate,
    r: Request,
    t: uuid.UUID = Depends(get_tenant_id),
    u: Usuario = Depends(exigir(Permissao.PRONTUARIO_EDITAR)),
    db: AsyncSession = Depends(get_db),
):
    if not await db.scalar(
        select(Cidadao.id).where(Cidadao.id == cidadao_id, Cidadao.tenant_id == t)
    ):
        raise NotFound("Cidadão não encontrado.")
    x = ProblemaClinico(
        tenant_id=t,
        cidadao_id=cidadao_id,
        **c.model_dump(),
        criado_por_id=u.id,
        atualizado_por_id=u.id,
    )
    db.add(x)
    await db.flush()
    await _audit(db, r, u, t, "CRIAR", "problema_clinico", x.id)
    await db.commit()
    return {"id": str(x.id)}


@router.post("/atendimentos/{id}/planos-cuidado", status_code=201)
async def plano(
    id: uuid.UUID,
    c: PlanoCreate,
    r: Request,
    t: uuid.UUID = Depends(get_tenant_id),
    u: Usuario = Depends(exigir(Permissao.PRONTUARIO_EDITAR)),
    db: AsyncSession = Depends(get_db),
):
    a = await _at(db, t, id)
    _escopo(u, a, Permissao.PRONTUARIO_EDITAR)
    _aberto(a)
    x = PlanoCuidado(
        tenant_id=t, atendimento_id=id, **c.model_dump(), criado_por_id=u.id, atualizado_por_id=u.id
    )
    db.add(x)
    await db.flush()
    await _audit(db, r, u, t, "CRIAR", "plano_cuidado", x.id)
    await db.commit()
    return {"id": str(x.id)}


@router.post("/atendimentos/{id}/prescricoes", status_code=201)
async def prescrever(
    id: uuid.UUID,
    c: PrescricaoCreate,
    r: Request,
    t: uuid.UUID = Depends(get_tenant_id),
    u: Usuario = Depends(exigir(Permissao.PRESCRICAO_CRIAR)),
    db: AsyncSession = Depends(get_db),
):
    a = await _at(db, t, id)
    _escopo(u, a, Permissao.PRESCRICAO_CRIAR)
    _aberto(a)
    x = Prescricao(
        tenant_id=t,
        atendimento_id=id,
        cidadao_id=a.cidadao_id,
        itens=c.itens,
        alertas={"status": "NAO_AVALIADO", "motivo": "base_farmacologica_validada_indisponivel"},
        criado_por_id=u.id,
        atualizado_por_id=u.id,
    )
    db.add(x)
    await db.flush()
    await _audit(db, r, u, t, "CRIAR", "prescricao", x.id)
    await db.commit()
    return {"id": str(x.id), "alertas": x.alertas}


@router.get("/cidadaos/{cidadao_id}/linha-do-tempo")
async def linha_do_tempo(
    cidadao_id: uuid.UUID,
    r: Request,
    t: uuid.UUID = Depends(get_tenant_id),
    u: Usuario = Depends(exigir(Permissao.PRONTUARIO_LER)),
    db: AsyncSession = Depends(get_db),
):
    if not await db.scalar(
        select(Cidadao.id).where(Cidadao.id == cidadao_id, Cidadao.tenant_id == t)
    ):
        raise NotFound("Cidadão não encontrado.")
    rows = (
        await db.scalars(
            select(Atendimento)
            .where(Atendimento.tenant_id == t, Atendimento.cidadao_id == cidadao_id)
            .order_by(Atendimento.iniciado_em.desc())
        )
    ).all()
    out = []
    for a in rows:
        if escopo_permite(u, Permissao.PRONTUARIO_LER, estabelecimento_id=a.estabelecimento_id):
            out.append(
                velar(
                    {
                        "id": str(a.id),
                        "data_atendimento": a.iniciado_em,
                        "estabelecimento_id": str(a.estabelecimento_id)
                        if a.estabelecimento_id
                        else None,
                        "status": a.status,
                        "sigiloso": a.sigiloso,
                        "tipo": "ATENDIMENTO",
                    },
                    u,
                    nivel_sigilo="SIGILOSO" if a.sigiloso else "NORMAL",
                )
            )
    await registrar_leitura_sensivel(
        db,
        usuario=u,
        recurso="linha_tempo_prontuario",
        recurso_id=cidadao_id,
        finalidade="consulta_linha_tempo",
        cliente=dados_do_cliente(r),
    )
    await db.commit()
    return out


@router.post("/registros", response_model=RegistroAssistencialOut, status_code=201)
async def criar_registro(
    c: RegistroAssistencialCreate,
    r: Request,
    t: uuid.UUID = Depends(get_tenant_id),
    u: Usuario = Depends(exigir(Permissao.PRONTUARIO_EDITAR)),
    db: AsyncSession = Depends(get_db),
):
    """Registra exame, encaminhamento, documento, ficha, atividade ou cuidado domiciliar.

    ``tipo`` é configurável para não codificar protocolos municipais no produto.
    """
    if not await db.scalar(
        select(Cidadao.id).where(Cidadao.id == c.cidadao_id, Cidadao.tenant_id == t)
    ):
        raise NotFound("Cidadão não encontrado.")
    estabelecimento_id = None
    if c.atendimento_id:
        atendimento = await _at(db, t, c.atendimento_id)
        _escopo(u, atendimento, Permissao.PRONTUARIO_EDITAR)
        _aberto(atendimento)
        if atendimento.cidadao_id != c.cidadao_id:
            raise Conflict("O atendimento não pertence ao cidadão informado.")
        estabelecimento_id = atendimento.estabelecimento_id
    x = RegistroAssistencial(
        tenant_id=t,
        estabelecimento_id=estabelecimento_id,
        **c.model_dump(),
        criado_por_id=u.id,
        atualizado_por_id=u.id,
    )
    db.add(x)
    await db.flush()
    await _audit(db, r, u, t, "CRIAR", "registro_assistencial", x.id, {"tipo": x.tipo})
    await db.commit()
    await db.refresh(x)
    return x


@router.get("/cidadaos/{cidadao_id}/registros", response_model=list[RegistroAssistencialOut])
async def listar_registros(
    cidadao_id: uuid.UUID,
    r: Request,
    tipo: str | None = None,
    t: uuid.UUID = Depends(get_tenant_id),
    u: Usuario = Depends(exigir(Permissao.PRONTUARIO_LER)),
    db: AsyncSession = Depends(get_db),
):
    stmt = select(RegistroAssistencial).where(
        RegistroAssistencial.tenant_id == t, RegistroAssistencial.cidadao_id == cidadao_id
    )
    if tipo:
        stmt = stmt.where(RegistroAssistencial.tipo == tipo)
    rows = (await db.scalars(stmt.order_by(RegistroAssistencial.created_at.desc()))).all()
    visiveis = [
        x
        for x in rows
        if escopo_permite(u, Permissao.PRONTUARIO_LER, estabelecimento_id=x.estabelecimento_id)
    ]
    await registrar_leitura_sensivel(
        db,
        usuario=u,
        recurso="registro_assistencial",
        recurso_id=cidadao_id,
        finalidade="consulta_prontuario",
        cliente=dados_do_cliente(r),
    )
    await db.commit()
    return visiveis
