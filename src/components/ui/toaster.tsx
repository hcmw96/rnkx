import { useToast } from "@/hooks/use-toast";

export function Toaster() {
  const { toasts } = useToast();
  return (
    <div className="fixed bottom-0 right-0 z-50 space-y-2 p-4">
      {toasts?.map((t: any) => (
        <div key={t.id} className="rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground shadow-lg">
          {t.title ?? t.description ?? "Notification"}
        </div>
      ))}
    </div>
  );
}
