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
  },

  seletorUnidade: {
    rotulo: "Unidade",
    aria: "Selecionar unidade de atendimento",
  },

  busca: {
    placeholder: "Buscar família, pessoa, CPF ou NIS…",
    atalho: "atalho: /",
    aria: "Busca global",
  },
} as const;
