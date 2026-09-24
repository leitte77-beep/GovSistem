"""Programa Porteira Adentro: programas, beneficiários, banco de horas,
solicitações de serviço e vistorias (itens 19 a 25 e 31)."""

import uuid
from datetime import date, datetime, timezone

from fastapi import APIRouter, Depends, Query, Request, status
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

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
from app.core.database import get_db
from app.core.errors import AppError, Conflict, NotFound, RegraNegocio
from app.core.permissoes import P, Perfil
from app.models.enums import (
    SERVICO_ATIVO,
    TRANSICOES_SERVICO,
    AcaoAuditoria,
    ServicoAfetado,
    SituacaoBeneficiario,
    SituacaoServico,
    TipoNotificacao,
)
from app.models.organizacao import User
from app.models.pessoas import Imovel, Pessoa, PessoaImovel
from app.models.porteira import (
    Beneficiario,
    HistoricoSituacao,
    OrdemServico,
    Programa,
    SaldoHoras,
    SolicitacaoServico,
    TipoServico,
    Vistoria,
)
from app.schemas import porteira as esquemas
from app.services import (
    arquivos as servico_arquivos,
)
from app.services import (
    auditoria,
    banco_horas,
    elegibilidade,
    notificacoes,
    protocolo,
    recomendacao,
)

router = APIRouter(prefix="/porteira", tags=["Porteira Adentro"])


# ─────────────────────────────────────────────────────────────────────────────
# Programas
# ─────────────────────────────────────────────────────────────────────────────


@router.get("/programas", summary="Listar programas")
async def listar_programas(
    apenas_ativos: bool = False,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(exigir(P.PORTEIRA_VISUALIZAR)),
):
    condicoes = [Programa.organizacao_id == user.organizacao_id, Programa.deleted_at.is_(None)]
    if apenas_ativos:
        condicoes.append(Programa.ativo.is_(True))

    programas = list(
        (await db.execute(select(Programa).where(*condicoes).order_by(Programa.vigencia_inicio.desc())))
        .scalars()
        .all()
    )

    resposta = []
    for programa in programas:
        beneficiarios = await db.scalar(
            select(func.count())
            .select_from(Beneficiario)
            .where(Beneficiario.programa_id == programa.id, Beneficiario.deleted_at.is_(None))
        ) or 0
        totais = (
            await db.execute(
                select(
                    func.coalesce(func.sum(SaldoHoras.horas_concedidas), 0),
                    func.coalesce(func.sum(SaldoHoras.horas_utilizadas), 0),
                ).where(SaldoHoras.programa_id == programa.id)
            )
        ).first()
        resposta.append(
            {
                "id": programa.id,
                "chave": programa.chave,
                "nome": programa.nome,
                "descricao": programa.descricao,
                "base_legal": programa.base_legal,
                "vigencia_inicio": programa.vigencia_inicio,
                "vigencia_fim": programa.vigencia_fim,
                "horas_por_beneficiario": programa.horas_por_beneficiario,
                "horas_por_propriedade": programa.horas_por_propriedade,
                "regra_limite": programa.regra_limite,
                "metodo_desconto": programa.metodo_desconto,
                "validade_saldo_dias": programa.validade_saldo_dias,
                "permite_horas_adicionais": programa.permite_horas_adicionais,
                "limite_horas_adicionais": programa.limite_horas_adicionais,
                "exige_vistoria": programa.exige_vistoria,
                "exige_aprovacao_gestor": programa.exige_aprovacao_gestor,
                "permite_cobranca": programa.permite_cobranca,
                "valor_hora_excedente": programa.valor_hora_excedente,
                "documentos_obrigatorios": programa.documentos_obrigatorios or [],
                "servicos_permitidos": programa.servicos_permitidos or [],
                "equipamentos_permitidos": programa.equipamentos_permitidos or [],
                "criterios_prioridade": programa.criterios_prioridade or {},
                "pesos_recomendacao": programa.pesos_recomendacao or {},
                "ativo": programa.ativo,
                "vigente": programa.vigente_em(date.today()),
                "created_at": programa.created_at,
                "beneficiarios": beneficiarios,
                "horas_concedidas": float(totais[0] or 0),
                "horas_utilizadas": float(totais[1] or 0),
            }
        )
    return resposta


@router.post("/programas", status_code=status.HTTP_201_CREATED, summary="Cadastrar programa")
async def criar_programa(
    dados: esquemas.ProgramaEntrada,
    request: Request,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(exigir(P.CONFIGURACOES_EDITAR)),
):
    """Cria uma edição do programa.

    Nenhum limite legal é assumido pelo código: horas, regra por CPF ou
    propriedade e método de desconto vêm do que o gestor informar, e o campo
    `base_legal` documenta o fundamento.
    """
    existente = await db.scalar(
        select(Programa).where(
            Programa.organizacao_id == user.organizacao_id, Programa.chave == dados.chave
        )
    )
    if existente is not None:
        raise Conflict("Já existe um programa com esta chave.")
    if dados.vigencia_fim and dados.vigencia_fim < dados.vigencia_inicio:
        raise AppError("A vigência final não pode ser anterior à inicial.", 422, "periodo_invalido")

    programa = Programa(
        organizacao_id=user.organizacao_id, created_by_id=user.id, updated_by_id=user.id,
        **dados.model_dump(),
    )
    db.add(programa)
    await db.flush()
    await auditoria.registrar(
        db,
        acao=AcaoAuditoria.ALTERAR_CONFIGURACAO,
        usuario=user,
        entidade="programa",
        entidade_id=programa.id,
        entidade_descricao=programa.nome,
        dados_depois=auditoria.instantaneo(programa),
        cliente=cliente(request),
    )
    await db.commit()
    return {"id": programa.id, "mensagem": "Programa cadastrado."}


@router.put("/programas/{programa_id}", summary="Atualizar programa")
async def atualizar_programa(
    programa_id: uuid.UUID,
    dados: esquemas.ProgramaEntrada,
    request: Request,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(exigir(P.CONFIGURACOES_EDITAR)),
):
    programa = await buscar_da_organizacao(db, Programa, programa_id, user, "Programa não encontrado.")
    antes = auditoria.instantaneo(programa)
    for campo, valor in dados.model_dump(exclude_unset=True).items():
        setattr(programa, campo, valor)
    programa.updated_by_id = user.id

    await auditoria.registrar(
        db,
        acao=AcaoAuditoria.ALTERAR_CONFIGURACAO,
        usuario=user,
        entidade="programa",
        entidade_id=programa.id,
        entidade_descricao=programa.nome,
        dados_antes=antes,
        dados_depois=auditoria.instantaneo(programa),
        cliente=cliente(request),
    )
    await db.commit()
    return {"mensagem": "Programa atualizado."}


# ─────────────────────────────────────────────────────────────────────────────
# Beneficiários e banco de horas
# ─────────────────────────────────────────────────────────────────────────────


async def _saldos_do_beneficiario(db: AsyncSession, beneficiario_id: uuid.UUID) -> list[SaldoHoras]:
    return list(
        (await db.execute(select(SaldoHoras).where(SaldoHoras.beneficiario_id == beneficiario_id)))
        .scalars()
        .all()
    )


def _serializar_saldo(saldo: SaldoHoras, imovel_nome: str | None = None) -> dict:
    return {
        "id": saldo.id,
        "imovel_id": saldo.imovel_id,
        "imovel_nome": imovel_nome,
        "categoria": saldo.categoria or None,
        "periodo_referencia": saldo.periodo_referencia,
        "horas_concedidas": saldo.horas_concedidas,
        "horas_adicionais": saldo.horas_adicionais,
        "horas_reservadas": saldo.horas_reservadas,
        "horas_utilizadas": saldo.horas_utilizadas,
        "horas_estornadas": saldo.horas_estornadas,
        "horas_expiradas": saldo.horas_expiradas,
        "saldo_disponivel": saldo.saldo_disponivel,
        "validade_ate": saldo.validade_ate,
        "situacao": saldo.situacao,
    }


@router.get("/beneficiarios", summary="Listar beneficiários")
async def listar_beneficiarios(
    programa_id: uuid.UUID | None = None,
    situacao: str | None = None,
    termo: str | None = None,
    paginacao: Paginacao = Depends(),
    db: AsyncSession = Depends(get_db),
    user: User = Depends(exigir(P.PORTEIRA_VISUALIZAR)),
):
    condicoes = [
        Beneficiario.organizacao_id == user.organizacao_id,
        Beneficiario.deleted_at.is_(None),
    ]
    if programa_id:
        condicoes.append(Beneficiario.programa_id == programa_id)
    if situacao:
        condicoes.append(Beneficiario.situacao == situacao)

    consulta = select(Beneficiario).where(*condicoes)
    if termo:
        from app.core.br_validators import sem_acento

        consulta = consulta.join(Pessoa, Pessoa.id == Beneficiario.pessoa_id).where(
            Pessoa.busca.ilike(f"%{sem_acento(termo)}%")
        )

    total = await db.scalar(select(func.count()).select_from(consulta.subquery())) or 0
    registros = list(
        (
            await db.execute(
                consulta.order_by(Beneficiario.created_at.desc())
                .offset(paginacao.offset)
                .limit(paginacao.por_pagina)
            )
        )
        .scalars()
        .all()
    )

    itens = []
    for beneficiario in registros:
        pessoa = await db.get(Pessoa, beneficiario.pessoa_id)
        documento, mascarado = documento_visivel(user, pessoa.documento if pessoa else None)
        saldos = await _saldos_do_beneficiario(db, beneficiario.id)
        itens.append(
            {
                "id": beneficiario.id,
                "programa_id": beneficiario.programa_id,
                "pessoa": (
                    {
                        "id": pessoa.id,
                        "nome": pessoa.nome,
                        "documento": documento,
                        "documento_mascarado": mascarado,
                        "telefone": pessoa.telefone,
                        "bairro": pessoa.bairro,
                        "situacao": pessoa.situacao,
                        "tipos": pessoa.tipos or [],
                    }
                    if pessoa
                    else None
                ),
                "classificacao": beneficiario.classificacao,
                "atividade_produtiva": beneficiario.atividade_produtiva,
                "data_entrada": beneficiario.data_entrada,
                "validade_ate": beneficiario.validade_ate,
                "situacao": beneficiario.situacao,
                "saldo_total_disponivel": round(sum(s.saldo_disponivel for s in saldos), 2),
                "saldos": [_serializar_saldo(s) for s in saldos],
            }
        )
    return pagina_payload(itens, total, paginacao)


@router.post("/beneficiarios", status_code=status.HTTP_201_CREATED, summary="Inscrever beneficiário")
async def criar_beneficiario(
    dados: esquemas.BeneficiarioEntrada,
    request: Request,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(exigir(P.PORTEIRA_CRIAR)),
):
    programa = await buscar_da_organizacao(db, Programa, dados.programa_id, user, "Programa não encontrado.")
    pessoa = await buscar_da_organizacao(db, Pessoa, dados.pessoa_id, user, "Pessoa não encontrada.")

    existente = await db.scalar(
        select(Beneficiario).where(
            Beneficiario.programa_id == programa.id,
            Beneficiario.pessoa_id == pessoa.id,
            Beneficiario.deleted_at.is_(None),
        )
    )
    if existente is not None:
        raise Conflict(f"{pessoa.nome} já está inscrito neste programa.")

    beneficiario = Beneficiario(
        organizacao_id=user.organizacao_id,
        programa_id=programa.id,
        pessoa_id=pessoa.id,
        classificacao=dados.classificacao,
        atividade_produtiva=dados.atividade_produtiva,
        data_entrada=dados.data_entrada or date.today(),
        validade_ate=dados.validade_ate or programa.vigencia_fim,
        situacao=SituacaoBeneficiario.ATIVO.value,
        observacoes=dados.observacoes,
        created_by_id=user.id,
        updated_by_id=user.id,
    )
    db.add(beneficiario)
    await db.flush()

    # Concessão inicial: usa o valor informado ou o padrão do programa.
    horas = dados.horas_iniciais
    if horas is None and programa.horas_por_beneficiario:
        horas = programa.horas_por_beneficiario
    if horas:
        saldo = await banco_horas.obter_ou_criar_saldo(
            db,
            organizacao_id=user.organizacao_id,
            programa=programa,
            beneficiario=beneficiario,
            travar=True,
        )
        await banco_horas.conceder(
            db, saldo, horas, usuario_id=user.id, motivo=f"Concessão inicial — {programa.nome}"
        )

    await auditoria.registrar(
        db,
        acao=AcaoAuditoria.CRIAR,
        usuario=user,
        entidade="beneficiario",
        entidade_id=beneficiario.id,
        entidade_descricao=pessoa.nome,
        dados_depois=auditoria.instantaneo(beneficiario),
        detalhe=f"Concessão inicial de {horas or 0}h",
        cliente=cliente(request),
    )
    await db.commit()
    return {
        "id": beneficiario.id,
        "mensagem": f"{pessoa.nome} inscrito no programa.",
        "horas_concedidas": horas or 0,
    }


@router.get("/beneficiarios/{beneficiario_id}", summary="Detalhar beneficiário")
async def detalhar_beneficiario(
    beneficiario_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(exigir(P.PORTEIRA_VISUALIZAR)),
):
    beneficiario = await buscar_da_organizacao(
        db, Beneficiario, beneficiario_id, user, "Beneficiário não encontrado."
    )
    pessoa = await db.get(Pessoa, beneficiario.pessoa_id)
    programa = await db.get(Programa, beneficiario.programa_id)
    documento, mascarado = documento_visivel(user, pessoa.documento if pessoa else None)

    saldos = await _saldos_do_beneficiario(db, beneficiario.id)
    propriedades = list(
        (
            await db.execute(
                select(Imovel)
                .join(PessoaImovel, PessoaImovel.imovel_id == Imovel.id)
                .where(
                    PessoaImovel.pessoa_id == beneficiario.pessoa_id,
                    Imovel.deleted_at.is_(None),
                )
            )
        )
        .scalars()
        .all()
    )
    bloqueios = await elegibilidade.bloqueios_ativos(
        db,
        user.organizacao_id,
        pessoa_id=beneficiario.pessoa_id,
        servico=ServicoAfetado.PORTEIRA_ADENTRO.value,
    )
    atendimentos = await db.scalar(
        select(func.count())
        .select_from(SolicitacaoServico)
        .where(
            SolicitacaoServico.beneficiario_id == beneficiario.id,
            SolicitacaoServico.deleted_at.is_(None),
        )
    ) or 0

    return {
        "id": beneficiario.id,
        "programa_id": beneficiario.programa_id,
        "programa_nome": programa.nome if programa else None,
        "metodo_desconto": programa.metodo_desconto if programa else None,
        "pessoa": (
            {
                "id": pessoa.id,
                "nome": pessoa.nome,
                "documento": documento,
                "documento_mascarado": mascarado,
                "telefone": pessoa.telefone,
                "whatsapp": pessoa.whatsapp,
                "bairro": pessoa.bairro,
                "situacao": pessoa.situacao,
                "tipos": pessoa.tipos or [],
            }
            if pessoa
            else None
        ),
        "classificacao": beneficiario.classificacao,
        "atividade_produtiva": beneficiario.atividade_produtiva,
        "data_entrada": beneficiario.data_entrada,
        "validade_ate": beneficiario.validade_ate,
        "situacao": beneficiario.situacao,
        "pendencias": beneficiario.pendencias,
        "observacoes": beneficiario.observacoes,
        "saldos": [
            _serializar_saldo(
                s, next((p.nome or p.codigo for p in propriedades if p.id == s.imovel_id), None)
            )
            for s in saldos
        ],
        "saldo_total_disponivel": round(sum(s.saldo_disponivel for s in saldos), 2),
        "propriedades": [
            {
                "id": p.id,
                "codigo": p.codigo,
                "nome": p.nome,
                "tipo": p.tipo,
                "comunidade": p.comunidade,
                "bairro": p.bairro,
                "latitude": p.latitude,
                "longitude": p.longitude,
                "situacao": p.situacao,
            }
            for p in propriedades
        ],
        "bloqueios_ativos": len(bloqueios),
        "atendimentos": atendimentos,
        "arquivos": [
            servico_arquivos.resumo(a)
            for a in await servico_arquivos.listar(db, "beneficiario", beneficiario.id)
        ],
    }


@router.post("/beneficiarios/{beneficiario_id}/horas", summary="Conceder horas")
async def conceder_horas(
    beneficiario_id: uuid.UUID,
    dados: esquemas.ConcessaoHorasEntrada,
    request: Request,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(exigir(P.HORAS_CONCEDER)),
):
    beneficiario = await buscar_da_organizacao(
        db, Beneficiario, beneficiario_id, user, "Beneficiário não encontrado."
    )
    programa = await db.get(Programa, beneficiario.programa_id)
    if programa is None:
        raise NotFound("Programa do beneficiário não encontrado.")

    saldo = await banco_horas.obter_ou_criar_saldo(
        db,
        organizacao_id=user.organizacao_id,
        programa=programa,
        beneficiario=beneficiario,
        imovel_id=dados.imovel_id,
        categoria=dados.categoria or "",
        travar=True,
    )
    movimento = await banco_horas.conceder(
        db, saldo, dados.quantidade, usuario_id=user.id, motivo=dados.motivo
    )
    await auditoria.registrar(
        db,
        acao=AcaoAuditoria.AJUSTE_HORAS,
        usuario=user,
        entidade="saldo_horas",
        entidade_id=saldo.id,
        entidade_descricao=f"Concessão de {dados.quantidade}h",
        detalhe=dados.motivo,
        dados_depois={
            "saldo_anterior": movimento.saldo_anterior,
            "saldo_posterior": movimento.saldo_posterior,
        },
        cliente=cliente(request),
    )
    await db.commit()
    return {
        "mensagem": f"{dados.quantidade:g}h concedidas.",
        "saldo_disponivel": saldo.saldo_disponivel,
    }


@router.post("/saldos/{saldo_id}/ajustar", summary="Ajuste manual do banco de horas")
async def ajustar_horas(
    saldo_id: uuid.UUID,
    dados: esquemas.AjusteHorasEntrada,
    request: Request,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(exigir(P.HORAS_AJUSTAR)),
):
    """Ajuste administrativo — sempre com justificativa e sempre auditado."""
    saldo = await buscar_da_organizacao(db, SaldoHoras, saldo_id, user, "Saldo não encontrado.")
    movimento = await banco_horas.ajustar(
        db,
        saldo,
        dados.quantidade,
        usuario_id=user.id,
        justificativa=dados.justificativa,
        credito=dados.credito,
    )
    await auditoria.registrar(
        db,
        acao=AcaoAuditoria.AJUSTE_HORAS,
        usuario=user,
        entidade="saldo_horas",
        entidade_id=saldo.id,
        entidade_descricao=f"Ajuste {'de crédito' if dados.credito else 'de débito'} de {dados.quantidade}h",
        justificativa=dados.justificativa,
        dados_antes={"saldo": movimento.saldo_anterior},
        dados_depois={"saldo": movimento.saldo_posterior},
        cliente=cliente(request),
    )
    await db.commit()
    return {"mensagem": "Ajuste registrado.", "saldo_disponivel": saldo.saldo_disponivel}


@router.get("/saldos/{saldo_id}/extrato", summary="Extrato do banco de horas")
async def extrato_horas(
    saldo_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(exigir(P.HORAS_VISUALIZAR)),
):
    saldo = await buscar_da_organizacao(db, SaldoHoras, saldo_id, user, "Saldo não encontrado.")
    movimentos = await banco_horas.extrato(db, saldo.id)
    nomes = await nomes_de_usuarios(db, [m.created_by_id for m in movimentos])
    ordens = {}
    for movimento in movimentos:
        if movimento.ordem_id and movimento.ordem_id not in ordens:
            ordem = await db.get(OrdemServico, movimento.ordem_id)
            ordens[movimento.ordem_id] = ordem.numero_formatado if ordem else None

    return {
        "saldo": _serializar_saldo(saldo),
        "integridade": await banco_horas.conferir_integridade(db, saldo.id),
        "movimentos": [
            {
                "id": m.id,
                "tipo": m.tipo,
                "quantidade": m.quantidade,
                "saldo_anterior": m.saldo_anterior,
                "saldo_posterior": m.saldo_posterior,
                "motivo": m.motivo,
                "observacao": m.observacao,
                "ordem_id": m.ordem_id,
                "ordem_numero": ordens.get(m.ordem_id),
                "created_at": m.created_at,
                "usuario": nomes.get(m.created_by_id),
            }
            for m in movimentos
        ],
    }


# ─────────────────────────────────────────────────────────────────────────────
# Tipos de serviço
# ─────────────────────────────────────────────────────────────────────────────


@router.get("/tipos-servico", summary="Catálogo de serviços")
async def listar_tipos_servico(
    apenas_ativos: bool = True,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(exigir(P.PORTEIRA_VISUALIZAR)),
):
    condicoes = [TipoServico.organizacao_id == user.organizacao_id]
    if apenas_ativos:
        condicoes.append(TipoServico.ativo.is_(True))
    registros = (
        await db.execute(
            select(TipoServico).where(*condicoes).order_by(TipoServico.ordem, TipoServico.nome)
        )
    ).scalars().all()
    return [
        {
            "id": t.id,
            "chave": t.chave,
            "nome": t.nome,
            "descricao": t.descricao,
            "categorias_compativeis": t.categorias_compativeis or [],
            "exige_vistoria": t.exige_vistoria,
            "exige_aprovacao_especial": t.exige_aprovacao_especial,
            "documentos_obrigatorios": t.documentos_obrigatorios or [],
            "horas_medias": t.horas_medias,
            "consumo_medio_litros": t.consumo_medio_litros,
            "usa_banco_horas": t.usa_banco_horas,
            "permite_caminhoes": t.permite_caminhoes,
            "ativo": t.ativo,
            "ordem": t.ordem,
        }
        for t in registros
    ]


@router.post("/tipos-servico", status_code=status.HTTP_201_CREATED, summary="Cadastrar tipo de serviço")
async def criar_tipo_servico(
    dados: esquemas.TipoServicoEntrada,
    request: Request,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(exigir(P.CONFIGURACOES_EDITAR)),
):
    existente = await db.scalar(
        select(TipoServico).where(
            TipoServico.organizacao_id == user.organizacao_id, TipoServico.chave == dados.chave
        )
    )
    if existente is not None:
        raise Conflict("Já existe um tipo de serviço com esta chave.")

    tipo = TipoServico(organizacao_id=user.organizacao_id, created_by_id=user.id, **dados.model_dump())
    db.add(tipo)
    await db.flush()
    await auditoria.registrar(
        db,
        acao=AcaoAuditoria.ALTERAR_CONFIGURACAO,
        usuario=user,
        entidade="tipo_servico",
        entidade_id=tipo.id,
        entidade_descricao=tipo.nome,
        dados_depois=auditoria.instantaneo(tipo),
        cliente=cliente(request),
    )
    await db.commit()
    return {"id": tipo.id, "mensagem": "Tipo de serviço cadastrado."}


# ─────────────────────────────────────────────────────────────────────────────
# Solicitações de serviço
# ─────────────────────────────────────────────────────────────────────────────


async def _transicionar_servico(
    db: AsyncSession,
    solicitacao: SolicitacaoServico,
    nova: str,
    usuario: User,
    *,
    justificativa: str | None = None,
    observacoes: str | None = None,
) -> None:
    atual = solicitacao.situacao
    permitidas = TRANSICOES_SERVICO.get(atual, set())
    if nova != atual and nova not in permitidas:
        raise Conflict(
            (
                f"Não é possível mudar de '{com_rotulo(atual)}' para '{com_rotulo(nova)}'. "
                "Transições permitidas: "
                + (", ".join(sorted(com_rotulo(p) for p in permitidas)) or "nenhuma")
                + "."
            ),
            "transicao_invalida",
        )
    db.add(
        HistoricoSituacao(
            entidade="solicitacao_servico",
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


@router.get("/solicitacoes", summary="Listar solicitações de serviço")
async def listar_solicitacoes(
    situacao: list[str] | None = Query(None),
    programa_id: uuid.UUID | None = None,
    beneficiario_id: uuid.UUID | None = None,
    tipo_servico_id: uuid.UUID | None = None,
    prioridade: str | None = None,
    ativas: bool = False,
    termo: str | None = None,
    paginacao: Paginacao = Depends(),
    db: AsyncSession = Depends(get_db),
    user: User = Depends(exigir(P.PORTEIRA_VISUALIZAR)),
):
    condicoes = [
        SolicitacaoServico.organizacao_id == user.organizacao_id,
        SolicitacaoServico.deleted_at.is_(None),
    ]
    if situacao:
        condicoes.append(SolicitacaoServico.situacao.in_(situacao))
    if ativas:
        condicoes.append(SolicitacaoServico.situacao.in_(SERVICO_ATIVO))
    if programa_id:
        condicoes.append(SolicitacaoServico.programa_id == programa_id)
    if beneficiario_id:
        condicoes.append(SolicitacaoServico.beneficiario_id == beneficiario_id)
    if tipo_servico_id:
        condicoes.append(SolicitacaoServico.tipo_servico_id == tipo_servico_id)
    if prioridade:
        condicoes.append(SolicitacaoServico.prioridade == prioridade)
    if termo:
        condicoes.append(SolicitacaoServico.protocolo_formatado.ilike(f"%{termo}%"))

    consulta = select(SolicitacaoServico).where(*condicoes)
    total = await db.scalar(select(func.count()).select_from(consulta.subquery())) or 0
    registros = list(
        (
            await db.execute(
                consulta.order_by(SolicitacaoServico.created_at.desc())
                .offset(paginacao.offset)
                .limit(paginacao.por_pagina)
            )
        )
        .scalars()
        .all()
    )

    itens = []
    for solicitacao in registros:
        beneficiario = await db.get(Beneficiario, solicitacao.beneficiario_id)
        pessoa = await db.get(Pessoa, beneficiario.pessoa_id) if beneficiario else None
        imovel = await db.get(Imovel, solicitacao.imovel_id)
        tipo = await db.get(TipoServico, solicitacao.tipo_servico_id)
        itens.append(
            {
                "id": solicitacao.id,
                "protocolo_formatado": solicitacao.protocolo_formatado,
                "situacao": solicitacao.situacao,
                "situacao_rotulo": com_rotulo(solicitacao.situacao),
                "prioridade": solicitacao.prioridade,
                "produtor": pessoa.nome if pessoa else None,
                "propriedade": (imovel.nome or imovel.codigo) if imovel else None,
                "tipo_servico": tipo.nome if tipo else None,
                "horas_estimadas": solicitacao.horas_estimadas,
                "horas_autorizadas": solicitacao.horas_autorizadas,
                "data_desejada": solicitacao.data_desejada,
                "data_agendada": solicitacao.data_agendada,
                "created_at": solicitacao.created_at,
                "latitude": solicitacao.latitude,
                "longitude": solicitacao.longitude,
            }
        )
    return pagina_payload(itens, total, paginacao)


@router.post(
    "/solicitacoes", status_code=status.HTTP_201_CREATED, summary="Registrar solicitação de serviço"
)
async def criar_solicitacao(
    dados: esquemas.SolicitacaoServicoEntrada,
    request: Request,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(exigir(P.PORTEIRA_CRIAR)),
):
    programa = await buscar_da_organizacao(db, Programa, dados.programa_id, user, "Programa não encontrado.")
    beneficiario = await buscar_da_organizacao(
        db, Beneficiario, dados.beneficiario_id, user, "Beneficiário não encontrado."
    )
    imovel = await buscar_da_organizacao(db, Imovel, dados.imovel_id, user, "Propriedade não encontrada.")
    tipo = await buscar_da_organizacao(
        db, TipoServico, dados.tipo_servico_id, user, "Tipo de serviço não encontrado."
    )
    pessoa = await db.get(Pessoa, beneficiario.pessoa_id)

    horas = dados.horas_estimadas or tipo.horas_medias
    saldo = await banco_horas.obter_ou_criar_saldo(
        db,
        organizacao_id=user.organizacao_id,
        programa=programa,
        beneficiario=beneficiario,
        imovel_id=imovel.id,
    )

    if not dados.rascunho:
        resultado = await elegibilidade.verificar_porteira(
            db,
            user.organizacao_id,
            pessoa=pessoa,
            imovel=imovel,
            data_desejada=dados.data_desejada,
            horas_estimadas=horas if tipo.usa_banco_horas else None,
            saldo_disponivel=saldo.saldo_disponivel if tipo.usa_banco_horas else None,
            programa_vigente=programa.vigente_em(dados.data_desejada or date.today()),
            beneficiario_ativo=beneficiario.situacao == SituacaoBeneficiario.ATIVO.value,
        )
        if not resultado.elegivel:
            pode_excecao = usuario_pode(user, P.BLOQUEIOS_EXCECAO)
            if resultado.bloqueios_absolutos or not pode_excecao or not dados.justificativa_excecao:
                raise RegraNegocio(
                    "A solicitação não pode ser registrada: verifique os impedimentos.",
                    [i.dict() for i in resultado.impedimentos],
                    "impedimento_elegibilidade",
                )

    ano, numero, formatado = await protocolo.protocolo_servico(db, user.organizacao_id)

    solicitacao = SolicitacaoServico(
        organizacao_id=user.organizacao_id,
        ano=ano,
        protocolo=numero,
        protocolo_formatado=formatado,
        programa_id=programa.id,
        beneficiario_id=beneficiario.id,
        imovel_id=imovel.id,
        tipo_servico_id=tipo.id,
        descricao=dados.descricao,
        motivo=dados.motivo,
        dimensoes_estimadas=dados.dimensoes_estimadas,
        quantidade_material=dados.quantidade_material,
        instrucoes_acesso=dados.instrucoes_acesso or imovel.instrucoes_acesso,
        horas_estimadas=horas,
        maquinas_sugeridas=dados.maquinas_sugeridas,
        veiculos_sugeridos=dados.veiculos_sugeridos,
        data_desejada=dados.data_desejada,
        prioridade=dados.prioridade,
        latitude=imovel.latitude,
        longitude=imovel.longitude,
        situacao=(
            SituacaoServico.RASCUNHO.value if dados.rascunho else SituacaoServico.PROTOCOLADA.value
        ),
        observacoes=dados.observacoes,
        justificativa_excecao=dados.justificativa_excecao,
        created_by_id=user.id,
        updated_by_id=user.id,
    )
    db.add(solicitacao)
    await db.flush()

    db.add(
        HistoricoSituacao(
            entidade="solicitacao_servico",
            entidade_id=solicitacao.id,
            situacao_nova=solicitacao.situacao,
            observacoes="Solicitação registrada",
            created_by_id=user.id,
        )
    )
    await auditoria.registrar(
        db,
        acao=AcaoAuditoria.CRIAR,
        usuario=user,
        entidade="solicitacao_servico",
        entidade_id=solicitacao.id,
        entidade_descricao=formatado,
        justificativa=dados.justificativa_excecao,
        dados_depois=auditoria.instantaneo(solicitacao),
        cliente=cliente(request),
    )
    if not dados.rascunho:
        await notificacoes.para_perfis(
            db,
            organizacao_id=user.organizacao_id,
            perfis=[Perfil.GESTOR, Perfil.TECNICO],
            tipo=TipoNotificacao.SOLICITACAO_CADASTRADA,
            titulo=f"Nova solicitação do Porteira Adentro {formatado}",
            mensagem=f"{pessoa.nome if pessoa else 'Produtor'} — {tipo.nome}",
            entidade="solicitacao_servico",
            entidade_id=solicitacao.id,
            link=f"/porteira-adentro/{solicitacao.id}",
        )
    await db.commit()

    return {
        "id": solicitacao.id,
        "protocolo": formatado,
        "situacao": solicitacao.situacao,
        "saldo_disponivel": saldo.saldo_disponivel,
        "mensagem": (
            "Rascunho salvo."
            if dados.rascunho
            else f"Solicitação protocolada sob o número {formatado}."
        ),
    }


@router.get("/solicitacoes/{solicitacao_id}", summary="Detalhar solicitação de serviço")
async def detalhar_solicitacao(
    solicitacao_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(exigir(P.PORTEIRA_VISUALIZAR)),
):
    solicitacao = await buscar_da_organizacao(
        db, SolicitacaoServico, solicitacao_id, user, "Solicitação não encontrada."
    )
    beneficiario = await db.get(Beneficiario, solicitacao.beneficiario_id)
    pessoa = await db.get(Pessoa, beneficiario.pessoa_id) if beneficiario else None
    imovel = await db.get(Imovel, solicitacao.imovel_id)
    tipo = await db.get(TipoServico, solicitacao.tipo_servico_id)
    programa = await db.get(Programa, solicitacao.programa_id)
    nomes = await nomes_de_usuarios(db, [solicitacao.aprovado_por_id, solicitacao.created_by_id])
    documento, mascarado = documento_visivel(user, pessoa.documento if pessoa else None)

    saldo = None
    if beneficiario and programa:
        saldo = await banco_horas.obter_ou_criar_saldo(
            db,
            organizacao_id=user.organizacao_id,
            programa=programa,
            beneficiario=beneficiario,
            imovel_id=solicitacao.imovel_id,
        )

    vistorias = list(
        (await db.execute(select(Vistoria).where(Vistoria.solicitacao_id == solicitacao.id)))
        .scalars()
        .all()
    )
    ordens = list(
        (
            await db.execute(
                select(OrdemServico).where(
                    OrdemServico.solicitacao_id == solicitacao.id, OrdemServico.deleted_at.is_(None)
                )
            )
        )
        .scalars()
        .all()
    )

    return {
        "id": solicitacao.id,
        "ano": solicitacao.ano,
        "protocolo_formatado": solicitacao.protocolo_formatado,
        "situacao": solicitacao.situacao,
        "situacao_rotulo": com_rotulo(solicitacao.situacao),
        "prioridade": solicitacao.prioridade,
        "programa_id": solicitacao.programa_id,
        "programa_nome": programa.nome if programa else None,
        "metodo_desconto": programa.metodo_desconto if programa else None,
        "beneficiario_id": solicitacao.beneficiario_id,
        "produtor": pessoa.nome if pessoa else None,
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
        "propriedade": (imovel.nome or imovel.codigo) if imovel else None,
        "imovel": (
            {
                "id": imovel.id,
                "codigo": imovel.codigo,
                "nome": imovel.nome,
                "tipo": imovel.tipo,
                "comunidade": imovel.comunidade,
                "estrada_acesso": imovel.estrada_acesso,
                "latitude": imovel.latitude,
                "longitude": imovel.longitude,
                "instrucoes_acesso": imovel.instrucoes_acesso,
            }
            if imovel
            else None
        ),
        "tipo_servico": tipo.nome if tipo else None,
        "tipo_servico_id": solicitacao.tipo_servico_id,
        "exige_vistoria": (tipo.exige_vistoria if tipo else False)
        or (programa.exige_vistoria if programa else False),
        "descricao": solicitacao.descricao,
        "motivo": solicitacao.motivo,
        "dimensoes_estimadas": solicitacao.dimensoes_estimadas,
        "quantidade_material": solicitacao.quantidade_material,
        "instrucoes_acesso": solicitacao.instrucoes_acesso,
        "horas_estimadas": solicitacao.horas_estimadas,
        "horas_autorizadas": solicitacao.horas_autorizadas,
        "maquinas_sugeridas": solicitacao.maquinas_sugeridas or [],
        "veiculos_sugeridos": solicitacao.veiculos_sugeridos or [],
        "data_desejada": solicitacao.data_desejada,
        "data_agendada": solicitacao.data_agendada,
        "latitude": solicitacao.latitude,
        "longitude": solicitacao.longitude,
        "parecer_tecnico": solicitacao.parecer_tecnico,
        "motivo_reprovacao": solicitacao.motivo_reprovacao,
        "motivo_cancelamento": solicitacao.motivo_cancelamento,
        "justificativa_excecao": solicitacao.justificativa_excecao,
        "observacoes": solicitacao.observacoes,
        "aprovado_por": nomes.get(solicitacao.aprovado_por_id),
        "aprovado_em": solicitacao.aprovado_em,
        "created_at": solicitacao.created_at,
        "row_version": solicitacao.row_version,
        "saldo_disponivel": saldo.saldo_disponivel if saldo else None,
        "saldo_id": saldo.id if saldo else None,
        "proximas_situacoes": sorted(TRANSICOES_SERVICO.get(solicitacao.situacao, set())),
        "arquivos": [
            servico_arquivos.resumo(a)
            for a in await servico_arquivos.listar(db, "solicitacao_servico", solicitacao.id)
        ],
        "vistorias": [
            {
                "id": v.id,
                "solicitacao_id": v.solicitacao_id,
                "tecnico_id": v.tecnico_id,
                "data_agendada": v.data_agendada,
                "realizada_em": v.realizada_em,
                "condicoes_acesso": v.condicoes_acesso,
                "medidas_aproximadas": v.medidas_aproximadas,
                "tipo_solo": v.tipo_solo,
                "riscos": v.riscos,
                "interferencias": v.interferencias,
                "materiais_necessarios": v.materiais_necessarios,
                "maquinas_recomendadas": v.maquinas_recomendadas or [],
                "veiculos_recomendados": v.veiculos_recomendados or [],
                "viagens_estimadas": v.viagens_estimadas,
                "horas_estimadas": v.horas_estimadas,
                "combustivel_estimado_litros": v.combustivel_estimado_litros,
                "parecer": v.parecer,
                "favoravel": v.favoravel,
                "observacoes": v.observacoes,
                "latitude": v.latitude,
                "longitude": v.longitude,
                "created_at": v.created_at,
                "arquivos": [
                    servico_arquivos.resumo(a)
                    for a in await servico_arquivos.listar(db, "vistoria", v.id)
                ],
            }
            for v in vistorias
        ],
        "ordens": [
            {
                "id": o.id,
                "numero_formatado": o.numero_formatado,
                "data_prevista": o.data_prevista,
                "situacao": o.situacao,
                "horas_autorizadas": o.horas_autorizadas,
                "horas_totais": o.horas_totais,
            }
            for o in ordens
        ],
    }


@router.post("/solicitacoes/{solicitacao_id}/situacao", summary="Mudar situação da solicitação")
async def mudar_situacao(
    solicitacao_id: uuid.UUID,
    dados: esquemas.TransicaoEntrada,
    request: Request,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(exigir(P.PORTEIRA_ANALISAR)),
):
    """Workflow do item 23. Reprovação e cancelamento exigem justificativa."""
    solicitacao = await buscar_da_organizacao(
        db, SolicitacaoServico, solicitacao_id, user, "Solicitação não encontrada."
    )
    if dados.situacao not in SituacaoServico.valores():
        raise AppError("Situação inválida.", 422, "situacao_invalida")

    exige_justificativa = dados.situacao in {
        SituacaoServico.REPROVADA.value,
        SituacaoServico.CANCELADA.value,
    }
    if exige_justificativa and not dados.justificativa:
        rotulo_acao = "reprovação" if dados.situacao == SituacaoServico.REPROVADA.value else "cancelamento"
        raise AppError(f"A {rotulo_acao} exige justificativa.", 422, "justificativa_obrigatoria")

    # Aprovar e reabrir têm permissões próprias.
    if dados.situacao == SituacaoServico.APROVADA.value and not usuario_pode(user, P.PORTEIRA_APROVAR):
        raise AppError("Aprovar exige a permissão govinfra.porteira.aprovar.", 403, "permissao_negada")
    if (
        solicitacao.situacao == SituacaoServico.REPROVADA.value
        and dados.situacao == SituacaoServico.EM_ANALISE.value
        and not usuario_pode(user, P.PORTEIRA_APROVAR)
    ):
        raise AppError(
            "Reabrir uma solicitação reprovada exige permissão especial.", 403, "permissao_negada"
        )

    antes = solicitacao.situacao
    if dados.situacao == SituacaoServico.REPROVADA.value:
        solicitacao.motivo_reprovacao = dados.justificativa
    if dados.situacao == SituacaoServico.CANCELADA.value:
        solicitacao.motivo_cancelamento = dados.justificativa
    if dados.situacao == SituacaoServico.APROVADA.value:
        solicitacao.aprovado_por_id = user.id
        solicitacao.aprovado_em = datetime.now(timezone.utc)
        # Horas autorizadas: a estimativa vira o teto oficial da ordem.
        if solicitacao.horas_autorizadas is None:
            solicitacao.horas_autorizadas = solicitacao.horas_estimadas

    await _transicionar_servico(
        db,
        solicitacao,
        dados.situacao,
        user,
        justificativa=dados.justificativa,
        observacoes=dados.observacoes,
    )

    acao = {
        SituacaoServico.APROVADA.value: AcaoAuditoria.APROVAR,
        SituacaoServico.REPROVADA.value: AcaoAuditoria.REPROVAR,
        SituacaoServico.CANCELADA.value: AcaoAuditoria.CANCELAR,
    }.get(dados.situacao, AcaoAuditoria.ALTERAR)

    await auditoria.registrar(
        db,
        acao=acao,
        usuario=user,
        entidade="solicitacao_servico",
        entidade_id=solicitacao.id,
        entidade_descricao=solicitacao.protocolo_formatado,
        justificativa=dados.justificativa,
        detalhe=f"Situação alterada de '{antes}' para '{dados.situacao}'",
        cliente=cliente(request),
    )

    if dados.situacao in {SituacaoServico.APROVADA.value, SituacaoServico.REPROVADA.value}:
        await notificacoes.para_perfis(
            db,
            organizacao_id=user.organizacao_id,
            perfis=[Perfil.ATENDENTE, Perfil.GESTOR],
            tipo=(
                TipoNotificacao.SOLICITACAO_APROVADA
                if dados.situacao == SituacaoServico.APROVADA.value
                else TipoNotificacao.SOLICITACAO_REJEITADA
            ),
            titulo=f"Solicitação {solicitacao.protocolo_formatado} {com_rotulo(dados.situacao).lower()}",
            mensagem=dados.justificativa or "",
            entidade="solicitacao_servico",
            entidade_id=solicitacao.id,
            link=f"/porteira-adentro/{solicitacao.id}",
        )

    await db.commit()
    return {"mensagem": f"Situação alterada para '{com_rotulo(dados.situacao)}'."}


@router.post("/solicitacoes/{solicitacao_id}/recomendar-datas", summary="Sugerir datas do serviço")
async def recomendar_datas(
    solicitacao_id: uuid.UUID,
    quantidade: int = Query(3, ge=1, le=10),
    db: AsyncSession = Depends(get_db),
    user: User = Depends(exigir(P.AGENDA_VISUALIZAR)),
):
    solicitacao = await buscar_da_organizacao(
        db, SolicitacaoServico, solicitacao_id, user, "Solicitação não encontrada."
    )
    tipo = await db.get(TipoServico, solicitacao.tipo_servico_id)
    programa = await db.get(Programa, solicitacao.programa_id)
    beneficiario = await db.get(Beneficiario, solicitacao.beneficiario_id)

    saldo = None
    if programa and beneficiario and tipo and tipo.usa_banco_horas:
        saldo = await banco_horas.obter_ou_criar_saldo(
            db,
            organizacao_id=user.organizacao_id,
            programa=programa,
            beneficiario=beneficiario,
            imovel_id=solicitacao.imovel_id,
        )

    opcoes = await recomendacao.recomendar_datas_servico(
        db,
        user.organizacao_id,
        solicitacao=solicitacao,
        categorias_necessarias=(tipo.categorias_compativeis if tipo else None),
        horas_previstas=solicitacao.horas_autorizadas or solicitacao.horas_estimadas,
        saldo_disponivel=saldo.saldo_disponivel if saldo else None,
        quantidade=quantidade,
    )
    return {
        "opcoes": [o.dict() for o in opcoes],
        "observacao": (
            "Datas calculadas por regras configuráveis. Quando falta recurso obrigatório, "
            "o sistema informa o impedimento em vez de recomendar a data."
        ),
    }


# ─────────────────────────────────────────────────────────────────────────────
# Vistorias
# ─────────────────────────────────────────────────────────────────────────────


@router.post(
    "/solicitacoes/{solicitacao_id}/vistorias",
    status_code=status.HTTP_201_CREATED,
    summary="Registrar vistoria técnica",
)
async def registrar_vistoria(
    solicitacao_id: uuid.UUID,
    dados: esquemas.VistoriaEntrada,
    request: Request,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(exigir(P.VISTORIAS_REALIZAR)),
):
    """Vistoria do item 24 — pensada para ser preenchida no celular, no local."""
    solicitacao = await buscar_da_organizacao(
        db, SolicitacaoServico, solicitacao_id, user, "Solicitação não encontrada."
    )
    vistoria = Vistoria(
        solicitacao_id=solicitacao.id,
        tecnico_id=dados.tecnico_id or user.id,
        created_by_id=user.id,
        updated_by_id=user.id,
        **dados.model_dump(exclude={"tecnico_id", "assinatura"}),
    )
    db.add(vistoria)
    await db.flush()

    if dados.assinatura is not None:
        from app.api.v1.solicitacoes import _guardar_assinatura

        await _guardar_assinatura(db, user, "vistoria", vistoria.id, dados.assinatura, request)

    # A vistoria realizada move a solicitação e pode reestimar as horas.
    if vistoria.realizada_em is not None:
        if solicitacao.situacao in {
            SituacaoServico.AGUARDANDO_VISTORIA.value,
            SituacaoServico.VISTORIA_AGENDADA.value,
        }:
            await _transicionar_servico(
                db,
                solicitacao,
                SituacaoServico.VISTORIA_REALIZADA.value,
                user,
                observacoes="Vistoria concluída pelo técnico",
            )
        if dados.horas_estimadas:
            solicitacao.horas_estimadas = dados.horas_estimadas
        if dados.parecer:
            solicitacao.parecer_tecnico = dados.parecer
    elif dados.data_agendada and solicitacao.situacao == SituacaoServico.AGUARDANDO_VISTORIA.value:
        await _transicionar_servico(
            db,
            solicitacao,
            SituacaoServico.VISTORIA_AGENDADA.value,
            user,
            observacoes=f"Vistoria agendada para {dados.data_agendada.strftime('%d/%m/%Y')}",
        )
        await notificacoes.para_perfis(
            db,
            organizacao_id=user.organizacao_id,
            perfis=[Perfil.TECNICO],
            tipo=TipoNotificacao.VISTORIA_AGENDADA,
            titulo=f"Vistoria em {dados.data_agendada.strftime('%d/%m/%Y')}",
            mensagem=f"Protocolo {solicitacao.protocolo_formatado}",
            entidade="solicitacao_servico",
            entidade_id=solicitacao.id,
            link=f"/porteira-adentro/{solicitacao.id}",
        )

    await auditoria.registrar(
        db,
        acao=AcaoAuditoria.CRIAR,
        usuario=user,
        entidade="vistoria",
        entidade_id=vistoria.id,
        entidade_descricao=f"Vistoria do protocolo {solicitacao.protocolo_formatado}",
        dados_depois=auditoria.instantaneo(vistoria),
        cliente=cliente(request),
    )
    await db.commit()
    return {"id": vistoria.id, "mensagem": "Vistoria registrada."}


@router.get("/solicitacoes/{solicitacao_id}/historico", summary="Histórico da solicitação")
async def historico_servico(
    solicitacao_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(exigir(P.PORTEIRA_VISUALIZAR)),
):
    await buscar_da_organizacao(
        db, SolicitacaoServico, solicitacao_id, user, "Solicitação não encontrada."
    )
    registros = list(
        (
            await db.execute(
                select(HistoricoSituacao)
                .where(
                    HistoricoSituacao.entidade == "solicitacao_servico",
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
