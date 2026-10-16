import uuid

from fastapi import APIRouter, Depends, File, HTTPException, Response, UploadFile
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.auth import get_current_user, require_permission
from app.core.database import get_db
from app.core.permissions import Perm
from app.models.auth_models import User
from app.models.configuracoes import ConfiguracaoGovFrota
from app.schemas.schemas import ConfiguracaoResponse, ConfiguracaoUpdate
from app.services.auditoria import registrar_auditoria

router = APIRouter(prefix="/configuracoes", tags=["configurações"])


async def _get_config(db: AsyncSession, organization_id: uuid.UUID) -> ConfiguracaoGovFrota:
    result = await db.execute(
        select(ConfiguracaoGovFrota).where(
            ConfiguracaoGovFrota.organization_id == organization_id
        )
    )
    config = result.scalar_one_or_none()
    if config is None:
        config = ConfiguracaoGovFrota(organization_id=organization_id)
        db.add(config)
        await db.flush()
    return config


@router.get("", response_model=ConfiguracaoResponse)
async def obter(
    # Parâmetros do módulo (sem dados de secretaria): leitura liberada ao escopo.
    user: User = Depends(require_permission(Perm.VEHICLE_VIEW, escopo=True)),
    db: AsyncSession = Depends(get_db),
):
    return await _get_config(db, user.organization_id)


@router.patch("", response_model=ConfiguracaoResponse)
async def atualizar(
    body: ConfiguracaoUpdate,
    user: User = Depends(require_permission(Perm.CONFIG_MANAGE)),
    db: AsyncSession = Depends(get_db),
):
    config = await _get_config(db, user.organization_id)
    dados = body.model_dump(exclude_unset=True)
    if dados.get("tipo_organizacao") not in (None, "PUBLICO", "PRIVADO"):
        from fastapi import HTTPException

        raise HTTPException(status_code=422, detail="Tipo de organização inválido.")
    for campo in ("horario_abastecimento_inicio", "horario_abastecimento_fim", "pdf_titulo", "pdf_subtitulo",
                  "pdf_linha_extra", "pdf_rodape", "pdf_cor_primaria", "pdf_cor_secundaria"):
        if campo in dados and not dados[campo]:
            dados[campo] = None
    for campo, valor in dados.items():
        setattr(config, campo, valor)
    await registrar_auditoria(
        db,
        organization_id=user.organization_id,
        acao="configuracoes.atualizar",
        entidade="configuracoes",
        usuario_id=user.id,
        dados_novos=dados,
    )
    await db.commit()
    await db.refresh(config)
    return config


# ── Personalização do PDF dos relatórios ─────────────────────────────────────

TIPOS_LOGO = {"image/png", "image/jpeg"}


@router.put("/pdf-logo", response_model=ConfiguracaoResponse)
async def enviar_logo_pdf(
    arquivo: UploadFile = File(...),
    user: User = Depends(require_permission(Perm.CONFIG_MANAGE)),
    db: AsyncSession = Depends(get_db),
):
    """Logomarca do cabeçalho dos relatórios (PNG ou JPG, até 1 MB)."""
    if arquivo.content_type not in TIPOS_LOGO:
        raise HTTPException(status_code=422, detail="Envie a logomarca em PNG ou JPG.")
    conteudo = await arquivo.read(1024 * 1024 + 1)
    if len(conteudo) > 1024 * 1024:
        raise HTTPException(status_code=422, detail="A logomarca deve ter até 1 MB.")
    try:
        from PIL import Image

        Image.open(__import__("io").BytesIO(conteudo)).verify()
    except Exception:
        raise HTTPException(status_code=422, detail="Arquivo de imagem inválido.")
    config = await _get_config(db, user.organization_id)
    config.pdf_logo, config.pdf_logo_tipo = conteudo, arquivo.content_type
    await registrar_auditoria(db, organization_id=user.organization_id, acao="configuracoes.pdf_logo",
                              entidade="configuracoes", usuario_id=user.id, dados_novos={"tamanho": len(conteudo)})
    await db.commit()
    await db.refresh(config, attribute_names=["pdf_logo_tipo"])
    return config


@router.delete("/pdf-logo", response_model=ConfiguracaoResponse)
async def remover_logo_pdf(
    user: User = Depends(require_permission(Perm.CONFIG_MANAGE)),
    db: AsyncSession = Depends(get_db),
):
    config = await _get_config(db, user.organization_id)
    config.pdf_logo, config.pdf_logo_tipo = None, None
    await registrar_auditoria(db, organization_id=user.organization_id, acao="configuracoes.pdf_logo_removido",
                              entidade="configuracoes", usuario_id=user.id)
    await db.commit()
    await db.refresh(config, attribute_names=["pdf_logo_tipo"])
    return config


@router.get("/pdf-logo")
async def obter_logo_pdf(
    user: User = Depends(require_permission(Perm.CONFIG_MANAGE)),
    db: AsyncSession = Depends(get_db),
):
    from sqlalchemy.orm import undefer

    config = (
        await db.execute(
            select(ConfiguracaoGovFrota).options(undefer(ConfiguracaoGovFrota.pdf_logo))
            .where(ConfiguracaoGovFrota.organization_id == user.organization_id)
        )
    ).scalar_one_or_none()
    if config is None or not config.pdf_logo:
        raise HTTPException(status_code=404, detail="Sem logomarca.")
    return Response(content=config.pdf_logo, media_type=config.pdf_logo_tipo or "image/png",
                    headers={"Cache-Control": "no-store"})


@router.get("/pdf-exemplo")
async def pdf_exemplo(
    user: User = Depends(require_permission(Perm.CONFIG_MANAGE)),
    db: AsyncSession = Depends(get_db),
):
    """PDF de amostra com o cabeçalho e o rodapé configurados."""
    from app.services.exporters import RelatorioMeta, build_pdf, get_organizacao_meta

    nome, cnpj, logo = await get_organizacao_meta(db, user.organization_id)
    meta = RelatorioMeta(titulo="Relatório de exemplo", organizacao=nome, cnpj=cnpj, logo=logo,
                         periodo="01/01/2026 a 31/01/2026", filtros=["Este é um modelo para conferir o layout."])
    linhas = [["ABC1D23", "Toyota Hilux", "Saúde", 12, 480.5, 2950.4],
              ["EDU1A23", "Ônibus escolar", "Educação", 20, 1630.0, 9780.0],
              ["OBR2B34", "Caminhão basculante", "Obras", 15, 1210.75, 7264.5]]
    conteudo = build_pdf(meta, ["Placa", "Modelo", "Secretaria", "Abast.", "Litros", "Valor (R$)"], linhas,
                         usuario=user.name, currency_columns={5}, totais=["Total", "", "", 47, 3321.25, 19994.9])
    return Response(content=conteudo, media_type="application/pdf",
                    headers={"Content-Disposition": 'inline; filename="exemplo-relatorio.pdf"'})
