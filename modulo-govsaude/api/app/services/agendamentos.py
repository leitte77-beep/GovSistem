"""Agendamentos, confirmação, cancelamento, reagendamento e falta (Fase 4).

Requisitos: B.6-002, B.6-003, B.6-005, B.12-018.
"""

from __future__ import annotations

import uuid
from datetime import date, datetime, time, timedelta, timezone

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.errors import Conflict, NotFound, Unprocessable
from app.core.permissoes import Permissao
from app.core.security import agora, hmac_hex
from app.models.agenda import (
    Agenda,
    AgendaBloqueio,
    AgendaHorario,
    Agendamento,
    FilaAtendimento,
)
from app.models.cidadao import Cidadao
from app.models.enums import AcaoAuditoria, SituacaoAgendamento, SituacaoFila
from app.models.nucleo import Usuario
from app.schemas.agenda import (
    AgendamentoCancelar,
    AgendamentoCreate,
    AgendamentoFalta,
    AgendamentoReagendar,
    AgendamentoReverterFalta,
    AgendamentoUpdate,
)
from app.services.agenda_comum import (
    aware,
    dia_semana,
    fuso_organizacao,
    gerar_codigo,
    local_para_utc,
    obter_agenda,
    obter_agendamento,
    obter_nivel,
    obter_prioridade,
    obter_protocolo,
)
from app.services.auditoria import instantaneo, registrar
from app.services.paginacao import aplicar_cursor, codificar
from app.services.rede_comum import (
    conferir_versao,
    escopos_estabelecimento,
    exigir_acesso_estabelecimento,
)

STATUS_ATIVOS = {
    SituacaoAgendamento.AGENDADO.value,
    SituacaoAgendamento.CONFIRMADO.value,
    SituacaoAgendamento.AGUARDANDO.value,
    SituacaoAgendamento.EM_ATENDIMENTO.value,
}
STATUS_NAO_REAGENDAVEIS = {
    SituacaoAgendamento.ATENDIDO.value,
    SituacaoAgendamento.CANCELADO.value,
    SituacaoAgendamento.FALTOU.value,
    SituacaoAgendamento.VENCIDO.value,
    SituacaoAgendamento.REAGENDADO.value,
}


def _alerta(codigo: str, mensagem: str, *, bloqueante: bool = False) -> dict:
    return {"codigo": codigo, "mensagem": mensagem, "bloqueante": bloqueante}


def alertas_agendamento(
    agenda: Agenda, cidadao: Cidadao, inicio_local: datetime
) -> list[dict]:
    alertas: list[dict] = []
    if agenda.idade_minima is not None or agenda.idade_maxima is not None:
        if cidadao.data_nascimento is None:
            alertas.append(
                _alerta(
                    "idade_nao_informada",
                    "Data de nascimento ausente: não foi possível conferir a faixa de idade.",
                )
            )
        else:
            idade = (
                inicio_local.date().year
                - cidadao.data_nascimento.year
                - (
                    (inicio_local.date().month, inicio_local.date().day)
                    < (cidadao.data_nascimento.month, cidadao.data_nascimento.day)
                )
            )
            if agenda.idade_minima is not None and idade < agenda.idade_minima:
                alertas.append(
                    _alerta(
                        "idade_abaixo_minima",
                        f"Idade {idade} abaixo da mínima configurada ({agenda.idade_minima}).",
                        bloqueante=True,
                    )
                )
            if agenda.idade_maxima is not None and idade > agenda.idade_maxima:
                alertas.append(
                    _alerta(
                        "idade_acima_maxima",
                        f"Idade {idade} acima da máxima configurada ({agenda.idade_maxima}).",
                        bloqueante=True,
                    )
                )
    if agenda.sexos_permitidos:
        permitidos = {str(item).upper() for item in agenda.sexos_permitidos}
        if cidadao.sexo.upper() not in permitidos:
            alertas.append(
                _alerta(
                    "sexo_incompativel",
                    "Sexo do cidadão não está entre os configurados para esta agenda.",
                    bloqueante=True,
                )
            )
    return alertas


def _duracao_do_horario(
    agenda: Agenda, inicio_local: datetime
) -> tuple[AgendaHorario | None, int | None]:
    for horario in agenda.horarios:
        if not horario.ativo or horario.dia_semana != dia_semana(inicio_local.date()):
            continue
        if not (horario.hora_inicio <= inicio_local.time() < horario.hora_fim):
            continue
        base = inicio_local.replace(
            hour=horario.hora_inicio.hour,
            minute=horario.hora_inicio.minute,
            second=0,
            microsecond=0,
        )
        decorrido = int((inicio_local - base).total_seconds())
        passo = horario.duracao_minutos * 60
        if decorrido < 0 or decorrido % passo != 0:
            return horario, None
        if inicio_local + timedelta(minutes=horario.duracao_minutos) > inicio_local.replace(
            hour=horario.hora_fim.hour,
            minute=horario.hora_fim.minute,
            second=0,
            microsecond=0,
        ):
            return horario, None
        return horario, horario.duracao_minutos
    return None, None


async def _validar_classificacao(
    db: AsyncSession,
    tenant_id: uuid.UUID,
    *,
    estabelecimento_id: uuid.UUID,
    prioridade_id: uuid.UUID | None,
    protocolo_risco_id: uuid.UUID | None,
    nivel_risco_id: uuid.UUID | None,
) -> None:
    if prioridade_id:
        await obter_prioridade(db, tenant_id, prioridade_id)
    if nivel_risco_id and not protocolo_risco_id:
        raise Unprocessable(
            "Informe o protocolo junto com o nível de risco.",
            code="protocolo_obrigatorio",
            errors=[
                {
                    "campo": "protocolo_risco_id",
                    "mensagem": "Selecione o protocolo do nível.",
                    "codigo_regra": "protocolo_obrigatorio",
                }
            ],
        )
    if protocolo_risco_id:
        protocolo = await obter_protocolo(db, tenant_id, protocolo_risco_id)
        if protocolo.estabelecimento_id != estabelecimento_id:
            raise Unprocessable(
                "O protocolo de risco pertence a outra unidade.",
                code="protocolo_outra_unidade",
            )
        if nivel_risco_id:
            nivel = await obter_nivel(db, tenant_id, nivel_risco_id)
            if nivel.protocolo_id != protocolo.id:
                raise Unprocessable(
                    "O nível de risco não pertence ao protocolo informado.",
                    code="nivel_protocolo",
                )


async def _validar_slot(
    db: AsyncSession,
    tenant_id: uuid.UUID,
    agenda: Agenda,
    inicio_utc: datetime,
    fim_utc: datetime,
    *,
    cidadao_id: uuid.UUID | None = None,
    ignorar_id: uuid.UUID | None = None,
    verificar_vagas: bool = True,
) -> list[dict]:
    alertas: list[dict] = []
    fuso = await fuso_organizacao(db, tenant_id)
    inicio_local = inicio_utc.astimezone(fuso)
    data_local = inicio_local.date()
    if agenda.baixa_em is not None or not agenda.ativo:
        raise Conflict("Agenda inativa ou baixada.", code="agenda_inativa")
    if data_local < agenda.vigencia_inicio or (
        agenda.vigencia_fim is not None and data_local > agenda.vigencia_fim
    ):
        raise Conflict(
            "A data está fora da vigência da agenda.",
            code="fora_vigencia_agenda",
        )
    if cidadao_id:
        inicio_janela = inicio_utc - timedelta(minutes=1)
        fim_janela = fim_utc + timedelta(minutes=1)
        existente = await db.scalar(
            select(Agendamento).where(
                Agendamento.tenant_id == tenant_id,
                Agendamento.cidadao_id == cidadao_id,
                Agendamento.situacao.in_(STATUS_ATIVOS),
                Agendamento.inicio_em < fim_janela,
                Agendamento.fim_em > inicio_janela,
                *([Agendamento.id != ignorar_id] if ignorar_id else []),
            )
        )
        if existente is not None:
            raise Conflict(
                "O cidadão já possui agendamento ativo neste horário.",
                code="agendamento_duplicado",
                extra={"agendamento_id": str(existente.id)},
            )
    if verificar_vagas:
        conflito_vaga = await db.scalar(
            select(func.count())
            .select_from(Agendamento)
            .where(
                Agendamento.tenant_id == tenant_id,
                Agendamento.agenda_id == agenda.id,
                Agendamento.situacao.in_(STATUS_ATIVOS),
                Agendamento.inicio_em < fim_utc,
                Agendamento.fim_em > inicio_utc,
                *([Agendamento.id != ignorar_id] if ignorar_id else []),
            )
        ) or 0
        horario, duracao = _duracao_do_horario(agenda, inicio_local)
        if duracao is None:
            raise Conflict(
                "Horário fora da grade de atendimento da agenda.",
                code="horario_fora_grade",
            )
        capacidade = horario.vagas_por_horario if horario else 1
        if int(conflito_vaga) >= capacidade:
            raise Conflict(
                "Não há vaga disponível neste horário.",
                code="vaga_indisponivel",
            )
        bloqueio = await db.scalar(
            select(AgendaBloqueio).where(
                AgendaBloqueio.tenant_id == tenant_id,
                AgendaBloqueio.agenda_id == agenda.id,
                AgendaBloqueio.cancelado_em.is_(None),
                AgendaBloqueio.inicio_em < fim_utc,
                AgendaBloqueio.fim_em > inicio_utc,
            )
        )
        if bloqueio is not None:
            raise Conflict(
                f"Horário bloqueado na agenda: {bloqueio.motivo}",
                code="horario_bloqueado",
            )
    if inicio_utc <= agora() - timedelta(minutes=1):
        raise Unprocessable(
            "Não é possível agendar em horário passado.",
            code="horario_passado",
        )
    if agenda.antecedencia_minima_horas:
        minimo = agora() + timedelta(hours=agenda.antecedencia_minima_horas)
        if inicio_utc < minimo:
            raise Conflict(
                f"A agenda exige antecedência mínima de "
                f"{agenda.antecedencia_minima_horas} hora(s).",
                code="antecedencia_minima",
            )
    if agenda.antecedencia_maxima_dias:
        maximo = agora() + timedelta(days=agenda.antecedencia_maxima_dias)
        if inicio_utc > maximo:
            raise Conflict(
                f"A agenda permite agendamento com no máximo "
                f"{agenda.antecedencia_maxima_dias} dia(s) de antecedência.",
                code="antecedencia_maxima",
            )
    return alertas


async def _montar(
    db: AsyncSession,
    *,
    tenant_id: uuid.UUID,
    usuario: Usuario,
    dados: AgendamentoCreate,
    ignorar_id: uuid.UUID | None = None,
) -> tuple[Agenda, Cidadao, datetime, datetime, str, list[dict]]:
    agenda = await obter_agenda(db, tenant_id, dados.agenda_id)
    await exigir_acesso_estabelecimento(
        db, usuario, Permissao.AGENDA_GERENCIAR, agenda.estabelecimento_id
    )
    cidadao = await db.scalar(
        select(Cidadao).where(
            Cidadao.id == dados.cidadao_id, Cidadao.tenant_id == tenant_id
        )
    )
    if cidadao is None or cidadao.baixa_em is not None:
        raise NotFound("Cidadão não encontrado.")
    if cidadao.unificado_para_id is not None:
        raise Conflict(
            "O cidadão foi unificado a outro cadastro.",
            code="cidadao_unificado",
            extra={"cidadao_destino_id": str(cidadao.unificado_para_id)},
        )
    fuso = await fuso_organizacao(db, tenant_id)
    inicio_utc = local_para_utc(dados.inicio_em, fuso)
    inicio_local = inicio_utc.astimezone(fuso)
    alertas = alertas_agendamento(agenda, cidadao, inicio_local)
    bloqueantes = [item for item in alertas if item["bloqueante"]]
    justificativa = (dados.justificativa_excecao or "").strip()
    if bloqueantes and not dados.forcar_incompatibilidade:
        raise Unprocessable(
            "O agendamento é incompatível com a configuração da agenda.",
            code="agendamento_incompativel",
            errors=[
                {
                    "campo": "cidadao_id",
                    "mensagem": item["mensagem"],
                    "codigo_regra": item["codigo"],
                }
                for item in bloqueantes
            ],
            extra={"alertas": alertas},
        )
    if bloqueantes:
        if not agenda.permite_encaixe or len(justificativa) < 20:
            raise Unprocessable(
                "A exceção de incompatibilidade exige agenda com encaixe e "
                "justificativa de 20+ caracteres.",
                code="justificativa_incompatibilidade",
                extra={"alertas": alertas},
            )
    horario, duracao = _duracao_do_horario(agenda, inicio_local)
    if duracao is None and not dados.encaixe:
        raise Conflict(
            "Horário fora da grade de atendimento da agenda.",
            code="horario_fora_grade",
        )
    if dados.encaixe and not agenda.permite_encaixe:
        raise Unprocessable(
            "Esta agenda não permite encaixe.",
            code="encaixe_nao_permitido",
        )
    if dados.encaixe and len(justificativa) < 20:
        raise Unprocessable(
            "O encaixe exige justificativa de 20+ caracteres.",
            code="justificativa_encaixe",
        )
    duracao = duracao or (_duracao_do_horario(agenda, inicio_local)[1]) or 30
    fim_utc = inicio_utc + timedelta(minutes=duracao)
    await _validar_slot(
        db,
        tenant_id,
        agenda,
        inicio_utc,
        fim_utc,
        cidadao_id=cidadao.id,
        ignorar_id=ignorar_id,
        verificar_vagas=not dados.encaixe,
    )
    await _validar_classificacao(
        db,
        tenant_id,
        estabelecimento_id=agenda.estabelecimento_id,
        prioridade_id=dados.prioridade_id or agenda.prioridade_padrao_id,
        protocolo_risco_id=dados.protocolo_risco_id or agenda.protocolo_risco_id,
        nivel_risco_id=dados.nivel_risco_id,
    )
    registro_id = uuid.uuid4()
    codigo = gerar_codigo("AGD", registro_id)
    excecao = bool(dados.encaixe or bloqueantes)
    registro = Agendamento(
        id=registro_id,
        tenant_id=tenant_id,
        agenda_id=agenda.id,
        estabelecimento_id=agenda.estabelecimento_id,
        setor_id=agenda.setor_id,
        profissional_id=agenda.profissional_id,
        especialidade_id=agenda.especialidade_id,
        cidadao_id=cidadao.id,
        prioridade_id=dados.prioridade_id or agenda.prioridade_padrao_id,
        protocolo_risco_id=dados.protocolo_risco_id or agenda.protocolo_risco_id,
        nivel_risco_id=dados.nivel_risco_id,
        procedimento_sigtap=dados.procedimento_sigtap or agenda.procedimento_sigtap,
        inicio_em=inicio_utc,
        fim_em=fim_utc,
        situacao=SituacaoAgendamento.AGENDADO.value,
        origem=dados.origem,
        encaixe=dados.encaixe,
        excecao_justificada=excecao,
        justificativa_excecao=justificativa or None,
        observacoes=dados.observacoes,
        codigo_hash=hmac_hex(codigo),
        id_cliente=dados.id_cliente,
        versao=1,
    )
    registro.agenda = agenda
    registro.cidadao = cidadao
    db.add(registro)
    await db.flush()
    return agenda, cidadao, inicio_utc, fim_utc, codigo, alertas


async def criar(
    db: AsyncSession,
    *,
    tenant_id: uuid.UUID,
    usuario: Usuario,
    dados: AgendamentoCreate,
    ator: Usuario,
    cliente: dict,
) -> tuple[Agendamento, str, list[dict]]:
    agenda, cidadao, inicio, _fim, codigo, alertas = await _montar(
        db, tenant_id=tenant_id, usuario=usuario, dados=dados
    )
    registro = await db.scalar(
        select(Agendamento).where(
            Agendamento.tenant_id == tenant_id,
            Agendamento.codigo_hash == hmac_hex(codigo),
        )
    )
    await registrar(
        db,
        acao=AcaoAuditoria.CRIAR,
        usuario=ator,
        tenant_id=tenant_id,
        estabelecimento_id=agenda.estabelecimento_id,
        recurso="agendamento",
        recurso_id=registro.id if registro else None,
        justificativa=registro.justificativa_excecao if registro else None,
        dados_depois=instantaneo(registro) if registro else None,
        cliente=cliente,
    )
    await db.commit()
    return registro, codigo, alertas


async def listar(
    db: AsyncSession,
    tenant_id: uuid.UUID,
    usuario: Usuario,
    *,
    estabelecimento_id: uuid.UUID | None = None,
    agenda_id: uuid.UUID | None = None,
    profissional_id: uuid.UUID | None = None,
    cidadao_id: uuid.UUID | None = None,
    situacao: str | None = None,
    data_inicio: date | None = None,
    data_fim: date | None = None,
    limite: int = 50,
    cursor: str | None = None,
) -> tuple[list[Agendamento], str | None, int]:
    limite = min(max(limite, 1), 100)
    condicoes = [Agendamento.tenant_id == tenant_id]
    permitidos = escopos_estabelecimento(usuario, Permissao.AGENDA_LER)
    if permitidos is not None:
        if not permitidos:
            return [], None, 0
        condicoes.append(Agendamento.estabelecimento_id.in_(permitidos))
    if estabelecimento_id:
        await exigir_acesso_estabelecimento(
            db, usuario, Permissao.AGENDA_LER, estabelecimento_id
        )
        condicoes.append(Agendamento.estabelecimento_id == estabelecimento_id)
    if agenda_id:
        condicoes.append(Agendamento.agenda_id == agenda_id)
    if profissional_id:
        condicoes.append(Agendamento.profissional_id == profissional_id)
    if cidadao_id:
        condicoes.append(Agendamento.cidadao_id == cidadao_id)
    if situacao:
        condicoes.append(Agendamento.situacao == situacao)
    fuso = await fuso_organizacao(db, tenant_id)
    if data_inicio:
        condicoes.append(
            Agendamento.inicio_em
            >= datetime.combine(data_inicio, time.min, tzinfo=fuso).astimezone(
                timezone.utc
            )
        )
    if data_fim:
        condicoes.append(
            Agendamento.inicio_em
            < datetime.combine(
                data_fim + timedelta(days=1), time.min, tzinfo=fuso
            ).astimezone(timezone.utc)
        )
    total = await db.scalar(
        select(func.count()).select_from(Agendamento).where(*condicoes)
    ) or 0
    consulta = (
        select(Agendamento)
        .where(*condicoes)
        .order_by(Agendamento.created_at, Agendamento.id)
        .limit(limite + 1)
    )
    consulta = aplicar_cursor(consulta, Agendamento, cursor)
    itens = list((await db.execute(consulta)).scalars().all())
    proximo = None
    if len(itens) > limite:
        ultimo = itens[limite - 1]
        itens = itens[:limite]
        proximo = codificar(ultimo.created_at, ultimo.id)
    return itens, proximo, int(total)


async def obter_com_escopo(
    db: AsyncSession,
    tenant_id: uuid.UUID,
    usuario: Usuario,
    agendamento_id: uuid.UUID,
    permissao: Permissao = Permissao.AGENDA_LER,
) -> Agendamento:
    registro = await obter_agendamento(db, tenant_id, agendamento_id)
    await exigir_acesso_estabelecimento(
        db, usuario, permissao, registro.estabelecimento_id
    )
    return registro


async def atualizar(
    db: AsyncSession,
    *,
    tenant_id: uuid.UUID,
    usuario: Usuario,
    agendamento_id: uuid.UUID,
    dados: AgendamentoUpdate,
    versao: int,
    ator: Usuario,
    cliente: dict,
) -> Agendamento:
    registro = await obter_com_escopo(
        db, tenant_id, usuario, agendamento_id, Permissao.AGENDA_GERENCIAR
    )
    conferir_versao(registro.versao, versao)
    if registro.situacao in {
        SituacaoAgendamento.CANCELADO.value,
        SituacaoAgendamento.FALTOU.value,
        SituacaoAgendamento.VENCIDO.value,
        SituacaoAgendamento.REAGENDADO.value,
    }:
        raise Conflict(
            "Agendamento encerrado não pode ser alterado.",
            code="agendamento_encerrado",
        )
    await _validar_classificacao(
        db,
        tenant_id,
        estabelecimento_id=registro.estabelecimento_id,
        prioridade_id=dados.prioridade_id,
        protocolo_risco_id=dados.protocolo_risco_id,
        nivel_risco_id=dados.nivel_risco_id,
    )
    antes = instantaneo(registro)
    if dados.prioridade_id is not None:
        registro.prioridade_id = dados.prioridade_id
    if dados.protocolo_risco_id is not None:
        registro.protocolo_risco_id = dados.protocolo_risco_id
    if dados.nivel_risco_id is not None:
        registro.nivel_risco_id = dados.nivel_risco_id
    if dados.procedimento_sigtap is not None:
        registro.procedimento_sigtap = dados.procedimento_sigtap
    if dados.observacoes is not None:
        registro.observacoes = dados.observacoes
    registro.versao += 1
    await registrar(
        db,
        acao=AcaoAuditoria.ATUALIZAR,
        usuario=ator,
        tenant_id=tenant_id,
        estabelecimento_id=registro.estabelecimento_id,
        recurso="agendamento",
        recurso_id=registro.id,
        dados_antes=antes,
        dados_depois=instantaneo(registro),
        cliente=cliente,
    )
    await db.commit()
    return registro


async def confirmar(
    db: AsyncSession,
    *,
    tenant_id: uuid.UUID,
    usuario: Usuario,
    agendamento_id: uuid.UUID,
    ator: Usuario,
    cliente: dict,
) -> Agendamento:
    registro = await obter_com_escopo(
        db, tenant_id, usuario, agendamento_id, Permissao.AGENDA_GERENCIAR
    )
    if registro.situacao == SituacaoAgendamento.CONFIRMADO.value:
        return registro
    if registro.situacao != SituacaoAgendamento.AGENDADO.value:
        raise Conflict(
            "Somente agendamento pendente pode ser confirmado.",
            code="confirmacao_invalida",
        )
    antes = instantaneo(registro)
    registro.situacao = SituacaoAgendamento.CONFIRMADO.value
    registro.confirmado_em = agora()
    registro.versao += 1
    await registrar(
        db,
        acao=AcaoAuditoria.ATUALIZAR,
        usuario=ator,
        tenant_id=tenant_id,
        estabelecimento_id=registro.estabelecimento_id,
        recurso="agendamento",
        recurso_id=registro.id,
        dados_antes=antes,
        dados_depois=instantaneo(registro),
        cliente=cliente,
    )
    await db.commit()
    return registro


async def cancelar(
    db: AsyncSession,
    *,
    tenant_id: uuid.UUID,
    usuario: Usuario,
    agendamento_id: uuid.UUID,
    dados: AgendamentoCancelar,
    ator: Usuario,
    cliente: dict,
) -> Agendamento:
    registro = await obter_com_escopo(
        db, tenant_id, usuario, agendamento_id, Permissao.AGENDA_GERENCIAR
    )
    if registro.situacao == SituacaoAgendamento.CANCELADO.value:
        return registro
    if registro.situacao == SituacaoAgendamento.ATENDIDO.value:
        raise Conflict(
            "Agendamento já atendido não pode ser cancelado.",
            code="cancelamento_invalido",
        )
    fila = await db.scalar(
        select(FilaAtendimento).where(
            FilaAtendimento.tenant_id == tenant_id,
            FilaAtendimento.agendamento_id == registro.id,
            FilaAtendimento.situacao.notin_(
                [
                    SituacaoFila.ATENDIDO.value,
                    SituacaoFila.EVADIDO.value,
                    SituacaoFila.CANCELADO.value,
                ]
            ),
        )
    )
    if fila is not None:
        raise Conflict(
            "O cidadão está na fila; finalize ou evada a fila antes de cancelar.",
            code="agendamento_na_fila",
            extra={"fila_id": str(fila.id)},
        )
    antes = instantaneo(registro)
    registro.situacao = SituacaoAgendamento.CANCELADO.value
    registro.cancelado_em = agora()
    registro.motivo_cancelamento = dados.motivo
    registro.versao += 1
    await registrar(
        db,
        acao=AcaoAuditoria.BAIXAR,
        usuario=ator,
        tenant_id=tenant_id,
        estabelecimento_id=registro.estabelecimento_id,
        recurso="agendamento",
        recurso_id=registro.id,
        justificativa=dados.motivo,
        dados_antes=antes,
        dados_depois=instantaneo(registro),
        cliente=cliente,
    )
    await db.commit()
    return registro


async def reagendar(
    db: AsyncSession,
    *,
    tenant_id: uuid.UUID,
    usuario: Usuario,
    agendamento_id: uuid.UUID,
    dados: AgendamentoReagendar,
    ator: Usuario,
    cliente: dict,
) -> tuple[Agendamento, str, list[dict]]:
    antigo = await obter_com_escopo(
        db, tenant_id, usuario, agendamento_id, Permissao.AGENDA_GERENCIAR
    )
    if antigo.situacao in STATUS_NAO_REAGENDAVEIS:
        raise Conflict(
            "Este agendamento não pode ser reagendado.",
            code="reagendamento_invalido",
        )
    if antigo.recepcionado_em is not None:
        raise Conflict(
            "O cidadão já foi recepcionado; finalize ou evite a fila antes de reagendar.",
            code="reagendamento_apos_recepcao",
        )
    novo_dados = AgendamentoCreate(
        agenda_id=antigo.agenda_id,
        cidadao_id=antigo.cidadao_id,
        inicio_em=dados.inicio_em,
        prioridade_id=antigo.prioridade_id,
        protocolo_risco_id=antigo.protocolo_risco_id,
        nivel_risco_id=antigo.nivel_risco_id,
        procedimento_sigtap=antigo.procedimento_sigtap,
        origem=antigo.origem,
        encaixe=dados.encaixe,
        justificativa_excecao=dados.justificativa_excecao,
        observacoes=antigo.observacoes,
    )
    agenda, cidadao, _inicio, _fim, codigo, alertas = await _montar(
        db,
        tenant_id=tenant_id,
        usuario=usuario,
        dados=novo_dados,
        ignorar_id=antigo.id,
    )
    novo = await db.scalar(
        select(Agendamento).where(
            Agendamento.tenant_id == tenant_id,
            Agendamento.codigo_hash == hmac_hex(codigo),
        )
    )
    antes = instantaneo(antigo)
    antigo.situacao = SituacaoAgendamento.REAGENDADO.value
    antigo.versao += 1
    novo.reagendado_de_id = antigo.id
    await registrar(
        db,
        acao=AcaoAuditoria.ATUALIZAR,
        usuario=ator,
        tenant_id=tenant_id,
        estabelecimento_id=antigo.estabelecimento_id,
        recurso="agendamento",
        recurso_id=antigo.id,
        justificativa=dados.motivo,
        dados_antes=antes,
        dados_depois=instantaneo(antigo),
        cliente=cliente,
    )
    await registrar(
        db,
        acao=AcaoAuditoria.CRIAR,
        usuario=ator,
        tenant_id=tenant_id,
        estabelecimento_id=agenda.estabelecimento_id,
        recurso="agendamento",
        recurso_id=novo.id,
        dados_depois=instantaneo(novo),
        cliente=cliente,
    )
    await db.commit()
    return novo, codigo, alertas


async def marcar_falta(
    db: AsyncSession,
    *,
    tenant_id: uuid.UUID,
    usuario: Usuario,
    agendamento_id: uuid.UUID,
    dados: AgendamentoFalta,
    ator: Usuario,
    cliente: dict,
) -> Agendamento:
    registro = await obter_com_escopo(
        db, tenant_id, usuario, agendamento_id, Permissao.AGENDA_GERENCIAR
    )
    if registro.situacao not in {
        SituacaoAgendamento.AGENDADO.value,
        SituacaoAgendamento.CONFIRMADO.value,
        SituacaoAgendamento.VENCIDO.value,
    }:
        raise Conflict(
            "Somente agendamento pendente ou vencido pode receber falta.",
            code="falta_invalida",
        )
    antes = instantaneo(registro)
    registro.situacao = SituacaoAgendamento.FALTOU.value
    registro.falta_em = agora()
    registro.falta_automatica = False
    registro.versao += 1
    registro.observacoes = _concatenar(registro.observacoes, dados.motivo)
    await registrar(
        db,
        acao=AcaoAuditoria.ATUALIZAR,
        usuario=ator,
        tenant_id=tenant_id,
        estabelecimento_id=registro.estabelecimento_id,
        recurso="agendamento",
        recurso_id=registro.id,
        justificativa=dados.motivo,
        dados_antes=antes,
        dados_depois=instantaneo(registro),
        cliente=cliente,
    )
    await db.commit()
    return registro


async def reverter_falta(
    db: AsyncSession,
    *,
    tenant_id: uuid.UUID,
    usuario: Usuario,
    agendamento_id: uuid.UUID,
    dados: AgendamentoReverterFalta,
    ator: Usuario,
    cliente: dict,
) -> Agendamento:
    registro = await obter_com_escopo(
        db, tenant_id, usuario, agendamento_id, Permissao.AGENDA_GERENCIAR
    )
    if registro.situacao not in {
        SituacaoAgendamento.FALTOU.value,
        SituacaoAgendamento.VENCIDO.value,
    }:
        raise Conflict(
            "Somente falta ou vencimento pode ser revertido.",
            code="reversao_invalida",
        )
    antes = instantaneo(registro)
    registro.situacao = (
        SituacaoAgendamento.CONFIRMADO.value
        if registro.confirmado_em
        else SituacaoAgendamento.AGENDADO.value
    )
    registro.falta_revertida_em = agora()
    registro.falta_revertida_por_id = ator.id
    registro.justificativa_reversao = dados.justificativa
    registro.falta_em = None
    registro.falta_automatica = False
    registro.versao += 1
    await registrar(
        db,
        acao=AcaoAuditoria.ATUALIZAR,
        usuario=ator,
        tenant_id=tenant_id,
        estabelecimento_id=registro.estabelecimento_id,
        recurso="agendamento",
        recurso_id=registro.id,
        justificativa=dados.justificativa,
        dados_antes=antes,
        dados_depois=instantaneo(registro),
        cliente=cliente,
    )
    await db.commit()
    return registro


def _concatenar(original: str | None, novo: str) -> str:
    base = (original or "").strip()
    return f"{base}\n{novo}".strip() if base else novo


async def gerar_comprovante(
    db: AsyncSession,
    *,
    tenant_id: uuid.UUID,
    usuario: Usuario,
    agendamento_id: uuid.UUID,
    ator: Usuario,
    cliente: dict,
) -> tuple[Agendamento, str]:
    registro = await obter_com_escopo(db, tenant_id, usuario, agendamento_id)
    if registro.situacao in STATUS_NAO_REAGENDAVEIS:
        raise Conflict(
            "Agendamento encerrado não possui comprovante válido.",
            code="comprovante_invalido",
        )
    codigo = gerar_codigo("AGD", registro.id)
    registro.codigo_hash = hmac_hex(codigo)
    await registrar(
        db,
        acao=AcaoAuditoria.IMPRIMIR,
        usuario=ator,
        tenant_id=tenant_id,
        estabelecimento_id=registro.estabelecimento_id,
        recurso="agendamento",
        recurso_id=registro.id,
        finalidade="emissão de comprovante com QR/código de barras",
        cliente=cliente,
    )
    await db.commit()
    return registro, codigo


async def marcar_faltas_automaticas(
    db: AsyncSession, *, agora_ref: datetime | None = None
) -> dict:
    referencia = aware(agora_ref or datetime.now(timezone.utc))
    registros = list(
        (
            await db.execute(
                select(Agendamento, Agenda)
                .join(Agenda, Agenda.id == Agendamento.agenda_id)
                .where(
                    Agendamento.situacao.in_(
                        [SituacaoAgendamento.AGENDADO.value, SituacaoAgendamento.CONFIRMADO.value]
                    )
                )
            )
        ).all()
    )
    faltas = 0
    vencidos = 0
    for agendamento, agenda in registros:
        fim = aware(agendamento.fim_em)
        limite = fim + timedelta(minutes=agenda.tolerancia_atraso_minutos)
        if referencia < limite:
            continue
        antes = instantaneo(agendamento)
        if agenda.falta_automatica:
            agendamento.situacao = SituacaoAgendamento.FALTOU.value
            agendamento.falta_automatica = True
            agendamento.falta_em = referencia
            faltas += 1
        else:
            agendamento.situacao = SituacaoAgendamento.VENCIDO.value
            vencidos += 1
        agendamento.versao += 1
        await registrar(
            db,
            acao=AcaoAuditoria.ATUALIZAR,
            usuario=None,
            tenant_id=agendamento.tenant_id,
            estabelecimento_id=agendamento.estabelecimento_id,
            recurso="agendamento",
            recurso_id=agendamento.id,
            justificativa=(
                "Falta automática configurada na agenda."
                if agenda.falta_automatica
                else "Agendamento vencido; falta automática desativada na agenda."
            ),
            dados_antes=antes,
            dados_depois=instantaneo(agendamento),
            cliente={"origem": "scheduler"},
        )
    if registros:
        await db.commit()
    return {"faltas": faltas, "vencidos": vencidos, "avaliados": len(registros)}


__all__ = [
    "alertas_agendamento",
    "atualizar",
    "cancelar",
    "confirmar",
    "criar",
    "gerar_comprovante",
    "listar",
    "marcar_falta",
    "marcar_faltas_automaticas",
    "obter_com_escopo",
    "reagendar",
    "reverter_falta",
]
