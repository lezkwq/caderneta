import { AlertTriangle, CheckCircle2, CircleDashed, Loader2, ShieldAlert, ShieldCheck, ShieldQuestion, XCircle } from "lucide-react";
import type { ReactNode } from "react";
import { faixaScore } from "@/lib/score";

export function Pill({ tone = "neutro", icon, children }: { tone?: "ok" | "erro" | "atencao" | "neutro" | "info"; icon?: ReactNode; children: ReactNode }) {
  const t = {
    ok: "bg-success-soft text-success-text",
    erro: "bg-danger-soft text-danger-text",
    atencao: "bg-warning-soft text-warning-text",
    neutro: "bg-secondary text-heading",
    info: "bg-secondary text-heading",
  }[tone];
  return <span className={`inline-flex h-7 items-center gap-1.5 whitespace-nowrap rounded-full px-3 text-sm font-medium ${t}`}>{icon}{children}</span>;
}

export function BadgeConfianca({ score, telefoneEmpresa = false }: { score: number; telefoneEmpresa?: boolean }) {
  const f = faixaScore(score);
  const rotulo = telefoneEmpresa ? "telefone da empresa" : `${score}`;
  if (f === "alta") return <Pill tone="ok" icon={<ShieldCheck className="size-4 text-success" aria-hidden />}>Alta · {rotulo}</Pill>;
  if (f === "media") return <Pill tone="atencao" icon={<ShieldQuestion className="size-4 text-warning" aria-hidden />}>Média · {rotulo}</Pill>;
  return <Pill tone="erro" icon={<ShieldAlert className="size-4 text-destructive" aria-hidden />}>Baixa · {rotulo}</Pill>;
}

const STATUS_CNPJ: Record<string, { t: string; tone: "ok" | "erro" | "atencao" | "neutro"; i: "ok" | "spin" | "warn" | "x" | "wait" }> = {
  pendente: { t: "Procurando CNPJ", tone: "neutro", i: "spin" },
  na_fila: { t: "CNPJ na fila", tone: "neutro", i: "wait" },
  consultando: { t: "Consultando CNPJ", tone: "neutro", i: "spin" },
  validado: { t: "CNPJ confirmado", tone: "ok", i: "ok" },
  provavel: { t: "Provável, confirmar", tone: "atencao", i: "warn" },
  varios: { t: "Vários candidatos, escolher", tone: "atencao", i: "warn" },
  divergente: { t: "CNPJ divergente", tone: "atencao", i: "warn" },
  nao_encontrado: { t: "CNPJ não encontrado", tone: "neutro", i: "x" },
  erro: { t: "Falha na consulta", tone: "erro", i: "warn" },
};
export function StatusCnpj({ status }: { status: string }) {
  const s = STATUS_CNPJ[status] ?? { t: status, tone: "neutro" as const, i: "wait" as const };
  const icon = { ok: <CheckCircle2 className="size-4 text-success" aria-hidden />, spin: <Loader2 className="size-4 animate-spin" aria-hidden />, warn: <AlertTriangle className="size-4 text-warning" aria-hidden />, x: <XCircle className="size-4" aria-hidden />, wait: <CircleDashed className="size-4" aria-hidden /> }[s.i];
  return <Pill tone={s.tone} icon={icon}>{s.t}</Pill>;
}

export function StatusBusca({ status }: { status: string }) {
  if (status === "pausada") return <Pill tone="atencao">Busca pausada</Pill>;
  if (status === "cancelada") return <Pill tone="erro">Busca cancelada</Pill>;
  if (status === "importando") return <Pill icon={<Loader2 className="size-4 animate-spin" aria-hidden />}>Organizando resultados</Pill>;
  if (status === "concluida") return <Pill tone="ok" icon={<CheckCircle2 className="size-4 text-success" aria-hidden />}>Concluída</Pill>;
  if (status === "erro") return <Pill tone="erro" icon={<XCircle className="size-4 text-destructive" aria-hidden />}>Erro</Pill>;
  if (status === "buscando") return <Pill icon={<Loader2 className="size-4 animate-spin" aria-hidden />}>Buscando no Maps</Pill>;
  return <Pill icon={<Loader2 className="size-4 animate-spin" aria-hidden />}>Processando</Pill>;
}

export function Metric({ label, value, icon }: { label: string; value: ReactNode; icon?: ReactNode }) {
  return (
    <div className="card-soft p-4">
      <div className="flex items-center gap-2 text-sm text-muted-foreground">{icon}{label}</div>
      <div className="mt-1 text-2xl font-semibold text-heading">{value}</div>
    </div>
  );
}

export function SkeletonLinhas({ n = 4 }: { n?: number }) {
  return <div className="space-y-3" aria-label="Carregando">{Array.from({ length: n }).map((_, i) => <div key={i} className="h-16 animate-pulse rounded-2xl bg-card" />)}</div>;
}
