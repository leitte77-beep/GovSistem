"""Seeds do módulo GovSocial.

- Seed nacional dos 4 domínios (copiado para cada tenant no onboarding).
- Papéis (roles) do sistema.
- Tenant fictício "Nova Esperança" (2 CRAS, 1 CREAS, SEDE) com profissionais
  e usuários de exemplo por perfil, para desenvolvimento e testes.
"""

import uuid
from datetime import date, datetime

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.security import hash_password
from app.models.domain import AccessForm, BenefitType, ReferralCode, ServiceType
from app.models.enums import RoleName
from app.models.notificacao import Notificacao
from app.models.organization import Organization
from app.models.professional import Professional
from app.models.professional_assignment import ProfessionalAssignment
from app.models.role import Role
from app.models.unit import Unit
from app.models.user import User
from app.models.user_role import UserRole

VIGENCIA = date(2009, 11, 11)  # Res. CNAS 109/2009

# ── Domínio nacional ──────────────────────────────────────────────
SERVICE_TYPES = [
    ("PAIF", "Serviço de Proteção e Atendimento Integral à Família (PAIF)", "PAIF", "BASICA"),
    ("SCFV", "Serviço de Convivência e Fortalecimento de Vínculos (SCFV)", "SCFV", "BASICA"),
    ("PSB_DOM", "Proteção Social Básica no Domicílio p/ PcD e Idosos", "PSB-DOM", "BASICA"),
    ("PAEFI", "Serviço de Proteção e Atendimento Especializado a Famílias e Indivíduos (PAEFI)", "PAEFI", "ESPECIAL_MEDIA"),
    ("MSE", "Serviço de MSE em Meio Aberto (LA e PSC)", "MSE", "ESPECIAL_MEDIA"),
    ("ABORDAGEM", "Serviço Especializado em Abordagem Social", "ABORD", "ESPECIAL_MEDIA"),
    ("PSR", "Serviço Especializado para Pessoas em Situação de Rua", "PSR", "ESPECIAL_MEDIA"),
    ("ACOLH_ADULTO", "Serviço de Acolhimento Institucional", "ACOLH", "ESPECIAL_ALTA"),
    ("ACOLH_CRIANCA", "Acolhimento p/ Crianças e Adolescentes", "ACOLH-CA", "ESPECIAL_ALTA"),
]

ACCESS_FORMS = [
    ("DEMANDA_ESPONTANEA", "Demanda espontânea"),
    ("BUSCA_ATIVA", "Busca ativa"),
    ("ENC_REDE_SUAS", "Encaminhamento da rede socioassistencial"),
    ("ENC_OUTRAS_POLITICAS", "Encaminhamento de outras políticas públicas"),
    ("ENC_SGD", "Encaminhamento do Sistema de Garantia de Direitos"),
]

REFERRAL_CODES = [
    ("SAUDE", "Encaminhamento para a Saúde", "SAUDE"),
    ("EDUCACAO", "Encaminhamento para a Educação", "EDUCACAO"),
    ("CT", "Encaminhamento para o Conselho Tutelar", "CONSELHO_TUTELAR"),
    ("CADUNICO_INCL", "Inclusão no CadÚnico", "CADUNICO"),
    ("CADUNICO_ATUAL", "Atualização cadastral no CadÚnico", "CADUNICO"),
    ("BPC_INSS", "Encaminhamento para BPC / INSS", "INSS_BPC"),
    ("CREAS", "Encaminhamento para o CREAS", "REDE_SOCIOASSISTENCIAL"),
    ("TRABALHO", "Encaminhamento para Trabalho e Renda", "TRABALHO_RENDA"),
    ("JUDICIARIO", "Encaminhamento para o Judiciário / MP", "JUDICIARIO"),
]

BENEFIT_TYPES = [
    ("NATALIDADE", "Auxílio-natalidade", "NATALIDADE", "UNIDADE", True, 300),
    ("FUNERAL", "Auxílio-funeral", "FUNERAL", "UNIDADE", True, None),
    ("ALIMENTACAO", "Cesta básica / Auxílio-alimentação", "ALIMENTACAO", "CESTA", False, 30),
    ("CALAMIDADE", "Auxílio em situação de calamidade", "CALAMIDADE", "UNIDADE", True, None),
    ("PASSAGEM", "Passagem / Auxílio-transporte", "PASSAGEM", "UNIDADE", False, 30),
    ("DOCUMENTACAO", "Auxílio-documentação / 2ª via / foto", "DOCUMENTACAO", "UNIDADE", False, 180),
    ("VALE_GAS", "Vale-Gás / Auxílio-gás de cozinha", "TRANSFERENCIA", "UNIDADE", False, 60),
    ("ENXOVAL", "Kit enxoval / Auxílio-enxoval para gestante", "ENXOVAL", "KIT", False, 300),
    ("FARDAMENTO", "Auxílio-fardamento / material escolar", "EDUCACAO", "KIT", False, 365),
    ("FILTRO_AGUA", "Filtro de água / Kit tratamento de água", "HABITACAO", "KIT", False, None),
    ("MEDICAMENTO", "Auxílio-medicamento / farmácia", "SAUDE", "UNIDADE", True, 30),
    ("COLCHAO", "Kit colchão / Auxílio-mobiliário básico", "HABITACAO", "KIT", False, 180),
]


async def _exists(db, model, tenant_id, code):
    return (
        await db.execute(
            select(model.id).where(model.tenant_id == tenant_id, model.code == code)
        )
    ).scalar_one_or_none()


async def seed_national_domains(db: AsyncSession, tenant_id: uuid.UUID) -> dict:
    """Copia o seed nacional dos 4 domínios para o tenant (idempotente)."""
    counts = {"service_types": 0, "access_forms": 0, "referral_codes": 0, "benefit_types": 0}

    for code, nome, sigla, protecao in SERVICE_TYPES:
        if not await _exists(db, ServiceType, tenant_id, code):
            db.add(ServiceType(
                tenant_id=tenant_id, code=code, nome=nome, sigla=sigla,
                protecao=protecao, source="NACIONAL", vigencia_inicio=VIGENCIA,
            ))
            counts["service_types"] += 1

    for code, nome in ACCESS_FORMS:
        if not await _exists(db, AccessForm, tenant_id, code):
            db.add(AccessForm(
                tenant_id=tenant_id, code=code, nome=nome,
                source="NACIONAL", vigencia_inicio=VIGENCIA,
            ))
            counts["access_forms"] += 1

    for code, nome, area in REFERRAL_CODES:
        if not await _exists(db, ReferralCode, tenant_id, code):
            db.add(ReferralCode(
                tenant_id=tenant_id, code=code, nome=nome, area=area,
                source="NACIONAL", vigencia_inicio=VIGENCIA,
            ))
            counts["referral_codes"] += 1

    for code, nome, categoria, um, exige, janela in BENEFIT_TYPES:
        if not await _exists(db, BenefitType, tenant_id, code):
            db.add(BenefitType(
                tenant_id=tenant_id, code=code, nome=nome, categoria=categoria,
                unidade_medida=um, exige_parecer=exige, periodicidade_max_dias=janela,
                source="NACIONAL", vigencia_inicio=VIGENCIA,
            ))
            counts["benefit_types"] += 1

    await db.flush()
    return counts


# ── Roles ─────────────────────────────────────────────────────────
SEED_ROLES = [
    (RoleName.ADMIN.value, "Administrador", "Acesso total"),
    (RoleName.RECEPCAO.value, "Recepção", "Cadastro de pessoas/famílias, agenda, fila"),
    (RoleName.TECNICO_MEDIO.value, "Técnico de nível médio", "Grupos, atividades coletivas, visitas delegadas"),
    (RoleName.TECNICO_SUPERIOR.value, "Técnico de nível superior", "Prontuário completo da unidade"),
    (RoleName.COORDENADOR_UNIDADE.value, "Coordenador de unidade", "Gestão e fechamento do RMA da unidade"),
    (RoleName.GESTOR_MUNICIPAL.value, "Gestor municipal", "Dashboards, RMA consolidado, configurações"),
    (RoleName.VIGILANCIA.value, "Vigilância socioassistencial", "Indicadores, mapas, configurações"),
    (RoleName.CONSELHO.value, "Conselho (CMAS)", "Relatórios agregados e anonimizados"),
    (RoleName.SUPORTE_GOVASSIST.value, "Suporte GovSocial", "Operação assistida com consentimento"),
]


async def seed_roles(db: AsyncSession) -> list[Role]:
    roles = []
    for name, label, description in SEED_ROLES:
        role = (
            await db.execute(select(Role).where(Role.name == name))
        ).scalar_one_or_none()
        if not role:
            role = Role(name=name, label=label, description=description, is_system=True)
            db.add(role)
            await db.flush()
        roles.append(role)
    await db.commit()
    return roles


# ── Tenant fictício "Nova Esperança" ──────────────────────────────
SEED_ORG = {"name": "Prefeitura de Nova Esperança", "slug": "nova-esperanca"}

SEED_USERS = [
    ("Administrador GovSocial", "admin@govsocial.gov.br", "11111111111", RoleName.ADMIN.value),
    ("Recepcionista Ana", "recepcao@nova-esperanca.gov.br", "22222222222", RoleName.RECEPCAO.value),
    ("Educador Carlos", "educador@nova-esperanca.gov.br", "33333333333", RoleName.TECNICO_MEDIO.value),
    ("Assistente Social Beatriz", "tecnico@nova-esperanca.gov.br", "44444444444", RoleName.TECNICO_SUPERIOR.value),
    ("Coordenadora Denise", "coordenador@nova-esperanca.gov.br", "55555555555", RoleName.COORDENADOR_UNIDADE.value),
    ("Gestor Eduardo", "gestor@nova-esperanca.gov.br", "66666666666", RoleName.GESTOR_MUNICIPAL.value),
    ("Vigilância Fernanda", "vigilancia@nova-esperanca.gov.br", "77777777777", RoleName.VIGILANCIA.value),
    ("Conselheiro Gilberto", "conselho@nova-esperanca.gov.br", "88888888888", RoleName.CONSELHO.value),
    ("Suporte GovSocial", "suporte@govsocial.com.br", "99999999999", RoleName.SUPORTE_GOVASSIST.value),
]

SEED_UNITS = [
    ("CRAS", "CRAS Centro", "Centro"),
    ("CRAS", "CRAS Vila Nova", "Vila Nova"),
    ("CREAS", "CREAS Municipal", "Centro"),
    ("SEDE", "Secretaria de Assistência Social", "Centro"),
]

SEED_PASSWORD = "govsocial123"


async def seed_nova_esperanca(db: AsyncSession) -> dict:
    org = (
        await db.execute(
            select(Organization).where(Organization.slug == SEED_ORG["slug"])
        )
    ).scalar_one_or_none()
    if not org:
        org = Organization(
            name=SEED_ORG["name"],
            slug=SEED_ORG["slug"],
            is_active=True,
            suporte_consentido=True,
            settings={"gestor_le_evolucao": False},
        )
        db.add(org)
        await db.flush()

    roles = {r.name: r for r in await seed_roles(db)}

    users = {}
    for nome, email, cpf, role_name in SEED_USERS:
        user = (
            await db.execute(select(User).where(User.email == email))
        ).scalar_one_or_none()
        if not user:
            user = User(
                organization_id=None if role_name == RoleName.ADMIN.value else org.id,
                name=nome,
                cpf=cpf,
                email=email,
                password_hash=hash_password(SEED_PASSWORD),
                is_active=True,
            )
            db.add(user)
            await db.flush()
            db.add(UserRole(user_id=user.id, role_id=roles[role_name].id))
        users[role_name] = user
    await db.commit()

    units = {}
    for tipo, nome, bairro in SEED_UNITS:
        unit = (
            await db.execute(
                select(Unit).where(Unit.tenant_id == org.id, Unit.nome == nome)
            )
        ).scalar_one_or_none()
        if not unit:
            unit = Unit(
                tenant_id=org.id, tipo=tipo, nome=nome, municipio="Nova Esperança",
                uf="PR", bairro=bairro, territorios=[bairro], is_active=True,
            )
            db.add(unit)
            await db.flush()
        units[nome] = unit

    # Profissional técnico lotado no CRAS Centro.
    tecnico_prof = (
        await db.execute(
            select(Professional).where(
                Professional.tenant_id == org.id, Professional.cpf == "44444444444"
            )
        )
    ).scalar_one_or_none()
    if not tecnico_prof:
        tecnico_prof = Professional(
            tenant_id=org.id, nome="Assistente Social Beatriz", cpf="44444444444",
            funcao_nob_rh="Assistente Social", conselho_classe_tipo="CRESS",
            conselho_classe_numero="12345",
            user_id=users[RoleName.TECNICO_SUPERIOR.value].id, is_active=True,
        )
        db.add(tecnico_prof)
        await db.flush()
        db.add(ProfessionalAssignment(
            tenant_id=org.id, professional_id=tecnico_prof.id,
            unit_id=units["CRAS Centro"].id, funcao_no_local="Técnica de referência",
            data_inicio=date(2024, 1, 15),
        ))

    domain_counts = await seed_national_domains(db, org.id)
    await db.commit()

    families_count = await seed_families(db, org.id)
    prontuario_count = await seed_prontuarios(db, org.id)

    return {
        "organization": org.slug,
        "roles": list(roles.keys()),
        "users": [u for _, _, _, u in SEED_USERS],
        "units": [n for _, n, _ in SEED_UNITS],
        "domains": domain_counts,
        "families": families_count,
        "prontuarios": prontuario_count,
        "senha_padrao": SEED_PASSWORD,
    }


# ── Famílias e pessoas de exemplo (FASE 2) ────────────────────────
SEED_FAMILIES = [
    {
        "bairro": "Centro", "faixa_renda": "POBREZA", "beneficiaria_pbf": True,
        "logradouro": "Rua das Acácias", "numero": "120",
        "responsavel": {
            "nome_civil": "Marta Souza Lima", "cpf": "52998224725",
            "nis": "12073216945", "sexo": "FEMININO", "nascimento": date(1985, 4, 12),
            "escolaridade": "FUNDAMENTAL_COMPLETO", "parentesco": "RESPONSAVEL",
        },
        "membros": [
            {"nome_civil": "Pedro Souza Lima", "sexo": "MASCULINO",
             "nascimento": date(2012, 8, 3), "escolaridade": "FUNDAMENTAL_INCOMPLETO",
             "parentesco": "FILHO"},
        ],
    },
    {
        "bairro": "Vila Nova", "faixa_renda": "EXTREMA_POBREZA",
        "inseguranca_alimentar": True, "no_cadunico": True,
        "logradouro": "Travessa São João", "numero": "45",
        "responsavel": {
            "nome_civil": "João Carlos Pereira", "cpf": "16899535009",
            "sexo": "MASCULINO", "nascimento": date(1978, 1, 20),
            "escolaridade": "FUNDAMENTAL_INCOMPLETO", "parentesco": "RESPONSAVEL",
        },
        "membros": [
            {"nome_civil": "Ana Beatriz Pereira", "nome_social": "Bia Pereira",
             "sexo": "FEMININO", "nascimento": date(2005, 11, 15),
             "escolaridade": "MEDIO_INCOMPLETO", "parentesco": "FILHO"},
        ],
    },
]


async def seed_families(db: AsyncSession, tenant_id: uuid.UUID) -> int:
    from app.core.br_validators import only_digits
    from app.models.family import Family
    from app.models.person import Person
    from app.models.person_family_membership import PersonFamilyMembership
    from app.services.people import build_person_busca, next_family_codigo

    existing = (
        await db.execute(select(Family).where(Family.tenant_id == tenant_id).limit(1))
    ).scalar_one_or_none()
    if existing:
        return 0

    created = 0
    for fam_data in SEED_FAMILIES:
        codigo = await next_family_codigo(db, tenant_id)
        fam = Family(
            tenant_id=tenant_id, codigo=codigo,
            bairro=fam_data.get("bairro"), territorio=fam_data.get("bairro"),
            logradouro=fam_data.get("logradouro"), numero=fam_data.get("numero"),
            municipio="Nova Esperança", uf="PR",
            faixa_renda=fam_data.get("faixa_renda"),
            no_cadunico=fam_data.get("no_cadunico", False),
            beneficiaria_pbf=fam_data.get("beneficiaria_pbf", False),
            inseguranca_alimentar=fam_data.get("inseguranca_alimentar", False),
            geocode_status="PENDENTE",
        )
        db.add(fam)
        await db.flush()

        rf = fam_data["responsavel"]
        resp = Person(
            tenant_id=tenant_id, nome_civil=rf["nome_civil"],
            nome_social=rf.get("nome_social"),
            busca=build_person_busca(rf["nome_civil"], rf.get("nome_social")),
            cpf=only_digits(rf.get("cpf")) or None,
            nis=only_digits(rf.get("nis")) or None,
            data_nascimento=rf.get("nascimento"), sexo=rf.get("sexo"),
            escolaridade=rf.get("escolaridade"),
        )
        db.add(resp)
        await db.flush()
        fam.responsavel_id = resp.id
        fam.nis_responsavel = resp.nis
        db.add(PersonFamilyMembership(
            tenant_id=tenant_id, person_id=resp.id, family_id=fam.id,
            parentesco="RESPONSAVEL", status="ATIVO", data_entrada=date(2024, 1, 10),
        ))

        for m in fam_data.get("membros", []):
            pessoa = Person(
                tenant_id=tenant_id, nome_civil=m["nome_civil"],
                nome_social=m.get("nome_social"),
                busca=build_person_busca(m["nome_civil"], m.get("nome_social")),
                data_nascimento=m.get("nascimento"), sexo=m.get("sexo"),
                escolaridade=m.get("escolaridade"),
            )
            db.add(pessoa)
            await db.flush()
            db.add(PersonFamilyMembership(
                tenant_id=tenant_id, person_id=pessoa.id, family_id=fam.id,
                parentesco=m.get("parentesco"), status="ATIVO",
                data_entrada=date(2024, 1, 10),
            ))
        created += 1

    await db.commit()
    return created


# ── Prontuário/atendimento de exemplo (FASE 3) ────────────────────
async def seed_prontuarios(db: AsyncSession, tenant_id: uuid.UUID) -> int:
    from datetime import datetime, timezone

    from app.core.encryption import encrypt_text
    from app.models.attendance import Attendance, AttendanceMember
    from app.models.case_file import CaseFile
    from app.models.family import Family
    from app.models.unit import Unit

    existing = (
        await db.execute(
            select(CaseFile).where(CaseFile.tenant_id == tenant_id).limit(1)
        )
    ).scalar_one_or_none()
    if existing:
        return 0

    cras = (
        await db.execute(
            select(Unit).where(Unit.tenant_id == tenant_id, Unit.nome == "CRAS Centro")
        )
    ).scalar_one_or_none()
    fam = (
        await db.execute(
            select(Family)
            .where(Family.tenant_id == tenant_id)
            .order_by(Family.codigo)
            .limit(1)
        )
    ).scalar_one_or_none()
    if not cras or not fam:
        return 0

    prof = (
        await db.execute(
            select(Professional).where(
                Professional.tenant_id == tenant_id, Professional.cpf == "44444444444"
            )
        )
    ).scalar_one_or_none()

    cf = CaseFile(
        tenant_id=tenant_id,
        family_id=fam.id,
        unit_id=cras.id,
        service_type_code="PAIF",
        status="ATIVO",
        acolhida_data=date(2024, 2, 1),
        acolhida_access_form_code="DEMANDA_ESPONTANEA",
        acolhida_motivo="Família buscou o CRAS por insegurança alimentar.",
        acolhida_profissional_id=prof.id if prof else None,
        aberto_em=datetime(2024, 2, 1, tzinfo=timezone.utc),
    )
    db.add(cf)
    await db.flush()

    att = Attendance(
        tenant_id=tenant_id,
        case_file_id=cf.id,
        unit_id=cras.id,
        service_type_code="PAIF",
        data_atendimento=datetime(2024, 2, 1, 10, 0, tzinfo=timezone.utc),
        tipo="FAMILIAR",
        evolution_text_enc=encrypt_text(
            "Acolhida inicial. Encaminhada para inclusão no CadÚnico."
        ),
        sigiloso_reforcado=False,
        registrado_por_id=prof.id if prof else None,
    )
    db.add(att)
    await db.flush()
    if fam.responsavel_id:
        db.add(AttendanceMember(
            tenant_id=tenant_id, attendance_id=att.id, person_id=fam.responsavel_id
        ))
    await db.commit()
    return 1


async def seed_notificacoes_por_papel(db: AsyncSession, tenant_id: uuid.UUID) -> int:
    """Cria notificações de exemplo segmentadas por papel (role_alvo)."""

    existing = await db.scalar(
        select(Notificacao.id).where(
            Notificacao.tenant_id == tenant_id,
            Notificacao.role_alvo.isnot(None),
        ).limit(1),
    )
    if existing:
        return 0

    notificacoes = [
        # ── Gestor Municipal ──
        {
            "role_alvo": "gestor_municipal",
            "titulo": "Relatório Mensal do PAIF disponível",
            "mensagem": "O relatório consolidado de atendimentos do PAIF referente ao mês anterior já está disponível. Acesse o painel de relatórios para conferir os indicadores.",
            "tipo": "SISTEMA",
            "link": "/relatorios",
        },
        {
            "role_alvo": "gestor_municipal",
            "titulo": "Meta de cobertura do CadÚnico: 87%",
            "mensagem": "O município está a 3 pontos percentuais da meta de 90% de cobertura do CadÚnico. Considere intensificar a busca ativa nos bairros com menor cobertura.",
            "tipo": "ALERTA",
            "link": "/relatorios",
        },
        {
            "role_alvo": "gestor_municipal",
            "titulo": "Prazo de prestação de contas se aproxima",
            "mensagem": "O prazo para envio da prestação de contas trimestral ao Conselho Municipal encerra em 15 dias. Verifique os dados pendentes.",
            "tipo": "PRAZO",
            "link": "/relatorios",
        },

        # ── Coordenador de Unidade ──
        {
            "role_alvo": "coordenador_unidade",
            "titulo": "3 encaminhamentos aguardando sua análise",
            "mensagem": "Há encaminhamentos pendentes de triagem há mais de 48h. Revise a fila para garantir o atendimento dentro do prazo.",
            "tipo": "ENCAMINHAMENTO",
            "link": "/atendimentos",
        },
        {
            "role_alvo": "coordenador_unidade",
            "titulo": "Escala de plantão da próxima semana",
            "mensagem": "A escala de plantão para a próxima semana precisa ser preenchida até sexta-feira. Lembre-se de balancear a carga entre os técnicos.",
            "tipo": "AGENDA",
            "link": "/agenda",
        },
        {
            "role_alvo": "coordenador_unidade",
            "titulo": "Nova família em situação de rua cadastrada",
            "mensagem": "Foi registrada uma nova família em situação de rua na área de abrangência do CREAS. priorize o atendimento inicial em até 24h.",
            "tipo": "ALERTA",
            "link": "/familias",
        },

        # ── Técnico Superior ──
        {
            "role_alvo": "tecnico_superior",
            "titulo": "Visita domiciliar agendada para amanhã",
            "mensagem": "Você tem 2 visitas domiciliares agendadas para amanhã às 9h e 14h. Verifique os prontuários antes da saída.",
            "tipo": "AGENDA",
            "link": "/agenda",
        },
        {
            "role_alvo": "tecnico_superior",
            "titulo": "Parecer técnico solicitado pelo CREAS",
            "mensagem": "O CREAS solicitou um parecer técnico para a família Silva. O prazo de resposta é de 5 dias úteis.",
            "tipo": "ENCAMINHAMENTO",
            "link": "/atendimentos",
        },
        {
            "role_alvo": "tecnico_superior",
            "titulo": "BPC protocolado — aguardando perícia",
            "mensagem": "O requerimento de BPC para a Sra. Maria José (idoso, 78 anos) foi protocolado. Acompanhe o agendamento da perícia médica.",
            "tipo": "BENEFICIO",
            "link": "/beneficios",
        },

        # ── Técnico Médio ──
        {
            "role_alvo": "tecnico_medio",
            "titulo": "SCFV: lista de presença do grupo de idosos",
            "mensagem": "A lista de presença do grupo de convivência de idosos da terça-feira precisa ser registrada. São 18 participantes confirmados.",
            "tipo": "AGENDA",
            "link": "/agenda",
        },
        {
            "role_alvo": "tecnico_medio",
            "titulo": "Cadastro de nova família aguardando revisão",
            "mensagem": "O cadastro da família Oliveira (NIS: 123.45678.90-1) está incompleto. Campos obrigatórios pendentes: renda familiar e composição do domicílio.",
            "tipo": "ALERTA",
            "link": "/familias",
        },
        {
            "role_alvo": "tecnico_medio",
            "titulo": "Reavaliação semestral: 12 famílias pendentes",
            "mensagem": "Doze famílias da sua área de referência estão com reavaliação semestral vencida há mais de 15 dias.",
            "tipo": "PRAZO",
            "link": "/familias",
        },

        # ── Recepção ──
        {
            "role_alvo": "recepcao",
            "titulo": "Agenda de atendimentos de hoje cheia",
            "mensagem": "A agenda de hoje está com 14 atendimentos confirmados. Verifique se há documentação pendente para agilizar o acolhimento.",
            "tipo": "AGENDA",
            "link": "/agenda",
        },
        {
            "role_alvo": "recepcao",
            "titulo": "Nova demanda espontânea registrada",
            "mensagem": "Uma nova família chegou por demanda espontânea e aguarda triagem. Certifique-se de coletar documentação básica antes do atendimento.",
            "tipo": "ENCAMINHAMENTO",
            "link": "/atendimentos",
        },
        {
            "role_alvo": "recepcao",
            "titulo": "Atualização do CadÚnico: documentos vencidos",
            "mensagem": "3 famílias agendadas para hoje precisam atualizar documentos vencidos (RG, CPF, comprovante de residência). Avise-as na chegada.",
            "tipo": "ALERTA",
            "link": "/familias",
        },

        # ── Vigilância Socioassistencial ──
        {
            "role_alvo": "vigilancia",
            "titulo": "Alerta de território: aumento de violações",
            "mensagem": "O bairro Jardim Esperança registrou aumento de 40% em notificações de violação de direitos no último trimestre. Recomenda-se diagnóstico territorial.",
            "tipo": "ALERTA",
            "link": "/relatorios",
        },
        {
            "role_alvo": "vigilancia",
            "titulo": "Indicadores de vulnerabilidade atualizados",
            "mensagem": "Os indicadores de vulnerabilidade territorial do município foram atualizados com dados do Censo 2024. Acesse o painel de vigilância.",
            "tipo": "SISTEMA",
            "link": "/relatorios",
        },
        {
            "role_alvo": "vigilancia",
            "titulo": "Mapeamento de rede: nova entidade cadastrada",
            "mensagem": "Uma nova entidade socioassistencial foi cadastrada na rede. Atualize o mapeamento da rede no sistema.",
            "tipo": "SISTEMA",
            "link": "/configuracao",
        },

        # ── ADMIN ──
        {
            "role_alvo": "ADMIN",
            "titulo": "Atualização de segurança: versão 3.2.1",
            "mensagem": "Uma nova versão do sistema foi implantada com correções de segurança (LGPD) e melhorias de desempenho. Veja as notas de versão.",
            "tipo": "SISTEMA",
            "link": "/configuracao",
        },
        {
            "role_alvo": "ADMIN",
            "titulo": "Backup automático concluído com sucesso",
            "mensagem": "O backup diário da base de dados foi concluído às 03:14. Tamanho: 2.4 GB. Nenhum erro detectado.",
            "tipo": "SISTEMA",
        },
        {
            "role_alvo": "ADMIN",
            "titulo": "Usuário inativo há 90 dias: joao.silva",
            "mensagem": "O usuário João Silva (técnico_medio, CRAS Central) está sem atividade há 90 dias. Considere revisar o acesso.",
            "tipo": "ALERTA",
            "link": "/configuracao",
        },
    ]

    agora = datetime.utcnow()
    contador = 0
    for n in notificacoes:
        db.add(Notificacao(
            tenant_id=tenant_id,
            user_id=uuid.UUID("00000000-0000-0000-0000-000000000000"),  # role-based: sem user específico
            titulo=n["titulo"],
            mensagem=n.get("mensagem"),
            tipo=n["tipo"],
            role_alvo=n["role_alvo"],
            link=n.get("link"),
            entity_type="seed",
            created_at=agora,
            updated_at=agora,
        ))
        contador += 1

    await db.commit()
    return contador


async def run_all_seeds(db: AsyncSession) -> dict:
    return await seed_nova_esperanca(db)
