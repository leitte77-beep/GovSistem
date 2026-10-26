"""Utilidades da agenda, recepção, fila e painéis (B.6-008, B.6-045…047)."""

from __future__ import annotations

import hashlib
import hmac
import uuid
from datetime import date, datetime, time, timedelta, timezone
from zoneinfo import ZoneInfo

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.core.errors import NotFound, Unprocessable
from app.core.redis import publicar
from app.models.agenda import (
    Agenda,
    Agendamento,
    FilaAtendimento,
    NivelClassificacaoRisco,
    PainelChamada,
    ProtocoloClassificacaoRisco,
)
from app.models.nucleo import Organizacao, Setor, Usuario
from app.models.rede import Prioridade

PARTICULAS_NOME = {"de", "da", "do", "das", "dos", "e", "del", "van", "von"}

REGRA_ORDENACAO = [
    {
        "campo": "classificacao_risco",
        "direcao": "asc",
        "descricao": (
            "Nível de risco do protocolo da unidade (ordem crescente; sem "
            "classificação vai ao final)."
        ),
    },
    {
        "campo": "prioridade_legal",
        "direcao": "asc",
        "descricao": (
            "Prioridade legal configurada pelo tenant vem antes da prioridade "
            "eletiva; empate usa a ordem da prioridade."
        ),
    },
    {
        "campo": "entrada_em",
        "direcao": "asc",
        "descricao": "Primeiro a entrar na fila é chamado primeiro (FIFO).",
    },
]


def _chave_codigo() -> bytes:
    chave = settings.SECRET_KEY.get_secret_value().encode("utf-8")
    return hashlib.sha256(b"govsaude:codigo-acesso:" + chave).digest()


def gerar_codigo(tipo: str, identificador: uuid.UUID) -> str:
    """Gera token opaco para cartão/comprovante; não contém CPF, CNS ou nome."""
    base = f"{tipo.upper()}:{identificador}"
    assinatura = hmac.new(_chave_codigo(), base.encode("utf-8"), hashlib.sha256).hexdigest()[:16]
    return f"GS4-{tipo.upper()}-{identificador}-{assinatura}"


def decodificar_codigo(codigo: str) -> tuple[str, uuid.UUID]:
    partes = (codigo or "").strip().split("-", 2)
    if len(partes) != 3 or partes[0] != "GS4":
        raise NotFound("Código de acesso inválido ou não encontrado.")
    tipo = partes[1].upper()
    if tipo not in {"AGD", "CID"}:
        raise NotFound("Código de acesso inválido ou não encontrado.")
    try:
        identificador_txt, assinatura = partes[2].rsplit("-", 1)
        identificador = uuid.UUID(identificador_txt)
    except ValueError as exc:
        raise NotFound("Código de acesso inválido ou não encontrado.") from exc
    esperado = gerar_codigo(tipo, identificador).rsplit("-", 1)[-1]
    if not hmac.compare_digest(esperado, assinatura):
        raise NotFound("Código de acesso inválido ou não encontrado.")
    return tipo, identificador


def abreviar_nome(nome: str | None) -> str:
    partes = [parte for parte in (nome or "").strip().split() if parte]
    if not partes:
        return "Cidadão"
    primeiro = partes[0].capitalize()
    iniciais = [
        f"{parte[0].upper()}."
        for parte in partes[1:]
        if parte.lower() not in PARTICULAS_NOME
    ]
    return " ".join([primeiro, *iniciais]) or primeiro


async def fuso_organizacao(db: AsyncSession, tenant_id: uuid.UUID) -> ZoneInfo:
    organizacao = await db.scalar(select(Organizacao).where(Organizacao.id == tenant_id))
    nome = (organizacao.fuso_horario if organizacao else None) or settings.DEFAULT_TIMEZONE
    try:
        return ZoneInfo(nome)
    except Exception:  # noqa: BLE001 - fuso inválido no cadastro não derruba a API
        return ZoneInfo(settings.DEFAULT_TIMEZONE)


def local_para_utc(valor: datetime, fuso: ZoneInfo) -> datetime:
    if valor.tzinfo is None:
        valor = valor.replace(tzinfo=fuso)
    return valor.astimezone(timezone.utc)


def utc_para_local(valor: datetime, fuso: ZoneInfo) -> datetime:
    if valor.tzinfo is None:
        valor = valor.replace(tzinfo=timezone.utc)
    return valor.astimezone(fuso)


def dia_semana(data: date) -> int:
    return data.weekday()


def combinar_local(data: date, hora: time, fuso: ZoneInfo) -> datetime:
    return datetime.combine(data, hora, tzinfo=fuso).astimezone(timezone.utc)


def intervalo_local(
    data_inicio: date, data_fim: date, fuso: ZoneInfo
) -> tuple[datetime, datetime]:
    inicio = datetime.combine(data_inicio, time.min, tzinfo=fuso).astimezone(timezone.utc)
    fim = datetime.combine(data_fim + timedelta(days=1), time.min, tzinfo=fuso).astimezone(
        timezone.utc
    )
    return inicio, fim


def aware(valor: datetime | None) -> datetime | None:
    if valor is None:
        return None
    if valor.tzinfo is None:
        return valor.replace(tzinfo=timezone.utc)
    return valor.astimezone(timezone.utc)


def minutos_entre(inicio: datetime | None, fim: datetime | None) -> int | None:
    ini = aware(inicio)
    fim = aware(fim)
    if ini is None or fim is None:
        return None
    return max(0, int((fim - ini).total_seconds() // 60))


def tempos_fila(fila: FilaAtendimento, agora: datetime | None = None) -> dict:
    agora_atual = aware(agora or datetime.now(timezone.utc))
    entrada = aware(fila.entrada_em)
    chamado = aware(fila.chamado_em)
    triagem_inicio = aware(fila.triagem_inicio_em)
    triagem_fim = aware(fila.triagem_fim_em)
    atendimento_inicio = aware(fila.atendimento_inicio_em)
    atendimento_fim = aware(fila.atendimento_fim_em)

    espera = minutos_entre(entrada, chamado or agora_atual)
    triagem = minutos_entre(triagem_inicio, triagem_fim)
    referencia_atendimento = triagem_fim or entrada
    espera_atendimento = minutos_entre(referencia_atendimento, atendimento_inicio or agora_atual)
    atendimento = minutos_entre(atendimento_inicio, atendimento_fim)
    total = minutos_entre(entrada, atendimento_fim or agora_atual)
    alvo = None
    if fila.nivel_risco is not None:
        alvo = fila.nivel_risco.tempo_alvo_minutos
    dentro_alvo = None
    if alvo is not None and espera is not None:
        dentro_alvo = espera <= alvo
    return {
        "espera_minutos": espera,
        "triagem_minutos": triagem,
        "espera_atendimento_minutos": espera_atendimento,
        "atendimento_minutos": atendimento,
        "total_minutos": total,
        "tempo_alvo_minutos": alvo,
        "dentro_do_tempo_alvo": dentro_alvo,
    }


def chave_ordenacao(fila: FilaAtendimento) -> tuple:
    legal = 0 if fila.prioridade_legal else 1
    entrada = aware(fila.entrada_em) or datetime.now(timezone.utc)
    return (fila.nivel_ordem, legal, fila.prioridade_ordem, entrada, str(fila.id))


def ordenar_fila(itens: list[FilaAtendimento]) -> list[FilaAtendimento]:
    return sorted(itens, key=chave_ordenacao)


def ranking_fila(fila: FilaAtendimento) -> list[dict]:
    entrada = aware(fila.entrada_em)
    return [
        {
            "campo": "classificacao_risco",
            "valor": fila.nivel_ordem,
            "ordem": fila.nivel_ordem,
            "rotulo": fila.nivel_risco.rotulo if fila.nivel_risco else "Sem classificação",
        },
        {
            "campo": "prioridade_legal",
            "valor": fila.prioridade_legal,
            "ordem": fila.prioridade_ordem,
            "rotulo": fila.prioridade.rotulo if fila.prioridade else "Sem prioridade",
        },
        {
            "campo": "entrada_em",
            "valor": entrada.isoformat() if entrada else None,
        },
    ]


async def obter_agenda(
    db: AsyncSession, tenant_id: uuid.UUID, agenda_id: uuid.UUID
) -> Agenda:
    registro = await db.scalar(
        select(Agenda).where(Agenda.id == agenda_id, Agenda.tenant_id == tenant_id)
    )
    if registro is None:
        raise NotFound("Agenda não encontrada.")
    return registro


async def obter_agendamento(
    db: AsyncSession, tenant_id: uuid.UUID, agendamento_id: uuid.UUID
) -> Agendamento:
    registro = await db.scalar(
        select(Agendamento).where(
            Agendamento.id == agendamento_id, Agendamento.tenant_id == tenant_id
        )
    )
    if registro is None:
        raise NotFound("Agendamento não encontrado.")
    return registro


async def obter_fila(
    db: AsyncSession, tenant_id: uuid.UUID, fila_id: uuid.UUID
) -> FilaAtendimento:
    registro = await db.scalar(
        select(FilaAtendimento).where(
            FilaAtendimento.id == fila_id, FilaAtendimento.tenant_id == tenant_id
        )
    )
    if registro is None:
        raise NotFound("Registro da fila não encontrado.")
    return registro


async def obter_protocolo(
    db: AsyncSession, tenant_id: uuid.UUID, protocolo_id: uuid.UUID
) -> ProtocoloClassificacaoRisco:
    registro = await db.scalar(
        select(ProtocoloClassificacaoRisco).where(
            ProtocoloClassificacaoRisco.id == protocolo_id,
            ProtocoloClassificacaoRisco.tenant_id == tenant_id,
        )
    )
    if registro is None:
        raise NotFound("Protocolo de classificação de risco não encontrado.")
    return registro


async def obter_nivel(
    db: AsyncSession, tenant_id: uuid.UUID, nivel_id: uuid.UUID
) -> NivelClassificacaoRisco:
    registro = await db.scalar(
        select(NivelClassificacaoRisco).where(
            NivelClassificacaoRisco.id == nivel_id,
            NivelClassificacaoRisco.tenant_id == tenant_id,
        )
    )
    if registro is None:
        raise NotFound("Nível de classificação de risco não encontrado.")
    return registro


async def obter_prioridade(
    db: AsyncSession, tenant_id: uuid.UUID, prioridade_id: uuid.UUID
) -> Prioridade:
    registro = await db.scalar(
        select(Prioridade).where(
            Prioridade.id == prioridade_id, Prioridade.tenant_id == tenant_id
        )
    )
    if registro is None:
        raise NotFound("Prioridade não encontrada.")
    return registro


async def obter_painel(
    db: AsyncSession, tenant_id: uuid.UUID, painel_id: uuid.UUID
) -> PainelChamada:
    registro = await db.scalar(
        select(PainelChamada).where(
            PainelChamada.id == painel_id, PainelChamada.tenant_id == tenant_id
        )
    )
    if registro is None:
        raise NotFound("Painel de chamada não encontrado.")
    return registro


async def obter_setor_da_unidade(
    db: AsyncSession,
    tenant_id: uuid.UUID,
    estabelecimento_id: uuid.UUID,
    setor_id: uuid.UUID,
) -> Setor:
    registro = await db.scalar(
        select(Setor).where(
            Setor.id == setor_id,
            Setor.tenant_id == tenant_id,
            Setor.estabelecimento_id == estabelecimento_id,
        )
    )
    if registro is None:
        raise Unprocessable(
            "O setor não pertence ao estabelecimento informado.",
            code="setor_estabelecimento",
            errors=[
                {
                    "campo": "setor_id",
                    "mensagem": "Selecione um setor da mesma unidade.",
                    "codigo_regra": "setor_estabelecimento",
                }
            ],
        )
    return registro


async def publicar_evento(
    tenant_id: uuid.UUID,
    estabelecimento_id: uuid.UUID,
    setor_id: uuid.UUID,
    evento: dict,
) -> None:
    if settings.APP_ENV == "test" and not settings.REDIS_URL:
        return
    try:
        await publicar(str(tenant_id), str(estabelecimento_id), str(setor_id), evento)
    except Exception:  # noqa: BLE001 - Redis é opcional em dev/teste
        return


def evento_fila(
    tipo: str, fila: FilaAtendimento, *, extra: dict | None = None
) -> dict:
    return {
        "tipo": tipo,
        "fila_id": str(fila.id),
        "cidadao_id": str(fila.cidadao_id),
        "situacao": fila.situacao,
        "nome_abreviado": fila.nome_abreviado,
        "entrada_em": aware(fila.entrada_em).isoformat() if fila.entrada_em else None,
        "chamado_em": aware(fila.chamado_em).isoformat() if fila.chamado_em else None,
        **(extra or {}),
    }


def nome_exibicao(cidadao) -> str:
    return cidadao.nome_social or cidadao.nome


def usuario_escopo(usuario: Usuario) -> uuid.UUID:
    return usuario.tenant_id
