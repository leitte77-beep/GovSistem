"""Manutenções preventivas e corretivas (item 38)."""

import uuid
from datetime import date, timedelta

from fastapi import APIRouter, Depends, Query, Request, status
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.v1.deps import (
    Paginacao,
    buscar_da_organizacao,
    cliente,
    com_rotulo,
    nomes_de_usuarios,
    pagina_payload,
)
from app.core.auth import exigir, usuario_pode
from app.core.database import get_db
from app.core.errors import AppError, Conflict
from app.core.permissoes import P, Perfil
from app.models.cacambas import Cacamba
from app.models.enums import (
    AcaoAuditoria,
    BaseGatilhoPlano,
    SituacaoCacamba,
    SituacaoEquipamento,
    SituacaoManutencao,
    SituacaoOrdem,
    TipoManutencao,
    TipoNotificacao,
)
from app.models.frota import Maquina, Veiculo
from app.models.manutencao import Manutencao, PlanoManutencao
from app.models.organizacao import User
from app.models.porteira import OrdemMaquina, OrdemServico, OrdemVeiculo
from app.schemas import frota as esquemas
from app.services import arquivos as servico_arquivos
from app.services import auditoria, notificacoes
from app.services import combustivel as servico_combustivel

router = APIRouter(prefix="/manutencoes", tags=["Manutenções"])


async def _carregar_alvo(db: AsyncSession, manutencao, user: User):
    """Devolve (objeto, tipo, descrição) do equipamento em manutenção."""
    if manutencao.maquina_id:
        alvo = await db.get(Maquina, manutencao.maquina_id)
        return alvo, "maquina", f"{alvo.codigo} — {alvo.nome}" if alvo else None
    if manutencao.veiculo_id:
        alvo = await db.get(Veiculo, manutencao.veiculo_id)
        return alvo, "veiculo", f"{alvo.placa} — {alvo.nome}" if alvo else None
    if manutencao.cacamba_id:
        alvo = await db.get(Cacamba, manutencao.cacamba_id)
        return alvo, "cacamba", f"Caçamba {alvo.codigo}" if alvo else None
    return None, None, None


async def _agendamentos_afetados(
    db: AsyncSession, user: User, manutencao: Manutencao
) -> list[dict]:
    """Ordens futuras que usam o equipamento — o gestor precisa saber (item 38.2)."""
    if not manutencao.maquina_id and not manutencao.veiculo_id:
        return []

    consulta = select(OrdemServico).where(
        OrdemServico.organizacao_id == user.organizacao_id,
        OrdemServico.deleted_at.is_(None),
        OrdemServico.situacao.in_([SituacaoOrdem.EMITIDA.value, SituacaoOrdem.EM_EXECUCAO.value]),
        OrdemServico.data_prevista >= manutencao.data_abertura,
    )
    if manutencao.maquina_id:
        consulta = consulta.join(OrdemMaquina, OrdemMaquina.ordem_id == OrdemServico.id).where(
            OrdemMaquina.maquina_id == manutencao.maquina_id
        )
    else:
        consulta = consulta.join(OrdemVeiculo, OrdemVeiculo.ordem_id == OrdemServico.id).where(
            OrdemVeiculo.veiculo_id == manutencao.veiculo_id
        )

    ordens = list((await db.execute(consulta.distinct())).scalars().all())
    return [
        {
            "ordem_id": o.id,
            "numero": o.numero_formatado,
            "data_prevista": o.data_prevista,
            "situacao": o.situacao,
        }
        for o in ordens
    ]


@router.get("", summary="Listar manutenções")
async def listar(
    situacao: list[str] | None = Query(None),
    tipo: str | None = None,
    maquina_id: uuid.UUID | None = None,
    veiculo_id: uuid.UUID | None = None,
    cacamba_id: uuid.UUID | None = None,
    abertas: bool = Query(False, description="Somente as ainda não concluídas"),
    paginacao: Paginacao = Depends(),
    db: AsyncSession = Depends(get_db),
    user: User = Depends(exigir(P.MANUTENCOES_VISUALIZAR)),
):
    condicoes = [
        Manutencao.organizacao_id == user.organizacao_id,
        Manutencao.deleted_at.is_(None),
    ]
    if situacao:
        condicoes.append(Manutencao.situacao.in_(situacao))
    if abertas:
        condicoes.append(
            Manutencao.situacao.notin_(
                [SituacaoManutencao.CONCLUIDA.value, SituacaoManutencao.CANCELADA.value]
            )
        )
    if tipo:
        condicoes.append(Manutencao.tipo == tipo)
    if maquina_id:
        condicoes.append(Manutencao.maquina_id == maquina_id)
    if veiculo_id:
        condicoes.append(Manutencao.veiculo_id == veiculo_id)
    if cacamba_id:
        condicoes.append(Manutencao.cacamba_id == cacamba_id)

    consulta = select(Manutencao).where(*condicoes)
    total = await db.scalar(select(func.count()).select_from(consulta.subquery())) or 0
    registros = list(
        (
            await db.execute(
                consulta.order_by(Manutencao.data_abertura.desc())
                .offset(paginacao.offset)
                .limit(paginacao.por_pagina)
            )
        )
        .scalars()
        .all()
    )
    nomes = await nomes_de_usuarios(db, [m.responsavel_id for m in registros])

    itens = []
    for manutencao in registros:
        _, tipo_alvo, descricao = await _carregar_alvo(db, manutencao, user)
        dias_aberto = None
        if manutencao.situacao not in {
            SituacaoManutencao.CONCLUIDA.value,
            SituacaoManutencao.CANCELADA.value,
        }:
            dias_aberto = (date.today() - manutencao.data_abertura).days
        itens.append(
            {
                "id": manutencao.id,
                "equipamento": descricao,
                "equipamento_tipo": tipo_alvo,
                "maquina_id": manutencao.maquina_id,
                "veiculo_id": manutencao.veiculo_id,
                "cacamba_id": manutencao.cacamba_id,
                "tipo": manutencao.tipo,
                "situacao": manutencao.situacao,
                "situacao_rotulo": com_rotulo(manutencao.situacao),
                "prioridade": manutencao.prioridade,
                "data_abertura": manutencao.data_abertura,
                "data_prevista": manutencao.data_prevista,
                "data_conclusao": manutencao.data_conclusao,
                "defeito": manutencao.defeito,
                "oficina": manutencao.oficina,
                "custo_total": manutencao.custo_total,
                "responsavel": nomes.get(manutencao.responsavel_id),
                "dias_em_aberto": dias_aberto,
                "created_at": manutencao.created_at,
            }
        )
    return pagina_payload(itens, total, paginacao)


@router.post("", status_code=status.HTTP_201_CREATED, summary="Abrir manutenção")
async def abrir(
    dados: esquemas.ManutencaoEntrada,
    request: Request,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(exigir(P.MANUTENCOES_GERENCIAR)),
):
    """Abre a manutenção e deixa o equipamento indisponível para agendamento.

    Também identifica as ordens já marcadas que usam o equipamento e avisa o
    gestor, para que ele decida a substituição (item 38.2).
    """
    alvos = [dados.maquina_id, dados.veiculo_id, dados.cacamba_id]
    if sum(1 for a in alvos if a) != 1:
        raise AppError(
            "Informe exatamente um equipamento: máquina, veículo ou caçamba.",
            422,
            "alvo_obrigatorio",
        )

    manutencao = Manutencao(
        organizacao_id=user.organizacao_id,
        created_by_id=user.id,
        updated_by_id=user.id,
        responsavel_id=user.id,
        situacao=SituacaoManutencao.ABERTA.value,
        data_abertura=dados.data_abertura or date.today(),
        custo_total=round((dados.custo_pecas or 0) + (dados.custo_servicos or 0), 2) or None,
        **dados.model_dump(exclude={"data_abertura"}),
    )
    db.add(manutencao)
    await db.flush()

    alvo, tipo_alvo, descricao = await _carregar_alvo(db, manutencao, user)
    if alvo is None:
        raise AppError("Equipamento não encontrado.", 404, "nao_encontrado")

    # Bloqueia novos agendamentos guardando a situação anterior.
    manutencao.situacao_anterior_equipamento = alvo.situacao
    if tipo_alvo == "cacamba":
        from app.api.v1.cacambas import registrar_movimentacao

        await registrar_movimentacao(
            db,
            alvo,
            nova_situacao=SituacaoCacamba.EM_MANUTENCAO.value,
            usuario_id=user.id,
            motivo=f"Manutenção {manutencao.tipo}: {dados.defeito or 'sem descrição'}",
        )
    else:
        alvo.situacao = (
            SituacaoEquipamento.EM_MANUTENCAO_PREVENTIVA.value
            if manutencao.tipo == TipoManutencao.PREVENTIVA.value
            else SituacaoEquipamento.EM_MANUTENCAO_CORRETIVA.value
        )
        alvo.updated_by_id = user.id

    afetados = await _agendamentos_afetados(db, user, manutencao)

    await auditoria.registrar(
        db,
        acao=AcaoAuditoria.MANUTENCAO,
        usuario=user,
        entidade="manutencao",
        entidade_id=manutencao.id,
        entidade_descricao=f"{manutencao.tipo} — {descricao}",
        detalhe=(
            f"{len(afetados)} agendamento(s) afetado(s)" if afetados else "Sem agendamentos afetados"
        ),
        dados_depois=auditoria.instantaneo(manutencao),
        cliente=cliente(request),
    )

    if afetados:
        await notificacoes.para_perfis(
            db,
            organizacao_id=user.organizacao_id,
            perfis=[Perfil.GESTOR],
            tipo=TipoNotificacao.MANUTENCAO_PROXIMA,
            titulo=f"{descricao} entrou em manutenção",
            mensagem=(
                f"{len(afetados)} ordem(ns) de serviço já agendada(s) usam este equipamento. "
                "Avalie a substituição."
            ),
            entidade="manutencao",
            entidade_id=manutencao.id,
            link="/manutencoes",
        )

    await db.commit()
    return {
        "id": manutencao.id,
        "mensagem": f"Manutenção aberta. {descricao} está indisponível para novos agendamentos.",
        "agendamentos_afetados": afetados,
    }


@router.get("/{manutencao_id}", summary="Detalhar manutenção")
async def detalhar(
    manutencao_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(exigir(P.MANUTENCOES_VISUALIZAR)),
):
    manutencao = await buscar_da_organizacao(
        db, Manutencao, manutencao_id, user, "Manutenção não encontrada."
    )
    _, tipo_alvo, descricao = await _carregar_alvo(db, manutencao, user)
    nomes = await nomes_de_usuarios(db, [manutencao.responsavel_id])

    return {
        "id": manutencao.id,
        "equipamento": descricao,
        "equipamento_tipo": tipo_alvo,
        "maquina_id": manutencao.maquina_id,
        "veiculo_id": manutencao.veiculo_id,
        "cacamba_id": manutencao.cacamba_id,
        "plano_id": manutencao.plano_id,
        "tipo": manutencao.tipo,
        "situacao": manutencao.situacao,
        "situacao_rotulo": com_rotulo(manutencao.situacao),
        "prioridade": manutencao.prioridade,
        "data_abertura": manutencao.data_abertura,
        "data_prevista": manutencao.data_prevista,
        "data_conclusao": manutencao.data_conclusao,
        "defeito": manutencao.defeito,
        "diagnostico": manutencao.diagnostico,
        "quilometragem": manutencao.quilometragem,
        "horimetro": manutencao.horimetro,
        "servicos": manutencao.servicos,
        "pecas": manutencao.pecas or [],
        "oficina": manutencao.oficina,
        "fornecedor": manutencao.fornecedor,
        "custo_pecas": manutencao.custo_pecas,
        "custo_servicos": manutencao.custo_servicos,
        "custo_total": manutencao.custo_total,
        "horas_parado": manutencao.horas_parado,
        "responsavel": nomes.get(manutencao.responsavel_id),
        "observacoes": manutencao.observacoes,
        "created_at": manutencao.created_at,
        "agendamentos_afetados": await _agendamentos_afetados(db, user, manutencao),
        "arquivos": [
            servico_arquivos.resumo(a)
            for a in await servico_arquivos.listar(db, "manutencao", manutencao.id)
        ],
    }


@router.post("/{manutencao_id}/concluir", summary="Concluir manutenção")
async def concluir(
    manutencao_id: uuid.UUID,
    dados: esquemas.ManutencaoConclusao,
    request: Request,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(exigir(P.MANUTENCOES_GERENCIAR)),
):
    """Conclui e devolve o equipamento à operação, atualizando o plano preventivo."""
    manutencao = await buscar_da_organizacao(
        db, Manutencao, manutencao_id, user, "Manutenção não encontrada."
    )
    if manutencao.situacao == SituacaoManutencao.CONCLUIDA.value:
        raise Conflict("Esta manutenção já foi concluída.")

    conclusao = dados.data_conclusao or date.today()
    antes = auditoria.instantaneo(manutencao)

    manutencao.data_conclusao = conclusao
    manutencao.situacao = SituacaoManutencao.CONCLUIDA.value
    if dados.diagnostico:
        manutencao.diagnostico = dados.diagnostico
    if dados.servicos:
        manutencao.servicos = dados.servicos
    if dados.pecas:
        manutencao.pecas = dados.pecas
    if dados.custo_pecas is not None:
        manutencao.custo_pecas = dados.custo_pecas
    if dados.custo_servicos is not None:
        manutencao.custo_servicos = dados.custo_servicos
    manutencao.custo_total = round(
        (manutencao.custo_pecas or 0) + (manutencao.custo_servicos or 0), 2
    ) or None
    manutencao.horas_parado = round(
        max((conclusao - manutencao.data_abertura).days, 0) * 24, 2
    )
    if dados.observacoes:
        manutencao.observacoes = dados.observacoes
    manutencao.updated_by_id = user.id

    alvo, tipo_alvo, descricao = await _carregar_alvo(db, manutencao, user)
    if alvo is not None:
        if tipo_alvo == "cacamba":
            from app.api.v1.cacambas import registrar_movimentacao

            await registrar_movimentacao(
                db,
                alvo,
                nova_situacao=dados.situacao_equipamento or SituacaoCacamba.DISPONIVEL.value,
                usuario_id=user.id,
                motivo="Manutenção concluída",
            )
        else:
            alvo.situacao = (
                dados.situacao_equipamento
                or manutencao.situacao_anterior_equipamento
                or SituacaoEquipamento.DISPONIVEL.value
            )
            # Se antes da manutenção o equipamento já estava indisponível por
            # outro motivo, não o devolvemos "disponível" por engano.
            if alvo.situacao in {
                SituacaoEquipamento.EM_MANUTENCAO_CORRETIVA.value,
                SituacaoEquipamento.EM_MANUTENCAO_PREVENTIVA.value,
            }:
                alvo.situacao = SituacaoEquipamento.DISPONIVEL.value
            alvo.updated_by_id = user.id

            # Leitura de medidor no encerramento.
            await servico_combustivel.registrar_leitura_medidor(
                db,
                maquina=alvo if tipo_alvo == "maquina" else None,
                veiculo=alvo if tipo_alvo == "veiculo" else None,
                valor=dados.horimetro if tipo_alvo == "maquina" else dados.quilometragem,
                origem="manutencao",
                usuario_id=user.id,
                pode_corrigir=usuario_pode(user, P.MEDIDORES_CORRIGIR),
                justificativa=dados.justificativa_medidor,
            )

    # Reprograma o plano preventivo.
    if manutencao.plano_id:
        plano = await db.get(PlanoManutencao, manutencao.plano_id)
        if plano is not None:
            plano.ultima_data = conclusao
            if plano.base_gatilho == BaseGatilhoPlano.PERIODO.value and plano.intervalo_dias:
                plano.proxima_data = conclusao + timedelta(days=plano.intervalo_dias)
            medicao = dados.horimetro if tipo_alvo == "maquina" else dados.quilometragem
            if medicao is not None:
                plano.ultima_medicao = medicao
                intervalo = (
                    plano.intervalo_horas
                    if plano.base_gatilho == BaseGatilhoPlano.HORIMETRO.value
                    else plano.intervalo_km
                )
                if intervalo:
                    plano.proxima_medicao = round(medicao + intervalo, 2)

    await auditoria.registrar(
        db,
        acao=AcaoAuditoria.MANUTENCAO,
        usuario=user,
        entidade="manutencao",
        entidade_id=manutencao.id,
        entidade_descricao=f"Conclusão — {descricao}",
        dados_antes=antes,
        dados_depois=auditoria.instantaneo(manutencao),
        cliente=cliente(request),
    )
    await db.commit()
    return {
        "mensagem": f"Manutenção concluída. {descricao} voltou a ficar disponível.",
        "custo_total": manutencao.custo_total,
    }


# ── Planos preventivos ───────────────────────────────────────────────────────


@router.get("/planos/listar", summary="Planos de manutenção preventiva")
async def listar_planos(
    vencendo: bool = Query(False, description="Somente os que estão próximos do vencimento"),
    db: AsyncSession = Depends(get_db),
    user: User = Depends(exigir(P.MANUTENCOES_VISUALIZAR)),
):
    registros = list(
        (
            await db.execute(
                select(PlanoManutencao).where(
                    PlanoManutencao.organizacao_id == user.organizacao_id,
                    PlanoManutencao.deleted_at.is_(None),
                    PlanoManutencao.ativo.is_(True),
                )
            )
        )
        .scalars()
        .all()
    )

    hoje = date.today()
    resposta = []
    for plano in registros:
        dias = (plano.proxima_data - hoje).days if plano.proxima_data else None
        alerta = dias is not None and dias <= plano.antecedencia_alerta_dias
        if vencendo and not alerta:
            continue

        descricao = None
        if plano.maquina_id:
            maquina = await db.get(Maquina, plano.maquina_id)
            descricao = f"{maquina.codigo} — {maquina.nome}" if maquina else None
        elif plano.veiculo_id:
            veiculo = await db.get(Veiculo, plano.veiculo_id)
            descricao = f"{veiculo.placa} — {veiculo.nome}" if veiculo else None
        elif plano.cacamba_id:
            cacamba = await db.get(Cacamba, plano.cacamba_id)
            descricao = f"Caçamba {cacamba.codigo}" if cacamba else None

        resposta.append(
            {
                "id": plano.id,
                "nome": plano.nome,
                "descricao": plano.descricao,
                "equipamento": descricao,
                "maquina_id": plano.maquina_id,
                "veiculo_id": plano.veiculo_id,
                "cacamba_id": plano.cacamba_id,
                "base_gatilho": plano.base_gatilho,
                "intervalo_dias": plano.intervalo_dias,
                "intervalo_km": plano.intervalo_km,
                "intervalo_horas": plano.intervalo_horas,
                "antecedencia_alerta_dias": plano.antecedencia_alerta_dias,
                "ultima_data": plano.ultima_data,
                "ultima_medicao": plano.ultima_medicao,
                "proxima_data": plano.proxima_data,
                "proxima_medicao": plano.proxima_medicao,
                "servicos_previstos": plano.servicos_previstos or [],
                "recomendacao_fabricante": plano.recomendacao_fabricante,
                "ativo": plano.ativo,
                "dias_para_vencer": dias,
                "vencido": dias is not None and dias < 0,
            }
        )
    return resposta


@router.post("/planos", status_code=status.HTTP_201_CREATED, summary="Criar plano preventivo")
async def criar_plano(
    dados: esquemas.PlanoManutencaoEntrada,
    request: Request,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(exigir(P.MANUTENCOES_GERENCIAR)),
):
    alvos = [dados.maquina_id, dados.veiculo_id, dados.cacamba_id]
    if sum(1 for a in alvos if a) != 1:
        raise AppError(
            "Informe exatamente um equipamento para o plano.", 422, "alvo_obrigatorio"
        )

    plano = PlanoManutencao(
        organizacao_id=user.organizacao_id, created_by_id=user.id, updated_by_id=user.id,
        **dados.model_dump(),
    )
    # Calcula o primeiro vencimento a partir da última execução informada.
    if plano.base_gatilho == BaseGatilhoPlano.PERIODO.value and plano.intervalo_dias:
        base = plano.ultima_data or date.today()
        plano.proxima_data = base + timedelta(days=plano.intervalo_dias)
    elif plano.ultima_medicao is not None:
        intervalo = (
            plano.intervalo_horas
            if plano.base_gatilho == BaseGatilhoPlano.HORIMETRO.value
            else plano.intervalo_km
        )
        if intervalo:
            plano.proxima_medicao = round(plano.ultima_medicao + intervalo, 2)

    db.add(plano)
    await db.flush()
    await auditoria.registrar(
        db,
        acao=AcaoAuditoria.CRIAR,
        usuario=user,
        entidade="plano_manutencao",
        entidade_id=plano.id,
        entidade_descricao=plano.nome,
        dados_depois=auditoria.instantaneo(plano),
        cliente=cliente(request),
    )
    await db.commit()
    return {"id": plano.id, "mensagem": "Plano preventivo criado.", "proxima_data": plano.proxima_data}
