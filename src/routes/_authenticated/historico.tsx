import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { toast } from "sonner";
import { PageHeader } from "@/components/app/AppShell";
import { StatusBusca } from "@/components/app/ui-bits";
import { Button } from "@/components/ui/button";
import { carregarHistorico, cancelarFilaBusca, controlarBusca, excluirBusca } from "@/lib/caderneta.functions";

export const Route = createFileRoute("/_authenticated/historico")({
  head: () => ({
    meta: [
      { title: "Histórico — Caderneta" },
      { name: "description", content: "Buscas anteriores e itens na fila da Caderneta." },
      { property: "og:title", content: "Histórico — Caderneta" },
      { property: "og:description", content: "Buscas anteriores e itens na fila da Caderneta." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: Pagina,
});

function Pagina() {
  const qc = useQueryClient();
  const carregar = useServerFn(carregarHistorico);
  const pausarRetomar = useServerFn(controlarBusca);
  const cancelar = useServerFn(cancelarFilaBusca);
  const excluir = useServerFn(excluirBusca);
  const [ocupada, setOcupada] = useState<string | null>(null);
  const { data: buscas, isPending, isError, refetch } = useQuery({
    queryKey: ["historico"],
    queryFn: () => carregar(),
  });

  async function acao(id: string, executar: () => Promise<unknown>, sucesso: string) {
    setOcupada(id);
    try {
      await executar();
      toast.success(sucesso);
      await qc.invalidateQueries({ queryKey: ["historico"] });
      await qc.invalidateQueries({ queryKey: ["buscas"] });
      await qc.invalidateQueries({ queryKey: ["busca"] });
    } catch { toast.error("Não foi possível concluir esta ação."); }
    finally { setOcupada(null); }
  }

  return (
    <div className="space-y-5">
      <PageHeader title="Histórico" desc="Reabra resultados, controle filas pendentes e remova buscas antigas." />
      {isPending && <div className="card-soft p-6 text-sm text-muted-foreground">Carregando buscas…</div>}
      {isError && <div className="card-soft p-6"><p className="text-danger-text">Não foi possível carregar o histórico.</p><Button variant="outline" className="mt-3" onClick={() => void refetch()}>Tentar novamente</Button></div>}
      {!isPending && !isError && (buscas?.length ?? 0) === 0 && <div className="card-soft p-6 text-center">Você ainda não tem buscas.</div>}
      <ul className="space-y-3">
        {buscas?.map((busca) => {
          const terminal = ["concluida", "erro", "cancelada"].includes(busca.status);
          return (
            <li key={busca.id} className="card-soft p-4 sm:p-5">
              <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                <div className="min-w-0 space-y-2">
                  <h2 className="break-words text-base font-semibold text-heading">{busca.titulo}</h2>
                  <div className="flex flex-wrap items-center gap-x-3 gap-y-2 text-sm text-muted-foreground">
                    <span>{new Date(busca.created_at).toLocaleString("pt-BR")}</span>
                    <StatusBusca status={busca.status} />
                    <span>{busca.empresas} {busca.empresas === 1 ? "empresa" : "empresas"}</span>
                    <span>{busca.itensNaFila} {busca.itensNaFila === 1 ? "item na fila" : "itens na fila"}</span>
                    <span>Créditos CNPJá: {busca.creditosCnpjaUsados ?? "sem registro"}</span>
                  </div>
                </div>
                <div className="flex flex-wrap gap-2 [&_button]:min-h-11 [&_a]:min-h-11">
                  <Button variant="outline" asChild><Link to="/busca/$id" params={{ id: busca.id }}>Abrir resultados</Link></Button>
                  {!terminal && <Button variant="outline" loading={ocupada === busca.id} disabled={!!ocupada} onClick={() => void acao(busca.id, () => pausarRetomar({ data: { buscaId: busca.id, acao: busca.status === "pausada" ? "retomar" : "pausar" } }), busca.status === "pausada" ? "Busca retomada." : "Busca pausada.")}>{busca.status === "pausada" ? "Retomar" : "Pausar"}</Button>}
                  {busca.itensNaFila > 0 && <Button variant="secondary" loading={ocupada === busca.id} disabled={!!ocupada} onClick={() => {
                    if (!confirm(`Cancelar a fila de “${busca.titulo}”? Os resultados já feitos serão mantidos.`)) return;
                    void acao(busca.id, () => cancelar({ data: { buscaId: busca.id } }), "Fila cancelada; os resultados foram mantidos.");
                  }}>Cancelar fila</Button>}
                  <Button variant="ghost" loading={ocupada === busca.id} disabled={!!ocupada} className="text-danger-text" onClick={() => {
                    if (!confirm(`Excluir “${busca.titulo}”, todas as empresas e todos os itens da fila? Esta ação não pode ser desfeita.`)) return;
                    void acao(busca.id, () => excluir({ data: { buscaId: busca.id } }), "Busca excluída.");
                  }}>Excluir busca</Button>
                </div>
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
