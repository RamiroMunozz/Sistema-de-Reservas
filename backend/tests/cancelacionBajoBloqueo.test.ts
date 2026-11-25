import { randomUUID } from "node:crypto";
import jwt from "jsonwebtoken";
import request from "supertest";
import { ID_NEGOCIO_DE_PRUEBA, type RolDePrueba, payloadDePrueba } from "./ayudantes/tokens.js";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

const {
  eventos,
  buscarCanchaFuera,
  leerDentro,
  leerFinal,
  liberarVencidas,
  marcarPagos,
  actualizarReserva,
  expirarPreferencia,
} = vi.hoisted(() => ({
  eventos: [] as string[],
  buscarCanchaFuera: vi.fn(),
  leerDentro: vi.fn(),
  leerFinal: vi.fn(),
  liberarVencidas: vi.fn(),
  marcarPagos: vi.fn(),
  actualizarReserva: vi.fn(),
  expirarPreferencia: vi.fn(),
}));

vi.mock("../src/core/config/prisma.js", () => {
  const transaccion = {
    $executeRaw: async () => 0,
    booking: {
      updateMany: liberarVencidas,
      findUnique: leerDentro,
      findUniqueOrThrow: leerFinal,
      update: actualizarReserva,
    },
    bookingPayment: { updateMany: marcarPagos },
  };

  return {
    prisma: {
      booking: { findUnique: buscarCanchaFuera },
      $transaction: async (
        operacion: (tx: typeof transaccion) => Promise<unknown>,
      ) => {
        const resultado = await operacion(transaccion);
        eventos.push("commit");
        return resultado;
      },
    },
  };
});

vi.mock("../src/core/integraciones/mercadoPago.js", () => ({
  expirarPreferencia,
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
const RUTA_CANCELAR = `/api/v1/bookings/${ID_RESERVA}/cancel`;
const RUTA_ESTADO = `/api/v1/bookings/admin/${ID_RESERVA}/status`;

const conToken = (rol: RolDePrueba) => ({
  Authorization: `Bearer ${jwt.sign(payloadDePrueba(rol, ID_USUARIO), SECRETO_DE_PRUEBA)}`,
});

const reserva = (
  cambios: Partial<{
    status: string;
    userId: string | null;
    mpPreferenceId: string | null;
  }> = {},
) => ({
  id: ID_RESERVA,
  courtId: ID_CANCHA,
  userId: ID_USUARIO,
  status: "CONFIRMED",
  mpPreferenceId: "preferencia-1",
  ...cambios,
});

describe("Cancelación y cambio de estado bajo el bloqueo de la cancha", () => {
  beforeAll(() => {
    vi.stubEnv("JWT_SECRET", SECRETO_DE_PRUEBA);
    vi.spyOn(console, "error").mockImplementation(() => undefined);
  });

  afterAll(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  beforeEach(() => {
    eventos.length = 0;
    for (const simulado of [
      buscarCanchaFuera,
      leerDentro,
      leerFinal,
      liberarVencidas,
      marcarPagos,
      actualizarReserva,
      expirarPreferencia,
    ]) {
      simulado.mockReset();
    }
    buscarCanchaFuera.mockResolvedValue({ courtId: ID_CANCHA });
    liberarVencidas.mockImplementation(async () => {
      eventos.push("liberar");
      return { count: 0 };
    });
    leerDentro.mockImplementation(async () => {
      eventos.push("leer");
      return reserva();
    });
    // Reserva completa: la vista de administrador lee pagos, cancha y titular.
    leerFinal.mockResolvedValue({
      id: ID_RESERVA,
      status: "CANCELLED",
      totalPrice: 1000,
      depositAmount: null,
      expiresAt: null,
      court: { id: ID_CANCHA },
      user: null,
      payments: [],
    });
    marcarPagos.mockResolvedValue({ count: 0 });
    actualizarReserva.mockImplementation(async () => {
      eventos.push("actualizar");
      return {};
    });
    expirarPreferencia.mockImplementation(async () => {
      eventos.push("invalidar");
    });
  });

  describe("PATCH /bookings/:id/cancel (RES-011)", () => {
    it("libera las vencidas primero, cancela bajo el bloqueo e invalida el link después del commit", async () => {
      const respuesta = await request(app)
        .patch(RUTA_CANCELAR)
        .set(conToken("JUGADOR"));

      expect(respuesta.status).toBe(200);
      expect(eventos).toEqual([
        "liberar",
        "leer",
        "actualizar",
        "commit",
        "invalidar",
      ]);
      expect(liberarVencidas.mock.calls[0][0].where.courtId).toBe(ID_CANCHA);
      expect(expirarPreferencia).toHaveBeenCalledWith("preferencia-1");
    });

    it("responde 409 a una reserva PENDING vencida, que ya es EXPIRED al validar", async () => {
      leerDentro.mockImplementation(async () => {
        eventos.push("leer");
        return reserva({ status: "EXPIRED" });
      });

      const respuesta = await request(app)
        .patch(RUTA_CANCELAR)
        .set(conToken("JUGADOR"));

      expect(respuesta.status).toBe(409);
      expect(eventos).toEqual(["liberar", "leer"]);
      expect(marcarPagos).not.toHaveBeenCalled();
      expect(expirarPreferencia).not.toHaveBeenCalled();
    });

    it("no revierte la cancelación si falla Mercado Pago", async () => {
      expirarPreferencia.mockRejectedValue(new Error("Mercado Pago caído"));

      const respuesta = await request(app)
        .patch(RUTA_CANCELAR)
        .set(conToken("JUGADOR"));

      expect(respuesta.status).toBe(200);
      expect(eventos).toContain("commit");
      expect(console.error).toHaveBeenCalled();
    });

    it("no llama a Mercado Pago si la reserva no tiene preferencia guardada", async () => {
      leerDentro.mockImplementation(async () => {
        eventos.push("leer");
        return reserva({ mpPreferenceId: null });
      });

      const respuesta = await request(app)
        .patch(RUTA_CANCELAR)
        .set(conToken("JUGADOR"));

      expect(respuesta.status).toBe(200);
      expect(expirarPreferencia).not.toHaveBeenCalled();
    });

    it("responde 403 a una reserva de invitado y no la cancela", async () => {
      leerDentro.mockImplementation(async () => {
        eventos.push("leer");
        return reserva({ userId: null });
      });

      const respuesta = await request(app)
        .patch(RUTA_CANCELAR)
        .set(conToken("JUGADOR"));

      expect(respuesta.status).toBe(403);
      expect(actualizarReserva).not.toHaveBeenCalled();
      expect(expirarPreferencia).not.toHaveBeenCalled();
    });

    it("responde 404 si la reserva no existe y no abre el bloqueo", async () => {
      buscarCanchaFuera.mockResolvedValue(null);

      const respuesta = await request(app)
        .patch(RUTA_CANCELAR)
        .set(conToken("JUGADOR"));

      expect(respuesta.status).toBe(404);
      expect(eventos).toEqual([]);
    });
  });

  describe("PATCH /bookings/admin/:id/status (RES-015)", () => {
    const pedirEstado = (status: string) =>
      request(app).patch(RUTA_ESTADO).set(conToken("DUENO")).send({ status });

    it("con CANCELLED libera las vencidas primero, cancela e invalida el link después del commit", async () => {
      const respuesta = await pedirEstado("CANCELLED");

      expect(respuesta.status).toBe(200);
      expect(eventos).toEqual([
        "liberar",
        "leer",
        "actualizar",
        "commit",
        "invalidar",
      ]);
      expect(expirarPreferencia).toHaveBeenCalledWith("preferencia-1");
    });

    it("con CANCELLED no revierte la cancelación si falla Mercado Pago", async () => {
      expirarPreferencia.mockRejectedValue(new Error("Mercado Pago caído"));

      const respuesta = await pedirEstado("CANCELLED");

      expect(respuesta.status).toBe(200);
      expect(eventos).toContain("commit");
      expect(console.error).toHaveBeenCalled();
    });

    it("con CANCELLED y sin preferencia guardada no llama a Mercado Pago", async () => {
      leerDentro.mockImplementation(async () => {
        eventos.push("leer");
        return reserva({ mpPreferenceId: null });
      });

      const respuesta = await pedirEstado("CANCELLED");

      expect(respuesta.status).toBe(200);
      expect(expirarPreferencia).not.toHaveBeenCalled();
    });

    it("con otro estado actualiza bajo el bloqueo sin invalidar el link", async () => {
      leerDentro.mockImplementation(async () => {
        eventos.push("leer");
        return reserva({ status: "PENDING" });
      });

      const respuesta = await pedirEstado("CONFIRMED");

      expect(respuesta.status).toBe(200);
      expect(eventos).toEqual(["liberar", "leer", "actualizar", "commit"]);
      expect(actualizarReserva.mock.calls[0][0].data).toEqual({
        status: "CONFIRMED",
      });
      expect(marcarPagos).not.toHaveBeenCalled();
      expect(expirarPreferencia).not.toHaveBeenCalled();
    });

    it("responde 409 al confirmar una reserva PENDING vencida, que ya es EXPIRED al validar", async () => {
      leerDentro.mockImplementation(async () => {
        eventos.push("leer");
        return reserva({ status: "EXPIRED" });
      });

      const respuesta = await pedirEstado("CONFIRMED");

      expect(respuesta.status).toBe(409);
      expect(eventos).toEqual(["liberar", "leer"]);
      expect(actualizarReserva).not.toHaveBeenCalled();
    });

    it("responde 404 si la reserva no existe y no abre el bloqueo", async () => {
      buscarCanchaFuera.mockResolvedValue(null);

      const respuesta = await pedirEstado("CANCELLED");

      expect(respuesta.status).toBe(404);
      expect(eventos).toEqual([]);
    });
  });
});
