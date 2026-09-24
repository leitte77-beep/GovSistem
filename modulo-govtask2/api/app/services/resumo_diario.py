"""Resumo diário no sino do Prefeito.

Uma tarefa em segundo plano acorda a cada meia hora; depois das 7h (horário
de Brasília) grava, uma vez por dia, uma notificação com o essencial: quanto
está andando, o que está parado há mais tempo e onde. Idempotente: se já
existe resumo do dia para o usuário, não grava outro — reiniciar o container
não duplica o aviso.
"""

import asyncio
import logging
from datetime import datetime, timedelta, timezone

from sqlalchemy import select

from app.api.v1._montagem import dias_na_situacao
from app.core.database import async_session
from sqlalchemy.orm import selectinload

from app.core.permissions import default_permissions_for_role, perfil_efetivo
from app.models.auth_models import User, UserRole
from app.models.notificacao import Notificacao, TipoNotificacao
from app.models.pedido import ROTULO_MOTIVO_PARADA
from app.services import ajustes as ajustes_service
from app.services import notificacoes as notif
from app.services import paineis

log = logging.getLogger(__name__)

BRASILIA = timezone(timedelta(hours=-3))
HORA_DO_RESUMO = 7
INTERVALO_SEGUNDOS = 30 * 60


def _texto(abertos, limite: int, nomes: dict[str, str]) -> str:
    agora = datetime.now(timezone.utc)
    hoje = agora.date()
    parados = sorted(
        (p for p in abertos if dias_na_situacao(p, agora) >= limite),
        key=lambda p: dias_na_situacao(p, agora),
        reverse=True,
    )
    atrasados = sum(1 for p in abertos if p.prazo_atual and p.prazo_atual < hoje)
    partes = [
        f"Bom dia! {len(abertos)} pedido(s) em andamento",
        f"{len(parados)} parado(s) há {limite}+ dias",
        f"{atrasados} com prazo vencido.",
    ]
    texto = ", ".join(partes[:2]) + " e " + partes[2]
    if parados:
        p = parados[0]
        onde = nomes.get(p.setor_atual or "", p.setor_atual or "com o Assessor")
        motivo = ROTULO_MOTIVO_PARADA.get(p.motivo_parada or "", "")
        texto += (
            f" O mais parado: {p.numero} “{p.titulo}” — "
            f"{dias_na_situacao(p, agora)} dias em {onde}"
            + (f" ({motivo.lower()})" if motivo else "")
            + "."
        )
    return texto


def _perfil(u: User) -> str:
    papeis = {ur.role.name for ur in u.user_roles}
    perms: set[str] = set()
    for p in papeis:
        perms |= default_permissions_for_role(p)
    return perfil_efetivo(u.perfil_govtask, papeis, perms)


async def gerar_resumos() -> int:
    """Grava o resumo do dia para quem a prefeitura escolheu, depois da hora escolhida."""
    agora_local = datetime.now(BRASILIA)
    inicio_do_dia = agora_local.replace(hour=0, minute=0, second=0, microsecond=0)
    gravados = 0
    async with async_session() as db:
        pessoas = (
            await db.execute(
                select(User)
                .where(
                    User.is_active.is_(True),
                    User.ativo_govtask.is_(True),
                    User.deleted_at.is_(None),
                    User.organization_id.is_not(None),
                )
                .options(selectinload(User.user_roles).selectinload(UserRole.role))
            )
        ).scalars().unique().all()

        por_org: dict = {}
        for user in pessoas:
            por_org.setdefault(user.organization_id, []).append(user)

        for org, todos in por_org.items():
            ajustes = await ajustes_service.obter(db, org)
            if not ajustes.resumo_diario or agora_local.hour < (ajustes.resumo_hora or HORA_DO_RESUMO):
                continue
            perfis = set(ajustes.resumo_perfis or ["PREFEITO"])
            usuarios = [u for u in todos if _perfil(u) in perfis]
            pendentes = []
            for user in usuarios:
                ja = await db.scalar(
                    select(Notificacao.id).where(
                        Notificacao.user_id == user.id,
                        Notificacao.tipo == TipoNotificacao.RESUMO_DIARIO.value,
                        Notificacao.created_at >= inicio_do_dia,
                    )
                )
                if ja is None:
                    pendentes.append(user)
            if not pendentes:
                continue
            abertos = await paineis.pedidos_da_org(db, org, so_abertos=True)
            nomes = await paineis.nomes_de_setor(db, org)
            notif.criar(
                db,
                destinatarios=pendentes,
                tipo=TipoNotificacao.RESUMO_DIARIO,
                texto=_texto(abertos, ajustes.dias_alerta_parado, nomes),
                autor_nome="GovTask",
            )
            gravados += len(pendentes)
        await db.commit()
    return gravados


async def laco() -> None:
    while True:
        try:
            n = await gerar_resumos()
            if n:
                log.info("resumo diário gravado para %s usuário(s)", n)
        except asyncio.CancelledError:
            raise
        except Exception:
            log.exception("falha ao gerar o resumo diário")
        await asyncio.sleep(INTERVALO_SEGUNDOS)
