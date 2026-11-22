export interface TarefaFilaBasica {
  id: string;
  lead_id: string;
  status: string;
}

const ATIVAS = new Set(["pendente", "em_processamento"]);

export function planejarCancelamentoFila(tarefas: TarefaFilaBasica[], leadIds: string[]): string[] {
  const leads = new Set(leadIds);
  return tarefas.filter((t) => leads.has(t.lead_id) && ATIVAS.has(t.status)).map((t) => t.id);
}

export function planejarExclusaoFila(tarefas: TarefaFilaBasica[], leadIds: string[]): string[] {
  const leads = new Set(leadIds);
  return tarefas.filter((t) => leads.has(t.lead_id)).map((t) => t.id);
}

/** Estima com até três chamadas CNPJá por empresa e uma chamada a cada 6,1 segundos. */
export function estimarFilaCnpjaSegundos(args: {
  itensGlobal: number;
  itensFuturosDaBusca?: number;
  esperaProximoSlotMs?: number;
  intervaloMs?: number;
  chamadasPorItem?: number;
}): number {
  const itens = Math.max(0, args.itensGlobal) + Math.max(0, args.itensFuturosDaBusca ?? 0);
  if (!itens) return 0;
  const chamadas = itens * (args.chamadasPorItem ?? 3);
  const esperaInicial = Math.max(0, args.esperaProximoSlotMs ?? 0);
  const intervalo = Math.max(0, args.intervaloMs ?? 6100);
  return Math.ceil((esperaInicial + Math.max(0, chamadas - 1) * intervalo) / 1000);
}
