/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_API_BASE_URL?: string;
  readonly VITE_DEMO_PASSWORD?: string;
  /** Public Iran Payamak API host for UI labels only — never a secret. */
  readonly VITE_IRANPAYAMAK_BASE_URL?: string;
  /** mock | live — browser default mock until same-origin API exists. */
  readonly VITE_PREMIUM_COMPARE_SOURCE?: string;
  /** Public Teamsho URL (not a secret). Docs alias: OMID_TEAMSHO_URL. */
  readonly VITE_OMID_TEAMSHO_URL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
