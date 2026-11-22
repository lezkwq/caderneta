export type GrupoManual<T extends { pessoa: string | null }> = [string, T[]];

export function agruparPorPessoa<T extends { pessoa: string | null }>(empresas: T[]): GrupoManual<T>[] {
  const grupos = new Map<string, { rotulo: string; empresas: T[] }>();
  for (const empresa of empresas) {
    const rotulo = empresa.pessoa?.trim() || "Sem pessoa";
    const chave = rotulo.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLocaleLowerCase("pt-BR").replace(/\s+/g, " ");
    const grupo = grupos.get(chave);
    if (grupo) grupo.empresas.push(empresa);
    else grupos.set(chave, { rotulo, empresas: [empresa] });
  }
  return [...grupos.values()].map(({ rotulo, empresas: grupo }) => [rotulo, grupo]);
}

export type TarefaManual = "cnpj" | "site" | "cnpja";

/** CNPJ digitado vai direto à validação cadastral e nunca solicita busca paga CNPJá. */
export function tarefasIniciaisManual(entrada: { cnpj?: string | null; site?: string | null; maps?: string | null }): TarefaManual[] {
  const tarefas: TarefaManual[] = [];
  if (entrada.cnpj) tarefas.push("cnpj");
  if (entrada.site) tarefas.push("site");
  if (!entrada.cnpj && !entrada.site && !entrada.maps) tarefas.push("cnpja");
  return tarefas;
}
