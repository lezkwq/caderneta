import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState, type FormEvent } from "react";
import { Clock, Search } from "lucide-react";
import { PageHeader } from "@/components/app/AppShell";
import { Field, FormAlert } from "@/components/app/Field";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { iniciarBusca, infoSistema } from "@/lib/caderneta.functions";

export const Route = createFileRoute("/_authenticated/new")({
  head: () => ({
    meta: [
      { title: "Nova busca — Caderneta" },
      { name: "description", content: "Busque empresas locais por cidade e nicho." },
      { property: "og:title", content: "Nova busca — Caderneta" },
      { property: "og:description", content: "Busque empresas locais por cidade e nicho." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: NovaBusca,
});

export function formatarDuracao(seg: number) {
  const min = Math.ceil(seg / 60);
  if (min < 60) return `cerca de ${min} min`;
  const h = Math.floor(min / 60);
  return `cerca de ${h} h ${min % 60} min`;
}

function NovaBusca() {
  const nav = useNavigate();
  const qc = useQueryClient();
  const info = useServerFn(infoSistema);
  const iniciar = useServerFn(iniciarBusca);
  const { data: sis } = useQuery({ queryKey: ["sistema"], queryFn: () => info() });
  const [f, setF] = useState({ cidade: "", estado: "SC", pais: "Brasil", nicho: "", quantidade: "20" });
  const [erros, setErros] = useState<Record<string, string>>({});
  const [geral, setGeral] = useState("");
  const [loading, setLoading] = useState(false);

  const qtd = Math.min(100, Math.max(1, Number(f.quantidade) || 0));
  const intervalo = sis?.fila.intervaloSeg ?? 21;
  const estimativa = 90 + qtd * 3 + (qtd * 0.7 + (sis?.fila.cnpjNaFila ?? 0)) * intervalo;

  async function enviar(e: FormEvent) {
    e.preventDefault();
    const er: Record<string, string> = {};
    if (!f.cidade.trim()) er["cidade"] = "Informe a cidade.";
    if (!f.estado.trim()) er["estado"] = "Informe o estado.";
    if (!f.pais.trim()) er["pais"] = "Informe o país.";
    if (!f.nicho.trim()) er["nicho"] = "Informe o nicho (ex.: padaria).";
    const n = Number(f.quantidade);
    if (!Number.isInteger(n) || n < 1 || n > 100) er["quantidade"] = "Use um número de 1 a 100.";
    setErros(er); setGeral("");
    if (Object.keys(er).length) return;
    setLoading(true);
    try {
      const r = await iniciar({ data: { cidade: f.cidade.trim(), estado: f.estado.trim(), pais: f.pais.trim(), nicho: f.nicho.trim(), quantidade: n } });
      if (r.erro || !r.id) { setGeral(r.erro ?? "Não foi possível iniciar."); return; }
      await qc.invalidateQueries({ queryKey: ["buscas"] });
      nav({ to: "/busca/$id", params: { id: r.id } });
    } catch { setGeral("Não foi possível iniciar. Confira os campos e tente de novo."); }
    finally { setLoading(false); }
  }

  const campo = (k: keyof typeof f, label: string, props: React.ComponentProps<typeof Input> = {}, hint?: string) => (
    <Field id={k} label={label} error={erros[k]} {...(hint ? { hint } : {})}>
      <Input id={k} aria-invalid={!!erros[k]} value={f[k]} onChange={(e) => setF({ ...f, [k]: e.target.value })} {...props} />
    </Field>
  );

  return (
    <>
      <PageHeader title="Nova busca" desc="Procure empresas no Google Maps e descubra o contato do dono." />
      <form onSubmit={enviar} className="card-soft p-5 md:p-6" noValidate>
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-6">
          <div className="xl:col-span-2">{campo("nicho", "Nicho", { placeholder: "Ex.: padaria, pet shop" })}</div>
          <div className="xl:col-span-2">{campo("cidade", "Cidade", { placeholder: "Ex.: Joinville" })}</div>
          <div className="xl:col-span-2">{campo("quantidade", "Quantidade de empresas", { type: "number", min: 1, max: 100, inputMode: "numeric" }, "Máximo 100.")}</div>
          <div className="xl:col-span-3">{campo("estado", "Estado")}</div>
          <div className="xl:col-span-3">{campo("pais", "País")}</div>
        </div>
        <div className="mt-6 flex flex-col gap-4 border-t border-border pt-5 md:flex-row md:items-center md:justify-between">
          <p className="flex items-start gap-2 text-sm"><Clock className="mt-0.5 size-4 shrink-0" aria-hidden />
            <span>Tempo estimado: <strong className="text-heading">{formatarDuracao(estimativa)}</strong>. A consulta de CNPJ é limitada a cerca de 3 por minuto{sis?.fila.cnpjNaFila ? `, e já há ${sis.fila.cnpjNaFila} na fila` : ""}. Você pode sair da página; a busca continua.</span>
          </p>
          <Button type="submit" loading={loading} className="w-full md:w-auto"><Search aria-hidden />Iniciar busca</Button>
        </div>
        {sis && <p className="mt-3 text-sm text-muted-foreground">Buscas hoje: {sis.buscasHoje} de {sis.fila.buscasPorDia}.</p>}
        {geral && <div className="mt-4"><FormAlert kind="erro">{geral}</FormAlert></div>}
      </form>
    </>
  );
}
