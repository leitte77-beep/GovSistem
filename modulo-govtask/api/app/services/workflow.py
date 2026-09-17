"""Motor de workflow (§17, §25, §26, §68, §80).

O que este módulo faz, em ordem:

1. **Instancia** um fluxo numa demanda: copia as etapas da versão publicada
   para a tabela `etapas`, filtrando as que não se aplicam pela condição.
2. **Abre** a primeira etapa (e as paralelas de mesma ordem), criando as
   tarefas automáticas, calculando prazos e movendo a situação da demanda.
3. **Avalia o avanço** a cada tarefa concluída: se a regra da etapa foi
   satisfeita, conclui a etapa e abre a seguinte.
4. **Calcula o progresso** pelos pesos das etapas — não pela contagem de
   tarefas, que daria um número enganoso.

O código não conhece nenhuma etapa por nome: tudo vem do desenho do fluxo.
"""

import uuid
from datetime import datetime, timedelta, timezone
from typing import Iterable

from fastapi import HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.models.demanda import Demanda
from app.models.enums import (
    ModoEtapa,
    RegraConclusaoEtapa,
    StatusEtapa,
    StatusTarefa,
    StatusWorkflowVersao,
    TipoEvento,
)
from app.models.etapa import Etapa
from app.models.tarefa import Tarefa
from app.models.user import User
from app.models.workflow import Workflow, WorkflowEtapa, WorkflowVersao
from app.services.calendario import Calendario, carregar_calendario
from app.services.tarefas import criar_tarefa
from app.services.timeline import registrar_evento

DIAS_UTEIS = {0, 1, 2, 3, 4}


def _agora() -> datetime:
    return datetime.now(timezone.utc)


def prazo_a_partir_de(
    inicio: datetime,
    dias: int | None,
    contagem: str,
    calendario: "Calendario | None" = None,
) -> datetime | None:
    """Calcula um prazo somando dias corridos ou úteis (§36).

    Sem calendário informado, dia útil é apenas segunda a sexta; com ele, os
    feriados do município entram na conta.
    """
    if not dias:
        return None
    if contagem == "DIAS_CORRIDOS":
        return inicio + timedelta(days=dias)
    if contagem == "HORAS":
        return inicio + timedelta(hours=dias)
    if calendario is not None:
        # O calendário trabalha em datas; a hora do início é preservada para o
        # prazo não escorregar para a meia-noite.
        vencimento = calendario.somar_dias_uteis(inicio.date(), dias)
        return datetime.combine(vencimento, inicio.timetz())
    data = inicio
    restantes = dias
    while restantes > 0:
        data += timedelta(days=1)
        if data.weekday() in DIAS_UTEIS:
            restantes -= 1
    return data


# ── Condições ───────────────────────────────────────────────────────────────

OPERADORES = {
    "igual": lambda atual, esperado: str(atual) == str(esperado),
    "diferente": lambda atual, esperado: str(atual) != str(esperado),
    "preenchido": lambda atual, _: atual not in (None, "", 0),
    "vazio": lambda atual, _: atual in (None, "", 0),
    "maior_que": lambda atual, esperado: atual is not None
    and float(atual) > float(esperado),
    "menor_que": lambda atual, esperado: atual is not None
    and float(atual) < float(esperado),
    "em": lambda atual, esperado: str(atual) in [str(v) for v in (esperado or [])],
}

# Só estes campos podem ser consultados numa condição: liberar a demanda
# inteira deixaria o administrador ler qualquer coluna por configuração.
CAMPOS_CONDICAO = {
    "prioridade", "confidencialidade", "origem", "esfera", "fonte_recurso",
    "valor_previsto", "valor_aprovado", "valor_contratado", "orgao_concedente",
    "programa", "tipo_id", "categoria_id", "autoridade_id",
}


def condicao_satisfeita(condicao: dict | None, demanda: Demanda) -> bool:
    """Avalia a condição de uma etapa. Sem condição, a etapa sempre se aplica.

    Formato: `{"campo": "valor_aprovado", "operador": "maior_que", "valor": 0}`,
    ou `{"todas": [...]}` / `{"alguma": [...]}` para compor.
    """
    if not condicao:
        return True
    if "todas" in condicao:
        return all(condicao_satisfeita(c, demanda) for c in condicao["todas"])
    if "alguma" in condicao:
        return any(condicao_satisfeita(c, demanda) for c in condicao["alguma"])

    campo = condicao.get("campo")
    if campo not in CAMPOS_CONDICAO:
        # Condição malformada não deve travar o fluxo nem abrir etapa à toa:
        # registra-se pela ausência da etapa e segue.
        return False
    operador = OPERADORES.get(condicao.get("operador", "igual"))
    if operador is None:
        return False
    return bool(operador(getattr(demanda, campo, None), condicao.get("valor")))


# ── Instanciação ────────────────────────────────────────────────────────────

async def versao_publicada(db: AsyncSession, workflow_id: uuid.UUID) -> WorkflowVersao:
    versao = (
        await db.execute(
            select(WorkflowVersao)
            .where(
                WorkflowVersao.workflow_id == workflow_id,
                WorkflowVersao.status == StatusWorkflowVersao.PUBLICADA,
            )
            .options(selectinload(WorkflowVersao.etapas).selectinload(WorkflowEtapa.tarefas_modelo))
            .order_by(WorkflowVersao.versao.desc())
        )
    ).scalars().first()
    if versao is None:
        raise HTTPException(
            status_code=409, detail="Este fluxo ainda não tem versão publicada"
        )
    return versao


async def aplicar_workflow(
    db: AsyncSession, demanda: Demanda, workflow: Workflow, user: User
) -> list[Etapa]:
    """Instancia o fluxo na demanda e abre a primeira etapa.

    Recusa se a demanda já tem etapas: trocar o fluxo no meio do caminho
    apagaria trabalho registrado. Para isso existe o fluxo livre.
    """
    existentes = (
        await db.execute(
            select(Etapa).where(Etapa.demanda_id == demanda.id, Etapa.deleted_at.is_(None))
        )
    ).scalars().all()
    if existentes:
        raise HTTPException(
            status_code=409,
            detail="A demanda já tem etapas; não é possível trocar o fluxo em andamento",
        )

    versao = await versao_publicada(db, workflow.id)
    aplicaveis = [
        e for e in versao.etapas if condicao_satisfeita(e.condicao, demanda)
    ]
    if not aplicaveis:
        raise HTTPException(
            status_code=409,
            detail="Nenhuma etapa deste fluxo se aplica às características da demanda",
        )

    instancias: list[Etapa] = []
    for receita in aplicaveis:
        etapa = Etapa(
            demanda_id=demanda.id,
            convenio_id=None,
            workflow_versao_id=versao.id,
            workflow_etapa_id=receita.id,
            nome=receita.nome,
            descricao=receita.descricao,
            ordem=receita.ordem,
            peso=receita.peso,
            modo=receita.modo,
            natureza=receita.natureza,
            regra_conclusao=receita.regra_conclusao,
            documentos_obrigatorios=receita.documentos_obrigatorios,
            setor_responsavel_id=receita.setor_responsavel_id,
            status=StatusEtapa.PENDENTE,
        )
        db.add(etapa)
        instancias.append(etapa)

    demanda.template_fluxo_id = None
    demanda.fluxo_livre = False
    await db.flush()

    await registrar_evento(
        db,
        tipo_evento=TipoEvento.ETAPA_ABERTA,
        ator_id=user.id,
        descricao=f"Fluxo '{workflow.nome}' aplicado (v{versao.versao})",
        demanda_id=demanda.id,
        metadados={"workflow": workflow.chave, "versao": versao.versao,
                   "etapas": [e.nome for e in instancias]},
    )

    await abrir_proximas_etapas(db, demanda, user)
    return instancias


# ── Abertura e avanço ───────────────────────────────────────────────────────

async def _etapas_da_demanda(db: AsyncSession, demanda: Demanda) -> list[Etapa]:
    return list(
        (
            await db.execute(
                select(Etapa)
                .where(Etapa.demanda_id == demanda.id, Etapa.deleted_at.is_(None))
                .options(selectinload(Etapa.tarefas))
                .order_by(Etapa.ordem)
                .execution_options(populate_existing=True)
            )
        ).scalars().unique().all()
    )


async def _abrir_etapa(
    db: AsyncSession, demanda: Demanda, etapa: Etapa, user: User
) -> None:
    """Abre a etapa: prazo, responsável, situação da demanda e tarefas automáticas."""
    agora = _agora()
    calendario = await carregar_calendario(db, demanda.organization_id)
    etapa.status = StatusEtapa.EM_ANDAMENTO
    etapa.data_inicio = agora

    receita: WorkflowEtapa | None = None
    if etapa.workflow_etapa_id:
        receita = (
            await db.execute(
                select(WorkflowEtapa)
                .where(WorkflowEtapa.id == etapa.workflow_etapa_id)
                .options(selectinload(WorkflowEtapa.tarefas_modelo))
            )
        ).scalar_one_or_none()

    if receita is not None:
        etapa.prazo = prazo_a_partir_de(
            agora, receita.prazo_dias, receita.tipo_contagem, calendario
        )
        if receita.setor_responsavel_id:
            demanda.setor_atual_id = receita.setor_responsavel_id
        if receita.responsavel_id:
            demanda.responsavel_atual_id = receita.responsavel_id
        if receita.status_demanda_id:
            demanda.status_id = receita.status_demanda_id

        for modelo in receita.tarefas_modelo:
            # O modelo do sistema não amarra setor: quando nada foi configurado,
            # a tarefa cai no setor atual da demanda e, na falta dele, no
            # responsável geral — nunca fica sem dono.
            setor = (
                modelo.setor_destino_id
                or receita.setor_responsavel_id
                or demanda.setor_atual_id
            )
            responsavel = receita.responsavel_id
            if setor is None and responsavel is None:
                responsavel = demanda.responsavel_geral_id
            await criar_tarefa(
                db,
                demanda,
                {
                    "titulo": modelo.titulo,
                    "descricao": modelo.descricao,
                    "setor_destino_id": setor,
                    "atribuida_a_id": responsavel,
                    "etapa_id": etapa.id,
                    "prazo": prazo_a_partir_de(
                        agora, modelo.prazo_dias or receita.prazo_dias,
                        receita.tipo_contagem, calendario,
                    ),
                    "exige_documento": modelo.exige_documento,
                    "exige_comentario": modelo.exige_comentario,
                    "exige_aprovacao": modelo.exige_aprovacao,
                },
                user,
                tipo=modelo.tipo,
                exige_aceite=modelo.exige_aceite,
            )

    await registrar_evento(
        db,
        tipo_evento=TipoEvento.ETAPA_ABERTA,
        ator_id=user.id,
        descricao=f"Etapa aberta: {etapa.nome}",
        demanda_id=demanda.id,
        metadados={"etapa": etapa.nome, "prazo": str(etapa.prazo)},
    )


async def abrir_proximas_etapas(
    db: AsyncSession, demanda: Demanda, user: User
) -> list[Etapa]:
    """Abre a próxima ordem pendente — todas as etapas dessa ordem de uma vez.

    Etapas de mesma ordem são paralelas por construção: é assim que Engenharia,
    Contabilidade e Jurídico trabalham ao mesmo tempo (§25).
    """
    etapas = await _etapas_da_demanda(db, demanda)
    if any(e.status == StatusEtapa.EM_ANDAMENTO for e in etapas):
        return []

    pendentes = [e for e in etapas if e.status == StatusEtapa.PENDENTE]
    if not pendentes:
        return []

    proxima_ordem = min(e.ordem for e in pendentes)
    abertas = [e for e in pendentes if e.ordem == proxima_ordem]
    for etapa in abertas:
        await _abrir_etapa(db, demanda, etapa, user)

    await atualizar_progresso(db, demanda)
    return abertas


def _regra_satisfeita(etapa: Etapa, tarefas: Iterable[Tarefa]) -> bool:
    vivas = [
        t for t in tarefas
        if t.deleted_at is None and t.status != StatusTarefa.CANCELADA
    ]
    concluidas = [t for t in vivas if t.status == StatusTarefa.CONCLUIDA]
    regra = RegraConclusaoEtapa(etapa.regra_conclusao)

    if regra == RegraConclusaoEtapa.MANUAL:
        return False
    if regra == RegraConclusaoEtapa.QUALQUER_TAREFA:
        return bool(concluidas)
    # TODAS_TAREFAS: etapa sem tarefa nenhuma só fecha na mão, para ninguém
    # avançar um fluxo sem que trabalho algum tenha sido registrado.
    return bool(vivas) and len(concluidas) == len(vivas)


async def avaliar_avanco(
    db: AsyncSession, demanda: Demanda, user: User
) -> list[Etapa]:
    """Conclui as etapas cuja regra foi satisfeita e abre as seguintes."""
    etapas = await _etapas_da_demanda(db, demanda)
    concluidas_agora: list[Etapa] = []

    for etapa in etapas:
        if etapa.status != StatusEtapa.EM_ANDAMENTO:
            continue
        if not _regra_satisfeita(etapa, etapa.tarefas):
            continue
        etapa.status = StatusEtapa.CONCLUIDA
        etapa.data_conclusao = _agora()
        concluidas_agora.append(etapa)
        await registrar_evento(
            db,
            tipo_evento=TipoEvento.ETAPA_CONCLUIDA,
            ator_id=user.id,
            descricao=f"Etapa concluída: {etapa.nome}",
            demanda_id=demanda.id,
            metadados={"etapa": etapa.nome},
        )

    if concluidas_agora:
        await db.flush()
        await abrir_proximas_etapas(db, demanda, user)
    await atualizar_progresso(db, demanda)
    return concluidas_agora


async def concluir_etapa_manualmente(
    db: AsyncSession, demanda: Demanda, etapa: Etapa, user: User, justificativa: str | None
) -> None:
    """Fecha a etapa à mão, checando os documentos que ela exige (§32)."""
    if etapa.status == StatusEtapa.CONCLUIDA:
        raise HTTPException(status_code=409, detail="Etapa já está concluída")

    faltando = await documentos_faltantes(db, demanda, etapa)
    if faltando:
        raise HTTPException(
            status_code=409,
            detail={"detail": "Documentos obrigatórios não anexados", "faltando": faltando},
        )

    etapa.status = StatusEtapa.CONCLUIDA
    etapa.data_conclusao = _agora()
    await registrar_evento(
        db,
        tipo_evento=TipoEvento.ETAPA_CONCLUIDA,
        ator_id=user.id,
        descricao=f"Etapa concluída manualmente: {etapa.nome}",
        demanda_id=demanda.id,
        metadados={"justificativa": justificativa},
    )
    await db.flush()
    await abrir_proximas_etapas(db, demanda, user)
    await atualizar_progresso(db, demanda)


async def documentos_faltantes(
    db: AsyncSession, demanda: Demanda, etapa: Etapa
) -> list[str]:
    """Quais documentos exigidos pela etapa ainda não foram anexados."""
    exigidos = etapa.documentos_obrigatorios or []
    if not exigidos:
        return []

    from app.models.anexo import Anexo

    anexados = (
        await db.execute(
            select(
                Anexo.pasta, Anexo.tipo_documento, Anexo.nome_arquivo, Anexo.descricao
            ).where(Anexo.demanda_id == demanda.id, Anexo.deleted_at.is_(None))
        )
    ).all()

    # O rótulo exigido casa com qualquer campo pelo qual o usuário identificaria
    # o documento: a pasta em que gravou, o tipo, o nome do arquivo ou a
    # descrição. Exigir um campo específico só geraria etapa travada por
    # documento que já está lá.
    presentes = " | ".join(
        str(valor).upper() for linha in anexados for valor in linha if valor is not None
    )
    return [rotulo for rotulo in exigidos if str(rotulo).upper() not in presentes]


# ── Progresso (§68) ─────────────────────────────────────────────────────────

async def atualizar_progresso(db: AsyncSession, demanda: Demanda) -> int:
    """Progresso pelos pesos das etapas; etapa em andamento conta meia-etapa.

    Contar tarefas concluídas daria um número enganoso: dez tarefinhas de
    protocolo pesariam mais que a execução inteira de uma obra.
    """
    etapas = await _etapas_da_demanda(db, demanda)
    if not etapas:
        return demanda.progresso

    total = sum(e.peso for e in etapas)
    if total <= 0:
        # Sem pesos configurados, todas as etapas valem o mesmo.
        pesos = {e.id: 1 for e in etapas}
        total = len(etapas)
    else:
        pesos = {e.id: e.peso for e in etapas}

    alcancado = 0.0
    for etapa in etapas:
        if etapa.status == StatusEtapa.CONCLUIDA:
            alcancado += pesos[etapa.id]
        elif etapa.status == StatusEtapa.EM_ANDAMENTO:
            alcancado += pesos[etapa.id] * _fracao_concluida(etapa)

    demanda.progresso = max(0, min(100, round(alcancado * 100 / total)))
    return demanda.progresso


def _fracao_concluida(etapa: Etapa) -> float:
    """Quanto da etapa em andamento já foi feito, pelas tarefas dela."""
    vivas = [
        t for t in etapa.tarefas
        if t.deleted_at is None and t.status != StatusTarefa.CANCELADA
    ]
    if not vivas:
        return 0.5
    concluidas = len([t for t in vivas if t.status == StatusTarefa.CONCLUIDA])
    return concluidas / len(vivas)


# ── Fluxo livre ─────────────────────────────────────────────────────────────

async def etapa_avulsa(
    db: AsyncSession, demanda: Demanda, nome: str, user: User, **campos
) -> Etapa:
    """Cria uma etapa fora de qualquer modelo (§19), já aberta."""
    etapas = await _etapas_da_demanda(db, demanda)
    etapa = Etapa(
        demanda_id=demanda.id,
        convenio_id=None,
        nome=nome,
        ordem=(max((e.ordem for e in etapas), default=0) + 1),
        modo=ModoEtapa.SEQUENCIAL,
        regra_conclusao=RegraConclusaoEtapa.MANUAL,
        status=StatusEtapa.EM_ANDAMENTO,
        data_inicio=_agora(),
        **campos,
    )
    db.add(etapa)
    await db.flush()
    await registrar_evento(
        db,
        tipo_evento=TipoEvento.ETAPA_ABERTA,
        ator_id=user.id,
        descricao=f"Etapa avulsa aberta: {nome}",
        demanda_id=demanda.id,
    )
    return etapa
