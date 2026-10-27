"""Fase 10 — laboratório (B.8-001…030, B.8-032…034) e SISCAN (B.5-001…014, B.5-016…018).

Rotas finas: regras em ``app/services/laboratorio.py`` e ``app/services/siscan.py``.
O portal do cidadão (B.8-024) é público e exige protocolo, código de acesso e
data de nascimento, com tentativas limitadas.
"""

from __future__ import annotations

import uuid
from datetime import date

from fastapi import APIRouter, Body, Depends, Query, Request, Response
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.auth import get_tenant_id
from app.core.autorizacao import exigir, exigir_alguma
from app.core.database import get_db
from app.core.errors import NotFound
from app.core.permissoes import Permissao
from app.models.nucleo import Organizacao, Usuario
from app.schemas.laboratorio import (
    AtivacaoModelo,
    Autorizacao,
    Coleta,
    CopiarExame,
    Entrega,
    ExameCreate,
    ExameOut,
    ItemOut,
    Liberacao,
    LoteContingencia,
    MensagemEquipamentoIn,
    ModeloSiscanCreate,
    ModeloSiscanOut,
    Motivo,
    PortalLaudo,
    Problema,
    Recepcao,
    RequisicaoCreate,
    RequisicaoOut,
    ResultadoCreate,
    SiscanCreate,
    SiscanOut,
    SiscanResultado,
    SiscanSituacao,
)
from app.services import laboratorio as svc
from app.services import siscan
from app.services.auditoria import dados_do_cliente
from app.services.exportacao import pdf, responder

router = APIRouter(prefix="/laboratorio", tags=["Laboratório"])
router_siscan = APIRouter(prefix="/siscan", tags=["SISCAN"])
Tenant = Depends(get_tenant_id)
Db = Depends(get_db)
Ler = Depends(exigir(Permissao.LABORATORIO_LER))
Coletar = Depends(exigir(Permissao.LABORATORIO_COLETAR))
Resultado = Depends(exigir(Permissao.LABORATORIO_RESULTADO))
Liberar = Depends(exigir(Permissao.LABORATORIO_LIBERAR))
Gerenciar = Depends(exigir(Permissao.LABORATORIO_GERENCIAR))
Requisitar = Depends(exigir_alguma(Permissao.EXAME_SOLICITAR, Permissao.LABORATORIO_COLETAR))
Autorizar = Depends(exigir(Permissao.AUTORIZACAO_GERENCIAR))
Solicitar = Depends(exigir(Permissao.EXAME_SOLICITAR))
Acompanhar = Depends(exigir(Permissao.SISCAN_ACOMPANHAR))
Producao = Depends(exigir_alguma(Permissao.FATURAMENTO_LER, Permissao.LABORATORIO_LER))


def _pdf(html: str, nome: str) -> Response:
    return Response(
        content=pdf(html),
        media_type="application/pdf",
        headers={
            "Content-Disposition": f'inline; filename="{nome}.pdf"',
            "Cache-Control": "no-store",
        },
    )


# ── Configuração ────────────────────────────────────────────────────────────
@router.post("/exames", response_model=ExameOut, status_code=201)
async def criar_exame(
    c: ExameCreate, r: Request, t: uuid.UUID = Tenant, u: Usuario = Gerenciar, db: AsyncSession = Db
):
    """B.8-001, B.8-004, B.8-005, B.8-008, B.8-021, B.8-025 — nova versão do exame."""
    return await svc.criar_exame(db, t, c, u, dados_do_cliente(r))


@router.get("/exames", response_model=list[ExameOut])
async def listar_exames(
    estabelecimento_id: uuid.UUID | None = None,
    todas: bool = False,
    t: uuid.UUID = Tenant,
    _: Usuario = Ler,
    db: AsyncSession = Db,
):
    """B.8-001, B.8-003 — catálogo ativo (ou todas as versões)."""
    return await svc.listar_exames(db, t, estabelecimento_id, todas)


@router.post("/exames/{id}/copiar", response_model=ExameOut, status_code=201)
async def copiar_exame(
    id: uuid.UUID,
    c: CopiarExame,
    r: Request,
    t: uuid.UUID = Tenant,
    u: Usuario = Gerenciar,
    db: AsyncSession = Db,
):
    """B.8-003 — cópia para outra unidade com controle de versão."""
    return await svc.copiar_exame(db, t, id, c.estabelecimento_id, u, dados_do_cliente(r))


# ── Requisição e recepção ───────────────────────────────────────────────────
@router.post("/requisicoes", response_model=RequisicaoOut, status_code=201)
async def requisitar(
    c: RequisicaoCreate,
    r: Request,
    t: uuid.UUID = Tenant,
    u: Usuario = Requisitar,
    db: AsyncSession = Db,
):
    """B.8-005, B.8-006, B.8-010, B.8-011, B.8-021, B.8-034 — requisição.

    Idempotente por ``id_cliente``; o código de acesso ao portal só aparece aqui.
    """
    return await svc.requisitar(db, t, c, u, dados_do_cliente(r))


@router.get("/requisicoes/{id}", response_model=RequisicaoOut)
async def obter_requisicao(
    id: uuid.UUID, r: Request, t: uuid.UUID = Tenant, u: Usuario = Ler, db: AsyncSession = Db
):
    """B.8-006, B.8-025, B.8-032 — leitura auditada; sigilosos velados."""
    return await svc.obter_requisicao(db, t, id, u, dados_do_cliente(r))


@router.get("/cidadaos/{cidadao_id}/requisicoes", response_model=list[RequisicaoOut])
async def requisicoes_cidadao(
    cidadao_id: uuid.UUID,
    r: Request,
    t: uuid.UUID = Tenant,
    u: Usuario = Ler,
    db: AsyncSession = Db,
):
    """B.8-029 — exames do cidadão nas unidades do escopo."""
    return await svc.requisicoes_do_cidadao(db, t, cidadao_id, u, dados_do_cliente(r))


@router.get("/requisicoes/{id}/historico")
async def historico(
    id: uuid.UUID, r: Request, t: uuid.UUID = Tenant, u: Usuario = Ler, db: AsyncSession = Db
):
    """B.8-029 — todas as etapas e ocorrências."""
    return await svc.historico(db, t, id, u, dados_do_cliente(r))


@router.post("/recepcao", response_model=RequisicaoOut)
async def recepcao(
    c: Recepcao, r: Request, t: uuid.UUID = Tenant, u: Usuario = Coletar, db: AsyncSession = Db
):
    """B.8-010 — recepção por protocolo (código de barras/QR do comprovante) ou etiqueta."""
    return await svc.recepcionar(db, t, c.codigo, u, dados_do_cliente(r))


@router.post("/requisicoes/{id}/comprovante")
async def comprovante(
    id: uuid.UUID,
    r: Request,
    formato: str = Query(default="json", pattern="^(json|pdf)$"),
    t: uuid.UUID = Tenant,
    u: Usuario = Ler,
    db: AsyncSession = Db,
):
    """B.8-014 — comprovante com previsão de retirada e novo código de acesso ao portal."""
    dados = await svc.comprovante(db, t, id, u, dados_do_cliente(r))
    if formato == "json":
        return dados
    import segno

    from app.services.exportacao import html_tabela

    qr = segno.make(dados["protocolo"], error="m").svg_inline(scale=3)
    html = html_tabela(
        "Comprovante de exames",
        [("campo", "Campo"), ("valor", "Valor")],
        [
            {"campo": "Protocolo", "valor": dados["protocolo"]},
            {"campo": "Paciente", "valor": dados["paciente"]},
            {"campo": "Exames", "valor": ", ".join(dados["exames"])},
            {"campo": "Previsão de retirada", "valor": dados["previsao_retirada"]},
            {"campo": "Código de acesso ao portal", "valor": dados["codigo_acesso"]},
        ],
    )
    return _pdf(html + f"<div>{qr}</div>", "comprovante-exames")


@router.get("/requisicoes/{id}/declaracao-comparecimento")
async def declaracao(
    id: uuid.UUID, r: Request, t: uuid.UUID = Tenant, u: Usuario = Ler, db: AsyncSession = Db
):
    """B.8-026 — declaração de comparecimento em PDF."""
    return _pdf(
        await svc.declaracao_comparecimento(db, t, id, u, dados_do_cliente(r)), "declaracao"
    )


@router.get("/requisicoes/{id}/laudo")
async def laudo(
    id: uuid.UUID, r: Request, t: uuid.UUID = Tenant, u: Usuario = Ler, db: AsyncSession = Db
):
    """B.8-024, B.8-032 — laudo em PDF na unidade (impressão auditada)."""
    return _pdf(await svc.laudo(db, t, id, u, dados_do_cliente(r)), "laudo")


@router.post("/portal/{slug}/laudo")
async def portal_laudo(slug: str, c: PortalLaudo, r: Request, db: AsyncSession = Db):
    """B.8-024 — portal do cidadão: protocolo + código + nascimento; 5 tentativas e bloqueio."""
    tenant = await db.scalar(select(Organizacao.id).where(Organizacao.slug == slug))
    if tenant is None:
        raise NotFound("Dados de acesso não conferem.")
    return _pdf(await svc.laudo_portal(db, tenant, c, dados_do_cliente(r)), "laudo")


# ── Itens: autorização, etiqueta, coleta, processamento ────────────────────
@router.post("/itens/{id}/autorizacao", response_model=ItemOut)
async def autorizacao(
    id: uuid.UUID,
    c: Autorizacao,
    r: Request,
    t: uuid.UUID = Tenant,
    u: Usuario = Autorizar,
    db: AsyncSession = Db,
):
    """B.8-005 — autoriza (com validade) ou nega exame que exige autorização/alto custo."""
    return await svc.autorizar(db, t, id, c.autorizado, c.motivo, u, dados_do_cliente(r))


@router.post("/itens/{id}/etiqueta")
async def etiqueta(
    id: uuid.UUID,
    r: Request,
    c: Motivo | None = Body(default=None),
    formato: str = Query(default="json", pattern="^(json|pdf)$"),
    t: uuid.UUID = Tenant,
    u: Usuario = Coletar,
    db: AsyncSession = Db,
):
    """B.8-012 — etiqueta com código; reimpressão exige motivo e é auditada."""
    dados = await svc.etiqueta(db, t, id, c.motivo if c else None, u, dados_do_cliente(r))
    if formato == "json":
        return dados
    import segno
    from markupsafe import escape

    qr = segno.make(dados["etiqueta"], error="m").svg_inline(scale=2)
    urgente = " · URGENTE" if dados["urgente"] else ""
    texto = escape(
        f"{dados['etiqueta']} {dados['exame']} · {dados['material'] or ''} · "
        f"{dados['paciente']} · {dados['protocolo']}{urgente}"
    )
    return _pdf(f"<div>{qr}<p>{texto}</p></div>", "etiqueta")


@router.post("/coleta", response_model=ItemOut)
async def coleta(
    c: Coleta, r: Request, t: uuid.UUID = Tenant, u: Usuario = Coletar, db: AsyncSession = Db
):
    """B.8-013 — coleta pela leitura da etiqueta (material, data/hora, coletador)."""
    return await svc.coletar(db, t, c, u, dados_do_cliente(r))


@router.post("/itens/{id}/problemas", response_model=ItemOut)
async def problema(
    id: uuid.UUID,
    c: Problema,
    r: Request,
    t: uuid.UUID = Tenant,
    u: Usuario = Coletar,
    db: AsyncSession = Db,
):
    """B.8-002 — problema de coleta, amostra, transporte ou processamento."""
    return await svc.registrar_problema(db, t, id, c, u, dados_do_cliente(r))


@router.post("/itens/{id}/processamento", response_model=ItemOut)
async def processamento(
    id: uuid.UUID, r: Request, t: uuid.UUID = Tenant, u: Usuario = Resultado, db: AsyncSession = Db
):
    """B.8-016 — amostra entra em processamento."""
    return await svc.processar(db, t, id, u, dados_do_cliente(r))


@router.post("/itens/{id}/cancelar", response_model=ItemOut)
async def cancelar(
    id: uuid.UUID,
    c: Motivo,
    r: Request,
    t: uuid.UUID = Tenant,
    u: Usuario = Coletar,
    db: AsyncSession = Db,
):
    """Cancelamento com motivo (preservado no histórico)."""
    return await svc.cancelar(db, t, id, c.motivo, u, dados_do_cliente(r))


# ── Resultado, liberação e entrega ──────────────────────────────────────────
@router.post("/itens/{id}/resultado", response_model=ItemOut)
async def resultado(
    id: uuid.UUID,
    c: ResultadoCreate,
    r: Request,
    t: uuid.UUID = Tenant,
    u: Usuario = Resultado,
    db: AsyncSession = Db,
):
    """B.8-017, B.8-018, B.8-019, B.8-020 — valida limites/unidades, marca referência e crítico."""
    return await svc.registrar_resultado(db, t, id, c, u, dados_do_cliente(r))


@router.post("/itens/{id}/liberacao", response_model=ItemOut)
async def liberacao(
    id: uuid.UUID,
    c: Liberacao,
    r: Request,
    t: uuid.UUID = Tenant,
    u: Usuario = Liberar,
    db: AsyncSession = Db,
):
    """B.8-022, B.8-023 — liberação por profissional habilitado com assinatura eletrônica."""
    return await svc.liberar(db, t, id, c.assinatura, u, dados_do_cliente(r))


@router.post("/itens/{id}/entrega", response_model=ItemOut)
async def entrega(
    id: uuid.UUID,
    c: Entrega,
    r: Request,
    t: uuid.UUID = Tenant,
    u: Usuario = Ler,
    db: AsyncSession = Db,
):
    """B.8-007 — entrega com identificação de quem recebeu."""
    return await svc.entregar(db, t, id, c, u, dados_do_cliente(r))


@router.get("/itens/{id}/etapas")
async def etapas(id: uuid.UUID, t: uuid.UUID = Tenant, u: Usuario = Ler, db: AsyncSession = Db):
    """B.8-016 — acompanhamento visual das etapas."""
    return await svc.etapas(db, t, id, u)


@router.get("/estabelecimentos/{estabelecimento_id}/mapa-trabalho")
async def mapa_trabalho(
    estabelecimento_id: uuid.UUID,
    bancada: str | None = None,
    urgente: bool | None = None,
    exame: str | None = None,
    situacao: str | None = Query(default=None, pattern="^(COLETADO|EM_PROCESSAMENTO|RESULTADO)$"),
    profissional_id: uuid.UUID | None = None,
    formato: str = Query(default="json", pattern="^(json|csv|xlsx|pdf)$"),
    t: uuid.UUID = Tenant,
    u: Usuario = Ler,
    db: AsyncSession = Db,
):
    """B.8-015 — mapa de trabalho por bancada, urgência, profissional, exame e situação."""
    linhas = await svc.mapa_trabalho(
        db,
        t,
        estabelecimento_id,
        u,
        bancada=bancada,
        urgente=urgente,
        exame_codigo=exame,
        situacao=situacao,
        profissional_id=profissional_id,
    )
    colunas = [
        (k, k)
        for k in ("etiqueta", "exame", "bancada", "material", "urgente", "situacao", "protocolo")
    ]
    return responder("Mapa de trabalho", colunas, linhas, formato, "paisagem")


@router.get("/estabelecimentos/{estabelecimento_id}/pendencias")
async def pendencias(
    estabelecimento_id: uuid.UUID, t: uuid.UUID = Tenant, u: Usuario = Ler, db: AsyncSession = Db
):
    """B.8-020 — incompletos, pendentes, fora de referência, críticos e atrasados."""
    return await svc.pendencias(db, t, estabelecimento_id, u)


# ── Equipamentos e contingência ────────────────────────────────────────────
@router.post("/equipamentos/mensagens")
async def mensagem_equipamento(
    c: MensagemEquipamentoIn,
    r: Request,
    t: uuid.UUID = Tenant,
    u: Usuario = Resultado,
    db: AsyncSession = Db,
):
    """B.8-008, B.8-009 — resultado de equipamento (idempotente); falha fica no log."""
    return await svc.receber_mensagem(db, t, c, u, dados_do_cliente(r))


@router.get("/equipamentos/mensagens")
async def mensagens(
    situacao: str | None = Query(default=None, pattern="^(PROCESSADA|ERRO)$"),
    t: uuid.UUID = Tenant,
    _: Usuario = Resultado,
    db: AsyncSession = Db,
):
    """B.8-009 — log de interfaceamento."""
    return await svc.listar_mensagens(db, t, situacao)


@router.post("/equipamentos/mensagens/{id}/reprocessar")
async def reprocessar(
    id: uuid.UUID, r: Request, t: uuid.UUID = Tenant, u: Usuario = Resultado, db: AsyncSession = Db
):
    """B.8-009 — reprocessa mensagem com falha."""
    return await svc.reprocessar_mensagem(db, t, id, u, dados_do_cliente(r))


@router.post("/contingencia/sincronizar")
async def contingencia(
    c: LoteContingencia,
    r: Request,
    t: uuid.UUID = Tenant,
    u: Usuario = Requisitar,
    db: AsyncSession = Db,
):
    """B.8-034 — lote registrado em contingência; id_cliente evita duplicação."""
    return await svc.sincronizar_contingencia(db, t, c.requisicoes, u, dados_do_cliente(r))


# ── Faturamento e relatórios ────────────────────────────────────────────────
@router.get("/producao")
async def producao(
    competencia: str = Query(pattern=r"^\d{4}-\d{2}$"),
    estabelecimento_id: uuid.UUID | None = None,
    t: uuid.UUID = Tenant,
    u: Usuario = Producao,
    db: AsyncSession = Db,
):
    """B.8-004, B.8-027 — produção liberada por procedimento SIGTAP (BPA: Fase 13)."""
    return await svc.producao(db, t, competencia, u, estabelecimento_id)


@router.get("/relatorios/exames")
async def relatorio_exames(
    inicio: date,
    fim: date,
    agrupar_por: str = Query(
        default="mes", pattern="^(mes|exame|estabelecimento|profissional|situacao|mapa)$"
    ),
    comparar: bool = False,
    formato: str = Query(default="json", pattern="^(json|csv|xlsx|pdf)$"),
    t: uuid.UUID = Tenant,
    u: Usuario = Ler,
    db: AsyncSession = Db,
):
    """B.8-028, B.8-030 — quantidade, valor, prazos; comparativo com o período anterior."""
    from app.api.v1.relatorios import _saida
    from app.services.relatorios import com_comparativo

    dados = await com_comparativo(
        svc.relatorio_exames, db, t, inicio, fim, comparar, ator=u, agrupar_por=agrupar_por
    )
    return _saida("Exames laboratoriais", dados, formato, "retrato", comparar)


# ── SISCAN ──────────────────────────────────────────────────────────────────
@router_siscan.post("/modelos", response_model=ModeloSiscanOut, status_code=201)
async def criar_modelo(
    c: ModeloSiscanCreate,
    r: Request,
    t: uuid.UUID = Tenant,
    u: Usuario = Gerenciar,
    db: AsyncSession = Db,
):
    """B.5-005, B.5-018 — nova versão do formulário (nasce inativa)."""
    return await siscan.criar_modelo(db, t, c, u, dados_do_cliente(r))


@router_siscan.get("/modelos", response_model=list[ModeloSiscanOut])
async def modelos(
    tipo: str | None = None, t: uuid.UUID = Tenant, _: Usuario = Ler, db: AsyncSession = Db
):
    """B.5-018 — versões dos modelos."""
    return await siscan.listar_modelos(db, t, tipo)


@router_siscan.post("/modelos/{id}/ativacao", response_model=ModeloSiscanOut)
async def ativar_modelo(
    id: uuid.UUID,
    c: AtivacaoModelo,
    r: Request,
    t: uuid.UUID = Tenant,
    u: Usuario = Gerenciar,
    db: AsyncSession = Db,
):
    """B.5-018 — ativa com fonte normativa; a versão anterior é desativada."""
    return await siscan.ativar_modelo(db, t, id, c.fonte_normativa, u, dados_do_cliente(r))


@router_siscan.post("/exames", response_model=SiscanOut, status_code=201)
async def requisitar_siscan(
    c: SiscanCreate,
    r: Request,
    t: uuid.UUID = Tenant,
    u: Usuario = Solicitar,
    db: AsyncSession = Db,
):
    """B.5-001…004 — requisição de colo do útero/mama no modelo vigente."""
    return await siscan.requisitar(db, t, c, u, dados_do_cliente(r))


@router_siscan.post("/exames/{id}/situacao", response_model=SiscanOut)
async def situacao_siscan(
    id: uuid.UUID,
    c: SiscanSituacao,
    r: Request,
    t: uuid.UUID = Tenant,
    u: Usuario = Ler,
    db: AsyncSession = Db,
):
    """B.5-011 — coleta, envio, comunicação, seguimento e encerramento."""
    return await siscan.mudar_situacao(db, t, id, c, u, dados_do_cliente(r))


@router_siscan.post("/exames/{id}/resultado", response_model=SiscanOut)
async def resultado_siscan(
    id: uuid.UUID,
    c: SiscanResultado,
    r: Request,
    t: uuid.UUID = Tenant,
    u: Usuario = Resultado,
    db: AsyncSession = Db,
):
    """B.5-006…010 — resultado a partir da requisição; marca alterado e próximo exame."""
    return await siscan.registrar_resultado(db, t, id, c, u, dados_do_cliente(r))


@router_siscan.post("/exames/{id}/assinatura", response_model=SiscanOut)
async def assinar_siscan(
    id: uuid.UUID, r: Request, t: uuid.UUID = Tenant, u: Usuario = Liberar, db: AsyncSession = Db
):
    """B.5-016 — assinatura eletrônica do resultado/laudo."""
    return await siscan.assinar(db, t, id, u, dados_do_cliente(r))


@router_siscan.get("/exames/{id}/guia")
async def guia(
    id: uuid.UUID, r: Request, t: uuid.UUID = Tenant, u: Usuario = Ler, db: AsyncSession = Db
):
    """B.5-005 — guia/modelo equivalente em PDF."""
    return _pdf(await siscan.guia_html(db, t, id, u, dados_do_cliente(r)), "guia-siscan")


@router_siscan.get("/cidadaos/{cidadao_id}/historico")
async def historico_siscan(
    cidadao_id: uuid.UUID,
    r: Request,
    tipo: str | None = None,
    situacao: str | None = None,
    inicio: date | None = None,
    fim: date | None = None,
    t: uuid.UUID = Tenant,
    u: Usuario = Ler,
    db: AsyncSession = Db,
):
    """B.5-012 — histórico por tipo, situação e período, com o próximo exame."""
    dados = await siscan.historico(
        db,
        t,
        cidadao_id,
        u,
        dados_do_cliente(r),
        tipo=tipo,
        situacao=situacao,
        inicio=inicio,
        fim=fim,
    )
    return {
        "exames": [SiscanOut.model_validate(e) for e in dados["exames"]],
        "proximo_exame_em": dados["proximo_exame_em"],
    }


@router_siscan.get("/busca-ativa")
async def busca_ativa(
    r: Request,
    estabelecimento_id: uuid.UUID | None = None,
    t: uuid.UUID = Tenant,
    u: Usuario = Acompanhar,
    db: AsyncSession = Db,
):
    """B.5-013 — atrasos, alterados sem seguimento e rastreamento vencido (acesso restrito)."""
    return await siscan.busca_ativa(db, t, u, dados_do_cliente(r), estabelecimento_id)


@router_siscan.get("/producao")
async def producao_siscan(
    competencia: str = Query(pattern=r"^\d{4}-\d{2}$"),
    t: uuid.UUID = Tenant,
    u: Usuario = Producao,
    db: AsyncSession = Db,
):
    """B.5-014 — coletas por procedimento SIGTAP (arquivo BPA: Fase 13)."""
    return await siscan.producao_coletas(db, t, competencia, u)


@router_siscan.get("/relatorios")
async def relatorio_siscan(
    inicio: date,
    fim: date,
    agrupar_por: str = Query(
        default="mes",
        pattern="^(mes|estabelecimento|profissional|resultado|faixa_etaria|territorio)$",
    ),
    tipo: str | None = None,
    comparar: bool = False,
    formato: str = Query(default="json", pattern="^(json|csv|xlsx|pdf)$"),
    t: uuid.UUID = Tenant,
    u: Usuario = Ler,
    db: AsyncSession = Db,
):
    """B.5-017 — por unidade, profissional, resultado, faixa etária, território e período."""
    from app.api.v1.relatorios import _saida
    from app.services.relatorios import com_comparativo

    dados = await com_comparativo(
        siscan.relatorio, db, t, inicio, fim, comparar, ator=u, agrupar_por=agrupar_por, tipo=tipo
    )
    return _saida("Exames SISCAN", dados, formato, "retrato", comparar)
