import { describe, expect, it } from "vitest";
import { decidir, desempatarCandidatosSalvos, ehSiteProprio, extrairCandidatosCnpja, limparNome } from "@/lib/candidatos";

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

  it("desempata matriz e filial da mesma raiz pelo telefone do Maps", () => {
    const r = decidir(
      { nome: "Mordent Odontologia", cep: "88000000", logradouro: "Rua das Flores", endereco: "123", telefones: ["+554733381916"] },
      [
        { taxId: "12345678000190", alias: "Mordent", company: { name: "MORDENT CLINICA ODONTOLOGICA LTDA" }, address: { street: "Rua da Matriz", number: "10", zip: "88000111" }, phones: [{ area: "47", number: "33381916" }], mainActivity: { id: 8630504 } },
        { taxId: "12345678000270", alias: "Mordent", company: { name: "MORDENT CLINICA ODONTOLOGICA LTDA" }, address: { street: "Rua das Flores", number: "123", zip: "88000000" }, phones: [{ area: "47", number: "33380000" }], mainActivity: { id: 8630504 } },
      ],
      "8630504",
    );
    expect(r.tipo).toBe("confirmado");
    if (r.tipo === "confirmado") {
      expect(r.escolhido.cnpj).toBe("12345678000190");
      expect(desempatarCandidatosSalvos(r.candidatos)?.cnpj).toBe("12345678000190");
    }
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

  it("lê uma página no formato OfficeDto documentado pela CNPJá", () => {
    const resposta = [{
      taxId: "10898932000157",
      alias: "Mordent",
      company: { name: "MORDENT CLINICA ODONTOLOGICA LTDA", members: [] },
      address: { municipality: 4204608, street: "Rua Coronel Pedro Benedet", number: "363", district: "Centro", city: "Criciúma", state: "SC", zip: "88801-250" },
      phones: [{ type: "LANDLINE", area: "48", number: "34333100" }],
      mainActivity: { id: 8630504, text: "Atividade odontológica" },
      sideActivities: [],
      status: { id: 2, text: "Ativa" },
    }];
    const candidatos = extrairCandidatosCnpja(resposta);
    expect(candidatos).toHaveLength(1);
    expect(candidatos?.[0]?.address?.zip).toBe("88801-250");
    expect(candidatos?.[0]?.phones?.[0]?.area).toBe("48");
    expect(decidir(
      { nome: "Mordent Odontologia", cep: "88801250", telefones: ["+554834333100"] },
      candidatos ?? [],
      "8630504",
    ).tipo).toBe("confirmado");
  });

  it("não confirma endereço ou telefone quando o nome não corresponde", () => {
    const r = decidir(
      { nome: "Mordent Odontologia", cep: "88801250", telefones: ["+554834333100"] },
      [{ taxId: "10898932000157", company: { name: "OUTRA EMPRESA LTDA" }, address: { zip: "88801-250" }, phones: [{ area: "48", number: "34333100" }], status: { id: 2 } }],
      null,
    );
    expect(r.tipo).toBe("provavel");
  });

  it("descarta estabelecimento inativo mesmo se a API ignorar o filtro", () => {
    const r = decidir(
      { nome: "Mordent Odontologia", telefones: [] },
      [{ taxId: "10898932000157", company: { name: "MORDENT ODONTOLOGIA LTDA" }, status: { id: 8, text: "Baixada" } }],
      null,
    );
    expect(r.tipo).toBe("nenhum");
  });
});

describe("Site próprio", () => {
  it("Instagram não é site próprio", () => expect(ehSiteProprio("https://instagram.com/x")).toBe(false));
  it("Linktree não é site próprio", () => expect(ehSiteProprio("https://linktr.ee/x")).toBe(false));
  it("Facebook e links de WhatsApp não são site próprio", () => {
    expect(ehSiteProprio("https://m.facebook.com/x")).toBe(false);
    expect(ehSiteProprio("https://wa.me/5547999999999")).toBe(false);
    expect(ehSiteProprio("https://api.whatsapp.com/send?phone=5547999999999")).toBe(false);
  });
  it("domínio da empresa é site próprio", () => expect(ehSiteProprio("https://mordent.com.br")).toBe(true));
});
