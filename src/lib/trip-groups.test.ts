import { describe, expect, it } from "vitest";
import { groupTrips, type TripLike } from "./trip-groups";

const trip = (over: Partial<TripLike> & Pick<TripLike, "id">): TripLike => ({
  origin: "valencia",
  destination: "caracas",
  departure_date: "2026-11-24",
  vehicle_id: "v1",
  ...over,
});

describe("groupTrips", () => {
  it("agrupa ida y vuelta del mismo camión y día", () => {
    const groups = groupTrips([
      trip({ id: "ida" }),
      trip({ id: "vuelta", origin: "caracas", destination: "valencia" }),
    ]);
    expect(groups).toHaveLength(1);
    expect(groups[0]!.roundTrip).toBe(true);
    expect(groups[0]!.trips.map((t) => t.id)).toEqual(["ida", "vuelta"]);
  });

  it("no mezcla camiones distintos aunque sea el mismo día", () => {
    const groups = groupTrips([
      trip({ id: "a", vehicle_id: "v1" }),
      trip({ id: "b", vehicle_id: "v2", origin: "caracas", destination: "valencia" }),
    ]);
    expect(groups).toHaveLength(2);
    expect(groups.every((g) => !g.roundTrip)).toBe(true);
  });

  it("no mezcla días distintos del mismo camión", () => {
    const groups = groupTrips([
      trip({ id: "ida" }),
      trip({ id: "vuelta", origin: "caracas", destination: "valencia", departure_date: "2026-11-25" }),
    ]);
    expect(groups).toHaveLength(2);
  });

  it("no marca ida y vuelta si ambos viajes van en el mismo sentido", () => {
    const groups = groupTrips([trip({ id: "a" }), trip({ id: "b" })]);
    expect(groups).toHaveLength(1);
    expect(groups[0]!.roundTrip).toBe(false);
  });

  it("ordena las patas por hora de salida del origen", () => {
    const groups = groupTrips([
      trip({ id: "vuelta", origin: "caracas", destination: "valencia", departure_time: "15:30:00" }),
      trip({ id: "ida", departure_time: "06:00:00" }),
    ]);
    expect(groups[0]!.trips.map((t) => t.id)).toEqual(["ida", "vuelta"]);
  });

  it("usa el id del vehículo embebido cuando existe", () => {
    const groups = groupTrips([
      trip({ id: "a", vehicle_id: null, vehicles: { id: "v9" } }),
      trip({ id: "b", vehicle_id: "otro", vehicles: { id: "v9" }, origin: "caracas", destination: "valencia" }),
    ]);
    expect(groups).toHaveLength(1);
    expect(groups[0]!.roundTrip).toBe(true);
  });
});
