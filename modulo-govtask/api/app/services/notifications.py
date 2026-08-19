"""Creates notification records for users."""

import re
import uuid

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.enums import CanalNotificacao, TipoNotificacao
from app.models.notificacao import Notificacao
from app.models.user import User

_MENCAO_RE = re.compile(r"@([A-Za-zÀ-ú0-9_.-]+)")


async def criar_notificacao(
    db: AsyncSession,
    destinatario_id: uuid.UUID,
    tipo: TipoNotificacao,
    convenio_id: uuid.UUID,
    mensagem: str,
    tarefa_id: uuid.UUID | None = None,
    canal: CanalNotificacao = CanalNotificacao.IN_APP,
) -> Notificacao:
    """Cria uma notificação para um usuário."""
    notificacao = Notificacao(
        destinatario_id=destinatario_id,
        tipo=tipo,
        convenio_id=convenio_id,
        tarefa_id=tarefa_id,
        mensagem=mensagem,
        canal=canal,
    )
    db.add(notificacao)
    await db.flush()
    return notificacao


async def notificar_mencoes(
    db: AsyncSession,
    texto: str,
    autor: User,
    convenio_id: uuid.UUID,
    tarefa_id: uuid.UUID,
    tarefa_titulo: str,
) -> list[uuid.UUID]:
    """Notifica os usuários citados via @menção em um comentário.

    Faz o match por nome ou e-mail (case-insensitive), ignorando o autor.
    Retorna os ids dos usuários notificados.
    """
    tokens = {m.lower() for m in _MENCAO_RE.findall(texto or "")}
    if not tokens:
        return []

    notificados: list[uuid.UUID] = []
    for token in tokens:
        result = await db.execute(
            select(User).where(
                User.organization_id == autor.organization_id,
                User.is_active.is_(True),
                User.deleted_at.is_(None),
                User.id != autor.id,
                (User.name.ilike(f"%{token}%")) | (User.email.ilike(f"%{token}%")),
            ).limit(5)
        )
        for destinatario in result.scalars().all():
            if destinatario.id in notificados:
                continue
            await criar_notificacao(
                db,
                destinatario_id=destinatario.id,
                tipo=TipoNotificacao.COMENTARIO_MENCAO,
                convenio_id=convenio_id,
                tarefa_id=tarefa_id,
                mensagem=f"{autor.name} mencionou você em um comentário na tarefa '{tarefa_titulo}'",
            )
            notificados.append(destinatario.id)
    return notificados



async def notificar_atribuicao_tarefa(
    db: AsyncSession,
    tarefa_id: uuid.UUID,
    convenio_id: uuid.UUID,
    atribuido_a_id: uuid.UUID,
    titulo_tarefa: str,
) -> Notificacao:
    return await criar_notificacao(
        db,
        destinatario_id=atribuido_a_id,
        tipo=TipoNotificacao.TAREFA_ATRIBUIDA,
        convenio_id=convenio_id,
        tarefa_id=tarefa_id,
        mensagem=f"Nova tarefa atribuída a você: {titulo_tarefa}",
    )


async def notificar_tarefa_entregue(
    db: AsyncSession,
    tarefa_id: uuid.UUID,
    convenio_id: uuid.UUID,
    assessor_id: uuid.UUID,
    titulo_tarefa: str,
) -> Notificacao:
    return await criar_notificacao(
        db,
        destinatario_id=assessor_id,
        tipo=TipoNotificacao.TAREFA_ENTREGUE,
        convenio_id=convenio_id,
        tarefa_id=tarefa_id,
        mensagem=f"Tarefa '{titulo_tarefa}' foi entregue e aguarda sua revisão.",
    )


async def notificar_tarefa_devolvida(
    db: AsyncSession,
    tarefa_id: uuid.UUID,
    convenio_id: uuid.UUID,
    responsavel_id: uuid.UUID,
    titulo_tarefa: str,
) -> Notificacao:
    return await criar_notificacao(
        db,
        destinatario_id=responsavel_id,
        tipo=TipoNotificacao.TAREFA_DEVOLVIDA,
        convenio_id=convenio_id,
        tarefa_id=tarefa_id,
        mensagem=f"Tarefa '{titulo_tarefa}' foi devolvida para ajustes.",
    )


async def notificar_contestacao_aberta(
    db: AsyncSession,
    tarefa_id: uuid.UUID,
    convenio_id: uuid.UUID,
    assessor_id: uuid.UUID,
    titulo_tarefa: str,
) -> Notificacao:
    return await criar_notificacao(
        db,
        destinatario_id=assessor_id,
        tipo=TipoNotificacao.CONTESTACAO_ABERTA,
        convenio_id=convenio_id,
        tarefa_id=tarefa_id,
        mensagem=f"Contestação de prazo aberta na tarefa '{titulo_tarefa}'.",
    )


async def notificar_contestacao_decidida(
    db: AsyncSession,
    tarefa_id: uuid.UUID,
    convenio_id: uuid.UUID,
    responsavel_id: uuid.UUID,
    titulo_tarefa: str,
    aprovada: bool,
) -> Notificacao:
    resultado = "aprovada" if aprovada else "rejeitada"
    return await criar_notificacao(
        db,
        destinatario_id=responsavel_id,
        tipo=TipoNotificacao.CONTESTACAO_DECIDIDA,
        convenio_id=convenio_id,
        tarefa_id=tarefa_id,
        mensagem=f"Contestação de prazo da tarefa '{titulo_tarefa}' foi {resultado}.",
    )


async def notificar_diligencia_recebida(
    db: AsyncSession,
    convenio_id: uuid.UUID,
    destinatario_id: uuid.UUID,
    descricao: str,
) -> Notificacao:
    return await criar_notificacao(
        db,
        destinatario_id=destinatario_id,
        tipo=TipoNotificacao.DILIGENCIA_RECEBIDA,
        convenio_id=convenio_id,
        mensagem=f"Nova diligência recebida: {descricao[:100]}",
    )


async def notificar_diligencia_respondida(
    db: AsyncSession,
    convenio_id: uuid.UUID,
    destinatario_id: uuid.UUID,
    descricao: str,
) -> Notificacao:
    return await criar_notificacao(
        db,
        destinatario_id=destinatario_id,
        tipo=TipoNotificacao.DILIGENCIA_RESPONDIDA,
        convenio_id=convenio_id,
        mensagem=f"Diligência respondida: {descricao[:100]}",
    )


async def notificar_prestacao_enviada(
    db: AsyncSession,
    convenio_id: uuid.UUID,
    destinatario_id: uuid.UUID,
    titulo: str,
) -> Notificacao:
    return await criar_notificacao(
        db,
        destinatario_id=destinatario_id,
        tipo=TipoNotificacao.PRESTACAO_ENVIADA,
        convenio_id=convenio_id,
        mensagem=f"Prestação de contas '{titulo or 'do processo'}' foi enviada.",
    )


async def notificar_repasse_recebido(
    db: AsyncSession,
    convenio_id: uuid.UUID,
    destinatario_id: uuid.UUID,
    parcela: int,
    valor: str,
) -> Notificacao:
    return await criar_notificacao(
        db,
        destinatario_id=destinatario_id,
        tipo=TipoNotificacao.REPASSE_RECEBIDO,
        convenio_id=convenio_id,
        mensagem=f"Repasse (parcela {parcela}) recebido no valor de {valor}.",
    )


async def verificar_prazos(db: AsyncSession, organization_id: uuid.UUID) -> dict:
    """Verifica tarefas com prazos proximos/vencidos e gera notificações.

    Também dispara o escalonamento de atrasos conforme a configuração da
    organização (níveis de dias de atraso), evitando duplicidade por nível.
    """
    from datetime import datetime, timedelta, timezone
    from sqlalchemy import select
    from app.models.tarefa import Tarefa
    from app.models.convenio import Convenio
    from app.models.notificacao import Notificacao
    from app.models.user import User
    from app.models.user_role import UserRole
    from app.models.role import Role
    from app.models.escalonamento import EscalonamentoConfig, EscalamentoAtraso

    now = datetime.now(timezone.utc)
    hoje = now.replace(hour=0, minute=0, second=0, microsecond=0)

    marcos = [7, 3, 1, 0]
    criadas = 0
    escaladas = 0

    result = await db.execute(
        select(Tarefa).join(Convenio, Tarefa.convenio_id == Convenio.id).where(
            Convenio.organization_id == organization_id,
            Tarefa.status.in_(["AGUARDANDO_ACEITE", "EM_ANDAMENTO", "CONTESTADA"]),
            Tarefa.prazo.isnot(None),
            Tarefa.deleted_at.is_(None),
        )
    )
    tarefas = result.scalars().all()

    # Configuração de escalonamento da organização
    cfg = await db.scalar(
        select(EscalonamentoConfig).where(
            EscalonamentoConfig.organization_id == organization_id,
            EscalonamentoConfig.deleted_at.is_(None),
        )
    )
    niveis = []
    if cfg and cfg.ativo:
        niveis = [
            (1, cfg.dia_responsavel, ["ASSESSOR"]),
            (2, cfg.dia_coordenador, ["ASSESSOR", "GESTOR"]),
            (3, cfg.dia_gestor, ["GESTOR", "ADMIN"]),
        ]

    # Usuários por role na organização (para escalonamento)
    role_map: dict[str, list[uuid.UUID]] = {}
    if niveis:
        roles_rows = await db.execute(
            select(Role.name, UserRole.user_id)
            .join(UserRole, UserRole.role_id == Role.id)
            .join(User, User.id == UserRole.user_id)
            .where(
                User.organization_id == organization_id,
                User.is_active.is_(True),
                User.deleted_at.is_(None),
                Role.deleted_at.is_(None),
            )
        )
        for role_name, user_id in roles_rows.all():
            role_map.setdefault(role_name, []).append(user_id)

    for t in tarefas:
        if not t.prazo:
            continue

        dias_restantes = (t.prazo.date() - hoje.date()).days

        if dias_restantes < 0:
            tipo = TipoNotificacao.PRAZO_VENCIDO
            mensagem = f"Tarefa '{t.titulo}' está atrasada! Venceu em {t.prazo.strftime('%d/%m/%Y')}."
        elif dias_restantes in marcos:
            tipo = TipoNotificacao.PRAZO_PROXIMO
            if dias_restantes == 0:
                mensagem = f"Tarefa '{t.titulo}' vence hoje ({t.prazo.strftime('%d/%m/%Y')})."
            elif dias_restantes == 1:
                mensagem = f"Tarefa '{t.titulo}' vence amanhã ({t.prazo.strftime('%d/%m/%Y')})."
            else:
                mensagem = f"Tarefa '{t.titulo}' vence em {dias_restantes} dias ({t.prazo.strftime('%d/%m/%Y')})."
        else:
            continue

        if tipo == TipoNotificacao.PRAZO_VENCIDO and t.atribuida_a_id:
            # Evita duplicata no mesmo dia
            existente = await db.execute(
                select(Notificacao).where(
                    Notificacao.tarefa_id == t.id,
                    Notificacao.tipo == tipo,
                    Notificacao.created_at >= hoje,
                )
            )
            if existente.scalar_one_or_none():
                pass
            else:
                await criar_notificacao(
                    db,
                    destinatario_id=t.atribuida_a_id,
                    tipo=tipo,
                    convenio_id=t.convenio_id,
                    tarefa_id=t.id,
                    mensagem=mensagem,
                )
                criadas += 1

            # Escalonamento por níveis de atraso
            if niveis and t.atribuida_a_id:
                dias_atraso = (hoje.date() - t.prazo.date()).days
                for nivel, dia_limite, roles_alvo in niveis:
                    if dias_atraso < dia_limite:
                        continue
                    # Já disparado neste nível?
                    ja_enviado = await db.scalar(
                        select(EscalamentoAtraso.id).where(
                            EscalamentoAtraso.tarefa_id == t.id,
                            EscalamentoAtraso.nivel == nivel,
                            EscalamentoAtraso.deleted_at.is_(None),
                        )
                    )
                    if ja_enviado:
                        continue

                    alvos: list[uuid.UUID] = []
                    for rn in roles_alvo:
                        for uid in role_map.get(rn, []):
                            if uid != t.atribuida_a_id and uid not in alvos:
                                alvos.append(uid)
                    for uid in alvos:
                        await criar_notificacao(
                            db,
                            destinatario_id=uid,
                            tipo=TipoNotificacao.ATRASO_ESCALADO,
                            convenio_id=t.convenio_id,
                            tarefa_id=t.id,
                            mensagem=(
                                f"[Escalonado] A tarefa '{t.titulo}' está "
                                f"atrasada há {dias_atraso} dia(s). Prazo era {t.prazo.strftime('%d/%m/%Y')}."
                            ),
                        )
                        escaladas += 1
                    db.add(
                        EscalamentoAtraso(
                            organization_id=organization_id,
                            tarefa_id=t.id,
                            nivel=nivel,
                        )
                    )
        else:
            # Prazos próximos (não vencidos): notifica o responsável
            if not t.atribuida_a_id:
                continue
            existente = await db.execute(
                select(Notificacao).where(
                    Notificacao.tarefa_id == t.id,
                    Notificacao.tipo == tipo,
                    Notificacao.created_at >= hoje,
                )
            )
            if existente.scalar_one_or_none():
                continue
            await criar_notificacao(
                db,
                destinatario_id=t.atribuida_a_id,
                tipo=tipo,
                convenio_id=t.convenio_id,
                tarefa_id=t.id,
                mensagem=mensagem,
            )
            criadas += 1

    await db.commit()
    return {"notificacoes_criadas": criadas, "escalonadas": escaladas}
