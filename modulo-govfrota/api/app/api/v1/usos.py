"""Registro de uso de veículos (diário de bordo).

O motorista registra a saída (finalidade, destino, km/horímetro e foto do
painel) e depois a chegada. A gestão acompanha pelo painel, encerra usos
esquecidos e lança usos anotados fora do app.

Regras:
- Um uso aberto por veículo e por motorista (também garantido no banco).
- Medição de saída diferente da última conhecida do veículo só gera aviso.
- Medição de chegada menor que a de saída é recusada (erro de digitação).
- A chegada atualiza a km/horímetro do veículo, só para frente.
"""

import json
import uuid
from datetime import date, datetime, time, timedelta, timezone
from decimal import Decimal

from fastapi import APIRouter, Depends, HTTPException, Response
from pydantic import BaseModel, Field
from sqlalchemy import func as sa_func
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.v1.app_motorista import _data_informada, _exigir_veiculo_permitido
from app.core.auth import filtro_escopo, get_current_motorista, require_permission
from app.core.database import get_db
from app.core.permissions import Perm
from app.core.timezone import ensure_aware, get_tz, to_display
from app.models.auth_models import User
from app.models.motorista import Motorista
from app.models.unidade import Unidade
from app.models.uso_veiculo import UsoVeiculo
from app.models.veiculo import Veiculo
from app.services.auditoria import registrar_auditoria

router = APIRouter(prefix="/usos", tags=["diário de bordo"])
router_app = APIRouter(prefix="/app/motorista/usos", tags=["app do motorista"])

# Uso aberto além disso vira alerta no painel.
HORAS_ALERTA_USO_ABERTO = 8

STATUS_ROTULO = {"EM_USO": "Em uso", "CONCLUIDO": "Concluído", "ENCERRADO_GESTOR": "Encerrado pela gestão"}


# ── Schemas ──────────────────────────────────────────────────────────────


class SaidaApp(BaseModel):
    veiculo_id: uuid.UUID
    finalidade: str = Field(min_length=3, max_length=2000)
    destino: str = Field(min_length=2, max_length=255)
    medicao: Decimal = Field(ge=0)
    foto_url: str = Field(min_length=1, max_length=500)
    # Fila offline do app: o celular gera o id (a chegada aponta para ele antes
    # mesmo da saída ser enviada; reenviar não duplica) e informa o momento.
    id: uuid.UUID | None = None
    registrado_em: datetime | None = None
    latitude: Decimal | None = Field(default=None, ge=-90, le=90)
    longitude: Decimal | None = Field(default=None, ge=-180, le=180)


class ChegadaApp(BaseModel):
    medicao: Decimal = Field(ge=0)
    foto_url: str = Field(min_length=1, max_length=500)
    registrado_em: datetime | None = None
    # Veio da fila offline: km de chegada menor vira alerta para o gestor
    # (o deslocamento já aconteceu) em vez de recusa.
    registrado_offline: bool = False
    latitude: Decimal | None = Field(default=None, ge=-90, le=90)
    longitude: Decimal | None = Field(default=None, ge=-180, le=180)


class Encerrar(BaseModel):
    medicao: Decimal = Field(ge=0)
    chegada_em: datetime | None = None
    motivo: str = Field(min_length=3, max_length=2000)
    foto_url: str | None = Field(default=None, max_length=500)


class LancamentoPainel(BaseModel):
    veiculo_id: uuid.UUID
    motorista_id: uuid.UUID
    finalidade: str = Field(min_length=3, max_length=2000)
    destino: str = Field(min_length=2, max_length=255)
    saida_em: datetime
    medicao_saida: Decimal = Field(ge=0)
    chegada_em: datetime
    medicao_chegada: Decimal = Field(ge=0)
    foto_saida_url: str | None = Field(default=None, max_length=500)
    foto_chegada_url: str | None = Field(default=None, max_length=500)


# ── Regras ───────────────────────────────────────────────────────────────


def _medicao_atual(veiculo: Veiculo) -> Decimal:
    if veiculo.usa_horimetro:
        return Decimal(veiculo.horimetro_atual or 0)
    return Decimal(veiculo.quilometragem_atual or 0)


def _fmt(v: Decimal | None, horimetro: bool) -> str:
    if v is None:
        return "-"
    return f"{v:.1f}".replace(".", ",") if horimetro else f"{int(v):,}".replace(",", ".")


def _instante(dt: datetime) -> datetime:
    """Data/hora digitada no painel sem fuso é hora local da organização."""
    return dt.replace(tzinfo=get_tz()) if dt.tzinfo is None else dt


def _inicio_dia(d: str, dias: int = 0) -> datetime:
    return datetime.combine(date.fromisoformat(d[:10]) + timedelta(days=dias), time.min, tzinfo=get_tz())


def _aviso_divergencia(veiculo: Veiculo, medicao_saida: Decimal) -> list[dict]:
    atual = _medicao_atual(veiculo)
    if medicao_saida == atual:
        return []
    h = veiculo.usa_horimetro
    un = "h" if h else "km"
    return [{
        "tipo": "MEDICAO_DIVERGENTE",
        "mensagem": f"{'Horímetro' if h else 'Km'} de saída ({_fmt(medicao_saida, h)} {un}) diferente do último "
                    f"registrado no veículo ({_fmt(atual, h)} {un}).",
    }]


def _validar_chegada(uso: UsoVeiculo, medicao: Decimal, chegada_em: datetime) -> None:
    if medicao < uso.medicao_saida:
        nome = "Horímetro" if uso.usa_horimetro else "Km"
        raise HTTPException(
            status_code=422,
            detail=f"{nome} de chegada ({_fmt(medicao, uso.usa_horimetro)}) menor que o de saída "
                   f"({_fmt(uso.medicao_saida, uso.usa_horimetro)}). Confira o painel.",
        )
    if ensure_aware(chegada_em) < ensure_aware(uso.saida_em):
        raise HTTPException(status_code=422, detail="A chegada não pode ser antes da saída.")


def _liberar_veiculo(veiculo: Veiculo) -> None:
    """Fim do uso: volta a Disponível só quem o uso colocou em Em uso."""
    if veiculo.situacao == "EM_USO":
        veiculo.situacao = "DISPONIVEL"


def _atualizar_medicao_veiculo(veiculo: Veiculo, medicao: Decimal) -> None:
    if veiculo.usa_horimetro:
        if medicao > Decimal(veiculo.horimetro_atual or 0):
            veiculo.horimetro_atual = medicao
    elif int(medicao) > (veiculo.quilometragem_atual or 0):
        veiculo.quilometragem_atual = int(medicao)


async def _commit_unico(db: AsyncSession) -> None:
    """Commit que traduz a trava do banco (uso aberto duplicado) em mensagem."""
    try:
        await db.commit()
    except IntegrityError:
        await db.rollback()
        raise HTTPException(status_code=409, detail="Já existe um uso em aberto para este veículo ou motorista.")


async def _uso_aberto(db: AsyncSession, **filtro) -> UsoVeiculo | None:
    stmt = select(UsoVeiculo).where(UsoVeiculo.status == "EM_USO")
    for campo, valor in filtro.items():
        stmt = stmt.where(getattr(UsoVeiculo, campo) == valor)
    return (await db.execute(stmt)).scalars().first()


async def _serializar(db: AsyncSession, usos: list[UsoVeiculo]) -> list[dict]:
    """Junta veículo, motorista e secretaria em lote (sem N+1)."""
    ids_v = {u.veiculo_id for u in usos}
    ids_m = {u.motorista_id for u in usos}
    ids_u = {u.unidade_id for u in usos if u.unidade_id}
    veics = {v.id: v for v in (await db.execute(select(Veiculo).where(Veiculo.id.in_(ids_v)))).scalars()} if ids_v else {}
    mots = {m.id: m.nome for m in (await db.execute(select(Motorista).where(Motorista.id.in_(ids_m)))).scalars()} if ids_m else {}
    unids = {x.id: x.nome for x in (await db.execute(select(Unidade).where(Unidade.id.in_(ids_u)))).scalars()} if ids_u else {}
    agora = datetime.now(timezone.utc)
    itens = []
    for u in usos:
        v = veics.get(u.veiculo_id)
        fim = ensure_aware(u.chegada_em) if u.chegada_em else agora
        percorrido = (u.medicao_chegada - u.medicao_saida) if u.medicao_chegada is not None else None
        itens.append({
            "id": str(u.id),
            "veiculo_id": str(u.veiculo_id),
            "veiculo_placa": v.placa if v else None,
            "veiculo_modelo": f"{v.marca or ''} {v.modelo or ''}".strip() if v else None,
            "veiculo_foto_url": v.foto_url if v else None,
            "motorista_id": str(u.motorista_id),
            "motorista_nome": mots.get(u.motorista_id),
            "unidade_id": str(u.unidade_id) if u.unidade_id else None,
            "unidade_nome": unids.get(u.unidade_id),
            "finalidade": u.finalidade,
            "destino": u.destino,
            "usa_horimetro": u.usa_horimetro,
            "saida_em": ensure_aware(u.saida_em).isoformat(),
            "medicao_saida": float(u.medicao_saida),
            "foto_saida_url": u.foto_saida_url,
            "chegada_em": ensure_aware(u.chegada_em).isoformat() if u.chegada_em else None,
            "medicao_chegada": float(u.medicao_chegada) if u.medicao_chegada is not None else None,
            "foto_chegada_url": u.foto_chegada_url,
            "saida_latitude": float(u.saida_latitude) if u.saida_latitude is not None else None,
            "saida_longitude": float(u.saida_longitude) if u.saida_longitude is not None else None,
            "chegada_latitude": float(u.chegada_latitude) if u.chegada_latitude is not None else None,
            "chegada_longitude": float(u.chegada_longitude) if u.chegada_longitude is not None else None,
            "percorrido": float(percorrido) if percorrido is not None else None,
            "duracao_min": int((fim - ensure_aware(u.saida_em)).total_seconds() // 60),
            "status": u.status,
            "origem": u.origem,
            "motivo_encerramento": u.motivo_encerramento,
            "alertas": json.loads(u.alertas) if u.alertas else [],
            "atrasado": u.status == "EM_USO"
            and agora - ensure_aware(u.saida_em) > timedelta(hours=HORAS_ALERTA_USO_ABERTO),
        })
    return itens


# ── App do motorista ─────────────────────────────────────────────────────


@router_app.get("/atual")
async def uso_atual(
    motorista: Motorista = Depends(get_current_motorista),
    db: AsyncSession = Depends(get_db),
):
    """Uso em aberto do motorista (ou null) — o app abre direto na chegada."""
    uso = await _uso_aberto(db, motorista_id=motorista.id, organization_id=motorista.organization_id)
    return (await _serializar(db, [uso]))[0] if uso else None


@router_app.post("", status_code=201)
async def registrar_saida(
    body: SaidaApp,
    motorista: Motorista = Depends(get_current_motorista),
    db: AsyncSession = Depends(get_db),
):
    veiculo = (
        await db.execute(
            select(Veiculo).where(
                Veiculo.id == body.veiculo_id,
                Veiculo.organization_id == motorista.organization_id,
                Veiculo.deleted_at.is_(None),
                Veiculo.situacao != "BAIXADO",
            )
        )
    ).scalar_one_or_none()
    if veiculo is None:
        raise HTTPException(status_code=404, detail="Veículo não encontrado.")
    if body.id is not None:
        existente = await db.get(UsoVeiculo, body.id)
        if existente is not None:
            if existente.motorista_id != motorista.id:
                raise HTTPException(status_code=409, detail="Identificador já utilizado.")
            return {**(await _serializar(db, [existente]))[0], "avisos": []}
    await _exigir_veiculo_permitido(db, motorista, veiculo.id)
    saida_em = _data_informada(body.registrado_em, "Saída")
    if await _uso_aberto(db, motorista_id=motorista.id):
        raise HTTPException(status_code=409, detail="Você já tem um uso em aberto. Registre a chegada antes de sair de novo.")
    outro = await _uso_aberto(db, veiculo_id=veiculo.id)
    if outro:
        nome = (await db.get(Motorista, outro.motorista_id)).nome
        raise HTTPException(status_code=409, detail=f"Este veículo está em uso por {nome} desde "
                                                    f"{to_display(ensure_aware(outro.saida_em)):%d/%m %H:%M}.")

    alertas = _aviso_divergencia(veiculo, body.medicao)
    uso = UsoVeiculo(
        **({"id": body.id} if body.id is not None else {}),
        organization_id=motorista.organization_id,
        veiculo_id=veiculo.id,
        motorista_id=motorista.id,
        unidade_id=veiculo.unidade_id,
        finalidade=body.finalidade.strip(),
        destino=body.destino.strip(),
        usa_horimetro=bool(veiculo.usa_horimetro),
        saida_em=saida_em,
        medicao_saida=body.medicao,
        foto_saida_url=body.foto_url,
        saida_latitude=body.latitude,
        saida_longitude=body.longitude,
        status="EM_USO",
        origem="APP_MOTORISTA",
        alertas=json.dumps(alertas, ensure_ascii=False) if alertas else None,
    )
    db.add(uso)
    # Manutenção/indisponível não são sobrescritos pelo uso.
    if veiculo.situacao == "DISPONIVEL":
        veiculo.situacao = "EM_USO"
    await db.flush()
    await registrar_auditoria(
        db, organization_id=motorista.organization_id, acao="uso.saida", entidade="uso_veiculo",
        entidade_id=uso.id, motorista_id=motorista.id,
        dados_novos={"veiculo": str(veiculo.id), "medicao": str(body.medicao), "destino": uso.destino,
                     "alertas": [a["tipo"] for a in alertas] or None},
    )
    await _commit_unico(db)
    dados = (await _serializar(db, [uso]))[0]
    dados["avisos"] = [a["mensagem"] for a in alertas]
    return dados


@router_app.post("/{uso_id}/chegada")
async def registrar_chegada(
    uso_id: uuid.UUID,
    body: ChegadaApp,
    motorista: Motorista = Depends(get_current_motorista),
    db: AsyncSession = Depends(get_db),
):
    uso = await db.get(UsoVeiculo, uso_id)
    if uso is None or uso.motorista_id != motorista.id or uso.organization_id != motorista.organization_id:
        raise HTTPException(status_code=404, detail="Uso não encontrado.")
    if uso.status != "EM_USO":
        # Reenvio da fila offline, ou o gestor encerrou pelo painel enquanto o
        # celular estava sem sinal: devolve o que vale, sem pendência eterna.
        if body.registrado_offline or uso.medicao_chegada == body.medicao:
            return (await _serializar(db, [uso]))[0]
        raise HTTPException(status_code=409, detail="Este uso já foi encerrado.")
    agora = _data_informada(body.registrado_em, "Chegada")
    if ensure_aware(agora) < ensure_aware(uso.saida_em):
        agora = ensure_aware(uso.saida_em)  # relógio do celular ajustado no meio do uso
    try:
        _validar_chegada(uso, body.medicao, agora)
    except HTTPException as exc:
        if not body.registrado_offline:
            raise
        alertas = json.loads(uso.alertas) if uso.alertas else []
        alertas.append({"tipo": "MEDICAO_INFERIOR", "mensagem": f"Registro offline: {exc.detail}"})
        uso.alertas = json.dumps(alertas, ensure_ascii=False)
    uso.chegada_em = agora
    uso.medicao_chegada = body.medicao
    uso.foto_chegada_url = body.foto_url
    uso.chegada_latitude = body.latitude
    uso.chegada_longitude = body.longitude
    uso.status = "CONCLUIDO"
    veiculo = await db.get(Veiculo, uso.veiculo_id)
    _atualizar_medicao_veiculo(veiculo, body.medicao)
    _liberar_veiculo(veiculo)
    await registrar_auditoria(
        db, organization_id=uso.organization_id, acao="uso.chegada", entidade="uso_veiculo",
        entidade_id=uso.id, motorista_id=motorista.id, dados_novos={"medicao": str(body.medicao)},
    )
    await db.commit()
    return (await _serializar(db, [uso]))[0]


# ── Painel ───────────────────────────────────────────────────────────────


def _filtrar(stmt, user: User, *, veiculo_id=None, motorista_id=None, unidade_id=None, status=None,
             data_inicio=None, data_fim=None, search=None):
    stmt = stmt.where(UsoVeiculo.organization_id == user.organization_id, filtro_escopo(user, UsoVeiculo.unidade_id))
    if veiculo_id:
        stmt = stmt.where(UsoVeiculo.veiculo_id == veiculo_id)
    if motorista_id:
        stmt = stmt.where(UsoVeiculo.motorista_id == motorista_id)
    if unidade_id:
        stmt = stmt.where(UsoVeiculo.unidade_id == unidade_id)
    if status:
        stmt = stmt.where(UsoVeiculo.status == status.upper())
    if data_inicio:
        stmt = stmt.where(UsoVeiculo.saida_em >= _inicio_dia(data_inicio))
    if data_fim:
        stmt = stmt.where(UsoVeiculo.saida_em < _inicio_dia(data_fim, 1))
    if search:
        like = f"%{search}%"
        stmt = stmt.join(Veiculo, Veiculo.id == UsoVeiculo.veiculo_id).join(Motorista, Motorista.id == UsoVeiculo.motorista_id).where(
            Veiculo.placa.ilike(like) | Motorista.nome.ilike(like) | UsoVeiculo.destino.ilike(like) | UsoVeiculo.finalidade.ilike(like)
        )
    return stmt


async def _get_uso(db: AsyncSession, user: User, uso_id: uuid.UUID) -> UsoVeiculo:
    uso = (
        await db.execute(
            select(UsoVeiculo).where(
                UsoVeiculo.id == uso_id,
                UsoVeiculo.organization_id == user.organization_id,
                filtro_escopo(user, UsoVeiculo.unidade_id),
            )
        )
    ).scalar_one_or_none()
    if uso is None:
        raise HTTPException(status_code=404, detail="Uso não encontrado.")
    return uso


@router.get("")
async def listar(
    veiculo_id: uuid.UUID | None = None,
    motorista_id: uuid.UUID | None = None,
    unidade_id: uuid.UUID | None = None,
    status: str | None = None,
    data_inicio: str | None = None,
    data_fim: str | None = None,
    search: str | None = None,
    skip: int = 0,
    limit: int = 50,
    response: Response = None,  # type: ignore[assignment]
    user: User = Depends(require_permission(Perm.VEHICLE_VIEW, escopo=True)),
    db: AsyncSession = Depends(get_db),
):
    filtros = dict(veiculo_id=veiculo_id, motorista_id=motorista_id, unidade_id=unidade_id, status=status,
                   data_inicio=data_inicio, data_fim=data_fim, search=search)
    total = (await db.execute(_filtrar(select(sa_func.count(UsoVeiculo.id)), user, **filtros))).scalar_one()
    usos = (await db.execute(
        _filtrar(select(UsoVeiculo), user, **filtros).order_by(UsoVeiculo.saida_em.desc()).offset(skip).limit(min(limit, 200))
    )).scalars().all()
    if response is not None:
        response.headers["X-Total-Count"] = str(total)
    return await _serializar(db, list(usos))


@router.get("/resumo")
async def resumo(
    veiculo_id: uuid.UUID | None = None,
    motorista_id: uuid.UUID | None = None,
    unidade_id: uuid.UUID | None = None,
    data_inicio: str | None = None,
    data_fim: str | None = None,
    search: str | None = None,
    user: User = Depends(require_permission(Perm.VEHICLE_VIEW, escopo=True)),
    db: AsyncSession = Depends(get_db),
):
    """Totais do período para os cartões do topo (ignora o filtro de situação)."""
    filtros = dict(veiculo_id=veiculo_id, motorista_id=motorista_id, unidade_id=unidade_id,
                   data_inicio=data_inicio, data_fim=data_fim, search=search)
    percorrido = UsoVeiculo.medicao_chegada - UsoVeiculo.medicao_saida
    linha = (await db.execute(_filtrar(select(
        sa_func.count(UsoVeiculo.id),
        sa_func.count(UsoVeiculo.chegada_em),
        sa_func.coalesce(sa_func.sum(percorrido).filter(UsoVeiculo.usa_horimetro.is_(False)), 0),
        sa_func.coalesce(sa_func.sum(percorrido).filter(UsoVeiculo.usa_horimetro.is_(True)), 0),
        sa_func.count(UsoVeiculo.id).filter(UsoVeiculo.alertas.isnot(None)),
        sa_func.count(sa_func.distinct(UsoVeiculo.veiculo_id)),
    ), user, **filtros))).one()
    return {
        "total": linha[0], "concluidos": linha[1], "km": float(linha[2]), "horas": float(linha[3]),
        "com_alerta": linha[4], "veiculos": linha[5],
    }


@router.get("/em-uso")
async def em_uso(
    user: User = Depends(require_permission(Perm.VEHICLE_VIEW, escopo=True)),
    db: AsyncSession = Depends(get_db),
):
    usos = (await db.execute(
        _filtrar(select(UsoVeiculo), user, status="EM_USO").order_by(UsoVeiculo.saida_em)
    )).scalars().all()
    return await _serializar(db, list(usos))


@router.get("/exportar")
async def exportar(
    formato: str = "xlsx",
    veiculo_id: uuid.UUID | None = None,
    motorista_id: uuid.UUID | None = None,
    unidade_id: uuid.UUID | None = None,
    status: str | None = None,
    data_inicio: str | None = None,
    data_fim: str | None = None,
    search: str | None = None,
    user: User = Depends(require_permission(Perm.VEHICLE_VIEW, escopo=True)),
    db: AsyncSession = Depends(get_db),
):
    from app.api.v1.relatorios import _formato_response
    from app.services.exporters import RelatorioMeta, build_pdf, get_organizacao_meta, get_organizacao_nome

    if formato not in ("xlsx", "pdf"):
        raise HTTPException(status_code=422, detail="Formato inválido.")
    usos = (await db.execute(
        _filtrar(select(UsoVeiculo), user, veiculo_id=veiculo_id, motorista_id=motorista_id, unidade_id=unidade_id,
                 status=status, data_inicio=data_inicio, data_fim=data_fim, search=search)
        .order_by(UsoVeiculo.saida_em).limit(5000)
    )).scalars().all()
    itens = await _serializar(db, list(usos))

    def _dh(iso):
        return f"{to_display(datetime.fromisoformat(iso)):%d/%m/%Y %H:%M}" if iso else "-"

    rows = [[
        _dh(i["saida_em"]), _dh(i["chegada_em"]), i["veiculo_placa"], i["unidade_nome"] or "-", i["motorista_nome"],
        i["finalidade"], i["destino"],
        i["medicao_saida"], i["medicao_chegada"], i["percorrido"], "h" if i["usa_horimetro"] else "km",
        STATUS_ROTULO.get(i["status"], i["status"]),
    ] for i in itens]
    periodo = " a ".join(
        date.fromisoformat(d[:10]).strftime("%d/%m/%Y") for d in (data_inicio, data_fim) if d
    ) or "Todo o período"
    if formato == "pdf":
        org_nome, org_cnpj, org_logo = await get_organizacao_meta(db, user.organization_id)
        meta = RelatorioMeta(titulo="Diário de Bordo", organizacao=org_nome, cnpj=org_cnpj, logo=org_logo, periodo=periodo)

        def _dh_curta(iso):
            return f"{to_display(datetime.fromisoformat(iso)):%d/%m/%y %H:%M}" if iso else "-"

        def _m(v, h):
            return "-" if v is None else f"{_fmt(Decimal(str(v)), h)} {'h' if h else 'km'}"

        linhas = [[
            _dh_curta(i["saida_em"]), _dh_curta(i["chegada_em"]),
            f"{i['veiculo_placa']} · {i['veiculo_modelo']}" if i["veiculo_modelo"] else i["veiculo_placa"],
            i["motorista_nome"], i["unidade_nome"] or "-", i["destino"], i["finalidade"],
            _m(i["medicao_saida"], i["usa_horimetro"]), _m(i["medicao_chegada"], i["usa_horimetro"]),
            _m(i["percorrido"], i["usa_horimetro"]), STATUS_ROTULO.get(i["status"], i["status"]),
        ] for i in itens]
        km = sum(i["percorrido"] or 0 for i in itens if not i["usa_horimetro"])
        horas = sum(i["percorrido"] or 0 for i in itens if i["usa_horimetro"])
        resumo = [
            ("Usos", str(len(itens))),
            ("Veículos", str(len({i["veiculo_id"] for i in itens}))),
            ("Km percorridos", f"{_fmt(Decimal(str(km)), False)} km"),
        ]
        if horas:
            resumo.append(("Horas de máquina", f"{_fmt(Decimal(str(horas)), True)} h"))
        data = build_pdf(
            meta,
            ["Saída", "Chegada", "Veículo", "Motorista", "Secretaria", "Destino", "Finalidade",
             "Km/h saída", "Km/h chegada", "Percorrido", "Situação"],
            linhas,
            usuario=user.name,
            paisagem=True,
            larguras=[7, 7, 14, 11, 10, 9, 11, 8.5, 8.5, 7.5, 7.5],
            resumo=resumo,
        )
        return Response(content=data, media_type="application/pdf",
                        headers={"Content-Disposition": 'attachment; filename="diario-de-bordo.pdf"'})

    meta = RelatorioMeta(
        titulo="Diário de Bordo",
        organizacao=await get_organizacao_nome(db, user.organization_id),
        periodo=periodo,
    )
    return _formato_response(
        formato, "diario-de-bordo.xlsx", meta,
        ["Saída", "Chegada", "Placa", "Secretaria", "Motorista", "Finalidade", "Destino",
         "Saída (km/h)", "Chegada (km/h)", "Percorrido", "Un.", "Situação"],
        rows, usuario=user.name,
    )


@router.get("/{uso_id}")
async def detalhe(
    uso_id: uuid.UUID,
    user: User = Depends(require_permission(Perm.VEHICLE_VIEW, escopo=True)),
    db: AsyncSession = Depends(get_db),
):
    return (await _serializar(db, [await _get_uso(db, user, uso_id)]))[0]


@router.post("/{uso_id}/encerrar")
async def encerrar(
    uso_id: uuid.UUID,
    body: Encerrar,
    user: User = Depends(require_permission(Perm.VEHICLE_MANAGE, escopo=True)),
    db: AsyncSession = Depends(get_db),
):
    """Gestão encerra um uso esquecido em aberto, informando a medição e o motivo."""
    uso = await _get_uso(db, user, uso_id)
    if uso.status != "EM_USO":
        raise HTTPException(status_code=409, detail="Este uso já foi encerrado.")
    chegada = _instante(body.chegada_em) if body.chegada_em else datetime.now(timezone.utc)
    if chegada > datetime.now(timezone.utc) + timedelta(minutes=5):
        raise HTTPException(status_code=422, detail="A chegada não pode ser no futuro.")
    _validar_chegada(uso, body.medicao, chegada)
    uso.chegada_em = chegada
    uso.medicao_chegada = body.medicao
    uso.foto_chegada_url = body.foto_url
    uso.status = "ENCERRADO_GESTOR"
    uso.encerrado_por_usuario_id = user.id
    uso.motivo_encerramento = body.motivo.strip()
    veiculo = await db.get(Veiculo, uso.veiculo_id)
    _atualizar_medicao_veiculo(veiculo, body.medicao)
    _liberar_veiculo(veiculo)
    await registrar_auditoria(
        db, organization_id=uso.organization_id, acao="uso.encerrar", entidade="uso_veiculo",
        entidade_id=uso.id, usuario_id=user.id,
        dados_novos={"medicao": str(body.medicao), "chegada_em": chegada.isoformat(), "motivo": uso.motivo_encerramento},
    )
    await db.commit()
    return (await _serializar(db, [uso]))[0]


@router.post("", status_code=201)
async def lancar(
    body: LancamentoPainel,
    user: User = Depends(require_permission(Perm.VEHICLE_MANAGE, escopo=True)),
    db: AsyncSession = Depends(get_db),
):
    """Lança pelo painel um uso já concluído (anotado em papel, por exemplo)."""
    veiculo = (
        await db.execute(
            select(Veiculo).where(
                Veiculo.id == body.veiculo_id,
                Veiculo.organization_id == user.organization_id,
                Veiculo.deleted_at.is_(None),
                filtro_escopo(user, Veiculo.unidade_id),
            )
        )
    ).scalar_one_or_none()
    if veiculo is None:
        raise HTTPException(status_code=404, detail="Veículo não encontrado.")
    motorista = await db.get(Motorista, body.motorista_id)
    if motorista is None or motorista.organization_id != user.organization_id or motorista.deleted_at is not None:
        raise HTTPException(status_code=404, detail="Motorista não encontrado.")
    if _instante(body.chegada_em) > datetime.now(timezone.utc) + timedelta(minutes=5):
        raise HTTPException(status_code=422, detail="A chegada não pode ser no futuro.")

    alertas = _aviso_divergencia(veiculo, body.medicao_saida)
    uso = UsoVeiculo(
        organization_id=user.organization_id,
        veiculo_id=veiculo.id,
        motorista_id=motorista.id,
        unidade_id=veiculo.unidade_id,
        finalidade=body.finalidade.strip(),
        destino=body.destino.strip(),
        usa_horimetro=bool(veiculo.usa_horimetro),
        saida_em=_instante(body.saida_em),
        medicao_saida=body.medicao_saida,
        foto_saida_url=body.foto_saida_url,
        status="CONCLUIDO",
        origem="PAINEL",
        registrado_por_usuario_id=user.id,
        alertas=json.dumps(alertas, ensure_ascii=False) if alertas else None,
    )
    _validar_chegada(uso, body.medicao_chegada, _instante(body.chegada_em))
    uso.chegada_em = _instante(body.chegada_em)
    uso.medicao_chegada = body.medicao_chegada
    uso.foto_chegada_url = body.foto_chegada_url
    db.add(uso)
    _atualizar_medicao_veiculo(veiculo, body.medicao_chegada)
    await db.flush()
    await registrar_auditoria(
        db, organization_id=user.organization_id, acao="uso.lancar", entidade="uso_veiculo",
        entidade_id=uso.id, usuario_id=user.id,
        dados_novos={"veiculo": str(veiculo.id), "motorista": str(motorista.id),
                     "saida": str(body.medicao_saida), "chegada": str(body.medicao_chegada)},
    )
    await db.commit()
    dados = (await _serializar(db, [uso]))[0]
    dados["avisos"] = [a["mensagem"] for a in alertas]
    return dados
