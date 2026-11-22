// Busca de CNPJ por nome: limpeza do nome do Maps e decisão entre candidatos do CNPJá.
import { normalizarTelefone, normalizarTexto, soDigitos } from "@/lib/br";

const GENERICOS = new Set([
  "dentista", "dentistas", "clinica", "clinicas", "odontologia", "odontologica", "odontologico", "odonto", "consultorio",
  "ltda", "me", "epp", "eireli", "sa", "s", "a", "e", "de", "da", "do", "das", "dos", "em", "o", "the", "dr", "dra",
  "centro", "especializada", "especializado", "integrada", "integrado", "sorriso_",
]);

/** "Odontologia Premier - Dentista em Blumenau" → "premier". Devolve 1 ou 2 termos distintivos, separados por espaço. */
export function limparNome(nome: string, cidade?: string | null): string {
  let base = nome.split(/\s[-–—|:]\s|\s\|\s|\s\/\s|\(/)[0] ?? nome;
  base = normalizarTexto(base);
  const cid = normalizarTexto(cidade);
  if (cid) base = base.replace(new RegExp(`\\b(em|de|no|na)?\\s*${cid}\\b`, "g"), " ");
  base = base.replace(/\bem [a-z ]+$/, " ");
  const termos = base.split(" ").filter((t) => t.length > 1 && !GENERICOS.has(t) && !/^\d+$/.test(t));
  return termos.slice(0, 2).join(" ");
}

export interface CandidatoCnpja {
  taxId: string;
  alias?: string | null;
  company?: { name?: string | null } | null;
  address?: { zip?: string | null; street?: string | null; number?: string | null; city?: string | null; state?: string | null } | null;
  phones?: { area?: string | null; number?: string | null }[] | null;
  mainActivity?: { id?: number | null } | null;
  sideActivities?: { id?: number | null }[] | null;
  status?: { id?: number | null; text?: string | null } | null;
}

/** A pesquisa oficial pode vir como uma página de estabelecimentos. */
export function extrairCandidatosCnpja(resposta: unknown): CandidatoCnpja[] | null {
  const raiz = Array.isArray(resposta)
    ? resposta
    : resposta && typeof resposta === "object"
      ? ((resposta as { records?: unknown; data?: unknown; items?: unknown }).records ??
        (resposta as { data?: unknown }).data ??
        (resposta as { items?: unknown }).items)
      : null;
  if (!Array.isArray(raiz)) return null;
  return raiz.filter((item): item is CandidatoCnpja => {
    if (!item || typeof item !== "object") return false;
    const c = item as { taxId?: unknown; address?: unknown; phones?: unknown };
    return typeof c.taxId === "string" && /^\d{14}$/.test(c.taxId) &&
      (c.address === undefined || c.address === null || typeof c.address === "object") &&
      (c.phones === undefined || c.phones === null || Array.isArray(c.phones));
  });
}

export interface LeadParaComparar {
  nome: string;
  cep?: string | null;
  logradouro?: string | null;
  endereco?: string | null;
  telefones: string[]; // E.164 dos telefones do Maps/site
}

export interface Avaliacao {
  cnpj: string; nome: string; endereco: string; telefones: string[];
  pontos: number; bateTelefone: boolean; bateEndereco: boolean; bateNome: boolean; motivos: string[];
}

export type Decisao =
  | { tipo: "confirmado"; escolhido: Avaliacao; candidatos: Avaliacao[] }
  | { tipo: "provavel"; escolhido: Avaliacao; candidatos: Avaliacao[] }
  | { tipo: "varios"; candidatos: Avaliacao[] }
  | { tipo: "nenhum"; candidatos: Avaliacao[] };

/** Escolhe um resultado antigo já pontuado, sem repetir a chamada paga à CNPJá. */
export function desempatarCandidatosSalvos(candidatos: Avaliacao[]): Avaliacao | null {
  const unicos = new Map<string, Avaliacao>();
  for (const c of candidatos) if (!unicos.has(c.cnpj)) unicos.set(c.cnpj, c);
  const fortes = [...unicos.values()].filter((c) => c.bateNome && (c.bateTelefone || c.bateEndereco));
  if (fortes.length === 1) return fortes[0] ?? null;
  if (fortes.length < 2 || new Set(fortes.map((c) => c.cnpj.slice(0, 8))).size !== 1) return null;
  const melhor = Math.max(...fortes.map((c) => c.pontos));
  const melhores = fortes.filter((c) => c.pontos === melhor);
  return melhores.length === 1 ? melhores[0] ?? null : null;
}

export function cnaeConfere(c: CandidatoCnpja, cnae: string | null): boolean {
  if (c.status?.id !== undefined && c.status.id !== null && c.status.id !== 2) return false;
  if (!cnae) return true;
  const alvo = Number(soDigitos(cnae));
  const ids = [c.mainActivity?.id, ...(c.sideActivities ?? []).map((s) => s.id)].filter((x): x is number => typeof x === "number");
  return ids.includes(alvo);
}

function numeroDoEndereco(s: string): string | null {
  const m = s.match(/,\s*(\d[\d.]*)/);
  return m?.[1] ? m[1].replace(/\./g, "") : null;
}

export function avaliar(lead: LeadParaComparar, c: CandidatoCnpja): Avaliacao {
  const motivos: string[] = [];
  const nomes = normalizarTexto(`${c.alias ?? ""} ${c.company?.name ?? ""}`);
  const termos = limparNome(lead.nome).split(" ").filter(Boolean);
  const bateNome = termos.length > 0 && termos.every((t) => nomes.includes(t));
  if (bateNome) motivos.push("Nome parecido");

  const cepLead = soDigitos(lead.cep ?? "");
  const cepCand = soDigitos(c.address?.zip ?? "");
  const endLead = normalizarTexto(`${lead.logradouro ?? ""} ${lead.endereco ?? ""}`);
  const ruaCand = normalizarTexto(c.address?.street).split(" ").filter((p) => p.length > 3 && !["rua", "avenida", "travessa", "rodovia"].includes(p));
  const numLead = numeroDoEndereco(`${lead.logradouro ?? ""}, ${lead.endereco ?? ""}`) ?? numeroDoEndereco(lead.endereco ?? "");
  const numCand = soDigitos(c.address?.number ?? "");
  const mesmoCep = cepLead.length === 8 && cepLead === cepCand;
  const mesmaRuaNumero = ruaCand.length > 0 && ruaCand.every((p) => endLead.includes(p)) && !!numLead && numLead === numCand;
  const bateEndereco = mesmoCep || mesmaRuaNumero;
  if (mesmoCep) motivos.push("Mesmo CEP");
  if (mesmaRuaNumero) motivos.push("Mesma rua e número");

  const telsCand = (c.phones ?? []).map((p) => normalizarTelefone(`${p.area ?? ""}${p.number ?? ""}`)?.e164).filter((x): x is string => !!x);
  const bateTelefone = telsCand.some((t) => lead.telefones.includes(t));
  if (bateTelefone) motivos.push("Telefone do cadastro igual ao do Maps/site");

  const pontos = (bateNome ? 20 : 0) + (bateEndereco ? 35 : 0) + (bateTelefone ? 50 : 0);
  const a = c.address;
  return {
    cnpj: soDigitos(c.taxId), nome: c.alias || c.company?.name || "", pontos, bateTelefone, bateEndereco, bateNome, motivos,
    endereco: [a?.street, a?.number, a?.city, a?.state, a?.zip].filter(Boolean).join(", "), telefones: telsCand,
  };
}

/** Nunca aceita o primeiro: só confirma com telefone ou endereço batendo e sem empate. */
export function decidir(lead: LeadParaComparar, registros: CandidatoCnpja[], cnae: string | null): Decisao {
  const unicos = new Map<string, CandidatoCnpja>();
  for (const r of registros) {
    if (!cnaeConfere(r, cnae)) continue;
    const cnpj = soDigitos(r.taxId);
    if (!unicos.has(cnpj)) unicos.set(cnpj, r);
  }
  const candidatos = [...unicos.values()].map((r) => avaliar(lead, r)).sort((x, y) => y.pontos - x.pontos);
  if (candidatos.length === 0) return { tipo: "nenhum", candidatos };
  const fortes = candidatos.filter((c) => c.bateNome && (c.bateTelefone || c.bateEndereco));
  const escolhido = desempatarCandidatosSalvos(fortes);
  if (escolhido) return { tipo: "confirmado", escolhido, candidatos };
  if (fortes.length > 0) return { tipo: "varios", candidatos };
  if (candidatos.length === 1) return { tipo: "provavel", escolhido: candidatos[0] as Avaliacao, candidatos };
  return { tipo: "varios", candidatos };
}

/** Site próprio exclui Instagram, Facebook, Linktree e links de WhatsApp. */
export function ehSiteProprio(url: string | null | undefined): boolean {
  if (!url) return false;
  let h = "";
  try { h = new URL(url).hostname.toLowerCase(); } catch { return false; }
  return !/(^|\.)(instagram\.com|facebook\.com|fb\.com|fb\.me|linktr\.ee|wa\.me|whatsapp\.com|api\.whatsapp\.com|linkbio|bio\.link|beacons\.ai)$/.test(h);
}
