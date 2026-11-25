import { randomUUID } from "node:crypto";
import jwt from "jsonwebtoken";
import request from "supertest";
import { type RolDePrueba, payloadDePrueba } from "./ayudantes/tokens.js";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

const { buscarCanchaFuera, leerDentro, leerFinal } = vi.hoisted(() => ({
  buscarCanchaFuera: vi.fn(),
  leerDentro: vi.fn(),
  leerFinal: vi.fn(),
}));

vi.mock("../src/core/config/prisma.js", () => {
  const transaccion = {
    $executeRaw: async () => 0,
    booking: {
      updateMany: async () => ({ count: 0 }),
      findUnique: leerDentro,
      findUniqueOrThrow: leerFinal,
      update: async () => ({}),
    },
    bookingPayment: { updateMany: async () => ({ count: 0 }) },
  };

  return {
    prisma: {
      booking: { findUnique: buscarCanchaFuera },
      $transaction: (operacion: (tx: typeof transaccion) => Promise<unknown>) =>
        operacion(transaccion),
    },
  };
});

vi.mock("../src/core/integraciones/mercadoPago.js", () => ({
  expirarPreferencia: vi.fn(),
  crearPreferencia: vi.fn(),
  obtenerPago: vi.fn(),
  reembolsarPago: vi.fn(),
  obtenerVariableMercadoPago: vi.fn(),
}));

const { default: app } = await import("../src/app.js");

const SECRETO_DE_PRUEBA = "secreto_de_prueba";
const ID_USUARIO = randomUUID();
const ID_CANCHA = randomUUID();
const ID_RESERVA = randomUUID();
const HASH = "a".repeat(64);
const PREFERENCIA = "preferencia-interna";

const conToken = (rol: RolDePrueba) => ({
  Authorization: `Bearer ${jwt.sign(payloadDePrueba(rol, ID_USUARIO), SECRETO_DE_PRUEBA)}`,
});

const fecha = (iso: string) => new Date(iso);

/** Reserva tal como la devuelve Prisma, con los campos internos incluidos. */
const reservaCompleta = (cambios: Record<string, unknown> = {}) => ({
  id: ID_RESERVA,
  userId: null,
  courtId: ID_CANCHA,
  startTime: fecha("2031-03-10T18:00:00.000Z"),
  endTime: fecha("2031-03-10T19:00:00.000Z"),
  totalPrice: 1000,
  status: "CANCELLED",
  paymentMethod: "MERCADOPAGO",
  guestFirstName: "Ana",
  guestLastName: "Pérez",
  guestPhone: "5491155551234",
  guestEmail: null,
  expiresAt: null,
  depositAmount: 300,
  accessTokenHash: HASH,
  mpPreferenceId: PREFERENCIA,
  depositPaidAtCancel: false,
  createdAt: fecha("2031-03-01T10:00:00.000Z"),
  updatedAt: fecha("2031-03-01T10:00:00.000Z"),
  court: { id: ID_CANCHA, name: "Cancha 1" },
  user: null,
  payments: [],
  ...cambios,
});

describe("Respuestas con lista blanca de campos (RES-025, ADM-008)", () => {
  beforeAll(() => {
    vi.stubEnv("JWT_SECRET", SECRETO_DE_PRUEBA);
    vi.spyOn(console, "error").mockImplementation(() => undefined);
  });

  afterAll(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  beforeEach(() => {
    for (const simulado of [buscarCanchaFuera, leerDentro, leerFinal]) {
      simulado.mockReset();
    }
    buscarCanchaFuera.mockResolvedValue({ courtId: ID_CANCHA });
  });

  describe("PATCH /bookings/admin/:id/status", () => {
    it("responde con la vista de administrador de una reserva de invitado, sin el hash ni la preferencia", async () => {
      leerDentro.mockResolvedValue({
        status: "PENDING",
        mpPreferenceId: PREFERENCIA,
      });
      leerFinal.mockResolvedValue(reservaCompleta());

      const respuesta = await request(app)
        .patch(`/api/v1/bookings/admin/${ID_RESERVA}/status`)
        .set(conToken("DUENO"))
        .send({ status: "CANCELLED" });

      expect(respuesta.status).toBe(200);
      expect(respuesta.body).not.toHaveProperty("accessTokenHash");
      expect(respuesta.body).not.toHaveProperty("mpPreferenceId");
      expect(respuesta.body).not.toHaveProperty("depositPaidAtCancel");
      expect(JSON.stringify(respuesta.body)).not.toContain(HASH);
      expect(JSON.stringify(respuesta.body)).not.toContain(PREFERENCIA);
      expect(respuesta.body).toMatchObject({
        id: ID_RESERVA,
        status: "CANCELLED",
        guestFirstName: "Ana",
        depositAmount: 300,
        depositStatus: "PENDING",
        payments: [],
      });
    });

    it("pide a Prisma los pagos y el titular para armar la vista", async () => {
      leerDentro.mockResolvedValue({
        status: "PENDING",
        mpPreferenceId: PREFERENCIA,
      });
      leerFinal.mockResolvedValue(reservaCompleta());

      await request(app)
        .patch(`/api/v1/bookings/admin/${ID_RESERVA}/status`)
        .set(conToken("DUENO"))
        .send({ status: "CANCELLED" });

      const consulta = leerFinal.mock.calls[0][0];
      expect(consulta.include.payments).toBeDefined();
      expect(consulta.include.court).toBe(true);
    });
  });

  describe("PATCH /bookings/:id/cancel", () => {
    it("no devuelve el hash del token ni la preferencia de pago", async () => {
      leerDentro.mockResolvedValue(
        reservaCompleta({ userId: ID_USUARIO, status: "CONFIRMED" }),
      );
      leerFinal.mockResolvedValue(reservaCompleta({ userId: ID_USUARIO }));

      const respuesta = await request(app)
        .patch(`/api/v1/bookings/${ID_RESERVA}/cancel`)
        .set(conToken("JUGADOR"));

      expect(respuesta.status).toBe(200);
      expect(respuesta.body).not.toHaveProperty("accessTokenHash");
      expect(respuesta.body).not.toHaveProperty("mpPreferenceId");
      expect(respuesta.body).not.toHaveProperty("depositPaidAtCancel");
      expect(JSON.stringify(respuesta.body)).not.toContain(HASH);
      expect(respuesta.body).toMatchObject({
        id: ID_RESERVA,
        status: "CANCELLED",
        userId: ID_USUARIO,
      });
    });
  });
});
