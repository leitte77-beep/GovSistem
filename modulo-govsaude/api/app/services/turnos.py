"""Escalas e plantões com detecção de sobreposição (B.12-012)."""

from __future__ import annotations

import uuid
from datetime import date, datetime, time, timedelta

from sqlalchemy import func, select, text
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.errors import Conflict, NotFound, Unprocessable
from app.core.permissoes import Permissao
from app.core.security import agora
from app.models.enums import (
    AcaoAuditoria,
    SituacaoTurno,
    TipoEscala,
    TipoPlantao,
)
from app.models.nucleo import Estabelecimento, Usuario
from app.models.rede import Escala, Plantao
from app.schemas.rede import TurnoCancelamento, TurnoCreate, TurnoUpdate
from app.services.auditoria import instantaneo, registrar
from app.services.paginacao import aplicar_cursor, codificar
from app.services.rede_comum import (
    conferir_versao,
    escopos_estabelecimento,
    exigir_acesso_estabelecimento,
    obter_equipe,
    obter_estabelecimento,
    obter_profissional,
    obter_setor,
)

MODELOS = {"escala": Escala, "plantao": Plantao}
TIPOS_VALIDOS = {
    Escala: {item.value for item in TipoEscala},
    Plantao: {item.value for item in TipoPlantao},
}


def _validar_tipo(modelo, tipo: str) -> str:
    valor = (tipo or "").strip().upper()
    if valor not in TIPOS_VALIDOS[modelo]:
        raise Unprocessable(
            "Tipo de turno inválido.",
            errors=[
                {
                    "campo": "tipo",
                    "mensagem": f"Use um de {sorted(TIPOS_VALIDOS[modelo])}.",
                    "codigo_regra": "tipo_turno",
                }
            ],
        )
    return valor


def _intervalo(data_ref: date, inicio: time, fim: time) -> tuple[datetime, datetime]:
    if inicio == fim:
        raise Unprocessable(
            "Horário de início e fim não podem ser iguais.",
            errors=[
                {
                    "campo": "hora_fim",
                    "mensagem": "Informe um intervalo válido.",
                    "codigo_regra": "intervalo_turno",
                }
            ],
        )
    inicio_dt = datetime.combine(data_ref, inicio)
    fim_dt = datetime.combine(data_ref, fim)
    if fim_dt <= inicio_dt:
        fim_dt += timedelta(days=1)
    return inicio_dt, fim_dt


async def _validar_vinculos(
    db: AsyncSession,
    tenant_id: uuid.UUID,
    usuario: Usuario,
    *,
    estabelecimento_id: uuid.UUID,
    setor_id: uuid.UUID | None,
    equipe_id: uuid.UUID | None,
    profissional_id: uuid.UUID | None,
) -> Estabelecimento:
    estabelecimento = await obter_estabelecimento(db, tenant_id, estabelecimento_id)
    await exigir_acesso_estabelecimento(db,
        usuario, Permissao.AGENDA_GERENCIAR, estabelecimento.id
    )
    if setor_id:
        setor = await obter_setor(db, tenant_id, setor_id)
        if setor.estabelecimento_id != estabelecimento.id:
            raise Unprocessable(
                "O setor não pertence ao estabelecimento informado.",
                errors=[
                    {
                        "campo": "setor_id",
                        "mensagem": "Selecione um setor da mesma unidade.",
                        "codigo_regra": "setor_estabelecimento",
                    }
                ],
            )
    if equipe_id:
        equipe = await obter_equipe(db, tenant_id, equipe_id)
        if equipe.estabelecimento_id != estabelecimento.id:
            raise Unprocessable(
                "A equipe não pertence ao estabelecimento informado.",
                errors=[
                    {
                        "campo": "equipe_id",
                        "mensagem": "Selecione uma equipe da mesma unidade.",
                        "codigo_regra": "equipe_estabelecimento",
                    }
                ],
            )
    if profissional_id:
        await obter_profissional(db, tenant_id, profissional_id)
    if not profissional_id and not equipe_id:
        raise Unprocessable(
            "Informe o profissional ou a equipe responsável pelo turno.",
            errors=[
                {
                    "campo": "profissional_id",
                    "mensagem": "Informe profissional ou equipe.",
                    "codigo_regra": "responsavel_turno",
                }
            ],
        )
    return estabelecimento


async def _travar_conflito(
    db: AsyncSession,
    *,
    tenant_id: uuid.UUID,
    profissional_id: uuid.UUID | None,
    equipe_id: uuid.UUID | None,
) -> None:
    """Serializa a checagem/gravação de turnos no PostgreSQL.

    O lock é transacional e cobre todos os turnos do profissional/equipe no
    tenant, evitando duas gravações concorrentes com sobreposição.
    """
    bind = db.get_bind()
    if bind.dialect.name != "postgresql":
        return
    alvo = (
        f"profissional:{profissional_id}"
        if profissional_id
        else f"equipe:{equipe_id}"
    )
    chave = f"govsaude:turnos:{tenant_id}:{alvo}"
    await db.execute(
        text("SELECT pg_advisory_xact_lock(hashtext(:chave))"), {"chave": chave}
    )


def _detalhe_conflito(conflitantes, usuario: Usuario) -> dict:
    permitidos = escopos_estabelecimento(usuario, Permissao.AGENDA_GERENCIAR)
    visiveis = [
        str(item.id)
        for item in conflitantes
        if permitidos is None or item.estabelecimento_id in permitidos
    ]
    detalhe: dict = {"conflitos": visiveis}
    if conflitantes and not visiveis:
        detalhe["conflito_fora_escopo"] = True
    return detalhe


async def _conflitos(
    db: AsyncSession,
    modelo,
    *,
    tenant_id: uuid.UUID,
    profissional_id: uuid.UUID | None,
    equipe_id: uuid.UUID | None,
    data_ref: date,
    inicio: time,
    fim: time,
    ignorar_id: uuid.UUID | None = None,
) -> list:
    janela_inicio, janela_fim = _intervalo(data_ref, inicio, fim)
    condicoes = [
        modelo.tenant_id == tenant_id,
        modelo.data >= data_ref - timedelta(days=1),
        modelo.data <= data_ref + timedelta(days=1),
        modelo.situacao != SituacaoTurno.CANCELADA.value,
        modelo.baixa_em.is_(None),
    ]
    if profissional_id:
        condicoes.append(modelo.profissional_id == profissional_id)
    elif equipe_id:
        condicoes.append(modelo.equipe_id == equipe_id)
    else:
        return []
    if ignorar_id:
        condicoes.append(modelo.id != ignorar_id)
    candidatos = (
        await db.execute(select(modelo).where(*condicoes))
    ).scalars().all()
    conflitantes = []
    for candidato in candidatos:
        ini_c, fim_c = _intervalo(candidato.data, candidato.hora_inicio, candidato.hora_fim)
        if janela_inicio < fim_c and ini_c < janela_fim:
            conflitantes.append(candidato)
    return conflitantes


async def criar(
    db: AsyncSession,
    *,
    modelo,
    tenant_id: uuid.UUID,
    usuario: Usuario,
    dados: TurnoCreate,
    ator: Usuario,
    cliente: dict,
) -> Escala | Plantao:
    await _validar_vinculos(
        db,
        tenant_id,
        usuario,
        estabelecimento_id=dados.estabelecimento_id,
        setor_id=dados.setor_id,
        equipe_id=dados.equipe_id,
        profissional_id=dados.profissional_id,
    )
    tipo = _validar_tipo(modelo, dados.tipo)
    await _travar_conflito(
        db,
        tenant_id=tenant_id,
        profissional_id=dados.profissional_id,
        equipe_id=dados.equipe_id,
    )
    conflitantes = await _conflitos(
        db,
        modelo,
        tenant_id=tenant_id,
        profissional_id=dados.profissional_id,
        equipe_id=dados.equipe_id,
        data_ref=dados.data,
        inicio=dados.hora_inicio,
        fim=dados.hora_fim,
    )
    justificativa = None
    autorizado_em = None
    if conflitantes:
        if not dados.forcar_conflito:
            raise Conflict(
                "Há sobreposição de horário com outro turno do mesmo profissional/equipe.",
                code="conflito_turno",
                extra=_detalhe_conflito(conflitantes, usuario),
            )
        if len((dados.justificativa_excecao or "").strip()) < 20:
            raise Unprocessable(
                "A exceção de conflito exige justificativa com pelo menos 20 caracteres.",
                code="justificativa_excecao",
                errors=[
                    {
                        "campo": "justificativa_excecao",
                        "mensagem": "Descreva o motivo da sobreposição.",
                        "codigo_regra": "justificativa_excecao",
                    }
                ],
            )
        justificativa = dados.justificativa_excecao
        autorizado_em = agora()
    registro = modelo(
        tenant_id=tenant_id,
        estabelecimento_id=dados.estabelecimento_id,
        setor_id=dados.setor_id,
        equipe_id=dados.equipe_id,
        profissional_id=dados.profissional_id,
        data=dados.data,
        hora_inicio=dados.hora_inicio,
        hora_fim=dados.hora_fim,
        tipo=tipo,
        situacao=SituacaoTurno.ATIVA.value,
        observacoes=dados.observacoes,
        justificativa_excecao=justificativa,
        autorizado_por_id=ator.id if justificativa else None,
        autorizado_em=autorizado_em,
        versao=1,
    )
    db.add(registro)
    await db.flush()
    await registrar(
        db,
        acao=AcaoAuditoria.CRIAR,
        usuario=ator,
        tenant_id=tenant_id,
        estabelecimento_id=dados.estabelecimento_id,
        recurso=modelo.__tablename__,
        recurso_id=registro.id,
        justificativa=justificativa,
        dados_depois=instantaneo(registro),
        cliente=cliente,
    )
    await db.commit()
    return registro


async def listar(
    db: AsyncSession,
    *,
    modelo,
    tenant_id: uuid.UUID,
    usuario: Usuario,
    estabelecimento_id: uuid.UUID | None = None,
    profissional_id: uuid.UUID | None = None,
    equipe_id: uuid.UUID | None = None,
    data_inicio: date | None = None,
    data_fim: date | None = None,
    limite: int = 50,
    cursor: str | None = None,
) -> tuple[list, str | None, int]:
    limite = min(max(limite, 1), 100)
    condicoes = [modelo.tenant_id == tenant_id]
    permitidos = escopos_estabelecimento(usuario, Permissao.AGENDA_LER)
    if permitidos is not None:
        if not permitidos:
            return [], None, 0
        condicoes.append(modelo.estabelecimento_id.in_(permitidos))
    if estabelecimento_id:
        await exigir_acesso_estabelecimento(db, usuario, Permissao.AGENDA_LER, estabelecimento_id)
        condicoes.append(modelo.estabelecimento_id == estabelecimento_id)
    if profissional_id:
        condicoes.append(modelo.profissional_id == profissional_id)
    if equipe_id:
        condicoes.append(modelo.equipe_id == equipe_id)
    if data_inicio:
        condicoes.append(modelo.data >= data_inicio)
    if data_fim:
        condicoes.append(modelo.data <= data_fim)
    total = await db.scalar(select(func.count()).select_from(modelo).where(*condicoes)) or 0
    consulta = (
        select(modelo)
        .where(*condicoes)
        .order_by(modelo.created_at, modelo.id)
        .limit(limite + 1)
    )
    consulta = aplicar_cursor(consulta, modelo, cursor)
    itens = list((await db.execute(consulta)).scalars().all())
    proximo = None
    if len(itens) > limite:
        ultimo = itens[limite - 1]
        itens = itens[:limite]
        proximo = codificar(ultimo.created_at, ultimo.id)
    return itens, proximo, int(total)


async def obter_com_escopo(
    db: AsyncSession,
    *,
    modelo,
    tenant_id: uuid.UUID,
    usuario: Usuario,
    turno_id: uuid.UUID,
    permissao: Permissao = Permissao.AGENDA_LER,
):
    registro = await db.scalar(
        select(modelo).where(modelo.id == turno_id, modelo.tenant_id == tenant_id)
    )
    if registro is None:
        raise NotFound("Turno não encontrado.")
    await exigir_acesso_estabelecimento(db, usuario, permissao, registro.estabelecimento_id)
    return registro


async def atualizar(
    db: AsyncSession,
    *,
    modelo,
    tenant_id: uuid.UUID,
    usuario: Usuario,
    turno_id: uuid.UUID,
    dados: TurnoUpdate,
    versao: int,
    ator: Usuario,
    cliente: dict,
) -> Escala | Plantao:
    registro = await obter_com_escopo(
        db,
        modelo=modelo,
        tenant_id=tenant_id,
        usuario=usuario,
        turno_id=turno_id,
        permissao=Permissao.AGENDA_GERENCIAR,
    )
    conferir_versao(registro.versao, versao)
    antes = instantaneo(registro)
    for campo in ("setor_id", "equipe_id", "profissional_id", "data", "hora_inicio", "hora_fim"):
        valor = getattr(dados, campo)
        if valor is not None:
            setattr(registro, campo, valor)
    if dados.tipo is not None:
        registro.tipo = _validar_tipo(modelo, dados.tipo)
    if dados.observacoes is not None:
        registro.observacoes = dados.observacoes
    await _validar_vinculos(
        db,
        tenant_id,
        usuario,
        estabelecimento_id=registro.estabelecimento_id,
        setor_id=registro.setor_id,
        equipe_id=registro.equipe_id,
        profissional_id=registro.profissional_id,
    )
    await _travar_conflito(
        db,
        tenant_id=tenant_id,
        profissional_id=registro.profissional_id,
        equipe_id=registro.equipe_id,
    )
    conflitantes = await _conflitos(
        db,
        modelo,
        tenant_id=tenant_id,
        profissional_id=registro.profissional_id,
        equipe_id=registro.equipe_id,
        data_ref=registro.data,
        inicio=registro.hora_inicio,
        fim=registro.hora_fim,
        ignorar_id=registro.id,
    )
    if conflitantes:
        if not dados.forcar_conflito:
            raise Conflict(
                "Há sobreposição de horário com outro turno do mesmo profissional/equipe.",
                code="conflito_turno",
                extra=_detalhe_conflito(conflitantes, usuario),
            )
        if len((dados.justificativa_excecao or "").strip()) < 20:
            raise Unprocessable(
                "A exceção de conflito exige justificativa com pelo menos 20 caracteres.",
                code="justificativa_excecao",
            )
        registro.justificativa_excecao = dados.justificativa_excecao
        registro.autorizado_por_id = ator.id
        registro.autorizado_em = agora()
    else:
        registro.justificativa_excecao = None
        registro.autorizado_por_id = None
        registro.autorizado_em = None
    registro.versao += 1
    await registrar(
        db,
        acao=AcaoAuditoria.ATUALIZAR,
        usuario=ator,
        tenant_id=tenant_id,
        estabelecimento_id=registro.estabelecimento_id,
        recurso=modelo.__tablename__,
        recurso_id=registro.id,
        justificativa=registro.justificativa_excecao,
        dados_antes=antes,
        dados_depois=instantaneo(registro),
        cliente=cliente,
    )
    await db.commit()
    return registro


async def cancelar(
    db: AsyncSession,
    *,
    modelo,
    tenant_id: uuid.UUID,
    usuario: Usuario,
    turno_id: uuid.UUID,
    dados: TurnoCancelamento,
    ator: Usuario,
    cliente: dict,
) -> Escala | Plantao:
    registro = await obter_com_escopo(
        db,
        modelo=modelo,
        tenant_id=tenant_id,
        usuario=usuario,
        turno_id=turno_id,
        permissao=Permissao.AGENDA_GERENCIAR,
    )
    if registro.situacao == SituacaoTurno.CANCELADA.value:
        return registro
    antes = instantaneo(registro)
    registro.situacao = SituacaoTurno.CANCELADA.value
    registro.baixa_em = agora()
    registro.baixa_motivo = dados.motivo
    registro.baixa_por_id = ator.id
    registro.versao += 1
    await registrar(
        db,
        acao=AcaoAuditoria.BAIXAR,
        usuario=ator,
        tenant_id=tenant_id,
        estabelecimento_id=registro.estabelecimento_id,
        recurso=modelo.__tablename__,
        recurso_id=registro.id,
        justificativa=dados.motivo,
        dados_antes=antes,
        dados_depois=instantaneo(registro),
        cliente=cliente,
    )
    await db.commit()
    return registro
