"""Abastecimentos, tanques e estoque de combustível (item 37)."""

import uuid
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, Query, Request, status
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.v1.deps import (
    Paginacao,
    Periodo,
    buscar_da_organizacao,
    cliente,
    nomes_de_usuarios,
    pagina_payload,
)
from app.core.auth import exigir, usuario_pode
from app.core.database import get_db
from app.core.errors import AppError, Conflict
from app.core.permissoes import P, Perfil
from app.models.combustivel import Abastecimento, MovimentoCombustivel, Tanque
from app.models.enums import (
    AcaoAuditoria,
    TipoMovimentoCombustivel,
    TipoNotificacao,
)
from app.models.frota import Maquina, Veiculo
from app.models.organizacao import User
from app.models.porteira import OrdemMaquina, OrdemServico, OrdemVeiculo
from app.schemas import frota as esquemas
from app.services import auditoria, configuracoes, notificacoes
from app.services import combustivel as servico

router = APIRouter(prefix="/combustivel", tags=["Combustível"])


# ─────────────────────────────────────────────────────────────────────────────
# Tanques e estoque
# ─────────────────────────────────────────────────────────────────────────────


def _resumo_tanque(tanque: Tanque) -> dict:
    capacidade = tanque.capacidade_litros or 0
    return {
        "id": tanque.id,
        "codigo": tanque.codigo,
        "nome": tanque.nome,
        "tipo_combustivel": tanque.tipo_combustivel,
        "local": tanque.local,
        "capacidade_litros": tanque.capacidade_litros,
        "estoque_atual_litros": tanque.estoque_atual_litros,
        "estoque_minimo_litros": tanque.estoque_minimo_litros,
        "bombas": tanque.bombas or [],
        "ativo": tanque.ativo,
        "observacoes": tanque.observacoes,
        "abaixo_do_minimo": tanque.abaixo_do_minimo,
        "ocupacao_percentual": (
            round(100 * (tanque.estoque_atual_litros or 0) / capacidade) if capacidade else 0
        ),
    }


@router.get("/tanques", summary="Listar tanques")
async def listar_tanques(
    db: AsyncSession = Depends(get_db),
    user: User = Depends(exigir(P.COMBUSTIVEL_VISUALIZAR)),
):
    registros = (
        await db.execute(
            select(Tanque)
            .where(Tanque.organizacao_id == user.organizacao_id, Tanque.deleted_at.is_(None))
            .order_by(Tanque.codigo)
        )
    ).scalars().all()
    return [_resumo_tanque(t) for t in registros]


@router.post("/tanques", status_code=status.HTTP_201_CREATED, summary="Cadastrar tanque")
async def criar_tanque(
    dados: esquemas.TanqueEntrada,
    request: Request,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(exigir(P.COMBUSTIVEL_ESTOQUE)),
):
    existente = await db.scalar(
        select(Tanque).where(
            Tanque.organizacao_id == user.organizacao_id,
            Tanque.codigo == dados.codigo,
            Tanque.deleted_at.is_(None),
        )
    )
    if existente is not None:
        raise Conflict("Já existe um tanque com este código.")
    tanque = Tanque(
        organizacao_id=user.organizacao_id, created_by_id=user.id, updated_by_id=user.id,
        **dados.model_dump(),
    )
    db.add(tanque)
    await db.flush()
    await auditoria.registrar(
        db,
        acao=AcaoAuditoria.CRIAR,
        usuario=user,
        entidade="tanque",
        entidade_id=tanque.id,
        entidade_descricao=tanque.nome,
        dados_depois=auditoria.instantaneo(tanque),
        cliente=cliente(request),
    )
    await db.commit()
    return {"id": tanque.id, "mensagem": "Tanque cadastrado."}


@router.post("/tanques/{tanque_id}/movimentos", summary="Movimentar estoque")
async def movimentar_estoque(
    tanque_id: uuid.UUID,
    dados: esquemas.MovimentoEstoqueEntrada,
    request: Request,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(exigir(P.COMBUSTIVEL_ESTOQUE)),
):
    """Entrada, saída, ajuste, perda ou transferência de combustível."""
    tanque = await buscar_da_organizacao(db, Tanque, tanque_id, user, "Tanque não encontrado.")
    if dados.tipo not in TipoMovimentoCombustivel.valores():
        raise AppError("Tipo de movimentação inválido.", 422, "tipo_invalido")

    # Estoque negativo depende de configuração E de permissão administrativa.
    permite_negativo = bool(
        await configuracoes.obter(db, user.organizacao_id, "combustivel_permite_estoque_negativo")
    )
    if dados.permitir_negativo:
        if not permite_negativo:
            raise AppError(
                "A configuração do módulo não permite estoque negativo.",
                422,
                "estoque_negativo_bloqueado",
            )
        if not usuario_pode(user, P.COMBUSTIVEL_AJUSTAR):
            raise AppError(
                "Permitir estoque negativo exige a permissão govinfra.combustivel.ajustar.",
                403,
                "permissao_negada",
            )

    movimento = await servico.movimentar_estoque(
        db,
        tanque.id,
        tipo=TipoMovimentoCombustivel(dados.tipo),
        litros=dados.quantidade_litros,
        usuario_id=user.id,
        fornecedor=dados.fornecedor,
        nota_fiscal=dados.nota_fiscal,
        lote=dados.lote,
        valor_unitario=dados.valor_unitario,
        motivo=dados.motivo,
        justificativa=dados.justificativa,
        permitir_negativo=dados.permitir_negativo,
    )

    # Transferência: dá entrada no tanque de destino.
    if dados.tipo == TipoMovimentoCombustivel.TRANSFERENCIA.value and dados.tanque_destino_id:
        destino = await buscar_da_organizacao(
            db, Tanque, dados.tanque_destino_id, user, "Tanque de destino não encontrado."
        )
        await servico.movimentar_estoque(
            db,
            destino.id,
            tipo=TipoMovimentoCombustivel.ENTRADA,
            litros=dados.quantidade_litros,
            usuario_id=user.id,
            motivo=f"Transferência recebida do tanque {tanque.codigo}",
        )
        movimento.tanque_destino_id = destino.id

    await auditoria.registrar(
        db,
        acao=AcaoAuditoria.AJUSTE_ESTOQUE,
        usuario=user,
        entidade="tanque",
        entidade_id=tanque.id,
        entidade_descricao=tanque.nome,
        justificativa=dados.justificativa,
        detalhe=f"{dados.tipo} de {dados.quantidade_litros:g} litros",
        dados_antes={"estoque": movimento.saldo_anterior},
        dados_depois={"estoque": movimento.saldo_posterior},
        cliente=cliente(request),
    )

    if tanque.abaixo_do_minimo:
        await notificacoes.para_perfis(
            db,
            organizacao_id=user.organizacao_id,
            perfis=[Perfil.GESTOR, Perfil.COMBUSTIVEL],
            tipo=TipoNotificacao.ESTOQUE_DIESEL_BAIXO,
            titulo=f"Estoque baixo no tanque {tanque.nome}",
            mensagem=(
                f"Restam {tanque.estoque_atual_litros:g} litros "
                f"(mínimo: {tanque.estoque_minimo_litros:g})."
            ),
            entidade="tanque",
            entidade_id=tanque.id,
            link="/combustivel",
        )

    await db.commit()
    return {
        "mensagem": "Movimentação registrada.",
        "estoque_atual": tanque.estoque_atual_litros,
        "abaixo_do_minimo": tanque.abaixo_do_minimo,
    }


@router.get("/tanques/{tanque_id}/movimentos", summary="Extrato do tanque")
async def extrato_tanque(
    tanque_id: uuid.UUID,
    paginacao: Paginacao = Depends(),
    db: AsyncSession = Depends(get_db),
    user: User = Depends(exigir(P.COMBUSTIVEL_VISUALIZAR)),
):
    await buscar_da_organizacao(db, Tanque, tanque_id, user, "Tanque não encontrado.")
    consulta = select(MovimentoCombustivel).where(MovimentoCombustivel.tanque_id == tanque_id)
    total = await db.scalar(select(func.count()).select_from(consulta.subquery())) or 0
    registros = list(
        (
            await db.execute(
                consulta.order_by(MovimentoCombustivel.created_at.desc())
                .offset(paginacao.offset)
                .limit(paginacao.por_pagina)
            )
        )
        .scalars()
        .all()
    )
    nomes = await nomes_de_usuarios(db, [m.created_by_id for m in registros])
    itens = [
        {
            "id": m.id,
            "tipo": m.tipo,
            "quantidade_litros": m.quantidade_litros,
            "saldo_anterior": m.saldo_anterior,
            "saldo_posterior": m.saldo_posterior,
            "fornecedor": m.fornecedor,
            "nota_fiscal": m.nota_fiscal,
            "valor_unitario": m.valor_unitario,
            "valor_total": m.valor_total,
            "motivo": m.motivo,
            "justificativa": m.justificativa,
            "permitiu_negativo": m.permitiu_negativo,
            "created_at": m.created_at,
            "usuario": nomes.get(m.created_by_id),
        }
        for m in registros
    ]
    return pagina_payload(itens, total, paginacao)


# ─────────────────────────────────────────────────────────────────────────────
# Abastecimentos
# ─────────────────────────────────────────────────────────────────────────────


@router.get("/abastecimentos", summary="Listar abastecimentos")
async def listar_abastecimentos(
    maquina_id: uuid.UUID | None = None,
    veiculo_id: uuid.UUID | None = None,
    ordem_id: uuid.UUID | None = None,
    com_alerta: bool = Query(False, description="Somente lançamentos com inconsistência"),
    periodo: Periodo = Depends(),
    paginacao: Paginacao = Depends(),
    db: AsyncSession = Depends(get_db),
    user: User = Depends(exigir(P.COMBUSTIVEL_VISUALIZAR)),
):
    condicoes = [
        Abastecimento.organizacao_id == user.organizacao_id,
        Abastecimento.deleted_at.is_(None),
    ]
    if maquina_id:
        condicoes.append(Abastecimento.maquina_id == maquina_id)
    if veiculo_id:
        condicoes.append(Abastecimento.veiculo_id == veiculo_id)
    if ordem_id:
        condicoes.append(Abastecimento.ordem_id == ordem_id)
    if periodo.inicio:
        condicoes.append(func.date(Abastecimento.abastecido_em) >= periodo.inicio)
    if periodo.fim:
        condicoes.append(func.date(Abastecimento.abastecido_em) <= periodo.fim)
    if com_alerta:
        condicoes.append(Abastecimento.alertas.is_not(None))

    consulta = select(Abastecimento).where(*condicoes)
    total = await db.scalar(select(func.count()).select_from(consulta.subquery())) or 0
    registros = list(
        (
            await db.execute(
                consulta.order_by(Abastecimento.abastecido_em.desc())
                .offset(paginacao.offset)
                .limit(paginacao.por_pagina)
            )
        )
        .scalars()
        .all()
    )
    nomes = await nomes_de_usuarios(
        db, [a.responsavel_id for a in registros] + [a.operador_id for a in registros]
    )

    itens = []
    for registro in registros:
        maquina = await db.get(Maquina, registro.maquina_id) if registro.maquina_id else None
        veiculo = await db.get(Veiculo, registro.veiculo_id) if registro.veiculo_id else None
        ordem = await db.get(OrdemServico, registro.ordem_id) if registro.ordem_id else None
        tanque = await db.get(Tanque, registro.tanque_id) if registro.tanque_id else None
        itens.append(
            {
                "id": registro.id,
                "abastecido_em": registro.abastecido_em,
                "maquina_id": registro.maquina_id,
                "maquina": f"{maquina.codigo} — {maquina.nome}" if maquina else None,
                "veiculo_id": registro.veiculo_id,
                "veiculo": f"{veiculo.placa} — {veiculo.nome}" if veiculo else None,
                "responsavel": nomes.get(registro.responsavel_id),
                "operador": nomes.get(registro.operador_id),
                "quantidade_litros": registro.quantidade_litros,
                "tipo_combustivel": registro.tipo_combustivel,
                "valor_unitario": registro.valor_unitario,
                "valor_total": registro.valor_total,
                "horimetro": registro.horimetro,
                "quilometragem": registro.quilometragem,
                "tanque": tanque.nome if tanque else None,
                "bomba": registro.bomba,
                "local": registro.local,
                "posto_externo": registro.posto_externo,
                "requisicao": registro.requisicao,
                "nota_fiscal": registro.nota_fiscal,
                "ordem_id": registro.ordem_id,
                "ordem_numero": ordem.numero_formatado if ordem else None,
                "alertas": registro.alertas or [],
                "observacoes": registro.observacoes,
                "created_at": registro.created_at,
            }
        )
    return pagina_payload(itens, total, paginacao)


@router.post(
    "/abastecimentos", status_code=status.HTTP_201_CREATED, summary="Registrar abastecimento"
)
async def registrar_abastecimento(
    dados: esquemas.AbastecimentoEntrada,
    request: Request,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(exigir(P.COMBUSTIVEL_REGISTRAR)),
):
    """Registra o abastecimento, baixa o estoque e detecta inconsistências.

    Tudo na mesma transação: não existe abastecimento gravado sem a baixa do
    tanque correspondente (quando há tanque próprio).
    """
    if not dados.maquina_id and not dados.veiculo_id:
        raise AppError(
            "Informe a máquina ou o veículo abastecido.", 422, "equipamento_obrigatorio"
        )
    if dados.maquina_id and dados.veiculo_id:
        raise AppError(
            "Informe apenas uma máquina OU um veículo por lançamento.", 422, "equipamento_ambiguo"
        )

    # Reenvio idempotente — comum quando o operador está com internet ruim.
    if dados.chave_idempotencia:
        existente = await db.scalar(
            select(Abastecimento).where(
                Abastecimento.chave_idempotencia == dados.chave_idempotencia
            )
        )
        if existente is not None:
            return {
                "id": existente.id,
                "mensagem": "Este abastecimento já havia sido registrado.",
                "alertas": existente.alertas or [],
                "repetido": True,
            }

    maquina = (
        await buscar_da_organizacao(db, Maquina, dados.maquina_id, user, "Máquina não encontrada.")
        if dados.maquina_id
        else None
    )
    veiculo = (
        await buscar_da_organizacao(db, Veiculo, dados.veiculo_id, user, "Veículo não encontrado.")
        if dados.veiculo_id
        else None
    )
    tanque = (
        await buscar_da_organizacao(db, Tanque, dados.tanque_id, user, "Tanque não encontrado.")
        if dados.tanque_id
        else None
    )
    momento = dados.abastecido_em or datetime.now(timezone.utc)

    alertas = await servico.detectar_alertas(
        db,
        user.organizacao_id,
        maquina=maquina,
        veiculo=veiculo,
        litros=dados.quantidade_litros,
        horimetro=dados.horimetro,
        quilometragem=dados.quilometragem,
        abastecido_em=momento,
        tanque=tanque,
        ordem_id=dados.ordem_id,
    )

    preco = dados.valor_unitario
    if preco is None:
        preco = await configuracoes.obter(
            db, user.organizacao_id, "combustivel_preco_referencia_litro"
        )

    abastecimento = Abastecimento(
        organizacao_id=user.organizacao_id,
        abastecido_em=momento,
        maquina_id=maquina.id if maquina else None,
        veiculo_id=veiculo.id if veiculo else None,
        responsavel_id=user.id,
        operador_id=dados.operador_id,
        quantidade_litros=dados.quantidade_litros,
        tipo_combustivel=dados.tipo_combustivel,
        valor_unitario=dados.valor_unitario,
        valor_total=(
            round(preco * dados.quantidade_litros, 2) if preco else None
        ),
        horimetro=dados.horimetro,
        quilometragem=dados.quilometragem,
        tanque_id=tanque.id if tanque else None,
        bomba=dados.bomba,
        local=dados.local,
        posto_externo=dados.posto_externo,
        requisicao=dados.requisicao,
        nota_fiscal=dados.nota_fiscal,
        ordem_id=dados.ordem_id,
        solicitacao_cacamba_id=dados.solicitacao_cacamba_id,
        latitude=dados.latitude,
        longitude=dados.longitude,
        alertas=alertas or None,
        observacoes=dados.observacoes,
        chave_idempotencia=dados.chave_idempotencia,
        created_by_id=user.id,
    )
    db.add(abastecimento)
    await db.flush()

    # Baixa no tanque próprio.
    if tanque is not None:
        permite_negativo = bool(
            await configuracoes.obter(
                db, user.organizacao_id, "combustivel_permite_estoque_negativo"
            )
        ) and usuario_pode(user, P.COMBUSTIVEL_AJUSTAR)
        await servico.movimentar_estoque(
            db,
            tanque.id,
            tipo=TipoMovimentoCombustivel.SAIDA,
            litros=dados.quantidade_litros,
            usuario_id=user.id,
            abastecimento_id=abastecimento.id,
            motivo=(
                f"Abastecimento de {maquina.codigo if maquina else veiculo.placa}"
            ),
            permitir_negativo=permite_negativo,
            justificativa=dados.observacoes if permite_negativo else None,
            chave_idempotencia=(
                f"saida-abast-{abastecimento.id}" if dados.chave_idempotencia else None
            ),
        )

    # Medidor: registra a leitura com validação de retrocesso.
    await servico.registrar_leitura_medidor(
        db,
        maquina=maquina,
        veiculo=veiculo,
        valor=dados.horimetro if maquina else dados.quilometragem,
        origem="abastecimento",
        usuario_id=user.id,
        pode_corrigir=usuario_pode(user, P.MEDIDORES_CORRIGIR),
        justificativa=dados.justificativa_medidor,
        ordem_id=dados.ordem_id,
    )

    # Consumo apropriado na ordem de serviço.
    if dados.ordem_id:
        if maquina is not None:
            recurso = await db.scalar(
                select(OrdemMaquina).where(
                    OrdemMaquina.ordem_id == dados.ordem_id,
                    OrdemMaquina.maquina_id == maquina.id,
                )
            )
        else:
            recurso = await db.scalar(
                select(OrdemVeiculo).where(
                    OrdemVeiculo.ordem_id == dados.ordem_id,
                    OrdemVeiculo.veiculo_id == veiculo.id,
                )
            )
        if recurso is not None:
            recurso.consumo_litros = round(
                (recurso.consumo_litros or 0) + dados.quantidade_litros, 2
            )
            ordem = await db.get(OrdemServico, dados.ordem_id)
            if ordem is not None:
                ordem.diesel_consumido_litros = round(
                    (ordem.diesel_consumido_litros or 0) + dados.quantidade_litros, 2
                )

    await auditoria.registrar(
        db,
        acao=AcaoAuditoria.ABASTECIMENTO,
        usuario=user,
        entidade="abastecimento",
        entidade_id=abastecimento.id,
        entidade_descricao=(
            f"{dados.quantidade_litros:g}L em "
            f"{maquina.codigo if maquina else veiculo.placa}"
        ),
        detalhe=(
            f"{len(alertas)} alerta(s) detectado(s)" if alertas else "Sem inconsistências"
        ),
        dados_depois=auditoria.instantaneo(abastecimento),
        cliente=cliente(request),
    )

    if alertas:
        await notificacoes.para_perfis(
            db,
            organizacao_id=user.organizacao_id,
            perfis=[Perfil.GESTOR, Perfil.COMBUSTIVEL],
            tipo=TipoNotificacao.INCONSISTENCIA_DETECTADA,
            titulo="Inconsistência em abastecimento",
            mensagem="; ".join(a["mensagem"] for a in alertas),
            entidade="abastecimento",
            entidade_id=abastecimento.id,
            link="/combustivel",
        )

    await db.commit()
    return {
        "id": abastecimento.id,
        "mensagem": "Abastecimento registrado.",
        "alertas": alertas,
        "estoque_atual": tanque.estoque_atual_litros if tanque else None,
    }


@router.get("/indicadores", summary="Indicadores de consumo")
async def indicadores(
    periodo: Periodo = Depends(),
    db: AsyncSession = Depends(get_db),
    user: User = Depends(exigir(P.COMBUSTIVEL_VISUALIZAR)),
):
    """Consumo consolidado do período (item 37.3)."""
    condicoes = [
        Abastecimento.organizacao_id == user.organizacao_id,
        Abastecimento.deleted_at.is_(None),
    ]
    if periodo.inicio:
        condicoes.append(func.date(Abastecimento.abastecido_em) >= periodo.inicio)
    if periodo.fim:
        condicoes.append(func.date(Abastecimento.abastecido_em) <= periodo.fim)

    totais = (
        await db.execute(
            select(
                func.coalesce(func.sum(Abastecimento.quantidade_litros), 0),
                func.coalesce(func.sum(Abastecimento.valor_total), 0),
                func.count(),
            ).where(*condicoes)
        )
    ).first()

    por_maquina = (
        await db.execute(
            select(
                Maquina.codigo,
                Maquina.nome,
                func.coalesce(func.sum(Abastecimento.quantidade_litros), 0),
            )
            .join(Maquina, Maquina.id == Abastecimento.maquina_id)
            .where(*condicoes)
            .group_by(Maquina.codigo, Maquina.nome)
            .order_by(func.sum(Abastecimento.quantidade_litros).desc())
            .limit(15)
        )
    ).all()

    por_veiculo = (
        await db.execute(
            select(
                Veiculo.placa,
                Veiculo.nome,
                func.coalesce(func.sum(Abastecimento.quantidade_litros), 0),
            )
            .join(Veiculo, Veiculo.id == Abastecimento.veiculo_id)
            .where(*condicoes)
            .group_by(Veiculo.placa, Veiculo.nome)
            .order_by(func.sum(Abastecimento.quantidade_litros).desc())
            .limit(15)
        )
    ).all()

    com_alerta = await db.scalar(
        select(func.count()).select_from(Abastecimento).where(*condicoes, Abastecimento.alertas.is_not(None))
    ) or 0
    sem_ordem = await db.scalar(
        select(func.count()).select_from(Abastecimento).where(*condicoes, Abastecimento.ordem_id.is_(None))
    ) or 0

    tanques = (
        await db.execute(
            select(Tanque).where(
                Tanque.organizacao_id == user.organizacao_id, Tanque.deleted_at.is_(None)
            )
        )
    ).scalars().all()

    return {
        "periodo": periodo.descricao,
        "litros_total": float(totais[0] or 0),
        "custo_total": float(totais[1] or 0),
        "abastecimentos": int(totais[2] or 0),
        "com_inconsistencia": com_alerta,
        "sem_ordem_servico": sem_ordem,
        "consumo_por_maquina": [
            {"codigo": linha[0], "nome": linha[1], "litros": float(linha[2] or 0)}
            for linha in por_maquina
        ],
        "consumo_por_veiculo": [
            {"placa": linha[0], "nome": linha[1], "litros": float(linha[2] or 0)}
            for linha in por_veiculo
        ],
        "tanques": [_resumo_tanque(t) for t in tanques],
    }
