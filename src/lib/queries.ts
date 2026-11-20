import { queryOptions } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export const perfilQuery = queryOptions({
  queryKey: ["perfil"],
  queryFn: async () => {
    const { data: u } = await supabase.auth.getUser();
    if (!u.user) throw new Error("Sem sessão");
    const { data, error } = await supabase.from("profiles").select("*").eq("id", u.user.id).maybeSingle();
    if (error) throw error;
    return { perfil: data, email: u.user.email ?? "", userId: u.user.id };
  },
});

export const buscasQuery = queryOptions({
  queryKey: ["buscas"],
  queryFn: async () => {
    const { data, error } = await supabase.from("buscas").select("*").order("created_at", { ascending: false }).limit(200);
    if (error) throw error;
    return data;
  },
});

export const buscaQuery = (id: string) => queryOptions({
  queryKey: ["busca", id],
  queryFn: async () => {
    const [b, l, t] = await Promise.all([
      supabase.from("buscas").select("*").eq("id", id).maybeSingle(),
      supabase.from("leads").select("*").eq("busca_id", id).order("created_at"),
      supabase.from("telefones").select("*, leads!inner(busca_id)").eq("leads.busca_id", id).order("score", { ascending: false }),
    ]);
    if (b.error) throw b.error;
    if (l.error) throw l.error;
    if (t.error) throw t.error;
    return { busca: b.data, leads: l.data, telefones: t.data };
  },
});
