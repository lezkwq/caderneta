import { describe, expect, it } from "vitest";
import { acumularMetricasRodadaMaps, planejarProximaRodadaMaps, selecionarResultadosMaps } from "@/lib/maps-results";

describe("Deduplicação e limite dos resultados do Maps", () => {
  it("deduplica por placeId e usa nome normalizado mais telefone quando falta placeId", () => {
    const itens = [
      { title: "Clínica Sorriso", placeId: "maps-1", phone: "(48) 3333-1111" },
      { title: "Clinica Sorriso", placeId: "maps-1", phone: "(48) 3333-1111" },
      { title: "  Clínica   Sorriso ", phone: "(48) 3333-2222" },
      { title: "Clinica Sorriso", phone: "+55 48 3333-2222" },
    ];
    const r = selecionarResultadosMaps(itens, 20);
    expect(r.coletadas).toBe(4);
    expect(r.unicas).toBe(2);
    expect(r.mantidas).toBe(2);
  });

  it("filtra antes de aplicar o máximo solicitado", () => {
    const itens = Array.from({ length: 8 }, (_, i) => ({ title: `Empresa ${i}`, placeId: `maps-${i}` }));
    const r = selecionarResultadosMaps(itens, 3, (item) => Number(item.title?.split(" ")[1]) % 2 === 0);
    expect(r.coletadas).toBe(8);
    expect(r.unicas).toBe(8);
    expect(r.mantidas).toBe(3);
    expect(r.itens.map((item) => item.title)).toEqual(["Empresa 1", "Empresa 3", "Empresa 5"]);
  });

  it("amplia a coleta em rodadas até completar ou atingir cinco vezes o pedido", () => {
    expect(planejarProximaRodadaMaps({ quantidade: 20, limiteAtual: 20, coletadasNaRodada: 20, mantidas: 6 })).toBe(40);
    expect(planejarProximaRodadaMaps({ quantidade: 20, limiteAtual: 40, coletadasNaRodada: 40, mantidas: 20 })).toBeNull();
    expect(planejarProximaRodadaMaps({ quantidade: 20, limiteAtual: 80, coletadasNaRodada: 80, mantidas: 8 })).toBe(100);
    expect(planejarProximaRodadaMaps({ quantidade: 20, limiteAtual: 100, coletadasNaRodada: 100, mantidas: 8 })).toBeNull();
    expect(planejarProximaRodadaMaps({ quantidade: 20, limiteAtual: 40, coletadasNaRodada: 31, mantidas: 8 })).toBeNull();
  });

  it("acumula coletas por rodada sem contar duas vezes uma resposta repetida", () => {
    const primeira = acumularMetricasRodadaMaps(null, { coletadas: 20, unicas: 18, mantidas: 12, quantidade: 20, parcial: false, rodadaId: "run-1" });
    expect(acumularMetricasRodadaMaps(primeira, { coletadas: 20, unicas: 18, mantidas: 12, quantidade: 20, parcial: false, rodadaId: "run-1" })).toEqual(primeira);
    expect(acumularMetricasRodadaMaps(primeira, { coletadas: 20, unicas: 19, mantidas: 20, quantidade: 20, parcial: false, rodadaId: "run-2" })).toMatchObject({ coletadas: 40, unicas: 37, mantidas: 20, rodadas: ["run-1", "run-2"] });
  });
});
