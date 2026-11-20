import { Link, useNavigate } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { History, ListPlus, LogOut, Search, Settings } from "lucide-react";
import type { ReactNode } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Logo } from "@/components/app/AuthLayout";

const NAV = [
  { to: "/new", label: "Nova busca", curto: "Buscar", icon: Search },
  { to: "/manual", label: "Empresas que conheço", curto: "Manual", icon: ListPlus },
  { to: "/historico", label: "Histórico", curto: "Histórico", icon: History },
  { to: "/configuracoes", label: "Configurações", curto: "Ajustes", icon: Settings },
] as const;

export function AppShell({ children, nome }: { children: ReactNode; nome?: string | null }) {
  const qc = useQueryClient();
  const nav = useNavigate();
  async function sair() {
    await qc.cancelQueries();
    qc.clear();
    await supabase.auth.signOut();
    nav({ to: "/login", replace: true });
  }
  return (
    <div className="min-h-screen">
      <aside className="fixed inset-y-0 left-0 z-20 hidden w-[240px] flex-col border-r border-border bg-card p-4 lg:flex">
        <div className="px-2 py-3"><Logo /></div>
        <nav aria-label="Principal" className="mt-6 flex flex-1 flex-col gap-1">
          {NAV.map(({ to, label, icon: I }) => (
            <Link key={to} to={to} className="flex h-11 items-center gap-3 rounded-full px-4 text-[15px] font-medium text-foreground transition-colors hover:bg-secondary" activeProps={{ className: "bg-primary text-primary-foreground hover:bg-primary" }}>
              <I className="size-[18px] shrink-0" aria-hidden />{label}
            </Link>
          ))}
        </nav>
        <div className="border-t border-border pt-3">
          {nome && <p className="truncate px-4 pb-2 text-sm text-muted-foreground">{nome}</p>}
          <button onClick={sair} className="flex h-11 w-full items-center gap-3 rounded-full px-4 text-[15px] font-medium hover:bg-secondary"><LogOut className="size-[18px]" aria-hidden />Sair</button>
        </div>
      </aside>

      <header className="sticky top-0 z-20 flex h-14 items-center justify-between border-b border-border bg-card px-4 lg:hidden">
        <Logo />
        <button onClick={sair} aria-label="Sair" className="grid size-11 place-items-center rounded-full hover:bg-secondary"><LogOut className="size-5" aria-hidden /></button>
      </header>

      <div className="lg:pl-[240px]">
        <main className="mx-auto w-full max-w-[1280px] px-4 pb-28 pt-6 md:px-6 lg:pb-12 lg:pt-10">{children}</main>
      </div>

      <nav aria-label="Principal" className="fixed inset-x-0 bottom-0 z-20 grid grid-cols-4 border-t border-border bg-card px-2 pb-[env(safe-area-inset-bottom)] lg:hidden">
        {NAV.map(({ to, curto, icon: I }) => (
          <Link key={to} to={to} className="flex min-h-[60px] flex-col items-center justify-center gap-1 text-xs font-medium text-muted-foreground" activeProps={{ className: "text-heading" }}>
            {({ isActive }) => (
              <>
                <span className={`grid h-8 w-14 place-items-center rounded-full ${isActive ? "bg-primary text-primary-foreground" : ""}`}><I className="size-5" aria-hidden /></span>
                {curto}
              </>
            )}
          </Link>
        ))}
      </nav>
    </div>
  );
}

export function PageHeader({ title, desc, actions }: { title: string; desc?: string; actions?: ReactNode }) {
  return (
    <div className="mb-6 grid grid-cols-1 gap-4 md:flex md:items-end md:justify-between">
      <div className="min-w-0">
        <h1 className="page-title">{title}</h1>
        {desc && <p className="mt-1 text-sm text-muted-foreground">{desc}</p>}
      </div>
      {actions}
    </div>
  );
}
