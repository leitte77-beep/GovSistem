/** DTOs de financeiro — espelham app/schemas/financeiro.py. */

export type RepasseOut = {
  id: string;
  tenant_id: string;
  esfera: "FEDERAL" | "ESTADUAL" | "MUNICIPAL";
  programa: string;
  valor_total: string;
  valor_utilizado: string;
  data_repasse: string;
  data_vigencia_inicio: string;
  data_vigencia_fim: string | null;
  status: "ATIVO" | "ENCERRADO" | "CANCELADO";
  observacoes: string | null;
  created_at: string;
  updated_at: string;
};

export type RepasseListItem = {
  id: string;
  esfera: "FEDERAL" | "ESTADUAL" | "MUNICIPAL";
  programa: string;
  valor_total: string;
  valor_utilizado: string;
  status: "ATIVO" | "ENCERRADO" | "CANCELADO";
  data_repasse: string;
  data_vigencia_fim: string | null;
};

export type RepasseCreate = {
  esfera: string;
  programa: string;
  valor_total: number;
  data_repasse: string;
  data_vigencia_inicio: string;
  data_vigencia_fim?: string | null;
  observacoes?: string | null;
};

export type RepasseUpdate = Partial<RepasseCreate>;

export type GastoOut = {
  id: string;
  tenant_id: string;
  repasse_id: string;
  categoria: "BENEFICIO" | "PESSOAL" | "MATERIAL" | "SERVICO" | "OUTROS";
  descricao: string;
  valor: string;
  data_gasto: string;
  comprovante_url: string | null;
  created_at: string;
  updated_at: string;
};

export type GastoCreate = {
  categoria: string;
  descricao: string;
  valor: number;
  data_gasto: string;
  comprovante_url?: string | null;
};

export type GastoUpdate = Partial<GastoCreate>;

export type ResumoEsfera = {
  esfera: string;
  total_repasse: string;
  total_utilizado: string;
  saldo: string;
  percentual_utilizado: string;
};

export type DashboardFinanceiro = {
  total_repasse: string;
  total_gasto: string;
  saldo_disponivel: string;
  percentual_utilizado_geral: string;
  por_esfera: ResumoEsfera[];
};

export type PrestacaoContasItem = {
  repasse_id: string;
  esfera: string;
  programa: string;
  valor_total: string;
  valor_utilizado: string;
  saldo: string;
  total_gastos: number;
  gastos: GastoOut[];
};

export type PrestacaoContasOut = {
  ano: number;
  total_repasse: string;
  total_gasto: string;
  saldo_geral: string;
  itens: PrestacaoContasItem[];
};
