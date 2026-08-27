"""Serviço de abastecimento — valida e registra o fluxo completo.

Fluxo (§18-§21 do escopo):
1. Valida veículo (ativo, não baixado), combustível compatível, tanque compatível.
2. Valida quilometragem (não pode diminuir; tolerância configurável).
3. Valida quantidade (positiva, dentro de limite plausível pela capacidade).
4. Detecta duplicidade potencial.
5. Baixa o estoque com controle de concorrência.
6. Atualiza km do veículo e calcula consumo quando possível.
"""

import logging
import uuid
from datetime import datetime, timedelta, timezone
from decimal import Decimal

from fastapi import HTTPException, status
from sqlalchemy import func as sa_func
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.abastecimento import Abastecimento
from app.models.configuracoes import ConfiguracaoGovFrota
from app.models.enums import OrigemMovimentacao, TipoMovimentacao
from app.models.motorista import Motorista
from app.models.veiculo import Veiculo
from app.services.auditoria import registrar_auditoria
from app.services.estoque import aplicar_movimentacao, custo_medio_combustivel

logger = logging.getLogger(__name__)


async def get_configuracoes(db: AsyncSession, organization_id: uuid.UUID) -> ConfiguracaoGovFrota:
    result = await db.execute(
        select(ConfiguracaoGovFrota).where(ConfiguracaoGovFrota.organization_id == organization_id)
    )
    config = result.scalar_one_or_none()
    if config is None:
        config = ConfiguracaoGovFrota(organization_id=organization_id)
        db.add(config)
        await db.flush()
    return config


def _validar_combustivel_compativel(
    veiculo: Veiculo, combustivel_id: uuid.UUID, tanques_veiculo: list
) -> None:
    """O produto deve ser aceito pelo veículo (principal ou reservatório auxiliar)."""
    compativeis = {
        t.combustivel_id
        for t in tanques_veiculo
        if t.ativo and t.deleted_at is None
    }
    compativeis |= {veiculo.combustivel_principal_id, veiculo.combustivel_secundario_id}
    compativeis = {c for c in compativeis if c is not None}
    if compativeis and combustivel_id not in compativeis:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Produto/combustível incompatível com o veículo.",
        )


def _validar_quantidade(quantidade: Decimal, capacidade: Decimal | None, rotulo: str) -> None:
    if quantidade <= 0:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Quantidade deve ser maior que zero.",
        )
    if capacidade is not None and quantidade > Decimal(capacidade) * Decimal("1.2"):
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=(
                f"A quantidade informada ({quantidade} L) é superior à capacidade "
                f"cadastrada do {rotulo} deste veículo ({capacidade} L)."
            ),
        )
    if quantidade > Decimal("5000"):
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Quantidade absurda informada.",
        )


def _validar_quilometragem(veiculo: Veiculo, km_informado: int, tolerancia_percentual: int) -> None:
    """A km informada não pode ser inferior à última registrada.

    Pequenas divergências para baixo são aceitas dentro da tolerância
    percentual configurável (ex.: 20% por padrão) — evita bloquear registros
    legítimos com pequena diferença de digitação. Divergências maiores exigem
    correção administrativa.
    """
    if km_informado >= veiculo.quilometragem_atual:
        return
    limite = (
        Decimal(veiculo.quilometragem_atual)
        * (Decimal("100") - Decimal(tolerancia_percentual))
        / Decimal("100")
    )
    if Decimal(km_informado) >= limite:
        return
    raise HTTPException(
        status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
        detail=(
            f"Quilometragem informada ({km_informado} km) é muito inferior à última "
            f"registrada ({veiculo.quilometragem_atual} km). "
            "Solicite correção a um usuário administrativo."
        ),
    )


async def _reservatorio_veiculo(
    db: AsyncSession, veiculo_id: uuid.UUID, combustivel_id: uuid.UUID
) -> tuple[Decimal | None, str, list]:
    """Carrega os reservatórios ativos do veículo e a capacidade do produto.

    Retorna (capacidade, rótulo, tanques_veiculo) — o rótulo descreve o
    reservatório para mensagens de validação (ex.: "tanque auxiliar de ARLA").
    """
    from app.models.veiculo import VeiculoTanque

    tanques = (
        await db.execute(
            select(VeiculoTanque).where(
                VeiculoTanque.veiculo_id == veiculo_id,
                VeiculoTanque.deleted_at.is_(None),
            )
        )
    ).scalars().all()
    alvo = next(
        (t for t in tanques if t.ativo and t.combustivel_id == combustivel_id), None
    )
    if alvo is not None:
        rotulo = alvo.identificacao or (
            "tanque principal" if alvo.tank_type == "PRIMARY" else "tanque auxiliar"
        )
        # capacidade 0 = não informada (legado) → sem limite de validação.
        capacidade = alvo.capacidade if alvo.capacidade and alvo.capacidade > 0 else None
        return capacidade, rotulo, list(tanques)
    return None, "tanque do veículo", list(tanques)


async def _detectar_duplicidade(
    db: AsyncSession,
    organization_id: uuid.UUID,
    *,
    veiculo_id: uuid.UUID,
    motorista_id: uuid.UUID | None,
    quantidade: Decimal,
    quilometragem: int,
) -> bool:
    trinta_min_atras = datetime.now(timezone.utc) - timedelta(minutes=30)
    conditions = [
        Abastecimento.organization_id == organization_id,
        Abastecimento.veiculo_id == veiculo_id,
        Abastecimento.quantidade_litros == quantidade,
        Abastecimento.status == "CONFIRMADO",
        Abastecimento.created_at >= trinta_min_atras,
    ]
    if motorista_id is not None:
        conditions.append(Abastecimento.motorista_id == motorista_id)
    if quilometragem:
        conditions.append(Abastecimento.quilometragem == quilometragem)
    return await db.scalar(select(Abastecimento.id).where(*conditions).limit(1)) is not None


def calcular_consumo(
    km_anterior: int | None, km_atual: int, litros: Decimal
) -> Decimal | None:
    """Consumo km/L ESTIMADO entre registros consecutivos do mesmo veículo.

    Metodologia (§35): distância percorrida desde o último registro dividida
    pelos litros abastecidos agora. É uma aproximação — não presume tanque
    completo. O campo `completou_tanque` fica armazenado para que relatórios
    possam refinar o cálculo entre abastecimentos completos quando disponível.
    """
    if km_anterior is None or km_atual <= km_anterior or litros <= 0:
        return None
    distancia = Decimal(km_atual - km_anterior)
    return (distancia / litros).quantize(Decimal("0.01"))


async def validar_motorista_habilitado(motorista: Motorista, config: ConfiguracaoGovFrota) -> None:
    if not motorista.ativo:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Motorista inativo.")
    acesso = motorista.acesso
    if acesso is not None and acesso.bloqueado:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Acesso bloqueado.")
    if config.bloquear_cnh_vencida and motorista.cnh_validade is not None:
        hoje = datetime.now(timezone.utc).date()
        if motorista.cnh_validade < hoje:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="CNH vencida. Regularize sua habilitação ou contate o administrador.",
            )


async def registrar_abastecimento(
    db: AsyncSession,
    *,
    organization_id: uuid.UUID,
    veiculo: Veiculo,
    tanque_id: uuid.UUID,
    combustivel_id: uuid.UUID,
    quantidade_litros: Decimal,
    quilometragem: int,
    data_abastecimento: datetime | None = None,
    motorista_id: uuid.UUID | None = None,
    responsavel_usuario_id: uuid.UUID | None = None,
    origem: str = "APP_MOTORISTA",
    completou_tanque: bool | None = None,
    foto_bomba_url: str | None = None,
    foto_painel_url: str | None = None,
    observacoes: str | None = None,
    ip_origem: str | None = None,
    permitir_estoque_negativo: bool | None = None,
    idempotency_key: str | None = None,
) -> tuple[Abastecimento, dict]:
    """Registra um abastecimento aplicando todas as validações de negócio.

    Retorna (abastecimento, avisos) — `avisos` traz alertas NÃO-bloqueantes
    (duplicidade potencial, consumo fora do padrão) conforme §20 e §36.
    """
    avisos: dict = {}

    if veiculo.situacao == "BAIXADO":
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Veículo baixado não pode receber abastecimentos.",
        )

    config = await get_configuracoes(db, organization_id)

    capacidade, rotulo, tanques_veiculo = await _reservatorio_veiculo(
        db, veiculo.id, combustivel_id
    )
    _validar_combustivel_compativel(veiculo, combustivel_id, tanques_veiculo)
    _validar_quantidade(quantidade_litros, capacidade, rotulo)
    _validar_quilometragem(veiculo, quilometragem, config.tolerancia_km_percentual)

    if await _detectar_duplicidade(
        db,
        organization_id,
        veiculo_id=veiculo.id,
        motorista_id=motorista_id,
        quantidade=quantidade_litros,
        quilometragem=quilometragem,
    ):
        avisos["duplicidade"] = (
            "Abastecimento semelhante registrado há pouco tempo. "
            "Verifique se não é duplicado."
        )

    custo_medio = await custo_medio_combustivel(db, organization_id, combustivel_id)

    if permitir_estoque_negativo is None:
        permitir_estoque_negativo = config.permitir_estoque_negativo

    agora = data_abastecimento or datetime.now(timezone.utc)

    # Último registro confirmado do veículo — base do cálculo de consumo
    ultimo_result = await db.execute(
        select(Abastecimento.quilometragem)
        .where(
            Abastecimento.organization_id == organization_id,
            Abastecimento.veiculo_id == veiculo.id,
            Abastecimento.status == "CONFIRMADO",
        )
        .order_by(Abastecimento.data_abastecimento.desc())
        .limit(1)
    )
    km_ultimo = ultimo_result.scalar_one_or_none()

    consumo = calcular_consumo(km_ultimo, quilometragem, quantidade_litros)

    abastecimento = Abastecimento(
        organization_id=organization_id,
        veiculo_id=veiculo.id,
        motorista_id=motorista_id,
        tanque_id=tanque_id,
        combustivel_id=combustivel_id,
        quantidade_litros=quantidade_litros,
        quilometragem=quilometragem,
        completou_tanque=completou_tanque,
        origem=origem,
        lancado_por_usuario_id=responsavel_usuario_id,
        data_abastecimento=agora,
        custo_medio_litro=custo_medio,
        custo_total=(custo_medio * quantidade_litros).quantize(Decimal("0.01"))
        if custo_medio
        else None,
        consumo_km_l=consumo,
        foto_bomba_url=foto_bomba_url,
        foto_painel_url=foto_painel_url,
        observacoes=observacoes,
        ip_origem=ip_origem,
        idempotency_key=idempotency_key,
    )
    db.add(abastecimento)

    # Baixa do estoque — transação com lock na linha do tanque (§56)
    movimentacao = await aplicar_movimentacao(
        db,
        organization_id=organization_id,
        tipo=TipoMovimentacao.SAIDA.value,
        origem=OrigemMovimentacao.ABASTECIMENTO.value,
        sinal=-1,
        quantidade=quantidade_litros,
        combustivel_id=combustivel_id,
        tanque_id=tanque_id,
        referencia_tipo="ABASTECIMENTO",
        custo_unitario=custo_medio,
        responsavel_usuario_id=responsavel_usuario_id,
        responsavel_motorista_id=motorista_id,
        permitir_negativo=permitir_estoque_negativo,
    )
    await db.flush()
    movimentacao.referencia_id = abastecimento.id

    # Atualiza a quilometragem do veículo somente para frente
    if quilometragem > veiculo.quilometragem_atual:
        veiculo.quilometragem_atual = quilometragem

    await registrar_auditoria(
        db,
        organization_id=organization_id,
        acao="abastecimento.registrar",
        entidade="abastecimento",
        entidade_id=abastecimento.id,
        usuario_id=responsavel_usuario_id,
        motorista_id=motorista_id,
        dados_novos={
            "veiculo": str(veiculo.id),
            "litros": str(quantidade_litros),
            "km": quilometragem,
            "tanque": str(tanque_id),
            "origem": origem,
        },
        ip_address=ip_origem,
    )

    # Alerta informativo de consumo fora do padrão (§36) — nunca bloqueia
    if consumo is not None:
        media = await media_consumo_veiculo(db, organization_id, veiculo.id)
        if media and config.alerta_consumo_desvio_pct > 0:
            desvio = abs(consumo - media) / media * Decimal("100")
            if desvio > Decimal(config.alerta_consumo_desvio_pct):
                avisos["consumo_fora_padrao"] = (
                    f"Consumo de {consumo} km/L fora do padrão do veículo "
                    f"(média {media} km/L)."
                )

    return abastecimento, avisos


async def media_consumo_veiculo(
    db: AsyncSession,
    organization_id: uuid.UUID,
    veiculo_id: uuid.UUID,
    excluir_id: uuid.UUID | None = None,
) -> Decimal | None:
    """Média histórica de consumo estimado (km/L) do veículo."""
    conditions = [
        Abastecimento.organization_id == organization_id,
        Abastecimento.veiculo_id == veiculo_id,
        Abastecimento.status == "CONFIRMADO",
        Abastecimento.consumo_km_l.isnot(None),
    ]
    if excluir_id:
        conditions.append(Abastecimento.id != excluir_id)
    avg = await db.scalar(select(sa_func.avg(Abastecimento.consumo_km_l)).where(*conditions))
    return Decimal(str(avg)).quantize(Decimal("0.01")) if avg else None


async def find_abastecimento_by_idempotency(
    db: AsyncSession,
    organization_id: uuid.UUID,
    idempotency_key: str,
    *,
    max_age_hours: int | None = None,
) -> Abastecimento | None:
    """Retorna o abastecimento já confirmado para a mesma chave de idempotência.

    Reenvio seguro: se o servidor já processou a operação, o mesmo registro é
    devolvido sem baixar estoque/quilometragem novamente.
    """
    from app.core.config import settings
    from app.core.timezone import utcnow

    if max_age_hours is None:
        max_age_hours = settings.IDEMPOTENCY_MAX_LIFETIME_HOURS
    limite = utcnow() - timedelta(hours=max_age_hours)
    result = await db.execute(
        select(Abastecimento)
        .where(
            Abastecimento.organization_id == organization_id,
            Abastecimento.idempotency_key == idempotency_key,
            Abastecimento.status == "CONFIRMADO",
            Abastecimento.created_at >= limite,
        )
        .order_by(Abastecimento.created_at.desc())
        .limit(1)
    )
    return result.scalar_one_or_none()
