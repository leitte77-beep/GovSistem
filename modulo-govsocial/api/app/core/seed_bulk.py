"""Seed em massa: município "Nova Esperança" com 200 famílias realistas,
CRAS, CREAS, SEDE, profissionais, prontuários e atendimentos.

Utilize este seed para desenvolvimento e testes de carga/interface.
Segue os mesmos padrões de seeds.py (idempotente por tenant_id).
"""
# ruff: noqa: E501

import random
import uuid
from datetime import date, datetime, timezone

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.encryption import encrypt_text
from app.models.acompanhamento import Acompanhamento
from app.models.attendance import Attendance, AttendanceMember
from app.models.case_file import CaseFile
from app.models.family import Family
from app.models.person import Person
from app.models.person_family_membership import PersonFamilyMembership
from app.models.professional import Professional
from app.models.professional_assignment import ProfessionalAssignment
from app.models.unit import Unit
from app.services.people import build_person_busca, next_family_codigo

# ── Dados sintéticos ────────────────────────────────────────────────────────

PRIMEIROS_NOMES_MASC = [
    "José", "João", "Antônio", "Francisco", "Carlos", "Paulo", "Pedro", "Lucas",
    "Marcos", "Luiz", "Manoel", "Raimundo", "Sebastião", "Jorge", "André",
    "Rafael", "Gabriel", "Miguel", "Felipe", "Bruno", "Mateus", "Daniel",
    "Thiago", "Gustavo", "Leonardo", "Eduardo", "Fernando", "Ricardo",
    "Alexandre", "Cristiano", "Roberto", "Sérgio", "Cláudio", "Márcio",
    "Wesley", "Adriano", "Renato", "Fábio", "Anderson", "Leandro",
]

PRIMEIROS_NOMES_FEM = [
    "Maria", "Ana", "Francisca", "Adriana", "Juliana", "Márcia", "Fernanda",
    "Patrícia", "Aline", "Sandra", "Camila", "Bruna", "Jéssica", "Amanda",
    "Larissa", "Carla", "Tatiane", "Débora", "Raquel", "Luciana", "Priscila",
    "Bianca", "Letícia", "Daniela", "Cristina", "Renata", "Vanessa", "Simone",
    "Andréa", "Elaine", "Isabela", "Natália", "Lúcia", "Teresa", "Helena",
    "Regina", "Cláudia", "Vera", "Carolina", "Rita",
]

SOBRENOMES = [
    "Silva", "Santos", "Oliveira", "Souza", "Lima", "Pereira", "Costa",
    "Ferreira", "Rodrigues", "Almeida", "Nascimento", "Araújo", "Barbosa",
    "Cardoso", "Ribeiro", "Carvalho", "Gomes", "Martins", "Cavalcanti",
    "Dias", "Moreira", "Teixeira", "Nunes", "Machado", "Lopes", "Rocha",
    "Monteiro", "Mendes", "Vieira", "Correia", "Pinto", "Freitas",
    "Cruz", "Melo", "Borges", "Viana", "Macedo", "Pedrosa", "Guedes", "Ramos",
]

BAIRROS = [
    "Centro", "Vila Nova", "Jardim América", "São Francisco", "Boa Vista",
    "Santa Terezinha", "Bela Vista", "Vila Esperança", "Nova Esperança",
    "Alvorada", "Industrial", "Primavera", "Santo Antônio", "Vila Maria",
]

LOGRADOUROS = [
    "Rua das Acácias", "Rua São Paulo", "Avenida Brasil", "Rua 7 de Setembro",
    "Travessa São João", "Rua Floriano Peixoto", "Rua XV de Novembro",
    "Avenida dos Pioneiros", "Rua Goiás", "Rua Paraná", "Rua Minas Gerais",
    "Rua Bahia", "Rua Santa Catarina", "Rua Mato Grosso", "Rua Amazonas",
    "Travessa Boa Vista", "Avenida Central", "Rua dos Ipês", "Rua do Comércio",
    "Rua Joaquim Nabuco", "Rua Castro Alves", "Rua Dom Pedro II",
]

FAIXAS_RENDA = ["EXTREMA_POBREZA", "POBREZA", "BAIXA_RENDA", "ACIMA_MEIO_SM"]
FAIXA_PESOS = [0.20, 0.30, 0.35, 0.15]

PARENTESCOS_DEPENDENTES = [
    "FILHO", "FILHO", "FILHO", "FILHO", "FILHO",
    "ENTEADO", "NETO", "IRMAO", "CONJUGE", "OUTRO",
]

ESCOLARIDADES = [
    "NAO_ALFABETIZADO", "FUNDAMENTAL_INCOMPLETO", "FUNDAMENTAL_COMPLETO",
    "MEDIO_INCOMPLETO", "MEDIO_COMPLETO", "SUPERIOR_INCOMPLETO",
    "SUPERIOR_COMPLETO",
]

PROF_CRAS_FUNCOES = [
    ("Assistente Social", "CRESS", "Técnica de referência"),
    ("Psicóloga", "CRP", "Técnica de referência"),
    ("Educador Social", None, "Oficineiro"),
    ("Orientador Social", None, "Orientador"),
    ("Técnico Administrativo", None, "Apoio administrativo"),
]

PROF_CREAS_FUNCOES = [
    ("Assistente Social", "CRESS", "Técnica de referência"),
    ("Psicólogo", "CRP", "Técnico de referência"),
    ("Educador Social", None, "Abordagem social"),
]

PROF_SEDE_FUNCOES = [
    ("Gestor Municipal", None, "Secretário(a)"),
    ("Vigilância Socioassistencial", None, "Analista"),
]

PROF_CONFIANCA = [
    ("Marina Rocha Teixeira", "87429856087", "Marina Rocha", "CRESS", "11223"),
    ("Ricardo Alves Mendes", "13542658050", "Ricardo Alves", "CRP", "44556"),
    ("Sandra Moura Pinto", "74905832019", "Sandra Moura", None, None),
    ("César Nogueira Dias", "60213374033", "César Nogueira", None, None),
    ("Lúcia Farias Cardoso", "98123765007", "Lúcia Farias", None, None),
    ("Fernando Gomes Barbosa", "21387546044", "Fernando Gomes", "CRESS", "78901"),
    ("Patrícia Nunes Costa", "56704321089", "Patrícia Nunes", "CRP", "23456"),
    ("Henrique Lima Vieira", "34082971015", "Henrique Lima", None, None),
    ("Clarice Bastos Rocha", "72631498049", "Clarice Bastos", "CRESS", "34567"),
    ("Otávio Martins Cruz", "45893021067", "Otávio Martins", None, None),
    ("Isadora Vieira Santos", "69481203075", "Isadora Vieira", "CRP", "11234"),
    ("Túlio Rezende Almeida", "51724683019", "Túlio Rezende", None, None),
    ("Marta Silveira Lopes", "83210756098", "Marta Silveira", None, None),
    ("Júlio César Nunes", "25964371084", "Júlio César", None, None),
    ("Dora Cavalcanti Reis", "37102549063", "Dora Cavalcanti", None, None),
]


# ── Helpers ─────────────────────────────────────────────────────────────────

def _gerar_cpf_valido() -> str:
    """Gera um CPF com dígitos verificadores corretos."""
    base = [random.randint(0, 9) for _ in range(9)]
    d1 = sum(base[i] * (10 - i) for i in range(9)) % 11
    d1 = 0 if d1 < 2 else 11 - d1
    d2 = sum(base[i] * (11 - i) for i in range(9)) + d1 * 2
    d2 = d2 % 11
    d2 = 0 if d2 < 2 else 11 - d2
    return "".join(str(d) for d in base) + str(d1) + str(d2)


def _gerar_nis_valido() -> str:
    """Gera um NIS/PIS com dígito verificador correto."""
    base = [random.randint(0, 9) for _ in range(10)]
    pesos = [3, 2, 9, 8, 7, 6, 5, 4, 3, 2]
    soma = sum(base[i] * pesos[i] for i in range(10))
    resto = soma % 11
    dv = 0 if resto < 2 else 11 - resto
    return "".join(str(d) for d in base) + str(dv)


def _nome_aleatorio(sexo: str) -> str:
    primeiro = (
        random.choice(PRIMEIROS_NOMES_FEM) if sexo == "FEMININO"
        else random.choice(PRIMEIROS_NOMES_MASC)
    )
    sobrenome1 = random.choice(SOBRENOMES)
    sobrenome2 = random.choice(SOBRENOMES)
    return f"{primeiro} {sobrenome1} {sobrenome2}"


def _nascimento_aleatorio(idade_min: int = 0, idade_max: int = 80) -> date:
    ano = random.randint(2025 - idade_max, 2025 - idade_min)
    mes = random.randint(1, 12)
    dia = random.randint(1, 28)
    return date(ano, mes, dia)


# ── Seed principal ──────────────────────────────────────────────────────────

async def seed_bulk_municipio(db: AsyncSession, tenant_id: uuid.UUID) -> dict:
    """Gera um município completo com 200 famílias, unidades, profissionais e
    prontuários de exemplo. Idempotente: se já existirem famílias para este
    tenant, não duplica."""

    existing = (
        await db.execute(
            select(Family).where(Family.tenant_id == tenant_id).limit(1)
        )
    ).scalar_one_or_none()
    if existing:
        return {"skipped": True, "reason": "tenant já possui famílias"}

    # 1. Unidades (2 CRAS, 1 CREAS, 1 SEDE)
    cras_centro = Unit(
        tenant_id=tenant_id, tipo="CRAS", nome="CRAS Centro",
        municipio="Nova Esperança", uf="PR", bairro="Centro",
        logradouro="Rua XV de Novembro", numero="350",
        territorios=["Centro", "Bela Vista", "Santa Terezinha", "Alvorada"],
        is_active=True,
    )
    cras_vila = Unit(
        tenant_id=tenant_id, tipo="CRAS", nome="CRAS Vila Nova",
        municipio="Nova Esperança", uf="PR", bairro="Vila Nova",
        logradouro="Avenida dos Pioneiros", numero="1200",
        territorios=[
            "Vila Nova", "Jardim América", "São Francisco", "Industrial",
            "Primavera", "Santo Antônio",
        ],
        is_active=True,
    )
    creas = Unit(
        tenant_id=tenant_id, tipo="CREAS", nome="CREAS Municipal",
        municipio="Nova Esperança", uf="PR", bairro="Centro",
        logradouro="Rua Goiás", numero="88",
        territorios=[
            "Centro", "Vila Nova", "Jardim América", "São Francisco",
            "Bela Vista", "Santa Terezinha", "Boa Vista", "Vila Esperança",
            "Nova Esperança", "Alvorada", "Industrial", "Primavera",
            "Santo Antônio", "Vila Maria",
        ],
        is_active=True,
    )
    sede = Unit(
        tenant_id=tenant_id, tipo="SEDE", nome="Secretaria de Assistência Social",
        municipio="Nova Esperança", uf="PR", bairro="Centro",
        logradouro="Avenida Brasil", numero="50",
        territorios=None,
        is_active=True,
    )

    for u in [cras_centro, cras_vila, creas, sede]:
        db.add(u)
    await db.flush()


    # 2. Profissionais
    profs: dict[str, Professional] = {}

    for i, (funcao, conselho_tipo, funcao_local) in enumerate(PROF_CRAS_FUNCOES):
        nome_origem, cpf, nome_civil, _, _ = PROF_CONFIANCA[i]
        prof = Professional(
            tenant_id=tenant_id, nome=nome_civil, cpf=cpf,
            funcao_nob_rh=funcao,
            conselho_classe_tipo=conselho_tipo,
            conselho_classe_numero=str(random.randint(1000, 99999)) if conselho_tipo else None,
            is_active=True,
        )
        db.add(prof)
        await db.flush()
        db.add(ProfessionalAssignment(
            tenant_id=tenant_id, professional_id=prof.id,
            unit_id=cras_centro.id,
            funcao_no_local=funcao_local,
            data_inicio=date(2024, 1, 10),
        ))
        key = f"cras_centro_{i}"
        profs[key] = prof

    for i, (funcao, conselho_tipo, funcao_local) in enumerate(PROF_CRAS_FUNCOES):
        nome_origem, cpf, nome_civil, _, _ = PROF_CONFIANCA[5 + i]
        prof = Professional(
            tenant_id=tenant_id, nome=nome_civil, cpf=cpf,
            funcao_nob_rh=funcao,
            conselho_classe_tipo=conselho_tipo,
            conselho_classe_numero=str(random.randint(1000, 99999)) if conselho_tipo else None,
            is_active=True,
        )
        db.add(prof)
        await db.flush()
        db.add(ProfessionalAssignment(
            tenant_id=tenant_id, professional_id=prof.id,
            unit_id=cras_vila.id,
            funcao_no_local=funcao_local,
            data_inicio=date(2024, 2, 1),
        ))
        key = f"cras_vila_{i}"
        profs[key] = prof

    for i, (funcao, conselho_tipo, funcao_local) in enumerate(PROF_CREAS_FUNCOES):
        nome_origem, cpf, nome_civil, _, _ = PROF_CONFIANCA[10 + i]
        prof = Professional(
            tenant_id=tenant_id, nome=nome_civil, cpf=cpf,
            funcao_nob_rh=funcao,
            conselho_classe_tipo=conselho_tipo,
            conselho_classe_numero=str(random.randint(1000, 99999)) if conselho_tipo else None,
            is_active=True,
        )
        db.add(prof)
        await db.flush()
        db.add(ProfessionalAssignment(
            tenant_id=tenant_id, professional_id=prof.id,
            unit_id=creas.id,
            funcao_no_local=funcao_local,
            data_inicio=date(2024, 1, 5),
        ))
        key = f"creas_{i}"
        profs[key] = prof

    for i, (funcao, _, funcao_local) in enumerate(PROF_SEDE_FUNCOES):
        nome_origem, cpf, nome_civil, _, _ = PROF_CONFIANCA[13 + i]
        prof = Professional(
            tenant_id=tenant_id, nome=nome_civil, cpf=cpf,
            funcao_nob_rh=funcao,
            conselho_classe_tipo=None,
            conselho_classe_numero=None,
            is_active=True,
        )
        db.add(prof)
        await db.flush()
        db.add(ProfessionalAssignment(
            tenant_id=tenant_id, professional_id=prof.id,
            unit_id=sede.id,
            funcao_no_local=funcao_local,
            data_inicio=date(2024, 3, 1),
        ))
        key = f"sede_{i}"
        profs[key] = prof

    await db.flush()

    # 3. Famílias e pessoas
    familias_criadas = []
    total_pessoas = 0

    # Shuffle bairros across the 14 bairros so they're distributed
    bairros_dist = []
    for i in range(200):
        bairros_dist.append(BAIRROS[i % len(BAIRROS)])
    random.shuffle(bairros_dist)

    for idx in range(200):
        codigo = await next_family_codigo(db, tenant_id)

        bairro = bairros_dist[idx]
        faixa = random.choices(FAIXAS_RENDA, weights=FAIXA_PESOS, k=1)[0]
        pbf = random.random() < 0.30
        bpc = random.random() < 0.05
        no_cad = random.random() < 0.15
        inseg = random.random() < 0.18

        sexo_resp = random.choice(["FEMININO", "MASCULINO"])
        nome_resp = _nome_aleatorio(sexo_resp)
        cpf_resp = _gerar_cpf_valido()
        nis_resp = _gerar_nis_valido() if random.random() < 0.85 else None
        nasc_resp = _nascimento_aleatorio(18, 70)
        esc_resp = random.choice([
            "FUNDAMENTAL_INCOMPLETO", "FUNDAMENTAL_COMPLETO",
            "MEDIO_INCOMPLETO", "MEDIO_COMPLETO", "SUPERIOR_INCOMPLETO",
        ])

        fam = Family(
            tenant_id=tenant_id, codigo=codigo,
            bairro=bairro, territorio=bairro,
            logradouro=random.choice(LOGRADOUROS),
            numero=str(random.randint(1, 2000)),
            municipio="Nova Esperança", uf="PR",
            faixa_renda=faixa,
            no_cadunico=no_cad,
            beneficiaria_pbf=pbf,
            possui_bpc=bpc,
            inseguranca_alimentar=inseg,
            geocode_status="PENDENTE",
        )
        db.add(fam)
        await db.flush()

        resp = Person(
            tenant_id=tenant_id,
            nome_civil=nome_resp,
            busca=build_person_busca(nome_resp, None),
            cpf=cpf_resp,
            nis=nis_resp,
            data_nascimento=nasc_resp,
            sexo=sexo_resp,
            escolaridade=esc_resp,
        )
        db.add(resp)
        await db.flush()

        fam.responsavel_id = resp.id
        fam.nis_responsavel = resp.nis

        db.add(PersonFamilyMembership(
            tenant_id=tenant_id, person_id=resp.id, family_id=fam.id,
            parentesco="RESPONSAVEL", status="ATIVO",
            data_entrada=date(2024, 1, 1),
        ))

        total_pessoas += 1

        # Membros dependentes (1 a 5)
        num_membros = random.choices([1, 2, 3, 4, 5], weights=[0.30, 0.30, 0.25, 0.10, 0.05], k=1)[0]

        for _ in range(num_membros):
            sexo_m = random.choice(["MASCULINO", "FEMININO"])
            nome_m = _nome_aleatorio(sexo_m)
            nasc_m = _nascimento_aleatorio(0, 60)
            esc_m = (
                "NAO_ALFABETIZADO" if (2025 - nasc_m.year) < 6
                else random.choice(ESCOLARIDADES)
            )
            parentesco = random.choice(PARENTESCOS_DEPENDENTES)

            pessoa = Person(
                tenant_id=tenant_id,
                nome_civil=nome_m,
                busca=build_person_busca(nome_m, None),
                data_nascimento=nasc_m,
                sexo=sexo_m,
                escolaridade=esc_m,
            )
            db.add(pessoa)
            await db.flush()

            db.add(PersonFamilyMembership(
                tenant_id=tenant_id, person_id=pessoa.id, family_id=fam.id,
                parentesco=parentesco, status="ATIVO",
                data_entrada=date(2024, 1, 1),
            ))
            total_pessoas += 1

        familias_criadas.append(fam)

    await db.flush()

    # 4. Prontuários e Atendimentos para 30 famílias (~15%)
    random.shuffle(familias_criadas)
    familias_com_prontuario = familias_criadas[:30]

    profs_lista_cras_centro = [profs[f"cras_centro_{i}"] for i in range(5)]
    profs_lista_cras_vila = [profs[f"cras_vila_{i}"] for i in range(5)]
    profs_lista_creas = [profs[f"creas_{i}"] for i in range(3)]

    acomp_paif = "Acolhida PAIF. Família em acompanhamento sistemático com dados de vulnerabilidade verificados."
    acomp_creas = "Família encaminhada pelo PAIF para acompanhamento especializado. Violação de direitos identificada."

    motivos_atendimento = [
        "Família buscou o CRAS por insegurança alimentar.",
        "Encaminhamento da unidade de saúde por vulnerabilidade social.",
        "Busca ativa do território. Família em situação de extrema pobreza.",
        "Demanda espontânea para atualização cadastral e orientação sobre benefícios.",
        "Encaminhamento do Conselho Tutelar para acompanhamento familiar.",
        "Busca de informações sobre o Programa Bolsa Família.",
        "Família em situação de rua, encaminhada pela Abordagem Social.",
        "Demanda por Benefício de Prestação Continuada (BPC).",
        "Encaminhamento escolar por evasão e negligência.",
        "Solicitação de cesta básica e documentação civil.",
    ]

    datetime.now(timezone.utc)
    casos_abertos = 0
    atendimentos_criados = 0

    for i, fam in enumerate(familias_com_prontuario):
        is_paefi = i < 5  # 5 PAEFI no CREAS
        if is_paefi:
            unit = creas
            service = "PAEFI"
            prof_assigned = random.choice(profs_lista_creas)
            motivo = "Encaminhamento do CRAS por violação de direitos."
        elif i < 20:
            unit = cras_centro
            service = "PAIF"
            prof_assigned = random.choice(profs_lista_cras_centro)
            motivo = random.choice(motivos_atendimento)
        else:
            unit = cras_vila
            service = "PAIF"
            prof_assigned = random.choice(profs_lista_cras_vila)
            motivo = random.choice(motivos_atendimento)

        random.randint(1, 500)
        # keep it simple: random date in 2024
        dia = random.randint(1, 540)
        data_acolhida = date(2024 + (dia // 365), (dia % 12) + 1, (dia % 28) + 1)
        aberto_dt = datetime(
            data_acolhida.year, data_acolhida.month, data_acolhida.day,
            tzinfo=timezone.utc,
        )

        cf = CaseFile(
            tenant_id=tenant_id,
            family_id=fam.id,
            unit_id=unit.id,
            service_type_code=service,
            status="ATIVO",
            acolhida_data=data_acolhida,
            acolhida_access_form_code="DEMANDA_ESPONTANEA" if random.random() < 0.6 else "BUSCA_ATIVA",
            acolhida_motivo=motivo,
            acolhida_profissional_id=prof_assigned.id,
            aberto_em=aberto_dt,
        )
        db.add(cf)
        await db.flush()
        casos_abertos += 1

        # Acompanhamento sistemático para todos
        db.add(Acompanhamento(
            tenant_id=tenant_id,
            case_file_id=cf.id,
            tipo=service,
            data_inicio=data_acolhida,
            situacao="ATIVO",
            profissional_responsavel_id=prof_assigned.id,
            observacoes=acomp_paif if service == "PAIF" else acomp_creas,
        ))

        # 1 a 3 attendances por prontuário
        num_att = random.choices([1, 2, 3], weights=[0.5, 0.35, 0.15], k=1)[0]
        for j in range(num_att):
            att_data = datetime(
                data_acolhida.year, data_acolhida.month,
                min(data_acolhida.day + j * 30, 28),
                10 + j, 0, tzinfo=timezone.utc,
            )

            att = Attendance(
                tenant_id=tenant_id,
                case_file_id=cf.id,
                unit_id=unit.id,
                service_type_code=service,
                data_atendimento=att_data,
                tipo="FAMILIAR",
                evolution_text_enc=encrypt_text(
                    f"Atendimento #{j + 1} — {motivo} "
                    f"Evolução: família acompanhada, orientações prestadas."
                ),
                sigiloso_reforcado=False,
                registrado_por_id=prof_assigned.id,
            )
            db.add(att)
            await db.flush()

            if fam.responsavel_id:
                db.add(AttendanceMember(
                    tenant_id=tenant_id,
                    attendance_id=att.id,
                    person_id=fam.responsavel_id,
                ))
            atendimentos_criados += 1

    await db.commit()

    return {
        "familias": 200,
        "pessoas": total_pessoas,
        "profissionais": len(profs),
        "unidades": 4,
        "prontuarios": casos_abertos,
        "atendimentos": atendimentos_criados,
        "acompanhamentos": casos_abertos,
    }
