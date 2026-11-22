import { describe, expect, it } from "vitest";
import { offerRequestSchema, type OfferRequestInput } from "./package-request";
import { packCargo } from "./packing";
import { loadingSteps } from "./loading-guide";
// Forma que insert_package_request (RPC) guarda en package_requests.package:
// id por bulto + recogida/entrega de la solicitud en cada uno.
const requestPkgs = (input: OfferRequestInput, id = "request-id") =>
  input.packages.map((pkg, i) => ({
    ...pkg,
    id: `${id}-${i + 1}`,
    pickup: input.pickup,
    recipient: input.delivery,
  }));
const input: OfferRequestInput = {
  offerId: "11111111-1111-4111-8111-111111111111",
  sender: "Ana Pérez",
  phone: "584121234567",
  email: "ana@example.com",
  pickup: "Caracas, Los Ruices, calle 5",
  delivery: "Valencia, San Diego, avenida 2",
  notes: "Manipular con cuidado",
  packages: [
    {
      name: "Vasos de vidrio",
      length: 50,
      width: 40,
      height: 30,
      weight: 12,
      qty: 2,
      fragile: true,
      deadline: "2026-11-24T16:00",
    },
    {
      name: "Cajas de ropa",
      length: 60,
      width: 40,
      height: 40,
      weight: 8,
      qty: 1,
      fragile: false,
      deadline: "",
    },
  ],
};
describe("solicitudes de regreso", () => {
  it("permite enviar sin cuenta y no admite decisiones ni dueño desde el formulario público", () => {
    const parsed = offerRequestSchema.parse({ ...input, user_id: "other", status: "accepted" });
    expect(parsed).toEqual(input);
    expect("status" in parsed).toBe(false);
  });
  it("conserva recogida y entrega en cada paquete de la solicitud", () => {
    const pkgs = requestPkgs(input);
    expect(pkgs).toHaveLength(2);
    expect(pkgs[0]?.pickup).toBe("Caracas, Los Ruices, calle 5");
    expect(pkgs[0]?.recipient).toBe("Valencia, San Diego, avenida 2");
    expect(pkgs[0]?.fragile).toBe(true);
    expect(pkgs[1]?.pickup).toBe("Caracas, Los Ruices, calle 5");
    expect(pkgs[0]?.id).not.toBe(pkgs[1]?.id);
  });
  it("incluye todos los bultos solicitados en el plan 3D y los pasos de montaje", () => {
    const pkgs = requestPkgs(input);
    const result = packCargo({ length: 400, width: 200, height: 200, maxKg: 1000 }, pkgs);
    expect(result.placed).toHaveLength(3);
    expect(loadingSteps(result.placed)).toHaveLength(3);
    expect(result.usedKg).toBe(32);
  });
  it("rechaza solicitudes sin paquetes o sin ambas direcciones", () => {
    expect(offerRequestSchema.safeParse({ ...input, packages: [] }).success).toBe(false);
    expect(offerRequestSchema.safeParse({ ...input, pickup: "" }).success).toBe(false);
    expect(offerRequestSchema.safeParse({ ...input, delivery: "" }).success).toBe(false);
  });
  it("exige un correo válido para el enlace de pago", () => {
    expect(offerRequestSchema.safeParse({ ...input, email: "" }).success).toBe(false);
    expect(offerRequestSchema.safeParse({ ...input, email: "no-es-correo" }).success).toBe(false);
    expect(offerRequestSchema.parse({ ...input, email: "  Ana@Example.COM " }).email).toBe(
      "ana@example.com",
    );
  });
  it("rechaza un offerId que no sea uuid", () => {
    expect(offerRequestSchema.safeParse({ ...input, offerId: "oferta-1" }).success).toBe(false);
    expect(offerRequestSchema.safeParse({ ...input, offerId: "" }).success).toBe(false);
  });
});
