"""Motor de elegibilidade: bloqueios, duplicidades e limites (itens 10.4 e 13).

Toda solicitação — de caçamba ou do Porteira Adentro — passa por aqui ANTES de
ser confirmada, e a verificação roda no backend mesmo que a tela já tenha
mostrado o resultado ao atendente.

O retorno nunca é um simples "não pode": é uma lista de impedimentos com código,
mensagem em português e a informação de se um gestor pode liberar por exceção.
"""

import uuid
from dataclasses import asdict, dataclass, field
from datetime import date, timedelta

from sqlalchemy import func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.bloqueios import Bloqueio
from app.models.cacambas import SolicitacaoCacamba
from app.models.enums import (
    SOLICITACAO_ATIVA,
    ServicoAfetado,
    SituacaoBloqueio,
    SituacaoSolicitacao,
)
from app.models.governanca import DataBloqueada, Regiao
from app.models.pessoas import Imovel, Pessoa
from app.services import configuracoes


@dataclass
class Impedimento:
    """Um motivo pelo qual a operação não pode seguir."""

    codigo: str
    mensagem: str
    # Gestor com `govinfra.bloqueios.excecao` pode liberar mediante justificativa.
    permite_excecao: bool = True
    detalhes: dict = field(default_factory=dict)

    def dict(self) -> dict:
        return asdict(self)


@dataclass
class ResultadoElegibilidade:
    elegivel: bool
    impedimentos: list[Impedimento] = field(default_factory=list)
    avisos: list[str] = field(default_factory=list)

    @property
    def bloqueios_absolutos(self) -> list[Impedimento]:
        """Impedimentos que nem o gestor consegue liberar."""
        return [i for i in self.impedimentos if not i.permite_excecao]

    def dict(self) -> dict:
        return {
            "elegivel": self.elegivel,
            "impedimentos": [i.dict() for i in self.impedimentos],
            "avisos": self.avisos,
            "permite_excecao": bool(self.impedimentos) and not self.bloqueios_absolutos,
        }


async def bloqueios_ativos(
    db: AsyncSession,
    organizacao_id: uuid.UUID,
    *,
    pessoa_id: uuid.UUID | None = None,
    imovel_id: uuid.UUID | None = None,
    servico: str = ServicoAfetado.TODOS.value,
    referencia: date | None = None,
) -> list[Bloqueio]:
    """Bloqueios vigentes que atingem a pessoa e/ou o imóvel no serviço indicado."""
    referencia = referencia or date.today()
    if pessoa_id is None and imovel_id is None:
        return []

    alvos = []
    if pessoa_id:
        alvos.append(Bloqueio.pessoa_id == pessoa_id)
    if imovel_id:
        alvos.append(Bloqueio.imovel_id == imovel_id)

    consulta = select(Bloqueio).where(
        Bloqueio.organizacao_id == organizacao_id,
        Bloqueio.situacao == SituacaoBloqueio.ATIVO.value,
        or_(*alvos),
        Bloqueio.data_inicio <= referencia,
        or_(Bloqueio.data_fim.is_(None), Bloqueio.data_fim >= referencia),
        Bloqueio.servico_afetado.in_([servico, ServicoAfetado.TODOS.value]),
    )
    return list((await db.execute(consulta)).scalars().all())


async def verificar_cacamba(
    db: AsyncSession,
    organizacao_id: uuid.UUID,
    *,
    pessoa: Pessoa,
    imovel: Imovel | None,
    data_desejada: date | None,
    endereco_chave: str | None = None,
    solicitacao_atual_id: uuid.UUID | None = None,
    dias_previstos: int | None = None,
    material_proibido: bool = False,
) -> ResultadoElegibilidade:
    """Todas as regras do item 13, avaliadas de uma vez."""
    resultado = ResultadoElegibilidade(elegivel=True)
    hoje = date.today()

    limites = await configuracoes.obter_varias(
        db,
        organizacao_id,
        [
            "cacamba_limite_diario_cpf",
            "cacamba_limite_mensal_cpf",
            "cacamba_intervalo_minimo_dias",
            "cacamba_uma_ativa_por_cpf",
            "cacamba_uma_ativa_por_endereco",
            "cacamba_periodo_maximo_dias",
            "cacamba_antecedencia_minima_dias",
            "cacamba_dias_atendimento",
        ],
    )

    # ── Bloqueios cadastrados ───────────────────────────────────────────────
    for bloqueio in await bloqueios_ativos(
        db,
        organizacao_id,
        pessoa_id=pessoa.id,
        imovel_id=imovel.id if imovel else None,
        servico=ServicoAfetado.CACAMBAS.value,
        referencia=data_desejada or hoje,
    ):
        alvo = "o cidadão" if bloqueio.pessoa_id == pessoa.id else "o imóvel"
        motivo = bloqueio.motivo.nome if bloqueio.motivo else "motivo não informado"
        resultado.impedimentos.append(
            Impedimento(
                codigo="bloqueio_ativo",
                mensagem=(
                    f"Há bloqueio ativo para {alvo}: {motivo}."
                    + (f" {bloqueio.descricao}" if bloqueio.descricao else "")
                ),
                detalhes={"bloqueio_id": str(bloqueio.id), "tipo": bloqueio.tipo},
            )
        )

    # ── Solicitação ativa por CPF ───────────────────────────────────────────
    base_ativa = select(func.count()).select_from(SolicitacaoCacamba).where(
        SolicitacaoCacamba.organizacao_id == organizacao_id,
        SolicitacaoCacamba.deleted_at.is_(None),
        SolicitacaoCacamba.situacao.in_(SOLICITACAO_ATIVA),
    )
    if solicitacao_atual_id:
        base_ativa = base_ativa.where(SolicitacaoCacamba.id != solicitacao_atual_id)

    if limites["cacamba_uma_ativa_por_cpf"]:
        ativas = await db.scalar(base_ativa.where(SolicitacaoCacamba.pessoa_id == pessoa.id))
        if ativas:
            resultado.impedimentos.append(
                Impedimento(
                    codigo="solicitacao_ativa_cpf",
                    mensagem=(
                        "Este cidadão já possui uma solicitação de caçamba em andamento. "
                        "Conclua ou cancele o atendimento anterior antes de abrir outro."
                    ),
                )
            )

    # ── Solicitação ativa por endereço ──────────────────────────────────────
    chave = endereco_chave or (imovel.endereco_chave if imovel else None)
    if limites["cacamba_uma_ativa_por_endereco"] and chave:
        ativas_endereco = await db.scalar(
            base_ativa.where(SolicitacaoCacamba.endereco_chave == chave)
        )
        if ativas_endereco:
            resultado.impedimentos.append(
                Impedimento(
                    codigo="solicitacao_ativa_endereco",
                    mensagem="Já existe uma caçamba ativa neste endereço.",
                )
            )

    # ── Duas solicitações no mesmo dia ──────────────────────────────────────
    limite_diario = int(limites["cacamba_limite_diario_cpf"] or 0)
    if limite_diario > 0:
        no_dia = await db.scalar(
            select(func.count())
            .select_from(SolicitacaoCacamba)
            .where(
                SolicitacaoCacamba.organizacao_id == organizacao_id,
                SolicitacaoCacamba.pessoa_id == pessoa.id,
                SolicitacaoCacamba.deleted_at.is_(None),
                SolicitacaoCacamba.situacao != SituacaoSolicitacao.CANCELADA.value,
                func.date(SolicitacaoCacamba.created_at) == hoje,
                *([SolicitacaoCacamba.id != solicitacao_atual_id] if solicitacao_atual_id else []),
            )
        )
        if (no_dia or 0) >= limite_diario:
            resultado.impedimentos.append(
                Impedimento(
                    codigo="limite_diario",
                    mensagem=(
                        f"Este CPF já registrou {no_dia} solicitação(ões) hoje "
                        f"(limite configurado: {limite_diario})."
                    ),
                )
            )

    # ── Limite mensal ───────────────────────────────────────────────────────
    limite_mensal = int(limites["cacamba_limite_mensal_cpf"] or 0)
    if limite_mensal > 0:
        inicio_mes = hoje.replace(day=1)
        no_mes = await db.scalar(
            select(func.count())
            .select_from(SolicitacaoCacamba)
            .where(
                SolicitacaoCacamba.organizacao_id == organizacao_id,
                SolicitacaoCacamba.pessoa_id == pessoa.id,
                SolicitacaoCacamba.deleted_at.is_(None),
                SolicitacaoCacamba.situacao != SituacaoSolicitacao.CANCELADA.value,
                func.date(SolicitacaoCacamba.created_at) >= inicio_mes,
                *([SolicitacaoCacamba.id != solicitacao_atual_id] if solicitacao_atual_id else []),
            )
        )
        if (no_mes or 0) >= limite_mensal:
            resultado.impedimentos.append(
                Impedimento(
                    codigo="limite_mensal",
                    mensagem=(
                        f"Limite mensal atingido: {no_mes} de {limite_mensal} "
                        "solicitações neste mês."
                    ),
                )
            )

    # ── Intervalo mínimo desde o último atendimento concluído ───────────────
    intervalo = int(limites["cacamba_intervalo_minimo_dias"] or 0)
    if intervalo > 0:
        ultima = await db.scalar(
            select(SolicitacaoCacamba)
            .where(
                SolicitacaoCacamba.organizacao_id == organizacao_id,
                SolicitacaoCacamba.pessoa_id == pessoa.id,
                SolicitacaoCacamba.situacao == SituacaoSolicitacao.CONCLUIDA.value,
                SolicitacaoCacamba.deleted_at.is_(None),
            )
            .order_by(SolicitacaoCacamba.updated_at.desc())
            .limit(1)
        )
        if ultima is not None and ultima.updated_at:
            liberado_em = ultima.updated_at.date() + timedelta(days=intervalo)
            if (data_desejada or hoje) < liberado_em:
                resultado.impedimentos.append(
                    Impedimento(
                        codigo="intervalo_minimo",
                        mensagem=(
                            f"O intervalo mínimo entre atendimentos é de {intervalo} dias. "
                            f"Este cidadão poderá solicitar novamente a partir de "
                            f"{liberado_em.strftime('%d/%m/%Y')}."
                        ),
                        detalhes={"liberado_em": liberado_em.isoformat()},
                    )
                )

    # ── Material não autorizado ─────────────────────────────────────────────
    if material_proibido:
        resultado.impedimentos.append(
            Impedimento(
                codigo="material_proibido",
                mensagem=(
                    "O material informado não pode ser descartado na caçamba municipal. "
                    "Oriente o cidadão sobre a destinação correta."
                ),
                # Regra sanitária/ambiental: nem o gestor libera por exceção.
                permite_excecao=False,
            )
        )

    # ── Período de utilização ───────────────────────────────────────────────
    maximo = int(limites["cacamba_periodo_maximo_dias"] or 0)
    if dias_previstos and maximo and dias_previstos > maximo:
        resultado.impedimentos.append(
            Impedimento(
                codigo="periodo_excedido",
                mensagem=(
                    f"O período solicitado ({dias_previstos} dias) ultrapassa o máximo "
                    f"permitido de {maximo} dias."
                ),
            )
        )

    # ── Data desejada: antecedência, dia da semana e feriado ────────────────
    if data_desejada:
        antecedencia = int(limites["cacamba_antecedencia_minima_dias"] or 0)
        if data_desejada < hoje + timedelta(days=antecedencia):
            resultado.impedimentos.append(
                Impedimento(
                    codigo="antecedencia_minima",
                    mensagem=(
                        f"O agendamento exige antecedência mínima de {antecedencia} dia(s). "
                        f"Escolha uma data a partir de "
                        f"{(hoje + timedelta(days=antecedencia)).strftime('%d/%m/%Y')}."
                    ),
                )
            )

        dias_atendimento = limites["cacamba_dias_atendimento"] or []
        if dias_atendimento and data_desejada.weekday() not in dias_atendimento:
            resultado.impedimentos.append(
                Impedimento(
                    codigo="dia_sem_atendimento",
                    mensagem="Não há atendimento de caçambas neste dia da semana.",
                )
            )

        bloqueada = await db.scalar(
            select(DataBloqueada).where(
                DataBloqueada.organizacao_id == organizacao_id,
                DataBloqueada.data == data_desejada,
                DataBloqueada.servico.in_(["todos", ServicoAfetado.CACAMBAS.value]),
            )
        )
        if bloqueada is not None:
            resultado.impedimentos.append(
                Impedimento(
                    codigo="data_bloqueada",
                    mensagem=f"Data indisponível: {bloqueada.descricao}.",
                )
            )

    # ── Área de atendimento ─────────────────────────────────────────────────
    if imovel is not None and imovel.regiao_id:
        regiao = await db.get(Regiao, imovel.regiao_id)
        if regiao is not None and not regiao.atendida:
            resultado.impedimentos.append(
                Impedimento(
                    codigo="fora_area_atendimento",
                    mensagem=(
                        f"A região {regiao.nome} está fora da área de atendimento de caçambas."
                    ),
                )
            )

    # ── Avisos (não impedem, mas o atendente precisa ver) ───────────────────
    if imovel is not None and not imovel.tem_coordenada:
        resultado.avisos.append(
            "O imóvel não tem ponto marcado no mapa — a equipe pode ter dificuldade para localizar."
        )
    if not pessoa.documento:
        resultado.avisos.append("O cidadão está cadastrado sem CPF/CNPJ.")
    if not pessoa.telefone and not pessoa.whatsapp:
        resultado.avisos.append("Não há telefone de contato cadastrado para avisar sobre a entrega.")

    resultado.elegivel = not resultado.impedimentos
    return resultado


async def verificar_porteira(
    db: AsyncSession,
    organizacao_id: uuid.UUID,
    *,
    pessoa: Pessoa,
    imovel: Imovel,
    data_desejada: date | None,
    horas_estimadas: float | None,
    saldo_disponivel: float | None,
    programa_vigente: bool,
    beneficiario_ativo: bool,
    documentos_pendentes: list[str] | None = None,
) -> ResultadoElegibilidade:
    """Regras de entrada do Porteira Adentro (itens 19 a 21)."""
    resultado = ResultadoElegibilidade(elegivel=True)
    hoje = date.today()

    limites = await configuracoes.obter_varias(
        db, organizacao_id, ["porteira_antecedencia_minima_dias"]
    )

    for bloqueio in await bloqueios_ativos(
        db,
        organizacao_id,
        pessoa_id=pessoa.id,
        imovel_id=imovel.id,
        servico=ServicoAfetado.PORTEIRA_ADENTRO.value,
        referencia=data_desejada or hoje,
    ):
        motivo = bloqueio.motivo.nome if bloqueio.motivo else "motivo não informado"
        resultado.impedimentos.append(
            Impedimento(
                codigo="bloqueio_ativo",
                mensagem=f"Há bloqueio ativo no programa: {motivo}.",
                detalhes={"bloqueio_id": str(bloqueio.id)},
            )
        )

    if not programa_vigente:
        resultado.impedimentos.append(
            Impedimento(
                codigo="programa_fora_vigencia",
                mensagem="O programa não está vigente na data informada.",
                permite_excecao=False,
            )
        )

    if not beneficiario_ativo:
        resultado.impedimentos.append(
            Impedimento(
                codigo="beneficiario_inativo",
                mensagem="O produtor não está com inscrição ativa no programa.",
            )
        )

    if horas_estimadas and saldo_disponivel is not None and horas_estimadas > saldo_disponivel:
        resultado.impedimentos.append(
            Impedimento(
                codigo="saldo_insuficiente",
                mensagem=(
                    f"Saldo insuficiente: o serviço estima {horas_estimadas:g}h e o produtor "
                    f"tem {saldo_disponivel:g}h disponíveis."
                ),
                detalhes={"saldo": saldo_disponivel, "necessario": horas_estimadas},
            )
        )

    if documentos_pendentes:
        resultado.impedimentos.append(
            Impedimento(
                codigo="documentos_pendentes",
                mensagem=(
                    "Documentos obrigatórios não anexados: " + ", ".join(documentos_pendentes) + "."
                ),
            )
        )

    if data_desejada:
        antecedencia = int(limites["porteira_antecedencia_minima_dias"] or 0)
        if data_desejada < hoje + timedelta(days=antecedencia):
            resultado.impedimentos.append(
                Impedimento(
                    codigo="antecedencia_minima",
                    mensagem=(
                        f"O agendamento exige antecedência mínima de {antecedencia} dia(s)."
                    ),
                )
            )
        bloqueada = await db.scalar(
            select(DataBloqueada).where(
                DataBloqueada.organizacao_id == organizacao_id,
                DataBloqueada.data == data_desejada,
                DataBloqueada.servico.in_(["todos", ServicoAfetado.PORTEIRA_ADENTRO.value]),
            )
        )
        if bloqueada is not None:
            resultado.impedimentos.append(
                Impedimento(
                    codigo="data_bloqueada",
                    mensagem=f"Data indisponível: {bloqueada.descricao}.",
                )
            )

    if not imovel.tem_coordenada:
        resultado.avisos.append(
            "A propriedade não tem ponto marcado no mapa — isso reduz a qualidade "
            "da sugestão de datas e dificulta o deslocamento da equipe."
        )

    resultado.elegivel = not resultado.impedimentos
    return resultado


async def data_operacional(
    db: AsyncSession, organizacao_id: uuid.UUID, dia: date, servico: str
) -> tuple[bool, str | None]:
    """A data é atendível? Retorna (sim/não, motivo)."""
    bloqueada = await db.scalar(
        select(DataBloqueada).where(
            DataBloqueada.organizacao_id == organizacao_id,
            DataBloqueada.data == dia,
            DataBloqueada.servico.in_(["todos", servico]),
        )
    )
    if bloqueada is not None:
        return False, bloqueada.descricao

    if servico == ServicoAfetado.CACAMBAS.value:
        dias = await configuracoes.obter(db, organizacao_id, "cacamba_dias_atendimento")
        if dias and dia.weekday() not in dias:
            return False, "Dia sem atendimento de caçambas"
    return True, None
