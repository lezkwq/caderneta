import { Fragment, useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Building2, ChevronDown, Download, ExternalLink, MessageCircle, Phone, Smartphone, Trash2, UserRound, Users, CheckCheck } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import type { Database } from "@/integrations/supabase/types";
import { buscaQuery, perfilQuery } from "@/lib/queries";
import { informarCnpj, processarAgora } from "@/lib/caderneta.functions";
import { aplicarModelo, cnpjValido, formatarCnpj, formatarTelefone, linkWhatsApp } from "@/lib/br";
import type { Fonte, Motivo } from "@/lib/score";
import { BadgeConfianca, Metric, Pill, SkeletonLinhas, StatusBusca, StatusCnpj } from "@/components/app/ui-bits";
import { Field } from "@/components/app/Field";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";

type Lead = Database["public"]["Tables"]["leads"]["Row"];
type Tel = Database["public"]["Tables"]["telefones"]["Row"];

const NOME_FONTE: Record<string, string> = { maps: "Google Maps", site: "Site", whatsapp_site: "WhatsApp no site", receita: "Receita (CNPJ)", manual: "Informado" };

export function Resultados({ buscaId }: { buscaId: string }) {
  const qc = useQueryClient();
  const processar = useServerFn(processarAgora);
  const { data: perfil } = useQuery(perfilQuery);
  const { data, isPending, isError, refetch } = useQuery({
    ...buscaQuery(buscaId),
    refetchInterval: (q) => (q.state.data?.busca && q.state.data.busca.status !== "concluida" && q.state.data.busca.status !== "erro" ? 5000 : false),
  });
  const ativo = !!data?.busca && data.busca.status !== "concluida" && data.busca.status !== "erro";
  const [fila, setFila] = useState<{ cnpjNaFila: number; bloqueadoAte: string | null } | null>(null);

  useEffect(() => {
    if (!ativo) return;
    let vivo = true;
    const rodar = () => processar().then((r) => { if (vivo) { setFila(r); void qc.invalidateQueries({ queryKey: ["busca", buscaId] }); } }).catch(() => {});
    rodar();
    const t = setInterval(rodar, 20000);
    return () => { vivo = false; clearInterval(t); };
  }, [ativo, buscaId, processar, qc]);

  const [filtros, setFiltros] = useState({ dono: false, celular: false, contatados: false });
  const [aberto, setAberto] = useState<string | null>(null);
  const [wa, setWa] = useState<{ lead: Lead; tel: Tel } | null>(null);

  const telsPorLead = useMemo(() => {
    const m = new Map<string, Tel[]>();
    for (const t of (data?.telefones ?? []) as Tel[]) m.set(t.lead_id, [...(m.get(t.lead_id) ?? []), t]);
    for (const v of m.values()) v.sort((a, b) => Number(b.principal) - Number(a.principal) || b.score - a.score);
    return m;
  }, [data?.telefones]);

  const leads = useMemo(() => (data?.leads ?? []).filter((l) => {
    const tels = telsPorLead.get(l.id) ?? [];
    if (filtros.dono && !l.dono) return false;
    if (filtros.celular && !tels.some((t) => t.tipo === "celular")) return false;
    if (filtros.contatados && !l.contatado) return false;
    return true;
  }), [data?.leads, filtros, telsPorLead]);

  if (isPending) return <SkeletonLinhas n={6} />;
  if (isError || !data?.busca) return <div className="card-soft p-6"><p className="text-danger-text">Não foi possível carregar esta busca.</p><Button variant="outline" className="mt-3" onClick={() => refetch()}>Tentar de novo</Button></div>;

  const b = data.busca;
  const todos = data.leads;
  const concluidos = todos.filter((l) => l.status === "concluido").length;
  const pct = todos.length ? Math.round((concluidos / todos.length) * 100) : 0;
  const agrupar = b.tipo === "manual";

  async function marcar(l: Lead, v: boolean) {
    const { error } = await supabase.from("leads").update({ contatado: v }).eq("id", l.id);
    if (error) toast.error("Não foi possível salvar."); else void qc.invalidateQueries({ queryKey: ["busca", buscaId] });
  }
  async function excluir(l: Lead) {
    if (!confirm(`Excluir "${l.nome}"?`)) return;
    const { error } = await supabase.from("leads").delete().eq("id", l.id);
    if (error) toast.error("Não foi possível excluir."); else { toast.success("Lead excluído."); void qc.invalidateQueries({ queryKey: ["busca", buscaId] }); }
  }
  function exportar() {
    const esc = (v: unknown) => `"${String(v ?? "").replace(/"/g, '""')}"`;
    const linhas = [["Empresa", "Pessoa", "Dono", "Telefone principal", "Tipo", "Score", "Outros telefones", "CNPJ", "Status CNPJ", "Cidade", "Site", "Maps", "Já contatei"].map(esc).join(";")];
    for (const l of leads) {
      const ts = telsPorLead.get(l.id) ?? [];
      const p = ts[0];
      linhas.push([l.nome, l.pessoa, l.dono, p ? formatarTelefone(p.numero) : "", p?.tipo, p?.score, ts.slice(1).map((t) => formatarTelefone(t.numero)).join(" | "), l.cnpj ? formatarCnpj(l.cnpj) : "", l.cnpj_status, l.cidade, l.site, l.maps_url, l.contatado ? "sim" : "não"].map(esc).join(";"));
    }
    const blob = new Blob(["\ufeff" + linhas.join("\n")], { type: "text/csv;charset=utf-8" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `caderneta-${b.titulo.replace(/[^\w-]+/g, "-").toLowerCase()}.csv`;
    a.click();
    URL.revokeObjectURL(a.href);
  }

  const grupos: [string, Lead[]][] = agrupar
    ? [...leads.reduce((m, l) => m.set(l.pessoa || "Sem pessoa", [...(m.get(l.pessoa || "Sem pessoa") ?? []), l]), new Map<string, Lead[]>())]
    : [["", leads]];

  const props = { telsPorLead, aberto, setAberto, marcar, excluir, abrirWa: (lead: Lead, tel: Tel) => setWa({ lead, tel }), buscaId };

  return (
    <div className="space-y-6">
      <div className="card-soft p-5">
        <div className="flex flex-wrap items-center gap-3">
          <StatusBusca status={b.status} />
          <span className="text-sm">{concluidos} de {todos.length} empresas processadas</span>
          {fila && fila.cnpjNaFila > 0 && <span className="text-sm text-muted-foreground">· {fila.cnpjNaFila} CNPJ na fila (≈3 por minuto)</span>}
          {fila?.bloqueadoAte && <Pill tone="atencao">Consulta de CNPJ em pausa até {new Date(fila.bloqueadoAte).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}</Pill>}
        </div>
        <div className="mt-3 h-2 overflow-hidden rounded-full bg-secondary" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100} aria-label="Progresso">
          <div className="h-full rounded-full bg-primary transition-all" style={{ width: `${b.status === "concluida" ? 100 : pct}%` }} />
        </div>
        {b.status === "buscando" && <p className="mt-2 text-sm text-muted-foreground">Buscando empresas no Google Maps. Isso leva de 1 a 3 minutos.</p>}
        {b.erro && <p className="mt-2 text-sm text-danger-text" role="alert">{b.erro}</p>}
      </div>

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <Metric label="Empresas" value={todos.length} icon={<Building2 className="size-4" aria-hidden />} />
        <Metric label="Com dono" value={todos.filter((l) => l.dono).length} icon={<UserRound className="size-4" aria-hidden />} />
        <Metric label="Com celular" value={todos.filter((l) => (telsPorLead.get(l.id) ?? []).some((t) => t.tipo === "celular")).length} icon={<Smartphone className="size-4" aria-hidden />} />
        <Metric label="Contatados" value={todos.filter((l) => l.contatado).length} icon={<CheckCheck className="size-4" aria-hidden />} />
      </div>

      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div className="flex flex-wrap gap-2" role="group" aria-label="Filtros">
          {([["dono", "Com dono"], ["celular", "Com celular"], ["contatados", "Contatados"]] as const).map(([k, t]) => (
            <button key={k} aria-pressed={filtros[k]} onClick={() => setFiltros({ ...filtros, [k]: !filtros[k] })}
              className={`h-11 rounded-full border px-4 text-sm font-medium transition-colors ${filtros[k] ? "border-primary bg-primary text-primary-foreground" : "border-border bg-card hover:bg-secondary"}`}>
              {filtros[k] ? "✓ " : ""}{t}
            </button>
          ))}
        </div>
        <Button variant="outline" onClick={exportar} disabled={!leads.length} className="w-full md:w-auto"><Download aria-hidden />Exportar CSV</Button>
      </div>

      {todos.length === 0 && b.status !== "buscando" && b.status !== "iniciando" && <div className="card-soft p-6 text-center">Nenhuma empresa encontrada.</div>}
      {todos.length > 0 && leads.length === 0 && <div className="card-soft p-6 text-center">Nenhum lead com esses filtros.</div>}

      {grupos.map(([pessoa, ls]) => ls.length > 0 && (
        <section key={pessoa || "todos"} className="space-y-3">
          {agrupar && <h2 className="flex items-center gap-2 text-lg"><Users className="size-5" aria-hidden />{pessoa} <span className="text-sm font-normal text-muted-foreground">({ls.length})</span></h2>}
          <TabelaLeads leads={ls} {...props} />
          <CardsLeads leads={ls} {...props} />
        </section>
      ))}

      <DialogWhatsApp alvo={wa} modelo={perfil?.perfil?.mensagem_whatsapp ?? ""} onClose={() => setWa(null)} />
    </div>
  );
}

interface ListaProps {
  leads: Lead[]; telsPorLead: Map<string, Tel[]>; aberto: string | null; setAberto: (id: string | null) => void;
  marcar: (l: Lead, v: boolean) => void; excluir: (l: Lead) => void; abrirWa: (l: Lead, t: Tel) => void; buscaId: string;
}

function Acoes({ lead, tel, abrirWa }: { lead: Lead; tel: Tel | undefined; abrirWa: (l: Lead, t: Tel) => void }) {
  if (!tel) return <span className="text-sm text-muted-foreground">Sem telefone</span>;
  return (
    <div className="flex flex-wrap gap-2">
      {tel.tipo === "celular" && <Button size="sm" onClick={() => abrirWa(lead, tel)}><MessageCircle aria-hidden />WhatsApp provável</Button>}
      <Button size="sm" variant="outline" asChild><a href={`tel:${tel.numero}`}><Phone aria-hidden />Ligar</a></Button>
    </div>
  );
}

function Dono({ l }: { l: Lead }) {
  if (l.dono) return <span className="font-medium text-heading">{l.dono}</span>;
  return <span className="text-sm text-muted-foreground">Dono: não disponível</span>;
}

function TabelaLeads(p: ListaProps) {
  return (
    <div className="card-soft hidden overflow-hidden md:block">
      <table className="w-full text-left text-[15px]">
        <thead className="bg-secondary text-sm text-heading">
          <tr><th className="px-4 py-3 font-medium">Empresa</th><th className="px-4 py-3 font-medium">Dono</th><th className="px-4 py-3 font-medium">Telefone principal</th><th className="px-4 py-3 font-medium">Status</th><th className="px-4 py-3 font-medium">Ações</th><th className="w-24 px-2 py-3"><span className="sr-only">Mais</span></th></tr>
        </thead>
        <tbody>
          {p.leads.map((l) => {
            const ts = p.telsPorLead.get(l.id) ?? [];
            const tel = ts[0];
            const open = p.aberto === l.id;
            return (
              <Fragment key={l.id}>
                <tr className={`border-t border-border align-top ${l.contatado ? "bg-success-soft/40" : ""}`}>
                  <td className="px-4 py-3"><div className="font-medium text-heading">{l.nome}</div><div className="text-sm text-muted-foreground">{[l.categoria, l.cidade].filter(Boolean).join(" · ")}</div></td>
                  <td className="px-4 py-3"><Dono l={l} /></td>
                  <td className="px-4 py-3">{tel ? <div className="space-y-1"><div className="font-medium text-heading">{formatarTelefone(tel.numero)} <span className="text-sm font-normal text-muted-foreground">{tel.tipo}</span></div><BadgeConfianca score={tel.score} /></div> : <span className="text-sm text-muted-foreground">—</span>}</td>
                  <td className="px-4 py-3"><StatusCnpj status={l.cnpj_status} /></td>
                  <td className="px-4 py-3"><Acoes lead={l} tel={tel} abrirWa={p.abrirWa} /></td>
                  <td className="px-2 py-3 text-right">
                    <button aria-expanded={open} aria-label={open ? "Recolher detalhes" : "Ver detalhes"} onClick={() => p.setAberto(open ? null : l.id)} className="grid size-11 place-items-center rounded-full hover:bg-secondary"><ChevronDown className={`size-5 transition-transform ${open ? "rotate-180" : ""}`} aria-hidden /></button>
                  </td>
                </tr>
                {open && <tr className="border-t border-border bg-background/60"><td colSpan={6} className="px-4 py-4"><Detalhes lead={l} tels={ts} {...p} /></td></tr>}
              </Fragment>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function CardsLeads(p: ListaProps) {
  return (
    <ul className="space-y-3 md:hidden">
      {p.leads.map((l) => {
        const ts = p.telsPorLead.get(l.id) ?? [];
        const tel = ts[0];
        const open = p.aberto === l.id;
        return (
          <li key={l.id} className="card-soft p-4">
            <div className="grid grid-cols-[minmax(0,1fr)_auto] gap-2">
              <div className="min-w-0"><h3 className="truncate text-base">{l.nome}</h3><Dono l={l} /></div>
              <button aria-expanded={open} aria-label={open ? "Recolher detalhes" : "Ver detalhes"} onClick={() => p.setAberto(open ? null : l.id)} className="grid size-11 shrink-0 place-items-center rounded-full hover:bg-secondary"><ChevronDown className={`size-5 transition-transform ${open ? "rotate-180" : ""}`} aria-hidden /></button>
            </div>
            <div className="mt-3 flex flex-wrap items-center gap-2">
              {tel && <span className="font-medium text-heading">{formatarTelefone(tel.numero)}</span>}
              {tel && <BadgeConfianca score={tel.score} />}
              <StatusCnpj status={l.cnpj_status} />
              {l.contatado && <Pill tone="ok" icon={<CheckCheck className="size-4 text-success" aria-hidden />}>Contatado</Pill>}
            </div>
            <div className="mt-3 [&_a]:flex-1 [&_button]:flex-1"><Acoes lead={l} tel={tel} abrirWa={p.abrirWa} /></div>
            {open && <div className="mt-4 border-t border-border pt-4"><Detalhes lead={l} tels={ts} {...p} /></div>}
          </li>
        );
      })}
    </ul>
  );
}

function Detalhes({ lead: l, tels, marcar, excluir, abrirWa, buscaId }: ListaProps & { lead: Lead; tels: Tel[] }) {
  const links = (l.links as { tipo: string; url: string }[]) ?? [];
  const socios = (l.socios as { nome: string; qualificacao: string }[]) ?? [];
  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <div className="space-y-3">
        <h4 className="text-sm font-semibold text-heading">Telefones</h4>
        {tels.length === 0 && <p className="text-sm text-muted-foreground">Nenhum telefone encontrado.</p>}
        {tels.map((t, i) => (
          <div key={t.id} className="rounded-[12px] bg-field p-3">
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-medium text-heading">{formatarTelefone(t.numero)}</span>
              <span className="text-sm">{t.tipo}{i === 0 ? " · principal" : ""}</span>
              <BadgeConfianca score={t.score} />
            </div>
            <ul className="mt-2 space-y-0.5 text-sm">
              {((t.motivos as unknown as Motivo[]) ?? []).map((m, j) => <li key={j}><span className={m.pontos >= 0 ? "text-success-text" : "text-danger-text"}>{m.pontos >= 0 ? "+" : "−"}{Math.abs(m.pontos)}</span> {m.texto}</li>)}
            </ul>
            <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-sm">
              {((t.fontes as unknown as Fonte[]) ?? []).map((f, j) => f.url ? <a key={j} href={f.url} target="_blank" rel="noopener noreferrer" className="text-link inline-flex items-center gap-1">{NOME_FONTE[f.tipo] ?? f.tipo}<ExternalLink className="size-3.5" aria-hidden /></a> : <span key={j}>{NOME_FONTE[f.tipo] ?? f.tipo}</span>)}
            </div>
            {i > 0 && <div className="mt-2"><Acoes lead={l} tel={t} abrirWa={abrirWa} /></div>}
          </div>
        ))}
      </div>
      <div className="space-y-4">
        <div>
          <h4 className="text-sm font-semibold text-heading">CNPJ</h4>
          {l.cnpj && <p className="mt-1">{formatarCnpj(l.cnpj)} {l.cnpj_fonte_url && <a href={l.cnpj_fonte_url} target="_blank" rel="noopener noreferrer" className="text-link text-sm">(fonte)</a>}</p>}
          {l.cnpj_motivo && <p className="mt-1 text-sm text-warning-text">{l.cnpj_motivo}</p>}
          {l.cnpj_status === "validado" && (
            <dl className="mt-2 grid grid-cols-[auto_minmax(0,1fr)] gap-x-3 gap-y-1 text-sm">
              <dt className="text-muted-foreground">Razão social</dt><dd>{l.razao_social}</dd>
              {l.nome_fantasia && <><dt className="text-muted-foreground">Fantasia</dt><dd>{l.nome_fantasia}</dd></>}
              <dt className="text-muted-foreground">Situação</dt><dd>{l.situacao}</dd>
              <dt className="text-muted-foreground">Natureza</dt><dd>{l.natureza}</dd>
              <dt className="text-muted-foreground">Local</dt><dd>{l.municipio_receita}/{l.uf_receita}</dd>
              {l.dono_fonte && <><dt className="text-muted-foreground">Dono</dt><dd>{l.dono ?? "não disponível"} — {l.dono_fonte}</dd></>}
              {socios.length > 0 && <><dt className="text-muted-foreground">Outros sócios</dt><dd>{socios.map((s) => `${s.nome} (${s.qualificacao})`).join("; ")}</dd></>}
            </dl>
          )}
          {l.cnpj_status !== "validado" && !["na_fila", "consultando"].includes(l.cnpj_status) && <CnpjManual leadId={l.id} buscaId={buscaId} />}
        </div>
        {links.length > 0 && (
          <div><h4 className="text-sm font-semibold text-heading">Fontes</h4>
            <ul className="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-sm">{links.map((k, i) => <li key={i}><a href={k.url} target="_blank" rel="noopener noreferrer" className="text-link inline-flex items-center gap-1">{k.tipo === "maps" ? "Google Maps" : k.tipo === "site" ? "Site" : k.tipo === "instagram" ? "Instagram" : k.tipo === "facebook" ? "Facebook" : "Link"}<ExternalLink className="size-3.5" aria-hidden /></a></li>)}</ul>
          </div>
        )}
        <div className="flex flex-wrap items-center gap-3 border-t border-border pt-4">
          <label className="flex min-h-11 cursor-pointer items-center gap-2"><input type="checkbox" className="size-5 accent-[var(--color-primary)]" checked={l.contatado} onChange={(e) => marcar(l, e.target.checked)} />Já contatei</label>
          <Button variant="ghost" size="sm" onClick={() => excluir(l)} className="text-danger-text"><Trash2 aria-hidden />Excluir lead</Button>
        </div>
      </div>
    </div>
  );
}

function CnpjManual({ leadId, buscaId }: { leadId: string; buscaId: string }) {
  const qc = useQueryClient();
  const enviar = useServerFn(informarCnpj);
  const [v, setV] = useState("");
  const [erro, setErro] = useState("");
  const [loading, setLoading] = useState(false);
  async function salvar() {
    if (!cnpjValido(v)) { setErro("CNPJ inválido. Confira os 14 dígitos."); return; }
    setErro(""); setLoading(true);
    try { await enviar({ data: { leadId, cnpj: v } }); toast.success("CNPJ enviado para a fila."); void qc.invalidateQueries({ queryKey: ["busca", buscaId] }); setV(""); }
    catch { setErro("Não foi possível salvar."); }
    finally { setLoading(false); }
  }
  return (
    <div className="mt-3 flex flex-col gap-2 sm:flex-row sm:items-end">
      <div className="flex-1"><Field id={`cnpj-${leadId}`} label="Digitar CNPJ" error={erro}><Input id={`cnpj-${leadId}`} inputMode="numeric" placeholder="00.000.000/0000-00" aria-invalid={!!erro} value={v} onChange={(e) => setV(e.target.value)} /></Field></div>
      <Button variant="secondary" onClick={salvar} loading={loading} className={erro ? "sm:mb-7" : ""}>Consultar</Button>
    </div>
  );
}

function DialogWhatsApp({ alvo, modelo, onClose }: { alvo: { lead: Lead; tel: Tel } | null; modelo: string; onClose: () => void }) {
  const [msg, setMsg] = useState("");
  useEffect(() => { if (alvo) setMsg(aplicarModelo(modelo, alvo.lead.nome_fantasia || alvo.lead.nome)); }, [alvo, modelo]);
  return (
    <Dialog open={!!alvo} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="rounded-2xl">
        <DialogHeader>
          <DialogTitle>WhatsApp provável</DialogTitle>
          <DialogDescription>Não dá para confirmar se o número tem WhatsApp. Revise a mensagem; ela só é enviada por você, no WhatsApp.</DialogDescription>
        </DialogHeader>
        {alvo && <p className="text-sm">Para: <strong className="text-heading">{alvo.lead.nome}</strong> · {formatarTelefone(alvo.tel.numero)}</p>}
        <Textarea value={msg} onChange={(e) => setMsg(e.target.value)} rows={5} maxLength={1000} className="rounded-[12px] bg-field" aria-label="Mensagem" />
        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={onClose}>Cancelar</Button>
          <Button asChild><a href={alvo ? linkWhatsApp(alvo.tel.numero, msg) : "#"} target="_blank" rel="noopener noreferrer" onClick={onClose}><MessageCircle aria-hidden />Abrir no WhatsApp</a></Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
