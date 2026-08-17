"""Seed de demonstração do GovCompras (seções 96, 100-101, 128).

Idempotente: se a organização de demonstração já existir, não faz nada — pode
rodar em todo `docker compose up` sem duplicar dados.

Cria:
  * a organização demo, estrutura organizacional e as 7 personas fictícias;
  * os 6 templates de workflow (Pregão completo + 5 fluxos simplificados);
  * catálogo, fornecedores e o cenário-piloto completo dos "20 computadores"
    da Secretaria de Saúde, do surgimento da necessidade ao contrato em
    execução com um processo sucessor já aberto;
  * os dados extras exigidos pela seção 101 (contratos vencendo, ata quase
    esgotada, pregão parado no jurídico, pesquisa parada, devolução).

Todas as datas são relativas a `datetime.now()` no momento da execução —
nunca fixas — para o cenário continuar coerente não importa quando o seed for
rodado (seção "sempre relativo a agora").
"""

import asyncio
from datetime import date, datetime, timedelta, timezone

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import async_session
from app.core.permissoes import Perfil
from app.core.security import hash_password
from app.models.ata import AtaItemSaldo, AtaRegistroPreco
from app.models.compras import (
    CatalogoItem,
    CatalogoItemPrecoHistorico,
    Cotacao,
    CotacaoFornecedor,
    CotacaoItem,
    CotacaoPreco,
    Fornecedor,
)
from app.models.contrato import Contrato, ContratoItemSaldo, ContratoSaldo
from app.models.dotacao import Autorizacao, DotacaoOrcamentaria, ProcessoDotacao
from app.models.enums import (
    DecisaoAutorizacao,
    Prioridade,
    StatusAta,
    StatusContrato,
    StatusCotacao,
    StatusDotacao,
    StatusSolicitacao,
    TipoObjeto,
    TipoProcesso,
)
from app.models.fiscalizacao import OcorrenciaContrato
from app.models.licitacao import Adjudicacao, Edital, Homologacao, Proposta, Publicacao, Sessao
from app.models.organizacao import Organizacao, Secretaria, Setor, User
from app.models.planejamento import Dfd, Etp, EtpTopico, MatrizRisco, MatrizRiscoItem, TermoReferencia
from app.models.processo import ProcessoHistoricoEtapa, ProcessoInstancia
from app.models.solicitacao import Solicitacao, SolicitacaoItem
from app.models.workflow import WorkflowEtapa, WorkflowEtapaRequisito, WorkflowTemplate, WorkflowTransicao
from app.services import numeracao, workflow

ORG_EXTERNO_ID = "demo-govcompras"
SENHA_DEMO = "Govcompras@123"


def _agora() -> datetime:
    return datetime.now(timezone.utc)


def _dias_atras(n: int) -> date:
    return date.today() - timedelta(days=n)


def _data_atras(n: int) -> datetime:
    return _agora() - timedelta(days=n)


# ──────────────────────────────────────────────────────────────────────────
# 1. Organização e personas
# ──────────────────────────────────────────────────────────────────────────
async def seed_organizacao_e_personas(db: AsyncSession) -> tuple[Organizacao, dict[str, User]]:
    organizacao = Organizacao(
        externo_id=ORG_EXTERNO_ID,
        nome="Prefeitura Municipal de Demonstração",
        slug="demonstracao",
        uf="SC",
    )
    db.add(organizacao)
    await db.flush()

    senha_hash = hash_password(SENHA_DEMO)
    especificacao = [
        ("admin@govcompras.local", "Ana Beatriz Coordenadora", Perfil.ADMINISTRADOR, "Administradora do GovCompras"),
        ("compras@govcompras.local", "João da Silva", Perfil.COMPRAS, "Analista de Compras"),
        ("licitacao@govcompras.local", "Marcos Vinícius Pereira", Perfil.LICITACAO, "Pregoeiro"),
        ("saude@govcompras.local", "Fernanda Lima", Perfil.SOLICITANTE, "Diretora Administrativa — Secretaria de Saúde"),
        ("contabilidade@govcompras.local", "Roberto Almeida", Perfil.CONTABILIDADE, "Contador"),
        ("juridico@govcompras.local", "Camila Torres", Perfil.JURIDICO, "Procuradora Jurídica"),
        ("fiscal@govcompras.local", "José Santos", Perfil.FISCAL, "Fiscal de Contratos"),
    ]
    usuarios: dict[str, User] = {}
    for email, nome, perfil, cargo in especificacao:
        usuario = User(
            organizacao_id=organizacao.id,
            externo_id=f"demo-{perfil.value}",
            nome=nome,
            email=email,
            perfil=perfil.value,
            cargo=cargo,
            senha_demo_hash=senha_hash,
        )
        db.add(usuario)
        usuarios[perfil.value] = usuario
    await db.flush()
    return organizacao, usuarios


# ──────────────────────────────────────────────────────────────────────────
# 2. Estrutura organizacional
# ──────────────────────────────────────────────────────────────────────────
async def seed_estrutura(db: AsyncSession, org: Organizacao, usuarios: dict[str, User]) -> dict[str, Setor]:
    saude = Secretaria(organizacao_id=org.id, nome="Secretaria Municipal de Saúde", sigla="SMS")
    administracao = Secretaria(organizacao_id=org.id, nome="Secretaria Municipal de Administração", sigla="SMA")
    db.add_all([saude, administracao])
    await db.flush()

    setores_spec = [
        (saude, "Fundo Municipal de Saúde", "FMS", "solicitante_saude"),
        (administracao, "Departamento de Compras", "COMPRAS", "compras"),
        (administracao, "Setor de Licitações", "LICIT", "licitacao"),
        (administracao, "Contabilidade", "CONTAB", "contabilidade"),
        (administracao, "Procuradoria Jurídica", "JUR", "juridico"),
        (administracao, "Gabinete do Prefeito", "GAB", "autoridade"),
        (saude, "Fiscalização de Contratos — Saúde", "FISC-SMS", "fiscal"),
    ]
    setores: dict[str, Setor] = {}
    for secretaria, nome, sigla, chave in setores_spec:
        setor = Setor(secretaria_id=secretaria.id, nome=nome, sigla=sigla, papel_funcional=chave)
        db.add(setor)
        setores[chave] = setor
    await db.flush()

    # papel_funcional "solicitante_saude"/"fiscal" não são usados pela
    # resolução automática do motor de workflow (que usa o setor de origem do
    # processo para "solicitante"), mas identificam o setor "dono" de cada
    # secretaria para os usuários e para o cadastro administrativo.
    usuarios[Perfil.SOLICITANTE.value].setor_id = setores["solicitante_saude"].id
    usuarios[Perfil.COMPRAS.value].setor_id = setores["compras"].id
    usuarios[Perfil.LICITACAO.value].setor_id = setores["licitacao"].id
    usuarios[Perfil.CONTABILIDADE.value].setor_id = setores["contabilidade"].id
    usuarios[Perfil.JURIDICO.value].setor_id = setores["juridico"].id
    usuarios[Perfil.FISCAL.value].setor_id = setores["fiscal"].id
    usuarios[Perfil.ADMINISTRADOR.value].setor_id = setores["autoridade"].id

    setores["_secretaria_saude"] = saude
    setores["_secretaria_administracao"] = administracao
    await db.flush()
    return setores


# ──────────────────────────────────────────────────────────────────────────
# 3. Workflow templates
# ──────────────────────────────────────────────────────────────────────────
async def _criar_fluxo(
    db: AsyncSession,
    org: Organizacao,
    tipo: TipoProcesso,
    nome: str,
    etapas_spec: list[dict],
    devolucoes: list[tuple[str, str]] | None = None,
) -> dict[str, WorkflowEtapa]:
    template = WorkflowTemplate(organizacao_id=org.id, tipo_processo=tipo.value, nome=nome, versao=1, ativo=True)
    db.add(template)
    await db.flush()

    etapas: dict[str, WorkflowEtapa] = {}
    for i, spec in enumerate(etapas_spec, start=1):
        etapa = WorkflowEtapa(
            template_id=template.id,
            ordem=i,
            codigo=spec["codigo"],
            nome=spec["nome"],
            setor_papel_funcional=spec.get("setor"),
            sla_dias=spec.get("sla", 5),
            etapa_final=spec.get("final", False),
            cancelavel=spec.get("cancelavel", True),
        )
        db.add(etapa)
        await db.flush()
        for requisito in spec.get("requisitos", []):
            db.add(
                WorkflowEtapaRequisito(
                    etapa_id=etapa.id,
                    tipo=requisito["tipo"],
                    descricao=requisito["descricao"],
                    entidade_ref=requisito.get("entidade_ref"),
                    obrigatorio=requisito.get("obrigatorio", True),
                )
            )
        etapas[spec["codigo"]] = etapa
    await db.flush()

    ordenadas = list(etapas.values())
    for origem, destino in zip(ordenadas, ordenadas[1:]):
        db.add(WorkflowTransicao(etapa_origem_id=origem.id, etapa_destino_id=destino.id, tipo="avancar"))

    for codigo_origem, codigo_destino in devolucoes or []:
        db.add(
            WorkflowTransicao(
                etapa_origem_id=etapas[codigo_origem].id,
                etapa_destino_id=etapas[codigo_destino].id,
                tipo="devolver",
                rotulo=f"Devolver para {etapas[codigo_destino].nome}",
                exige_justificativa=True,
            )
        )
    await db.flush()
    return etapas


def _r_manual(descricao: str) -> dict:
    return {"tipo": "manual_check", "descricao": descricao, "obrigatorio": True}


def _r_auto(entidade_ref: str, descricao: str) -> dict:
    return {"tipo": "entidade_status", "descricao": descricao, "entidade_ref": entidade_ref, "obrigatorio": True}


async def seed_workflow_templates(db: AsyncSession, org: Organizacao) -> dict[str, dict[str, WorkflowEtapa]]:
    templates: dict[str, dict[str, WorkflowEtapa]] = {}

    templates["pregao"] = await _criar_fluxo(
        db, org, TipoProcesso.PREGAO, "Pregão Eletrônico — fluxo padrão",
        [
            {"codigo": "solicitacao", "nome": "Solicitação", "setor": "solicitante", "sla": 2},
            {"codigo": "dfd", "nome": "Documento de Formalização da Demanda", "setor": "compras", "sla": 3, "requisitos": [_r_auto("dfd", "DFD aprovado")]},
            {"codigo": "etp", "nome": "Estudo Técnico Preliminar", "setor": "compras", "sla": 5, "requisitos": [_r_auto("etp", "ETP aprovado")]},
            {"codigo": "termo_referencia", "nome": "Termo de Referência", "setor": "compras", "sla": 5, "requisitos": [_r_auto("termo_referencia", "Termo de Referência aprovado")]},
            {"codigo": "matriz_risco", "nome": "Análise de Riscos", "setor": "compras", "sla": 2, "requisitos": [_r_auto("matriz_risco", "Matriz de riscos preenchida")]},
            {"codigo": "pesquisa_precos", "nome": "Pesquisa de Preços", "setor": "compras", "sla": 7, "requisitos": [_r_auto("cotacao", "Pesquisa de preços concluída com no mínimo 3 respostas")]},
            {"codigo": "dotacao", "nome": "Dotação Orçamentária", "setor": "contabilidade", "sla": 3, "requisitos": [_r_auto("dotacao", "Dotação orçamentária confirmada")]},
            {"codigo": "autorizacao", "nome": "Autorização", "setor": "autoridade", "sla": 2, "requisitos": [_r_auto("autorizacao", "Autorizado pela autoridade competente")]},
            {"codigo": "parecer_juridico", "nome": "Parecer Jurídico", "setor": "juridico", "sla": 5, "requisitos": [_r_manual("Parecer jurídico favorável emitido")]},
            {"codigo": "edital", "nome": "Elaboração do Edital", "setor": "licitacao", "sla": 5, "requisitos": [_r_manual("Minuta do edital revisada e pronta para publicação")]},
            {"codigo": "publicacao", "nome": "Publicação", "setor": "licitacao", "sla": 3, "requisitos": [_r_auto("edital_publicado", "Edital publicado")]},
            {"codigo": "sessao", "nome": "Sessão Pública", "setor": "licitacao", "sla": 2, "requisitos": [_r_manual("Sessão pública realizada")]},
            {"codigo": "julgamento", "nome": "Julgamento", "setor": "licitacao", "sla": 3, "requisitos": [_r_manual("Propostas julgadas e classificadas")]},
            {"codigo": "adjudicacao", "nome": "Adjudicação", "setor": "licitacao", "sla": 2, "requisitos": [_r_manual("Adjudicação registrada")]},
            {"codigo": "homologacao", "nome": "Homologação", "setor": "autoridade", "sla": 2, "requisitos": [_r_auto("homologacao", "Processo homologado")]},
            {"codigo": "contrato", "nome": "Contrato", "setor": "licitacao", "sla": 5, "requisitos": [_r_manual("Contrato gerado e assinado")]},
            {"codigo": "fiscalizacao", "nome": "Execução e Fiscalização Contratual", "setor": "fiscal", "sla": 365},
        ],
        devolucoes=[
            ("dfd", "solicitacao"), ("etp", "solicitacao"), ("termo_referencia", "solicitacao"),
            ("dotacao", "pesquisa_precos"), ("autorizacao", "dotacao"),
            ("parecer_juridico", "termo_referencia"), ("edital", "parecer_juridico"),
            ("julgamento", "edital"), ("homologacao", "julgamento"),
        ],
    )

    templates["dispensa"] = await _criar_fluxo(
        db, org, TipoProcesso.DISPENSA, "Dispensa de Licitação — fluxo simplificado",
        [
            {"codigo": "solicitacao", "nome": "Solicitação", "setor": "solicitante", "sla": 2},
            {"codigo": "descritivo", "nome": "Descritivo do Objeto", "setor": "compras", "sla": 3, "requisitos": [_r_manual("Descritivo simplificado elaborado")]},
            {"codigo": "pesquisa_precos", "nome": "Pesquisa de Preços", "setor": "compras", "sla": 5, "requisitos": [_r_auto("cotacao", "Pesquisa de preços concluída")]},
            {"codigo": "dotacao", "nome": "Dotação Orçamentária", "setor": "contabilidade", "sla": 3, "requisitos": [_r_auto("dotacao", "Dotação confirmada")]},
            {"codigo": "autorizacao", "nome": "Autorização", "setor": "autoridade", "sla": 2, "requisitos": [_r_auto("autorizacao", "Autorizado")]},
            {"codigo": "contrato", "nome": "Contratação / Instrumento", "setor": "licitacao", "sla": 5, "requisitos": [_r_manual("Instrumento de contratação formalizado")]},
            {"codigo": "fiscalizacao", "nome": "Fiscalização", "setor": "fiscal", "sla": 365},
        ],
        devolucoes=[("descritivo", "solicitacao"), ("dotacao", "pesquisa_precos")],
    )

    templates["inexigibilidade"] = await _criar_fluxo(
        db, org, TipoProcesso.INEXIGIBILIDADE, "Inexigibilidade de Licitação",
        [
            {"codigo": "solicitacao", "nome": "Solicitação", "setor": "solicitante", "sla": 2},
            {"codigo": "descritivo", "nome": "Descritivo e Justificativa Técnica", "setor": "compras", "sla": 3, "requisitos": [_r_manual("Justificativa técnica elaborada")]},
            {"codigo": "justificativa_juridica", "nome": "Justificativa de Inexigibilidade", "setor": "juridico", "sla": 5, "requisitos": [_r_manual("Razão de escolha do fornecedor e inexigibilidade aprovadas pelo Jurídico")]},
            {"codigo": "dotacao", "nome": "Dotação Orçamentária", "setor": "contabilidade", "sla": 3, "requisitos": [_r_auto("dotacao", "Dotação confirmada")]},
            {"codigo": "autorizacao", "nome": "Autorização", "setor": "autoridade", "sla": 2, "requisitos": [_r_auto("autorizacao", "Autorizado")]},
            {"codigo": "contrato", "nome": "Contratação / Instrumento", "setor": "licitacao", "sla": 5, "requisitos": [_r_manual("Instrumento de contratação formalizado")]},
            {"codigo": "fiscalizacao", "nome": "Fiscalização", "setor": "fiscal", "sla": 365},
        ],
    )

    templates["credenciamento"] = await _criar_fluxo(
        db, org, TipoProcesso.CREDENCIAMENTO, "Credenciamento",
        [
            {"codigo": "solicitacao", "nome": "Solicitação", "setor": "solicitante", "sla": 2},
            {"codigo": "edital_chamamento", "nome": "Edital de Chamamento", "setor": "licitacao", "sla": 5, "requisitos": [_r_manual("Edital de chamamento publicado")]},
            {"codigo": "inscricoes", "nome": "Período de Inscrições", "setor": "licitacao", "sla": 10, "requisitos": [_r_manual("Prazo de inscrições encerrado")]},
            {"codigo": "habilitacao", "nome": "Habilitação dos Interessados", "setor": "licitacao", "sla": 5, "requisitos": [_r_manual("Interessados habilitados")]},
            {"codigo": "contrato", "nome": "Contratação", "setor": "licitacao", "sla": 5, "requisitos": [_r_manual("Termos de credenciamento assinados")]},
            {"codigo": "fiscalizacao", "nome": "Fiscalização", "setor": "fiscal", "sla": 365},
        ],
    )

    templates["adesao_ata"] = await _criar_fluxo(
        db, org, TipoProcesso.ADESAO_ATA, "Adesão à Ata de Registro de Preços",
        [
            {"codigo": "solicitacao", "nome": "Solicitação", "setor": "solicitante", "sla": 2},
            {"codigo": "analise_ata", "nome": "Análise da Ata", "setor": "compras", "sla": 3, "requisitos": [_r_manual("Compatibilidade e saldo da ata confirmados")]},
            {"codigo": "anuencia_gerenciador", "nome": "Anuência do Órgão Gerenciador", "setor": "licitacao", "sla": 10, "requisitos": [_r_manual("Anuência do órgão gerenciador obtida")]},
            {"codigo": "autorizacao", "nome": "Autorização", "setor": "autoridade", "sla": 2, "requisitos": [_r_auto("autorizacao", "Autorizado")]},
            {"codigo": "contrato", "nome": "Contratação", "setor": "licitacao", "sla": 3, "requisitos": [_r_manual("Instrumento contratual formalizado")]},
            {"codigo": "fiscalizacao", "nome": "Fiscalização", "setor": "fiscal", "sla": 365},
        ],
    )

    templates["contratacao_emergencial"] = await _criar_fluxo(
        db, org, TipoProcesso.CONTRATACAO_EMERGENCIAL, "Contratação Emergencial",
        [
            {"codigo": "solicitacao", "nome": "Solicitação", "setor": "solicitante", "sla": 1},
            {"codigo": "justificativa_urgencia", "nome": "Justificativa da Urgência", "setor": "compras", "sla": 1, "requisitos": [_r_manual("Justificativa da situação emergencial registrada")]},
            {"codigo": "dotacao", "nome": "Dotação Orçamentária", "setor": "contabilidade", "sla": 1, "requisitos": [_r_auto("dotacao", "Dotação confirmada")]},
            {"codigo": "autorizacao", "nome": "Autorização", "setor": "autoridade", "sla": 1, "requisitos": [_r_auto("autorizacao", "Autorizado")]},
            {"codigo": "contrato", "nome": "Contratação", "setor": "licitacao", "sla": 2, "requisitos": [_r_manual("Instrumento contratual formalizado")]},
            {"codigo": "fiscalizacao", "nome": "Fiscalização", "setor": "fiscal", "sla": 365},
        ],
    )

    return templates


# ──────────────────────────────────────────────────────────────────────────
# 4. Catálogo e fornecedores
# ──────────────────────────────────────────────────────────────────────────
async def seed_catalogo_e_fornecedores(db: AsyncSession, org: Organizacao) -> dict:
    item_computador = CatalogoItem(
        organizacao_id=org.id, codigo="000184", descricao="Computador Desktop Administrativo",
        unidade_medida="unidade", categoria="Equipamentos de Informática",
        especificacao_padrao="Processador quad-core, 8GB RAM, SSD 256GB, monitor 21,5\", teclado e mouse.",
    )
    item_papel = CatalogoItem(
        organizacao_id=org.id, codigo="000221", descricao="Papel Sulfite A4 (resma 500 folhas)",
        unidade_medida="resma", categoria="Material de Expediente",
    )
    db.add_all([item_computador, item_papel])
    await db.flush()

    fornecedores_spec = [
        ("Tech Informática Ltda", "12.345.678/0001-90"),
        ("Info Sistemas Comércio ME", "23.456.789/0001-01"),
        ("Comercial Nortec Equipamentos EIRELI", "34.567.890/0001-12"),
        ("Papelaria Central Distribuidora Ltda", "45.678.901/0001-23"),
        ("Farmacon Distribuidora de Medicamentos S.A.", "56.789.012/0001-34"),
        ("SoftGov Sistemas de Gestão Pública Ltda", "67.890.123/0001-45"),
    ]
    fornecedores = {}
    for razao_social, cnpj in fornecedores_spec:
        fornecedor = Fornecedor(organizacao_id=org.id, razao_social=razao_social, cnpj=cnpj, municipio="Município Demonstração", uf="SC")
        db.add(fornecedor)
        fornecedores[razao_social] = fornecedor
    await db.flush()

    db.add_all(
        [
            CatalogoItemPrecoHistorico(catalogo_item_id=item_computador.id, fonte="contrato", valor=3720.00, data_referencia=_dias_atras(730)),
            CatalogoItemPrecoHistorico(catalogo_item_id=item_computador.id, fonte="contrato", valor=3850.00, data_referencia=_dias_atras(365)),
        ]
    )
    await db.flush()

    return {"computador": item_computador, "papel": item_papel, "fornecedores": fornecedores}


# ──────────────────────────────────────────────────────────────────────────
# 5. Cenário piloto — 20 computadores da Secretaria de Saúde
# ──────────────────────────────────────────────────────────────────────────
async def seed_cenario_piloto(db, org, setores, templates, usuarios, catalogo) -> ProcessoInstancia:
    saude = setores["_secretaria_saude"]
    u_saude, u_compras, u_licitacao = usuarios["solicitante"], usuarios["compras"], usuarios["licitacao"]
    u_contab, u_admin, u_juridico, u_fiscal = usuarios["contabilidade"], usuarios["administrador"], usuarios["juridico"], usuarios["fiscal"]

    _, numero_sol = await numeracao.numero_solicitacao(db, org.id)
    solicitacao = Solicitacao(
        organizacao_id=org.id, numero=numero_sol, exercicio=date.today().year,
        secretaria_id=saude.id, setor_id=setores["solicitante_saude"].id, solicitante_usuario_id=u_saude.id,
        tipo_objeto=TipoObjeto.BEM.value, objeto="Aquisição de 20 computadores para os setores administrativos",
        justificativa="Os equipamentos atuais têm mais de 6 anos e apresentam falhas frequentes, prejudicando o atendimento aos munícipes.",
        prioridade=Prioridade.ALTA.value, valor_estimado_total=63000.00, status=StatusSolicitacao.EM_PROCESSAMENTO.value,
        created_by_id=u_saude.id,
    )
    db.add(solicitacao)
    await db.flush()
    db.add(
        SolicitacaoItem(
            solicitacao_id=solicitacao.id, catalogo_item_id=catalogo["computador"].id,
            descricao="Computador Desktop Administrativo", unidade="unidade", quantidade=20,
            especificacao="Conforme especificação padrão do catálogo municipal.", valor_unitario_estimado=3150.00,
        )
    )
    await db.flush()

    processo = await workflow.abrir_processo(
        db, organizacao_id=org.id, tipo_processo=TipoProcesso.PREGAO.value,
        secretaria_id=saude.id, setor_id=setores["solicitante_saude"].id,
        objeto=solicitacao.objeto, valor_estimado=63000.00, usuario=u_saude, solicitacao_id=solicitacao.id,
    )

    async def _avancar(usuario):
        return await workflow.avancar_etapa(db, processo_id=processo.id, usuario=usuario)

    await _avancar(u_saude)  # solicitacao -> dfd

    db.add(
        Dfd(
            processo_id=processo.id, created_by_id=u_compras.id,
            descricao_necessidade="Substituição de equipamentos de informática obsoletos da Secretaria de Saúde.",
            quantidade_estimada="20 unidades", status="aprovado", aprovado_por_id=u_compras.id,
            aprovado_em=_agora().isoformat(),
        )
    )
    await db.flush()
    await _avancar(u_compras)  # dfd -> etp

    etp = Etp(processo_id=processo.id, created_by_id=u_compras.id, status="aprovado")
    db.add(etp)
    await db.flush()
    for ordem, titulo in enumerate(EtpTopico.topicos_padrao(), start=1):
        db.add(EtpTopico(etp_id=etp.id, ordem=ordem, titulo=titulo, status="aprovado",
                          conteudo="Conteúdo elaborado com base no histórico de compras e na necessidade informada pela Secretaria."))
    await db.flush()
    await _avancar(u_compras)  # etp -> termo_referencia

    db.add(
        TermoReferencia(
            processo_id=processo.id, created_by_id=u_compras.id,
            objeto="Aquisição de 20 (vinte) computadores desktop administrativos.",
            justificativa="Renovação do parque tecnológico da Secretaria Municipal de Saúde.",
            especificacoes=catalogo["computador"].especificacao_padrao,
            local_entrega="Almoxarifado Central da Secretaria Municipal de Saúde",
            prazo_execucao="15 dias corridos após a assinatura do contrato",
            criterio_julgamento="menor_preco", status="aprovado", aprovado_por_id=u_compras.id,
            valor_estimado=63000.00,
        )
    )
    await db.flush()
    await _avancar(u_compras)  # termo_referencia -> matriz_risco

    matriz = MatrizRisco(processo_id=processo.id, created_by_id=u_compras.id)
    db.add(matriz)
    await db.flush()
    db.add(
        MatrizRiscoItem(
            matriz_id=matriz.id, categoria="Fornecimento", descricao_risco="Atraso na entrega dos equipamentos",
            probabilidade="media", impacto="alto", responsavel_mitigacao="Departamento de Compras",
            acao_preventiva="Exigir prazo de entrega no edital e prever multa por atraso.",
            acao_contingencia="Acionar garantia contratual e notificar o fornecedor.",
        )
    )
    await db.flush()
    await _avancar(u_compras)  # matriz_risco -> pesquisa_precos

    cotacao = Cotacao(
        processo_id=processo.id, numero=f"{date.today().year}/0001", data_abertura=_dias_atras(20),
        prazo_resposta=_dias_atras(10), status=StatusCotacao.CONCLUIDA.value, created_by_id=u_compras.id,
    )
    db.add(cotacao)
    await db.flush()
    item_cotacao = CotacaoItem(cotacao_id=cotacao.id, catalogo_item_id=catalogo["computador"].id, descricao="Computador Desktop Administrativo", quantidade=20)
    db.add(item_cotacao)
    await db.flush()

    precos_unitarios = {"Tech Informática Ltda": 3125.00, "Info Sistemas Comércio ME": 3245.00, "Comercial Nortec Equipamentos EIRELI": 3090.00}
    fornecedor_vencedor = None
    for nome_fornecedor, valor_unitario in precos_unitarios.items():
        fornecedor = catalogo["fornecedores"][nome_fornecedor]
        cf = CotacaoFornecedor(
            cotacao_id=cotacao.id, fornecedor_id=fornecedor.id, enviada_em=_data_atras(20),
            visualizada_em=_data_atras(19), respondida_em=_data_atras(18), validade_dias=30, prazo_entrega_dias=15,
        )
        db.add(cf)
        await db.flush()
        db.add(CotacaoPreco(cotacao_item_id=item_cotacao.id, cotacao_fornecedor_id=cf.id, valor_unitario=valor_unitario))
        db.add(CatalogoItemPrecoHistorico(catalogo_item_id=catalogo["computador"].id, fonte="cotacao", valor=valor_unitario, data_referencia=_dias_atras(18), fornecedor_id=fornecedor.id))
        if fornecedor_vencedor is None or valor_unitario < precos_unitarios[fornecedor_vencedor]:
            fornecedor_vencedor = nome_fornecedor
    await db.flush()
    await _avancar(u_compras)  # pesquisa_precos -> dotacao

    dotacao = DotacaoOrcamentaria(
        organizacao_id=org.id, exercicio=date.today().year, orgao="Prefeitura Municipal",
        unidade="Fundo Municipal de Saúde", funcao="Saúde", elemento_despesa="4.4.90.52 — Equipamentos e Material Permanente",
        fonte="Recursos Próprios", valor_total=200000.00,
    )
    db.add(dotacao)
    await db.flush()
    valor_estimado_pregao = precos_unitarios[fornecedor_vencedor] * 20
    db.add(ProcessoDotacao(processo_id=processo.id, dotacao_id=dotacao.id, valor_reservado=valor_estimado_pregao, status=StatusDotacao.CONFIRMADA.value, decidido_por_id=u_contab.id))
    dotacao.valor_comprometido += valor_estimado_pregao
    await db.flush()
    await _avancar(u_contab)  # dotacao -> autorizacao

    db.add(Autorizacao(processo_id=processo.id, autoridade_usuario_id=u_admin.id, decisao=DecisaoAutorizacao.AUTORIZADO.value, justificativa="Contratação essencial para a continuidade dos serviços da Secretaria de Saúde."))
    await db.flush()
    await _avancar(u_admin)  # autorizacao -> parecer_juridico

    await workflow.marcar_requisito_manual(db, requisito_id=(await _requisito_da_etapa(db, processo, "parecer_juridico")).id, usuario=u_juridico)
    await _avancar(u_juridico)  # parecer_juridico -> edital

    edital = Edital(
        processo_id=processo.id, created_by_id=u_licitacao.id, numero=f"PE {date.today().year}/001",
        modalidade="pregao_eletronico", criterio_julgamento="menor_preco",
        conteudo="EDITAL DE PREGÃO ELETRÔNICO Nº 001/2026 — Aquisição de 20 computadores desktop administrativos para a Secretaria Municipal de Saúde.",
        status="minuta",
    )
    db.add(edital)
    await db.flush()
    await workflow.marcar_requisito_manual(db, requisito_id=(await _requisito_da_etapa(db, processo, "edital")).id, usuario=u_licitacao)
    await _avancar(u_licitacao)  # edital -> publicacao

    edital.status = "publicado"
    db.add(Publicacao(edital_id=edital.id, created_by_id=u_licitacao.id, veiculo="Diário Oficial do Município", data_publicacao=_dias_atras(15), link="https://diario.govsistem.com.br/edicoes/pe-001-2026"))
    await db.flush()
    await _avancar(u_licitacao)  # publicacao -> sessao

    db.add(Sessao(processo_id=processo.id, created_by_id=u_licitacao.id, data_hora=_data_atras(10), tipo="abertura", plataforma="Portal de Compras Públicas", participantes="3 fornecedores participantes", situacao="realizada"))
    await db.flush()
    await workflow.marcar_requisito_manual(db, requisito_id=(await _requisito_da_etapa(db, processo, "sessao")).id, usuario=u_licitacao)
    await _avancar(u_licitacao)  # sessao -> julgamento

    for nome_fornecedor, valor_unitario in precos_unitarios.items():
        fornecedor = catalogo["fornecedores"][nome_fornecedor]
        situacao = "vencedora" if nome_fornecedor == fornecedor_vencedor else "classificada"
        db.add(Proposta(processo_id=processo.id, fornecedor_id=fornecedor.id, valor_proposto=valor_unitario * 20, situacao=situacao))
    await db.flush()
    await workflow.marcar_requisito_manual(db, requisito_id=(await _requisito_da_etapa(db, processo, "julgamento")).id, usuario=u_licitacao)
    await _avancar(u_licitacao)  # julgamento -> adjudicacao

    fornecedor_vencedor_obj = catalogo["fornecedores"][fornecedor_vencedor]
    valor_final = round(precos_unitarios[fornecedor_vencedor] * 20, 2)
    db.add(Adjudicacao(processo_id=processo.id, created_by_id=u_licitacao.id, fornecedor_vencedor_id=fornecedor_vencedor_obj.id, valor_adjudicado=valor_final))
    await db.flush()
    await workflow.marcar_requisito_manual(db, requisito_id=(await _requisito_da_etapa(db, processo, "adjudicacao")).id, usuario=u_licitacao)
    await _avancar(u_licitacao)  # adjudicacao -> homologacao

    db.add(Homologacao(processo_id=processo.id, autoridade_usuario_id=u_admin.id, valor_homologado=valor_final, publicada_em=_data_atras(3)))
    await db.flush()
    await _avancar(u_admin)  # homologacao -> contrato

    exercicio, numero_contrato = await numeracao.numero_contrato(db, org.id)
    contrato = Contrato(
        organizacao_id=org.id, numero=numero_contrato, exercicio=exercicio, processo_id=processo.id,
        fornecedor_id=fornecedor_vencedor_obj.id, secretaria_id=saude.id,
        objeto=solicitacao.objeto, valor_global=valor_final,
        data_assinatura=_dias_atras(90), vigencia_inicio=_dias_atras(90), vigencia_fim=_dias_atras(-30),
        gestor_usuario_id=u_compras.id, fiscal_usuario_id=u_fiscal.id,
        garantia="Não exigida para este objeto", reajuste="Não aplicável (contrato de escopo fechado)",
        condicoes_pagamento="30 dias após o atesto da nota fiscal pelo fiscal do contrato.",
        status=StatusContrato.VIGENTE.value, created_by_id=u_licitacao.id,
    )
    db.add(contrato)
    await db.flush()
    db.add(ContratoSaldo(contrato_id=contrato.id, valor_empenhado=valor_final, valor_liquidado=valor_final, valor_pago=valor_final))
    db.add(ContratoItemSaldo(contrato_id=contrato.id, catalogo_item_id=catalogo["computador"].id, descricao="Computador Desktop Administrativo", quantidade_contratada=20, quantidade_utilizada=20))
    await db.flush()
    await workflow.marcar_requisito_manual(db, requisito_id=(await _requisito_da_etapa(db, processo, "contrato")).id, usuario=u_licitacao)
    await _avancar(u_licitacao)  # contrato -> fiscalizacao

    db.add(
        OcorrenciaContrato(
            contrato_id=contrato.id, created_by_id=u_fiscal.id,
            descricao="Entrega dos 20 computadores realizada dentro do prazo contratual, sem intercorrências.",
            classificacao="informativa", status="resolvida",
        )
    )
    await db.flush()

    # Processo sucessor — decisão pré-vencimento já tomada, nova contratação
    # se inicia enquanto o contrato atual ainda está vigente (seção 132).
    await workflow.abrir_processo(
        db, organizacao_id=org.id, tipo_processo=TipoProcesso.PREGAO.value,
        secretaria_id=saude.id, setor_id=setores["solicitante_saude"].id,
        objeto=f"Nova contratação — renovação do parque de computadores da Secretaria de Saúde (sucessor do contrato {contrato.numero})",
        valor_estimado=65000.00, usuario=u_admin, processo_origem_id=processo.id, origem_contrato_id=contrato.id,
    )
    return processo


async def _requisito_da_etapa(db, processo, codigo_etapa: str) -> WorkflowEtapaRequisito:
    etapa = await db.scalar(
        select(WorkflowEtapa).where(WorkflowEtapa.template_id == processo.template_id, WorkflowEtapa.codigo == codigo_etapa)
    )
    requisito = await db.scalar(select(WorkflowEtapaRequisito).where(WorkflowEtapaRequisito.etapa_id == etapa.id))
    return requisito


# ──────────────────────────────────────────────────────────────────────────
# 6. Dados extras (seção 101)
# ──────────────────────────────────────────────────────────────────────────
async def _pular_para(db, processo: ProcessoInstancia, codigo_etapa: str, usuario: User, dias_atras: int = 0):
    """Move um processo diretamente para a etapa informada, sem passar pelas
    intermediárias — usado só para popular registros de pano de fundo (seção
    101), nunca no cenário principal, que percorre o fluxo de verdade."""
    etapa_destino = await db.scalar(
        select(WorkflowEtapa).where(WorkflowEtapa.template_id == processo.template_id, WorkflowEtapa.codigo == codigo_etapa)
    )
    linha_aberta = await db.scalar(
        select(ProcessoHistoricoEtapa).where(ProcessoHistoricoEtapa.processo_id == processo.id, ProcessoHistoricoEtapa.encerrada_em.is_(None))
    )
    quando = _data_atras(dias_atras)
    linha_aberta.encerrada_em = quando
    linha_aberta.resultado = "avancou"
    linha_aberta.usuario_acao_id = usuario.id
    db.add(
        ProcessoHistoricoEtapa(
            processo_id=processo.id, etapa_id=etapa_destino.id, ordem_execucao=linha_aberta.ordem_execucao + 1,
            responsavel_setor_id=None, responsavel_usuario_id=None, iniciada_em=quando, resultado="em_andamento",
        )
    )
    processo.etapa_atual_id = etapa_destino.id
    processo.etapa_atual_iniciada_em = quando
    processo.etapa_atual_responsavel_setor_id = None
    processo.etapa_atual_responsavel_usuario_id = None
    await db.flush()


async def seed_dados_extra(db, org, setores, templates, usuarios, catalogo):
    saude = setores["_secretaria_saude"]
    administracao = setores["_secretaria_administracao"]
    u_admin, u_compras = usuarios["administrador"], usuarios["compras"]

    # a) Contrato de sistema de gestão vencendo em 45 dias.
    processo_sistema = await workflow.abrir_processo(
        db, organizacao_id=org.id, tipo_processo=TipoProcesso.PREGAO.value, secretaria_id=administracao.id,
        setor_id=setores["compras"].id, objeto="Contratação de sistema de gestão administrativa municipal",
        valor_estimado=185000.00, usuario=u_admin,
    )
    await _pular_para(db, processo_sistema, "fiscalizacao", u_admin)
    exercicio, numero = await numeracao.numero_contrato(db, org.id)
    contrato_sistema = Contrato(
        organizacao_id=org.id, numero=numero, exercicio=exercicio, processo_id=processo_sistema.id,
        fornecedor_id=catalogo["fornecedores"]["SoftGov Sistemas de Gestão Pública Ltda"].id, secretaria_id=administracao.id,
        objeto="Sistema de Gestão Municipal — módulos de protocolo, RH e patrimônio",
        valor_global=185000.00, data_assinatura=_dias_atras(320), vigencia_inicio=_dias_atras(320), vigencia_fim=_dias_atras(-45),
        gestor_usuario_id=u_compras.id, fiscal_usuario_id=usuarios["fiscal"].id, status=StatusContrato.VIGENTE.value,
        created_by_id=u_admin.id,
    )
    db.add(contrato_sistema)
    await db.flush()
    db.add(ContratoSaldo(contrato_id=contrato_sistema.id, valor_empenhado=185000.00, valor_liquidado=154000.00, valor_pago=154000.00))

    # b) Contrato de medicamentos vencendo em 180 dias.
    processo_medicamentos = await workflow.abrir_processo(
        db, organizacao_id=org.id, tipo_processo=TipoProcesso.PREGAO.value, secretaria_id=saude.id,
        setor_id=setores["solicitante_saude"].id, objeto="Aquisição de medicamentos para a rede municipal de saúde",
        valor_estimado=420000.00, usuario=u_admin,
    )
    await _pular_para(db, processo_medicamentos, "fiscalizacao", u_admin)
    exercicio, numero = await numeracao.numero_contrato(db, org.id)
    contrato_medicamentos = Contrato(
        organizacao_id=org.id, numero=numero, exercicio=exercicio, processo_id=processo_medicamentos.id,
        fornecedor_id=catalogo["fornecedores"]["Farmacon Distribuidora de Medicamentos S.A."].id, secretaria_id=saude.id,
        objeto="Fornecimento contínuo de medicamentos da Relação Municipal (REMUME)",
        valor_global=420000.00, data_assinatura=_dias_atras(185), vigencia_inicio=_dias_atras(185), vigencia_fim=_dias_atras(-180),
        gestor_usuario_id=usuarios["solicitante"].id, fiscal_usuario_id=usuarios["fiscal"].id, status=StatusContrato.VIGENTE.value,
        created_by_id=u_admin.id,
    )
    db.add(contrato_medicamentos)
    await db.flush()
    db.add(ContratoSaldo(contrato_id=contrato_medicamentos.id, valor_empenhado=210000.00, valor_liquidado=180000.00, valor_pago=180000.00))

    # c) Ata de materiais de expediente 82% consumida.
    processo_ata = await workflow.abrir_processo(
        db, organizacao_id=org.id, tipo_processo=TipoProcesso.PREGAO.value, secretaria_id=administracao.id,
        setor_id=setores["compras"].id, objeto="Registro de preços para aquisição de materiais de expediente",
        valor_estimado=112500.00, usuario=u_admin,
    )
    await _pular_para(db, processo_ata, "fiscalizacao", u_admin)
    exercicio, numero_ata = await numeracao.numero_ata(db, org.id)
    ata = AtaRegistroPreco(
        organizacao_id=org.id, numero=numero_ata, exercicio=exercicio, processo_id=processo_ata.id,
        fornecedor_id=catalogo["fornecedores"]["Papelaria Central Distribuidora Ltda"].id,
        objeto="Registro de preços para aquisição de materiais de expediente", vigencia_inicio=_dias_atras(200),
        vigencia_fim=_dias_atras(-165), status=StatusAta.VIGENTE.value, created_by_id=u_admin.id,
    )
    db.add(ata)
    await db.flush()
    db.add(
        AtaItemSaldo(
            ata_id=ata.id, catalogo_item_id=catalogo["papel"].id, descricao="Papel Sulfite A4 (resma 500 folhas)",
            valor_unitario_registrado=22.50, quantidade_registrada=5000, quantidade_reservada=0, quantidade_utilizada=4100,
        )
    )

    # d) Pregão aguardando parecer jurídico (atrasado além do SLA da etapa).
    processo_juridico = await workflow.abrir_processo(
        db, organizacao_id=org.id, tipo_processo=TipoProcesso.PREGAO.value, secretaria_id=administracao.id,
        setor_id=setores["compras"].id, objeto="Contratação de empresa para manutenção predial das unidades administrativas",
        valor_estimado=98000.00, usuario=u_admin,
    )
    await _pular_para(db, processo_juridico, "parecer_juridico", u_admin, dias_atras=8)

    # e) Pesquisa de preços parada há 14 dias.
    processo_parado = await workflow.abrir_processo(
        db, organizacao_id=org.id, tipo_processo=TipoProcesso.PREGAO.value, secretaria_id=saude.id,
        setor_id=setores["solicitante_saude"].id, objeto="Aquisição de equipamentos odontológicos para as UBS",
        valor_estimado=54000.00, usuario=u_admin,
    )
    await _pular_para(db, processo_parado, "pesquisa_precos", u_admin, dias_atras=14)
    cotacao_parada = Cotacao(processo_id=processo_parado.id, numero=f"{date.today().year}/0007", data_abertura=_dias_atras(14), prazo_resposta=_dias_atras(4), status=StatusCotacao.EM_ANDAMENTO.value)
    db.add(cotacao_parada)
    await db.flush()
    for nome_fornecedor in ["Tech Informática Ltda", "Info Sistemas Comércio ME"]:
        db.add(CotacaoFornecedor(cotacao_id=cotacao_parada.id, fornecedor_id=catalogo["fornecedores"][nome_fornecedor].id, enviada_em=_data_atras(14)))

    # f) Processo devolvido à Secretaria por ausência de justificativa.
    processo_devolvido = await workflow.abrir_processo(
        db, organizacao_id=org.id, tipo_processo=TipoProcesso.PREGAO.value, secretaria_id=saude.id,
        setor_id=setores["solicitante_saude"].id, objeto="Aquisição de mobiliário para a nova UBS do bairro Esperança",
        valor_estimado=32000.00, usuario=usuarios["solicitante"],
    )
    await workflow.avancar_etapa(db, processo_id=processo_devolvido.id, usuario=usuarios["solicitante"])
    await workflow.devolver_etapa(
        db, processo_id=processo_devolvido.id, transicao_id=None,
        justificativa="Solicitação sem justificativa técnica suficiente. Favor detalhar a necessidade, o quantitativo e o local de instalação antes de prosseguir.",
        usuario=u_compras,
    )

    await db.flush()


# ──────────────────────────────────────────────────────────────────────────
async def seed(db: AsyncSession) -> bool:
    ja_existe = await db.scalar(select(Organizacao).where(Organizacao.externo_id == ORG_EXTERNO_ID))
    if ja_existe:
        print("Seed: organização de demonstração já existe — nada a fazer.")
        return False

    org, usuarios = await seed_organizacao_e_personas(db)
    setores = await seed_estrutura(db, org, usuarios)
    templates = await seed_workflow_templates(db, org)
    catalogo = await seed_catalogo_e_fornecedores(db, org)
    await seed_cenario_piloto(db, org, setores, templates, usuarios, catalogo)
    await seed_dados_extra(db, org, setores, templates, usuarios, catalogo)
    await db.commit()
    print("Seed concluído: organização, 7 personas, 6 workflows, catálogo, cenário piloto e dados extras criados.")
    print(f"Senha de demonstração (todas as personas): {SENHA_DEMO}")
    return True


async def main():
    async with async_session() as db:
        await seed(db)


if __name__ == "__main__":
    asyncio.run(main())
