/**
 * Microcopy centralizada (pt-BR, vocabulário SUAS — §2).
 * Sentence case; botões nomeiam a ação exata; erros dizem o que houve e como
 * resolver, sem se desculpar; vazios convidam à ação.
 */
export const textos = {
  produto: "GovSocial",
  modulo: "Assistência Social",

  nav: {
    inicio: "Início",
    familias: "Famílias",
    atendimentos: "Atendimentos",
    agenda: "Agenda & Fila",
    beneficios: "Benefícios",
    grupos: "Grupos & SCFV",
    encaminhamentos: "Encaminhamentos",
    rma: "RMA",
    vigilancia: "Vigilância",
    vigilanciaAvancada: "Vigilância Avançada",
    estoque: "Estoque",
    habitacao: "Habitação",
    financeiro: "Financeiro",
    monitoramento: "Sala de Monitoramento",
    buscaAtiva: "Busca Ativa",
    administracao: "Administração",
    biometria: "Biometria",
  },

  acoes: {
    tentarNovamente: "Tentar novamente",
    cadastrarFamilia: "Cadastrar nova família",
    registrarAtendimento: "Registrar atendimento",
    concederBeneficio: "Conceder benefício",
    encaminhar: "Encaminhar",
    fechar: "Fechar",
    cancelar: "Cancelar",
    salvar: "Salvar",
    entrar: "Entrar",
    buscarFamilias: "Buscar famílias",
    novoCadastro: "Novo cadastro",
    beneficio: "Benefício",
    estatisticas: "Estatísticas",
    configuracoes: "Configurações",
    relatorioMensal: "Relatório Mensal",
    abrirFila: "Abrir fila",
    novoAtendimento: "Novo Atendimento",
    verTodas: "Ver todas",
  },

  estados: {
    carregando: "Carregando…",
    offlineTitulo: "Sem conexão",
    offlineDescricao:
      "Você está trabalhando offline. As alterações serão enviadas quando a conexão voltar.",
    semPermissaoTitulo: "Você não tem acesso a esta área",
    semPermissaoDescricao:
      "Seu perfil não permite ver este conteúdo. Se precisar de acesso, fale com a coordenação da unidade.",
    naoEncontradoTitulo: "Página não encontrada",
    naoEncontradoDescricao: "O endereço acessado não existe ou foi movido.",
    emConstrucaoTitulo: "Em construção",
    emConstrucaoDescricao: "Esta área será liberada em uma próxima fase do módulo.",
  },

  sigilo: {
    veladoTitulo: "Conteúdo restrito",
    veladoAviso: "Sua visualização será registrada para fins de auditoria.",
    revelar: "Ver conteúdo restrito",
    mostrarCampo: "Mostrar {campo} completo",
  },

  seletorUnidade: {
    rotulo: "Unidade",
    aria: "Selecionar unidade de atendimento",
  },

  busca: {
    placeholder: "Buscar família, pessoa, CPF ou NIS…",
    atalho: "atalho: /",
    aria: "Busca global",
    limpar: "Limpar busca",
    resultadosPara: "Resultados para",
    nenhumResultado: "Nenhum resultado para",
  },

  dashboard: {
    saudacao: {
      bomDia: "Bom dia",
      boaTarde: "Boa tarde",
      boaNoite: "Boa noite",
    },
    escopo: "Exibindo: {unidade}",
    competencia: "Competência: {mes}/{ano}",
    recomendacoes: "Recomendações",
    acoesRapidas: "Ações rápidas",
    tudoEmDia: "Tudo em dia por enquanto. ✨",
    tudoEmDiaDescricao: "Nenhuma pendência detectada para a unidade agora.",
    filaVaziaTitulo: "Ninguém na fila agora",
    filaVaziaDescricao: "Os check-ins da recepção e os agendamentos de hoje aparecem aqui.",
    atividadeVazia: "Nenhum evento recente registrado.",
    primeirosPassos: "Os registros de atendimentos e concessões aparecerão cronologicamente aqui.",
    naFilaHoje: "na fila hoje",
    aguardando: "aguardando",
    emAtendimento: "em atendimento",
    verAtividadeCompleta: "Ver atividade completa",
  },

  familias: {
    titulo: "Famílias cadastradas",
    subtitulo: "Gerencie e visualize os dados das famílias assistidas",
    nenhumaCadastrada: "Nenhuma família cadastrada ainda",
    nenhumaCadastradaDica:
      "Use a busca acima ou o botão \"Nova Família\" para adicionar o primeiro registro.",
    responsavel: "Responsável",
    semResponsavel: "Sem responsável",
    pessoaSemFamilia: "As pessoas encontradas ainda não têm família vinculada ativa.",
    nenhumaPessoa: "Nenhuma pessoa cadastrada",
    cadastrePessoas: "Cadastre pessoas através da composição familiar ou use a busca acima.",
    faixa: "Faixa: {faixa}",
    programaPBF: "Programa Bolsa Família",
    unidadeTerritorio: "Unidade: {territorio}",
    nFamilia: "Família {codigo}",
    cadastradoEm: "Cad.",
    voltarParaFamilias: "Voltar para Famílias",
  },

  kpi: {
    atendimentos: "Atendimentos",
    acompanhamentos: "Acompanhamentos",
    familiasCadastradas: "Famílias cadastradas",
    beneficiosMes: "Benefícios / mês",
    encaminhamentos: "Encaminhamentos",
    inscritosSCFV: "Inscritos SCFV",
    indisponivel: "indisponível",
    zeroAtendimentos: "nenhum registrado neste mês",
    zeroAcompanhamentos: "nenhum acompanhamento ativo",
    zeroFamilias: "nenhuma família cadastrada",
    zeroBeneficios: "nenhum benefício concedido neste mês",
    zeroEncaminhamentos: "nenhum encaminhamento no período",
    zeroInscritos: "sem grupos ativos",
  },

  tema: {
    claro: "Tema: claro. Ativar tema escuro",
    escuro: "Tema: escuro. Ativar tema claro",
  },
} as const;
