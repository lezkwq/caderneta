import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useState, type FormEvent } from "react";
import { Phone, Search, UserCheck } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { AuthLayout } from "@/components/app/AuthLayout";
import { Field, FormAlert } from "@/components/app/Field";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

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
    <div>
      <h1 className="max-w-[620px] text-[28px] leading-[1.15] tracking-tight lg:text-[48px]">Acha o telefone certo do dono de empresas locais.</h1>
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
    if (error) { setErro("E-mail ou senha incorretos. Confira os dados e tente novamente."); return; }
    nav({ to: "/new", replace: true });
  }

  return (
    <AuthLayout title="Entrar" intro={<Intro />}>
      <div className="space-y-4">
        <form onSubmit={entrar} className="space-y-4" noValidate>
          <Field id="email" label="E-mail"><Input id="email" type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} /></Field>
          <Field id="senha" label="Senha"><Input id="senha" type="password" autoComplete="current-password" value={senha} onChange={(e) => setSenha(e.target.value)} /></Field>
          {erro && <FormAlert kind="erro">{erro}</FormAlert>}
          <Button type="submit" className="min-h-11 w-full" loading={loading}>Entrar</Button>
        </form>
        <Link to="/esqueci-senha" className="inline-flex min-h-11 items-center text-sm text-link focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">Esqueci a senha</Link>
      </div>
    </AuthLayout>
  );
}
