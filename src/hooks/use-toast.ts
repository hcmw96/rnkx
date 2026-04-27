export type ToastInput = {
  title?: string;
  description?: string;
  variant?: 'default' | 'destructive';
};

export function useToast() {
  return {
    toasts: [] as unknown[],
    toast: (_input?: ToastInput) => {},
  };
}

export const toast = (_input?: ToastInput) => {};
