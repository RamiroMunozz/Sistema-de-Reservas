import { describe, expect, it } from "vitest";
import { filtroNoVencida, filtroOcupaTurno } from "../src/modules/bookings/filtrosReserva.js";

const AHORA = new Date("2031-03-10T12:00:00.000Z");

const ramasEsperadas = [
  { status: { not: "PENDING" } },
  { expiresAt: null },
  { expiresAt: { gt: AHORA } },
];

describe("filtroOcupaTurno (RES-012, RES-013, CAN-006)", () => {
  it("excluye CANCELLED y EXPIRED", () => {
    expect(filtroOcupaTurno(AHORA).status).toEqual({ notIn: ["CANCELLED", "EXPIRED"] });
  });

  it("arma el OR de tres ramas: no PENDING, sin vencimiento o con vencimiento futuro", () => {
    expect(filtroOcupaTurno(AHORA).OR).toEqual(ramasEsperadas);
  });

  it("no excluye una PENDING con expiresAt nulo (rama explícita)", () => {
    const ramas = filtroOcupaTurno(AHORA).OR ?? [];

    expect(ramas).toContainEqual({ expiresAt: null });
  });

  it("usa el instante recibido como límite del vencimiento", () => {
    const otro = new Date("2032-01-01T00:00:00.000Z");

    expect(filtroOcupaTurno(otro).OR).toContainEqual({ expiresAt: { gt: otro } });
  });
});

describe("filtroNoVencida (ADM-004, ADM-005)", () => {
  it("excluye solo EXPIRED y conserva las CANCELLED", () => {
    expect(filtroNoVencida(AHORA).status).toEqual({ not: "EXPIRED" });
  });

  it("comparte las tres ramas del OR con filtroOcupaTurno", () => {
    expect(filtroNoVencida(AHORA).OR).toEqual(ramasEsperadas);
  });
});
