import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState, type FormEvent } from "react";
import { supabase } from "@/integrations/supabase/client";
import { AuthLayout } from "@/components/app/AuthLayout";
import { Field, FormAlert } from "@/components/app/Field";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { traduzErroAuth } from "@/lib/auth-errors";

export const Route = createFileRoute("/redefinir-senha")({
  head: () => ({
    meta: [
      { title: "Nova senha — Caderneta" },
      { name: "description", content: "Crie uma nova senha para sua conta." },
      { property: "og:title", content: "Nova senha — Caderneta" },
      { property: "og:description", content: "Crie uma nova senha para sua conta na Caderneta." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: Redefinir,
});

function Redefinir() {
  const nav = useNavigate();
  const [senha, setSenha] = useState("");
  const [erro, setErro] = useState("");
  const [loading, setLoading] = useState(false);
  async function salvar(e: FormEvent) {
    e.preventDefault();
    if (senha.length < 8) { setErro("A senha precisa de pelo menos 8 caracteres."); return; }
    setLoading(true);
    const { error } = await supabase.auth.updateUser({ password: senha });
    setLoading(false);
    if (error) { setErro(error.message.toLowerCase().includes("session") ? "O link expirou. Peça um novo em \"Esqueci a senha\"." : traduzErroAuth(error.message)); return; }
    nav({ to: "/new", replace: true });
  }
  return (
    <AuthLayout title="Criar nova senha">
      <form onSubmit={salvar} className="space-y-4" noValidate>
        <Field id="senha" label="Nova senha" error={erro} hint="Pelo menos 8 caracteres."><Input id="senha" type="password" autoComplete="new-password" aria-invalid={!!erro} value={senha} onChange={(e) => setSenha(e.target.value)} /></Field>
        {erro && !erro.includes("8") && <FormAlert kind="erro">{erro}</FormAlert>}
        <Button type="submit" className="w-full" loading={loading}>Salvar senha</Button>
      </form>
    </AuthLayout>
  );
}
