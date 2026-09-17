"""Catálogo padrão do GovTask (§173).

Somente dados estruturais — tipos, status e workflows iniciais. Nada de dado
fictício de produção. O tenant pode desativar ou complementar qualquer item;
itens `is_system` não podem ser excluídos, apenas ocultados.
"""

# ── Tipos de demanda (§4) ───────────────────────────────────────────────────
TIPOS_PADRAO: list[dict] = [
    {"chave": "DEMANDA_SIMPLES", "rotulo": "Demanda simples"},
    {"chave": "DETERMINACAO_PREFEITO", "rotulo": "Determinação do Prefeito"},
    {"chave": "GABINETE", "rotulo": "Gabinete"},
    {
        "chave": "EMENDA_PARLAMENTAR", "rotulo": "Emenda parlamentar",
        "exige_financeiro": True, "exige_convenio": True,
        "exige_prestacao_contas": True,
    },
    {
        "chave": "TRANSFERENCIA_ESPECIAL", "rotulo": "Transferência especial",
        "exige_financeiro": True, "exige_prestacao_contas": True,
    },
    {
        "chave": "CONVENIO", "rotulo": "Convênio",
        "exige_financeiro": True, "exige_convenio": True,
        "exige_prestacao_contas": True,
    },
    {
        "chave": "TRANSFERENCIA_VOLUNTARIA", "rotulo": "Transferência voluntária",
        "exige_financeiro": True, "exige_convenio": True,
        "exige_prestacao_contas": True,
    },
    {"chave": "PROGRAMA_ESTADUAL", "rotulo": "Programa estadual", "exige_financeiro": True},
    {"chave": "PROGRAMA_FEDERAL", "rotulo": "Programa federal", "exige_financeiro": True},
    {
        "chave": "OBRA", "rotulo": "Obra", "exige_obra": True,
        "exige_financeiro": True, "exige_licitacao": True, "exige_contrato": True,
    },
    {
        "chave": "REFORMA", "rotulo": "Reforma", "exige_obra": True,
        "exige_financeiro": True, "exige_contrato": True,
    },
    {
        "chave": "AQUISICAO", "rotulo": "Aquisição",
        "exige_financeiro": True, "exige_licitacao": True, "exige_contrato": True,
    },
    {"chave": "EQUIPAMENTO", "rotulo": "Equipamento", "exige_financeiro": True},
    {"chave": "VEICULO", "rotulo": "Veículo", "exige_financeiro": True},
    {"chave": "MAQUINA", "rotulo": "Máquina", "exige_financeiro": True},
    {
        "chave": "SERVICO", "rotulo": "Serviço",
        "exige_financeiro": True, "exige_contrato": True,
    },
    {"chave": "EVENTO", "rotulo": "Evento"},
    {"chave": "PROJETO", "rotulo": "Projeto"},
    {"chave": "LICITACAO", "rotulo": "Licitação", "exige_licitacao": True},
    {"chave": "CONTRATO", "rotulo": "Contrato", "exige_contrato": True},
    {"chave": "TERMO_COOPERACAO", "rotulo": "Termo de cooperação"},
    {
        "chave": "PRESTACAO_CONTAS", "rotulo": "Prestação de contas",
        "exige_prestacao_contas": True, "exige_financeiro": True,
    },
    {"chave": "RECURSO_FINANCEIRO", "rotulo": "Recurso financeiro", "exige_financeiro": True},
    {"chave": "SOLICITACAO_JURIDICA", "rotulo": "Solicitação jurídica"},
    {"chave": "PROCESSO_ADMINISTRATIVO", "rotulo": "Processo administrativo"},
    {"chave": "MANUTENCAO", "rotulo": "Manutenção"},
    {"chave": "INFRAESTRUTURA", "rotulo": "Infraestrutura"},
    {"chave": "TECNOLOGIA_INFORMACAO", "rotulo": "Tecnologia da Informação"},
    {"chave": "EDUCACAO", "rotulo": "Educação"},
    {"chave": "SAUDE", "rotulo": "Saúde"},
    {"chave": "ASSISTENCIA_SOCIAL", "rotulo": "Assistência Social"},
    {"chave": "AGRICULTURA", "rotulo": "Agricultura"},
    {"chave": "MEIO_AMBIENTE", "rotulo": "Meio Ambiente"},
    {"chave": "CULTURA", "rotulo": "Cultura"},
    {"chave": "ESPORTE", "rotulo": "Esporte"},
    {"chave": "ADMINISTRACAO", "rotulo": "Administração"},
    {"chave": "OUTRO", "rotulo": "Outro"},
]

# ── Status da demanda (§3) ──────────────────────────────────────────────────
# Cores são sugestões; a interface nunca depende só da cor para comunicar
# situação (§13, §107).
STATUS_PADRAO: list[dict] = [
    {"chave": "RASCUNHO", "rotulo": "Rascunho", "cor": "neutro", "is_inicial": True,
     "conta_como_atrasavel": False},
    {"chave": "ABERTA", "rotulo": "Aberta", "cor": "azul", "is_inicial": True},
    {"chave": "EM_PLANEJAMENTO", "rotulo": "Em planejamento", "cor": "azul"},
    {"chave": "EM_ANDAMENTO", "rotulo": "Em andamento", "cor": "azul"},
    {"chave": "AGUARDANDO_PROVIDENCIA_INTERNA", "rotulo": "Aguardando providência interna",
     "cor": "amarelo"},
    {"chave": "AGUARDANDO_ORGAO_EXTERNO", "rotulo": "Aguardando órgão externo",
     "cor": "roxo", "is_aguardando_externo": True},
    {"chave": "AGUARDANDO_DOCUMENTACAO", "rotulo": "Aguardando documentação", "cor": "amarelo"},
    {"chave": "AGUARDANDO_ANALISE", "rotulo": "Aguardando análise", "cor": "roxo",
     "is_aguardando_externo": True},
    {"chave": "AGUARDANDO_RECURSO", "rotulo": "Aguardando recurso", "cor": "roxo",
     "is_aguardando_externo": True},
    {"chave": "AGUARDANDO_LICITACAO", "rotulo": "Aguardando licitação", "cor": "amarelo"},
    {"chave": "EM_CONTRATACAO", "rotulo": "Em contratação", "cor": "azul"},
    {"chave": "EM_EXECUCAO", "rotulo": "Em execução", "cor": "azul"},
    {"chave": "EM_PRESTACAO_CONTAS", "rotulo": "Em prestação de contas", "cor": "azul"},
    {"chave": "SUSPENSA", "rotulo": "Suspensa", "cor": "cinza", "conta_como_atrasavel": False},
    {"chave": "CONCLUIDA", "rotulo": "Concluída", "cor": "verde", "is_final": True,
     "conta_como_atrasavel": False},
    {"chave": "CANCELADA", "rotulo": "Cancelada", "cor": "vermelho", "is_final": True,
     "conta_como_atrasavel": False},
    {"chave": "ARQUIVADA", "rotulo": "Arquivada", "cor": "neutro", "is_final": True,
     "conta_como_atrasavel": False},
]

STATUS_INICIAL_PADRAO = "ABERTA"
