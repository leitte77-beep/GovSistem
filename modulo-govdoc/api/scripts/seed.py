"""Carga inicial de desenvolvimento do GovDoc.

Cria a instituição, secretarias, setores, categorias, políticas de retenção,
o agendamento de backup e usuários de referência. O login não usa mais senha
local: a identidade vem da plataforma SaaS (GovSistem) e é provisionada
just-in-time no primeiro acesso. Idempotente: rodar de novo não duplica nada.

Uso:
    python -m scripts.seed
"""

import asyncio
import sys

from sqlalchemy import select

from app.core.config import settings
from app.core.database import async_session
from app.models.enums import Classification, Profile
from app.models.governance import BackupJob, RetentionPolicy
from app.models.organization import Department, Institution, Secretariat
from app.models.taxonomy import Category, CategoryField
from app.models.user import User
from app.services import folders as folder_service
from app.services.provisioning import PLACEHOLDER_PASSWORD_HASH

SECRETARIAS = [
    ("Administração", "ADM", "#1e40af", "building"),
    ("Saúde", "SMS", "#0f766e", "heart-pulse"),
    ("Educação", "SME", "#b45309", "graduation-cap"),
    ("Assistência Social", "SMAS", "#7c3aed", "hand-heart"),
    ("Obras", "SMO", "#b91c1c", "hard-hat"),
    ("Agricultura", "SMA", "#15803d", "sprout"),
    ("Tecnologia da Informação", "TI", "#0369a1", "cpu"),
]

SETORES = {
    "ADM": ["Departamento Administrativo", "Recursos Humanos", "Licitações", "Contabilidade"],
    "SMS": ["Departamento Administrativo", "Unidade de Saúde", "Vigilância Sanitária"],
    "SME": ["Departamento Administrativo", "Merenda Escolar", "Transporte Escolar"],
    "SMAS": ["CRAS", "CREAS", "Departamento Administrativo"],
    "SMO": ["Engenharia", "Fiscalização de Obras"],
    "SMA": ["Fomento Rural", "Patrulha Agrícola"],
    "TI": ["Infraestrutura", "Sistemas"],
}

CATEGORIAS = [
    ("Contratos", "file-signature", "#1e40af", [
        ("numero_contrato", "Número do contrato", "texto", True),
        ("empresa", "Empresa", "texto", True),
        ("cnpj", "CNPJ", "cnpj", True),
        ("objeto", "Objeto", "texto_longo", True),
        ("valor", "Valor", "moeda", True),
        ("data_inicial", "Data inicial", "data", True),
        ("data_final", "Data final", "data", True),
        ("fiscal", "Fiscal do contrato", "texto", False),
        ("gestor", "Gestor do contrato", "texto", False),
        ("situacao", "Situação", "selecao", False),
    ]),
    ("Convênios", "handshake", "#0f766e", [
        ("numero_convenio", "Número do convênio", "texto", True),
        ("concedente", "Concedente", "texto", True),
        ("valor", "Valor", "moeda", False),
        ("vigencia_final", "Vigência final", "data", True),
    ]),
    ("Licitações", "gavel", "#7c3aed", [
        ("modalidade", "Modalidade", "selecao", True),
        ("numero_processo", "Número do processo", "texto", True),
    ]),
    ("Ofícios", "mail", "#0369a1", []),
    ("Memorandos", "sticky-note", "#64748b", []),
    ("Portarias", "scroll", "#b45309", []),
    ("Decretos", "landmark", "#b91c1c", []),
    ("Leis", "scale", "#15803d", []),
    ("Notas fiscais", "receipt", "#ca8a04", [
        ("numero_nota", "Número da nota", "texto", True),
        ("fornecedor", "Fornecedor", "texto", True),
        ("valor", "Valor", "moeda", True),
    ]),
    ("Relatórios", "bar-chart", "#0891b2", []),
    ("Projetos", "folder-kanban", "#4f46e5", []),
    ("Processos administrativos", "folder-open", "#334155", []),
    ("Documentos de servidores", "user-round", "#be185d", []),
    ("Documentação técnica", "book", "#0f172a", []),
    ("Certidões", "badge-check", "#059669", [
        ("orgao_emissor", "Órgão emissor", "texto", False),
        ("validade", "Validade", "data", True),
    ]),
    ("Licenças", "shield-check", "#d97706", [("validade", "Validade", "data", True)]),
    ("Imagens", "image", "#6366f1", []),
    ("Vídeos", "video", "#8b5cf6", []),
    ("Manuais", "book-open", "#0284c7", []),
    ("Backups", "database", "#475569", []),
]

USUARIOS = [
    ("Administrador Geral", "admin@govdoc.local", Profile.ADMIN_GERAL, None, None),
    ("Ana Administradora", "admin.saude@govdoc.local", Profile.ADMIN_SECRETARIA, "SMS", None),
    ("Carlos Gestor", "gestor.saude@govdoc.local", Profile.GESTOR_SETOR, "SMS", "Departamento Administrativo"),
    ("Beatriz Colaboradora", "colaborador.saude@govdoc.local", Profile.COLABORADOR, "SMS", "Departamento Administrativo"),
    ("Lucas Leitor", "leitor.saude@govdoc.local", Profile.LEITOR, "SMS", "Departamento Administrativo"),
    ("Marta Auditora", "auditor@govdoc.local", Profile.AUDITOR, None, None),
]

PASTAS_PADRAO = ["Contratos", "Notas fiscais", "Ofícios", "Relatórios"]


async def _get_or_create_institution(db) -> Institution:
    institution = await db.scalar(select(Institution).where(Institution.slug == "prefeitura"))
    if institution is None:
        institution = Institution(
            name="Prefeitura Municipal",
            slug="prefeitura",
            primary_color="#1e40af",
            accent_color="#facc15",
            storage_limit_bytes=200 * 1024 * 1024 * 1024,
        )
        db.add(institution)
        await db.flush()
        print("  • Instituição criada: Prefeitura Municipal")
    return institution


async def _seed() -> None:
    if settings.is_production:
        print("ERRO: a carga de desenvolvimento não deve ser executada em produção.")
        sys.exit(1)

    async with async_session() as db:
        institution = await _get_or_create_institution(db)

        # ── Secretarias e setores ────────────────────────────────────────────
        secretarias = {}
        for nome, sigla, cor, icone in SECRETARIAS:
            item = await db.scalar(
                select(Secretariat).where(
                    Secretariat.institution_id == institution.id,
                    Secretariat.acronym == sigla,
                )
            )
            if item is None:
                item = Secretariat(
                    institution_id=institution.id,
                    name=nome,
                    acronym=sigla,
                    color=cor,
                    icon=icone,
                    description=f"Secretaria Municipal de {nome}",
                )
                db.add(item)
                await db.flush()
            secretarias[sigla] = item

        setores = {}
        for sigla, nomes in SETORES.items():
            for nome in nomes:
                chave = (sigla, nome)
                item = await db.scalar(
                    select(Department).where(
                        Department.secretariat_id == secretarias[sigla].id,
                        Department.name == nome,
                    )
                )
                if item is None:
                    item = Department(
                        institution_id=institution.id,
                        secretariat_id=secretarias[sigla].id,
                        name=nome,
                    )
                    db.add(item)
                    await db.flush()
                setores[chave] = item

        # ── Usuários de referência (sem senha: o login é da plataforma SaaS) ─
        for nome, email, perfil, sigla, setor in USUARIOS:
            user = await db.scalar(select(User).where(User.email == email))
            if user is not None:
                continue
            db.add(
                User(
                    institution_id=institution.id,
                    name=nome,
                    email=email,
                    password_hash=PLACEHOLDER_PASSWORD_HASH,
                    profile=perfil.value,
                    secretariat_id=secretarias[sigla].id if sigla else None,
                    department_id=setores[(sigla, setor)].id if setor else None,
                    external_subject=f"dev-{email.split('@')[0]}",
                )
            )
        await db.flush()

        admin = await db.scalar(select(User).where(User.email == "admin@govdoc.local"))

        # ── Categorias e campos ──────────────────────────────────────────────
        for nome, icone, cor, campos in CATEGORIAS:
            slug = nome.lower().replace(" ", "-").replace("ç", "c").replace("õ", "o")
            categoria = await db.scalar(
                select(Category).where(
                    Category.institution_id == institution.id, Category.slug == slug
                )
            )
            if categoria is not None:
                continue
            categoria = Category(
                institution_id=institution.id,
                name=nome,
                slug=slug,
                icon=icone,
                color=cor,
                created_by_id=admin.id if admin else None,
            )
            db.add(categoria)
            await db.flush()
            for posicao, (chave, rotulo, tipo, obrigatorio) in enumerate(campos):
                db.add(
                    CategoryField(
                        category_id=categoria.id,
                        key=chave,
                        label=rotulo,
                        field_type=tipo,
                        required=obrigatorio,
                        position=posicao,
                    )
                )

        # ── Políticas de retenção ────────────────────────────────────────────
        for nome, dias, descricao in [
            ("Contratos — 10 anos", 3650, "Guarda mínima de contratos e aditivos."),
            ("Notas fiscais — 5 anos", 1825, "Prazo fiscal padrão."),
            ("Documentos correntes — 2 anos", 730, "Documentos administrativos comuns."),
        ]:
            existe = await db.scalar(
                select(RetentionPolicy).where(
                    RetentionPolicy.institution_id == institution.id,
                    RetentionPolicy.name == nome,
                )
            )
            if existe is None:
                db.add(
                    RetentionPolicy(
                        institution_id=institution.id,
                        name=nome,
                        description=descricao,
                        retain_days=dias,
                    )
                )

        # ── Pastas iniciais por secretaria ───────────────────────────────────
        if admin is not None:
            for sigla, secretaria in secretarias.items():
                raiz = await db.scalar(
                    select(__import__("app.models.folder", fromlist=["Folder"]).Folder).where(
                        __import__("app.models.folder", fromlist=["Folder"]).Folder.name
                        == secretaria.name,
                        __import__("app.models.folder", fromlist=["Folder"]).Folder.parent_id.is_(
                            None
                        ),
                    )
                )
                if raiz is not None:
                    continue
                raiz = await folder_service.create_folder(
                    db,
                    user=admin,
                    name=secretaria.name,
                    secretariat_id=secretaria.id,
                    color=secretaria.color,
                    icon=secretaria.icon,
                    classification=Classification.INTERNO.value,
                    description=f"Repositório da {secretaria.name}",
                )
                for nome_setor in SETORES.get(sigla, []):
                    setor = setores[(sigla, nome_setor)]
                    pasta_setor = await folder_service.create_folder(
                        db,
                        user=admin,
                        name=nome_setor,
                        parent_id=raiz.id,
                        secretariat_id=secretaria.id,
                        department_id=setor.id,
                    )
                    for padrao in PASTAS_PADRAO:
                        await folder_service.create_folder(
                            db,
                            user=admin,
                            name=padrao,
                            parent_id=pasta_setor.id,
                            secretariat_id=secretaria.id,
                            department_id=setor.id,
                        )

        # ── Agendamento de backup ────────────────────────────────────────────
        job = await db.scalar(
            select(BackupJob).where(BackupJob.institution_id == institution.id)
        )
        if job is None and settings.BACKUP_DESTINATION:
            db.add(
                BackupJob(
                    institution_id=institution.id,
                    name="Backup diário",
                    backup_type="full",
                    schedule_cron=settings.BACKUP_SCHEDULE,
                    destination=settings.BACKUP_DESTINATION,
                    retention_daily=settings.BACKUP_RETENTION_DAILY,
                    retention_weekly=settings.BACKUP_RETENTION_WEEKLY,
                    retention_monthly=settings.BACKUP_RETENTION_MONTHLY,
                    created_by_id=admin.id if admin else None,
                )
            )

        await db.commit()

    print("\n  Carga inicial concluída.\n")
    print(
        "  Usuários de referência foram criados sem senha local — o acesso é feito\n"
        "  pela plataforma GovSistem (login único). Em desenvolvimento, habilite\n"
        "  ENABLE_DEV_SAAS_AUTH=true e entre pela tela de login.\n"
    )


def main() -> None:
    asyncio.run(_seed())


if __name__ == "__main__":
    main()
