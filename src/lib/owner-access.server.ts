import { getRequest } from "@tanstack/react-start/server";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import { avaliarAcessoDono, exigirAcessoDono, type EstadoAcessoDono } from "@/lib/owner-access";

export async function estadoAcessoDono(): Promise<EstadoAcessoDono> {
  const ownerEmail = process.env["OWNER_EMAIL"];
  if (!ownerEmail?.trim()) return avaliarAcessoDono(ownerEmail, null);
  try {
    const request = getRequest();
    const token = /^Bearer ([^\s,]+)$/.exec(request?.headers.get("authorization") ?? "")?.[1];
    const url = process.env["SUPABASE_URL"];
    const key = process.env["SUPABASE_PUBLISHABLE_KEY"];
    if (!token || !url || !key) return "restrito";
    const supabase = createClient<Database>(url, key, {
      auth: { storage: undefined, persistSession: false, autoRefreshToken: false },
    });
    const { data, error } = await supabase.auth.getUser(token);
    const user = data.user;
    if (error || !user?.email || !user.email_confirmed_at) return "restrito";
    return avaliarAcessoDono(ownerEmail, user.email);
  } catch {
    return "restrito";
  }
}

export async function exigirDonoDaSessao(): Promise<void> {
  const estado = await estadoAcessoDono();
  if (estado === "configuracao_pendente") exigirAcessoDono(undefined, null);
  if (estado !== "dono") throw new Error("Acesso restrito");
}
