/// <reference types="vite/client" />

declare module '*.vue' {
  import type { DefineComponent } from 'vue';
  const component: DefineComponent<{}, {}, any>;
  export default component;
}

interface Window {
  API_URL?: string;
  WS_URL?: string;
  PayambarAuth?: any;
  PayambarConversations?: any;
  PayambarE2EE?: any;
  PayambarFuncs?: any;
  PayambarMessages?: any;
  PayambarWs?: any;
}
