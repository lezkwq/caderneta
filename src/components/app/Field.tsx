import { AlertCircle } from "lucide-react";
import type { ReactNode } from "react";

export function Field({ id, label, error, hint, children }: { id: string; label: string; error?: string | undefined; hint?: string; children: ReactNode }) {
  return (
    <div className="space-y-1.5">
      <label htmlFor={id} className="block text-sm font-medium text-heading">{label}</label>
      {children}
      {hint && !error && <p className="text-sm text-muted-foreground">{hint}</p>}
      {error && (
        <p id={`${id}-erro`} role="alert" className="flex items-center gap-1.5 text-sm text-danger-text">
          <AlertCircle className="size-4" aria-hidden /> {error}
        </p>
      )}
    </div>
  );
}

export function FormAlert({ kind, children }: { kind: "erro" | "ok"; children: ReactNode }) {
  const cls = kind === "erro" ? "bg-danger-soft text-danger-text border-destructive" : "bg-success-soft text-success-text border-success";
  return <div role="status" className={`rounded-[12px] border-l-4 px-4 py-3 text-sm ${cls}`}>{children}</div>;
}
