import { describe, expect, it } from "vitest";
import { toDraft } from "./mcp-tools";

describe("toDraft", () => {
  it("borrador vacío cuando falta el argumento o es inválido", () => {
    expect(toDraft(undefined)).toEqual({ packages: [] });
    expect(toDraft("cualquier cosa")).toEqual({ packages: [] });
  });

  it("normaliza contacto y bultos con defaults", () => {
    const d = toDraft({
      sender: "Luis",
      email: "a@b.com",
      packages: [{ name: "Jugos", length: 5, width: 4, height: 11, weight: 0.25 }],
    });
    expect(d.sender).toBe("Luis");
    expect(d.email).toBe("a@b.com");
    expect(d.pickup).toBeUndefined();
    expect(d.packages[0]).toMatchObject({ name: "Jugos", qty: 1, fragile: false, deadline: "" });
  });

  it("conserva qty y fragile cuando vienen dados", () => {
    const d = toDraft({
      packages: [
        { name: "Caja", length: 10, width: 10, height: 10, weight: 2, qty: 4, fragile: true },
      ],
    });
    expect(d.packages[0]?.qty).toBe(4);
    expect(d.packages[0]?.fragile).toBe(true);
  });
});
