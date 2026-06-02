/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_SUPABASE_URL: string;
  readonly VITE_SUPABASE_ANON_KEY: string;
  // Main app (cloudflared tunnel) base URL — mints the scoped Supabase JWT the
  // portal reads under, e.g. https://remote.shwan-orthodontics.com
  readonly VITE_MAIN_APP_URL: string;
  readonly VITE_R2_BUCKET_NAME?: string;
  readonly VITE_R2_ACCESS_KEY_ID?: string;
  readonly VITE_R2_SECRET_ACCESS_KEY?: string;
  readonly VITE_R2_ENDPOINT?: string;
  readonly VITE_PUBLIC_STORAGE_URL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
