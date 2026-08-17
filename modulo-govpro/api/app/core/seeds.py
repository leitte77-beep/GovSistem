"""Seeds idempotentes: perfis (globais) e dados de referência por tenant.

Os dados de referência (hipóteses legais, plano de classificação, tipos de
processo/documento, modelos, unidades de exemplo) são provisionados quando o
ente é criado via SSO (`sync-organization`), como ponto de partida — o ente
substitui pelo Plano de Classificação/TTD aprovado (ato normativo local).
"""

import uuid

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.dominio import (
    HipoteseLegal,
    ModeloDocumento,
    PlanoClassificacao,
    TipoDocumento,
    TipoProcesso,
)
from app.models.enums import GrauSigilo, NivelAssinatura, RoleName
from app.models.role import Role
from app.models.unidade import Unidade


async def seed_roles(db: AsyncSession) -> None:
    labels = {
        RoleName.ADMIN.value: "Administrador do GovPro",
        RoleName.SERVIDOR.value: "Servidor — atua nos processos da sua unidade",
        RoleName.CHEFE_UNIDADE.value: "Chefe de unidade — atribui e aprova",
        RoleName.PROTOCOLO.value: "Protocolo — autua, recebe e distribui",
        RoleName.AUTORIDADE_SIGNATARIA.value: "Autoridade signatária",
        RoleName.GESTOR_SIGILO.value: "Gestor de sigilo / autoridade classificadora",
        RoleName.ARQUIVISTA.value: "Arquivista / gestor documental",
        RoleName.DPO.value: "Encarregado de dados (DPO)",
        RoleName.AUDITOR.value: "Auditor — leitura ampla, sem edição",
    }
    for rn in RoleName:
        result = await db.execute(select(Role).where(Role.name == rn.value))
        if result.scalar_one_or_none() is None:
            db.add(Role(name=rn.value, label=labels[rn.value], is_system=True))


_HIPOTESES = [
    ("INF_PESSOAL", "Informação Pessoal", "LAI art. 31", None, 100),
    ("SIG_FISCAL", "Sigilo Fiscal", "CTN art. 198", None, None),
    ("SIG_BANCARIO", "Sigilo Bancário", "LC 105/2001", None, None),
    ("DIR_AUTORAL", "Direito Autoral", "Lei 9.610/1998", None, None),
    ("DOC_PREP", "Documento Preparatório", "LAI art. 7º §3º", None, None),
    ("INVESTIGACAO", "Investigação / Sindicância", "Lei 9.784/1999", None, None),
    ("RESERVADO", "Reservado", "LAI art. 24, I", GrauSigilo.RESERVADO.value, 5),
    ("SECRETO", "Secreto", "LAI art. 24, II", GrauSigilo.SECRETO.value, 15),
    ("ULTRASSECRETO", "Ultrassecreto", "LAI art. 24, III", GrauSigilo.ULTRASSECRETO.value, 25),
]

_PLANO = [
    ("000", "ADMINISTRAÇÃO GERAL", None),
    ("010", "Organização e Funcionamento", "000"),
    ("020", "Pessoal", "000"),
    ("030", "Material e Patrimônio", "000"),
    ("040", "Orçamento e Finanças", "000"),
    ("050", "Documentação e Informação", "000"),
    ("100", "ATIVIDADE-FIM", None),
    ("110", "Processos de Licenciamento", "100"),
    ("120", "Processos de Pessoal", "100"),
    ("130", "Convênios e Contratos", "100"),
]

_TIPOS_PROCESSO = [
    ("REQ_GERAL", "Requerimento Geral", True, ["PUBLICO", "RESTRITO"], 30),
    ("ESIC", "Pedido de Acesso à Informação (LAI)", True, ["PUBLICO"], 20),
    ("LICENCA_OBRA", "Licença de Obra / Alvará", True, ["PUBLICO", "RESTRITO"], None),
    ("CERTIDAO", "Certidão", True, ["PUBLICO"], None),
    ("RECURSO", "Recurso / Defesa Administrativa", True, ["PUBLICO", "RESTRITO"], 30),
]

_TIPOS_DOCUMENTO = [
    ("DESPACHO", "Despacho", NivelAssinatura.SIMPLES.value, True),
    ("OFICIO", "Ofício", NivelAssinatura.SIMPLES.value, True),
    ("MEMORANDO", "Memorando", NivelAssinatura.SIMPLES.value, False),
    ("PARECER", "Parecer", NivelAssinatura.SIMPLES.value, False),
    ("INFORMACAO", "Informação", NivelAssinatura.SIMPLES.value, False),
    ("CERTIDAO", "Certidão", NivelAssinatura.SIMPLES.value, True),
    ("PORTARIA", "Portaria", NivelAssinatura.QUALIFICADA.value, True),
    ("EDITAL", "Edital", NivelAssinatura.SIMPLES.value, True),
]

# Matriz de assinatura (sobreescreve os padrões do modelo por tipo de ato).
# Por padrão NÃO restringe perfis (`perfis_autorizados=None` → qualquer atuante),
# preservando o comportamento histórico. O ente configura a restrição pelo
# painel Administração → Matriz de Assinaturas (PATCH /matriz-assinaturas/{id}).
_MATRIZ_ASSINATURA = {
    "DESPACHO": {"perfis_autorizados": None, "qtd_assinaturas_minima": 1},
    "PARECER": {"perfis_autorizados": None, "qtd_assinaturas_minima": 1},
    "PORTARIA": {
        "perfis_autorizados": None,
        "qtd_assinaturas_minima": 1,
        "fundamento_normativo": "Lei 14.063/2020 — atos de maior relevância exigem assinatura qualificada",
    },
    "CERTIDAO": {"perfis_autorizados": None, "qtd_assinaturas_minima": 1},
    "EDITAL": {"perfis_autorizados": None, "qtd_assinaturas_minima": 1},
}


async def seed_dominio(db: AsyncSession, tenant_id: uuid.UUID) -> None:
    await _seed_hipoteses(db, tenant_id)
    plano = await _seed_plano(db, tenant_id)
    await _seed_tipos_processo(db, tenant_id, plano)
    await _seed_tipos_documento(db, tenant_id)
    await _seed_modelos(db, tenant_id)
    await _seed_unidades(db, tenant_id)
    await _seed_motivos_sobrestamento(db, tenant_id)
    await _seed_feriados_nacionais(db, tenant_id)
    await _seed_ttd(db, tenant_id, plano)


_MOTIVOS_SOBRESTAMENTO = [
    ("AGUARDANDO_INFO", "Aguardando informações complementares"),
    ("AGUARDANDO_PARECER", "Aguardando parecer técnico"),
    ("AGUARDANDO_DECISAO", "Aguardando decisão superior"),
    ("AGUARDANDO_JUDICIAL", "Aguardando decisão judicial"),
    ("AGUARDANDO_EVENTO", "Aguardando evento/prazo externo"),
]


async def _seed_motivos_sobrestamento(db: AsyncSession, tenant_id: uuid.UUID) -> None:
    from app.models.gestao import SobrestamentoMotivo

    for codigo, nome in _MOTIVOS_SOBRESTAMENTO:
        result = await db.execute(
            select(SobrestamentoMotivo).where(
                SobrestamentoMotivo.tenant_id == tenant_id,
                SobrestamentoMotivo.nome == nome,
            )
        )
        if result.scalar_one_or_none() is None:
            db.add(SobrestamentoMotivo(tenant_id=tenant_id, nome=nome))


async def _seed_feriados_nacionais(db: AsyncSession, tenant_id: uuid.UUID) -> None:

    from app.core.feriados import feriados_nacionais
    from app.core.timeutils import ano_brasilia
    from app.models.gestao import Feriado

    ano_atual = ano_brasilia()
    for ano in (ano_atual, ano_atual + 1):
        for data, nome in feriados_nacionais(ano).items():
            result = await db.execute(
                select(Feriado).where(Feriado.tenant_id == tenant_id, Feriado.data == data)
            )
            if result.scalar_one_or_none() is None:
                db.add(
                    Feriado(
                        tenant_id=tenant_id,
                        data=data,
                        nome=nome,
                        escopo="NACIONAL",
                    )
                )


async def _seed_hipoteses(db: AsyncSession, tenant_id: uuid.UUID) -> None:
    for codigo, descricao, base_legal, grau, prazo in _HIPOTESES:
        result = await db.execute(
            select(HipoteseLegal).where(
                HipoteseLegal.tenant_id == tenant_id, HipoteseLegal.codigo == codigo
            )
        )
        if result.scalar_one_or_none() is None:
            db.add(
                HipoteseLegal(
                    tenant_id=tenant_id,
                    codigo=codigo,
                    descricao=descricao,
                    base_legal=base_legal,
                    grau_sigilo=grau,
                    prazo_sigilo_anos=prazo,
                )
            )


async def _seed_plano(db: AsyncSession, tenant_id: uuid.UUID) -> dict:
    by_codigo = {}
    for codigo, descricao, pai in _PLANO:
        result = await db.execute(
            select(PlanoClassificacao).where(
                PlanoClassificacao.tenant_id == tenant_id, PlanoClassificacao.codigo == codigo
            )
        )
        classe = result.scalar_one_or_none()
        if classe is None:
            classe = PlanoClassificacao(tenant_id=tenant_id, codigo=codigo, descricao=descricao)
            db.add(classe)
            await db.flush()
        by_codigo[codigo] = classe

    await db.flush()
    for codigo, _desc, pai in _PLANO:
        if pai:
            by_codigo[codigo].classe_pai_id = by_codigo[pai].id
    await db.flush()
    return by_codigo


async def _seed_tipos_processo(db: AsyncSession, tenant_id: uuid.UUID, plano: dict) -> dict:
    by_codigo = {}
    for codigo, nome, publico, niveis, prazo in _TIPOS_PROCESSO:
        result = await db.execute(
            select(TipoProcesso).where(
                TipoProcesso.tenant_id == tenant_id, TipoProcesso.codigo == codigo
            )
        )
        tipo = result.scalar_one_or_none()
        if tipo is None:
            tipo = TipoProcesso(
                tenant_id=tenant_id,
                codigo=codigo,
                nome=nome,
                publico_externo=publico,
                niveis_permitidos=niveis,
                classificacao_padrao_id=plano.get("110").id if plano.get("110") else None,
                prazo_legal_dias=prazo,
            )
            db.add(tipo)
            await db.flush()
        by_codigo[codigo] = tipo
    await db.flush()
    return by_codigo


async def _seed_tipos_documento(db: AsyncSession, tenant_id: uuid.UUID) -> dict:
    by_codigo = {}
    for codigo, nome, nivel, numeracao in _TIPOS_DOCUMENTO:
        result = await db.execute(
            select(TipoDocumento).where(
                TipoDocumento.tenant_id == tenant_id, TipoDocumento.codigo == codigo
            )
        )
        tipo = result.scalar_one_or_none()
        if tipo is None:
            matriz = _MATRIZ_ASSINATURA.get(codigo, {})
            tipo = TipoDocumento(
                tenant_id=tenant_id,
                codigo=codigo,
                nome=nome,
                nivel_assinatura_minimo=nivel,
                numeracao=numeracao,
                perfis_autorizados=matriz.get("perfis_autorizados"),
                qtd_assinaturas_minima=matriz.get("qtd_assinaturas_minima", 1),
                assinatura_sequencial=matriz.get("assinatura_sequencial", False),
                exige_assinatura_externa=matriz.get("exige_assinatura_externa", False),
                permite_bloco=matriz.get("permite_bloco", True),
                fundamento_normativo=matriz.get("fundamento_normativo"),
            )
            db.add(tipo)
            await db.flush()
        by_codigo[codigo] = tipo
    await db.flush()
    return by_codigo


async def _seed_modelos(db: AsyncSession, tenant_id: uuid.UUID) -> None:
    result = await db.execute(select(ModeloDocumento).where(ModeloDocumento.tenant_id == tenant_id))
    if result.scalars().first() is not None:
        return

    despacho_html = (
        "<p><strong>DESPACHO</strong></p>"
        "<p>Processo: {{processo.nup}}</p>"
        "<p>Interessado: {{interessado.nome}}</p>"
        "<p>Unidade: {{unidade.sigla}}</p>"
        "<p>{{data_extenso}}</p>"
        "<p></p>"
    )
    db.add(
        ModeloDocumento(
            tenant_id=tenant_id,
            nome="Despacho padrão",
            conteudo_html=despacho_html,
        )
    )


async def _seed_unidades(db: AsyncSession, tenant_id: uuid.UUID) -> None:
    unidades = [
        ("PROTOCOLO", "Protocolo Central", True, "00001"),
        ("GAB", "Gabinete do Prefeito", True, "00002"),
        ("SEC_ADM", "Secretaria de Administração", False, None),
        ("SEC_OBRAS", "Secretaria de Obras", False, None),
    ]
    for sigla, nome, prot, codigo in unidades:
        result = await db.execute(
            select(Unidade).where(Unidade.tenant_id == tenant_id, Unidade.sigla == sigla)
        )
        if result.scalar_one_or_none() is None:
            db.add(
                Unidade(
                    tenant_id=tenant_id,
                    sigla=sigla,
                    nome=nome,
                    protocolizadora=prot,
                    codigo_protocolizadora=codigo,
                )
            )


async def _seed_ttd(db: AsyncSession, tenant_id: uuid.UUID, plano: dict) -> None:
    """TTD de exemplo (substituir pela TTD aprovada do ente)."""
    from app.models.arquivo import TabelaTemporalidade

    exemplo = [
        ("050", 5, 0, "ELIMINACAO", "Documentação e informação — eliminar após 5 anos"),
        ("110", 10, 5, "ELIMINACAO", "Licenciamento — eliminar após 15 anos"),
        ("120", 20, 0, "GUARDA_PERMANENTE", "Pessoal — guarda permanente"),
        ("130", 10, 5, "GUARDA_PERMANENTE", "Convênios e contratos — guarda permanente"),
    ]
    for codigo, corrente, intermediario, destinacao, observacao in exemplo:
        classe = plano.get(codigo)
        if classe is None:
            continue
        result = await db.execute(
            select(TabelaTemporalidade).where(TabelaTemporalidade.classe_id == classe.id)
        )
        if result.scalar_one_or_none() is None:
            db.add(
                TabelaTemporalidade(
                    tenant_id=tenant_id,
                    classe_id=classe.id,
                    prazo_corrente_anos=corrente,
                    prazo_intermediario_anos=intermediario,
                    destinacao_final=destinacao,
                    observacoes=observacao,
                )
            )
