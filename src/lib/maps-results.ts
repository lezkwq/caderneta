import { normalizarTelefone, normalizarTexto, soDigitos } from "@/lib/br";

export interface ResultadoMapaBase {
  title?: string;
  placeId?: string;
  phone?: string;
  phoneUnformatted?: string;
}

export interface ResultadoMapsSelecionado<T> {
  coletadas: number;
  unicas: number;
  mantidas: number;
  itens: T[];
}

export function mapsResultKey(item: ResultadoMapaBase): string | null {
  const placeId = item.placeId?.trim();
  if (placeId) return `place:${placeId}`;
  const nome = normalizarTexto(item.title ?? "");
  const bruto = item.phoneUnformatted ?? item.phone ?? "";
  const telefone = normalizarTelefone(bruto)?.e164 ?? soDigitos(bruto);
  return nome && telefone ? `nome-telefone:${nome}|${telefone}` : null;
}

/** Remove repetições pelo identificador do Maps; sem ele, usa nome normalizado e telefone. */
export function deduplicarResultadosMaps<T extends ResultadoMapaBase>(itens: T[]): T[] {
  const vistos = new Set<string>();
  return itens.filter((item) => {
    const chave = mapsResultKey(item);
    if (!chave) return true;
    if (vistos.has(chave)) return false;
    vistos.add(chave);
    return true;
  });
}

/** Deduplica, filtra e só então aplica a quantidade pedida. */
export function selecionarResultadosMaps<T extends ResultadoMapaBase>(
  itens: T[], quantidade: number, excluir: (item: T) => boolean = () => false,
): ResultadoMapsSelecionado<T> {
  const unicos = deduplicarResultadosMaps(itens);
  const itensFinais = unicos.filter((item) => !excluir(item)).slice(0, Math.max(0, quantidade));
  return { coletadas: itens.length, unicas: unicos.length, mantidas: itensFinais.length, itens: itensFinais };
}
