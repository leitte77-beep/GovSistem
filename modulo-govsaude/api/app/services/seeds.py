"""Seeds nacionais copiados para cada tenant (padrão da plataforma).

O motor de autorização é código; os grupos e permissões são dados. O seed é
idempotente para que o provisionamento possa rodar em todo login.
"""

from __future__ import annotations

import uuid
from datetime import date

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.permissoes import ALL_PERMISSIONS, GRUPOS_NACIONAIS, ROTULOS_GRUPO, Permissao
from app.models.nucleo import ConfiguracaoTenant, Grupo, GrupoPermissao, PermissaoGlobal
from app.models.rede import Prioridade


async def garantir_permissoes(db: AsyncSession) -> None:
    existentes = {
        codigo
        for (codigo,) in (
            await db.execute(select(PermissaoGlobal.codigo))
        ).all()
    }
    for permissao in ALL_PERMISSIONS:
        if permissao.value in existentes:
            continue
        db.add(
            PermissaoGlobal(
                codigo=permissao.value,
                descricao=_descricao(permissao),
                modulo="govsaude",
            )
        )
    await db.flush()


def _descricao(permissao: Permissao) -> str:
    recurso, _, acao = permissao.value.partition(":")
    return f"{acao.replace('_', ' ').title()} em {recurso.replace('_', ' ')}"


async def garantir_grupos_tenant(db: AsyncSession, tenant_id: uuid.UUID) -> None:
    await garantir_permissoes(db)
    existentes = {
        grupo.codigo: grupo
        for grupo in (
            await db.execute(select(Grupo).where(Grupo.tenant_id == tenant_id))
        ).scalars()
    }
    for codigo, definicao in GRUPOS_NACIONAIS.items():
        grupo = existentes.get(codigo)
        if grupo is None:
            grupo = Grupo(
                tenant_id=tenant_id,
                codigo=codigo,
                nome=ROTULOS_GRUPO[codigo],
                sistema=True,
                requer_consentimento=bool(definicao.get("requer_consentimento")),
            )
            db.add(grupo)
            await db.flush()
        atuais = {
            gp.permissao_codigo
            for gp in (
                await db.execute(
                    select(GrupoPermissao).where(GrupoPermissao.grupo_id == grupo.id)
                )
            ).scalars()
        }
        desejadas = {p.value for p in definicao["permissoes"]}
        for codigo_permissao in desejadas - atuais:
            db.add(
                GrupoPermissao(
                    grupo_id=grupo.id,
                    permissao_codigo=codigo_permissao,
                )
            )
        for codigo_permissao in atuais - desejadas:
            registro = await db.scalar(
                select(GrupoPermissao).where(
                    GrupoPermissao.grupo_id == grupo.id,
                    GrupoPermissao.permissao_codigo == codigo_permissao,
                )
            )
            if registro:
                await db.delete(registro)
    await db.flush()


CONFIGURACOES_PADRAO: dict[str, dict] = {
    "odontologia.retroativo_dias_maximos": {
        "valor": {"valor": 30},
        "tipo": "numero",
        "descricao": "Dias máximos para digitação retroativa de atendimento odontológico (B.3-013); exige justificativa.",
    },
    "odontologia.classificacoes_risco": {
        "valor": {"valor": []},
        "tipo": "json",
        "descricao": "Classificações de risco odontológico aceitas (B.3-004). Vazio = sem validação; preencher com o protocolo municipal.",
    },
    "prontuario.etapas": {
        "valor": {"valor": []},
        "tipo": "json",
        "descricao": "Etapas ordenadas do atendimento (B.6-004), ex.: RECEPCAO, ACOLHIMENTO, TRIAGEM, CONSULTA. Vazio = sem fluxo de etapas.",
    },
    "prontuario.campos_obrigatorios": {
        "valor": {"valor": []},
        "tipo": "json",
        "descricao": "Regras de campos obrigatórios no encerramento (B.6-006): lista de {tipo_atendimento, estabelecimento_id, sexo, idade_min_anos, idade_max_anos, campos}.",
    },
    "prontuario.retroativo_contingencia_ativa": {
        "valor": {"valor": False},
        "tipo": "booleano",
        "descricao": "Liga a digitação retroativa em contingência (B.6-056). Desligada = retroativo recusado.",
    },
    "prontuario.retroativo_dias_maximos": {
        "valor": {"valor": 30},
        "tipo": "numero",
        "descricao": "Período máximo, em dias, da digitação retroativa do PEC (B.6-056).",
    },
    "prontuario.tipos_registro": {
        "valor": {"valor": {}},
        "tipo": "json",
        "descricao": "Tipos de registro assistencial aceitos ({tipo: {formulario_codigo}}); formulário valida escalas/fichas (B.6-025). Vazio = tipo livre.",
    },
    "prontuario.tabelas_classificacao_nutricional": {
        "valor": {"valor": []},
        "tipo": "json",
        "descricao": "Tabelas versionadas de classificação do IMC por ciclo de vida (B.6-010). Vazio = IMC sem classificação; preencher com a referência oficial vigente.",
    },
    "prontuario.validade_consulta_dias": {
        "valor": {"valor": {}},
        "tipo": "json",
        "descricao": "Validade de consulta para reconsulta por tipo de atendimento, em dias (B.6-041). Vazio = não controlado.",
    },
    "estoque.alerta_vencimento_dias": {
        "valor": {"valor": 90},
        "tipo": "numero",
        "descricao": "Antecedência, em dias, do alerta de lote a vencer (B.4-035). Valor operacional; validar com a assistência farmacêutica.",
    },
    "estoque.janela_duplicidade_dias": {
        "valor": {"valor": 30},
        "tipo": "numero",
        "descricao": "Janela, em dias, para bloquear dispensação duplicada do mesmo produto ao cidadão em qualquer unidade (B.4-021); 0 desliga. Valor operacional.",
    },
    "estoque.campos_documento_controlado": {
        "valor": {"valor": []},
        "tipo": "json",
        "descricao": "Campos obrigatórios do documento na dispensação de controlado/antimicrobiano (B.4-024). Vazio = exige só o documento; preencher conforme a norma vigente.",
    },
    "estoque.consumo_anormal_desvios": {
        "valor": {"valor": 2},
        "tipo": "numero",
        "descricao": "Número de desvios-padrão acima da média mensal que caracteriza consumo anormal (B.4-036).",
    },
    "estoque.consumo_meses_historico": {
        "valor": {"valor": 6},
        "tipo": "numero",
        "descricao": "Meses fechados usados na média/desvio de consumo (B.4-036).",
    },
    "estoque.curva_abc_limites": {
        "valor": {"valor": [80, 95]},
        "tipo": "json",
        "descricao": "Percentuais acumulados que separam as classes A/B/C (B.4-039).",
    },
    "estoque.sugestao_meses_historico": {
        "valor": {"valor": 3},
        "tipo": "numero",
        "descricao": "Meses de consumo usados na sugestão de compra (B.4-007).",
    },
    "estoque.sugestao_cobertura_meses": {
        "valor": {"valor": 1},
        "tipo": "numero",
        "descricao": "Cobertura alvo, em meses, quando o produto não tem estoque máximo (B.4-007).",
    },
    "geral.fuso_horario": {
        "valor": {"valor": "America/Sao_Paulo"},
        "tipo": "texto",
        "descricao": "Fuso IANA usado em competência, turnos e relatórios.",
    },
    "seguranca.politica_senha": {
        "valor": {
            "minimo": 12,
            "maiuscula": 1,
            "minuscula": 1,
            "digito": 1,
            "simbolo": 1,
            "expira_dias": 90,
            "historico": 5,
            "tentativas": 5,
        },
        "tipo": "json",
        "descricao": "Política de senha do tenant (B.12-049/051).",
    },
    "seguranca.termo_obrigatorio": {
        "valor": {"valor": False},
        "tipo": "booleano",
        "descricao": "Exige aceite do termo de uso vigente (B.12-023).",
    },
    "seguranca.mfa_obrigatorio": {
        "valor": {"valor": False},
        "tipo": "booleano",
        "descricao": "Exige MFA TOTP para todos os usuários do tenant.",
    },
    "lgpd.retencao_clinica_anos": {
        "valor": {"valor": 20},
        "tipo": "numero",
        "descricao": "Prazo mínimo de guarda do prontuário (configurável e documentado).",
    },
    "lgpd.retencao_gps_dias": {
        "valor": {"valor": 90},
        "tipo": "numero",
        "descricao": "Retenção de trajetos de GPS de visitas (B.1-029).",
    },
    "suporte.consentimento": {
        "valor": {"valor": False},
        "tipo": "booleano",
        "descricao": "Permite acesso de suporte da plataforma ao tenant.",
    },
    "documentos.brasao": {
        "valor": {"chave_objeto": None},
        "tipo": "json",
        "descricao": "Brasão usado em documentos e relatórios do tenant.",
    },
    "cidadao.uso_foto": {
        "valor": {"valor": {"permitir": True, "obrigatoria": False}},
        "tipo": "json",
        "descricao": "Política de uso/obrigatoriedade da foto do cidadão.",
    },
    "cidadao.duplicidade_pesos": {
        "valor": {
            "valor": {
                "nome": 40,
                "nascimento": 30,
                "mae": 20,
                "cpf": 40,
                "cns": 40,
            }
        },
        "tipo": "json",
        "descricao": "Pesos da pontuação de duplicidade do cadastro único.",
    },
    "cidadao.duplicidade_limiar": {
        "valor": {"valor": 60},
        "tipo": "numero",
        "descricao": "Pontuação mínima para sugerir possível duplicidade.",
    },
}


PRIORIDADES_CONFIGURAVEIS = [
    {
        "codigo": "ELETIVA",
        "rotulo": "Eletiva (configurável)",
        "ordem": 100,
        "prioridade_legal": False,
        "observacoes": (
            "Seed configurável de prioridade clínica. Não representa prioridade "
            "legal e deve ser revisado pelo gestor municipal."
        ),
    },
    {
        "codigo": "PRIORITARIA",
        "rotulo": "Prioritária (configurável)",
        "ordem": 50,
        "prioridade_legal": False,
        "observacoes": (
            "Seed configurável de prioridade clínica. A prioridade legal deve ser "
            "cadastrada pelo tenant com a base normativa municipal/estadual."
        ),
    },
]


async def garantir_prioridades_configuraveis(
    db: AsyncSession, tenant_id: uuid.UUID
) -> None:
    """Seed idempotente de prioridades não legais, marcadas como configuráveis."""
    existentes = {
        codigo
        for (codigo,) in (
            await db.execute(
                select(Prioridade.codigo).where(Prioridade.tenant_id == tenant_id)
            )
        ).all()
    }
    for definicao in PRIORIDADES_CONFIGURAVEIS:
        if definicao["codigo"] in existentes:
            continue
        db.add(
            Prioridade(
                tenant_id=tenant_id,
                codigo=definicao["codigo"],
                rotulo=definicao["rotulo"],
                ordem=definicao["ordem"],
                prioridade_legal=definicao["prioridade_legal"],
                observacoes=definicao["observacoes"],
                vigencia_inicio=date.today(),
                ativo=True,
                versao=1,
            )
        )
    await db.flush()


async def garantir_configuracoes_padrao(db: AsyncSession, tenant_id: uuid.UUID) -> None:
    existentes = {
        chave
        for (chave,) in (
            await db.execute(
                select(ConfiguracaoTenant.chave).where(
                    ConfiguracaoTenant.tenant_id == tenant_id,
                    ConfiguracaoTenant.vigencia_fim.is_(None),
                )
            )
        ).all()
    }
    hoje = date.today()
    for chave, definicao in CONFIGURACOES_PADRAO.items():
        if chave in existentes:
            continue
        db.add(
            ConfiguracaoTenant(
                tenant_id=tenant_id,
                chave=chave,
                valor=definicao["valor"],
                tipo=definicao["tipo"],
                descricao=definicao["descricao"],
                editavel=True,
                versao=1,
                vigencia_inicio=hoje,
            )
        )
    await db.flush()


# ─────────────────────────────────────────────────────────────────────────────
# Fase 6 — formulários e modelos pré-configurados de programas
# ─────────────────────────────────────────────────────────────────────────────
FORMULARIOS_PROGRAMAS_SEED: list[dict] = [
    {
        "codigo": "SAUDE_MULHER_DADOS",
        "nome": "Saúde da mulher — dados estruturados",
        "schema_json": {
            "type": "object",
            "additionalProperties": False,
            "properties": {
                "gestante": {"type": "boolean"},
                "dum": {"type": ["string", "null"], "format": "date"},
                "ultima_coleta_colo": {
                    "type": ["string", "null"],
                    "format": "date",
                },
                "ultima_mamografia": {
                    "type": ["string", "null"],
                    "format": "date",
                },
                "planejamento_reprodutivo": {
                    "type": ["string", "null"],
                    "enum": [
                        "NAO_SE_APLICA",
                        "PRESERVATIVO",
                        "PILULA",
                        "DIU",
                        "LAQUEADURA",
                        "OUTRO",
                        None,
                    ],
                },
                "climaterio": {"type": "boolean"},
            },
        },
    },
    {
        "codigo": "SAUDE_CRIANCA_DADOS",
        "nome": "Saúde da criança — crescimento e desenvolvimento",
        "schema_json": {
            "type": "object",
            "additionalProperties": False,
            "properties": {
                "peso_kg": {"type": ["number", "null"], "minimum": 0, "maximum": 200},
                "altura_cm": {
                    "type": ["number", "null"],
                    "minimum": 20,
                    "maximum": 250,
                },
                "perimetro_cefalico_cm": {
                    "type": ["number", "null"],
                    "minimum": 20,
                    "maximum": 70,
                },
                "desenvolvimento": {
                    "type": ["string", "null"],
                    "enum": ["ADEQUADO", "ALERTA", "ENCAMINHADO", None],
                },
                "alimentacao": {
                    "type": ["string", "null"],
                    "enum": [
                        "ALEITAMENTO_EXCLUSIVO",
                        "ALEITAMENTO_MISTO",
                        "ALIMENTACAO_COMPLEMENTAR",
                        "OUTRA",
                        None,
                    ],
                },
                "vacinacao_em_dia": {"type": "boolean"},
            },
        },
    },
    {
        "codigo": "GESTANTE_DADOS",
        "nome": "Gestante — dados estruturados do pré-natal",
        "schema_json": {
            "type": "object",
            "additionalProperties": False,
            "properties": {
                "dum": {"type": ["string", "null"], "format": "date"},
                "gestacoes": {"type": ["integer", "null"], "minimum": 0, "maximum": 30},
                "partos": {"type": ["integer", "null"], "minimum": 0, "maximum": 30},
                "abortos": {"type": ["integer", "null"], "minimum": 0, "maximum": 30},
                "risco_gestacional": {
                    "type": ["string", "null"],
                    "enum": ["HABITUAL", "ALTO", "A_VALIDAR", None],
                },
            },
        },
    },
    {
        "codigo": "CRONICAS_DADOS",
        "nome": "Condições crônicas — dados estruturados",
        "schema_json": {
            "type": "object",
            "additionalProperties": False,
            "properties": {
                "hipertenso": {"type": "boolean"},
                "diabetico": {"type": "boolean"},
                "tabagista": {"type": "boolean"},
                "ultima_avaliacao": {
                    "type": ["string", "null"],
                    "format": "date",
                },
            },
        },
    },
]

_AVISO_SEED = (
    "SEED A_VALIDAR — estrutura do modelo sem regra clínica. Periodicidade, "
    "faixa etária e condições (CID-10/CIAP-2) devem ser preenchidas pelo tenant "
    "a partir do protocolo oficial vigente; o programa nasce inativo."
)

PROGRAMAS_SEED: list[dict] = [
    {
        "codigo": "SAUDE_MULHER",
        "nome": "Saúde da mulher",
        "tipo": "PROGRAMA",
        "linha_cuidado": "SAUDE_MULHER",
        "descricao": (
            "Acompanhamento de colo/mama, planejamento reprodutivo e climatério. "
            f"{_AVISO_SEED}"
        ),
        "formulario": "SAUDE_MULHER_DADOS",
        "criterios": {
            "sexos": ["FEMININO"],
            "idade_min_anos": None,
            "idade_max_anos": None,
            "condicoes": [],
            "exigir_condicao": False,
        },
        "periodicidade_padrao_dias": None,
        "itens": [
            ("CONSULTA", "Avaliação em saúde da mulher", None),
            ("EXAME", "Citologia oncótica (colo do útero)", None),
            ("EXAME", "Mamografia", None),
            ("FORNECIMENTO", "Planejamento reprodutivo", None),
            ("CONSULTA", "Acompanhamento do climatério", None),
        ],
    },
    {
        "codigo": "SAUDE_CRIANCA",
        "nome": "Saúde da criança",
        "tipo": "PROGRAMA",
        "linha_cuidado": "SAUDE_CRIANCA",
        "descricao": (
            "Crescimento, desenvolvimento, alimentação e situação vacinal. "
            f"{_AVISO_SEED}"
        ),
        "formulario": "SAUDE_CRIANCA_DADOS",
        "criterios": {
            "sexos": None,
            "idade_min_anos": None,
            "idade_max_anos": None,
            "condicoes": [],
            "exigir_condicao": False,
        },
        "periodicidade_padrao_dias": None,
        "itens": [
            ("CONSULTA", "Puericultura (crescimento e desenvolvimento)", None),
            ("CONSULTA", "Avaliação nutricional", None),
            ("VACINA", "Verificação da situação vacinal", None),
            ("ORIENTACAO", "Alimentação e aleitamento", None),
        ],
    },
    {
        "codigo": "HIPERTENSAO",
        "nome": "Hipertensão arterial",
        "tipo": "PROGRAMA",
        "linha_cuidado": "CONDICOES_CRONICAS",
        "descricao": (
            "Acompanhamento de hipertensão com consultas, avaliação e fornecimento. "
            f"{_AVISO_SEED}"
        ),
        "formulario": "CRONICAS_DADOS",
        "criterios": {
            "sexos": None,
            "idade_min_anos": None,
            "idade_max_anos": None,
            "condicoes": [],
            "exigir_condicao": False,
        },
        "periodicidade_padrao_dias": None,
        "itens": [
            ("CONSULTA", "Consulta de acompanhamento da hipertensão", None),
            ("EXAME", "Avaliação clínica e exames de rotina", None),
            ("FORNECIMENTO", "Medicação anti-hipertensiva", None),
        ],
    },
    {
        "codigo": "DIABETES",
        "nome": "Diabetes mellitus",
        "tipo": "PROGRAMA",
        "linha_cuidado": "CONDICOES_CRONICAS",
        "descricao": (
            "Acompanhamento de diabetes com consultas, exames e fornecimento. "
            f"{_AVISO_SEED}"
        ),
        "formulario": "CRONICAS_DADOS",
        "criterios": {
            "sexos": None,
            "idade_min_anos": None,
            "idade_max_anos": None,
            "condicoes": [],
            "exigir_condicao": False,
        },
        "periodicidade_padrao_dias": None,
        "itens": [
            ("CONSULTA", "Consulta de acompanhamento do diabetes", None),
            ("EXAME", "Avaliação clínica e exames de rotina", None),
            ("FORNECIMENTO", "Medicação para diabetes", None),
        ],
    },
    {
        "codigo": "GESTANTE",
        "nome": "Gestante — pré-natal",
        "tipo": "PROGRAMA",
        "linha_cuidado": "GESTACAO",
        "descricao": (
            "Acompanhamento do pré-natal com consultas, exames e vacinação. "
            f"{_AVISO_SEED}"
        ),
        "formulario": "GESTANTE_DADOS",
        "marcador_gestante": True,
        "criterios": {
            "sexos": ["FEMININO"],
            "idade_min_anos": None,
            "idade_max_anos": None,
            "condicoes": [],
            "exigir_condicao": False,
        },
        "periodicidade_padrao_dias": None,
        "itens": [
            ("CONSULTA", "Consulta de pré-natal", None),
            ("EXAME", "Rotinas laboratoriais do pré-natal", None),
            ("VACINA", "Vacinação da gestante (conforme calendário)", None),
        ],
    },
]


def _criterios_sem_regra_oficial(criterios: dict) -> dict:
    """Mantém apenas a estrutura; regra clínica oficial entra na validação do tenant."""
    base = dict(criterios)
    base["idade_min_anos"] = None
    base["idade_max_anos"] = None
    base["condicoes"] = []
    base["exigir_condicao"] = False
    base.setdefault("observacoes", "SEED A_VALIDAR: defina as regras oficiais do protocolo.")
    return base


async def garantir_programas_padrao(
    db: AsyncSession, tenant_id: uuid.UUID
) -> None:
    """Seed idempotente dos modelos da Fase 6, marcados como A_VALIDAR."""
    from app.models.nucleo import FormularioDinamico
    from app.models.programa import Programa, ProgramaItem

    formularios: dict[str, uuid.UUID] = {}
    existentes_form = {
        (codigo, versao): formulario_id
        for formulario_id, codigo, versao in (
            await db.execute(
                select(
                    FormularioDinamico.id,
                    FormularioDinamico.codigo,
                    FormularioDinamico.versao,
                ).where(FormularioDinamico.tenant_id == tenant_id)
            )
        ).all()
    }
    for definicao in FORMULARIOS_PROGRAMAS_SEED:
        chave = (definicao["codigo"], 1)
        if chave in existentes_form:
            formularios[definicao["codigo"]] = existentes_form[chave]
            continue
        formulario = FormularioDinamico(
            tenant_id=tenant_id,
            codigo=definicao["codigo"],
            nome=definicao["nome"],
            versao=1,
            schema_json=definicao["schema_json"],
            ativo=True,
            vigencia_inicio=date.today(),
        )
        db.add(formulario)
        await db.flush()
        formularios[definicao["codigo"]] = formulario.id

    existentes_programa = {
        codigo
        for (codigo,) in (
            await db.execute(
                select(Programa.codigo).where(Programa.tenant_id == tenant_id)
            )
        ).all()
    }
    for definicao in PROGRAMAS_SEED:
        if definicao["codigo"] in existentes_programa:
            continue
        programa = Programa(
            tenant_id=tenant_id,
            codigo=definicao["codigo"],
            nome=definicao["nome"],
            tipo=definicao["tipo"],
            linha_cuidado=definicao["linha_cuidado"],
            descricao=definicao["descricao"],
            criterios_elegibilidade=_criterios_sem_regra_oficial(definicao["criterios"]),
            periodicidade_padrao_dias=None,
            formulario_id=formularios.get(definicao.get("formulario")),
            marcador_gestante=bool(definicao.get("marcador_gestante", False)),
            base_normativa=None,
            fonte="SEED interno — validar com o protocolo oficial vigente.",
            origem="SEED_A_VALIDAR",
            versao_programa="1",
            ativo=False,
            vigencia_inicio=date.today(),
            versao=1,
        )
        db.add(programa)
        await db.flush()
        for ordem, (tipo, descricao, _periodo_nao_validado) in enumerate(
            definicao["itens"], start=1
        ):
            db.add(
                ProgramaItem(
                    tenant_id=tenant_id,
                    programa_id=programa.id,
                    tipo=tipo,
                    descricao=descricao,
                    periodicidade_dias=None,
                    obrigatorio=True,
                    quantidade=1,
                    ordem=ordem,
                    ativo=True,
                    versao=1,
                    observacoes=_AVISO_SEED,
                )
            )
    await db.flush()
