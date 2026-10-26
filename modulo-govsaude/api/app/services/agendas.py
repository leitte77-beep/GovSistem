"""Agendas, horários, bloqueios e protocolos de classificação de risco.

Requisitos: B.6-001, B.6-002, B.6-007, B.3-008.
"""

from __future__ import annotations

import uuid
from datetime import date, datetime, time, timedelta, timezone

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.br_validators import validar_sigtap
from app.core.errors import Conflict, NotFound, Unprocessable
from app.core.permissoes import Permissao
from app.core.security import agora
from app.models.agenda import (
    Agenda,
    AgendaBloqueio,
    AgendaHorario,
    Agendamento,
    NivelClassificacaoRisco,
    ProtocoloClassificacaoRisco,
)
from app.models.enums import AcaoAuditoria, SituacaoAgendamento
from app.models.nucleo import (
    Equipe,
    Especialidade,
    Estabelecimento,
    Profissional,
    Setor,
    Usuario,
    VinculoProfissional,
)
from app.models.rede import Prioridade
from app.schemas.agenda import (
    AgendaBloqueioCreate,
    AgendaCreate,
    AgendaUpdate,
    BloqueioCancelamento,
    DisponibilidadeDiaOut,
    DisponibilidadeOut,
    DisponibilidadeSlotOut,
    ProtocoloRiscoCreate,
    ProtocoloRiscoUpdate,
)
from app.services.agenda_comum import (
    aware,
    combinar_local,
    dia_semana,
    fuso_organizacao,
    local_para_utc,
    obter_agenda,
    obter_protocolo,
    utc_para_local,
)
from app.services.auditoria import instantaneo, registrar
from app.services.paginacao import aplicar_cursor, codificar
from app.services.rede_comum import (
    conferir_versao,
    escopos_estabelecimento,
    exigir_acesso_estabelecimento,
    obter_estabelecimento,
)

STATUS_OCUPAM_VAGA = {
    SituacaoAgendamento.AGENDADO.value,
    SituacaoAgendamento.CONFIRMADO.value,
    SituacaoAgendamento.AGUARDANDO.value,
    SituacaoAgendamento.EM_ATENDIMENTO.value,
    SituacaoAgendamento.ATENDIDO.value,
}
STATUS_BLOQUEIAM_CHECKIN = {
    SituacaoAgendamento.CANCELADO.value,
    SituacaoAgendamento.FALTOU.value,
    SituacaoAgendamento.VENCIDO.value,
    SituacaoAgendamento.REAGENDADO.value,
    SituacaoAgendamento.ATENDIDO.value,
}


def _validar_procedimento(codigo: str | None) -> str | None:
    if codigo is None:
        return None
    if not validar_sigtap(codigo):
        raise Unprocessable(
            "Código SIGTAP inválido.",
            errors=[
                {
                    "campo": "procedimento_sigtap",
                    "mensagem": "Informe 10 dígitos.",
                    "codigo_regra": "sigtap",
                }
            ],
        )
    return codigo


async def _validar_unidade_vinculos(
    db: AsyncSession,
    tenant_id: uuid.UUID,
    usuario: Usuario,
    *,
    estabelecimento_id: uuid.UUID,
    setor_id: uuid.UUID | None,
    equipe_id: uuid.UUID | None,
    profissional_id: uuid.UUID | None,
    especialidade_id: uuid.UUID | None,
    protocolo_risco_id: uuid.UUID | None,
    prioridade_id: uuid.UUID | None,
    permissao: Permissao,
) -> Estabelecimento:
    estabelecimento = await obter_estabelecimento(db, tenant_id, estabelecimento_id)
    await exigir_acesso_estabelecimento(db, usuario, permissao, estabelecimento.id)
    if setor_id:
        setor = await db.scalar(
            select(Setor).where(Setor.id == setor_id, Setor.tenant_id == tenant_id)
        )
        if setor is None or setor.estabelecimento_id != estabelecimento.id:
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
    if equipe_id:
        equipe = await db.scalar(
            select(Equipe).where(Equipe.id == equipe_id, Equipe.tenant_id == tenant_id)
        )
        if equipe is None or equipe.estabelecimento_id != estabelecimento.id:
            raise Unprocessable(
                "A equipe não pertence ao estabelecimento informado.",
                code="equipe_estabelecimento",
                errors=[
                    {
                        "campo": "equipe_id",
                        "mensagem": "Selecione uma equipe da mesma unidade.",
                        "codigo_regra": "equipe_estabelecimento",
                    }
                ],
            )
    if profissional_id:
        profissional = await db.scalar(
            select(Profissional).where(
                Profissional.id == profissional_id, Profissional.tenant_id == tenant_id
            )
        )
        if profissional is None:
            raise NotFound("Profissional não encontrado.")
        vinculo = await db.scalar(
            select(VinculoProfissional).where(
                VinculoProfissional.tenant_id == tenant_id,
                VinculoProfissional.profissional_id == profissional_id,
                VinculoProfissional.estabelecimento_id == estabelecimento.id,
                VinculoProfissional.vigencia_inicio <= date.today(),
                (VinculoProfissional.vigencia_fim.is_(None))
                | (VinculoProfissional.vigencia_fim >= date.today()),
            )
        )
        if vinculo is None:
            raise Unprocessable(
                "O profissional não possui vínculo vigente na unidade.",
                code="profissional_sem_vinculo",
                errors=[
                    {
                        "campo": "profissional_id",
                        "mensagem": "Cadastre o vínculo do profissional na unidade.",
                        "codigo_regra": "profissional_sem_vinculo",
                    }
                ],
            )
    if especialidade_id:
        especialidade = await db.scalar(
            select(Especialidade).where(
                Especialidade.id == especialidade_id,
                Especialidade.tenant_id == tenant_id,
            )
        )
        if especialidade is None:
            raise NotFound("Especialidade não encontrada.")
    if protocolo_risco_id:
        protocolo = await obter_protocolo(db, tenant_id, protocolo_risco_id)
        if protocolo.estabelecimento_id != estabelecimento.id:
            raise Unprocessable(
                "O protocolo de risco pertence a outra unidade.",
                code="protocolo_outra_unidade",
            )
    if prioridade_id:
        prioridade = await db.scalar(
            select(Prioridade).where(
                Prioridade.id == prioridade_id, Prioridade.tenant_id == tenant_id
            )
        )
        if prioridade is None:
            raise NotFound("Prioridade não encontrada.")
    return estabelecimento


def _validar_horarios(horarios) -> None:
    por_dia: dict[int, list[tuple[time, time]]] = {}
    for horario in horarios:
        if horario.hora_fim <= horario.hora_inicio:
            raise Unprocessable(
                "Horário de fim deve ser maior que o de início.",
                code="horario_invalido",
                errors=[
                    {
                        "campo": "horarios",
                        "mensagem": "Corrija a faixa de horário.",
                        "codigo_regra": "horario_invalido",
                    }
                ],
            )
        periodo = (horario.hora_inicio, horario.hora_fim)
        for inicio, fim in por_dia.get(horario.dia_semana, []):
            if inicio < periodo[1] and periodo[0] < fim:
                raise Conflict(
                    "Há horários sobrepostos no mesmo dia da agenda.",
                    code="horario_sobreposto",
                )
        por_dia.setdefault(horario.dia_semana, []).append(periodo)


async def listar_protocolos(
    db: AsyncSession,
    tenant_id: uuid.UUID,
    usuario: Usuario,
    *,
    estabelecimento_id: uuid.UUID | None = None,
    ativo: bool | None = None,
    limite: int = 50,
    cursor: str | None = None,
) -> tuple[list[ProtocoloClassificacaoRisco], str | None, int]:
    limite = min(max(limite, 1), 100)
    condicoes = [ProtocoloClassificacaoRisco.tenant_id == tenant_id]
    permitidos = escopos_estabelecimento(usuario, Permissao.FILA_LER)
    if permitidos is not None:
        if not permitidos:
            return [], None, 0
        condicoes.append(ProtocoloClassificacaoRisco.estabelecimento_id.in_(permitidos))
    if estabelecimento_id:
        await exigir_acesso_estabelecimento(
            db, usuario, Permissao.FILA_LER, estabelecimento_id
        )
        condicoes.append(
            ProtocoloClassificacaoRisco.estabelecimento_id == estabelecimento_id
        )
    if ativo is not None:
        condicoes.append(ProtocoloClassificacaoRisco.ativo.is_(ativo))
    total = await db.scalar(
        select(func.count()).select_from(ProtocoloClassificacaoRisco).where(*condicoes)
    ) or 0
    consulta = (
        select(ProtocoloClassificacaoRisco)
        .where(*condicoes)
        .order_by(ProtocoloClassificacaoRisco.created_at, ProtocoloClassificacaoRisco.id)
        .limit(limite + 1)
    )
    consulta = aplicar_cursor(consulta, ProtocoloClassificacaoRisco, cursor)
    itens = list((await db.execute(consulta)).scalars().all())
    proximo = None
    if len(itens) > limite:
        ultimo = itens[limite - 1]
        itens = itens[:limite]
        proximo = codificar(ultimo.created_at, ultimo.id)
    return itens, proximo, int(total)


async def criar_protocolo(
    db: AsyncSession,
    *,
    tenant_id: uuid.UUID,
    usuario: Usuario,
    dados: ProtocoloRiscoCreate,
    ator: Usuario,
    cliente: dict,
) -> ProtocoloClassificacaoRisco:
    await _validar_unidade_vinculos(
        db,
        tenant_id,
        usuario,
        estabelecimento_id=dados.estabelecimento_id,
        setor_id=None,
        equipe_id=None,
        profissional_id=None,
        especialidade_id=None,
        protocolo_risco_id=None,
        prioridade_id=None,
        permissao=Permissao.FILA_GERENCIAR,
    )
    existente = await db.scalar(
        select(ProtocoloClassificacaoRisco).where(
            ProtocoloClassificacaoRisco.tenant_id == tenant_id,
            ProtocoloClassificacaoRisco.estabelecimento_id == dados.estabelecimento_id,
            ProtocoloClassificacaoRisco.nome == dados.nome,
            ProtocoloClassificacaoRisco.versao_protocolo == dados.versao_protocolo,
        )
    )
    if existente is not None:
        raise Conflict(
            "Já existe um protocolo com este nome e versão na unidade.",
            code="protocolo_duplicado",
        )
    _validar_niveis(dados.niveis)
    registro = ProtocoloClassificacaoRisco(
        tenant_id=tenant_id,
        estabelecimento_id=dados.estabelecimento_id,
        nome=dados.nome.strip(),
        versao_protocolo=dados.versao_protocolo.strip(),
        descricao=dados.descricao,
        vigencia_inicio=dados.vigencia_inicio or date.today(),
        vigencia_fim=dados.vigencia_fim,
        ativo=True,
        versao=1,
        niveis=[
            NivelClassificacaoRisco(
                tenant_id=tenant_id,
                codigo=nivel.codigo.strip(),
                rotulo=nivel.rotulo.strip(),
                cor=nivel.cor.upper(),
                ordem=nivel.ordem,
                prioridade_legal=nivel.prioridade_legal,
                tempo_alvo_minutos=nivel.tempo_alvo_minutos,
                observacoes=nivel.observacoes,
                ativo=nivel.ativo,
            )
            for nivel in dados.niveis
        ],
    )
    db.add(registro)
    await db.flush()
    await registrar(
        db,
        acao=AcaoAuditoria.CRIAR,
        usuario=ator,
        tenant_id=tenant_id,
        estabelecimento_id=dados.estabelecimento_id,
        recurso="protocolo_classificacao_risco",
        recurso_id=registro.id,
        dados_depois=instantaneo(registro),
        cliente=cliente,
    )
    await db.commit()
    await db.refresh(registro)
    return registro


def _validar_niveis(niveis) -> None:
    codigos = [nivel.codigo.strip() for nivel in niveis]
    if len(set(codigos)) != len(codigos):
        raise Unprocessable(
            "Há códigos de nível repetidos no protocolo.",
            code="nivel_codigo_repetido",
            errors=[
                {
                    "campo": "niveis",
                    "mensagem": "Use um código único por nível.",
                    "codigo_regra": "nivel_codigo_repetido",
                }
            ],
        )


async def atualizar_protocolo(
    db: AsyncSession,
    *,
    tenant_id: uuid.UUID,
    usuario: Usuario,
    protocolo_id: uuid.UUID,
    dados: ProtocoloRiscoUpdate,
    versao: int,
    ator: Usuario,
    cliente: dict,
) -> ProtocoloClassificacaoRisco:
    registro = await obter_protocolo(db, tenant_id, protocolo_id)
    await _validar_unidade_vinculos(
        db,
        tenant_id,
        usuario,
        estabelecimento_id=registro.estabelecimento_id,
        setor_id=None,
        equipe_id=None,
        profissional_id=None,
        especialidade_id=None,
        protocolo_risco_id=None,
        prioridade_id=None,
        permissao=Permissao.FILA_GERENCIAR,
    )
    conferir_versao(registro.versao, versao)
    antes = instantaneo(registro)
    if dados.nome is not None:
        registro.nome = dados.nome.strip()
    if dados.versao_protocolo is not None:
        registro.versao_protocolo = dados.versao_protocolo.strip()
    if dados.descricao is not None:
        registro.descricao = dados.descricao
    if dados.vigencia_inicio is not None:
        registro.vigencia_inicio = dados.vigencia_inicio
    if dados.vigencia_fim is not None:
        registro.vigencia_fim = dados.vigencia_fim
    if dados.ativo is not None:
        registro.ativo = dados.ativo
    if dados.niveis is not None:
        _validar_niveis(dados.niveis)
        existentes = {nivel.codigo: nivel for nivel in registro.niveis}
        for nivel in dados.niveis:
            atual = existentes.pop(nivel.codigo.strip(), None)
            if atual is None:
                registro.niveis.append(
                    NivelClassificacaoRisco(
                        tenant_id=tenant_id,
                        codigo=nivel.codigo.strip(),
                        rotulo=nivel.rotulo.strip(),
                        cor=nivel.cor.upper(),
                        ordem=nivel.ordem,
                        prioridade_legal=nivel.prioridade_legal,
                        tempo_alvo_minutos=nivel.tempo_alvo_minutos,
                        observacoes=nivel.observacoes,
                        ativo=nivel.ativo,
                    )
                )
                continue
            atual.rotulo = nivel.rotulo.strip()
            atual.cor = nivel.cor.upper()
            atual.ordem = nivel.ordem
            atual.prioridade_legal = nivel.prioridade_legal
            atual.tempo_alvo_minutos = nivel.tempo_alvo_minutos
            atual.observacoes = nivel.observacoes
            atual.ativo = nivel.ativo
        for removido in existentes.values():
            removido.ativo = False
    registro.versao += 1
    await registrar(
        db,
        acao=AcaoAuditoria.ATUALIZAR,
        usuario=ator,
        tenant_id=tenant_id,
        estabelecimento_id=registro.estabelecimento_id,
        recurso="protocolo_classificacao_risco",
        recurso_id=registro.id,
        dados_antes=antes,
        dados_depois=instantaneo(registro),
        cliente=cliente,
    )
    await db.commit()
    await db.refresh(registro)
    return registro


async def listar_agendas(
    db: AsyncSession,
    tenant_id: uuid.UUID,
    usuario: Usuario,
    *,
    estabelecimento_id: uuid.UUID | None = None,
    profissional_id: uuid.UUID | None = None,
    especialidade_id: uuid.UUID | None = None,
    tipo: str | None = None,
    ativo: bool | None = None,
    limite: int = 50,
    cursor: str | None = None,
) -> tuple[list[Agenda], str | None, int]:
    limite = min(max(limite, 1), 100)
    condicoes = [Agenda.tenant_id == tenant_id]
    permitidos = escopos_estabelecimento(usuario, Permissao.AGENDA_LER)
    if permitidos is not None:
        if not permitidos:
            return [], None, 0
        condicoes.append(Agenda.estabelecimento_id.in_(permitidos))
    if estabelecimento_id:
        await exigir_acesso_estabelecimento(
            db, usuario, Permissao.AGENDA_LER, estabelecimento_id
        )
        condicoes.append(Agenda.estabelecimento_id == estabelecimento_id)
    if profissional_id:
        condicoes.append(Agenda.profissional_id == profissional_id)
    if especialidade_id:
        condicoes.append(Agenda.especialidade_id == especialidade_id)
    if tipo:
        condicoes.append(Agenda.tipo == tipo)
    if ativo is not None:
        condicoes.append(Agenda.ativo.is_(ativo))
    total = await db.scalar(select(func.count()).select_from(Agenda).where(*condicoes)) or 0
    consulta = (
        select(Agenda)
        .where(*condicoes)
        .order_by(Agenda.created_at, Agenda.id)
        .limit(limite + 1)
    )
    consulta = aplicar_cursor(consulta, Agenda, cursor)
    itens = list((await db.execute(consulta)).scalars().all())
    proximo = None
    if len(itens) > limite:
        ultimo = itens[limite - 1]
        itens = itens[:limite]
        proximo = codificar(ultimo.created_at, ultimo.id)
    return itens, proximo, int(total)


async def obter_agenda_com_escopo(
    db: AsyncSession,
    tenant_id: uuid.UUID,
    usuario: Usuario,
    agenda_id: uuid.UUID,
    permissao: Permissao = Permissao.AGENDA_LER,
) -> Agenda:
    registro = await obter_agenda(db, tenant_id, agenda_id)
    await exigir_acesso_estabelecimento(
        db, usuario, permissao, registro.estabelecimento_id
    )
    return registro


async def criar_agenda(
    db: AsyncSession,
    *,
    tenant_id: uuid.UUID,
    usuario: Usuario,
    dados: AgendaCreate,
    ator: Usuario,
    cliente: dict,
) -> Agenda:
    await _validar_unidade_vinculos(
        db,
        tenant_id,
        usuario,
        estabelecimento_id=dados.estabelecimento_id,
        setor_id=dados.setor_id,
        equipe_id=dados.equipe_id,
        profissional_id=dados.profissional_id,
        especialidade_id=dados.especialidade_id,
        protocolo_risco_id=dados.protocolo_risco_id,
        prioridade_id=dados.prioridade_padrao_id,
        permissao=Permissao.AGENDA_GERENCIAR,
    )
    _validar_horarios(dados.horarios)
    registro = Agenda(
        tenant_id=tenant_id,
        estabelecimento_id=dados.estabelecimento_id,
        setor_id=dados.setor_id,
        equipe_id=dados.equipe_id,
        profissional_id=dados.profissional_id,
        especialidade_id=dados.especialidade_id,
        protocolo_risco_id=dados.protocolo_risco_id,
        prioridade_padrao_id=dados.prioridade_padrao_id,
        procedimento_sigtap=_validar_procedimento(dados.procedimento_sigtap),
        nome=dados.nome.strip(),
        tipo=dados.tipo,
        modalidade=dados.modalidade,
        permite_encaixe=dados.permite_encaixe,
        falta_automatica=dados.falta_automatica,
        tolerancia_atraso_minutos=dados.tolerancia_atraso_minutos,
        antecedencia_minima_horas=dados.antecedencia_minima_horas,
        antecedencia_maxima_dias=dados.antecedencia_maxima_dias,
        idade_minima=dados.idade_minima,
        idade_maxima=dados.idade_maxima,
        sexos_permitidos=dados.sexos_permitidos,
        vigencia_inicio=dados.vigencia_inicio or date.today(),
        vigencia_fim=dados.vigencia_fim,
        observacoes=dados.observacoes,
        ativo=True,
        versao=1,
        horarios=[
            AgendaHorario(
                tenant_id=tenant_id,
                dia_semana=horario.dia_semana,
                hora_inicio=horario.hora_inicio,
                hora_fim=horario.hora_fim,
                duracao_minutos=horario.duracao_minutos,
                vagas_por_horario=horario.vagas_por_horario,
                ativo=horario.ativo,
            )
            for horario in dados.horarios
        ],
    )
    db.add(registro)
    await db.flush()
    await registrar(
        db,
        acao=AcaoAuditoria.CRIAR,
        usuario=ator,
        tenant_id=tenant_id,
        estabelecimento_id=registro.estabelecimento_id,
        recurso="agenda",
        recurso_id=registro.id,
        dados_depois=instantaneo(registro),
        cliente=cliente,
    )
    await db.commit()
    await db.refresh(registro)
    return registro


async def atualizar_agenda(
    db: AsyncSession,
    *,
    tenant_id: uuid.UUID,
    usuario: Usuario,
    agenda_id: uuid.UUID,
    dados: AgendaUpdate,
    versao: int,
    ator: Usuario,
    cliente: dict,
) -> Agenda:
    registro = await obter_agenda_com_escopo(
        db, tenant_id, usuario, agenda_id, Permissao.AGENDA_GERENCIAR
    )
    conferir_versao(registro.versao, versao)
    if registro.baixa_em is not None:
        raise Conflict("Agenda baixada não pode ser alterada.", code="agenda_baixada")
    if dados.horarios is not None:
        _validar_horarios(dados.horarios)
    anteriores = {
        "setor_id": registro.setor_id,
        "equipe_id": registro.equipe_id,
        "profissional_id": registro.profissional_id,
        "especialidade_id": registro.especialidade_id,
        "protocolo_risco_id": registro.protocolo_risco_id,
        "prioridade_padrao_id": registro.prioridade_padrao_id,
    }
    for campo, valor in anteriores.items():
        if getattr(dados, campo) is not None:
            setattr(registro, campo, getattr(dados, campo))
    await _validar_unidade_vinculos(
        db,
        tenant_id,
        usuario,
        estabelecimento_id=registro.estabelecimento_id,
        setor_id=registro.setor_id,
        equipe_id=registro.equipe_id,
        profissional_id=registro.profissional_id,
        especialidade_id=registro.especialidade_id,
        protocolo_risco_id=registro.protocolo_risco_id,
        prioridade_id=registro.prioridade_padrao_id,
        permissao=Permissao.AGENDA_GERENCIAR,
    )
    antes = instantaneo(registro)
    for campo in (
        "nome",
        "tipo",
        "modalidade",
        "permite_encaixe",
        "falta_automatica",
        "tolerancia_atraso_minutos",
        "antecedencia_minima_horas",
        "antecedencia_maxima_dias",
        "idade_minima",
        "idade_maxima",
        "sexos_permitidos",
        "vigencia_inicio",
        "vigencia_fim",
        "observacoes",
        "ativo",
    ):
        valor = getattr(dados, campo)
        if valor is not None:
            setattr(registro, campo, valor)
    if dados.procedimento_sigtap is not None:
        registro.procedimento_sigtap = _validar_procedimento(dados.procedimento_sigtap)
    if dados.horarios is not None:
        for existente in list(registro.horarios):
            await db.delete(existente)
        registro.horarios.clear()
        for horario in dados.horarios:
            registro.horarios.append(
                AgendaHorario(
                    tenant_id=tenant_id,
                    dia_semana=horario.dia_semana,
                    hora_inicio=horario.hora_inicio,
                    hora_fim=horario.hora_fim,
                    duracao_minutos=horario.duracao_minutos,
                    vagas_por_horario=horario.vagas_por_horario,
                    ativo=horario.ativo,
                )
            )
    registro.versao += 1
    await registrar(
        db,
        acao=AcaoAuditoria.ATUALIZAR,
        usuario=ator,
        tenant_id=tenant_id,
        estabelecimento_id=registro.estabelecimento_id,
        recurso="agenda",
        recurso_id=registro.id,
        dados_antes=antes,
        dados_depois=instantaneo(registro),
        cliente=cliente,
    )
    await db.commit()
    await db.refresh(registro)
    return registro


async def baixar_agenda(
    db: AsyncSession,
    *,
    tenant_id: uuid.UUID,
    usuario: Usuario,
    agenda_id: uuid.UUID,
    motivo: str,
    ator: Usuario,
    cliente: dict,
) -> Agenda:
    registro = await obter_agenda_com_escopo(
        db, tenant_id, usuario, agenda_id, Permissao.AGENDA_GERENCIAR
    )
    if registro.baixa_em is not None:
        return registro
    antes = instantaneo(registro)
    registro.ativo = False
    registro.baixa_em = agora()
    registro.baixa_motivo = motivo
    registro.baixa_por_id = ator.id
    registro.versao += 1
    await registrar(
        db,
        acao=AcaoAuditoria.BAIXAR,
        usuario=ator,
        tenant_id=tenant_id,
        estabelecimento_id=registro.estabelecimento_id,
        recurso="agenda",
        recurso_id=registro.id,
        justificativa=motivo,
        dados_antes=antes,
        dados_depois=instantaneo(registro),
        cliente=cliente,
    )
    await db.commit()
    return registro


async def listar_bloqueios(
    db: AsyncSession,
    tenant_id: uuid.UUID,
    usuario: Usuario,
    agenda_id: uuid.UUID,
) -> list[AgendaBloqueio]:
    await obter_agenda_com_escopo(db, tenant_id, usuario, agenda_id)
    return list(
        (
            await db.execute(
                select(AgendaBloqueio)
                .where(
                    AgendaBloqueio.tenant_id == tenant_id,
                    AgendaBloqueio.agenda_id == agenda_id,
                )
                .order_by(AgendaBloqueio.inicio_em)
            )
        )
        .scalars()
        .all()
    )


async def criar_bloqueio(
    db: AsyncSession,
    *,
    tenant_id: uuid.UUID,
    usuario: Usuario,
    agenda_id: uuid.UUID,
    dados: AgendaBloqueioCreate,
    ator: Usuario,
    cliente: dict,
) -> AgendaBloqueio:
    agenda = await obter_agenda_com_escopo(
        db, tenant_id, usuario, agenda_id, Permissao.AGENDA_GERENCIAR
    )
    fuso = await fuso_organizacao(db, tenant_id)
    inicio = local_para_utc(dados.inicio_em, fuso)
    fim = local_para_utc(dados.fim_em, fuso)
    if fim <= inicio:
        raise Unprocessable("O fim do bloqueio deve ser posterior ao início.")
    registro = AgendaBloqueio(
        tenant_id=tenant_id,
        agenda_id=agenda.id,
        inicio_em=inicio,
        fim_em=fim,
        tipo=dados.tipo,
        motivo=dados.motivo,
        criado_por_id=ator.id,
        versao=1,
    )
    db.add(registro)
    await db.flush()
    await registrar(
        db,
        acao=AcaoAuditoria.CRIAR,
        usuario=ator,
        tenant_id=tenant_id,
        estabelecimento_id=agenda.estabelecimento_id,
        recurso="agenda_bloqueio",
        recurso_id=registro.id,
        dados_depois=instantaneo(registro),
        cliente=cliente,
    )
    await db.commit()
    return registro


async def cancelar_bloqueio(
    db: AsyncSession,
    *,
    tenant_id: uuid.UUID,
    usuario: Usuario,
    agenda_id: uuid.UUID,
    bloqueio_id: uuid.UUID,
    dados: BloqueioCancelamento,
    ator: Usuario,
    cliente: dict,
) -> AgendaBloqueio:
    agenda = await obter_agenda_com_escopo(
        db, tenant_id, usuario, agenda_id, Permissao.AGENDA_GERENCIAR
    )
    registro = await db.scalar(
        select(AgendaBloqueio).where(
            AgendaBloqueio.id == bloqueio_id,
            AgendaBloqueio.tenant_id == tenant_id,
            AgendaBloqueio.agenda_id == agenda.id,
        )
    )
    if registro is None:
        raise NotFound("Bloqueio de agenda não encontrado.")
    if registro.cancelado_em is not None:
        return registro
    antes = instantaneo(registro)
    registro.cancelado_em = agora()
    registro.cancelado_motivo = dados.motivo
    registro.cancelado_por_id = ator.id
    registro.versao += 1
    await registrar(
        db,
        acao=AcaoAuditoria.BAIXAR,
        usuario=ator,
        tenant_id=tenant_id,
        estabelecimento_id=agenda.estabelecimento_id,
        recurso="agenda_bloqueio",
        recurso_id=registro.id,
        justificativa=dados.motivo,
        dados_antes=antes,
        dados_depois=instantaneo(registro),
        cliente=cliente,
    )
    await db.commit()
    return registro


async def disponibilidade(
    db: AsyncSession,
    tenant_id: uuid.UUID,
    usuario: Usuario,
    agenda_id: uuid.UUID,
    *,
    data_inicio: date,
    data_fim: date,
) -> DisponibilidadeOut:
    agenda = await obter_agenda_com_escopo(db, tenant_id, usuario, agenda_id)
    if data_fim < data_inicio:
        raise Unprocessable("A data final deve ser maior ou igual à inicial.")
    if (data_fim - data_inicio).days > 31:
        raise Unprocessable(
            "O período máximo de consulta de disponibilidade é 31 dias.",
            code="periodo_disponibilidade",
        )
    fuso = await fuso_organizacao(db, tenant_id)
    bloqueios = list(
        (
            await db.execute(
                select(AgendaBloqueio).where(
                    AgendaBloqueio.tenant_id == tenant_id,
                    AgendaBloqueio.agenda_id == agenda.id,
                    AgendaBloqueio.cancelado_em.is_(None),
                    AgendaBloqueio.fim_em > _inicio_utc(data_inicio, fuso),
                    AgendaBloqueio.inicio_em < _fim_utc(data_fim, fuso),
                )
            )
        )
        .scalars()
        .all()
    )
    agendamentos = list(
        (
            await db.execute(
                select(Agendamento).where(
                    Agendamento.tenant_id == tenant_id,
                    Agendamento.agenda_id == agenda.id,
                    Agendamento.situacao.in_(STATUS_OCUPAM_VAGA),
                    Agendamento.inicio_em < _fim_utc(data_fim, fuso),
                    Agendamento.fim_em > _inicio_utc(data_inicio, fuso),
                )
            )
        )
        .scalars()
        .all()
    )
    dias: list[DisponibilidadeDiaOut] = []
    cursor = data_inicio
    agora_utc = datetime.now(timezone.utc)
    while cursor <= data_fim:
        slots_dia: list[DisponibilidadeSlotOut] = []
        if agenda.vigencia_inicio <= cursor and (
            agenda.vigencia_fim is None or agenda.vigencia_fim >= cursor
        ):
            for horario in agenda.horarios:
                if not horario.ativo or horario.dia_semana != dia_semana(cursor):
                    continue
                inicio_dt = combinar_local(cursor, horario.hora_inicio, fuso)
                fim_dia = combinar_local(cursor, horario.hora_fim, fuso)
                passo = timedelta(minutes=horario.duracao_minutos)
                while inicio_dt + passo <= fim_dia:
                    fim_dt = inicio_dt + passo
                    ocupadas = sum(
                        1
                        for agendamento in agendamentos
                        if aware(agendamento.inicio_em) < fim_dt
                        and aware(agendamento.fim_em) > inicio_dt
                    )
                    bloqueio = next(
                        (
                            item
                            for item in bloqueios
                            if aware(item.inicio_em) < fim_dt
                            and aware(item.fim_em) > inicio_dt
                        ),
                        None,
                    )
                    motivo = None
                    if bloqueio is not None:
                        motivo = f"Bloqueado: {bloqueio.motivo}"
                    elif inicio_dt <= agora_utc:
                        motivo = "Horário já passou."
                    disponivel = (
                        motivo is None
                        and ocupadas < horario.vagas_por_horario
                    )
                    slots_dia.append(
                        DisponibilidadeSlotOut(
                            inicio_em=inicio_dt,
                            fim_em=fim_dt,
                            inicio_local=utc_para_local(inicio_dt, fuso).isoformat(),
                            fim_local=utc_para_local(fim_dt, fuso).isoformat(),
                            ocupadas=ocupadas,
                            vagas=max(0, horario.vagas_por_horario - ocupadas),
                            disponivel=disponivel,
                            bloqueado=bloqueio is not None,
                            motivo=motivo,
                        )
                    )
                    inicio_dt = fim_dt
        dias.append(
            DisponibilidadeDiaOut(
                data=cursor, dia_semana=dia_semana(cursor), slots=slots_dia
            )
        )
        cursor += timedelta(days=1)
    return DisponibilidadeOut(
        agenda_id=agenda.id,
        fuso_horario=str(fuso),
        data_inicio=data_inicio,
        data_fim=data_fim,
        dias=dias,
    )


def _inicio_utc(data_ref: date, fuso) -> datetime:
    return datetime.combine(data_ref, time.min, tzinfo=fuso).astimezone(timezone.utc)


def _fim_utc(data_ref: date, fuso) -> datetime:
    return (
        datetime.combine(data_ref + timedelta(days=1), time.min, tzinfo=fuso)
        .astimezone(timezone.utc)
    )
