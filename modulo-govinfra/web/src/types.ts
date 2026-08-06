/** Tipos compartilhados do GovInfra (espelham os contratos da API). */

export type Sessao = {
  usuario: {
    id: string;
    nome: string;
    email: string;
    matricula?: string | null;
    cargo?: string | null;
    perfil: string;
    perfil_rotulo: string;
    ativo: boolean;
  };
  organizacao: { id: string; nome: string; slug?: string | null };
  permissoes: string[];
  modulo: { nome: string; descricao: string; versao: string };
  mapa: {
    url_tiles: string;
    atribuicao: string;
    latitude: number;
    longitude: number;
    zoom: number;
  };
  municipio: { nome: string; uf: string };
};

export type Paginado<T> = {
  itens: T[];
  total: number;
  pagina: number;
  por_pagina: number;
  paginas: number;
};

export type Pessoa = {
  id: string;
  nome: string;
  documento?: string | null;
  documento_mascarado?: boolean;
  telefone?: string | null;
  whatsapp?: string | null;
  email?: string | null;
  bairro?: string | null;
  municipio?: string | null;
  uf?: string | null;
  situacao: string;
  tipos: string[];
  pessoa_juridica?: boolean;
  logradouro?: string | null;
  numero?: string | null;
  created_at?: string;
  bloqueios_ativos?: number;
};

export type Imovel = {
  id: string;
  codigo: string;
  nome?: string | null;
  tipo: string;
  logradouro?: string | null;
  numero?: string | null;
  bairro?: string | null;
  comunidade?: string | null;
  municipio?: string | null;
  uf?: string | null;
  regiao_id?: string | null;
  area_hectares?: number | null;
  latitude?: number | null;
  longitude?: number | null;
  situacao: string;
};

export type Cacamba = {
  id: string;
  codigo: string;
  patrimonio?: string | null;
  identificacao_visual?: string | null;
  tipo?: string | null;
  modelo?: string | null;
  capacidade_m3?: number | null;
  situacao: string;
  situacao_rotulo: string;
  localizacao_atual?: string | null;
  latitude?: number | null;
  longitude?: number | null;
  qr_code?: string | null;
  proxima_vistoria_em?: string | null;
  created_at: string;
  cor?: string | null;
  data_aquisicao?: string | null;
  valor_aquisicao?: number | null;
  estado_conservacao?: string | null;
  localizacao_padrao?: string | null;
  ultima_vistoria_em?: string | null;
  observacoes?: string | null;
  data_baixa?: string | null;
  motivo_baixa?: string | null;
  row_version?: number;
  dias_em_uso?: number | null;
  solicitacao_atual?: {
    id: string;
    protocolo: string;
    situacao: string;
    endereco: string;
    data_prevista_retirada?: string | null;
    atrasada: boolean;
  } | null;
  proxima_reserva_em?: string | null;
  ultima_movimentacao_em?: string | null;
  ultima_movimentacao_descricao?: string | null;
};

export type SolicitacaoCacamba = {
  id: string;
  protocolo_formatado: string;
  situacao: string;
  situacao_rotulo: string;
  prioridade: string;
  solicitante?: string | null;
  logradouro?: string | null;
  numero?: string | null;
  bairro?: string | null;
  data_agendada?: string | null;
  data_prevista_entrega?: string | null;
  data_prevista_retirada?: string | null;
  dias_previstos?: number | null;
  cacamba_codigo?: string | null;
  veiculo_placa?: string | null;
  atrasada: boolean;
  dias_atraso: number;
  created_at: string;
  row_version?: number;
  tipo_residuo?: string | null;
  descricao_material?: string | null;
  quantidade_estimada_m3?: number | null;
  pessoa?: Pessoa | null;
  imovel?: Imovel | null;
  termo_aceito?: boolean;
  proximas_situacoes?: string[];
};

export type Maquina = {
  id: string;
  codigo: string;
  patrimonio?: string | null;
  nome: string;
  marca?: string | null;
  modelo?: string | null;
  ano?: number | null;
  categoria_id?: string | null;
  categoria?: { id: string; chave: string; nome: string } | null;
  horimetro_atual: number;
  tipo_combustivel: string;
  capacidade_tanque_litros?: number | null;
  consumo_medio_litros_hora?: number | null;
  situacao: string;
  situacao_rotulo: string;
  localizacao_atual?: string | null;
};

export type Veiculo = {
  id: string;
  codigo: string;
  placa: string;
  nome: string;
  marca?: string | null;
  modelo?: string | null;
  ano?: number | null;
  tipo: string;
  transporta_cacamba: boolean;
  odometro_atual: number;
  situacao: string;
  situacao_rotulo: string;
  licenciamento_ate?: string | null;
  seguro_ate?: string | null;
};

export type Programa = {
  id: string;
  chave: string;
  nome: string;
  descricao?: string | null;
  vigencia_inicio: string;
  vigencia_fim?: string | null;
  horas_por_beneficiario?: number | null;
  horas_por_propriedade?: number | null;
  regra_limite: string;
  metodo_desconto: string;
  permite_horas_adicionais: boolean;
  ativo: boolean;
  beneficiarios?: number;
  horas_concedidas?: number;
  horas_utilizadas?: number;
};

export type Beneficiario = {
  id: string;
  programa_id: string;
  programa_nome?: string | null;
  pessoa?: Pessoa | null;
  classificacao?: string | null;
  atividade_produtiva?: string | null;
  data_entrada: string;
  validade_ate?: string | null;
  situacao: string;
  saldos: { id: string; imovel_nome?: string | null; saldo_disponivel: number }[];
  saldo_total_disponivel: number;
  bloqueios_ativos?: number;
};

export type SolicitacaoServico = {
  id: string;
  protocolo_formatado: string;
  situacao: string;
  situacao_rotulo: string;
  prioridade: string;
  programa_nome?: string | null;
  produtor?: string | null;
  propriedade?: string | null;
  tipo_servico?: string | null;
  descricao?: string | null;
  horas_estimadas?: number | null;
  horas_autorizadas?: number | null;
  data_desejada?: string | null;
  data_agendada?: string | null;
  created_at: string;
};

export type OrdemServico = {
  id: string;
  numero_formatado: string;
  situacao: string;
  situacao_rotulo: string;
  data_prevista: string;
  hora_prevista_inicio?: string | null;
  hora_prevista_fim?: string | null;
  horas_autorizadas: number;
  produtor?: string | null;
  propriedade?: string | null;
  tipo_servico?: string | null;
  url_consulta?: string | null;
  created_at: string;
};

export type Tanque = {
  id: string;
  codigo: string;
  nome: string;
  tipo_combustivel: string;
  local?: string | null;
  capacidade_litros?: number | null;
  estoque_atual_litros: number;
  estoque_minimo_litros?: number | null;
  bombas?: string[];
  ativo: boolean;
};

export type Abastecimento = {
  id: string;
  abastecido_em: string;
  quantidade_litros: number;
  tipo_combustivel: string;
  valor_unitario?: number | null;
  valor_total?: number | null;
  horimetro?: number | null;
  quilometragem?: number | null;
  local?: string | null;
  maquina?: string | null;
  veiculo?: string | null;
  alertas: { codigo: string; mensagem: string }[];
};

export type Manutencao = {
  id: string;
  equipamento?: string | null;
  equipamento_tipo?: string | null;
  tipo: string;
  situacao: string;
  situacao_rotulo: string;
  prioridade: string;
  data_abertura: string;
  data_prevista?: string | null;
  data_conclusao?: string | null;
  defeito?: string | null;
  custo_total?: number | null;
};

export type Bloqueio = {
  id: string;
  pessoa_nome?: string | null;
  imovel_nome?: string | null;
  motivo_nome?: string | null;
  servico_afetado: string;
  tipo: string;
  descricao?: string | null;
  data_inicio: string;
  data_fim?: string | null;
  situacao: string;
  criado_por?: string | null;
  created_at: string;
};

export type Notificacao = {
  id: string;
  tipo: string;
  titulo: string;
  mensagem: string;
  entidade?: string | null;
  entidade_id?: string | null;
  link?: string | null;
  situacao: string;
  criada_em: string;
};

export type RegistroAuditoria = {
  id: string;
  acao: string;
  entidade: string;
  entidade_descricao?: string | null;
  resultado: string;
  justificativa?: string | null;
  detalhe?: string | null;
  usuario?: { id?: string; nome?: string; perfil?: string } | null;
  criada_em: string;
  ip?: string | null;
};

export type ConfiguracaoItem = {
  id: string;
  area: string;
  chave: string;
  valor: any;
  tipo: string;
  rotulo: string;
  descricao?: string | null;
  editavel: boolean;
};

export type RelatorioCatalogo = {
  chave: string;
  titulo: string;
  area: string;
  formatos: string[];
};

export type Regiao = {
  id: string;
  chave: string;
  nome: string;
  tipo: string;
  bairros: string[];
  atendida: boolean;
  ativo: boolean;
};

export type TipoResiduo = {
  id: string;
  chave: string;
  nome: string;
  proibido: boolean;
  ativo: boolean;
};

export type TipoServico = {
  id: string;
  chave: string;
  nome: string;
  exige_vistoria: boolean;
  horas_medias?: number | null;
  usa_banco_horas: boolean;
  ativo: boolean;
};

export type OpcaoData = {
  data: string;
  pontuacao: number;
  viavel: boolean;
  confianca: number;
  cacamba_sugerida?: string | null;
  veiculo_sugerido?: string | null;
  ocupacao_percentual?: number | null;
  distancia_estimada_km?: number | null;
  motivos_favoraveis: string[];
  alertas: string[];
  impedimentos: string[];
};

export type Arquivo = {
  id: string;
  nome: string;
  categoria: string;
  mime_type: string;
  tamanho_bytes: number;
  enviado_em: string;
  observacao?: string | null;
  e_imagem: boolean;
  e_video: boolean;
};

export type Dashboard = {
  periodo_dias: number;
  cacambas: {
    total: number;
    disponiveis: number;
    reservadas: number;
    aguardando_entrega: number;
    em_uso: number;
    aguardando_retirada: number;
    em_limpeza: number;
    em_manutencao: number;
    atrasadas: number;
    solicitacoes_pendentes: number;
    entregas_hoje: number;
    retiradas_hoje: number;
  };
  porteira: {
    solicitacoes_pendentes: number;
    em_analise: number;
    aguardando_vistoria: number;
    aprovadas: number;
    agendados: number;
    em_execucao: number;
    concluidos_periodo: number;
    horas_autorizadas: number;
    horas_reservadas: number;
    horas_utilizadas: number;
    maquinas_disponiveis: number;
    maquinas_em_operacao: number;
    maquinas_em_manutencao: number;
    caminhoes_disponiveis: number;
    caminhoes_em_operacao: number;
  };
  combustivel: {
    litros_periodo: number;
    custo_estimado: number;
    abastecimentos: number;
    com_inconsistencia: number;
    sem_ordem_servico: number;
    tanques: { id: string; nome: string; estoque_atual_litros: number; capacidade_litros?: number | null; abaixo_do_minimo: boolean; ocupacao_percentual: number }[];
  };
  agenda_hoje: { id: string; tipo: string; titulo: string; detalhe?: string | null; situacao: string; link?: string | null }[];
  proximos_agendamentos: { id: string; protocolo: string; data?: string | null; endereco?: string | null; situacao: string; link?: string | null }[];
  alertas: { nivel: 'critico' | 'atencao' | 'info'; titulo: string; link?: string | null }[];
  pendencias: { aguardando_aprovacao: number; horas_adicionais: number; manutencoes_abertas: number };
};
