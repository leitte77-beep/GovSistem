"""Mapa geral do GovInfra (itens 18 e 39).

A resposta é sempre GeoJSON-like com camadas nomeadas, para que o frontend
possa trocar de biblioteca de mapa sem que a API mude. A configuração da camada
base (URL dos tiles) também vem do backend — nada de provedor fixado no código.
"""

import uuid
from datetime import date, timedelta

from fastapi import APIRouter, Depends, Query
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.v1.deps import com_rotulo
from app.core.auth import exigir
from app.core.database import get_db
from app.core.geo import caixa_ao_redor, configuracao_mapa, distancia_km
from app.core.permissoes import P
from app.models.cacambas import Cacamba, SolicitacaoCacamba
from app.models.enums import (
    SOLICITACAO_ATIVA,
    SituacaoCacamba,
    SituacaoOrdem,
)
from app.models.frota import Maquina, Veiculo
from app.models.governanca import Regiao
from app.models.organizacao import User
from app.models.pessoas import Imovel, Pessoa
from app.models.porteira import Beneficiario, OrdemServico, SolicitacaoServico

router = APIRouter(prefix="/mapa", tags=["Mapa"])

CAMADAS_DISPONIVEIS = [
    {"chave": "cacambas", "rotulo": "Caçambas em campo", "cor": "#1d4ed8"},
    {"chave": "solicitacoes", "rotulo": "Solicitações agendadas", "cor": "#0891b2"},
    {"chave": "atrasadas", "rotulo": "Retiradas atrasadas", "cor": "#b91c1c"},
    {"chave": "propriedades", "rotulo": "Propriedades rurais", "cor": "#15803d"},
    {"chave": "servicos", "rotulo": "Serviços do Porteira Adentro", "cor": "#b45309"},
    {"chave": "maquinas", "rotulo": "Máquinas", "cor": "#7c3aed"},
    {"chave": "veiculos", "rotulo": "Caminhões", "cor": "#0f766e"},
    {"chave": "patios", "rotulo": "Pátios e depósitos", "cor": "#475569"},
    {"chave": "abastecimento", "rotulo": "Pontos de abastecimento", "cor": "#ca8a04"},
]


def _ponto(
    identificador, latitude, longitude, camada: str, titulo: str, **propriedades
) -> dict | None:
    if latitude is None or longitude is None:
        return None
    return {
        "id": str(identificador),
        "camada": camada,
        "titulo": titulo,
        "latitude": latitude,
        "longitude": longitude,
        **propriedades,
    }


@router.get("/configuracao", summary="Configuração do mapa")
async def configuracao(user: User = Depends(exigir(P.MAPA_VISUALIZAR))):
    """Camada base e centro padrão — trocáveis por variável de ambiente."""
    return {**configuracao_mapa(), "camadas": CAMADAS_DISPONIVEIS}


@router.get("", summary="Pontos do mapa")
async def pontos(
    camadas: list[str] | None = Query(None, description="Camadas a exibir"),
    inicio: date | None = None,
    fim: date | None = None,
    situacao: str | None = None,
    bairro: str | None = None,
    regiao_id: uuid.UUID | None = None,
    apenas_atrasadas: bool = False,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(exigir(P.MAPA_VISUALIZAR)),
):
    org = user.organizacao_id
    hoje = date.today()
    ativas = camadas or [c["chave"] for c in CAMADAS_DISPONIVEIS]
    marcadores: list[dict] = []

    # ── Caçambas com posição conhecida ──────────────────────────────────────
    if "cacambas" in ativas:
        registros = list(
            (
                await db.execute(
                    select(Cacamba).where(
                        Cacamba.organizacao_id == org,
                        Cacamba.deleted_at.is_(None),
                        Cacamba.latitude.is_not(None),
                    )
                )
            )
            .scalars()
            .all()
        )
        for cacamba in registros:
            solicitacao = await db.scalar(
                select(SolicitacaoCacamba)
                .where(
                    SolicitacaoCacamba.cacamba_id == cacamba.id,
                    SolicitacaoCacamba.situacao.in_(SOLICITACAO_ATIVA),
                    SolicitacaoCacamba.deleted_at.is_(None),
                )
                .limit(1)
            )
            pessoa = (
                await db.get(Pessoa, solicitacao.pessoa_id) if solicitacao else None
            )
            dias_uso = None
            if solicitacao and solicitacao.data_prevista_entrega:
                dias_uso = max((hoje - solicitacao.data_prevista_entrega).days, 0)
            atrasada = bool(solicitacao and solicitacao.atrasada)
            if apenas_atrasadas and not atrasada:
                continue

            marcador = _ponto(
                cacamba.id,
                cacamba.latitude,
                cacamba.longitude,
                "atrasadas" if atrasada else "cacambas",
                f"Caçamba {cacamba.codigo}",
                situacao=cacamba.situacao,
                situacao_rotulo=com_rotulo(cacamba.situacao),
                solicitante=pessoa.nome if pessoa else None,
                endereco=(
                    f"{solicitacao.logradouro or ''}, {solicitacao.numero or ''}".strip(", ")
                    if solicitacao
                    else cacamba.localizacao_atual
                ),
                protocolo=solicitacao.protocolo_formatado if solicitacao else None,
                data_entrega=solicitacao.data_prevista_entrega if solicitacao else None,
                previsao_retirada=solicitacao.data_prevista_retirada if solicitacao else None,
                dias_em_uso=dias_uso,
                atrasada=atrasada,
                link=f"/solicitacoes/{solicitacao.id}" if solicitacao else f"/cacambas/{cacamba.id}",
            )
            if marcador:
                marcadores.append(marcador)

    # ── Solicitações agendadas ──────────────────────────────────────────────
    if "solicitacoes" in ativas:
        condicoes = [
            SolicitacaoCacamba.organizacao_id == org,
            SolicitacaoCacamba.deleted_at.is_(None),
            SolicitacaoCacamba.latitude.is_not(None),
            SolicitacaoCacamba.situacao.in_(SOLICITACAO_ATIVA),
        ]
        if inicio:
            condicoes.append(SolicitacaoCacamba.data_prevista_entrega >= inicio)
        if fim:
            condicoes.append(SolicitacaoCacamba.data_prevista_entrega <= fim)
        if situacao:
            condicoes.append(SolicitacaoCacamba.situacao == situacao)
        if bairro:
            condicoes.append(SolicitacaoCacamba.bairro.ilike(f"%{bairro}%"))
        if regiao_id:
            condicoes.append(SolicitacaoCacamba.regiao_id == regiao_id)

        for solicitacao in (
            (await db.execute(select(SolicitacaoCacamba).where(*condicoes))).scalars().all()
        ):
            if apenas_atrasadas and not solicitacao.atrasada:
                continue
            marcador = _ponto(
                solicitacao.id,
                solicitacao.latitude,
                solicitacao.longitude,
                "atrasadas" if solicitacao.atrasada else "solicitacoes",
                f"Protocolo {solicitacao.protocolo_formatado}",
                situacao=solicitacao.situacao,
                situacao_rotulo=com_rotulo(solicitacao.situacao),
                endereco=f"{solicitacao.logradouro or ''}, {solicitacao.numero or ''}".strip(", "),
                bairro=solicitacao.bairro,
                data_entrega=solicitacao.data_prevista_entrega,
                previsao_retirada=solicitacao.data_prevista_retirada,
                prioridade=solicitacao.prioridade,
                atrasada=solicitacao.atrasada,
                link=f"/solicitacoes/{solicitacao.id}",
            )
            if marcador:
                marcadores.append(marcador)

    # ── Propriedades rurais ─────────────────────────────────────────────────
    if "propriedades" in ativas:
        condicoes = [
            Imovel.organizacao_id == org,
            Imovel.deleted_at.is_(None),
            Imovel.latitude.is_not(None),
        ]
        if regiao_id:
            condicoes.append(Imovel.regiao_id == regiao_id)
        for imovel in (await db.execute(select(Imovel).where(*condicoes).limit(2000))).scalars().all():
            marcador = _ponto(
                imovel.id,
                imovel.latitude,
                imovel.longitude,
                "propriedades",
                imovel.nome or imovel.codigo,
                tipo=imovel.tipo,
                comunidade=imovel.comunidade,
                bairro=imovel.bairro,
                area_hectares=imovel.area_hectares,
                link=f"/imoveis/{imovel.id}",
            )
            if marcador:
                marcadores.append(marcador)

    # ── Serviços do Porteira Adentro ────────────────────────────────────────
    if "servicos" in ativas:
        condicoes = [
            OrdemServico.organizacao_id == org,
            OrdemServico.deleted_at.is_(None),
            OrdemServico.latitude.is_not(None),
        ]
        if inicio:
            condicoes.append(OrdemServico.data_prevista >= inicio)
        if fim:
            condicoes.append(OrdemServico.data_prevista <= fim)
        for ordem in (await db.execute(select(OrdemServico).where(*condicoes))).scalars().all():
            solicitacao = await db.get(SolicitacaoServico, ordem.solicitacao_id)
            beneficiario = (
                await db.get(Beneficiario, solicitacao.beneficiario_id) if solicitacao else None
            )
            pessoa = await db.get(Pessoa, beneficiario.pessoa_id) if beneficiario else None
            marcador = _ponto(
                ordem.id,
                ordem.latitude,
                ordem.longitude,
                "servicos",
                f"Serviço {ordem.numero_formatado}",
                situacao=ordem.situacao,
                situacao_rotulo=com_rotulo(ordem.situacao),
                produtor=pessoa.nome if pessoa else None,
                data=ordem.data_prevista,
                horas_autorizadas=ordem.horas_autorizadas,
                link=f"/ordens/{ordem.id}",
            )
            if marcador:
                marcadores.append(marcador)

    # ── Máquinas e veículos com posição ─────────────────────────────────────
    if "maquinas" in ativas:
        for maquina in (
            (
                await db.execute(
                    select(Maquina).where(
                        Maquina.organizacao_id == org,
                        Maquina.deleted_at.is_(None),
                        Maquina.latitude.is_not(None),
                    )
                )
            )
            .scalars()
            .all()
        ):
            marcador = _ponto(
                maquina.id,
                maquina.latitude,
                maquina.longitude,
                "maquinas",
                f"{maquina.codigo} — {maquina.nome}",
                situacao=maquina.situacao,
                situacao_rotulo=com_rotulo(maquina.situacao),
                horimetro=maquina.horimetro_atual,
                link=f"/maquinas/{maquina.id}",
            )
            if marcador:
                marcadores.append(marcador)

    if "veiculos" in ativas:
        for veiculo in (
            (
                await db.execute(
                    select(Veiculo).where(
                        Veiculo.organizacao_id == org,
                        Veiculo.deleted_at.is_(None),
                        Veiculo.latitude.is_not(None),
                    )
                )
            )
            .scalars()
            .all()
        ):
            marcador = _ponto(
                veiculo.id,
                veiculo.latitude,
                veiculo.longitude,
                "veiculos",
                f"{veiculo.placa} — {veiculo.nome}",
                situacao=veiculo.situacao,
                situacao_rotulo=com_rotulo(veiculo.situacao),
                link=f"/veiculos/{veiculo.id}",
            )
            if marcador:
                marcadores.append(marcador)

    # ── Pátios (localização padrão das caçambas) e abastecimento ────────────
    if "patios" in ativas:
        vistos = set()
        for cacamba in (
            (
                await db.execute(
                    select(Cacamba).where(
                        Cacamba.organizacao_id == org,
                        Cacamba.deleted_at.is_(None),
                        Cacamba.situacao == SituacaoCacamba.DISPONIVEL.value,
                        Cacamba.latitude.is_not(None),
                    )
                )
            )
            .scalars()
            .all()
        ):
            chave = (round(cacamba.latitude, 4), round(cacamba.longitude, 4))
            if chave in vistos:
                continue
            vistos.add(chave)
            marcador = _ponto(
                f"patio-{chave[0]}-{chave[1]}",
                cacamba.latitude,
                cacamba.longitude,
                "patios",
                cacamba.localizacao_padrao or "Pátio municipal",
                link="/cacambas?disponiveis=true",
            )
            if marcador:
                marcadores.append(marcador)

    regioes = list(
        (
            await db.execute(
                select(Regiao).where(Regiao.organizacao_id == org, Regiao.ativo.is_(True))
            )
        )
        .scalars()
        .all()
    )

    return {
        "configuracao": configuracao_mapa(),
        "camadas": CAMADAS_DISPONIVEIS,
        "total": len(marcadores),
        "marcadores": marcadores,
        "regioes": [
            {
                "id": r.id,
                "nome": r.nome,
                "cor": r.cor,
                "bairros": r.bairros or [],
                "latitude": r.latitude_centro,
                "longitude": r.longitude_centro,
                "atendida": r.atendida,
            }
            for r in regioes
        ],
    }


@router.get("/calor", summary="Mapa de calor da demanda")
async def calor(
    dias: int = Query(180, ge=7, le=1095),
    tipo: str = Query("cacamba", description="cacamba | servico"),
    db: AsyncSession = Depends(get_db),
    user: User = Depends(exigir(P.MAPA_VISUALIZAR)),
):
    """Agrega atendimentos por célula geográfica para identificar as regiões
    de maior demanda (item 18)."""
    inicio = date.today() - timedelta(days=dias)

    if tipo == "servico":
        linhas = (
            await db.execute(
                select(OrdemServico.latitude, OrdemServico.longitude).where(
                    OrdemServico.organizacao_id == user.organizacao_id,
                    OrdemServico.deleted_at.is_(None),
                    OrdemServico.data_prevista >= inicio,
                    OrdemServico.latitude.is_not(None),
                )
            )
        ).all()
    else:
        linhas = (
            await db.execute(
                select(SolicitacaoCacamba.latitude, SolicitacaoCacamba.longitude).where(
                    SolicitacaoCacamba.organizacao_id == user.organizacao_id,
                    SolicitacaoCacamba.deleted_at.is_(None),
                    func.date(SolicitacaoCacamba.created_at) >= inicio,
                    SolicitacaoCacamba.latitude.is_not(None),
                )
            )
        ).all()

    # Célula de ~500 m: arredonda a coordenada na terceira casa decimal.
    celulas: dict = {}
    for latitude, longitude in linhas:
        chave = (round(latitude, 3), round(longitude, 3))
        celulas[chave] = celulas.get(chave, 0) + 1

    if not celulas:
        return {"pontos": [], "intensidade_maxima": 0, "periodo_dias": dias}

    maximo = max(celulas.values())
    return {
        "periodo_dias": dias,
        "intensidade_maxima": maximo,
        "pontos": [
            {
                "latitude": chave[0],
                "longitude": chave[1],
                "quantidade": quantidade,
                "intensidade": round(quantidade / maximo, 3),
            }
            for chave, quantidade in sorted(celulas.items(), key=lambda i: -i[1])
        ],
    }


@router.get("/proximos", summary="Atendimentos próximos de um ponto")
async def proximos(
    latitude: float = Query(..., ge=-90, le=90),
    longitude: float = Query(..., ge=-180, le=180),
    raio_km: float = Query(10, gt=0, le=200),
    dias: int = Query(30, ge=1, le=365),
    db: AsyncSession = Depends(get_db),
    user: User = Depends(exigir(P.MAPA_VISUALIZAR)),
):
    """Busca por proximidade: pré-filtro por caixa e depois Haversine.

    É o que permite ao motor de recomendação agrupar serviços da mesma região
    sem depender de PostGIS.
    """
    lat_min, lat_max, lon_min, lon_max = caixa_ao_redor(latitude, longitude, raio_km)
    limite = date.today() + timedelta(days=dias)

    solicitacoes = list(
        (
            await db.execute(
                select(SolicitacaoCacamba).where(
                    SolicitacaoCacamba.organizacao_id == user.organizacao_id,
                    SolicitacaoCacamba.deleted_at.is_(None),
                    SolicitacaoCacamba.situacao.in_(SOLICITACAO_ATIVA),
                    SolicitacaoCacamba.latitude.between(lat_min, lat_max),
                    SolicitacaoCacamba.longitude.between(lon_min, lon_max),
                    SolicitacaoCacamba.data_prevista_entrega <= limite,
                )
            )
        )
        .scalars()
        .all()
    )
    ordens = list(
        (
            await db.execute(
                select(OrdemServico).where(
                    OrdemServico.organizacao_id == user.organizacao_id,
                    OrdemServico.deleted_at.is_(None),
                    OrdemServico.situacao.in_(
                        [SituacaoOrdem.EMITIDA.value, SituacaoOrdem.EM_EXECUCAO.value]
                    ),
                    OrdemServico.latitude.between(lat_min, lat_max),
                    OrdemServico.longitude.between(lon_min, lon_max),
                    OrdemServico.data_prevista <= limite,
                )
            )
        )
        .scalars()
        .all()
    )

    resultados = []
    for solicitacao in solicitacoes:
        distancia = distancia_km(
            latitude, longitude, solicitacao.latitude, solicitacao.longitude
        )
        if distancia is not None and distancia <= raio_km:
            resultados.append(
                {
                    "tipo": "cacamba",
                    "id": solicitacao.id,
                    "titulo": f"Protocolo {solicitacao.protocolo_formatado}",
                    "data": solicitacao.data_prevista_entrega,
                    "distancia_km": distancia,
                    "link": f"/solicitacoes/{solicitacao.id}",
                }
            )
    for ordem in ordens:
        distancia = distancia_km(latitude, longitude, ordem.latitude, ordem.longitude)
        if distancia is not None and distancia <= raio_km:
            resultados.append(
                {
                    "tipo": "servico",
                    "id": ordem.id,
                    "titulo": f"Ordem {ordem.numero_formatado}",
                    "data": ordem.data_prevista,
                    "distancia_km": distancia,
                    "link": f"/ordens/{ordem.id}",
                }
            )

    resultados.sort(key=lambda r: r["distancia_km"])
    return {"raio_km": raio_km, "total": len(resultados), "resultados": resultados}
