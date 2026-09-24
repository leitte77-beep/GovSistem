"""Regras do fluxo vai e vem. Todo o comportamento do módulo está aqui.

Não há mais trilha de fases. O pedido está com o Assessor ou com um setor.
O Assessor é o único que encaminha; o setor assume, executa e devolve. Um
pedido parado não é uma fase: é uma passagem — um `Encaminhamento`.

Nenhuma rota escreve no banco por conta própria: quem quiser mudar o fluxo
mexe aqui, em `fluxo.py` e em mais lugar nenhum.
"""

import uuid
from datetime import date, datetime, timedelta, timezone
from decimal import Decimal
from enum import Enum

from fastapi import HTTPException, status
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core import fluxo
from app.models.auth_models import User
from app.models.pedido import (
    Andamento,
    Encaminhamento,
    ROTULO_MOTIVO_PARADA,
    Medicao,
    MotivoParada,
    Pedido,
    Prioridade,
    SituacaoPedido,
    StatusEncaminhamento,
    TipoAndamento,
)
from app.services import notificacoes as notif
from app.services import setores as setor_service

ATIVOS = {
    StatusEncaminhamento.AGUARDANDO.value,
    StatusEncaminhamento.EM_EXECUCAO.value,
    StatusEncaminhamento.AGUARDANDO_COMPLEMENTO.value,
}


def _hoje() -> date:
    return datetime.now(timezone.utc).date()


def _prazo(dias: int) -> date:
    return _hoje() + timedelta(days=dias)


async def _proximo_numero(
    db: AsyncSession, organization_id: uuid.UUID
) -> tuple[str, int, int]:
    """Numeração 2026/000001, por organização e exercício."""
    exercicio = _hoje().year
    result = await db.execute(
        select(func.coalesce(func.max(Pedido.sequencial), 0)).where(
            Pedido.organization_id == organization_id,
            Pedido.exercicio == exercicio,
        )
    )
    sequencial = int(result.scalar_one()) + 1
    return f"{exercicio}/{sequencial:06d}", exercicio, sequencial


def registrar(
    db: AsyncSession,
    pedido: Pedido,
    tipo: TipoAndamento,
    autor: User | None,
    texto: str | None = None,
    encaminhamento: Encaminhamento | None = None,
    dados: dict | None = None,
) -> Andamento:
    """Grava um evento na linha do tempo. Único ponto que escreve nela."""
    agora = datetime.now(timezone.utc)
    andamento = Andamento(
        pedido_id=pedido.id,
        encaminhamento_id=encaminhamento.id if encaminhamento else None,
        tipo=tipo.value,
        texto=texto,
        autor_id=autor.id if autor else None,
        autor_nome=autor.name if autor else "Sistema",
        created_at=agora,
        dados=dados,
    )
    db.add(andamento)
    pedido.ultima_movimentacao_em = agora
    return andamento


async def abrir_pedido(
    db: AsyncSession,
    *,
    autor: User,
    titulo: str,
    tipo: str,
    descricao: str | None = None,
    origem: str,
    origem_nome: str | None = None,
    valor_previsto=None,
    prioridade: str = Prioridade.NORMAL.value,
    emenda: str | None = None,
    partido: str | None = None,
    endereco: str | None = None,
) -> Pedido:
    """Cria o pedido na mesa do Assessor. Sem trilha, sem fase futura."""
    numero, exercicio, sequencial = await _proximo_numero(db, autor.organization_id)
    pedido = Pedido(
        organization_id=autor.organization_id,
        numero=numero,
        exercicio=exercicio,
        sequencial=sequencial,
        titulo=titulo.strip(),
        descricao=descricao,
        tipo=fluxo.tipo_valido(tipo),
        origem=origem,
        origem_nome=origem_nome,
        valor_previsto=valor_previsto,
        prioridade=prioridade,
        emenda=(emenda or "").strip() or None,
        partido=(partido or "").strip() or None,
        endereco=(endereco or "").strip() or None,
        situacao=SituacaoPedido.COM_ASSESSOR.value,
        criado_por_id=autor.id,
    )
    db.add(pedido)
    await db.flush()
    registrar(db, pedido, TipoAndamento.ABERTURA, autor, f"Pedido {numero} aberto.")
    await db.flush()
    return pedido


ROTULO_CAMPO_EDITADO = {
    "titulo": "título",
    "descricao": "descrição",
    "origem": "origem",
    "origem_nome": "quem conseguiu",
    "valor_previsto": "valor previsto",
    "valor_liberado": "valor liberado",
    "valor_pago": "valor pago",
    "prioridade": "prioridade",
    "protocolo_externo": "protocolo",
    "protocolo_sistema": "protocolo no sistema",
    "protocolo_orgao": "órgão do protocolo",
    "protocolo_data": "data do protocolo",
    "emenda": "emenda",
    "partido": "partido",
    "endereco": "endereço",
    "latitude": "latitude",
    "longitude": "longitude",
    "valor_empenhado": "valor empenhado",
    "protocolo_situacao": "situação no governo",
}


def _texto_de(valor, campo: str = "valor") -> str | None:
    """Valor legível para o antes/depois do histórico."""
    if valor is None or valor == "":
        return None
    if isinstance(valor, Decimal) and not campo.startswith("valor"):
        return str(valor)
    if isinstance(valor, Decimal):
        return f"R$ {valor:,.2f}".replace(",", "X").replace(".", ",").replace("X", ".")
    if isinstance(valor, date):
        return valor.strftime("%d/%m/%Y")
    return str(valor)[:200]


async def editar(
    db: AsyncSession,
    pedido: Pedido,
    *,
    autor: User,
    dados: dict,
) -> Pedido:
    """Altera o descritivo do pedido. Toda edição entra no histórico.

    Só os campos realmente alterados são registrados, para a linha do tempo
    dizer o que mudou — não que "algo" mudou.
    """
    alterados: list[str] = []
    mudancas: dict[str, list] = {}
    for campo, valor in dados.items():
        if isinstance(valor, Enum):
            valor = valor.value
        antes = getattr(pedido, campo)
        if antes == valor:
            continue
        setattr(pedido, campo, valor)
        rotulo = ROTULO_CAMPO_EDITADO.get(campo, campo)
        alterados.append(rotulo)
        mudancas[rotulo] = [_texto_de(antes, campo), _texto_de(valor, campo)]

    if not alterados:
        return pedido

    registrar(
        db,
        pedido,
        TipoAndamento.EDICAO,
        autor,
        "Editou: " + ", ".join(sorted(alterados)) + ".",
        dados={"mudancas": mudancas},
    )
    await db.flush()
    return pedido


def encaminhamento_aberto(pedido: Pedido) -> Encaminhamento | None:
    """A passagem ainda em curso. Um pedido tem no máximo uma."""
    for enc in pedido.encaminhamentos:
        if enc.status in ATIVOS:
            return enc
    return None


def localizar(pedido: Pedido, encaminhamento_id: uuid.UUID) -> Encaminhamento:
    for enc in pedido.encaminhamentos:
        if enc.id == encaminhamento_id:
            return enc
    raise HTTPException(
        status_code=status.HTTP_404_NOT_FOUND,
        detail="Encaminhamento não encontrado neste pedido.",
    )


def _exige_do_setor(user: User, enc: Encaminhamento) -> None:
    if (user.setor or "").upper() != (enc.setor or "").upper():
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Esta tarefa não é do seu setor.",
        )


def _exige_dono_ou_participante(user: User, enc: Encaminhamento) -> None:
    ids = {str(x) for x in (enc.participantes or [])}
    if enc.responsavel_id != user.id and str(user.id) not in ids:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Só o responsável ou quem foi mencionado pode agir nesta tarefa.",
        )


def _encerrado(pedido: Pedido) -> bool:
    return pedido.situacao in {
        SituacaoPedido.CONCLUIDO.value,
        SituacaoPedido.CANCELADO.value,
    }


async def encaminhar(
    db: AsyncSession,
    pedido: Pedido,
    *,
    autor: User,
    setor: str,
    assunto: str,
    instrucoes: str | None = None,
    prazo: date | None = None,
    responsavel_id: uuid.UUID | None = None,
    checklist: list[str] | None = None,
) -> Pedido:
    """O Assessor manda o pedido a um setor. Só ele encaminha."""
    if _encerrado(pedido):
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT, detail="Pedido encerrado não anda."
        )
    if pedido.situacao != SituacaoPedido.COM_ASSESSOR.value:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="O pedido não está com o Assessor: receba-o de volta antes de reencaminhar.",
        )
    if localizar_aberto := encaminhamento_aberto(pedido):
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"Já existe uma tarefa aberta em “{localizar_aberto.setor}”.",
        )
    if not assunto or not assunto.strip():
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Descreva o que o setor precisa fazer.",
        )

    setor = setor.strip().upper()
    destino = await setor_service.exigir_ativo(db, pedido.organization_id, setor)

    proxima_ordem = max((e.ordem for e in pedido.encaminhamentos), default=0) + 1
    prazo_sugerido = prazo is None
    data_prazo = prazo or (
        _hoje() + timedelta(days=destino.prazo_dias)
        if destino.prazo_dias
        else fluxo.sugerir_prazo(setor, _hoje())
    )

    enc = Encaminhamento(
        pedido_id=pedido.id,
        ordem=proxima_ordem,
        setor=setor,
        assunto=assunto.strip(),
        instrucoes=instrucoes,
        status=(
            StatusEncaminhamento.EM_EXECUCAO.value
            if responsavel_id
            else StatusEncaminhamento.AGUARDANDO.value
        ),
        responsavel_id=responsavel_id,
        prazo=data_prazo,
        prazo_sugerido=prazo_sugerido,
        criado_por_id=autor.id,
        assumido_em=datetime.now(timezone.utc) if responsavel_id else None,
        checklist=[
            {"item": i.strip()[:200], "feito": False}
            for i in (checklist or [])
            if i and i.strip()
        ][:30],
    )
    db.add(enc)
    pedido.encaminhamentos.append(enc)

    pedido.situacao = SituacaoPedido.EM_SETOR.value
    pedido.setor_atual = setor
    pedido.responsavel_atual_id = responsavel_id
    pedido.prazo_atual = data_prazo
    pedido.complemento_pendente = False

    registrar(
        db,
        pedido,
        TipoAndamento.ENCAMINHAMENTO,
        autor,
        f"Encaminhado a {destino.nome} — {assunto.strip()}.",
        enc,
    )
    # Tarefa sem dono chega ao responsável pelo setor.
    if not responsavel_id and destino.responsavel_id and destino.responsavel_id != autor.id:
        dono = await db.get(User, destino.responsavel_id)
        if dono is not None and dono.ativo_govtask:
            notif.criar(
                db,
                destinatarios=[dono],
                tipo=notif.TipoNotificacao.TAREFA_RECEBIDA,
                texto=f"Chegou ao {destino.nome}: “{assunto.strip()}” ({pedido.numero}).",
                pedido=pedido,
                encaminhamento=enc,
                autor_nome=autor.name,
            )
    await db.flush()
    return pedido


async def assumir(
    db: AsyncSession, pedido: Pedido, enc: Encaminhamento, *, autor: User
) -> Pedido:
    """Um engenheiro assume a tarefa da fila do setor. Some para os demais."""
    _exige_do_setor(autor, enc)
    if enc.status not in {
        StatusEncaminhamento.AGUARDANDO.value,
        StatusEncaminhamento.AGUARDANDO_COMPLEMENTO.value,
    }:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT, detail="Esta tarefa já tem responsável."
        )

    enc.status = StatusEncaminhamento.EM_EXECUCAO.value
    enc.responsavel_id = autor.id
    enc.assumido_em = datetime.now(timezone.utc)
    pedido.responsavel_atual_id = autor.id

    registrar(db, pedido, TipoAndamento.ASSUNCAO, autor, "Assumiu a tarefa.", enc)
    await notif.para_assessor(
        db,
        pedido=pedido,
        encaminhamento=enc,
        tipo=notif.TipoNotificacao.PEDIDO_ASSUMIDO,
        texto=f"{autor.name} assumiu “{pedido.titulo}” em {enc.setor}.",
        autor=autor,
    )
    await db.flush()
    return pedido


async def transferir(
    db: AsyncSession,
    pedido: Pedido,
    enc: Encaminhamento,
    *,
    autor: User,
    novo_responsavel_id: uuid.UUID,
    motivo: str | None = None,
) -> Pedido:
    """Passa a tarefa para outro engenheiro do mesmo setor e avisa o Assessor."""
    _exige_dono_ou_participante(autor, enc)
    if enc.status != StatusEncaminhamento.EM_EXECUCAO.value:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Só uma tarefa em execução pode ser transferida.",
        )

    destino = await db.scalar(
        select(User).where(
            User.id == novo_responsavel_id,
            User.organization_id == pedido.organization_id,
            User.deleted_at.is_(None),
        )
    )
    if destino is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Usuário não encontrado."
        )
    if (destino.setor or "").upper() != (enc.setor or "").upper():
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Escolha alguém do mesmo setor da tarefa.",
        )

    enc.responsavel_id = destino.id
    enc.transferencias += 1
    pedido.responsavel_atual_id = destino.id

    registrar(
        db,
        pedido,
        TipoAndamento.TRANSFERENCIA,
        autor,
        f"Transferido para {destino.name}." + (f" {motivo.strip()}" if motivo else ""),
        enc,
    )
    await notif.para_assessor(
        db,
        pedido=pedido,
        encaminhamento=enc,
        tipo=notif.TipoNotificacao.PEDIDO_TRANSFERIDO,
        texto=f"{autor.name} passou “{pedido.titulo}” para {destino.name} em {enc.setor}.",
        autor=autor,
    )
    await db.flush()
    return pedido


async def mencionar(
    db: AsyncSession,
    pedido: Pedido,
    enc: Encaminhamento,
    *,
    autor: User,
    usuarios_ids: list[uuid.UUID],
) -> Pedido:
    """Menciona engenheiros: eles veem, comentam, anexam e concluem junto."""
    _exige_dono_ou_participante(autor, enc)
    if not usuarios_ids:
        return pedido

    alvos = (
        await db.scalars(
            select(User).where(
                User.id.in_(usuarios_ids),
                User.organization_id == pedido.organization_id,
                User.deleted_at.is_(None),
            )
        )
    ).all()
    if not alvos:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Nenhum usuário válido para mencionar.",
        )

    atuais = {str(x) for x in (enc.participantes or [])}
    nomes: list[str] = []
    for alvo in alvos:
        if alvo.id == enc.responsavel_id:
            continue
        atuais.add(str(alvo.id))
        nomes.append(alvo.name)
    nova_lista = sorted(atuais)
    enc.participantes = nova_lista

    if nomes:
        registrar(
            db,
            pedido,
            TipoAndamento.MENCAO,
            autor,
            "Mencionou " + ", ".join(nomes) + ".",
            enc,
        )
        notif.criar(
            db,
            destinatarios=alvos,
            tipo=notif.TipoNotificacao.MENCAO,
            texto=f"{autor.name} mencionou você em “{pedido.titulo}”.",
            pedido=pedido,
            encaminhamento=enc,
            autor_nome=autor.name,
        )
    await db.flush()
    return pedido


async def solicitar_complemento(
    db: AsyncSession,
    pedido: Pedido,
    enc: Encaminhamento,
    *,
    autor: User,
    texto: str,
) -> Pedido:
    """O setor pede mais informação ao Assessor. O pedido volta para ele."""
    _exige_dono_ou_participante(autor, enc)
    if enc.status != StatusEncaminhamento.EM_EXECUCAO.value:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Só uma tarefa em execução pode pedir complemento.",
        )
    if not texto or not texto.strip():
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Diga o que falta de informação.",
        )

    enc.status = StatusEncaminhamento.AGUARDANDO_COMPLEMENTO.value
    enc.complemento_pedido = texto.strip()
    pedido.situacao = SituacaoPedido.COM_ASSESSOR.value
    pedido.setor_atual = None
    pedido.responsavel_atual_id = None
    pedido.prazo_atual = None
    pedido.complemento_pendente = True

    registrar(
        db,
        pedido,
        TipoAndamento.COMPLEMENTO_SOLICITADO,
        autor,
        f"Solicitou complemento: {texto.strip()}",
        enc,
    )
    await notif.para_assessor(
        db,
        pedido=pedido,
        encaminhamento=enc,
        tipo=notif.TipoNotificacao.COMPLEMENTO_SOLICITADO,
        texto=f"{autor.name} pediu mais informação em “{pedido.titulo}”.",
        autor=autor,
    )
    await db.flush()
    return pedido


async def responder_complemento(
    db: AsyncSession,
    pedido: Pedido,
    enc: Encaminhamento,
    *,
    autor: User,
    texto: str,
) -> Pedido:
    """O Assessor responde e a tarefa volta para o mesmo engenheiro."""
    if enc.status != StatusEncaminhamento.AGUARDANDO_COMPLEMENTO.value:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Não há complemento pendente neste encaminhamento.",
        )
    if not texto or not texto.strip():
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Escreva a resposta.",
        )

    enc.complemento_resposta = texto.strip()
    enc.status = (
        StatusEncaminhamento.EM_EXECUCAO.value
        if enc.responsavel_id
        else StatusEncaminhamento.AGUARDANDO.value
    )
    pedido.complemento_pendente = False
    pedido.situacao = SituacaoPedido.EM_SETOR.value
    pedido.setor_atual = enc.setor
    pedido.responsavel_atual_id = enc.responsavel_id
    pedido.prazo_atual = enc.prazo

    registrar(
        db,
        pedido,
        TipoAndamento.COMPLEMENTO_RESPONDIDO,
        autor,
        f"Respondeu ao setor: {texto.strip()}",
        enc,
    )
    await db.flush()
    return pedido


async def negociar_prazo(
    db: AsyncSession,
    pedido: Pedido,
    enc: Encaminhamento,
    *,
    autor: User,
    prazo: date,
    motivo: str | None = None,
) -> Pedido:
    """O responsável negocia o prazo da própria tarefa. O Assessor é avisado."""
    _exige_dono_ou_participante(autor, enc)
    if enc.status != StatusEncaminhamento.EM_EXECUCAO.value:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Só uma tarefa em execução pode ter o prazo alterado.",
        )

    anterior = enc.prazo
    enc.prazo = prazo
    enc.prazo_sugerido = False
    pedido.prazo_atual = prazo

    registrar(
        db,
        pedido,
        TipoAndamento.PRAZO,
        autor,
        f"Prazo alterado para {prazo.strftime('%d/%m/%Y')}."
        + (f" {motivo.strip()}" if motivo else ""),
        enc,
        dados={"mudancas": {"prazo": [_texto_de(anterior), _texto_de(prazo)]}},
    )
    await notif.para_assessor(
        db,
        pedido=pedido,
        encaminhamento=enc,
        tipo=notif.TipoNotificacao.PRAZO_ALTERADO,
        texto=f"{autor.name} alterou o prazo de “{pedido.titulo}” para {prazo.strftime('%d/%m/%Y')}.",
        autor=autor,
    )
    await db.flush()
    return pedido


async def registrar_medicao(
    db: AsyncSession,
    pedido: Pedido,
    enc: Encaminhamento | None,
    *,
    autor: User,
    periodo_inicio: date | None = None,
    periodo_fim: date | None = None,
    valor: Decimal | None = None,
    percentual_executado: Decimal | None = None,
    observacao: str | None = None,
) -> Medicao:
    """Registra a medição de obra. As fotos entram como anexos da medição."""
    if pedido.tipo != fluxo.TipoPedido.OBRA.value:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Medição só se aplica a pedidos de obra.",
        )
    if enc is not None:
        _exige_dono_ou_participante(autor, enc)

    proximo = int(
        await db.scalar(
            select(func.coalesce(func.max(Medicao.numero), 0)).where(
                Medicao.pedido_id == pedido.id
            )
        )
        or 0
    ) + 1

    medicao = Medicao(
        pedido_id=pedido.id,
        encaminhamento_id=enc.id if enc else None,
        numero=proximo,
        periodo_inicio=periodo_inicio,
        periodo_fim=periodo_fim,
        valor=valor,
        percentual_executado=percentual_executado,
        responsavel_id=autor.id,
        observacao=observacao,
    )
    db.add(medicao)
    await db.flush()

    registrar(
        db,
        pedido,
        TipoAndamento.MEDICAO,
        autor,
        f"Medição {proximo} registrada"
        + (f" ({percentual_executado}%)." if percentual_executado is not None else "."),
        enc,
    )
    await db.flush()
    return medicao


async def devolver(
    db: AsyncSession,
    pedido: Pedido,
    enc: Encaminhamento,
    *,
    autor: User,
    resultado: str,
) -> Pedido:
    """Conclui a tarefa no setor e devolve ao Assessor, com o parecer."""
    _exige_dono_ou_participante(autor, enc)
    if enc.status not in {
        StatusEncaminhamento.EM_EXECUCAO.value,
        StatusEncaminhamento.AGUARDANDO.value,
    }:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Esta tarefa não está em execução.",
        )
    resultado = (resultado or "").strip() or (enc.rascunho or "").strip()
    if len(resultado) < 3:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Descreva o que foi feito antes de devolver.",
        )

    enc.rascunho = None
    enc.status = StatusEncaminhamento.CONCLUIDO.value
    enc.devolvido_em = datetime.now(timezone.utc)
    enc.resultado = resultado.strip()

    pedido.situacao = SituacaoPedido.COM_ASSESSOR.value
    pedido.setor_atual = None
    pedido.responsavel_atual_id = None
    pedido.prazo_atual = None
    pedido.complemento_pendente = False

    registrar(
        db,
        pedido,
        TipoAndamento.DEVOLUCAO,
        autor,
        f"Devolvido ao Assessor: {resultado.strip()}",
        enc,
    )
    await notif.para_assessor(
        db,
        pedido=pedido,
        encaminhamento=enc,
        tipo=notif.TipoNotificacao.PEDIDO_DEVOLVIDO,
        texto=f"{autor.name} devolveu “{pedido.titulo}”: {resultado[:120]}",
        autor=autor,
    )
    await db.flush()
    return pedido


async def aguardar_terceiro(
    db: AsyncSession, pedido: Pedido, *, autor: User, texto: str | None = None
) -> Pedido:
    """O Assessor estaciona o pedido esperando um órgão externo."""
    if pedido.situacao != SituacaoPedido.COM_ASSESSOR.value:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="O pedido precisa estar com o Assessor.",
        )
    pedido.situacao = SituacaoPedido.AGUARDANDO_TERCEIRO.value
    # Depois da troca de situação, que zera o motivo anterior.
    pedido.motivo_parada = MotivoParada.GOVERNO.value
    pedido.motivo_parada_texto = (texto or "").strip() or None
    pedido.motivo_parada_em = datetime.now(timezone.utc)
    registrar(
        db,
        pedido,
        TipoAndamento.TERCEIRO,
        autor,
        texto or "Aguardando retorno de terceiro.",
    )
    await db.flush()
    return pedido


async def retomar(
    db: AsyncSession, pedido: Pedido, *, autor: User, texto: str | None = None
) -> Pedido:
    """Tira o pedido da espera externa e o devolve à mesa do Assessor."""
    if pedido.situacao != SituacaoPedido.AGUARDANDO_TERCEIRO.value:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="O pedido não está aguardando terceiro.",
        )
    pedido.situacao = SituacaoPedido.COM_ASSESSOR.value
    registrar(
        db, pedido, TipoAndamento.TERCEIRO, autor, texto or "Retomado o andamento."
    )
    await db.flush()
    return pedido


async def concluir(
    db: AsyncSession, pedido: Pedido, *, autor: User, observacao: str | None = None
) -> Pedido:
    if pedido.situacao != SituacaoPedido.COM_ASSESSOR.value:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Só o Assessor conclui, e o pedido precisa estar com ele.",
        )
    agora = datetime.now(timezone.utc)
    pedido.situacao = SituacaoPedido.CONCLUIDO.value
    pedido.concluido_em = agora
    pedido.responsavel_atual_id = None
    pedido.prazo_atual = None
    pedido.setor_atual = None
    registrar(db, pedido, TipoAndamento.CONCLUSAO, autor, observacao or "Pedido concluído.")
    await db.flush()
    return pedido


async def cancelar(
    db: AsyncSession, pedido: Pedido, *, autor: User, motivo: str
) -> Pedido:
    if not motivo or not motivo.strip():
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Informe o motivo do cancelamento.",
        )
    pedido.situacao = SituacaoPedido.CANCELADO.value
    pedido.motivo_cancelamento = motivo.strip()
    pedido.responsavel_atual_id = None
    pedido.prazo_atual = None
    pedido.setor_atual = None
    registrar(db, pedido, TipoAndamento.CANCELAMENTO, autor, motivo.strip())
    await db.flush()
    return pedido


async def comentar(
    db: AsyncSession,
    pedido: Pedido,
    *,
    autor: User,
    texto: str,
    encaminhamento: Encaminhamento | None = None,
    mencionados: list[User] | None = None,
    aguardando_resposta: bool = False,
) -> Andamento:
    """Mensagem na conversa da tarefa (ou do pedido, sem tarefa aberta).

    Menção avisa a pessoa no sino. `aguardando_resposta` destaca a mensagem
    como pergunta até alguém responder na mesma conversa.
    """
    enc = encaminhamento or encaminhamento_aberto(pedido)
    mencionados = [u for u in (mencionados or []) if u.id != autor.id]
    dados: dict = {}
    if mencionados:
        dados["mencionados"] = [{"id": str(u.id), "nome": u.name} for u in mencionados]
    if aguardando_resposta:
        dados["aguardando_resposta"] = True
    andamento = registrar(
        db, pedido, TipoAndamento.COMENTARIO, autor, texto.strip(), enc, dados or None
    )
    if mencionados:
        notif.criar(
            db,
            destinatarios=mencionados,
            tipo=notif.TipoNotificacao.MENCAO,
            texto=f"{autor.name} mencionou você em “{pedido.titulo}”: {texto.strip()[:120]}",
            pedido=pedido,
            encaminhamento=enc,
            autor_nome=autor.name,
        )
    elif autor is not None:
        # Mensagem do setor chega ao Assessor; do Assessor, ao responsável.
        if enc is not None and enc.responsavel_id and enc.responsavel_id != autor.id:
            dono = await db.get(User, enc.responsavel_id)
            if dono is not None:
                notif.criar(
                    db,
                    destinatarios=[dono],
                    tipo=notif.TipoNotificacao.MENCAO,
                    texto=f"{autor.name} escreveu em “{pedido.titulo}”: {texto.strip()[:120]}",
                    pedido=pedido,
                    encaminhamento=enc,
                    autor_nome=autor.name,
                )
        if enc is not None and enc.responsavel_id == autor.id:
            await notif.para_assessor(
                db,
                pedido=pedido,
                encaminhamento=enc,
                tipo=notif.TipoNotificacao.MENCAO,
                texto=f"{autor.name} escreveu em “{pedido.titulo}”: {texto.strip()[:120]}",
                autor=autor,
            )
    await db.flush()
    return andamento


async def salvar_rascunho(
    db: AsyncSession,
    pedido: Pedido,
    enc: Encaminhamento,
    *,
    autor: User,
    texto: str | None,
    checklist: list[dict] | None,
) -> Pedido:
    """Guarda a resposta em construção e o que já foi entregue.

    Não vai para o histórico (seria um evento por tecla); o histórico registra
    a devolução, que leva o texto final.
    """
    _exige_dono_ou_participante(autor, enc)
    if enc.status not in ATIVOS:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT, detail="Esta tarefa já foi encerrada."
        )
    if texto is not None:
        enc.rascunho = texto
        enc.rascunho_em = datetime.now(timezone.utc)
    if checklist is not None:
        atuais = {c.get("item"): c for c in (enc.checklist or [])}
        novo = []
        for c in checklist[:30]:
            item = str(c.get("item", "")).strip()[:200]
            if not item:
                continue
            novo.append({"item": item, "feito": bool(c.get("feito"))})
        # Só o Assessor cria itens; o setor marca os que já existem.
        if set(i["item"] for i in novo) - set(atuais):
            novo = [i for i in novo if i["item"] in atuais]
        enc.checklist = novo
    await db.flush()
    return pedido


async def definir_parada(
    db: AsyncSession,
    pedido: Pedido,
    *,
    autor: User,
    motivo: str | None,
    texto: str | None = None,
) -> Pedido:
    """Registra (ou limpa, com `motivo=None`) por que o pedido está parado.

    Não mexe no relógio: o pedido continua parado desde quando parou. O motivo
    some sozinho quando o pedido muda de mão (listener do modelo).
    """
    if _encerrado(pedido):
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Pedido encerrado não tem parada.",
        )
    texto = (texto or "").strip() or None
    if motivo is None:
        if pedido.motivo_parada is None:
            return pedido
        pedido.motivo_parada = None
        pedido.motivo_parada_texto = None
        pedido.motivo_parada_em = None
        registrar(db, pedido, TipoAndamento.PARADA, autor, "Retirou o motivo de parada.")
        await db.flush()
        return pedido

    motivo = MotivoParada(motivo).value
    pedido.motivo_parada = motivo
    pedido.motivo_parada_texto = texto
    pedido.motivo_parada_em = datetime.now(timezone.utc)
    rotulo = ROTULO_MOTIVO_PARADA[motivo]
    registrar(
        db,
        pedido,
        TipoAndamento.PARADA,
        autor,
        f"Parado: {rotulo}." + (f" {texto}" if texto else ""),
        encaminhamento_aberto(pedido),
    )
    await db.flush()
    return pedido
