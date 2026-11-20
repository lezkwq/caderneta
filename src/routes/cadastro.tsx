import { createFileRoute, Link } from "@tanstack/react-router";
import { useState, type FormEvent } from "react";
import { MailCheck } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { AuthLayout } from "@/components/app/AuthLayout";
import { Field, FormAlert } from "@/components/app/Field";
import { GoogleButton } from "@/components/app/GoogleButton";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { traduzErroAuth } from "@/lib/auth-errors";

export const Route = createFileRoute("/cadastro")({
  head: () => ({
    meta: [
      { title: "Criar conta — Caderneta" },
      { name: "description", content: "Crie sua conta na Caderneta." },
      { property: "og:title", content: "Criar conta — Caderneta" },
      { property: "og:description", content: "Crie sua conta e ache o contato do dono de empresas locais." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: Cadastro,
});

function Cadastro() {
  const [email, setEmail] = useState("");
  const [senha, setSenha] = useState("");
  const [erros, setErros] = useState<{ email?: string; senha?: string; geral?: string }>({});
  const [enviado, setEnviado] = useState(false);
  const [loading, setLoading] = useState(false);

  async function criar(e: FormEvent) {
    e.preventDefault();
    const er: typeof erros = {};
    if (!/^\S+@\S+\.\S+$/.test(email.trim())) er.email = "Digite um e-mail válido.";
    if (senha.length < 8) er.senha = "A senha precisa de pelo menos 8 caracteres.";
    setErros(er);
    if (Object.keys(er).length) return;
    setLoading(true);
    const { error } = await supabase.auth.signUp({ email: email.trim(), password: senha, options: { emailRedirectTo: window.location.origin } });
    setLoading(false);
    if (error) { setErros({ geral: traduzErroAuth(error.message) }); return; }
    setEnviado(true);
  }

  if (enviado) {
    return (
      <AuthLayout title="Confirme seu e-mail">
        <div className="space-y-4">
          <MailCheck className="size-8 text-success" aria-hidden />
          <p>Enviamos um link para <strong className="text-heading">{email}</strong>. Sua conta só fica ativa depois que você clicar nele.</p>
          <p className="text-sm text-muted-foreground">Não chegou? Veja a pasta de spam.</p>
          <Link to="/login" className="text-link text-sm">Voltar para entrar</Link>
        </div>
      </AuthLayout>
    );
  }

  return (
    <AuthLayout title="Criar conta">
      <div className="space-y-4">
        <GoogleButton onError={(m) => setErros({ geral: m })} />
        <div className="flex items-center gap-3 text-sm text-muted-foreground"><span className="h-px flex-1 bg-border" />ou com e-mail<span className="h-px flex-1 bg-border" /></div>
        <form onSubmit={criar} className="space-y-4" noValidate>
          <Field id="email" label="E-mail" error={erros.email}><Input id="email" type="email" autoComplete="email" aria-invalid={!!erros.email} value={email} onChange={(e) => setEmail(e.target.value)} /></Field>
          <Field id="senha" label="Senha" error={erros.senha} hint="Pelo menos 8 caracteres."><Input id="senha" type="password" autoComplete="new-password" aria-invalid={!!erros.senha} value={senha} onChange={(e) => setSenha(e.target.value)} /></Field>
          {erros.geral && <FormAlert kind="erro">{erros.geral}</FormAlert>}
          <Button type="submit" className="w-full" loading={loading}>Criar conta</Button>
        </form>
        <p className="text-sm">Já tem conta? <Link to="/login" className="text-link">Entrar</Link></p>
      </div>
    </AuthLayout>
  );
}
