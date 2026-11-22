import { Fragment, useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Building2, ChevronDown, Download, ExternalLink, MessageCircle, Phone, Smartphone, Trash2, UserRound, Users, CheckCheck, Pause, Play } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import type { Database } from "@/integrations/supabase/types";
import { buscaQuery, perfilQuery } from "@/lib/queries";
import { controlarBusca, escolherCnpjCandidato, informarCnpj, processarAgora } from "@/lib/caderneta.functions";
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
  const controlar = useServerFn(controlarBusca);
  const { data: perfil } = useQuery(perfilQuery);
  const { data, isPending, isError, refetch } = useQuery({
    ...buscaQuery(buscaId),
    refetchInterval: (q) => (q.state.data?.busca && !["concluida", "erro", "cancelada"].includes(q.state.data.busca.status) ? 5000 : false),
  });
  const ativo = !!data?.busca && !["concluida", "erro", "pausada", "cancelada"].includes(data.busca.status);
  const [fila, setFila] = useState<{ cnpjNaFila: number; cnpjaNaFila: number; cnpjaDestaBusca: number; cnpjaOutrasBuscas: number; tempoEstimadoSegundos: number; bloqueadoAte: string | null; bloqueadoCnpjaAte: string | null; cnpjaSaldoBaixo: boolean } | null>(null);
  const [metricas, setMetricas] = useState<{ coletadas: number; unicas: number; mantidas: number } | null>(null);
  const [controlando, setControlando] = useState(false);
  const [agora, setAgora] = useState(Date.now());

  useEffect(() => {
    const salva = localStorage.getItem(`caderneta-mapas-${buscaId}`);
    if (salva) { try { setMetricas(JSON.parse(salva)); } catch { localStorage.removeItem(`caderneta-mapas-${buscaId}`); } }
    const timer = setInterval(() => setAgora(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [buscaId]);

  useEffect(() => {
    if (!ativo) return;
    let vivo = true;
    const rodar = () => processar({ data: { buscaId } }).then((r) => { if (vivo) {
      setFila(r);
      const info = r.importacoes?.find((x) => x.buscaId === buscaId);
      if (info) { const m = { coletadas: info.coletadas, unicas: info.unicas, mantidas: info.mantidas }; setMetricas(m); localStorage.setItem(`caderneta-mapas-${buscaId}`, JSON.stringify(m)); }
      void qc.invalidateQueries({ queryKey: ["busca", buscaId] });
    } }).catch(() => {});
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
  const alvo = b.quantidade ?? todos.length;
  const emAndamento = todos.find((l) => l.cnpj_status === "consultando");
  const posicao = emAndamento ? todos.findIndex((l) => l.id === emAndamento.id) + 1 : Math.min(concluidos + 1, Math.max(alvo, 1));
  const restantes = Math.max(0, todos.length - concluidos);
  const decorrido = Math.max(1000, agora - new Date(b.created_at).getTime());
  const estimativaLocalMs = concluidos > 0 ? Math.round(decorrido / concluidos * restantes) : b.status === "buscando" ? 120_000 : restantes * 20_000;
  const estimativaMs = Math.max(estimativaLocalMs, (fila?.tempoEstimadoSegundos ?? 0) * 1000);
  const tempoRestante = b.status === "concluida" ? "concluída" : b.status === "pausada" ? "pausada" : estimativaMs < 60_000 ? `cerca de ${Math.max(1, Math.ceil(estimativaMs / 1000))} s` : `cerca de ${Math.ceil(estimativaMs / 60_000)} min`;
  const agrupar = b.tipo === "manual";

  async function marcar(l: Lead, v: boolean) {
    const { error } = await supabase.from("leads").update({ contatado: v }).eq("id", l.id);
    if (error) toast.error("Não foi possível salvar."); else void qc.invalidateQueries({ queryKey: ["busca", buscaId] });
  }
  async function alternarPausa() {
    setControlando(true);
    try {
      const r = await controlar({ data: { buscaId, acao: b.status === "pausada" ? "retomar" : "pausar" } });
      setFila(r.fila);
      void qc.invalidateQueries({ queryKey: ["busca", buscaId] });
    } catch { toast.error("Não foi possível alterar o processamento da busca."); }
    finally { setControlando(false); }
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
          {!['concluida', 'erro', 'cancelada'].includes(b.status) && <Button variant="outline" className="min-h-11" loading={controlando} onClick={() => void alternarPausa()}><>{b.status === "pausada" ? <Play aria-hidden /> : <Pause aria-hidden />}{b.status === "pausada" ? "Retomar busca" : "Pausar busca"}</></Button>}
          {fila?.bloqueadoAte && <Pill tone="atencao">Consulta de CNPJ em pausa até {new Date(fila.bloqueadoAte).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}</Pill>}
          {fila?.bloqueadoCnpjaAte && <Pill tone="atencao">CNPJá em pausa até {new Date(fila.bloqueadoCnpjaAte).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}</Pill>}
          {fila?.cnpjaSaldoBaixo && <Pill tone="erro">Saldo do CNPJá abaixo de 10: buscas pagas pausadas</Pill>}
        </div>
        <div className="mt-3 h-2 overflow-hidden rounded-full bg-secondary" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100} aria-label="Progresso">
          <div className="h-full rounded-full bg-primary transition-all" style={{ width: `${b.status === "concluida" ? 100 : pct}%` }} />
        </div>
        <p className="mt-2 text-sm text-muted-foreground">
          {b.status === "buscando" ? "Buscando empresas no Google Maps." : emAndamento ? `${emAndamento.cnpj ? "Consultando dados de" : "Buscando CNPJ de"} ${emAndamento.nome}, ${posicao} de ${alvo}.` : b.status === "pausada" ? "O processamento está pausado e pode ser retomado." : b.status === "importando" ? "Deduplicando resultados e aplicando filtros." : "Aguardando a próxima empresa da fila."}
          {metricas && <> Coletadas {metricas.coletadas}, únicas {metricas.unicas}, mantidas {metricas.mantidas}.</>}
          {!['pausada', 'concluida', 'cancelada', 'erro'].includes(b.status) && <> Tempo estimado restante: {tempoRestante}.</>}
        </p>
        {fila && <p className="mt-2 text-sm text-muted-foreground">
          {fila.cnpjaDestaBusca} itens desta busca na fila CNPJá.
          {fila.cnpjaOutrasBuscas > 0 && <> {fila.cnpjaOutrasBuscas} itens de outras buscas na fila; <Link to="/historico" className="font-medium text-link underline underline-offset-2">ver histórico</Link>.</>}
        </p>}
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

function EtapaLead({ lead }: { lead: Lead }) {
  const texto = lead.status === "concluido" || lead.cnpj_status === "validado"
    ? "Pronto"
    : lead.cnpj_status === "consultando"
      ? lead.cnpj ? "Consultando dados do CNPJ" : "Buscando CNPJ"
      : "Na fila";
  return <span className="inline-flex min-h-7 items-center gap-1 text-xs text-muted-foreground"><span className="font-semibold">Etapa:</span><span>{texto}</span></span>;
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
                  <td className="px-4 py-3"><div className="flex flex-wrap items-center gap-x-2 gap-y-1"><StatusCnpj status={l.cnpj_status} /><EtapaLead lead={l} /></div></td>
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
              <EtapaLead lead={l} />
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
  const qc = useQueryClient();
  const escolher = useServerFn(escolherCnpjCandidato);
  const [selecionando, setSelecionando] = useState<string | null>(null);
  const links = (l.links as { tipo: string; url: string }[]) ?? [];
  const socios = (l.socios as { nome: string; qualificacao: string }[]) ?? [];
  const candidatos = (l.cnpj_candidatos as unknown as { cnpj: string; nome: string; endereco: string; telefones: string[]; pontos: number; motivos: string[] }[]) ?? [];
  const telefonesFonteMaps = tels.filter((t) => ((t.fontes as unknown as Fonte[]) ?? []).some((f) => ["maps", "site", "whatsapp_site"].includes(f.tipo)));

  async function confirmarCandidato(cnpj: string) {
    setSelecionando(cnpj);
    try {
      await escolher({ data: { leadId: l.id, cnpj } });
      toast.success("CNPJ escolhido. Vamos validar os dados do cadastro.");
      void qc.invalidateQueries({ queryKey: ["busca", buscaId] });
    } catch { toast.error("Não foi possível selecionar este candidato."); }
    finally { setSelecionando(null); }
  }

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
          <div className="flex flex-wrap items-center gap-2"><h4 className="text-sm font-semibold text-heading">CNPJ</h4><StatusCnpj status={l.cnpj_status} /></div>
          {l.cnpj && <p className="mt-1">{formatarCnpj(l.cnpj)} {l.cnpj_fonte_url && <a href={l.cnpj_fonte_url} target="_blank" rel="noopener noreferrer" className="text-link text-sm">(fonte)</a>}</p>}
          {l.cnpj_motivo && <p className="mt-1 text-sm text-warning-text">{l.cnpj_motivo}</p>}
          {["provavel", "varios"].includes(l.cnpj_status) && candidatos.length > 0 && (
            <div className="mt-4 space-y-3">
              <h5 className="text-sm font-semibold text-heading">Compare com os dados do Maps e do site</h5>
              {candidatos.map((c) => (
                <article key={c.cnpj} className="rounded-2xl border border-border bg-card p-4">
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                    <div className="min-w-0">
                      <h6 className="font-semibold text-heading">{c.nome || "Nome não informado"}</h6>
                      <p className="mt-1 text-sm text-muted-foreground">CNPJ {formatarCnpj(c.cnpj)} · {c.pontos} pontos</p>
                    </div>
                    <Button className="min-h-11 w-full sm:w-auto" loading={selecionando === c.cnpj} disabled={!!selecionando} onClick={() => void confirmarCandidato(c.cnpj)}>É este</Button>
                  </div>
                  <div className="mt-3 grid gap-3 text-sm md:grid-cols-2">
                    <div className="rounded-xl bg-field p-3"><strong className="text-heading">Maps / site</strong><p className="mt-1">{l.endereco || l.logradouro || "Endereço não encontrado"}{l.cep ? ` · CEP ${l.cep}` : ""}</p><p>{telefonesFonteMaps.length ? telefonesFonteMaps.map((t) => formatarTelefone(t.numero)).join(", ") : "Telefone não encontrado"}</p></div>
                    <div className="rounded-xl bg-field p-3"><strong className="text-heading">Cadastro do candidato</strong><p className="mt-1">{c.endereco || "Endereço não informado"}</p><p>{c.telefones?.length ? c.telefones.map(formatarTelefone).join(", ") : "Telefone não informado"}</p></div>
                  </div>
                  {c.motivos?.length > 0 && <p className="mt-2 text-xs text-muted-foreground">Sinais: {c.motivos.join(" · ")}</p>}
                </article>
              ))}
            </div>
          )}
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
