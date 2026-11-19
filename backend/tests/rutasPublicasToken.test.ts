import { randomUUID } from "node:crypto";
import { Prisma } from "@prisma/client";
import request from "supertest";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { ServiceUnavailableError } from "../src/core/errors/AppError.js";
import { generarToken, hashearToken } from "../src/modules/public/tokenAcceso.js";

const {
  eventos,
  buscarPorToken,
  actualizarReserva,
  liberarVencidas,
  releerEnTransaccion,
  marcarPagos,
  cancelarReserva,
  crearPreferencia,
  verificarMercadoPago,
  expirarPreferencia,
} = vi.hoisted(() => ({
  eventos: [] as string[],
  buscarPorToken: vi.fn(),
  actualizarReserva: vi.fn(),
  liberarVencidas: vi.fn(),
  releerEnTransaccion: vi.fn(),
  marcarPagos: vi.fn(),
  cancelarReserva: vi.fn(),
  crearPreferencia: vi.fn(),
  verificarMercadoPago: vi.fn(),
  expirarPreferencia: vi.fn(),
}));

vi.mock("../src/core/config/prisma.js", () => {
  const transaccion = {
    $executeRaw: async (partes: TemplateStringsArray) => {
      if (partes.join("?").includes("pg_advisory_xact_lock")) {
        eventos.push("bloqueo-cancha");
      }
      return 0;
    },
    booking: {
      updateMany: liberarVencidas,
      findUnique: releerEnTransaccion,
      update: cancelarReserva,
    },
    bookingPayment: { updateMany: marcarPagos },
  };

  return {
    prisma: {
      booking: { findUnique: buscarPorToken, updateMany: actualizarReserva },
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
  crearPreferencia,
  obtenerVariableMercadoPago: verificarMercadoPago,
  expirarPreferencia,
  obtenerPago: vi.fn(),
  reembolsarPago: vi.fn(),
}));

// Los límites se leen al cargar la app: el de consulta lleva un valor reconocible
// y el de creación otro distinto, para comprobar cuál usa cada ruta.
vi.stubEnv("LIMITE_CONSULTA_PUBLICA_MAXIMO", "7777");
vi.stubEnv("LIMITE_CREACION_PUBLICA_MAXIMO", "1000");

const { default: app } = await import("../src/app.js");

const BASE = "/api/v1/public/bookings";
const TOKEN = generarToken();
const ID_CANCHA = randomUUID();
const ID_RESERVA = randomUUID();
const URL_FRONTEND = "https://front.ejemplo.test";
const MENSAJE_NO_ENCONTRADA = "Reserva no encontrada.";
const MENSAJE_CANCELADA =
  "Esta reserva fue cancelada y no se puede pagar. Realiza una reserva nueva.";
const MINUTOS = 60 * 1000;

const pagoValido = {
  mpPaymentId: "123456789",
  isValid: true,
  refundReason: null,
  refundedAt: null,
  amount: new Prisma.Decimal("300"),
};

const pagoDeMontoIncorrecto = {
  mpPaymentId: "987654321",
  isValid: false,
  refundReason: "AMOUNT_MISMATCH",
  refundedAt: null,
  amount: new Prisma.Decimal("100"),
};

// La fila trae a propósito campos privados: la vista pública debe filtrarlos.
const reserva = (cambios: Record<string, unknown> = {}) => ({
  id: ID_RESERVA,
  courtId: ID_CANCHA,
  userId: null,
  status: "PENDING",
  startTime: new Date("2031-03-10T18:00:00.000Z"),
  endTime: new Date("2031-03-10T19:00:00.000Z"),
  expiresAt: new Date(Date.now() + 10 * MINUTOS),
  totalPrice: new Prisma.Decimal("1000"),
  depositAmount: new Prisma.Decimal("300"),
  guestFirstName: "Ana",
  guestLastName: "Pérez",
  guestPhone: "5491155551234",
  guestEmail: "ana@ejemplo.test",
  accessTokenHash: hashearToken(TOKEN),
  mpPreferenceId: "preferencia-vieja",
  court: { name: "Cancha 1", sport: "PADEL" },
  payments: [] as unknown[],
  ...cambios,
});

const CAMPOS_PUBLICOS = [
  "court",
  "depositAmount",
  "depositStatus",
  "endTime",
  "expiresAt",
  "guestFirstName",
  "refundAtOwnerDiscretion",
  "startTime",
  "status",
  "totalPrice",
];

describe("rutas públicas por token (RES-028, RES-029, PAG-021, PAG-023)", () => {
  beforeAll(() => {
    vi.stubEnv("FRONTEND_URL", URL_FRONTEND);
    vi.spyOn(console, "error").mockImplementation(() => undefined);
  });

  afterAll(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  beforeEach(() => {
    eventos.length = 0;
    for (const simulado of [
      buscarPorToken,
      actualizarReserva,
      liberarVencidas,
      releerEnTransaccion,
      marcarPagos,
      cancelarReserva,
      crearPreferencia,
      verificarMercadoPago,
      expirarPreferencia,
    ]) {
      simulado.mockReset();
    }
    buscarPorToken.mockResolvedValue(reserva());
    actualizarReserva.mockResolvedValue({ count: 1 });
    liberarVencidas.mockImplementation(async () => {
      eventos.push("liberar");
      return { count: 0 };
    });
    releerEnTransaccion.mockImplementation(async () => {
      eventos.push("releer");
      return reserva();
    });
    marcarPagos.mockImplementation(async () => {
      eventos.push("marcar-pagos");
      return { count: 0 };
    });
    cancelarReserva.mockImplementation(async () => {
      eventos.push("cancelar");
      return {};
    });
    crearPreferencia.mockResolvedValue({
      id: "preferencia-nueva",
      initPoint: "https://mp.ejemplo.test/checkout/preferencia-nueva",
      sandboxInitPoint: undefined,
    });
    expirarPreferencia.mockImplementation(async () => {
      eventos.push("invalidar");
    });
  });

  describe("GET /public/bookings/:token (RES-028)", () => {
    it("devuelve solo los campos públicos, sin datos privados ni pagos", async () => {
      buscarPorToken.mockResolvedValue(reserva({ payments: [pagoValido] }));

      const respuesta = await request(app).get(`${BASE}/${TOKEN}`);

      expect(respuesta.status).toBe(200);
      expect(Object.keys(respuesta.body).sort()).toEqual(CAMPOS_PUBLICOS);
      expect(respuesta.body.court).toEqual({ name: "Cancha 1", sport: "PADEL" });
      expect(respuesta.body.guestFirstName).toBe("Ana");
      expect(respuesta.body.totalPrice).toBe(1000);
      expect(respuesta.body.depositAmount).toBe(300);
      expect(respuesta.body.startTime).toBe("2031-03-10T18:00:00.000Z");

      const texto = JSON.stringify(respuesta.body);
      for (const privado of [
        "5491155551234",
        "ana@ejemplo.test",
        hashearToken(TOKEN),
        "123456789",
        "preferencia-vieja",
        ID_CANCHA,
        "Pérez",
      ]) {
        expect(texto).not.toContain(privado);
      }
    });

    it("busca la reserva por el hash SHA-256 del token", async () => {
      await request(app).get(`${BASE}/${TOKEN}`);

      expect(buscarPorToken).toHaveBeenCalledTimes(1);
      expect(buscarPorToken.mock.calls[0][0].where).toEqual({
        accessTokenHash: hashearToken(TOKEN),
      });
    });

    it("informa EXPIRED para una PENDING vencida que el barrido no pasó", async () => {
      buscarPorToken.mockResolvedValue(
        reserva({ expiresAt: new Date(Date.now() - MINUTOS) }),
      );

      const respuesta = await request(app).get(`${BASE}/${TOKEN}`);

      expect(respuesta.body.status).toBe("EXPIRED");
      expect(respuesta.body.refundAtOwnerDiscretion).toBe(false);
    });

    it("informa depositStatus y refundAtOwnerDiscretion de una CONFIRMED con seña pagada", async () => {
      buscarPorToken.mockResolvedValue(
        reserva({ status: "CONFIRMED", expiresAt: null, payments: [pagoValido] }),
      );

      const respuesta = await request(app).get(`${BASE}/${TOKEN}`);

      expect(respuesta.body.status).toBe("CONFIRMED");
      expect(respuesta.body.depositStatus).toBe("PAID");
      expect(respuesta.body.refundAtOwnerDiscretion).toBe(true);
    });

    it("informa PENDING y false para una PENDING sin pago; un AMOUNT_MISMATCH no cuenta (PAG-023)", async () => {
      const sinPago = await request(app).get(`${BASE}/${TOKEN}`);
      expect(sinPago.body.depositStatus).toBe("PENDING");
      expect(sinPago.body.refundAtOwnerDiscretion).toBe(false);

      buscarPorToken.mockResolvedValue(reserva({ payments: [pagoDeMontoIncorrecto] }));
      const conMismatch = await request(app).get(`${BASE}/${TOKEN}`);
      expect(conMismatch.body.depositStatus).toBe("PENDING");
      expect(conMismatch.body.refundAtOwnerDiscretion).toBe(false);
    });

    it("informa depositStatus nulo si la reserva no tiene seña", async () => {
      buscarPorToken.mockResolvedValue(reserva({ depositAmount: null }));

      const respuesta = await request(app).get(`${BASE}/${TOKEN}`);

      expect(respuesta.body.depositStatus).toBeNull();
      expect(respuesta.body.depositAmount).toBeNull();
    });

    it("responde 404 genérico ante un token con formato válido que no existe", async () => {
      buscarPorToken.mockResolvedValue(null);

      const respuesta = await request(app).get(`${BASE}/${TOKEN}`);

      expect(respuesta.status).toBe(404);
      expect(respuesta.body.detail).toBe(MENSAJE_NO_ENCONTRADA);
    });

    it("responde el mismo 404 sin consultar la base ante un formato inválido", async () => {
      const inexistente = await (async () => {
        buscarPorToken.mockResolvedValue(null);
        return request(app).get(`${BASE}/${TOKEN}`);
      })();
      buscarPorToken.mockClear();

      for (const invalido of ["corto", "a".repeat(42), "a".repeat(44), `${"a".repeat(42)}=`]) {
        const respuesta = await request(app).get(`${BASE}/${invalido}`);

        expect(respuesta.status).toBe(404);
        expect(respuesta.body.detail).toBe(inexistente.body.detail);
      }
      expect(buscarPorToken).not.toHaveBeenCalled();
    });
  });

  describe("PATCH /public/bookings/:token/cancel (RES-029)", () => {
    it("libera las vencidas primero, valida bajo el bloqueo y cancela con cancelarEnTransaccion", async () => {
      const respuesta = await request(app).patch(`${BASE}/${TOKEN}/cancel`);

      expect(respuesta.status).toBe(200);
      expect(respuesta.body.status).toBe("CANCELLED");
      expect(eventos.slice(0, 5)).toEqual([
        "bloqueo-cancha",
        "liberar",
        "releer",
        "marcar-pagos",
        "cancelar",
      ]);
      expect(liberarVencidas.mock.calls[0][0].where.courtId).toBe(ID_CANCHA);
      expect(cancelarReserva.mock.calls[0][0]).toMatchObject({
        where: { id: ID_RESERVA },
        data: { status: "CANCELLED", depositPaidAtCancel: false },
      });
    });

    it("invalida el link de pago después del commit", async () => {
      await request(app).patch(`${BASE}/${TOKEN}/cancel`);

      expect(expirarPreferencia).toHaveBeenCalledWith("preferencia-vieja");
      expect(eventos.indexOf("invalidar")).toBeGreaterThan(eventos.indexOf("commit"));
    });

    it("no invalida nada si la reserva no tiene preferencia guardada", async () => {
      releerEnTransaccion.mockResolvedValue(reserva({ mpPreferenceId: null }));

      const respuesta = await request(app).patch(`${BASE}/${TOKEN}/cancel`);

      expect(respuesta.status).toBe(200);
      expect(expirarPreferencia).not.toHaveBeenCalled();
    });

    it("la cancelación no se revierte si Mercado Pago falla", async () => {
      expirarPreferencia.mockRejectedValue(new Error("Mercado Pago caído"));

      const respuesta = await request(app).patch(`${BASE}/${TOKEN}/cancel`);

      expect(respuesta.status).toBe(200);
      expect(respuesta.body.status).toBe("CANCELLED");
    });

    it("refundAtOwnerDiscretion es true cuando la seña estaba pagada al cancelar", async () => {
      releerEnTransaccion.mockResolvedValue(
        reserva({ status: "CONFIRMED", expiresAt: null, payments: [pagoValido] }),
      );
      marcarPagos.mockResolvedValue({ count: 1 });

      const respuesta = await request(app).patch(`${BASE}/${TOKEN}/cancel`);

      expect(respuesta.status).toBe(200);
      expect(respuesta.body.refundAtOwnerDiscretion).toBe(true);
      expect(cancelarReserva.mock.calls[0][0].data.depositPaidAtCancel).toBe(true);
      expect(Object.keys(respuesta.body).sort()).toEqual(CAMPOS_PUBLICOS);
    });

    it("permite cancelar una CONFIRMED sin límite de anticipación", async () => {
      releerEnTransaccion.mockResolvedValue(
        reserva({
          status: "CONFIRMED",
          expiresAt: null,
          startTime: new Date(Date.now() + 10 * MINUTOS),
        }),
      );

      const respuesta = await request(app).patch(`${BASE}/${TOKEN}/cancel`);

      expect(respuesta.status).toBe(200);
    });

    it.each(["CANCELLED", "EXPIRED", "COMPLETED"])(
      "responde 409 y no modifica nada si la reserva está %s",
      async (status) => {
        releerEnTransaccion.mockResolvedValue(reserva({ status }));

        const respuesta = await request(app).patch(`${BASE}/${TOKEN}/cancel`);

        expect(respuesta.status).toBe(409);
        expect(cancelarReserva).not.toHaveBeenCalled();
        expect(marcarPagos).not.toHaveBeenCalled();
        expect(expirarPreferencia).not.toHaveBeenCalled();
      },
    );

    it("responde 409 si la PENDING venció y el bloqueo la pasó a EXPIRED (RES-029)", async () => {
      releerEnTransaccion.mockResolvedValue(
        reserva({ status: "EXPIRED", expiresAt: new Date(Date.now() - MINUTOS) }),
      );

      const respuesta = await request(app).patch(`${BASE}/${TOKEN}/cancel`);

      expect(respuesta.status).toBe(409);
    });

    it("responde 404 genérico ante un token inexistente o inválido, sin abrir la transacción", async () => {
      buscarPorToken.mockResolvedValue(null);

      const inexistente = await request(app).patch(`${BASE}/${TOKEN}/cancel`);
      const invalido = await request(app).patch(`${BASE}/corto/cancel`);

      expect(inexistente.status).toBe(404);
      expect(inexistente.body.detail).toBe(MENSAJE_NO_ENCONTRADA);
      expect(invalido.status).toBe(404);
      expect(invalido.body.detail).toBe(inexistente.body.detail);
      expect(liberarVencidas).not.toHaveBeenCalled();
    });
  });

  describe("POST /public/bookings/:token/payment (PAG-021)", () => {
    it("crea una preferencia nueva que vence con la reserva y devuelve el initPoint", async () => {
      const vigente = reserva();
      buscarPorToken.mockResolvedValue(vigente);

      const respuesta = await request(app).post(`${BASE}/${TOKEN}/payment`);

      expect(respuesta.status).toBe(200);
      expect(respuesta.body).toEqual({
        initPoint: "https://mp.ejemplo.test/checkout/preferencia-nueva",
      });

      const datos = crearPreferencia.mock.calls[0][0];
      expect(datos.idReserva).toBe(ID_RESERVA);
      expect(datos.monto).toBe(300);
      expect(datos.venceEn).toEqual(vigente.expiresAt);
      expect(datos.urlRetorno).toBe(`${URL_FRONTEND}/reserva/${TOKEN}`);
    });

    it("reemplaza la preferencia vigente solo si la reserva sigue pagable y vence la anterior", async () => {
      await request(app).post(`${BASE}/${TOKEN}/payment`);

      const { where, data } = actualizarReserva.mock.calls[0][0];

      expect(where).toMatchObject({
        id: ID_RESERVA,
        mpPreferenceId: "preferencia-vieja",
        status: "PENDING",
        payments: { none: { isValid: true, refundedAt: null } },
      });
      expect(where.expiresAt.gt).toBeInstanceOf(Date);
      expect(data).toEqual({ mpPreferenceId: "preferencia-nueva" });
      expect(expirarPreferencia).toHaveBeenCalledWith("preferencia-vieja");
    });

    it("no modifica expiresAt", async () => {
      await request(app).post(`${BASE}/${TOKEN}/payment`);

      expect(JSON.stringify(actualizarReserva.mock.calls)).not.toContain("expiresAt\":\"");
      expect(actualizarReserva.mock.calls[0][0].data).not.toHaveProperty("expiresAt");
    });

    it("permite reintentar tras un pago AMOUNT_MISMATCH", async () => {
      buscarPorToken.mockResolvedValue(reserva({ payments: [pagoDeMontoIncorrecto] }));

      const respuesta = await request(app).post(`${BASE}/${TOKEN}/payment`);

      expect(respuesta.status).toBe(200);
      expect(crearPreferencia).toHaveBeenCalledTimes(1);
    });

    it("responde 409 sin crear preferencia si ya hay un pago válido", async () => {
      buscarPorToken.mockResolvedValue(reserva({ payments: [pagoValido] }));

      const respuesta = await request(app).post(`${BASE}/${TOKEN}/payment`);

      expect(respuesta.status).toBe(409);
      expect(respuesta.body.detail).toBe("Esta reserva no se puede pagar.");
      expect(crearPreferencia).not.toHaveBeenCalled();
    });

    it.each([
      ["CONFIRMED", "Esta reserva no se puede pagar."],
      ["COMPLETED", "Esta reserva no se puede pagar."],
      ["EXPIRED", "Esta reserva no se puede pagar."],
      ["CANCELLED", MENSAJE_CANCELADA],
    ])(
      "responde 409 sin crear preferencia si la reserva está %s",
      async (status, mensaje) => {
        buscarPorToken.mockResolvedValue(reserva({ status }));

        const respuesta = await request(app).post(`${BASE}/${TOKEN}/payment`);

        expect(respuesta.status).toBe(409);
        expect(respuesta.body.detail).toBe(mensaje);
        expect(crearPreferencia).not.toHaveBeenCalled();
      },
    );

    it("responde 409 si la PENDING ya venció aunque el barrido no la pasó a EXPIRED", async () => {
      buscarPorToken.mockResolvedValue(
        reserva({ expiresAt: new Date(Date.now() - MINUTOS) }),
      );

      const respuesta = await request(app).post(`${BASE}/${TOKEN}/payment`);

      expect(respuesta.status).toBe(409);
      expect(crearPreferencia).not.toHaveBeenCalled();
    });

    it("responde 409 y no entrega el link si la reserva cambió durante el reemplazo", async () => {
      buscarPorToken
        .mockResolvedValueOnce(reserva())
        .mockResolvedValueOnce({ status: "PENDING" });
      actualizarReserva.mockResolvedValue({ count: 0 });

      const respuesta = await request(app).post(`${BASE}/${TOKEN}/payment`);

      expect(respuesta.status).toBe(409);
      expect(respuesta.body.detail).toBe(
        "La reserva cambió mientras se generaba el pago. Intenta de nuevo.",
      );
      expect(respuesta.body.initPoint).toBeUndefined();
      expect(expirarPreferencia).toHaveBeenCalledWith("preferencia-nueva");
    });

    it("responde 409 con el aviso de cancelada si se canceló durante el reemplazo", async () => {
      buscarPorToken
        .mockResolvedValueOnce(reserva())
        .mockResolvedValueOnce({ status: "CANCELLED" });
      actualizarReserva.mockResolvedValue({ count: 0 });

      const respuesta = await request(app).post(`${BASE}/${TOKEN}/payment`);

      expect(respuesta.status).toBe(409);
      expect(respuesta.body.detail).toBe(MENSAJE_CANCELADA);
    });

    it("entrega el initPoint aunque Mercado Pago falle al expirar la preferencia anterior", async () => {
      expirarPreferencia.mockRejectedValue(new Error("Mercado Pago caído"));

      const respuesta = await request(app).post(`${BASE}/${TOKEN}/payment`);

      expect(respuesta.status).toBe(200);
      expect(respuesta.body.initPoint).toBe(
        "https://mp.ejemplo.test/checkout/preferencia-nueva",
      );
    });

    it("responde 502 sin escribir si Mercado Pago no crea la preferencia", async () => {
      crearPreferencia.mockRejectedValue(new Error("Mercado Pago caído"));

      const respuesta = await request(app).post(`${BASE}/${TOKEN}/payment`);

      expect(respuesta.status).toBe(502);
      expect(actualizarReserva).not.toHaveBeenCalled();
    });

    it("responde 503 sin crear preferencia si falta la configuración de Mercado Pago", async () => {
      verificarMercadoPago.mockImplementation(() => {
        throw new ServiceUnavailableError("Mercado Pago no está configurado.");
      });

      const respuesta = await request(app).post(`${BASE}/${TOKEN}/payment`);

      expect(respuesta.status).toBe(503);
      expect(crearPreferencia).not.toHaveBeenCalled();
    });

    it("responde 404 genérico ante un token inexistente o inválido", async () => {
      buscarPorToken.mockResolvedValue(null);

      const inexistente = await request(app).post(`${BASE}/${TOKEN}/payment`);
      const invalido = await request(app).post(`${BASE}/${"a".repeat(44)}/payment`);

      expect(inexistente.status).toBe(404);
      expect(inexistente.body.detail).toBe(MENSAJE_NO_ENCONTRADA);
      expect(invalido.status).toBe(404);
      expect(invalido.body.detail).toBe(inexistente.body.detail);
      expect(crearPreferencia).not.toHaveBeenCalled();
    });
  });

  describe("limitador de consulta (PAG-023)", () => {
    it("las tres rutas por token usan limitadorConsultaPublica y no el de creación", async () => {
      const respuestas = [
        await request(app).get(`${BASE}/${TOKEN}`),
        await request(app).patch(`${BASE}/${TOKEN}/cancel`),
        await request(app).post(`${BASE}/${TOKEN}/payment`),
      ];

      for (const respuesta of respuestas) {
        expect(String(respuesta.headers["ratelimit-policy"])).toContain("7777");
      }
    });
  });
});
