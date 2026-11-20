import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/_authenticated/new")({
  head: () => ({
    meta: [
      { title: "Nova busca — Caderneta" },
      { name: "description", content: "Busque empresas locais por cidade e nicho." },
      { property: "og:title", content: "Nova busca — Caderneta" },
      { property: "og:description", content: "Busque empresas locais por cidade e nicho." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: () => (
    <main className="mx-auto max-w-3xl p-6">
      <h1 className="page-title">Nova busca</h1>
      <p className="mt-2">Em construção.</p>
    </main>
  ),
});
