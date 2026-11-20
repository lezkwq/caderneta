// Score de confiança 0–100 de um telefone, sempre com motivos legíveis.

export type FonteTipo = "maps" | "site" | "whatsapp_site" | "receita" | "manual";
export interface Fonte { tipo: FonteTipo; url?: string | null; contexto?: string | null }

export interface EntradaScore {
  tipo: "celular" | "fixo";
  fontes: Fonte[];
  dono?: string | null;
  /** Outras empresas (CNPJs) do usuário onde o mesmo número aparece. */
  outrasEmpresas?: { cnpj: string; pessoas: string[] }[];
  /** Pessoas (sócios + campo Pessoa) desta empresa. */
  pessoasDaEmpresa?: string[];
}

export interface Motivo { pontos: number; texto: string }

const norm = (s: string) => s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/\s+/g, " ").trim();

export function donoNoContexto(dono: string, contexto: string): boolean {
  const partes = norm(dono).split(" ").filter((p) => p.length > 2);
  if (partes.length === 0) return false;
  const ctx = norm(contexto);
  const primeiro = partes[0] ?? "";
  const ultimo = partes[partes.length - 1] ?? "";
  return ctx.includes(primeiro) && (partes.length === 1 || ctx.includes(ultimo));
}

export function calcularScore(e: EntradaScore): { score: number; motivos: Motivo[] } {
  const motivos: Motivo[] = [{ pontos: 20, texto: "Número encontrado" }];
  const tipos = new Set(e.fontes.map((f) => (f.tipo === "whatsapp_site" ? "site" : f.tipo)));
  const independentes = [...tipos].filter((t) => t !== "receita");
  const temReceita = tipos.has("receita");

  if (tipos.size >= 2) motivos.push({ pontos: 25, texto: `Aparece em ${tipos.size} fontes independentes` });
  if (e.tipo === "celular") motivos.push({ pontos: 20, texto: "É celular" });
  if (e.fontes.some((f) => f.tipo === "whatsapp_site")) motivos.push({ pontos: 20, texto: "Aparece como link de WhatsApp no site" });
  if (e.dono && e.fontes.some((f) => f.contexto && donoNoContexto(e.dono as string, f.contexto)))
    motivos.push({ pontos: 15, texto: "Aparece junto ao nome do dono" });
  if (temReceita && independentes.length > 0) motivos.push({ pontos: 10, texto: "Confere com o cadastro da Receita" });
  if (temReceita && independentes.length === 0) motivos.push({ pontos: -10, texto: "Só no cadastro da Receita (costuma ser do contador)" });

  const outras = e.outrasEmpresas ?? [];
  const meus = new Set((e.pessoasDaEmpresa ?? []).map(norm).filter(Boolean));
  if (outras.length + 1 >= 3) {
    const semComum = outras.filter((o) => !o.pessoas.map(norm).some((p) => meus.has(p)));
    if (semComum.length >= 2) motivos.push({ pontos: -35, texto: `Mesmo número em ${outras.length + 1} empresas sem sócio em comum (provável contador)` });
  }
  if (outras.some((o) => o.pessoas.map(norm).some((p) => meus.has(p))))
    motivos.push({ pontos: 10, texto: "Mesmo número em outra empresa do mesmo dono" });

  const total = motivos.reduce((a, m) => a + m.pontos, 0);
  return { score: Math.max(0, Math.min(100, total)), motivos };
}

export type Faixa = "alta" | "media" | "baixa";
export function faixaScore(score: number): Faixa {
  if (score >= 70) return "alta";
  if (score >= 40) return "media";
  return "baixa";
}
