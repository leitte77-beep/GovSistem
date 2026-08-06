"""Solicitações de caçamba: cadastro, análise, agendamento, entrega e retirada
(itens 12 a 17).

Toda regra de negócio é aplicada aqui, no backend, mesmo quando a tela já
avisou o atendente. Transições de situação seguem o mapa `TRANSICOES_SOLICITACAO`
— não há caminho para gravar uma situação arbitrária.
"""

import uuid
from datetime import date, datetime, timedelta, timezone

from fastapi import APIRouter, Depends, Query, Request, status
from sqlalchemy import func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.v1.cacambas import registrar_movimentacao
from app.api.v1.deps import (
    Paginacao,
    buscar_da_organizacao,
    cliente,
    com_rotulo,
    documento_visivel,
    nomes_de_usuarios,
    nova_versao,
    pagina_payload,
)
from app.core.auth import exigir, usuario_pode
from app.core.br_validators import chave_busca
from app.core.database import get_db
from app.core.errors import AppError, Conflict, NotFound, RegraNegocio
from app.core.permissoes import P, Perfil
from app.models.arquivos import Assinatura
from app.models.cacambas import (
    Cacamba,
    EntregaCacamba,
    RetiradaCacamba,
    SolicitacaoCacamba,
    TipoResiduo,
)
from app.models.enums import (
    SOLICITACAO_ATIVA,
    TRANSICOES_SOLICITACAO,
    AcaoAuditoria,
    DestinoRetirada,
    SituacaoCacamba,
    SituacaoSolicitacao,
    TipoNotificacao,
)
from app.models.organizacao import User
from app.models.pessoas import Imovel, Pessoa
from app.models.porteira import HistoricoSituacao
from app.schemas import cacambas as esquemas
from app.schemas import comuns
from app.services import (
    agenda,
    auditoria,
    configuracoes,
    elegibilidade,
    notificacoes,
    protocolo,
    recomendacao,
)
from app.services import (
    arquivos as servico_arquivos,
)

router = APIRouter(prefix="/solicitacoes", tags=["Solicitações de caçamba"])


# ─────────────────────────────────────────────────────────────────────────────
# Apoio
# ─────────────────────────────────────────────────────────────────────────────


async def _transicionar(
    db: AsyncSession,
    solicitacao: SolicitacaoCacamba,
    nova: str,
    usuario: User,
    *,
    justificativa: str | None = None,
    observacoes: str | None = None,
) -> None:
    """Aplica a transição validando o mapa de estados (item 12.2)."""
    atual = solicitacao.situacao
    permitidas = TRANSICOES_SOLICITACAO.get(atual, set())
    if nova != atual and nova not in permitidas:
        raise Conflict(
            (
                f"Não é possível mudar a situação de '{com_rotulo(atual)}' para "
                f"'{com_rotulo(nova)}'. Transições permitidas: "
                + (", ".join(sorted(com_rotulo(p) for p in permitidas)) or "nenhuma")
                + "."
            ),
            "transicao_invalida",
        )

    db.add(
        HistoricoSituacao(
            entidade="solicitacao_cacamba",
            entidade_id=solicitacao.id,
            situacao_anterior=atual,
            situacao_nova=nova,
            justificativa=justificativa,
            observacoes=observacoes,
            created_by_id=usuario.id,
        )
    )
    solicitacao.situacao = nova
    solicitacao.updated_by_id = usuario.id
    nova_versao(solicitacao)


async def _guardar_assinatura(
    db: AsyncSession,
    user: User,
    entidade: str,
    entidade_id: uuid.UUID,
    dados: comuns.AssinaturaEntrada | None,
    request: Request,
) -> None:
    if dados is None:
        return
    info = cliente(request)
    db.add(
        Assinatura(
            organizacao_id=user.organizacao_id,
            entidade=entidade,
            entidade_id=entidade_id,
            papel=dados.papel,
            nome_assinante=dados.nome_assinante,
            documento_assinante=dados.documento_assinante,
            metodo=dados.metodo,
            imagem_base64=dados.imagem_base64,
            assinado_em=datetime.now(timezone.utc),
            ip=info.get("ip"),
            dispositivo=info.get("dispositivo"),
            latitude=dados.latitude,
            longitude=dados.longitude,
            observacao=dados.observacao,
            created_by_id=user.id,
        )
    )


def _resumo(solicitacao: SolicitacaoCacamba, nomes: dict) -> dict:
    atraso = 0
    if solicitacao.atrasada and solicitacao.data_prevista_retirada:
        atraso = (date.today() - solicitacao.data_prevista_retirada).days
    return {
        "id": solicitacao.id,
        "protocolo_formatado": solicitacao.protocolo_formatado,
        "situacao": solicitacao.situacao,
        "situacao_rotulo": com_rotulo(solicitacao.situacao),
        "prioridade": solicitacao.prioridade,
        "solicitante": nomes.get(solicitacao.pessoa_id),
        "logradouro": solicitacao.logradouro,
        "numero": solicitacao.numero,
        "bairro": solicitacao.bairro,
        "data_agendada": solicitacao.data_agendada,
        "data_prevista_entrega": solicitacao.data_prevista_entrega,
        "data_prevista_retirada": solicitacao.data_prevista_retirada,
        "cacamba_codigo": solicitacao.cacamba.codigo if solicitacao.cacamba else None,
        "atrasada": solicitacao.atrasada,
        "dias_atraso": max(atraso, 0),
        "created_at": solicitacao.created_at,
        "latitude": solicitacao.latitude,
        "longitude": solicitacao.longitude,
    }


async def _nomes_solicitantes(db: AsyncSession, solicitacoes: list[SolicitacaoCacamba]) -> dict:
    ids = {s.pessoa_id for s in solicitacoes if s.pessoa_id}
    if not ids:
        return {}
    linhas = (await db.execute(select(Pessoa.id, Pessoa.nome).where(Pessoa.id.in_(ids)))).all()
    return {linha[0]: linha[1] for linha in linhas}


# ─────────────────────────────────────────────────────────────────────────────
# Listagem e cadastro
# ─────────────────────────────────────────────────────────────────────────────


@router.get("", summary="Listar solicitações")
async def listar(
    situacao: list[str] | None = Query(None, description="Uma ou mais situações"),
    pessoa_id: uuid.UUID | None = None,
    cacamba_id: uuid.UUID | None = None,
    bairro: str | None = None,
    prioridade: str | None = None,
    atrasadas: bool = Query(False, description="Somente atendimentos com retirada vencida"),
    ativas: bool = Query(False, description="Somente atendimentos em andamento"),
    entrega_em: date | None = Query(None, description="Entregas previstas para a data"),
    retirada_em: date | None = Query(None, description="Retiradas previstas para a data"),
    termo: str | None = None,
    paginacao: Paginacao = Depends(),
    db: AsyncSession = Depends(get_db),
    user: User = Depends(exigir(P.SOLICITACOES_VISUALIZAR)),
):
    condicoes = [
        SolicitacaoCacamba.organizacao_id == user.organizacao_id,
        SolicitacaoCacamba.deleted_at.is_(None),
    ]
    if situacao:
        condicoes.append(SolicitacaoCacamba.situacao.in_(situacao))
    if ativas:
        condicoes.append(SolicitacaoCacamba.situacao.in_(SOLICITACAO_ATIVA))
    if pessoa_id:
        condicoes.append(SolicitacaoCacamba.pessoa_id == pessoa_id)
    if cacamba_id:
        condicoes.append(SolicitacaoCacamba.cacamba_id == cacamba_id)
    if bairro:
        condicoes.append(SolicitacaoCacamba.bairro.ilike(f"%{bairro}%"))
    if prioridade:
        condicoes.append(SolicitacaoCacamba.prioridade == prioridade)
    if entrega_em:
        condicoes.append(SolicitacaoCacamba.data_prevista_entrega == entrega_em)
    if retirada_em:
        condicoes.append(SolicitacaoCacamba.data_prevista_retirada == retirada_em)
    if atrasadas:
        condicoes.extend(
            [
                SolicitacaoCacamba.data_prevista_retirada < date.today(),
                SolicitacaoCacamba.situacao.in_(
                    [SituacaoSolicitacao.EM_USO.value, SituacaoSolicitacao.AGUARDANDO_RETIRADA.value]
                ),
            ]
        )
    if termo:
        condicoes.append(
            or_(
                SolicitacaoCacamba.protocolo_formatado.ilike(f"%{termo}%"),
                SolicitacaoCacamba.logradouro.ilike(f"%{termo}%"),
            )
        )

    consulta = select(SolicitacaoCacamba).where(*condicoes)
    total = await db.scalar(select(func.count()).select_from(consulta.subquery())) or 0
    registros = list(
        (
            await db.execute(
                consulta.order_by(SolicitacaoCacamba.created_at.desc())
                .offset(paginacao.offset)
                .limit(paginacao.por_pagina)
            )
        )
        .scalars()
        .all()
    )
    nomes = await _nomes_solicitantes(db, registros)
    return pagina_payload([_resumo(s, nomes) for s in registros], total, paginacao)


@router.post("", status_code=status.HTTP_201_CREATED, summary="Registrar solicitação de caçamba")
async def criar(
    dados: esquemas.SolicitacaoEntrada,
    request: Request,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(exigir(P.SOLICITACOES_CRIAR)),
):
    """Cria a solicitação aplicando todas as regras do item 13.

    Rascunho não passa pelas validações de confirmação — é justamente o
    mecanismo para o atendente salvar e continuar depois.
    """
    pessoa = await buscar_da_organizacao(db, Pessoa, dados.pessoa_id, user, "Cidadão não encontrado.")
    imovel = (
        await buscar_da_organizacao(db, Imovel, dados.imovel_id, user, "Imóvel não encontrado.")
        if dados.imovel_id
        else None
    )

    residuo: TipoResiduo | None = None
    if dados.tipo_residuo_id:
        residuo = await buscar_da_organizacao(
            db, TipoResiduo, dados.tipo_residuo_id, user, "Tipo de resíduo não encontrado."
        )

    padroes = await configuracoes.obter_varias(
        db, user.organizacao_id, ["cacamba_periodo_padrao_dias"]
    )
    dias = dados.dias_previstos or int(padroes["cacamba_periodo_padrao_dias"] or 3)

    # Endereço: usa o informado ou herda do imóvel.
    logradouro = dados.logradouro or (imovel.logradouro if imovel else None)
    numero = dados.numero or (imovel.numero if imovel else None)
    bairro = dados.bairro or (imovel.bairro if imovel else None)

    if not dados.rascunho:
        resultado = await elegibilidade.verificar_cacamba(
            db,
            user.organizacao_id,
            pessoa=pessoa,
            imovel=imovel,
            data_desejada=dados.data_desejada,
            endereco_chave=chave_busca(logradouro, numero, bairro),
            dias_previstos=dias,
            material_proibido=bool(residuo and residuo.proibido),
        )
        if not resultado.elegivel:
            # Um gestor com permissão de exceção pode seguir com justificativa,
            # exceto nos impedimentos absolutos (ex.: material proibido).
            pode_excecao = usuario_pode(user, P.BLOQUEIOS_EXCECAO)
            absolutos = resultado.bloqueios_absolutos
            if absolutos or not pode_excecao or not dados.justificativa_excecao:
                raise RegraNegocio(
                    "A solicitação não pode ser registrada: verifique os impedimentos.",
                    [i.dict() for i in resultado.impedimentos],
                    "impedimento_elegibilidade",
                )

        if not dados.termo_aceito:
            raise AppError(
                "O termo de responsabilidade precisa ser aceito pelo solicitante.",
                422,
                "termo_obrigatorio",
            )
        if not dados.ciente_itens_proibidos:
            raise AppError(
                "É necessário confirmar a ciência sobre os materiais proibidos.",
                422,
                "ciencia_obrigatoria",
            )

    ano, numero_protocolo, formatado = await protocolo.protocolo_solicitacao_cacamba(
        db, user.organizacao_id
    )

    solicitacao = SolicitacaoCacamba(
        organizacao_id=user.organizacao_id,
        ano=ano,
        protocolo=numero_protocolo,
        protocolo_formatado=formatado,
        pessoa_id=pessoa.id,
        imovel_id=imovel.id if imovel else None,
        logradouro=logradouro,
        numero=numero,
        bairro=bairro,
        referencia=dados.referencia,
        regiao_id=dados.regiao_id or (imovel.regiao_id if imovel else None),
        endereco_chave=chave_busca(logradouro, numero, bairro),
        latitude=dados.latitude if dados.latitude is not None else (imovel.latitude if imovel else None),
        longitude=(
            dados.longitude if dados.longitude is not None else (imovel.longitude if imovel else None)
        ),
        instrucoes_entrega=dados.instrucoes_entrega,
        espaco_confirmado=dados.espaco_confirmado,
        acesso_caminhao_confirmado=dados.acesso_caminhao_confirmado,
        exige_autorizacao_especial=dados.exige_autorizacao_especial,
        tipo_residuo_id=residuo.id if residuo else None,
        descricao_material=dados.descricao_material,
        quantidade_estimada_m3=dados.quantidade_estimada_m3,
        origem_material=dados.origem_material,
        materiais_adicionais=dados.materiais_adicionais,
        ciente_itens_proibidos=dados.ciente_itens_proibidos,
        prioridade=dados.prioridade,
        data_desejada=dados.data_desejada,
        dias_previstos=dias,
        atendente_id=user.id,
        situacao=(
            SituacaoSolicitacao.RASCUNHO.value if dados.rascunho else SituacaoSolicitacao.PENDENTE.value
        ),
        observacoes=dados.observacoes,
        termo_aceito=dados.termo_aceito,
        termo_aceito_em=datetime.now(timezone.utc) if dados.termo_aceito else None,
        justificativa_excecao=dados.justificativa_excecao,
        created_by_id=user.id,
        updated_by_id=user.id,
    )
    db.add(solicitacao)
    await db.flush()

    await _guardar_assinatura(db, user, "solicitacao_cacamba", solicitacao.id, dados.assinatura, request)

    db.add(
        HistoricoSituacao(
            entidade="solicitacao_cacamba",
            entidade_id=solicitacao.id,
            situacao_anterior=None,
            situacao_nova=solicitacao.situacao,
            observacoes="Solicitação registrada",
            created_by_id=user.id,
        )
    )

    if dados.justificativa_excecao:
        await auditoria.registrar(
            db,
            acao=AcaoAuditoria.EXCECAO_BLOQUEIO,
            usuario=user,
            entidade="solicitacao_cacamba",
            entidade_id=solicitacao.id,
            entidade_descricao=formatado,
            justificativa=dados.justificativa_excecao,
            detalhe="Solicitação registrada apesar de impedimento, por decisão do gestor",
            cliente=cliente(request),
        )

    await auditoria.registrar(
        db,
        acao=AcaoAuditoria.CRIAR,
        usuario=user,
        entidade="solicitacao_cacamba",
        entidade_id=solicitacao.id,
        entidade_descricao=formatado,
        dados_depois=auditoria.instantaneo(solicitacao),
        cliente=cliente(request),
    )

    if not dados.rascunho:
        await notificacoes.para_perfis(
            db,
            organizacao_id=user.organizacao_id,
            perfis=[Perfil.GESTOR],
            tipo=TipoNotificacao.SOLICITACAO_CADASTRADA,
            titulo=f"Nova solicitação de caçamba {formatado}",
            mensagem=f"{pessoa.nome} solicitou caçamba para {logradouro or 'endereço não informado'}.",
            entidade="solicitacao_cacamba",
            entidade_id=solicitacao.id,
            link=f"/solicitacoes/{solicitacao.id}",
        )

    await db.commit()
    return {
        "id": solicitacao.id,
        "protocolo": formatado,
        "situacao": solicitacao.situacao,
        "mensagem": (
            "Rascunho salvo." if dados.rascunho else f"Solicitação registrada sob o protocolo {formatado}."
        ),
    }


@router.get("/{solicitacao_id}", summary="Detalhar solicitação")
async def detalhar(
    solicitacao_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(exigir(P.SOLICITACOES_VISUALIZAR)),
):
    solicitacao = await buscar_da_organizacao(
        db, SolicitacaoCacamba, solicitacao_id, user, "Solicitação não encontrada."
    )
    pessoa = await db.get(Pessoa, solicitacao.pessoa_id)
    imovel = await db.get(Imovel, solicitacao.imovel_id) if solicitacao.imovel_id else None
    residuo = (
        await db.get(TipoResiduo, solicitacao.tipo_residuo_id) if solicitacao.tipo_residuo_id else None
    )
    nomes = await nomes_de_usuarios(db, [solicitacao.atendente_id, solicitacao.motorista_id])
    documento, mascarado = documento_visivel(user, pessoa.documento if pessoa else None)

    entregas = list(
        (
            await db.execute(
                select(EntregaCacamba).where(EntregaCacamba.solicitacao_id == solicitacao.id)
            )
        )
        .scalars()
        .all()
    )
    retiradas = list(
        (
            await db.execute(
                select(RetiradaCacamba).where(RetiradaCacamba.solicitacao_id == solicitacao.id)
            )
        )
        .scalars()
        .all()
    )

    base = _resumo(solicitacao, {solicitacao.pessoa_id: pessoa.nome if pessoa else None})
    base.update(
        {
            "ano": solicitacao.ano,
            "pessoa": (
                {
                    "id": pessoa.id,
                    "nome": pessoa.nome,
                    "documento": documento,
                    "documento_mascarado": mascarado,
                    "telefone": pessoa.telefone,
                    "whatsapp": pessoa.whatsapp,
                }
                if pessoa
                else None
            ),
            "imovel": (
                {
                    "id": imovel.id,
                    "codigo": imovel.codigo,
                    "nome": imovel.nome,
                    "tipo": imovel.tipo,
                    "latitude": imovel.latitude,
                    "longitude": imovel.longitude,
                }
                if imovel
                else None
            ),
            "referencia": solicitacao.referencia,
            "instrucoes_entrega": solicitacao.instrucoes_entrega,
            "espaco_confirmado": solicitacao.espaco_confirmado,
            "acesso_caminhao_confirmado": solicitacao.acesso_caminhao_confirmado,
            "exige_autorizacao_especial": solicitacao.exige_autorizacao_especial,
            "tipo_residuo": residuo.nome if residuo else None,
            "tipo_residuo_id": solicitacao.tipo_residuo_id,
            "descricao_material": solicitacao.descricao_material,
            "quantidade_estimada_m3": solicitacao.quantidade_estimada_m3,
            "origem_material": solicitacao.origem_material,
            "materiais_adicionais": solicitacao.materiais_adicionais or [],
            "data_desejada": solicitacao.data_desejada,
            "dias_previstos": solicitacao.dias_previstos,
            "cacamba_id": solicitacao.cacamba_id,
            "veiculo_id": solicitacao.veiculo_id,
            "motorista_id": solicitacao.motorista_id,
            "motorista": nomes.get(solicitacao.motorista_id),
            "equipe": solicitacao.equipe,
            "atendente": nomes.get(solicitacao.atendente_id),
            "observacoes": solicitacao.observacoes,
            "termo_aceito": solicitacao.termo_aceito,
            "motivo_reprovacao": solicitacao.motivo_reprovacao,
            "motivo_cancelamento": solicitacao.motivo_cancelamento,
            "justificativa_data": solicitacao.justificativa_data,
            "justificativa_excecao": solicitacao.justificativa_excecao,
            "row_version": solicitacao.row_version,
            "proximas_situacoes": sorted(TRANSICOES_SOLICITACAO.get(solicitacao.situacao, set())),
            "arquivos": [
                servico_arquivos.resumo(a)
                for a in await servico_arquivos.listar(db, "solicitacao_cacamba", solicitacao.id)
            ],
            "entregas": [
                {
                    "id": e.id,
                    "cacamba_id": e.cacamba_id,
                    "entregue_em": e.entregue_em,
                    "km_saida": e.km_saida,
                    "km_chegada": e.km_chegada,
                    "recebido_por": e.recebido_por,
                    "ocorrencias": e.ocorrencias,
                    "contingencia": e.contingencia,
                    "latitude": e.latitude,
                    "longitude": e.longitude,
                    "arquivos": [
                        servico_arquivos.resumo(a)
                        for a in await servico_arquivos.listar(db, "entrega_cacamba", e.id)
                    ],
                }
                for e in entregas
            ],
            "retiradas": [
                {
                    "id": r.id,
                    "cacamba_id": r.cacamba_id,
                    "retirada_em": r.retirada_em,
                    "material_proibido": r.material_proibido,
                    "descricao_material_proibido": r.descricao_material_proibido,
                    "peso_kg": r.peso_kg,
                    "destinacao": r.destinacao,
                    "ocorrencias": r.ocorrencias,
                    "necessita_limpeza": r.necessita_limpeza,
                    "necessita_manutencao": r.necessita_manutencao,
                    "houve_dano": r.houve_dano,
                    "destino_cacamba": r.destino_cacamba,
                    "arquivos": [
                        servico_arquivos.resumo(a)
                        for a in await servico_arquivos.listar(db, "retirada_cacamba", r.id)
                    ],
                }
                for r in retiradas
            ],
        }
    )
    return base


@router.get("/{solicitacao_id}/historico", summary="Histórico de situações")
async def historico(
    solicitacao_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(exigir(P.SOLICITACOES_VISUALIZAR)),
):
    await buscar_da_organizacao(
        db, SolicitacaoCacamba, solicitacao_id, user, "Solicitação não encontrada."
    )
    registros = list(
        (
            await db.execute(
                select(HistoricoSituacao)
                .where(
                    HistoricoSituacao.entidade == "solicitacao_cacamba",
                    HistoricoSituacao.entidade_id == solicitacao_id,
                )
                .order_by(HistoricoSituacao.created_at)
            )
        )
        .scalars()
        .all()
    )
    nomes = await nomes_de_usuarios(db, [h.created_by_id for h in registros])
    return [
        {
            "id": h.id,
            "situacao_anterior": h.situacao_anterior,
            "situacao_anterior_rotulo": com_rotulo(h.situacao_anterior) if h.situacao_anterior else None,
            "situacao_nova": h.situacao_nova,
            "situacao_nova_rotulo": com_rotulo(h.situacao_nova),
            "justificativa": h.justificativa,
            "observacoes": h.observacoes,
            "created_at": h.created_at,
            "usuario": nomes.get(h.created_by_id),
        }
        for h in registros
    ]


# ─────────────────────────────────────────────────────────────────────────────
# Análise
# ─────────────────────────────────────────────────────────────────────────────


@router.post("/{solicitacao_id}/aprovar", summary="Aprovar solicitação")
async def aprovar(
    solicitacao_id: uuid.UUID,
    dados: comuns.MotivoOpcional,
    request: Request,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(exigir(P.SOLICITACOES_APROVAR)),
):
    solicitacao = await buscar_da_organizacao(
        db, SolicitacaoCacamba, solicitacao_id, user, "Solicitação não encontrada."
    )
    await _transicionar(
        db, solicitacao, SituacaoSolicitacao.APROVADA.value, user, observacoes=dados.motivo
    )
    await auditoria.registrar(
        db,
        acao=AcaoAuditoria.APROVAR,
        usuario=user,
        entidade="solicitacao_cacamba",
        entidade_id=solicitacao.id,
        entidade_descricao=solicitacao.protocolo_formatado,
        detalhe=dados.motivo,
        cliente=cliente(request),
    )
    await notificacoes.para_perfis(
        db,
        organizacao_id=user.organizacao_id,
        perfis=[Perfil.ATENDENTE],
        tipo=TipoNotificacao.SOLICITACAO_APROVADA,
        titulo=f"Solicitação {solicitacao.protocolo_formatado} aprovada",
        mensagem="A solicitação está liberada para agendamento.",
        entidade="solicitacao_cacamba",
        entidade_id=solicitacao.id,
        link=f"/solicitacoes/{solicitacao.id}",
    )
    await db.commit()
    return {"mensagem": "Solicitação aprovada e liberada para agendamento."}


@router.post("/{solicitacao_id}/reprovar", summary="Reprovar solicitação")
async def reprovar(
    solicitacao_id: uuid.UUID,
    dados: comuns.Justificativa,
    request: Request,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(exigir(P.SOLICITACOES_REPROVAR)),
):
    """A reprovação exige justificativa — obrigatória pelo schema."""
    solicitacao = await buscar_da_organizacao(
        db, SolicitacaoCacamba, solicitacao_id, user, "Solicitação não encontrada."
    )
    solicitacao.motivo_reprovacao = dados.justificativa
    await _transicionar(
        db,
        solicitacao,
        SituacaoSolicitacao.REPROVADA.value,
        user,
        justificativa=dados.justificativa,
    )
    await auditoria.registrar(
        db,
        acao=AcaoAuditoria.REPROVAR,
        usuario=user,
        entidade="solicitacao_cacamba",
        entidade_id=solicitacao.id,
        entidade_descricao=solicitacao.protocolo_formatado,
        justificativa=dados.justificativa,
        cliente=cliente(request),
    )
    await db.commit()
    return {"mensagem": "Solicitação reprovada."}


@router.post("/{solicitacao_id}/cancelar", summary="Cancelar solicitação")
async def cancelar(
    solicitacao_id: uuid.UUID,
    dados: comuns.Justificativa,
    request: Request,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(exigir(P.SOLICITACOES_CANCELAR)),
):
    solicitacao = await buscar_da_organizacao(
        db, SolicitacaoCacamba, solicitacao_id, user, "Solicitação não encontrada."
    )
    if solicitacao.situacao == SituacaoSolicitacao.EM_USO.value:
        raise Conflict(
            "A caçamba já está no local. Registre a retirada em vez de cancelar o atendimento."
        )

    solicitacao.motivo_cancelamento = dados.justificativa
    await _transicionar(
        db, solicitacao, SituacaoSolicitacao.CANCELADA.value, user, justificativa=dados.justificativa
    )

    # Libera a caçamba reservada.
    if solicitacao.cacamba_id:
        cacamba = await db.get(Cacamba, solicitacao.cacamba_id)
        if cacamba is not None and cacamba.situacao in {
            SituacaoCacamba.RESERVADA.value,
            SituacaoCacamba.AGUARDANDO_ENTREGA.value,
        }:
            await registrar_movimentacao(
                db,
                cacamba,
                nova_situacao=SituacaoCacamba.DISPONIVEL.value,
                usuario_id=user.id,
                motivo="Solicitação cancelada",
                solicitacao_id=solicitacao.id,
            )

    await auditoria.registrar(
        db,
        acao=AcaoAuditoria.CANCELAR,
        usuario=user,
        entidade="solicitacao_cacamba",
        entidade_id=solicitacao.id,
        entidade_descricao=solicitacao.protocolo_formatado,
        justificativa=dados.justificativa,
        cliente=cliente(request),
    )
    await db.commit()
    return {"mensagem": "Solicitação cancelada e recursos liberados."}


# ─────────────────────────────────────────────────────────────────────────────
# Recomendação e agendamento
# ─────────────────────────────────────────────────────────────────────────────


@router.post("/recomendar-datas", summary="Sugerir as melhores datas de entrega")
async def recomendar(
    dados: esquemas.RecomendacaoEntrada,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(exigir(P.AGENDA_VISUALIZAR)),
):
    """Motor determinístico e explicável (item 15)."""
    opcoes = await recomendacao.recomendar_datas_cacamba(
        db,
        user.organizacao_id,
        data_preferida=dados.data_preferida,
        dias_uso=dados.dias_uso,
        bairro=dados.bairro,
        regiao_id=dados.regiao_id,
        latitude=dados.latitude,
        longitude=dados.longitude,
        prioridade=dados.prioridade,
        quantidade=dados.quantidade,
    )
    minimo = await configuracoes.obter(
        db, user.organizacao_id, "cacamba_pontuacao_minima_sem_justificativa"
    )
    return {
        "opcoes": [o.dict() for o in opcoes],
        "pontuacao_minima_sem_justificativa": minimo,
        "observacao": (
            "As datas são calculadas por regras configuráveis, sem inteligência artificial. "
            "O atendente pode escolher outra data; quando a pontuação for baixa, o sistema "
            "pedirá justificativa."
        ),
    }


@router.post("/{solicitacao_id}/agendar", summary="Agendar entrega")
async def agendar(
    solicitacao_id: uuid.UUID,
    dados: esquemas.AgendamentoEntrada,
    request: Request,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(exigir(P.AGENDA_AGENDAR)),
):
    """Agenda (ou reagenda) validando conflitos no backend — inclusive quando a
    ação veio de um arrastar e soltar na agenda."""
    solicitacao = await buscar_da_organizacao(
        db, SolicitacaoCacamba, solicitacao_id, user, "Solicitação não encontrada."
    )
    reagendamento = solicitacao.situacao == SituacaoSolicitacao.AGENDADA.value
    if reagendamento and not usuario_pode(user, P.AGENDA_REAGENDAR):
        raise AppError(
            "Reagendar exige a permissão govinfra.agenda.reagendar.", 403, "permissao_negada"
        )

    padroes = await configuracoes.obter_varias(
        db,
        user.organizacao_id,
        ["cacamba_periodo_padrao_dias", "cacamba_pontuacao_minima_sem_justificativa"],
    )
    dias = dados.dias_previstos or solicitacao.dias_previstos or int(
        padroes["cacamba_periodo_padrao_dias"] or 3
    )
    retirada = dados.data_agendada + timedelta(days=dias)

    conflitos = await agenda.conflitos_agendamento_cacamba(
        db,
        user.organizacao_id,
        data_entrega=dados.data_agendada,
        data_retirada=retirada,
        cacamba_id=dados.cacamba_id or solicitacao.cacamba_id,
        veiculo_id=dados.veiculo_id or solicitacao.veiculo_id,
        ignorar_solicitacao_id=solicitacao.id,
    )
    if conflitos and not dados.forcar:
        raise RegraNegocio(
            "Há conflitos que impedem este agendamento.",
            [c.dict() for c in conflitos],
            "conflito_agenda",
        )
    if conflitos and dados.forcar and not dados.justificativa:
        raise AppError(
            "Para agendar apesar dos conflitos é necessário informar uma justificativa.",
            422,
            "justificativa_obrigatoria",
        )

    # Data mal pontuada exige justificativa (item 15.3).
    opcoes = await recomendacao.recomendar_datas_cacamba(
        db,
        user.organizacao_id,
        data_preferida=dados.data_agendada,
        dias_uso=dias,
        bairro=solicitacao.bairro,
        regiao_id=solicitacao.regiao_id,
        latitude=solicitacao.latitude,
        longitude=solicitacao.longitude,
        prioridade=solicitacao.prioridade,
        ignorar_solicitacao_id=solicitacao.id,
        quantidade=30,
    )
    escolhida = next((o for o in opcoes if o.data == dados.data_agendada), None)
    minimo = int(padroes["cacamba_pontuacao_minima_sem_justificativa"] or 0)
    if recomendacao.exige_justificativa(escolhida, minimo) and not dados.justificativa:
        raise AppError(
            (
                "A data escolhida tem pontuação baixa no motor de recomendação. "
                "Informe uma justificativa para prosseguir."
                + (f" Motivo: {'; '.join(escolhida.impedimentos)}." if escolhida and escolhida.impedimentos else "")
            ),
            422,
            "justificativa_obrigatoria",
        )

    antes = auditoria.instantaneo(solicitacao)
    cacamba_anterior = solicitacao.cacamba_id

    solicitacao.data_agendada = dados.data_agendada
    solicitacao.data_prevista_entrega = dados.data_agendada
    solicitacao.data_prevista_retirada = retirada
    solicitacao.dias_previstos = dias
    if dados.cacamba_id:
        solicitacao.cacamba_id = dados.cacamba_id
    if dados.veiculo_id:
        solicitacao.veiculo_id = dados.veiculo_id
    if dados.motorista_id:
        solicitacao.motorista_id = dados.motorista_id
    if dados.equipe:
        solicitacao.equipe = dados.equipe
    if dados.justificativa:
        solicitacao.justificativa_data = dados.justificativa

    # Reserva a caçamba escolhida e libera a anterior, se houve troca.
    if solicitacao.cacamba_id:
        cacamba = await db.get(Cacamba, solicitacao.cacamba_id)
        if cacamba is None:
            raise NotFound("Caçamba não encontrada.")
        if cacamba.situacao == SituacaoCacamba.DISPONIVEL.value:
            await registrar_movimentacao(
                db,
                cacamba,
                nova_situacao=SituacaoCacamba.RESERVADA.value,
                usuario_id=user.id,
                motivo=f"Reservada para o protocolo {solicitacao.protocolo_formatado}",
                solicitacao_id=solicitacao.id,
            )
    if cacamba_anterior and cacamba_anterior != solicitacao.cacamba_id:
        anterior = await db.get(Cacamba, cacamba_anterior)
        if anterior is not None and anterior.situacao == SituacaoCacamba.RESERVADA.value:
            await registrar_movimentacao(
                db,
                anterior,
                nova_situacao=SituacaoCacamba.DISPONIVEL.value,
                usuario_id=user.id,
                motivo="Substituída no agendamento",
                solicitacao_id=solicitacao.id,
            )
        await auditoria.registrar(
            db,
            acao=AcaoAuditoria.TROCA_CACAMBA,
            usuario=user,
            entidade="solicitacao_cacamba",
            entidade_id=solicitacao.id,
            entidade_descricao=solicitacao.protocolo_formatado,
            dados_antes={"cacamba_id": str(cacamba_anterior)},
            dados_depois={"cacamba_id": str(solicitacao.cacamba_id)},
            cliente=cliente(request),
        )

    await _transicionar(
        db,
        solicitacao,
        SituacaoSolicitacao.AGENDADA.value,
        user,
        justificativa=dados.justificativa,
        observacoes=(
            f"Entrega em {dados.data_agendada.strftime('%d/%m/%Y')}, "
            f"retirada prevista para {retirada.strftime('%d/%m/%Y')}"
        ),
    )
    await auditoria.registrar(
        db,
        acao=AcaoAuditoria.REAGENDAR if reagendamento else AcaoAuditoria.AGENDAR,
        usuario=user,
        entidade="solicitacao_cacamba",
        entidade_id=solicitacao.id,
        entidade_descricao=solicitacao.protocolo_formatado,
        justificativa=dados.justificativa,
        dados_antes=antes,
        dados_depois=auditoria.instantaneo(solicitacao),
        cliente=cliente(request),
    )
    await notificacoes.para_perfis(
        db,
        organizacao_id=user.organizacao_id,
        perfis=[Perfil.MOTORISTA],
        tipo=(
            TipoNotificacao.AGENDAMENTO_ALTERADO if reagendamento else TipoNotificacao.AGENDAMENTO_CONFIRMADO
        ),
        titulo=f"Entrega {solicitacao.protocolo_formatado} em {dados.data_agendada.strftime('%d/%m')}",
        mensagem=f"Endereço: {solicitacao.logradouro or ''}, {solicitacao.numero or ''}".strip(", "),
        entidade="solicitacao_cacamba",
        entidade_id=solicitacao.id,
        link=f"/solicitacoes/{solicitacao.id}",
    )
    await db.commit()

    return {
        "mensagem": (
            f"{'Reagendamento' if reagendamento else 'Agendamento'} confirmado para "
            f"{dados.data_agendada.strftime('%d/%m/%Y')}."
        ),
        "data_prevista_entrega": solicitacao.data_prevista_entrega,
        "data_prevista_retirada": solicitacao.data_prevista_retirada,
        "conflitos_ignorados": [c.dict() for c in conflitos] if conflitos else [],
    }


# ─────────────────────────────────────────────────────────────────────────────
# Entrega e retirada
# ─────────────────────────────────────────────────────────────────────────────


@router.post("/{solicitacao_id}/entrega", summary="Registrar entrega da caçamba")
async def registrar_entrega(
    solicitacao_id: uuid.UUID,
    dados: esquemas.EntregaEntrada,
    request: Request,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(exigir(P.ENTREGAS_REGISTRAR)),
):
    """Fluxo operacional do item 16 — pensado para o celular do motorista."""
    solicitacao = await buscar_da_organizacao(
        db, SolicitacaoCacamba, solicitacao_id, user, "Solicitação não encontrada."
    )
    if solicitacao.situacao in {
        SituacaoSolicitacao.EM_USO.value,
        SituacaoSolicitacao.CONCLUIDA.value,
        SituacaoSolicitacao.CANCELADA.value,
    }:
        raise Conflict(
            f"Esta solicitação está como '{com_rotulo(solicitacao.situacao)}' e não aceita "
            "novo registro de entrega."
        )

    cacamba_id = dados.cacamba_id or solicitacao.cacamba_id
    veiculo_id = dados.veiculo_id or solicitacao.veiculo_id

    # Regra do item 16: sem caçamba e veículo vinculados a entrega não pode ser
    # confirmada, salvo contingência autorizada e justificada.
    if not cacamba_id or not veiculo_id:
        if not dados.contingencia:
            raise AppError(
                (
                    "A entrega exige caçamba e veículo vinculados. "
                    "Se for uma operação de contingência, marque a opção e informe a justificativa."
                ),
                422,
                "recursos_obrigatorios",
            )
        if not dados.justificativa_contingencia:
            raise AppError(
                "A operação de contingência exige justificativa registrada.",
                422,
                "justificativa_obrigatoria",
            )
        if not cacamba_id:
            raise AppError(
                "Mesmo em contingência é necessário informar qual caçamba foi entregue.",
                422,
                "cacamba_obrigatoria",
            )

    cacamba = await buscar_da_organizacao(db, Cacamba, cacamba_id, user, "Caçamba não encontrada.")
    momento = dados.entregue_em or datetime.now(timezone.utc)

    entrega = EntregaCacamba(
        solicitacao_id=solicitacao.id,
        cacamba_id=cacamba.id,
        veiculo_id=veiculo_id,
        motorista_id=dados.motorista_id or user.id,
        auxiliares=dados.auxiliares,
        saida_em=dados.saida_em,
        km_saida=dados.km_saida,
        latitude_saida=dados.latitude_saida,
        longitude_saida=dados.longitude_saida,
        entregue_em=momento,
        km_chegada=dados.km_chegada,
        latitude=dados.latitude,
        longitude=dados.longitude,
        recebido_por=dados.recebido_por,
        documento_recebedor=dados.documento_recebedor,
        ocorrencias=dados.ocorrencias,
        observacoes=dados.observacoes,
        contingencia=dados.contingencia,
        justificativa_contingencia=dados.justificativa_contingencia,
        created_by_id=user.id,
    )
    db.add(entrega)
    await db.flush()

    await _guardar_assinatura(db, user, "entrega_cacamba", entrega.id, dados.assinatura, request)

    # Atualiza a quilometragem do veículo com registro de histórico.
    if veiculo_id and dados.km_chegada is not None:
        from app.models.frota import Veiculo
        from app.services.combustivel import registrar_leitura_medidor

        veiculo = await db.get(Veiculo, veiculo_id)
        if veiculo is not None:
            await registrar_leitura_medidor(
                db,
                maquina=None,
                veiculo=veiculo,
                valor=dados.km_chegada,
                origem="entrega",
                usuario_id=user.id,
                pode_corrigir=usuario_pode(user, P.MEDIDORES_CORRIGIR),
            )

    endereco = f"{solicitacao.logradouro or ''}, {solicitacao.numero or ''}".strip(", ")
    await registrar_movimentacao(
        db,
        cacamba,
        nova_situacao=SituacaoCacamba.EM_USO.value,
        usuario_id=user.id,
        motivo=f"Entregue no protocolo {solicitacao.protocolo_formatado}",
        localizacao=endereco,
        latitude=dados.latitude,
        longitude=dados.longitude,
        solicitacao_id=solicitacao.id,
        veiculo_id=veiculo_id,
    )

    solicitacao.cacamba_id = cacamba.id
    if veiculo_id:
        solicitacao.veiculo_id = veiculo_id
    # A data prevista de retirada passa a contar da entrega efetiva.
    solicitacao.data_prevista_retirada = momento.date() + timedelta(
        days=solicitacao.dias_previstos or 3
    )
    # O mapa de transições não liga "agendada" direto a "em uso": a passagem
    # por "em transporte" mantém o histórico fiel ao que aconteceu (item 12.2).
    if solicitacao.situacao == SituacaoSolicitacao.AGENDADA.value:
        await _transicionar(
            db,
            solicitacao,
            SituacaoSolicitacao.EM_TRANSPORTE.value,
            user,
            observacoes="Caminhão em rota para a entrega",
        )
    elif solicitacao.situacao == SituacaoSolicitacao.AGUARDANDO_ENTREGA.value:
        await _transicionar(
            db,
            solicitacao,
            SituacaoSolicitacao.EM_TRANSPORTE.value,
            user,
            observacoes="Caminhão em rota para a entrega",
        )
    await _transicionar(
        db, solicitacao, SituacaoSolicitacao.EM_USO.value, user, observacoes="Entrega confirmada"
    )

    await auditoria.registrar(
        db,
        acao=AcaoAuditoria.ENTREGA,
        usuario=user,
        entidade="solicitacao_cacamba",
        entidade_id=solicitacao.id,
        entidade_descricao=solicitacao.protocolo_formatado,
        justificativa=dados.justificativa_contingencia,
        detalhe=f"Caçamba {cacamba.codigo} entregue em {endereco}",
        dados_depois=auditoria.instantaneo(entrega),
        cliente=cliente(request),
    )
    await notificacoes.para_perfis(
        db,
        organizacao_id=user.organizacao_id,
        perfis=[Perfil.GESTOR],
        tipo=TipoNotificacao.RETIRADA_PROXIMA,
        titulo=f"Retirada prevista para {solicitacao.data_prevista_retirada.strftime('%d/%m/%Y')}",
        mensagem=f"Protocolo {solicitacao.protocolo_formatado} — {endereco}",
        entidade="solicitacao_cacamba",
        entidade_id=solicitacao.id,
        link=f"/solicitacoes/{solicitacao.id}",
    )
    await db.commit()

    return {
        "id": entrega.id,
        "mensagem": "Entrega registrada. A caçamba está em uso.",
        "data_prevista_retirada": solicitacao.data_prevista_retirada,
    }


@router.post("/{solicitacao_id}/retirada", summary="Registrar retirada da caçamba")
async def registrar_retirada(
    solicitacao_id: uuid.UUID,
    dados: esquemas.RetiradaEntrada,
    request: Request,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(exigir(P.RETIRADAS_REGISTRAR)),
):
    """Fluxo do item 17.

    Regra explícita: havendo ocorrência, dano ou material irregular, a caçamba
    NÃO volta automaticamente para "disponível".
    """
    solicitacao = await buscar_da_organizacao(
        db, SolicitacaoCacamba, solicitacao_id, user, "Solicitação não encontrada."
    )
    if solicitacao.situacao not in {
        SituacaoSolicitacao.EM_USO.value,
        SituacaoSolicitacao.AGUARDANDO_RETIRADA.value,
        SituacaoSolicitacao.EM_RETIRADA.value,
    }:
        raise Conflict(
            f"A situação atual ('{com_rotulo(solicitacao.situacao)}') não permite registrar retirada."
        )
    if not solicitacao.cacamba_id:
        raise Conflict("Não há caçamba vinculada a esta solicitação.")

    cacamba = await buscar_da_organizacao(
        db, Cacamba, solicitacao.cacamba_id, user, "Caçamba não encontrada."
    )
    momento = dados.retirada_em or datetime.now(timezone.utc)

    houve_problema = (
        dados.material_proibido or dados.houve_dano or bool(dados.ocorrencias)
        or dados.necessita_limpeza or dados.necessita_manutencao
    )
    destino = dados.destino_cacamba
    if houve_problema and destino == DestinoRetirada.DISPONIVEL.value:
        # Corrige a escolha em vez de aceitar em silêncio, e explica o motivo.
        if dados.necessita_manutencao or dados.houve_dano:
            destino = DestinoRetirada.MANUTENCAO.value
        elif dados.necessita_limpeza or dados.material_proibido:
            destino = DestinoRetirada.LIMPEZA.value
        else:
            destino = DestinoRetirada.VISTORIA.value

    retirada = RetiradaCacamba(
        solicitacao_id=solicitacao.id,
        cacamba_id=cacamba.id,
        veiculo_id=dados.veiculo_id or solicitacao.veiculo_id,
        motorista_id=dados.motorista_id or user.id,
        equipe=dados.equipe or solicitacao.equipe,
        data_prevista=solicitacao.data_prevista_retirada,
        retirada_em=momento,
        km_saida=dados.km_saida,
        km_chegada=dados.km_chegada,
        latitude=dados.latitude,
        longitude=dados.longitude,
        tipo_material_encontrado=dados.tipo_material_encontrado,
        material_proibido=dados.material_proibido,
        descricao_material_proibido=dados.descricao_material_proibido,
        peso_kg=dados.peso_kg,
        destinacao=dados.destinacao,
        ocorrencias=dados.ocorrencias,
        necessita_limpeza=dados.necessita_limpeza,
        necessita_manutencao=dados.necessita_manutencao,
        houve_dano=dados.houve_dano,
        destino_cacamba=destino,
        observacoes=dados.observacoes,
        created_by_id=user.id,
    )
    db.add(retirada)
    await db.flush()

    await _guardar_assinatura(db, user, "retirada_cacamba", retirada.id, dados.assinatura, request)

    situacao_destino = {
        DestinoRetirada.DISPONIVEL.value: SituacaoCacamba.DISPONIVEL.value,
        DestinoRetirada.LIMPEZA.value: SituacaoCacamba.EM_LIMPEZA.value,
        DestinoRetirada.VISTORIA.value: SituacaoCacamba.EM_VISTORIA.value,
        DestinoRetirada.MANUTENCAO.value: SituacaoCacamba.EM_MANUTENCAO.value,
        DestinoRetirada.INDISPONIVEL.value: SituacaoCacamba.INDISPONIVEL.value,
    }[destino]

    await registrar_movimentacao(
        db,
        cacamba,
        nova_situacao=situacao_destino,
        usuario_id=user.id,
        motivo=f"Retirada do protocolo {solicitacao.protocolo_formatado}",
        localizacao=cacamba.localizacao_padrao,
        solicitacao_id=solicitacao.id,
        veiculo_id=retirada.veiculo_id,
        observacoes=dados.ocorrencias,
    )

    # O mapa de transições não liga "em uso" direto a "concluída": a passagem
    # por "aguardando retirada" mantém o histórico fiel ao que aconteceu.
    if solicitacao.situacao == SituacaoSolicitacao.EM_USO.value:
        await _transicionar(
            db,
            solicitacao,
            SituacaoSolicitacao.AGUARDANDO_RETIRADA.value,
            user,
            observacoes="Equipe chegou ao local para a retirada",
        )
    await _transicionar(
        db, solicitacao, SituacaoSolicitacao.CONCLUIDA.value, user, observacoes="Retirada concluída"
    )

    # Material irregular gera bloqueio? Não automaticamente — a decisão é do
    # gestor. Mas ele é notificado com o registro na mão.
    if dados.material_proibido:
        await notificacoes.para_perfis(
            db,
            organizacao_id=user.organizacao_id,
            perfis=[Perfil.GESTOR],
            tipo=TipoNotificacao.INCONSISTENCIA_DETECTADA,
            titulo=f"Material irregular no protocolo {solicitacao.protocolo_formatado}",
            mensagem=(
                dados.descricao_material_proibido
                or "Foi encontrado material proibido na caçamba retirada."
            ),
            entidade="solicitacao_cacamba",
            entidade_id=solicitacao.id,
            link=f"/solicitacoes/{solicitacao.id}",
        )

    await auditoria.registrar(
        db,
        acao=AcaoAuditoria.RETIRADA,
        usuario=user,
        entidade="solicitacao_cacamba",
        entidade_id=solicitacao.id,
        entidade_descricao=solicitacao.protocolo_formatado,
        detalhe=f"Caçamba {cacamba.codigo} encaminhada para '{destino}'",
        dados_depois=auditoria.instantaneo(retirada),
        cliente=cliente(request),
    )
    await db.commit()

    mensagem = "Retirada registrada e atendimento concluído."
    if destino != dados.destino_cacamba:
        mensagem += (
            f" A caçamba foi encaminhada para '{destino}' em vez de 'disponível' porque houve "
            "ocorrência registrada."
        )
    return {"id": retirada.id, "mensagem": mensagem, "destino_cacamba": destino}
