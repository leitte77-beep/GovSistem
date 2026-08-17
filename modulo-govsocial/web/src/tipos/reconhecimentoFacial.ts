export interface FaceOut {
  id: string;
  tenant_id: string;
  person_id: string;
  foto_url?: string;
  face_encoding?: Record<string, unknown>;
  status: string;
  metodo_verificacao: string;
  data_cadastro?: string;
  data_ultima_verificacao?: string;
  created_at: string;
  updated_at: string;
}

export interface FaceVerificarOut {
  match: boolean;
  confianca: number;
  motivo?: string;
}

export interface FacePendenteOut {
  person_id: string;
  nome: string;
  cpf?: string;
  nis?: string;
  status_face: string;
  face_id?: string;
  data_cadastro_face?: string;
}

export interface FaceCadastrarBody {
  person_id: string;
  foto_base64: string;
  metodo: "FOTO_SIMPLES" | "BIOMETRIA";
}

export interface FaceVerificarBody {
  person_id: string;
  foto_base64: string;
}
