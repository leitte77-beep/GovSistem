"""Motor de prazos, alertas e escalonamento (§35–§40).

A varredura roda periodicamente e é **idempotente**: cada situação vira um
alerta de chave determinística, então repetir a passagem não duplica nada e
uma falha no meio pode ser simplesmente repetida. Quando a situação deixa de
existir — a tarefa foi concluída, a demanda voltou a andar —, o próprio motor
fecha o alerta.

O escalonamento (§38) sobe degrau a degrau conforme o atraso: responsável →
chefia do setor → responsável geral da demanda → gabinete. Cada degrau dispara
uma vez só, porque a chave do alerta inclui o nível.
"""

import uuid
from dataclasses import dataclass, field
from datetime import date, datetime, timezone

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.models.alerta import Alerta, AlertaConfig
from app.models.demanda import Demanda
from app.models.enums import (
    SeveridadeAlerta,
    StatusEtapa,
    StatusTarefa,
    TipoAlerta,
    TipoNotificacao,
)
from app.models.etapa import Etapa
from app.models.protocolo_externo import ProtocoloExterno
from app.models.role import Role
from app.models.setor import Setor
from app.models.tarefa import Tarefa
from app.models.user import User
from app.models.user_role import UserRole
from app.services.calendario import carregar_calendario
from app.services.notifications import criar_notificacao
from app.services.timeline import registrar_evento

# Perfis que recebem o último degrau do escalonamento.
ROLES_GABINETE = ("ADMIN", "ASSESSOR")


@dataclass
class Resultado:
    alertas_criados: int = 0
    alertas_resolvidos: int = 0
    notificacoes: int = 0
    escalonamentos: int = 0
    chaves_vivas: set[str] = field(default_factory=set)

    def resumo(self) -> dict:
        return {
            "alertas_criados": self.alertas_criados,
            "alertas_resolvidos": self.alertas_resolvidos,
            "notificacoes": self.notificacoes,
            "escalonamentos": self.escalonamentos,
        }


def _agora() -> datetime:
    return datetime.now(timezone.utc)


def _data(momento: datetime | None) -> date | None:
    if momento is None:
        return None
    if momento.tzinfo is None:
        momento = momento.replace(tzinfo=timezone.utc)
    return momento.astimezone(timezone.utc).date()


def _severidade_por_prazo(dias_restantes: int) -> SeveridadeAlerta:
    if dias_restantes < 0:
        return SeveridadeAlerta.CRITICO
    if dias_restantes == 0:
        return SeveridadeAlerta.URGENTE
    if dias_restantes <= 3:
        return SeveridadeAlerta.IMPORTANTE
    if dias_restantes <= 7:
        return SeveridadeAlerta.AVISO
    return SeveridadeAlerta.INFORMACAO


async def obter_config(db: AsyncSession, organization_id: uuid.UUID) -> AlertaConfig:
    config = (
        await db.execute(
            select(AlertaConfig).where(AlertaConfig.organization_id == organization_id)
        )
    ).scalar_one_or_none()
    if config is None:
        config = AlertaConfig.padrao(organization_id)
        db.add(config)
        await db.flush()
    return config


class Varredura:
    """Uma passagem completa do motor sobre uma organização."""

    def __init__(
        self,
        db: AsyncSession,
        organization_id: uuid.UUID,
        config: AlertaConfig,
        calendario,
    ):
        self.db = db
        self.org_id = organization_id
        self.config = config
        self.calendario = calendario
        self.hoje = _agora().date()
        self.resultado = Resultado()
        self._existentes: dict[str, Alerta] = {}

    async def carregar_alertas_abertos(self) -> None:
        abertos = (
            await self.db.execute(
                select(Alerta).where(
                    Alerta.organization_id == self.org_id,
                    Alerta.resolvido_em.is_(None),
                )
            )
        ).scalars().all()
        self._existentes = {a.chave: a for a in abertos}

    async def registrar(
        self,
        chave: str,
        tipo: TipoAlerta,
        severidade: SeveridadeAlerta,
        titulo: str,
        *,
        detalhe: str | None = None,
        demanda_id: uuid.UUID | None = None,
        tarefa_id: uuid.UUID | None = None,
        responsavel_id: uuid.UUID | None = None,
        setor_id: uuid.UUID | None = None,
        metadados: dict | None = None,
        notificar: bool = True,
    ) -> Alerta:
        """Cria o alerta, ou apenas o mantém vivo se já existir."""
        self.resultado.chaves_vivas.add(chave)

        existente = self._existentes.get(chave)
        if existente is not None:
            # A situação pode ter piorado desde a última passagem.
            if SeveridadeAlerta.peso(severidade) > SeveridadeAlerta.peso(
                existente.severidade
            ):
                existente.severidade = severidade
                existente.titulo = titulo
                existente.detalhe = detalhe
            return existente

        alerta = Alerta(
            organization_id=self.org_id,
            chave=chave,
            tipo=tipo,
            severidade=severidade,
            titulo=titulo,
            detalhe=detalhe,
            demanda_id=demanda_id,
            tarefa_id=tarefa_id,
            responsavel_id=responsavel_id,
            setor_id=setor_id,
            metadados=metadados,
        )
        self.db.add(alerta)
        await self.db.flush()
        self._existentes[chave] = alerta
        self.resultado.alertas_criados += 1

        # Eventos de prazo também entram no barramento: assim uma regra pode
        # reagir a "faltam 5 dias" ou "venceu" sem depender de polling da UI.
        if demanda_id and tipo in (TipoAlerta.PRAZO_PROXIMO, TipoAlerta.PRAZO_VENCIDO, TipoAlerta.TAREFA_ATRASADA):
            demanda = await self.db.get(Demanda, demanda_id)
            if demanda is not None:
                await registrar_evento(
                    self.db,
                    "PRAZO_VENCIDO" if tipo != TipoAlerta.PRAZO_PROXIMO else "PRAZO_PROXIMO",
                    demanda.responsavel_geral_id,
                    titulo,
                    demanda_id=demanda_id,
                    tarefa_id=tarefa_id,
                    metadados=metadados,
                )

        if notificar and responsavel_id is not None:
            await criar_notificacao(
                self.db,
                destinatario_id=responsavel_id,
                tipo=(
                    TipoNotificacao.PRAZO_VENCIDO
                    if tipo in (TipoAlerta.PRAZO_VENCIDO, TipoAlerta.TAREFA_ATRASADA)
                    else TipoNotificacao.PRAZO_PROXIMO
                ),
                mensagem=titulo,
                demanda_id=demanda_id,
                tarefa_id=tarefa_id,
            )
            self.resultado.notificacoes += 1
        return alerta

    async def fechar_orfaos(self) -> None:
        """Fecha alertas cuja situação não apareceu mais nesta passagem."""
        agora = _agora()
        for chave, alerta in self._existentes.items():
            if chave in self.resultado.chaves_vivas:
                continue
            alerta.resolvido_em = agora
            alerta.motivo_resolucao = "Situação regularizada"
            self.resultado.alertas_resolvidos += 1

    # ── Tarefas ─────────────────────────────────────────────────────────────

    async def tarefas(self) -> None:
        abertas = [s.value for s in StatusTarefa if StatusTarefa.is_aberta(s)]
        tarefas = (
            await self.db.execute(
                select(Tarefa)
                .join(Demanda, Tarefa.demanda_id == Demanda.id)
                .where(
                    Demanda.organization_id == self.org_id,
                    Demanda.deleted_at.is_(None),
                    Demanda.concluida_em.is_(None),
                    Tarefa.deleted_at.is_(None),
                    Tarefa.status.in_(abertas),
                )
                .options(selectinload(Tarefa.demanda))
            )
        ).scalars().unique().all()

        for tarefa in tarefas:
            await self._tarefa_sem_aceite(tarefa)
            vencimento = _data(tarefa.prazo)
            if vencimento is None:
                continue
            restantes = (vencimento - self.hoje).days
            if restantes < 0:
                await self._tarefa_atrasada(tarefa, vencimento, -restantes)
            elif restantes in (self.config.marcos_prazo or []):
                await self.registrar(
                    f"tarefa:{tarefa.id}:prazo:{restantes}",
                    TipoAlerta.PRAZO_PROXIMO,
                    _severidade_por_prazo(restantes),
                    _texto_prazo(tarefa.titulo, restantes, vencimento),
                    demanda_id=tarefa.demanda_id,
                    tarefa_id=tarefa.id,
                    responsavel_id=tarefa.atribuida_a_id,
                    setor_id=tarefa.setor_destino_id,
                    metadados={"dias_restantes": restantes},
                )

    async def _tarefa_sem_aceite(self, tarefa: Tarefa) -> None:
        if tarefa.status != StatusTarefa.AGUARDANDO_ACEITE:
            return
        enviada = _data(tarefa.created_at)
        if enviada is None:
            return
        parada = self.calendario.dias_uteis_entre(enviada, self.hoje)
        if parada < self.config.dias_sem_aceite:
            return
        await self.registrar(
            f"tarefa:{tarefa.id}:sem-aceite",
            TipoAlerta.TAREFA_SEM_ACEITE,
            SeveridadeAlerta.AVISO,
            f"Tarefa '{tarefa.titulo}' não foi recebida há {parada} dia(s) útil(eis)",
            demanda_id=tarefa.demanda_id,
            tarefa_id=tarefa.id,
            responsavel_id=tarefa.atribuida_a_id,
            setor_id=tarefa.setor_destino_id,
            metadados={"dias_uteis": parada},
        )

    async def _tarefa_atrasada(
        self, tarefa: Tarefa, vencimento: date, dias_atraso: int
    ) -> None:
        await self.registrar(
            f"tarefa:{tarefa.id}:atrasada",
            TipoAlerta.TAREFA_ATRASADA,
            SeveridadeAlerta.CRITICO,
            f"Tarefa '{tarefa.titulo}' está atrasada há {dias_atraso} dia(s)",
            detalhe=f"Venceu em {vencimento.strftime('%d/%m/%Y')}",
            demanda_id=tarefa.demanda_id,
            tarefa_id=tarefa.id,
            responsavel_id=tarefa.atribuida_a_id,
            setor_id=tarefa.setor_destino_id,
            metadados={"dias_atraso": dias_atraso},
        )
        await self._escalonar(tarefa, dias_atraso)

    async def _escalonar(self, tarefa: Tarefa, dias_atraso: int) -> None:
        """Sobe a cobrança conforme o atraso cresce (§38)."""
        for degrau in self.config.escalonamento or []:
            dias = degrau.get("dias")
            alvo = degrau.get("alvo")
            if dias is None or dias_atraso < dias:
                continue
            destinatarios = await self._destinatarios(alvo, tarefa)
            for destinatario_id in destinatarios:
                chave = f"tarefa:{tarefa.id}:escalonamento:{alvo}:{destinatario_id}"
                if chave in self._existentes:
                    self.resultado.chaves_vivas.add(chave)
                    continue
                await self.registrar(
                    chave,
                    TipoAlerta.ESCALONAMENTO,
                    SeveridadeAlerta.URGENTE,
                    f"Atraso escalado: '{tarefa.titulo}' há {dias_atraso} dia(s)",
                    detalhe=f"Escalonamento para {alvo.replace('_', ' ').lower()}",
                    demanda_id=tarefa.demanda_id,
                    tarefa_id=tarefa.id,
                    responsavel_id=destinatario_id,
                    metadados={"nivel": alvo, "dias_atraso": dias_atraso},
                )
                self.resultado.escalonamentos += 1

    async def _destinatarios(self, alvo: str, tarefa: Tarefa) -> list[uuid.UUID]:
        """Resolve quem recebe cada degrau, sem repetir quem já foi cobrado."""
        if alvo == "RESPONSAVEL":
            return [tarefa.atribuida_a_id] if tarefa.atribuida_a_id else []
        if alvo == "CHEFE_SETOR":
            if not tarefa.setor_destino_id:
                return []
            chefe = (
                await self.db.execute(
                    select(Setor.responsavel_id).where(Setor.id == tarefa.setor_destino_id)
                )
            ).scalar_one_or_none()
            return [chefe] if chefe else []
        if alvo == "RESPONSAVEL_GERAL":
            demanda = tarefa.demanda
            return [demanda.responsavel_geral_id] if demanda else []
        if alvo == "GABINETE":
            usuarios = (
                await self.db.execute(
                    select(UserRole.user_id)
                    .join(Role, Role.id == UserRole.role_id)
                    .join(User, User.id == UserRole.user_id)
                    .where(
                        User.organization_id == self.org_id,
                        User.is_active.is_(True),
                        User.deleted_at.is_(None),
                        Role.name.in_(ROLES_GABINETE),
                    )
                )
            ).scalars().all()
            return list(dict.fromkeys(usuarios))
        return []

    # ── Demandas ────────────────────────────────────────────────────────────

    async def demandas(self) -> None:
        demandas = (
            await self.db.execute(
                select(Demanda).where(
                    Demanda.organization_id == self.org_id,
                    Demanda.deleted_at.is_(None),
                    Demanda.concluida_em.is_(None),
                    Demanda.is_rascunho.is_(False),
                )
            )
        ).scalars().all()

        for demanda in demandas:
            await self._prazo_da_demanda(demanda)
            await self._inatividade(demanda)
            await self._bloqueio(demanda)
            await self._followup(demanda)

    async def _prazo_da_demanda(self, demanda: Demanda) -> None:
        vencimento = _data(demanda.prazo_final)
        if vencimento is None:
            return
        restantes = (vencimento - self.hoje).days
        if restantes < 0:
            await self.registrar(
                f"demanda:{demanda.id}:vencida",
                TipoAlerta.PRAZO_VENCIDO,
                SeveridadeAlerta.CRITICO,
                f"Demanda {demanda.numero} está atrasada há {-restantes} dia(s)",
                detalhe=demanda.titulo,
                demanda_id=demanda.id,
                responsavel_id=demanda.responsavel_geral_id,
                metadados={"dias_atraso": -restantes},
            )
        elif restantes in (self.config.marcos_prazo or []):
            await self.registrar(
                f"demanda:{demanda.id}:prazo:{restantes}",
                TipoAlerta.PRAZO_PROXIMO,
                _severidade_por_prazo(restantes),
                _texto_prazo(f"Demanda {demanda.numero}", restantes, vencimento),
                detalhe=demanda.titulo,
                demanda_id=demanda.id,
                responsavel_id=demanda.responsavel_geral_id,
                metadados={"dias_restantes": restantes},
            )

    async def _inatividade(self, demanda: Demanda) -> None:
        """Demanda parada há X dias (§39) — o alerta que evita o esquecimento."""
        marcos = sorted(self.config.inatividade_dias or [], reverse=True)
        if not marcos:
            return
        parada = demanda.dias_sem_movimentacao
        alcancado = next((m for m in marcos if parada >= m), None)
        if alcancado is None:
            return
        await self.registrar(
            f"demanda:{demanda.id}:parada:{alcancado}",
            TipoAlerta.DEMANDA_PARADA,
            SeveridadeAlerta.IMPORTANTE if alcancado >= 15 else SeveridadeAlerta.AVISO,
            f"Demanda {demanda.numero} está parada há {parada} dias",
            detalhe=demanda.titulo,
            demanda_id=demanda.id,
            responsavel_id=demanda.responsavel_atual_id or demanda.responsavel_geral_id,
            setor_id=demanda.setor_atual_id,
            metadados={"dias_parada": parada, "marco": alcancado},
        )

    async def _bloqueio(self, demanda: Demanda) -> None:
        if demanda.bloqueada:
            await self.registrar(
                f"demanda:{demanda.id}:bloqueada",
                TipoAlerta.DEMANDA_BLOQUEADA,
                SeveridadeAlerta.IMPORTANTE,
                f"Demanda {demanda.numero} bloqueada",
                detalhe=demanda.bloqueio_motivo,
                demanda_id=demanda.id,
                responsavel_id=demanda.responsavel_geral_id,
            )
        if demanda.aguardando_terceiro:
            desde = _data(demanda.aguardando_desde) or self.hoje
            dias = (self.hoje - desde).days
            await self.registrar(
                f"demanda:{demanda.id}:aguardando-terceiro",
                TipoAlerta.AGUARDANDO_TERCEIRO,
                SeveridadeAlerta.AVISO if dias < 15 else SeveridadeAlerta.IMPORTANTE,
                f"Aguardando {demanda.aguardando_terceiro} há {dias} dia(s)",
                detalhe=f"Demanda {demanda.numero} — {demanda.titulo}",
                demanda_id=demanda.id,
                responsavel_id=demanda.responsavel_geral_id,
                metadados={"dias": dias},
            )

    async def _followup(self, demanda: Demanda) -> None:
        """Lembrete de cobrança marcado pelo assessor (§71, §72)."""
        if demanda.proximo_followup is None or demanda.proximo_followup > self.hoje:
            return
        await self.registrar(
            f"demanda:{demanda.id}:followup:{demanda.proximo_followup.isoformat()}",
            TipoAlerta.FOLLOWUP_DEVIDO,
            SeveridadeAlerta.IMPORTANTE,
            f"Acompanhamento previsto para hoje: demanda {demanda.numero}",
            detalhe=demanda.proxima_acao or demanda.titulo,
            demanda_id=demanda.id,
            responsavel_id=demanda.responsavel_atual_id or demanda.responsavel_geral_id,
        )

    # ── Etapas e protocolos ─────────────────────────────────────────────────

    async def etapas(self) -> None:
        etapas = (
            await self.db.execute(
                select(Etapa)
                .join(Demanda, Etapa.demanda_id == Demanda.id)
                .where(
                    Demanda.organization_id == self.org_id,
                    Demanda.deleted_at.is_(None),
                    Demanda.concluida_em.is_(None),
                    Etapa.deleted_at.is_(None),
                    Etapa.status == StatusEtapa.EM_ANDAMENTO,
                    Etapa.prazo.is_not(None),
                )
                .options(selectinload(Etapa.demanda))
            )
        ).scalars().unique().all()

        for etapa in etapas:
            vencimento = _data(etapa.prazo)
            if vencimento is None or vencimento >= self.hoje:
                continue
            atraso = (self.hoje - vencimento).days
            await self.registrar(
                f"etapa:{etapa.id}:atrasada",
                TipoAlerta.ETAPA_ATRASADA,
                SeveridadeAlerta.IMPORTANTE,
                f"Etapa '{etapa.nome}' está atrasada há {atraso} dia(s)",
                detalhe=f"Demanda {etapa.demanda.numero}" if etapa.demanda else None,
                demanda_id=etapa.demanda_id,
                responsavel_id=(
                    etapa.demanda.responsavel_geral_id if etapa.demanda else None
                ),
                setor_id=etapa.setor_responsavel_id,
                metadados={"dias_atraso": atraso},
            )

    async def protocolos(self) -> None:
        protocolos = (
            await self.db.execute(
                select(ProtocoloExterno)
                .where(
                    ProtocoloExterno.organization_id == self.org_id,
                    ProtocoloExterno.deleted_at.is_(None),
                    ProtocoloExterno.situacao.not_in(
                        ("APROVADO", "REJEITADO", "ARQUIVADO")
                    ),
                )
                .options(selectinload(ProtocoloExterno.demanda))
            )
        ).scalars().unique().all()

        for protocolo in protocolos:
            limite = protocolo.proxima_verificacao or _data(protocolo.prazo_resposta)
            if limite is None or limite > self.hoje:
                continue
            dias = (self.hoje - limite).days
            await self.registrar(
                f"protocolo:{protocolo.id}:cobranca:{limite.isoformat()}",
                TipoAlerta.PROTOCOLO_SEM_RESPOSTA,
                SeveridadeAlerta.IMPORTANTE if dias > 7 else SeveridadeAlerta.AVISO,
                f"Protocolo {protocolo.numero} ({protocolo.sistema}) sem desfecho",
                detalhe=f"Acompanhamento previsto há {dias} dia(s)",
                demanda_id=protocolo.demanda_id,
                responsavel_id=(
                    protocolo.responsavel_id
                    or (protocolo.demanda.responsavel_geral_id if protocolo.demanda else None)
                ),
                metadados={"dias": dias, "sistema": protocolo.sistema},
            )


def _texto_prazo(titulo: str, restantes: int, vencimento: date) -> str:
    quando = vencimento.strftime("%d/%m/%Y")
    if restantes == 0:
        return f"{titulo} vence hoje ({quando})"
    if restantes == 1:
        return f"{titulo} vence amanhã ({quando})"
    return f"{titulo} vence em {restantes} dias ({quando})"


async def varrer_organizacao(
    db: AsyncSession, organization_id: uuid.UUID
) -> dict:
    """Passagem completa do motor sobre uma organização. Idempotente."""
    config = await obter_config(db, organization_id)
    if not config.ativo:
        return Resultado().resumo()

    calendario = await carregar_calendario(
        db,
        organization_id,
        ponto_facultativo_e_util=config.ponto_facultativo_e_util,
    )
    varredura = Varredura(db, organization_id, config, calendario)
    await varredura.carregar_alertas_abertos()
    await varredura.tarefas()
    await varredura.demandas()
    await varredura.etapas()
    await varredura.protocolos()
    await varredura.fechar_orfaos()

    agora = _agora()
    config.ultima_varredura_em = agora
    config.ultima_varredura_data = agora.date()
    await db.commit()
    return varredura.resultado.resumo()
