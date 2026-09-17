"""Regras das tarefas da demanda (§11, §20–§26).

Três ideias organizam este módulo:

1. **Encaminhar não transfere a demanda.** Quem manda a tarefa continua
   responsável; o destinatário responde pela tarefa. Quando a tarefa exige
   retorno, ela volta ao remetente ao ser concluída.
2. **Toda passagem de mãos vira registro.** `TarefaMovimentacao` guarda de
   quem, para quem, quando e por quê — é dali que saem os tempos por setor.
3. **Bloqueio é explícito.** Uma tarefa com dependência pendente não inicia nem
   conclui, e o sistema diz qual dependência está segurando.
"""

import uuid
from datetime import date, datetime, timezone

from fastapi import HTTPException, status as http_status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.models.demanda import Demanda
from app.models.enums import (
    StatusTarefa,
    TipoEvento,
    TipoMovimentacaoTarefa,
    TipoTarefa,
)
from app.models.tarefa import Tarefa
from app.models.tarefa_movimentacao import TarefaMovimentacao
from app.models.planejamento_demanda import AusenciaSubstituicao
from app.models.user import User
from app.services.demandas import marcar_movimentacao
from app.services.timeline import registrar_evento


def agora() -> datetime:
    return datetime.now(timezone.utc)


class RegraTarefaError(HTTPException):
    """Erro de regra de negócio da tarefa — sempre com mensagem para o usuário."""

    def __init__(self, detail, status_code: int = http_status.HTTP_409_CONFLICT):
        super().__init__(status_code=status_code, detail=detail)


# ── Consulta ────────────────────────────────────────────────────────────────

async def get_tarefa_da_demanda(
    db: AsyncSession, demanda: Demanda, tarefa_id: uuid.UUID
) -> Tarefa:
    """Carrega a tarefa garantindo que ela pertence à demanda já autorizada."""
    tarefa = (
        await db.execute(
            select(Tarefa)
            .where(
                Tarefa.id == tarefa_id,
                Tarefa.demanda_id == demanda.id,
                Tarefa.deleted_at.is_(None),
            )
            .options(
                selectinload(Tarefa.dependencias),
                selectinload(Tarefa.subtarefas),
                selectinload(Tarefa.anexos),
                selectinload(Tarefa.comentarios),
            )
            .execution_options(populate_existing=True)
        )
    ).scalar_one_or_none()
    if tarefa is None:
        raise HTTPException(
            status_code=http_status.HTTP_404_NOT_FOUND, detail="Tarefa não encontrada"
        )
    return tarefa


async def dependencias_pendentes(db: AsyncSession, tarefa: Tarefa) -> list[str]:
    """Títulos das tarefas que ainda seguram esta (§26)."""
    ids = [d.depende_de_id for d in tarefa.dependencias]
    if not ids:
        return []
    pendentes = (
        await db.execute(
            select(Tarefa.titulo).where(
                Tarefa.id.in_(ids),
                Tarefa.deleted_at.is_(None),
                Tarefa.status != StatusTarefa.CONCLUIDA.value,
            )
        )
    ).scalars().all()
    return list(pendentes)


async def subtarefas_abertas(db: AsyncSession, tarefa: Tarefa) -> int:
    resultado = await db.execute(
        select(Tarefa.id).where(
            Tarefa.tarefa_pai_id == tarefa.id,
            Tarefa.deleted_at.is_(None),
            Tarefa.status.not_in(
                (StatusTarefa.CONCLUIDA.value, StatusTarefa.CANCELADA.value)
            ),
        )
    )
    return len(resultado.scalars().all())


# ── Movimentação ────────────────────────────────────────────────────────────

async def registrar_movimentacao(
    db: AsyncSession,
    tarefa: Tarefa,
    tipo: TipoMovimentacaoTarefa,
    registrado_por: User,
    *,
    para_user_id: uuid.UUID | None = None,
    para_setor_id: uuid.UUID | None = None,
    motivo: str | None = None,
    prazo: datetime | None = None,
    exige_retorno: bool = True,
) -> TarefaMovimentacao:
    """Fecha a passagem anterior e abre a nova."""
    anterior = (
        await db.execute(
            select(TarefaMovimentacao)
            .where(
                TarefaMovimentacao.tarefa_id == tarefa.id,
                TarefaMovimentacao.encerrado_em.is_(None),
            )
            .order_by(TarefaMovimentacao.created_at.desc())
        )
    ).scalars().first()
    if anterior is not None:
        anterior.encerrado_em = agora()

    movimentacao = TarefaMovimentacao(
        tarefa_id=tarefa.id,
        demanda_id=tarefa.demanda_id,
        tipo=tipo,
        de_user_id=tarefa.atribuida_a_id,
        de_setor_id=tarefa.setor_destino_id,
        para_user_id=para_user_id,
        para_setor_id=para_setor_id,
        motivo=motivo,
        prazo=prazo,
        exige_retorno=exige_retorno,
        registrado_por_id=registrado_por.id,
    )
    db.add(movimentacao)
    await db.flush()
    return movimentacao


# ── Criação ─────────────────────────────────────────────────────────────────

async def criar_tarefa(
    db: AsyncSession,
    demanda: Demanda,
    dados: dict,
    autor: User,
    *,
    tipo: TipoTarefa = TipoTarefa.EXECUCAO,
    tarefa_pai: Tarefa | None = None,
    exige_aceite: bool = True,
) -> Tarefa:
    destinatario_id = dados.get("atribuida_a_id")
    titular_ausente_id = None
    # A ausência só redireciona atribuições novas. Tarefas já existentes não
    # são alteradas silenciosamente e a titularidade fica gravada no evento.
    if destinatario_id:
        ausencia = await db.scalar(
            select(AusenciaSubstituicao).where(
                AusenciaSubstituicao.organization_id == demanda.organization_id,
                AusenciaSubstituicao.titular_id == destinatario_id,
                AusenciaSubstituicao.inicio <= date.today(),
                AusenciaSubstituicao.fim >= date.today(),
                AusenciaSubstituicao.deleted_at.is_(None),
            ).order_by(AusenciaSubstituicao.created_at.desc())
        )
        if ausencia:
            titular_ausente_id, destinatario_id = destinatario_id, ausencia.substituto_id
    setor_destino_id = dados.get("setor_destino_id")
    if destinatario_id is None and setor_destino_id is None:
        raise RegraTarefaError(
            "Informe ao menos o setor ou a pessoa que receberá a tarefa",
            422,
        )

    tarefa = Tarefa(
        demanda_id=demanda.id,
        convenio_id=None,
        etapa_id=dados.get("etapa_id"),
        titulo=dados["titulo"],
        descricao=dados.get("descricao"),
        criada_por_id=autor.id,
        solicitante_id=autor.id,
        atribuida_a_id=destinatario_id,
        setor_destino_id=setor_destino_id,
        setor_origem_id=demanda.setor_atual_id,
        tipo=tipo,
        tarefa_pai_id=tarefa_pai.id if tarefa_pai else None,
        prioridade=dados.get("prioridade") or demanda.prioridade,
        prazo=dados.get("prazo"),
        prazo_interno=dados.get("prazo_interno"),
        exige_retorno=dados.get("exige_retorno", True),
        exige_documento=dados.get("exige_documento", False),
        exige_comentario=dados.get("exige_comentario", False),
        exige_aprovacao=dados.get("exige_aprovacao", False),
        permite_reencaminhar=dados.get("permite_reencaminhar", True),
        recorrente=dados.get("recorrente", False),
        intervalo_recorrencia_dias=dados.get("intervalo_recorrencia_dias"),
        status=(
            StatusTarefa.AGUARDANDO_ACEITE if exige_aceite else StatusTarefa.A_FAZER
        ),
    )
    db.add(tarefa)
    await db.flush()

    await registrar_movimentacao(
        db,
        tarefa,
        TipoMovimentacaoTarefa.ATRIBUICAO,
        autor,
        para_user_id=destinatario_id,
        para_setor_id=setor_destino_id,
        prazo=tarefa.prazo,
        exige_retorno=tarefa.exige_retorno,
    )
    await registrar_evento(
        db,
        tipo_evento=TipoEvento.TAREFA_CRIADA,
        ator_id=autor.id,
        descricao=f"Tarefa criada: {tarefa.titulo}",
        demanda_id=demanda.id,
        tarefa_id=tarefa.id,
        metadados={"tipo": TipoTarefa(tipo).value, "prazo": str(tarefa.prazo), "titular_ausente_id": str(titular_ausente_id) if titular_ausente_id else None},
    )
    await marcar_movimentacao(demanda)
    return tarefa


# ── Transições ──────────────────────────────────────────────────────────────

def _transicionar(tarefa: Tarefa, destino: StatusTarefa) -> None:
    try:
        StatusTarefa(tarefa.status).assert_transition(destino)
    except ValueError as erro:
        raise RegraTarefaError(str(erro)) from erro
    tarefa.status = destino


async def aceitar(db: AsyncSession, tarefa: Tarefa, user: User) -> None:
    """Marca o recebimento — daí sai o tempo entre encaminhar e ler (§21)."""
    _transicionar(tarefa, StatusTarefa.RECEBIDA)
    tarefa.data_aceite = agora()
    aberta = (
        await db.execute(
            select(TarefaMovimentacao)
            .where(
                TarefaMovimentacao.tarefa_id == tarefa.id,
                TarefaMovimentacao.encerrado_em.is_(None),
            )
            .order_by(TarefaMovimentacao.created_at.desc())
        )
    ).scalars().first()
    if aberta is not None and aberta.recebido_em is None:
        aberta.recebido_em = tarefa.data_aceite


async def iniciar(db: AsyncSession, tarefa: Tarefa, user: User) -> None:
    pendentes = await dependencias_pendentes(db, tarefa)
    if pendentes:
        raise RegraTarefaError(
            {"detail": "Tarefa bloqueada por dependência", "bloqueada_por": pendentes}
        )
    _transicionar(tarefa, StatusTarefa.EM_ANDAMENTO)
    tarefa.motivo_espera = None
    if tarefa.data_aceite is None:
        tarefa.data_aceite = agora()


async def colocar_em_espera(
    tarefa: Tarefa, destino: StatusTarefa, motivo: str
) -> None:
    if destino not in StatusTarefa.esperas():
        raise RegraTarefaError(
            "Estado de espera inválido", 422
        )
    _transicionar(tarefa, destino)
    tarefa.motivo_espera = motivo


async def entregar(db: AsyncSession, tarefa: Tarefa, user: User) -> list[str]:
    """Entrega para revisão. Devolve a lista de exigências não cumpridas."""
    faltas: list[str] = []
    if tarefa.exige_documento and not [a for a in tarefa.anexos if a.deleted_at is None]:
        faltas.append("É obrigatório anexar ao menos um documento")
    if tarefa.exige_comentario and not tarefa.comentarios:
        faltas.append("É obrigatório registrar um comentário")
    abertas = await subtarefas_abertas(db, tarefa)
    if abertas:
        faltas.append(f"{abertas} subtarefa(s) ainda em aberto")
    if faltas:
        raise RegraTarefaError({"detail": "Tarefa não pode ser entregue", "pendencias": faltas})

    _transicionar(tarefa, StatusTarefa.ENTREGUE)
    tarefa.data_entrega = agora()
    return faltas


async def devolver(db: AsyncSession, tarefa: Tarefa, user: User, motivo: str) -> None:
    """Devolve para correção — motivo é obrigatório e fica no histórico (§22)."""
    _transicionar(tarefa, StatusTarefa.DEVOLVIDA)
    tarefa.motivo_devolucao = motivo
    await registrar_movimentacao(
        db,
        tarefa,
        TipoMovimentacaoTarefa.DEVOLUCAO,
        user,
        para_user_id=tarefa.atribuida_a_id,
        para_setor_id=tarefa.setor_destino_id,
        motivo=motivo,
        exige_retorno=True,
    )


async def concluir(
    db: AsyncSession, tarefa: Tarefa, user: User, resultado: str | None
) -> None:
    pendentes = await dependencias_pendentes(db, tarefa)
    if pendentes:
        raise RegraTarefaError(
            {"detail": "Tarefa bloqueada por dependência", "bloqueada_por": pendentes}
        )
    abertas = await subtarefas_abertas(db, tarefa)
    if abertas:
        raise RegraTarefaError(
            {"detail": f"{abertas} subtarefa(s) ainda em aberto", "pendencias": []}
        )
    if tarefa.exige_documento and not [a for a in tarefa.anexos if a.deleted_at is None]:
        raise RegraTarefaError(
            {"detail": "Tarefa exige documento anexado", "pendencias": []}
        )

    _transicionar(tarefa, StatusTarefa.CONCLUIDA)
    tarefa.data_conclusao = agora()
    tarefa.concluida_por_id = user.id
    tarefa.resultado = resultado

    aberta = (
        await db.execute(
            select(TarefaMovimentacao)
            .where(
                TarefaMovimentacao.tarefa_id == tarefa.id,
                TarefaMovimentacao.encerrado_em.is_(None),
            )
            .order_by(TarefaMovimentacao.created_at.desc())
        )
    ).scalars().first()
    if aberta is not None:
        aberta.encerrado_em = tarefa.data_conclusao

    # Exigindo retorno, a tarefa volta a quem pediu (§20): é o que evita a
    # demanda "sumir" no setor que só executou uma parte dela.
    if tarefa.exige_retorno and tarefa.solicitante_id:
        db.add(
            TarefaMovimentacao(
                tarefa_id=tarefa.id,
                demanda_id=tarefa.demanda_id,
                tipo=TipoMovimentacaoTarefa.RETORNO,
                de_user_id=tarefa.atribuida_a_id,
                de_setor_id=tarefa.setor_destino_id,
                para_user_id=tarefa.solicitante_id,
                para_setor_id=tarefa.setor_origem_id,
                motivo=resultado,
                exige_retorno=False,
                registrado_por_id=user.id,
                encerrado_em=tarefa.data_conclusao,
            )
        )


async def encaminhar(
    db: AsyncSession,
    tarefa: Tarefa,
    user: User,
    *,
    para_user_id: uuid.UUID | None,
    para_setor_id: uuid.UUID | None,
    motivo: str | None,
    prazo: datetime | None,
    exige_retorno: bool,
) -> None:
    """Passa a tarefa a outro setor/pessoa, mantendo o histórico (§20)."""
    if not tarefa.permite_reencaminhar:
        raise RegraTarefaError("Esta tarefa não permite reencaminhamento")
    if StatusTarefa(tarefa.status) in (StatusTarefa.CONCLUIDA, StatusTarefa.CANCELADA):
        raise RegraTarefaError("Tarefa encerrada não pode ser encaminhada")
    if para_user_id is None and para_setor_id is None:
        raise RegraTarefaError(
            "Informe o destino do encaminhamento",
            422,
        )

    await registrar_movimentacao(
        db,
        tarefa,
        TipoMovimentacaoTarefa.ENCAMINHAMENTO,
        user,
        para_user_id=para_user_id,
        para_setor_id=para_setor_id,
        motivo=motivo,
        prazo=prazo,
        exige_retorno=exige_retorno,
    )
    tarefa.atribuida_a_id = para_user_id
    tarefa.setor_origem_id = tarefa.setor_destino_id
    tarefa.setor_destino_id = para_setor_id
    tarefa.exige_retorno = exige_retorno
    if prazo is not None:
        tarefa.prazo = prazo
    tarefa.status = StatusTarefa.AGUARDANDO_ACEITE
    tarefa.data_aceite = None
