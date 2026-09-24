"""Ordens de serviço, execução no campo, viagens e horas adicionais
(itens 32 a 36).

Ponto central desta área: os totais da ordem são SEMPRE recalculados a partir
dos apontamentos individuais de cada máquina e caminhão. Ninguém digita "o
serviço levou 6 horas" — o número vem do que foi apontado.
"""

import uuid
from datetime import date, datetime, time, timezone

from fastapi import APIRouter, Depends, Query, Request, status
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.v1.deps import (
    Paginacao,
    buscar_da_organizacao,
    cliente,
    com_rotulo,
    nomes_de_usuarios,
    nova_versao,
    pagina_payload,
)
from app.core.auth import exigir, usuario_pode
from app.core.config import settings
from app.core.database import get_db
from app.core.errors import AppError, Conflict, NotFound, RegraNegocio
from app.core.permissoes import P, Perfil
from app.core.security import token_consulta
from app.models.enums import (
    AcaoAuditoria,
    MetodoDesconto,
    SituacaoEquipamento,
    SituacaoHorasAdicionais,
    SituacaoOrdem,
    SituacaoServico,
    TipoApontamento,
    TipoNotificacao,
)
from app.models.frota import Maquina, Veiculo
from app.models.organizacao import User
from app.models.pessoas import Imovel, Pessoa
from app.models.porteira import (
    Apontamento,
    Beneficiario,
    HistoricoSituacao,
    HorasAdicionais,
    OrdemMaquina,
    OrdemServico,
    OrdemVeiculo,
    Programa,
    SolicitacaoServico,
    TipoServico,
    Viagem,
)
from app.schemas import comuns
from app.schemas import porteira as esquemas
from app.services import (
    agenda,
    auditoria,
    banco_horas,
    notificacoes,
    protocolo,
)
from app.services import (
    arquivos as servico_arquivos,
)
from app.services import (
    combustivel as servico_combustivel,
)

router = APIRouter(prefix="/ordens", tags=["Ordens de serviço"])


# ─────────────────────────────────────────────────────────────────────────────
# Apoio
# ─────────────────────────────────────────────────────────────────────────────


def _horario(dia: date, hora: str) -> datetime:
    horas, minutos = (int(p) for p in hora.split(":"))
    return datetime.combine(dia, time(horas, minutos)).replace(tzinfo=timezone.utc)


async def _recalcular_totais(db: AsyncSession, ordem: OrdemServico) -> None:
    """Consolida os totais da ordem a partir dos apontamentos individuais.

    Chamado sempre que um recurso é apontado, corrigido ou removido. É o que
    garante que o total nunca divirja da soma das partes (item 34).
    """
    maquinas = list(
        (await db.execute(select(OrdemMaquina).where(OrdemMaquina.ordem_id == ordem.id)))
        .scalars()
        .all()
    )
    veiculos = list(
        (await db.execute(select(OrdemVeiculo).where(OrdemVeiculo.ordem_id == ordem.id)))
        .scalars()
        .all()
    )
    recursos = list(maquinas) + list(veiculos)

    ordem.horas_produtivas = round(sum(r.horas_produtivas or 0 for r in recursos), 2)
    ordem.horas_paradas = round(sum(r.horas_paradas or 0 for r in recursos), 2)
    ordem.horas_deslocamento = round(sum(r.horas_deslocamento or 0 for r in recursos), 2)
    ordem.horas_totais = round(
        ordem.horas_produtivas + ordem.horas_paradas + ordem.horas_deslocamento, 2
    )
    ordem.diesel_consumido_litros = round(sum(r.consumo_litros or 0 for r in recursos), 2)
    ordem.viagens_realizadas = int(sum(v.viagens or 0 for v in veiculos))
    await db.flush()


async def _horas_do_recurso(db: AsyncSession, recurso, coluna_id: str) -> None:
    """Soma os apontamentos de um recurso e grava nos campos consolidados."""
    filtro = (
        Apontamento.ordem_maquina_id == recurso.id
        if coluna_id == "maquina"
        else Apontamento.ordem_veiculo_id == recurso.id
    )
    linhas = (
        await db.execute(
            select(Apontamento.tipo, func.coalesce(func.sum(Apontamento.horas), 0))
            .where(filtro)
            .group_by(Apontamento.tipo)
        )
    ).all()
    totais = {tipo: float(valor or 0) for tipo, valor in linhas}
    recurso.horas_produtivas = round(totais.get(TipoApontamento.PRODUTIVA.value, 0), 2)
    recurso.horas_paradas = round(
        totais.get(TipoApontamento.PARADA.value, 0)
        + totais.get(TipoApontamento.ABASTECIMENTO.value, 0),
        2,
    )
    recurso.horas_deslocamento = round(totais.get(TipoApontamento.DESLOCAMENTO.value, 0), 2)
    await db.flush()


def _serializar_recurso(
    recurso, tipo: str, codigo: str | None, nome: str | None, responsavel: str | None
) -> dict:
    eh_maquina = tipo == "maquina"
    return {
        "id": recurso.id,
        "tipo": tipo,
        "recurso_id": recurso.maquina_id if eh_maquina else recurso.veiculo_id,
        "recurso_codigo": codigo,
        "recurso_nome": nome,
        "responsavel_id": recurso.operador_id if eh_maquina else recurso.motorista_id,
        "responsavel_nome": responsavel,
        "principal": getattr(recurso, "principal", False),
        "inicio_previsto": recurso.inicio_previsto,
        "fim_previsto": recurso.fim_previsto,
        "inicio_real": recurso.inicio_real,
        "fim_real": recurso.fim_real,
        "medidor_inicial": (
            recurso.horimetro_inicial if eh_maquina else recurso.km_inicial
        ),
        "medidor_final": recurso.horimetro_final if eh_maquina else recurso.km_final,
        "horas_produtivas": recurso.horas_produtivas,
        "horas_paradas": recurso.horas_paradas,
        "horas_deslocamento": recurso.horas_deslocamento,
        "horas_descontadas": recurso.horas_descontadas,
        "consumo_litros": recurso.consumo_litros,
        "viagens": getattr(recurso, "viagens", 0),
        "ocorrencias": recurso.ocorrencias,
        "excecao_habilitacao": recurso.excecao_habilitacao,
    }


# ─────────────────────────────────────────────────────────────────────────────
# Emissão
# ─────────────────────────────────────────────────────────────────────────────


@router.get("", summary="Listar ordens de serviço")
async def listar(
    situacao: list[str] | None = Query(None),
    data_inicio: date | None = None,
    data_fim: date | None = None,
    maquina_id: uuid.UUID | None = None,
    operador_id: uuid.UUID | None = None,
    termo: str | None = None,
    paginacao: Paginacao = Depends(),
    db: AsyncSession = Depends(get_db),
    user: User = Depends(exigir(P.ORDENS_VISUALIZAR)),
):
    condicoes = [
        OrdemServico.organizacao_id == user.organizacao_id,
        OrdemServico.deleted_at.is_(None),
    ]
    if situacao:
        condicoes.append(OrdemServico.situacao.in_(situacao))
    if data_inicio:
        condicoes.append(OrdemServico.data_prevista >= data_inicio)
    if data_fim:
        condicoes.append(OrdemServico.data_prevista <= data_fim)
    if termo:
        condicoes.append(OrdemServico.numero_formatado.ilike(f"%{termo}%"))

    consulta = select(OrdemServico).where(*condicoes)
    if maquina_id or operador_id:
        consulta = consulta.join(OrdemMaquina, OrdemMaquina.ordem_id == OrdemServico.id)
        if maquina_id:
            consulta = consulta.where(OrdemMaquina.maquina_id == maquina_id)
        if operador_id:
            consulta = consulta.where(OrdemMaquina.operador_id == operador_id)
        consulta = consulta.distinct()

    total = await db.scalar(select(func.count()).select_from(consulta.subquery())) or 0
    registros = list(
        (
            await db.execute(
                consulta.order_by(OrdemServico.data_prevista.desc())
                .offset(paginacao.offset)
                .limit(paginacao.por_pagina)
            )
        )
        .scalars()
        .all()
    )

    itens = []
    for ordem in registros:
        solicitacao = await db.get(SolicitacaoServico, ordem.solicitacao_id)
        beneficiario = (
            await db.get(Beneficiario, solicitacao.beneficiario_id) if solicitacao else None
        )
        pessoa = await db.get(Pessoa, beneficiario.pessoa_id) if beneficiario else None
        imovel = await db.get(Imovel, solicitacao.imovel_id) if solicitacao else None
        tipo = await db.get(TipoServico, solicitacao.tipo_servico_id) if solicitacao else None
        itens.append(
            {
                "id": ordem.id,
                "numero_formatado": ordem.numero_formatado,
                "situacao": ordem.situacao,
                "situacao_rotulo": com_rotulo(ordem.situacao),
                "data_prevista": ordem.data_prevista,
                "hora_prevista_inicio": ordem.hora_prevista_inicio,
                "protocolo": solicitacao.protocolo_formatado if solicitacao else None,
                "produtor": pessoa.nome if pessoa else None,
                "propriedade": (imovel.nome or imovel.codigo) if imovel else None,
                "tipo_servico": tipo.nome if tipo else None,
                "horas_autorizadas": ordem.horas_autorizadas,
                "horas_totais": ordem.horas_totais,
                "created_at": ordem.created_at,
                "latitude": ordem.latitude,
                "longitude": ordem.longitude,
            }
        )
    return pagina_payload(itens, total, paginacao)


@router.post("", status_code=status.HTTP_201_CREATED, summary="Emitir ordem de serviço")
async def emitir(
    dados: esquemas.OrdemEntrada,
    request: Request,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(exigir(P.ORDENS_EMITIR)),
):
    """Emite a ordem, valida a alocação e RESERVA as horas do produtor.

    A reserva acontece na mesma transação da emissão: se o saldo acabar entre a
    consulta e o salvamento, a ordem não é criada — nada de duas ordens
    consumindo as mesmas horas.
    """
    solicitacao = await buscar_da_organizacao(
        db, SolicitacaoServico, dados.solicitacao_id, user, "Solicitação não encontrada."
    )
    if solicitacao.situacao not in {
        SituacaoServico.APROVADA.value,
        SituacaoServico.AGUARDANDO_AGENDAMENTO.value,
        SituacaoServico.AGENDADA.value,
    }:
        raise Conflict(
            f"A solicitação está como '{com_rotulo(solicitacao.situacao)}'. "
            "Só é possível emitir ordem após a aprovação."
        )
    if not dados.maquinas and not dados.veiculos:
        raise AppError(
            "Informe ao menos uma máquina ou um caminhão para a ordem.", 422, "recursos_obrigatorios"
        )

    programa = await db.get(Programa, solicitacao.programa_id)
    beneficiario = await db.get(Beneficiario, solicitacao.beneficiario_id)
    tipo = await db.get(TipoServico, solicitacao.tipo_servico_id)
    imovel = await db.get(Imovel, solicitacao.imovel_id)
    if programa is None or beneficiario is None:
        raise NotFound("Programa ou beneficiário da solicitação não encontrado.")

    inicio = _horario(dados.data_prevista, dados.hora_prevista_inicio)
    fim = _horario(dados.data_prevista, dados.hora_prevista_fim)

    # Exceção de habilitação só vale se o gestor informou a justificativa no
    # próprio recurso e tem permissão para conceder exceções.
    permite_excecao = usuario_pode(user, P.BLOQUEIOS_EXCECAO) and any(
        r.excecao_habilitacao for r in list(dados.maquinas) + list(dados.veiculos)
    )

    conflitos = await agenda.validar_alocacao(
        db,
        user.organizacao_id,
        inicio=inicio,
        fim=fim,
        maquinas=[
            {"maquina_id": m.maquina_id, "operador_id": m.operador_id} for m in dados.maquinas
        ],
        veiculos=[
            {"veiculo_id": v.veiculo_id, "motorista_id": v.motorista_id} for v in dados.veiculos
        ],
        permitir_excecao_habilitacao=permite_excecao,
    )
    if conflitos and not dados.forcar:
        raise RegraNegocio(
            "Há conflitos que impedem a emissão desta ordem.",
            [c.dict() for c in conflitos],
            "conflito_agenda",
        )
    if conflitos and dados.forcar and not dados.justificativa:
        raise AppError(
            "Emitir a ordem apesar dos conflitos exige justificativa.",
            422,
            "justificativa_obrigatoria",
        )

    # Reserva das horas ANTES de criar a ordem — com a linha do saldo travada.
    saldo = None
    if tipo is not None and tipo.usa_banco_horas:
        saldo = await banco_horas.obter_ou_criar_saldo(
            db,
            organizacao_id=user.organizacao_id,
            programa=programa,
            beneficiario=beneficiario,
            imovel_id=solicitacao.imovel_id,
            travar=True,
        )

    ano, numero, formatado = await protocolo.numero_ordem(db, user.organizacao_id)

    ordem = OrdemServico(
        organizacao_id=user.organizacao_id,
        ano=ano,
        numero=numero,
        numero_formatado=formatado,
        solicitacao_id=solicitacao.id,
        token_consulta=token_consulta(),
        data_prevista=dados.data_prevista,
        hora_prevista_inicio=dados.hora_prevista_inicio,
        hora_prevista_fim=dados.hora_prevista_fim,
        horas_autorizadas=dados.horas_autorizadas,
        viagens_previstas=dados.viagens_previstas,
        combustivel_previsto_litros=dados.combustivel_previsto_litros,
        materiais=dados.materiais,
        orientacoes=dados.orientacoes,
        latitude=imovel.latitude if imovel else None,
        longitude=imovel.longitude if imovel else None,
        aprovada_por_id=user.id,
        situacao=SituacaoOrdem.EMITIDA.value,
        created_by_id=user.id,
        updated_by_id=user.id,
    )
    db.add(ordem)
    await db.flush()

    for item in dados.maquinas:
        db.add(
            OrdemMaquina(
                ordem_id=ordem.id,
                maquina_id=item.maquina_id,
                operador_id=item.operador_id,
                principal=item.principal,
                inicio_previsto=item.inicio_previsto or inicio,
                fim_previsto=item.fim_previsto or fim,
                excecao_habilitacao=item.excecao_habilitacao,
                created_by_id=user.id,
            )
        )
    for item in dados.veiculos:
        db.add(
            OrdemVeiculo(
                ordem_id=ordem.id,
                veiculo_id=item.veiculo_id,
                motorista_id=item.motorista_id,
                inicio_previsto=item.inicio_previsto or inicio,
                fim_previsto=item.fim_previsto or fim,
                excecao_habilitacao=item.excecao_habilitacao,
                created_by_id=user.id,
            )
        )
    await db.flush()

    if saldo is not None:
        await banco_horas.reservar(
            db,
            saldo,
            dados.horas_autorizadas,
            usuario_id=user.id,
            solicitacao_id=solicitacao.id,
            ordem_id=ordem.id,
            motivo=f"Reserva para a ordem {formatado}",
            chave_idempotencia=f"reserva-ordem-{ordem.id}",
        )
        await auditoria.registrar(
            db,
            acao=AcaoAuditoria.RESERVA_HORAS,
            usuario=user,
            entidade="ordem",
            entidade_id=ordem.id,
            entidade_descricao=formatado,
            detalhe=f"{dados.horas_autorizadas:g}h reservadas do banco de horas",
            cliente=cliente(request),
        )

    solicitacao.data_agendada = dados.data_prevista
    solicitacao.horas_autorizadas = dados.horas_autorizadas
    if solicitacao.situacao != SituacaoServico.AGENDADA.value:
        db.add(
            HistoricoSituacao(
                entidade="solicitacao_servico",
                entidade_id=solicitacao.id,
                situacao_anterior=solicitacao.situacao,
                situacao_nova=SituacaoServico.AGENDADA.value,
                observacoes=f"Ordem {formatado} emitida",
                created_by_id=user.id,
            )
        )
        solicitacao.situacao = SituacaoServico.AGENDADA.value
        nova_versao(solicitacao)

    await auditoria.registrar(
        db,
        acao=AcaoAuditoria.CRIAR,
        usuario=user,
        entidade="ordem",
        entidade_id=ordem.id,
        entidade_descricao=formatado,
        justificativa=dados.justificativa,
        dados_depois=auditoria.instantaneo(ordem),
        cliente=cliente(request),
    )
    await notificacoes.para_perfis(
        db,
        organizacao_id=user.organizacao_id,
        perfis=[Perfil.OPERADOR, Perfil.MOTORISTA],
        tipo=TipoNotificacao.ORDEM_EMITIDA,
        titulo=f"Ordem {formatado} para {dados.data_prevista.strftime('%d/%m/%Y')}",
        mensagem=(imovel.nome or imovel.codigo) if imovel else "Serviço agendado",
        entidade="ordem",
        entidade_id=ordem.id,
        link=f"/ordens/{ordem.id}",
    )
    await db.commit()

    return {
        "id": ordem.id,
        "numero": formatado,
        "url_consulta": f"{settings.PUBLIC_URL.rstrip('/')}/consulta/{ordem.token_consulta}",
        "mensagem": f"Ordem {formatado} emitida.",
        "conflitos_ignorados": [c.dict() for c in conflitos] if conflitos else [],
    }


@router.get("/{ordem_id}", summary="Detalhar ordem de serviço")
async def detalhar(
    ordem_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(exigir(P.ORDENS_VISUALIZAR)),
):
    ordem = await buscar_da_organizacao(db, OrdemServico, ordem_id, user, "Ordem não encontrada.")
    solicitacao = await db.get(SolicitacaoServico, ordem.solicitacao_id)
    beneficiario = await db.get(Beneficiario, solicitacao.beneficiario_id) if solicitacao else None
    pessoa = await db.get(Pessoa, beneficiario.pessoa_id) if beneficiario else None
    imovel = await db.get(Imovel, solicitacao.imovel_id) if solicitacao else None
    tipo = await db.get(TipoServico, solicitacao.tipo_servico_id) if solicitacao else None

    maquinas = list(
        (await db.execute(select(OrdemMaquina).where(OrdemMaquina.ordem_id == ordem.id)))
        .scalars()
        .all()
    )
    veiculos = list(
        (await db.execute(select(OrdemVeiculo).where(OrdemVeiculo.ordem_id == ordem.id)))
        .scalars()
        .all()
    )
    nomes = await nomes_de_usuarios(
        db,
        [m.operador_id for m in maquinas]
        + [v.motorista_id for v in veiculos]
        + [ordem.aprovada_por_id],
    )

    maquinas_out = []
    for item in maquinas:
        maquina = await db.get(Maquina, item.maquina_id)
        maquinas_out.append(
            _serializar_recurso(
                item,
                "maquina",
                maquina.codigo if maquina else None,
                maquina.nome if maquina else None,
                nomes.get(item.operador_id),
            )
        )
    veiculos_out = []
    for item in veiculos:
        veiculo = await db.get(Veiculo, item.veiculo_id)
        veiculos_out.append(
            _serializar_recurso(
                item,
                "veiculo",
                veiculo.codigo if veiculo else None,
                f"{veiculo.placa} — {veiculo.nome}" if veiculo else None,
                nomes.get(item.motorista_id),
            )
        )

    apontamentos = list(
        (
            await db.execute(
                select(Apontamento)
                .where(Apontamento.ordem_id == ordem.id)
                .order_by(Apontamento.inicio)
            )
        )
        .scalars()
        .all()
    )
    viagens = list(
        (await db.execute(select(Viagem).where(Viagem.ordem_id == ordem.id).order_by(Viagem.numero)))
        .scalars()
        .all()
    )
    adicionais = list(
        (
            await db.execute(
                select(HorasAdicionais)
                .where(HorasAdicionais.ordem_id == ordem.id)
                .order_by(HorasAdicionais.created_at.desc())
            )
        )
        .scalars()
        .all()
    )
    nomes_adicionais = await nomes_de_usuarios(
        db, [a.solicitante_id for a in adicionais] + [a.analisado_por_id for a in adicionais]
    )

    endereco = None
    if imovel:
        endereco = ", ".join(
            filter(None, [imovel.nome, imovel.comunidade or imovel.bairro, imovel.estrada_acesso])
        )

    return {
        "id": ordem.id,
        "ano": ordem.ano,
        "numero_formatado": ordem.numero_formatado,
        "situacao": ordem.situacao,
        "situacao_rotulo": com_rotulo(ordem.situacao),
        "solicitacao_id": ordem.solicitacao_id,
        "protocolo": solicitacao.protocolo_formatado if solicitacao else None,
        "produtor": pessoa.nome if pessoa else None,
        "produtor_telefone": pessoa.telefone if pessoa else None,
        "propriedade": (imovel.nome or imovel.codigo) if imovel else None,
        "endereco": endereco,
        "instrucoes_acesso": imovel.instrucoes_acesso if imovel else None,
        "tipo_servico": tipo.nome if tipo else None,
        "descricao": solicitacao.descricao if solicitacao else None,
        "data_prevista": ordem.data_prevista,
        "hora_prevista_inicio": ordem.hora_prevista_inicio,
        "hora_prevista_fim": ordem.hora_prevista_fim,
        "horas_autorizadas": ordem.horas_autorizadas,
        "viagens_previstas": ordem.viagens_previstas,
        "combustivel_previsto_litros": ordem.combustivel_previsto_litros,
        "materiais": ordem.materiais,
        "orientacoes": ordem.orientacoes,
        "iniciada_em": ordem.iniciada_em,
        "concluida_em": ordem.concluida_em,
        "horas_produtivas": ordem.horas_produtivas,
        "horas_paradas": ordem.horas_paradas,
        "horas_deslocamento": ordem.horas_deslocamento,
        "horas_totais": ordem.horas_totais,
        "horas_descontadas": ordem.horas_descontadas,
        "horas_nao_descontadas": ordem.horas_nao_descontadas,
        "diesel_consumido_litros": ordem.diesel_consumido_litros,
        "viagens_realizadas": ordem.viagens_realizadas,
        "servico_realizado": ordem.servico_realizado,
        "material_movimentado": ordem.material_movimentado,
        "ocorrencias": ordem.ocorrencias,
        "avaliacao": ordem.avaliacao,
        "observacoes": ordem.observacoes,
        "aprovada_por": nomes.get(ordem.aprovada_por_id),
        "motivo_cancelamento": ordem.motivo_cancelamento,
        "latitude": ordem.latitude,
        "longitude": ordem.longitude,
        "url_consulta": f"{settings.PUBLIC_URL.rstrip('/')}/consulta/{ordem.token_consulta}",
        "created_at": ordem.created_at,
        "row_version": ordem.row_version,
        "maquinas": maquinas_out,
        "veiculos": veiculos_out,
        "apontamentos": [
            {
                "id": a.id,
                "tipo": a.tipo,
                "inicio": a.inicio,
                "fim": a.fim,
                "horas": a.horas,
                "motivo": a.motivo,
                "descricao": a.descricao,
                "corrigido": a.corrigido,
                "justificativa_correcao": a.justificativa_correcao,
            }
            for a in apontamentos
        ],
        "viagens": [
            {
                "id": v.id,
                "numero": v.numero,
                "veiculo_id": v.veiculo_id,
                "motorista_id": v.motorista_id,
                "origem": v.origem,
                "destino": v.destino,
                "material": v.material,
                "quantidade_estimada_m3": v.quantidade_estimada_m3,
                "peso_kg": v.peso_kg,
                "km_inicial": v.km_inicial,
                "km_final": v.km_final,
                "km_percorridos": v.km_percorridos,
                "saida_em": v.saida_em,
                "chegada_em": v.chegada_em,
                "observacoes": v.observacoes,
                "created_at": v.created_at,
            }
            for v in viagens
        ],
        "horas_adicionais": [
            {
                "id": a.id,
                "ordem_id": a.ordem_id,
                "quantidade": a.quantidade,
                "justificativa": a.justificativa,
                "situacao": a.situacao,
                "solicitante": nomes_adicionais.get(a.solicitante_id),
                "analisado_por": nomes_adicionais.get(a.analisado_por_id),
                "analisado_em": a.analisado_em,
                "parecer": a.parecer,
                "saldo_disponivel_no_pedido": a.saldo_disponivel_no_pedido,
                "created_at": a.created_at,
            }
            for a in adicionais
        ],
        "arquivos": [
            servico_arquivos.resumo(a) for a in await servico_arquivos.listar(db, "ordem", ordem.id)
        ],
    }


# ─────────────────────────────────────────────────────────────────────────────
# Execução no campo (item 33)
# ─────────────────────────────────────────────────────────────────────────────


@router.post("/{ordem_id}/iniciar", summary="Iniciar execução do serviço")
async def iniciar(
    ordem_id: uuid.UUID,
    dados: esquemas.InicioExecucaoEntrada,
    request: Request,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(exigir(P.ORDENS_EXECUTAR)),
):
    ordem = await buscar_da_organizacao(db, OrdemServico, ordem_id, user, "Ordem não encontrada.")
    if ordem.situacao == SituacaoOrdem.CONCLUIDA.value:
        raise Conflict("Esta ordem já foi concluída.")
    if ordem.situacao == SituacaoOrdem.CANCELADA.value:
        raise Conflict("Esta ordem está cancelada.")

    momento = dados.inicio_em or datetime.now(timezone.utc)
    pode_corrigir = usuario_pode(user, P.MEDIDORES_CORRIGIR)

    # Máquina do operador (informada ou a única/principal da ordem).
    ordem_maquina = None
    if dados.maquina_id:
        ordem_maquina = await db.scalar(
            select(OrdemMaquina).where(
                OrdemMaquina.ordem_id == ordem.id, OrdemMaquina.maquina_id == dados.maquina_id
            )
        )
        if ordem_maquina is None:
            raise NotFound("A máquina informada não faz parte desta ordem.")
    else:
        ordem_maquina = await db.scalar(
            select(OrdemMaquina)
            .where(OrdemMaquina.ordem_id == ordem.id)
            .order_by(OrdemMaquina.principal.desc())
            .limit(1)
        )

    if ordem_maquina is not None:
        ordem_maquina.inicio_real = ordem_maquina.inicio_real or momento
        if dados.horimetro_inicial is not None:
            maquina = await db.get(Maquina, ordem_maquina.maquina_id)
            await servico_combustivel.registrar_leitura_medidor(
                db,
                maquina=maquina,
                veiculo=None,
                valor=dados.horimetro_inicial,
                origem="apontamento",
                usuario_id=user.id,
                pode_corrigir=pode_corrigir,
                justificativa=dados.justificativa_medidor,
                ordem_id=ordem.id,
            )
            ordem_maquina.horimetro_inicial = dados.horimetro_inicial
            if maquina is not None:
                maquina.situacao = SituacaoEquipamento.EM_OPERACAO.value

        db.add(
            Apontamento(
                ordem_id=ordem.id,
                ordem_maquina_id=ordem_maquina.id,
                tipo=TipoApontamento.PRODUTIVA.value,
                inicio=momento,
                latitude=dados.latitude,
                longitude=dados.longitude,
                descricao=dados.condicoes_encontradas,
                created_by_id=user.id,
            )
        )

    ordem_veiculo = None
    if dados.veiculo_id:
        ordem_veiculo = await db.scalar(
            select(OrdemVeiculo).where(
                OrdemVeiculo.ordem_id == ordem.id, OrdemVeiculo.veiculo_id == dados.veiculo_id
            )
        )
        if ordem_veiculo is not None:
            ordem_veiculo.inicio_real = ordem_veiculo.inicio_real or momento
            if dados.quilometragem_inicial is not None:
                veiculo = await db.get(Veiculo, ordem_veiculo.veiculo_id)
                await servico_combustivel.registrar_leitura_medidor(
                    db,
                    maquina=None,
                    veiculo=veiculo,
                    valor=dados.quilometragem_inicial,
                    origem="apontamento",
                    usuario_id=user.id,
                    pode_corrigir=pode_corrigir,
                    justificativa=dados.justificativa_medidor,
                    ordem_id=ordem.id,
                )
                ordem_veiculo.km_inicial = dados.quilometragem_inicial
                if veiculo is not None:
                    veiculo.situacao = SituacaoEquipamento.EM_OPERACAO.value

    if ordem.situacao != SituacaoOrdem.EM_EXECUCAO.value:
        ordem.situacao = SituacaoOrdem.EM_EXECUCAO.value
        ordem.iniciada_em = ordem.iniciada_em or momento
        nova_versao(ordem)

        solicitacao = await db.get(SolicitacaoServico, ordem.solicitacao_id)
        if solicitacao is not None and solicitacao.situacao in {
            SituacaoServico.AGENDADA.value,
            SituacaoServico.PAUSADA.value,
        }:
            db.add(
                HistoricoSituacao(
                    entidade="solicitacao_servico",
                    entidade_id=solicitacao.id,
                    situacao_anterior=solicitacao.situacao,
                    situacao_nova=SituacaoServico.EM_EXECUCAO.value,
                    observacoes=f"Execução iniciada pela ordem {ordem.numero_formatado}",
                    created_by_id=user.id,
                )
            )
            solicitacao.situacao = SituacaoServico.EM_EXECUCAO.value

    await auditoria.registrar(
        db,
        acao=AcaoAuditoria.INICIAR_SERVICO,
        usuario=user,
        entidade="ordem",
        entidade_id=ordem.id,
        entidade_descricao=ordem.numero_formatado,
        detalhe=f"Início às {momento.strftime('%H:%M')}",
        cliente=cliente(request),
    )
    await db.commit()
    return {"mensagem": "Serviço iniciado.", "iniciada_em": momento}


@router.post("/{ordem_id}/pausar", summary="Pausar execução")
async def pausar(
    ordem_id: uuid.UUID,
    dados: esquemas.PausaEntrada,
    request: Request,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(exigir(P.ORDENS_EXECUTAR)),
):
    """Fecha o apontamento produtivo em aberto e abre um de parada."""
    ordem = await buscar_da_organizacao(db, OrdemServico, ordem_id, user, "Ordem não encontrada.")
    if ordem.situacao != SituacaoOrdem.EM_EXECUCAO.value:
        raise Conflict("Só é possível pausar um serviço em execução.")

    momento = dados.momento or datetime.now(timezone.utc)
    await _fechar_apontamentos_abertos(db, ordem, momento, user)

    # Abre a parada para cada recurso já iniciado.
    maquinas = list(
        (
            await db.execute(
                select(OrdemMaquina).where(
                    OrdemMaquina.ordem_id == ordem.id, OrdemMaquina.inicio_real.is_not(None)
                )
            )
        )
        .scalars()
        .all()
    )
    for item in maquinas:
        db.add(
            Apontamento(
                ordem_id=ordem.id,
                ordem_maquina_id=item.id,
                tipo=TipoApontamento.PARADA.value,
                inicio=momento,
                motivo=dados.motivo,
                descricao=dados.descricao,
                latitude=dados.latitude,
                longitude=dados.longitude,
                created_by_id=user.id,
            )
        )

    ordem.situacao = SituacaoOrdem.PAUSADA.value
    nova_versao(ordem)

    await auditoria.registrar(
        db,
        acao=AcaoAuditoria.PAUSAR_SERVICO,
        usuario=user,
        entidade="ordem",
        entidade_id=ordem.id,
        entidade_descricao=ordem.numero_formatado,
        justificativa=dados.motivo,
        cliente=cliente(request),
    )
    await db.commit()
    return {"mensagem": f"Serviço pausado: {dados.motivo}."}


@router.post("/{ordem_id}/retomar", summary="Retomar execução")
async def retomar(
    ordem_id: uuid.UUID,
    request: Request,
    momento: datetime | None = None,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(exigir(P.ORDENS_EXECUTAR)),
):
    ordem = await buscar_da_organizacao(db, OrdemServico, ordem_id, user, "Ordem não encontrada.")
    if ordem.situacao != SituacaoOrdem.PAUSADA.value:
        raise Conflict("Esta ordem não está pausada.")

    agora = momento or datetime.now(timezone.utc)
    await _fechar_apontamentos_abertos(db, ordem, agora, user)

    maquinas = list(
        (
            await db.execute(
                select(OrdemMaquina).where(
                    OrdemMaquina.ordem_id == ordem.id, OrdemMaquina.inicio_real.is_not(None)
                )
            )
        )
        .scalars()
        .all()
    )
    for item in maquinas:
        db.add(
            Apontamento(
                ordem_id=ordem.id,
                ordem_maquina_id=item.id,
                tipo=TipoApontamento.PRODUTIVA.value,
                inicio=agora,
                created_by_id=user.id,
            )
        )

    ordem.situacao = SituacaoOrdem.EM_EXECUCAO.value
    nova_versao(ordem)
    await auditoria.registrar(
        db,
        acao=AcaoAuditoria.INICIAR_SERVICO,
        usuario=user,
        entidade="ordem",
        entidade_id=ordem.id,
        entidade_descricao=ordem.numero_formatado,
        detalhe="Serviço retomado",
        cliente=cliente(request),
    )
    await db.commit()
    return {"mensagem": "Serviço retomado."}


async def _fechar_apontamentos_abertos(
    db: AsyncSession, ordem: OrdemServico, momento: datetime, user: User
) -> None:
    """Fecha todo apontamento sem `fim`, calculando as horas decorridas."""
    abertos = list(
        (
            await db.execute(
                select(Apontamento).where(
                    Apontamento.ordem_id == ordem.id, Apontamento.fim.is_(None)
                )
            )
        )
        .scalars()
        .all()
    )
    for apontamento in abertos:
        inicio = apontamento.inicio
        if inicio.tzinfo is None:
            inicio = inicio.replace(tzinfo=timezone.utc)
        horas = max((momento - inicio).total_seconds() / 3600, 0)
        apontamento.fim = momento
        apontamento.horas = round(horas, 2)
    await db.flush()

    # Reconsolida cada recurso a partir dos apontamentos.
    for item in (
        await db.execute(select(OrdemMaquina).where(OrdemMaquina.ordem_id == ordem.id))
    ).scalars().all():
        await _horas_do_recurso(db, item, "maquina")
    for item in (
        await db.execute(select(OrdemVeiculo).where(OrdemVeiculo.ordem_id == ordem.id))
    ).scalars().all():
        await _horas_do_recurso(db, item, "veiculo")
    await _recalcular_totais(db, ordem)


@router.post("/{ordem_id}/concluir", summary="Concluir o serviço")
async def concluir(
    ordem_id: uuid.UUID,
    dados: esquemas.ConclusaoEntrada,
    request: Request,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(exigir(P.ORDENS_EXECUTAR)),
):
    """Encerra a execução, consolida as horas e debita o banco de horas.

    O desconto segue o método configurado no programa (item 26) e acontece na
    mesma transação — a ordem nunca fica concluída com o saldo intacto.
    """
    ordem = await buscar_da_organizacao(db, OrdemServico, ordem_id, user, "Ordem não encontrada.")
    if ordem.situacao == SituacaoOrdem.CONCLUIDA.value:
        raise Conflict("Esta ordem já foi concluída.")
    if ordem.situacao == SituacaoOrdem.CANCELADA.value:
        raise Conflict("Esta ordem está cancelada.")

    momento = dados.fim_em or datetime.now(timezone.utc)
    pode_corrigir = usuario_pode(user, P.MEDIDORES_CORRIGIR)

    await _fechar_apontamentos_abertos(db, ordem, momento, user)

    maquinas = list(
        (await db.execute(select(OrdemMaquina).where(OrdemMaquina.ordem_id == ordem.id)))
        .scalars()
        .all()
    )
    veiculos = list(
        (await db.execute(select(OrdemVeiculo).where(OrdemVeiculo.ordem_id == ordem.id)))
        .scalars()
        .all()
    )

    # Medidores finais e devolução dos equipamentos à disponibilidade.
    for item in maquinas:
        item.fim_real = item.fim_real or momento
        maquina = await db.get(Maquina, item.maquina_id)
        if dados.horimetro_final is not None and item.horimetro_final is None:
            await servico_combustivel.registrar_leitura_medidor(
                db,
                maquina=maquina,
                veiculo=None,
                valor=dados.horimetro_final,
                origem="apontamento",
                usuario_id=user.id,
                pode_corrigir=pode_corrigir,
                justificativa=dados.justificativa_medidor,
                ordem_id=ordem.id,
            )
            item.horimetro_final = dados.horimetro_final
        if maquina is not None and maquina.situacao == SituacaoEquipamento.EM_OPERACAO.value:
            maquina.situacao = SituacaoEquipamento.DISPONIVEL.value

    for item in veiculos:
        item.fim_real = item.fim_real or momento
        veiculo = await db.get(Veiculo, item.veiculo_id)
        if dados.quilometragem_final is not None and item.km_final is None:
            await servico_combustivel.registrar_leitura_medidor(
                db,
                maquina=None,
                veiculo=veiculo,
                valor=dados.quilometragem_final,
                origem="apontamento",
                usuario_id=user.id,
                pode_corrigir=pode_corrigir,
                justificativa=dados.justificativa_medidor,
                ordem_id=ordem.id,
            )
            item.km_final = dados.quilometragem_final
        if veiculo is not None and veiculo.situacao == SituacaoEquipamento.EM_OPERACAO.value:
            veiculo.situacao = SituacaoEquipamento.DISPONIVEL.value

    await _recalcular_totais(db, ordem)

    solicitacao = await db.get(SolicitacaoServico, ordem.solicitacao_id)
    programa = await db.get(Programa, solicitacao.programa_id) if solicitacao else None
    tipo = await db.get(TipoServico, solicitacao.tipo_servico_id) if solicitacao else None

    metodo = programa.metodo_desconto if programa else MetodoDesconto.GERAL.value
    if metodo == MetodoDesconto.ADMINISTRATIVO.value and dados.horas_descontar_manual is None:
        raise AppError(
            (
                "O programa usa desconto administrativo: informe quantas horas devem ser "
                "descontadas do banco e a justificativa."
            ),
            422,
            "horas_manuais_obrigatorias",
        )
    if metodo == MetodoDesconto.ADMINISTRATIVO.value and not dados.justificativa_horas:
        raise AppError(
            "O desconto administrativo exige justificativa.", 422, "justificativa_obrigatoria"
        )

    rateio = banco_horas.calcular_desconto(
        ordem,
        maquinas,
        veiculos,
        metodo,
        horas_manuais=dados.horas_descontar_manual,
        contar_paradas=dados.contar_horas_paradas,
        contar_deslocamento=dados.contar_horas_deslocamento,
    )

    # Grava o rateio individual e os totais.
    por_recurso = {item["recurso_id"]: item["horas_descontadas"] for item in rateio.detalhamento}
    for item in maquinas:
        item.horas_descontadas = por_recurso.get(str(item.maquina_id), 0)
    for item in veiculos:
        item.horas_descontadas = por_recurso.get(str(item.veiculo_id), 0)

    ordem.horas_descontadas = rateio.total_descontado
    ordem.horas_nao_descontadas = rateio.nao_descontado

    # Movimenta o banco de horas: libera a reserva e debita o realizado.
    saldo_final = None
    if tipo is not None and tipo.usa_banco_horas and ordem.horas_autorizadas:
        saldo = await banco_horas.garantir_saldo_para_ordem(db, ordem, travar=True)
        if saldo is not None:
            await banco_horas.liberar_reserva(
                db,
                saldo,
                ordem.horas_autorizadas,
                usuario_id=user.id,
                ordem_id=ordem.id,
                motivo=f"Liberação da reserva da ordem {ordem.numero_formatado}",
            )
            if rateio.total_descontado > 0:
                await banco_horas.utilizar(
                    db,
                    saldo,
                    rateio.total_descontado,
                    usuario_id=user.id,
                    ordem_id=ordem.id,
                    motivo=f"Horas realizadas na ordem {ordem.numero_formatado} (método {metodo})",
                    chave_idempotencia=f"utilizacao-ordem-{ordem.id}",
                )
            saldo_final = saldo.saldo_disponivel

    ordem.concluida_em = momento
    ordem.situacao = SituacaoOrdem.CONCLUIDA.value
    ordem.servico_realizado = dados.servico_realizado
    ordem.material_movimentado = dados.material_movimentado
    ordem.ocorrencias = dados.ocorrencias
    ordem.avaliacao = dados.avaliacao
    ordem.observacoes = dados.observacoes
    nova_versao(ordem)

    if solicitacao is not None and solicitacao.situacao != SituacaoServico.CONCLUIDA.value:
        db.add(
            HistoricoSituacao(
                entidade="solicitacao_servico",
                entidade_id=solicitacao.id,
                situacao_anterior=solicitacao.situacao,
                situacao_nova=SituacaoServico.CONCLUIDA.value,
                observacoes=f"Ordem {ordem.numero_formatado} concluída",
                created_by_id=user.id,
            )
        )
        solicitacao.situacao = SituacaoServico.CONCLUIDA.value

    for assinatura, papel in (
        (dados.assinatura_produtor, "produtor"),
        (dados.assinatura_operador, "operador"),
    ):
        if assinatura is not None:
            from app.api.v1.solicitacoes import _guardar_assinatura

            await _guardar_assinatura(db, user, "ordem", ordem.id, assinatura, request)

    await auditoria.registrar(
        db,
        acao=AcaoAuditoria.CONCLUIR_SERVICO,
        usuario=user,
        entidade="ordem",
        entidade_id=ordem.id,
        entidade_descricao=ordem.numero_formatado,
        justificativa=dados.justificativa_horas,
        detalhe=(
            f"{rateio.total_apontado:g}h apontadas, {rateio.total_descontado:g}h descontadas "
            f"(método {metodo})"
        ),
        dados_depois={
            "horas_produtivas": ordem.horas_produtivas,
            "horas_paradas": ordem.horas_paradas,
            "horas_deslocamento": ordem.horas_deslocamento,
            "horas_descontadas": ordem.horas_descontadas,
        },
        cliente=cliente(request),
    )
    await db.commit()

    return {
        "mensagem": "Serviço concluído.",
        "horas": rateio.dict(),
        "saldo_disponivel": saldo_final,
        "totais": {
            "horas_produtivas": ordem.horas_produtivas,
            "horas_paradas": ordem.horas_paradas,
            "horas_deslocamento": ordem.horas_deslocamento,
            "horas_totais": ordem.horas_totais,
            "viagens": ordem.viagens_realizadas,
            "diesel_litros": ordem.diesel_consumido_litros,
        },
    }


@router.post("/{ordem_id}/cancelar", summary="Cancelar ordem de serviço")
async def cancelar(
    ordem_id: uuid.UUID,
    dados: comuns.Justificativa,
    request: Request,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(exigir(P.ORDENS_EMITIR)),
):
    ordem = await buscar_da_organizacao(db, OrdemServico, ordem_id, user, "Ordem não encontrada.")
    if ordem.situacao == SituacaoOrdem.CONCLUIDA.value:
        raise Conflict("Uma ordem concluída não pode ser cancelada.")

    # Devolve as horas reservadas.
    solicitacao = await db.get(SolicitacaoServico, ordem.solicitacao_id)
    tipo = await db.get(TipoServico, solicitacao.tipo_servico_id) if solicitacao else None
    if tipo is not None and tipo.usa_banco_horas and ordem.horas_autorizadas:
        saldo = await banco_horas.garantir_saldo_para_ordem(db, ordem, travar=True)
        if saldo is not None:
            await banco_horas.liberar_reserva(
                db,
                saldo,
                ordem.horas_autorizadas,
                usuario_id=user.id,
                ordem_id=ordem.id,
                motivo=f"Cancelamento da ordem {ordem.numero_formatado}",
            )

    ordem.situacao = SituacaoOrdem.CANCELADA.value
    ordem.motivo_cancelamento = dados.justificativa
    nova_versao(ordem)

    await auditoria.registrar(
        db,
        acao=AcaoAuditoria.CANCELAR,
        usuario=user,
        entidade="ordem",
        entidade_id=ordem.id,
        entidade_descricao=ordem.numero_formatado,
        justificativa=dados.justificativa,
        cliente=cliente(request),
    )
    await db.commit()
    return {"mensagem": "Ordem cancelada e horas devolvidas ao produtor."}


# ─────────────────────────────────────────────────────────────────────────────
# Viagens (item 36)
# ─────────────────────────────────────────────────────────────────────────────


@router.post("/{ordem_id}/viagens", status_code=status.HTTP_201_CREATED, summary="Registrar viagem")
async def registrar_viagem(
    ordem_id: uuid.UUID,
    dados: esquemas.ViagemEntrada,
    request: Request,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(exigir(P.VIAGENS_REGISTRAR)),
):
    ordem = await buscar_da_organizacao(db, OrdemServico, ordem_id, user, "Ordem não encontrada.")
    ordem_veiculo = await db.scalar(
        select(OrdemVeiculo).where(
            OrdemVeiculo.ordem_id == ordem.id, OrdemVeiculo.veiculo_id == dados.veiculo_id
        )
    )
    if ordem_veiculo is None:
        raise NotFound("Este veículo não faz parte da ordem de serviço.")

    ultimo = await db.scalar(
        select(func.coalesce(func.max(Viagem.numero), 0)).where(
            Viagem.ordem_id == ordem.id, Viagem.veiculo_id == dados.veiculo_id
        )
    )
    viagem = Viagem(
        ordem_id=ordem.id,
        numero=int(ultimo or 0) + 1,
        created_by_id=user.id,
        **dados.model_dump(),
    )
    db.add(viagem)
    await db.flush()

    # Atualiza a quilometragem do veículo com o valor final da viagem.
    if dados.km_final is not None:
        veiculo = await db.get(Veiculo, dados.veiculo_id)
        await servico_combustivel.registrar_leitura_medidor(
            db,
            maquina=None,
            veiculo=veiculo,
            valor=dados.km_final,
            origem="viagem",
            usuario_id=user.id,
            pode_corrigir=usuario_pode(user, P.MEDIDORES_CORRIGIR),
            ordem_id=ordem.id,
        )

    total = await db.scalar(
        select(func.count()).select_from(Viagem).where(
            Viagem.ordem_id == ordem.id, Viagem.veiculo_id == dados.veiculo_id
        )
    ) or 0
    ordem_veiculo.viagens = int(total)
    await _recalcular_totais(db, ordem)

    await auditoria.registrar(
        db,
        acao=AcaoAuditoria.CRIAR,
        usuario=user,
        entidade="viagem",
        entidade_id=viagem.id,
        entidade_descricao=f"Viagem {viagem.numero} da ordem {ordem.numero_formatado}",
        dados_depois=auditoria.instantaneo(viagem),
        cliente=cliente(request),
    )
    await db.commit()
    return {
        "id": viagem.id,
        "numero": viagem.numero,
        "km_percorridos": viagem.km_percorridos,
        "mensagem": f"Viagem {viagem.numero} registrada.",
    }


# ─────────────────────────────────────────────────────────────────────────────
# Horas adicionais (item 35)
# ─────────────────────────────────────────────────────────────────────────────


@router.post(
    "/{ordem_id}/horas-adicionais",
    status_code=status.HTTP_201_CREATED,
    summary="Solicitar horas adicionais",
)
async def solicitar_horas_adicionais(
    ordem_id: uuid.UUID,
    dados: esquemas.HorasAdicionaisEntrada,
    request: Request,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(exigir(P.HORAS_ADICIONAIS_SOLICITAR)),
):
    """O operador pede; o sistema NÃO aumenta as horas sozinho."""
    ordem = await buscar_da_organizacao(db, OrdemServico, ordem_id, user, "Ordem não encontrada.")
    if ordem.situacao not in {SituacaoOrdem.EM_EXECUCAO.value, SituacaoOrdem.PAUSADA.value}:
        raise Conflict("Horas adicionais só podem ser pedidas durante a execução do serviço.")

    solicitacao = await db.get(SolicitacaoServico, ordem.solicitacao_id)
    programa = await db.get(Programa, solicitacao.programa_id) if solicitacao else None
    if programa is not None and not programa.permite_horas_adicionais:
        raise Conflict("Este programa não permite horas adicionais.")
    if (
        programa is not None
        and programa.limite_horas_adicionais
        and dados.quantidade > programa.limite_horas_adicionais
    ):
        raise AppError(
            (
                f"O programa permite no máximo {programa.limite_horas_adicionais:g}h adicionais "
                "por serviço."
            ),
            422,
            "limite_excedido",
        )

    saldo = await banco_horas.garantir_saldo_para_ordem(db, ordem, travar=False)

    pedido = HorasAdicionais(
        ordem_id=ordem.id,
        solicitante_id=user.id,
        quantidade=dados.quantidade,
        justificativa=dados.justificativa,
        situacao=SituacaoHorasAdicionais.SOLICITADA.value,
        saldo_disponivel_no_pedido=saldo.saldo_disponivel if saldo else None,
        created_by_id=user.id,
    )
    db.add(pedido)
    ordem.situacao = SituacaoOrdem.PAUSADA.value
    await db.flush()

    await notificacoes.para_perfis(
        db,
        organizacao_id=user.organizacao_id,
        perfis=[Perfil.GESTOR],
        tipo=TipoNotificacao.HORAS_ADICIONAIS_SOLICITADAS,
        titulo=f"{dados.quantidade:g}h adicionais pedidas na ordem {ordem.numero_formatado}",
        mensagem=dados.justificativa,
        entidade="ordem",
        entidade_id=ordem.id,
        link=f"/ordens/{ordem.id}",
    )
    await auditoria.registrar(
        db,
        acao=AcaoAuditoria.CRIAR,
        usuario=user,
        entidade="horas_adicionais",
        entidade_id=pedido.id,
        entidade_descricao=f"Pedido de {dados.quantidade}h na ordem {ordem.numero_formatado}",
        justificativa=dados.justificativa,
        cliente=cliente(request),
    )
    await db.commit()
    return {
        "id": pedido.id,
        "mensagem": "Pedido enviado ao gestor. O serviço ficou pausado aguardando a decisão.",
        "saldo_disponivel": saldo.saldo_disponivel if saldo else None,
    }


@router.post("/horas-adicionais/{pedido_id}/analisar", summary="Aprovar ou rejeitar horas adicionais")
async def analisar_horas_adicionais(
    pedido_id: uuid.UUID,
    dados: esquemas.HorasAdicionaisAnalise,
    request: Request,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(exigir(P.HORAS_ADICIONAIS_APROVAR)),
):
    pedido = await db.get(HorasAdicionais, pedido_id)
    if pedido is None:
        raise NotFound("Pedido não encontrado.")
    ordem = await buscar_da_organizacao(db, OrdemServico, pedido.ordem_id, user, "Ordem não encontrada.")
    if pedido.situacao not in {
        SituacaoHorasAdicionais.SOLICITADA.value,
        SituacaoHorasAdicionais.EM_ANALISE.value,
    }:
        raise Conflict("Este pedido já foi analisado.")

    pedido.analisado_por_id = user.id
    pedido.analisado_em = datetime.now(timezone.utc)
    pedido.parecer = dados.parecer

    if not dados.aprovar:
        pedido.situacao = SituacaoHorasAdicionais.REJEITADA.value
        await auditoria.registrar(
            db,
            acao=AcaoAuditoria.REPROVAR,
            usuario=user,
            entidade="horas_adicionais",
            entidade_id=pedido.id,
            entidade_descricao=f"Pedido de {pedido.quantidade}h",
            justificativa=dados.parecer,
            cliente=cliente(request),
        )
        await db.commit()
        return {"mensagem": "Pedido de horas adicionais rejeitado."}

    # Aprovado: credita as horas e amplia a reserva da ordem.
    saldo = await banco_horas.garantir_saldo_para_ordem(db, ordem, travar=True)
    if saldo is not None:
        await banco_horas.adicionar_horas_extras(
            db,
            saldo,
            pedido.quantidade,
            usuario_id=user.id,
            ordem_id=ordem.id,
            motivo=f"Horas adicionais aprovadas na ordem {ordem.numero_formatado}",
        )
        await banco_horas.reservar(
            db,
            saldo,
            pedido.quantidade,
            usuario_id=user.id,
            ordem_id=ordem.id,
            motivo=f"Reserva das horas adicionais da ordem {ordem.numero_formatado}",
            chave_idempotencia=f"reserva-adicional-{pedido.id}",
        )

    pedido.situacao = SituacaoHorasAdicionais.APROVADA.value
    ordem.horas_autorizadas = round((ordem.horas_autorizadas or 0) + pedido.quantidade, 2)
    nova_versao(ordem)

    await auditoria.registrar(
        db,
        acao=AcaoAuditoria.APROVAR,
        usuario=user,
        entidade="horas_adicionais",
        entidade_id=pedido.id,
        entidade_descricao=f"{pedido.quantidade}h adicionais na ordem {ordem.numero_formatado}",
        detalhe=dados.parecer,
        dados_depois={"horas_autorizadas": ordem.horas_autorizadas},
        cliente=cliente(request),
    )
    await notificacoes.criar(
        db,
        organizacao_id=user.organizacao_id,
        tipo=TipoNotificacao.HORAS_ADICIONAIS_APROVADAS,
        titulo=f"{pedido.quantidade:g}h adicionais aprovadas",
        mensagem=f"A ordem {ordem.numero_formatado} pode ser retomada.",
        destinatario_id=pedido.solicitante_id,
        entidade="ordem",
        entidade_id=ordem.id,
        link=f"/ordens/{ordem.id}",
    )
    await db.commit()
    return {
        "mensagem": f"{pedido.quantidade:g}h adicionais aprovadas.",
        "horas_autorizadas": ordem.horas_autorizadas,
    }
