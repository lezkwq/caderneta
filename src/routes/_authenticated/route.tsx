import { createFileRoute, Outlet, redirect } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { AppShell, SairDaConta } from "@/components/app/AppShell";
import { Onboarding } from "@/components/app/Onboarding";
import { perfilQuery } from "@/lib/queries";
import { useServerFn } from "@tanstack/react-start";
import { verificarAcessoDono } from "@/lib/caderneta.functions";

export const Route = createFileRoute("/_authenticated")({
  ssr: false,
  beforeLoad: async () => {
    const { data } = await supabase.auth.getUser();
    if (!data.user) throw redirect({ to: "/login" });
  },
  component: Layout,
});

function Layout() {
  const verificar = useServerFn(verificarAcessoDono);
  const acesso = useQuery({ queryKey: ["acesso-dono"], queryFn: () => verificar() });
  const { data, isPending, isError, refetch } = useQuery({ ...perfilQuery, enabled: acesso.data?.status === "dono" });
  if (acesso.isPending) return <div className="grid min-h-screen place-items-center"><Loader2 className="size-6 animate-spin" aria-label="Carregando" /></div>;
  if (acesso.data?.status !== "dono") {
    const pendente = acesso.data?.status === "configuracao_pendente";
    return (
      <main className="grid min-h-screen place-items-center px-4 py-8">
        <section className="card-soft w-full max-w-md space-y-4 p-6 text-center">
          <h1 className="page-title">{pendente ? "Configuração pendente" : "Acesso restrito"}</h1>
          {pendente && <p className="text-sm text-muted-foreground">Configuração pendente: defina o secret OWNER_EMAIL no Lovable Cloud</p>}
          <SairDaConta className="mx-auto flex min-h-11 items-center justify-center gap-2 rounded-full bg-primary px-5 text-sm font-medium text-primary-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" />
        </section>
      </main>
    );
  }
  if (isPending) return <div className="grid min-h-screen place-items-center"><Loader2 className="size-6 animate-spin" aria-label="Carregando" /></div>;
  if (isError || !data) return <div className="grid min-h-screen place-items-center p-4 text-center"><div><p className="text-danger-text">Não foi possível carregar seu perfil.</p><button className="text-link mt-2" onClick={() => refetch()}>Tentar de novo</button></div></div>;
  if (!data.perfil?.onboarding_ok) return <Onboarding userId={data.userId} />;
  return <AppShell nome={data.perfil.nome}><Outlet /></AppShell>;
}
