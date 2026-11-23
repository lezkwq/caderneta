import { createFileRoute } from "@tanstack/react-router";
import { authenticateCronRequest } from "@/integrations/supabase/cron-auth";

export const Route = createFileRoute("/api/public/processar-fila")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const falha = await authenticateCronRequest(request);
        if (falha) return falha;
        const { processarFila } = await import("@/lib/caderneta.server");
        await processarFila();
        return Response.json({ ok: true });
      },
    },
  },
});
