export const MENSAGEM_OWNER_PENDENTE = "Configuração pendente: defina o secret OWNER_EMAIL no Lovable Cloud";

export type EstadoAcessoDono = "dono" | "restrito" | "configuracao_pendente";

export function avaliarAcessoDono(emailConfigurado: string | undefined, emailVerificado: string | null | undefined): EstadoAcessoDono {
  if (!emailConfigurado?.trim()) return "configuracao_pendente";
  if (!emailVerificado?.trim()) return "restrito";
  return emailConfigurado.trim().toLowerCase() === emailVerificado.trim().toLowerCase() ? "dono" : "restrito";
}

export function exigirAcessoDono(emailConfigurado: string | undefined, emailVerificado: string | null | undefined): void {
  const estado = avaliarAcessoDono(emailConfigurado, emailVerificado);
  if (estado === "configuracao_pendente") throw new Error(MENSAGEM_OWNER_PENDENTE);
  if (estado !== "dono") throw new Error("Acesso restrito");
}

export function buscaPertenceAoUsuario(donoBuscaId: string | null | undefined, usuarioId: string): boolean {
  return !!donoBuscaId && donoBuscaId === usuarioId;
}
