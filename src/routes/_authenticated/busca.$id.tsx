import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { ArrowLeft } from "lucide-react";
import { PageHeader } from "@/components/app/AppShell";
import { Resultados } from "@/components/app/Resultados";
import { buscaQuery } from "@/lib/queries";

export const Route = createFileRoute("/_authenticated/busca/$id")({
  head: () => ({
    meta: [
      { title: "Resultados — Caderneta" },
      { name: "description", content: "Empresas encontradas, donos e telefones com nível de confiança." },
      { property: "og:title", content: "Resultados — Caderneta" },
      { property: "og:description", content: "Empresas encontradas, donos e telefones com nível de confiança." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: Pagina,
});

function Pagina() {
  const { id } = Route.useParams();
  const { data } = useQuery(buscaQuery(id));
  return (
    <>
      <Link to="/historico" className="mb-3 inline-flex h-11 items-center gap-1 text-sm font-medium text-heading hover:underline"><ArrowLeft className="size-4" aria-hidden />Histórico</Link>
      <PageHeader title={data?.busca?.titulo ?? "Resultados"} desc={data?.busca ? new Date(data.busca.created_at).toLocaleString("pt-BR") : undefined} />
      <Resultados buscaId={id} />
    </>
  );
}
