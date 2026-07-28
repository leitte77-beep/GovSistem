import calendar
import uuid
from datetime import date, datetime, timedelta, timezone

from sqlalchemy import and_, desc, extract, func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.acao_coletiva import AcaoColetiva, Inscricao
from app.models.acompanhamento import Acompanhamento
from app.models.agenda import Appointment
from app.models.attendance import Attendance
from app.models.audit_trail import AuditTrail
from app.models.beneficio import ConcessaoBeneficio
from app.models.case_file import CaseFile
from app.models.encaminhamento import Encaminhamento
from app.models.family import Family
from app.models.person import Person
from app.models.rma import RmaFechamento
from app.models.unit import Unit
from app.models.user import User


def _dt(d: date) -> datetime:
    return datetime(d.year, d.month, 1, tzinfo=timezone.utc)


async def get_overview(db: AsyncSession, tenant_id: uuid.UUID) -> dict:
    """KPIs para o dashboard do gestor."""
    hoje = date.today()
    inicio_mes = date(hoje.year, hoje.month, 1)

    atendimentos_mes = (
        await db.execute(
            select(func.count(Attendance.id)).where(
                Attendance.tenant_id == tenant_id,
                Attendance.data_atendimento >= _dt(inicio_mes),
                Attendance.deleted_at.is_(None),
            )
        )
    ).scalar() or 0

    acs_ativos = (
        await db.execute(
            select(func.count(Acompanhamento.id)).where(
                Acompanhamento.tenant_id == tenant_id,
                Acompanhamento.situacao == "ATIVO",
                Acompanhamento.deleted_at.is_(None),
            )
        )
    ).scalar() or 0

    familias_cadastradas = (
        await db.execute(
            select(func.count(Family.id)).where(
                Family.tenant_id == tenant_id,
                Family.deleted_at.is_(None),
            )
        )
    ).scalar() or 0

    beneficios_mes = (
        await db.execute(
            select(func.count(ConcessaoBeneficio.id)).where(
                ConcessaoBeneficio.tenant_id == tenant_id,
                ConcessaoBeneficio.data_solicitacao >= _dt(inicio_mes),
            )
        )
    ).scalar() or 0

    enc_pendentes = (
        await db.execute(
            select(func.count(Encaminhamento.id)).where(
                Encaminhamento.tenant_id == tenant_id,
                Encaminhamento.status == "PENDENTE",
                Encaminhamento.deleted_at.is_(None),
            )
        )
    ).scalar() or 0

    grupos_ativos = (
        await db.execute(
            select(func.count(AcaoColetiva.id)).where(
                AcaoColetiva.tenant_id == tenant_id,
                AcaoColetiva.status == "ATIVA",
                AcaoColetiva.deleted_at.is_(None),
            )
        )
    ).scalar() or 0

    inscricoes_scfv = (
        await db.execute(
            select(func.count(Inscricao.id)).where(
                Inscricao.tenant_id == tenant_id,
                Inscricao.status == "ATIVA",
            )
        )
    ).scalar() or 0

    return {
        "atendimentos_mes": int(atendimentos_mes),
        "acompanhamentos_ativos": int(acs_ativos),
        "familias_cadastradas": int(familias_cadastradas),
        "beneficios_concedidos_mes": int(beneficios_mes),
        "encaminhamentos_pendentes": int(enc_pendentes),
        "grupos_ativos": int(grupos_ativos),
        "inscritos_scfv": int(inscricoes_scfv),
    }


async def get_time_series(db: AsyncSession, tenant_id: uuid.UUID, meses: int = 12) -> list:
    """Série histórica de atendimentos por mês."""
    hoje = date.today()
    resultados = []
    for i in range(meses):
        ano = hoje.year if hoje.month - i > 0 else hoje.year - 1
        mes = hoje.month - i if hoje.month - i > 0 else 12 + (hoje.month - i)
        inicio = date(ano, mes, 1)
        if mes == 12:
            fim = date(ano + 1, 1, 1)
        else:
            fim = date(ano, mes + 1, 1)

        total = (
            await db.execute(
                select(func.count(Attendance.id)).where(
                    Attendance.tenant_id == tenant_id,
                    Attendance.data_atendimento >= _dt(inicio),
                    Attendance.data_atendimento < _dt(fim),
                    Attendance.deleted_at.is_(None),
                )
            )
        ).scalar() or 0

        beneficios = (
            await db.execute(
                select(func.count(ConcessaoBeneficio.id)).where(
                    ConcessaoBeneficio.tenant_id == tenant_id,
                    ConcessaoBeneficio.data_solicitacao >= _dt(inicio),
                    ConcessaoBeneficio.data_solicitacao < _dt(fim),
                )
            )
        ).scalar() or 0

        resultados.append({
            "ano": ano,
            "mes": mes,
            "atendimentos": int(total),
            "beneficios": int(beneficios),
        })
    resultados.reverse()
    return resultados


async def get_by_territory(db: AsyncSession, tenant_id: uuid.UUID) -> list:
    """Agregados por território/bairro (anônimos)."""
    rows = (
        await db.execute(
            select(
                Family.territorio,
                func.count(Family.id).label("total_familias"),
            ).where(
                Family.tenant_id == tenant_id,
                Family.deleted_at.is_(None),
            ).group_by(Family.territorio).order_by(func.count(Family.id).desc())
        )
    ).all()

    return [
        {
            "territorio": r.territorio or "Sem território",
            "total_familias": r.total_familias,
        }
        for r in rows
    ]


async def get_map_data(db: AsyncSession, tenant_id: uuid.UUID) -> list:
    """Dados agregados para mapa de calor por território.
    Nunca expõe coordenadas individuais — apenas agregados por bairro.
    """
    rows = (
        await db.execute(
            select(
                Family.territorio,
                Family.bairro,
                func.count(Family.id).label("total"),
                func.avg(Family.latitude).label("lat_media"),
                func.avg(Family.longitude).label("lng_media"),
            ).where(
                Family.tenant_id == tenant_id,
                Family.deleted_at.is_(None),
                Family.latitude.isnot(None),
            ).group_by(Family.territorio, Family.bairro)
        )
    ).all()

    return [
        {
            "territorio": r.territorio or "Não definido",
            "bairro": r.bairro or "Não informado",
            "total_familias": r.total,
            "centroide_lat": float(r.lat_media) if r.lat_media else None,
            "centroide_lng": float(r.lng_media) if r.lng_media else None,
        }
        for r in rows
    ]


async def get_benefits_report(
    db: AsyncSession, tenant_id: uuid.UUID, ano: int | None = None, mes: int | None = None,
) -> list:
    """Relatório de consumo de benefícios por tipo."""
    q = (
        select(
            ConcessaoBeneficio.benefit_type_code,
            func.count(ConcessaoBeneficio.id).label("total"),
            func.sum(ConcessaoBeneficio.valor_total).label("valor_total"),
        ).where(
            ConcessaoBeneficio.tenant_id == tenant_id,
            ConcessaoBeneficio.status.in_(["ENTREGUE", "APROVADO"]),
        )
    )
    if ano and mes:
        inicio = date(ano, mes, 1)
        if mes == 12:
            fim = date(ano + 1, 1, 1)
        else:
            fim = date(ano, mes + 1, 1)
        q = q.where(
            ConcessaoBeneficio.data_solicitacao >= _dt(inicio),
            ConcessaoBeneficio.data_solicitacao < _dt(fim),
        )
    q = (
        q.group_by(ConcessaoBeneficio.benefit_type_code)
        .order_by(func.count(ConcessaoBeneficio.id).desc())
    )
    rows = (await db.execute(q)).all()
    return [
        {"tipo_beneficio": r.benefit_type_code, "total_concessoes": int(r.total),
         "valor_total": float(r.valor_total) if r.valor_total else 0}
        for r in rows
    ]


async def get_indicators(db: AsyncSession, tenant_id: uuid.UUID) -> dict:
    """Indicadores socioassistenciais derivados do cadastro."""
    total = (
        await db.execute(
            select(func.count(Family.id)).where(
                Family.tenant_id == tenant_id, Family.deleted_at.is_(None),
            )
        )
    ).scalar() or 1

    pbf = (
        await db.execute(
            select(func.count(Family.id)).where(
                Family.tenant_id == tenant_id,
                Family.beneficiaria_pbf.is_(True),
                Family.deleted_at.is_(None),
            )
        )
    ).scalar() or 0

    bpc = (
        await db.execute(
            select(func.count(Family.id)).where(
                Family.tenant_id == tenant_id,
                Family.possui_bpc.is_(True),
                Family.deleted_at.is_(None),
            )
        )
    ).scalar() or 0

    cadunico_desatualizado = (
        await db.execute(
            select(func.count(Family.id)).where(
                Family.tenant_id == tenant_id,
                Family.cadunico_atualizado_em.isnot(None),
                Family.cadunico_atualizado_em < date.today() - timedelta(days=730),
                Family.deleted_at.is_(None),
            )
        )
    ).scalar() or 0

    inseguranca = (
        await db.execute(
            select(func.count(Family.id)).where(
                Family.tenant_id == tenant_id,
                Family.inseguranca_alimentar.is_(True),
                Family.deleted_at.is_(None),
            )
        )
    ).scalar() or 0

    faixas = (
        await db.execute(
            select(Family.faixa_renda, func.count(Family.id)).where(
                Family.tenant_id == tenant_id, Family.deleted_at.is_(None),
            ).group_by(Family.faixa_renda)
        )
    ).all()

    renda_por_faixa = []
    for row in faixas:
        f = row[0] if row[0] else "NAO_INFORMADO"
        renda_por_faixa.append({"faixa": f, "total": int(row[1])})

    return {
        "total_familias": int(total),
        "pbf": int(pbf),
        "pbf_percentual": round(pbf / total * 100, 1),
        "bpc": int(bpc),
        "bpc_percentual": round(bpc / total * 100, 1),
        "cadunico_desatualizado_24m": int(cadunico_desatualizado),
        "inseguranca_alimentar": int(inseguranca),
        "renda_por_faixa": renda_por_faixa,
    }


ENTIDADE_ROTULO: dict[str, str] = {
    "family": "Família",
    "person": "Pessoa",
    "attendance": "Atendimento",
    "benefit_concession": "Benefício",
    "encaminhamento": "Encaminhamento",
    "acao_coletiva": "Grupo SCFV",
    "case_file": "Prontuário",
    "unit": "Unidade",
    "professional": "Profissional",
    "benefit_type": "Tipo de benefício",
    "domain_national_seed": "Domínios nacionais",
    "org_signing_certificate": "Certificado digital",
    "import_job": "Importação",
    "onboarding_wizard": "Configuração",
    "rma": "RMA",
    "questionario": "Questionário",
    "user": "Usuário",
}

ACAO_ROTULO: dict[str, str] = {
    "CREATE": "criado",
    "UPDATE": "atualizado",
    "DELETE": "removido",
    "READ": "consultado",
    "LOGIN": "entrou no sistema",
    "SEED": "inicializado",
    "MERGE": "unificado",
}

# Códigos crus (chaves curtas em pt-BR) enviados ao frontend nos campos
# `entidade`/`acao` do feed de atividade. O frontend é o dono da tradução
# final para frase (ver mapeadorAtividade.ts) — o backend NÃO deve mais
# pré-traduzir esses dois campos para um rótulo humano (isso quebrava o
# lookup de chave completa `entidade.acao` no mapper e fazia cair no
# fallback cru). `texto`/`descricao` continuam sendo rótulos humanos, usados
# só como fallback de último caso.
ENTIDADE_CODIGO: dict[str, str] = {
    "family": "familia",
    "person": "pessoa",
    "attendance": "atendimento",
    "benefit_concession": "beneficio",
    "encaminhamento": "encaminhamento",
    "acao_coletiva": "grupo",
    "case_file": "prontuario",
    "unit": "unidade",
    "professional": "profissional",
    "rma": "rma_fechamento",
    "import_job": "importacao",
    "domain_national_seed": "config",
    "onboarding_wizard": "config",
}

ACAO_CODIGO: dict[str, str] = {
    "CREATE": "criado",
    "UPDATE": "atualizado",
    "DELETE": "removido",
    "READ": "consultado",
    "SEED": "criado",
    "MERGE": "atualizado",
}

_ONBOARDING_STEP_LABELS: dict[str, str] = {
    "units": "Unidades cadastradas",
    "territories": "Territórios configurados",
    "benefits": "Benefícios configurados",
    "professionals": "Equipe cadastrada",
    "import": "Importação de dados concluída",
}


def _texto_atividade(
    entity: str,
    entity_id: str | None,
    action: str,
    diff_summary: dict | None,
) -> tuple[str, str, str]:
    """Retorna (texto_principal, descricao, categoria) para a linha de atividade."""
    entidade = ENTIDADE_ROTULO.get(entity, entity)
    acao = ACAO_ROTULO.get(action, action)
    diff = diff_summary or {}

    if entity == "onboarding_wizard":
        step = diff.get("step", "")
        label = _ONBOARDING_STEP_LABELS.get(step, f"Etapa {step}")
        return "Configuração inicial", label, "config"

    if entity == "user":
        return "Usuário", "entrou no sistema", "acesso"

    if entity == "family":
        if action == "CREATE":
            nome = diff.get("codigo", "") or ""
            desc = f"Família {nome} cadastrada" if nome else "Nova família cadastrada"
            return entidade, desc, "cadastro"
        if action == "UPDATE":
            return entidade, "Dados atualizados", "cadastro"
        return entidade, "", "cadastro"

    if entity == "person":
        if action == "CREATE":
            nome = diff.get("nome", "") or ""
            desc = nome if nome else "Nova pessoa cadastrada"
            return entidade, desc, "cadastro"
        if action == "UPDATE":
            return entidade, "Dados atualizados", "cadastro"
        return entidade, "", "cadastro"

    if entity == "attendance":
        if action == "CREATE":
            tipo = diff.get("tipo", "") or "Serviço"
            sigiloso = "sigiloso" if diff.get("sigiloso") else ""
            desc = f"{tipo} {sigiloso}".strip()
            return entidade, desc, "atendimento"
        if action == "UPDATE":
            return entidade, "Registro atualizado", "atendimento"
        if action == "READ":
            return entidade, "Evolução consultada", "atendimento"
        return entidade, "", "atendimento"

    if entity == "benefit_concession":
        if action == "CREATE":
            benef = diff.get("benefit", "") or "Benefício"
            desc = f"{benef} concedido"
            return entidade, desc, "beneficio"
        status = diff.get("novo_status", "")
        if status:
            return entidade, status.replace("_", " ").title(), "beneficio"
        if action == "UPDATE":
            return entidade, "Dados atualizados", "beneficio"
        return entidade, "", "beneficio"

    if entity == "encaminhamento":
        if action == "CREATE":
            tipo = diff.get("tipo", "") or ""
            desc = f"{tipo} criado" if tipo else "Novo encaminhamento"
            return entidade, desc, "encaminhamento"
        status = diff.get("novo_status", "")
        if status:
            return entidade, status.replace("_", " ").title(), "encaminhamento"
        return entidade, "", "encaminhamento"

    if entity == "acao_coletiva":
        if action == "CREATE":
            nome = diff.get("nome", "") or ""
            desc = nome if nome else "Novo grupo SCFV"
            return entidade, desc, "scfv"
        if action == "UPDATE":
            return entidade, "Dados atualizados", "scfv"
        return entidade, "", "scfv"

    if entity == "case_file":
        if action == "CREATE":
            servico = diff.get("service", "") or ""
            desc = servico if servico else "Novo prontuário"
            return entidade, desc, "prontuario"
        if action == "UPDATE":
            return entidade, "Registro atualizado", "prontuario"
        return entidade, "", "prontuario"

    if entity == "unit":
        if action == "CREATE":
            nome = diff.get("nome", "") or ""
            desc = nome if nome else "Nova unidade"
            return entidade, desc, "unidade"
        return entidade, "", "unidade"

    if entity == "professional":
        if action == "CREATE":
            nome = diff.get("nome", "") or ""
            desc = nome if nome else "Novo profissional"
            return entidade, desc, "profissional"
        return entidade, "", "profissional"

    if entity == "rma":
        if action == "CREATE":
            ano = diff.get("ano", "")
            mes = diff.get("mes", "")
            periodo = f"{mes}/{ano}" if mes and ano else ""
            desc = f"RMA {periodo}" if periodo else "Novo RMA"
            return entidade, desc, "rma"
        status = diff.get("novo_status", "")
        if status:
            return entidade, status.replace("_", " ").title(), "rma"
        return entidade, "", "rma"

    if entity == "import_job":
        if action == "CREATE":
            tipo = diff.get("tipo", "") or "Importação"
            desc = f"{tipo} iniciada"
            return entidade, desc, "importacao"
        return entidade, "", "importacao"

    if entity == "domain_national_seed":
        return entidade, "Tabelas de domínio inicializadas", "config"

    # genérico
    if action in ("CREATE", "UPDATE", "DELETE"):
        eid = entity_id[:8] if entity_id else ""
        return entidade, f"{eid} {acao}" if eid else acao, "geral"
    if action == "LOGIN":
        return "Usuário", "entrou no sistema", "acesso"
    if action == "SEED":
        return entidade, f"{acao}s", "config"
    return entidade, "", "geral"


async def get_activity(db: AsyncSession, tenant_id: uuid.UUID, limit: int = 10) -> list[dict]:
    rows = (
        await db.execute(
            select(AuditTrail)
            .where(AuditTrail.tenant_id == tenant_id)
            .order_by(desc(AuditTrail.occurred_at))
            .limit(limit)
        )
    ).scalars().all()

    # `ator` precisa ser o NOME de quem praticou a ação, nunca o cargo
    # (actor_role) — carrega os nomes em lote pra não fazer 1 query por linha.
    actor_ids = {r.actor_user_id for r in rows if r.actor_user_id}
    nomes_por_id: dict[uuid.UUID, str] = {}
    if actor_ids:
        usuarios = (
            await db.execute(select(User.id, User.name).where(User.id.in_(actor_ids)))
        ).all()
        nomes_por_id = {u.id: u.name for u in usuarios}

    resultados: list[dict] = []
    for r in rows:
        texto, descricao, categoria = _texto_atividade(
            r.entity, r.entity_id, r.action, r.diff_summary
        )
        diff = r.diff_summary or {}

        resultados.append({
            "id": r.id,
            "texto": texto,
            "descricao": descricao,
            "categoria": categoria,
            # Códigos crus (não pré-traduzidos) — o frontend traduz para frase
            # via mapeadorAtividade.ts, usando a chave completa `entidade.acao`.
            "entidade": ENTIDADE_CODIGO.get(r.entity, r.entity),
            "acao": ACAO_CODIGO.get(r.action, r.action.lower()),
            "data": r.occurred_at,
            "ator": nomes_por_id.get(r.actor_user_id) if r.actor_user_id else None,
            "nome": diff.get("nome") or diff.get("codigo"),
            "competencia": f"{diff['mes']}/{diff['ano']}" if diff.get("mes") and diff.get("ano") else None,
        })

    return resultados


# ── Escopo das recomendacoes do inicio ──────────────────────────
# Unidades que emitem RMA (mesmos tipos tratados pelo rma_engine).
_UNIDADES_RMA = ("CRAS", "CREAS", "CENTRO_POP")

# Prazo de devolutiva do encaminhamento e a antecedencia com que ele
# passa a ser sinalizado como "prazo proximo".
_PRAZO_DEVOLUTIVA_DIAS = 30
_ALERTA_DEVOLUTIVA_DIAS = 7

_ENCAMINHAMENTOS_EM_ABERTO = ("PENDENTE", "ACEITO", "ENVIADO", "OFICIO_GERADO")

_MESES_PT = (
    "janeiro", "fevereiro", "março", "abril", "maio", "junho",
    "julho", "agosto", "setembro", "outubro", "novembro", "dezembro",
)


async def get_recommendation_scope(db: AsyncSession, tenant_id: uuid.UUID) -> dict:
    """Contadores que alimentam as recomendacoes da tela inicial.

    Cada chave corresponde a uma regra do frontend (regrasRecomendacao):
    o card so aparece quando o contador satisfaz a condicao da regra.
    """
    agora = datetime.now(timezone.utc)
    hoje = agora.date()

    ultimo_dia = calendar.monthrange(hoje.year, hoje.month)[1]

    # RMA da competencia atual: fechado so quando todas as unidades que
    # emitem RMA fecharam. Tenant sem unidade nao gera alerta.
    unidades_rma = (
        await db.execute(
            select(func.count(Unit.id)).where(
                Unit.tenant_id == tenant_id,
                Unit.tipo.in_(_UNIDADES_RMA),
                Unit.deleted_at.is_(None),
            )
        )
    ).scalar() or 0

    fechamentos = (
        await db.execute(
            select(func.count(func.distinct(RmaFechamento.unit_id))).where(
                RmaFechamento.tenant_id == tenant_id,
                RmaFechamento.ano == hoje.year,
                RmaFechamento.mes == hoje.month,
                RmaFechamento.status == "FECHADO",
            )
        )
    ).scalar() or 0

    rma_fechado = unidades_rma == 0 or fechamentos >= unidades_rma

    # Familias sem NIS do responsavel — o NIS e o vinculo com o CadUnico.
    nis_pendentes = (
        await db.execute(
            select(func.count(Family.id)).where(
                Family.tenant_id == tenant_id,
                Family.deleted_at.is_(None),
                or_(
                    Family.nis_responsavel.is_(None),
                    Family.nis_responsavel == "",
                ),
            )
        )
    ).scalar() or 0

    # Familias em acompanhamento ativo sem atendimento nos ultimos 90 dias.
    limite_90d = agora - timedelta(days=90)
    case_files_recentes = (
        select(Attendance.case_file_id)
        .where(
            Attendance.tenant_id == tenant_id,
            Attendance.data_atendimento >= limite_90d,
            Attendance.deleted_at.is_(None),
        )
        .distinct()
    )
    sem_atendimento_90d = (
        await db.execute(
            select(func.count(func.distinct(CaseFile.family_id)))
            .select_from(Acompanhamento)
            .join(CaseFile, CaseFile.id == Acompanhamento.case_file_id)
            .where(
                Acompanhamento.tenant_id == tenant_id,
                Acompanhamento.situacao == "ATIVO",
                Acompanhamento.deleted_at.is_(None),
                Acompanhamento.case_file_id.notin_(case_files_recentes),
            )
        )
    ).scalar() or 0

    inicio_dia = datetime(hoje.year, hoje.month, hoje.day, tzinfo=timezone.utc)
    agendamentos_hoje = (
        await db.execute(
            select(func.count(Appointment.id)).where(
                Appointment.tenant_id == tenant_id,
                Appointment.data_hora_inicio >= inicio_dia,
                Appointment.data_hora_inicio < inicio_dia + timedelta(days=1),
                Appointment.status.in_(("AGENDADO", "AGUARDANDO", "EM_ATENDIMENTO")),
                Appointment.deleted_at.is_(None),
            )
        )
    ).scalar() or 0

    # Aniversariantes dos proximos 7 dias — compara dia/mes para atravessar
    # a virada de mes e de ano sem caso especial.
    proximos_dias = [hoje + timedelta(days=i) for i in range(7)]
    aniversariantes_semana = (
        await db.execute(
            select(func.count(Person.id)).where(
                Person.tenant_id == tenant_id,
                Person.deleted_at.is_(None),
                Person.data_nascimento.is_not(None),
                or_(
                    *[
                        and_(
                            extract("month", Person.data_nascimento) == d.month,
                            extract("day", Person.data_nascimento) == d.day,
                        )
                        for d in proximos_dias
                    ]
                ),
            )
        )
    ).scalar() or 0

    # Encaminhamentos em aberto cuja devolutiva vence em ate 7 dias
    # (inclui os ja vencidos, que continuam exigindo acao).
    corte_devolutiva = agora - timedelta(
        days=_PRAZO_DEVOLUTIVA_DIAS - _ALERTA_DEVOLUTIVA_DIAS
    )
    encaminhamentos_prazo = (
        await db.execute(
            select(func.count(Encaminhamento.id)).where(
                Encaminhamento.tenant_id == tenant_id,
                Encaminhamento.deleted_at.is_(None),
                Encaminhamento.status.in_(_ENCAMINHAMENTOS_EM_ABERTO),
                Encaminhamento.data_devolutiva.is_(None),
                Encaminhamento.data_encaminhamento <= corte_devolutiva,
            )
        )
    ).scalar() or 0

    return {
        "rma_fechado": rma_fechado,
        "dias_ate_fim_do_mes": ultimo_dia - hoje.day,
        "mes_atual": _MESES_PT[hoje.month - 1],
        "nis_pendentes": nis_pendentes,
        "sem_atendimento_90d": sem_atendimento_90d,
        "agendamentos_hoje": agendamentos_hoje,
        "aniversariantes_semana": aniversariantes_semana,
        "encaminhamentos_prazo": encaminhamentos_prazo,
    }
