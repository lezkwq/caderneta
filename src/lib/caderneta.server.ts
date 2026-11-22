// Lógica do servidor: Apify, fila de tarefas, CNPJ, telefones e score.
// Nunca registra chaves ou dados pessoais em log.
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { cnpjValido, extrairCnpjs, nomeDonoMei, normalizarTelefone, normalizarTexto, soDigitos } from "@/lib/br";
import { calcularScore, type Fonte } from "@/lib/score";
import type { Database } from "@/integrations/supabase/types";
import { decidir, ehSiteProprio, extrairCandidatosCnpja, limparNome, type CandidatoCnpja } from "@/lib/candidatos";
import { analisarHtml, baixarPagina, urlPermitida } from "@/lib/site-fetch.server";
import { selecionarResultadosMaps, mapsResultKey } from "@/lib/maps-results";
import { estimarFilaCnpjaSegundos, planejarCancelamentoFila, planejarExclusaoFila } from "@/lib/fila-utils";

const db = supabaseAdmin;
type TarefaUpd = Database["public"]["Tables"]["tarefas"]["Update"];
type LeadUpd = Database["public"]["Tables"]["leads"]["Update"];
type Json = string | number | boolean | null | Json[] | { [k: string]: Json };

// ───────────── Configuração ─────────────
export async function lerConfig() {
  const { data } = await db.from("app_config").select("chave, valor");
  const m = new Map((data ?? []).map((r) => [r.chave, r.valor as Json]));
  return {
    mapsActor: String(m.get("maps_actor_id") ?? "compass~crawler-google-places").replace("/", "~"),
    searchActor: String(m.get("search_actor_id") ?? "apify~google-search-scraper").replace("/", "~"),
    buscaCnpjGoogle: m.get("busca_cnpj_google") === true,
    maxChargeUsd: Number(m.get("max_charge_usd") ?? 1),
    buscasPorDia: Number(m.get("buscas_por_dia") ?? 10),
    cnpjIntervalo: Number(m.get("cnpj_intervalo_seg") ?? 21),
    cnpjaSaldoMinimo: Number(m.get("cnpja_saldo_minimo") ?? 10),
  };
}

// ───────────── Apify ─────────────
const APIFY = "https://api.apify.com/v2";
function apifyHeaders() {
  const t = process.env["APIFY_TOKEN"];
  if (!t) throw new Error("APIFY_TOKEN não configurado");
  return { Authorization: `Bearer ${t}`, "Content-Type": "application/json" };
}

export async function testarApify(): Promise<{ ok: boolean; motivo: string }> {
  if (!process.env["APIFY_TOKEN"]) return { ok: false, motivo: "não configurado" };
  try {
    const r = await fetch(`${APIFY}/users/me`, { headers: apifyHeaders() });
    return r.ok ? { ok: true, motivo: "" } : { ok: false, motivo: r.status === 401 ? "chave inválida" : `erro ${r.status}` };
  } catch { return { ok: false, motivo: "sem conexão" }; }
}

export async function iniciarRunApify(actor: string, input: Record<string, unknown>, maxUsd: number) {
  const url = `${APIFY}/acts/${encodeURIComponent(actor)}/runs?maxTotalChargeUsd=${maxUsd}&timeout=900`;
  const r = await fetch(url, { method: "POST", headers: apifyHeaders(), body: JSON.stringify(input) });
  if (!r.ok) throw new Error(`Apify recusou a busca (${r.status})`);
  const j = (await r.json()) as { data: { id: string; defaultDatasetId: string } };
  return { runId: j.data.id, datasetId: j.data.defaultDatasetId };
}

interface ItemMaps {
  title?: string; placeId?: string; url?: string; website?: string; phone?: string; phoneUnformatted?: string;
  address?: string; street?: string; city?: string; state?: string; postalCode?: string; categoryName?: string;
  permanentlyClosed?: boolean; searchPageUrl?: string;
}

// ───────────── Tarefas ─────────────
async function enfileirar(userId: string, leadId: string, tipo: "site" | "cnpj" | "busca_cnpj" | "cnpja", atrasoSeg = 0) {
  const { data: alvo } = await db.from("leads").select("id, buscas!inner(status)").eq("id", leadId).maybeSingle();
  const busca = alvo?.buscas as unknown as { status?: string } | null;
  if (!alvo || busca?.status === "cancelada") return;
  const { data: criada } = await db.from("tarefas").insert({ user_id: userId, lead_id: leadId, tipo, executar_apos: new Date(Date.now() + atrasoSeg * 1000).toISOString() }).select("id").maybeSingle();
  if (!criada) return;
  // Fecha a corrida entre a primeira validação e o insert se a busca foi cancelada nesse intervalo.
  const { data: atual } = await db.from("leads").select("id, buscas!inner(status)").eq("id", leadId).maybeSingle();
  const buscaAtual = atual?.buscas as unknown as { status?: string } | null;
  if (!atual || buscaAtual?.status === "cancelada") {
    await db.from("tarefas").update({ status: "cancelada", reservado_em: null }).eq("id", criada.id);
  }
}
async function concluirTarefa(id: string) { await db.from("tarefas").update({ status: "feito" }).eq("id", id).eq("status", "em_processamento"); }
async function adiarTarefa(id: string, seg: number, contaTentativa = true) {
  const { data: existente } = await db.from("tarefas").select("id, lead_id").eq("id", id).maybeSingle();
  if (!existente) return;
  const { data: alvo } = await db.from("leads").select("buscas!inner(status)").eq("id", existente.lead_id).maybeSingle();
  const busca = alvo?.buscas as unknown as { status?: string } | null;
  if (!alvo || busca?.status === "cancelada") {
    await db.from("tarefas").update({ status: "cancelada", reservado_em: null }).eq("id", id);
    return;
  }
  const upd: TarefaUpd = { status: "pendente", reservado_em: null, executar_apos: new Date(Date.now() + seg * 1000).toISOString() };
  if (!contaTentativa) {
    const { data } = await db.from("tarefas").select("tentativas").eq("id", id).single();
    upd["tentativas"] = Math.max(0, (data?.tentativas ?? 1) - 1);
  }
  await db.from("tarefas").update(upd).eq("id", id);
}

async function impedirTarefaInvalida(t: { id: string; lead_id: string }): Promise<boolean> {
  const { data } = await db.from("leads").select("buscas!inner(status)").eq("id", t.lead_id).maybeSingle();
  const busca = data?.buscas as unknown as { status?: string } | null;
  if (busca?.status === "cancelada" || !data) {
    await db.from("tarefas").update({ status: "cancelada", reservado_em: null }).eq("id", t.id);
    return true;
  }
  if (busca?.status !== "pausada") return false;
  await adiarTarefa(t.id, 3600, false);
  return true;
}

async function cancelarSeBuscaEncerrada(t: { id: string; lead_id: string }): Promise<boolean> {
  const { data } = await db.from("leads").select("buscas!inner(status)").eq("id", t.lead_id).maybeSingle();
  const busca = data?.buscas as unknown as { status?: string } | null;
  if (data && busca?.status !== "cancelada") return false;
  await db.from("tarefas").update({ status: "cancelada", reservado_em: null }).eq("id", t.id);
  return true;
}

// ───────────── Telefones ─────────────
async function adicionarTelefone(userId: string, leadId: string, bruto: string, fonte: Fonte) {
  const t = normalizarTelefone(bruto);
  if (!t) return;
  const { data: atual } = await db.from("telefones").select("id, fontes").eq("lead_id", leadId).eq("numero", t.e164).maybeSingle();
  if (atual) {
    const fontes = (atual.fontes as unknown as Fonte[]) ?? [];
    const igual = fontes.find((f) => f.tipo === fonte.tipo && f.url === fonte.url);
    if (igual) { if (fonte.contexto && !igual.contexto) igual.contexto = fonte.contexto; }
    else fontes.push(fonte);
    await db.from("telefones").update({ fontes: fontes as unknown as Json }).eq("id", atual.id);
  } else {
    await db.from("telefones").insert({ user_id: userId, lead_id: leadId, numero: t.e164, tipo: t.tipo, fontes: [fonte] as unknown as Json });
  }
}

function pessoasDoLead(l: { dono: string | null; pessoa: string | null; socios: unknown }): string[] {
  const s = ((l.socios as { nome: string }[]) ?? []).map((x) => x.nome);
  return [l.dono, l.pessoa, ...s].filter((x): x is string => !!x);
}

export async function recalcularScore(leadId: string, propagar = true) {
  const { data: lead } = await db.from("leads").select("id, user_id, cnpj, dono, pessoa, socios").eq("id", leadId).maybeSingle();
  if (!lead) return;
  const { data: tels } = await db.from("telefones").select("id, numero, tipo, fontes").eq("lead_id", leadId);
  const outrosLeads = new Set<string>();
  let melhor: { id: string; score: number } | null = null;
  for (const t of tels ?? []) {
    const { data: iguais } = await db.from("telefones").select("lead_id, leads!inner(id, cnpj, dono, pessoa, socios)").eq("user_id", lead.user_id).eq("numero", t.numero).neq("lead_id", leadId);
    const porCnpj = new Map<string, string[]>();
    for (const i of iguais ?? []) {
      const l = i.leads as unknown as { id: string; cnpj: string | null; dono: string | null; pessoa: string | null; socios: unknown };
      outrosLeads.add(l.id);
      if (!l.cnpj || l.cnpj === lead.cnpj) continue;
      porCnpj.set(l.cnpj, [...(porCnpj.get(l.cnpj) ?? []), ...pessoasDoLead(l)]);
    }
    const r = calcularScore({
      tipo: t.tipo as "celular" | "fixo",
      fontes: t.fontes as unknown as Fonte[],
      dono: lead.dono,
      pessoasDaEmpresa: pessoasDoLead(lead),
      outrasEmpresas: [...porCnpj].map(([cnpj, pessoas]) => ({ cnpj, pessoas })),
    });
    await db.from("telefones").update({ score: r.score, motivos: r.motivos as unknown as Json, principal: false }).eq("id", t.id);
    if (!melhor || r.score > melhor.score) melhor = { id: t.id, score: r.score };
  }
  if (melhor) await db.from("telefones").update({ principal: true }).eq("id", melhor.id);
  if (propagar) for (const o of [...outrosLeads].slice(0, 10)) await recalcularScore(o, false);
}

// ───────────── Estado de lead / busca ─────────────
async function atualizarEstadoLead(leadId: string) {
  const { count } = await db.from("tarefas").select("id", { count: "exact", head: true }).eq("lead_id", leadId).in("status", ["pendente", "em_processamento"]);
  const { data: lead } = await db.from("leads").select("busca_id, cnpj, cnpj_status").eq("id", leadId).maybeSingle();
  if (!lead) return;
  const pend = (count ?? 0) > 0;
  const upd: LeadUpd = { status: pend ? "processando" : "concluido" };
  if (!pend && !lead.cnpj && lead.cnpj_status === "pendente") upd["cnpj_status"] = "nao_encontrado";
  await db.from("leads").update(upd).eq("id", leadId);
  await atualizarEstadoBusca(lead.busca_id);
}

async function atualizarEstadoBusca(buscaId: string) {
  const { data: b } = await db.from("buscas").select("status").eq("id", buscaId).maybeSingle();
  if (!b || ["buscando", "importando", "pausada", "cancelada", "erro"].includes(b.status)) return;
  const { count } = await db.from("leads").select("id", { count: "exact", head: true }).eq("busca_id", buscaId).neq("status", "concluido");
  const { count: total } = await db.from("leads").select("id", { count: "exact", head: true }).eq("busca_id", buscaId);
  await db.from("buscas").update({ status: (count ?? 0) > 0 ? "processando" : "concluida", total_leads: total ?? 0 }).eq("id", buscaId);
}

// ───────────── Etapa 1: acompanhar runs do Apify ─────────────
async function acompanharRuns() {
  const importacoes: { buscaId: string; coletadas: number; unicas: number; mantidas: number }[] = [];
  const { data: buscas } = await db.from("buscas").select("*").eq("status", "buscando").not("apify_run_id", "is", null).order("updated_at").limit(3);
  for (const b of buscas ?? []) {
    try {
      const r = await fetch(`${APIFY}/actor-runs/${encodeURIComponent(b.apify_run_id as string)}`, { headers: apifyHeaders() });
      if (!r.ok) { await db.from("buscas").update({ updated_at: new Date().toISOString() }).eq("id", b.id); continue; }
      const run = ((await r.json()) as { data: { status: string } }).data;
      if (run.status === "READY" || run.status === "RUNNING") { await db.from("buscas").update({ updated_at: new Date().toISOString() }).eq("id", b.id); continue; }
      if (run.status !== "SUCCEEDED") {
        await db.from("buscas").update({ status: b.tipo === "manual" ? "processando" : "erro", erro: `A busca no Google Maps terminou com status ${run.status}.` }).eq("id", b.id);
        if (b.tipo === "manual") await atualizarEstadoBusca(b.id);
        continue;
      }
      const { data: importando } = await db.from("buscas").update({ status: "importando" }).eq("id", b.id).eq("status", "buscando").select("id").maybeSingle();
      if (!importando) continue;
      const lim = Math.min(300, (b.quantidade ?? 20) * (b.so_sem_site ? 3 : 1));
      const ri = await fetch(`${APIFY}/datasets/${encodeURIComponent(b.apify_dataset_id as string)}/items?clean=true&limit=${lim}`, { headers: apifyHeaders() });
      if (!ri.ok) throw new Error("Falha ao baixar os resultados do Maps.");
      const itens = (await ri.json()) as ItemMaps[];
      const resultado = b.tipo === "maps" ? await importarItensMaps(b, itens) : (await mesclarItensManual(b, itens), null);
      await db.from("buscas").update({ status: "processando" }).eq("id", b.id).eq("status", "importando");
      await atualizarEstadoBusca(b.id);
      if (resultado) importacoes.push({ buscaId: b.id, ...resultado });
    } catch {
      await db.from("buscas").update({ status: "buscando" }).eq("id", b.id).eq("status", "importando");
    }
  }
  return importacoes;
}

async function importarItensMaps(b: { id: string; user_id: string; quantidade: number | null; cidade: string | null; estado: string | null; so_sem_site: boolean }, itens: ItemMaps[]) {
  const quantidade = b.quantidade ?? 20;
  const coletadosUnicos = selecionarResultadosMaps(itens, Number.MAX_SAFE_INTEGER);
  const { data: existentes } = await db.from("leads").select("id, place_id, nome").eq("busca_id", b.id);
  const ids = (existentes ?? []).map((l) => l.id);
  const { data: telefonesExistentes } = ids.length ? await db.from("telefones").select("lead_id, numero").in("lead_id", ids) : { data: [] };
  const numerosPorLead = new Map<string, string[]>();
  for (const t of telefonesExistentes ?? []) numerosPorLead.set(t.lead_id, [...(numerosPorLead.get(t.lead_id) ?? []), t.numero]);
  const chavesExistentes = new Set<string>();
  const linhasExistentes = new Set<string>();
  for (const l of existentes ?? []) {
    const telefones = numerosPorLead.get(l.id) ?? [];
    const identidade = l.place_id ? `place:${l.place_id}` : telefones.map((n) => mapsResultKey({ title: l.nome, phone: n })).find(Boolean) ?? `id:${l.id}`;
    linhasExistentes.add(identidade);
    if (l.place_id) chavesExistentes.add(`place:${l.place_id}`);
    for (const numero of telefones) {
      const chave = mapsResultKey({ title: l.nome, phone: numero });
      if (chave) chavesExistentes.add(chave);
    }
  }
  const existentesUnicos = linhasExistentes.size;
  const selecionados = coletadosUnicos.itens
    .filter((it) => !!it.title && !it.permanentlyClosed)
    .filter((it) => !b.so_sem_site || !ehSiteProprio(it.website))
    .filter((it) => { const chave = mapsResultKey(it); return !chave || !chavesExistentes.has(chave); })
    .slice(0, Math.max(0, quantidade - existentesUnicos));
  let novasMantidas = 0;
  for (const it of selecionados) {
    const { data: buscaAtual } = await db.from("buscas").select("status").eq("id", b.id).maybeSingle();
    if (buscaAtual?.status !== "importando") break;
    const proprio = ehSiteProprio(it.website);
    const site = proprio && it.website && urlPermitida(it.website) ? it.website : null;
    const social = !proprio && it.website ? { tipo: classificarLink(it.website), url: it.website } : null;
    const links = [it.url ? { tipo: "maps", url: it.url } : null, site ? { tipo: "site", url: site } : null, social].filter(Boolean);
    const { data: lead } = await db.from("leads").insert({
      user_id: b.user_id, busca_id: b.id, nome: it.title!.slice(0, 200), categoria: it.categoryName ?? null,
      endereco: it.address ?? null, logradouro: it.street ?? null, cidade: it.city ?? b.cidade, uf: it.state ? ufDeNome(it.state) : b.estado,
      cep: it.postalCode ?? null, place_id: it.placeId ?? null, maps_url: it.url ?? null, site, site_proprio: !!site, links: links as unknown as Json, status: "processando",
    }).select("id").single();
    if (!lead) continue;
    novasMantidas++;
    if (it.phoneUnformatted || it.phone) await adicionarTelefone(b.user_id, lead.id, it.phoneUnformatted ?? it.phone ?? "", { tipo: "maps", url: it.url ?? null });
    if (site) await enfileirar(b.user_id, lead.id, "site");
    else await enfileirar(b.user_id, lead.id, "cnpja");
    await recalcularScore(lead.id, false);
    await atualizarEstadoLead(lead.id);
  }
  return { coletadas: itens.length, unicas: coletadosUnicos.unicas, mantidas: Math.min(quantidade, existentesUnicos + novasMantidas) };
}

async function mesclarItensManual(b: { id: string; user_id: string }, itens: ItemMaps[]) {
  const { data: leads } = await db.from("leads").select("id, nome, maps_url, site, cnpj").eq("busca_id", b.id);
  for (const it of itens) {
    if (!it.title) continue;
    const alvo = (leads ?? []).find((l) => l.maps_url && (normalizarTexto(l.nome).includes(normalizarTexto(it.title)) || normalizarTexto(it.title).includes(normalizarTexto(l.nome))))
      ?? (leads ?? []).find((l) => l.maps_url && it.searchPageUrl && l.maps_url === it.searchPageUrl);
    if (!alvo) continue;
    const upd: LeadUpd = { endereco: it.address ?? null, logradouro: it.street ?? null, cep: it.postalCode ?? null, place_id: it.placeId ?? null, categoria: it.categoryName ?? null };
    if (it.city) upd["cidade"] = it.city;
    if (it.state) upd["uf"] = ufDeNome(it.state);
    const site = !alvo.site && it.website && ehSiteProprio(it.website) && urlPermitida(it.website) ? it.website : null;
    if (site) { upd.site = site; upd.site_proprio = true; }
    await db.from("leads").update(upd).eq("id", alvo.id);
    if (it.phoneUnformatted || it.phone) await adicionarTelefone(b.user_id, alvo.id, it.phoneUnformatted ?? it.phone ?? "", { tipo: "maps", url: it.url ?? alvo.maps_url });
    if (site && !alvo.cnpj) await enfileirar(b.user_id, alvo.id, "site");
    else if (!alvo.site && !alvo.cnpj) await enfileirar(b.user_id, alvo.id, "cnpja");
    await recalcularScore(alvo.id, false);
    await atualizarEstadoLead(alvo.id);
  }
  // leads manuais que esperavam o Maps e não têm outra tarefa
  for (const l of leads ?? []) await atualizarEstadoLead(l.id);
}

const UFS: Record<string, string> = { acre: "AC", alagoas: "AL", amapa: "AP", amazonas: "AM", bahia: "BA", ceara: "CE", "distrito federal": "DF", "espirito santo": "ES", goias: "GO", maranhao: "MA", "mato grosso": "MT", "mato grosso do sul": "MS", "minas gerais": "MG", para: "PA", paraiba: "PB", parana: "PR", pernambuco: "PE", piaui: "PI", "rio de janeiro": "RJ", "rio grande do norte": "RN", "rio grande do sul": "RS", rondonia: "RO", roraima: "RR", "santa catarina": "SC", "sao paulo": "SP", sergipe: "SE", tocantins: "TO" };
export function ufDeNome(s: string): string {
  const t = s.trim();
  if (/^[A-Za-z]{2}$/.test(t)) return t.toUpperCase();
  return UFS[normalizarTexto(t)] ?? t;
}

// ───────────── Etapa 2: site ─────────────
async function processarSite(tarefa: { id: string; lead_id: string; user_id: string }) {
  if (await impedirTarefaInvalida(tarefa)) return;
  const { data: lead } = await db.from("leads").select("id, site, cnpj").eq("id", tarefa.lead_id).maybeSingle();
  if (!lead?.site) { await concluirTarefa(tarefa.id); return; }
  const base = urlPermitida(lead.site);
  const paginas: string[] = [];
  if (base) {
    paginas.push(base.toString());
    paginas.push(new URL("/contato", base).toString());
    paginas.push(new URL("/fale-conosco", base).toString());
  }
  const cnpjs: { cnpj: string; url: string }[] = [];
  for (const p of paginas.slice(0, 3)) {
    if (await impedirTarefaInvalida(tarefa)) return;
    const pg = await baixarPagina(p);
    if (!pg) continue;
    if (await impedirTarefaInvalida(tarefa)) return;
    const a = analisarHtml(pg.html, pg.url, extrairCnpjs);
    cnpjs.push(...a.cnpjs);
    const texto = pg.html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ");
    for (const t of a.telefones) {
      let contexto = t.contexto;
      if (!contexto) {
        const n = normalizarTelefone(t.bruto);
        const fim = n ? n.numero.slice(-4) : "";
        const i = fim ? texto.indexOf(fim) : -1;
        contexto = i >= 0 ? texto.slice(Math.max(0, i - 150), i + 150) : "";
      }
      await adicionarTelefone(tarefa.user_id, lead.id, t.bruto, { tipo: t.whatsapp ? "whatsapp_site" : "site", url: t.url, contexto: contexto.slice(0, 400) });
    }
  }
  if (await cancelarSeBuscaEncerrada(tarefa)) return;
  if (!lead.cnpj) {
    const achado = cnpjs[0];
    if (achado) {
      await db.from("leads").update({ cnpj: achado.cnpj, cnpj_origem: "site", cnpj_fonte_url: achado.url, cnpj_status: "na_fila" }).eq("id", lead.id);
      await enfileirar(tarefa.user_id, lead.id, "cnpj");
    } else {
      await enfileirar(tarefa.user_id, lead.id, "cnpja");
    }
  }
  await concluirTarefa(tarefa.id);
  await recalcularScore(lead.id);
  await atualizarEstadoLead(lead.id);
}

// ───────────── Etapa 2b: busca opcional "nome + cidade + CNPJ" ─────────────
async function processarBuscaCnpj(tarefa: { id: string; lead_id: string; user_id: string }) {
  if (await impedirTarefaInvalida(tarefa)) return;
  const cfg = await lerConfig();
  const { data: lead } = await db.from("leads").select("id, nome, cidade, cnpj").eq("id", tarefa.lead_id).maybeSingle();
  if (!lead || lead.cnpj || !cfg.buscaCnpjGoogle) { await concluirTarefa(tarefa.id); if (lead) await atualizarEstadoLead(lead.id); return; }
  try {
    const url = `${APIFY}/acts/${encodeURIComponent(cfg.searchActor)}/run-sync-get-dataset-items?timeout=60&maxTotalChargeUsd=${cfg.maxChargeUsd}`;
    const r = await fetch(url, { method: "POST", headers: apifyHeaders(), body: JSON.stringify({ queries: `"${lead.nome}" ${lead.cidade ?? ""} CNPJ`, maxPagesPerQuery: 1, resultsPerPage: 10, languageCode: "pt-BR", countryCode: "br" }) });
    if (await cancelarSeBuscaEncerrada(tarefa)) return;
    if (r.ok) {
      const itens = (await r.json()) as { organicResults?: { url?: string; title?: string; description?: string }[] }[];
      for (const res of itens.flatMap((i) => i.organicResults ?? [])) {
        const c = extrairCnpjs(`${res.title ?? ""} ${res.description ?? ""}`)[0];
        if (c) {
          await db.from("leads").update({ cnpj: c, cnpj_origem: "google", cnpj_fonte_url: res.url ?? null, cnpj_status: "na_fila" }).eq("id", lead.id);
          await enfileirar(tarefa.user_id, lead.id, "cnpj");
          break;
        }
      }
    }
  } catch { /* ignora */ }
  await concluirTarefa(tarefa.id);
  await atualizarEstadoLead(lead.id);
}

// ───────────── Etapa 3: CNPJ ─────────────
export interface DadosCnpj {
  razao_social: string; nome_fantasia: string | null; situacao: string | null; natureza: string | null; natureza_codigo: string | null;
  mei: boolean; municipio: string | null; uf: string | null; logradouro: string | null; numero: string | null; bairro: string | null; cep: string | null;
  telefones: string[]; email: string | null; socios: { nome: string; qualificacao: string }[];
}

function deBrasilApi(d: Record<string, any>): DadosCnpj {
  return {
    razao_social: d["razao_social"] ?? "", nome_fantasia: d["nome_fantasia"] || null, situacao: d["descricao_situacao_cadastral"] ?? null,
    natureza: d["natureza_juridica"] ?? null, natureza_codigo: d["codigo_natureza_juridica"] != null ? String(d["codigo_natureza_juridica"]) : null,
    mei: d["opcao_pelo_mei"] === true, municipio: d["municipio"] ?? null, uf: d["uf"] ?? null,
    logradouro: [d["descricao_tipo_de_logradouro"], d["logradouro"]].filter(Boolean).join(" ") || null, numero: d["numero"] ?? null, bairro: d["bairro"] ?? null, cep: d["cep"] ?? null,
    telefones: [d["ddd_telefone_1"], d["ddd_telefone_2"]].filter((x: unknown) => typeof x === "string" && x.length >= 10),
    email: d["email"] ?? null,
    socios: ((d["qsa"] as any[]) ?? []).map((s) => ({ nome: String(s["nome_socio"] ?? ""), qualificacao: String(s["qualificacao_socio"] ?? "") })),
  };
}
function deCnpjWs(d: Record<string, any>): DadosCnpj {
  const e = d["estabelecimento"] ?? {};
  return {
    razao_social: d["razao_social"] ?? "", nome_fantasia: e["nome_fantasia"] ?? null, situacao: e["situacao_cadastral"] ?? null,
    natureza: d["natureza_juridica"]?.["descricao"] ?? null, natureza_codigo: d["natureza_juridica"]?.["id"] ? String(d["natureza_juridica"]["id"]).replace(/\D/g, "") : null,
    mei: d["simples"]?.["mei"] === "Sim", municipio: e["cidade"]?.["nome"] ?? null, uf: e["estado"]?.["sigla"] ?? null,
    logradouro: [e["tipo_logradouro"], e["logradouro"]].filter(Boolean).join(" ") || null, numero: e["numero"] ?? null, bairro: e["bairro"] ?? null, cep: e["cep"] ?? null,
    telefones: [[e["ddd1"], e["telefone1"]], [e["ddd2"], e["telefone2"]]].filter(([a, b]) => a && b).map(([a, b]) => `${a}${b}`),
    email: e["email"] ?? null,
    socios: ((d["socios"] as any[]) ?? []).map((s) => ({ nome: String(s["nome"] ?? ""), qualificacao: String(s["qualificacao_socio"]?.["descricao"] ?? "").trim() })),
  };
}

type ResultadoConsulta = { tipo: "ok"; dados: DadosCnpj; fonte: string } | { tipo: "inexistente" } | { tipo: "limite"; esperarSeg: number } | { tipo: "falha" };

async function consultarCnpj(cnpj: string): Promise<ResultadoConsulta> {
  const tentar = async (url: string, conv: (d: any) => DadosCnpj, fonte: string): Promise<ResultadoConsulta> => {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 15000);
    try {
      const r = await fetch(url, { signal: ctrl.signal, headers: { accept: "application/json" } });
      if (r.status === 429) return { tipo: "limite", esperarSeg: Math.min(3600, Math.max(30, Number(r.headers.get("retry-after")) || 60)) };
      if (r.status === 404) return { tipo: "inexistente" };
      if (!r.ok) return { tipo: "falha" };
      return { tipo: "ok", dados: conv(await r.json()), fonte };
    } catch { return { tipo: "falha" }; } finally { clearTimeout(t); }
  };
  const a = await tentar(`https://brasilapi.com.br/api/cnpj/v1/${cnpj}`, deBrasilApi, `https://brasilapi.com.br/api/cnpj/v1/${cnpj}`);
  if (a.tipo === "ok" || a.tipo === "inexistente") return a;
  return tentar(`https://publica.cnpj.ws/cnpj/${cnpj}`, deCnpjWs, `https://publica.cnpj.ws/cnpj/${cnpj}`);
}

export function escolherDono(d: DadosCnpj): { dono: string | null; fonte: string | null } {
  const ehMei = d.mei || d.natureza_codigo === "2135" || /empres[aá]rio.*individual/i.test(d.natureza ?? "");
  if (ehMei) { const n = nomeDonoMei(d.razao_social); return { dono: n || null, fonte: "Razão social (empresário individual / MEI)" }; }
  const adm = d.socios.find((s) => /administrador|titular/i.test(s.qualificacao));
  if (adm) return { dono: adm.nome, fonte: `Quadro societário: ${adm.qualificacao}` };
  return { dono: null, fonte: null };
}

export function conferirEndereco(lead: { cidade: string | null; uf: string | null; endereco: string | null; logradouro: string | null }, d: DadosCnpj): string | null {
  if (lead.cidade && d.municipio && normalizarTexto(lead.cidade) !== normalizarTexto(d.municipio)) return `Cidade diferente: Maps "${lead.cidade}", Receita "${d.municipio}"`;
  if (lead.uf && d.uf && /^[A-Z]{2}$/.test(lead.uf) && lead.uf !== d.uf) return `Estado diferente: Maps "${lead.uf}", Receita "${d.uf}"`;
  const end = normalizarTexto(`${lead.logradouro ?? ""} ${lead.endereco ?? ""}`);
  if (end && d.logradouro) {
    const genericas = new Set(["rua", "avenida", "av", "travessa", "rodovia", "estrada", "alameda", "servidao", "praca", "dos", "das", "de", "da", "do"]);
    const palavras = normalizarTexto(d.logradouro).split(" ").filter((p) => p.length > 2 && !genericas.has(p));
    if (palavras.length && !palavras.some((p) => end.includes(p))) return `Endereço diferente: Receita "${d.logradouro}"`;
  }
  return null;
}

async function processarCnpj(tarefa: { id: string; lead_id: string; user_id: string; tentativas: number }) {
  if (await impedirTarefaInvalida(tarefa)) return "pausado";
  const cfg = await lerConfig();
  const { data: lead } = await db.from("leads").select("*").eq("id", tarefa.lead_id).maybeSingle();
  if (!lead?.cnpj || !cnpjValido(lead.cnpj)) { await concluirTarefa(tarefa.id); if (lead) await atualizarEstadoLead(lead.id); return "ok"; }

  let dados: DadosCnpj | null = null;
  let fonte = "";
  const { data: cache } = await db.from("cnpj_cache").select("dados, fonte").eq("cnpj", lead.cnpj).maybeSingle();
  if (cache) { dados = cache.dados as unknown as DadosCnpj; fonte = cache.fonte; }
  else {
    const { data: slot } = await db.rpc("reservar_slot_cnpj", { _intervalo_seg: cfg.cnpjIntervalo });
    if (!slot) { await adiarTarefa(tarefa.id, cfg.cnpjIntervalo, false); return "aguardando"; }
    await db.from("leads").update({ cnpj_status: "consultando" }).eq("id", lead.id);
    const r = await consultarCnpj(lead.cnpj);
    if (await cancelarSeBuscaEncerrada(tarefa)) return "cancelada";
    if (r.tipo === "limite") {
      await db.from("api_estado").update({ bloqueado_ate: new Date(Date.now() + r.esperarSeg * 1000).toISOString() }).eq("chave", "cnpj");
      await db.from("leads").update({ cnpj_status: "na_fila" }).eq("id", lead.id);
      await adiarTarefa(tarefa.id, r.esperarSeg, false);
      return "limite";
    }
    if (r.tipo === "falha") {
      if (tarefa.tentativas >= 4) {
        await db.from("leads").update({ cnpj_status: "erro", cnpj_motivo: "As consultas de CNPJ não responderam. Tente digitar de novo mais tarde." }).eq("id", lead.id);
        await concluirTarefa(tarefa.id); await atualizarEstadoLead(lead.id);
      } else { await db.from("leads").update({ cnpj_status: "na_fila" }).eq("id", lead.id); await adiarTarefa(tarefa.id, 60 * tarefa.tentativas); }
      return "falha";
    }
    if (r.tipo === "inexistente") {
      await db.from("leads").update({ cnpj_status: "nao_encontrado", cnpj_motivo: "Este CNPJ não existe na Receita." }).eq("id", lead.id);
      await concluirTarefa(tarefa.id); await atualizarEstadoLead(lead.id);
      return "ok";
    }
    dados = r.dados; fonte = r.fonte;
    await db.from("cnpj_cache").upsert({ cnpj: lead.cnpj, fonte, dados: dados as unknown as Json });
  }

  const divergencia = lead.cnpj_origem === "manual_usuario" ? null : conferirEndereco(lead, dados);
  if (divergencia) {
    await db.from("leads").update({ cnpj_status: "divergente", cnpj_motivo: divergencia, razao_social: dados.razao_social ? (dados.mei ? nomeDonoMei(dados.razao_social) : dados.razao_social) : null, municipio_receita: dados.municipio, uf_receita: dados.uf }).eq("id", lead.id);
  } else {
    const { dono, fonte: donoFonte } = escolherDono(dados);
    await db.from("leads").update({
      cnpj_status: "validado", cnpj_motivo: null,
      razao_social: dados.mei ? nomeDonoMei(dados.razao_social) : dados.razao_social,
      nome_fantasia: dados.nome_fantasia, situacao: dados.situacao, natureza: dados.natureza,
      municipio_receita: dados.municipio, uf_receita: dados.uf, email_receita: dados.email,
      dono, dono_fonte: donoFonte, socios: dados.socios as unknown as Json,
    }).eq("id", lead.id);
    for (const t of dados.telefones) await adicionarTelefone(lead.user_id, lead.id, t, { tipo: "receita", url: fonte });
  }
  await concluirTarefa(tarefa.id);
  await recalcularScore(lead.id);
  await atualizarEstadoLead(lead.id);
  return "ok";
}

// ───────────── Worker: chamado pelo agendamento e pela tela ─────────────
export async function processarFila() {
  const inicio = Date.now();
  const resumo = { runs: 0, sites: 0, buscasCnpj: 0, cnpj: "" as string, importacoes: [] as { buscaId: string; coletadas: number; unicas: number; mantidas: number }[] };
  resumo.importacoes = await acompanharRuns(); resumo.runs = 1;
  const { data: sites } = await db.rpc("reservar_tarefas", { _tipo: "site", _limite: 2 });
  for (const t of sites ?? []) { if (Date.now() - inicio > 60000) { await adiarTarefa(t.id, 5, false); continue; } await processarSite(t).catch(async () => { if (!await impedirTarefaInvalida(t)) await concluirTarefa(t.id); }); resumo.sites++; }
  const { data: bcs } = await db.rpc("reservar_tarefas", { _tipo: "busca_cnpj", _limite: 1 });
  for (const t of bcs ?? []) { await processarBuscaCnpj(t).catch(async () => { if (!await impedirTarefaInvalida(t)) await concluirTarefa(t.id); }); resumo.buscasCnpj++; }
  const { data: cja } = await db.rpc("reservar_tarefas", { _tipo: "cnpja", _limite: 1 });
  for (const t of cja ?? []) await processarCnpja({ ...t, tentativas: t.tentativas }).catch(async () => { if (!await impedirTarefaInvalida(t)) await adiarTarefa(t.id, 120); });
  const { data: cn } = await db.rpc("reservar_tarefas", { _tipo: "cnpj", _limite: 1 });
  for (const t of cn ?? []) resumo.cnpj = await processarCnpj(t).catch(() => { void adiarTarefa(t.id, 60); return "falha"; });
  return resumo;
}

// ───────────── Criação de buscas ─────────────
export async function contarBuscasHoje(userId: string) {
  const desde = new Date(); desde.setUTCHours(0, 0, 0, 0);
  const { count } = await db.from("buscas").select("id", { count: "exact", head: true }).eq("user_id", userId).gte("created_at", desde.toISOString());
  return count ?? 0;
}

export async function criarBuscaMaps(userId: string, entrada: { cidade: string; estado: string; pais: string; nicho: string; quantidade: number; soSemSite?: boolean | undefined }) {
  const cfg = await lerConfig();
  if ((await contarBuscasHoje(userId)) >= cfg.buscasPorDia) throw new Error(`Você já fez ${cfg.buscasPorDia} buscas hoje. O limite diário volta amanhã.`);
  const { soSemSite, ...p } = entrada;
  const { data: busca, error } = await db.from("buscas").insert({ user_id: userId, tipo: "maps", titulo: `${p.nicho} em ${p.cidade}/${p.estado}${soSemSite ? " (sem site)" : ""}`, ...p, so_sem_site: !!soSemSite, status: "iniciando" }).select("id").single();
  if (error || !busca) throw new Error("Não foi possível criar a busca.");
  try {
    const run = await iniciarRunApify(cfg.mapsActor, {
      searchStringsArray: [p.nicho], locationQuery: `${p.cidade}, ${p.estado}, ${p.pais}`,
      maxCrawledPlacesPerSearch: Math.min(300, soSemSite ? p.quantidade * 3 : p.quantidade + Math.ceil(p.quantidade * 0.3)), language: "pt-BR", skipClosedPlaces: true,
    }, cfg.maxChargeUsd);
    await db.from("buscas").update({ status: "buscando", apify_run_id: run.runId, apify_dataset_id: run.datasetId }).eq("id", busca.id);
  } catch (e) {
    await db.from("buscas").update({ status: "erro", erro: e instanceof Error ? e.message : "Falha ao iniciar a busca" }).eq("id", busca.id);
  }
  return busca.id;
}

export interface EmpresaManual { nome: string; cidade?: string | undefined; cnpj?: string | undefined; links: string[]; pessoa?: string | undefined }

export function classificarLink(url: string): "maps" | "site" | "instagram" | "facebook" | "outro" {
  const h = (() => { try { return new URL(url).hostname.toLowerCase(); } catch { return ""; } })();
  if (/(^|\.)google\.[a-z.]+$/.test(h) && url.includes("/maps") || h === "maps.app.goo.gl" || h === "goo.gl") return "maps";
  if (h.endsWith("instagram.com")) return "instagram";
  if (h.endsWith("facebook.com") || h === "fb.com") return "facebook";
  if (h.endsWith("wa.me") || h.endsWith("whatsapp.com") || h.endsWith("linktr.ee")) return "outro";
  return h ? "site" : "outro";
}

export async function criarBuscaManual(userId: string, empresas: EmpresaManual[]) {
  const cfg = await lerConfig();
  if ((await contarBuscasHoje(userId)) >= cfg.buscasPorDia) throw new Error(`Você já fez ${cfg.buscasPorDia} buscas hoje. O limite diário volta amanhã.`);
  const { data: busca, error } = await db.from("buscas").insert({ user_id: userId, tipo: "manual", titulo: `Lista manual (${empresas.length} empresas)`, quantidade: empresas.length, status: "processando" }).select("id").single();
  if (error || !busca) throw new Error("Não foi possível criar a lista.");
  const mapsUrls: string[] = [];
  for (const e of empresas) {
    const links = e.links.map((url) => ({ tipo: classificarLink(url), url }));
    const maps = links.find((l) => l.tipo === "maps")?.url ?? null;
    const site = links.find((l) => l.tipo === "site" && ehSiteProprio(l.url) && urlPermitida(l.url))?.url ?? null;
    const cnpj = e.cnpj && cnpjValido(e.cnpj) ? soDigitos(e.cnpj) : null;
    const { data: lead } = await db.from("leads").insert({
      user_id: userId, busca_id: busca.id, nome: e.nome, cidade: e.cidade || null, pessoa: e.pessoa || null,
      maps_url: maps, site, site_proprio: !!site, links: links as unknown as Json, cnpj, cnpj_origem: cnpj ? "manual_usuario" : null, cnpj_status: cnpj ? "na_fila" : "pendente", status: "processando",
    }).select("id").single();
    if (!lead) continue;
    if (maps) mapsUrls.push(maps);
    if (cnpj) await enfileirar(userId, lead.id, "cnpj");
    if (site) await enfileirar(userId, lead.id, "site");
    else if (!cnpj && !maps) await enfileirar(userId, lead.id, "cnpja");
    if (!maps) await atualizarEstadoLead(lead.id);
  }
  if (mapsUrls.length) {
    try {
      const run = await iniciarRunApify(cfg.mapsActor, { startUrls: mapsUrls.map((url) => ({ url })), language: "pt-BR", maxCrawledPlacesPerSearch: 1 }, cfg.maxChargeUsd);
      await db.from("buscas").update({ status: "buscando", apify_run_id: run.runId, apify_dataset_id: run.datasetId }).eq("id", busca.id);
    } catch { /* segue sem o Maps */ await atualizarEstadoBusca(busca.id); }
  } else await atualizarEstadoBusca(busca.id);
  return busca.id;
}

export async function definirCnpjManual(userId: string, leadId: string, cnpj: string) {
  const { data: lead } = await db.from("leads").select("id, user_id").eq("id", leadId).maybeSingle();
  if (!lead || lead.user_id !== userId) throw new Error("Lead não encontrado.");
  await db.from("tarefas").update({ status: "feito" }).eq("lead_id", leadId).eq("tipo", "cnpj").in("status", ["pendente"]);
  await db.from("leads").update({ cnpj, cnpj_origem: "manual_usuario", cnpj_fonte_url: null, cnpj_status: "na_fila", cnpj_motivo: null, dono: null, dono_fonte: null, socios: [] }).eq("id", leadId);
  await db.from("telefones").delete().eq("lead_id", leadId).eq("fontes->0->>tipo", "receita");
  await enfileirar(userId, leadId, "cnpj");
  await atualizarEstadoLead(leadId);
}

export async function selecionarCnpjCandidato(userId: string, leadId: string, cnpj: string) {
  const { data: lead } = await db.from("leads").select("id, user_id, cnpj_candidatos").eq("id", leadId).maybeSingle();
  if (!lead || lead.user_id !== userId) throw new Error("Lead não encontrado.");
  const candidatos = (lead.cnpj_candidatos as unknown as { cnpj?: string }[]) ?? [];
  if (!candidatos.some((c) => soDigitos(c.cnpj ?? "") === cnpj) || !cnpjValido(cnpj)) throw new Error("Candidato inválido.");
  const { error } = await db.from("leads").update({
    cnpj, cnpj_origem: "cnpja", cnpj_fonte_url: `https://cnpja.com/office/${cnpj}`,
    cnpj_status: "na_fila", cnpj_motivo: "Candidato escolhido por você; aguardando validação dos dados do CNPJ.", cnpja_buscado: true,
  }).eq("id", leadId);
  if (error) throw new Error("Não foi possível selecionar este CNPJ.");
  await enfileirar(userId, leadId, "cnpj");
  await atualizarEstadoLead(leadId);
}

export async function controlarBusca(userId: string, buscaId: string, acao: "pausar" | "retomar") {
  const { data: busca } = await db.from("buscas").select("id, status, tipo, apify_run_id").eq("id", buscaId).eq("user_id", userId).maybeSingle();
  if (!busca) throw new Error("Busca não encontrada.");
  if (acao === "pausar") {
    if (["concluida", "erro", "pausada"].includes(busca.status)) return;
    await db.from("buscas").update({ status: "pausada" }).eq("id", buscaId).eq("user_id", userId);
    return;
  }
  if (busca.status !== "pausada") return;
  const status = busca.tipo === "maps" && busca.apify_run_id ? "buscando" : "processando";
  await db.from("buscas").update({ status }).eq("id", buscaId).eq("user_id", userId).eq("status", "pausada");
  const { data: leads } = await db.from("leads").select("id").eq("busca_id", buscaId);
  const ids = (leads ?? []).map((l) => l.id);
  if (ids.length) await db.from("tarefas").update({ executar_apos: new Date().toISOString() }).in("lead_id", ids).eq("status", "pendente");
}

export async function listarHistorico(userId: string) {
  const [{ data: buscas, error: erroBuscas }, { data: leads, error: erroLeads }, { data: tarefas, error: erroTarefas }] = await Promise.all([
    db.from("buscas").select("id, titulo, created_at, status, quantidade, total_leads").eq("user_id", userId).order("created_at", { ascending: false }).limit(200),
    db.from("leads").select("id, busca_id").eq("user_id", userId),
    db.from("tarefas").select("id, lead_id, tipo, status").eq("user_id", userId),
  ]);
  if (erroBuscas || erroLeads || erroTarefas) throw new Error("Não foi possível carregar o histórico.");
  const buscaPorLead = new Map((leads ?? []).map((l) => [l.id, l.busca_id]));
  const statusPorBusca = new Map((buscas ?? []).map((b) => [b.id, b.status]));
  const empresasPorBusca = new Map<string, number>();
  for (const l of leads ?? []) empresasPorBusca.set(l.busca_id, (empresasPorBusca.get(l.busca_id) ?? 0) + 1);
  const filaPorBusca = new Map<string, number>();
  for (const t of tarefas ?? []) {
    const buscaId = buscaPorLead.get(t.lead_id);
    if (buscaId && !["cancelada", "pausada", "erro"].includes(statusPorBusca.get(buscaId) ?? "erro") && ["pendente", "em_processamento"].includes(t.status)) {
      filaPorBusca.set(buscaId, (filaPorBusca.get(buscaId) ?? 0) + 1);
    }
  }
  return (buscas ?? []).map((b) => ({
    ...b,
    empresas: empresasPorBusca.get(b.id) ?? 0,
    itensNaFila: filaPorBusca.get(b.id) ?? 0,
    creditosCnpjaUsados: null as number | null,
  }));
}

export async function cancelarFilaBusca(userId: string, buscaId: string) {
  const { data: busca } = await db.from("buscas").select("id, status").eq("id", buscaId).eq("user_id", userId).maybeSingle();
  if (!busca) throw new Error("Busca não encontrada.");
  const { error: erroStatus } = await db.from("buscas").update({ status: "cancelada" }).eq("id", buscaId).eq("user_id", userId);
  if (erroStatus) throw new Error("Não foi possível cancelar a busca.");
  const { data: leads, error: erroLeads } = await db.from("leads").select("id").eq("busca_id", buscaId);
  if (erroLeads) throw new Error("Não foi possível listar as empresas da busca.");
  const ids = (leads ?? []).map((l) => l.id);
  if (!ids.length) return 0;
  const { data: tarefas, error: erroTarefas } = await db.from("tarefas").select("id, lead_id, status").in("lead_id", ids);
  if (erroTarefas) throw new Error("Não foi possível listar os itens da fila.");
  const idsParaCancelar = planejarCancelamentoFila(tarefas ?? [], ids);
  if (idsParaCancelar.length) {
    const { error } = await db.from("tarefas").update({ status: "cancelada", reservado_em: null }).in("id", idsParaCancelar);
    if (error) throw new Error("A busca foi marcada como cancelada, mas não foi possível limpar todos os itens da fila.");
  }
  return idsParaCancelar.length;
}

export async function excluirBusca(userId: string, buscaId: string) {
  const { data: busca } = await db.from("buscas").select("id").eq("id", buscaId).eq("user_id", userId).maybeSingle();
  if (!busca) throw new Error("Busca não encontrada.");
  const { error: erroStatus } = await db.from("buscas").update({ status: "cancelada" }).eq("id", buscaId).eq("user_id", userId);
  if (erroStatus) throw new Error("Não foi possível parar a busca antes da exclusão.");
  const { data: leads, error: erroLeads } = await db.from("leads").select("id").eq("busca_id", buscaId);
  if (erroLeads) throw new Error("Não foi possível listar as empresas da busca.");
  const ids = (leads ?? []).map((l) => l.id);
  if (ids.length) {
    const { data: tarefas, error: erroTarefas } = await db.from("tarefas").select("id, lead_id, status").in("lead_id", ids);
    if (erroTarefas) throw new Error("Não foi possível listar os itens da fila.");
    const idsParaExcluir = planejarExclusaoFila(tarefas ?? [], ids);
    if (idsParaExcluir.length) {
      const { error } = await db.from("tarefas").delete().in("id", idsParaExcluir);
      if (error) throw new Error("Não foi possível excluir todos os itens da fila.");
    }
    const { error } = await db.from("leads").delete().eq("busca_id", buscaId);
    if (error) throw new Error("Não foi possível excluir as empresas da busca.");
  }
  const { error } = await db.from("buscas").delete().eq("id", buscaId).eq("user_id", userId);
  if (error) throw new Error("Não foi possível excluir a busca.");
}

export async function previsaoFila(userId?: string, buscaId?: string) {
  const cfg = await lerConfig();
  const [{ data: tarefas }, { data: est }, { data: estCnpja }, { data: credito }] = await Promise.all([
    db.from("tarefas").select("id, lead_id, user_id, tipo, status, executar_apos").in("tipo", ["cnpj", "cnpja"]).in("status", ["pendente", "em_processamento"]),
    db.from("api_estado").select("bloqueado_ate").eq("chave", "cnpj").maybeSingle(),
    db.from("api_estado").select("ultima_consulta, bloqueado_ate").eq("chave", "cnpja").maybeSingle(),
    db.from("cnpja_cache").select("resposta, criado_em").eq("chave", "credit:temporario").maybeSingle(),
  ]);
  const filaBruta = tarefas ?? [];
  const leadIds = [...new Set(filaBruta.map((t) => t.lead_id))];
  const { data: leadsFila } = leadIds.length
    ? await db.from("leads").select("id, user_id, busca_id, buscas!inner(status)").in("id", leadIds)
    : { data: [] };
  const porLead = new Map((leadsFila ?? []).map((l) => [l.id, {
    userId: l.user_id, buscaId: l.busca_id,
    status: ((l.buscas as unknown as { status?: string } | null)?.status ?? "erro"),
  }]));
  const invalidas = filaBruta.filter((t) => {
    const lead = porLead.get(t.lead_id);
    return !lead || ["cancelada", "erro"].includes(lead.status);
  });
  const invalidIds = invalidas.map((t) => t.id);
  if (invalidIds.length) await db.from("tarefas").update({ status: "cancelada", reservado_em: null }).in("id", invalidIds);
  const filaGlobal = filaBruta.filter((t) => {
    const lead = porLead.get(t.lead_id);
    return !!lead && !["cancelada", "pausada", "erro"].includes(lead.status);
  });
  const filaCnpja = filaGlobal.filter((t) => t.tipo === "cnpja");
  const filaCnpj = filaGlobal.filter((t) => t.tipo === "cnpj");
  const destaBusca = userId && buscaId ? filaCnpja.filter((t) => porLead.get(t.lead_id)?.buscaId === buscaId).length : 0;
  const outrasBuscas = userId && buscaId ? filaCnpja.filter((t) => {
    const lead = porLead.get(t.lead_id);
    return lead?.userId === userId && lead.buscaId !== buscaId;
  }).length : 0;
  let futurasDaBusca = 0;
  if (userId && buscaId) {
    const { data: busca } = await db.from("buscas").select("id, status, quantidade").eq("id", buscaId).eq("user_id", userId).maybeSingle();
    if (busca && !["concluida", "cancelada", "erro", "pausada"].includes(busca.status)) {
      const { data: leadsBusca } = await db.from("leads").select("id, status, cnpj, cnpja_buscado").eq("busca_id", buscaId);
      const ativos = (leadsBusca ?? []).filter((l) => l.status !== "concluido" && !l.cnpj && !l.cnpja_buscado && !filaCnpja.some((t) => t.lead_id === l.id)).length;
      futurasDaBusca = Math.max(Math.max(0, (busca.quantidade ?? 0) - (leadsBusca?.length ?? 0)), ativos);
    }
  }
  const bloqueio = est?.bloqueado_ate && new Date(est.bloqueado_ate) > new Date() ? est.bloqueado_ate : null;
  const bloqueioCnpja = estCnpja?.bloqueado_ate && new Date(estCnpja.bloqueado_ate) > new Date() ? estCnpja.bloqueado_ate : null;
  const saldoCnpjaAtual = (credito?.resposta as { saldo?: unknown } | null)?.saldo;
  const creditoValido = !!credito?.criado_em && Date.now() - new Date(credito.criado_em).getTime() < 30_000;
  const ultimaConsulta = estCnpja?.ultima_consulta ? new Date(estCnpja.ultima_consulta).getTime() : 0;
  const esperaSlotMs = Math.max(
    0,
    ultimaConsulta + INTERVALO_CNPJA_MS - Date.now(),
    bloqueioCnpja ? new Date(bloqueioCnpja).getTime() - Date.now() : 0,
    ...filaCnpja.map((t) => t.executar_apos ? new Date(t.executar_apos).getTime() - Date.now() : 0),
  );
  const tempoEstimadoSegundos = estimarFilaCnpjaSegundos({ itensGlobal: filaCnpja.length, itensFuturosDaBusca: futurasDaBusca, esperaProximoSlotMs: esperaSlotMs });
  return { cnpjNaFila: filaCnpj.length, cnpjaNaFila: filaCnpja.length, cnpjaDestaBusca: destaBusca, cnpjaOutrasBuscas: outrasBuscas, tempoEstimadoSegundos, intervaloSeg: cfg.cnpjIntervalo, bloqueadoAte: bloqueio, bloqueadoCnpjaAte: bloqueioCnpja, cnpjaSaldoBaixo: typeof saldoCnpjaAtual === "number" && saldoCnpjaAtual < cfg.cnpjaSaldoMinimo && (creditoValido || !!bloqueioCnpja), buscasPorDia: cfg.buscasPorDia };
}


// ───────────── Busca de CNPJ por nome (CNPJá) ─────────────
const CNPJA = "https://api.cnpja.com";
const INTERVALO_CNPJA_MS = 6100;
function cnpjaHeaders() {
  const k = process.env["CNPJA_API_KEY"];
  if (!k) throw new Error("CNPJA_API_KEY não configurado");
  return { Authorization: k, accept: "application/json" };
}

async function requisitarCnpja(url: string): Promise<{ response: Response } | { esperarSeg: number; tipo: "janela" | "limite" }> {
  const { data: estado } = await db.from("api_estado").select("ultima_consulta, bloqueado_ate").eq("chave", "cnpja").maybeSingle();
  const bloqueio = estado?.bloqueado_ate ? new Date(estado.bloqueado_ate).getTime() : 0;
  if (bloqueio > Date.now()) return { esperarSeg: Math.ceil((bloqueio - Date.now()) / 1000), tipo: "limite" };
  const agora = new Date();
  const antes = new Date(agora.getTime() - INTERVALO_CNPJA_MS).toISOString();
  const { data: reservado } = await db.from("api_estado").update({ ultima_consulta: agora.toISOString() })
    .eq("chave", "cnpja").or(`ultima_consulta.is.null,ultima_consulta.lt.${antes}`).select("chave").maybeSingle();
  if (!reservado) {
    const anterior = estado?.ultima_consulta ? new Date(estado.ultima_consulta).getTime() : Date.now();
    return { esperarSeg: Math.max(1, Math.ceil((anterior + INTERVALO_CNPJA_MS - Date.now()) / 1000)), tipo: "janela" };
  }
  const response = await fetch(url, { headers: cnpjaHeaders() });
  if (response.status === 429) {
    const valor = response.headers.get("retry-after") ?? "";
    const segundos = Number(valor);
    const dataRetry = Date.parse(valor);
    const esperarSeg = Math.min(3600, Math.max(60, Number.isFinite(segundos) && segundos > 0 ? segundos : Number.isFinite(dataRetry) ? Math.ceil((dataRetry - Date.now()) / 1000) : 60));
    await db.from("api_estado").update({ bloqueado_ate: new Date(Date.now() + esperarSeg * 1000).toISOString() }).eq("chave", "cnpja");
    return { esperarSeg, tipo: "limite" };
  }
  return { response };
}

export async function saldoCnpja(): Promise<{ saldo: number | null; esperarSeg?: number }> {
  try {
    const { data: cache } = await db.from("cnpja_cache").select("resposta, criado_em").eq("chave", "credit:temporario").maybeSingle();
    if (cache && Date.now() - new Date(cache.criado_em).getTime() < 30_000) {
      const saldo = (cache.resposta as { saldo?: unknown }).saldo;
      if (typeof saldo === "number") return { saldo };
    }
    const req = await requisitarCnpja(`${CNPJA}/credit`);
    if ("esperarSeg" in req) return { saldo: null, esperarSeg: req.esperarSeg };
    const r = req.response;
    if (!r.ok) return { saldo: null };
    const j = await r.json();
    if (typeof j === "number" && Number.isFinite(j) && j >= 0) {
      await db.from("cnpja_cache").upsert({ chave: "credit:temporario", resposta: { saldo: j } as unknown as Json, criado_em: new Date().toISOString() });
      return { saldo: j };
    }
    if (!j || typeof j !== "object" || Array.isArray(j)) return { saldo: null };
    const saldo = j as Record<string, unknown>;
    for (const k of ["remaining", "available", "credits", "credit", "balance", "saldo", "totalRemaining"]) {
      const v = saldo[k];
      if (typeof v === "number" && Number.isFinite(v) && v >= 0) {
        await db.from("cnpja_cache").upsert({ chave: "credit:temporario", resposta: { saldo: v } as unknown as Json, criado_em: new Date().toISOString() });
        return { saldo: v };
      }
    }
    const temporarios = saldo["transient"];
    const permanentes = saldo["perpetual"];
    if ((typeof temporarios === "number" || typeof permanentes === "number") &&
      (temporarios === undefined || typeof temporarios === "number") &&
      (permanentes === undefined || typeof permanentes === "number")) {
      const v = (typeof temporarios === "number" ? temporarios : 0) + (typeof permanentes === "number" ? permanentes : 0);
      await db.from("cnpja_cache").upsert({ chave: "credit:temporario", resposta: { saldo: v } as unknown as Json, criado_em: new Date().toISOString() });
      return { saldo: v };
    }
    return { saldo: null };
  } catch { return { saldo: null }; }
}

async function descontarSaldoCnpja(registros: number) {
  if (registros <= 0) return;
  const { data } = await db.from("cnpja_cache").select("resposta").eq("chave", "credit:temporario").maybeSingle();
  const saldo = (data?.resposta as { saldo?: unknown } | null)?.saldo;
  if (typeof saldo !== "number") return;
  const restante = Math.max(0, saldo - Math.ceil(registros / 10));
  await db.from("cnpja_cache").upsert({ chave: "credit:temporario", resposta: { saldo: restante } as unknown as Json, criado_em: new Date().toISOString() });
}

async function municipioPorCep(cep: string): Promise<{ municipality: number; state: string; esperarSeg?: number } | null> {
  const c = soDigitos(cep);
  if (c.length !== 8) return null;
  const cache = await db.from("cnpja_cache").select("resposta").eq("chave", `zip:${c}`).maybeSingle();
  if (cache.data) return cache.data.resposta as unknown as { municipality: number; state: string };
  const req = await requisitarCnpja(`${CNPJA}/zip/${c}`);
  if ("esperarSeg" in req) return { municipality: 0, state: "", esperarSeg: req.esperarSeg };
  const r = req.response;
  if (!r.ok) return null;
  const j = (await r.json()) as { municipality?: number; state?: string };
  if (!j.municipality) return null;
  const resultado = { municipality: j.municipality, state: j.state ?? "" };
  await db.from("cnpja_cache").upsert({ chave: `zip:${c}`, resposta: resultado as unknown as Json });
  return resultado;
}

async function cnaeDoNicho(nicho: string | null): Promise<string | null> {
  if (!nicho) return null;
  const { data } = await db.from("nicho_cnae").select("nicho, cnae");
  const n = normalizarTexto(nicho);
  return (data ?? []).find((r) => n === normalizarTexto(r.nicho) || n.includes(normalizarTexto(r.nicho)))?.cnae ?? null;
}

async function processarCnpja(tarefa: { id: string; lead_id: string; user_id: string; tentativas: number }) {
  if (await impedirTarefaInvalida(tarefa)) return;
  const cfg = await lerConfig();
  const { data: lead } = await db.from("leads").select("*, buscas!inner(nicho, status)").eq("id", tarefa.lead_id).maybeSingle();
  const fim = async (upd?: LeadUpd) => {
    if (upd && lead) await db.from("leads").update(upd).eq("id", lead.id);
    if (upd && lead?.place_id) {
      const copia = { ...upd, cnpja_buscado: true };
      const { data: duplicados } = await db.from("leads").update(copia).eq("place_id", lead.place_id).eq("cnpja_buscado", true).eq("cnpj_status", "consultando").is("cnpj", null).neq("id", lead.id).select("id, user_id");
      if (upd.cnpj) for (const d of duplicados ?? []) await enfileirar(d.user_id, d.id, "cnpj");
    }
    await concluirTarefa(tarefa.id);
    if (lead) { await recalcularScore(lead.id); await atualizarEstadoLead(lead.id); }
  };
  if (!lead) { await db.from("tarefas").update({ status: "cancelada", reservado_em: null }).eq("id", tarefa.id); return; }
  if (lead.cnpj) return fim();
  if (lead.place_id) {
    const { data: anterior } = await db.from("leads").select("cnpj, cnpj_origem, cnpj_fonte_url, cnpj_candidatos, cnpj_status, cnpj_motivo, razao_social, nome_fantasia, situacao, natureza, municipio_receita, uf_receita, email_receita, dono, dono_fonte, socios")
      .eq("place_id", lead.place_id).eq("cnpja_buscado", true).neq("id", lead.id).limit(1).maybeSingle();
    if (anterior) {
      if (anterior.cnpj_status === "consultando" && !anterior.cnpj) { await adiarTarefa(tarefa.id, 60, false); return; }
      const { cnpj, ...resto } = anterior;
      await fim({ ...resto, cnpj, cnpja_buscado: true } as LeadUpd);
      if (cnpj) await enfileirar(tarefa.user_id, lead.id, "cnpj");
      return;
    }
  }
  if (lead.cnpja_buscado) {
    if (lead.cnpj_status === "consultando") { await adiarTarefa(tarefa.id, 60, false); return; }
    return fim();
  }

  const { data: estado } = await db.from("api_estado").select("bloqueado_ate").eq("chave", "cnpja").maybeSingle();
  if (estado?.bloqueado_ate && new Date(estado.bloqueado_ate) > new Date()) {
    await adiarTarefa(tarefa.id, Math.ceil((new Date(estado.bloqueado_ate).getTime() - Date.now()) / 1000), false);
    return;
  }

  const termos = limparNome(lead.nome, lead.cidade);
  if (!termos) return fim({ cnpja_buscado: true, cnpj_status: "nao_encontrado", cnpj_motivo: "Nome muito genérico para buscar o CNPJ." });

  const saldoInfo = await saldoCnpja();
  if (await impedirTarefaInvalida(tarefa)) return;
  if (saldoInfo.esperarSeg) {
    await db.from("leads").update({ cnpj_status: "na_fila", cnpj_motivo: "Consulta do CNPJá aguardando a janela global de 10 por minuto." }).eq("id", lead.id);
    await adiarTarefa(tarefa.id, saldoInfo.esperarSeg, false);
    return;
  }
  if (saldoInfo.saldo === null) {
    await db.from("leads").update({ cnpj_status: "na_fila", cnpj_motivo: "Não foi possível consultar o saldo do CNPJá. Nova tentativa em alguns minutos." }).eq("id", lead.id);
    await adiarTarefa(tarefa.id, 300, false);
    return;
  }
  if (saldoInfo.saldo < cfg.cnpjaSaldoMinimo) {
    await db.from("api_estado").update({ bloqueado_ate: new Date(Date.now() + 3600_000).toISOString() }).eq("chave", "cnpja");
    await db.from("leads").update({ cnpj_status: "na_fila", cnpj_motivo: `Busca pausada: o saldo do CNPJá está abaixo de ${cfg.cnpjaSaldoMinimo} créditos.` }).eq("id", lead.id);
    await adiarTarefa(tarefa.id, 3600, false);
    return;
  }

  // Cache permanente por consulta: nunca repete a mesma busca.
  const geo = lead.cep ? await municipioPorCep(lead.cep) : null;
  if (await impedirTarefaInvalida(tarefa)) return;
  if (geo?.esperarSeg) {
    await db.from("leads").update({ cnpj_status: "na_fila", cnpj_motivo: "Consulta de CEP aguardando a janela global de 10 por minuto do CNPJá." }).eq("id", lead.id);
    await adiarTarefa(tarefa.id, geo.esperarSeg, false);
    return;
  }
  const uf = geo?.state || (lead.uf && /^[A-Z]{2}$/.test(lead.uf) ? lead.uf : null);
  const nicho = (lead.buscas as unknown as { nicho: string | null } | null)?.nicho ?? null;
  const cnae = await cnaeDoNicho(nicho);
  const q = new URLSearchParams({ "names.in": termos, "status.id.in": "2", limit: "10" });
  if (geo) q.set("address.municipality.in", String(geo.municipality));
  if (uf) q.set("address.state.in", uf);
  if (cnae) q.set("activities.id.in", cnae);
  const chave = `office:${q.toString()}`;

  const { data: emCache } = await db.from("cnpja_cache").select("resposta").eq("chave", chave).maybeSingle();
  let registros: CandidatoCnpja[];
  if (emCache) registros = (emCache.resposta as unknown as { records: CandidatoCnpja[] }).records ?? [];
  else {
    // Reserva uma única tentativa paga por lead antes da chamada para evitar duplicidade concorrente.
    const { data: reservados } = await db.from("leads").update({ cnpja_buscado: true, cnpj_status: "consultando" })
      .eq(lead.place_id ? "place_id" : "id", lead.place_id ?? lead.id).eq("cnpja_buscado", false).is("cnpj", null).select("id");
    if (!reservados?.some((r) => r.id === lead.id)) {
      await adiarTarefa(tarefa.id, 60, false);
      return;
    }
    let req: Awaited<ReturnType<typeof requisitarCnpja>>;
    try { req = await requisitarCnpja(`${CNPJA}/office?${q}`); }
    catch {
      if (await cancelarSeBuscaEncerrada(tarefa)) return;
      await fim({ cnpja_buscado: true, cnpj_status: "erro", cnpj_motivo: "Não foi possível concluir a busca de nome no CNPJá. O lead segue com os telefones já encontrados." });
      return;
    }
    if (await cancelarSeBuscaEncerrada(tarefa)) return;
    if ("esperarSeg" in req) {
      if (req.tipo === "janela") {
        const atualizacao = { cnpja_buscado: false, cnpj_status: "na_fila", cnpj_motivo: "Consulta aguardando a janela global de 10 por minuto do CNPJá." };
        if (lead.place_id) await db.from("leads").update(atualizacao).eq("place_id", lead.place_id).eq("cnpj_status", "consultando").is("cnpj", null);
        else await db.from("leads").update(atualizacao).eq("id", lead.id);
        await adiarTarefa(tarefa.id, req.esperarSeg, false);
      } else if (tarefa.tentativas >= 3) {
        await fim({ cnpja_buscado: true, cnpj_status: "erro", cnpj_motivo: "O CNPJá repetiu o limite três vezes; pausamos novas tentativas para evitar cobrança duplicada." });
      } else {
        const atualizacao = { cnpja_buscado: false, cnpj_status: "na_fila", cnpj_motivo: `CNPJá no limite temporário. Nova tentativa em ${req.esperarSeg} segundos.` };
        if (lead.place_id) await db.from("leads").update(atualizacao).eq("place_id", lead.place_id).eq("cnpj_status", "consultando").is("cnpj", null);
        else await db.from("leads").update(atualizacao).eq("id", lead.id);
        await adiarTarefa(tarefa.id, req.esperarSeg, true);
      }
      return;
    }
    const r = req.response;
    if (!r.ok) return fim({ cnpja_buscado: true, cnpj_status: "erro", cnpj_motivo: `A busca por nome no CNPJá falhou (HTTP ${r.status}).` });
    let resposta: unknown;
    try { resposta = await r.json(); }
    catch {
      await fim({ cnpja_buscado: true, cnpj_status: "erro", cnpj_motivo: "O CNPJá retornou uma resposta que não pôde ser lida." });
      return;
    }
    const encontrados = extrairCandidatosCnpja(resposta);
    if (!encontrados) return fim({ cnpja_buscado: true, cnpj_status: "erro", cnpj_motivo: "O CNPJá retornou um formato de resposta inesperado." });
    registros = encontrados;
    await descontarSaldoCnpja(registros.length);
    await db.from("cnpja_cache").upsert({ chave, resposta: { records: registros } as unknown as Json });
  }

  const { data: tels } = await db.from("telefones").select("numero").eq("lead_id", lead.id);
  const d = decidir({ nome: lead.nome, cep: lead.cep, logradouro: lead.logradouro, endereco: lead.endereco, telefones: (tels ?? []).map((t) => t.numero) }, registros, cnae);
  const candidatos = d.candidatos.slice(0, 10) as unknown as Json;
  const aviso = cnae ? null : "Nicho sem atividade (CNAE) cadastrada: a busca por nome fica menos precisa.";
  if (d.tipo === "confirmado") {
    await fim({ cnpja_buscado: true, cnpj_candidatos: candidatos, cnpj: d.escolhido.cnpj, cnpj_origem: "cnpja", cnpj_fonte_url: `https://cnpja.com/office/${d.escolhido.cnpj}`, cnpj_status: "na_fila", cnpj_motivo: `Confirmado por: ${d.escolhido.motivos.join(", ")}` });
    await enfileirar(tarefa.user_id, lead.id, "cnpj");
    await atualizarEstadoLead(lead.id);
    return;
  }
  if (d.tipo === "provavel") return fim({ cnpja_buscado: true, cnpj_candidatos: candidatos, cnpj_status: "provavel", cnpj_motivo: aviso });
  if (d.tipo === "varios") return fim({ cnpja_buscado: true, cnpj_candidatos: candidatos, cnpj_status: "varios", cnpj_motivo: aviso });
  await fim({ cnpja_buscado: true, cnpj_candidatos: [], cnpj_status: "nao_encontrado", cnpj_motivo: aviso });
  if (cfg.buscaCnpjGoogle) { await enfileirar(tarefa.user_id, lead.id, "busca_cnpj"); await atualizarEstadoLead(lead.id); }
}
