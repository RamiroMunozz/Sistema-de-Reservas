import { randomUUID } from "node:crypto";
import jwt from "jsonwebtoken";
import { Prisma } from "@prisma/client";
import request from "supertest";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { filtroNoVencida } from "../src/modules/bookings/filtrosReserva.js";

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
        depositAmount: null,
        payments: [],
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

  describe("ADM-004, ADM-005 y decisión 12: recaudación con pagos", () => {
    const INICIO = new Date("2031-08-10T12:00:00.000Z");
    const consultar = () =>
      request(app)
        .get(RUTA_METRICAS)
        .query({ startDate: "2031-08-01", endDate: "2031-08-31" })
        .set(tokenAdmin);

    const reserva = (datos: {
      estado: "CONFIRMED" | "PENDING" | "CANCELLED" | "EXPIRED";
      precio: string;
      seña: string | null;
      pagos: string[];
    }) => ({
      id: randomUUID(),
      status: datos.estado,
      totalPrice: new Prisma.Decimal(datos.precio),
      depositAmount: datos.seña === null ? null : new Prisma.Decimal(datos.seña),
      payments: datos.pagos.map((monto) => ({ amount: new Prisma.Decimal(monto) })),
      startTime: INICIO,
      court: { name: "Cancha 1", sport: "PADEL" },
    });

    it("consulta con filtroNoVencida y trae solo los pagos válidos sin reembolso", async () => {
      vi.useFakeTimers({ toFake: ["Date"] });
      vi.setSystemTime(new Date("2031-08-15T00:00:00.000Z"));
      try {
        await consultar();
      } finally {
        vi.useRealTimers();
      }

      const consulta = buscarReservas.mock.calls[0]?.[0];
      expect(consulta.where).toMatchObject({
        createdAt: expect.any(Object),
        ...filtroNoVencida(new Date("2031-08-15T00:00:00.000Z")),
      });
      expect(consulta.include.payments).toEqual({
        where: { isValid: true, refundedAt: null },
        select: { amount: true },
      });
    });

    it("una reserva de invitado confirmada aporta el monto de su pago válido, no el precio total", async () => {
      buscarReservas.mockResolvedValue([
        reserva({ estado: "CONFIRMED", precio: "300.00", seña: "90.00", pagos: ["90.00"] }),
      ]);

      const respuesta = await consultar();

      expect(respuesta.body.summary.totalRevenueARS).toBe(90);
    });

    it("una reserva de invitado confirmada a mano, sin pago, aporta 0", async () => {
      buscarReservas.mockResolvedValue([
        reserva({ estado: "CONFIRMED", precio: "300.00", seña: "90.00", pagos: [] }),
      ]);

      const respuesta = await consultar();

      expect(respuesta.body.summary).toMatchObject({ confirmedCount: 1, totalRevenueARS: 0 });
    });

    it("una reserva con cuenta aporta su precio total", async () => {
      buscarReservas.mockResolvedValue([
        reserva({ estado: "CONFIRMED", precio: "1200.50", seña: null, pagos: [] }),
      ]);

      const respuesta = await consultar();

      expect(respuesta.body.summary.totalRevenueARS).toBe(1200.5);
    });

    it("suma con decimales exactos una mezcla de invitado y cuenta; PENDING y CANCELLED no aportan", async () => {
      buscarReservas.mockResolvedValue([
        reserva({ estado: "CONFIRMED", precio: "300.00", seña: "0.10", pagos: ["0.10"] }),
        reserva({ estado: "CONFIRMED", precio: "0.20", seña: null, pagos: [] }),
        reserva({ estado: "PENDING", precio: "500.00", seña: "150.00", pagos: [] }),
        reserva({ estado: "CANCELLED", precio: "500.00", seña: "150.00", pagos: ["150.00"] }),
      ]);

      const respuesta = await consultar();

      expect(respuesta.body.summary).toEqual({
        totalBookings: 4,
        confirmedCount: 2,
        cancelledCount: 1,
        totalRevenueARS: 0.3,
      });
      expect(respuesta.body.details).toHaveLength(4);
    });

    it("la forma JSON de la respuesta no incluye pagos", async () => {
      buscarReservas.mockResolvedValue([
        reserva({ estado: "CONFIRMED", precio: "300.00", seña: "90.00", pagos: ["90.00"] }),
      ]);

      const respuesta = await consultar();

      expect(Object.keys(respuesta.body.details[0]).sort()).toEqual(
        ["court", "id", "price", "sport", "startTime", "status"],
      );
    });
  });
});
