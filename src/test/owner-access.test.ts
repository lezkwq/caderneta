import { describe, expect, it } from "vitest";
import { avaliarAcessoDono, buscaPertenceAoUsuario, exigirAcessoDono, MENSAGEM_OWNER_PENDENTE } from "@/lib/owner-access";

describe("Acesso do proprietário", () => {
  const parteLocal = ["owner", "test"].join(".");
  const emailDono = `${parteLocal}@example.invalid`;

  it("aceita o e-mail verificado igual ao secret", () => {
    expect(avaliarAcessoDono(emailDono, emailDono)).toBe("dono");
  });

  it("recusa outro usuário", () => {
    expect(avaliarAcessoDono(emailDono, "outra@example.invalid")).toBe("restrito");
  });

  it("compara e-mail sem diferenciar maiúsculas", () => {
    expect(avaliarAcessoDono(emailDono.toUpperCase(), emailDono)).toBe("dono");
  });

  it("falha fechado e bloqueia todas as ações quando o secret não existe", () => {
    expect(avaliarAcessoDono(undefined, emailDono)).toBe("configuracao_pendente");
    expect(() => exigirAcessoDono(undefined, emailDono)).toThrow(MENSAGEM_OWNER_PENDENTE);
  });

  it("não aceita busca pertencente a outro usuário", () => {
    expect(buscaPertenceAoUsuario("usuario-2", "usuario-1")).toBe(false);
    expect(buscaPertenceAoUsuario("usuario-1", "usuario-1")).toBe(true);
  });
});
