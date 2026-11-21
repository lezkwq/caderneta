import { describe, expect, it } from "vitest";
import { selecionarResultadosMaps } from "@/lib/maps-results";

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
});
