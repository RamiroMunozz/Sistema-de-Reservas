import { randomUUID } from "node:crypto";
import { Prisma } from "@prisma/client";
import jwt from "jsonwebtoken";
import request from "supertest";
import { ID_NEGOCIO_DE_PRUEBA, type RolDePrueba, payloadDePrueba } from "./ayudantes/tokens.js";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

const {
  buscarPago,
  marcarReembolsado,
  releerReserva,
  obtenerPago,
  reembolsarPago,
} = vi.hoisted(() => ({
  buscarPago: vi.fn(),
  marcarReembolsado: vi.fn(),
  releerReserva: vi.fn(),
  obtenerPago: vi.fn(),
  reembolsarPago: vi.fn(),
}));

vi.mock("../src/core/config/prisma.js", () => ({
  prisma: {
    bookingPayment: { findFirst: buscarPago, updateMany: marcarReembolsado },
    booking: { findUniqueOrThrow: releerReserva },
  },
}));

vi.mock("../src/core/integraciones/mercadoPago.js", () => ({
  crearPreferencia: vi.fn(),
  obtenerVariableMercadoPago: vi.fn(),
  expirarPreferencia: vi.fn(),
  obtenerPago,
  reembolsarPago,
}));

const { default: app } = await import("../src/app.js");

const SECRETO_DE_PRUEBA = "secreto_de_prueba";
const ID_PAGO = randomUUID();
const ID_RESERVA = randomUUID();
const ID_MP = "190426013932";
const MENSAJE_PROHIBIDO = "No tienes los permisos necesarios para realizar esta acción";
const MENSAJE_FALLA = "No se pudo procesar el reembolso con Mercado Pago.";
const FORMATO_CLAVE = new RegExp(
  `^reembolso-${ID_PAGO}-[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$`,
);

const conToken = (rol: RolDePrueba) => ({
  Authorization: `Bearer ${jwt.sign(payloadDePrueba(rol, randomUUID()), SECRETO_DE_PRUEBA)}`,
});

const ruta = (id: string = ID_PAGO) => `/api/v1/payments/admin/payments/${id}/refund`;

const pagoRegistrado = (cambios: Record<string, unknown> = {}) => ({
  id: ID_PAGO,
  bookingId: ID_RESERVA,
  mpPaymentId: ID_MP,
  amount: new Prisma.Decimal("300"),
  isValid: true,
  refundReason: "OWNER_DISCRETION",
  refundedAt: null,
  createdAt: new Date("2031-03-10T17:00:00.000Z"),
  ...cambios,
});

// Reserva releída después del reembolso: el pago ya figura con su fecha
const reservaReembolsada = () => ({
  id: ID_RESERVA,
  userId: null,
  courtId: randomUUID(),
  status: "CANCELLED",
  startTime: new Date("2031-03-10T18:00:00.000Z"),
  endTime: new Date("2031-03-10T19:00:00.000Z"),
  totalPrice: new Prisma.Decimal("1000"),
  depositAmount: new Prisma.Decimal("300"),
  paymentMethod: "MERCADOPAGO",
  guestFirstName: "Ana",
  guestLastName: "Pérez",
  guestPhone: "5491155551234",
  guestEmail: null,
  expiresAt: null,
  accessTokenHash: "b".repeat(64),
  mpPreferenceId: "preferencia-interna",
  depositPaidAtCancel: true,
  createdAt: new Date("2031-03-10T16:00:00.000Z"),
  updatedAt: new Date("2031-03-10T17:30:00.000Z"),
  court: { id: randomUUID(), name: "Cancha 1", sport: "PADEL" },
  user: null,
  payments: [pagoRegistrado({ refundedAt: new Date("2031-03-10T20:00:00.000Z") })],
});

describe("Reembolso manual por pago (PAG-024)", () => {
  beforeAll(() => {
    vi.stubEnv("JWT_SECRET", SECRETO_DE_PRUEBA);
    vi.spyOn(console, "error").mockImplementation(() => undefined);
  });

  afterAll(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  beforeEach(() => {
    buscarPago.mockReset().mockResolvedValue(pagoRegistrado());
    marcarReembolsado.mockReset().mockResolvedValue({ count: 1 });
    releerReserva.mockReset().mockImplementation(async () => reservaReembolsada());
    obtenerPago.mockReset().mockResolvedValue({ id: ID_MP, status: "approved" });
    reembolsarPago.mockReset().mockResolvedValue({ id: 3589421590 });
  });

  describe("acceso y validación", () => {
    it("sin token responde 401 y no consulta nada", async () => {
      const respuesta = await request(app).post(ruta());

      expect(respuesta.status).toBe(401);
      expect(buscarPago).not.toHaveBeenCalled();
    });

    it("con rol JUGADOR responde 403 y no consulta nada", async () => {
      const respuesta = await request(app).post(ruta()).set(conToken("JUGADOR"));

      expect(respuesta.status).toBe(403);
      expect(respuesta.body.detail).toBe(MENSAJE_PROHIBIDO);
      expect(buscarPago).not.toHaveBeenCalled();
      expect(reembolsarPago).not.toHaveBeenCalled();
    });

    it("un paymentId que no es UUID responde 400 sin consultar la base", async () => {
      const respuesta = await request(app)
        .post(ruta("190426013932"))
        .set(conToken("DUENO"));

      expect(respuesta.status).toBe(400);
      expect(buscarPago).not.toHaveBeenCalled();
      expect(reembolsarPago).not.toHaveBeenCalled();
    });

    it("un pago inexistente responde 404 sin llamar a Mercado Pago", async () => {
      buscarPago.mockResolvedValue(null);

      const respuesta = await request(app).post(ruta()).set(conToken("DUENO"));

      expect(respuesta.status).toBe(404);
      expect(obtenerPago).not.toHaveBeenCalled();
      expect(reembolsarPago).not.toHaveBeenCalled();
    });

    it("el paymentId es el id de BookingPayment (no el de Mercado Pago) y se busca con el negocio del token", async () => {
      await request(app).post(ruta()).set(conToken("DUENO"));

      expect(buscarPago).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: ID_PAGO, booking: { negocioId: ID_NEGOCIO_DE_PRUEBA } },
        }),
      );
    });
  });

  describe("pagos no reembolsables (409, sin llamar a Mercado Pago)", () => {
    it("un pago válido sin motivo de una reserva activa", async () => {
      buscarPago.mockResolvedValue(pagoRegistrado({ refundReason: null }));

      const respuesta = await request(app).post(ruta()).set(conToken("DUENO"));

      expect(respuesta.status).toBe(409);
      expect(obtenerPago).not.toHaveBeenCalled();
      expect(reembolsarPago).not.toHaveBeenCalled();
      expect(marcarReembolsado).not.toHaveBeenCalled();
    });

    it("un pago ya reembolsado: repetirlo no genera un segundo reembolso", async () => {
      buscarPago.mockResolvedValue(
        pagoRegistrado({ refundedAt: new Date("2031-03-10T20:00:00.000Z") }),
      );

      const respuesta = await request(app).post(ruta()).set(conToken("DUENO"));

      expect(respuesta.status).toBe(409);
      expect(obtenerPago).not.toHaveBeenCalled();
      expect(reembolsarPago).not.toHaveBeenCalled();
      expect(marcarReembolsado).not.toHaveBeenCalled();
    });
  });

  describe("reembolso exitoso", () => {
    it.each([
      "AMOUNT_MISMATCH",
      "SLOT_TAKEN",
      "PAID_AFTER_CANCEL",
      "DUPLICATE_PAYMENT",
      "OWNER_DISCRETION",
    ])("reembolsa un pago con motivo %s", async (motivo) => {
      buscarPago.mockResolvedValue(
        pagoRegistrado({ refundReason: motivo, isValid: motivo === "OWNER_DISCRETION" }),
      );

      const respuesta = await request(app).post(ruta()).set(conToken("DUENO"));

      expect(respuesta.status).toBe(200);
      expect(reembolsarPago).toHaveBeenCalledTimes(1);
      expect(reembolsarPago).toHaveBeenCalledWith(ID_MP, expect.any(String));
    });

    it("fija refundedAt con un where que exige refundedAt nulo", async () => {
      const antes = Date.now();

      await request(app).post(ruta()).set(conToken("DUENO"));

      expect(marcarReembolsado).toHaveBeenCalledTimes(1);
      const argumentos = marcarReembolsado.mock.calls[0][0] as {
        where: Record<string, unknown>;
        data: { refundedAt: Date };
      };
      expect(argumentos.where).toEqual({ id: ID_PAGO, refundedAt: null });
      expect(argumentos.data.refundedAt).toBeInstanceOf(Date);
      expect(argumentos.data.refundedAt.getTime()).toBeGreaterThanOrEqual(antes);
    });

    it("solo fija refundedAt después de que Mercado Pago aceptó el reembolso", async () => {
      const orden: string[] = [];
      reembolsarPago.mockImplementation(async () => {
        orden.push("mercado-pago");
        return { id: 1 };
      });
      marcarReembolsado.mockImplementation(async () => {
        orden.push("registro");
        return { count: 1 };
      });

      await request(app).post(ruta()).set(conToken("DUENO"));

      expect(orden).toEqual(["mercado-pago", "registro"]);
    });

    it("responde 200 con la reserva en vista de administrador y sus pagos", async () => {
      const respuesta = await request(app).post(ruta()).set(conToken("DUENO"));

      expect(respuesta.status).toBe(200);
      expect(respuesta.body).toMatchObject({
        id: ID_RESERVA,
        status: "CANCELLED",
        totalPrice: 1000,
        depositAmount: 300,
        depositStatus: "REFUNDED",
        refundDue: null,
        court: { name: "Cancha 1" },
        user: null,
      });
      expect(respuesta.body.payments).toEqual([
        {
          id: ID_PAGO,
          mpPaymentId: ID_MP,
          amount: 300,
          isValid: true,
          refundReason: "OWNER_DISCRETION",
          refundedAt: "2031-03-10T20:00:00.000Z",
          createdAt: "2031-03-10T17:00:00.000Z",
        },
      ]);
      expect(respuesta.body).not.toHaveProperty("accessTokenHash");
      expect(respuesta.body).not.toHaveProperty("mpPreferenceId");
    });

    it("si otro pedido ya registró el reembolso, no lo pisa y responde 200", async () => {
      marcarReembolsado.mockResolvedValue({ count: 0 });

      const respuesta = await request(app).post(ruta()).set(conToken("DUENO"));

      expect(respuesta.status).toBe(200);
      expect(marcarReembolsado).toHaveBeenCalledTimes(1);
    });
  });

  describe("clave de idempotencia por intento (T-0.3, comprobación 5)", () => {
    it("tiene la forma reembolso-<bookingPaymentId>-<uuid>", async () => {
      await request(app).post(ruta()).set(conToken("DUENO"));

      const clave = reembolsarPago.mock.calls[0][1] as string;
      expect(clave).toMatch(FORMATO_CLAVE);
    });

    it("dos intentos usan claves distintas", async () => {
      reembolsarPago.mockRejectedValueOnce(new Error("400 de Mercado Pago"));

      const fallido = await request(app).post(ruta()).set(conToken("DUENO"));
      const reintento = await request(app).post(ruta()).set(conToken("DUENO"));

      expect(fallido.status).toBe(502);
      expect(reintento.status).toBe(200);
      expect(reembolsarPago).toHaveBeenCalledTimes(2);
      const primera = reembolsarPago.mock.calls[0][1] as string;
      const segunda = reembolsarPago.mock.calls[1][1] as string;
      expect(primera).toMatch(FORMATO_CLAVE);
      expect(segunda).toMatch(FORMATO_CLAVE);
      expect(segunda).not.toBe(primera);
    });
  });

  describe("pago que Mercado Pago ya reembolsó", () => {
    it("no llama a reembolsarPago y solo fija refundedAt", async () => {
      obtenerPago.mockResolvedValue({ id: ID_MP, status: "refunded" });

      const respuesta = await request(app).post(ruta()).set(conToken("DUENO"));

      expect(respuesta.status).toBe(200);
      expect(obtenerPago).toHaveBeenCalledWith(ID_MP);
      expect(reembolsarPago).not.toHaveBeenCalled();
      expect(marcarReembolsado).toHaveBeenCalledTimes(1);
    });

    it("consulta el pago antes de reembolsar", async () => {
      const orden: string[] = [];
      obtenerPago.mockImplementation(async () => {
        orden.push("consulta");
        return { id: ID_MP, status: "approved" };
      });
      reembolsarPago.mockImplementation(async () => {
        orden.push("reembolso");
        return { id: 1 };
      });

      await request(app).post(ruta()).set(conToken("DUENO"));

      expect(orden).toEqual(["consulta", "reembolso"]);
    });
  });

  describe("falla de Mercado Pago", () => {
    it("responde 502 sin detalle interno y deja refundedAt nulo", async () => {
      reembolsarPago.mockRejectedValue(
        new Error("Refund requested amount is greater than amount paid (token APP_USR-123)"),
      );

      const respuesta = await request(app).post(ruta()).set(conToken("DUENO"));

      expect(respuesta.status).toBe(502);
      expect(respuesta.body.detail).toBe(MENSAJE_FALLA);
      expect(JSON.stringify(respuesta.body)).not.toMatch(/APP_USR|Refund requested/);
      expect(marcarReembolsado).not.toHaveBeenCalled();
    });

    it("si falla la consulta previa del pago, responde 502 y no reembolsa", async () => {
      obtenerPago.mockRejectedValue(new Error("timeout interno"));

      const respuesta = await request(app).post(ruta()).set(conToken("DUENO"));

      expect(respuesta.status).toBe(502);
      expect(respuesta.body.detail).toBe(MENSAJE_FALLA);
      expect(JSON.stringify(respuesta.body)).not.toContain("timeout");
      expect(reembolsarPago).not.toHaveBeenCalled();
      expect(marcarReembolsado).not.toHaveBeenCalled();
    });
  });
});
