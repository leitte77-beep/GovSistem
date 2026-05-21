export interface SystemSetting {
  id: string;
  key: string;
  value: string | null;
  description: string | null;
  category: string;
  type: string;
  is_encrypted: boolean;
  is_public: boolean;
  created_at: string;
  updated_at: string;
}
