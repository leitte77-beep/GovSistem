export interface User {
  id: string;
  email: string;
  name: string;
  cpf?: string;
  is_active: boolean;
  organization_id: string;
  created_at: string;
}

export interface UserCreateRequest {
  name: string;
  email: string;
  password: string;
  cpf?: string;
  organization_id: string;
  role_names: string[];
}

export interface UserUpdateRequest {
  name?: string;
  email?: string;
  password?: string;
  cpf?: string;
  is_active?: boolean;
  role_names?: string[];
}

export interface Role {
  id: string;
  name: string;
  label: string;
}
