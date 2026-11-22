import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState, type FormEvent } from "react";
import { Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { PageHeader } from "@/components/app/AppShell";
import { Field, FormAlert } from "@/components/app/Field";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { iniciarManual } from "@/lib/caderneta.functions";

export const Route = createFileRoute("/_authenticated/manual")({
  head: () => ({
    meta: [
      { title: "Empresas que conheço — Caderneta" },
      { name: "description", content: "Empresas que conheço na Caderneta." },
      { property: "og:title", content: "Empresas que conheço — Caderneta" },
      { property: "og:description", content: "Empresas que conheço na Caderneta." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: Pagina,
});

type EmpresaForm = { nome: string; cidade: string; cnpj: string; maps: string; site: string; instagram: string; facebook: string; pessoa: string };
const empresaVazia = (): EmpresaForm => ({ nome: "", cidade: "", cnpj: "", maps: "", site: "", instagram: "", facebook: "", pessoa: "" });

function Pagina() {
  const enviar = useServerFn(iniciarManual);
  const nav = useNavigate();
  const qc = useQueryClient();
  const [empresas, setEmpresas] = useState<EmpresaForm[]>([empresaVazia()]);
  const [erro, setErro] = useState("");
  const [loading, setLoading] = useState(false);

  function alterar(index: number, campo: keyof EmpresaForm, valor: string) {
    setEmpresas((atual) => atual.map((empresa, i) => i === index ? { ...empresa, [campo]: valor } : empresa));
  }

  async function salvar(e: FormEvent) {
    e.preventDefault();
    const incompleta = empresas.findIndex((empresa) => !empresa.nome.trim());
    if (incompleta >= 0) { setErro(`Informe o nome da empresa ${incompleta + 1}.`); return; }
    setErro(""); setLoading(true);
    try {
      const r = await enviar({ data: { empresas: empresas.map((empresa) => ({
        nome: empresa.nome.trim(), cidade: empresa.cidade.trim() || undefined,
        cnpj: empresa.cnpj.trim() || undefined,
        links: [empresa.maps, empresa.site, empresa.instagram, empresa.facebook].map((link) => link.trim()).filter(Boolean),
        pessoa: empresa.pessoa.trim() || undefined,
      })) } });
      if (r.erro || !r.id) { setErro(r.erro ?? "Não foi possível iniciar o processamento."); return; }
      await qc.invalidateQueries({ queryKey: ["buscas"] });
      toast.success("Empresas adicionadas à Caderneta.");
      await nav({ to: "/busca/$id", params: { id: r.id } });
    } catch { setErro("Não foi possível salvar a lista. Confira os links e tente novamente."); }
    finally { setLoading(false); }
  }

  return (
    <div className="space-y-5">
      <PageHeader title="Empresas que eu conheço" desc="Adicione empresas sem buscar no Google Maps. O CNPJ informado segue direto para validação cadastral." />
      <form onSubmit={salvar} className="space-y-4" noValidate>
        {empresas.map((empresa, index) => {
          const id = `empresa-${index}`;
          return (
            <section key={index} className="card-soft space-y-4 p-4 sm:p-5">
              <div className="flex items-center justify-between gap-3">
                <h2 className="font-semibold text-heading">Empresa {index + 1}</h2>
                {empresas.length > 1 && <Button type="button" variant="ghost" className="min-h-11 text-danger-text" aria-label={`Remover empresa ${index + 1}`} onClick={() => setEmpresas((atual) => atual.filter((_, i) => i !== index))}><Trash2 aria-hidden />Remover</Button>}
              </div>
              <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
                <Field id={`${id}-nome`} label="Nome da empresa"><Input id={`${id}-nome`} required value={empresa.nome} onChange={(e) => alterar(index, "nome", e.target.value)} placeholder="Ex.: Padaria Central" /></Field>
                <Field id={`${id}-cidade`} label="Cidade"><Input id={`${id}-cidade`} value={empresa.cidade} onChange={(e) => alterar(index, "cidade", e.target.value)} placeholder="Cidade" /></Field>
                <Field id={`${id}-cnpj`} label="CNPJ (opcional)" hint="Se informado, a busca paga pelo nome no CNPJá será pulada."><Input id={`${id}-cnpj`} inputMode="numeric" value={empresa.cnpj} onChange={(e) => alterar(index, "cnpj", e.target.value)} placeholder="00.000.000/0000-00" /></Field>
                <Field id={`${id}-maps`} label="Link do Maps"><Input id={`${id}-maps`} type="url" value={empresa.maps} onChange={(e) => alterar(index, "maps", e.target.value)} placeholder="https://maps.google.com/..." /></Field>
                <Field id={`${id}-site`} label="Site"><Input id={`${id}-site`} type="url" value={empresa.site} onChange={(e) => alterar(index, "site", e.target.value)} placeholder="https://empresa.com.br" /></Field>
                <Field id={`${id}-instagram`} label="Instagram"><Input id={`${id}-instagram`} type="url" value={empresa.instagram} onChange={(e) => alterar(index, "instagram", e.target.value)} placeholder="https://instagram.com/empresa" /></Field>
                <Field id={`${id}-facebook`} label="Facebook (opcional)"><Input id={`${id}-facebook`} type="url" value={empresa.facebook} onChange={(e) => alterar(index, "facebook", e.target.value)} placeholder="https://facebook.com/empresa" /></Field>
                <Field id={`${id}-pessoa`} label="Pessoa (opcional)" hint="Use o mesmo nome para agrupar empresas do mesmo dono."><Input id={`${id}-pessoa`} value={empresa.pessoa} onChange={(e) => alterar(index, "pessoa", e.target.value)} placeholder="Ex.: Ana Silva" /></Field>
              </div>
            </section>
          );
        })}
        {erro && <FormAlert kind="erro">{erro}</FormAlert>}
        <div className="flex flex-col gap-3 sm:flex-row sm:justify-between">
          <Button type="button" variant="outline" className="min-h-11" disabled={empresas.length >= 100 || loading} onClick={() => setEmpresas((atual) => [...atual, empresaVazia()])}><Plus aria-hidden />Adicionar empresa</Button>
          <Button type="submit" className="min-h-11 w-full sm:w-auto" loading={loading}>Processar {empresas.length === 1 ? "empresa" : `${empresas.length} empresas`}</Button>
        </div>
        <p className="text-sm text-muted-foreground">Links de Instagram e Facebook ficam guardados como fontes; eles nunca são raspados. Links do Maps são processados pelo mesmo fluxo quando disponíveis.</p>
      </form>
    </div>
  );
}
