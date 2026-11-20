import { createFileRoute, Link } from "@tanstack/react-router";
import { useState, type FormEvent } from "react";
import { supabase } from "@/integrations/supabase/client";
import { AuthLayout } from "@/components/app/AuthLayout";
import { Field, FormAlert } from "@/components/app/Field";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { traduzErroAuth } from "@/lib/auth-errors";

export const Route = createFileRoute("/esqueci-senha")({
  head: () => ({
    meta: [
      { title: "Esqueci a senha — Caderneta" },
      { name: "description", content: "Receba um link para criar uma nova senha." },
      { property: "og:title", content: "Esqueci a senha — Caderneta" },
      { property: "og:description", content: "Receba um link para criar uma nova senha na Caderneta." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: Esqueci,
});

function Esqueci() {
  const [email, setEmail] = useState("");
  const [erro, setErro] = useState("");
  const [ok, setOk] = useState(false);
  const [loading, setLoading] = useState(false);
  async function enviar(e: FormEvent) {
    e.preventDefault();
    setErro("");
    if (!/^\S+@\S+\.\S+$/.test(email.trim())) { setErro("Digite um e-mail válido."); return; }
    setLoading(true);
    const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), { redirectTo: `${window.location.origin}/redefinir-senha` });
    setLoading(false);
    if (error) { setErro(traduzErroAuth(error.message)); return; }
    setOk(true);
  }
  return (
    <AuthLayout title="Esqueci a senha">
      <form onSubmit={enviar} className="space-y-4" noValidate>
        <Field id="email" label="E-mail" error={erro}><Input id="email" type="email" aria-invalid={!!erro} value={email} onChange={(e) => setEmail(e.target.value)} /></Field>
        {ok && <FormAlert kind="ok">Se houver conta com esse e-mail, enviamos um link para criar uma nova senha.</FormAlert>}
        <Button type="submit" className="w-full" loading={loading}>Enviar link</Button>
        <Link to="/login" className="text-link text-sm">Voltar para entrar</Link>
      </form>
    </AuthLayout>
  );
}
