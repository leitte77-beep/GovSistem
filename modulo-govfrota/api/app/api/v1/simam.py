"""SIM-AM/TCE-PR: competências, medidores, saídas extraordinárias e tabelas do TCE."""

import json
import uuid
from datetime import date
from decimal import Decimal
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Response
from pydantic import BaseModel, Field, field_validator
from sqlalchemy import func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.auth import require_permission
from app.core.database import get_db
from app.core.permissions import Perm
from app.models.anexo import Anexo
from app.models.auth_models import User
from app.models.combustivel import Tanque
from app.models.configuracoes import ConfiguracaoGovFrota
from app.models.enums import OrigemMovimentacao, TipoMovimentacao
from app.models.simam import (
    MedicaoDeclarada,
    SaidaExtraCombustivel,
    SimamCompetencia,
    SimamReferencia,
    VeiculoMedidor,
)
from app.models.veiculo import Veiculo
from app.services.auditoria import registrar_auditoria
from app.services.estoque import EstoqueError, aplicar_movimentacao
from app.services.simam import competencia as svc
from app.services.simam.layout import ARQUIVOS, SAIDAS_SEM_NOTA_OBRIGATORIA, TIPOS_SAIDA

router = APIRouter(prefix="/simam", tags=["SIM-AM"])


def _erro(exc: svc.SimamError):
    return HTTPException(status_code=exc.status, detail=exc.mensagem)


def _so_digitos(v: Optional[str]) -> Optional[str]:
    if v is None:
        return None
    return "".join(ch for ch in v if ch.isdigit()) or None


async def _anexo_da_org(db: AsyncSession, org_id: uuid.UUID, anexo_id: Optional[uuid.UUID], obrigatorio: bool):
    if anexo_id is None:
        if obrigatorio:
            raise HTTPException(status_code=422, detail="Anexe o documento firmado pelos responsáveis.")
        return
    ok = await db.scalar(
        select(Anexo.id).where(Anexo.id == anexo_id, Anexo.organization_id == org_id, Anexo.deleted_at.is_(None))
    )
    if ok is None:
        raise HTTPException(status_code=422, detail="Anexo inválido.")


# ── Competências ─────────────────────────────────────────────────────────────


@router.get("/competencias")
async def listar_competencias(
    ano: int,
    user: User = Depends(require_permission(Perm.REPORTS_VIEW)),
    db: AsyncSession = Depends(get_db),
):
    registros = {
        c.mes: c
        for c in (
            await db.execute(
                select(SimamCompetencia).where(
                    SimamCompetencia.organization_id == user.organization_id, SimamCompetencia.ano == ano
                )
            )
        ).scalars()
    }
    return [
        {
            "ano": ano,
            "mes": mes,
            "status": registros[mes].status if mes in registros else "ABERTA",
            "fechada_em": registros[mes].fechada_em if mes in registros else None,
            "exportada_em": registros[mes].exportada_em if mes in registros else None,
        }
        for mes in range(1, 13)
    ]


@router.get("/competencias/{ano}/{mes}")
async def detalhar_competencia(
    ano: int,
    mes: int,
    user: User = Depends(require_permission(Perm.REPORTS_VIEW)),
    db: AsyncSession = Depends(get_db),
):
    if not 1 <= mes <= 12:
        raise HTTPException(status_code=422, detail="Mês inválido.")
    comp = await svc.obter(db, user.organization_id, ano, mes)
    if comp and comp.status != "ABERTA" and comp.retrato_json:
        dados = {"ano": ano, "mes": mes, "arquivos": json.loads(comp.retrato_json), "erros": [], "avisos": []}
    else:
        dados = (await svc.calcular(db, user.organization_id, ano, mes)).como_dict()
        await db.commit()  # medidor nº 1 criado na primeira consulta
    dados.update(
        status=comp.status if comp else "ABERTA",
        fechada_em=comp.fechada_em if comp else None,
        exportada_em=comp.exportada_em if comp else None,
        arquivo_sha256=comp.arquivo_sha256 if comp else None,
        historico=json.loads(comp.historico_json or "[]") if comp else [],
        layout={nome: [c.nome for c in campos] for nome, campos in ARQUIVOS.items()},
    )
    return dados


class Justificativa(BaseModel):
    justificativa: str = Field(min_length=5, max_length=2000)


@router.post("/competencias/{ano}/{mes}/fechar")
async def fechar_competencia(
    ano: int,
    mes: int,
    user: User = Depends(require_permission(Perm.CONFIG_MANAGE)),
    db: AsyncSession = Depends(get_db),
):
    try:
        comp = await svc.fechar(db, user.organization_id, ano, mes, user.id)
    except svc.SimamError as exc:
        raise _erro(exc)
    await registrar_auditoria(
        db, organization_id=user.organization_id, acao="simam.fechar", entidade="simam_competencia",
        entidade_id=comp.id, usuario_id=user.id, dados_novos={"competencia": f"{mes:02d}/{ano}"},
    )
    await db.commit()
    return {"ok": True, "status": comp.status}


@router.post("/competencias/{ano}/{mes}/reabrir")
async def reabrir_competencia(
    ano: int,
    mes: int,
    body: Justificativa,
    user: User = Depends(require_permission(Perm.CONFIG_MANAGE)),
    db: AsyncSession = Depends(get_db),
):
    try:
        comp = await svc.reabrir(db, user.organization_id, ano, mes, user.id, body.justificativa)
    except svc.SimamError as exc:
        raise _erro(exc)
    await registrar_auditoria(
        db, organization_id=user.organization_id, acao="simam.reabrir", entidade="simam_competencia",
        entidade_id=comp.id, usuario_id=user.id, justificativa=body.justificativa,
        dados_novos={"competencia": f"{mes:02d}/{ano}"},
    )
    await db.commit()
    return {"ok": True, "status": comp.status}


@router.post("/competencias/{ano}/{mes}/exportada")
async def marcar_exportada(
    ano: int,
    mes: int,
    user: User = Depends(require_permission(Perm.CONFIG_MANAGE)),
    db: AsyncSession = Depends(get_db),
):
    try:
        comp = await svc.marcar_exportada(db, user.organization_id, ano, mes, user.id)
    except svc.SimamError as exc:
        raise _erro(exc)
    await registrar_auditoria(
        db, organization_id=user.organization_id, acao="simam.exportada", entidade="simam_competencia",
        entidade_id=comp.id, usuario_id=user.id, dados_novos={"competencia": f"{mes:02d}/{ano}"},
    )
    await db.commit()
    return {"ok": True, "status": comp.status}


@router.get("/competencias/{ano}/{mes}/arquivo")
async def baixar_arquivo(
    ano: int,
    mes: int,
    user: User = Depends(require_permission(Perm.CONFIG_MANAGE)),
    db: AsyncSession = Depends(get_db),
):
    comp = await svc.obter(db, user.organization_id, ano, mes)
    if comp is None or comp.status == "ABERTA" or not comp.retrato_json:
        raise HTTPException(status_code=422, detail="Feche a competência para gerar os arquivos.")
    conteudo = svc.gerar_zip(json.loads(comp.retrato_json))
    return Response(
        content=conteudo,
        media_type="application/zip",
        headers={"Content-Disposition": f'attachment; filename="SIMAM-frota-{ano}-{mes:02d}.zip"'},
    )


# ── Medidores ────────────────────────────────────────────────────────────────


async def _veiculo(db: AsyncSession, user: User, veiculo_id: uuid.UUID) -> Veiculo:
    v = (
        await db.execute(
            select(Veiculo).where(
                Veiculo.id == veiculo_id,
                Veiculo.organization_id == user.organization_id,
                Veiculo.deleted_at.is_(None),
            )
        )
    ).scalar_one_or_none()
    if v is None:
        raise HTTPException(status_code=404, detail="Veículo não encontrado.")
    return v


@router.get("/veiculos/{veiculo_id}/medidores")
async def listar_medidores(
    veiculo_id: uuid.UUID,
    user: User = Depends(require_permission(Perm.VEHICLE_VIEW)),
    db: AsyncSession = Depends(get_db),
):
    v = await _veiculo(db, user, veiculo_id)
    lista = await svc.medidores(db, v)
    declaradas = (
        await db.execute(
            select(MedicaoDeclarada)
            .where(MedicaoDeclarada.veiculo_id == v.id)
            .order_by(MedicaoDeclarada.data_referencia.desc())
        )
    ).scalars().all()
    seq = {m.id: m.sequencial for m in lista}
    await db.commit()
    return {
        "tipo_medidor": svc.tipo_medidor(v),
        "medidores": [
            {
                "id": str(m.id), "sequencial": m.sequencial, "tipo": m.tipo,
                "data_inicio": m.data_inicio, "leitura_inicial": m.leitura_inicial,
                "data_fim": m.data_fim, "leitura_final": m.leitura_final, "motivo": m.motivo,
                "anexo_url": f"/api/govfrota/uploads/{m.anexo_id}" if m.anexo_id else None,
            }
            for m in lista
        ],
        "declaradas": [
            {
                "id": str(d.id), "medidor_sequencial": seq.get(d.medidor_id),
                "data_referencia": d.data_referencia, "quantidade": d.quantidade,
                "justificativa": d.justificativa, "cancelada": d.cancelada_em is not None,
                "anexo_url": f"/api/govfrota/uploads/{d.anexo_id}",
            }
            for d in declaradas
        ],
    }


class TrocaMedidor(BaseModel):
    data_troca: date
    leitura_final_antigo: Decimal = Field(ge=0)
    leitura_inicial_novo: Decimal = Field(ge=0)
    motivo: str = Field(min_length=5, max_length=2000)
    anexo_id: Optional[uuid.UUID] = None


@router.post("/veiculos/{veiculo_id}/trocar-medidor", status_code=201)
async def trocar_medidor(
    veiculo_id: uuid.UUID,
    body: TrocaMedidor,
    user: User = Depends(require_permission(Perm.VEHICLE_MANAGE)),
    db: AsyncSession = Depends(get_db),
):
    """Troca física do hodômetro/horímetro: encerra o atual e abre o próximo sequencial."""
    v = await _veiculo(db, user, veiculo_id)
    if svc.tipo_medidor(v) == 3:
        raise HTTPException(status_code=422, detail="Veículo marcado como sem hodômetro/horímetro.")
    try:
        await svc.exigir_aberta(db, user.organization_id, body.data_troca, "troca de medidor")
    except svc.SimamError as exc:
        raise _erro(exc)
    await _anexo_da_org(db, user.organization_id, body.anexo_id, obrigatorio=False)
    lista = await svc.medidores(db, v)
    atual = lista[-1]
    if body.data_troca < atual.data_inicio:
        raise HTTPException(status_code=422, detail="A troca não pode ser anterior à instalação do medidor atual.")
    atual.data_fim = body.data_troca
    atual.leitura_final = body.leitura_final_antigo
    novo = VeiculoMedidor(
        organization_id=user.organization_id,
        veiculo_id=v.id,
        sequencial=atual.sequencial + 1,
        tipo=atual.tipo,
        data_inicio=body.data_troca,
        leitura_inicial=body.leitura_inicial_novo,
        motivo=body.motivo,
        anexo_id=body.anexo_id,
        usuario_id=user.id,
    )
    db.add(novo)
    # A leitura corrente do veículo passa a ser a do aparelho novo.
    if atual.tipo == 2:
        v.horimetro_atual = body.leitura_inicial_novo
    else:
        v.quilometragem_atual = int(body.leitura_inicial_novo)
    await registrar_auditoria(
        db, organization_id=user.organization_id, acao="veiculo.trocar_medidor", entidade="veiculo",
        entidade_id=v.id, usuario_id=user.id, justificativa=body.motivo,
        dados_anteriores={"sequencial": atual.sequencial, "leitura_final": str(body.leitura_final_antigo)},
        dados_novos={"sequencial": novo.sequencial, "leitura_inicial": str(body.leitura_inicial_novo)},
    )
    await db.commit()
    return {"ok": True, "sequencial": novo.sequencial}


class DeclaracaoMedicao(BaseModel):
    data_referencia: date
    quantidade: Decimal = Field(gt=0)
    justificativa: str = Field(min_length=5, max_length=250)
    anexo_id: uuid.UUID


@router.post("/veiculos/{veiculo_id}/medicoes-declaradas", status_code=201)
async def declarar_medicao(
    veiculo_id: uuid.UUID,
    body: DeclaracaoMedicao,
    user: User = Depends(require_permission(Perm.VEHICLE_MANAGE)),
    db: AsyncSession = Depends(get_db),
):
    """Km/horas rodados com o medidor danificado (exige documento firmado)."""
    v = await _veiculo(db, user, veiculo_id)
    if svc.tipo_medidor(v) == 3:
        raise HTTPException(status_code=422, detail="Veículo marcado como sem hodômetro/horímetro.")
    try:
        await svc.exigir_aberta(db, user.organization_id, body.data_referencia, "declaração de medição")
    except svc.SimamError as exc:
        raise _erro(exc)
    await _anexo_da_org(db, user.organization_id, body.anexo_id, obrigatorio=True)
    medidor = svc._medidor_da_data(await svc.medidores(db, v), body.data_referencia)
    if medidor is None:
        raise HTTPException(status_code=422, detail="Nenhum medidor instalado nessa data.")
    d = MedicaoDeclarada(
        organization_id=user.organization_id,
        veiculo_id=v.id,
        medidor_id=medidor.id,
        data_referencia=body.data_referencia,
        quantidade=body.quantidade,
        justificativa=body.justificativa,
        anexo_id=body.anexo_id,
        usuario_id=user.id,
    )
    db.add(d)
    await db.flush()
    await registrar_auditoria(
        db, organization_id=user.organization_id, acao="veiculo.medicao_declarada", entidade="veiculo",
        entidade_id=v.id, usuario_id=user.id, justificativa=body.justificativa,
        dados_novos={"quantidade": str(body.quantidade), "data": body.data_referencia.isoformat()},
    )
    await db.commit()
    return {"ok": True, "id": str(d.id)}


@router.post("/medicoes-declaradas/{declaracao_id}/cancelar")
async def cancelar_declaracao(
    declaracao_id: uuid.UUID,
    body: Justificativa,
    user: User = Depends(require_permission(Perm.VEHICLE_MANAGE)),
    db: AsyncSession = Depends(get_db),
):
    d = (
        await db.execute(
            select(MedicaoDeclarada).where(
                MedicaoDeclarada.id == declaracao_id, MedicaoDeclarada.organization_id == user.organization_id
            )
        )
    ).scalar_one_or_none()
    if d is None:
        raise HTTPException(status_code=404, detail="Declaração não encontrada.")
    if d.cancelada_em is not None:
        raise HTTPException(status_code=422, detail="Declaração já cancelada.")
    try:
        await svc.exigir_aberta(db, user.organization_id, d.data_referencia, "cancelamento de declaração")
    except svc.SimamError as exc:
        raise _erro(exc)
    from datetime import datetime, timezone

    d.cancelada_em = datetime.now(timezone.utc)
    d.motivo_cancelamento = body.justificativa
    await registrar_auditoria(
        db, organization_id=user.organization_id, acao="veiculo.medicao_declarada_cancelar", entidade="veiculo",
        entidade_id=d.veiculo_id, usuario_id=user.id, justificativa=body.justificativa,
    )
    await db.commit()
    return {"ok": True}


# ── Saídas extraordinárias ───────────────────────────────────────────────────


class SaidaExtraCreate(BaseModel):
    tanque_id: uuid.UUID
    tipo_saida: int
    data_saida: date
    quantidade: Decimal = Field(gt=0)
    responsavel_cpf: Optional[str] = None
    nota_explicativa: Optional[str] = Field(default=None, max_length=250)
    recebedor_nome: Optional[str] = Field(default=None, max_length=150)
    recebedor_cpf_cnpj: Optional[str] = None
    convenio_numero: Optional[str] = Field(default=None, max_length=20)
    convenio_ano: Optional[int] = None
    convenio_objeto: Optional[str] = Field(default=None, max_length=250)
    anexo_id: Optional[uuid.UUID] = None

    @field_validator("tipo_saida")
    @classmethod
    def _tipo(cls, v: int) -> int:
        if v not in TIPOS_SAIDA:
            raise ValueError("Tipo de saída inválido.")
        return v


async def registrar_saida_extra(
    db: AsyncSession, user: User, body: SaidaExtraCreate, *, inventario_id: uuid.UUID | None = None
) -> SaidaExtraCombustivel:
    """Valida, numera e debita o tanque. Não faz commit (usado também pelo inventário)."""
    try:
        await svc.exigir_aberta(db, user.organization_id, body.data_saida, "saída extraordinária")
    except svc.SimamError as exc:
        raise _erro(exc)
    tanque = (
        await db.execute(
            select(Tanque).where(
                Tanque.id == body.tanque_id,
                Tanque.organization_id == user.organization_id,
                Tanque.deleted_at.is_(None),
            )
        )
    ).scalar_one_or_none()
    if tanque is None:
        raise HTTPException(status_code=422, detail="Tanque inválido.")
    cpf = _so_digitos(body.responsavel_cpf)
    if not cpf:
        cpf = await db.scalar(
            select(ConfiguracaoGovFrota.simam_cpf_responsavel).where(
                ConfiguracaoGovFrota.organization_id == user.organization_id
            )
        )
    if not cpf or len(cpf) != 11:
        raise HTTPException(status_code=422, detail="Informe o CPF do servidor responsável pelo combustível.")
    nota = (body.nota_explicativa or "").strip() or None
    if body.tipo_saida not in SAIDAS_SEM_NOTA_OBRIGATORIA and not nota:
        raise HTTPException(status_code=422, detail="Nota explicativa é obrigatória para este tipo de saída.")
    if body.tipo_saida == 6 and not all(
        [body.recebedor_nome, _so_digitos(body.recebedor_cpf_cnpj), body.convenio_numero, body.convenio_ano, body.convenio_objeto]
    ):
        raise HTTPException(
            status_code=422,
            detail="Saída para convênio exige recebedor, CPF/CNPJ, número, ano e objeto do convênio.",
        )
    await _anexo_da_org(db, user.organization_id, body.anexo_id, obrigatorio=False)

    saida = SaidaExtraCombustivel(
        organization_id=user.organization_id,
        ano=body.data_saida.year,
        numero=await svc.proximo_numero_saida(db, user.organization_id, body.data_saida.year),
        tanque_id=tanque.id,
        combustivel_id=tanque.combustivel_id,
        tipo_saida=body.tipo_saida,
        data_saida=body.data_saida,
        quantidade=body.quantidade,
        responsavel_cpf=cpf,
        nota_explicativa=nota,
        recebedor_nome=body.recebedor_nome if body.tipo_saida == 6 else None,
        recebedor_cpf_cnpj=_so_digitos(body.recebedor_cpf_cnpj) if body.tipo_saida == 6 else None,
        convenio_numero=body.convenio_numero if body.tipo_saida == 6 else None,
        convenio_ano=body.convenio_ano if body.tipo_saida == 6 else None,
        convenio_objeto=body.convenio_objeto if body.tipo_saida == 6 else None,
        anexo_id=body.anexo_id,
        inventario_id=inventario_id,
        usuario_id=user.id,
    )
    db.add(saida)
    await db.flush()
    try:
        mov = await aplicar_movimentacao(
            db,
            organization_id=user.organization_id,
            tipo=TipoMovimentacao.SAIDA.value,
            origem=OrigemMovimentacao.SAIDA_EXTRA.value,
            sinal=-1,
            quantidade=Decimal(body.quantidade),
            combustivel_id=tanque.combustivel_id,
            tanque_id=tanque.id,
            referencia_id=saida.id,
            referencia_tipo="SAIDA_EXTRA",
            descricao=f"{TIPOS_SAIDA[body.tipo_saida]}: {nota or '-'}",
            responsavel_usuario_id=user.id,
            permitir_negativo=inventario_id is not None,
        )
    except EstoqueError as e:
        raise HTTPException(status_code=422, detail=e.mensagem)
    saida.movimentacao_id = mov.id
    await registrar_auditoria(
        db, organization_id=user.organization_id, acao="estoque.saida_extra", entidade="tanque",
        entidade_id=tanque.id, usuario_id=user.id, justificativa=nota,
        dados_novos={"tipo": TIPOS_SAIDA[body.tipo_saida], "litros": str(body.quantidade)},
    )
    return saida


def _saida_json(s: SaidaExtraCombustivel, tanque_nome: str | None = None) -> dict:
    return {
        "id": str(s.id), "numero": s.numero, "ano": s.ano, "tanque_id": str(s.tanque_id),
        "tanque_nome": tanque_nome, "tipo_saida": s.tipo_saida, "tipo_nome": TIPOS_SAIDA.get(s.tipo_saida),
        "data_saida": s.data_saida, "quantidade": s.quantidade, "responsavel_cpf": s.responsavel_cpf,
        "nota_explicativa": s.nota_explicativa, "recebedor_nome": s.recebedor_nome,
        "convenio_numero": s.convenio_numero, "convenio_ano": s.convenio_ano,
        "anexo_url": f"/api/govfrota/uploads/{s.anexo_id}" if s.anexo_id else None,
    }


@router.get("/saidas-extra")
async def listar_saidas(
    tanque_id: Optional[uuid.UUID] = None,
    user: User = Depends(require_permission(Perm.REFUELING_VIEW)),
    db: AsyncSession = Depends(get_db),
):
    stmt = (
        select(SaidaExtraCombustivel, Tanque.nome)
        .join(Tanque, Tanque.id == SaidaExtraCombustivel.tanque_id)
        .where(SaidaExtraCombustivel.organization_id == user.organization_id)
        .order_by(SaidaExtraCombustivel.data_saida.desc(), SaidaExtraCombustivel.numero.desc())
        .limit(200)
    )
    if tanque_id:
        stmt = stmt.where(SaidaExtraCombustivel.tanque_id == tanque_id)
    return [_saida_json(s, nome) for s, nome in (await db.execute(stmt)).all()]


@router.post("/saidas-extra", status_code=201)
async def criar_saida(
    body: SaidaExtraCreate,
    user: User = Depends(require_permission(Perm.FUEL_MANAGE)),
    db: AsyncSession = Depends(get_db),
):
    saida = await registrar_saida_extra(db, user, body)
    await db.commit()
    return _saida_json(saida)


@router.get("/tipos")
async def tipos(user: User = Depends(require_permission(Perm.VEHICLE_VIEW))):
    from app.services.simam.layout import TIPOS_ENTRADA, TIPOS_MEDIDOR

    return {
        "saida": [{"codigo": k, "nome": v} for k, v in TIPOS_SAIDA.items()],
        "saida_sem_nota": sorted(SAIDAS_SEM_NOTA_OBRIGATORIA),
        "medidor": [{"codigo": k, "nome": v} for k, v in TIPOS_MEDIDOR.items()],
        "entrada": [
            {"codigo": "ORCAMENTARIA", "nome": "Compra (orçamentária)"},
            {"codigo": "DOACAO", "nome": "Doação"},
            {"codigo": "CONVENIO", "nome": "Convênio"},
            {"codigo": "AJUSTE_LIQUIDACAO", "nome": "Ajuste por liquidação quantitativa"},
        ],
        "entrada_codigos": TIPOS_ENTRADA,
    }


# ── Tabelas do TCE ───────────────────────────────────────────────────────────


@router.get("/referencias/{tabela}")
async def buscar_referencia(
    tabela: str,
    busca: str = "",
    user: User = Depends(require_permission(Perm.VEHICLE_VIEW)),
    db: AsyncSession = Depends(get_db),
):
    stmt = select(SimamReferencia).where(SimamReferencia.tabela == tabela)
    termo = busca.strip()
    if termo:
        stmt = stmt.where(
            or_(SimamReferencia.codigo.ilike(f"{termo}%"), SimamReferencia.descricao.ilike(f"%{termo}%"))
        )
    total = await db.scalar(select(func.count()).select_from(SimamReferencia).where(SimamReferencia.tabela == tabela))
    itens = (await db.execute(stmt.order_by(SimamReferencia.descricao).limit(30))).scalars().all()
    return {
        "importada": bool(total),
        "itens": [{"codigo": i.codigo, "descricao": i.descricao, "extra": i.extra} for i in itens],
    }
