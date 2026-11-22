import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { cnpjValido, soDigitos } from "@/lib/br";

const texto = (max: number) => z.string().trim().min(1).max(max);

export const iniciarBusca = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({
    cidade: texto(80), estado: texto(40), pais: texto(40), nicho: texto(80),
    quantidade: z.number().int().min(1).max(100),
    soSemSite: z.boolean().optional(),
  }).parse(d))
  .handler(async ({ data, context }) => {
    const s = await import("@/lib/caderneta.server");
    try { return { id: await s.criarBuscaMaps(context.userId, data), erro: null }; }
    catch (e) { return { id: null, erro: e instanceof Error ? e.message : "Falha ao iniciar" }; }
  });

const empresaSchema = z.object({
  nome: texto(200),
  cidade: z.string().trim().max(80).optional(),
  cnpj: z.string().trim().max(20).optional().refine((v) => !v || cnpjValido(v), "CNPJ inválido"),
  links: z.array(z.string().trim().url().max(500).refine((u) => /^https?:\/\//i.test(u), "Use http ou https")).max(6),
  pessoa: z.string().trim().max(120).optional(),
});

export const iniciarManual = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ empresas: z.array(empresaSchema).min(1).max(100) }).parse(d))
  .handler(async ({ data, context }) => {
    const s = await import("@/lib/caderneta.server");
    try { return { id: await s.criarBuscaManual(context.userId, data.empresas), erro: null }; }
    catch (e) { return { id: null, erro: e instanceof Error ? e.message : "Falha ao iniciar" }; }
  });

export const informarCnpj = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ leadId: z.string().uuid(), cnpj: z.string().refine(cnpjValido, "CNPJ inválido") }).parse(d))
  .handler(async ({ data, context }) => {
    const s = await import("@/lib/caderneta.server");
    await s.definirCnpjManual(context.userId, data.leadId, soDigitos(data.cnpj));
    return { ok: true };
  });

export const escolherCnpjCandidato = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ leadId: z.string().uuid(), cnpj: z.string().refine(cnpjValido, "CNPJ inválido") }).parse(d))
  .handler(async ({ data, context }) => {
    const s = await import("@/lib/caderneta.server");
    await s.selecionarCnpjCandidato(context.userId, data.leadId, soDigitos(data.cnpj));
    return { ok: true };
  });

export const controlarBusca = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ buscaId: z.string().uuid(), acao: z.enum(["pausar", "retomar"]) }).parse(d))
  .handler(async ({ data, context }) => {
    const s = await import("@/lib/caderneta.server");
    await s.controlarBusca(context.userId, data.buscaId, data.acao);
    return { ok: true, fila: await s.previsaoFila(context.userId, data.buscaId) };
  });

export const cancelarFilaBusca = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ buscaId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const s = await import("@/lib/caderneta.server");
    return { cancelados: await s.cancelarFilaBusca(context.userId, data.buscaId) };
  });

export const excluirBusca = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ buscaId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const s = await import("@/lib/caderneta.server");
    await s.excluirBusca(context.userId, data.buscaId);
    return { ok: true };
  });

export const carregarHistorico = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const s = await import("@/lib/caderneta.server");
    return s.listarHistorico(context.userId);
  });

export const processarAgora = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ buscaId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const s = await import("@/lib/caderneta.server");
    const processamento = await s.processarFila();
    return { ...(await s.previsaoFila(context.userId, data.buscaId)), importacoes: processamento.importacoes };
  });

export const infoSistema = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const s = await import("@/lib/caderneta.server");
    const [apify, fila, hoje] = await Promise.all([s.testarApify(), s.previsaoFila(context.userId), s.contarBuscasHoje(context.userId)]);
    return { apify, fila, buscasHoje: hoje };
  });
