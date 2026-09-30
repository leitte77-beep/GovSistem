"""Serviço de abastecimento — valida e registra o fluxo completo.

Fluxo (§18-§21 do escopo):
1. Valida veículo (ativo, não baixado), combustível compatível e a origem do
   combustível: tanque próprio (estoque) ou posto credenciado (posto externo).
2. Valida a medição: quilometragem ou, em máquinas, horímetro (não pode
   diminuir; tolerância configurável).
3. Valida quantidade (positiva, dentro de limite plausível pela capacidade).
4. Baixa o estoque com controle de concorrência (somente tanque próprio).
5. Atualiza km/horímetro do veículo e calcula consumo (km/L ou L/h).
6. Dispara alertas de conferência — nunca bloqueiam o lançamento.
"""

import json
import logging
import uuid
from datetime import datetime, time, timedelta, timezone
from decimal import Decimal

from fastapi import HTTPException, status
from sqlalchemy import func as sa_func
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.timezone import ensure_aware, to_display
from app.models.abastecimento import Abastecimento
from app.models.auditoria import Notificacao
from app.models.combustivel import Combustivel, Fornecedor
from app.models.configuracoes import ConfiguracaoGovFrota
from app.models.enums import OrigemMovimentacao, TipoMovimentacao
from app.models.motorista import Motorista
from app.models.veiculo import Veiculo, VeiculoTanque
from app.services.auditoria import registrar_auditoria
from app.services.contrato_posto import contrato_vigente, saldo_litros
from app.services.estoque import aplicar_movimentacao, custo_medio_combustivel

logger = logging.getLogger(__name__)

TANQUE_PROPRIO = "TANQUE_PROPRIO"
POSTO_CREDENCIADO = "POSTO_CREDENCIADO"

# Rótulos dos alertas de conferência gravados em `Abastecimento.alertas`.
ALERTAS = {
    "DUPLICIDADE": "Possível lançamento duplicado",
    "CONSUMO_FORA_PADRAO": "Consumo fora do padrão do veículo",
    "FORA_DO_HORARIO": "Abastecimento fora do horário permitido",
    "SEM_DESLOCAMENTO": "Abastecimento sem deslocamento desde o anterior",
    "LITROS_ACIMA_MEDIA": "Litros acima da média do veículo",
    "SALDO_EXCEDIDO": "Litros acima do saldo do contrato com o posto",
    "SEM_CONTRATO": "Posto sem contrato vigente para o combustível",
    "INTERVALO_CURTO": "Abastecimento muito próximo do anterior",
}

# Dois abastecimentos de combustível do mesmo veículo em menos que isso pedem conferência.
INTERVALO_MINIMO = timedelta(hours=3)


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


def _validar_combustivel_compativel(combustivel_id: uuid.UUID, tanques_veiculo: list) -> None:
    """O produto deve ser aceito por algum reservatório ativo do veículo."""
    ativos = [t for t in tanques_veiculo if t.ativo and t.deleted_at is None]
    if ativos and not any(t.aceita(combustivel_id) for t in ativos):
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


def _validar_medicao(
    atual: Decimal, informado: Decimal, tolerancia_percentual: int, unidade: str
) -> None:
    """A medição informada (km ou horas) não pode ser inferior à última registrada.

    Pequenas divergências para baixo são aceitas dentro da tolerância
    percentual configurável (ex.: 20% por padrão) — evita bloquear registros
    legítimos com pequena diferença de digitação. Divergências maiores exigem
    correção administrativa.
    """
    if informado >= atual:
        return
    limite = atual * (Decimal("100") - Decimal(tolerancia_percentual)) / Decimal("100")
    if informado >= limite:
        return
    nome = "Horímetro informado" if unidade == "h" else "Quilometragem informada"
    raise HTTPException(
        status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
        detail=(
            f"{nome} ({informado} {unidade}) é muito inferior à última "
            f"registrada ({atual} {unidade}). "
            "Solicite correção a um usuário administrativo."
        ),
    )


def _validar_quilometragem(veiculo: Veiculo, km_informado: int, tolerancia_percentual: int) -> None:
    _validar_medicao(
        Decimal(veiculo.quilometragem_atual), Decimal(km_informado), tolerancia_percentual, "km"
    )


async def _reservatorio_veiculo(
    db: AsyncSession, veiculo_id: uuid.UUID, combustivel_id: uuid.UUID
) -> tuple[Decimal | None, str, list]:
    """Carrega os reservatórios ativos do veículo e a capacidade do produto.

    Retorna (capacidade, rótulo, tanques_veiculo) — o rótulo descreve o
    reservatório para mensagens de validação (ex.: "tanque auxiliar de ARLA").
    """
    tanques = (
        await db.execute(
            select(VeiculoTanque).where(
                VeiculoTanque.veiculo_id == veiculo_id,
                VeiculoTanque.deleted_at.is_(None),
            )
        )
    ).scalars().all()
    alvo = next((t for t in tanques if t.ativo and t.aceita(combustivel_id)), None)
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


def calcular_consumo_horas(
    horas_anterior: Decimal | None, horas_atual: Decimal, litros: Decimal
) -> Decimal | None:
    """Consumo L/h ESTIMADO de máquinas: litros de agora ÷ horas trabalhadas
    desde o último registro (mesma aproximação do km/L)."""
    if horas_anterior is None or horas_atual <= horas_anterior or litros <= 0:
        return None
    return (litros / (Decimal(horas_atual) - Decimal(horas_anterior))).quantize(Decimal("0.01"))


def _hhmm(valor: str | None) -> time | None:
    if not valor:
        return None
    try:
        h, m = valor.split(":")
        return time(int(h), int(m))
    except (ValueError, TypeError):
        return None


def fora_do_horario(config: ConfiguracaoGovFrota, quando: datetime) -> bool:
    """Janela de horário da organização (fuso local). Aceita janela que cruza a
    meia-noite (ex.: 22:00–06:00). Sem janela configurada → nunca fora."""
    inicio = _hhmm(config.horario_abastecimento_inicio)
    fim = _hhmm(config.horario_abastecimento_fim)
    if inicio is None or fim is None or inicio == fim:
        return False
    hora = to_display(quando).time()
    if inicio < fim:
        return not (inicio <= hora <= fim)
    return fim < hora < inicio


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


async def posto_credenciado_valido(
    db: AsyncSession, organization_id: uuid.UUID, fornecedor_id: uuid.UUID
) -> Fornecedor:
    posto = (
        await db.execute(
            select(Fornecedor).where(
                Fornecedor.id == fornecedor_id,
                Fornecedor.organization_id == organization_id,
                Fornecedor.deleted_at.is_(None),
            )
        )
    ).scalar_one_or_none()
    if posto is None or not posto.ativo or not posto.posto_credenciado:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Posto inválido ou não credenciado para abastecimento.",
        )
    return posto


async def ultimo_preco_posto(
    db: AsyncSession,
    organization_id: uuid.UUID,
    fornecedor_id: uuid.UUID,
    combustivel_id: uuid.UUID,
) -> Decimal | None:
    """Último preço por litro praticado pelo posto para o combustível (90 dias).

    Usado quando o lançamento não traz o preço: o custo fica estimado até a
    correção com a nota fiscal.
    """
    return await db.scalar(
        select(Abastecimento.preco_litro)
        .where(
            Abastecimento.organization_id == organization_id,
            Abastecimento.fornecedor_id == fornecedor_id,
            Abastecimento.combustivel_id == combustivel_id,
            Abastecimento.status == "CONFIRMADO",
            Abastecimento.preco_litro.isnot(None),
            Abastecimento.data_abastecimento >= datetime.now(timezone.utc) - timedelta(days=90),
        )
        .order_by(Abastecimento.data_abastecimento.desc())
        .limit(1)
    )


async def _registro_anterior(
    db: AsyncSession,
    organization_id: uuid.UUID,
    veiculo_id: uuid.UUID,
    categoria: str,
    ate: datetime,
    excluir_id: uuid.UUID | None = None,
) -> Abastecimento | None:
    """Último abastecimento confirmado do veículo ANTES de `ate`, do mesmo tipo de
    produto (combustível × fluido auxiliar). Completar o ARLA no mesmo km do
    diesel é normal e não pode virar base do consumo do diesel."""
    conditions = [
        Abastecimento.organization_id == organization_id,
        Abastecimento.veiculo_id == veiculo_id,
        Abastecimento.status == "CONFIRMADO",
        Abastecimento.data_abastecimento <= ate,
        Combustivel.categoria == categoria,
    ]
    if excluir_id is not None:
        conditions.append(Abastecimento.id != excluir_id)
    return (
        await db.execute(
            select(Abastecimento)
            .join(Combustivel, Combustivel.id == Abastecimento.combustivel_id)
            .where(*conditions)
            .order_by(Abastecimento.data_abastecimento.desc(), Abastecimento.created_at.desc())
            .limit(1)
        )
    ).scalar_one_or_none()


async def registrar_abastecimento(
    db: AsyncSession,
    *,
    organization_id: uuid.UUID,
    veiculo: Veiculo,
    combustivel_id: uuid.UUID,
    quantidade_litros: Decimal,
    quilometragem: int | None,
    modalidade: str = TANQUE_PROPRIO,
    tanque_id: uuid.UUID | None = None,
    fornecedor_id: uuid.UUID | None = None,
    preco_litro: Decimal | None = None,
    numero_nf: str | None = None,
    chave_nfe: str | None = None,
    horimetro: Decimal | None = None,
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
    (duplicidade, consumo fora do padrão, fora do horário, sem deslocamento,
    litros acima da média), que também ficam gravados no registro.
    """
    avisos: dict = {}

    if veiculo.situacao == "BAIXADO":
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Veículo baixado não pode receber abastecimentos.",
        )

    config = await get_configuracoes(db, organization_id)

    if modalidade == TANQUE_PROPRIO:
        if tanque_id is None:
            raise HTTPException(status_code=422, detail="Selecione o tanque de origem do abastecimento.")
        fornecedor_id = None
        preco_litro = None
    elif modalidade == POSTO_CREDENCIADO:
        if fornecedor_id is None:
            raise HTTPException(status_code=422, detail="Selecione o posto onde abasteceu.")
        await posto_credenciado_valido(db, organization_id, fornecedor_id)
        tanque_id = None
        if preco_litro is not None and preco_litro <= 0:
            raise HTTPException(status_code=422, detail="Preço por litro deve ser maior que zero.")
    else:
        raise HTTPException(status_code=422, detail="Modalidade de abastecimento inválida.")

    if config.exigir_tanque_cheio and completou_tanque is None:
        raise HTTPException(status_code=422, detail="Informe se completou o tanque.")

    produto = await db.get(Combustivel, combustivel_id)
    if produto is None or produto.organization_id != organization_id:
        raise HTTPException(status_code=422, detail="Combustível inválido.")
    fluido_auxiliar = produto.categoria == "FLUIDO_AUXILIAR"

    capacidade, rotulo, tanques_veiculo = await _reservatorio_veiculo(
        db, veiculo.id, combustivel_id
    )
    _validar_combustivel_compativel(combustivel_id, tanques_veiculo)
    _validar_quantidade(quantidade_litros, capacidade, rotulo)

    # Medição: máquinas usam horímetro; a km do veículo fica como está.
    if veiculo.usa_horimetro:
        if horimetro is None:
            raise HTTPException(status_code=422, detail="Informe o horímetro do equipamento.")
        horimetro = Decimal(horimetro)
        if horimetro < 0:
            raise HTTPException(status_code=422, detail="Horímetro inválido.")
        _validar_medicao(
            Decimal(veiculo.horimetro_atual or 0), horimetro, config.tolerancia_km_percentual, "h"
        )
        quilometragem = veiculo.quilometragem_atual
    else:
        horimetro = None
        if quilometragem is None:
            raise HTTPException(status_code=422, detail="Informe a quilometragem do veículo.")
        _validar_quilometragem(veiculo, quilometragem, config.tolerancia_km_percentual)

    alertas: list[str] = []
    if await _detectar_duplicidade(
        db,
        organization_id,
        veiculo_id=veiculo.id,
        motorista_id=motorista_id,
        quantidade=quantidade_litros,
        quilometragem=quilometragem,
    ):
        alertas.append("DUPLICIDADE")
        avisos["duplicidade"] = (
            "Abastecimento semelhante registrado há pouco tempo. "
            "Verifique se não é duplicado."
        )

    agora = data_abastecimento or datetime.now(timezone.utc)

    # Posto: o preço é sempre o do contrato vigente. O órgão não paga na bomba
    # — nem o motorista nem o painel informam valor no lançamento.
    contrato = None
    if modalidade == POSTO_CREDENCIADO:
        contrato = await contrato_vigente(
            db, organization_id, fornecedor_id, combustivel_id,
            to_display(ensure_aware(agora)).date(),
        )
        if contrato is not None:
            preco_litro = Decimal(contrato.preco_litro)
            saldo = await saldo_litros(db, contrato)
            if quantidade_litros > saldo:
                alertas.append("SALDO_EXCEDIDO")
                avisos["saldo_excedido"] = (
                    f"{quantidade_litros} L excede o saldo do contrato com o posto "
                    f"({max(saldo, Decimal('0'))} L disponíveis)."
                )
        else:
            preco_litro = None
            alertas.append("SEM_CONTRATO")
            avisos["sem_contrato"] = (
                "Posto sem contrato vigente para este combustível — o valor fica "
                "pendente de conferência pelo setor de frota."
            )

    # Custo por litro: custo médio do estoque (tanque) ou preço do contrato (posto).
    if modalidade == TANQUE_PROPRIO:
        custo_litro = await custo_medio_combustivel(db, organization_id, combustivel_id)
    else:
        custo_litro = preco_litro or await ultimo_preco_posto(
            db, organization_id, fornecedor_id, combustivel_id
        )

    if permitir_estoque_negativo is None:
        permitir_estoque_negativo = config.permitir_estoque_negativo

    anterior = await _registro_anterior(
        db, organization_id, veiculo.id, produto.categoria, agora
    )
    consumo = consumo_h = None
    if not fluido_auxiliar and anterior is not None:
        if veiculo.usa_horimetro:
            consumo_h = calcular_consumo_horas(anterior.horimetro, horimetro, quantidade_litros)
            if anterior.horimetro is not None and horimetro == anterior.horimetro:
                alertas.append("SEM_DESLOCAMENTO")
        else:
            consumo = calcular_consumo(anterior.quilometragem, quilometragem, quantidade_litros)
            if quilometragem == anterior.quilometragem:
                alertas.append("SEM_DESLOCAMENTO")
        if "SEM_DESLOCAMENTO" in alertas:
            avisos["sem_deslocamento"] = (
                "A medição é igual à do abastecimento anterior — o veículo não rodou desde então."
            )
        intervalo = ensure_aware(agora) - ensure_aware(anterior.data_abastecimento)
        if intervalo < INTERVALO_MINIMO and not {"DUPLICIDADE", "SEM_DESLOCAMENTO"} & set(alertas):
            alertas.append("INTERVALO_CURTO")
            minutos = int(intervalo.total_seconds() // 60)
            avisos["intervalo_curto"] = (
                f"Abastecimento {minutos} min depois do anterior deste veículo — confira se não houve erro."
            )

    if fora_do_horario(config, agora):
        alertas.append("FORA_DO_HORARIO")
        avisos["fora_do_horario"] = (
            f"Abastecimento fora do horário permitido "
            f"({config.horario_abastecimento_inicio}–{config.horario_abastecimento_fim})."
        )

    if config.alerta_litros_acima_media_pct > 0:
        media_litros, qtd = (
            await db.execute(
                select(sa_func.avg(Abastecimento.quantidade_litros), sa_func.count(Abastecimento.id)).where(
                    Abastecimento.organization_id == organization_id,
                    Abastecimento.veiculo_id == veiculo.id,
                    Abastecimento.combustivel_id == combustivel_id,
                    Abastecimento.status == "CONFIRMADO",
                )
            )
        ).one()
        # Média só é confiável com histórico mínimo.
        if media_litros and qtd >= 3:
            limite = Decimal(str(media_litros)) * (
                Decimal("1") + Decimal(config.alerta_litros_acima_media_pct) / Decimal("100")
            )
            if quantidade_litros > limite:
                alertas.append("LITROS_ACIMA_MEDIA")
                avisos["litros_acima_media"] = (
                    f"{quantidade_litros} L está acima da média do veículo "
                    f"({Decimal(str(media_litros)).quantize(Decimal('0.1'))} L)."
                )

    abastecimento = Abastecimento(
        organization_id=organization_id,
        veiculo_id=veiculo.id,
        motorista_id=motorista_id,
        modalidade=modalidade,
        tanque_id=tanque_id,
        fornecedor_id=fornecedor_id,
        unidade_id=veiculo.unidade_id,
        combustivel_id=combustivel_id,
        quantidade_litros=quantidade_litros,
        quilometragem=quilometragem,
        horimetro=horimetro,
        completou_tanque=completou_tanque,
        origem=origem,
        lancado_por_usuario_id=responsavel_usuario_id,
        data_abastecimento=agora,
        preco_litro=preco_litro,
        contrato_posto_id=contrato.id if contrato is not None else None,
        numero_nf=numero_nf or None,
        chave_nfe=chave_nfe or None,
        custo_medio_litro=custo_litro,
        custo_total=(custo_litro * quantidade_litros).quantize(Decimal("0.01"))
        if custo_litro
        else None,
        consumo_km_l=consumo,
        consumo_l_h=consumo_h,
        foto_bomba_url=foto_bomba_url,
        foto_painel_url=foto_painel_url,
        observacoes=observacoes,
        ip_origem=ip_origem,
        idempotency_key=idempotency_key,
    )
    db.add(abastecimento)

    # Baixa do estoque — transação com lock na linha do tanque (§56).
    # Posto credenciado não movimenta estoque da organização.
    movimentacao = None
    if modalidade == TANQUE_PROPRIO:
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
            custo_unitario=custo_litro,
            responsavel_usuario_id=responsavel_usuario_id,
            responsavel_motorista_id=motorista_id,
            permitir_negativo=permitir_estoque_negativo,
        )
    await db.flush()
    if movimentacao is not None:
        movimentacao.referencia_id = abastecimento.id

    # Atualiza a medição do veículo somente para frente
    if quilometragem > veiculo.quilometragem_atual:
        veiculo.quilometragem_atual = quilometragem
    if horimetro is not None and horimetro > Decimal(veiculo.horimetro_atual or 0):
        veiculo.horimetro_atual = horimetro

    # Alerta informativo de consumo fora do padrão (§36) — nunca bloqueia
    atual = consumo if consumo is not None else consumo_h
    if atual is not None and config.alerta_consumo_desvio_pct > 0:
        media = await media_consumo_veiculo(
            db, organization_id, veiculo.id, excluir_id=abastecimento.id,
            por_hora=veiculo.usa_horimetro,
        )
        if media:
            desvio = abs(atual - media) / media * Decimal("100")
            if desvio > Decimal(config.alerta_consumo_desvio_pct):
                un = "L/h" if veiculo.usa_horimetro else "km/L"
                alertas.append("CONSUMO_FORA_PADRAO")
                avisos["consumo_fora_padrao"] = (
                    f"Consumo de {atual} {un} fora do padrão do veículo "
                    f"(média {media} {un})."
                )

    abastecimento.alertas = json.dumps(alertas) if alertas else None

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
            "horimetro": str(horimetro) if horimetro is not None else None,
            "modalidade": modalidade,
            "tanque": str(tanque_id) if tanque_id else None,
            "posto": str(fornecedor_id) if fornecedor_id else None,
            "origem": origem,
            "alertas": alertas or None,
        },
        ip_address=ip_origem,
    )

    if alertas:
        db.add(
            Notificacao(
                organization_id=organization_id,
                tipo="ABASTECIMENTO_ALERTA",
                titulo=f"Conferir abastecimento — {veiculo.placa}",
                descricao="; ".join(ALERTAS[a] for a in alertas),
                severidade="ALERTA",
                link=f"/abastecimentos/{abastecimento.id}",
            )
        )

    return abastecimento, avisos


async def media_consumo_veiculo(
    db: AsyncSession,
    organization_id: uuid.UUID,
    veiculo_id: uuid.UUID,
    excluir_id: uuid.UUID | None = None,
    por_hora: bool = False,
) -> Decimal | None:
    """Média histórica de consumo estimado do veículo (km/L, ou L/h em máquinas)."""
    coluna = Abastecimento.consumo_l_h if por_hora else Abastecimento.consumo_km_l
    conditions = [
        Abastecimento.organization_id == organization_id,
        Abastecimento.veiculo_id == veiculo_id,
        Abastecimento.status == "CONFIRMADO",
        coluna.isnot(None),
    ]
    if excluir_id:
        conditions.append(Abastecimento.id != excluir_id)
    avg = await db.scalar(select(sa_func.avg(coluna)).where(*conditions))
    return Decimal(str(avg)).quantize(Decimal("0.01")) if avg else None


def alertas_do_registro(abast: Abastecimento) -> list[str]:
    if not abast.alertas:
        return []
    try:
        return list(json.loads(abast.alertas))
    except (ValueError, TypeError):
        return []


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
