import { describe, expect, it } from "vitest";
import { calcularScore } from "@/lib/score";
import { agruparPorPessoa, tarefasIniciaisManual } from "@/lib/manual-utils";

describe("Empresas conhecidas manualmente", () => {
  it("agrupa empresas pelo campo Pessoa e mantém as sem agrupamento separadas", () => {
    const grupos = agruparPorPessoa([
      { nome: "Clínica A", pessoa: "Ana Silva" },
      { nome: "Clínica B", pessoa: " ana silva " },
      { nome: "Loja C", pessoa: null },
    ]);
    expect(grupos).toEqual([
      ["Ana Silva", [{ nome: "Clínica A", pessoa: "Ana Silva" }, { nome: "Clínica B", pessoa: " ana silva " }]],
      ["Sem pessoa", [{ nome: "Loja C", pessoa: null }]],
    ]);
  });

  it("CNPJ digitado enfileira validação cadastral sem busca paga CNPJá", () => {
    expect(tarefasIniciaisManual({ cnpj: "11222333000181", site: "https://empresa.com.br" })).toEqual(["cnpj", "site"]);
    expect(tarefasIniciaisManual({ cnpj: "11222333000181" })).not.toContain("cnpja");
  });

  it("a mesma Pessoa aumenta a confiança e não é penalizada como contador", () => {
    const resultado = calcularScore({
      tipo: "celular", fontes: [{ tipo: "maps" }],
      pessoasDaEmpresa: ["Ana Silva"],
      outrasEmpresas: [
        { cnpj: "11111111000111", pessoas: ["Ana Silva"] },
        { cnpj: "22222222000122", pessoas: ["Ana Silva"] },
      ],
    });
    expect(resultado.motivos.map((motivo) => motivo.texto)).toContain("Mesmo número em outra empresa do mesmo dono");
    expect(resultado.motivos.some((motivo) => motivo.texto.includes("provável contador"))).toBe(false);
  });
});
