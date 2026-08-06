"""Relatórios e exportações (itens 43 a 45).

Cada relatório é uma função que devolve (colunas, linhas). A mesma estrutura
alimenta a tela, o CSV, o Excel e o PDF — assim o que o gestor vê é exatamente
o que sai impresso.
"""

from collections.abc import Callable
from typing import Any

from fastapi import APIRouter, Depends, Query, Request, Response
from sqlalchemy import func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.v1.deps import Periodo, cliente, com_rotulo
from app.core.auth import exigir
from app.core.database import get_db
from app.core.errors import AppError
from app.core.permissoes import P
from app.models.cacambas import Cacamba, RetiradaCacamba, SolicitacaoCacamba
from app.models.combustivel import Abastecimento
from app.models.enums import (
    AcaoAuditoria,
)
from app.models.frota import Maquina, Veiculo
from app.models.manutencao import Manutencao
from app.models.organizacao import User
from app.models.pessoas import Imovel, Pessoa
from app.models.porteira import (
    Beneficiario,
    OrdemMaquina,
    OrdemServico,
    SaldoHoras,
    SolicitacaoServico,
    TipoServico,
    Viagem,
)
from app.services import auditoria, exportacao

router = APIRouter(prefix="/relatorios", tags=["Relatórios"])

Resultado = tuple[list[str], list[list[Any]]]


# ─────────────────────────────────────────────────────────────────────────────
# Relatórios de caçambas (item 43)
# ─────────────────────────────────────────────────────────────────────────────


async def _cacambas_inventario(db: AsyncSession, user: User, periodo: Periodo, **_) -> Resultado:
    registros = list(
        (
            await db.execute(
                select(Cacamba)
                .where(Cacamba.organizacao_id == user.organizacao_id, Cacamba.deleted_at.is_(None))
                .order_by(Cacamba.codigo)
            )
        )
        .scalars()
        .all()
    )
    colunas = [
        "Código", "Patrimônio", "Capacidade (m³)", "Situação", "Localização",
        "Última vistoria", "Próxima vistoria", "Aquisição",
    ]
    linhas = [
        [
            c.codigo,
            c.patrimonio,
            c.capacidade_m3,
            com_rotulo(c.situacao),
            c.localizacao_atual,
            c.ultima_vistoria_em,
            c.proxima_vistoria_em,
            c.data_aquisicao,
        ]
        for c in registros
    ]
    return colunas, linhas


async def _cacambas_solicitacoes(db: AsyncSession, user: User, periodo: Periodo, **filtros) -> Resultado:
    condicoes = [
        SolicitacaoCacamba.organizacao_id == user.organizacao_id,
        SolicitacaoCacamba.deleted_at.is_(None),
    ]
    if periodo.inicio:
        condicoes.append(func.date(SolicitacaoCacamba.created_at) >= periodo.inicio)
    if periodo.fim:
        condicoes.append(func.date(SolicitacaoCacamba.created_at) <= periodo.fim)
    if filtros.get("situacao"):
        condicoes.append(SolicitacaoCacamba.situacao == filtros["situacao"])
    if filtros.get("bairro"):
        condicoes.append(SolicitacaoCacamba.bairro.ilike(f"%{filtros['bairro']}%"))

    registros = list(
        (
            await db.execute(
                select(SolicitacaoCacamba)
                .where(*condicoes)
                .order_by(SolicitacaoCacamba.created_at.desc())
            )
        )
        .scalars()
        .all()
    )
    nomes = {}
    if registros:
        linhas_pessoas = (
            await db.execute(
                select(Pessoa.id, Pessoa.nome).where(
                    Pessoa.id.in_({s.pessoa_id for s in registros})
                )
            )
        ).all()
        nomes = {linha[0]: linha[1] for linha in linhas_pessoas}

    colunas = [
        "Protocolo", "Data do pedido", "Solicitante", "Endereço", "Bairro",
        "Situação", "Prioridade", "Entrega prevista", "Retirada prevista",
        "Dias de uso", "Caçamba", "Atrasada",
    ]
    linhas = []
    for s in registros:
        cacamba = await db.get(Cacamba, s.cacamba_id) if s.cacamba_id else None
        linhas.append(
            [
                s.protocolo_formatado,
                s.created_at.date(),
                nomes.get(s.pessoa_id),
                f"{s.logradouro or ''}, {s.numero or ''}".strip(", "),
                s.bairro,
                com_rotulo(s.situacao),
                s.prioridade,
                s.data_prevista_entrega,
                s.data_prevista_retirada,
                s.dias_previstos,
                cacamba.codigo if cacamba else None,
                s.atrasada,
            ]
        )
    return colunas, linhas


async def _cacambas_por_bairro(db: AsyncSession, user: User, periodo: Periodo, **_) -> Resultado:
    condicoes = [
        SolicitacaoCacamba.organizacao_id == user.organizacao_id,
        SolicitacaoCacamba.deleted_at.is_(None),
    ]
    if periodo.inicio:
        condicoes.append(func.date(SolicitacaoCacamba.created_at) >= periodo.inicio)
    if periodo.fim:
        condicoes.append(func.date(SolicitacaoCacamba.created_at) <= periodo.fim)

    linhas_dados = (
        await db.execute(
            select(
                func.coalesce(SolicitacaoCacamba.bairro, "Não informado"),
                func.count(),
                func.coalesce(func.avg(SolicitacaoCacamba.dias_previstos), 0),
            )
            .where(*condicoes)
            .group_by(SolicitacaoCacamba.bairro)
            .order_by(func.count().desc())
        )
    ).all()

    return (
        ["Bairro", "Solicitações", "Média de dias de uso"],
        [[linha[0], int(linha[1]), round(float(linha[2] or 0), 1)] for linha in linhas_dados],
    )


async def _cacambas_ocorrencias(db: AsyncSession, user: User, periodo: Periodo, **_) -> Resultado:
    condicoes = [RetiradaCacamba.material_proibido.is_(True)]
    if periodo.inicio:
        condicoes.append(func.date(RetiradaCacamba.retirada_em) >= periodo.inicio)
    if periodo.fim:
        condicoes.append(func.date(RetiradaCacamba.retirada_em) <= periodo.fim)

    registros = list(
        (
            await db.execute(
                select(RetiradaCacamba)
                .join(
                    SolicitacaoCacamba,
                    SolicitacaoCacamba.id == RetiradaCacamba.solicitacao_id,
                )
                .where(
                    SolicitacaoCacamba.organizacao_id == user.organizacao_id,
                    or_(
                        RetiradaCacamba.material_proibido.is_(True),
                        RetiradaCacamba.houve_dano.is_(True),
                        RetiradaCacamba.ocorrencias.is_not(None),
                    ),
                    *[c for c in condicoes if c is not condicoes[0]],
                )
                .order_by(RetiradaCacamba.retirada_em.desc())
            )
        )
        .scalars()
        .all()
    )

    colunas = [
        "Data da retirada", "Protocolo", "Solicitante", "Material irregular",
        "Descrição", "Dano", "Destino da caçamba", "Ocorrências",
    ]
    linhas = []
    for r in registros:
        solicitacao = await db.get(SolicitacaoCacamba, r.solicitacao_id)
        pessoa = await db.get(Pessoa, solicitacao.pessoa_id) if solicitacao else None
        linhas.append(
            [
                r.retirada_em.date(),
                solicitacao.protocolo_formatado if solicitacao else None,
                pessoa.nome if pessoa else None,
                r.material_proibido,
                r.descricao_material_proibido,
                r.houve_dano,
                r.destino_cacamba,
                r.ocorrencias,
            ]
        )
    return colunas, linhas


# ─────────────────────────────────────────────────────────────────────────────
# Relatórios do Porteira Adentro (item 44)
# ─────────────────────────────────────────────────────────────────────────────


async def _porteira_solicitacoes(db: AsyncSession, user: User, periodo: Periodo, **filtros) -> Resultado:
    condicoes = [
        SolicitacaoServico.organizacao_id == user.organizacao_id,
        SolicitacaoServico.deleted_at.is_(None),
    ]
    if periodo.inicio:
        condicoes.append(func.date(SolicitacaoServico.created_at) >= periodo.inicio)
    if periodo.fim:
        condicoes.append(func.date(SolicitacaoServico.created_at) <= periodo.fim)
    if filtros.get("situacao"):
        condicoes.append(SolicitacaoServico.situacao == filtros["situacao"])

    registros = list(
        (
            await db.execute(
                select(SolicitacaoServico)
                .where(*condicoes)
                .order_by(SolicitacaoServico.created_at.desc())
            )
        )
        .scalars()
        .all()
    )
    colunas = [
        "Protocolo", "Data", "Produtor", "Propriedade", "Tipo de serviço",
        "Situação", "Horas estimadas", "Horas autorizadas", "Data agendada",
    ]
    linhas = []
    for s in registros:
        beneficiario = await db.get(Beneficiario, s.beneficiario_id)
        pessoa = await db.get(Pessoa, beneficiario.pessoa_id) if beneficiario else None
        imovel = await db.get(Imovel, s.imovel_id)
        tipo = await db.get(TipoServico, s.tipo_servico_id)
        linhas.append(
            [
                s.protocolo_formatado,
                s.created_at.date(),
                pessoa.nome if pessoa else None,
                (imovel.nome or imovel.codigo) if imovel else None,
                tipo.nome if tipo else None,
                com_rotulo(s.situacao),
                s.horas_estimadas,
                s.horas_autorizadas,
                s.data_agendada,
            ]
        )
    return colunas, linhas


async def _porteira_saldos(db: AsyncSession, user: User, periodo: Periodo, **_) -> Resultado:
    registros = list(
        (
            await db.execute(
                select(SaldoHoras)
                .where(SaldoHoras.organizacao_id == user.organizacao_id)
                .order_by(SaldoHoras.periodo_referencia.desc())
            )
        )
        .scalars()
        .all()
    )
    colunas = [
        "Produtor", "Propriedade", "Período", "Concedidas", "Adicionais",
        "Reservadas", "Utilizadas", "Estornadas", "Saldo disponível", "Validade",
    ]
    linhas = []
    for s in registros:
        beneficiario = await db.get(Beneficiario, s.beneficiario_id)
        pessoa = await db.get(Pessoa, beneficiario.pessoa_id) if beneficiario else None
        imovel = await db.get(Imovel, s.imovel_id) if s.imovel_id else None
        linhas.append(
            [
                pessoa.nome if pessoa else None,
                (imovel.nome or imovel.codigo) if imovel else "Todas",
                s.periodo_referencia,
                s.horas_concedidas,
                s.horas_adicionais,
                s.horas_reservadas,
                s.horas_utilizadas,
                s.horas_estornadas,
                s.saldo_disponivel,
                s.validade_ate,
            ]
        )
    return colunas, linhas


async def _porteira_execucao(db: AsyncSession, user: User, periodo: Periodo, **_) -> Resultado:
    condicoes = [
        OrdemServico.organizacao_id == user.organizacao_id,
        OrdemServico.deleted_at.is_(None),
    ]
    if periodo.inicio:
        condicoes.append(OrdemServico.data_prevista >= periodo.inicio)
    if periodo.fim:
        condicoes.append(OrdemServico.data_prevista <= periodo.fim)

    registros = list(
        (await db.execute(select(OrdemServico).where(*condicoes).order_by(OrdemServico.data_prevista)))
        .scalars()
        .all()
    )
    colunas = [
        "Ordem", "Data", "Produtor", "Propriedade", "Serviço", "Situação",
        "Horas autorizadas", "Produtivas", "Paradas", "Deslocamento",
        "Descontadas", "Viagens", "Diesel (L)",
    ]
    linhas = []
    for o in registros:
        solicitacao = await db.get(SolicitacaoServico, o.solicitacao_id)
        beneficiario = (
            await db.get(Beneficiario, solicitacao.beneficiario_id) if solicitacao else None
        )
        pessoa = await db.get(Pessoa, beneficiario.pessoa_id) if beneficiario else None
        imovel = await db.get(Imovel, solicitacao.imovel_id) if solicitacao else None
        tipo = await db.get(TipoServico, solicitacao.tipo_servico_id) if solicitacao else None
        linhas.append(
            [
                o.numero_formatado,
                o.data_prevista,
                pessoa.nome if pessoa else None,
                (imovel.nome or imovel.codigo) if imovel else None,
                tipo.nome if tipo else None,
                com_rotulo(o.situacao),
                o.horas_autorizadas,
                o.horas_produtivas,
                o.horas_paradas,
                o.horas_deslocamento,
                o.horas_descontadas,
                o.viagens_realizadas,
                o.diesel_consumido_litros,
            ]
        )
    return colunas, linhas


async def _porteira_horas_maquina(db: AsyncSession, user: User, periodo: Periodo, **_) -> Resultado:
    condicoes = [OrdemServico.organizacao_id == user.organizacao_id]
    if periodo.inicio:
        condicoes.append(OrdemServico.data_prevista >= periodo.inicio)
    if periodo.fim:
        condicoes.append(OrdemServico.data_prevista <= periodo.fim)

    linhas_dados = (
        await db.execute(
            select(
                Maquina.codigo,
                Maquina.nome,
                func.coalesce(func.sum(OrdemMaquina.horas_produtivas), 0),
                func.coalesce(func.sum(OrdemMaquina.horas_paradas), 0),
                func.coalesce(func.sum(OrdemMaquina.horas_deslocamento), 0),
                func.coalesce(func.sum(OrdemMaquina.consumo_litros), 0),
                func.count(),
            )
            .join(OrdemServico, OrdemServico.id == OrdemMaquina.ordem_id)
            .join(Maquina, Maquina.id == OrdemMaquina.maquina_id)
            .where(*condicoes)
            .group_by(Maquina.codigo, Maquina.nome)
            .order_by(func.sum(OrdemMaquina.horas_produtivas).desc())
        )
    ).all()

    colunas = [
        "Código", "Máquina", "Horas produtivas", "Horas paradas",
        "Deslocamento", "Diesel (L)", "Serviços", "Litros por hora",
    ]
    linhas = []
    for linha in linhas_dados:
        produtivas = float(linha[2] or 0)
        litros = float(linha[5] or 0)
        linhas.append(
            [
                linha[0],
                linha[1],
                produtivas,
                float(linha[3] or 0),
                float(linha[4] or 0),
                litros,
                int(linha[6] or 0),
                round(litros / produtivas, 2) if produtivas else None,
            ]
        )
    return colunas, linhas


async def _porteira_viagens(db: AsyncSession, user: User, periodo: Periodo, **_) -> Resultado:
    condicoes = [OrdemServico.organizacao_id == user.organizacao_id]
    if periodo.inicio:
        condicoes.append(OrdemServico.data_prevista >= periodo.inicio)
    if periodo.fim:
        condicoes.append(OrdemServico.data_prevista <= periodo.fim)

    registros = list(
        (
            await db.execute(
                select(Viagem)
                .join(OrdemServico, OrdemServico.id == Viagem.ordem_id)
                .where(*condicoes)
                .order_by(Viagem.created_at)
            )
        )
        .scalars()
        .all()
    )
    colunas = [
        "Ordem", "Viagem", "Veículo", "Origem", "Destino", "Material",
        "Quantidade (m³)", "Peso (kg)", "Km percorridos",
    ]
    linhas = []
    for v in registros:
        ordem = await db.get(OrdemServico, v.ordem_id)
        veiculo = await db.get(Veiculo, v.veiculo_id)
        linhas.append(
            [
                ordem.numero_formatado if ordem else None,
                v.numero,
                veiculo.placa if veiculo else None,
                v.origem,
                v.destino,
                v.material,
                v.quantidade_estimada_m3,
                v.peso_kg,
                v.km_percorridos,
            ]
        )
    return colunas, linhas


# ─────────────────────────────────────────────────────────────────────────────
# Relatórios de combustível e frota (item 45)
# ─────────────────────────────────────────────────────────────────────────────


async def _combustivel_abastecimentos(db: AsyncSession, user: User, periodo: Periodo, **_) -> Resultado:
    condicoes = [
        Abastecimento.organizacao_id == user.organizacao_id,
        Abastecimento.deleted_at.is_(None),
    ]
    if periodo.inicio:
        condicoes.append(func.date(Abastecimento.abastecido_em) >= periodo.inicio)
    if periodo.fim:
        condicoes.append(func.date(Abastecimento.abastecido_em) <= periodo.fim)

    registros = list(
        (
            await db.execute(
                select(Abastecimento).where(*condicoes).order_by(Abastecimento.abastecido_em)
            )
        )
        .scalars()
        .all()
    )
    colunas = [
        "Data", "Equipamento", "Litros", "Valor unitário", "Valor total",
        "Horímetro", "Km", "Ordem", "Requisição", "Inconsistências",
    ]
    linhas = []
    for a in registros:
        maquina = await db.get(Maquina, a.maquina_id) if a.maquina_id else None
        veiculo = await db.get(Veiculo, a.veiculo_id) if a.veiculo_id else None
        ordem = await db.get(OrdemServico, a.ordem_id) if a.ordem_id else None
        linhas.append(
            [
                a.abastecido_em,
                f"{maquina.codigo} — {maquina.nome}" if maquina else (
                    f"{veiculo.placa} — {veiculo.nome}" if veiculo else None
                ),
                a.quantidade_litros,
                a.valor_unitario,
                a.valor_total,
                a.horimetro,
                a.quilometragem,
                ordem.numero_formatado if ordem else None,
                a.requisicao,
                len(a.alertas or []),
            ]
        )
    return colunas, linhas


async def _combustivel_consumo(db: AsyncSession, user: User, periodo: Periodo, **_) -> Resultado:
    condicoes = [
        Abastecimento.organizacao_id == user.organizacao_id,
        Abastecimento.deleted_at.is_(None),
    ]
    if periodo.inicio:
        condicoes.append(func.date(Abastecimento.abastecido_em) >= periodo.inicio)
    if periodo.fim:
        condicoes.append(func.date(Abastecimento.abastecido_em) <= periodo.fim)

    maquinas = (
        await db.execute(
            select(
                Maquina.codigo,
                Maquina.nome,
                func.coalesce(func.sum(Abastecimento.quantidade_litros), 0),
                func.coalesce(func.sum(Abastecimento.valor_total), 0),
                func.count(),
            )
            .join(Maquina, Maquina.id == Abastecimento.maquina_id)
            .where(*condicoes)
            .group_by(Maquina.codigo, Maquina.nome)
        )
    ).all()
    veiculos = (
        await db.execute(
            select(
                Veiculo.placa,
                Veiculo.nome,
                func.coalesce(func.sum(Abastecimento.quantidade_litros), 0),
                func.coalesce(func.sum(Abastecimento.valor_total), 0),
                func.count(),
            )
            .join(Veiculo, Veiculo.id == Abastecimento.veiculo_id)
            .where(*condicoes)
            .group_by(Veiculo.placa, Veiculo.nome)
        )
    ).all()

    colunas = ["Tipo", "Identificação", "Descrição", "Litros", "Custo", "Abastecimentos"]
    linhas = [
        ["Máquina", linha[0], linha[1], float(linha[2] or 0), float(linha[3] or 0), int(linha[4] or 0)]
        for linha in maquinas
    ] + [
        ["Veículo", linha[0], linha[1], float(linha[2] or 0), float(linha[3] or 0), int(linha[4] or 0)]
        for linha in veiculos
    ]
    linhas.sort(key=lambda linha: -linha[3])
    return colunas, linhas


async def _manutencoes(db: AsyncSession, user: User, periodo: Periodo, **_) -> Resultado:
    condicoes = [
        Manutencao.organizacao_id == user.organizacao_id,
        Manutencao.deleted_at.is_(None),
    ]
    if periodo.inicio:
        condicoes.append(Manutencao.data_abertura >= periodo.inicio)
    if periodo.fim:
        condicoes.append(Manutencao.data_abertura <= periodo.fim)

    registros = list(
        (await db.execute(select(Manutencao).where(*condicoes).order_by(Manutencao.data_abertura)))
        .scalars()
        .all()
    )
    colunas = [
        "Equipamento", "Tipo", "Abertura", "Conclusão", "Situação",
        "Defeito", "Oficina", "Custo peças", "Custo serviços", "Custo total",
        "Horas parado",
    ]
    linhas = []
    for m in registros:
        descricao = None
        if m.maquina_id:
            maquina = await db.get(Maquina, m.maquina_id)
            descricao = f"{maquina.codigo} — {maquina.nome}" if maquina else None
        elif m.veiculo_id:
            veiculo = await db.get(Veiculo, m.veiculo_id)
            descricao = f"{veiculo.placa} — {veiculo.nome}" if veiculo else None
        elif m.cacamba_id:
            cacamba = await db.get(Cacamba, m.cacamba_id)
            descricao = f"Caçamba {cacamba.codigo}" if cacamba else None
        linhas.append(
            [
                descricao,
                m.tipo,
                m.data_abertura,
                m.data_conclusao,
                com_rotulo(m.situacao),
                m.defeito,
                m.oficina,
                m.custo_pecas,
                m.custo_servicos,
                m.custo_total,
                m.horas_parado,
            ]
        )
    return colunas, linhas


# Catálogo: chave → (título, permissão extra, função)
RELATORIOS: dict[str, tuple[str, str, Callable]] = {
    "cacambas-inventario": ("Inventário de caçambas", "cacambas", _cacambas_inventario),
    "cacambas-solicitacoes": ("Solicitações de caçamba", "cacambas", _cacambas_solicitacoes),
    "cacambas-por-bairro": ("Solicitações por bairro", "cacambas", _cacambas_por_bairro),
    "cacambas-ocorrencias": ("Ocorrências e materiais irregulares", "cacambas", _cacambas_ocorrencias),
    "porteira-solicitacoes": ("Solicitações do Porteira Adentro", "porteira", _porteira_solicitacoes),
    "porteira-saldos": ("Banco de horas por produtor", "porteira", _porteira_saldos),
    "porteira-execucao": ("Execução dos serviços rurais", "porteira", _porteira_execucao),
    "porteira-horas-maquina": ("Horas por máquina", "porteira", _porteira_horas_maquina),
    "porteira-viagens": ("Viagens realizadas", "porteira", _porteira_viagens),
    "combustivel-abastecimentos": ("Abastecimentos", "combustivel", _combustivel_abastecimentos),
    "combustivel-consumo": ("Consumo por equipamento", "combustivel", _combustivel_consumo),
    "manutencoes": ("Manutenções e custos", "frota", _manutencoes),
}


@router.get("", summary="Catálogo de relatórios")
async def catalogo(user: User = Depends(exigir(P.RELATORIOS_VISUALIZAR))):
    return [
        {
            "chave": chave,
            "titulo": titulo,
            "area": area,
            "formatos": ["tela", "csv", "xlsx", "pdf"],
        }
        for chave, (titulo, area, _) in RELATORIOS.items()
    ]


@router.get("/{chave}", summary="Executar relatório")
async def executar(
    chave: str,
    request: Request,
    formato: str = Query("tela", description="tela | csv | xlsx | pdf"),
    situacao: str | None = None,
    bairro: str | None = None,
    periodo: Periodo = Depends(),
    db: AsyncSession = Depends(get_db),
    user: User = Depends(exigir(P.RELATORIOS_VISUALIZAR)),
):
    """Executa o relatório e devolve na tela ou como arquivo."""
    if chave not in RELATORIOS:
        raise AppError(
            f"Relatório '{chave}' não existe. Consulte /relatorios para a lista.",
            404,
            "relatorio_inexistente",
        )

    titulo, _, funcao = RELATORIOS[chave]
    colunas, linhas = await funcao(db, user, periodo, situacao=situacao, bairro=bairro)

    if formato == "tela":
        return {
            "chave": chave,
            "titulo": titulo,
            "periodo": periodo.descricao,
            "colunas": colunas,
            "linhas": linhas,
            "total": len(linhas),
        }

    # Exportação exige permissão própria.
    from app.core.auth import usuario_pode

    if not usuario_pode(user, P.RELATORIOS_EXPORTAR):
        raise AppError(
            "Exportar relatórios exige a permissão govinfra.relatorios.exportar.",
            403,
            "permissao_negada",
        )

    conteudo, mime, nome = exportacao.gerar(
        formato,
        colunas,
        linhas,
        titulo=titulo,
        subtitulo=f"Período: {periodo.descricao} — {len(linhas)} registro(s)",
    )

    await auditoria.registrar(
        db,
        acao=AcaoAuditoria.DOWNLOAD_SENSIVEL,
        usuario=user,
        entidade="relatorio",
        entidade_descricao=f"{titulo} ({formato})",
        detalhe=f"{len(linhas)} linha(s) exportada(s)",
        cliente=cliente(request),
    )
    await db.commit()

    return Response(
        content=conteudo,
        media_type=mime,
        headers={"Content-Disposition": f'attachment; filename="{nome}"'},
    )
