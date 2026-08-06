"""Seed data for initial GovTask system setup with rich example data."""

import uuid
from datetime import datetime, timedelta, timezone
from decimal import Decimal
from typing import List

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.security import hash_password
from app.models.base import SoftDeleteMixin
from app.models.organization import Organization
from app.models.role import Role
from app.models.setor import Setor
from app.models.user import User
from app.models.user_role import UserRole
from app.models.convenio import Convenio
from app.models.etapa import Etapa
from app.models.tarefa import Tarefa
from app.models.anexo import Anexo
from app.models.evento_timeline import EventoTimeline
from app.models.contestacao import Contestacao
from app.models.notificacao import Notificacao
from app.models.comentario import Comentario
from app.models.template_fluxo import TemplateFluxo, TemplateEtapa

SEED_ORG = {
    "name": "Prefeitura Municipal",
    "slug": "prefeitura-padrao",
    "description": "Organização padrão do GovTask",
    "is_active": True,
}

SEED_ROLES: List[dict] = [
    {"name": "ADMIN", "label": "Administrador", "description": "Acesso total", "is_system": True},
    {"name": "ASSESSOR", "label": "Assessor", "description": "Orquestrador — cria convênios, registra protocolos, abre etapas, cria e roteia tarefas, decide contestações", "is_system": True},
    {"name": "ENGENHEIRO_TECNICO", "label": "Engenheiro / Técnico", "description": "Recebe tarefas técnicas, anexa documentos, entrega tarefas", "is_system": True},
    {"name": "COMPRAS_LICITACAO", "label": "Compras e Licitação", "description": "Recebe tarefas de compras e licitação, anexa editais e contratos", "is_system": True},
    {"name": "GESTOR", "label": "Gestor / Prefeito", "description": "Acesso somente leitura", "is_system": True},
]

SEED_SETORES: List[dict] = [
    {"nome": "Engenharia", "sigla": "ENG", "descricao": "Setor de engenharia e obras"},
    {"nome": "Compras e Licitação", "sigla": "CPL", "descricao": "Setor de compras e processos licitatórios"},
    {"nome": "Gabinete do Prefeito", "sigla": "GAB", "descricao": "Gabinete do prefeito"},
    {"nome": "Assessoria de Convênios", "sigla": "ASCONV", "descricao": "Assessoria responsável pela gestão de convênios"},
]

SEED_ADMIN = {"name": "Administrador GovTask", "email": "admin@govtask.com", "password": "admin123"}
SEED_ASSESSOR = {"name": "Maria Assessora", "email": "assessor@govtask.com", "password": "admin123"}
SEED_ENGENHEIRO = {"name": "João Engenheiro", "email": "engenheiro@govtask.com", "password": "admin123"}
SEED_GESTOR = {"name": "Prefeito Municipal", "email": "gestor@govtask.com", "password": "admin123"}

TEMPLATE_OBRA_ETAPAS = [
    {"nome": "Protocolo do Ofício", "ordem": 1, "natureza": "GOVERNO"},
    {"nome": "Análise do Governo", "ordem": 2, "natureza": "GOVERNO"},
    {"nome": "Elaboração de Projeto", "ordem": 3, "natureza": "INTERNA"},
    {"nome": "Aprovação do Projeto", "ordem": 4, "natureza": "GOVERNO"},
    {"nome": "Processo Licitatório", "ordem": 5, "natureza": "INTERNA"},
    {"nome": "Autorização e Contrato", "ordem": 6, "natureza": "GOVERNO"},
    {"nome": "Execução da Obra", "ordem": 7, "natureza": "INTERNA"},
]


async def _upsert(db, model, filter_kwargs, defaults):
    result = await db.execute(select(model).where(*[getattr(model, k) == v for k, v in filter_kwargs.items()]))
    obj = result.scalar_one_or_none()
    if obj:
        return obj
    obj = model(**{**filter_kwargs, **defaults})
    db.add(obj)
    await db.flush()
    return obj


async def seed_organization(db: AsyncSession) -> Organization:
    return await _upsert(db, Organization, {"slug": SEED_ORG["slug"]}, {
        "name": SEED_ORG["name"], "description": SEED_ORG["description"], "is_active": True,
    })


async def seed_roles(db: AsyncSession) -> List[Role]:
    roles = []
    for data in SEED_ROLES:
        role = await _upsert(db, Role, {"name": data["name"]}, data)
        roles.append(role)
    await db.commit()
    return roles


async def seed_setores(db: AsyncSession) -> List[Setor]:
    setores = []
    for data in SEED_SETORES:
        s = await _upsert(db, Setor, {"nome": data["nome"]}, data)
        setores.append(s)
    await db.commit()
    return setores


async def _seed_user(db: AsyncSession, user_data: dict, role_name: str) -> User:
    result = await db.execute(select(User).where(User.email == user_data["email"]))
    user = result.scalar_one_or_none()
    if user:
        return user

    role = (await db.execute(select(Role).where(Role.name == role_name))).scalar_one_or_none()
    user = User(name=user_data["name"], email=user_data["email"], password_hash=hash_password(user_data["password"]), is_active=True)
    db.add(user)
    await db.flush()
    if role:
        db.add(UserRole(user_id=user.id, role_id=role.id))
    await db.commit()
    await db.refresh(user)
    return user


async def seed_rich_data(db: AsyncSession) -> dict:
    """Seed rich example data: template, convenios, tarefas, timeline, notificações."""
    now = datetime.now(timezone.utc)

    org = await seed_organization(db)
    setores = await seed_setores(db)
    eng_setor = next(s for s in setores if s.sigla == "ENG")
    cpl_setor = next(s for s in setores if s.sigla == "CPL")
    asconv_setor = next(s for s in setores if s.sigla == "ASCONV")

    admin = await _seed_user(db, SEED_ADMIN, "ADMIN")
    assessor = await _seed_user(db, SEED_ASSESSOR, "ASSESSOR")
    engenheiro = await _seed_user(db, SEED_ENGENHEIRO, "ENGENHEIRO_TECNICO")
    gestor = await _seed_user(db, SEED_GESTOR, "GESTOR")

    for u in [admin, assessor, engenheiro, gestor]:
        if u and u.organization_id is None:
            u.organization_id = org.id
    await db.commit()

    # Template de Fluxo
    result = await db.execute(select(TemplateFluxo).where(TemplateFluxo.nome == "Convênio de Obra"))
    template = result.scalar_one_or_none()
    if not template:
        template = TemplateFluxo(nome="Convênio de Obra", tipo_convenio="OBRA", descricao="Fluxo padrão para convênios de obras públicas")
        db.add(template)
        await db.flush()
        for e in TEMPLATE_OBRA_ETAPAS:
            db.add(TemplateEtapa(template_fluxo_id=template.id, nome=e["nome"], ordem=e["ordem"], natureza=e["natureza"]))
        await db.commit()

    existing = (await db.execute(select(Convenio).where(Convenio.titulo == "Pavimentação Asfáltica – Rua das Flores"))).scalar_one_or_none()
    if existing:
        return {"status": "already_seeded", "message": "Rich data already exists"}

    # Convênio 1 — Em andamento, completo
    conv1 = Convenio(
        titulo="Pavimentação Asfáltica – Rua das Flores",
        descricao="Obra de pavimentação asfáltica em CBUQ na Rua das Flores, bairro Centro, extensão total de 850 metros lineares.",
        tipo="OBRA", origem="Governo Estadual", numero_protocolo_governo="PROT-2026-00421",
        valor=Decimal("485000.00"), status="EM_ANDAMENTO", data_protocolo=now - timedelta(days=60),
        responsavel_id=assessor.id, template_fluxo_id=template.id,
    )
    db.add(conv1)
    await db.flush()

    etapas_conv1 = []
    for i, edata in enumerate(TEMPLATE_OBRA_ETAPAS):
        status_etapa = "CONCLUIDA" if i == 0 else "EM_ANDAMENTO" if i == 1 else "PENDENTE"
        data_ini = now - timedelta(days=60 - i * 8) if i <= 1 else None
        data_fim = now - timedelta(days=52) if i == 0 else None
        etapa = Etapa(convenio_id=conv1.id, nome=edata["nome"], ordem=edata["ordem"],
                      natureza=edata["natureza"], status=status_etapa,
                      prazo_governo=(now + timedelta(days=20 - i * 5)) if edata["natureza"] == "GOVERNO" and status_etapa != "CONCLUIDA" else None,
                      data_inicio=data_ini, data_conclusao=data_fim,
                      resposta_governo="Ofício recebido e protocolado. Processo em análise." if i == 0 else None)
        db.add(etapa)
        await db.flush()
        etapas_conv1.append(etapa)

    # Convênio 2 — Rascunho (sem etapas ainda)
    conv2 = Convenio(
        titulo="Reforma Escola Municipal – Bairro Industrial",
        descricao="Reforma e ampliação da Escola Municipal Prof. Helena Rodrigues, incluindo 4 novas salas de aula.",
        tipo="OBRA", origem="Governo Federal", valor=Decimal("1250000.00"), status="RASCUNHO",
        responsavel_id=assessor.id,
    )
    db.add(conv2)
    await db.flush()

    # Tarefas para o convênio 1
    tarefa1 = Tarefa(
        convenio_id=conv1.id, etapa_id=etapas_conv1[2].id, titulo="Elaborar projeto executivo de pavimentação",
        descricao="Desenvolver projeto completo com plantas, cortes, drenagem e sinalização conforme normas ABNT.",
        criada_por_id=assessor.id, atribuida_a_id=engenheiro.id, setor_destino_id=eng_setor.id,
        prioridade="ALTA", prazo=now + timedelta(days=2), status="EM_ANDAMENTO",
        data_aceite=now - timedelta(days=5),
    )
    db.add(tarefa1)
    await db.flush()

    tarefa2 = Tarefa(
        convenio_id=conv1.id, etapa_id=etapas_conv1[1].id, titulo="Analisar documentação enviada pelo governo",
        descricao="Verificar se toda documentação do convênio está completa e atender pendências.",
        criada_por_id=assessor.id, atribuida_a_id=assessor.id, setor_destino_id=asconv_setor.id,
        prioridade="NORMAL", prazo=now + timedelta(days=6), status="EM_ANDAMENTO",
        data_aceite=now - timedelta(days=10),
    )
    db.add(tarefa2)
    await db.flush()

    tarefa3 = Tarefa(
        convenio_id=conv1.id, etapa_id=etapas_conv1[1].id, titulo="Organizar ofícios de resposta ao governo",
        descricao="Elaborar minutas de ofícios respondendo às solicitações do governo estadual.",
        criada_por_id=assessor.id, atribuida_a_id=engenheiro.id, setor_destino_id=eng_setor.id,
        prioridade="NORMAL", prazo=now - timedelta(days=2), status="ENTREGUE",
        data_aceite=now - timedelta(days=15), data_entrega=now - timedelta(days=1),
    )
    db.add(tarefa3)
    await db.flush()

    tarefa4 = Tarefa(
        convenio_id=conv1.id, etapa_id=etapas_conv1[0].id, titulo="Protocolar ofício na plataforma do governo",
        descricao="Cadastrar e protocolar o ofício de solicitação na plataforma SIGCON.",
        criada_por_id=assessor.id, atribuida_a_id=assessor.id, setor_destino_id=asconv_setor.id,
        prioridade="URGENTE", prazo=now - timedelta(days=10), status="CONCLUIDA",
        data_aceite=now - timedelta(days=58), data_entrega=now - timedelta(days=55), data_conclusao=now - timedelta(days=54),
    )
    db.add(tarefa4)
    await db.flush()

    tarefa5 = Tarefa(
        convenio_id=conv1.id, etapa_id=etapas_conv1[2].id, titulo="Levantamento topográfico da via",
        descricao="Realizar levantamento planialtimétrico da Rua das Flores.",
        criada_por_id=assessor.id, atribuida_a_id=engenheiro.id, setor_destino_id=eng_setor.id,
        prioridade="ALTA", prazo=now - timedelta(days=5), status="CONTESTADA",
        data_aceite=now - timedelta(days=20),
    )
    db.add(tarefa5)
    await db.flush()

    # Anexos
    anexo1 = Anexo(convenio_id=conv1.id, etapa_id=etapas_conv1[0].id, nome_arquivo="oficio_protocolo_001.pdf",
                   tipo_documento="OFICIO", storage_path="seeds/oficio_001.pdf", tamanho_bytes=245760, versao=1, enviado_por_id=assessor.id)
    db.add(anexo1)
    anexo2 = Anexo(convenio_id=conv1.id, etapa_id=etapas_conv1[2].id, nome_arquivo="projeto_pavimentacao_v1.dwg",
                   tipo_documento="PROJETO", storage_path="seeds/projeto_v1.dwg", tamanho_bytes=5242880, versao=1, enviado_por_id=engenheiro.id)
    db.add(anexo2)
    anexo3 = Anexo(convenio_id=conv1.id, tarefa_id=tarefa3.id, nome_arquivo="minuta_oficio_resposta.docx",
                   tipo_documento="OFICIO", storage_path="seeds/minuta_oficio.docx", tamanho_bytes=102400, versao=1, enviado_por_id=engenheiro.id)
    db.add(anexo3)
    anexo4 = Anexo(convenio_id=conv1.id, tarefa_id=tarefa1.id, nome_arquivo="foto_rua_flores_01.jpg",
                   tipo_documento="FOTO", storage_path="seeds/foto_obra_01.jpg", tamanho_bytes=3145728, versao=1, enviado_por_id=engenheiro.id)
    db.add(anexo4)
    await db.flush()

    # Timeline de eventos
    eventos_data = [
        (conv1.id, None, "CONVENIO_CRIADO", assessor.id, "Convênio criado a partir do template 'Convênio de Obra'.", now - timedelta(days=60)),
        (conv1.id, None, "PROTOCOLO_REGISTRADO", assessor.id, "Protocolo PROT-2026-00421 registrado no sistema.", now - timedelta(days=58)),
        (conv1.id, etapas_conv1[0].id, "ETAPA_CONCLUIDA", assessor.id, "Etapa 'Protocolo do Ofício' concluída.", now - timedelta(days=54)),
        (conv1.id, None, "TAREFA_CRIADA", assessor.id, "Tarefa 'Elaborar projeto executivo' criada e atribuída a João Engenheiro.", now - timedelta(days=30)),
        (conv1.id, None, "TAREFA_ACEITA", engenheiro.id, "João Engenheiro aceitou a tarefa 'Elaborar projeto executivo'.", now - timedelta(days=25)),
        (conv1.id, None, "TAREFA_ENTREGUE", engenheiro.id, "Tarefa 'Organizar ofícios de resposta ao governo' entregue.", now - timedelta(days=1)),
        (conv1.id, None, "CONTATACAO_ABERTA", engenheiro.id, "João Engenheiro contestou o prazo da tarefa 'Levantamento topográfico'. Novo prazo solicitado: +7 dias.", now - timedelta(days=4)),
        (conv1.id, None, "ETAPA_INICIADA", assessor.id, "Etapa 'Análise do Governo' iniciada.", now - timedelta(days=50)),
        (conv1.id, None, "DOCUMENTO_ANEXADO", assessor.id, "Ofício de protocolo anexado ao convênio.", now - timedelta(days=57)),
    ]
    for ev_data in eventos_data:
        db.add(EventoTimeline(convenio_id=ev_data[0], tipo_evento=ev_data[2],
                              ator_id=ev_data[3], descricao=ev_data[4], ocorrido_em=ev_data[5]))
    await db.flush()

    # Contestação
    contestacao1 = Contestacao(
        tarefa_id=tarefa5.id, solicitado_por_id=engenheiro.id,
        motivo="Prazo insuficiente devido a chuvas que impossibilitaram o trabalho de campo.",
        novo_prazo_solicitado=now + timedelta(days=10), status="PENDENTE",
    )
    db.add(contestacao1)
    await db.flush()

    # Comentários
    comentarios_data = [
        (tarefa1.id, assessor.id, "Precisamos priorizar este projeto. O prazo do governo está chegando.", now - timedelta(days=10)),
        (tarefa1.id, engenheiro.id, "Estou finalizando o levantamento. Devo entregar até amanhã.", now - timedelta(days=8)),
        (tarefa3.id, engenheiro.id, "Ofícios elaborados conforme solicitado. Seguem anexos para revisão.", now - timedelta(days=1)),
    ]
    for c_data in comentarios_data:
        db.add(Comentario(tarefa_id=c_data[0], autor_id=c_data[1], texto=c_data[2], created_at=c_data[3]))
    await db.flush()

    # Notificações
    notifs_data = [
        (assessor.id, "TAREFA_ENTREGUE", conv1.id, tarefa3.id, "João Engenheiro entregou 'Organizar ofícios de resposta ao governo'. Revisar.", now - timedelta(days=1), False),
        (assessor.id, "CONTATACAO_ABERTA", conv1.id, tarefa5.id, "João Engenheiro contestou a tarefa 'Levantamento topográfico'. Decida.", now - timedelta(days=4), False),
        (engenheiro.id, "PRAZO_PROXIMO", conv1.id, tarefa1.id, "A tarefa 'Elaborar projeto executivo' vence em 2 dias.", now - timedelta(hours=12), False),
        (assessor.id, "PRAZO_VENCIDO", conv1.id, tarefa5.id, "A tarefa 'Levantamento topográfico' está atrasada.", now - timedelta(days=1), True),
        (engenheiro.id, "TAREFA_ATRIBUIDA", conv1.id, tarefa1.id, "Maria Assessora atribuiu a tarefa 'Elaborar projeto executivo' a você.", now - timedelta(days=30), True),
    ]
    for n_data in notifs_data:
        db.add(Notificacao(destinatario_id=n_data[0], tipo=n_data[1], convenio_id=n_data[2],
                           tarefa_id=n_data[3], mensagem=n_data[4], canal="IN_APP", lida=n_data[6], lida_em=n_data[5] if n_data[6] else None))
    await db.flush()

    await db.commit()
    return {"status": "seeded", "convenios": 2, "etapas": len(etapas_conv1), "tarefas": 5, "eventos": len(eventos_data), "notificacoes": len(notifs_data)}


async def run_all_seeds(db: AsyncSession) -> dict:
    org = await seed_organization(db)
    roles = await seed_roles(db)
    setores = await seed_setores(db)
    admin = await _seed_user(db, SEED_ADMIN, "ADMIN")
    await _seed_user(db, SEED_ASSESSOR, "ASSESSOR")
    await _seed_user(db, SEED_ENGENHEIRO, "ENGENHEIRO_TECNICO")
    await _seed_user(db, SEED_GESTOR, "GESTOR")

    for u in [admin]:
        if u and u.organization_id is None:
            u.organization_id = org.id
    await db.commit()

    rich = await seed_rich_data(db)
    return {
        "organization": org.slug,
        "roles": [r.name for r in roles],
        "setores": [s.nome for s in setores],
        "admin": admin.email if admin else None,
        "rich_data": rich,
    }
