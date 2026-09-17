"""Despacha automações no mesmo contexto transacional do evento de domínio."""

import uuid
from enum import Enum

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.automacao import Automacao, AutomacaoExecucao
from app.models.demanda import Demanda
from app.models.enums import StatusEtapa, TipoNotificacao
from app.models.etapa import Etapa
from app.models.evento_timeline import EventoTimeline
from app.models.tarefa import Tarefa
from app.models.user import User
from app.services.notifications import criar_notificacao
from app.services.tarefas import criar_tarefa
from app.services.timeline import registrar_evento

_CAMPOS = {"demanda": {"prioridade", "origem", "confidencialidade", "progresso"},
           "tarefa": {"status", "prioridade", "setor_destino_id", "atribuida_a_id"}}


def _texto(valor) -> str:
    """Normaliza o valor para comparação com o que veio da configuração.

    Um campo lido antes do flush devolve o membro do enum, e `str()` sobre um
    `(str, Enum)` produz "PrioridadeDemanda.ALTA", não "ALTA" — a condição
    passaria a nunca casar dependendo do momento em que a automação roda.
    """
    if isinstance(valor, Enum):
        return str(valor.value)
    return str(valor)


def condicao_satisfeita(condicao: dict | None, demanda: Demanda, tarefa: Tarefa | None) -> bool:
    """Avalia apenas campos explicitamente permitidos, sem expressão arbitrária."""
    if not condicao:
        return True
    if "todas" in condicao:
        return all(condicao_satisfeita(item, demanda, tarefa) for item in condicao["todas"])
    if "alguma" in condicao:
        return any(condicao_satisfeita(item, demanda, tarefa) for item in condicao["alguma"])
    alvo = condicao.get("alvo", "demanda")
    campo, operador, esperado = condicao.get("campo"), condicao.get("operador", "igual"), condicao.get("valor")
    objeto = demanda if alvo == "demanda" else tarefa
    if objeto is None or alvo not in _CAMPOS or campo not in _CAMPOS[alvo]:
        return False
    atual = getattr(objeto, campo, None)
    if operador == "igual":
        return _texto(atual) == _texto(esperado)
    if operador == "diferente":
        return _texto(atual) != _texto(esperado)
    if operador == "preenchido":
        return atual not in (None, "")
    if operador == "vazio":
        return atual in (None, "")
    if operador == "em":
        return _texto(atual) in {_texto(x) for x in (esperado or [])}
    return False


async def _destinatarios(acao: dict, demanda: Demanda, tarefa: Tarefa | None) -> set[uuid.UUID]:
    resultado = {uuid.UUID(str(valor)) for valor in acao.get("usuarios", [])}
    for alvo in acao.get("destinatarios", []):
        valor = {"RESPONSAVEL": tarefa.atribuida_a_id if tarefa else None,
                 "RESPONSAVEL_GERAL": demanda.responsavel_geral_id,
                 "RESPONSAVEL_ATUAL": demanda.responsavel_atual_id}.get(alvo)
        if valor:
            resultado.add(valor)
    return resultado


async def executar_evento(db: AsyncSession, evento: EventoTimeline) -> int:
    """Executa regras do tenant uma vez por evento; falha de uma regra é registrada."""
    if not evento.demanda_id:
        return 0
    demanda = await db.get(Demanda, evento.demanda_id)
    if demanda is None:
        return 0
    tarefa = await db.get(Tarefa, evento.tarefa_id) if evento.tarefa_id else None
    regras = (await db.execute(select(Automacao).where(
        Automacao.organization_id == demanda.organization_id, Automacao.ativo.is_(True),
        Automacao.gatilho == evento.tipo_evento, Automacao.deleted_at.is_(None)
    ))).scalars().all()
    executadas = 0
    for regra in regras:
        if not condicao_satisfeita(regra.condicao, demanda, tarefa):
            continue
        ja_executada = await db.scalar(select(AutomacaoExecucao.id).where(
            AutomacaoExecucao.automacao_id == regra.id,
            AutomacaoExecucao.evento_id == evento.id,
        ))
        if ja_executada:
            continue
        registro = AutomacaoExecucao(automacao_id=regra.id, evento_id=evento.id)
        db.add(registro)
        await db.flush()
        try:
            feitos = []
            for acao in regra.acoes:
                tipo = acao["tipo"]
                if tipo == "NOTIFICAR":
                    for usuario_id in await _destinatarios(acao, demanda, tarefa):
                        await criar_notificacao(db, usuario_id, TipoNotificacao.PRAZO_PROXIMO,
                            acao.get("mensagem") or f"Automação: {regra.nome}", demanda_id=demanda.id,
                            tarefa_id=tarefa.id if tarefa else None)
                        feitos.append("notificacao")
                elif tipo == "CRIAR_TAREFA":
                    autor = await db.get(User, evento.ator_id)
                    if autor and (acao.get("atribuida_a_id") or acao.get("setor_destino_id")):
                        nova = await criar_tarefa(db, demanda, {
                            "titulo": acao["titulo"], "descricao": acao.get("descricao"),
                            "atribuida_a_id": uuid.UUID(acao["atribuida_a_id"]) if acao.get("atribuida_a_id") else None,
                            "setor_destino_id": uuid.UUID(acao["setor_destino_id"]) if acao.get("setor_destino_id") else None,
                            "etapa_id": tarefa.etapa_id if tarefa else None,
                        }, autor, exige_aceite=acao.get("exige_aceite", True))
                        feitos.append(f"tarefa:{nova.id}")
                elif tipo == "ATUALIZAR_ETAPA" and tarefa and tarefa.etapa_id:
                    etapa = await db.get(Etapa, tarefa.etapa_id)
                    if etapa and acao.get("status") in {x.value for x in StatusEtapa}:
                        etapa.status = StatusEtapa(acao["status"])
                        feitos.append("etapa")
                elif tipo == "GERAR_RESUMO":
                    demanda.resumo_executivo = acao.get("texto") or f"Atualizado por automação: {regra.nome}."
                    feitos.append("resumo")
            registro.resultado = {"acoes": feitos}
            executadas += 1
            await registrar_evento(
                db,
                "AUTOMACAO_EXECUTADA",
                evento.ator_id,
                f"Automação executada: {regra.nome}",
                demanda_id=demanda.id,
                tarefa_id=tarefa.id if tarefa else None,
                metadados={"automacao_id": str(regra.id), "acoes": feitos},
            )
        except Exception as erro:  # uma regra defeituosa não derruba a operação principal
            registro.sucesso, registro.erro = False, str(erro)[:2000]
    return executadas
