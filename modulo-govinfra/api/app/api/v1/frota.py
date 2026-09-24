"""Máquinas, veículos, categorias e habilitações de operadores (itens 27 a 29)."""

import uuid
from datetime import date

from fastapi import APIRouter, Depends, Query, Request, status
from sqlalchemy import func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.v1.deps import (
    Paginacao,
    buscar_da_organizacao,
    cliente,
    com_rotulo,
    nomes_de_usuarios,
    pagina_payload,
    renavam_visivel,
)
from app.core.auth import exigir, usuario_pode
from app.core.database import get_db
from app.core.errors import AppError, Conflict
from app.core.permissoes import ROTULOS_PERFIL, P
from app.models.enums import (
    EQUIPAMENTO_NAO_AGENDAVEL,
    AcaoAuditoria,
    SituacaoEquipamento,
    SituacaoHabilitacao,
)
from app.models.frota import (
    CategoriaMaquina,
    Habilitacao,
    LeituraMedidor,
    Maquina,
    Veiculo,
)
from app.models.manutencao import PlanoManutencao
from app.models.organizacao import User
from app.schemas import frota as esquemas
from app.services import arquivos as servico_arquivos
from app.services import auditoria, configuracoes
from app.services import combustivel as servico_combustivel

router = APIRouter(tags=["Frota"])


# ─────────────────────────────────────────────────────────────────────────────
# Categorias
# ─────────────────────────────────────────────────────────────────────────────


@router.get("/categorias-maquina", summary="Categorias de máquina")
async def listar_categorias(
    db: AsyncSession = Depends(get_db),
    user: User = Depends(exigir(P.MAQUINAS_VISUALIZAR)),
):
    registros = (
        await db.execute(
            select(CategoriaMaquina)
            .where(CategoriaMaquina.organizacao_id == user.organizacao_id)
            .order_by(CategoriaMaquina.ordem, CategoriaMaquina.nome)
        )
    ).scalars().all()

    resposta = []
    for categoria in registros:
        quantidade = await db.scalar(
            select(func.count())
            .select_from(Maquina)
            .where(Maquina.categoria_id == categoria.id, Maquina.deleted_at.is_(None))
        ) or 0
        resposta.append(
            {
                "id": categoria.id,
                "chave": categoria.chave,
                "nome": categoria.nome,
                "descricao": categoria.descricao,
                "exige_cnh_categoria": categoria.exige_cnh_categoria,
                "exige_curso": categoria.exige_curso,
                "consumo_medio_litros_hora": categoria.consumo_medio_litros_hora,
                "ativo": categoria.ativo,
                "ordem": categoria.ordem,
                "maquinas": quantidade,
            }
        )
    return resposta


@router.post(
    "/categorias-maquina", status_code=status.HTTP_201_CREATED, summary="Cadastrar categoria"
)
async def criar_categoria(
    dados: esquemas.CategoriaMaquinaEntrada,
    request: Request,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(exigir(P.CONFIGURACOES_EDITAR)),
):
    existente = await db.scalar(
        select(CategoriaMaquina).where(
            CategoriaMaquina.organizacao_id == user.organizacao_id,
            CategoriaMaquina.chave == dados.chave,
        )
    )
    if existente is not None:
        raise Conflict("Já existe uma categoria com esta chave.")
    categoria = CategoriaMaquina(
        organizacao_id=user.organizacao_id, created_by_id=user.id, **dados.model_dump()
    )
    db.add(categoria)
    await db.flush()
    await auditoria.registrar(
        db,
        acao=AcaoAuditoria.ALTERAR_CONFIGURACAO,
        usuario=user,
        entidade="categoria_maquina",
        entidade_id=categoria.id,
        entidade_descricao=categoria.nome,
        cliente=cliente(request),
    )
    await db.commit()
    return {"id": categoria.id, "mensagem": "Categoria cadastrada."}


# ─────────────────────────────────────────────────────────────────────────────
# Máquinas
# ─────────────────────────────────────────────────────────────────────────────


def _resumo_maquina(maquina: Maquina) -> dict:
    return {
        "id": maquina.id,
        "codigo": maquina.codigo,
        "nome": maquina.nome,
        "categoria": maquina.categoria.nome if maquina.categoria else None,
        "categoria_id": maquina.categoria_id,
        "marca": maquina.marca,
        "modelo": maquina.modelo,
        "situacao": maquina.situacao,
        "situacao_rotulo": com_rotulo(maquina.situacao),
        "horimetro_atual": maquina.horimetro_atual,
        "localizacao_atual": maquina.localizacao_atual,
        "latitude": maquina.latitude,
        "longitude": maquina.longitude,
    }


@router.get("/maquinas", summary="Listar máquinas e equipamentos")
async def listar_maquinas(
    termo: str | None = None,
    categoria_id: uuid.UUID | None = None,
    situacao: str | None = None,
    disponiveis: bool = False,
    paginacao: Paginacao = Depends(),
    db: AsyncSession = Depends(get_db),
    user: User = Depends(exigir(P.MAQUINAS_VISUALIZAR)),
):
    condicoes = [Maquina.organizacao_id == user.organizacao_id, Maquina.deleted_at.is_(None)]
    if termo:
        condicoes.append(
            or_(
                Maquina.codigo.ilike(f"%{termo}%"),
                Maquina.nome.ilike(f"%{termo}%"),
                Maquina.patrimonio.ilike(f"%{termo}%"),
            )
        )
    if categoria_id:
        condicoes.append(Maquina.categoria_id == categoria_id)
    if situacao:
        condicoes.append(Maquina.situacao == situacao)
    if disponiveis:
        condicoes.append(Maquina.situacao.notin_(EQUIPAMENTO_NAO_AGENDAVEL))

    consulta = select(Maquina).where(*condicoes)
    total = await db.scalar(select(func.count()).select_from(consulta.subquery())) or 0
    registros = (
        await db.execute(
            consulta.order_by(Maquina.codigo).offset(paginacao.offset).limit(paginacao.por_pagina)
        )
    ).scalars().all()
    return pagina_payload([_resumo_maquina(m) for m in registros], total, paginacao)


@router.post("/maquinas", status_code=status.HTTP_201_CREATED, summary="Cadastrar máquina")
async def criar_maquina(
    dados: esquemas.MaquinaEntrada,
    request: Request,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(exigir(P.MAQUINAS_GERENCIAR)),
):
    existente = await db.scalar(
        select(Maquina).where(
            Maquina.organizacao_id == user.organizacao_id,
            Maquina.codigo == dados.codigo,
            Maquina.deleted_at.is_(None),
        )
    )
    if existente is not None:
        raise Conflict(f"Já existe uma máquina com o código {dados.codigo}.")

    valores = dados.model_dump(exclude={"justificativa_medidor"})
    horimetro = valores.pop("horimetro_atual", None) or 0
    maquina = Maquina(
        organizacao_id=user.organizacao_id,
        created_by_id=user.id,
        updated_by_id=user.id,
        situacao=SituacaoEquipamento.DISPONIVEL.value,
        horimetro_atual=horimetro,
        **valores,
    )
    db.add(maquina)
    await db.flush()

    if horimetro:
        db.add(
            LeituraMedidor(
                maquina_id=maquina.id,
                tipo="horimetro",
                valor_anterior=0,
                valor=horimetro,
                origem="cadastro",
                created_by_id=user.id,
            )
        )

    await auditoria.registrar(
        db,
        acao=AcaoAuditoria.CRIAR,
        usuario=user,
        entidade="maquina",
        entidade_id=maquina.id,
        entidade_descricao=f"{maquina.codigo} — {maquina.nome}",
        dados_depois=auditoria.instantaneo(maquina),
        cliente=cliente(request),
    )
    await db.commit()
    return {"id": maquina.id, "mensagem": "Máquina cadastrada."}


@router.get("/maquinas/{maquina_id}", summary="Detalhar máquina")
async def detalhar_maquina(
    maquina_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(exigir(P.MAQUINAS_VISUALIZAR)),
):
    maquina = await buscar_da_organizacao(db, Maquina, maquina_id, user, "Máquina não encontrada.")
    plano = await db.scalar(
        select(PlanoManutencao)
        .where(
            PlanoManutencao.maquina_id == maquina.id,
            PlanoManutencao.ativo.is_(True),
            PlanoManutencao.deleted_at.is_(None),
        )
        .order_by(PlanoManutencao.proxima_data.nulls_last())
        .limit(1)
    )

    base = _resumo_maquina(maquina)
    base.update(
        {
            "patrimonio": maquina.patrimonio,
            "tipo": maquina.tipo,
            "ano": maquina.ano,
            "placa": maquina.placa,
            "chassi": maquina.chassi,
            "numero_serie": maquina.numero_serie,
            "capacidade": maquina.capacidade,
            "tipo_combustivel": maquina.tipo_combustivel,
            "capacidade_tanque_litros": maquina.capacidade_tanque_litros,
            "consumo_medio_litros_hora": maquina.consumo_medio_litros_hora,
            "consumo_apurado_litros_hora": await servico_combustivel.consumo_medio_maquina(
                db, maquina.id
            ),
            "data_aquisicao": maquina.data_aquisicao,
            "valor_aquisicao": maquina.valor_aquisicao,
            "observacoes": maquina.observacoes,
            "data_baixa": maquina.data_baixa,
            "motivo_baixa": maquina.motivo_baixa,
            "created_at": maquina.created_at,
            "row_version": maquina.row_version,
            "manutencao_prevista": plano.proxima_data if plano else None,
            "arquivos": [
                servico_arquivos.resumo(a)
                for a in await servico_arquivos.listar(db, "maquina", maquina.id)
            ],
        }
    )
    return base


@router.put("/maquinas/{maquina_id}", summary="Atualizar máquina")
async def atualizar_maquina(
    maquina_id: uuid.UUID,
    dados: esquemas.MaquinaEntrada,
    request: Request,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(exigir(P.MAQUINAS_GERENCIAR)),
):
    maquina = await buscar_da_organizacao(db, Maquina, maquina_id, user, "Máquina não encontrada.")
    antes = auditoria.instantaneo(maquina)

    alteracoes = dados.model_dump(exclude_unset=True, exclude={"justificativa_medidor"})
    horimetro = alteracoes.pop("horimetro_atual", None)

    for campo, valor in alteracoes.items():
        setattr(maquina, campo, valor)

    # O horímetro nunca é gravado direto: passa pelo serviço, que valida o
    # retrocesso e registra a leitura no histórico.
    if horimetro is not None and abs(horimetro - (maquina.horimetro_atual or 0)) > 0.001:
        anterior = maquina.horimetro_atual
        await servico_combustivel.registrar_leitura_medidor(
            db,
            maquina=maquina,
            veiculo=None,
            valor=horimetro,
            origem="cadastro",
            usuario_id=user.id,
            pode_corrigir=usuario_pode(user, P.MEDIDORES_CORRIGIR),
            justificativa=dados.justificativa_medidor,
        )
        await auditoria.registrar(
            db,
            acao=AcaoAuditoria.ALTERAR_HORIMETRO,
            usuario=user,
            entidade="maquina",
            entidade_id=maquina.id,
            entidade_descricao=maquina.codigo,
            justificativa=dados.justificativa_medidor,
            dados_antes={"horimetro": anterior},
            dados_depois={"horimetro": horimetro},
            cliente=cliente(request),
        )

    maquina.updated_by_id = user.id
    maquina.row_version = (maquina.row_version or 1) + 1

    await auditoria.registrar(
        db,
        acao=AcaoAuditoria.ALTERAR,
        usuario=user,
        entidade="maquina",
        entidade_id=maquina.id,
        entidade_descricao=maquina.codigo,
        dados_antes=antes,
        dados_depois=auditoria.instantaneo(maquina),
        cliente=cliente(request),
    )
    await db.commit()
    return {"mensagem": "Máquina atualizada."}


@router.post("/maquinas/{maquina_id}/situacao", summary="Alterar situação da máquina")
async def situacao_maquina(
    maquina_id: uuid.UUID,
    dados: esquemas.MudancaSituacaoEquipamento,
    request: Request,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(exigir(P.MAQUINAS_GERENCIAR)),
):
    maquina = await buscar_da_organizacao(db, Maquina, maquina_id, user, "Máquina não encontrada.")
    if dados.situacao not in SituacaoEquipamento.valores():
        raise AppError("Situação inválida.", 422, "situacao_invalida")

    antes = maquina.situacao
    maquina.situacao = dados.situacao
    maquina.updated_by_id = user.id
    await auditoria.registrar(
        db,
        acao=AcaoAuditoria.ALTERAR,
        usuario=user,
        entidade="maquina",
        entidade_id=maquina.id,
        entidade_descricao=maquina.codigo,
        justificativa=dados.motivo,
        dados_antes={"situacao": antes},
        dados_depois={"situacao": dados.situacao},
        cliente=cliente(request),
    )
    await db.commit()
    return {"mensagem": f"Máquina agora está como '{com_rotulo(dados.situacao)}'."}


@router.get("/maquinas/{maquina_id}/medidores", summary="Histórico de horímetro")
async def historico_horimetro(
    maquina_id: uuid.UUID,
    paginacao: Paginacao = Depends(),
    db: AsyncSession = Depends(get_db),
    user: User = Depends(exigir(P.MAQUINAS_VISUALIZAR)),
):
    await buscar_da_organizacao(db, Maquina, maquina_id, user, "Máquina não encontrada.")
    consulta = select(LeituraMedidor).where(LeituraMedidor.maquina_id == maquina_id)
    total = await db.scalar(select(func.count()).select_from(consulta.subquery())) or 0
    registros = (
        await db.execute(
            consulta.order_by(LeituraMedidor.created_at.desc())
            .offset(paginacao.offset)
            .limit(paginacao.por_pagina)
        )
    ).scalars().all()
    nomes = await nomes_de_usuarios(db, [r.created_by_id for r in registros])
    itens = [
        {
            "id": r.id,
            "tipo": r.tipo,
            "valor_anterior": r.valor_anterior,
            "valor": r.valor,
            "origem": r.origem,
            "correcao": r.correcao,
            "justificativa": r.justificativa,
            "created_at": r.created_at,
            "usuario": nomes.get(r.created_by_id),
        }
        for r in registros
    ]
    return pagina_payload(itens, total, paginacao)


# ─────────────────────────────────────────────────────────────────────────────
# Veículos
# ─────────────────────────────────────────────────────────────────────────────


def _resumo_veiculo(veiculo: Veiculo) -> dict:
    return {
        "id": veiculo.id,
        "codigo": veiculo.codigo,
        "placa": veiculo.placa,
        "nome": veiculo.nome,
        "tipo": veiculo.tipo,
        "situacao": veiculo.situacao,
        "situacao_rotulo": com_rotulo(veiculo.situacao),
        "odometro_atual": veiculo.odometro_atual,
        "transporta_cacamba": veiculo.transporta_cacamba,
        "latitude": veiculo.latitude,
        "longitude": veiculo.longitude,
    }


@router.get("/veiculos", summary="Listar caminhões e veículos")
async def listar_veiculos(
    termo: str | None = None,
    tipo: str | None = None,
    situacao: str | None = None,
    transporta_cacamba: bool | None = None,
    disponiveis: bool = False,
    paginacao: Paginacao = Depends(),
    db: AsyncSession = Depends(get_db),
    user: User = Depends(exigir(P.VEICULOS_VISUALIZAR)),
):
    condicoes = [Veiculo.organizacao_id == user.organizacao_id, Veiculo.deleted_at.is_(None)]
    if termo:
        condicoes.append(
            or_(
                Veiculo.codigo.ilike(f"%{termo}%"),
                Veiculo.nome.ilike(f"%{termo}%"),
                Veiculo.placa.ilike(f"%{termo}%"),
            )
        )
    if tipo:
        condicoes.append(Veiculo.tipo == tipo)
    if situacao:
        condicoes.append(Veiculo.situacao == situacao)
    if transporta_cacamba is not None:
        condicoes.append(Veiculo.transporta_cacamba.is_(transporta_cacamba))
    if disponiveis:
        condicoes.append(Veiculo.situacao.notin_(EQUIPAMENTO_NAO_AGENDAVEL))

    consulta = select(Veiculo).where(*condicoes)
    total = await db.scalar(select(func.count()).select_from(consulta.subquery())) or 0
    registros = (
        await db.execute(
            consulta.order_by(Veiculo.codigo).offset(paginacao.offset).limit(paginacao.por_pagina)
        )
    ).scalars().all()
    return pagina_payload([_resumo_veiculo(v) for v in registros], total, paginacao)


@router.post("/veiculos", status_code=status.HTTP_201_CREATED, summary="Cadastrar veículo")
async def criar_veiculo(
    dados: esquemas.VeiculoEntrada,
    request: Request,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(exigir(P.VEICULOS_GERENCIAR)),
):
    existente = await db.scalar(
        select(Veiculo).where(
            Veiculo.organizacao_id == user.organizacao_id,
            or_(Veiculo.codigo == dados.codigo, Veiculo.placa == dados.placa),
            Veiculo.deleted_at.is_(None),
        )
    )
    if existente is not None:
        raise Conflict("Já existe um veículo com este código ou placa.")

    valores = dados.model_dump(exclude={"justificativa_medidor"})
    odometro = valores.pop("odometro_atual", None) or 0
    veiculo = Veiculo(
        organizacao_id=user.organizacao_id,
        created_by_id=user.id,
        updated_by_id=user.id,
        situacao=SituacaoEquipamento.DISPONIVEL.value,
        odometro_atual=odometro,
        **valores,
    )
    db.add(veiculo)
    await db.flush()

    if odometro:
        db.add(
            LeituraMedidor(
                veiculo_id=veiculo.id,
                tipo="odometro",
                valor_anterior=0,
                valor=odometro,
                origem="cadastro",
                created_by_id=user.id,
            )
        )

    await auditoria.registrar(
        db,
        acao=AcaoAuditoria.CRIAR,
        usuario=user,
        entidade="veiculo",
        entidade_id=veiculo.id,
        entidade_descricao=f"{veiculo.placa} — {veiculo.nome}",
        dados_depois=auditoria.instantaneo(veiculo),
        cliente=cliente(request),
    )
    await db.commit()
    return {"id": veiculo.id, "mensagem": "Veículo cadastrado."}


@router.get("/veiculos/{veiculo_id}", summary="Detalhar veículo")
async def detalhar_veiculo(
    veiculo_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(exigir(P.VEICULOS_VISUALIZAR)),
):
    veiculo = await buscar_da_organizacao(db, Veiculo, veiculo_id, user, "Veículo não encontrado.")
    renavam, mascarado = renavam_visivel(user, veiculo.renavam)

    limite_dias = int(await configuracoes.obter(db, user.organizacao_id, "geral_alerta_documento_dias") or 30)
    hoje = date.today()
    vencendo = []
    for rotulo_doc, vencimento in (
        ("Licenciamento", veiculo.licenciamento_ate),
        ("Seguro", veiculo.seguro_ate),
    ):
        if vencimento is None:
            continue
        dias = (vencimento - hoje).days
        if dias <= limite_dias:
            vencendo.append(
                {
                    "documento": rotulo_doc,
                    "vencimento": vencimento,
                    "dias": dias,
                    "vencido": dias < 0,
                }
            )

    base = _resumo_veiculo(veiculo)
    base.update(
        {
            "patrimonio": veiculo.patrimonio,
            "renavam": renavam,
            "renavam_mascarado": mascarado,
            "marca": veiculo.marca,
            "modelo": veiculo.modelo,
            "ano": veiculo.ano,
            "tipo_carroceria": veiculo.tipo_carroceria,
            "capacidade": veiculo.capacidade,
            "tipo_combustivel": veiculo.tipo_combustivel,
            "capacidade_tanque_litros": veiculo.capacidade_tanque_litros,
            "consumo_medio_km_litro": veiculo.consumo_medio_km_litro,
            "consumo_apurado_km_litro": await servico_combustivel.consumo_medio_veiculo(db, veiculo.id),
            "data_aquisicao": veiculo.data_aquisicao,
            "valor_aquisicao": veiculo.valor_aquisicao,
            "licenciamento_ate": veiculo.licenciamento_ate,
            "seguro_ate": veiculo.seguro_ate,
            "vencimentos": veiculo.vencimentos or {},
            "localizacao_atual": veiculo.localizacao_atual,
            "observacoes": veiculo.observacoes,
            "data_baixa": veiculo.data_baixa,
            "created_at": veiculo.created_at,
            "row_version": veiculo.row_version,
            "documentos_vencendo": vencendo,
            "arquivos": [
                servico_arquivos.resumo(a)
                for a in await servico_arquivos.listar(db, "veiculo", veiculo.id)
            ],
        }
    )
    return base


@router.put("/veiculos/{veiculo_id}", summary="Atualizar veículo")
async def atualizar_veiculo(
    veiculo_id: uuid.UUID,
    dados: esquemas.VeiculoEntrada,
    request: Request,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(exigir(P.VEICULOS_GERENCIAR)),
):
    veiculo = await buscar_da_organizacao(db, Veiculo, veiculo_id, user, "Veículo não encontrado.")
    antes = auditoria.instantaneo(veiculo)

    alteracoes = dados.model_dump(exclude_unset=True, exclude={"justificativa_medidor"})
    odometro = alteracoes.pop("odometro_atual", None)
    for campo, valor in alteracoes.items():
        setattr(veiculo, campo, valor)

    if odometro is not None and abs(odometro - (veiculo.odometro_atual or 0)) > 0.001:
        anterior = veiculo.odometro_atual
        await servico_combustivel.registrar_leitura_medidor(
            db,
            maquina=None,
            veiculo=veiculo,
            valor=odometro,
            origem="cadastro",
            usuario_id=user.id,
            pode_corrigir=usuario_pode(user, P.MEDIDORES_CORRIGIR),
            justificativa=dados.justificativa_medidor,
        )
        await auditoria.registrar(
            db,
            acao=AcaoAuditoria.ALTERAR_QUILOMETRAGEM,
            usuario=user,
            entidade="veiculo",
            entidade_id=veiculo.id,
            entidade_descricao=veiculo.placa,
            justificativa=dados.justificativa_medidor,
            dados_antes={"odometro": anterior},
            dados_depois={"odometro": odometro},
            cliente=cliente(request),
        )

    veiculo.updated_by_id = user.id
    veiculo.row_version = (veiculo.row_version or 1) + 1
    await auditoria.registrar(
        db,
        acao=AcaoAuditoria.ALTERAR,
        usuario=user,
        entidade="veiculo",
        entidade_id=veiculo.id,
        entidade_descricao=veiculo.placa,
        dados_antes=antes,
        dados_depois=auditoria.instantaneo(veiculo),
        cliente=cliente(request),
    )
    await db.commit()
    return {"mensagem": "Veículo atualizado."}


@router.post("/veiculos/{veiculo_id}/situacao", summary="Alterar situação do veículo")
async def situacao_veiculo(
    veiculo_id: uuid.UUID,
    dados: esquemas.MudancaSituacaoEquipamento,
    request: Request,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(exigir(P.VEICULOS_GERENCIAR)),
):
    veiculo = await buscar_da_organizacao(db, Veiculo, veiculo_id, user, "Veículo não encontrado.")
    if dados.situacao not in SituacaoEquipamento.valores():
        raise AppError("Situação inválida.", 422, "situacao_invalida")
    antes = veiculo.situacao
    veiculo.situacao = dados.situacao
    veiculo.updated_by_id = user.id
    await auditoria.registrar(
        db,
        acao=AcaoAuditoria.ALTERAR,
        usuario=user,
        entidade="veiculo",
        entidade_id=veiculo.id,
        entidade_descricao=veiculo.placa,
        justificativa=dados.motivo,
        dados_antes={"situacao": antes},
        dados_depois={"situacao": dados.situacao},
        cliente=cliente(request),
    )
    await db.commit()
    return {"mensagem": f"Veículo agora está como '{com_rotulo(dados.situacao)}'."}


# ─────────────────────────────────────────────────────────────────────────────
# Operadores e motoristas (item 29)
# ─────────────────────────────────────────────────────────────────────────────


def _alertas_habilitacao(habilitacao: Habilitacao, limite_dias: int) -> tuple[list[str], int | None]:
    alertas: list[str] = []
    dias = None
    hoje = date.today()
    if habilitacao.cnh_validade:
        dias = (habilitacao.cnh_validade - hoje).days
        if dias < 0:
            alertas.append(f"CNH vencida em {habilitacao.cnh_validade.strftime('%d/%m/%Y')}.")
        elif dias <= limite_dias:
            alertas.append(f"CNH vence em {dias} dia(s).")
    for curso in habilitacao.cursos or []:
        validade = curso.get("validade")
        if not validade:
            continue
        try:
            data_validade = date.fromisoformat(str(validade)[:10])
        except ValueError:
            continue
        restante = (data_validade - hoje).days
        if restante < 0:
            alertas.append(f"Curso {curso.get('nome', 'sem nome')} vencido.")
        elif restante <= limite_dias:
            alertas.append(f"Curso {curso.get('nome', 'sem nome')} vence em {restante} dia(s).")
    if habilitacao.afastado_em(hoje):
        alertas.append("Servidor afastado na data de hoje.")
    if habilitacao.situacao != SituacaoHabilitacao.ATIVA.value:
        alertas.append(f"Habilitação com situação '{habilitacao.situacao}'.")
    return alertas, dias


@router.get("/operadores", summary="Listar operadores e motoristas")
async def listar_operadores(
    apenas_operadores: bool = False,
    apenas_motoristas: bool = False,
    com_alerta: bool = Query(False, description="Somente quem tem pendência de habilitação"),
    paginacao: Paginacao = Depends(),
    db: AsyncSession = Depends(get_db),
    user: User = Depends(exigir(P.OPERADORES_VISUALIZAR)),
):
    condicoes = [
        Habilitacao.organizacao_id == user.organizacao_id,
        Habilitacao.deleted_at.is_(None),
    ]
    if apenas_operadores:
        condicoes.append(Habilitacao.opera_maquinas.is_(True))
    if apenas_motoristas:
        condicoes.append(Habilitacao.dirige_veiculos.is_(True))

    consulta = select(Habilitacao).where(*condicoes)
    total = await db.scalar(select(func.count()).select_from(consulta.subquery())) or 0
    registros = list(
        (
            await db.execute(
                consulta.order_by(Habilitacao.created_at).offset(paginacao.offset).limit(paginacao.por_pagina)
            )
        )
        .scalars()
        .all()
    )
    limite = int(await configuracoes.obter(db, user.organizacao_id, "geral_alerta_documento_dias") or 30)
    nomes = await nomes_de_usuarios(db, [h.user_id for h in registros])

    itens = []
    for habilitacao in registros:
        alertas, dias = _alertas_habilitacao(habilitacao, limite)
        if com_alerta and not alertas:
            continue
        servidor = await db.get(User, habilitacao.user_id)
        itens.append(
            {
                "id": habilitacao.id,
                "user_id": habilitacao.user_id,
                "nome": nomes.get(habilitacao.user_id),
                "matricula": servidor.matricula if servidor else None,
                "email": servidor.email if servidor else None,
                "perfil": ROTULOS_PERFIL.get(servidor.perfil, servidor.perfil) if servidor else None,
                "funcao": habilitacao.funcao,
                "cnh_categoria": habilitacao.cnh_categoria,
                "cnh_validade": habilitacao.cnh_validade,
                "cnh_vencida": habilitacao.cnh_vencida(),
                "dias_para_vencer_cnh": dias,
                "opera_maquinas": habilitacao.opera_maquinas,
                "dirige_veiculos": habilitacao.dirige_veiculos,
                "categorias_autorizadas": habilitacao.categorias_autorizadas or [],
                "maquinas_autorizadas": habilitacao.maquinas_autorizadas or [],
                "veiculos_autorizados": habilitacao.veiculos_autorizados or [],
                "cursos": habilitacao.cursos or [],
                "afastamentos": habilitacao.afastamentos or [],
                "jornada_inicio": habilitacao.jornada_inicio,
                "jornada_fim": habilitacao.jornada_fim,
                "jornada_maxima_horas": habilitacao.jornada_maxima_horas,
                "escala": habilitacao.escala,
                "situacao": habilitacao.situacao,
                "observacoes": habilitacao.observacoes,
                "alertas": alertas,
                "created_at": habilitacao.created_at,
            }
        )
    return pagina_payload(itens, total if not com_alerta else len(itens), paginacao)


@router.get("/operadores/servidores", summary="Servidores disponíveis para habilitar")
async def servidores_disponiveis(
    db: AsyncSession = Depends(get_db),
    user: User = Depends(exigir(P.OPERADORES_VISUALIZAR)),
):
    """Usuários do módulo que ainda não têm complemento de habilitação.

    Reaproveita o cadastro de servidores já provisionado pela plataforma — o
    GovInfra não recria pessoal.
    """
    ja_habilitados = set(
        (
            await db.execute(
                select(Habilitacao.user_id).where(
                    Habilitacao.organizacao_id == user.organizacao_id,
                    Habilitacao.deleted_at.is_(None),
                )
            )
        )
        .scalars()
        .all()
    )
    servidores = list(
        (
            await db.execute(
                select(User).where(
                    User.organizacao_id == user.organizacao_id,
                    User.deleted_at.is_(None),
                    User.ativo.is_(True),
                )
            )
        )
        .scalars()
        .all()
    )
    return [
        {
            "id": s.id,
            "nome": s.nome,
            "email": s.email,
            "matricula": s.matricula,
            "perfil": s.perfil,
            "perfil_rotulo": ROTULOS_PERFIL.get(s.perfil, s.perfil),
            "ja_habilitado": s.id in ja_habilitados,
        }
        for s in servidores
    ]


@router.post("/operadores", status_code=status.HTTP_201_CREATED, summary="Cadastrar habilitação")
async def criar_habilitacao(
    dados: esquemas.HabilitacaoEntrada,
    request: Request,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(exigir(P.OPERADORES_GERENCIAR)),
):
    servidor = await buscar_da_organizacao(db, User, dados.user_id, user, "Servidor não encontrado.")
    existente = await db.scalar(
        select(Habilitacao).where(
            Habilitacao.organizacao_id == user.organizacao_id,
            Habilitacao.user_id == servidor.id,
            Habilitacao.deleted_at.is_(None),
        )
    )
    if existente is not None:
        raise Conflict(f"{servidor.nome} já possui cadastro de habilitação.")

    habilitacao = Habilitacao(
        organizacao_id=user.organizacao_id, created_by_id=user.id, updated_by_id=user.id,
        **dados.model_dump(),
    )
    db.add(habilitacao)
    await db.flush()
    await auditoria.registrar(
        db,
        acao=AcaoAuditoria.CRIAR,
        usuario=user,
        entidade="habilitacao",
        entidade_id=habilitacao.id,
        entidade_descricao=servidor.nome,
        dados_depois=auditoria.instantaneo(habilitacao),
        cliente=cliente(request),
    )
    await db.commit()
    return {"id": habilitacao.id, "mensagem": "Habilitação cadastrada."}


@router.put("/operadores/{habilitacao_id}", summary="Atualizar habilitação")
async def atualizar_habilitacao(
    habilitacao_id: uuid.UUID,
    dados: esquemas.HabilitacaoEntrada,
    request: Request,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(exigir(P.OPERADORES_GERENCIAR)),
):
    habilitacao = await buscar_da_organizacao(
        db, Habilitacao, habilitacao_id, user, "Habilitação não encontrada."
    )
    antes = auditoria.instantaneo(habilitacao)
    for campo, valor in dados.model_dump(exclude_unset=True, exclude={"user_id"}).items():
        setattr(habilitacao, campo, valor)
    habilitacao.updated_by_id = user.id

    await auditoria.registrar(
        db,
        acao=AcaoAuditoria.ALTERAR,
        usuario=user,
        entidade="habilitacao",
        entidade_id=habilitacao.id,
        dados_antes=antes,
        dados_depois=auditoria.instantaneo(habilitacao),
        cliente=cliente(request),
    )
    await db.commit()
    return {"mensagem": "Habilitação atualizada."}
