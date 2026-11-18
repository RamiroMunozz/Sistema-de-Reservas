import { randomUUID } from "node:crypto";
import jwt from "jsonwebtoken";
import { Prisma } from "@prisma/client";
import request from "supertest";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

const { buscarReservas } = vi.hoisted(() => ({
  buscarReservas: vi.fn(),
}));

vi.mock("../src/core/config/prisma.js", () => ({
  prisma: {
    booking: { findMany: buscarReservas },
  },
}));

const { default: app } = await import("../src/app.js");

const SECRETO_DE_PRUEBA = "secreto_de_prueba";
const RUTA_METRICAS = "/api/v1/admin/metrics";

const tokenAdmin = {
  Authorization: `Bearer ${jwt.sign(
    { userId: randomUUID(), role: "ADMIN" },
    SECRETO_DE_PRUEBA,
  )}`,
};

describe("Métricas de administración", () => {
  beforeAll(() => {
    vi.stubEnv("JWT_SECRET", SECRETO_DE_PRUEBA);
    vi.stubEnv("FRONTEND_URL", "https://reservas.ejemplo.test");
    vi.spyOn(console, "error").mockImplementation(() => undefined);
  });

  afterAll(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  beforeEach(() => {
    buscarReservas.mockReset();
    buscarReservas.mockResolvedValue([]);
  });

  describe("ADM-003: validación de las fechas", () => {
    it.each([
      { startDate: "2026-02-31", endDate: "2026-03-31", campo: "startDate" },
      { startDate: "2026-08-01", endDate: "2026-13-01", campo: "endDate" },
      { startDate: "2026-02-32", endDate: "2026-03-31", campo: "startDate" },
      { startDate: "2026-02-29", endDate: "2026-03-31", campo: "startDate" },
    ])(
      "responde 400 sin consultar la base si $campo no existe ($startDate, $endDate)",
      async ({ startDate, endDate, campo }) => {
        const respuesta = await request(app)
          .get(RUTA_METRICAS)
          .query({ startDate, endDate })
          .set(tokenAdmin);

        expect(respuesta.status).toBe(400);
        expect(respuesta.body.errors).toContainEqual(
          expect.objectContaining({ field: campo }),
        );
        expect(buscarReservas).not.toHaveBeenCalled();
      },
    );

    it("responde 400 con 'Formato YYYY-MM-DD' si el formato es incorrecto", async () => {
      const respuesta = await request(app)
        .get(RUTA_METRICAS)
        .query({ startDate: "01/08/2026", endDate: "2026-08-31" })
        .set(tokenAdmin);

      expect(respuesta.status).toBe(400);
      expect(respuesta.body.errors).toContainEqual({
        field: "startDate",
        message: "Formato YYYY-MM-DD",
      });
    });

    it("acepta el 29 de febrero de un año bisiesto", async () => {
      const respuesta = await request(app)
        .get(RUTA_METRICAS)
        .query({ startDate: "2028-02-29", endDate: "2028-03-31" })
        .set(tokenAdmin);

      expect(respuesta.status).toBe(200);
      expect(respuesta.body.period.from).toBe("2028-02-29");
    });

    it("acepta un período con las fechas límite del mes", async () => {
      const respuesta = await request(app)
        .get(RUTA_METRICAS)
        .query({ startDate: "2026-08-01", endDate: "2026-08-31" })
        .set(tokenAdmin);

      expect(respuesta.status).toBe(200);
      expect(respuesta.body).toHaveProperty("period");
      expect(respuesta.body).toHaveProperty("summary");
      expect(respuesta.body).toHaveProperty("details");
    });

    it("acepta un rango invertido y devuelve los contadores en cero", async () => {
      const respuesta = await request(app)
        .get(RUTA_METRICAS)
        .query({ startDate: "2026-08-31", endDate: "2026-08-01" })
        .set(tokenAdmin);

      expect(respuesta.status).toBe(200);
      expect(respuesta.body.summary).toEqual({
        totalBookings: 0,
        confirmedCount: 0,
        cancelledCount: 0,
        totalRevenueARS: 0,
      });
    });
  });

  describe("ADM-002: resumen y detalle", () => {
    // El detalle (court, sport, status, price) es de caracterización: pasa antes y
    // después del cambio. Lo que cambia es la suma exacta de importes con centavos.
    it("suma la recaudación confirmada sin error de coma flotante", async () => {
      const inicio = new Date("2026-08-10T12:00:00.000Z");
      const reserva = (
        estado: "CONFIRMED" | "CANCELLED" | "PENDING",
        precio: string,
      ) => ({
        id: randomUUID(),
        status: estado,
        totalPrice: new Prisma.Decimal(precio),
        startTime: inicio,
        court: { name: "Cancha 1", sport: "PADEL" },
      });

      buscarReservas.mockResolvedValue([
        reserva("CONFIRMED", "0.10"),
        reserva("CONFIRMED", "0.20"),
        reserva("CANCELLED", "5.00"),
        reserva("PENDING", "7.00"),
      ]);

      const respuesta = await request(app)
        .get(RUTA_METRICAS)
        .query({ startDate: "2026-08-01", endDate: "2026-08-31" })
        .set(tokenAdmin);

      expect(respuesta.status).toBe(200);
      expect(respuesta.body.summary).toEqual({
        totalBookings: 4,
        confirmedCount: 2,
        cancelledCount: 1,
        totalRevenueARS: 0.3,
      });
      expect(respuesta.body.details).toHaveLength(4);
      expect(respuesta.body.details[0]).toMatchObject({
        court: "Cancha 1",
        sport: "PADEL",
        status: "CONFIRMED",
        price: 0.1,
      });
    });
  });
});
