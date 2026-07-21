export interface PanicButtonOut {
  id: string;
  tenant_id: string;
  person_id: string;
  family_id: string | null;
  activated_at: string;
  location_lat: number | null;
  location_lng: number | null;
  location_address: string | null;
  status: "ATIVO" | "ATENDIDO" | "CANCELADO" | "FALSO_ALARME";
  attended_by: string | null;
  attended_at: string | null;
  notes: string | null;
  medida_protetiva_numero: string | null;
  medida_protetiva_validade: string | null;
  created_at: string;
  updated_at: string;
}

export interface PanicButtonListItem {
  id: string;
  person_id: string;
  activated_at: string;
  location_lat: number | null;
  location_lng: number | null;
  location_address: string | null;
  status: string;
  attended_at: string | null;
}

export interface PanicButtonHistoryItem {
  id: string;
  person_id: string;
  activated_at: string;
  status: string;
  attended_by: string | null;
  attended_at: string | null;
  notes: string | null;
  medida_protetiva_numero: string | null;
  medida_protetiva_validade: string | null;
  created_at: string;
}

export interface PanicButtonActivateBody {
  person_id: string;
  family_id?: string;
  lat?: number;
  lng?: number;
  address?: string;
}

export interface PanicButtonResolveBody {
  status: "ATENDIDO" | "CANCELADO" | "FALSO_ALARME";
  notes?: string;
  medida_protetiva_numero?: string;
  medida_protetiva_validade?: string;
}
