import uuid
from datetime import date, datetime, timedelta, timezone
from statistics import mean, stdev
from typing import Optional

from sqlalchemy import func, select, extract
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.attendance import Attendance
from app.models.beneficio import ConcessaoBeneficio
from app.models.family import Family
from app.models.person import Person
from app.models.person_family_membership import PersonFamilyMembership


MESES_NOME: dict[int, str] = {
    1: "Jan", 2: "Fev", 3: "Mar", 4: "Abr", 5: "Mai", 6: "Jun",
    7: "Jul", 8: "Ago", 9: "Set", 10: "Out", 11: "Nov", 12: "Dez",
}

FAIXA_ETARIA_ROTULO: dict[str, tuple[int, int]] = {
    "0-4": (0, 4),
    "5-9": (5, 9),
    "10-14": (10, 14),
    "15-19": (15, 19),
    "20-29": (20, 29),
    "30-39": (30, 39),
    "40-49": (40, 49),
    "50-59": (50, 59),
    "60-69": (60, 69),
    "70+": (70, 130),
}

SEXO_ROTULO: dict[str, str] = {
    "M": "Masculino",
    "F": "Feminino",
    "OUTRO": "Outro",
}

RACA_COR_ROTULO: dict[str, str] = {
    "BRANCA": "Branca",
    "PRETA": "Preta",
    "PARDA": "Parda",
    "AMARELA": "Amarela",
    "INDIGENA": "Indígena",
    "NAO_DECLARADO": "Não declarado",
}

ESCOLARIDADE_ROTULO: dict[str, str] = {
    "SEM_INSTRUCAO": "Sem instrução",
    "FUNDAMENTAL_INCOMPLETO": "Fund. incompleto",
    "FUNDAMENTAL_COMPLETO": "Fund. completo",
    "MEDIO_INCOMPLETO": "Médio incompleto",
    "MEDIO_COMPLETO": "Médio completo",
    "SUPERIOR_INCOMPLETO": "Superior incompleto",
    "SUPERIOR_COMPLETO": "Superior completo",
    "POS_GRADUACAO": "Pós-graduação",
    "NAO_INFORMADO": "Não informado",
}


def _dt(d: date) -> datetime:
    return datetime(d.year, d.month, d.day, tzinfo=timezone.utc)


async def calcular_indicadores_territorio(
    db: AsyncSession, tenant_id: uuid.UUID, mes: int, ano: int,
) -> list[dict]:
    inicio = date(ano, mes, 1)
    if mes == 12:
        fim = date(ano + 1, 1, 1)
    else:
        fim = date(ano, mes + 1, 1)

    familias_por_territorio = (
        (
            await db.execute(
                select(
                    Family.territorio,
                    func.count(Family.id).label("total_familias"),
                )
                .where(
                    Family.tenant_id == tenant_id,
                    Family.deleted_at.is_(None),
                )
                .group_by(Family.territorio)
            )
        )
        .all()
    )

    atendimentos_por_territorio = (
        (
            await db.execute(
                select(
                    Family.territorio,
                    func.count(Attendance.id).label("total_atendimentos"),
                )
                .join(Family, Attendance.case_file_id.isnot(None))
                .where(
                    Attendance.tenant_id == tenant_id,
                    Attendance.data_atendimento >= _dt(inicio),
                    Attendance.data_atendimento < _dt(fim),
                    Attendance.deleted_at.is_(None),
                )
                .group_by(Family.territorio)
            )
        )
        .all()
    )

    beneficios_por_territorio = (
        (
            await db.execute(
                select(
                    Family.territorio,
                    func.count(ConcessaoBeneficio.id).label("total_beneficios"),
                )
                .join(Family, ConcessaoBeneficio.family_id == Family.id)
                .where(
                    ConcessaoBeneficio.tenant_id == tenant_id,
                    ConcessaoBeneficio.data_solicitacao >= _dt(inicio),
                    ConcessaoBeneficio.data_solicitacao < _dt(fim),
                    ConcessaoBeneficio.status.in_(["ENTREGUE", "APROVADO"]),
                )
                .group_by(Family.territorio)
            )
        )
        .all()
    )

    atend_map = {r.territorio or "Sem território": r.total_atendimentos for r in atendimentos_por_territorio}
    benef_map = {r.territorio or "Sem território": r.total_beneficios for r in beneficios_por_territorio}

    resultados: list[dict] = []
    for r in familias_por_territorio:
        terr = r.territorio or "Sem território"
        total = r.total_familias
        atend = atend_map.get(terr, 0)
        benef = benef_map.get(terr, 0)
        tx_atend = round(atend / total, 4) if total > 0 else 0
        tx_benef = round(benef / total, 4) if total > 0 else 0
        resultados.append({
            "territorio": terr,
            "total_familias": total,
            "atendimentos_mes": atend,
            "beneficios_mes": benef,
            "taxa_atendimento": tx_atend,
            "taxa_beneficio": tx_benef,
        })
    resultados.sort(key=lambda x: x["total_familias"], reverse=True)
    return resultados


async def calcular_tendencias(
    db: AsyncSession, tenant_id: uuid.UUID, meses: int = 12,
) -> dict:
    hoje = date.today()
    serie: list[dict] = []
    valores_attend: list[float] = []

    for i in range(meses):
        ano_ref = hoje.year if hoje.month - i > 0 else hoje.year - 1
        mes_ref = hoje.month - i if hoje.month - i > 0 else 12 + (hoje.month - i)
        inicio = date(ano_ref, mes_ref, 1)
        if mes_ref == 12:
            fim = date(ano_ref + 1, 1, 1)
        else:
            fim = date(ano_ref, mes_ref + 1, 1)

        atend = (
            await db.execute(
                select(func.count(Attendance.id)).where(
                    Attendance.tenant_id == tenant_id,
                    Attendance.data_atendimento >= _dt(inicio),
                    Attendance.data_atendimento < _dt(fim),
                    Attendance.deleted_at.is_(None),
                )
            )
        ).scalar() or 0

        benef = (
            await db.execute(
                select(func.count(ConcessaoBeneficio.id)).where(
                    ConcessaoBeneficio.tenant_id == tenant_id,
                    ConcessaoBeneficio.data_solicitacao >= _dt(inicio),
                    ConcessaoBeneficio.data_solicitacao < _dt(fim),
                    ConcessaoBeneficio.status.in_(["ENTREGUE", "APROVADO"]),
                )
            )
        ).scalar() or 0

        serie.append({
            "ano": ano_ref,
            "mes": mes_ref,
            "rotulo": f"{MESES_NOME[mes_ref]}/{str(ano_ref)[-2:]}",
            "atendimentos": int(atend),
            "beneficios": int(benef),
        })
        valores_attend.append(float(atend))

    serie.reverse()

    projecao: list[dict] = []
    n = len(valores_attend)
    if n >= 3 and sum(valores_attend) > 0:
        xs = list(range(n))
        media_x = mean(xs)
        media_y = mean(valores_attend)
        num = sum((xs[i] - media_x) * (valores_attend[i] - media_y) for i in range(n))
        den = sum((x - media_x) ** 2 for x in xs)
        if den != 0:
            a = num / den
            b = media_y - a * media_x
            for proj in range(1, 4):
                ultimo = serie[-1]
                novo_mes = ultimo["mes"] + proj
                novo_ano = ultimo["ano"]
                while novo_mes > 12:
                    novo_mes -= 12
                    novo_ano += 1
                pred = a * (n + proj - 1) + b
                projecao.append({
                    "ano": novo_ano,
                    "mes": novo_mes,
                    "rotulo": f"{MESES_NOME[novo_mes]}/{str(novo_ano)[-2:]}",
                    "atendimentos_projetados": max(0, round(pred)),
                    "projetado": True,
                })

    tendencia_geral = "estavel"
    if n >= 3 and len(serie) >= 3:
        recente = mean([s["atendimentos"] for s in serie[-3:]])
        anterior = mean([s["atendimentos"] for s in serie[:3]])
        if anterior > 0:
            variacao = (recente - anterior) / anterior
            if variacao > 0.15:
                tendencia_geral = "crescente"
            elif variacao < -0.15:
                tendencia_geral = "decrescente"

    return {
        "serie": serie,
        "projecao": projecao,
        "tendencia_geral": tendencia_geral,
    }


async def calcular_mapa_calor(
    db: AsyncSession, tenant_id: uuid.UUID, tipo: str = "vulnerabilidade",
) -> list[dict]:
    if tipo == "vulnerabilidade":
        rows = (
            await db.execute(
                select(
                    Family.territorio,
                    Family.bairro,
                    func.avg(Family.latitude).label("lat_media"),
                    func.avg(Family.longitude).label("lng_media"),
                    func.count(Family.id).label("total_familias"),
                    func.count(Family.id).filter(Family.inseguranca_alimentar.is_(True)).label("inseguranca"),
                    func.count(Family.id).filter(Family.beneficiaria_pbf.is_(True)).label("pbf"),
                )
                .where(
                    Family.tenant_id == tenant_id,
                    Family.deleted_at.is_(None),
                    Family.latitude.isnot(None),
                )
                .group_by(Family.territorio, Family.bairro)
            )
        ).all()

        resultados: list[dict] = []
        for r in rows:
            total = r.total_familias
            intensidade = 0.0
            if total > 0:
                score = (r.inseguranca + r.pbf * 0.5) / total
                intensidade = min(1.0, max(0.0, round(score, 3)))
            resultados.append({
                "territorio": r.territorio or "Não definido",
                "bairro": r.bairro or "Não informado",
                "centroide_lat": float(r.lat_media) if r.lat_media else None,
                "centroide_lng": float(r.lng_media) if r.lng_media else None,
                "total_familias": total,
                "intensidade": intensidade,
                "inseguranca_alimentar": int(r.inseguranca),
                "beneficiarios_pbf": int(r.pbf),
            })
        return resultados

    rows = (
        await db.execute(
            select(
                Family.territorio,
                Family.bairro,
                func.avg(Family.latitude).label("lat_media"),
                func.avg(Family.longitude).label("lng_media"),
                func.count(Family.id).label("total_familias"),
            )
            .where(
                Family.tenant_id == tenant_id,
                Family.deleted_at.is_(None),
                Family.latitude.isnot(None),
            )
            .group_by(Family.territorio, Family.bairro)
        )
    ).all()

    max_total = max((r.total_familias for r in rows), default=1)
    return [
        {
            "territorio": r.territorio or "Não definido",
            "bairro": r.bairro or "Não informado",
            "centroide_lat": float(r.lat_media) if r.lat_media else None,
            "centroide_lng": float(r.lng_media) if r.lng_media else None,
            "total_familias": r.total_familias,
            "intensidade": round(r.total_familias / max_total, 3),
        }
        for r in rows
    ]


async def calcular_perfil_populacional(
    db: AsyncSession, tenant_id: uuid.UUID,
) -> dict:
    hoje = date.today()

    persons_q = (
        select(
            Person.sexo,
            Person.data_nascimento,
            Person.raca_cor,
            Person.escolaridade,
        )
        .where(
            Person.tenant_id == tenant_id,
            Person.deleted_at.is_(None),
        )
    )
    persons_rows = (await db.execute(persons_q)).all()

    piramide_masculino: dict[str, int] = {k: 0 for k in FAIXA_ETARIA_ROTULO}
    piramide_feminino: dict[str, int] = {k: 0 for k in FAIXA_ETARIA_ROTULO}
    sexo_contagem: dict[str, int] = {}
    raca_contagem: dict[str, int] = {}
    escolaridade_contagem: dict[str, int] = {}

    for row in persons_rows:
        sexo = (row.sexo or "OUTRO").upper()
        if sexo in ("FEMININO",):
            sexo = "F"
        if sexo in ("MASCULINO",):
            sexo = "M"
        sexo_contagem[sexo] = sexo_contagem.get(sexo, 0) + 1

        raca = row.raca_cor or "NAO_DECLARADO"
        raca_contagem[raca] = raca_contagem.get(raca, 0) + 1

        esc = row.escolaridade or "NAO_INFORMADO"
        escolaridade_contagem[esc] = escolaridade_contagem.get(esc, 0) + 1

        if row.data_nascimento:
            idade = hoje.year - row.data_nascimento.year
            if hoje.month < row.data_nascimento.month or (
                hoje.month == row.data_nascimento.month and hoje.day < row.data_nascimento.day
            ):
                idade -= 1
            faixa = _faixa_etaria(idade)
            if sexo == "F":
                piramide_feminino[faixa] += 1
            else:
                piramide_masculino[faixa] += 1

    total = sum(sexo_contagem.values())
    return {
        "total_pessoas": total,
        "piramide_etaria": [
            {
                "faixa": faixa,
                "masculino": piramide_masculino.get(faixa, 0),
                "feminino": piramide_feminino.get(faixa, 0),
            }
            for faixa in FAIXA_ETARIA_ROTULO
        ],
        "sexo": [
            {"rotulo": SEXO_ROTULO.get(k, k), "valor": k, "total": v, "percentual": round(v / total * 100, 1) if total > 0 else 0}
            for k, v in sorted(sexo_contagem.items(), key=lambda x: -x[1])
        ],
        "raca_cor": [
            {"rotulo": RACA_COR_ROTULO.get(k, k), "valor": k, "total": v, "percentual": round(v / total * 100, 1) if total > 0 else 0}
            for k, v in sorted(raca_contagem.items(), key=lambda x: -x[1])
        ],
        "escolaridade": [
            {"rotulo": ESCOLARIDADE_ROTULO.get(k, k), "valor": k, "total": v, "percentual": round(v / total * 100, 1) if total > 0 else 0}
            for k, v in sorted(escolaridade_contagem.items(), key=lambda x: -x[1])
        ],
    }


def _faixa_etaria(idade: int) -> str:
    for faixa, (lo, hi) in FAIXA_ETARIA_ROTULO.items():
        if lo <= idade <= hi:
            return faixa
    return "70+"


async def detectar_anomalias(
    db: AsyncSession, tenant_id: uuid.UUID,
) -> list[dict]:
    hoje = date.today()
    atendimentos_mensais: list[dict] = []
    beneficios_mensais: list[dict] = []

    for i in range(12):
        ano_ref = hoje.year if hoje.month - i > 0 else hoje.year - 1
        mes_ref = hoje.month - i if hoje.month - i > 0 else 12 + (hoje.month - i)
        inicio = date(ano_ref, mes_ref, 1)
        if mes_ref == 12:
            fim = date(ano_ref + 1, 1, 1)
        else:
            fim = date(ano_ref, mes_ref + 1, 1)

        atend = (
            await db.execute(
                select(func.count(Attendance.id)).where(
                    Attendance.tenant_id == tenant_id,
                    Attendance.data_atendimento >= _dt(inicio),
                    Attendance.data_atendimento < _dt(fim),
                    Attendance.deleted_at.is_(None),
                )
            )
        ).scalar() or 0

        benef = (
            await db.execute(
                select(func.count(ConcessaoBeneficio.id)).where(
                    ConcessaoBeneficio.tenant_id == tenant_id,
                    ConcessaoBeneficio.data_solicitacao >= _dt(inicio),
                    ConcessaoBeneficio.data_solicitacao < _dt(fim),
                )
            )
        ).scalar() or 0

        atendimentos_mensais.append({"ano": ano_ref, "mes": mes_ref, "valor": int(atend)})
        beneficios_mensais.append({"ano": ano_ref, "mes": mes_ref, "valor": int(benef)})

    valores_attend = [m["valor"] for m in atendimentos_mensais]
    valores_benef = [m["valor"] for m in beneficios_mensais]

    anomalias: list[dict] = []

    if len(valores_attend) >= 4 and sum(valores_attend) > 0:
        med_attend = mean(valores_attend)
        desv_attend = stdev(valores_attend) if len(valores_attend) > 1 else 0
        limiar_attend = med_attend + 2.5 * desv_attend
        for m in atendimentos_mensais:
            if m["valor"] > limiar_attend and m["valor"] > med_attend * 1.5:
                anomalias.append({
                    "tipo": "atendimento",
                    "ano": m["ano"],
                    "mes": m["mes"],
                    "rotulo": f"{MESES_NOME[m['mes']]}/{m['ano']}",
                    "valor": m["valor"],
                    "media_esperada": round(med_attend),
                    "desvio_padrao": round(desv_attend, 1),
                    "severidade": "alta" if m["valor"] > med_attend + 3 * desv_attend else "media",
                })

    if len(valores_benef) >= 4 and sum(valores_benef) > 0:
        med_benef = mean(valores_benef)
        desv_benef = stdev(valores_benef) if len(valores_benef) > 1 else 0
        limiar_benef = med_benef + 2.5 * desv_benef
        for m in beneficios_mensais:
            if m["valor"] > limiar_benef and m["valor"] > med_benef * 1.5:
                anomalias.append({
                    "tipo": "beneficio",
                    "ano": m["ano"],
                    "mes": m["mes"],
                    "rotulo": f"{MESES_NOME[m['mes']]}/{m['ano']}",
                    "valor": m["valor"],
                    "media_esperada": round(med_benef),
                    "desvio_padrao": round(desv_benef, 1),
                    "severidade": "alta" if m["valor"] > med_benef + 3 * desv_benef else "media",
                })

    return anomalias
