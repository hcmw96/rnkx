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
    /** Despia OneSignal: fired when user taps a push notification. */
    onNotificationEvent?: (payload: {
      type?: string;
      path?: string;
      url?: string;
      metadata?: unknown;
      data?: unknown;
      custom?: unknown;
      additionalData?: unknown;
    }) => void;
    AppleID?: {
      auth: {
        init: (config: {
          clientId: string;
          scope: string;
          redirectURI: string;
          usePopup: boolean;
          nonce: string;
        }) => void;
        signIn: () => Promise<unknown> | void;
      };
    };
  }
}

export {};
