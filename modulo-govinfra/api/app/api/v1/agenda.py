"""Agenda consolidada e disponibilidade de recursos (itens 14 e 30)."""

import uuid
from datetime import date, datetime, time, timedelta, timezone

from fastapi import APIRouter, Depends, Query
from sqlalchemy import or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.v1.deps import com_rotulo
from app.core.auth import exigir
from app.core.database import get_db
from app.core.permissoes import P
from app.models.cacambas import Cacamba, SolicitacaoCacamba
from app.models.enums import (
    PESO_PRIORIDADE,
    SOLICITACAO_ATIVA,
    SituacaoOrdem,
)
from app.models.frota import Maquina, Veiculo
from app.models.organizacao import User
from app.models.pessoas import Imovel, Pessoa
from app.models.porteira import (
    Beneficiario,
    OrdemMaquina,
    OrdemServico,
    OrdemVeiculo,
    SolicitacaoServico,
)
from app.services import agenda as servico

router = APIRouter(prefix="/agenda", tags=["Agenda"])


@router.get("", summary="Agenda consolidada")
async def listar(
    inicio: date = Query(..., description="Primeiro dia da janela"),
    fim: date = Query(..., description="Último dia da janela"),
    tipo: str | None = Query(None, description="cacamba | servico"),
    cacamba_id: uuid.UUID | None = None,
    veiculo_id: uuid.UUID | None = None,
    maquina_id: uuid.UUID | None = None,
    operador_id: uuid.UUID | None = None,
    equipe: str | None = None,
    bairro: str | None = None,
    regiao_id: uuid.UUID | None = None,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(exigir(P.AGENDA_VISUALIZAR)),
):
    """Eventos de caçambas e do Porteira Adentro numa lista única.

    A mesma resposta alimenta as visões diária, semanal, mensal, de lista e de
    linha do tempo — a diferença fica no frontend.
    """
    if fim < inicio:
        inicio, fim = fim, inicio
    if (fim - inicio).days > 400:
        fim = inicio + timedelta(days=400)

    eventos: list[dict] = []

    # ── Entregas e retiradas de caçamba ─────────────────────────────────────
    if tipo in (None, "cacamba"):
        condicoes = [
            SolicitacaoCacamba.organizacao_id == user.organizacao_id,
            SolicitacaoCacamba.deleted_at.is_(None),
            SolicitacaoCacamba.situacao.in_(SOLICITACAO_ATIVA),
            or_(
                SolicitacaoCacamba.data_prevista_entrega.between(inicio, fim),
                SolicitacaoCacamba.data_prevista_retirada.between(inicio, fim),
            ),
        ]
        if cacamba_id:
            condicoes.append(SolicitacaoCacamba.cacamba_id == cacamba_id)
        if veiculo_id:
            condicoes.append(SolicitacaoCacamba.veiculo_id == veiculo_id)
        if equipe:
            condicoes.append(SolicitacaoCacamba.equipe == equipe)
        if bairro:
            condicoes.append(SolicitacaoCacamba.bairro.ilike(f"%{bairro}%"))
        if regiao_id:
            condicoes.append(SolicitacaoCacamba.regiao_id == regiao_id)

        solicitacoes = list(
            (await db.execute(select(SolicitacaoCacamba).where(*condicoes))).scalars().all()
        )
        pessoas = {}
        if solicitacoes:
            linhas = (
                await db.execute(
                    select(Pessoa.id, Pessoa.nome).where(
                        Pessoa.id.in_({s.pessoa_id for s in solicitacoes})
                    )
                )
            ).all()
            pessoas = {linha[0]: linha[1] for linha in linhas}

        for solicitacao in solicitacoes:
            cacamba = (
                await db.get(Cacamba, solicitacao.cacamba_id) if solicitacao.cacamba_id else None
            )
            veiculo = (
                await db.get(Veiculo, solicitacao.veiculo_id) if solicitacao.veiculo_id else None
            )
            comum = {
                "id": str(solicitacao.id),
                "tipo": "cacamba",
                "protocolo": solicitacao.protocolo_formatado,
                "solicitante": pessoas.get(solicitacao.pessoa_id),
                "endereco": f"{solicitacao.logradouro or ''}, {solicitacao.numero or ''}".strip(", "),
                "bairro": solicitacao.bairro,
                "cacamba": cacamba.codigo if cacamba else None,
                "veiculo": veiculo.placa if veiculo else None,
                "equipe": solicitacao.equipe,
                "situacao": solicitacao.situacao,
                "situacao_rotulo": com_rotulo(solicitacao.situacao),
                "prioridade": solicitacao.prioridade,
                "peso_prioridade": PESO_PRIORIDADE.get(solicitacao.prioridade, 1),
                "atrasada": solicitacao.atrasada,
                "latitude": solicitacao.latitude,
                "longitude": solicitacao.longitude,
                "link": f"/solicitacoes/{solicitacao.id}",
                "reagendavel": True,
            }
            if solicitacao.data_prevista_entrega and inicio <= solicitacao.data_prevista_entrega <= fim:
                eventos.append(
                    {**comum, "evento": "entrega", "data": solicitacao.data_prevista_entrega,
                     "titulo": f"Entrega {solicitacao.protocolo_formatado}"}
                )
            if solicitacao.data_prevista_retirada and inicio <= solicitacao.data_prevista_retirada <= fim:
                eventos.append(
                    {**comum, "evento": "retirada", "data": solicitacao.data_prevista_retirada,
                     "titulo": f"Retirada {solicitacao.protocolo_formatado}"}
                )

    # ── Ordens do Porteira Adentro ──────────────────────────────────────────
    if tipo in (None, "servico"):
        consulta = select(OrdemServico).where(
            OrdemServico.organizacao_id == user.organizacao_id,
            OrdemServico.deleted_at.is_(None),
            OrdemServico.data_prevista.between(inicio, fim),
            OrdemServico.situacao.in_(
                [
                    SituacaoOrdem.EMITIDA.value,
                    SituacaoOrdem.EM_EXECUCAO.value,
                    SituacaoOrdem.PAUSADA.value,
                ]
            ),
        )
        if maquina_id or operador_id:
            consulta = consulta.join(OrdemMaquina, OrdemMaquina.ordem_id == OrdemServico.id)
            if maquina_id:
                consulta = consulta.where(OrdemMaquina.maquina_id == maquina_id)
            if operador_id:
                consulta = consulta.where(OrdemMaquina.operador_id == operador_id)
            consulta = consulta.distinct()
        if veiculo_id:
            consulta = consulta.join(OrdemVeiculo, OrdemVeiculo.ordem_id == OrdemServico.id).where(
                OrdemVeiculo.veiculo_id == veiculo_id
            ).distinct()

        ordens = list((await db.execute(consulta)).scalars().all())
        for ordem in ordens:
            solicitacao = await db.get(SolicitacaoServico, ordem.solicitacao_id)
            beneficiario = (
                await db.get(Beneficiario, solicitacao.beneficiario_id) if solicitacao else None
            )
            pessoa = await db.get(Pessoa, beneficiario.pessoa_id) if beneficiario else None
            imovel = await db.get(Imovel, solicitacao.imovel_id) if solicitacao else None
            maquinas = list(
                (
                    await db.execute(
                        select(OrdemMaquina).where(OrdemMaquina.ordem_id == ordem.id)
                    )
                )
                .scalars()
                .all()
            )
            nomes_maquinas = []
            for item in maquinas:
                maquina = await db.get(Maquina, item.maquina_id)
                if maquina:
                    nomes_maquinas.append(maquina.codigo)

            eventos.append(
                {
                    "id": str(ordem.id),
                    "tipo": "servico",
                    "evento": "ordem_servico",
                    "data": ordem.data_prevista,
                    "hora_inicio": ordem.hora_prevista_inicio,
                    "hora_fim": ordem.hora_prevista_fim,
                    "titulo": f"Serviço {ordem.numero_formatado}",
                    "protocolo": solicitacao.protocolo_formatado if solicitacao else None,
                    "solicitante": pessoa.nome if pessoa else None,
                    "endereco": (imovel.nome or imovel.codigo) if imovel else None,
                    "bairro": (imovel.comunidade or imovel.bairro) if imovel else None,
                    "maquinas": nomes_maquinas,
                    "situacao": ordem.situacao,
                    "situacao_rotulo": com_rotulo(ordem.situacao),
                    "prioridade": solicitacao.prioridade if solicitacao else "normal",
                    "horas_autorizadas": ordem.horas_autorizadas,
                    "latitude": ordem.latitude,
                    "longitude": ordem.longitude,
                    "link": f"/ordens/{ordem.id}",
                    "reagendavel": ordem.situacao == SituacaoOrdem.EMITIDA.value,
                }
            )

    eventos.sort(key=lambda e: (e["data"], e.get("hora_inicio") or "", e["titulo"]))
    return {
        "inicio": inicio,
        "fim": fim,
        "total": len(eventos),
        "eventos": eventos,
        "legenda": [
            {"chave": "entrega", "rotulo": "Entrega de caçamba", "cor": "#1d4ed8", "icone": "caminhao"},
            {"chave": "retirada", "rotulo": "Retirada de caçamba", "cor": "#15803d", "icone": "seta"},
            {"chave": "ordem_servico", "rotulo": "Serviço rural", "cor": "#b45309", "icone": "trator"},
            {"chave": "atraso", "rotulo": "Em atraso", "cor": "#b91c1c", "icone": "alerta"},
        ],
    }


@router.get("/capacidade", summary="Capacidade por dia")
async def capacidade(
    inicio: date,
    fim: date,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(exigir(P.AGENDA_VISUALIZAR)),
):
    """Ocupação diária — usada para colorir o calendário e alimentar o motor
    de recomendação na tela."""
    if fim < inicio:
        inicio, fim = fim, inicio
    dias = min((fim - inicio).days, 120)

    resposta = []
    for deslocamento in range(dias + 1):
        dia = inicio + timedelta(days=deslocamento)
        cacambas = await servico.capacidade_do_dia(db, user.organizacao_id, dia)
        porteira = await servico.ocupacao_porteira_no_dia(db, user.organizacao_id, dia)
        resposta.append({"data": dia, "cacambas": cacambas, "porteira": porteira})
    return resposta


@router.get("/disponibilidade", summary="Recursos livres em um período")
async def disponibilidade(
    data: date,
    hora_inicio: str = Query("07:00", pattern=r"^\d{2}:\d{2}$"),
    hora_fim: str = Query("17:00", pattern=r"^\d{2}:\d{2}$"),
    db: AsyncSession = Depends(get_db),
    user: User = Depends(exigir(P.AGENDA_VISUALIZAR)),
):
    """Máquinas, veículos e caçambas livres — base do formulário de agendamento."""
    hi = [int(p) for p in hora_inicio.split(":")]
    hf = [int(p) for p in hora_fim.split(":")]
    inicio = datetime.combine(data, time(hi[0], hi[1])).replace(tzinfo=timezone.utc)
    fim = datetime.combine(data, time(hf[0], hf[1])).replace(tzinfo=timezone.utc)

    ocupados = await servico.recursos_ocupados(db, user.organizacao_id, inicio, fim)

    maquinas = list(
        (
            await db.execute(
                select(Maquina).where(
                    Maquina.organizacao_id == user.organizacao_id, Maquina.deleted_at.is_(None)
                )
            )
        )
        .scalars()
        .all()
    )
    veiculos = list(
        (
            await db.execute(
                select(Veiculo).where(
                    Veiculo.organizacao_id == user.organizacao_id, Veiculo.deleted_at.is_(None)
                )
            )
        )
        .scalars()
        .all()
    )
    cacambas = await servico.cacambas_livres(
        db, user.organizacao_id, entrega_em=data, retirada_prevista=data + timedelta(days=3)
    )

    return {
        "data": data,
        "maquinas": [
            {
                "id": m.id,
                "codigo": m.codigo,
                "nome": m.nome,
                "categoria": m.categoria.nome if m.categoria else None,
                "situacao": m.situacao,
                "livre": m.id not in ocupados["maquinas"],
                "motivo": (
                    None
                    if m.id not in ocupados["maquinas"]
                    else "Já alocada em outra ordem neste horário"
                ),
            }
            for m in maquinas
        ],
        "veiculos": [
            {
                "id": v.id,
                "codigo": v.codigo,
                "placa": v.placa,
                "nome": v.nome,
                "transporta_cacamba": v.transporta_cacamba,
                "situacao": v.situacao,
                "livre": v.id not in ocupados["veiculos"],
            }
            for v in veiculos
        ],
        "cacambas": [
            {
                "id": c.id,
                "codigo": c.codigo,
                "capacidade_m3": c.capacidade_m3,
                "situacao": c.situacao,
            }
            for c in cacambas
        ],
        "operadores_ocupados": len(ocupados["operadores"]),
        "motoristas_ocupados": len(ocupados["motoristas"]),
    }
