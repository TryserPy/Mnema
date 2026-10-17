/// <reference types="vite/client" />
declare module '*.css';
declare module 'virtual:sql-wasm' {
  const base64: string;
  export default base64;
}

interface ImportMetaEnv {
  /** ClientID приложения на oauth.yandex.ru — для входа в Яндекс Диск (облако). Пусто — вход через Яндекс не показывается. */
  readonly VITE_YANDEX_CLIENT_ID?: string;
}
