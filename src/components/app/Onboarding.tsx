import { useState, type FormEvent } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Logo } from "@/components/app/AuthLayout";
import { Field, FormAlert } from "@/components/app/Field";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export function Onboarding({ userId }: { userId: string }) {
  const qc = useQueryClient();
  const [nome, setNome] = useState("");
  const [trabalho, setTrabalho] = useState("");
  const [erros, setErros] = useState<{ nome?: string; trabalho?: string; geral?: string }>({});
  const [loading, setLoading] = useState(false);
  async function salvar(e: FormEvent) {
    e.preventDefault();
    const er: typeof erros = {};
    if (!nome.trim()) er.nome = "Diga seu nome.";
    if (!trabalho.trim()) er.trabalho = "Conte com o que você trabalha.";
    setErros(er);
    if (Object.keys(er).length) return;
    setLoading(true);
    const { error } = await supabase.from("profiles").upsert({ id: userId, nome: nome.trim().slice(0, 120), trabalho: trabalho.trim().slice(0, 200), onboarding_ok: true });
    setLoading(false);
    if (error) { setErros({ geral: "Não foi possível salvar. Tente de novo." }); return; }
    await qc.invalidateQueries({ queryKey: ["perfil"] });
  }
  return (
    <main className="flex min-h-screen items-center px-4 py-8">
      <div className="mx-auto w-full max-w-[520px] space-y-6">
        <Logo />
        <section className="card-soft p-6 md:p-8">
          <h1 className="page-title">Boas-vindas! Antes de começar:</h1>
          <form onSubmit={salvar} className="mt-6 space-y-4" noValidate>
            <Field id="nome" label="Qual seu nome?" error={erros.nome}><Input id="nome" autoFocus aria-invalid={!!erros.nome} value={nome} onChange={(e) => setNome(e.target.value)} /></Field>
            <Field id="trabalho" label="Com o que você trabalha?" error={erros.trabalho} hint="Ex.: crio sites para pequenos negócios"><Input id="trabalho" aria-invalid={!!erros.trabalho} value={trabalho} onChange={(e) => setTrabalho(e.target.value)} /></Field>
            {erros.geral && <FormAlert kind="erro">{erros.geral}</FormAlert>}
            <Button type="submit" className="w-full md:w-auto" loading={loading}>Começar</Button>
          </form>
        </section>
      </div>
    </main>
  );
}
