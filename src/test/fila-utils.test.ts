import { describe, expect, it } from "vitest";
import { estimarFilaCnpjaSegundos, planejarCancelamentoFila, planejarExclusaoFila } from "@/lib/fila-utils";

const tarefas = [
  { id: "t1", lead_id: "l1", status: "pendente" },
  { id: "t2", lead_id: "l1", status: "em_processamento" },
  { id: "t3", lead_id: "l1", status: "feito" },
  { id: "t4", lead_id: "l2", status: "pendente" },
  { id: "t5", lead_id: "l3", status: "cancelada" },
];

describe("Ações e estimativa da fila", () => {
  it("cancela somente tarefas ativas dos leads da busca", () => {
    expect(planejarCancelamentoFila(tarefas, ["l1", "l2"])).toEqual(["t1", "t2", "t4"]);
  });

  it("seleciona todos os itens da fila dos leads antes de excluir a busca", () => {
    expect(planejarExclusaoFila(tarefas, ["l1"])).toEqual(["t1", "t2", "t3"]);
  });

  it("estima a fila pela janela global e pelo pior caso de chamadas por lead", () => {
    expect(estimarFilaCnpjaSegundos({ itensGlobal: 8, esperaProximoSlotMs: 2000 })).toBe(143);
    expect(estimarFilaCnpjaSegundos({ itensGlobal: 0, itensFuturosDaBusca: 1 })).toBe(13);
  });
});
