/// <reference types="vite/client" />

declare global {
  interface Window {
    TerraWidgetAPI?: {
      createWidget: (options: {
        dev_id: string;
        reference_id: string;
        auth_success_redirect_url?: string;
        auth_failure_redirect_url?: string;
        language?: string;
      }) => void;
    };
  }
}

export {};
