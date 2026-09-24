"""Painel geral do GovInfra (item 7).

Todos os números vêm com o filtro que a listagem correspondente aceita, para
que cada card da tela seja clicável e abra a lista já filtrada.
"""

from datetime import date, timedelta

from fastapi import APIRouter, Depends, Query
from sqlalchemy import func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.v1.deps import com_rotulo
from app.core.auth import exigir
from app.core.database import get_db
from app.core.permissoes import P
from app.models.cacambas import Cacamba, SolicitacaoCacamba
from app.models.combustivel import Abastecimento, Tanque
from app.models.enums import (
    SOLICITACAO_ATIVA,
    SituacaoCacamba,
    SituacaoEquipamento,
    SituacaoHorasAdicionais,
    SituacaoManutencao,
    SituacaoOrdem,
    SituacaoServico,
    SituacaoSolicitacao,
)
from app.models.frota import Habilitacao, Maquina, Veiculo
from app.models.manutencao import Manutencao, PlanoManutencao
from app.models.organizacao import User
from app.models.pessoas import Imovel, Pessoa
from app.models.porteira import (
    HorasAdicionais,
    OrdemServico,
    SaldoHoras,
    SolicitacaoServico,
)
from app.services import configuracoes

router = APIRouter(prefix="/dashboard", tags=["Painel"])


async def _contar(db: AsyncSession, modelo, *condicoes) -> int:
    return await db.scalar(select(func.count()).select_from(modelo).where(*condicoes)) or 0


@router.get("", summary="Painel geral")
async def painel(
    dias: int = Query(30, ge=1, le=365, description="Janela do período analisado"),
    db: AsyncSession = Depends(get_db),
    user: User = Depends(exigir(P.DASHBOARD_VISUALIZAR)),
):
    org = user.organizacao_id
    hoje = date.today()
    inicio = hoje - timedelta(days=dias)

    # ── Caçambas (item 7.1) ─────────────────────────────────────────────────
    contagem_cacambas = dict(
        (
            await db.execute(
                select(Cacamba.situacao, func.count())
                .where(Cacamba.organizacao_id == org, Cacamba.deleted_at.is_(None))
                .group_by(Cacamba.situacao)
            )
        ).all()
    )
    total_cacambas = sum(contagem_cacambas.values())

    base_solicitacao = [
        SolicitacaoCacamba.organizacao_id == org,
        SolicitacaoCacamba.deleted_at.is_(None),
    ]
    atrasadas = await _contar(
        db,
        SolicitacaoCacamba,
        *base_solicitacao,
        SolicitacaoCacamba.data_prevista_retirada < hoje,
        SolicitacaoCacamba.situacao.in_(
            [SituacaoSolicitacao.EM_USO.value, SituacaoSolicitacao.AGUARDANDO_RETIRADA.value]
        ),
    )

    cacambas = {
        "total": total_cacambas,
        "disponiveis": contagem_cacambas.get(SituacaoCacamba.DISPONIVEL.value, 0),
        "reservadas": contagem_cacambas.get(SituacaoCacamba.RESERVADA.value, 0),
        "aguardando_entrega": contagem_cacambas.get(SituacaoCacamba.AGUARDANDO_ENTREGA.value, 0),
        "em_uso": contagem_cacambas.get(SituacaoCacamba.EM_USO.value, 0),
        "aguardando_retirada": contagem_cacambas.get(SituacaoCacamba.AGUARDANDO_RETIRADA.value, 0),
        "em_limpeza": contagem_cacambas.get(SituacaoCacamba.EM_LIMPEZA.value, 0),
        "em_manutencao": contagem_cacambas.get(SituacaoCacamba.EM_MANUTENCAO.value, 0),
        "atrasadas": atrasadas,
        "solicitacoes_pendentes": await _contar(
            db,
            SolicitacaoCacamba,
            *base_solicitacao,
            SolicitacaoCacamba.situacao.in_(
                [SituacaoSolicitacao.PENDENTE.value, SituacaoSolicitacao.EM_ANALISE.value]
            ),
        ),
        "entregas_hoje": await _contar(
            db,
            SolicitacaoCacamba,
            *base_solicitacao,
            SolicitacaoCacamba.data_prevista_entrega == hoje,
            SolicitacaoCacamba.situacao.in_(SOLICITACAO_ATIVA),
        ),
        "retiradas_hoje": await _contar(
            db,
            SolicitacaoCacamba,
            *base_solicitacao,
            SolicitacaoCacamba.data_prevista_retirada == hoje,
            SolicitacaoCacamba.situacao.in_(SOLICITACAO_ATIVA),
        ),
        "por_situacao": [
            {
                "chave": situacao.value,
                "rotulo": com_rotulo(situacao.value),
                "quantidade": contagem_cacambas.get(situacao.value, 0),
            }
            for situacao in SituacaoCacamba
            if contagem_cacambas.get(situacao.value, 0)
        ],
    }

    # ── Porteira Adentro (item 7.2) ─────────────────────────────────────────
    contagem_servicos = dict(
        (
            await db.execute(
                select(SolicitacaoServico.situacao, func.count())
                .where(
                    SolicitacaoServico.organizacao_id == org,
                    SolicitacaoServico.deleted_at.is_(None),
                )
                .group_by(SolicitacaoServico.situacao)
            )
        ).all()
    )
    horas = (
        await db.execute(
            select(
                func.coalesce(func.sum(SaldoHoras.horas_concedidas), 0),
                func.coalesce(func.sum(SaldoHoras.horas_reservadas), 0),
                func.coalesce(func.sum(SaldoHoras.horas_utilizadas), 0),
            ).where(SaldoHoras.organizacao_id == org)
        )
    ).first()

    contagem_maquinas = dict(
        (
            await db.execute(
                select(Maquina.situacao, func.count())
                .where(Maquina.organizacao_id == org, Maquina.deleted_at.is_(None))
                .group_by(Maquina.situacao)
            )
        ).all()
    )
    contagem_veiculos = dict(
        (
            await db.execute(
                select(Veiculo.situacao, func.count())
                .where(Veiculo.organizacao_id == org, Veiculo.deleted_at.is_(None))
                .group_by(Veiculo.situacao)
            )
        ).all()
    )

    def _disponiveis(contagem: dict) -> int:
        return sum(
            quantidade
            for situacao, quantidade in contagem.items()
            if situacao == SituacaoEquipamento.DISPONIVEL.value
        )

    def _em_manutencao(contagem: dict) -> int:
        return contagem.get(SituacaoEquipamento.EM_MANUTENCAO_PREVENTIVA.value, 0) + contagem.get(
            SituacaoEquipamento.EM_MANUTENCAO_CORRETIVA.value, 0
        )

    porteira = {
        "solicitacoes_pendentes": contagem_servicos.get(SituacaoServico.PROTOCOLADA.value, 0),
        "em_analise": contagem_servicos.get(SituacaoServico.EM_ANALISE.value, 0),
        "aguardando_vistoria": contagem_servicos.get(SituacaoServico.AGUARDANDO_VISTORIA.value, 0)
        + contagem_servicos.get(SituacaoServico.VISTORIA_AGENDADA.value, 0),
        "aprovadas": contagem_servicos.get(SituacaoServico.APROVADA.value, 0),
        "agendados": contagem_servicos.get(SituacaoServico.AGENDADA.value, 0),
        "em_execucao": contagem_servicos.get(SituacaoServico.EM_EXECUCAO.value, 0),
        "concluidos_periodo": await _contar(
            db,
            OrdemServico,
            OrdemServico.organizacao_id == org,
            OrdemServico.deleted_at.is_(None),
            OrdemServico.situacao == SituacaoOrdem.CONCLUIDA.value,
            OrdemServico.data_prevista >= inicio,
        ),
        "horas_autorizadas": float(horas[0] or 0),
        "horas_reservadas": float(horas[1] or 0),
        "horas_utilizadas": float(horas[2] or 0),
        "maquinas_disponiveis": _disponiveis(contagem_maquinas),
        "maquinas_em_operacao": contagem_maquinas.get(SituacaoEquipamento.EM_OPERACAO.value, 0),
        "maquinas_em_manutencao": _em_manutencao(contagem_maquinas),
        "caminhoes_disponiveis": _disponiveis(contagem_veiculos),
        "caminhoes_em_operacao": contagem_veiculos.get(SituacaoEquipamento.EM_OPERACAO.value, 0),
    }

    # ── Combustível (item 7.3) ──────────────────────────────────────────────
    consumo = (
        await db.execute(
            select(
                func.coalesce(func.sum(Abastecimento.quantidade_litros), 0),
                func.coalesce(func.sum(Abastecimento.valor_total), 0),
                func.count(),
            ).where(
                Abastecimento.organizacao_id == org,
                Abastecimento.deleted_at.is_(None),
                func.date(Abastecimento.abastecido_em) >= inicio,
            )
        )
    ).first()

    combustivel = {
        "litros_periodo": float(consumo[0] or 0),
        "custo_estimado": float(consumo[1] or 0),
        "abastecimentos": int(consumo[2] or 0),
        "com_inconsistencia": await _contar(
            db,
            Abastecimento,
            Abastecimento.organizacao_id == org,
            Abastecimento.deleted_at.is_(None),
            func.date(Abastecimento.abastecido_em) >= inicio,
            Abastecimento.alertas.is_not(None),
        ),
        "sem_ordem_servico": await _contar(
            db,
            Abastecimento,
            Abastecimento.organizacao_id == org,
            Abastecimento.deleted_at.is_(None),
            func.date(Abastecimento.abastecido_em) >= inicio,
            Abastecimento.ordem_id.is_(None),
        ),
        "tanques": [
            {
                "id": t.id,
                "nome": t.nome,
                "estoque_atual_litros": t.estoque_atual_litros,
                "capacidade_litros": t.capacidade_litros,
                "abaixo_do_minimo": t.abaixo_do_minimo,
                "ocupacao_percentual": (
                    round(100 * (t.estoque_atual_litros or 0) / t.capacidade_litros)
                    if t.capacidade_litros
                    else 0
                ),
            }
            for t in (
                await db.execute(
                    select(Tanque).where(Tanque.organizacao_id == org, Tanque.deleted_at.is_(None))
                )
            )
            .scalars()
            .all()
        ],
    }

    # ── Agenda do dia e próximos ────────────────────────────────────────────
    entregas_hoje = list(
        (
            await db.execute(
                select(SolicitacaoCacamba)
                .where(
                    *base_solicitacao,
                    SolicitacaoCacamba.data_prevista_entrega == hoje,
                    SolicitacaoCacamba.situacao.in_(SOLICITACAO_ATIVA),
                )
                .limit(15)
            )
        )
        .scalars()
        .all()
    )
    ordens_hoje = list(
        (
            await db.execute(
                select(OrdemServico)
                .where(
                    OrdemServico.organizacao_id == org,
                    OrdemServico.deleted_at.is_(None),
                    OrdemServico.data_prevista == hoje,
                    OrdemServico.situacao.in_(
                        [SituacaoOrdem.EMITIDA.value, SituacaoOrdem.EM_EXECUCAO.value]
                    ),
                )
                .limit(15)
            )
        )
        .scalars()
        .all()
    )

    agenda_hoje = [
        {
            "tipo": "entrega_cacamba",
            "id": s.id,
            "titulo": f"Entrega — {s.protocolo_formatado}",
            "detalhe": f"{s.logradouro or ''}, {s.numero or ''}".strip(", "),
            "situacao": s.situacao,
            "link": f"/solicitacoes/{s.id}",
        }
        for s in entregas_hoje
    ] + [
        {
            "tipo": "ordem_servico",
            "id": o.id,
            "titulo": f"Serviço — {o.numero_formatado}",
            "detalhe": f"Início previsto {o.hora_prevista_inicio or '—'}",
            "situacao": o.situacao,
            "link": f"/ordens/{o.id}",
        }
        for o in ordens_hoje
    ]

    proximos = list(
        (
            await db.execute(
                select(SolicitacaoCacamba)
                .where(
                    *base_solicitacao,
                    SolicitacaoCacamba.data_prevista_entrega > hoje,
                    SolicitacaoCacamba.data_prevista_entrega <= hoje + timedelta(days=7),
                    SolicitacaoCacamba.situacao.in_(SOLICITACAO_ATIVA),
                )
                .order_by(SolicitacaoCacamba.data_prevista_entrega)
                .limit(10)
            )
        )
        .scalars()
        .all()
    )

    # ── Alertas (item 7.4) ──────────────────────────────────────────────────
    limite_documento = int(
        await configuracoes.obter(db, org, "geral_alerta_documento_dias") or 30
    )
    limite_data = hoje + timedelta(days=limite_documento)

    documentos_vencendo = list(
        (
            await db.execute(
                select(Veiculo)
                .where(
                    Veiculo.organizacao_id == org,
                    Veiculo.deleted_at.is_(None),
                    or_(
                        Veiculo.licenciamento_ate <= limite_data,
                        Veiculo.seguro_ate <= limite_data,
                    ),
                )
                .limit(20)
            )
        )
        .scalars()
        .all()
    )
    cnh_vencendo = list(
        (
            await db.execute(
                select(Habilitacao)
                .where(
                    Habilitacao.organizacao_id == org,
                    Habilitacao.deleted_at.is_(None),
                    Habilitacao.cnh_validade.is_not(None),
                    Habilitacao.cnh_validade <= limite_data,
                )
                .limit(20)
            )
        )
        .scalars()
        .all()
    )
    manutencoes_proximas = list(
        (
            await db.execute(
                select(PlanoManutencao)
                .where(
                    PlanoManutencao.organizacao_id == org,
                    PlanoManutencao.deleted_at.is_(None),
                    PlanoManutencao.ativo.is_(True),
                    PlanoManutencao.proxima_data.is_not(None),
                    PlanoManutencao.proxima_data <= hoje + timedelta(days=30),
                )
                .limit(20)
            )
        )
        .scalars()
        .all()
    )

    alertas: list[dict] = []
    if atrasadas:
        alertas.append(
            {
                "nivel": "critico",
                "titulo": f"{atrasadas} caçamba(s) com retirada atrasada",
                "link": "/solicitacoes?atrasadas=true",
            }
        )
    for veiculo in documentos_vencendo:
        for rotulo_doc, vencimento in (
            ("licenciamento", veiculo.licenciamento_ate),
            ("seguro", veiculo.seguro_ate),
        ):
            if vencimento and vencimento <= limite_data:
                vencido = vencimento < hoje
                alertas.append(
                    {
                        "nivel": "critico" if vencido else "atencao",
                        "titulo": (
                            f"{veiculo.placa}: {rotulo_doc} "
                            f"{'vencido' if vencido else 'vence'} em "
                            f"{vencimento.strftime('%d/%m/%Y')}"
                        ),
                        "link": f"/veiculos/{veiculo.id}",
                    }
                )
    for habilitacao in cnh_vencendo:
        servidor = await db.get(User, habilitacao.user_id)
        vencida = habilitacao.cnh_validade < hoje
        alertas.append(
            {
                "nivel": "critico" if vencida else "atencao",
                "titulo": (
                    f"CNH de {servidor.nome if servidor else 'servidor'} "
                    f"{'vencida' if vencida else 'vence'} em "
                    f"{habilitacao.cnh_validade.strftime('%d/%m/%Y')}"
                ),
                "link": "/operadores",
            }
        )
    for plano in manutencoes_proximas:
        alertas.append(
            {
                "nivel": "atencao",
                "titulo": f"Manutenção preventiva: {plano.nome} em {plano.proxima_data.strftime('%d/%m/%Y')}",
                "link": "/manutencoes",
            }
        )
    for tanque in combustivel["tanques"]:
        if tanque["abaixo_do_minimo"]:
            alertas.append(
                {
                    "nivel": "atencao",
                    "titulo": f"Estoque baixo no tanque {tanque['nome']}",
                    "link": "/combustivel",
                }
            )

    aprovacoes_pendentes = (
        porteira["solicitacoes_pendentes"]
        + porteira["em_analise"]
        + cacambas["solicitacoes_pendentes"]
    )
    horas_adicionais_pendentes = await _contar(
        db,
        HorasAdicionais,
        HorasAdicionais.situacao.in_(
            [SituacaoHorasAdicionais.SOLICITADA.value, SituacaoHorasAdicionais.EM_ANALISE.value]
        ),
    )

    return {
        "periodo_dias": dias,
        "cacambas": cacambas,
        "porteira": porteira,
        "combustivel": combustivel,
        "agenda_hoje": agenda_hoje,
        "proximos_agendamentos": [
            {
                "id": s.id,
                "protocolo": s.protocolo_formatado,
                "data": s.data_prevista_entrega,
                "endereco": f"{s.logradouro or ''}, {s.numero or ''}".strip(", "),
                "situacao": s.situacao,
                "link": f"/solicitacoes/{s.id}",
            }
            for s in proximos
        ],
        "alertas": alertas,
        "pendencias": {
            "aguardando_aprovacao": aprovacoes_pendentes,
            "horas_adicionais": horas_adicionais_pendentes,
            "manutencoes_abertas": await _contar(
                db,
                Manutencao,
                Manutencao.organizacao_id == org,
                Manutencao.deleted_at.is_(None),
                Manutencao.situacao.notin_(
                    [SituacaoManutencao.CONCLUIDA.value, SituacaoManutencao.CANCELADA.value]
                ),
            ),
        },
        "cadastros": {
            "pessoas": await _contar(db, Pessoa, Pessoa.organizacao_id == org, Pessoa.deleted_at.is_(None)),
            "imoveis": await _contar(db, Imovel, Imovel.organizacao_id == org, Imovel.deleted_at.is_(None)),
            "maquinas": sum(contagem_maquinas.values()),
            "veiculos": sum(contagem_veiculos.values()),
        },
    }
