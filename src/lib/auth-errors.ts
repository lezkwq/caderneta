export function traduzErroAuth(msg: string): string {
  const m = msg.toLowerCase();
  if (m.includes("invalid login")) return "E-mail ou senha incorretos.";
  if (m.includes("email not confirmed")) return "Confirme seu e-mail antes de entrar. Veja sua caixa de entrada (e o spam).";
  if (m.includes("already registered")) return "Este e-mail já tem conta. Tente entrar.";
  if (m.includes("rate limit") || m.includes("too many")) return "O limite de envio de e-mails foi atingido. Tente mais tarde — o administrador pode configurar um envio de e-mail próprio para resolver.";
  if (m.includes("password")) return "Senha fraca: use pelo menos 8 caracteres.";
  return "Algo deu errado. Tente de novo.";
}
