import csv
import io
import uuid
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import StreamingResponse
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.core.auth import get_current_user, require_permission
from app.core.database import get_db
from app.core.permissions import Perm
from app.models.convenio import Convenio
from app.models.movimento_financeiro import MovimentoFinanceiro
from app.models.obra import Obra
from app.models.prestacao_contas import PrestacaoContas
from app.models.repasse import Repasse
from app.models.tarefa import Tarefa
from app.models.user import User

router = APIRouter(prefix="/relatorios", tags=["relatorios"])


@router.get("/resumo")
async def relatorio_resumo(
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """Resumo executivo de captação e execução do órgão."""
    org = user.organization_id
    convenios = (await db.execute(
        select(Convenio).where(
            Convenio.organization_id == org,
            Convenio.deleted_at.is_(None),
            Convenio.status != "CANCELADO",
        )
    )).scalars().all()

    total_aprovado = sum(c.valor_aprovado or c.valor or 0 for c in convenios)
    total_captado = sum(c.valor_repasse or 0 for c in convenios)
    total_executado = sum(c.valor_executado or 0 for c in convenios)
    em_andamento = sum(1 for c in convenios if c.status == "EM_ANDAMENTO")
    concluidos = sum(1 for c in convenios if c.status == "CONCLUIDO")
    em_diligencia = sum(1 for c in convenios if c.situacao == "EM_DILIGENCIA")
    rascunho = sum(1 for c in convenios if c.status == "RASCUNHO")

    # Agregações por categoria/esfera
    por_categoria = {}
    por_esfera = {}
    for c in convenios:
        cat = c.categoria or "OUTRO"
        esf = c.esfera or "OUTRA"
        por_categoria[cat] = por_categoria.get(cat, 0) + (c.valor_aprovado or c.valor or 0)
        por_esfera[esf] = por_esfera.get(esf, 0) + (c.valor_aprovado or c.valor or 0)

    return {
        "total_processos": len(convenios),
        "total_aprovado": float(total_aprovado),
        "total_captado": float(total_captado),
        "total_executado": float(total_executado),
        "em_andamento": em_andamento,
        "concluidos": concluidos,
        "em_diligencia": em_diligencia,
        "rascunho": rascunho,
        "por_categoria": {k: float(v) for k, v in por_categoria.items()},
        "por_esfera": {k: float(v) for k, v in por_esfera.items()},
    }


@router.get("/obras")
async def relatorio_obras(
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    org = user.organization_id
    result = await db.execute(
        select(Obra, Convenio.titulo, Convenio.id)
        .join(Convenio, Convenio.id == Obra.convenio_id)
        .where(Convenio.organization_id == org, Obra.deleted_at.is_(None))
    )
    rows = result.all()
    obras = [r[0] for r in rows]
    em_andamento = sum(1 for o in obras if o.percentual_fisico is not None and o.percentual_fisico < 100)
    concluidas = sum(1 for o in obras if o.percentual_fisico == 100)
    atrasadas = sum(1 for o in obras if o.previsao_conclusao and o.previsao_conclusao < datetime.now(timezone.utc) and (o.percentual_fisico or 0) < 100)
    return {
        "total_obras": len(obras),
        "em_andamento": em_andamento,
        "concluidas": concluidas,
        "atrasadas": atrasadas,
        "obras": [
            {
                "id": str(o.id), "convenio_id": str(convenio_id),
                "convenio_titulo": convenio_titulo, "nome": o.nome, "empresa": o.empresa,
                "percentual_fisico": float(o.percentual_fisico) if o.percentual_fisico is not None else None,
                "percentual_financeiro": float(o.percentual_financeiro) if o.percentual_financeiro is not None else None,
                "previsao_conclusao": o.previsao_conclusao.isoformat() if o.previsao_conclusao else None,
                "valor_contrato": float(o.valor_contrato) if o.valor_contrato else None,
                "situacao": o.situacao,
            }
            for o, convenio_titulo, convenio_id in rows
        ],
    }


@router.get("/prestacoes")
async def relatorio_prestacoes(
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    org = user.organization_id
    result = await db.execute(
        select(PrestacaoContas, Convenio.titulo, Convenio.id)
        .join(Convenio, Convenio.id == PrestacaoContas.convenio_id)
        .where(Convenio.organization_id == org, PrestacaoContas.deleted_at.is_(None))
    )
    rows = result.all()
    prestacoes = [r[0] for r in rows]
    pendentes = sum(1 for p in prestacoes if p.status in ("EM_PREPARACAO", "PRONTA", "ENVIADA", "EM_ANALISE", "EM_DILIGENCIA"))
    aprovadas = sum(1 for p in prestacoes if p.status in ("APROVADA", "APROVADA_COM_OBSERVACAO"))
    return {
        "total_prestacoes": len(prestacoes),
        "pendentes": pendentes,
        "aprovadas": aprovadas,
        "prestacoes": [
            {"id": str(p.id), "convenio_id": str(convenio_id), "convenio_titulo": convenio_titulo,
             "titulo": p.titulo, "status": p.status, "protocolo": p.protocolo}
            for p, convenio_titulo, convenio_id in rows
        ],
    }


@router.get("/dossie/{convenio_id}")
async def gerar_dossie(
    convenio_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(require_permission(Perm.EXPORT)),
):
    """Dossiê completo do processo para auditoria e consulta histórica."""
    result = await db.execute(
        select(Convenio)
        .where(
            Convenio.id == convenio_id,
            Convenio.organization_id == user.organization_id,
            Convenio.deleted_at.is_(None),
        )
        .options(
            selectinload(Convenio.etapas),
            selectinload(Convenio.tarefas),
            selectinload(Convenio.anexos),
            selectinload(Convenio.repasses),
            selectinload(Convenio.medicoes),
            selectinload(Convenio.movimentos_financeiros),
            selectinload(Convenio.contratos),
            selectinload(Convenio.licitacoes),
            selectinload(Convenio.prestacoes),
            selectinload(Convenio.diligencias),
            selectinload(Convenio.entregas),
            selectinload(Convenio.obras),
            selectinload(Convenio.eventos),
        )
    )
    convenio = result.scalar_one_or_none()
    if not convenio:
        raise HTTPException(status_code=404, detail="Processo não encontrado")

    total_recebido = sum(r.valor_recebido or 0 for r in convenio.repasses)
    total_pago = sum(m.valor or 0 for m in convenio.movimentos_financeiros if m.tipo == "PAGAMENTO")
    total_empenhado = sum(m.valor or 0 for m in convenio.movimentos_financeiros if m.tipo == "EMPENHO")

    return {
        "gerado_em": datetime.now(timezone.utc).isoformat(),
        "gerado_por": {"id": str(user.id), "name": user.name},
        "processo": {
            "id": str(convenio.id),
            "titulo": convenio.titulo,
            "descricao": convenio.descricao,
            "tipo": convenio.tipo,
            "categoria": convenio.categoria,
            "esfera": convenio.esfera,
            "situacao": convenio.situacao,
            "status": convenio.status,
            "parlamentar": convenio.parlamentar,
            "orgao_concedente": convenio.orgao_concedente,
            "programa": convenio.programa,
            "numero_convenio": convenio.numero_convenio,
            "numero_emenda": convenio.numero_emenda,
            "numero_proposta": convenio.numero_proposta,
            "numero_protocolo_governo": convenio.numero_protocolo_governo,
            "valor_aprovado": float(convenio.valor_aprovado) if convenio.valor_aprovado else None,
            "valor_recebido": float(total_recebido),
            "empenhado": float(total_empenhado),
            "pago": float(total_pago),
            "saldo": float(total_recebido - total_pago),
            "vigencia_inicio": convenio.vigencia_inicio.isoformat() if convenio.vigencia_inicio else None,
            "vigencia_fim": convenio.vigencia_fim.isoformat() if convenio.vigencia_fim else None,
            "created_at": convenio.created_at.isoformat(),
        },
        "etapas": [
            {"nome": e.nome, "ordem": e.ordem, "natureza": e.natureza, "status": e.status}
            for e in sorted(convenio.etapas, key=lambda x: x.ordem)
        ],
        "tarefas": [
            {"titulo": t.titulo, "status": t.status, "prazo": t.prazo.isoformat() if t.prazo else None, "prioridade": t.prioridade}
            for t in convenio.tarefas
        ],
        "documentos": [
            {"nome": a.nome_arquivo, "categoria": a.categoria, "classificacao": a.classificacao, "versao": a.versao,
             "enviado_externo": a.enviado_externo, "data": a.created_at.isoformat()}
            for a in convenio.anexos
        ],
        "repasses": [
            {"parcela": r.parcela, "valor_previsto": float(r.valor_previsto) if r.valor_previsto else None,
             "valor_recebido": float(r.valor_recebido) if r.valor_recebido else None, "status": r.status}
            for r in convenio.repasses
        ],
        "medicoes": [
            {"numero": m.numero, "valor": float(m.valor) if m.valor else None, "percentual_acumulado": float(m.percentual_acumulado) if m.percentual_acumulado else None, "status": m.status}
            for m in convenio.medicoes
        ],
        "movimentos": [
            {"tipo": m.tipo, "numero": m.numero, "valor": float(m.valor) if m.valor else None, "data": m.data.isoformat() if m.data else None}
            for m in convenio.movimentos_financeiros
        ],
        "contratos": [
            {"numero": c.numero, "fornecedor": c.fornecedor, "valor": float(c.valor) if c.valor else None, "status": c.status}
            for c in convenio.contratos
        ],
        "licitacoes": [
            {"numero": l.numero, "modalidade": l.modalidade, "situacao": l.situacao, "vencedor": l.vencedor}
            for l in convenio.licitacoes
        ],
        "prestacoes": [
            {"titulo": p.titulo, "status": p.status, "protocolo": p.protocolo, "percentual": p.percentual_preparacao}
            for p in convenio.prestacoes
        ],
        "diligencias": [
            {"descricao": d.descricao, "status": d.status, "resposta": d.resposta_interna, "protocolo": d.resposta_protocolo}
            for d in convenio.diligencias
        ],
        "obras": [
            {"nome": o.nome, "empresa": o.empresa, "percentual_fisico": float(o.percentual_fisico) if o.percentual_fisico else None, "situacao": o.situacao}
            for o in convenio.obras
        ],
        "entregas": [
            {"identificacao": e.identificacao, "fornecedor": e.fornecedor, "status": e.status}
            for e in convenio.entregas
        ],
        "timeline": [
            {"descricao": ev.descricao, "tipo": ev.tipo_evento.value if hasattr(ev.tipo_evento, "value") else ev.tipo_evento, "data": ev.ocorrido_em.isoformat()}
            for ev in convenio.eventos
        ],
    }


def _csv_dados_convenios(convenios, cabecalhos, linhas):
    output = io.StringIO()
    writer = csv.writer(output, delimiter=";")
    writer.writerow(cabecalhos)
    for linha in linhas:
        writer.writerow(["" if v is None else v for v in linha])
    output.seek(0)
    return output


@router.get("/exportar/processos.csv")
async def exportar_processos_csv(
    status: str | None = Query(None),
    esfera: str | None = Query(None),
    categoria: str | None = Query(None),
    db: AsyncSession = Depends(get_db),
    user: User = Depends(require_permission(Perm.EXPORT)),
):
    """Exporta os processos em CSV."""
    query = select(Convenio).where(
        Convenio.organization_id == user.organization_id,
        Convenio.deleted_at.is_(None),
    )
    if status:
        query = query.where(Convenio.status == status)
    if esfera:
        query = query.where(Convenio.esfera == esfera)
    if categoria:
        query = query.where(Convenio.categoria == categoria)
    result = await db.execute(query.options(selectinload(Convenio.repasses)))
    convenios = result.scalars().all()

    cabecalhos = ["Título", "Tipo", "Categoria", "Esfera", "Situação", "Parlamentar",
                  "Órgão Concedente", "Protocolo", "Valor Aprovado", "Valor Recebido",
                  "Data Criação"]
    linhas = []
    for c in convenios:
        recebido = sum(r.valor_recebido or 0 for r in c.repasses) if c.repasses else 0
        linhas.append([
            c.titulo, c.tipo, c.categoria, c.esfera, c.situacao, c.parlamentar,
            c.orgao_concedente, c.numero_protocolo_governo,
            c.valor_aprovado if c.valor_aprovado is not None else c.valor,
            recebido,
            c.created_at.strftime("%d/%m/%Y") if c.created_at else None,
        ])

    output = _csv_dados_convenios(convenios, cabecalhos, linhas)
    filename = f"processos_{datetime.now().strftime('%Y%m%d_%H%M')}.csv"
    return StreamingResponse(
        iter([output.getvalue()]),
        media_type="text/csv; charset=utf-8",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )
