/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_API_URL: string;
  readonly VITE_API_MOCK?: string;
  readonly VITE_MOCK_ROLE?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
