/// <reference types="vite/client" />

interface ImportMetaEnv {
  /**
   * Blank in development — requests go to `/api` and Vite proxies them to
   * localhost:5000, which keeps the httpOnly refresh cookie same-origin. Set to the
   * API's origin in a deployed build.
   */
  readonly VITE_API_BASE_URL: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
