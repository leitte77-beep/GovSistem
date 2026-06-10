"""Creates notification records for users."""

import uuid

from sqlalchemy.ext.asyncio import AsyncSession

from app.models.enums import CanalNotificacao, TipoNotificacao
from app.models.notificacao import Notificacao


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


async def verificar_prazos(db: AsyncSession) -> dict:
    """Verifica tarefas com prazos proximos/vencidos e gera notificações."""
    from datetime import datetime, timedelta, timezone
    from sqlalchemy import select
    from app.models.tarefa import Tarefa
    from app.models.notificacao import Notificacao

    now = datetime.now(timezone.utc)
    hoje = now.replace(hour=0, minute=0, second=0, microsecond=0)

    marcos = [7, 3, 1, 0]
    criadas = 0

    result = await db.execute(
        select(Tarefa).where(
            Tarefa.status.in_(["AGUARDANDO_ACEITE", "EM_ANDAMENTO", "CONTESTADA"]),
            Tarefa.prazo.isnot(None),
            Tarefa.deleted_at.is_(None),
        )
    )
    tarefas = result.scalars().all()

    for t in tarefas:
        if not t.atribuida_a_id or not t.prazo:
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

        # Evita duplicata no mesmo dia
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
    return {"notificacoes_criadas": criadas}
