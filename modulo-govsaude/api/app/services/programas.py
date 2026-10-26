"""Motor genérico de programas, linhas de cuidado e busca ativa (Fase 6).

Requisitos atendidos: B.2-001…015. Regras de elegibilidade, itens, periodicidade
e formulários são dados versionados do tenant. Os seeds nacionais são marcados
``SEED_A_VALIDAR`` e não substituem o protocolo oficial.
"""

from __future__ import annotations

import math
import uuid
from datetime import date, datetime, timedelta, timezone

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.core.br_validators import mascarar_cns, mascarar_cpf
from app.core.encryption import descriptografar
from app.core.errors import Conflict, NotFound, Unprocessable
from app.core.permissoes import Permissao
from app.models.cidadao import Cidadao, CidadaoCondicao
from app.models.enums import (
    AcaoAuditoria,
    MotivoBuscaAtiva,
    SituacaoBuscaAtiva,
    SituacaoInscricaoPrograma,
    SituacaoProgramacao,
)
from app.models.nucleo import FormularioDinamico, Usuario
from app.models.programa import (
    Programa,
    ProgramaBuscaAtiva,
    ProgramaInscricao,
    ProgramaItem,
    ProgramaProgramacao,
)
from app.motores.formularios import validar_resposta
from app.schemas.programa import (
    BuscaAtivaCreate,
    BuscaAtivaUpdate,
    CriteriosElegibilidade,
    DemandaFuturaOut,
    DemandaItemOut,
    GerarProgramacoes,
    GerarProgramacoesOut,
    InscricaoCreate,
    InscricaoEncerrar,
    InscricaoUpdate,
    ListaNominalItemOut,
    ListaNominalOut,
    ProgramacaoCreate,
    ProgramacaoPerder,
    ProgramacaoRealizar,
    ProgramacaoRemarcar,
    ProgramaCreate,
    ProgramaItemCreate,
    ProgramaItemUpdate,
    ProgramaNovaVersao,
    ProgramaUpdate,
    ResumoItemOut,
    ResumoProgramaOut,
)
from app.services.auditoria import instantaneo, registrar
from app.services.paginacao import aplicar_cursor, codificar
from app.services.rede_comum import (
    conferir_versao,
    escopos_estabelecimento,
    exigir_acesso_estabelecimento,
)

SITUACOES_VIGENTES = (
    SituacaoInscricaoPrograma.ATIVA.value,
    SituacaoInscricaoPrograma.SUSPENSA.value,
)
SITUACOES_ABERTAS = (
    SituacaoProgramacao.PREVISTO.value,
    SituacaoProgramacao.REMARCADO.value,
)


# ─────────────────────────────────────────────────────────────────────────────
# Utilidades
# ─────────────────────────────────────────────────────────────────────────────
def _hoje() -> date:
    return date.today()


def _agora() -> datetime:
    return datetime.now(timezone.utc)


def _decrypt(valor: str | None) -> str | None:
    if not valor:
        return None
    try:
        return descriptografar(valor)
    except ValueError:
        return None


def _mascarados(cidadao: Cidadao) -> dict:
    return {
        "cpf_mascarado": mascarar_cpf(_decrypt(cidadao.cpf_cifrado)),
        "cns_mascarado": mascarar_cns(_decrypt(cidadao.cns_cifrado)),
    }


def _idade_anos(nascimento: date | None, referencia: date | None = None) -> int | None:
    if nascimento is None:
        return None
    ref = referencia or _hoje()
    anos = ref.year - nascimento.year
    if (ref.month, ref.day) < (nascimento.month, nascimento.day):
        anos -= 1
    return max(anos, 0)


def _idade_meses(nascimento: date | None, referencia: date | None = None) -> int | None:
    if nascimento is None:
        return None
    ref = referencia or _hoje()
    meses = (ref.year - nascimento.year) * 12 + (ref.month - nascimento.month)
    if ref.day < nascimento.day:
        meses -= 1
    return max(meses, 0)


def _pode_ver_clinico(usuario: Usuario) -> bool:
    from app.core.autorizacao import tem_permissao

    return tem_permissao(usuario, Permissao.PROGRAMA_GERENCIAR) or tem_permissao(
        usuario, Permissao.PRONTUARIO_LER
    )


def _programa_out(programa: Programa) -> Programa:
    """Garante que os itens estejam carregados (lazy selectin)."""
    return programa


def _inscricao_query():
    return select(ProgramaInscricao).options(
        selectinload(ProgramaInscricao.programa),
        selectinload(ProgramaInscricao.cidadao),
    )


def _programacao_query():
    return select(ProgramaProgramacao).options(
        selectinload(ProgramaProgramacao.item),
        selectinload(ProgramaProgramacao.inscricao).selectinload(
            ProgramaInscricao.programa
        ),
        selectinload(ProgramaProgramacao.inscricao).selectinload(
            ProgramaInscricao.cidadao
        ),
    )


def _busca_query():
    return select(ProgramaBuscaAtiva).options(
        selectinload(ProgramaBuscaAtiva.inscricao).selectinload(
            ProgramaInscricao.programa
        ),
        selectinload(ProgramaBuscaAtiva.inscricao).selectinload(
            ProgramaInscricao.cidadao
        ),
        selectinload(ProgramaBuscaAtiva.programacao),
    )


# ─────────────────────────────────────────────────────────────────────────────
# Programas e itens (B.2-001, B.2-005)
# ─────────────────────────────────────────────────────────────────────────────
async def listar_programas(
    db: AsyncSession,
    tenant_id: uuid.UUID,
    usuario: Usuario,
    *,
    codigo: str | None = None,
    tipo: str | None = None,
    linha_cuidado: str | None = None,
    ativo: bool | None = None,
    limite: int = 50,
    cursor: str | None = None,
) -> tuple[list[Programa], str | None, int]:
    limite = min(max(limite, 1), 100)
    condicoes = [Programa.tenant_id == tenant_id, Programa.baixa_em.is_(None)]
    if codigo:
        condicoes.append(Programa.codigo == codigo.strip().upper())
    if tipo:
        condicoes.append(Programa.tipo == tipo)
    if linha_cuidado:
        condicoes.append(Programa.linha_cuidado == linha_cuidado)
    if ativo is not None:
        condicoes.append(Programa.ativo.is_(ativo))
    total = await db.scalar(
        select(func.count()).select_from(Programa).where(*condicoes)
    ) or 0
    consulta = (
        select(Programa)
        .where(*condicoes)
        .order_by(Programa.created_at, Programa.id)
        .limit(limite + 1)
    )
    consulta = aplicar_cursor(consulta, Programa, cursor)
    itens = list((await db.execute(consulta)).scalars().unique().all())
    proximo = None
    if len(itens) > limite:
        ultimo = itens[limite - 1]
        itens = itens[:limite]
        proximo = codificar(ultimo.created_at, ultimo.id)
    return itens, proximo, int(total)


async def obter_programa(
    db: AsyncSession, tenant_id: uuid.UUID, programa_id: uuid.UUID
) -> Programa:
    programa = await db.scalar(
        select(Programa).where(
            Programa.id == programa_id,
            Programa.tenant_id == tenant_id,
            Programa.baixa_em.is_(None),
        )
    )
    if programa is None:
        raise NotFound("Programa não encontrado.")
    return programa


async def _validar_formulario(
    db: AsyncSession, tenant_id: uuid.UUID, formulario_id: uuid.UUID | None
) -> None:
    if formulario_id is None:
        return
    existe = await db.scalar(
        select(FormularioDinamico.id).where(
            FormularioDinamico.id == formulario_id,
            FormularioDinamico.tenant_id == tenant_id,
        )
    )
    if existe is None:
        raise NotFound("Formulário do programa não encontrado.")


async def criar_programa(
    db: AsyncSession,
    *,
    tenant_id: uuid.UUID,
    dados: ProgramaCreate,
    ator: Usuario,
    cliente: dict,
) -> Programa:
    existente = await db.scalar(
        select(Programa).where(
            Programa.tenant_id == tenant_id,
            Programa.codigo == dados.codigo,
            Programa.versao_programa == "1",
        )
    )
    if existente is not None:
        raise Conflict(
            "Já existe um programa com este código.", code="programa_duplicado"
        )
    await _validar_formulario(db, tenant_id, dados.formulario_id)
    programa = Programa(
        tenant_id=tenant_id,
        codigo=dados.codigo,
        nome=dados.nome.strip(),
        tipo=dados.tipo,
        linha_cuidado=dados.linha_cuidado,
        descricao=dados.descricao,
        criterios_elegibilidade=dados.criterios_elegibilidade.model_dump(),
        periodicidade_padrao_dias=dados.periodicidade_padrao_dias,
        formulario_id=dados.formulario_id,
        marcador_gestante=dados.marcador_gestante,
        base_normativa=dados.base_normativa,
        fonte=dados.fonte,
        origem="TENANT",
        versao_programa="1",
        ativo=True,
        vigencia_inicio=dados.vigencia_inicio or _hoje(),
        vigencia_fim=dados.vigencia_fim,
        versao=1,
        criado_por_id=ator.id,
        atualizado_por_id=ator.id,
    )
    db.add(programa)
    await db.flush()
    for item in dados.itens:
        db.add(_item_de_schema(tenant_id, programa.id, item, ator))
    await db.flush()
    await registrar(
        db,
        acao=AcaoAuditoria.CRIAR,
        usuario=ator,
        tenant_id=tenant_id,
        recurso="programa",
        recurso_id=programa.id,
        recurso_descricao=programa.codigo,
        dados_depois=instantaneo(programa),
        cliente=cliente,
    )
    await db.commit()
    return await obter_programa(db, tenant_id, programa.id)


def _item_de_schema(
    tenant_id: uuid.UUID,
    programa_id: uuid.UUID,
    dados: ProgramaItemCreate,
    ator: Usuario,
) -> ProgramaItem:
    return ProgramaItem(
        tenant_id=tenant_id,
        programa_id=programa_id,
        **dados.model_dump(),
        versao=1,
        criado_por_id=ator.id,
        atualizado_por_id=ator.id,
    )


async def atualizar_programa(
    db: AsyncSession,
    *,
    tenant_id: uuid.UUID,
    programa_id: uuid.UUID,
    dados: ProgramaUpdate,
    versao: int,
    ator: Usuario,
    cliente: dict,
) -> Programa:
    programa = await obter_programa(db, tenant_id, programa_id)
    conferir_versao(programa.versao, versao)
    await _validar_formulario(db, tenant_id, dados.formulario_id)
    antes = instantaneo(programa)
    for campo in (
        "nome",
        "tipo",
        "linha_cuidado",
        "descricao",
        "periodicidade_padrao_dias",
        "formulario_id",
        "marcador_gestante",
        "base_normativa",
        "fonte",
        "vigencia_inicio",
        "vigencia_fim",
        "ativo",
    ):
        valor = getattr(dados, campo)
        if valor is not None:
            setattr(programa, campo, valor)
    if dados.criterios_elegibilidade is not None:
        programa.criterios_elegibilidade = (
            dados.criterios_elegibilidade.model_dump()
        )
    if dados.ativo is False:
        programa.baixa_em = _agora()
    programa.versao += 1
    programa.atualizado_por_id = ator.id
    await registrar(
        db,
        acao=AcaoAuditoria.ATUALIZAR,
        usuario=ator,
        tenant_id=tenant_id,
        recurso="programa",
        recurso_id=programa.id,
        recurso_descricao=programa.codigo,
        dados_antes=antes,
        dados_depois=instantaneo(programa),
        cliente=cliente,
    )
    await db.commit()
    return await obter_programa(db, tenant_id, programa.id)


async def nova_versao_programa(
    db: AsyncSession,
    *,
    tenant_id: uuid.UUID,
    programa_id: uuid.UUID,
    dados: ProgramaNovaVersao,
    ator: Usuario,
    cliente: dict,
) -> Programa:
    atual = await obter_programa(db, tenant_id, programa_id)
    if atual.vigencia_fim is not None and atual.vigencia_fim < _hoje():
        raise Conflict("O programa já está encerrado.", code="programa_encerrado")
    existente = await db.scalar(
        select(Programa).where(
            Programa.tenant_id == tenant_id,
            Programa.codigo == atual.codigo,
            Programa.versao_programa == dados.versao_programa,
        )
    )
    if existente is not None:
        raise Conflict(
            "Já existe esta versão do programa.", code="programa_versao_duplicada"
        )
    antes = instantaneo(atual)
    atual.vigencia_fim = dados.vigencia_inicio - timedelta(days=1)
    atual.versao += 1
    atual.atualizado_por_id = ator.id
    novo = Programa(
        tenant_id=tenant_id,
        codigo=atual.codigo,
        nome=atual.nome,
        tipo=atual.tipo,
        linha_cuidado=atual.linha_cuidado,
        descricao=atual.descricao,
        criterios_elegibilidade=atual.criterios_elegibilidade,
        periodicidade_padrao_dias=atual.periodicidade_padrao_dias,
        formulario_id=atual.formulario_id,
        marcador_gestante=atual.marcador_gestante,
        base_normativa=atual.base_normativa,
        fonte=atual.fonte,
        origem=atual.origem,
        versao_programa=dados.versao_programa,
        ativo=True,
        vigencia_inicio=dados.vigencia_inicio,
        vigencia_fim=dados.vigencia_fim,
        versao=1,
        criado_por_id=ator.id,
        atualizado_por_id=ator.id,
    )
    db.add(novo)
    await db.flush()
    for item in atual.itens:
        db.add(
            ProgramaItem(
                tenant_id=tenant_id,
                programa_id=novo.id,
                tipo=item.tipo,
                codigo=item.codigo,
                descricao=item.descricao,
                periodicidade_dias=item.periodicidade_dias,
                idade_min_meses=item.idade_min_meses,
                idade_max_meses=item.idade_max_meses,
                sexo=item.sexo,
                gestante=item.gestante,
                obrigatorio=item.obrigatorio,
                quantidade=item.quantidade,
                unidade=item.unidade,
                ordem=item.ordem,
                observacoes=item.observacoes,
                ativo=item.ativo,
                versao=1,
                criado_por_id=ator.id,
                atualizado_por_id=ator.id,
            )
        )
    await db.flush()
    await registrar(
        db,
        acao=AcaoAuditoria.ATUALIZAR,
        usuario=ator,
        tenant_id=tenant_id,
        recurso="programa",
        recurso_id=novo.id,
        recurso_descricao=f"{novo.codigo} v{novo.versao_programa}",
        dados_antes=antes,
        dados_depois=instantaneo(novo),
        justificativa=dados.justificativa,
        cliente=cliente,
    )
    await db.commit()
    return await obter_programa(db, tenant_id, novo.id)


async def criar_item(
    db: AsyncSession,
    *,
    tenant_id: uuid.UUID,
    programa_id: uuid.UUID,
    dados: ProgramaItemCreate,
    ator: Usuario,
    cliente: dict,
) -> ProgramaItem:
    programa = await obter_programa(db, tenant_id, programa_id)
    item = _item_de_schema(tenant_id, programa.id, dados, ator)
    db.add(item)
    await db.flush()
    await registrar(
        db,
        acao=AcaoAuditoria.CRIAR,
        usuario=ator,
        tenant_id=tenant_id,
        recurso="programa_item",
        recurso_id=item.id,
        recurso_descricao=item.descricao,
        dados_depois=instantaneo(item),
        cliente=cliente,
    )
    await db.commit()
    return item


async def atualizar_item(
    db: AsyncSession,
    *,
    tenant_id: uuid.UUID,
    programa_id: uuid.UUID,
    item_id: uuid.UUID,
    dados: ProgramaItemUpdate,
    ator: Usuario,
    cliente: dict,
) -> ProgramaItem:
    item = await db.scalar(
        select(ProgramaItem).where(
            ProgramaItem.id == item_id,
            ProgramaItem.programa_id == programa_id,
            ProgramaItem.tenant_id == tenant_id,
        )
    )
    if item is None:
        raise NotFound("Item do programa não encontrado.")
    antes = instantaneo(item)
    for campo in (
        "tipo",
        "codigo",
        "descricao",
        "periodicidade_dias",
        "idade_min_meses",
        "idade_max_meses",
        "sexo",
        "gestante",
        "obrigatorio",
        "quantidade",
        "unidade",
        "ordem",
        "observacoes",
        "ativo",
    ):
        valor = getattr(dados, campo)
        if valor is not None:
            setattr(item, campo, valor)
    if dados.ativo is False:
        item.baixa_em = _agora()
    item.versao += 1
    item.atualizado_por_id = ator.id
    await registrar(
        db,
        acao=AcaoAuditoria.ATUALIZAR,
        usuario=ator,
        tenant_id=tenant_id,
        recurso="programa_item",
        recurso_id=item.id,
        recurso_descricao=item.descricao,
        dados_antes=antes,
        dados_depois=instantaneo(item),
        cliente=cliente,
    )
    await db.commit()
    return item


async def listar_itens(
    db: AsyncSession, tenant_id: uuid.UUID, programa_id: uuid.UUID
) -> list[ProgramaItem]:
    await obter_programa(db, tenant_id, programa_id)
    return list(
        (
            await db.execute(
                select(ProgramaItem)
                .where(
                    ProgramaItem.tenant_id == tenant_id,
                    ProgramaItem.programa_id == programa_id,
                    ProgramaItem.baixa_em.is_(None),
                )
                .order_by(ProgramaItem.ordem, ProgramaItem.created_at)
            )
        )
        .scalars()
        .all()
    )


# ─────────────────────────────────────────────────────────────────────────────
# Elegibilidade (B.2-002)
# ─────────────────────────────────────────────────────────────────────────────
async def avaliar_elegibilidade(
    db: AsyncSession,
    tenant_id: uuid.UUID,
    programa: Programa,
    cidadao: Cidadao,
    *,
    gestante: bool | None = None,
) -> tuple[bool, list[str]]:
    criterios = CriteriosElegibilidade(**(programa.criterios_elegibilidade or {}))
    motivos: list[str] = []
    idade = _idade_anos(cidadao.data_nascimento)
    if criterios.sexos and cidadao.sexo not in criterios.sexos:
        motivos.append(
            f"Sexo incompatível com o programa (esperado: {', '.join(criterios.sexos)})."
        )
    if criterios.idade_min_anos is not None:
        if idade is None:
            motivos.append("Data de nascimento não informada para avaliar a idade.")
        elif idade < criterios.idade_min_anos:
            motivos.append(f"Idade mínima do programa: {criterios.idade_min_anos} anos.")
    if criterios.idade_max_anos is not None:
        if idade is None:
            if "Data de nascimento não informada para avaliar a idade." not in motivos:
                motivos.append("Data de nascimento não informada para avaliar a idade.")
        elif idade > criterios.idade_max_anos:
            motivos.append(f"Idade máxima do programa: {criterios.idade_max_anos} anos.")
    gestante_avaliada = gestante
    if gestante_avaliada is None and criterios.gestante is not None:
        gestante_avaliada = await _gestante_por_inscricao(db, tenant_id, cidadao.id)
    if criterios.gestante is not None and gestante_avaliada != criterios.gestante:
        if criterios.gestante:
            motivos.append("Programa exige gestante.")
        else:
            motivos.append("Programa não se aplica a gestante.")
    if criterios.condicoes:
        ativas = await _condicoes_ativas(db, tenant_id, cidadao.id)
        encontradas = {
            (item.tipo_codigo, item.codigo) for item in ativas
        }
        compativeis = {
            (condicao.tipo_codigo, condicao.codigo) for condicao in criterios.condicoes
        }
        if not (encontradas & compativeis) and criterios.exigir_condicao:
            motivos.append(
                "Nenhuma condição/DIAG do programa está registrada como ativa para o cidadão."
            )
    return (not motivos, motivos)


async def _condicoes_ativas(
    db: AsyncSession, tenant_id: uuid.UUID, cidadao_id: uuid.UUID
) -> list[CidadaoCondicao]:
    return list(
        (
            await db.execute(
                select(CidadaoCondicao).where(
                    CidadaoCondicao.tenant_id == tenant_id,
                    CidadaoCondicao.cidadao_id == cidadao_id,
                    CidadaoCondicao.situacao == "ATIVA",
                    CidadaoCondicao.baixa_em.is_(None),
                )
            )
        )
        .scalars()
        .all()
    )


async def _gestante_por_inscricao(
    db: AsyncSession, tenant_id: uuid.UUID, cidadao_id: uuid.UUID
) -> bool | None:
    resultado = await db.scalar(
        select(ProgramaInscricao.gestante)
        .join(Programa, Programa.id == ProgramaInscricao.programa_id)
        .where(
            ProgramaInscricao.tenant_id == tenant_id,
            ProgramaInscricao.cidadao_id == cidadao_id,
            ProgramaInscricao.situacao.in_(SITUACOES_VIGENTES),
            Programa.marcador_gestante.is_(True),
        )
        .order_by(ProgramaInscricao.data_entrada.desc())
        .limit(1)
    )
    return resultado


# ─────────────────────────────────────────────────────────────────────────────
# Inscrições (B.2-002, B.2-003)
# ─────────────────────────────────────────────────────────────────────────────
async def _cidadao_ativo(
    db: AsyncSession, tenant_id: uuid.UUID, cidadao_id: uuid.UUID
) -> Cidadao:
    cidadao = await db.scalar(
        select(Cidadao).where(
            Cidadao.id == cidadao_id,
            Cidadao.tenant_id == tenant_id,
            Cidadao.baixa_em.is_(None),
            Cidadao.unificado_para_id.is_(None),
        )
    )
    if cidadao is None:
        raise NotFound("Cidadão não encontrado ou inativo.")
    return cidadao


async def _validar_dados_clinicos(
    db: AsyncSession, tenant_id: uuid.UUID, programa: Programa, dados: dict | None
) -> None:
    if dados is None:
        return
    if programa.formulario_id is None:
        return
    formulario = await db.scalar(
        select(FormularioDinamico).where(
            FormularioDinamico.id == programa.formulario_id,
            FormularioDinamico.tenant_id == tenant_id,
        )
    )
    if formulario is None:
        raise NotFound("Formulário do programa não encontrado.")
    erros = validar_resposta(formulario.schema_json, dados)
    if erros:
        raise Unprocessable(
            "Os dados clínicos não correspondem ao formulário do programa.",
            code="dados_clinicos_invalidos",
            errors=erros,
        )


async def obter_inscricao(
    db: AsyncSession, tenant_id: uuid.UUID, inscricao_id: uuid.UUID
) -> ProgramaInscricao:
    inscricao = await db.scalar(
        _inscricao_query().where(
            ProgramaInscricao.id == inscricao_id,
            ProgramaInscricao.tenant_id == tenant_id,
        )
    )
    if inscricao is None:
        raise NotFound("Inscrição de programa não encontrada.")
    return inscricao


async def listar_inscricoes(
    db: AsyncSession,
    tenant_id: uuid.UUID,
    usuario: Usuario,
    *,
    programa_id: uuid.UUID | None = None,
    cidadao_id: uuid.UUID | None = None,
    estabelecimento_id: uuid.UUID | None = None,
    situacao: str | None = None,
    limite: int = 50,
    cursor: str | None = None,
) -> tuple[list[ProgramaInscricao], str | None, int]:
    limite = min(max(limite, 1), 100)
    condicoes = [ProgramaInscricao.tenant_id == tenant_id]
    permitidos = escopos_estabelecimento(usuario, Permissao.PROGRAMA_LER)
    if permitidos is not None:
        if not permitidos:
            return [], None, 0
        condicoes.append(ProgramaInscricao.estabelecimento_id.in_(permitidos))
    if programa_id:
        condicoes.append(ProgramaInscricao.programa_id == programa_id)
    if cidadao_id:
        condicoes.append(ProgramaInscricao.cidadao_id == cidadao_id)
    if estabelecimento_id:
        condicoes.append(ProgramaInscricao.estabelecimento_id == estabelecimento_id)
    if situacao:
        condicoes.append(ProgramaInscricao.situacao == situacao)
    total = await db.scalar(
        select(func.count()).select_from(ProgramaInscricao).where(*condicoes)
    ) or 0
    consulta = (
        _inscricao_query()
        .where(*condicoes)
        .order_by(ProgramaInscricao.created_at, ProgramaInscricao.id)
        .limit(limite + 1)
    )
    consulta = aplicar_cursor(consulta, ProgramaInscricao, cursor)
    itens = list((await db.execute(consulta)).scalars().unique().all())
    proximo = None
    if len(itens) > limite:
        ultimo = itens[limite - 1]
        itens = itens[:limite]
        proximo = codificar(ultimo.created_at, ultimo.id)
    return itens, proximo, int(total)


async def criar_inscricao(
    db: AsyncSession,
    *,
    tenant_id: uuid.UUID,
    dados: InscricaoCreate,
    usuario: Usuario,
    cliente: dict,
) -> ProgramaInscricao:
    programa = await obter_programa(db, tenant_id, dados.programa_id)
    if not programa.ativo:
        raise Unprocessable("Programa inativo.", code="programa_inativo")
    if programa.vigencia_fim is not None and programa.vigencia_fim < _hoje():
        raise Unprocessable("Programa fora da vigência.", code="programa_fora_vigencia")
    await exigir_acesso_estabelecimento(
        db, usuario, Permissao.PROGRAMA_GERENCIAR, dados.estabelecimento_id
    )
    cidadao = await _cidadao_ativo(db, tenant_id, dados.cidadao_id)
    duplicada = await db.scalar(
        select(ProgramaInscricao.id).where(
            ProgramaInscricao.tenant_id == tenant_id,
            ProgramaInscricao.programa_id == programa.id,
            ProgramaInscricao.cidadao_id == cidadao.id,
            ProgramaInscricao.situacao.in_(SITUACOES_VIGENTES),
        )
    )
    if duplicada is not None:
        raise Conflict(
            "O cidadão já possui inscrição vigente neste programa.",
            code="inscricao_duplicada",
            extra={"inscricao_id": str(duplicada)},
        )
    elegivel, motivos = await avaliar_elegibilidade(
        db, tenant_id, programa, cidadao, gestante=dados.gestante
    )
    if not elegivel and not (dados.justificativa_excecao or "").strip():
        raise Unprocessable(
            "O cidadão não atende aos critérios de elegibilidade do programa.",
            code="elegibilidade_nao_atendida",
            extra={"motivos": motivos},
        )
    await _validar_dados_clinicos(db, tenant_id, programa, dados.dados_clinicos)
    inscricao = ProgramaInscricao(
        tenant_id=tenant_id,
        programa_id=programa.id,
        cidadao_id=cidadao.id,
        estabelecimento_id=dados.estabelecimento_id,
        equipe_id=dados.equipe_id,
        profissional_responsavel_id=dados.profissional_responsavel_id,
        situacao=SituacaoInscricaoPrograma.ATIVA.value,
        data_entrada=dados.data_entrada,
        gestante=dados.gestante,
        dados_clinicos=dados.dados_clinicos,
        observacoes_cifradas=dados.observacoes,
        excecao_justificada=bool((dados.justificativa_excecao or "").strip()),
        justificativa_excecao=dados.justificativa_excecao,
        versao=1,
        criado_por_id=usuario.id,
        atualizado_por_id=usuario.id,
    )
    db.add(inscricao)
    await db.flush()
    await registrar(
        db,
        acao=AcaoAuditoria.CRIAR,
        usuario=usuario,
        tenant_id=tenant_id,
        estabelecimento_id=inscricao.estabelecimento_id,
        recurso="programa_inscricao",
        recurso_id=inscricao.id,
        recurso_descricao=programa.codigo,
        dados_depois=instantaneo(inscricao),
        justificativa=dados.justificativa_excecao,
        cliente=cliente,
    )
    await db.commit()
    return await obter_inscricao(db, tenant_id, inscricao.id)


async def atualizar_inscricao(
    db: AsyncSession,
    *,
    tenant_id: uuid.UUID,
    inscricao_id: uuid.UUID,
    dados: InscricaoUpdate,
    versao: int,
    usuario: Usuario,
    cliente: dict,
) -> ProgramaInscricao:
    inscricao = await obter_inscricao(db, tenant_id, inscricao_id)
    await exigir_acesso_estabelecimento(
        db, usuario, Permissao.PROGRAMA_GERENCIAR, inscricao.estabelecimento_id
    )
    conferir_versao(inscricao.versao, versao)
    if dados.situacao == SituacaoInscricaoPrograma.ENCERRADA.value:
        raise Unprocessable(
            "Use a ação de encerramento para registrar o motivo de saída.",
            code="use_encerramento",
        )
    await _validar_dados_clinicos(
        db, tenant_id, inscricao.programa, dados.dados_clinicos
    )
    antes = instantaneo(inscricao)
    for campo in (
        "situacao",
        "motivo_saida",
        "data_saida",
        "gestante",
        "dados_clinicos",
        "equipe_id",
        "profissional_responsavel_id",
    ):
        valor = getattr(dados, campo)
        if valor is not None:
            setattr(inscricao, campo, valor)
    if dados.observacoes is not None:
        inscricao.observacoes_cifradas = dados.observacoes
    inscricao.versao += 1
    inscricao.atualizado_por_id = usuario.id
    await registrar(
        db,
        acao=AcaoAuditoria.ATUALIZAR,
        usuario=usuario,
        tenant_id=tenant_id,
        estabelecimento_id=inscricao.estabelecimento_id,
        recurso="programa_inscricao",
        recurso_id=inscricao.id,
        dados_antes=antes,
        dados_depois=instantaneo(inscricao),
        cliente=cliente,
    )
    await db.commit()
    return await obter_inscricao(db, tenant_id, inscricao.id)


async def encerrar_inscricao(
    db: AsyncSession,
    *,
    tenant_id: uuid.UUID,
    inscricao_id: uuid.UUID,
    dados: InscricaoEncerrar,
    versao: int,
    usuario: Usuario,
    cliente: dict,
) -> ProgramaInscricao:
    inscricao = await obter_inscricao(db, tenant_id, inscricao_id)
    await exigir_acesso_estabelecimento(
        db, usuario, Permissao.PROGRAMA_GERENCIAR, inscricao.estabelecimento_id
    )
    conferir_versao(inscricao.versao, versao)
    if dados.data_saida < inscricao.data_entrada:
        raise Unprocessable(
            "A data de saída não pode ser anterior à entrada.",
            code="data_saida_invalida",
        )
    antes = instantaneo(inscricao)
    inscricao.situacao = dados.situacao
    inscricao.motivo_saida = dados.motivo_saida
    inscricao.data_saida = dados.data_saida
    inscricao.versao += 1
    inscricao.atualizado_por_id = usuario.id
    abertas = (
        await db.execute(
            select(ProgramaProgramacao).where(
                ProgramaProgramacao.tenant_id == tenant_id,
                ProgramaProgramacao.inscricao_id == inscricao.id,
                ProgramaProgramacao.situacao.in_(SITUACOES_ABERTAS),
            )
        )
    ).scalars().all()
    for programacao in abertas:
        programacao.situacao = SituacaoProgramacao.CANCELADO.value
        programacao.versao += 1
        programacao.atualizado_por_id = usuario.id
    await registrar(
        db,
        acao=AcaoAuditoria.ATUALIZAR,
        usuario=usuario,
        tenant_id=tenant_id,
        estabelecimento_id=inscricao.estabelecimento_id,
        recurso="programa_inscricao",
        recurso_id=inscricao.id,
        dados_antes=antes,
        dados_depois=instantaneo(inscricao),
        justificativa=dados.motivo_saida,
        cliente=cliente,
    )
    await db.commit()
    return await obter_inscricao(db, tenant_id, inscricao.id)


# ─────────────────────────────────────────────────────────────────────────────
# Programação (B.2-005, B.2-006, B.2-007, B.2-010)
# ─────────────────────────────────────────────────────────────────────────────
async def obter_programacao(
    db: AsyncSession, tenant_id: uuid.UUID, programacao_id: uuid.UUID
) -> ProgramaProgramacao:
    registro = await db.scalar(
        _programacao_query().where(
            ProgramaProgramacao.id == programacao_id,
            ProgramaProgramacao.tenant_id == tenant_id,
        )
    )
    if registro is None:
        raise NotFound("Programação não encontrada.")
    return registro


async def listar_programacoes(
    db: AsyncSession,
    tenant_id: uuid.UUID,
    usuario: Usuario,
    *,
    programa_id: uuid.UUID | None = None,
    inscricao_id: uuid.UUID | None = None,
    cidadao_id: uuid.UUID | None = None,
    estabelecimento_id: uuid.UUID | None = None,
    situacao: str | None = None,
    de: date | None = None,
    ate: date | None = None,
    limite: int = 50,
    cursor: str | None = None,
) -> tuple[list[ProgramaProgramacao], str | None, int]:
    limite = min(max(limite, 1), 100)
    condicoes = [ProgramaProgramacao.tenant_id == tenant_id]
    permitidos = escopos_estabelecimento(usuario, Permissao.PROGRAMA_LER)
    if permitidos is not None:
        if not permitidos:
            return [], None, 0
        condicoes.append(ProgramaInscricao.estabelecimento_id.in_(permitidos))
    if programa_id:
        condicoes.append(ProgramaInscricao.programa_id == programa_id)
    if inscricao_id:
        condicoes.append(ProgramaProgramacao.inscricao_id == inscricao_id)
    if cidadao_id:
        condicoes.append(ProgramaInscricao.cidadao_id == cidadao_id)
    if estabelecimento_id:
        condicoes.append(ProgramaInscricao.estabelecimento_id == estabelecimento_id)
    if situacao:
        condicoes.append(ProgramaProgramacao.situacao == situacao)
    if de:
        condicoes.append(ProgramaProgramacao.previsto_para >= de)
    if ate:
        condicoes.append(ProgramaProgramacao.previsto_para <= ate)
    juncao = ProgramaProgramacao.__table__.join(
        ProgramaInscricao.__table__,
        ProgramaProgramacao.inscricao_id == ProgramaInscricao.id,
    )
    total = await db.scalar(
        select(func.count())
        .select_from(juncao)
        .where(*condicoes)
    ) or 0
    consulta = (
        _programacao_query()
        .join(ProgramaInscricao, ProgramaProgramacao.inscricao_id == ProgramaInscricao.id)
        .where(*condicoes)
        .order_by(ProgramaProgramacao.previsto_para, ProgramaProgramacao.id)
        .limit(limite + 1)
    )
    consulta = aplicar_cursor(consulta, ProgramaProgramacao, cursor)
    itens = list((await db.execute(consulta)).scalars().unique().all())
    proximo = None
    if len(itens) > limite:
        ultimo = itens[limite - 1]
        itens = itens[:limite]
        proximo = codificar(ultimo.created_at, ultimo.id)
    return itens, proximo, int(total)


async def _validar_item_para_inscricao(
    db: AsyncSession, tenant_id: uuid.UUID, inscricao: ProgramaInscricao, item_id: uuid.UUID
) -> ProgramaItem:
    item = await db.scalar(
        select(ProgramaItem).where(
            ProgramaItem.id == item_id,
            ProgramaItem.tenant_id == tenant_id,
            ProgramaItem.programa_id == inscricao.programa_id,
            ProgramaItem.baixa_em.is_(None),
        )
    )
    if item is None:
        raise NotFound("Item do programa não encontrado.")
    return item


async def criar_programacao(
    db: AsyncSession,
    *,
    tenant_id: uuid.UUID,
    dados: ProgramacaoCreate,
    usuario: Usuario,
    cliente: dict,
) -> ProgramaProgramacao:
    inscricao = await obter_inscricao(db, tenant_id, dados.inscricao_id)
    await exigir_acesso_estabelecimento(
        db, usuario, Permissao.PROGRAMA_GERENCIAR, inscricao.estabelecimento_id
    )
    if inscricao.situacao not in SITUACOES_VIGENTES:
        raise Unprocessable("Inscrição não está vigente.", code="inscricao_encerrada")
    item = await _validar_item_para_inscricao(
        db, tenant_id, inscricao, dados.item_id
    )
    existente = await db.scalar(
        select(ProgramaProgramacao.id).where(
            ProgramaProgramacao.tenant_id == tenant_id,
            ProgramaProgramacao.inscricao_id == inscricao.id,
            ProgramaProgramacao.item_id == item.id,
            ProgramaProgramacao.previsto_para == dados.previsto_para,
            ProgramaProgramacao.situacao.in_(SITUACOES_ABERTAS),
        )
    )
    if existente is not None:
        raise Conflict(
            "Já existe programação aberta para este item nesta data.",
            code="programacao_duplicada",
        )
    registro = ProgramaProgramacao(
        tenant_id=tenant_id,
        inscricao_id=inscricao.id,
        item_id=item.id,
        tipo=item.tipo,
        previsto_para=dados.previsto_para,
        situacao=SituacaoProgramacao.PREVISTO.value,
        quantidade=dados.quantidade,
        observacoes_cifradas=dados.observacoes,
        versao=1,
        criado_por_id=usuario.id,
        atualizado_por_id=usuario.id,
    )
    db.add(registro)
    await db.flush()
    await registrar(
        db,
        acao=AcaoAuditoria.CRIAR,
        usuario=usuario,
        tenant_id=tenant_id,
        estabelecimento_id=inscricao.estabelecimento_id,
        recurso="programa_programacao",
        recurso_id=registro.id,
        recurso_descricao=item.descricao,
        dados_depois=instantaneo(registro),
        cliente=cliente,
    )
    await db.commit()
    return await obter_programacao(db, tenant_id, registro.id)


async def _registrar_programacao(
    db: AsyncSession,
    *,
    tenant_id: uuid.UUID,
    inscricao_id: uuid.UUID,
    item: ProgramaItem,
    previsto_para: date,
    quantidade: int,
    usuario: Usuario,
    remarcado_de_id: uuid.UUID | None = None,
    observacoes: str | None = None,
) -> ProgramaProgramacao:
    registro = ProgramaProgramacao(
        tenant_id=tenant_id,
        inscricao_id=inscricao_id,
        item_id=item.id,
        tipo=item.tipo,
        previsto_para=previsto_para,
        situacao=SituacaoProgramacao.PREVISTO.value,
        quantidade=quantidade,
        observacoes_cifradas=observacoes,
        remarcado_de_id=remarcado_de_id,
        versao=1,
        criado_por_id=usuario.id,
        atualizado_por_id=usuario.id,
    )
    db.add(registro)
    await db.flush()
    return registro


def _datas_previstas(
    base: date,
    item: ProgramaItem,
    *,
    data_limite: date,
    ultima: date | None,
) -> list[date]:
    if item.periodicidade_dias is None:
        if ultima is not None:
            return []
        return [max(base, _hoje())]
    datas: list[date] = []
    atual = ultima or (base - timedelta(days=1))
    while True:
        atual = atual + timedelta(days=item.periodicidade_dias)
        if atual > data_limite:
            break
        datas.append(atual)
        if len(datas) >= 120:
            break
    return datas


async def gerar_programacoes_inscricao(
    db: AsyncSession,
    *,
    tenant_id: uuid.UUID,
    inscricao_id: uuid.UUID,
    dados: GerarProgramacoes,
    usuario: Usuario,
    cliente: dict,
) -> GerarProgramacoesOut:
    inscricao = await obter_inscricao(db, tenant_id, inscricao_id)
    await exigir_acesso_estabelecimento(
        db, usuario, Permissao.PROGRAMA_GERENCIAR, inscricao.estabelecimento_id
    )
    if inscricao.situacao not in SITUACOES_VIGENTES:
        raise Unprocessable("Inscrição não está vigente.", code="inscricao_encerrada")
    data_base = dados.data_base or inscricao.data_entrada
    limite = data_base + timedelta(days=dados.horizonte_dias)
    itens = list(
        (
            await db.execute(
                select(ProgramaItem).where(
                    ProgramaItem.tenant_id == tenant_id,
                    ProgramaItem.programa_id == inscricao.programa_id,
                    ProgramaItem.ativo.is_(True),
                    ProgramaItem.baixa_em.is_(None),
                )
            )
        )
        .scalars()
        .all()
    )
    criadas = 0
    existentes = 0
    for item in itens:
        if not _item_aplicavel(item, inscricao):
            continue
        ultima = await db.scalar(
            select(func.max(ProgramaProgramacao.previsto_para)).where(
                ProgramaProgramacao.tenant_id == tenant_id,
                ProgramaProgramacao.inscricao_id == inscricao.id,
                ProgramaProgramacao.item_id == item.id,
                ProgramaProgramacao.situacao != SituacaoProgramacao.CANCELADO.value,
            )
        )
        existentes += int(
            await db.scalar(
                select(func.count()).where(
                    ProgramaProgramacao.tenant_id == tenant_id,
                    ProgramaProgramacao.inscricao_id == inscricao.id,
                    ProgramaProgramacao.item_id == item.id,
                    ProgramaProgramacao.previsto_para >= data_base,
                    ProgramaProgramacao.previsto_para <= limite,
                    ProgramaProgramacao.situacao.in_(SITUACOES_ABERTAS),
                )
            )
            or 0
        )
        for data_prevista in _datas_previstas(
            data_base,
            item,
            data_limite=limite,
            ultima=ultima if isinstance(ultima, date) else None,
        ):
            existente = await db.scalar(
                select(ProgramaProgramacao.id).where(
                    ProgramaProgramacao.tenant_id == tenant_id,
                    ProgramaProgramacao.inscricao_id == inscricao.id,
                    ProgramaProgramacao.item_id == item.id,
                    ProgramaProgramacao.previsto_para == data_prevista,
                    ProgramaProgramacao.situacao.in_(SITUACOES_ABERTAS),
                )
            )
            if existente is not None:
                continue
            await _registrar_programacao(
                db,
                tenant_id=tenant_id,
                inscricao_id=inscricao.id,
                item=item,
                previsto_para=data_prevista,
                quantidade=item.quantidade,
                usuario=usuario,
            )
            criadas += 1
    await db.flush()
    # Programações abertas já existentes na janela contam como "existentes",
    # para que a regeração idempotente informe o que encontrou.
    abertas_janela = await db.scalar(
        select(func.count()).select_from(ProgramaProgramacao).where(
            ProgramaProgramacao.tenant_id == tenant_id,
            ProgramaProgramacao.inscricao_id == inscricao.id,
            ProgramaProgramacao.situacao.in_(SITUACOES_ABERTAS),
            ProgramaProgramacao.previsto_para >= data_base,
            ProgramaProgramacao.previsto_para <= limite,
        )
    )
    existentes = max(existentes, int(abertas_janela or 0) - criadas)
    await registrar(
        db,
        acao=AcaoAuditoria.CRIAR,
        usuario=usuario,
        tenant_id=tenant_id,
        estabelecimento_id=inscricao.estabelecimento_id,
        recurso="programa_programacao",
        recurso_id=inscricao.id,
        recurso_descricao="geração de programação",
        dados_depois={
            "criadas": criadas,
            "existentes": existentes,
            "itens_avaliados": len(itens),
        },
        cliente=cliente,
    )
    await db.commit()
    return GerarProgramacoesOut(
        inscricao_id=inscricao.id,
        programa_id=inscricao.programa_id,
        criadas=criadas,
        existentes=existentes,
        itens_avaliados=len(itens),
        horizonte_dias=dados.horizonte_dias,
        data_base=data_base,
    )


def _item_aplicavel(item: ProgramaItem, inscricao: ProgramaInscricao) -> bool:
    cidadao = inscricao.cidadao
    idade_meses = _idade_meses(cidadao.data_nascimento)
    if item.idade_min_meses is not None:
        if idade_meses is None or idade_meses < item.idade_min_meses:
            return False
    if item.idade_max_meses is not None:
        if idade_meses is None or idade_meses > item.idade_max_meses:
            return False
    if item.sexo is not None and cidadao.sexo != item.sexo:
        return False
    if item.gestante is not None:
        gestante = inscricao.gestante
        if gestante is None:
            return False
        if gestante != item.gestante:
            return False
    return True


async def gerar_programacoes_programa(
    db: AsyncSession,
    *,
    tenant_id: uuid.UUID,
    programa_id: uuid.UUID,
    dados: GerarProgramacoes,
    usuario: Usuario,
    cliente: dict,
) -> GerarProgramacoesOut:
    programa = await obter_programa(db, tenant_id, programa_id)
    permitidos = escopos_estabelecimento(usuario, Permissao.PROGRAMA_GERENCIAR)
    condicoes = [
        ProgramaInscricao.tenant_id == tenant_id,
        ProgramaInscricao.programa_id == programa.id,
        ProgramaInscricao.situacao == SituacaoInscricaoPrograma.ATIVA.value,
    ]
    if permitidos is not None:
        if not permitidos:
            return GerarProgramacoesOut(
                programa_id=programa.id,
                criadas=0,
                existentes=0,
                itens_avaliados=0,
                horizonte_dias=dados.horizonte_dias,
                data_base=dados.data_base or _hoje(),
            )
        condicoes.append(ProgramaInscricao.estabelecimento_id.in_(permitidos))
    inscricoes = list(
        (
            await db.execute(
                _inscricao_query().where(*condicoes).order_by(ProgramaInscricao.created_at)
            )
        )
        .scalars()
        .unique()
        .all()
    )
    total_criadas = 0
    total_existentes = 0
    total_itens = 0
    for inscricao in inscricoes:
        resultado = await gerar_programacoes_inscricao(
            db,
            tenant_id=tenant_id,
            inscricao_id=inscricao.id,
            dados=dados,
            usuario=usuario,
            cliente=cliente,
        )
        total_criadas += resultado.criadas
        total_existentes += resultado.existentes
        total_itens += resultado.itens_avaliados
    return GerarProgramacoesOut(
        programa_id=programa.id,
        criadas=total_criadas,
        existentes=total_existentes,
        itens_avaliados=total_itens,
        horizonte_dias=dados.horizonte_dias,
        data_base=dados.data_base or _hoje(),
    )


async def realizar_programacao(
    db: AsyncSession,
    *,
    tenant_id: uuid.UUID,
    programacao_id: uuid.UUID,
    dados: ProgramacaoRealizar,
    usuario: Usuario,
    cliente: dict,
) -> ProgramaProgramacao:
    registro = await obter_programacao(db, tenant_id, programacao_id)
    await exigir_acesso_estabelecimento(
        db,
        usuario,
        Permissao.PROGRAMA_GERENCIAR,
        registro.inscricao.estabelecimento_id,
    )
    if registro.situacao not in SITUACOES_ABERTAS:
        raise Conflict(
            "Somente programações abertas podem ser realizadas.",
            code="programacao_fechada",
        )
    antes = instantaneo(registro)
    registro.situacao = SituacaoProgramacao.REALIZADO.value
    registro.realizado_em = dados.realizado_em
    if dados.quantidade is not None:
        registro.quantidade = dados.quantidade
    registro.atendimento_id = dados.atendimento_id
    if dados.observacoes is not None:
        registro.observacoes_cifradas = dados.observacoes
    registro.responsavel_id = usuario.id
    registro.versao += 1
    registro.atualizado_por_id = usuario.id
    # Próxima ação periódica, quando o item define periodicidade.
    if registro.item.periodicidade_dias:
        proxima = dados.realizado_em + timedelta(
            days=registro.item.periodicidade_dias
        )
        existente = await db.scalar(
            select(ProgramaProgramacao.id).where(
                ProgramaProgramacao.tenant_id == tenant_id,
                ProgramaProgramacao.inscricao_id == registro.inscricao_id,
                ProgramaProgramacao.item_id == registro.item_id,
                ProgramaProgramacao.previsto_para == proxima,
                ProgramaProgramacao.situacao.in_(SITUACOES_ABERTAS),
            )
        )
        if existente is None:
            await _registrar_programacao(
                db,
                tenant_id=tenant_id,
                inscricao_id=registro.inscricao_id,
                item=registro.item,
                previsto_para=proxima,
                quantidade=registro.item.quantidade,
                usuario=usuario,
            )
    await registrar(
        db,
        acao=AcaoAuditoria.ATUALIZAR,
        usuario=usuario,
        tenant_id=tenant_id,
        estabelecimento_id=registro.inscricao.estabelecimento_id,
        recurso="programa_programacao",
        recurso_id=registro.id,
        recurso_descricao=registro.item.descricao,
        dados_antes=antes,
        dados_depois=instantaneo(registro),
        cliente=cliente,
    )
    await db.commit()
    return await obter_programacao(db, tenant_id, registro.id)


async def remarcar_programacao(
    db: AsyncSession,
    *,
    tenant_id: uuid.UUID,
    programacao_id: uuid.UUID,
    dados: ProgramacaoRemarcar,
    usuario: Usuario,
    cliente: dict,
) -> ProgramaProgramacao:
    registro = await obter_programacao(db, tenant_id, programacao_id)
    await exigir_acesso_estabelecimento(
        db,
        usuario,
        Permissao.PROGRAMA_GERENCIAR,
        registro.inscricao.estabelecimento_id,
    )
    if registro.situacao not in SITUACOES_ABERTAS:
        raise Conflict(
            "Somente programações abertas podem ser remarcadas.",
            code="programacao_fechada",
        )
    existente = await db.scalar(
        select(ProgramaProgramacao.id).where(
            ProgramaProgramacao.tenant_id == tenant_id,
            ProgramaProgramacao.inscricao_id == registro.inscricao_id,
            ProgramaProgramacao.item_id == registro.item_id,
            ProgramaProgramacao.previsto_para == dados.nova_data,
            ProgramaProgramacao.situacao.in_(SITUACOES_ABERTAS),
        )
    )
    if existente is not None:
        raise Conflict(
            "Já existe programação aberta nesta nova data.",
            code="programacao_duplicada",
        )
    antes = instantaneo(registro)
    registro.situacao = SituacaoProgramacao.REMARCADO.value
    registro.versao += 1
    registro.atualizado_por_id = usuario.id
    novo = await _registrar_programacao(
        db,
        tenant_id=tenant_id,
        inscricao_id=registro.inscricao_id,
        item=registro.item,
        previsto_para=dados.nova_data,
        quantidade=registro.quantidade,
        usuario=usuario,
        remarcado_de_id=registro.id,
        observacoes=f"Remarcado: {dados.motivo}",
    )
    await registrar(
        db,
        acao=AcaoAuditoria.ATUALIZAR,
        usuario=usuario,
        tenant_id=tenant_id,
        estabelecimento_id=registro.inscricao.estabelecimento_id,
        recurso="programa_programacao",
        recurso_id=novo.id,
        recurso_descricao=registro.item.descricao,
        dados_antes=antes,
        dados_depois=instantaneo(novo),
        justificativa=dados.motivo,
        cliente=cliente,
    )
    await db.commit()
    return await obter_programacao(db, tenant_id, novo.id)


async def perder_programacao(
    db: AsyncSession,
    *,
    tenant_id: uuid.UUID,
    programacao_id: uuid.UUID,
    dados: ProgramacaoPerder,
    usuario: Usuario,
    cliente: dict,
) -> ProgramaProgramacao:
    registro = await obter_programacao(db, tenant_id, programacao_id)
    await exigir_acesso_estabelecimento(
        db,
        usuario,
        Permissao.PROGRAMA_GERENCIAR,
        registro.inscricao.estabelecimento_id,
    )
    if registro.situacao not in SITUACOES_ABERTAS:
        raise Conflict(
            "Somente programações abertas podem ser marcadas como perdidas.",
            code="programacao_fechada",
        )
    antes = instantaneo(registro)
    registro.situacao = SituacaoProgramacao.PERDIDO.value
    registro.observacoes_cifradas = dados.motivo
    registro.versao += 1
    registro.atualizado_por_id = usuario.id
    if dados.criar_busca_ativa:
        db.add(
            ProgramaBuscaAtiva(
                tenant_id=tenant_id,
                inscricao_id=registro.inscricao_id,
                programacao_id=registro.id,
                motivo=MotivoBuscaAtiva.ATRASO.value,
                situacao=SituacaoBuscaAtiva.PENDENTE.value,
                tentativa=1,
                responsavel_id=usuario.id,
                versao=1,
                criado_por_id=usuario.id,
                atualizado_por_id=usuario.id,
            )
        )
    await registrar(
        db,
        acao=AcaoAuditoria.ATUALIZAR,
        usuario=usuario,
        tenant_id=tenant_id,
        estabelecimento_id=registro.inscricao.estabelecimento_id,
        recurso="programa_programacao",
        recurso_id=registro.id,
        recurso_descricao=registro.item.descricao,
        dados_antes=antes,
        dados_depois=instantaneo(registro),
        justificativa=dados.motivo,
        cliente=cliente,
    )
    await db.commit()
    return await obter_programacao(db, tenant_id, registro.id)


# ─────────────────────────────────────────────────────────────────────────────
# Busca ativa (B.2-012)
# ─────────────────────────────────────────────────────────────────────────────
async def obter_busca(
    db: AsyncSession, tenant_id: uuid.UUID, busca_id: uuid.UUID
) -> ProgramaBuscaAtiva:
    registro = await db.scalar(
        _busca_query().where(
            ProgramaBuscaAtiva.id == busca_id,
            ProgramaBuscaAtiva.tenant_id == tenant_id,
        )
    )
    if registro is None:
        raise NotFound("Busca ativa não encontrada.")
    return registro


async def listar_buscas(
    db: AsyncSession,
    tenant_id: uuid.UUID,
    usuario: Usuario,
    *,
    programa_id: uuid.UUID | None = None,
    inscricao_id: uuid.UUID | None = None,
    situacao: str | None = None,
    limite: int = 50,
    cursor: str | None = None,
) -> tuple[list[ProgramaBuscaAtiva], str | None, int]:
    limite = min(max(limite, 1), 100)
    condicoes = [ProgramaBuscaAtiva.tenant_id == tenant_id]
    permitidos = escopos_estabelecimento(usuario, Permissao.PROGRAMA_BUSCA_ATIVA)
    if permitidos is not None:
        if not permitidos:
            return [], None, 0
        condicoes.append(ProgramaInscricao.estabelecimento_id.in_(permitidos))
    if programa_id:
        condicoes.append(ProgramaInscricao.programa_id == programa_id)
    if inscricao_id:
        condicoes.append(ProgramaBuscaAtiva.inscricao_id == inscricao_id)
    if situacao:
        condicoes.append(ProgramaBuscaAtiva.situacao == situacao)
    juncao = ProgramaBuscaAtiva.__table__.join(
        ProgramaInscricao.__table__,
        ProgramaBuscaAtiva.inscricao_id == ProgramaInscricao.id,
    )
    total = await db.scalar(
        select(func.count()).select_from(juncao).where(*condicoes)
    ) or 0
    consulta = (
        _busca_query()
        .join(ProgramaInscricao, ProgramaBuscaAtiva.inscricao_id == ProgramaInscricao.id)
        .where(*condicoes)
        .order_by(ProgramaBuscaAtiva.created_at, ProgramaBuscaAtiva.id)
        .limit(limite + 1)
    )
    consulta = aplicar_cursor(consulta, ProgramaBuscaAtiva, cursor)
    itens = list((await db.execute(consulta)).scalars().unique().all())
    proximo = None
    if len(itens) > limite:
        ultimo = itens[limite - 1]
        itens = itens[:limite]
        proximo = codificar(ultimo.created_at, ultimo.id)
    return itens, proximo, int(total)


async def criar_busca(
    db: AsyncSession,
    *,
    tenant_id: uuid.UUID,
    dados: BuscaAtivaCreate,
    usuario: Usuario,
    cliente: dict,
) -> ProgramaBuscaAtiva:
    inscricao = await obter_inscricao(db, tenant_id, dados.inscricao_id)
    await exigir_acesso_estabelecimento(
        db,
        usuario,
        Permissao.PROGRAMA_BUSCA_ATIVA,
        inscricao.estabelecimento_id,
    )
    if dados.programacao_id is not None:
        programacao = await obter_programacao(db, tenant_id, dados.programacao_id)
        if programacao.inscricao_id != inscricao.id:
            raise Unprocessable(
                "A programação não pertence à inscrição informada.",
                code="programacao_inscricao_divergente",
            )
    registro = ProgramaBuscaAtiva(
        tenant_id=tenant_id,
        inscricao_id=inscricao.id,
        programacao_id=dados.programacao_id,
        motivo=dados.motivo,
        situacao=dados.situacao,
        tentativa=dados.tentativa,
        contato_em=dados.contato_em,
        proxima_tentativa_em=dados.proxima_tentativa_em,
        desfecho=dados.desfecho,
        observacoes_cifradas=dados.observacoes,
        responsavel_id=usuario.id,
        versao=1,
        criado_por_id=usuario.id,
        atualizado_por_id=usuario.id,
    )
    db.add(registro)
    await db.flush()
    await registrar(
        db,
        acao=AcaoAuditoria.CRIAR,
        usuario=usuario,
        tenant_id=tenant_id,
        estabelecimento_id=inscricao.estabelecimento_id,
        recurso="programa_busca_ativa",
        recurso_id=registro.id,
        dados_depois=instantaneo(registro),
        cliente=cliente,
    )
    await db.commit()
    return await obter_busca(db, tenant_id, registro.id)


async def atualizar_busca(
    db: AsyncSession,
    *,
    tenant_id: uuid.UUID,
    busca_id: uuid.UUID,
    dados: BuscaAtivaUpdate,
    versao: int,
    usuario: Usuario,
    cliente: dict,
) -> ProgramaBuscaAtiva:
    registro = await obter_busca(db, tenant_id, busca_id)
    await exigir_acesso_estabelecimento(
        db,
        usuario,
        Permissao.PROGRAMA_BUSCA_ATIVA,
        registro.inscricao.estabelecimento_id,
    )
    conferir_versao(registro.versao, versao)
    antes = instantaneo(registro)
    for campo in (
        "situacao",
        "tentativa",
        "contato_em",
        "proxima_tentativa_em",
        "desfecho",
    ):
        valor = getattr(dados, campo)
        if valor is not None:
            setattr(registro, campo, valor)
    if dados.observacoes is not None:
        registro.observacoes_cifradas = dados.observacoes
    registro.versao += 1
    registro.atualizado_por_id = usuario.id
    await registrar(
        db,
        acao=AcaoAuditoria.ATUALIZAR,
        usuario=usuario,
        tenant_id=tenant_id,
        estabelecimento_id=registro.inscricao.estabelecimento_id,
        recurso="programa_busca_ativa",
        recurso_id=registro.id,
        dados_antes=antes,
        dados_depois=instantaneo(registro),
        cliente=cliente,
    )
    await db.commit()
    return await obter_busca(db, tenant_id, registro.id)


async def pendencias_busca_ativa(
    db: AsyncSession,
    tenant_id: uuid.UUID,
    usuario: Usuario,
    *,
    programa_id: uuid.UUID | None = None,
    estabelecimento_id: uuid.UUID | None = None,
    dias_atraso_minimo: int = 1,
    limite: int = 100,
) -> list[dict]:
    limite = min(max(limite, 1), 500)
    hoje = _hoje()
    condicoes = [
        ProgramaProgramacao.tenant_id == tenant_id,
        ProgramaProgramacao.situacao.in_(SITUACOES_ABERTAS),
        ProgramaProgramacao.previsto_para
        <= hoje - timedelta(days=max(dias_atraso_minimo, 0)),
    ]
    permitidos = escopos_estabelecimento(usuario, Permissao.PROGRAMA_BUSCA_ATIVA)
    if permitidos is not None:
        if not permitidos:
            return []
        condicoes.append(ProgramaInscricao.estabelecimento_id.in_(permitidos))
    if programa_id:
        condicoes.append(ProgramaInscricao.programa_id == programa_id)
    if estabelecimento_id:
        condicoes.append(ProgramaInscricao.estabelecimento_id == estabelecimento_id)
    linhas = (
        await db.execute(
            select(
                ProgramaProgramacao,
                ProgramaInscricao,
                Cidadao,
                Programa,
                ProgramaItem,
            )
            .join(
                ProgramaInscricao,
                ProgramaProgramacao.inscricao_id == ProgramaInscricao.id,
            )
            .join(Cidadao, ProgramaInscricao.cidadao_id == Cidadao.id)
            .join(Programa, ProgramaInscricao.programa_id == Programa.id)
            .join(ProgramaItem, ProgramaProgramacao.item_id == ProgramaItem.id)
            .where(*condicoes)
            .order_by(ProgramaProgramacao.previsto_para, ProgramaProgramacao.id)
            .limit(limite)
        )
    ).all()
    saida: list[dict] = []
    for programacao, inscricao, cidadao, programa, item in linhas:
        ultima = await db.scalar(
            select(ProgramaBuscaAtiva)
            .where(
                ProgramaBuscaAtiva.tenant_id == tenant_id,
                ProgramaBuscaAtiva.programacao_id == programacao.id,
            )
            .order_by(ProgramaBuscaAtiva.created_at.desc())
            .limit(1)
        )
        saida.append(
            {
                "inscricao_id": inscricao.id,
                "programacao_id": programacao.id,
                "programa_id": programa.id,
                "programa_codigo": programa.codigo,
                "programa_nome": programa.nome,
                "cidadao_id": cidadao.id,
                "cidadao_nome_exibicao": cidadao.nome_social or cidadao.nome,
                "estabelecimento_id": inscricao.estabelecimento_id,
                "item_id": item.id,
                "item_tipo": item.tipo,
                "item_descricao": item.descricao,
                "previsto_para": programacao.previsto_para,
                "atraso_dias": (hoje - programacao.previsto_para).days,
                "ultima_busca_em": ultima.created_at if ultima else None,
                "situacao_busca": ultima.situacao if ultima else None,
                **_mascarados(cidadao),
            }
        )
    return saida


# ─────────────────────────────────────────────────────────────────────────────
# Indicadores, lista nominal e demanda futura (B.2-013, B.2-014, B.2-015)
# ─────────────────────────────────────────────────────────────────────────────
async def resumo_programa(
    db: AsyncSession, tenant_id: uuid.UUID, programa_id: uuid.UUID
) -> ResumoProgramaOut:
    programa = await obter_programa(db, tenant_id, programa_id)
    hoje = _hoje()
    base = [
        ProgramaProgramacao.tenant_id == tenant_id,
        ProgramaInscricao.programa_id == programa.id,
    ]
    contagens = {
        situacao: await db.scalar(
            select(func.count())
            .select_from(ProgramaProgramacao.__table__.join(
                ProgramaInscricao.__table__,
                ProgramaProgramacao.inscricao_id == ProgramaInscricao.id,
            ))
            .where(*base, ProgramaProgramacao.situacao == situacao)
        )
        or 0
        for situacao in (
            SituacaoProgramacao.PREVISTO.value,
            SituacaoProgramacao.REALIZADO.value,
            SituacaoProgramacao.PERDIDO.value,
        )
    }
    atrasadas = await db.scalar(
        select(func.count())
        .select_from(ProgramaProgramacao.__table__.join(
            ProgramaInscricao.__table__,
            ProgramaProgramacao.inscricao_id == ProgramaInscricao.id,
        ))
        .where(
            *base,
            ProgramaProgramacao.situacao.in_(SITUACOES_ABERTAS),
            ProgramaProgramacao.previsto_para < hoje,
        )
    ) or 0
    inscricoes_ativas = await db.scalar(
        select(func.count())
        .select_from(ProgramaInscricao)
        .where(
            ProgramaInscricao.tenant_id == tenant_id,
            ProgramaInscricao.programa_id == programa.id,
            ProgramaInscricao.situacao == SituacaoInscricaoPrograma.ATIVA.value,
        )
    ) or 0
    inscricoes_suspensas = await db.scalar(
        select(func.count())
        .select_from(ProgramaInscricao)
        .where(
            ProgramaInscricao.tenant_id == tenant_id,
            ProgramaInscricao.programa_id == programa.id,
            ProgramaInscricao.situacao == SituacaoInscricaoPrograma.SUSPENSA.value,
        )
    ) or 0
    denominador = (
        contagens[SituacaoProgramacao.REALIZADO.value]
        + contagens[SituacaoProgramacao.PERDIDO.value]
        + int(atrasadas)
    )
    cobertura = (
        contagens[SituacaoProgramacao.REALIZADO.value] / denominador * 100
        if denominador
        else 0.0
    )
    itens_saida: list[ResumoItemOut] = []
    for item in programa.itens:
        if item.baixa_em is not None:
            continue
        previstas = await db.scalar(
            select(func.count())
            .select_from(ProgramaProgramacao.__table__.join(
                ProgramaInscricao.__table__,
                ProgramaProgramacao.inscricao_id == ProgramaInscricao.id,
            ))
            .where(*base, ProgramaProgramacao.item_id == item.id)
        ) or 0
        realizadas = await db.scalar(
            select(func.count())
            .select_from(ProgramaProgramacao.__table__.join(
                ProgramaInscricao.__table__,
                ProgramaProgramacao.inscricao_id == ProgramaInscricao.id,
            ))
            .where(
                *base,
                ProgramaProgramacao.item_id == item.id,
                ProgramaProgramacao.situacao == SituacaoProgramacao.REALIZADO.value,
            )
        ) or 0
        perdidas = await db.scalar(
            select(func.count())
            .select_from(ProgramaProgramacao.__table__.join(
                ProgramaInscricao.__table__,
                ProgramaProgramacao.inscricao_id == ProgramaInscricao.id,
            ))
            .where(
                *base,
                ProgramaProgramacao.item_id == item.id,
                ProgramaProgramacao.situacao == SituacaoProgramacao.PERDIDO.value,
            )
        ) or 0
        atrasadas_item = await db.scalar(
            select(func.count())
            .select_from(ProgramaProgramacao.__table__.join(
                ProgramaInscricao.__table__,
                ProgramaProgramacao.inscricao_id == ProgramaInscricao.id,
            ))
            .where(
                *base,
                ProgramaProgramacao.item_id == item.id,
                ProgramaProgramacao.situacao.in_(SITUACOES_ABERTAS),
                ProgramaProgramacao.previsto_para < hoje,
            )
        ) or 0
        denom_item = int(realizadas) + int(perdidas) + int(atrasadas_item)
        itens_saida.append(
            ResumoItemOut(
                item_id=item.id,
                tipo=item.tipo,
                descricao=item.descricao,
                previstas=int(previstas),
                realizadas=int(realizadas),
                perdidas=int(perdidas),
                atrasadas=int(atrasadas_item),
                cobertura_percentual=round(
                    (int(realizadas) / denom_item * 100) if denom_item else 0.0, 2
                ),
            )
        )
    return ResumoProgramaOut(
        programa_id=programa.id,
        programa_codigo=programa.codigo,
        programa_nome=programa.nome,
        inscricoes_ativas=int(inscricoes_ativas),
        inscricoes_suspensas=int(inscricoes_suspensas),
        programacoes_previstas=int(contagens[SituacaoProgramacao.PREVISTO.value]),
        programacoes_realizadas=int(contagens[SituacaoProgramacao.REALIZADO.value]),
        programacoes_perdidas=int(contagens[SituacaoProgramacao.PERDIDO.value]),
        programacoes_atrasadas=int(atrasadas),
        cobertura_percentual=round(cobertura, 2),
        itens=itens_saida,
    )


async def lista_nominal(
    db: AsyncSession,
    tenant_id: uuid.UUID,
    programa_id: uuid.UUID,
    usuario: Usuario,
    *,
    somente_atrasadas: bool = True,
    limite: int = 200,
) -> ListaNominalOut:
    programa = await obter_programa(db, tenant_id, programa_id)
    limite = min(max(limite, 1), 1000)
    hoje = _hoje()
    condicoes = [
        ProgramaInscricao.tenant_id == tenant_id,
        ProgramaInscricao.programa_id == programa.id,
        ProgramaInscricao.situacao == SituacaoInscricaoPrograma.ATIVA.value,
    ]
    permitidos = escopos_estabelecimento(usuario, Permissao.PROGRAMA_BUSCA_ATIVA)
    if permitidos is not None:
        if not permitidos:
            return ListaNominalOut(
                programa_id=programa.id,
                programa_codigo=programa.codigo,
                programa_nome=programa.nome,
                gerado_em=_agora(),
                itens=[],
                total_estimado=0,
            )
        condicoes.append(ProgramaInscricao.estabelecimento_id.in_(permitidos))
    linhas = (
        await db.execute(
            select(ProgramaProgramacao, ProgramaInscricao, Cidadao, ProgramaItem)
            .join(
                ProgramaInscricao,
                ProgramaProgramacao.inscricao_id == ProgramaInscricao.id,
            )
            .join(Cidadao, ProgramaInscricao.cidadao_id == Cidadao.id)
            .join(ProgramaItem, ProgramaProgramacao.item_id == ProgramaItem.id)
            .where(
                *condicoes,
                ProgramaProgramacao.situacao.in_(SITUACOES_ABERTAS),
                *(
                    [ProgramaProgramacao.previsto_para < hoje]
                    if somente_atrasadas
                    else []
                ),
            )
            .order_by(ProgramaProgramacao.previsto_para)
            .limit(limite)
        )
    ).all()
    itens: list[ListaNominalItemOut] = []
    for programacao, inscricao, cidadao, item in linhas:
        ultima = await db.scalar(
            select(ProgramaBuscaAtiva)
            .where(
                ProgramaBuscaAtiva.tenant_id == tenant_id,
                ProgramaBuscaAtiva.programacao_id == programacao.id,
            )
            .order_by(ProgramaBuscaAtiva.created_at.desc())
            .limit(1)
        )
        itens.append(
            ListaNominalItemOut(
                inscricao_id=inscricao.id,
                cidadao_id=cidadao.id,
                cidadao_nome_exibicao=cidadao.nome_social or cidadao.nome,
                data_nascimento=cidadao.data_nascimento,
                estabelecimento_id=inscricao.estabelecimento_id,
                proxima_acao=item.descricao,
                previsto_para=programacao.previsto_para,
                atraso_dias=(hoje - programacao.previsto_para).days,
                ultima_busca_em=ultima.created_at if ultima else None,
                situacao_busca=ultima.situacao if ultima else None,
                **_mascarados(cidadao),
            )
        )
    return ListaNominalOut(
        programa_id=programa.id,
        programa_codigo=programa.codigo,
        programa_nome=programa.nome,
        gerado_em=_agora(),
        itens=itens,
        total_estimado=len(itens),
    )


async def estimativa_demanda(
    db: AsyncSession,
    tenant_id: uuid.UUID,
    programa_id: uuid.UUID,
    *,
    horizonte_meses: int = 3,
    data_base: date | None = None,
) -> DemandaFuturaOut:
    programa = await obter_programa(db, tenant_id, programa_id)
    base = data_base or _hoje()
    horizonte_meses = min(max(horizonte_meses, 1), 36)
    limite = base + timedelta(days=horizonte_meses * 30)
    ativos = await db.scalar(
        select(func.count())
        .select_from(ProgramaInscricao)
        .where(
            ProgramaInscricao.tenant_id == tenant_id,
            ProgramaInscricao.programa_id == programa.id,
            ProgramaInscricao.situacao == SituacaoInscricaoPrograma.ATIVA.value,
        )
    ) or 0
    itens: list[DemandaItemOut] = []
    total_estimado = 0
    total_programado = 0
    for item in programa.itens:
        if item.baixa_em is not None or not item.ativo:
            continue
        programadas = await db.scalar(
            select(func.count())
            .select_from(ProgramaProgramacao.__table__.join(
                ProgramaInscricao.__table__,
                ProgramaProgramacao.inscricao_id == ProgramaInscricao.id,
            ))
            .where(
                ProgramaInscricao.tenant_id == tenant_id,
                ProgramaInscricao.programa_id == programa.id,
                ProgramaProgramacao.item_id == item.id,
                ProgramaProgramacao.previsto_para >= base,
                ProgramaProgramacao.previsto_para <= limite,
                ProgramaProgramacao.situacao.in_(SITUACOES_ABERTAS),
            )
        ) or 0
        if item.periodicidade_dias:
            estimada = math.ceil(
                int(ativos)
                * (horizonte_meses * 30)
                / max(int(item.periodicidade_dias), 1)
            )
            formula = (
                "ceil(inscritos_ativos * (horizonte_meses * 30) "
                "/ periodicidade_dias)"
            )
        else:
            sem_realizacao = await db.scalar(
                select(func.count())
                .select_from(ProgramaInscricao)
                .where(
                    ProgramaInscricao.tenant_id == tenant_id,
                    ProgramaInscricao.programa_id == programa.id,
                    ProgramaInscricao.situacao
                    == SituacaoInscricaoPrograma.ATIVA.value,
                    ~select(ProgramaProgramacao.id)
                    .where(
                        ProgramaProgramacao.inscricao_id == ProgramaInscricao.id,
                        ProgramaProgramacao.item_id == item.id,
                        ProgramaProgramacao.situacao
                        == SituacaoProgramacao.REALIZADO.value,
                    )
                    .exists(),
                )
            ) or 0
            estimada = int(sem_realizacao)
            formula = "inscritos_ativos sem realização registrada"
        itens.append(
            DemandaItemOut(
                item_id=item.id,
                tipo=item.tipo,
                descricao=item.descricao,
                periodicidade_dias=item.periodicidade_dias,
                inscritos_ativos=int(ativos),
                demanda_programada=int(programadas),
                demanda_estimada=int(estimada),
                total_previsto=int(programadas) + int(estimada),
                memoria_calculo={
                    "formula": formula,
                    "inscritos_ativos": int(ativos),
                    "horizonte_meses": horizonte_meses,
                    "periodicidade_dias": item.periodicidade_dias,
                    "data_base": base.isoformat(),
                    "data_limite": limite.isoformat(),
                },
            )
        )
        total_estimado += int(estimada)
        total_programado += int(programadas)
    return DemandaFuturaOut(
        programa_id=programa.id,
        programa_codigo=programa.codigo,
        programa_nome=programa.nome,
        horizonte_meses=horizonte_meses,
        data_base=base,
        itens=itens,
        total_estimado=total_estimado,
        total_programado=total_programado,
    )


async def listar_linhas_cuidado(
    db: AsyncSession, tenant_id: uuid.UUID
) -> dict[str, list[Programa]]:
    programas = list(
        (
            await db.execute(
                select(Programa)
                .where(
                    Programa.tenant_id == tenant_id,
                    Programa.baixa_em.is_(None),
                    Programa.ativo.is_(True),
                    Programa.linha_cuidado.is_not(None),
                )
                .order_by(Programa.linha_cuidado, Programa.nome)
            )
        )
        .scalars()
        .unique()
        .all()
    )
    agrupados: dict[str, list[Programa]] = {}
    for programa in programas:
        agrupados.setdefault(programa.linha_cuidado or "", []).append(programa)
    return agrupados


__all__ = [
    "atualizar_busca",
    "atualizar_inscricao",
    "atualizar_item",
    "atualizar_programa",
    "avaliar_elegibilidade",
    "criar_busca",
    "criar_inscricao",
    "criar_item",
    "criar_programa",
    "criar_programacao",
    "encerrar_inscricao",
    "estimativa_demanda",
    "gerar_programacoes_inscricao",
    "gerar_programacoes_programa",
    "lista_nominal",
    "listar_buscas",
    "listar_inscricoes",
    "listar_itens",
    "listar_linhas_cuidado",
    "listar_programacoes",
    "listar_programas",
    "nova_versao_programa",
    "obter_busca",
    "obter_inscricao",
    "obter_programa",
    "obter_programacao",
    "pendencias_busca_ativa",
    "perder_programacao",
    "realizar_programacao",
    "remarcar_programacao",
    "resumo_programa",
]
