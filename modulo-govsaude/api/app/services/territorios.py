"""Regras de domínio para a Fase 3."""
from __future__ import annotations

import uuid
from datetime import date, datetime, timezone

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.errors import Conflict, NotFound, Unprocessable
from app.models.cidadao import Cidadao
from app.models.nucleo import Usuario
from app.models.territorio import AnimalDomicilio, Domicilio, Familia, FamiliaDomicilio, FamiliaMembro, Territorio, VisitaDomiciliar
from app.schemas.territorio import AnimalCreate, DomicilioCreate, FamiliaCreate, FamiliaMembroCreate, TerritorioCreate, VisitaCreate
from app.services import configuracoes
from app.services.auditoria import registrar


async def _um(db: AsyncSession, modelo, tenant_id: uuid.UUID, item_id: uuid.UUID):
    item = await db.scalar(select(modelo).where(modelo.id == item_id, modelo.tenant_id == tenant_id))
    if item is None:
        raise NotFound("Registro territorial não encontrado.")
    return item


def _geojson(geometria: dict | None) -> None:
    if geometria is None:
        return
    if geometria.get("type") not in {"Polygon", "MultiPolygon"} or not isinstance(geometria.get("coordinates"), list):
        raise Unprocessable("A geometria deve ser GeoJSON Polygon ou MultiPolygon.", code="geojson_invalido")


async def criar_territorio(db: AsyncSession, tenant_id: uuid.UUID, dados: TerritorioCreate, ator: Usuario, cliente: dict) -> Territorio:
    _geojson(dados.geometria)
    if dados.tipo == "MICROAREA" and not dados.territorio_pai_id:
        raise Unprocessable("Microárea deve informar a área à qual pertence.", code="hierarquia_territorio_invalida")
    if dados.territorio_pai_id:
        pai = await _um(db, Territorio, tenant_id, dados.territorio_pai_id)
        if dados.tipo != "MICROAREA" or pai.tipo != "AREA":
            raise Unprocessable("Microárea deve pertencer a uma área.", code="hierarquia_territorio_invalida")
    item = Territorio(tenant_id=tenant_id, **dados.model_dump(), criado_por_id=ator.id, atualizado_por_id=ator.id)
    db.add(item); await db.flush()
    await registrar(db, acao="CRIAR", usuario=ator, tenant_id=tenant_id, recurso="territorio", recurso_id=item.id, dados_depois={"nome": item.nome, "tipo": item.tipo}, cliente=cliente)
    await db.commit(); return item


async def listar_territorios(db: AsyncSession, tenant_id: uuid.UUID, tipo: str | None = None):
    filtros = [Territorio.tenant_id == tenant_id, Territorio.baixa_em.is_(None)]
    if tipo: filtros.append(Territorio.tipo == tipo)
    return list((await db.execute(select(Territorio).where(*filtros).order_by(Territorio.tipo, Territorio.nome))).scalars())


async def criar_domicilio(db: AsyncSession, tenant_id: uuid.UUID, dados: DomicilioCreate, ator: Usuario, cliente: dict) -> Domicilio:
    if dados.territorio_id: await _um(db, Territorio, tenant_id, dados.territorio_id)
    item = Domicilio(tenant_id=tenant_id, **dados.model_dump(), criado_por_id=ator.id, atualizado_por_id=ator.id)
    db.add(item); await db.flush()
    await registrar(db, acao="CRIAR", usuario=ator, tenant_id=tenant_id, recurso="domicilio", recurso_id=item.id, dados_depois={"logradouro": item.logradouro}, cliente=cliente)
    await db.commit(); return item


async def listar_domicilios(db: AsyncSession, tenant_id: uuid.UUID, termo: str | None = None):
    filtros = [Domicilio.tenant_id == tenant_id, Domicilio.baixa_em.is_(None)]
    if termo: filtros.append(func.lower(Domicilio.logradouro).like(f"%{termo.strip().lower()}%"))
    return list((await db.execute(select(Domicilio).where(*filtros).order_by(Domicilio.logradouro, Domicilio.numero))).scalars())


async def criar_familia(db: AsyncSession, tenant_id: uuid.UUID, dados: FamiliaCreate, ator: Usuario, cliente: dict) -> Familia:
    if dados.responsavel_id: await _um(db, Cidadao, tenant_id, dados.responsavel_id)
    if dados.domicilio_id: await _um(db, Domicilio, tenant_id, dados.domicilio_id)
    valores = dados.model_dump(exclude={"domicilio_id"})
    item = Familia(tenant_id=tenant_id, **valores, criado_por_id=ator.id, atualizado_por_id=ator.id)
    db.add(item); await db.flush()
    if dados.domicilio_id:
        db.add(FamiliaDomicilio(tenant_id=tenant_id, familia_id=item.id, domicilio_id=dados.domicilio_id, criado_por_id=ator.id, atualizado_por_id=ator.id))
    await registrar(db, acao="CRIAR", usuario=ator, tenant_id=tenant_id, recurso="familia", recurso_id=item.id, dados_depois={"codigo": item.codigo}, cliente=cliente)
    await db.commit(); return item


async def listar_familias(db: AsyncSession, tenant_id: uuid.UUID):
    return list((await db.execute(select(Familia).where(Familia.tenant_id == tenant_id, Familia.baixa_em.is_(None)).order_by(Familia.created_at))).scalars())


async def adicionar_membro(db: AsyncSession, tenant_id: uuid.UUID, familia_id: uuid.UUID, dados: FamiliaMembroCreate, ator: Usuario, cliente: dict) -> FamiliaMembro:
    await _um(db, Familia, tenant_id, familia_id); await _um(db, Cidadao, tenant_id, dados.cidadao_id)
    existe = await db.scalar(select(FamiliaMembro).where(FamiliaMembro.tenant_id == tenant_id, FamiliaMembro.cidadao_id == dados.cidadao_id, FamiliaMembro.vigencia_fim.is_(None)))
    if existe: raise Conflict("O cidadão já possui vínculo familiar ativo.", code="vinculo_familiar_ativo")
    item = FamiliaMembro(tenant_id=tenant_id, familia_id=familia_id, **dados.model_dump(), criado_por_id=ator.id, atualizado_por_id=ator.id)
    db.add(item); await db.flush()
    await registrar(db, acao="CRIAR", usuario=ator, tenant_id=tenant_id, recurso="familia_membro", recurso_id=item.id, dados_depois={"familia_id": str(familia_id)}, cliente=cliente)
    await db.commit(); return item


async def encerrar_membro(db: AsyncSession, tenant_id: uuid.UUID, familia_id: uuid.UUID, membro_id: uuid.UUID, fim: date, ator: Usuario, cliente: dict) -> FamiliaMembro:
    item = await db.scalar(select(FamiliaMembro).where(FamiliaMembro.id == membro_id, FamiliaMembro.familia_id == familia_id, FamiliaMembro.tenant_id == tenant_id, FamiliaMembro.vigencia_fim.is_(None)))
    if item is None: raise NotFound("Vínculo familiar ativo não encontrado.")
    if fim < item.vigencia_inicio: raise Unprocessable("A data final antecede o início do vínculo.")
    item.vigencia_fim = fim; item.atualizado_por_id = ator.id
    await registrar(db, acao="ATUALIZAR", usuario=ator, tenant_id=tenant_id, recurso="familia_membro", recurso_id=item.id, dados_depois={"vigencia_fim": fim.isoformat()}, cliente=cliente)
    await db.commit(); return item


async def criar_visita(db: AsyncSession, tenant_id: uuid.UUID, dados: VisitaCreate, ator: Usuario, cliente: dict) -> VisitaDomiciliar:
    domicilio = await _um(db, Domicilio, tenant_id, dados.domicilio_id)
    if dados.cidadao_id: await _um(db, Cidadao, tenant_id, dados.cidadao_id)
    if dados.familia_id: await _um(db, Familia, tenant_id, dados.familia_id)
    politica = await configuracoes.valor(db, tenant_id, "territorio.gps", {"modo": "RECOMENDADO", "precisao_minima_metros": 100})
    politica = politica if isinstance(politica, dict) else {}
    modo = str(politica.get("modo", "RECOMENDADO")).upper()
    limite = float(politica.get("precisao_minima_metros", 100))
    sem_gps = dados.latitude is None
    ruim = dados.precisao_metros is not None and dados.precisao_metros > limite
    if modo == "OBRIGATORIO" and (sem_gps or ruim) and not dados.justificativa_gps:
        raise Unprocessable("GPS obrigatório exige coordenadas precisas ou justificativa.", code="gps_obrigatorio")
    competencia = date(dados.realizada_em.year, dados.realizada_em.month, 1)
    duplicada = None
    if dados.cidadao_id:
        duplicada = await db.scalar(select(VisitaDomiciliar).where(VisitaDomiciliar.tenant_id == tenant_id, VisitaDomiciliar.cidadao_id == dados.cidadao_id, VisitaDomiciliar.turno == dados.turno, VisitaDomiciliar.competencia == competencia))
    regra = await configuracoes.valor(db, tenant_id, "territorio.visita_unica_turno", "ALERTAR")
    if duplicada and str(regra).upper() == "BLOQUEAR":
        raise Conflict("Já existe visita ao cidadão neste turno e competência.", code="visita_duplicada")
    valores = dados.model_dump()
    valores["competencia"] = competencia
    valores["profissional_id"] = getattr(ator, "profissional_id", None)
    if dados.assinatura_nome: valores["assinatura_em"] = datetime.now(timezone.utc)
    item = VisitaDomiciliar(tenant_id=tenant_id, **valores, criado_por_id=ator.id, atualizado_por_id=ator.id)
    db.add(item); await db.flush()
    await registrar(db, acao="CRIAR", usuario=ator, tenant_id=tenant_id, recurso="visita_domiciliar", recurso_id=item.id, dados_depois={"domicilio_id": str(domicilio.id), "competencia": competencia.isoformat()}, cliente=cliente)
    await db.commit(); return item


async def listar_visitas(db: AsyncSession, tenant_id: uuid.UUID, competencia: date | None = None):
    filtros = [VisitaDomiciliar.tenant_id == tenant_id]
    if competencia: filtros.append(VisitaDomiciliar.competencia == competencia.replace(day=1))
    return list((await db.execute(select(VisitaDomiciliar).where(*filtros).order_by(VisitaDomiciliar.realizada_em.desc()))).scalars())


async def cobertura(db: AsyncSession, tenant_id: uuid.UUID, competencia: date) -> dict:
    competencia = competencia.replace(day=1)
    total = await db.scalar(select(func.count()).select_from(Domicilio).where(Domicilio.tenant_id == tenant_id, Domicilio.baixa_em.is_(None))) or 0
    visitados = await db.scalar(select(func.count(func.distinct(VisitaDomiciliar.domicilio_id))).where(VisitaDomiciliar.tenant_id == tenant_id, VisitaDomiciliar.competencia == competencia)) or 0
    visitas = await db.scalar(select(func.count()).select_from(VisitaDomiciliar).where(VisitaDomiciliar.tenant_id == tenant_id, VisitaDomiciliar.competencia == competencia)) or 0
    return {"competencia": competencia, "domicilios_ativos": total, "domicilios_visitados": visitados, "cobertura_percentual": round((visitados / total * 100) if total else 0, 2), "visitas_realizadas": visitas}


async def geojson(db: AsyncSession, tenant_id: uuid.UUID) -> dict:
    itens = await listar_territorios(db, tenant_id)
    return {"type": "FeatureCollection", "features": [{"type": "Feature", "id": str(item.id), "geometry": item.geometria, "properties": {"nome": item.nome, "tipo": item.tipo, "codigo": item.codigo}} for item in itens if item.geometria]}


async def meta(db: AsyncSession, tenant_id: uuid.UUID, competencia: date) -> dict:
    competencia = competencia.replace(day=1)
    configurada = await configuracoes.valor(db, tenant_id, "territorio.meta_visitas_mensal", 0)
    try:
        meta_visitas = max(0, int(configurada))
    except (TypeError, ValueError):
        meta_visitas = 0
    realizadas = await db.scalar(select(func.count()).select_from(VisitaDomiciliar).where(VisitaDomiciliar.tenant_id == tenant_id, VisitaDomiciliar.competencia == competencia)) or 0
    return {"competencia": competencia, "profissional_id": None, "meta_visitas": meta_visitas, "visitas_realizadas": realizadas, "atingimento_percentual": round((realizadas / meta_visitas * 100) if meta_visitas else 0, 2)}


async def nao_visitados(db: AsyncSession, tenant_id: uuid.UUID, competencia: date) -> list[Domicilio]:
    competencia = competencia.replace(day=1)
    visitados = select(VisitaDomiciliar.domicilio_id).where(VisitaDomiciliar.tenant_id == tenant_id, VisitaDomiciliar.competencia == competencia)
    return list((await db.execute(select(Domicilio).where(Domicilio.tenant_id == tenant_id, Domicilio.baixa_em.is_(None), Domicilio.id.not_in(visitados)).order_by(Domicilio.logradouro, Domicilio.numero))).scalars())


async def extrato_familia(db: AsyncSession, tenant_id: uuid.UUID, familia_id: uuid.UUID) -> dict:
    familia = await _um(db, Familia, tenant_id, familia_id)
    membros = list((await db.execute(select(FamiliaMembro).where(FamiliaMembro.tenant_id == tenant_id, FamiliaMembro.familia_id == familia_id).order_by(FamiliaMembro.vigencia_inicio.desc()))).scalars())
    domicilios = list((await db.execute(select(FamiliaDomicilio).where(FamiliaDomicilio.tenant_id == tenant_id, FamiliaDomicilio.familia_id == familia_id).order_by(FamiliaDomicilio.vigencia_inicio.desc()))).scalars())
    return {"familia_id": str(familia.id), "codigo": familia.codigo, "risco": familia.risco, "membros": [{"cidadao_id": str(x.cidadao_id), "parentesco": x.parentesco, "responsavel": x.responsavel, "vigencia_inicio": x.vigencia_inicio, "vigencia_fim": x.vigencia_fim} for x in membros], "domicilios": [{"domicilio_id": str(x.domicilio_id), "vigencia_inicio": x.vigencia_inicio, "vigencia_fim": x.vigencia_fim} for x in domicilios]}


async def criar_animal(db: AsyncSession, tenant_id: uuid.UUID, domicilio_id: uuid.UUID, dados: AnimalCreate, ator: Usuario, cliente: dict) -> AnimalDomicilio:
    await _um(db, Domicilio, tenant_id, domicilio_id)
    item = AnimalDomicilio(tenant_id=tenant_id, domicilio_id=domicilio_id, **dados.model_dump(), criado_por_id=ator.id, atualizado_por_id=ator.id)
    db.add(item); await db.flush()
    await registrar(db, acao="CRIAR", usuario=ator, tenant_id=tenant_id, recurso="animal_domicilio", recurso_id=item.id, dados_depois={"especie": item.especie, "quantidade": item.quantidade}, cliente=cliente)
    await db.commit(); return item
