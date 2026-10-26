"""Restrições de horário por usuário, grupo e estabelecimento (B.12-012)."""

from __future__ import annotations

import uuid
from datetime import date, time

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.errors import NotFound, Unprocessable
from app.core.security import agora
from app.models.enums import AcaoAuditoria
from app.models.nucleo import Grupo, Usuario
from app.models.rede import RestricaoHorarioAcesso
from app.schemas.rede import (
    BaixaRequest,
    RestricaoHorarioCreate,
    RestricaoHorarioUpdate,
)
from app.services.auditoria import instantaneo, registrar
from app.services.janela_acesso import acesso_bloqueado
from app.services.paginacao import aplicar_cursor, codificar
from app.services.rede_comum import (
    conferir_versao,
    obter_estabelecimento,
    validar_vigencia,
)

__all__ = ["acesso_bloqueado"]


def _validar(
    dias_semana: list[int], hora_inicio: time, hora_fim: time, usuario_id, grupo_id
) -> None:
    if not usuario_id and not grupo_id:
        raise Unprocessable(
            "Informe o usuário ou o grupo da restrição.",
            errors=[
                {
                    "campo": "usuario_id",
                    "mensagem": "A restrição precisa de um usuário ou grupo.",
                    "codigo_regra": "alvo_restricao",
                }
            ],
        )
    if not dias_semana or any(dia < 0 or dia > 6 for dia in dias_semana):
        raise Unprocessable(
            "Dias da semana inválidos.",
            errors=[
                {
                    "campo": "dias_semana",
                    "mensagem": "Use valores de 0 (segunda) a 6 (domingo).",
                    "codigo_regra": "dias_semana",
                }
            ],
        )
    if hora_inicio == hora_fim:
        raise Unprocessable(
            "Horário de início e fim não podem ser iguais.",
            errors=[
                {
                    "campo": "hora_fim",
                    "mensagem": "Ajuste o intervalo.",
                    "codigo_regra": "intervalo_restricao",
                }
            ],
        )


async def listar(
    db: AsyncSession,
    tenant_id: uuid.UUID,
    *,
    limite: int = 50,
    cursor: str | None = None,
    usuario_id: uuid.UUID | None = None,
    grupo_id: uuid.UUID | None = None,
) -> tuple[list[RestricaoHorarioAcesso], str | None, int]:
    limite = min(max(limite, 1), 100)
    condicoes = [RestricaoHorarioAcesso.tenant_id == tenant_id]
    if usuario_id:
        condicoes.append(RestricaoHorarioAcesso.usuario_id == usuario_id)
    if grupo_id:
        condicoes.append(RestricaoHorarioAcesso.grupo_id == grupo_id)
    total = (
        await db.scalar(
            select(func.count()).select_from(RestricaoHorarioAcesso).where(*condicoes)
        )
        or 0
    )
    consulta = (
        select(RestricaoHorarioAcesso)
        .where(*condicoes)
        .order_by(RestricaoHorarioAcesso.created_at, RestricaoHorarioAcesso.id)
        .limit(limite + 1)
    )
    consulta = aplicar_cursor(consulta, RestricaoHorarioAcesso, cursor)
    itens = list((await db.execute(consulta)).scalars().all())
    proximo = None
    if len(itens) > limite:
        ultimo = itens[limite - 1]
        itens = itens[:limite]
        proximo = codificar(ultimo.created_at, ultimo.id)
    return itens, proximo, int(total)


async def obter(
    db: AsyncSession, tenant_id: uuid.UUID, restricao_id: uuid.UUID
) -> RestricaoHorarioAcesso:
    registro = await db.scalar(
        select(RestricaoHorarioAcesso).where(
            RestricaoHorarioAcesso.id == restricao_id,
            RestricaoHorarioAcesso.tenant_id == tenant_id,
        )
    )
    if registro is None:
        raise NotFound("Restrição de horário não encontrada.")
    return registro


async def _validar_alvos(
    db: AsyncSession,
    tenant_id: uuid.UUID,
    usuario_id: uuid.UUID | None,
    grupo_id: uuid.UUID | None,
    estabelecimento_id: uuid.UUID | None,
) -> None:
    if usuario_id:
        existe = await db.scalar(
            select(Usuario.id).where(
                Usuario.id == usuario_id, Usuario.tenant_id == tenant_id
            )
        )
        if not existe:
            raise NotFound("Usuário da restrição não encontrado.")
    if grupo_id:
        existe = await db.scalar(
            select(Grupo.id).where(Grupo.id == grupo_id, Grupo.tenant_id == tenant_id)
        )
        if not existe:
            raise NotFound("Grupo da restrição não encontrado.")
    if estabelecimento_id:
        await obter_estabelecimento(db, tenant_id, estabelecimento_id)


async def criar(
    db: AsyncSession,
    *,
    tenant_id: uuid.UUID,
    dados: RestricaoHorarioCreate,
    ator: Usuario,
    cliente: dict,
) -> RestricaoHorarioAcesso:
    _validar(dados.dias_semana, dados.hora_inicio, dados.hora_fim, dados.usuario_id, dados.grupo_id)
    validar_vigencia(dados.vigencia_inicio, dados.vigencia_fim)
    await _validar_alvos(
        db, tenant_id, dados.usuario_id, dados.grupo_id, dados.estabelecimento_id
    )
    registro = RestricaoHorarioAcesso(
        tenant_id=tenant_id,
        usuario_id=dados.usuario_id,
        grupo_id=dados.grupo_id,
        estabelecimento_id=dados.estabelecimento_id,
        dias_semana=sorted(set(dados.dias_semana)),
        hora_inicio=dados.hora_inicio,
        hora_fim=dados.hora_fim,
        vigencia_inicio=dados.vigencia_inicio or date.today(),
        vigencia_fim=dados.vigencia_fim,
        motivo=dados.motivo,
        ativo=True,
        versao=1,
    )
    db.add(registro)
    await db.flush()
    await registrar(
        db,
        acao=AcaoAuditoria.CRIAR,
        usuario=ator,
        tenant_id=tenant_id,
        estabelecimento_id=registro.estabelecimento_id,
        recurso="restricao_horario_acesso",
        recurso_id=registro.id,
        dados_depois=instantaneo(registro),
        cliente=cliente,
    )
    await db.commit()
    return registro


async def atualizar(
    db: AsyncSession,
    *,
    tenant_id: uuid.UUID,
    restricao_id: uuid.UUID,
    dados: RestricaoHorarioUpdate,
    versao: int,
    ator: Usuario,
    cliente: dict,
) -> RestricaoHorarioAcesso:
    registro = await obter(db, tenant_id, restricao_id)
    conferir_versao(registro.versao, versao)
    antes = instantaneo(registro)
    if dados.dias_semana is not None:
        registro.dias_semana = sorted(set(dados.dias_semana))
    if dados.hora_inicio is not None:
        registro.hora_inicio = dados.hora_inicio
    if dados.hora_fim is not None:
        registro.hora_fim = dados.hora_fim
    if dados.vigencia_inicio is not None:
        registro.vigencia_inicio = dados.vigencia_inicio
    if dados.vigencia_fim is not None:
        registro.vigencia_fim = dados.vigencia_fim
    if dados.motivo is not None:
        registro.motivo = dados.motivo
    if dados.ativo is not None:
        registro.ativo = dados.ativo
    _validar(
        registro.dias_semana,
        registro.hora_inicio,
        registro.hora_fim,
        registro.usuario_id,
        registro.grupo_id,
    )
    validar_vigencia(registro.vigencia_inicio, registro.vigencia_fim)
    registro.versao += 1
    await registrar(
        db,
        acao=AcaoAuditoria.ATUALIZAR,
        usuario=ator,
        tenant_id=tenant_id,
        estabelecimento_id=registro.estabelecimento_id,
        recurso="restricao_horario_acesso",
        recurso_id=registro.id,
        dados_antes=antes,
        dados_depois=instantaneo(registro),
        cliente=cliente,
    )
    await db.commit()
    return registro


async def baixar(
    db: AsyncSession,
    *,
    tenant_id: uuid.UUID,
    restricao_id: uuid.UUID,
    dados: BaixaRequest,
    ator: Usuario,
    cliente: dict,
) -> RestricaoHorarioAcesso:
    registro = await obter(db, tenant_id, restricao_id)
    if registro.baixa_em is not None:
        return registro
    antes = instantaneo(registro)
    registro.baixa_em = dados.data or agora()
    registro.baixa_motivo = dados.motivo
    registro.baixa_por_id = ator.id
    registro.ativo = False
    registro.versao += 1
    await registrar(
        db,
        acao=AcaoAuditoria.BAIXAR,
        usuario=ator,
        tenant_id=tenant_id,
        estabelecimento_id=registro.estabelecimento_id,
        recurso="restricao_horario_acesso",
        recurso_id=registro.id,
        justificativa=dados.motivo,
        dados_antes=antes,
        dados_depois=instantaneo(registro),
        cliente=cliente,
    )
    await db.commit()
    return registro

