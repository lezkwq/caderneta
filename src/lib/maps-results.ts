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

/** Aumenta o teto em uma quantidade pedida por rodada, até cinco vezes o alvo. */
export function planejarProximaRodadaMaps(args: {
  quantidade: number;
  limiteAtual: number;
  coletadasNaRodada: number;
  mantidas: number;
}): number | null {
  const quantidade = Math.max(0, Math.floor(args.quantidade));
  const teto = quantidade * 5;
  if (!quantidade || args.mantidas >= quantidade || args.coletadasNaRodada < args.limiteAtual || args.limiteAtual >= teto) return null;
  return Math.min(teto, args.limiteAtual + quantidade);
}

export type MetricasRodadasMaps = { coletadas: number; unicas: number; mantidas: number; quantidade?: number; parcial?: boolean; rodadas?: string[] };

/** Acumula o que foi coletado em cada rodada sem duplicar respostas repetidas do worker. */
export function acumularMetricasRodadaMaps(
  anterior: MetricasRodadasMaps | null,
  rodada: MetricasRodadasMaps & { rodadaId?: string | null },
): MetricasRodadasMaps {
  const id = rodada.rodadaId;
  if (id && anterior?.rodadas?.includes(id)) return anterior;
  const acumuladas: MetricasRodadasMaps = {
    coletadas: (anterior?.coletadas ?? 0) + rodada.coletadas,
    unicas: (anterior?.unicas ?? 0) + rodada.unicas,
    mantidas: rodada.mantidas,
  };
  if (rodada.quantidade !== undefined) acumuladas.quantidade = rodada.quantidade;
  if (rodada.parcial !== undefined) acumuladas.parcial = rodada.parcial;
  if (id) acumuladas.rodadas = [...(anterior?.rodadas ?? []), id];
  else if (anterior?.rodadas) acumuladas.rodadas = anterior.rodadas;
  return acumuladas;
}
