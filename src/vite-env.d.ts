/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_API_MODE?: "mock" | "live";
  readonly VITE_API_BASE_URL?: string;
  readonly VITE_HISTORY_STORAGE?: "local" | "backend";
}
interface ImportMeta {
  readonly env: ImportMetaEnv;
}
