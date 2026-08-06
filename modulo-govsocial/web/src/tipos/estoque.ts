/** DTOs de estoque — espelham app/schemas/beneficios.py (EstoqueOut, EstoqueCreate, etc.). */

export type EstoqueOut = {
  id: string;
  unit_id: string;
  benefit_type_code: string;
  quantidade_atual: number;
  quantidade_minima: number;
  unidade_medida: string;
  valor_unitario_referencia: number | null;
  created_at: string;
  updated_at: string;
};

export type EstoqueListItem = EstoqueOut & {
  unit_nome?: string;
  benefit_label?: string;
};

export type EstoqueCreate = {
  unit_id: string;
  benefit_type_code: string;
  quantidade_inicial: number;
  quantidade_minima?: number;
  unidade_medida?: string;
  valor_unitario_referencia?: number | null;
};

export type EstoqueUpdate = {
  quantidade_atual?: number;
  quantidade_minima?: number;
  valor_unitario_referencia?: number | null;
};

export type EstoqueMovement = {
  quantidade: number;
  observacao?: string | null;
};
