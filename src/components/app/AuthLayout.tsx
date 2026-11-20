import type { ReactNode } from "react";
import { BookOpen } from "lucide-react";

export function Logo() {
  return (
    <div className="flex items-center gap-2 text-heading">
      <span className="grid size-10 shrink-0 place-items-center rounded-full bg-primary text-primary-foreground"><BookOpen className="size-5" aria-hidden /></span>
      <span className="text-lg font-semibold">Caderneta</span>
    </div>
  );
}

export function AuthLayout({ title, intro, children }: { title: string; intro?: ReactNode; children: ReactNode }) {
  return (
    <main className="flex min-h-screen items-center px-4 py-8 md:px-8">
      <div className="mx-auto grid w-full max-w-[1100px] items-center gap-8 lg:grid-cols-[minmax(0,1fr)_440px] lg:gap-16">
        <div className="min-w-0 space-y-6">
          <Logo />
          {intro}
        </div>
        <section className="card-soft w-full max-w-[440px] justify-self-center p-6 md:p-8 lg:justify-self-end">
          <h2 className="mb-6 text-xl">{title}</h2>
          {children}
        </section>
      </div>
    </main>
  );
}
