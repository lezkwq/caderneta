import { createFileRoute } from "@tanstack/react-router";
import { PageHeader } from "@/components/app/AppShell";

export const Route = createFileRoute("/_authenticated/configuracoes")({
  head: () => ({
    meta: [
      { title: "Configurações — Caderneta" },
      { name: "description", content: "Configurações na Caderneta." },
      { property: "og:title", content: "Configurações — Caderneta" },
      { property: "og:description", content: "Configurações na Caderneta." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: () => (
    <>
      <PageHeader title="Configurações" />
      <div className="card-soft p-6">Esta tela ainda está em construção.</div>
    </>
  ),
});
