"""Tarefas automáticas do GovInfra (itens 42 e 48).

Roda periodicamente e gera notificações internas quando encontra:

  • retiradas próximas ou atrasadas (caçambas)
  • documentos vencendo (CNH, licenciamento, seguro, vistoria de caçamba)
  • manutenção preventiva próxima (planos)
  • estoque de diesel abaixo do mínimo

O agendador é tolerante a falhas: cada organização é processada isoladamente e
um erro em uma nunca derruba a volta seguinte. A duplicidade é evitada
verificando se já existe notificação do mesmo tipo/entidade criada hoje.
"""

import asyncio
import logging
import uuid
from datetime import date, datetime, timedelta, timezone

from sqlalchemy import select

from app.core.config import settings
from app.core.database import async_session
from app.core.permissoes import Perfil
from app.models.cacambas import Cacamba, SolicitacaoCacamba
from app.models.combustivel import Tanque
from app.models.enums import (
    SituacaoSolicitacao,
    TipoNotificacao,
)
from app.models.frota import Habilitacao, Veiculo
from app.models.governanca import Notificacao
from app.models.manutencao import PlanoManutencao
from app.models.organizacao import Organizacao
from app.services import notificacoes
from app.services.configuracoes import obter

logger = logging.getLogger("govinfra.scheduler")


def hoje_utc() -> date:
    return datetime.now(timezone.utc).date()


async def _ja_notificada_hoje(
    db, organizacao_id, tipo: str, entidade: str, entidade_id: uuid.UUID
) -> bool:
    inicio_do_dia = datetime.combine(hoje_utc(), datetime.min.time(), tzinfo=timezone.utc)
    existente = await db.scalar(
        select(Notificacao.id).where(
            Notificacao.organizacao_id == organizacao_id,
            Notificacao.tipo == tipo,
            Notificacao.entidade == entidade,
            Notificacao.entidade_id == entidade_id,
            Notificacao.created_at >= inicio_do_dia,
        )
    )
    return existente is not None


async def _alertas_retirada(db, organizacao_id: uuid.UUID) -> None:
    antecedencia = int(await obter(db, organizacao_id, "geral_alerta_retirada_dias") or 1)
    hoje = hoje_utc()
    ativas = (
        await db.execute(
            select(SolicitacaoCacamba)
            .where(
                SolicitacaoCacamba.organizacao_id == organizacao_id,
                SolicitacaoCacamba.situacao.in_(SituacaoSolicitacao.SOLICITACAO_ATIVA),
                SolicitacaoCacamba.data_prevista_retirada.is_not(None),
            )
            .limit(200)
        )
    ).scalars().all()

    for solicitacao in ativas:
        prevista = solicitacao.data_prevista_retirada
        if prevista is None:
            continue
        atrasada = prevista < hoje
        proxima = not atrasada and prevista <= hoje + timedelta(days=antecedencia)
        if atrasada:
            if await _ja_notificada_hoje(
                db, organizacao_id, TipoNotificacao.RETIRADA_ATRASADA.value,
                "solicitacao_cacamba", solicitacao.id,
            ):
                continue
            await notificacoes.criar(
                db,
                organizacao_id=organizacao_id,
                tipo=TipoNotificacao.RETIRADA_ATRASADA,
                titulo="Retirada atrasada",
                mensagem=(
                    f"A caçamba da solicitação {solicitacao.protocolo_formatado} deveria ter "
                    f"sido retirada em {prevista.strftime('%d/%m/%Y')} e está atrasada há "
                    f"{(hoje - prevista).days} dia(s)."
                ),
                perfil_destino=Perfil.GESTOR,
                entidade="solicitacao_cacamba",
                entidade_id=solicitacao.id,
                link=f"/govinfra/solicitacoes/{solicitacao.id}",
            )
        elif proxima:
            if await _ja_notificada_hoje(
                db, organizacao_id, TipoNotificacao.RETIRADA_PROXIMA.value,
                "solicitacao_cacamba", solicitacao.id,
            ):
                continue
            await notificacoes.criar(
                db,
                organizacao_id=organizacao_id,
                tipo=TipoNotificacao.RETIRADA_PROXIMA,
                titulo="Retirada próxima",
                mensagem=(
                    f"A retirada da solicitação {solicitacao.protocolo_formatado} está prevista "
                    f"para {prevista.strftime('%d/%m/%Y')}."
                ),
                perfil_destino=Perfil.GESTOR,
                entidade="solicitacao_cacamba",
                entidade_id=solicitacao.id,
                link=f"/govinfra/solicitacoes/{solicitacao.id}",
            )


async def _alertas_documentos(db, organizacao_id: uuid.UUID) -> None:
    dias = int(await obter(db, organizacao_id, "geral_alerta_documento_dias") or 30)
    limite = hoje_utc() + timedelta(days=dias)

    habilitacoes = (
        await db.execute(
            select(Habilitacao).where(
                Habilitacao.organizacao_id == organizacao_id,
                Habilitacao.cnh_validade.is_not(None),
                Habilitacao.cnh_validade <= limite,
                Habilitacao.situacao.in_(["ativa", "vencida"]),
            )
        )
    ).scalars().all()
    for habilitacao in habilitacoes:
        if await _ja_notificada_hoje(
            db, organizacao_id, TipoNotificacao.DOCUMENTO_VENCENDO.value,
            "habilitacao", habilitacao.id,
        ):
            continue
        vencida = habilitacao.cnh_validade < hoje_utc()
        await notificacoes.criar(
            db,
            organizacao_id=organizacao_id,
            tipo=TipoNotificacao.DOCUMENTO_VENCENDO,
            titulo=f"CNH {'vencida' if vencida else 'vence em breve'}",
            mensagem=(
                f"O operador habilitado tem CNH categoria {habilitacao.cnh_categoria or '—'} "
                f"com validade até {habilitacao.cnh_validade.strftime('%d/%m/%Y')}."
            ),
            perfil_destino=Perfil.GESTOR,
            entidade="habilitacao",
            entidade_id=habilitacao.id,
        )

    veiculos = (
        await db.execute(
            select(Veiculo).where(
                Veiculo.organizacao_id == organizacao_id,
                Veiculo.data_baixa.is_(None),
            )
        )
    ).scalars().all()
    for veiculo in veiculos:
        alvos = []
        if veiculo.licenciamento_ate is not None and veiculo.licenciamento_ate <= limite:
            alvos.append(("licenciamento", veiculo.licenciamento_ate))
        if veiculo.seguro_ate is not None and veiculo.seguro_ate <= limite:
            alvos.append(("seguro", veiculo.seguro_ate))
        for nome, vencimento in alvos:
            if await _ja_notificada_hoje(
                db, organizacao_id, TipoNotificacao.DOCUMENTO_VENCENDO.value,
                "veiculo", veiculo.id,
            ):
                continue
            await notificacoes.criar(
                db,
                organizacao_id=organizacao_id,
                tipo=TipoNotificacao.DOCUMENTO_VENCENDO,
                titulo=f"{nome.capitalize()} do veículo {veiculo.placa or veiculo.codigo} vence",
                mensagem=(
                    f"O {nome} do veículo {veiculo.placa or veiculo.codigo} "
                    f"vence em {vencimento.strftime('%d/%m/%Y')}."
                ),
                perfil_destino=Perfil.GESTOR,
                entidade="veiculo",
                entidade_id=veiculo.id,
            )

    cacambas = (
        await db.execute(
            select(Cacamba).where(
                Cacamba.organizacao_id == organizacao_id,
                Cacamba.proxima_vistoria_em.is_not(None),
                Cacamba.proxima_vistoria_em <= limite,
                Cacamba.situacao.notin_(["baixada", "inativa"]),
            )
        )
    ).scalars().all()
    for cacamba in cacambas:
        if await _ja_notificada_hoje(
            db, organizacao_id, TipoNotificacao.DOCUMENTO_VENCENDO.value,
            "cacamba", cacamba.id,
        ):
            continue
        await notificacoes.criar(
            db,
            organizacao_id=organizacao_id,
            tipo=TipoNotificacao.DOCUMENTO_VENCENDO,
            titulo=f"Vistoria da caçamba {cacamba.codigo} próxima",
            mensagem=(
                f"A vistoria da caçamba {cacamba.codigo} está prevista para "
                f"{cacamba.proxima_vistoria_em.strftime('%d/%m/%Y')}."
            ),
            perfil_destino=Perfil.MANUTENCAO,
            entidade="cacamba",
            entidade_id=cacamba.id,
        )


async def _alertas_manutencao(db, organizacao_id: uuid.UUID) -> None:
    hoje = hoje_utc()
    planos = (
        await db.execute(
            select(PlanoManutencao).where(
                PlanoManutencao.organizacao_id == organizacao_id,
                PlanoManutencao.ativo.is_(True),
                PlanoManutencao.proxima_data.is_not(None),
                PlanoManutencao.proxima_data <= hoje + timedelta(days=15),
            )
        )
    ).scalars().all()
    for plano in planos:
        if await _ja_notificada_hoje(
            db, organizacao_id, TipoNotificacao.MANUTENCAO_PROXIMA.value,
            "plano_manutencao", plano.id,
        ):
            continue
        await notificacoes.criar(
            db,
            organizacao_id=organizacao_id,
            tipo=TipoNotificacao.MANUTENCAO_PROXIMA,
            titulo=f"Manutenção preventiva próxima: {plano.nome}",
            mensagem=(
                f"O plano de manutenção \"{plano.nome}\" tem execução prevista para "
                f"{plano.proxima_data.strftime('%d/%m/%Y')}."
            ),
            perfil_destino=Perfil.MANUTENCAO,
            entidade="plano_manutencao",
            entidade_id=plano.id,
        )


async def _alertas_estoque(db, organizacao_id: uuid.UUID) -> None:
    tanques = (
        await db.execute(
            select(Tanque).where(
                Tanque.organizacao_id == organizacao_id,
                Tanque.ativo.is_(True),
                Tanque.estoque_atual_litros <= Tanque.estoque_minimo_litros,
            )
        )
    ).scalars().all()
    for tanque in tanques:
        if await _ja_notificada_hoje(
            db, organizacao_id, TipoNotificacao.ESTOQUE_DIESEL_BAIXO.value,
            "tanque", tanque.id,
        ):
            continue
        await notificacoes.criar(
            db,
            organizacao_id=organizacao_id,
            tipo=TipoNotificacao.ESTOQUE_DIESEL_BAIXO,
            titulo=f"Estoque baixo no tanque {tanque.nome}",
            mensagem=(
                f"O tanque {tanque.nome} está com {tanque.estoque_atual_litros:.0f} litros, "
                f"abaixo do mínimo de {tanque.estoque_minimo_litros:.0f}."
            ),
            perfil_destino=Perfil.COMBUSTIVEL,
            entidade="tanque",
            entidade_id=tanque.id,
        )


async def _processar_organizacao(organizacao_id: uuid.UUID) -> None:
    async with async_session() as db:
        try:
            await _alertas_retirada(db, organizacao_id)
            await _alertas_documentos(db, organizacao_id)
            await _alertas_manutencao(db, organizacao_id)
            await _alertas_estoque(db, organizacao_id)
            await db.commit()
        except Exception:
            logger.exception("Falha nas tarefas automáticas da organização %s", organizacao_id)
            await db.rollback()


async def loop() -> None:
    """Laço principal: roda a cada `SCHEDULER_INTERVAL_SECONDS` segundos."""
    logger.info("Agendador iniciado (intervalo=%ss)", settings.SCHEDULER_INTERVAL_SECONDS)
    while True:
        try:
            async with async_session() as db:
                organizacoes = (await db.execute(select(Organizacao.id))).scalars().all()
            for organizacao_id in organizacoes:
                await _processar_organizacao(organizacao_id)
        except asyncio.CancelledError:
            logger.info("Agendador encerrado")
            raise
        except Exception:
            logger.exception("Falha no ciclo do agendador")
        await asyncio.sleep(settings.SCHEDULER_INTERVAL_SECONDS)
