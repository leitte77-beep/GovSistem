export interface ItemMenu {
  rotulo: string;
  para: string;
  permissao?: string;
}

export interface GrupoMenu {
  titulo: string;
  itens: ItemMenu[];
}

// Estrutura da sidebar (seção 4). Itens que na especificação seriam telas
// próprias mas na prática vivem dentro do processo/contrato (DFD, ETP, TR,
// Aditivos, Medições...) não recebem link solto aqui — ficam nas abas do
// respectivo detalhe, o que evita links que levariam a uma lista vazia sem
// contexto.
export const MENU: GrupoMenu[] = [
  {
    titulo: "Visão Geral",
    itens: [
      { rotulo: "Dashboard", para: "/", permissao: "govcompras.dashboard.visualizar" },
      { rotulo: "Minhas Pendências", para: "/pendencias", permissao: "govcompras.processos.visualizar" },
      { rotulo: "Processos", para: "/processos", permissao: "govcompras.processos.visualizar" },
      { rotulo: "Agenda e Prazos", para: "/agenda", permissao: "govcompras.dashboard.visualizar" },
    ],
  },
  {
    titulo: "Planejamento",
    itens: [
      { rotulo: "Solicitações", para: "/solicitacoes", permissao: "govcompras.solicitacoes.visualizar" },
      { rotulo: "PCA", para: "/pca", permissao: "govcompras.planejamento.visualizar" },
    ],
  },
  {
    titulo: "Compras",
    itens: [
      { rotulo: "Catálogo de Itens", para: "/catalogo", permissao: "govcompras.catalogo.visualizar" },
      { rotulo: "Fornecedores", para: "/fornecedores", permissao: "govcompras.fornecedores.visualizar" },
    ],
  },
  {
    titulo: "Licitações",
    itens: [
      { rotulo: "Pregões", para: "/processos?tipo=pregao", permissao: "govcompras.licitacao.visualizar" },
      { rotulo: "Concorrências", para: "/processos?tipo=concorrencia", permissao: "govcompras.licitacao.visualizar" },
      { rotulo: "Dispensas", para: "/processos?tipo=dispensa", permissao: "govcompras.licitacao.visualizar" },
      { rotulo: "Inexigibilidades", para: "/processos?tipo=inexigibilidade", permissao: "govcompras.licitacao.visualizar" },
      { rotulo: "Credenciamentos", para: "/processos?tipo=credenciamento", permissao: "govcompras.licitacao.visualizar" },
      { rotulo: "Adesões a Atas", para: "/processos?tipo=adesao_ata", permissao: "govcompras.licitacao.visualizar" },
      { rotulo: "Contratações Emergenciais", para: "/processos?tipo=contratacao_emergencial", permissao: "govcompras.licitacao.visualizar" },
    ],
  },
  {
    titulo: "Contratos",
    itens: [
      { rotulo: "Contratos", para: "/contratos", permissao: "govcompras.contratos.visualizar" },
      { rotulo: "Atas de Registro de Preços", para: "/atas", permissao: "govcompras.atas.visualizar" },
      { rotulo: "Central de Vencimentos", para: "/vencimentos", permissao: "govcompras.contratos.visualizar" },
    ],
  },
  {
    titulo: "Gestão",
    itens: [
      { rotulo: "Relatórios", para: "/relatorios", permissao: "govcompras.relatorios.visualizar" },
      { rotulo: "Notificações", para: "/notificacoes" },
    ],
  },
  {
    titulo: "Administração",
    itens: [
      { rotulo: "Usuários", para: "/administracao/usuarios", permissao: "govcompras.usuarios.gerenciar" },
      { rotulo: "Secretarias e Setores", para: "/administracao/estrutura", permissao: "govcompras.usuarios.gerenciar" },
      { rotulo: "Workflows", para: "/administracao/workflows", permissao: "govcompras.workflow.gerenciar" },
      { rotulo: "Auditoria", para: "/auditoria", permissao: "govcompras.auditoria.visualizar" },
    ],
  },
];
