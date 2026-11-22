import { describe, expect, it } from "vitest";
import { upsertDraftPkg, type Draft, type DraftPkg } from "./assistant-tools";

const pkg = (name: string, qty: number): DraftPkg => ({
  name,
  length: 5,
  width: 4,
  height: 11,
  weight: 0.25,
  qty,
  fragile: true,
  deadline: "",
});

describe("upsertDraftPkg", () => {
  it("agrega un bulto nuevo", () => {
    const d: Draft = { packages: [] };
    const r = upsertDraftPkg(d, pkg("Caja de jugo", 2));
    expect(r.result).toBe("added");
    expect(d.packages).toHaveLength(1);
  });

  it("re-describir el mismo bulto lo reemplaza, no lo duplica", () => {
    const d: Draft = { packages: [pkg("Caja de jugo 200ml", 1)] };
    const r = upsertDraftPkg(d, pkg("  caja de JUGO 200ml ", 4));
    expect(r.result).toBe("replaced");
    expect(r.before?.qty).toBe(1);
    expect(d.packages).toHaveLength(1);
    expect(d.packages[0]?.qty).toBe(4);
  });

  it("nombres distintos coexisten como bultos separados", () => {
    const d: Draft = { packages: [pkg("Caja de jugo", 1)] };
    upsertDraftPkg(d, pkg("Bolsa con ropa", 3));
    expect(d.packages).toHaveLength(2);
  });
});
