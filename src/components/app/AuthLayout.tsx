import type { ReactNode } from "react";
import { BookOpen } from "lucide-react";

export function AuthLayout({ title, intro, children }: { title: string; intro?: ReactNode; children: ReactNode }) {
  return (
    <main className="min-h-screen px-4 py-10 md:py-16">
      <div className="mx-auto w-full max-w-[440px]">
        <div className="mb-8 flex items-center gap-2 text-heading">
          <span className="grid size-10 place-items-center rounded-full bg-primary text-primary-foreground"><BookOpen className="size-5" aria-hidden /></span>
          <span className="text-lg font-semibold">Caderneta</span>
        </div>
        {intro}
        <section className="card-soft p-6 md:p-8">
          <h2 className="mb-6 text-xl">{title}</h2>
          {children}
        </section>
      </div>
    </main>
  );
}
