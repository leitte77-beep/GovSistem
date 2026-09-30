"""Competência SIM-AM: cálculo dos arquivos mensais, validação, fechamento e estorno.

Tudo é DERIVADO do que já existe no GovFrota:
- VeiculoEquipamento   ← veículos (+ código do combustível principal)
- HodometroHorimetro   ← leituras dos abastecimentos, por medidor físico
- ConsumoCombustivel   ← Σ litros dos abastecimentos confirmados (veículo × combustível × mês)
- Estorno              ← cancelamento/redução de abastecimento de mês já exportado
- Entrada/SaidaExtra   ← entradas não orçamentárias e saídas extraordinárias
- EstoqueCombustivel   ← saldo do livro de movimentações nas viradas do mês

Linhas carregam, além dos campos do layout, chaves "_..." (ids, placa, nomes)
usadas pela tela; o gerador ignora o que não está no layout.
"""

import hashlib
import io
import json
import uuid
import zipfile
from collections import defaultdict
from dataclasses import dataclass, field
from datetime import date, datetime, time, timedelta, timezone
from decimal import Decimal

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.timezone import get_tz
from app.models.abastecimento import Abastecimento
from app.models.combustivel import Combustivel, Tanque
from app.models.configuracoes import ConfiguracaoGovFrota
from app.models.estoque import EntradaCombustivel, MovimentacaoEstoque
from app.models.simam import (
    MedicaoDeclarada,
    SaidaExtraCombustivel,
    SimamCompetencia,
    SimamConsumo,
    SimamEstorno,
    SimamReferencia,
    VeiculoMedidor,
)
from app.models.veiculo import Veiculo, VeiculoTanque
from app.services.simam.layout import (
    ARQUIVOS,
    CATEGORIAS_DO_ARQUIVO,
    OBJETO_FLEX,
    TIPOS_ENTRADA,
    TIPOS_SAIDA,
    TP_DOC_CNPJ,
    TP_DOC_CPF,
    ErroLayout,
    formatar_linha,
    gerar_txt,
)

ZERO = Decimal("0")
MIL = Decimal("0.001")


class SimamError(Exception):
    def __init__(self, mensagem: str, status: int = 422):
        self.mensagem = mensagem
        self.status = status
        super().__init__(mensagem)


# ── Datas ────────────────────────────────────────────────────────────────────


def proximo_mes(ano: int, mes: int) -> tuple[int, int]:
    return (ano + 1, 1) if mes == 12 else (ano, mes + 1)


def mes_anterior(ano: int, mes: int) -> tuple[int, int]:
    return (ano - 1, 12) if mes == 1 else (ano, mes - 1)


def limites(ano: int, mes: int) -> tuple[date, date, datetime, datetime]:
    """(primeiro dia, primeiro dia do mês seguinte, e os mesmos instantes em UTC no fuso da org)."""
    tz = get_tz()
    inicio = date(ano, mes, 1)
    fim = date(*proximo_mes(ano, mes), 1)
    return (
        inicio,
        fim,
        datetime.combine(inicio, time(), tz).astimezone(timezone.utc),
        datetime.combine(fim, time(), tz).astimezone(timezone.utc),
    )


def data_local(dt: datetime) -> date:
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=timezone.utc)
    return dt.astimezone(get_tz()).date()


def _instante(db: AsyncSession, dt: datetime) -> datetime:
    # SQLite (testes) grava sem fuso: compara em UTC ingênuo.
    if db.bind is not None and db.bind.dialect.name == "sqlite":
        return dt.astimezone(timezone.utc).replace(tzinfo=None)
    return dt


def _q(v) -> Decimal:
    return Decimal(v or 0).quantize(MIL)


# ── Competência e travas ─────────────────────────────────────────────────────


async def obter(db: AsyncSession, org_id: uuid.UUID, ano: int, mes: int) -> SimamCompetencia | None:
    return (
        await db.execute(
            select(SimamCompetencia).where(
                SimamCompetencia.organization_id == org_id,
                SimamCompetencia.ano == ano,
                SimamCompetencia.mes == mes,
            )
        )
    ).scalar_one_or_none()


async def status_do_mes(db: AsyncSession, org_id: uuid.UUID, ano: int, mes: int) -> str:
    comp = await obter(db, org_id, ano, mes)
    return comp.status if comp else "ABERTA"


async def exigir_aberta(db: AsyncSession, org_id: uuid.UUID, dia: date | datetime, oque: str) -> None:
    """Bloqueia lançamento/alteração com data em competência fechada ou exportada."""
    if isinstance(dia, datetime):
        dia = data_local(dia)
    status = await status_do_mes(db, org_id, dia.year, dia.month)
    if status == "FECHADA":
        raise SimamError(
            f"A competência SIM-AM {dia.month:02d}/{dia.year} está fechada. "
            f"Reabra a competência para {oque}.",
            409,
        )
    if status == "EXPORTADA":
        raise SimamError(
            f"A competência SIM-AM {dia.month:02d}/{dia.year} já foi enviada ao TCE e não aceita {oque}.",
            409,
        )


async def competencia_de_lancamento(db: AsyncSession, org_id: uuid.UUID) -> tuple[int, int]:
    """Primeiro mês não fechado a partir de hoje — onde um estorno é informado."""
    hoje = datetime.now(get_tz()).date()
    ano, mes = hoje.year, hoje.month
    for _ in range(24):
        if await status_do_mes(db, org_id, ano, mes) == "ABERTA":
            return ano, mes
        ano, mes = proximo_mes(ano, mes)
    return ano, mes


def _historico(comp: SimamCompetencia, evento: str, usuario_id, detalhe: str | None = None) -> None:
    hist = json.loads(comp.historico_json or "[]")
    hist.append({
        "evento": evento,
        "em": datetime.now(timezone.utc).isoformat(),
        "usuario_id": str(usuario_id) if usuario_id else None,
        "detalhe": detalhe,
    })
    comp.historico_json = json.dumps(hist, ensure_ascii=False)


# ── Medidores ────────────────────────────────────────────────────────────────


def tipo_medidor(veiculo: Veiculo) -> int:
    if veiculo.simam_tipo_medidor in (1, 2, 3):
        return veiculo.simam_tipo_medidor
    return 2 if veiculo.usa_horimetro else 1


async def medidores(db: AsyncSession, veiculo: Veiculo) -> list[VeiculoMedidor]:
    """Medidores do veículo; cria o nº 1 na primeira consulta."""
    lista = list(
        (
            await db.execute(
                select(VeiculoMedidor)
                .where(VeiculoMedidor.veiculo_id == veiculo.id)
                .order_by(VeiculoMedidor.sequencial)
            )
        ).scalars()
    )
    if not lista and tipo_medidor(veiculo) in (1, 2):
        m = VeiculoMedidor(
            organization_id=veiculo.organization_id,
            veiculo_id=veiculo.id,
            sequencial=1,
            tipo=tipo_medidor(veiculo),
            # O aparelho original vale desde sempre; a leitura inicial é
            # usada só quando não há leitura anterior (ver `calcular`).
            data_inicio=date(2000, 1, 1),
            leitura_inicial=ZERO,
        )
        db.add(m)
        await db.flush()
        lista = [m]
    return lista


def _leitura(abast: Abastecimento, tipo: int) -> Decimal | None:
    valor = abast.horimetro if tipo == 2 else abast.quilometragem
    return Decimal(valor) if valor is not None else None


def _medidor_da_data(lista: list[VeiculoMedidor], dia: date) -> VeiculoMedidor | None:
    candidato = None
    for m in lista:
        if m.data_inicio <= dia:
            candidato = m
    return candidato


# ── Cálculo ──────────────────────────────────────────────────────────────────


@dataclass
class Resultado:
    ano: int
    mes: int
    arquivos: dict[str, list[dict]] = field(default_factory=lambda: {n: [] for n in ARQUIVOS})
    erros: list[dict] = field(default_factory=list)
    avisos: list[dict] = field(default_factory=list)

    def erro(self, arquivo: str, mensagem: str, link: str | None = None):
        self.erros.append({"arquivo": arquivo, "mensagem": mensagem, "link": link})

    def aviso(self, arquivo: str, mensagem: str, link: str | None = None):
        self.avisos.append({"arquivo": arquivo, "mensagem": mensagem, "link": link})

    def como_dict(self) -> dict:
        return {
            "ano": self.ano,
            "mes": self.mes,
            # Mesmo formato do retrato gravado (decimais como texto "123.450").
            "arquivos": json.loads(json.dumps(self.arquivos, default=str)),
            "erros": self.erros,
            "avisos": self.avisos,
        }


async def _retrato_anterior(db, org_id, ano, mes) -> dict | None:
    comp = await obter(db, org_id, *mes_anterior(ano, mes))
    if comp and comp.status in ("FECHADA", "EXPORTADA") and comp.retrato_json:
        return json.loads(comp.retrato_json)
    return None


async def _referencias(db, tabela: str) -> set[str] | None:
    codigos = set(
        (await db.execute(select(SimamReferencia.codigo).where(SimamReferencia.tabela == tabela))).scalars()
    )
    return codigos or None


async def calcular(db: AsyncSession, org_id: uuid.UUID, ano: int, mes: int) -> Resultado:
    r = Resultado(ano, mes)
    d_ini, d_fim, t_ini, t_fim = limites(ano, mes)
    config = (
        await db.execute(select(ConfiguracaoGovFrota).where(ConfiguracaoGovFrota.organization_id == org_id))
    ).scalar_one_or_none()
    id_pessoa = config.simam_id_pessoa if config else None
    cpf_padrao = config.simam_cpf_responsavel if config else None
    if not id_pessoa:
        r.erro("Geral", "Informe o código da entidade no TCE (idPessoa) em Configurações → SIM-AM.", "/configuracoes")
    anterior = await _retrato_anterior(db, org_id, ano, mes)
    fipe_validos = await _referencias(db, "ModeloVeiculoFIPE")
    if fipe_validos is None:
        r.aviso("VeiculoEquipamento", "Tabela FIPE do TCE não importada: os códigos FIPE não foram conferidos.")

    combustiveis = {
        c.id: c
        for c in (await db.execute(select(Combustivel).where(Combustivel.organization_id == org_id))).scalars()
    }
    combustiveis_sem_codigo: set[uuid.UUID] = set()

    def codigos(comb_id, arquivo) -> tuple[int | None, int | None]:
        c = combustiveis.get(comb_id)
        if c is None:
            return None, None
        if not (c.simam_categoria and c.simam_objeto) and comb_id not in combustiveis_sem_codigo:
            combustiveis_sem_codigo.add(comb_id)
            r.erro(arquivo, f"Combustível {c.nome} sem código SIM-AM (categoria/objeto da despesa).", "/tanques")
        if c.simam_categoria and c.simam_categoria not in CATEGORIAS_DO_ARQUIVO.get(arquivo, {c.simam_categoria}):
            chave = (comb_id, arquivo)
            if chave not in combustiveis_sem_codigo:
                combustiveis_sem_codigo.add(chave)
                r.erro(arquivo, f"{c.nome}: a categoria {c.simam_categoria} não é aceita pelo TCE neste arquivo.", "/tanques")
        return c.simam_categoria, c.simam_objeto

    # ── Veículos ──
    veiculos = list(
        (
            await db.execute(
                select(Veiculo).where(Veiculo.organization_id == org_id).order_by(Veiculo.placa)
            )
        ).scalars()
    )
    abast_mes = list(
        (
            await db.execute(
                select(Abastecimento).where(
                    Abastecimento.organization_id == org_id,
                    Abastecimento.status == "CONFIRMADO",
                    Abastecimento.data_abastecimento >= _instante(db, t_ini),
                    Abastecimento.data_abastecimento < _instante(db, t_fim),
                )
            )
        ).scalars()
    )
    abast_por_veiculo: dict[uuid.UUID, list[Abastecimento]] = defaultdict(list)
    for a in abast_mes:
        abast_por_veiculo[a.veiculo_id].append(a)

    principal = {
        vt.veiculo_id: vt.combustivel_id
        for vt in (
            await db.execute(
                select(VeiculoTanque).where(
                    VeiculoTanque.organization_id == org_id,
                    VeiculoTanque.tank_type == "PRIMARY",
                    VeiculoTanque.deleted_at.is_(None),
                )
            )
        ).scalars()
    }
    flex = {
        vt.veiculo_id
        for vt in (
            await db.execute(
                select(VeiculoTanque).where(
                    VeiculoTanque.organization_id == org_id,
                    VeiculoTanque.tank_type == "PRIMARY",
                    VeiculoTanque.deleted_at.is_(None),
                    VeiculoTanque.combustivel_alternativo_id.isnot(None),
                )
            )
        ).scalars()
    }
    bens: dict[str, Veiculo] = {}
    informados: dict[uuid.UUID, Veiculo] = {}
    for v in veiculos:
        ativo = v.deleted_at is None and v.situacao != "BAIXADO"
        if not v.simam_informar:
            if abast_por_veiculo.get(v.id):
                r.aviso("ConsumoCombustivel", f"{v.placa} abasteceu no mês mas está marcado para não ir ao SIM-AM.", f"/veiculos/{v.id}")
            continue
        if not ativo and not abast_por_veiculo.get(v.id):
            continue
        informados[v.id] = v
        link = f"/veiculos/{v.id}"
        faltas = []
        cd_bem = (v.patrimonio or "").strip()
        if not cd_bem:
            faltas.append("código patrimonial (cdBem)")
        elif len(cd_bem) > 10:
            r.erro("VeiculoEquipamento", f"{v.placa}: código patrimonial com mais de 10 caracteres.", link)
        elif cd_bem in bens:
            r.erro("VeiculoEquipamento", f"{v.placa}: código patrimonial {cd_bem} repetido em {bens[cd_bem].placa}.", link)
        else:
            bens[cd_bem] = v
        if not v.ano_fabricacao:
            faltas.append("ano de fabricação")
        elif v.ano_fabricacao > ano:
            r.erro("VeiculoEquipamento", f"{v.placa}: ano de fabricação {v.ano_fabricacao} maior que o exercício.", link)
        if not v.simam_cd_modelo_fipe:
            faltas.append("código FIPE")
        elif fipe_validos is not None and v.simam_cd_modelo_fipe not in fipe_validos:
            r.erro("VeiculoEquipamento", f"{v.placa}: código FIPE {v.simam_cd_modelo_fipe} não existe na tabela do TCE.", link)
        comb_id = principal.get(v.id)
        cat = obj = None
        if comb_id is None:
            faltas.append("combustível principal")
        else:
            cat, obj = codigos(comb_id, "VeiculoEquipamento")
            # Aceita dois combustíveis (ex.: gasolina/etanol): "Veículos FLEX" (1/26).
            if v.id in flex and cat == 1:
                obj = OBJETO_FLEX
        if faltas:
            r.erro("VeiculoEquipamento", f"{v.placa}: falta {', '.join(faltas)}.", link)
        r.arquivos["VeiculoEquipamento"].append({
            "idPessoa": id_pessoa,
            "cdBem": cd_bem[:10] or None,
            "nrAnoFabricacao": v.ano_fabricacao,
            "idTipoCategoriaObjetoDespesa": cat,
            "idTipoObjetoDespesa": obj,
            "cdModeloFIPE": v.simam_cd_modelo_fipe,
            "nrPlaca": (v.placa or "").replace("-", "") or None,
            "nrRenavam": v.renavam,
            "_veiculo_id": str(v.id),
            "_placa": v.placa,
            "_propriedade": v.simam_propriedade,
        })

    # ── Hodômetro / horímetro ──
    anteriores_medicao = {}
    if anterior:
        for linha in anterior.get("HodometroHorimetro", []):
            anteriores_medicao[(linha.get("_veiculo_id"), linha.get("nrSequencialHodoHori"))] = Decimal(
                str(linha["nrMedicaoFinal"])
            )
    declaradas = defaultdict(list)
    for md in (
        await db.execute(
            select(MedicaoDeclarada).where(
                MedicaoDeclarada.organization_id == org_id,
                MedicaoDeclarada.cancelada_em.is_(None),
                MedicaoDeclarada.data_referencia >= d_ini,
                MedicaoDeclarada.data_referencia < d_fim,
            )
        )
    ).scalars():
        declaradas[md.medidor_id].append(md)

    for v in informados.values():
        link = f"/veiculos/{v.id}"
        cd_bem = (v.patrimonio or "").strip()[:10] or None
        tipo = tipo_medidor(v)
        if tipo == 3:
            r.arquivos["HodometroHorimetro"].append({
                "idPessoa": id_pessoa, "cdBem": cd_bem, "nrSequencialHodoHori": 1,
                "nrMes": mes, "nrAno": ano, "idTipoMedidor": 3,
                "nrMedicaoInicial": ZERO, "nrMedicaoFinal": ZERO, "nrMedicaoDeclarada": ZERO,
                "dsNotaExplicativa": None, "_veiculo_id": str(v.id), "_placa": v.placa,
            })
            continue
        lista = await medidores(db, v)
        ativos = [m for m in lista if m.data_inicio < d_fim and (m.data_fim is None or m.data_fim >= d_ini)]
        leituras = defaultdict(list)
        for a in abast_por_veiculo.get(v.id, []):
            m = _medidor_da_data(lista, data_local(a.data_abastecimento))
            valor = _leitura(a, m.tipo if m else tipo)
            if m is not None and valor is not None:
                leituras[m.id].append((valor, a))
        for m in ativos:
            chave = (str(v.id), m.sequencial)
            if chave in anteriores_medicao:
                inicial = anteriores_medicao[chave]
            elif m.data_inicio >= d_ini:
                inicial = Decimal(m.leitura_inicial)
            else:
                inicial = await _ultima_leitura_antes(db, v, m, t_ini)
                if inicial is None:
                    # Primeiro mês com dados: parte da primeira leitura do mês
                    # (ou da leitura atual do veículo, se ele não rodou).
                    do_mes = [val for val, _ in leituras[m.id]]
                    if do_mes:
                        inicial = min(do_mes)
                    elif m.sequencial == 1:
                        inicial = Decimal(
                            (v.horimetro_atual if m.tipo == 2 else v.quilometragem_atual) or 0
                        )
                    else:
                        inicial = Decimal(m.leitura_inicial)
            if m.data_fim is not None and m.data_fim < d_fim and m.leitura_final is not None:
                final = Decimal(m.leitura_final)
            else:
                final = max([inicial] + [val for val, _ in leituras[m.id]])
            for val, a in leituras[m.id]:
                if val < inicial:
                    r.aviso(
                        "HodometroHorimetro",
                        f"{v.placa}: leitura {val} no abastecimento AB-{a.numero_ano}/{a.numero_seq:06d} "
                        f"é menor que a inicial do mês ({inicial}).",
                        f"/abastecimentos/{a.id}",
                    )
            if final < inicial:
                r.erro("HodometroHorimetro", f"{v.placa}: medição final ({final}) menor que a inicial ({inicial}).", link)
            decl = declaradas.get(m.id, [])
            qtd_decl = sum((Decimal(d.quantidade) for d in decl), ZERO)
            nota = "; ".join(d.justificativa for d in decl)[:250] or None
            r.arquivos["HodometroHorimetro"].append({
                "idPessoa": id_pessoa,
                "cdBem": cd_bem,
                "nrSequencialHodoHori": m.sequencial,
                "nrMes": mes,
                "nrAno": ano,
                "idTipoMedidor": m.tipo,
                "nrMedicaoInicial": _q(inicial),
                "nrMedicaoFinal": _q(final),
                "nrMedicaoDeclarada": _q(qtd_decl),
                "dsNotaExplicativa": nota,
                "_veiculo_id": str(v.id),
                "_placa": v.placa,
                "_rodado": _q(final - inicial + qtd_decl),
            })

    # ── Consumo ──
    soma: dict[tuple, Decimal] = defaultdict(lambda: ZERO)
    for a in abast_mes:
        c = combustiveis.get(a.combustivel_id)
        if a.veiculo_id not in informados or c is None or not c.simam_informar:
            continue
        soma[(a.veiculo_id, a.combustivel_id)] += Decimal(a.quantidade_litros)
    existentes = {
        (s.veiculo_id, s.combustivel_id): s
        for s in (
            await db.execute(
                select(SimamConsumo).where(
                    SimamConsumo.organization_id == org_id, SimamConsumo.ano == ano, SimamConsumo.mes == mes
                )
            )
        ).scalars()
    }
    rodado = defaultdict(lambda: ZERO)
    for linha in r.arquivos["HodometroHorimetro"]:
        rodado[linha["_veiculo_id"]] += linha.get("_rodado", ZERO)
    for (veic_id, comb_id), litros in sorted(soma.items(), key=lambda kv: informados[kv[0][0]].placa):
        v = informados[veic_id]
        cat, obj = codigos(comb_id, "ConsumoCombustivel")
        existente = existentes.get((veic_id, comb_id))
        linha = {
            "idPessoa": id_pessoa,
            "nrSequencialConsumo": existente.sequencial if existente else None,
            "cdBem": (v.patrimonio or "").strip()[:10] or None,
            "idTipoCategoriaObjetoDespesa": cat,
            "idTipoObjetoDespesa": obj,
            "nrMesConsumo": mes,
            "nrAnoConsumo": ano,
            "nrQuantidade": _q(litros),
            "_veiculo_id": str(veic_id),
            "_combustivel_id": str(comb_id),
            "_placa": v.placa,
            "_combustivel": combustiveis[comb_id].nome,
        }
        km = rodado.get(str(veic_id), ZERO)
        if km > 0 and litros > 0 and tipo_medidor(v) == 1 and combustiveis[comb_id].categoria == "COMBUSTIVEL":
            linha["_media"] = (km / litros).quantize(Decimal("0.01"))
        r.arquivos["ConsumoCombustivel"].append(linha)

    # ── Estornos informados neste mês ──
    for e, consumo in (
        await db.execute(
            select(SimamEstorno, SimamConsumo)
            .join(SimamConsumo, SimamConsumo.id == SimamEstorno.consumo_id)
            .where(SimamEstorno.organization_id == org_id, SimamEstorno.ano == ano, SimamEstorno.mes == mes)
            .order_by(SimamEstorno.numero)
        )
    ).all():
        r.arquivos["EstornoConsumoCombustivel"].append({
            "idPessoa": id_pessoa,
            "nrEstorno": e.numero,
            "nrAnoEstorno": e.ano,
            "nrMesEstorno": e.mes,
            "nrSequencialConsumo": consumo.sequencial,
            "nrQuantidade": _q(e.quantidade),
            "dsMotivo": e.motivo,
            "_origem": f"{consumo.mes:02d}/{consumo.ano}",
            "_cd_bem": consumo.cd_bem,
        })

    # ── Entradas extraorçamentárias ──
    # A chave do TCE é (repassador, combustível, tipo, data): lançamentos iguais
    # no mesmo dia viram uma linha só, com as quantidades somadas.
    entradas: dict[tuple, dict] = {}
    for en in (
        await db.execute(
            select(EntradaCombustivel)
            .where(
                EntradaCombustivel.organization_id == org_id,
                EntradaCombustivel.cancelada.is_(False),
                EntradaCombustivel.tipo_entrada != "ORCAMENTARIA",
                EntradaCombustivel.data_entrada >= d_ini,
                EntradaCombustivel.data_entrada < d_fim,
            )
            .order_by(EntradaCombustivel.data_entrada, EntradaCombustivel.simam_numero)
        )
    ).scalars():
        c = combustiveis.get(en.combustivel_id)
        if c is None or not c.simam_informar:
            continue
        cat, obj = codigos(en.combustivel_id, "EntradaExtraCombustivel")
        cpf = en.responsavel_cpf or cpf_padrao
        rotulo = f"Entrada de {c.nome} em {en.data_entrada.strftime('%d/%m/%Y')}"
        if not cpf:
            r.erro("EntradaExtraCombustivel", f"{rotulo}: falta o CPF do responsável pelo combustível.", "/configuracoes")
        if not en.lei_ato_codigo:
            r.erro("EntradaExtraCombustivel", f"{rotulo}: falta o código da Lei/Ato (cdControleLeiAto).", "/tanques")
        doc = en.repassador_cpf_cnpj or ""
        fl = "S" if en.repassador_entidade_tce else "N"
        chave = (fl, doc, cat, obj, en.tipo_entrada, en.data_entrada)
        if chave in entradas:
            linha = entradas[chave]
            linha["nrQuantidade"] = _q(linha["nrQuantidade"] + Decimal(en.quantidade_litros))
            if en.nota_explicativa:
                linha["dsNotaExplicativa"] = "; ".join(
                    filter(None, [linha["dsNotaExplicativa"], en.nota_explicativa])
                )[:250]
            continue
        entradas[chave] = {
            "idPessoa": id_pessoa,
            "flEntidadeRepassador": fl,
            "tpDocRepassador": TP_DOC_CNPJ if len(doc) == 14 else TP_DOC_CPF,
            "nrDocRepassador": doc or None,
            "idTipoCategoriaObjetoDespesa": cat,
            "idTipoObjetoDespesa": obj,
            "idTipoEntradaCombustivel": TIPOS_ENTRADA.get(en.tipo_entrada),
            "dtEntrada": en.data_entrada.isoformat(),
            "nrCPF": cpf,
            "nrQuantidade": _q(en.quantidade_litros),
            "cdControleLeiAto": en.lei_ato_codigo,
            "nrConvenioOrigem": en.convenio_numero,
            "nrAnoConvenioOrigem": en.convenio_ano,
            "dsObjetoConvenioOrigem": en.convenio_objeto,
            "dsNotaExplicativa": en.nota_explicativa,
            "_combustivel": c.nome,
            "_repassador": en.repassador_nome,
        }
    r.arquivos["EntradaExtraCombustivel"] = list(entradas.values())

    # ── Saídas extraordinárias ── (mesma regra de agregação por chave)
    saidas: dict[tuple, dict] = {}
    for s in (
        await db.execute(
            select(SaidaExtraCombustivel)
            .where(
                SaidaExtraCombustivel.organization_id == org_id,
                SaidaExtraCombustivel.data_saida >= d_ini,
                SaidaExtraCombustivel.data_saida < d_fim,
            )
            .order_by(SaidaExtraCombustivel.data_saida, SaidaExtraCombustivel.numero)
        )
    ).scalars():
        c = combustiveis.get(s.combustivel_id)
        if c is None or not c.simam_informar:
            continue
        cat, obj = codigos(s.combustivel_id, "SaidaExtraCombustivel")
        doc = s.recebedor_cpf_cnpj or ""
        fl = None if s.tipo_saida != 6 else ("S" if s.recebedor_entidade_tce else "N")
        chave = (cat, obj, s.tipo_saida, s.data_saida, fl, doc, s.convenio_numero)
        if chave in saidas:
            linha = saidas[chave]
            linha["nrQuantidade"] = _q(linha["nrQuantidade"] + Decimal(s.quantidade))
            if s.nota_explicativa:
                linha["dsNotaExplicativa"] = "; ".join(
                    filter(None, [linha["dsNotaExplicativa"], s.nota_explicativa])
                )[:250]
            continue
        saidas[chave] = {
            "idPessoa": id_pessoa,
            "idTipoCategoriaObjetoDespesa": cat,
            "idTipoObjetoDespesa": obj,
            "idTipoSaidaCombustivel": s.tipo_saida,
            "dtSaida": s.data_saida.isoformat(),
            "flEntidadeRecebedor": fl,
            "tpDocRecebedor": (TP_DOC_CNPJ if len(doc) == 14 else TP_DOC_CPF) if doc else None,
            "nrDocRecebedor": doc or None,
            "nrCPF": s.responsavel_cpf,
            "nrQuantidade": _q(s.quantidade),
            "cdControleLeiAto": s.lei_ato_codigo,
            "nrConvenioOrigem": s.convenio_numero,
            "nrAnoConvenioOrigem": s.convenio_ano,
            "dsObjetoConvenioOrigem": s.convenio_objeto,
            "dsNotaExplicativa": s.nota_explicativa,
            "_combustivel": c.nome,
            "_tipo": TIPOS_SAIDA.get(s.tipo_saida),
        }
    r.arquivos["SaidaExtraCombustivel"] = list(saidas.values())

    # ── Estoque (tanques próprios) ──
    tanques_por_comb = defaultdict(list)
    for t in (await db.execute(select(Tanque).where(Tanque.organization_id == org_id))).scalars():
        tanques_por_comb[t.combustivel_id].append(t.id)
    estoque_anterior = {}
    if anterior:
        for linha in anterior.get("EstoqueCombustivel", []):
            estoque_anterior[linha.get("_combustivel_id")] = Decimal(str(linha["nrQuantidadeFinal"]))
    for comb_id, tanques in tanques_por_comb.items():
        c = combustiveis.get(comb_id)
        # EstoqueCombustivel só aceita a categoria 1 (Combustível).
        if c is None or not c.simam_informar or (c.simam_categoria and c.simam_categoria != 1):
            continue
        final = await _saldo_em(db, org_id, tanques, t_fim)
        if str(comb_id) in estoque_anterior:
            inicial = estoque_anterior[str(comb_id)]
        else:
            inicial = await _saldo_em(db, org_id, tanques, t_ini)
        if inicial == 0 and final == 0 and c.deleted_at is not None:
            continue
        cat, obj = codigos(comb_id, "EstoqueCombustivel")
        if final < 0:
            r.erro("EstoqueCombustivel", f"{c.nome}: estoque final negativo ({final} L). Registre as entradas ou o inventário.", "/tanques")
        r.arquivos["EstoqueCombustivel"].append({
            "idPessoa": id_pessoa,
            "idTipoCategoriaObjetoDespesa": cat,
            "idTipoObjetoDespesa": obj,
            "nrMesBase": mes,
            "nrAnoBase": ano,
            "nrQuantidadeInicial": _q(inicial),
            "nrQuantidadeFinal": _q(final),
            "_combustivel_id": str(comb_id),
            "_combustivel": c.nome,
        })

    # ── Ordem e competência anterior ──
    anterior_comp = await obter(db, org_id, *mes_anterior(ano, mes))
    ja_usa = await db.scalar(
        select(func.count()).select_from(SimamCompetencia).where(
            SimamCompetencia.organization_id == org_id,
            (SimamCompetencia.ano * 100 + SimamCompetencia.mes) < ano * 100 + mes,
        )
    )
    if ja_usa and (anterior_comp is None or anterior_comp.status == "ABERTA"):
        ma, mm = mes_anterior(ano, mes)
        r.erro("Geral", f"Feche antes a competência {mm:02d}/{ma}.", f"/simam?ano={ma}&mes={mm}")

    # ── Campos obrigatórios / tamanhos (o próprio layout valida) ──
    # Só registra o que as regras acima ainda não apontaram (evita erro repetido).
    ja_apontados = {(e["arquivo"], e["link"]) for e in r.erros} | {("Geral", "/configuracoes")}
    for arquivo, linhas in r.arquivos.items():
        for linha in linhas:
            link = f"/veiculos/{linha['_veiculo_id']}" if linha.get("_veiculo_id") else None
            if (arquivo, link) in ja_apontados or (not id_pessoa and arquivo != "Geral"):
                continue
            try:
                # O sequencial do consumo só nasce no fechamento.
                formatar_linha(arquivo, {**linha, "nrSequencialConsumo": linha.get("nrSequencialConsumo") or 1})
            except ErroLayout as exc:
                rotulo = linha.get("_placa") or linha.get("_combustivel") or arquivo
                r.erro(arquivo, f"{rotulo}: {exc}", link)
                ja_apontados.add((arquivo, link))
    return r


async def _ultima_leitura_antes(db, veiculo: Veiculo, medidor: VeiculoMedidor, antes: datetime) -> Decimal | None:
    coluna = Abastecimento.horimetro if medidor.tipo == 2 else Abastecimento.quilometragem
    valor = await db.scalar(
        select(func.max(coluna)).where(
            Abastecimento.veiculo_id == veiculo.id,
            Abastecimento.status == "CONFIRMADO",
            Abastecimento.data_abastecimento < _instante(db, antes),
            Abastecimento.data_abastecimento
            >= _instante(db, datetime.combine(medidor.data_inicio, time(), get_tz()).astimezone(timezone.utc)),
        )
    )
    return Decimal(valor) if valor is not None else None


async def _saldo_em(db, org_id, tanques: list[uuid.UUID], instante: datetime) -> Decimal:
    """Saldo somado dos tanques no instante: saldo atual menos o que se moveu depois.

    Ancorar no saldo atual mantém o SIM-AM igual à tela do tanque mesmo para
    tanques antigos sem a movimentação de estoque inicial.
    """
    atual = await db.scalar(
        select(func.coalesce(func.sum(Tanque.estoque_atual), 0)).where(Tanque.id.in_(tanques))
    )
    depois = await db.scalar(
        select(func.coalesce(func.sum(MovimentacaoEstoque.sinal * MovimentacaoEstoque.quantidade), 0)).where(
            MovimentacaoEstoque.organization_id == org_id,
            MovimentacaoEstoque.tanque_destino_id.in_(tanques),
            MovimentacaoEstoque.created_at >= _instante(db, instante),
        )
    )
    return Decimal(atual or 0) - Decimal(depois or 0)


# ── Fechamento, reabertura, exportação ───────────────────────────────────────


async def _proximo(db, coluna, *filtros) -> int:
    return int((await db.scalar(select(func.coalesce(func.max(coluna), 0)).where(*filtros))) or 0) + 1


async def fechar(db: AsyncSession, org_id: uuid.UUID, ano: int, mes: int, usuario_id) -> SimamCompetencia:
    hoje = datetime.now(get_tz()).date()
    if (ano, mes) >= (hoje.year, hoje.month):
        raise SimamError("Só é possível fechar um mês já encerrado.")
    comp = await obter(db, org_id, ano, mes)
    if comp and comp.status != "ABERTA":
        raise SimamError("Competência já fechada.")
    resultado = await calcular(db, org_id, ano, mes)
    if resultado.erros:
        raise SimamError(f"Há {len(resultado.erros)} pendência(s) a corrigir antes de fechar.")

    # Sequencial de consumo: reaproveita o da chave (reabertura) e nunca reusa número.
    existentes = {
        (s.veiculo_id, s.combustivel_id): s
        for s in (
            await db.execute(
                select(SimamConsumo).where(
                    SimamConsumo.organization_id == org_id, SimamConsumo.ano == ano, SimamConsumo.mes == mes
                )
            )
        ).scalars()
    }
    proximo = await _proximo(db, SimamConsumo.sequencial, SimamConsumo.organization_id == org_id)
    vistos = set()
    for linha in resultado.arquivos["ConsumoCombustivel"]:
        chave = (uuid.UUID(linha["_veiculo_id"]), uuid.UUID(linha["_combustivel_id"]))
        vistos.add(chave)
        s = existentes.get(chave)
        if s is None:
            s = SimamConsumo(
                organization_id=org_id, sequencial=proximo, ano=ano, mes=mes,
                veiculo_id=chave[0], combustivel_id=chave[1],
            )
            proximo += 1
            db.add(s)
        s.cd_bem = linha["cdBem"]
        s.categoria = linha["idTipoCategoriaObjetoDespesa"]
        s.objeto = linha["idTipoObjetoDespesa"]
        s.quantidade = linha["nrQuantidade"]
        linha["nrSequencialConsumo"] = s.sequencial
    for chave, s in existentes.items():
        if chave not in vistos:
            await db.delete(s)  # nunca exportado (reabertura só antes da exportação)
    await db.flush()

    if comp is None:
        comp = SimamCompetencia(organization_id=org_id, ano=ano, mes=mes)
        db.add(comp)
    comp.status = "FECHADA"
    comp.retrato_json = json.dumps(resultado.arquivos, default=str, ensure_ascii=False)
    comp.fechada_em = datetime.now(timezone.utc)
    comp.fechada_por_id = usuario_id
    comp.arquivo_sha256 = hashlib.sha256(gerar_zip(resultado.arquivos)).hexdigest()
    _historico(comp, "FECHADA", usuario_id, f"{len(resultado.avisos)} aviso(s)")
    await db.flush()
    return comp


async def reabrir(db: AsyncSession, org_id: uuid.UUID, ano: int, mes: int, usuario_id, justificativa: str):
    comp = await obter(db, org_id, ano, mes)
    if comp is None or comp.status == "ABERTA":
        raise SimamError("Competência não está fechada.")
    if comp.status == "EXPORTADA":
        raise SimamError("Competência já enviada ao TCE: correções agora geram estorno.")
    seguinte = await obter(db, org_id, *proximo_mes(ano, mes))
    if seguinte and seguinte.status != "ABERTA":
        raise SimamError("Reabra antes a competência seguinte.")
    comp.status = "ABERTA"
    comp.retrato_json = None
    comp.arquivo_sha256 = None
    _historico(comp, "REABERTA", usuario_id, justificativa)
    await db.flush()
    return comp


async def marcar_exportada(db: AsyncSession, org_id: uuid.UUID, ano: int, mes: int, usuario_id):
    comp = await obter(db, org_id, ano, mes)
    if comp is None or comp.status != "FECHADA":
        raise SimamError("Só uma competência fechada pode ser marcada como enviada.")
    anterior = await obter(db, org_id, *mes_anterior(ano, mes))
    if anterior and anterior.status == "FECHADA":
        ma, mm = mes_anterior(ano, mes)
        raise SimamError(f"Marque antes a competência {mm:02d}/{ma} como enviada.")
    comp.status = "EXPORTADA"
    comp.exportada_em = datetime.now(timezone.utc)
    comp.exportada_por_id = usuario_id
    _historico(comp, "EXPORTADA", usuario_id)
    await db.flush()
    return comp


def gerar_zip(arquivos: dict[str, list[dict]]) -> bytes:
    buf = io.BytesIO()
    with zipfile.ZipFile(buf, "w", zipfile.ZIP_DEFLATED) as z:
        for nome in ARQUIVOS:
            linhas = arquivos.get(nome) or []
            if not linhas:
                continue
            info = zipfile.ZipInfo(f"{nome}.txt", date_time=(2000, 1, 1, 0, 0, 0))
            info.compress_type = zipfile.ZIP_DEFLATED
            z.writestr(info, gerar_txt(nome, linhas))
    return buf.getvalue()


# ── Estorno automático ───────────────────────────────────────────────────────


async def exigir_alteravel(
    db: AsyncSession, org_id: uuid.UUID, abast: Abastecimento, *, reduz_litros_apenas: bool
) -> str:
    """Regra do abastecimento frente à competência. Devolve o status do mês.

    ABERTA: livre. FECHADA: bloqueia. EXPORTADA: só cancelamento ou redução de
    litros (vira estorno); qualquer outra alteração é bloqueada.
    """
    dia = data_local(abast.data_abastecimento)
    status = await status_do_mes(db, org_id, dia.year, dia.month)
    if status == "FECHADA":
        raise SimamError(
            f"A competência SIM-AM {dia.month:02d}/{dia.year} está fechada. Reabra a competência para alterar este abastecimento.",
            409,
        )
    if status == "EXPORTADA" and not reduz_litros_apenas:
        raise SimamError(
            f"A competência SIM-AM {dia.month:02d}/{dia.year} já foi enviada ao TCE: só é possível cancelar "
            "o abastecimento ou reduzir os litros (gera estorno).",
            409,
        )
    return status


async def registrar_estorno(
    db: AsyncSession, org_id: uuid.UUID, abast: Abastecimento, quantidade: Decimal, motivo: str, usuario_id
) -> SimamEstorno | None:
    """Estorna `quantidade` litros do consumo enviado do mês do abastecimento."""
    dia = data_local(abast.data_abastecimento)
    if await status_do_mes(db, org_id, dia.year, dia.month) != "EXPORTADA" or quantidade <= 0:
        return None
    consumo = (
        await db.execute(
            select(SimamConsumo).where(
                SimamConsumo.organization_id == org_id,
                SimamConsumo.ano == dia.year,
                SimamConsumo.mes == dia.month,
                SimamConsumo.veiculo_id == abast.veiculo_id,
                SimamConsumo.combustivel_id == abast.combustivel_id,
            )
        )
    ).scalar_one_or_none()
    if consumo is None:
        return None  # veículo/combustível não informado ao SIM-AM
    ja = await db.scalar(
        select(func.coalesce(func.sum(SimamEstorno.quantidade), 0)).where(SimamEstorno.consumo_id == consumo.id)
    )
    saldo = Decimal(consumo.quantidade) - Decimal(ja or 0)
    quantidade = min(_q(quantidade), saldo)
    if quantidade <= 0:
        return None
    ano, mes = await competencia_de_lancamento(db, org_id)
    estorno = SimamEstorno(
        organization_id=org_id,
        numero=await _proximo(db, SimamEstorno.numero, SimamEstorno.organization_id == org_id, SimamEstorno.ano == ano),
        ano=ano,
        mes=mes,
        consumo_id=consumo.id,
        quantidade=quantidade,
        motivo=(f"AB-{abast.numero_ano}/{abast.numero_seq:06d}: {motivo}")[:250],
        abastecimento_id=abast.id,
        usuario_id=usuario_id,
    )
    db.add(estorno)
    await db.flush()
    return estorno


async def proximo_numero_saida(db, org_id, ano: int) -> int:
    return await _proximo(
        db, SaidaExtraCombustivel.numero, SaidaExtraCombustivel.organization_id == org_id, SaidaExtraCombustivel.ano == ano
    )


async def proximo_numero_entrada(db, org_id) -> int:
    return await _proximo(db, EntradaCombustivel.simam_numero, EntradaCombustivel.organization_id == org_id)
