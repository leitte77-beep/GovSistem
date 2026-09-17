"""Relatório completo da Demanda: JSON, resumo executivo e PDF (§90, §91)."""

import uuid
from datetime import datetime, timezone

from fastapi import APIRouter, Depends
from fastapi.responses import Response
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.core.auth import get_user_permissions, require_permission
from app.core.database import get_db
from app.core.permissions import Perm
from app.models.anexo import Anexo
from app.models.checklist import Checklist
from app.models.demanda import Demanda
from app.models.enums import TipoEvento
from app.models.evento_timeline import EventoTimeline
from app.models.organization import Organization
from app.models.protocolo_externo import ProtocoloExterno
from app.models.tarefa import Tarefa
from app.models.user import User
from app.services import relatorio_demanda as rel
from app.services.demandas import get_demanda_ou_404
from app.services.timeline import registrar_evento

router = APIRouter(tags=["Relatório da demanda"])


async def _montar(db: AsyncSession, demanda: Demanda, user: User) -> dict:
    """Reúne tudo o que entra no relatório, já dentro do escopo autorizado.

    O financeiro só entra quando quem pede tem `financial.view`: o PDF é um
    arquivo que circula, e um relatório que sempre carrega valores contornaria a
    permissão no momento em que fosse encaminhado.
    """
    permissoes = get_user_permissions(user)
    ve_financeiro = (
        Perm.FINANCIAL_VIEW in permissoes or Perm.FINANCIAL_MANAGE in permissoes
    )

    # O relatório atravessa relações que o detalhe da demanda não carrega
    # (solicitante, setor de cada participante). Sem carregá-las aqui, a
    # montagem tentaria lazy load fora do contexto async e estouraria
    # MissingGreenlet — não em teste, mas na primeira emissão em produção.
    await db.refresh(
        demanda,
        attribute_names=["solicitante", "participantes", "tags", "autoridade", "tipo"],
    )
    for participante in demanda.participantes:
        await db.refresh(participante, attribute_names=["user", "setor"])

    tarefas = (
        (
            await db.execute(
                select(Tarefa)
                .where(Tarefa.demanda_id == demanda.id, Tarefa.deleted_at.is_(None))
                .options(selectinload(Tarefa.atribuida_a))
                .order_by(Tarefa.created_at)
            )
        )
        .scalars()
        .all()
    )
    documentos = (
        (
            await db.execute(
                select(Anexo)
                .where(
                    Anexo.demanda_id == demanda.id,
                    Anexo.deleted_at.is_(None),
                    Anexo.versao_atual.is_(True),
                )
                .order_by(Anexo.pasta, Anexo.created_at)
            )
        )
        .scalars()
        .all()
    )
    protocolos = (
        (
            await db.execute(
                select(ProtocoloExterno)
                .where(
                    ProtocoloExterno.demanda_id == demanda.id,
                    ProtocoloExterno.deleted_at.is_(None),
                )
                .order_by(ProtocoloExterno.data_protocolo)
            )
        )
        .scalars()
        .all()
    )
    checklists = (
        (
            await db.execute(
                select(Checklist)
                .where(Checklist.demanda_id == demanda.id, Checklist.deleted_at.is_(None))
                .options(selectinload(Checklist.itens))
                .order_by(Checklist.created_at)
            )
        )
        .scalars()
        .all()
    )
    eventos = (
        (
            await db.execute(
                select(EventoTimeline)
                .where(EventoTimeline.demanda_id == demanda.id)
                .options(selectinload(EventoTimeline.ator))
                .order_by(EventoTimeline.ocorrido_em)
            )
        )
        .scalars()
        .all()
    )

    abertas = sum(
        1 for t in tarefas if str(t.status) not in ("CONCLUIDA", "CANCELADA")
    )
    financeiro = {}
    if ve_financeiro:
        financeiro = {
            "valor_previsto": rel._dinheiro(demanda.valor_previsto),
            "valor_aprovado": rel._dinheiro(demanda.valor_aprovado),
            "valor_contrapartida": rel._dinheiro(demanda.valor_contrapartida),
            "valor_licitado": rel._dinheiro(demanda.valor_licitado),
            "valor_contratado": rel._dinheiro(demanda.valor_contratado),
            "valor_empenhado": rel._dinheiro(demanda.valor_empenhado),
            "valor_liquidado": rel._dinheiro(demanda.valor_liquidado),
            "valor_pago": rel._dinheiro(demanda.valor_pago),
            "valor_executado": rel._dinheiro(demanda.valor_executado),
            "saldo": rel._dinheiro(demanda.saldo_financeiro),
            "fonte_recurso": demanda.fonte_recurso,
            "orgao_concedente": demanda.orgao_concedente,
        }

    dados = {
        "demanda": {
            "id": str(demanda.id),
            "numero": demanda.numero,
            "titulo": demanda.titulo,
            "descricao": demanda.descricao,
            "objeto": demanda.objeto,
            "assunto": demanda.assunto,
            "tipo": demanda.tipo.rotulo if demanda.tipo else None,
            "categoria": demanda.categoria.rotulo if demanda.categoria else None,
            "status": demanda.status.rotulo if demanda.status else None,
            "prioridade": demanda.prioridade,
            "confidencialidade": demanda.confidencialidade,
            "progresso": demanda.progresso,
            "origem": demanda.origem,
            "origem_descricao": demanda.origem_descricao,
            "autoridade": demanda.autoridade.nome if demanda.autoridade else None,
            "solicitante": (
                demanda.solicitante.name
                if demanda.solicitante
                else demanda.solicitante_externo
            ),
            "responsavel_geral": (
                demanda.responsavel_geral.name if demanda.responsavel_geral else None
            ),
            "setor_atual": demanda.setor_atual.nome if demanda.setor_atual else None,
            "tags": demanda.tags_rotulos,
            "data_solicitacao": rel._data(demanda.data_solicitacao),
            "criada_em": rel._data(demanda.created_at),
            "prazo_final": rel._data(demanda.prazo_final),
            "ultima_movimentacao": rel._data(demanda.ultima_movimentacao_em),
            "concluida_em": rel._data(demanda.concluida_em) if demanda.concluida_em else None,
            "resultado_final": demanda.resultado_final,
            "bloqueada": demanda.bloqueada,
            "bloqueio_motivo": demanda.bloqueio_motivo,
            "aguardando_terceiro": demanda.aguardando_terceiro,
            "proxima_acao": demanda.proxima_acao,
            "observacoes": demanda.observacoes,
            "valor_aprovado": financeiro.get("valor_aprovado") if ve_financeiro else None,
        },
        "participantes": [
            {
                "papel": p.papel,
                "nome": p.user.name if p.user else None,
                "setor": p.setor.nome if p.setor else None,
            }
            for p in demanda.participantes
            if p.ativo
        ],
        "financeiro": financeiro,
        "tarefas": [
            {
                "titulo": t.titulo,
                "responsavel": t.atribuida_a.name if t.atribuida_a else None,
                "status": t.status,
                "prazo": rel._data(t.prazo),
            }
            for t in tarefas
        ],
        "tarefas_abertas": abertas,
        "checklists": [
            {
                "titulo": c.titulo,
                "total": c.total,
                "concluidos": c.concluidos,
                "itens": [
                    {
                        "descricao": i.descricao,
                        "concluido_em": rel._data(i.concluido_em) if i.concluido_em else None,
                        "concluido_por": (
                            i.concluido_por.name if i.concluido_por else None
                        ),
                    }
                    for i in c.itens
                    if i.deleted_at is None
                ],
            }
            for c in checklists
        ],
        "documentos": [
            {
                "nome": doc.nome_arquivo,
                "versao": doc.versao,
                "pasta": doc.pasta,
                "enviado_em": rel._data(doc.created_at),
                "hash": doc.hash_sha256,
            }
            for doc in documentos
        ],
        "protocolos": [
            {
                "sistema": p.sistema,
                "numero": p.numero,
                "orgao": p.orgao,
                "data": rel._data(p.data_protocolo),
                "situacao": p.situacao,
            }
            for p in protocolos
        ],
        "timeline": [
            {
                "quando": rel._data(e.ocorrido_em),
                "ator": e.ator.name if e.ator else None,
                "descricao": e.descricao,
            }
            for e in eventos
        ],
    }
    dados["resumo_executivo"] = demanda.resumo_executivo or rel.montar_resumo_executivo(
        dados
    )
    return dados


@router.get("/demandas/{demanda_id}/relatorio")
async def relatorio_json(
    demanda_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(require_permission(Perm.RESOURCE_VIEW)),
):
    """Mesmo conteúdo do PDF, para a tela de impressão do frontend (§141)."""
    demanda = await get_demanda_ou_404(db, demanda_id, user, get_user_permissions(user))
    return await _montar(db, demanda, user)


@router.get("/demandas/{demanda_id}/relatorio.pdf")
async def relatorio_pdf(
    demanda_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(require_permission(Perm.EXPORT)),
):
    demanda = await get_demanda_ou_404(db, demanda_id, user, get_user_permissions(user))
    dados = await _montar(db, demanda, user)
    organizacao = (
        await db.execute(
            select(Organization.name).where(Organization.id == user.organization_id)
        )
    ).scalar_one_or_none() or "Município"
    pdf = rel.gerar_pdf(dados, organizacao, user.name)
    # Emitir relatório é acesso a conteúdo consolidado, inclusive sigiloso:
    # entra na timeline para que se saiba quem levou o documento embora.
    await registrar_evento(
        db,
        TipoEvento.AUDITORIA_REGISTRADA,
        user.id,
        f"Relatório completo da demanda emitido em PDF por {user.name}",
        demanda_id=demanda.id,
        metadados={"emitido_em": datetime.now(timezone.utc).isoformat()},
    )
    await db.commit()
    nome = f"demanda-{demanda.numero.replace('/', '-')}.pdf"
    return Response(
        content=pdf,
        media_type="application/pdf",
        headers={"Content-Disposition": f'attachment; filename="{nome}"'},
    )


@router.post("/demandas/{demanda_id}/resumo-executivo")
async def gerar_resumo(
    demanda_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(require_permission(Perm.RESOURCE_EDIT)),
):
    """Monta o resumo executivo a partir dos fatos e o grava na demanda (§91).

    Determinístico: nenhuma frase é inventada. Quando a camada de IA existir,
    ela entra aqui como *sugestão*, sempre com confirmação humana antes de
    substituir o texto oficial (§92).
    """
    demanda = await get_demanda_ou_404(db, demanda_id, user, get_user_permissions(user))
    dados = await _montar(db, demanda, user)
    texto = rel.montar_resumo_executivo(dados)
    demanda.resumo_executivo = texto
    await registrar_evento(
        db,
        TipoEvento.DEMANDA_ATUALIZADA,
        user.id,
        "Resumo executivo regerado a partir do andamento da demanda",
        demanda_id=demanda.id,
    )
    await db.commit()
    return {"resumo_executivo": texto}
