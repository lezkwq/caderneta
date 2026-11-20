import { createFileRoute, Outlet, redirect } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { AppShell } from "@/components/app/AppShell";
import { Onboarding } from "@/components/app/Onboarding";
import { perfilQuery } from "@/lib/queries";

export const Route = createFileRoute("/_authenticated")({
  ssr: false,
  beforeLoad: async () => {
    const { data } = await supabase.auth.getUser();
    if (!data.user) throw redirect({ to: "/login" });
  },
  component: Layout,
});

function Layout() {
  const { data, isPending, isError, refetch } = useQuery(perfilQuery);
  if (isPending) return <div className="grid min-h-screen place-items-center"><Loader2 className="size-6 animate-spin" aria-label="Carregando" /></div>;
  if (isError || !data) return <div className="grid min-h-screen place-items-center p-4 text-center"><div><p className="text-danger-text">Não foi possível carregar seu perfil.</p><button className="text-link mt-2" onClick={() => refetch()}>Tentar de novo</button></div></div>;
  if (!data.perfil?.onboarding_ok) return <Onboarding userId={data.userId} />;
  return <AppShell nome={data.perfil.nome}><Outlet /></AppShell>;
}
