// Funções puras de dados brasileiros (CNPJ, telefone, nomes). Seguras para cliente e servidor.

export function soDigitos(s: string): string {
  return s.replace(/\D/g, "");
}

export function cnpjValido(entrada: string): boolean {
  const c = soDigitos(entrada);
  if (c.length !== 14 || /^(\d)\1{13}$/.test(c)) return false;
  const calc = (base: string, pesos: number[]) => {
    const soma = base.split("").reduce((acc, d, i) => acc + Number(d) * (pesos[i] ?? 0), 0);
    const r = soma % 11;
    return r < 2 ? 0 : 11 - r;
  };
  const p1 = [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];
  const p2 = [6, ...p1];
  const d1 = calc(c.slice(0, 12), p1);
  const d2 = calc(c.slice(0, 12) + d1, p2);
  return c.endsWith(`${d1}${d2}`);
}

export function formatarCnpj(c: string): string {
  const d = soDigitos(c);
  return d.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, "$1.$2.$3/$4-$5");
}

/** Extrai CNPJs válidos (dígitos verificadores conferidos) de um texto. */
export function extrairCnpjs(texto: string): string[] {
  const re = /\b\d{2}\.?\d{3}\.?\d{3}\/?\d{4}-?\d{2}\b/g;
  const out = new Set<string>();
  for (const m of texto.match(re) ?? []) {
    const d = soDigitos(m);
    if (cnpjValido(d)) out.add(d);
  }
  return [...out];
}

export type TipoTelefone = "celular" | "fixo";
export interface Telefone { e164: string; ddd: string; numero: string; tipo: TipoTelefone }

/**
 * Normaliza para +55 com DDD. Celular = 9 dígitos após o DDD começando com 9.
 * Números de 8 dígitos (mesmo os antigos sem o 9) são tratados como fixo.
 */
export function normalizarTelefone(entrada: string): Telefone | null {
  let d = soDigitos(entrada);
  if (d.startsWith("0055")) d = d.slice(4);
  else if (d.length >= 12 && d.startsWith("55")) d = d.slice(2);
  if (d.startsWith("0")) {
    d = d.replace(/^0+/, "");
    if (d.length === 12 || d.length === 13) d = d.slice(2); // código de operadora (0xx41...)
  }
  if (d.length !== 10 && d.length !== 11) return null;
  const ddd = d.slice(0, 2);
  if (Number(ddd) < 11 || ddd.includes("0")) return null;
  const numero = d.slice(2);
  if (numero.length === 11 - 2 && !numero.startsWith("9")) return null;
  if (numero.length === 8 && /^[01]/.test(numero)) return null;
  const tipo: TipoTelefone = numero.length === 9 ? "celular" : "fixo";
  return { e164: `+55${ddd}${numero}`, ddd, numero, tipo };
}

export function formatarTelefone(e164: string): string {
  const d = e164.replace(/^\+55/, "");
  const ddd = d.slice(0, 2);
  const n = d.slice(2);
  return n.length === 9 ? `(${ddd}) ${n.slice(0, 5)}-${n.slice(5)}` : `(${ddd}) ${n.slice(0, 4)}-${n.slice(4)}`;
}

/** Remove o CPF (11 dígitos) que vem no fim da razão social de MEI. Nunca devolve o CPF. */
export function nomeDonoMei(razaoSocial: string): string {
  return razaoSocial
    .replace(/[\s.-]*\d{3}\.?\d{3}\.?\d{3}-?\d{2}\s*$/, "")
    .replace(/\s+\d+\s*$/, "")
    .trim();
}

export function normalizarTexto(s: string | null | undefined): string {
  return (s ?? "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9 ]/g, " ").replace(/\s+/g, " ").trim();
}

export function linkWhatsApp(e164: string, mensagem: string): string {
  return `https://wa.me/${e164.replace(/\D/g, "")}?text=${encodeURIComponent(mensagem)}`;
}

export function aplicarModelo(modelo: string, empresa: string): string {
  return modelo.replace(/\{empresa\}/g, empresa);
}
