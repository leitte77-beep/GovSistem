"""Serviços/classificações, horários e procedimentos autorizados (Fase 1).

Procedimentos seguem B.12-016: escopo por estabelecimento, profissional e
especialidade; o código SIGTAP é confrontado apenas com a base oficial
importada, sem inventar descrição ou compatibilidade.
"""

from __future__ import annotations

import uuid

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.errors import Conflict, NotFound, Unprocessable
from app.core.permissoes import Permissao
from app.core.security import agora
from app.models.enums import AcaoAuditoria
from app.models.nucleo import (
    Usuario,
    VinculoProfissional,
)
from app.models.rede import (
    HorarioFuncionamento,
    ProcedimentoAutorizado,
    ServicoClassificacao,
)
from app.schemas.rede import (
    BaixaRequest,
    HorarioFuncionamentoCreate,
    HorarioFuncionamentoUpdate,
    ProcedimentoAutorizadoCreate,
    ProcedimentoAutorizadoUpdate,
    ServicoClassificacaoCreate,
    ServicoClassificacaoUpdate,
)
from app.services.auditoria import instantaneo, registrar
from app.services.paginacao import aplicar_cursor, codificar
from app.services.rede_comum import (
    conferir_versao,
    escopos_estabelecimento,
    exigir_acesso_estabelecimento,
    obter_especialidade,
    obter_estabelecimento,
    obter_profissional,
    obter_setor,
    serializar_servico,
    validar_sigtap_contra_referencia,
    validar_vigencia,
)


async def _escopo_lista(
    db: AsyncSession, usuario: Usuario, permissao: Permissao, estabelecimento_id: uuid.UUID | None
) -> set[uuid.UUID] | None:
    if estabelecimento_id:
        await obter_estabelecimento(db, usuario.tenant_id, estabelecimento_id)
        await exigir_acesso_estabelecimento(db, usuario, permissao, estabelecimento_id)
    return escopos_estabelecimento(usuario, permissao)


# ── Serviços / classificações ───────────────────────────────────────────────


async def listar_servicos(
    db: AsyncSession,
    tenant_id: uuid.UUID,
    usuario: Usuario,
    *,
    estabelecimento_id: uuid.UUID,
    limite: int = 50,
    cursor: str | None = None,
    tipo: str | None = None,
    ativo: bool | None = None,
) -> tuple[list[ServicoClassificacao], str | None, int]:
    await obter_estabelecimento(db, tenant_id, estabelecimento_id)
    await exigir_acesso_estabelecimento(db,
        usuario, Permissao.ESTABELECIMENTO_LER, estabelecimento_id
    )
    limite = min(max(limite, 1), 100)
    condicoes = [
        ServicoClassificacao.tenant_id == tenant_id,
        ServicoClassificacao.estabelecimento_id == estabelecimento_id,
    ]
    if tipo:
        condicoes.append(ServicoClassificacao.tipo == tipo.upper())
    if ativo is not None:
        condicoes.append(ServicoClassificacao.ativo.is_(ativo))
    total = (
        await db.scalar(
            select(func.count()).select_from(ServicoClassificacao).where(*condicoes)
        )
        or 0
    )
    consulta = (
        select(ServicoClassificacao)
        .where(*condicoes)
        .order_by(ServicoClassificacao.created_at, ServicoClassificacao.id)
        .limit(limite + 1)
    )
    consulta = aplicar_cursor(consulta, ServicoClassificacao, cursor)
    itens = list((await db.execute(consulta)).scalars().all())
    proximo = None
    if len(itens) > limite:
        ultimo = itens[limite - 1]
        itens = itens[:limite]
        proximo = codificar(ultimo.created_at, ultimo.id)
    return itens, proximo, int(total)


async def criar_servico(
    db: AsyncSession,
    *,
    tenant_id: uuid.UUID,
    usuario: Usuario,
    estabelecimento_id: uuid.UUID,
    dados: ServicoClassificacaoCreate,
    ator: Usuario,
    cliente: dict,
) -> ServicoClassificacao:
    await obter_estabelecimento(db, tenant_id, estabelecimento_id)
    await exigir_acesso_estabelecimento(db,
        usuario, Permissao.ESTABELECIMENTO_GERENCIAR, estabelecimento_id
    )
    existente = await db.scalar(
        select(ServicoClassificacao).where(
            ServicoClassificacao.tenant_id == tenant_id,
            ServicoClassificacao.estabelecimento_id == estabelecimento_id,
            ServicoClassificacao.tipo == dados.tipo,
            ServicoClassificacao.codigo == dados.codigo.strip(),
            ServicoClassificacao.baixa_em.is_(None),
        )
    )
    if existente:
        raise Conflict(
            "Já existe um serviço/classificação com este código nesta unidade.",
            code="servico_duplicado",
        )
    registro = ServicoClassificacao(
        tenant_id=tenant_id,
        estabelecimento_id=estabelecimento_id,
        tipo=dados.tipo,
        codigo=dados.codigo.strip(),
        nome=dados.nome.strip(),
        observacoes=dados.observacoes,
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
        estabelecimento_id=estabelecimento_id,
        recurso="servico_classificacao",
        recurso_id=registro.id,
        dados_depois=serializar_servico(registro),
        cliente=cliente,
    )
    await db.commit()
    return registro


async def _obter_servico(
    db: AsyncSession,
    tenant_id: uuid.UUID,
    usuario: Usuario,
    estabelecimento_id: uuid.UUID,
    servico_id: uuid.UUID,
    permissao: Permissao,
) -> ServicoClassificacao:
    await obter_estabelecimento(db, tenant_id, estabelecimento_id)
    await exigir_acesso_estabelecimento(db, usuario, permissao, estabelecimento_id)
    registro = await db.scalar(
        select(ServicoClassificacao).where(
            ServicoClassificacao.id == servico_id,
            ServicoClassificacao.tenant_id == tenant_id,
            ServicoClassificacao.estabelecimento_id == estabelecimento_id,
        )
    )
    if registro is None:
        raise NotFound("Serviço/classificação não encontrado.")
    return registro


async def atualizar_servico(
    db: AsyncSession,
    *,
    tenant_id: uuid.UUID,
    usuario: Usuario,
    estabelecimento_id: uuid.UUID,
    servico_id: uuid.UUID,
    dados: ServicoClassificacaoUpdate,
    versao: int,
    ator: Usuario,
    cliente: dict,
) -> ServicoClassificacao:
    registro = await _obter_servico(
        db,
        tenant_id,
        usuario,
        estabelecimento_id,
        servico_id,
        Permissao.ESTABELECIMENTO_GERENCIAR,
    )
    conferir_versao(registro.versao, versao)
    antes = serializar_servico(registro)
    if dados.nome is not None:
        registro.nome = dados.nome.strip()
    if dados.observacoes is not None:
        registro.observacoes = dados.observacoes
    if dados.ativo is not None:
        registro.ativo = dados.ativo
    registro.versao += 1
    await registrar(
        db,
        acao=AcaoAuditoria.ATUALIZAR,
        usuario=ator,
        tenant_id=tenant_id,
        estabelecimento_id=estabelecimento_id,
        recurso="servico_classificacao",
        recurso_id=registro.id,
        dados_antes=antes,
        dados_depois=serializar_servico(registro),
        cliente=cliente,
    )
    await db.commit()
    return registro


async def baixar_servico(
    db: AsyncSession,
    *,
    tenant_id: uuid.UUID,
    usuario: Usuario,
    estabelecimento_id: uuid.UUID,
    servico_id: uuid.UUID,
    dados: BaixaRequest,
    ator: Usuario,
    cliente: dict,
) -> ServicoClassificacao:
    registro = await _obter_servico(
        db,
        tenant_id,
        usuario,
        estabelecimento_id,
        servico_id,
        Permissao.ESTABELECIMENTO_GERENCIAR,
    )
    if registro.baixa_em is not None:
        return registro
    antes = serializar_servico(registro)
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
        estabelecimento_id=estabelecimento_id,
        recurso="servico_classificacao",
        recurso_id=registro.id,
        justificativa=dados.motivo,
        dados_antes=antes,
        dados_depois=serializar_servico(registro),
        cliente=cliente,
    )
    await db.commit()
    return registro


# ── Horários de funcionamento ───────────────────────────────────────────────


async def listar_horarios(
    db: AsyncSession,
    tenant_id: uuid.UUID,
    usuario: Usuario,
    *,
    estabelecimento_id: uuid.UUID,
    limite: int = 50,
    cursor: str | None = None,
    setor_id: uuid.UUID | None = None,
) -> tuple[list[HorarioFuncionamento], str | None, int]:
    await obter_estabelecimento(db, tenant_id, estabelecimento_id)
    await exigir_acesso_estabelecimento(db,
        usuario, Permissao.ESTABELECIMENTO_LER, estabelecimento_id
    )
    limite = min(max(limite, 1), 100)
    condicoes = [
        HorarioFuncionamento.tenant_id == tenant_id,
        HorarioFuncionamento.estabelecimento_id == estabelecimento_id,
    ]
    if setor_id:
        condicoes.append(HorarioFuncionamento.setor_id == setor_id)
    total = (
        await db.scalar(
            select(func.count()).select_from(HorarioFuncionamento).where(*condicoes)
        )
        or 0
    )
    consulta = (
        select(HorarioFuncionamento)
        .where(*condicoes)
        .order_by(HorarioFuncionamento.created_at, HorarioFuncionamento.id)
        .limit(limite + 1)
    )
    consulta = aplicar_cursor(consulta, HorarioFuncionamento, cursor)
    itens = list((await db.execute(consulta)).scalars().all())
    proximo = None
    if len(itens) > limite:
        ultimo = itens[limite - 1]
        itens = itens[:limite]
        proximo = codificar(ultimo.created_at, ultimo.id)
    return itens, proximo, int(total)


def _validar_horario(
    dia_semana: int, hora_inicio, hora_fim, vigencia_inicio, vigencia_fim
) -> None:
    if not 0 <= dia_semana <= 6:
        raise Unprocessable(
            "Dia da semana inválido.",
            errors=[
                {
                    "campo": "dia_semana",
                    "mensagem": "Use 0 (segunda) a 6 (domingo).",
                    "codigo_regra": "dia_semana",
                }
            ],
        )
    if hora_inicio >= hora_fim:
        raise Unprocessable(
            "Horário final deve ser posterior ao inicial.",
            errors=[
                {
                    "campo": "hora_fim",
                    "mensagem": "Ajuste o intervalo.",
                    "codigo_regra": "horario",
                }
            ],
        )
    validar_vigencia(vigencia_inicio, vigencia_fim)


async def criar_horario(
    db: AsyncSession,
    *,
    tenant_id: uuid.UUID,
    usuario: Usuario,
    estabelecimento_id: uuid.UUID,
    dados: HorarioFuncionamentoCreate,
    ator: Usuario,
    cliente: dict,
) -> HorarioFuncionamento:
    await obter_estabelecimento(db, tenant_id, estabelecimento_id)
    await exigir_acesso_estabelecimento(db,
        usuario, Permissao.ESTABELECIMENTO_GERENCIAR, estabelecimento_id
    )
    if dados.setor_id:
        setor = await obter_setor(db, tenant_id, dados.setor_id)
        if setor.estabelecimento_id != estabelecimento_id:
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
    from datetime import date

    inicio = dados.vigencia_inicio or date.today()
    _validar_horario(
        dados.dia_semana, dados.hora_inicio, dados.hora_fim, inicio, dados.vigencia_fim
    )
    registro = HorarioFuncionamento(
        tenant_id=tenant_id,
        estabelecimento_id=estabelecimento_id,
        setor_id=dados.setor_id,
        dia_semana=dados.dia_semana,
        hora_inicio=dados.hora_inicio,
        hora_fim=dados.hora_fim,
        vigencia_inicio=inicio,
        vigencia_fim=dados.vigencia_fim,
        observacoes=dados.observacoes,
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
        estabelecimento_id=estabelecimento_id,
        recurso="horario_funcionamento",
        recurso_id=registro.id,
        dados_depois=instantaneo(registro),
        cliente=cliente,
    )
    await db.commit()
    return registro


async def _obter_horario(
    db: AsyncSession,
    tenant_id: uuid.UUID,
    usuario: Usuario,
    estabelecimento_id: uuid.UUID,
    horario_id: uuid.UUID,
    permissao: Permissao,
) -> HorarioFuncionamento:
    await obter_estabelecimento(db, tenant_id, estabelecimento_id)
    await exigir_acesso_estabelecimento(db, usuario, permissao, estabelecimento_id)
    registro = await db.scalar(
        select(HorarioFuncionamento).where(
            HorarioFuncionamento.id == horario_id,
            HorarioFuncionamento.tenant_id == tenant_id,
            HorarioFuncionamento.estabelecimento_id == estabelecimento_id,
        )
    )
    if registro is None:
        raise NotFound("Horário não encontrado.")
    return registro


async def atualizar_horario(
    db: AsyncSession,
    *,
    tenant_id: uuid.UUID,
    usuario: Usuario,
    estabelecimento_id: uuid.UUID,
    horario_id: uuid.UUID,
    dados: HorarioFuncionamentoUpdate,
    versao: int,
    ator: Usuario,
    cliente: dict,
) -> HorarioFuncionamento:
    registro = await _obter_horario(
        db,
        tenant_id,
        usuario,
        estabelecimento_id,
        horario_id,
        Permissao.ESTABELECIMENTO_GERENCIAR,
    )
    conferir_versao(registro.versao, versao)
    antes = instantaneo(registro)
    for campo in ("dia_semana", "hora_inicio", "hora_fim", "setor_id", "observacoes"):
        valor = getattr(dados, campo)
        if valor is not None:
            setattr(registro, campo, valor)
    if dados.vigencia_inicio is not None:
        registro.vigencia_inicio = dados.vigencia_inicio
    if dados.vigencia_fim is not None:
        registro.vigencia_fim = dados.vigencia_fim
    if dados.ativo is not None:
        registro.ativo = dados.ativo
    _validar_horario(
        registro.dia_semana,
        registro.hora_inicio,
        registro.hora_fim,
        registro.vigencia_inicio,
        registro.vigencia_fim,
    )
    registro.versao += 1
    await registrar(
        db,
        acao=AcaoAuditoria.ATUALIZAR,
        usuario=ator,
        tenant_id=tenant_id,
        estabelecimento_id=estabelecimento_id,
        recurso="horario_funcionamento",
        recurso_id=registro.id,
        dados_antes=antes,
        dados_depois=instantaneo(registro),
        cliente=cliente,
    )
    await db.commit()
    return registro


async def baixar_horario(
    db: AsyncSession,
    *,
    tenant_id: uuid.UUID,
    usuario: Usuario,
    estabelecimento_id: uuid.UUID,
    horario_id: uuid.UUID,
    dados: BaixaRequest,
    ator: Usuario,
    cliente: dict,
) -> HorarioFuncionamento:
    registro = await _obter_horario(
        db,
        tenant_id,
        usuario,
        estabelecimento_id,
        horario_id,
        Permissao.ESTABELECIMENTO_GERENCIAR,
    )
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
        estabelecimento_id=estabelecimento_id,
        recurso="horario_funcionamento",
        recurso_id=registro.id,
        justificativa=dados.motivo,
        dados_antes=antes,
        dados_depois=instantaneo(registro),
        cliente=cliente,
    )
    await db.commit()
    return registro


# ── Procedimentos autorizados ───────────────────────────────────────────────


async def _validar_procedimento_vinculos(
    db: AsyncSession,
    tenant_id: uuid.UUID,
    estabelecimento_id: uuid.UUID,
    profissional_id: uuid.UUID | None,
    especialidade_id: uuid.UUID | None,
) -> None:
    if profissional_id:
        await obter_profissional(db, tenant_id, profissional_id)
        vinculo = await db.scalar(
            select(VinculoProfissional.id).where(
                VinculoProfissional.tenant_id == tenant_id,
                VinculoProfissional.profissional_id == profissional_id,
                VinculoProfissional.estabelecimento_id == estabelecimento_id,
            ).limit(1)
        )
        if not vinculo:
            raise Unprocessable(
                "O profissional não possui vínculo com o estabelecimento informado.",
                errors=[
                    {
                        "campo": "profissional_id",
                        "mensagem": "Cadastre o vínculo antes de autorizar procedimentos.",
                        "codigo_regra": "vinculo_profissional",
                    }
                ],
            )
    if especialidade_id:
        await obter_especialidade(db, tenant_id, especialidade_id)


async def listar_procedimentos(
    db: AsyncSession,
    tenant_id: uuid.UUID,
    usuario: Usuario,
    *,
    estabelecimento_id: uuid.UUID | None = None,
    profissional_id: uuid.UUID | None = None,
    especialidade_id: uuid.UUID | None = None,
    limite: int = 50,
    cursor: str | None = None,
    ativo: bool | None = None,
) -> tuple[list[ProcedimentoAutorizado], str | None, int]:
    limite = min(max(limite, 1), 100)
    condicoes = [ProcedimentoAutorizado.tenant_id == tenant_id]
    permitidos = await _escopo_lista(
        db, usuario, Permissao.PROFISSIONAL_LER, estabelecimento_id
    )
    if permitidos is not None:
        if not permitidos:
            return [], None, 0
        condicoes.append(ProcedimentoAutorizado.estabelecimento_id.in_(permitidos))
    if estabelecimento_id:
        condicoes.append(ProcedimentoAutorizado.estabelecimento_id == estabelecimento_id)
    if profissional_id:
        condicoes.append(ProcedimentoAutorizado.profissional_id == profissional_id)
    if especialidade_id:
        condicoes.append(ProcedimentoAutorizado.especialidade_id == especialidade_id)
    if ativo is not None:
        condicoes.append(ProcedimentoAutorizado.ativo.is_(ativo))
    total = (
        await db.scalar(
            select(func.count()).select_from(ProcedimentoAutorizado).where(*condicoes)
        )
        or 0
    )
    consulta = (
        select(ProcedimentoAutorizado)
        .where(*condicoes)
        .order_by(ProcedimentoAutorizado.created_at, ProcedimentoAutorizado.id)
        .limit(limite + 1)
    )
    consulta = aplicar_cursor(consulta, ProcedimentoAutorizado, cursor)
    itens = list((await db.execute(consulta)).scalars().all())
    proximo = None
    if len(itens) > limite:
        ultimo = itens[limite - 1]
        itens = itens[:limite]
        proximo = codificar(ultimo.created_at, ultimo.id)
    return itens, proximo, int(total)


async def criar_procedimento(
    db: AsyncSession,
    *,
    tenant_id: uuid.UUID,
    usuario: Usuario,
    dados: ProcedimentoAutorizadoCreate,
    ator: Usuario,
    cliente: dict,
) -> ProcedimentoAutorizado:
    await obter_estabelecimento(db, tenant_id, dados.estabelecimento_id)
    await exigir_acesso_estabelecimento(db,
        usuario, Permissao.PROFISSIONAL_GERENCIAR, dados.estabelecimento_id
    )
    await _validar_procedimento_vinculos(
        db,
        tenant_id,
        dados.estabelecimento_id,
        dados.profissional_id,
        dados.especialidade_id,
    )
    validado, aviso = await validar_sigtap_contra_referencia(
        db, dados.codigo_sigtap, dados.competencia
    )
    from datetime import date

    inicio = dados.vigencia_inicio or date.today()
    validar_vigencia(inicio, dados.vigencia_fim)
    registro = ProcedimentoAutorizado(
        tenant_id=tenant_id,
        estabelecimento_id=dados.estabelecimento_id,
        profissional_id=dados.profissional_id,
        especialidade_id=dados.especialidade_id,
        codigo_sigtap="".join(ch for ch in dados.codigo_sigtap if ch.isdigit()),
        competencia=dados.competencia,
        vigencia_inicio=inicio,
        vigencia_fim=dados.vigencia_fim,
        observacoes=dados.observacoes,
        validado_referencia=validado,
        aviso_referencia=aviso,
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
        estabelecimento_id=dados.estabelecimento_id,
        recurso="procedimento_autorizado",
        recurso_id=registro.id,
        dados_depois=instantaneo(registro),
        cliente=cliente,
    )
    await db.commit()
    return registro


async def _obter_procedimento(
    db: AsyncSession,
    tenant_id: uuid.UUID,
    usuario: Usuario,
    procedimento_id: uuid.UUID,
    permissao: Permissao,
) -> ProcedimentoAutorizado:
    registro = await db.scalar(
        select(ProcedimentoAutorizado).where(
            ProcedimentoAutorizado.id == procedimento_id,
            ProcedimentoAutorizado.tenant_id == tenant_id,
        )
    )
    if registro is None:
        raise NotFound("Procedimento autorizado não encontrado.")
    await exigir_acesso_estabelecimento(db, usuario, permissao, registro.estabelecimento_id)
    return registro


async def atualizar_procedimento(
    db: AsyncSession,
    *,
    tenant_id: uuid.UUID,
    usuario: Usuario,
    procedimento_id: uuid.UUID,
    dados: ProcedimentoAutorizadoUpdate,
    versao: int,
    ator: Usuario,
    cliente: dict,
) -> ProcedimentoAutorizado:
    registro = await _obter_procedimento(
        db, tenant_id, usuario, procedimento_id, Permissao.PROFISSIONAL_GERENCIAR
    )
    conferir_versao(registro.versao, versao)
    antes = instantaneo(registro)
    if dados.profissional_id is not None:
        registro.profissional_id = dados.profissional_id
    if dados.especialidade_id is not None:
        registro.especialidade_id = dados.especialidade_id
    if dados.competencia is not None:
        registro.competencia = dados.competencia
    if dados.vigencia_inicio is not None:
        registro.vigencia_inicio = dados.vigencia_inicio
    if dados.vigencia_fim is not None:
        registro.vigencia_fim = dados.vigencia_fim
    if dados.observacoes is not None:
        registro.observacoes = dados.observacoes
    if dados.ativo is not None:
        registro.ativo = dados.ativo
    await _validar_procedimento_vinculos(
        db,
        tenant_id,
        registro.estabelecimento_id,
        registro.profissional_id,
        registro.especialidade_id,
    )
    validado, aviso = await validar_sigtap_contra_referencia(
        db, registro.codigo_sigtap, registro.competencia
    )
    registro.validado_referencia = validado
    registro.aviso_referencia = aviso
    validar_vigencia(registro.vigencia_inicio, registro.vigencia_fim)
    registro.versao += 1
    await registrar(
        db,
        acao=AcaoAuditoria.ATUALIZAR,
        usuario=ator,
        tenant_id=tenant_id,
        estabelecimento_id=registro.estabelecimento_id,
        recurso="procedimento_autorizado",
        recurso_id=registro.id,
        dados_antes=antes,
        dados_depois=instantaneo(registro),
        cliente=cliente,
    )
    await db.commit()
    return registro


async def baixar_procedimento(
    db: AsyncSession,
    *,
    tenant_id: uuid.UUID,
    usuario: Usuario,
    procedimento_id: uuid.UUID,
    dados: BaixaRequest,
    ator: Usuario,
    cliente: dict,
) -> ProcedimentoAutorizado:
    registro = await _obter_procedimento(
        db, tenant_id, usuario, procedimento_id, Permissao.PROFISSIONAL_GERENCIAR
    )
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
        recurso="procedimento_autorizado",
        recurso_id=registro.id,
        justificativa=dados.motivo,
        dados_antes=antes,
        dados_depois=instantaneo(registro),
        cliente=cliente,
    )
    await db.commit()
    return registro
