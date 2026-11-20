import { describe, expect, it } from "vitest";
import { cnpjValido, extrairCnpjs, normalizarTelefone, nomeDonoMei, linkWhatsApp } from "@/lib/br";
import { calcularScore, faixaScore } from "@/lib/score";

describe("CNPJ", () => {
  it("aceita CNPJ com dígitos verificadores corretos", () => expect(cnpjValido("47.960.950/0001-21")).toBe(true));
  it("recusa CNPJ com dígito errado", () => expect(cnpjValido("47.960.950/0001-22")).toBe(false));
  it("extrai só os válidos de um texto", () => expect(extrairCnpjs("CNPJ 47.960.950/0001-21 e 11.111.111/1111-11")).toEqual(["47960950000121"]));
});

describe("Telefone", () => {
  it("celular com 9 dígitos após o DDD", () => expect(normalizarTelefone("(48) 99999-1234")).toMatchObject({ e164: "+5548999991234", tipo: "celular" }));
  it("fixo com 8 dígitos", () => expect(normalizarTelefone("48 3333-4444")?.tipo).toBe("fixo"));
  it("número de 8 dígitos sem o 9 é fixo (só Ligar)", () => expect(normalizarTelefone("48 8888-4444")?.tipo).toBe("fixo"));
  it("remove +55", () => expect(normalizarTelefone("+55 48 99999-1234")?.e164).toBe("+5548999991234"));
});

describe("MEI", () => {
  it("remove o CPF do fim da razão social", () => expect(nomeDonoMei("JOAO DA SILVA 12345678901")).toBe("JOAO DA SILVA"));
});

describe("WhatsApp", () => {
  it("monta wa.me com 55 + DDD + número", () => expect(linkWhatsApp("+5548999991234", "Oi")).toBe("https://wa.me/5548999991234?text=Oi"));
});

describe("Score", () => {
  it("celular em 2 fontes com wa.me no site é Alta", () => {
    const r = calcularScore({ tipo: "celular", fontes: [{ tipo: "maps" }, { tipo: "whatsapp_site" }] });
    expect(faixaScore(r.score)).toBe("alta");
  });
  it("telefone só da Receita pontua baixo", () => {
    const r = calcularScore({ tipo: "fixo", fontes: [{ tipo: "receita" }] });
    expect(faixaScore(r.score)).toBe("baixa");
  });
  it("penaliza número em 3 empresas sem sócio em comum", () => {
    const base = { tipo: "celular" as const, fontes: [{ tipo: "maps" as const }], pessoasDaEmpresa: ["Ana"] };
    const sem = calcularScore(base).score;
    const com = calcularScore({ ...base, outrasEmpresas: [{ cnpj: "1", pessoas: ["Beto"] }, { cnpj: "2", pessoas: ["Caio"] }] }).score;
    expect(com).toBeLessThan(sem);
  });
  it("bonifica quando as empresas compartilham sócio", () => {
    const base = { tipo: "celular" as const, fontes: [{ tipo: "maps" as const }], pessoasDaEmpresa: ["Ana"] };
    const com = calcularScore({ ...base, outrasEmpresas: [{ cnpj: "1", pessoas: ["ana"] }, { cnpj: "2", pessoas: ["Ana"] }] }).score;
    expect(com).toBeGreaterThan(calcularScore(base).score);
  });
});
