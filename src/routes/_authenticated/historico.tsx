import { createFileRoute } from "@tanstack/react-router";
import { PageHeader } from "@/components/app/AppShell";

export const Route = createFileRoute("/_authenticated/historico")({
  head: () => ({
    meta: [
      { title: "Histórico — Caderneta" },
      { name: "description", content: "Histórico na Caderneta." },
      { property: "og:title", content: "Histórico — Caderneta" },
      { property: "og:description", content: "Histórico na Caderneta." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: () => (
    <>
      <PageHeader title="Histórico" />
      <div className="card-soft p-6">Esta tela ainda está em construção.</div>
    </>
  ),
});
