"""Conversão de modelo para resposta.

Fica separado porque as rotas de pedido e de painel devolvem as mesmas
formas; duplicar isso foi como a versão anterior acabou com telas mostrando
números diferentes para o mesmo processo.
"""

from datetime import date, datetime, timezone

from sqlalchemy import and_, or_, select

from app.models.auth_models import User
from app.models.pedido import Encaminhamento, Pedido, SituacaoPedido, StatusEncaminhamento
from app.schemas.pedido import (
    AndamentoOut,
    AnexoOut,
    Indicadores,
    EncaminhamentoOut,
    MedicaoOut,
    PedidoDetalhe,
    PedidoLista,
    UsuarioResumo,
)
from app.services import saude as saude_service

ENCERRADO = {SituacaoPedido.CONCLUIDO.value, SituacaoPedido.CANCELADO.value}

ATIVOS = {
    StatusEncaminhamento.AGUARDANDO.value,
    StatusEncaminhamento.EM_EXECUCAO.value,
    StatusEncaminhamento.AGUARDANDO_COMPLEMENTO.value,
}


def filtro_caixa(user: User):
    """O que está na mão do usuário — e a fila do setor dele.

    Uma tarefa encaminhada sem responsável aparece para todo o setor de
    destino. Assim que alguém assume, some para os demais — salvo para quem
    foi mencionado, que continua vendo, comentando, anexando e concluindo.
    """
    pessoal = Pedido.responsavel_atual_id == user.id
    fila_do_setor = and_(
        Pedido.responsavel_atual_id.is_(None),
        Pedido.setor_atual == user.setor,
    )
    mencionado = (
        select(Encaminhamento.id)
        .where(
            Encaminhamento.pedido_id == Pedido.id,
            Encaminhamento.status.in_(ATIVOS),
            Encaminhamento.participantes.contains([str(user.id)]),
        )
        .exists()
    )
    if not user.setor:
        return or_(pessoal, mencionado)
    return or_(pessoal, fila_do_setor, mencionado)


def dias_de_atraso(pedido: Pedido, hoje: date | None = None) -> int:
    """Dias corridos além do prazo atual. Zero quando encerrado."""
    if pedido.situacao in ENCERRADO or pedido.prazo_atual is None:
        return 0
    hoje = hoje or datetime.now(timezone.utc).date()
    return max(0, (hoje - pedido.prazo_atual).days)


def dias_na_situacao(pedido: Pedido, agora: datetime | None = None) -> int:
    """Dias corridos desde que o pedido chegou onde está. Zero se encerrado."""
    if pedido.situacao in ENCERRADO:
        return 0
    desde = pedido.situacao_desde or pedido.ultima_movimentacao_em or pedido.created_at
    if desde is None:
        return 0
    if desde.tzinfo is None:
        desde = desde.replace(tzinfo=timezone.utc)
    agora = agora or datetime.now(timezone.utc)
    return max(0, (agora - desde).days)


def _utc(d: datetime) -> datetime:
    return d.replace(tzinfo=timezone.utc) if d.tzinfo is None else d


def indicadores(pedido: Pedido) -> Indicadores:
    """Onde o tempo foi gasto: com o Assessor, nos setores, esperando o governo."""
    agora = datetime.now(timezone.utc)
    fim = _utc(pedido.concluido_em) if pedido.concluido_em else agora
    total = max(0.0, (fim - _utc(pedido.created_at)).total_seconds() / 3600)

    por_setor: dict[str, float] = {}
    for enc in pedido.encaminhamentos:
        if enc.created_at is None:
            continue
        saida = _utc(enc.devolvido_em) if enc.devolvido_em else (
            agora if enc.status in ATIVOS else _utc(enc.updated_at or enc.created_at)
        )
        horas = max(0.0, (saida - _utc(enc.created_at)).total_seconds() / 3600)
        # Chave é o código; a tela traduz para o nome do setor.
        por_setor[enc.setor] = round(por_setor.get(enc.setor, 0) + horas, 1)

    # Espera externa: eventos TERCEIRO alternam entre "estacionou" e "retomou".
    governo = 0.0
    inicio = None
    for a in sorted(pedido.andamentos, key=lambda x: x.created_at):
        if a.tipo != "TERCEIRO":
            continue
        if inicio is None:
            inicio = _utc(a.created_at)
        else:
            governo += (_utc(a.created_at) - inicio).total_seconds() / 3600
            inicio = None
    if inicio is not None and pedido.situacao == SituacaoPedido.AGUARDANDO_TERCEIRO.value:
        governo += (agora - inicio).total_seconds() / 3600

    setores = sum(por_setor.values())
    pessoas = sorted({a.autor_nome for a in pedido.andamentos if a.autor_nome and a.autor_nome != "Sistema"})
    return Indicadores(
        horas_total=round(total, 1),
        horas_nos_setores=round(setores, 1),
        horas_aguardando_governo=round(governo, 1),
        horas_com_assessor=round(max(0.0, total - setores - governo), 1),
        idas_e_vindas=len(pedido.encaminhamentos),
        por_setor=por_setor,
        pessoas=pessoas,
    )


def _versoes_dos_anexos(pedido: Pedido) -> dict:
    """Versão de cada anexo dentro do documento declarado.

    Nada é sobrescrito: subir de novo o mesmo documento gera v1, v2, v3. A
    chave é (encaminhamento, medição, descrição declarada); sem descrição,
    cai para o nome do arquivo.
    """
    validos = sorted(
        (a for a in pedido.anexos if a.deleted_at is None),
        key=lambda a: (a.created_at, str(a.id)),
    )
    contagem: dict = {}
    versoes: dict = {}
    for anexo in validos:
        chave = (
            str(anexo.encaminhamento_id),
            str(anexo.medicao_id),
            saude_service.normalizar(anexo.descricao or anexo.nome_original),
        )
        contagem[chave] = contagem.get(chave, 0) + 1
        versoes[anexo.id] = contagem[chave]
    return versoes


def _anexo_out(anexo, versoes: dict) -> AnexoOut:
    saida = AnexoOut.model_validate(anexo)
    saida.versao = versoes.get(anexo.id, 1)
    return saida


def _aplicar_saude(dados: PedidoLista, pedido: Pedido, *, com_anexos: bool) -> list[str]:
    nivel, motivos = saude_service.avaliar_saude(pedido, verificar_anexos=com_anexos)
    dados.proxima_acao = saude_service.resumo_proxima_acao(pedido)
    dados.saude = nivel
    dados.saude_motivo = motivos[0] if motivos else ""
    return motivos


def linha(pedido: Pedido) -> PedidoLista:
    dados = PedidoLista.model_validate(pedido)
    dados.dias_de_atraso = dias_de_atraso(pedido)
    dados.dias_na_situacao = dias_na_situacao(pedido)
    enc = saude_service.encaminhamento_aberto(pedido)
    dados.tarefa_atual = enc.assunto if enc else ""
    _aplicar_saude(dados, pedido, com_anexos=True)
    return dados


def _usuario_resumo(user: User | None) -> UsuarioResumo | None:
    return UsuarioResumo.model_validate(user) if user else None


def detalhe(
    pedido: Pedido, usuarios_por_id: dict[str, User] | None = None
) -> PedidoDetalhe:
    usuarios_por_id = usuarios_por_id or {}
    dados = PedidoDetalhe.model_validate(pedido)
    dados.dias_de_atraso = dias_de_atraso(pedido)
    dados.dias_na_situacao = dias_na_situacao(pedido)
    enc_atual = saude_service.encaminhamento_aberto(pedido)
    dados.tarefa_atual = enc_atual.assunto if enc_atual else ""
    dados.saude_motivos = _aplicar_saude(dados, pedido, com_anexos=True)
    dados.proxima_acao_detalhe = saude_service.descrever_proxima_acao(pedido)
    dados.indicadores = indicadores(pedido)

    versoes = _versoes_dos_anexos(pedido)
    anexos_validos = [a for a in pedido.anexos if a.deleted_at is None]
    anexos_por_enc: dict = {}
    fotos_por_medicao: dict = {}
    for anexo in anexos_validos:
        saida = _anexo_out(anexo, versoes)
        if anexo.medicao_id is not None:
            fotos_por_medicao.setdefault(anexo.medicao_id, []).append(saida)
        else:
            anexos_por_enc.setdefault(anexo.encaminhamento_id, []).append(saida)

    def _medicao_out(medicao) -> MedicaoOut:
        saida = MedicaoOut.model_validate(medicao)
        saida.fotos = fotos_por_medicao.get(medicao.id, [])
        return saida

    encaminhamentos: list[EncaminhamentoOut] = []
    for enc in sorted(pedido.encaminhamentos, key=lambda e: e.ordem):
        saida = EncaminhamentoOut.model_validate(enc)
        saida.anexos = anexos_por_enc.get(enc.id, [])
        saida.medicoes = [_medicao_out(m) for m in enc.medicoes]
        saida.participantes = [
            UsuarioResumo.model_validate(usuarios_por_id[uid])
            for uid in (enc.participantes or [])
            if uid in usuarios_por_id
        ]
        encaminhamentos.append(saida)

    dados.encaminhamentos = encaminhamentos
    dados.encaminhamento_atual = next(
        (e for e in encaminhamentos if e.status in {"AGUARDANDO", "EM_EXECUCAO", "AGUARDANDO_COMPLEMENTO"}),
        None,
    )

    medicoes: list[MedicaoOut] = []
    for medicao in sorted(pedido.medicoes, key=lambda m: m.numero):
        saida = _medicao_out(medicao)
        if saida.responsavel is None and medicao.responsavel_id:
            user = usuarios_por_id.get(str(medicao.responsavel_id))
            saida.responsavel = _usuario_resumo(user)
        medicoes.append(saida)
    dados.medicoes = medicoes

    dados.anexos = [
        _anexo_out(a, versoes) for a in anexos_validos if a.medicao_id is None
    ]
    dados.andamentos = [
        AndamentoOut.model_validate(a)
        for a in sorted(pedido.andamentos, key=lambda x: x.created_at)
    ]
    return dados
