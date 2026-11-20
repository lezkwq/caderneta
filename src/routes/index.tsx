import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect } from "react";
import { Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Caderneta — o telefone certo do dono" },
      { name: "description", content: "A Caderneta acha o telefone certo do dono de empresas locais." },
      { property: "og:title", content: "Caderneta — o telefone certo do dono" },
      { property: "og:description", content: "Acha o telefone certo do dono de empresas locais." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: Index,
});

function Index() {
  const nav = useNavigate();
  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => nav({ to: data.user ? "/new" : "/login", replace: true }));
  }, [nav]);
  return <div className="grid min-h-screen place-items-center"><Loader2 className="size-6 animate-spin" aria-label="Carregando" /></div>;
}
