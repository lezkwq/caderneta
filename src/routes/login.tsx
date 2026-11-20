import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useState, type FormEvent } from "react";
import { Phone, Search, UserCheck } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { AuthLayout } from "@/components/app/AuthLayout";
import { Field, FormAlert } from "@/components/app/Field";
import { GoogleButton } from "@/components/app/GoogleButton";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { traduzErroAuth } from "@/lib/auth-errors";

export const Route = createFileRoute("/login")({
  head: () => ({
    meta: [
      { title: "Entrar — Caderneta" },
      { name: "description", content: "A Caderneta acha o telefone certo do dono de empresas locais." },
      { property: "og:title", content: "Caderneta — o telefone certo do dono" },
      { property: "og:description", content: "Acha o telefone certo do dono de empresas locais." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: LoginPage,
});

function Intro() {
  const itens = [
    { icon: Search, t: "Busca empresas por cidade e nicho" },
    { icon: UserCheck, t: "Descobre quem é o dono pelo CNPJ" },
    { icon: Phone, t: "Mostra o telefone mais confiável" },
  ];
  return (
    <div className="mb-8">
      <h1 className="text-[32px] leading-tight md:text-[48px]">Acha o telefone certo do dono de empresas locais.</h1>
      <ul className="mt-5 space-y-2">
        {itens.map(({ icon: I, t }) => (
          <li key={t} className="flex items-center gap-2 text-sm"><I className="size-4 text-heading" aria-hidden />{t}</li>
        ))}
      </ul>
    </div>
  );
}

function LoginPage() {
  const nav = useNavigate();
  const [email, setEmail] = useState("");
  const [senha, setSenha] = useState("");
  const [erro, setErro] = useState("");
  const [loading, setLoading] = useState(false);

  async function entrar(e: FormEvent) {
    e.preventDefault();
    setErro("");
    if (!email.includes("@") || senha.length < 1) { setErro("Preencha e-mail e senha."); return; }
    setLoading(true);
    const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password: senha });
    setLoading(false);
    if (error) { setErro(traduzErroAuth(error.message)); return; }
    nav({ to: "/new", replace: true });
  }

  return (
    <AuthLayout title="Entrar" intro={<Intro />}>
      <div className="space-y-4">
        <GoogleButton onError={setErro} />
        <div className="flex items-center gap-3 text-sm text-muted-foreground"><span className="h-px flex-1 bg-border" />ou com e-mail<span className="h-px flex-1 bg-border" /></div>
        <form onSubmit={entrar} className="space-y-4" noValidate>
          <Field id="email" label="E-mail"><Input id="email" type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} /></Field>
          <Field id="senha" label="Senha"><Input id="senha" type="password" autoComplete="current-password" value={senha} onChange={(e) => setSenha(e.target.value)} /></Field>
          {erro && <FormAlert kind="erro">{erro}</FormAlert>}
          <Button type="submit" className="w-full" loading={loading}>Entrar</Button>
        </form>
        <div className="flex flex-wrap justify-between gap-2 text-sm">
          <Link to="/esqueci-senha" className="text-link">Esqueci a senha</Link>
          <Link to="/cadastro" className="text-link">Criar conta</Link>
        </div>
      </div>
    </AuthLayout>
  );
}
