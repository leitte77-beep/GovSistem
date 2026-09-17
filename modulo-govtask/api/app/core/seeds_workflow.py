"""Modelos de fluxo iniciais (§18).

São só o ponto de partida: cada município publica as próprias versões. Os
pesos somam 100 em cada fluxo e refletem o esforço real de cada fase — a
execução de uma obra pesa muito mais que a formalização do pedido.

Nenhum modelo aqui amarra nome de setor: `setor_chave` é resolvido contra os
setores do tenant na hora de semear, e o que não existir fica sem setor, para
o administrador completar.
"""

from app.models.enums import (
    ModoEtapa,
    NaturezaEtapa,
    RegraConclusaoEtapa,
    TipoTarefa,
)

SEQ = ModoEtapa.SEQUENCIAL.value
PAR = ModoEtapa.PARALELA.value
INTERNA = NaturezaEtapa.INTERNA.value
GOVERNO = NaturezaEtapa.GOVERNO.value
TODAS = RegraConclusaoEtapa.TODAS_TAREFAS.value
MANUAL = RegraConclusaoEtapa.MANUAL.value

WORKFLOWS_PADRAO: list[dict] = [
    {
        "chave": "PEDIDO_SIMPLES",
        "nome": "Pedido simples",
        "descricao": "Solicitação encaminhada a um departamento e devolvida ao solicitante.",
        "tipo_demanda": "DEMANDA_SIMPLES",
        "etapas": [
            {
                "chave": "SOLICITACAO", "nome": "Solicitação", "ordem": 1,
                "peso": 20, "prazo_dias": 1, "regra_conclusao": MANUAL,
            },
            {
                "chave": "DEPARTAMENTO", "nome": "Departamento responsável", "ordem": 2,
                "peso": 60, "prazo_dias": 5,
                "tarefas": [
                    {
                        "titulo": "Atender a solicitação", "ordem": 1,
                        "exige_comentario": True,
                    }
                ],
            },
            {
                "chave": "RETORNO", "nome": "Retorno ao solicitante", "ordem": 3,
                "peso": 20, "prazo_dias": 2, "is_final": True,
                "tarefas": [{"titulo": "Conferir o retorno e dar ciência", "ordem": 1}],
            },
        ],
    },
    {
        "chave": "EMENDA_PARLAMENTAR",
        "nome": "Emenda parlamentar",
        "descricao": "Da identificação do recurso à prestação de contas.",
        "tipo_demanda": "EMENDA_PARLAMENTAR",
        "etapas": [
            {"chave": "IDENTIFICACAO", "nome": "Identificação do recurso", "ordem": 1,
             "peso": 5, "prazo_dias": 3, "regra_conclusao": MANUAL},
            {"chave": "FORMALIZACAO", "nome": "Formalização do pedido", "ordem": 2,
             "peso": 10, "prazo_dias": 5,
             "tarefas": [
                 {"titulo": "Elaborar ofício ao órgão concedente", "ordem": 1,
                  "exige_documento": True},
             ]},
            {"chave": "DOCUMENTACAO", "nome": "Documentação", "ordem": 3,
             "peso": 10, "prazo_dias": 10, "modo": PAR,
             "documentos_obrigatorios": ["Plano de trabalho", "Certidões"],
             "tarefas": [
                 {"titulo": "Reunir certidões negativas", "ordem": 1,
                  "exige_documento": True},
                 {"titulo": "Elaborar plano de trabalho", "ordem": 2,
                  "exige_documento": True},
             ]},
            {"chave": "PROTOCOLO", "nome": "Protocolo no órgão", "ordem": 4,
             "peso": 5, "prazo_dias": 2,
             "tarefas": [{"titulo": "Protocolar a proposta e registrar o número",
                          "ordem": 1, "exige_documento": True}]},
            {"chave": "ANALISE", "nome": "Análise do concedente", "ordem": 5,
             "peso": 10, "natureza": GOVERNO, "prazo_dias": 30,
             "regra_conclusao": MANUAL},
            {"chave": "COMPLEMENTACAO", "nome": "Complementação / diligência", "ordem": 6,
             "peso": 5, "natureza": GOVERNO, "prazo_dias": 10,
             "regra_conclusao": MANUAL},
            {"chave": "APROVACAO", "nome": "Aprovação", "ordem": 7,
             "peso": 5, "natureza": GOVERNO, "regra_conclusao": MANUAL},
            {"chave": "INSTRUMENTO", "nome": "Celebração do instrumento", "ordem": 8,
             "peso": 10, "prazo_dias": 15,
             "tarefas": [{"titulo": "Assinar e publicar o instrumento", "ordem": 1,
                          "exige_documento": True}]},
            {"chave": "EXECUCAO", "nome": "Execução do objeto", "ordem": 9,
             "peso": 25, "regra_conclusao": MANUAL},
            {"chave": "PRESTACAO", "nome": "Prestação de contas", "ordem": 10,
             "peso": 15, "prazo_dias": 60, "is_final": True,
             "tarefas": [{"titulo": "Montar e enviar a prestação de contas",
                          "ordem": 1, "exige_documento": True}]},
        ],
    },
    {
        "chave": "AQUISICAO",
        "nome": "Aquisição",
        "descricao": "Da solicitação à incorporação ao patrimônio.",
        "tipo_demanda": "AQUISICAO",
        "etapas": [
            {"chave": "SOLICITACAO", "nome": "Solicitação", "ordem": 1,
             "peso": 5, "prazo_dias": 2, "regra_conclusao": MANUAL},
            {"chave": "PLANEJAMENTO", "nome": "Planejamento da contratação", "ordem": 2,
             "peso": 10, "prazo_dias": 10,
             "tarefas": [
                 {"titulo": "Elaborar termo de referência", "ordem": 1,
                  "exige_documento": True},
                 {"titulo": "Pesquisa de preços", "ordem": 2, "exige_documento": True},
             ]},
            {"chave": "PROCESSO", "nome": "Processo administrativo", "ordem": 3,
             "peso": 10, "prazo_dias": 5,
             "tarefas": [{"titulo": "Autuar o processo administrativo", "ordem": 1}]},
            {"chave": "LICITACAO", "nome": "Licitação", "ordem": 4,
             "peso": 20, "prazo_dias": 45, "regra_conclusao": MANUAL},
            {"chave": "CONTRATO", "nome": "Contrato", "ordem": 5,
             "peso": 10, "prazo_dias": 10,
             "tarefas": [{"titulo": "Celebrar e publicar o contrato", "ordem": 1,
                          "exige_documento": True}]},
            {"chave": "EMPENHO", "nome": "Empenho", "ordem": 6,
             "peso": 5, "prazo_dias": 5,
             "tarefas": [{"titulo": "Emitir a nota de empenho", "ordem": 1,
                          "exige_documento": True}]},
            {"chave": "ENTREGA", "nome": "Entrega e recebimento", "ordem": 7,
             "peso": 20, "regra_conclusao": MANUAL},
            {"chave": "PAGAMENTO", "nome": "Pagamento", "ordem": 8,
             "peso": 10, "prazo_dias": 30,
             "tarefas": [{"titulo": "Liquidar e pagar a nota fiscal", "ordem": 1,
                          "exige_documento": True}]},
            {"chave": "PATRIMONIO", "nome": "Patrimônio", "ordem": 9,
             "peso": 10, "is_final": True,
             "tarefas": [{"titulo": "Tombar o bem e registrar no patrimônio",
                          "ordem": 1, "exige_documento": True}]},
        ],
    },
    {
        "chave": "OBRA",
        "nome": "Obra",
        "descricao": "Da demanda ao recebimento definitivo e prestação de contas.",
        "tipo_demanda": "OBRA",
        "etapas": [
            {"chave": "DEMANDA", "nome": "Demanda", "ordem": 1, "peso": 3,
             "regra_conclusao": MANUAL},
            {"chave": "ESTUDOS", "nome": "Estudos preliminares", "ordem": 2,
             "peso": 5, "prazo_dias": 15,
             "tarefas": [{"titulo": "Levantamento e estudo de viabilidade", "ordem": 1}]},
            {"chave": "PROJETO", "nome": "Projeto", "ordem": 3, "peso": 12,
             "prazo_dias": 30, "modo": PAR,
             "documentos_obrigatorios": ["Projeto", "ART"],
             "tarefas": [
                 {"titulo": "Projeto arquitetônico e complementares", "ordem": 1,
                  "exige_documento": True},
                 {"titulo": "Memorial descritivo e ART/RRT", "ordem": 2,
                  "exige_documento": True},
             ]},
            {"chave": "ORCAMENTO", "nome": "Orçamento", "ordem": 4, "peso": 5,
             "prazo_dias": 10,
             "tarefas": [{"titulo": "Planilha orçamentária e cronograma",
                          "ordem": 1, "exige_documento": True}]},
            {"chave": "CAPTACAO", "nome": "Captação / convênio", "ordem": 5,
             "peso": 10, "natureza": GOVERNO, "regra_conclusao": MANUAL},
            {"chave": "LICITACAO", "nome": "Licitação", "ordem": 6, "peso": 10,
             "prazo_dias": 60, "regra_conclusao": MANUAL},
            {"chave": "CONTRATO", "nome": "Contrato e ordem de serviço", "ordem": 7,
             "peso": 5, "prazo_dias": 15,
             "tarefas": [{"titulo": "Assinar contrato e emitir ordem de serviço",
                          "ordem": 1, "exige_documento": True}]},
            {"chave": "EXECUCAO", "nome": "Execução", "ordem": 8, "peso": 25,
             "regra_conclusao": MANUAL},
            {"chave": "MEDICOES", "nome": "Medições e pagamentos", "ordem": 9,
             "peso": 10, "regra_conclusao": MANUAL},
            {"chave": "RECEBIMENTO", "nome": "Recebimento definitivo", "ordem": 10,
             "peso": 8, "prazo_dias": 30,
             "tarefas": [{"titulo": "Vistoria e termo de recebimento definitivo",
                          "ordem": 1, "exige_documento": True}]},
            {"chave": "PRESTACAO", "nome": "Prestação de contas", "ordem": 11,
             "peso": 7, "prazo_dias": 60, "is_final": True,
             "tarefas": [{"titulo": "Prestação de contas da obra", "ordem": 1,
                          "exige_documento": True}]},
        ],
    },
]


def etapa_com_padroes(etapa: dict) -> dict:
    """Completa uma etapa do seed com os valores implícitos."""
    return {
        "chave": etapa["chave"],
        "nome": etapa["nome"],
        "descricao": etapa.get("descricao"),
        "ordem": etapa["ordem"],
        "peso": etapa.get("peso", 0),
        "modo": etapa.get("modo", SEQ),
        "natureza": etapa.get("natureza", INTERNA),
        "regra_conclusao": etapa.get("regra_conclusao", TODAS),
        "prazo_dias": etapa.get("prazo_dias"),
        "exige_aprovacao": etapa.get("exige_aprovacao", False),
        "documentos_obrigatorios": etapa.get("documentos_obrigatorios"),
        "condicao": etapa.get("condicao"),
        "is_final": etapa.get("is_final", False),
        "tarefas": [
            {
                "titulo": t["titulo"],
                "descricao": t.get("descricao"),
                "ordem": t.get("ordem", 1),
                "tipo": t.get("tipo", TipoTarefa.EXECUCAO.value),
                "prazo_dias": t.get("prazo_dias"),
                "exige_documento": t.get("exige_documento", False),
                "exige_comentario": t.get("exige_comentario", False),
                "exige_aprovacao": t.get("exige_aprovacao", False),
                "exige_aceite": t.get("exige_aceite", True),
            }
            for t in etapa.get("tarefas", [])
        ],
    }
