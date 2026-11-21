import { describe, expect, it } from "vitest";
import { decidir, ehSiteProprio, limparNome } from "@/lib/candidatos";

describe("Limpeza do nome", () => {
  it("Odontologia Premier - Dentista em Blumenau vira premier", () => expect(limparNome("Odontologia Premier - Dentista em Blumenau", "Blumenau")).toBe("premier"));
  it("tira termos genéricos e acentos", () => expect(limparNome("Clínica Odontológica Mordent Ltda")).toBe("mordent"));
});

describe("Decisão do candidato (casos reais)", () => {
  it("(a) Mordent com telefone do cadastro igual ao do Maps: confirmado", () => {
    const r = decidir(
      { nome: "Mordent Odontologia", telefones: ["+554733381916"] },
      [{ taxId: "10898932000157", alias: "Mordent", company: { name: "MORDENT CLINICA ODONTOLOGICA LTDA" }, phones: [{ area: "47", number: "33381916" }], mainActivity: { id: 8630504 } }],
      "8630504",
    );
    expect(r.tipo).toBe("confirmado");
    if (r.tipo === "confirmado") expect(r.escolhido.cnpj).toBe("10898932000157");
  });

  it("(b) Cia do Sorriso com telefone do cadastro diferente: provável, confirmar", () => {
    const r = decidir(
      { nome: "Cia do Sorriso", telefones: ["+5547999990000"] },
      [{ taxId: "08644836000130", alias: "Cia do Sorriso", company: { name: "CIA DO SORRISO ODONTOLOGIA LTDA" }, phones: [{ area: "47", number: "30351234" }], mainActivity: { id: 8630504 } }],
      "8630504",
    );
    expect(r.tipo).toBe("provavel");
  });

  it("(c) Premier em Blumenau: concessionária (CNAE 4511-1/01) é descartada pelo filtro de atividade", () => {
    const r = decidir(
      { nome: "Odontologia Premier - Dentista em Blumenau", telefones: ["+554730375111"] },
      [{ taxId: "07444289000187", company: { name: "PREMIER VEICULOS S/A" }, phones: [{ area: "47", number: "30375111" }], mainActivity: { id: 4511101 }, sideActivities: [{ id: 4511102 }] }],
      "8630504",
    );
    expect(r.tipo).toBe("nenhum");
  });

  it("vários candidatos só pelo nome: pede para escolher", () => {
    const cand = (id: string) => ({ taxId: id, alias: "Premier", mainActivity: { id: 8630504 } });
    expect(decidir({ nome: "Premier", telefones: [] }, [cand("1"), cand("2")], "8630504").tipo).toBe("varios");
  });
});

describe("Site próprio", () => {
  it("Instagram não é site próprio", () => expect(ehSiteProprio("https://instagram.com/x")).toBe(false));
  it("Linktree não é site próprio", () => expect(ehSiteProprio("https://linktr.ee/x")).toBe(false));
  it("domínio da empresa é site próprio", () => expect(ehSiteProprio("https://mordent.com.br")).toBe(true));
});
