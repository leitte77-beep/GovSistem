export interface User {
  id: string;
  email: string;
  name: string;
  is_active: boolean;
  organization_id: string;
  created_at: string;
  managed_by_saas?: boolean;
}

export interface UserCreateRequest {
  name: string;
  email: string;
  password: string;
  organization_id: string;
  role_names: string[];
}

export interface UserUpdateRequest {
  name?: string;
  email?: string;
  is_active?: boolean;
  role_names?: string[];
}

export interface Role {
  id: string;
  name: string;
  label: string;
}
