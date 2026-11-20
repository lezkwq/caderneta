import { createFileRoute } from "@tanstack/react-router";
import { PageHeader } from "@/components/app/AppShell";

export const Route = createFileRoute("/_authenticated/manual")({
  head: () => ({
    meta: [
      { title: "Empresas que conheço — Caderneta" },
      { name: "description", content: "Empresas que conheço na Caderneta." },
      { property: "og:title", content: "Empresas que conheço — Caderneta" },
      { property: "og:description", content: "Empresas que conheço na Caderneta." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: () => (
    <>
      <PageHeader title="Empresas que conheço" />
      <div className="card-soft p-6">Esta tela ainda está em construção.</div>
    </>
  ),
});
