import { promises as dns } from "node:dns";
import { isIP } from "node:net";
import { ipPrivadoLocalOuReservado } from "@/lib/network-guards";

// Busca segura de páginas: valida IPs literais e DNS antes de cada acesso/redirecionamento.
const MAX_BYTES = 1024 * 1024;

export function urlPermitida(raw: string): URL | null {
  let u: URL;
  try { u = new URL(raw); } catch { return null; }
  if (u.protocol !== "http:" && u.protocol !== "https:") return null;
  if (u.username || u.password) return null;
  const h = u.hostname.toLowerCase();
  if (!h.includes(".") || h === "localhost" || /\.(localhost|local|internal|lan|home|arpa)$/.test(h)) return null;
  if (h.startsWith("[") || h.includes(":")) return null; // IPv6 literal
  if (/^\d+$/.test(h) || /^0x/i.test(h)) return null;
  if (isIP(h) === 4 && ipPrivadoLocalOuReservado(h)) return null;
  return u;
}

async function hostnamePublico(hostname: string): Promise<boolean> {
  if (isIP(hostname)) return !ipPrivadoLocalOuReservado(hostname);
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    const resolucao = Promise.allSettled([dns.resolve4(hostname), dns.resolve6(hostname)]);
    const resultados = await Promise.race([
      resolucao,
      new Promise<never>((_, reject) => { timer = setTimeout(() => reject(new Error("DNS timeout")), 5000); }),
    ]);
    const ips: string[] = [];
    for (const resultado of resultados) {
      if (resultado.status === "fulfilled") ips.push(...resultado.value);
      else {
        const codigo = (resultado.reason as NodeJS.ErrnoException | undefined)?.code;
        if (codigo !== "ENODATA") return false;
      }
    }
    return ips.length > 0 && ips.every((ip) => !ipPrivadoLocalOuReservado(ip));
  } catch { return false; }
  finally { if (timer) clearTimeout(timer); }
}

export async function baixarPagina(raw: string): Promise<{ url: string; html: string } | null> {
  let atual = urlPermitida(raw);
  for (let salto = 0; atual && salto < 4; salto++) {
    if (!await hostnamePublico(atual.hostname)) return null;
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 8000);
    try {
      const res = await fetch(atual.toString(), { redirect: "manual", signal: ctrl.signal, headers: { "user-agent": "Mozilla/5.0 (compatible; Caderneta/1.0)", accept: "text/html" } });
      if (res.status >= 300 && res.status < 400) {
        const loc = res.headers.get("location");
        atual = loc ? urlPermitida(new URL(loc, atual).toString()) : null;
        continue;
      }
      if (!res.ok || !res.body) return null;
      const ct = res.headers.get("content-type") ?? "";
      if (ct && !ct.includes("html") && !ct.includes("text")) return null;
      const reader = res.body.getReader();
      const partes: Uint8Array[] = [];
      let total = 0;
      while (total < MAX_BYTES) {
        const { done, value } = await reader.read();
        if (done || !value) break;
        partes.push(value);
        total += value.byteLength;
      }
      await reader.cancel().catch(() => {});
      const buf = new Uint8Array(Math.min(total, MAX_BYTES));
      let off = 0;
      for (const p of partes) { const s = p.subarray(0, Math.max(0, buf.length - off)); buf.set(s, off); off += s.length; if (off >= buf.length) break; }
      return { url: atual.toString(), html: new TextDecoder("utf-8", { fatal: false }).decode(buf) };
    } catch {
      return null;
    } finally {
      clearTimeout(t);
    }
  }
  return null;
}

export interface AchadoSite {
  cnpjs: { cnpj: string; url: string }[];
  telefones: { bruto: string; url: string; whatsapp: boolean; contexto: string }[];
}

export function analisarHtml(html: string, url: string, extrairCnpjs: (t: string) => string[]): AchadoSite {
  const achado: AchadoSite = { cnpjs: [], telefones: [] };
  for (const m of html.matchAll(/href\s*=\s*["']\s*tel:([^"']+)["']/gi)) achado.telefones.push({ bruto: decodeURIComponent(m[1] ?? ""), url, whatsapp: false, contexto: "" });
  for (const m of html.matchAll(/(?:wa\.me\/|api\.whatsapp\.com\/send\/?\?phone=|whatsapp:\/\/send\?phone=)(\+?\d{10,15})/gi)) achado.telefones.push({ bruto: m[1] ?? "", url, whatsapp: true, contexto: "" });
  const texto = html.replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>/gi, " ").replace(/<[^>]+>/g, " ").replace(/&nbsp;/g, " ").replace(/\s+/g, " ");
  for (const c of extrairCnpjs(texto)) achado.cnpjs.push({ cnpj: c, url });
  for (const m of texto.matchAll(/(?:\+?55\s?)?\(?\b\d{2}\)?[\s.-]?9?\d{4}[\s.-]?\d{4}\b/g)) {
    const i = m.index ?? 0;
    achado.telefones.push({ bruto: m[0], url, whatsapp: false, contexto: texto.slice(Math.max(0, i - 150), i + m[0].length + 150) });
  }
  // contexto para tel:/wa.me — procura o número no texto
  return achado;
}
