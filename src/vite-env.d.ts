/// <reference types="vite/client" />

declare global {
  interface Window {
    /** Injected in Despia WebView; absent in normal browsers. */
    despia?: unknown;
    TerraWidgetAPI?: {
      createWidget: (options: {
        dev_id: string;
        reference_id: string;
        auth_success_redirect_url?: string;
        auth_failure_redirect_url?: string;
        language?: string;
      }) => void;
    };
    /** Despia native bridge: called after a RevenueCat purchase completes. */
    onRevenueCatPurchase?: () => void | Promise<void>;
  }
}

export {};
