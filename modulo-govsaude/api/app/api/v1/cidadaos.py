"""Cadastro único do cidadão, deduplicação, unificação e CADSUS (Fase 2)."""

from __future__ import annotations

import uuid

from fastapi import (
    APIRouter,
    Depends,
    File,
    Form,
    Header,
    Query,
    Request,
    Response,
    UploadFile,
)
from fastapi.encoders import jsonable_encoder
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.v1.rede_helpers import (
    cache_idempotencia,
    gravar_idempotencia,
    resposta_cache,
)
from app.core.auth import get_tenant_id
from app.core.autorizacao import exigir, exigir_alguma
from app.core.database import get_db
from app.core.permissoes import Permissao
from app.core.security import hash_bytes
from app.models.enums import AcaoAuditoria
from app.models.nucleo import Usuario
from app.schemas.cidadao import (
    AlergiaCreate,
    AlergiaOut,
    BaixaCidadaoRequest,
    CidadaoBaixaOut,
    CidadaoBuscaOut,
    CidadaoBuscaRequest,
    CidadaoCreate,
    CidadaoOut,
    CidadaoResumoOut,
    CidadaoUpdate,
    CondicaoCreate,
    CondicaoOut,
    ConsultaCADSUSOut,
    ConsultaCADSUSRequest,
    ConsultaCepOut,
    ConsultaCepRequest,
    ContatoCreate,
    ContatoOut,
    DecisaoDuplicidadeRequest,
    DocumentoCreate,
    DocumentoOut,
    DuplicidadeOut,
    EnderecoCreate,
    EnderecoOut,
    FotoOut,
    PlanoSaudeCreate,
    PlanoSaudeOut,
    ReativacaoRequest,
    RecemNascidoCreate,
    ReversaoUnificacaoRequest,
    UnificacaoOut,
    UnificacaoRequest,
)
from app.schemas.comuns import Pagina
from app.services import (
    cidadao_detalhes,
    cidadao_fotos,
    cidadaos,
    consulta_cadsus,
    consulta_cep,
    deduplicacao,
)
from app.services.auditoria import dados_do_cliente, registrar
from app.services.cidadao_comum import (
    serializar_cidadao,
    serializar_contato,
    serializar_documento,
    serializar_plano,
    serializar_resumo,
)
from app.services.rede_comum import exigir_versao

router = APIRouter(prefix="/cidadaos", tags=["Cidadãos"])


def _out(registro) -> CidadaoOut:
    return CidadaoOut(**serializar_cidadao(registro))


def _resumo(registro) -> CidadaoResumoOut:
    return CidadaoResumoOut(**serializar_resumo(registro))


def _documento(registro) -> DocumentoOut:
    return DocumentoOut(**serializar_documento(registro))


def _contato(registro) -> ContatoOut:
    return ContatoOut(**serializar_contato(registro))


def _plano(registro) -> PlanoSaudeOut:
    return PlanoSaudeOut(**serializar_plano(registro))


async def _foto(registro) -> FotoOut:
    saida = FotoOut.model_validate(registro)
    return saida.model_copy(
        update={"url_temporaria": await cidadao_fotos.url_temporaria(registro)}
    )


async def _auditar(
    db: AsyncSession,
    request: Request,
    usuario: Usuario,
    *,
    recurso: str,
    recurso_id: uuid.UUID | None = None,
    finalidade: str = "cadastro único do cidadão",
) -> None:
    await registrar(
        db,
        acao=AcaoAuditoria.READ_SENSIVEL,
        usuario=usuario,
        recurso=recurso,
        recurso_id=recurso_id,
        finalidade=finalidade,
        cliente=dados_do_cliente(request),
    )
    await db.commit()


# ── Lista, criação, busca e consultas ───────────────────────────────────────


@router.get("", response_model=Pagina[CidadaoResumoOut])
async def listar_cidadaos(
    request: Request,
    limite: int = Query(50, ge=1, le=100),
    cursor: str | None = None,
    ativo: bool | None = None,
    incluir_unificados: bool = False,
    tenant_id: uuid.UUID = Depends(get_tenant_id),
    usuario: Usuario = Depends(exigir(Permissao.CIDADAO_LER)),
    db: AsyncSession = Depends(get_db),
):
    """B.1-001, B.1-004 — cadastro do cidadão."""
    itens, proximo, total = await cidadaos.listar(
        db,
        tenant_id,
        limite=limite,
        cursor=cursor,
        ativo=ativo,
        incluir_unificados=incluir_unificados,
    )
    await _auditar(db, request, usuario, recurso="cidadao")
    return Pagina[CidadaoResumoOut](
        itens=[_resumo(item) for item in itens],
        proximo_cursor=proximo,
        total_estimado=total,
    )


@router.post("", response_model=CidadaoOut, status_code=201)
async def criar_cidadao(
    corpo: CidadaoCreate,
    request: Request,
    response: Response,
    tenant_id: uuid.UUID = Depends(get_tenant_id),
    ator: Usuario = Depends(exigir(Permissao.CIDADAO_CRIAR)),
    db: AsyncSession = Depends(get_db),
):
    """B.1-001, B.1-004 — cadastro do cidadão."""
    chave, request_hash, cache = await cache_idempotencia(
        request, db, tenant_id, corpo.model_dump(mode="json")
    )
    if cache is not None:
        return resposta_cache(cache)
    registro = await cidadaos.criar(
        db, tenant_id=tenant_id, dados=corpo, ator=ator, cliente=dados_do_cliente(request)
    )
    saida = _out(registro)
    response.headers["ETag"] = f'"{registro.versao}"'
    await gravar_idempotencia(
        db, tenant_id, chave, request, request_hash, 201,
        jsonable_encoder(saida), ator,
    )
    return saida


@router.post("/busca", response_model=Pagina[CidadaoBuscaOut])
async def buscar_cidadaos(
    corpo: CidadaoBuscaRequest,
    request: Request,
    tenant_id: uuid.UUID = Depends(get_tenant_id),
    usuario: Usuario = Depends(exigir(Permissao.CIDADAO_LER)),
    db: AsyncSession = Depends(get_db),
):
    """B.12-004, B.12-005, B.12-009 — busca fonética e por CPF/CNS."""
    itens, proximo, total = await cidadaos.buscar(
        db,
        tenant_id,
        termo=corpo.termo,
        limite=corpo.limite,
        cursor=corpo.cursor,
        incluir_unificados=corpo.incluir_unificados,
    )
    await _auditar(db, request, usuario, recurso="cidadao", finalidade="busca cadastral")
    return Pagina[CidadaoBuscaOut](
        itens=[
            CidadaoBuscaOut(
                **serializar_resumo(registro), score=score, motivo_match=motivo
            )
            for registro, score, motivo in itens
        ],
        proximo_cursor=proximo,
        total_estimado=total,
    )


@router.post("/consulta-cadsus", response_model=ConsultaCADSUSOut)
async def consultar_cadsus(
    corpo: ConsultaCADSUSRequest,
    request: Request,
    tenant_id: uuid.UUID = Depends(get_tenant_id),
    ator: Usuario = Depends(exigir(Permissao.CIDADAO_LER)),
    db: AsyncSession = Depends(get_db),
):
    """B.12-004, B.12-010 — CADSUS por interface oficial."""
    return ConsultaCADSUSOut(
        **await consulta_cadsus.consultar(
            db,
            tenant_id=tenant_id,
            cpf=corpo.cpf,
            cns=corpo.cns,
            ator=ator,
            cliente=dados_do_cliente(request),
        )
    )


@router.post("/consulta-cep", response_model=ConsultaCepOut)
async def consultar_cep(
    corpo: ConsultaCepRequest,
    tenant_id: uuid.UUID = Depends(get_tenant_id),
    _usuario: Usuario = Depends(exigir(Permissao.CIDADAO_LER)),
    db: AsyncSession = Depends(get_db),
):
    """B.1-003, B.12-008 — CEP por base oficial."""
    return ConsultaCepOut(**await consulta_cep.consultar(db, corpo.cep))


# ── Cidadão ────────────────────────────────────────────────────────────────


@router.get("/{cidadao_id}", response_model=CidadaoOut)
async def detalhar_cidadao(
    cidadao_id: uuid.UUID,
    request: Request,
    response: Response,
    tenant_id: uuid.UUID = Depends(get_tenant_id),
    usuario: Usuario = Depends(exigir(Permissao.CIDADAO_LER)),
    db: AsyncSession = Depends(get_db),
):
    """B.1-001, B.1-004 — cadastro do cidadão."""
    registro = await cidadaos.obter_cidadao(db, tenant_id, cidadao_id)
    await _auditar(db, request, usuario, recurso="cidadao", recurso_id=registro.id)
    response.headers["ETag"] = f'"{registro.versao}"'
    return _out(registro)


@router.patch("/{cidadao_id}", response_model=CidadaoOut)
async def atualizar_cidadao(
    cidadao_id: uuid.UUID,
    corpo: CidadaoUpdate,
    request: Request,
    response: Response,
    if_match: str | None = Header(default=None, alias="If-Match"),
    tenant_id: uuid.UUID = Depends(get_tenant_id),
    ator: Usuario = Depends(exigir(Permissao.CIDADAO_EDITAR)),
    db: AsyncSession = Depends(get_db),
):
    """B.1-001, B.1-004 — cadastro do cidadão."""
    registro = await cidadaos.atualizar(
        db,
        tenant_id=tenant_id,
        cidadao_id=cidadao_id,
        dados=corpo,
        versao=exigir_versao(if_match),
        ator=ator,
        cliente=dados_do_cliente(request),
    )
    response.headers["ETag"] = f'"{registro.versao}"'
    return _out(registro)


@router.post("/{cidadao_id}/baixar", response_model=CidadaoOut)
async def baixar_cidadao(
    cidadao_id: uuid.UUID,
    corpo: BaixaCidadaoRequest,
    request: Request,
    tenant_id: uuid.UUID = Depends(get_tenant_id),
    ator: Usuario = Depends(exigir(Permissao.CIDADAO_BAIXAR)),
    db: AsyncSession = Depends(get_db),
):
    """B.1-001 — baixa lógica com histórico."""
    return _out(
        await cidadaos.baixar(
            db,
            tenant_id=tenant_id,
            cidadao_id=cidadao_id,
            dados=corpo,
            ator=ator,
            cliente=dados_do_cliente(request),
        )
    )


@router.post("/{cidadao_id}/reativar", response_model=CidadaoOut)
async def reativar_cidadao(
    cidadao_id: uuid.UUID,
    corpo: ReativacaoRequest,
    request: Request,
    tenant_id: uuid.UUID = Depends(get_tenant_id),
    ator: Usuario = Depends(exigir(Permissao.CIDADAO_BAIXAR)),
    db: AsyncSession = Depends(get_db),
):
    """B.1-001 — baixa lógica com histórico."""
    return _out(
        await cidadaos.reativar(
            db,
            tenant_id=tenant_id,
            cidadao_id=cidadao_id,
            dados=corpo,
            ator=ator,
            cliente=dados_do_cliente(request),
        )
    )


@router.get("/{cidadao_id}/baixas", response_model=list[CidadaoBaixaOut])
async def listar_baixas_cidadao(
    cidadao_id: uuid.UUID,
    request: Request,
    tenant_id: uuid.UUID = Depends(get_tenant_id),
    usuario: Usuario = Depends(exigir(Permissao.CIDADAO_LER)),
    db: AsyncSession = Depends(get_db),
):
    """B.1-001 — baixa lógica com histórico."""
    registros = await cidadaos.listar_baixas(db, tenant_id, cidadao_id)
    await _auditar(db, request, usuario, recurso="cidadao_baixa", recurso_id=cidadao_id)
    return [CidadaoBaixaOut.model_validate(item) for item in registros]


@router.post("/{cidadao_id}/recem-nascido", response_model=CidadaoOut, status_code=201)
async def criar_recem_nascido(
    cidadao_id: uuid.UUID,
    corpo: RecemNascidoCreate,
    request: Request,
    response: Response,
    tenant_id: uuid.UUID = Depends(get_tenant_id),
    ator: Usuario = Depends(exigir(Permissao.CIDADAO_CRIAR)),
    db: AsyncSession = Depends(get_db),
):
    """B.1-009 — recém-nascido a partir da mãe."""
    chave, request_hash, cache = await cache_idempotencia(
        request, db, tenant_id, corpo.model_dump(mode="json")
    )
    if cache is not None:
        return resposta_cache(cache)
    registro = await cidadaos.criar_recem_nascido(
        db,
        tenant_id=tenant_id,
        mae_id=cidadao_id,
        dados=corpo,
        ator=ator,
        cliente=dados_do_cliente(request),
    )
    saida = _out(registro)
    response.headers["ETag"] = f'"{registro.versao}"'
    await gravar_idempotencia(
        db, tenant_id, chave, request, request_hash, 201,
        jsonable_encoder(saida), ator,
    )
    return saida


# ── Duplicidades e unificação ───────────────────────────────────────────────


@router.get("/{cidadao_id}/duplicidades", response_model=list[DuplicidadeOut])
async def listar_duplicidades(
    cidadao_id: uuid.UUID,
    request: Request,
    incluir_decididas: bool = False,
    tenant_id: uuid.UUID = Depends(get_tenant_id),
    usuario: Usuario = Depends(exigir(Permissao.CIDADAO_LER)),
    db: AsyncSession = Depends(get_db),
):
    """B.12-001 — possíveis duplicidades."""
    itens = await deduplicacao.listar_duplicidades(
        db, tenant_id, cidadao_id, incluir_decididas=incluir_decididas
    )
    await _auditar(db, request, usuario, recurso="cidadao_duplicidade", recurso_id=cidadao_id)
    return [DuplicidadeOut(**item) for item in itens]


@router.post(
    "/duplicidades/{duplicidade_id}/decidir", response_model=DuplicidadeOut
)
async def decidir_duplicidade(
    duplicidade_id: uuid.UUID,
    corpo: DecisaoDuplicidadeRequest,
    request: Request,
    tenant_id: uuid.UUID = Depends(get_tenant_id),
    ator: Usuario = Depends(exigir(Permissao.CIDADAO_EDITAR)),
    db: AsyncSession = Depends(get_db),
):
    """B.12-001, B.12-002 — decisão humana."""
    registro = await deduplicacao.decidir_duplicidade(
        db,
        tenant_id=tenant_id,
        duplicidade_id=duplicidade_id,
        decisao=corpo.decisao,
        justificativa=corpo.justificativa,
        ator=ator,
        cliente=dados_do_cliente(request),
    )
    return DuplicidadeOut.model_validate(registro)


@router.post("/{cidadao_id}/unificar", response_model=UnificacaoOut)
async def unificar_cidadao(
    cidadao_id: uuid.UUID,
    corpo: UnificacaoRequest,
    request: Request,
    tenant_id: uuid.UUID = Depends(get_tenant_id),
    ator: Usuario = Depends(exigir(Permissao.CIDADAO_BAIXAR)),
    db: AsyncSession = Depends(get_db),
):
    """B.1-007, B.12-002, B.12-003 — unificação com histórico."""
    registro = await deduplicacao.unificar(
        db,
        tenant_id=tenant_id,
        origem_id=cidadao_id,
        destino_id=corpo.destino_id,
        campos=corpo.campos,
        justificativa=corpo.justificativa,
        ator=ator,
        cliente=dados_do_cliente(request),
    )
    return UnificacaoOut.model_validate(registro)


@router.get("/{cidadao_id}/unificacoes", response_model=list[UnificacaoOut])
async def listar_unificacoes(
    cidadao_id: uuid.UUID,
    request: Request,
    tenant_id: uuid.UUID = Depends(get_tenant_id),
    usuario: Usuario = Depends(exigir(Permissao.CIDADAO_LER)),
    db: AsyncSession = Depends(get_db),
):
    """B.1-007 — histórico de unificações."""
    registros = await deduplicacao.listar_unificacoes(db, tenant_id, cidadao_id)
    await _auditar(db, request, usuario, recurso="cidadao_unificacao", recurso_id=cidadao_id)
    return [UnificacaoOut.model_validate(item) for item in registros]


@router.post("/unificacoes/{unificacao_id}/reverter", response_model=UnificacaoOut)
async def reverter_unificacao(
    unificacao_id: uuid.UUID,
    corpo: ReversaoUnificacaoRequest,
    request: Request,
    tenant_id: uuid.UUID = Depends(get_tenant_id),
    ator: Usuario = Depends(exigir(Permissao.CIDADAO_BAIXAR)),
    db: AsyncSession = Depends(get_db),
):
    """B.12-003 — reversão sem perda."""
    registro = await deduplicacao.reverter_unificacao(
        db,
        tenant_id=tenant_id,
        unificacao_id=unificacao_id,
        justificativa=corpo.justificativa,
        ator=ator,
        cliente=dados_do_cliente(request),
    )
    return UnificacaoOut.model_validate(registro)


# ── Documentos ─────────────────────────────────────────────────────────────


@router.get("/{cidadao_id}/documentos", response_model=list[DocumentoOut])
async def listar_documentos(
    cidadao_id: uuid.UUID,
    request: Request,
    tenant_id: uuid.UUID = Depends(get_tenant_id),
    usuario: Usuario = Depends(exigir(Permissao.CIDADAO_VER_DOCUMENTO)),
    db: AsyncSession = Depends(get_db),
):
    """B.1-001, B.1-004 — cadastro do cidadão."""
    registros = await cidadao_detalhes.listar_documentos(db, tenant_id, cidadao_id)
    await _auditar(db, request, usuario, recurso="cidadao_documento", recurso_id=cidadao_id)
    return [_documento(item) for item in registros]


@router.post("/{cidadao_id}/documentos", response_model=DocumentoOut, status_code=201)
async def criar_documento(
    cidadao_id: uuid.UUID,
    corpo: DocumentoCreate,
    request: Request,
    response: Response,
    tenant_id: uuid.UUID = Depends(get_tenant_id),
    ator: Usuario = Depends(exigir(Permissao.CIDADAO_VER_DOCUMENTO)),
    db: AsyncSession = Depends(get_db),
):
    """B.1-001, B.1-004 — cadastro do cidadão."""
    chave, request_hash, cache = await cache_idempotencia(
        request, db, tenant_id, corpo.model_dump(mode="json")
    )
    if cache is not None:
        return resposta_cache(cache)
    registro = await cidadao_detalhes.criar_documento(
        db, tenant_id=tenant_id, cidadao_id=cidadao_id, dados=corpo,
        ator=ator, cliente=dados_do_cliente(request),
    )
    saida = _documento(registro)
    response.headers["ETag"] = f'"{registro.versao}"'
    await gravar_idempotencia(
        db, tenant_id, chave, request, request_hash, 201,
        jsonable_encoder(saida), ator,
    )
    return saida


@router.post("/{cidadao_id}/documentos/{documento_id}/baixar", response_model=DocumentoOut)
async def baixar_documento(
    cidadao_id: uuid.UUID,
    documento_id: uuid.UUID,
    corpo: BaixaCidadaoRequest,
    request: Request,
    tenant_id: uuid.UUID = Depends(get_tenant_id),
    ator: Usuario = Depends(exigir(Permissao.CIDADAO_VER_DOCUMENTO)),
    db: AsyncSession = Depends(get_db),
):
    """B.1-001 — baixa lógica com histórico."""
    return _documento(
        await cidadao_detalhes.baixar_documento(
            db, tenant_id=tenant_id, cidadao_id=cidadao_id,
            documento_id=documento_id, dados=corpo, ator=ator,
            cliente=dados_do_cliente(request),
        )
    )


# ── Contatos ───────────────────────────────────────────────────────────────


@router.get("/{cidadao_id}/contatos", response_model=list[ContatoOut])
async def listar_contatos(
    cidadao_id: uuid.UUID,
    request: Request,
    tenant_id: uuid.UUID = Depends(get_tenant_id),
    usuario: Usuario = Depends(exigir(Permissao.CIDADAO_LER)),
    db: AsyncSession = Depends(get_db),
):
    """B.1-001, B.1-004 — cadastro do cidadão."""
    registros = await cidadao_detalhes.listar_contatos(db, tenant_id, cidadao_id)
    await _auditar(db, request, usuario, recurso="cidadao_contato", recurso_id=cidadao_id)
    return [_contato(item) for item in registros]


@router.post("/{cidadao_id}/contatos", response_model=ContatoOut, status_code=201)
async def criar_contato(
    cidadao_id: uuid.UUID,
    corpo: ContatoCreate,
    request: Request,
    response: Response,
    tenant_id: uuid.UUID = Depends(get_tenant_id),
    ator: Usuario = Depends(exigir(Permissao.CIDADAO_EDITAR)),
    db: AsyncSession = Depends(get_db),
):
    """B.1-001, B.1-004 — cadastro do cidadão."""
    chave, request_hash, cache = await cache_idempotencia(
        request, db, tenant_id, corpo.model_dump(mode="json")
    )
    if cache is not None:
        return resposta_cache(cache)
    registro = await cidadao_detalhes.criar_contato(
        db, tenant_id=tenant_id, cidadao_id=cidadao_id, dados=corpo,
        ator=ator, cliente=dados_do_cliente(request),
    )
    saida = _contato(registro)
    response.headers["ETag"] = f'"{registro.versao}"'
    await gravar_idempotencia(
        db, tenant_id, chave, request, request_hash, 201,
        jsonable_encoder(saida), ator,
    )
    return saida


@router.post("/{cidadao_id}/contatos/{contato_id}/baixar", response_model=ContatoOut)
async def baixar_contato(
    cidadao_id: uuid.UUID,
    contato_id: uuid.UUID,
    corpo: BaixaCidadaoRequest,
    request: Request,
    tenant_id: uuid.UUID = Depends(get_tenant_id),
    ator: Usuario = Depends(exigir(Permissao.CIDADAO_EDITAR)),
    db: AsyncSession = Depends(get_db),
):
    """B.1-001 — baixa lógica com histórico."""
    return _contato(
        await cidadao_detalhes.baixar_contato(
            db, tenant_id=tenant_id, cidadao_id=cidadao_id,
            contato_id=contato_id, dados=corpo, ator=ator,
            cliente=dados_do_cliente(request),
        )
    )


# ── Endereços ──────────────────────────────────────────────────────────────


@router.get("/{cidadao_id}/enderecos", response_model=list[EnderecoOut])
async def listar_enderecos(
    cidadao_id: uuid.UUID,
    request: Request,
    tenant_id: uuid.UUID = Depends(get_tenant_id),
    usuario: Usuario = Depends(exigir(Permissao.CIDADAO_LER)),
    db: AsyncSession = Depends(get_db),
):
    """B.1-001, B.1-004 — cadastro do cidadão."""
    registros = await cidadao_detalhes.listar_enderecos(db, tenant_id, cidadao_id)
    await _auditar(db, request, usuario, recurso="cidadao_endereco", recurso_id=cidadao_id)
    return [EnderecoOut.model_validate(item) for item in registros]


@router.post("/{cidadao_id}/enderecos", response_model=EnderecoOut, status_code=201)
async def criar_endereco(
    cidadao_id: uuid.UUID,
    corpo: EnderecoCreate,
    request: Request,
    response: Response,
    tenant_id: uuid.UUID = Depends(get_tenant_id),
    ator: Usuario = Depends(exigir(Permissao.CIDADAO_EDITAR)),
    db: AsyncSession = Depends(get_db),
):
    """B.1-001, B.1-004 — cadastro do cidadão."""
    chave, request_hash, cache = await cache_idempotencia(
        request, db, tenant_id, corpo.model_dump(mode="json")
    )
    if cache is not None:
        return resposta_cache(cache)
    registro = await cidadao_detalhes.criar_endereco(
        db, tenant_id=tenant_id, cidadao_id=cidadao_id, dados=corpo,
        ator=ator, cliente=dados_do_cliente(request),
    )
    saida = EnderecoOut.model_validate(registro)
    response.headers["ETag"] = f'"{registro.versao}"'
    await gravar_idempotencia(
        db, tenant_id, chave, request, request_hash, 201,
        jsonable_encoder(saida), ator,
    )
    return saida


@router.post("/{cidadao_id}/enderecos/{endereco_id}/baixar", response_model=EnderecoOut)
async def baixar_endereco(
    cidadao_id: uuid.UUID,
    endereco_id: uuid.UUID,
    corpo: BaixaCidadaoRequest,
    request: Request,
    tenant_id: uuid.UUID = Depends(get_tenant_id),
    ator: Usuario = Depends(exigir(Permissao.CIDADAO_EDITAR)),
    db: AsyncSession = Depends(get_db),
):
    """B.1-001 — baixa lógica com histórico."""
    return EnderecoOut.model_validate(
        await cidadao_detalhes.baixar_endereco(
            db, tenant_id=tenant_id, cidadao_id=cidadao_id,
            endereco_id=endereco_id, dados=corpo, ator=ator,
            cliente=dados_do_cliente(request),
        )
    )


# ── Planos de saúde ────────────────────────────────────────────────────────


@router.get("/{cidadao_id}/planos", response_model=list[PlanoSaudeOut])
async def listar_planos(
    cidadao_id: uuid.UUID,
    request: Request,
    tenant_id: uuid.UUID = Depends(get_tenant_id),
    usuario: Usuario = Depends(exigir(Permissao.CIDADAO_LER)),
    db: AsyncSession = Depends(get_db),
):
    """B.1-008 — planos e vínculos assistenciais."""
    registros = await cidadao_detalhes.listar_planos(db, tenant_id, cidadao_id)
    await _auditar(db, request, usuario, recurso="plano_saude_vinculo", recurso_id=cidadao_id)
    return [_plano(item) for item in registros]


@router.post("/{cidadao_id}/planos", response_model=PlanoSaudeOut, status_code=201)
async def criar_plano(
    cidadao_id: uuid.UUID,
    corpo: PlanoSaudeCreate,
    request: Request,
    response: Response,
    tenant_id: uuid.UUID = Depends(get_tenant_id),
    ator: Usuario = Depends(exigir(Permissao.CIDADAO_EDITAR)),
    db: AsyncSession = Depends(get_db),
):
    """B.1-001, B.1-004 — cadastro do cidadão."""
    chave, request_hash, cache = await cache_idempotencia(
        request, db, tenant_id, corpo.model_dump(mode="json")
    )
    if cache is not None:
        return resposta_cache(cache)
    registro = await cidadao_detalhes.criar_plano(
        db, tenant_id=tenant_id, cidadao_id=cidadao_id, dados=corpo,
        ator=ator, cliente=dados_do_cliente(request),
    )
    saida = _plano(registro)
    response.headers["ETag"] = f'"{registro.versao}"'
    await gravar_idempotencia(
        db, tenant_id, chave, request, request_hash, 201,
        jsonable_encoder(saida), ator,
    )
    return saida


@router.post("/{cidadao_id}/planos/{plano_id}/baixar", response_model=PlanoSaudeOut)
async def baixar_plano(
    cidadao_id: uuid.UUID,
    plano_id: uuid.UUID,
    corpo: BaixaCidadaoRequest,
    request: Request,
    tenant_id: uuid.UUID = Depends(get_tenant_id),
    ator: Usuario = Depends(exigir(Permissao.CIDADAO_EDITAR)),
    db: AsyncSession = Depends(get_db),
):
    """B.1-001 — baixa lógica com histórico."""
    return _plano(
        await cidadao_detalhes.baixar_plano(
            db, tenant_id=tenant_id, cidadao_id=cidadao_id,
            plano_id=plano_id, dados=corpo, ator=ator,
            cliente=dados_do_cliente(request),
        )
    )


# ── Alergias / condições ───────────────────────────────────────────────────


@router.get("/{cidadao_id}/alergias", response_model=list[AlergiaOut])
async def listar_alergias(
    cidadao_id: uuid.UUID,
    request: Request,
    tenant_id: uuid.UUID = Depends(get_tenant_id),
    usuario: Usuario = Depends(exigir(Permissao.CIDADAO_LER)),
    db: AsyncSession = Depends(get_db),
):
    """B.1-006, B.6-015 — alergias."""
    registros = await cidadao_detalhes.listar_alergias(db, tenant_id, cidadao_id)
    await _auditar(db, request, usuario, recurso="cidadao_alergia", recurso_id=cidadao_id)
    return [AlergiaOut.model_validate(item) for item in registros]


@router.post("/{cidadao_id}/alergias", response_model=AlergiaOut, status_code=201)
async def criar_alergia(
    cidadao_id: uuid.UUID,
    corpo: AlergiaCreate,
    request: Request,
    response: Response,
    tenant_id: uuid.UUID = Depends(get_tenant_id),
    ator: Usuario = Depends(exigir_alguma(Permissao.CIDADAO_EDITAR, Permissao.PRONTUARIO_EDITAR)),
    db: AsyncSession = Depends(get_db),
):
    """B.1-006, B.6-015 — alergias."""
    chave, request_hash, cache = await cache_idempotencia(
        request, db, tenant_id, corpo.model_dump(mode="json")
    )
    if cache is not None:
        return resposta_cache(cache)
    registro = await cidadao_detalhes.criar_alergia(
        db, tenant_id=tenant_id, cidadao_id=cidadao_id, dados=corpo,
        ator=ator, cliente=dados_do_cliente(request),
    )
    saida = AlergiaOut.model_validate(registro)
    response.headers["ETag"] = f'"{registro.versao}"'
    await gravar_idempotencia(
        db, tenant_id, chave, request, request_hash, 201,
        jsonable_encoder(saida), ator,
    )
    return saida


@router.post("/{cidadao_id}/alergias/{alergia_id}/baixar", response_model=AlergiaOut)
async def baixar_alergia(
    cidadao_id: uuid.UUID,
    alergia_id: uuid.UUID,
    corpo: BaixaCidadaoRequest,
    request: Request,
    tenant_id: uuid.UUID = Depends(get_tenant_id),
    ator: Usuario = Depends(exigir_alguma(Permissao.CIDADAO_EDITAR, Permissao.PRONTUARIO_EDITAR)),
    db: AsyncSession = Depends(get_db),
):
    """B.1-006, B.6-015 — alergias."""
    return AlergiaOut.model_validate(
        await cidadao_detalhes.baixar_alergia(
            db, tenant_id=tenant_id, cidadao_id=cidadao_id,
            alergia_id=alergia_id, dados=corpo, ator=ator,
            cliente=dados_do_cliente(request),
        )
    )


@router.get("/{cidadao_id}/condicoes", response_model=list[CondicaoOut])
async def listar_condicoes(
    cidadao_id: uuid.UUID,
    request: Request,
    tenant_id: uuid.UUID = Depends(get_tenant_id),
    usuario: Usuario = Depends(exigir(Permissao.CIDADAO_LER)),
    db: AsyncSession = Depends(get_db),
):
    """B.1-006, B.6-016 — condições/problemas."""
    registros = await cidadao_detalhes.listar_condicoes(db, tenant_id, cidadao_id)
    await _auditar(db, request, usuario, recurso="cidadao_condicao", recurso_id=cidadao_id)
    return [CondicaoOut.model_validate(item) for item in registros]


@router.post("/{cidadao_id}/condicoes", response_model=CondicaoOut, status_code=201)
async def criar_condicao(
    cidadao_id: uuid.UUID,
    corpo: CondicaoCreate,
    request: Request,
    response: Response,
    tenant_id: uuid.UUID = Depends(get_tenant_id),
    ator: Usuario = Depends(exigir_alguma(Permissao.CIDADAO_EDITAR, Permissao.PRONTUARIO_EDITAR)),
    db: AsyncSession = Depends(get_db),
):
    """B.1-006, B.6-016 — condições/problemas."""
    chave, request_hash, cache = await cache_idempotencia(
        request, db, tenant_id, corpo.model_dump(mode="json")
    )
    if cache is not None:
        return resposta_cache(cache)
    registro = await cidadao_detalhes.criar_condicao(
        db, tenant_id=tenant_id, cidadao_id=cidadao_id, dados=corpo,
        ator=ator, cliente=dados_do_cliente(request),
    )
    saida = CondicaoOut.model_validate(registro)
    response.headers["ETag"] = f'"{registro.versao}"'
    await gravar_idempotencia(
        db, tenant_id, chave, request, request_hash, 201,
        jsonable_encoder(saida), ator,
    )
    return saida


@router.post("/{cidadao_id}/condicoes/{condicao_id}/baixar", response_model=CondicaoOut)
async def baixar_condicao(
    cidadao_id: uuid.UUID,
    condicao_id: uuid.UUID,
    corpo: BaixaCidadaoRequest,
    request: Request,
    tenant_id: uuid.UUID = Depends(get_tenant_id),
    ator: Usuario = Depends(exigir_alguma(Permissao.CIDADAO_EDITAR, Permissao.PRONTUARIO_EDITAR)),
    db: AsyncSession = Depends(get_db),
):
    """B.1-006, B.6-016 — condições/problemas."""
    return CondicaoOut.model_validate(
        await cidadao_detalhes.baixar_condicao(
            db, tenant_id=tenant_id, cidadao_id=cidadao_id,
            condicao_id=condicao_id, dados=corpo, ator=ator,
            cliente=dados_do_cliente(request),
        )
    )


# ── Fotos ──────────────────────────────────────────────────────────────────


@router.get("/{cidadao_id}/fotos", response_model=list[FotoOut])
async def listar_fotos(
    cidadao_id: uuid.UUID,
    request: Request,
    tenant_id: uuid.UUID = Depends(get_tenant_id),
    usuario: Usuario = Depends(exigir(Permissao.CIDADAO_LER)),
    db: AsyncSession = Depends(get_db),
):
    """B.1-002, B.12-011 — foto do cidadão."""
    registros = await cidadao_fotos.listar_fotos(db, tenant_id, cidadao_id)
    await _auditar(db, request, usuario, recurso="cidadao_foto", recurso_id=cidadao_id)
    return [await _foto(item) for item in registros]


@router.post("/{cidadao_id}/fotos", response_model=FotoOut, status_code=201)
async def enviar_foto(
    cidadao_id: uuid.UUID,
    request: Request,
    response: Response,
    arquivo: UploadFile = File(...),
    principal: bool = Form(default=False),
    tenant_id: uuid.UUID = Depends(get_tenant_id),
    ator: Usuario = Depends(exigir(Permissao.CIDADAO_EDITAR)),
    db: AsyncSession = Depends(get_db),
):
    """B.1-002, B.12-011 — foto do cidadão."""
    conteudo = await arquivo.read()
    hash_conteudo = hash_bytes(conteudo)
    chave, request_hash, cache = await cache_idempotencia(
        request,
        db,
        tenant_id,
        {
            "arquivo_hash": hash_conteudo,
            "principal": principal,
            "cidadao_id": str(cidadao_id),
        },
    )
    if cache is not None:
        return resposta_cache(cache)
    registro = await cidadao_fotos.criar_foto(
        db,
        tenant_id=tenant_id,
        cidadao_id=cidadao_id,
        nome_arquivo=arquivo.filename or "",
        conteudo=conteudo,
        mime_declarado=arquivo.content_type,
        principal=principal,
        ator=ator,
        cliente=dados_do_cliente(request),
    )
    saida = await _foto(registro)
    response.headers["ETag"] = f'"{registro.versao}"'
    await gravar_idempotencia(
        db, tenant_id, chave, request, request_hash, 201,
        jsonable_encoder(saida), ator,
    )
    return saida


@router.post("/{cidadao_id}/fotos/{foto_id}/principal", response_model=FotoOut)
async def definir_foto_principal(
    cidadao_id: uuid.UUID,
    foto_id: uuid.UUID,
    request: Request,
    tenant_id: uuid.UUID = Depends(get_tenant_id),
    ator: Usuario = Depends(exigir(Permissao.CIDADAO_EDITAR)),
    db: AsyncSession = Depends(get_db),
):
    """B.1-002, B.12-011 — foto do cidadão."""
    registro = await cidadao_fotos.definir_principal(
        db, tenant_id=tenant_id, cidadao_id=cidadao_id, foto_id=foto_id,
        ator=ator, cliente=dados_do_cliente(request),
    )
    return await _foto(registro)


@router.post("/{cidadao_id}/fotos/{foto_id}/baixar", response_model=FotoOut)
async def baixar_foto(
    cidadao_id: uuid.UUID,
    foto_id: uuid.UUID,
    corpo: BaixaCidadaoRequest,
    request: Request,
    tenant_id: uuid.UUID = Depends(get_tenant_id),
    ator: Usuario = Depends(exigir(Permissao.CIDADAO_EDITAR)),
    db: AsyncSession = Depends(get_db),
):
    """B.1-002, B.12-011 — foto do cidadão."""
    registro = await cidadao_fotos.baixar_foto(
        db, tenant_id=tenant_id, cidadao_id=cidadao_id, foto_id=foto_id,
        motivo=corpo.motivo, data=corpo.data, ator=ator,
        cliente=dados_do_cliente(request),
    )
    return await _foto(registro)


@router.get("/{cidadao_id}/fotos/{foto_id}/conteudo")
async def baixar_conteudo_foto(
    cidadao_id: uuid.UUID,
    foto_id: uuid.UUID,
    request: Request,
    tenant_id: uuid.UUID = Depends(get_tenant_id),
    ator: Usuario = Depends(exigir(Permissao.CIDADAO_VER_DOCUMENTO)),
    db: AsyncSession = Depends(get_db),
):
    """B.1-002, B.12-011 — foto do cidadão."""
    conteudo, mime = await cidadao_fotos.obter_conteudo(
        db, tenant_id=tenant_id, cidadao_id=cidadao_id, foto_id=foto_id,
        ator=ator, cliente=dados_do_cliente(request),
    )
    return Response(
        content=conteudo,
        media_type=mime,
        headers={"Content-Disposition": "inline"},
    )
