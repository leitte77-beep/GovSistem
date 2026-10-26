"""Regras de domínio da Fase 5 — PEC ambulatorial (B.6-004…058, B.12-013/021…025).

O serviço implementa o motor; etapas, campos obrigatórios, tipos de registro,
tabelas de classificação nutricional, validade de consulta e contingência
retroativa são configurações do tenant (``prontuario.*``). Alertas de
interação e de medicamento potencialmente perigoso dependem de base validada
que ainda não existe: ficam ``NAO_AVALIADO`` e documentados em
``docs/pendencias-oficiais.md``.
"""

from __future__ import annotations

import uuid
from datetime import date, datetime, timedelta, timezone

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.autorizacao import escopo_permite, pode_ver_conteudo, tem_permissao, velar
from app.core.errors import Conflict, NotFound, PermissionDenied, Unprocessable
from app.core.permissoes import Permissao
from app.models.cidadao import Cidadao
from app.models.nucleo import Estabelecimento, FormularioDinamico, Usuario
from app.models.prontuario import (
    Alergia,
    Atendimento,
    EvolucaoSOAP,
    PlanoCuidado,
    Prescricao,
    ProblemaClinico,
    RegistroAssistencial,
    SinalVital,
)
from app.models.referencia import Ciap2, Cid10, Medicamento
from app.motores.formularios import validar_resposta
from app.schemas.prontuario import (
    AlergiaCreate,
    AtendimentoCreate,
    PlanoCreate,
    PrescricaoCopiar,
    PrescricaoCreate,
    ProblemaCreate,
    RegistroAssistencialCreate,
    RetificacaoRegistroCreate,
    RetificacaoSOAPCreate,
    SinalVitalCreate,
    SOAPCreate,
)
from app.services import configuracoes
from app.services.auditoria import registrar, registrar_leitura_sensivel

CAMPOS_SOAP = ("subjetivo", "objetivo", "avaliacao", "plano")
CAMPOS_VERIFICAVEIS = {*CAMPOS_SOAP, "sinais_vitais", "problema", "classificacao_risco"}
ALERTA_SEM_BASE = {
    "situacao": "NAO_AVALIADO",
    "motivo": "base_farmacologica_validada_indisponivel",
}


def _agora() -> datetime:
    return datetime.now(timezone.utc)


def _utc(valor: datetime) -> datetime:
    return valor if valor.tzinfo else valor.replace(tzinfo=timezone.utc)


async def _auditar(db, ator, tenant_id, acao, recurso, recurso_id, cliente, **extra) -> None:
    await registrar(
        db,
        acao=acao,
        usuario=ator,
        tenant_id=tenant_id,
        recurso=recurso,
        recurso_id=recurso_id,
        cliente=cliente,
        **extra,
    )


async def _cidadao(db: AsyncSession, tenant_id: uuid.UUID, cidadao_id: uuid.UUID) -> Cidadao:
    item = await db.scalar(
        select(Cidadao).where(Cidadao.id == cidadao_id, Cidadao.tenant_id == tenant_id)
    )
    if item is None:
        raise NotFound("Cidadão não encontrado.")
    return item


# ── Atendimento, etapas e acesso (B.6-004, B.12-021…025) ────────────────────
async def atendimento(
    db: AsyncSession,
    tenant_id: uuid.UUID,
    atendimento_id: uuid.UUID,
    ator: Usuario,
    permissao: Permissao,
) -> Atendimento:
    """Cross-tenant, fora do escopo ou sigiloso sem permissão → 404."""
    item = await db.scalar(
        select(Atendimento).where(
            Atendimento.id == atendimento_id, Atendimento.tenant_id == tenant_id
        )
    )
    if (
        item is None
        or not escopo_permite(ator, permissao, estabelecimento_id=item.estabelecimento_id)
        or (item.sigiloso and not pode_ver_conteudo(ator, "SIGILOSO"))
    ):
        raise NotFound("Atendimento não encontrado.")
    return item


def _aberto(item: Atendimento) -> None:
    if item.status != "ABERTO":
        raise Conflict(
            "Atendimento encerrado; registre uma retificação ou abra novo atendimento.",
            code="atendimento_encerrado",
        )


async def _validar_retroativo(
    db: AsyncSession, tenant_id: uuid.UUID, dados: AtendimentoCreate, ator: Usuario
) -> None:
    """B.6-056 — contingência: flag do tenant, autorização, período e justificativa."""
    agora = _agora()
    iniciado = _utc(dados.iniciado_em)
    if iniciado > agora + timedelta(minutes=5):
        raise Unprocessable("O atendimento não pode iniciar no futuro.", code="data_futura")
    if not dados.retroativo:
        if iniciado < agora - timedelta(days=1):
            raise Unprocessable(
                "Atendimento com data anterior a 24 horas deve ser sinalizado como retroativo.",
                code="retroativo_nao_sinalizado",
            )
        return
    if not await configuracoes.valor(
        db, tenant_id, "prontuario.retroativo_contingencia_ativa", False
    ):
        raise Conflict(
            "Digitação retroativa só é aceita com a contingência ativada pelo gestor.",
            code="retroativo_nao_habilitado",
        )
    if not tem_permissao(ator, Permissao.PRONTUARIO_RETIFICAR):
        raise PermissionDenied("Seu perfil não está autorizado a digitar retroativamente.")
    if len((dados.justificativa_retroativa or "").strip()) < 20:
        raise Unprocessable(
            "Digitação retroativa exige justificativa com pelo menos 20 caracteres.",
            code="retroativo_sem_justificativa",
        )
    limite = int(await configuracoes.valor(db, tenant_id, "prontuario.retroativo_dias_maximos", 30))
    if iniciado < agora - timedelta(days=limite):
        raise Unprocessable(
            f"Digitação retroativa limitada a {limite} dias.", code="retroativo_fora_do_limite"
        )


async def abrir_atendimento(
    db: AsyncSession, tenant_id: uuid.UUID, dados: AtendimentoCreate, ator: Usuario, cliente: dict
) -> Atendimento:
    """B.6-004/056 — abre o atendimento na primeira etapa configurada."""
    await _cidadao(db, tenant_id, dados.cidadao_id)
    if dados.estabelecimento_id:
        estab = await db.scalar(
            select(Estabelecimento.id).where(
                Estabelecimento.id == dados.estabelecimento_id,
                Estabelecimento.tenant_id == tenant_id,
            )
        )
        if not estab or not escopo_permite(
            ator, Permissao.PRONTUARIO_CRIAR, estabelecimento_id=dados.estabelecimento_id
        ):
            raise NotFound("Estabelecimento não encontrado.")
    await _validar_retroativo(db, tenant_id, dados, ator)
    etapas = await configuracoes.valor(db, tenant_id, "prontuario.etapas", [])
    valores = dados.model_dump()
    if not dados.retroativo:
        valores["justificativa_retroativa"] = None
    item = Atendimento(
        tenant_id=tenant_id,
        profissional_id=None,
        etapa=etapas[0] if etapas else None,
        **valores,
        criado_por_id=ator.id,
        atualizado_por_id=ator.id,
    )
    db.add(item)
    await db.flush()
    await _auditar(
        db,
        ator,
        tenant_id,
        "CRIAR",
        "atendimento",
        item.id,
        cliente,
        dados_depois={"status": item.status, "retroativo": item.retroativo, "etapa": item.etapa},
        justificativa=item.justificativa_retroativa,
    )
    await db.commit()
    await db.refresh(item)
    return item


async def obter_atendimento(
    db: AsyncSession, tenant_id: uuid.UUID, atendimento_id: uuid.UUID, ator: Usuario, cliente: dict
) -> Atendimento:
    item = await atendimento(db, tenant_id, atendimento_id, ator, Permissao.PRONTUARIO_LER)
    await registrar_leitura_sensivel(
        db,
        usuario=ator,
        recurso="atendimento",
        recurso_id=item.id,
        finalidade="consulta_prontuario",
        cliente=cliente,
    )
    await db.commit()
    return item


async def avancar_etapa(
    db: AsyncSession,
    tenant_id: uuid.UUID,
    atendimento_id: uuid.UUID,
    etapa: str,
    ator: Usuario,
    cliente: dict,
) -> Atendimento:
    """B.6-004 — só avança para frente, dentro das etapas do tenant."""
    item = await atendimento(db, tenant_id, atendimento_id, ator, Permissao.PRONTUARIO_EDITAR)
    _aberto(item)
    etapas = await configuracoes.valor(db, tenant_id, "prontuario.etapas", [])
    if etapa not in etapas:
        raise Unprocessable("Etapa não configurada para o tenant.", code="etapa_invalida")
    if item.etapa in etapas and etapas.index(etapa) <= etapas.index(item.etapa):
        raise Conflict("O atendimento só avança para etapas seguintes.", code="etapa_regressiva")
    anterior = item.etapa
    item.etapa = etapa
    item.versao += 1
    item.atualizado_por_id = ator.id
    await _auditar(
        db,
        ator,
        tenant_id,
        "ATUALIZAR",
        "atendimento",
        item.id,
        cliente,
        dados_antes={"etapa": anterior},
        dados_depois={"etapa": etapa},
    )
    await db.commit()
    await db.refresh(item)
    return item


def _idade_anos(nascimento: date | None, referencia: date) -> int | None:
    if nascimento is None:
        return None
    return (
        referencia.year
        - nascimento.year
        - ((referencia.month, referencia.day) < (nascimento.month, nascimento.day))
    )


def _regra_aplica(regra: dict, item: Atendimento, cidadao: Cidadao) -> bool:
    idade = _idade_anos(cidadao.data_nascimento, _utc(item.iniciado_em).date())
    if regra.get("tipo_atendimento") not in (None, item.tipo):
        return False
    if regra.get("estabelecimento_id") not in (None, str(item.estabelecimento_id)):
        return False
    if regra.get("sexo") not in (None, cidadao.sexo):
        return False
    if regra.get("idade_min_anos") is not None and (
        idade is None or idade < regra["idade_min_anos"]
    ):
        return False
    if regra.get("idade_max_anos") is not None and (
        idade is None or idade > regra["idade_max_anos"]
    ):
        return False
    return True


async def campos_pendentes(db: AsyncSession, tenant_id: uuid.UUID, item: Atendimento) -> list[str]:
    """B.6-006 — campos obrigatórios por unidade/idade/sexo/tipo, definidos pelo tenant."""
    regras = await configuracoes.valor(db, tenant_id, "prontuario.campos_obrigatorios", [])
    cidadao = await _cidadao(db, tenant_id, item.cidadao_id)
    exigidos: set[str] = set()
    for regra in regras:
        if _regra_aplica(regra, item, cidadao):
            exigidos |= {c for c in regra.get("campos", []) if c in CAMPOS_VERIFICAVEIS}
    if not exigidos:
        return []
    evolucoes = (
        await db.scalars(
            select(EvolucaoSOAP).where(
                EvolucaoSOAP.tenant_id == tenant_id, EvolucaoSOAP.atendimento_id == item.id
            )
        )
    ).all()
    preenchidos = {c for c in CAMPOS_SOAP if any((getattr(e, c) or "").strip() for e in evolucoes)}
    if await db.scalar(
        select(func.count(SinalVital.id)).where(
            SinalVital.tenant_id == tenant_id, SinalVital.atendimento_id == item.id
        )
    ):
        preenchidos.add("sinais_vitais")
    if await db.scalar(
        select(func.count(ProblemaClinico.id)).where(
            ProblemaClinico.tenant_id == tenant_id,
            ProblemaClinico.cidadao_id == item.cidadao_id,
            ProblemaClinico.ativo.is_(True),
        )
    ):
        preenchidos.add("problema")
    if item.classificacao_risco:
        preenchidos.add("classificacao_risco")
    return sorted(exigidos - preenchidos)


async def encerrar_atendimento(
    db: AsyncSession,
    tenant_id: uuid.UUID,
    atendimento_id: uuid.UUID,
    finalizado_em: datetime | None,
    ator: Usuario,
    cliente: dict,
) -> Atendimento:
    item = await atendimento(db, tenant_id, atendimento_id, ator, Permissao.PRONTUARIO_EDITAR)
    _aberto(item)
    faltando = await campos_pendentes(db, tenant_id, item)
    if faltando:
        raise Unprocessable(
            "Há campos obrigatórios não preenchidos.",
            code="campos_obrigatorios",
            errors=[
                {
                    "campo": c,
                    "mensagem": "Campo obrigatório pela regra do tenant.",
                    "codigo_regra": "prontuario.campos_obrigatorios",
                }
                for c in faltando
            ],
        )
    item.status = "ENCERRADO"
    item.finalizado_em = finalizado_em or _agora()
    item.atualizado_por_id = ator.id
    item.versao += 1
    await _auditar(
        db,
        ator,
        tenant_id,
        "ENCERRAR",
        "atendimento",
        item.id,
        cliente,
        dados_depois={"status": item.status},
    )
    await db.commit()
    await db.refresh(item)
    return item


async def validade_consulta(
    db: AsyncSession, tenant_id: uuid.UUID, cidadao_id: uuid.UUID, tipo: str
) -> dict:
    """B.6-041 — validade para reconsulta por tipo, configurada pelo tenant."""
    await _cidadao(db, tenant_id, cidadao_id)
    dias = (await configuracoes.valor(db, tenant_id, "prontuario.validade_consulta_dias", {})).get(
        tipo
    )
    base = {"cidadao_id": cidadao_id, "tipo": tipo, "dias_validade": dias}
    if dias is None:
        return {**base, "situacao": "NAO_CONFIGURADO"}
    ultimo = await db.scalar(
        select(func.max(Atendimento.finalizado_em)).where(
            Atendimento.tenant_id == tenant_id,
            Atendimento.cidadao_id == cidadao_id,
            Atendimento.tipo == tipo,
            Atendimento.status == "ENCERRADO",
        )
    )
    if ultimo is None:
        return {**base, "situacao": "SEM_ATENDIMENTO"}
    valida_ate = _utc(ultimo).date() + timedelta(days=int(dias))
    return {
        **base,
        "situacao": "VIGENTE" if date.today() <= valida_ate else "VENCIDA",
        "ultimo_atendimento_em": ultimo,
        "valida_ate": valida_ate,
    }


# ── SOAP, assinatura e retificação (B.6-004, B.6-057) ───────────────────────
async def registrar_soap(
    db: AsyncSession,
    tenant_id: uuid.UUID,
    atendimento_id: uuid.UUID,
    dados: SOAPCreate,
    ator: Usuario,
    cliente: dict,
) -> EvolucaoSOAP:
    item = await atendimento(db, tenant_id, atendimento_id, ator, Permissao.PRONTUARIO_EDITAR)
    _aberto(item)
    if not any(v and v.strip() for v in dados.model_dump().values()):
        raise Unprocessable("Preencha ao menos um campo do SOAP.", code="soap_vazio")
    evolucao = EvolucaoSOAP(
        tenant_id=tenant_id,
        atendimento_id=item.id,
        **dados.model_dump(),
        criado_por_id=ator.id,
        atualizado_por_id=ator.id,
    )
    db.add(evolucao)
    await db.flush()
    await _auditar(db, ator, tenant_id, "CRIAR", "evolucao_soap", evolucao.id, cliente)
    await db.commit()
    await db.refresh(evolucao)
    return evolucao


async def _evolucao(db, tenant_id, evolucao_id, ator, permissao) -> EvolucaoSOAP:
    item = await db.scalar(
        select(EvolucaoSOAP).where(
            EvolucaoSOAP.id == evolucao_id, EvolucaoSOAP.tenant_id == tenant_id
        )
    )
    if item is None:
        raise NotFound("Evolução não encontrada.")
    await atendimento(db, tenant_id, item.atendimento_id, ator, permissao)
    return item


async def listar_soap(
    db: AsyncSession, tenant_id: uuid.UUID, atendimento_id: uuid.UUID, ator: Usuario, cliente: dict
) -> list[EvolucaoSOAP]:
    item = await atendimento(db, tenant_id, atendimento_id, ator, Permissao.PRONTUARIO_LER)
    linhas = (
        await db.scalars(
            select(EvolucaoSOAP)
            .where(EvolucaoSOAP.tenant_id == tenant_id, EvolucaoSOAP.atendimento_id == item.id)
            .order_by(EvolucaoSOAP.created_at)
        )
    ).all()
    await registrar_leitura_sensivel(
        db,
        usuario=ator,
        recurso="evolucao_soap",
        recurso_id=item.id,
        finalidade="consulta_prontuario",
        cliente=cliente,
    )
    await db.commit()
    return list(linhas)


async def assinar_soap(
    db: AsyncSession, tenant_id: uuid.UUID, evolucao_id: uuid.UUID, ator: Usuario, cliente: dict
) -> EvolucaoSOAP:
    item = await _evolucao(db, tenant_id, evolucao_id, ator, Permissao.PRONTUARIO_ASSINAR)
    if item.assinado_em:
        raise Conflict("Evolução já assinada.", code="ja_assinado")
    item.assinado_em = _agora()
    item.atualizado_por_id = ator.id
    item.versao += 1
    await _auditar(db, ator, tenant_id, "ASSINAR", "evolucao_soap", item.id, cliente)
    await db.commit()
    await db.refresh(item)
    return item


async def retificar_soap(
    db: AsyncSession,
    tenant_id: uuid.UUID,
    evolucao_id: uuid.UUID,
    dados: RetificacaoSOAPCreate,
    ator: Usuario,
    cliente: dict,
) -> EvolucaoSOAP:
    """B.6-057 — gera nova versão encadeada; a assinada é preservada."""
    original = await _evolucao(db, tenant_id, evolucao_id, ator, Permissao.PRONTUARIO_RETIFICAR)
    if not original.assinado_em:
        raise Conflict("Apenas evolução assinada pode ser retificada.", code="nao_assinado")
    nova = EvolucaoSOAP(
        tenant_id=tenant_id,
        atendimento_id=original.atendimento_id,
        retifica_de_id=original.id,
        **dados.model_dump(exclude={"justificativa"}),
        criado_por_id=ator.id,
        atualizado_por_id=ator.id,
    )
    db.add(nova)
    await db.flush()
    await _auditar(
        db,
        ator,
        tenant_id,
        "RETIFICAR",
        "evolucao_soap",
        nova.id,
        cliente,
        dados_depois={"retifica_de_id": str(original.id)},
        justificativa=dados.justificativa,
    )
    await db.commit()
    await db.refresh(nova)
    return nova


# ── Sinais vitais e antropometria (B.6-010/011/012) ─────────────────────────
async def _classificar_imc(
    db: AsyncSession, tenant_id: uuid.UUID, imc: float, cidadao: Cidadao, em: date
) -> dict:
    """Classifica pela tabela versionada do tenant; sem tabela, não classifica."""
    tabelas = await configuracoes.valor(
        db, tenant_id, "prontuario.tabelas_classificacao_nutricional", []
    )
    idade = _idade_anos(cidadao.data_nascimento, em)
    for tabela in tabelas:
        if not tabela.get("ativo", False):
            continue
        if tabela.get("sexo") not in (None, cidadao.sexo):
            continue
        if idade is None or not (
            tabela.get("idade_min_anos", 0) <= idade <= tabela.get("idade_max_anos", 200)
        ):
            continue
        for faixa in tabela.get("faixas", []):
            minimo, maximo = faixa.get("imc_min"), faixa.get("imc_max")
            if (minimo is None or imc >= minimo) and (maximo is None or imc < maximo):
                return {
                    "classificacao": faixa.get("classificacao"),
                    "ciclo_vida": tabela.get("ciclo_vida"),
                    "tabela_versao": tabela.get("versao"),
                }
    return {"classificacao": None, "pendencia": "TABELA_REFERENCIA_NAO_CONFIGURADA"}


async def registrar_sinais(
    db: AsyncSession,
    tenant_id: uuid.UUID,
    atendimento_id: uuid.UUID,
    dados: SinalVitalCreate,
    ator: Usuario,
    cliente: dict,
) -> SinalVital:
    item = await atendimento(db, tenant_id, atendimento_id, ator, Permissao.PRONTUARIO_EDITAR)
    _aberto(item)
    valores = dict(dados.dados)
    if dados.peso_kg is not None:
        valores["peso_kg"] = dados.peso_kg
    if dados.altura_cm is not None:
        valores["altura_cm"] = dados.altura_cm
    if dados.peso_kg is not None and dados.altura_cm is not None:
        imc = round(dados.peso_kg / (dados.altura_cm / 100) ** 2, 2)
        cidadao = await _cidadao(db, tenant_id, item.cidadao_id)
        valores["imc"] = imc
        valores["estado_nutricional"] = await _classificar_imc(
            db, tenant_id, imc, cidadao, _utc(item.iniciado_em).date()
        )
    sinal = SinalVital(
        tenant_id=tenant_id,
        atendimento_id=item.id,
        cidadao_id=item.cidadao_id,
        dados=valores,
        criado_por_id=ator.id,
        atualizado_por_id=ator.id,
    )
    db.add(sinal)
    await db.flush()
    await _auditar(db, ator, tenant_id, "CRIAR", "sinal_vital", sinal.id, cliente)
    await db.commit()
    await db.refresh(sinal)
    return sinal


async def _atendimentos_visiveis(db, tenant_id, cidadao_id, ator) -> dict[uuid.UUID, Atendimento]:
    linhas = (
        await db.scalars(
            select(Atendimento).where(
                Atendimento.tenant_id == tenant_id, Atendimento.cidadao_id == cidadao_id
            )
        )
    ).all()
    return {
        a.id: a
        for a in linhas
        if escopo_permite(ator, Permissao.PRONTUARIO_LER, estabelecimento_id=a.estabelecimento_id)
        and (not a.sigiloso or pode_ver_conteudo(ator, "SIGILOSO"))
    }


async def serie_sinais(
    db: AsyncSession, tenant_id: uuid.UUID, cidadao_id: uuid.UUID, ator: Usuario, cliente: dict
) -> list[SinalVital]:
    """B.6-012 — série histórica do cidadão, respeitando escopo e sigilo."""
    await _cidadao(db, tenant_id, cidadao_id)
    visiveis = await _atendimentos_visiveis(db, tenant_id, cidadao_id, ator)
    linhas = (
        await db.scalars(
            select(SinalVital)
            .where(SinalVital.tenant_id == tenant_id, SinalVital.cidadao_id == cidadao_id)
            .order_by(SinalVital.created_at)
        )
    ).all()
    await registrar_leitura_sensivel(
        db,
        usuario=ator,
        recurso="sinais_vitais",
        recurso_id=cidadao_id,
        finalidade="serie_historica",
        cliente=cliente,
    )
    await db.commit()
    return [s for s in linhas if s.atendimento_id in visiveis]


# ── Problemas e alergias (B.6-015/016) ──────────────────────────────────────
async def _validar_codigo(db: AsyncSession, sistema: str, codigo: str) -> bool:
    """Confere na base oficial importada; sem base, aceita e marca não validado."""
    modelo = {"CID10": Cid10, "CIAP2": Ciap2}.get(sistema)
    if modelo is None or not await db.scalar(select(func.count()).select_from(modelo)):
        return False
    if not await db.scalar(
        select(modelo.codigo).where(modelo.codigo == codigo, modelo.ativo.is_(True))
    ):
        raise Unprocessable(
            f"Código {codigo} não existe na tabela {sistema} importada.", code="codigo_inexistente"
        )
    return True


async def registrar_problema(
    db: AsyncSession,
    tenant_id: uuid.UUID,
    cidadao_id: uuid.UUID,
    dados: ProblemaCreate,
    ator: Usuario,
    cliente: dict,
) -> ProblemaClinico:
    await _cidadao(db, tenant_id, cidadao_id)
    codigo = dados.codigo.strip().upper()
    if await db.scalar(
        select(ProblemaClinico.id).where(
            ProblemaClinico.tenant_id == tenant_id,
            ProblemaClinico.cidadao_id == cidadao_id,
            ProblemaClinico.sistema == dados.sistema,
            ProblemaClinico.codigo == codigo,
            ProblemaClinico.ativo.is_(True),
        )
    ):
        raise Conflict("Problema já ativo na lista do cidadão.", code="problema_duplicado")
    validado = await _validar_codigo(db, dados.sistema, codigo)
    item = ProblemaClinico(
        tenant_id=tenant_id,
        cidadao_id=cidadao_id,
        codigo=codigo,
        sistema=dados.sistema,
        descricao=dados.descricao,
        validado_referencia=validado,
        criado_por_id=ator.id,
        atualizado_por_id=ator.id,
    )
    db.add(item)
    await db.flush()
    await _auditar(db, ator, tenant_id, "CRIAR", "problema_clinico", item.id, cliente)
    await db.commit()
    await db.refresh(item)
    return item


async def listar_problemas(
    db: AsyncSession, tenant_id: uuid.UUID, cidadao_id: uuid.UUID, ator: Usuario, cliente: dict
) -> list[ProblemaClinico]:
    await _cidadao(db, tenant_id, cidadao_id)
    linhas = (
        await db.scalars(
            select(ProblemaClinico)
            .where(ProblemaClinico.tenant_id == tenant_id, ProblemaClinico.cidadao_id == cidadao_id)
            .order_by(ProblemaClinico.ativo.desc(), ProblemaClinico.created_at.desc())
        )
    ).all()
    await registrar_leitura_sensivel(
        db,
        usuario=ator,
        recurso="problema_clinico",
        recurso_id=cidadao_id,
        finalidade="consulta_prontuario",
        cliente=cliente,
    )
    await db.commit()
    return list(linhas)


async def _encerrar(db, tenant_id, modelo, item_id, motivo, ator, cliente, recurso, texto):
    item = await db.scalar(
        select(modelo).where(modelo.id == item_id, modelo.tenant_id == tenant_id)
    )
    if item is None:
        raise NotFound(texto)
    if not item.ativo:
        raise Conflict("Registro já encerrado.", code="ja_encerrado")
    item.ativo = False
    item.encerrado_em = _agora()
    item.encerrado_motivo = motivo
    item.atualizado_por_id = ator.id
    await _auditar(db, ator, tenant_id, "BAIXAR", recurso, item.id, cliente, justificativa=motivo)
    await db.commit()
    await db.refresh(item)
    return item


async def encerrar_problema(db, tenant_id, problema_id, motivo, ator, cliente) -> ProblemaClinico:
    return await _encerrar(
        db,
        tenant_id,
        ProblemaClinico,
        problema_id,
        motivo,
        ator,
        cliente,
        "problema_clinico",
        "Problema não encontrado.",
    )


async def registrar_alergia(
    db: AsyncSession,
    tenant_id: uuid.UUID,
    cidadao_id: uuid.UUID,
    dados: AlergiaCreate,
    ator: Usuario,
    cliente: dict,
) -> Alergia:
    await _cidadao(db, tenant_id, cidadao_id)
    item = Alergia(
        tenant_id=tenant_id,
        cidadao_id=cidadao_id,
        **dados.model_dump(),
        criado_por_id=ator.id,
        atualizado_por_id=ator.id,
    )
    db.add(item)
    await db.flush()
    await _auditar(
        db,
        ator,
        tenant_id,
        "CRIAR",
        "alergia",
        item.id,
        cliente,
        dados_depois={"categoria": item.categoria},
    )
    await db.commit()
    await db.refresh(item)
    return item


async def listar_alergias(
    db: AsyncSession, tenant_id: uuid.UUID, cidadao_id: uuid.UUID, ator: Usuario, cliente: dict
) -> list[Alergia]:
    await _cidadao(db, tenant_id, cidadao_id)
    linhas = (
        await db.scalars(
            select(Alergia)
            .where(Alergia.tenant_id == tenant_id, Alergia.cidadao_id == cidadao_id)
            .order_by(Alergia.ativo.desc(), Alergia.created_at.desc())
        )
    ).all()
    await registrar_leitura_sensivel(
        db,
        usuario=ator,
        recurso="alergia",
        recurso_id=cidadao_id,
        finalidade="consulta_prontuario",
        cliente=cliente,
    )
    await db.commit()
    return list(linhas)


async def encerrar_alergia(db, tenant_id, alergia_id, motivo, ator, cliente) -> Alergia:
    return await _encerrar(
        db,
        tenant_id,
        Alergia,
        alergia_id,
        motivo,
        ator,
        cliente,
        "alergia",
        "Alergia não encontrada.",
    )


# ── Plano de cuidados (B.6-017) ─────────────────────────────────────────────
async def registrar_plano(
    db: AsyncSession,
    tenant_id: uuid.UUID,
    atendimento_id: uuid.UUID,
    dados: PlanoCreate,
    ator: Usuario,
    cliente: dict,
) -> PlanoCuidado:
    item = await atendimento(db, tenant_id, atendimento_id, ator, Permissao.PRONTUARIO_EDITAR)
    _aberto(item)
    plano = PlanoCuidado(
        tenant_id=tenant_id,
        atendimento_id=item.id,
        **dados.model_dump(),
        criado_por_id=ator.id,
        atualizado_por_id=ator.id,
    )
    db.add(plano)
    await db.flush()
    await _auditar(db, ator, tenant_id, "CRIAR", "plano_cuidado", plano.id, cliente)
    await db.commit()
    await db.refresh(plano)
    return plano


# ── Prescrição (B.6-019/033) ────────────────────────────────────────────────
def receituarios(itens: list[dict]) -> list[dict]:
    """B.6-033 — separa os itens por tipo de receituário."""
    grupos: dict[str, list[int]] = {}
    for indice, item in enumerate(itens):
        grupos.setdefault(item.get("tipo_receituario", "COMUM"), []).append(indice)
    return [{"tipo_receituario": t, "itens": i} for t, i in sorted(grupos.items())]


async def _alertas(
    db: AsyncSession,
    tenant_id: uuid.UUID,
    cidadao_id: uuid.UUID,
    itens: list[dict],
    ignorar_id: uuid.UUID | None = None,
) -> dict:
    """Alerta, não bloqueia (regra 9). Só alerta o que é verificável sem inferência."""
    alergias = (
        await db.scalars(
            select(Alergia).where(
                Alergia.tenant_id == tenant_id,
                Alergia.cidadao_id == cidadao_id,
                Alergia.ativo.is_(True),
                Alergia.categoria == "MEDICAMENTO",
                Alergia.agente_codigo.is_not(None),
            )
        )
    ).all()
    por_codigo = {a.agente_codigo: a for a in alergias}
    alerta_alergia = [
        {
            "item": i,
            "medicamento_codigo": it["medicamento_codigo"],
            "alergia_id": str(por_codigo[it["medicamento_codigo"]].id),
            "agente": por_codigo[it["medicamento_codigo"]].agente_descricao,
        }
        for i, it in enumerate(itens)
        if it.get("medicamento_codigo") in por_codigo
    ]
    codigos = [it.get("medicamento_codigo") for it in itens if it.get("medicamento_codigo")]
    duplicados = sorted({c for c in codigos if codigos.count(c) > 1})
    em_uso: set[str] = set()
    anteriores = (
        await db.scalars(
            select(Prescricao).where(
                Prescricao.tenant_id == tenant_id, Prescricao.cidadao_id == cidadao_id
            )
        )
    ).all()
    for anterior in anteriores:
        if anterior.id == ignorar_id:
            continue
        em_uso |= {
            it.get("medicamento_codigo")
            for it in anterior.itens
            if it.get("uso_continuo") and it.get("medicamento_codigo")
        }
    duplicados_uso = sorted(set(codigos) & em_uso)
    return {
        "alergia": alerta_alergia,
        "duplicidade": {"na_prescricao": duplicados, "uso_continuo_ativo": duplicados_uso},
        "interacao": ALERTA_SEM_BASE,
        "medicamento_potencialmente_perigoso": ALERTA_SEM_BASE,
        "disponibilidade_estoque": {"situacao": "NAO_AVALIADO", "motivo": "estoque_fase_8"},
    }


async def _validar_medicamentos(db: AsyncSession, itens: list[dict]) -> None:
    if not await db.scalar(select(func.count()).select_from(Medicamento)):
        return
    for i, item in enumerate(itens):
        codigo = item.get("medicamento_codigo")
        if codigo and not await db.scalar(
            select(Medicamento.codigo_obm).where(
                Medicamento.codigo_obm == codigo, Medicamento.ativo.is_(True)
            )
        ):
            raise Unprocessable(
                f"Medicamento {codigo} não existe na base importada.",
                code="medicamento_inexistente",
                errors=[
                    {
                        "campo": f"itens[{i}].medicamento_codigo",
                        "mensagem": "Código não encontrado.",
                        "codigo_regra": "referencia.medicamentos",
                    }
                ],
            )


async def _gravar_prescricao(
    db, tenant_id, item: Atendimento, itens: list[dict], ator, cliente, copiada_de_id=None
) -> Prescricao:
    await _validar_medicamentos(db, itens)
    alertas = await _alertas(db, tenant_id, item.cidadao_id, itens)
    prescricao = Prescricao(
        tenant_id=tenant_id,
        atendimento_id=item.id,
        cidadao_id=item.cidadao_id,
        itens=itens,
        alertas=alertas,
        copiada_de_id=copiada_de_id,
        criado_por_id=ator.id,
        atualizado_por_id=ator.id,
    )
    db.add(prescricao)
    await db.flush()
    await _auditar(
        db,
        ator,
        tenant_id,
        "CRIAR",
        "prescricao",
        prescricao.id,
        cliente,
        dados_depois={
            "itens": len(itens),
            "copiada_de_id": str(copiada_de_id) if copiada_de_id else None,
            "alertas_alergia": len(alertas["alergia"]),
        },
    )
    await db.commit()
    await db.refresh(prescricao)
    return prescricao


async def prescrever(
    db: AsyncSession,
    tenant_id: uuid.UUID,
    atendimento_id: uuid.UUID,
    dados: PrescricaoCreate,
    ator: Usuario,
    cliente: dict,
) -> Prescricao:
    item = await atendimento(db, tenant_id, atendimento_id, ator, Permissao.PRESCRICAO_CRIAR)
    _aberto(item)
    return await _gravar_prescricao(
        db, tenant_id, item, [i.model_dump() for i in dados.itens], ator, cliente
    )


async def copiar_prescricao(
    db: AsyncSession,
    tenant_id: uuid.UUID,
    atendimento_id: uuid.UUID,
    dados: PrescricaoCopiar,
    ator: Usuario,
    cliente: dict,
) -> Prescricao:
    """B.6-019 — cópia assistida: só do mesmo cidadão; alertas reavaliados."""
    item = await atendimento(db, tenant_id, atendimento_id, ator, Permissao.PRESCRICAO_CRIAR)
    _aberto(item)
    origem = await db.scalar(
        select(Prescricao).where(
            Prescricao.id == dados.prescricao_origem_id, Prescricao.tenant_id == tenant_id
        )
    )
    if origem is None:
        raise NotFound("Prescrição de origem não encontrada.")
    await atendimento(db, tenant_id, origem.atendimento_id, ator, Permissao.PRONTUARIO_LER)
    if origem.cidadao_id != item.cidadao_id:
        raise Unprocessable("A prescrição de origem é de outro cidadão.", code="cidadao_divergente")
    indices = (
        dados.indices_itens if dados.indices_itens is not None else list(range(len(origem.itens)))
    )
    if not indices or any(i < 0 or i >= len(origem.itens) for i in indices):
        raise Unprocessable("Itens selecionados inválidos.", code="itens_invalidos")
    return await _gravar_prescricao(
        db,
        tenant_id,
        item,
        [dict(origem.itens[i]) for i in indices],
        ator,
        cliente,
        copiada_de_id=origem.id,
    )


async def listar_prescricoes(
    db: AsyncSession, tenant_id: uuid.UUID, cidadao_id: uuid.UUID, ator: Usuario, cliente: dict
) -> list[Prescricao]:
    await _cidadao(db, tenant_id, cidadao_id)
    visiveis = await _atendimentos_visiveis(db, tenant_id, cidadao_id, ator)
    linhas = (
        await db.scalars(
            select(Prescricao)
            .where(Prescricao.tenant_id == tenant_id, Prescricao.cidadao_id == cidadao_id)
            .order_by(Prescricao.created_at.desc())
        )
    ).all()
    await registrar_leitura_sensivel(
        db,
        usuario=ator,
        recurso="prescricao",
        recurso_id=cidadao_id,
        finalidade="consulta_prontuario",
        cliente=cliente,
    )
    await db.commit()
    return [p for p in linhas if p.atendimento_id in visiveis]


async def assinar_prescricao(
    db: AsyncSession, tenant_id: uuid.UUID, prescricao_id: uuid.UUID, ator: Usuario, cliente: dict
) -> Prescricao:
    item = await db.scalar(
        select(Prescricao).where(Prescricao.id == prescricao_id, Prescricao.tenant_id == tenant_id)
    )
    if item is None:
        raise NotFound("Prescrição não encontrada.")
    await atendimento(db, tenant_id, item.atendimento_id, ator, Permissao.PRONTUARIO_ASSINAR)
    if item.assinada_em:
        raise Conflict("Prescrição já assinada.", code="ja_assinado")
    item.assinada_em = _agora()
    item.versao += 1
    item.atualizado_por_id = ator.id
    await _auditar(db, ator, tenant_id, "ASSINAR", "prescricao", item.id, cliente)
    await db.commit()
    await db.refresh(item)
    return item


# ── Registros assistenciais configuráveis (B.6-013/018/023/025/032/034/037…039) ──
async def _formulario(db, tenant_id, codigo: str) -> FormularioDinamico:
    formulario = await db.scalar(
        select(FormularioDinamico)
        .where(
            FormularioDinamico.tenant_id == tenant_id,
            FormularioDinamico.codigo == codigo,
            FormularioDinamico.ativo.is_(True),
        )
        .order_by(FormularioDinamico.versao.desc())
        .limit(1)
    )
    if formulario is None:
        raise NotFound("Formulário do tipo de registro não encontrado.")
    return formulario


async def _validar_tipo(
    db, tenant_id, tipo: str, dados: dict
) -> tuple[uuid.UUID | None, int | None]:
    tipos = await configuracoes.valor(db, tenant_id, "prontuario.tipos_registro", {})
    if not tipos:
        return None, None
    if tipo not in tipos:
        raise Unprocessable(
            "Tipo de registro não configurado para o tenant.", code="tipo_registro_invalido"
        )
    codigo = (tipos[tipo] or {}).get("formulario_codigo")
    if not codigo:
        return None, None
    formulario = await _formulario(db, tenant_id, codigo)
    erros = validar_resposta(formulario.schema_json, dados)
    if erros:
        raise Unprocessable(
            "Os dados não correspondem ao formulário.", code="formulario_invalido", errors=erros
        )
    return formulario.id, formulario.versao


async def criar_registro(
    db: AsyncSession,
    tenant_id: uuid.UUID,
    dados: RegistroAssistencialCreate,
    ator: Usuario,
    cliente: dict,
) -> RegistroAssistencial:
    """Exame, encaminhamento, documento, notificação, ficha, escala, atividade coletiva…"""
    await _cidadao(db, tenant_id, dados.cidadao_id)
    estabelecimento_id = None
    sigiloso = dados.sigiloso
    if dados.atendimento_id:
        item = await atendimento(
            db, tenant_id, dados.atendimento_id, ator, Permissao.PRONTUARIO_EDITAR
        )
        _aberto(item)
        if item.cidadao_id != dados.cidadao_id:
            raise Conflict(
                "O atendimento não pertence ao cidadão informado.", code="cidadao_divergente"
            )
        estabelecimento_id = item.estabelecimento_id
        sigiloso = sigiloso or item.sigiloso
    formulario_id, versao_formulario = await _validar_tipo(db, tenant_id, dados.tipo, dados.dados)
    registro = RegistroAssistencial(
        tenant_id=tenant_id,
        estabelecimento_id=estabelecimento_id,
        **dados.model_dump(exclude={"sigiloso"}),
        sigiloso=sigiloso,
        formulario_id=formulario_id,
        versao_formulario=versao_formulario,
        criado_por_id=ator.id,
        atualizado_por_id=ator.id,
    )
    db.add(registro)
    await db.flush()
    await _auditar(
        db,
        ator,
        tenant_id,
        "CRIAR",
        "registro_assistencial",
        registro.id,
        cliente,
        dados_depois={"tipo": registro.tipo},
    )
    await db.commit()
    await db.refresh(registro)
    return registro


def _registro_visivel(ator: Usuario, registro: RegistroAssistencial, permissao: Permissao) -> bool:
    return escopo_permite(ator, permissao, estabelecimento_id=registro.estabelecimento_id) and (
        not registro.sigiloso or pode_ver_conteudo(ator, "SIGILOSO")
    )


async def _registro(db, tenant_id, registro_id, ator, permissao) -> RegistroAssistencial:
    item = await db.scalar(
        select(RegistroAssistencial).where(
            RegistroAssistencial.id == registro_id, RegistroAssistencial.tenant_id == tenant_id
        )
    )
    if item is None or not _registro_visivel(ator, item, permissao):
        raise NotFound("Registro não encontrado.")
    return item


async def assinar_registro(db, tenant_id, registro_id, ator, cliente) -> RegistroAssistencial:
    """B.6-032/034 — documento clínico assinado fica imutável."""
    item = await _registro(db, tenant_id, registro_id, ator, Permissao.PRONTUARIO_ASSINAR)
    if item.assinado_em:
        raise Conflict("Registro já assinado.", code="ja_assinado")
    item.assinado_em = _agora()
    item.versao += 1
    item.atualizado_por_id = ator.id
    await _auditar(db, ator, tenant_id, "ASSINAR", "registro_assistencial", item.id, cliente)
    await db.commit()
    await db.refresh(item)
    return item


async def retificar_registro(
    db, tenant_id, registro_id, dados: RetificacaoRegistroCreate, ator, cliente
) -> RegistroAssistencial:
    """B.6-057 — nova versão; a anterior vira RETIFICADO e é preservada."""
    original = await _registro(db, tenant_id, registro_id, ator, Permissao.PRONTUARIO_RETIFICAR)
    if not original.assinado_em:
        raise Conflict("Apenas registro assinado pode ser retificado.", code="nao_assinado")
    if original.status == "RETIFICADO":
        raise Conflict(
            "Registro já retificado; retifique a versão mais recente.", code="versao_superada"
        )
    formulario_id, versao_formulario = await _validar_tipo(
        db, tenant_id, original.tipo, dados.dados
    )
    original.status = "RETIFICADO"
    original.atualizado_por_id = ator.id
    novo = RegistroAssistencial(
        tenant_id=tenant_id,
        atendimento_id=original.atendimento_id,
        cidadao_id=original.cidadao_id,
        estabelecimento_id=original.estabelecimento_id,
        tipo=original.tipo,
        dados=dados.dados,
        sigiloso=original.sigiloso,
        formulario_id=formulario_id,
        versao_formulario=versao_formulario,
        retifica_de_id=original.id,
        retificacao_justificativa=dados.justificativa,
        criado_por_id=ator.id,
        atualizado_por_id=ator.id,
    )
    db.add(novo)
    await db.flush()
    await _auditar(
        db,
        ator,
        tenant_id,
        "RETIFICAR",
        "registro_assistencial",
        novo.id,
        cliente,
        dados_depois={"retifica_de_id": str(original.id)},
        justificativa=dados.justificativa,
    )
    await db.commit()
    await db.refresh(novo)
    return novo


async def listar_registros(
    db: AsyncSession,
    tenant_id: uuid.UUID,
    cidadao_id: uuid.UUID,
    tipo: str | None,
    ator: Usuario,
    cliente: dict,
) -> list[RegistroAssistencial]:
    await _cidadao(db, tenant_id, cidadao_id)
    stmt = select(RegistroAssistencial).where(
        RegistroAssistencial.tenant_id == tenant_id, RegistroAssistencial.cidadao_id == cidadao_id
    )
    if tipo:
        stmt = stmt.where(RegistroAssistencial.tipo == tipo)
    linhas = (await db.scalars(stmt.order_by(RegistroAssistencial.created_at.desc()))).all()
    await registrar_leitura_sensivel(
        db,
        usuario=ator,
        recurso="registro_assistencial",
        recurso_id=cidadao_id,
        finalidade="consulta_prontuario",
        cliente=cliente,
    )
    await db.commit()
    return [r for r in linhas if _registro_visivel(ator, r, Permissao.PRONTUARIO_LER)]


# ── Linha do tempo (B.6-048/049) ────────────────────────────────────────────
async def linha_do_tempo(
    db: AsyncSession, tenant_id: uuid.UUID, cidadao_id: uuid.UUID, ator: Usuario, cliente: dict
) -> list[dict]:
    """Sigiloso aparece velado (metadados) para quem não tem permissão."""
    await _cidadao(db, tenant_id, cidadao_id)
    eventos: list[dict] = []
    atendimentos = (
        await db.scalars(
            select(Atendimento).where(
                Atendimento.tenant_id == tenant_id, Atendimento.cidadao_id == cidadao_id
            )
        )
    ).all()
    for a in atendimentos:
        if not escopo_permite(
            ator, Permissao.PRONTUARIO_LER, estabelecimento_id=a.estabelecimento_id
        ):
            continue
        eventos.append(
            velar(
                {
                    "id": str(a.id),
                    "data_atendimento": a.iniciado_em,
                    "estabelecimento_id": str(a.estabelecimento_id)
                    if a.estabelecimento_id
                    else None,
                    "tipo": "ATENDIMENTO",
                    "subtipo": a.tipo,
                    "status": a.status,
                    "sigiloso": a.sigiloso,
                },
                ator,
                nivel_sigilo="SIGILOSO" if a.sigiloso else "NORMAL",
            )
        )
    registros = (
        await db.scalars(
            select(RegistroAssistencial).where(
                RegistroAssistencial.tenant_id == tenant_id,
                RegistroAssistencial.cidadao_id == cidadao_id,
            )
        )
    ).all()
    for r in registros:
        if not escopo_permite(
            ator, Permissao.PRONTUARIO_LER, estabelecimento_id=r.estabelecimento_id
        ):
            continue
        eventos.append(
            velar(
                {
                    "id": str(r.id),
                    "data_atendimento": r.created_at,
                    "estabelecimento_id": str(r.estabelecimento_id)
                    if r.estabelecimento_id
                    else None,
                    "tipo": "REGISTRO",
                    "subtipo": r.tipo,
                    "status": r.status,
                    "sigiloso": r.sigiloso,
                },
                ator,
                nivel_sigilo="SIGILOSO" if r.sigiloso else "NORMAL",
            )
        )
    eventos.sort(key=lambda e: _utc(e["data_atendimento"]), reverse=True)
    await registrar_leitura_sensivel(
        db,
        usuario=ator,
        recurso="linha_tempo_prontuario",
        recurso_id=cidadao_id,
        finalidade="consulta_linha_tempo",
        cliente=cliente,
    )
    await db.commit()
    return eventos
