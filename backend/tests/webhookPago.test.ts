import { createHmac, randomUUID } from "node:crypto";
import request from "supertest";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

const { buscarReserva, actualizarReservas, obtenerPago } = vi.hoisted(() => ({
  buscarReserva: vi.fn(),
  actualizarReservas: vi.fn(),
  obtenerPago: vi.fn(),
}));

vi.mock("../src/core/config/prisma.js", () => ({
  prisma: {
    booking: {
      findUnique: buscarReserva,
      updateMany: actualizarReservas,
    },
    $transaction: (operacion: (transaccion: unknown) => Promise<unknown>) =>
      operacion({
        $executeRaw: async () => 0,
        booking: { updateMany: actualizarReservas },
      }),
  },
}));

vi.mock("mercadopago", async (importarOriginal) => ({
  ...(await importarOriginal<typeof import("mercadopago")>()),
  MercadoPagoConfig: class {},
  Payment: class {
    get = obtenerPago;
  },
}));

const { default: app } = await import("../src/app.js");

const SECRETO_WEBHOOK = "secreto_webhook_de_prueba";
const ID_PAGO = "123456789";
const ID_REQUEST = "pedido-1";
const ID_RESERVA = randomUUID();
const RUTA = `/api/v1/payments/webhook?data.id=${ID_PAGO}&type=payment`;

const firmar = (dataId = ID_PAGO, secreto = SECRETO_WEBHOOK) => {
  const ts = "1704908010";
  const manifiesto = `id:${dataId};request-id:${ID_REQUEST};ts:${ts};`;
  const firma = createHmac("sha256", secreto).update(manifiesto).digest("hex");
  return { "x-signature": `ts=${ts},v1=${firma}`, "x-request-id": ID_REQUEST };
};

const reserva = (status: string) => ({
  id: ID_RESERVA,
  courtId: randomUUID(),
  status,
  totalPrice: 1000,
  startTime: new Date("2026-12-01T10:00:00.000Z"),
  endTime: new Date("2026-12-01T11:00:00.000Z"),
});

const pago = (status: string, monto = 1000) => ({
  status,
  transaction_amount: monto,
  external_reference: ID_RESERVA,
});

const enviarFirmado = () =>
  request(app).post(RUTA).set(firmar()).send({ type: "payment" });

describe("POST /payments/webhook", () => {
  beforeAll(() => {
    vi.stubEnv("MERCADOPAGO_WEBHOOK_SECRET", SECRETO_WEBHOOK);
    vi.stubEnv("MERCADOPAGO_ACCESS_TOKEN", "token_de_prueba");
    vi.spyOn(console, "warn").mockImplementation(() => undefined);
  });

  afterAll(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  beforeEach(() => {
    buscarReserva.mockReset();
    actualizarReservas.mockReset();
    obtenerPago.mockReset();
    actualizarReservas.mockResolvedValue({ count: 1 });
  });

  describe("firma", () => {
    it("rechaza con 401 un pedido sin firma y no consulta el pago", async () => {
      const respuesta = await request(app).post(RUTA).send({ type: "payment" });

      expect(respuesta.status).toBe(401);
      expect(obtenerPago).not.toHaveBeenCalled();
    });

    it("rechaza con 401 una firma hecha con otro secreto", async () => {
      const respuesta = await request(app)
        .post(RUTA)
        .set(firmar(ID_PAGO, "otro_secreto"))
        .send({ type: "payment" });

      expect(respuesta.status).toBe(401);
      expect(respuesta.body.detail).toBe("Firma de webhook inválida.");
      expect(obtenerPago).not.toHaveBeenCalled();
    });

    it("rechaza con 401 una firma válida de otro pago", async () => {
      const respuesta = await request(app)
        .post(RUTA)
        .set(firmar("999"))
        .send({ type: "payment" });

      expect(respuesta.status).toBe(401);
      expect(obtenerPago).not.toHaveBeenCalled();
    });

    it("rechaza con 401 si el secreto no está configurado", async () => {
      vi.stubEnv("MERCADOPAGO_WEBHOOK_SECRET", "");

      const respuesta = await enviarFirmado();

      vi.stubEnv("MERCADOPAGO_WEBHOOK_SECRET", SECRETO_WEBHOOK);
      expect(respuesta.status).toBe(401);
      expect(obtenerPago).not.toHaveBeenCalled();
    });

    it("procesa solo el ID firmado de la URL e ignora el del cuerpo", async () => {
      obtenerPago.mockResolvedValue(pago("pending"));

      const respuesta = await request(app)
        .post(RUTA)
        .set(firmar())
        .send({ type: "payment", data: { id: "999" } });

      expect(respuesta.status).toBe(200);
      expect(obtenerPago).toHaveBeenCalledWith({ id: ID_PAGO });
    });
  });

  describe("pago aprobado", () => {
    it.each(["PENDING", "CONFIRMED"])(
      "confirma una reserva en estado %s si el monto coincide",
      async (estado) => {
        obtenerPago.mockResolvedValue(pago("approved"));
        buscarReserva.mockResolvedValue(reserva(estado));

        const respuesta = await enviarFirmado();

        expect(respuesta.status).toBe(200);
        expect(actualizarReservas).toHaveBeenCalledWith({
          where: { id: ID_RESERVA, status: estado },
          data: { status: "CONFIRMED", paymentMethod: "TRANSFER" },
        });
      },
    );

    it("no confirma si el monto no coincide", async () => {
      obtenerPago.mockResolvedValue(pago("approved", 1));
      buscarReserva.mockResolvedValue(reserva("PENDING"));

      const respuesta = await enviarFirmado();

      expect(respuesta.status).toBe(200);
      expect(actualizarReservas).not.toHaveBeenCalled();
    });

    it("no reconfirma una reserva cancelada si el turno ya está ocupado", async () => {
      obtenerPago.mockResolvedValue(pago("approved"));
      buscarReserva.mockResolvedValue(reserva("CANCELLED"));
      actualizarReservas.mockRejectedValue(
        new Error('viola la restricción "bookings_sin_solapamiento"'),
      );

      const respuesta = await enviarFirmado();

      expect(respuesta.status).toBe(200);
      expect(console.warn).toHaveBeenCalledWith(
        expect.stringContaining("requiere revisión manual"),
      );
    });

    it("reconfirma una reserva cancelada si el turno sigue libre", async () => {
      obtenerPago.mockResolvedValue(pago("approved"));
      buscarReserva.mockResolvedValue(reserva("CANCELLED"));

      const respuesta = await enviarFirmado();

      expect(respuesta.status).toBe(200);
      expect(actualizarReservas).toHaveBeenCalledWith({
        where: { id: ID_RESERVA, status: "CANCELLED" },
        data: { status: "CONFIRMED", paymentMethod: "TRANSFER" },
      });
    });

    it("responde 500 para que se reintente si falla otro error de base", async () => {
      obtenerPago.mockResolvedValue(pago("approved"));
      buscarReserva.mockResolvedValue(reserva("PENDING"));
      actualizarReservas.mockRejectedValue(new Error("base no disponible"));
      vi.spyOn(console, "error").mockImplementation(() => undefined);

      const respuesta = await enviarFirmado();

      expect(respuesta.status).toBe(500);
    });

    it("no modifica una reserva ya completada", async () => {
      obtenerPago.mockResolvedValue(pago("approved"));
      buscarReserva.mockResolvedValue(reserva("COMPLETED"));

      const respuesta = await enviarFirmado();

      expect(respuesta.status).toBe(200);
      expect(actualizarReservas).not.toHaveBeenCalled();
    });
  });

  describe("pago rechazado o cancelado", () => {
    it.each(["rejected", "cancelled"])(
      "cancela solo reservas activas cuando el pago está %s",
      async (estadoPago) => {
        obtenerPago.mockResolvedValue(pago(estadoPago));

        const respuesta = await enviarFirmado();

        expect(respuesta.status).toBe(200);
        expect(actualizarReservas).toHaveBeenCalledWith({
          where: {
            id: ID_RESERVA,
            status: { in: ["PENDING", "CONFIRMED"] },
          },
          data: { status: "CANCELLED" },
        });
      },
    );
  });

  describe("notificaciones que no aplican", () => {
    it("responde 200 sin consultar el pago si el evento no es de pago", async () => {
      const respuesta = await request(app)
        .post(`/api/v1/payments/webhook?data.id=${ID_PAGO}&type=plan`)
        .set(firmar())
        .send({ type: "plan" });

      expect(respuesta.status).toBe(200);
      expect(respuesta.body).toEqual({ received: true });
      expect(obtenerPago).not.toHaveBeenCalled();
    });

    it("responde 200 sin consultar el pago si el ID firmado no es numérico", async () => {
      const respuesta = await request(app)
        .post("/api/v1/payments/webhook?data.id=1%3Brequest-id%3Ax&type=payment")
        .set(firmar("1;request-id:x"))
        .send({ type: "payment" });

      expect(respuesta.status).toBe(200);
      expect(obtenerPago).not.toHaveBeenCalled();
    });

    it("responde 200 sin cambios si el pago no referencia una reserva válida", async () => {
      obtenerPago.mockResolvedValue({
        status: "approved",
        external_reference: "otra-referencia",
      });

      const respuesta = await enviarFirmado();

      expect(respuesta.status).toBe(200);
      expect(buscarReserva).not.toHaveBeenCalled();
      expect(actualizarReservas).not.toHaveBeenCalled();
    });

    it("responde 200 sin cambios si la reserva no existe", async () => {
      obtenerPago.mockResolvedValue(pago("approved"));
      buscarReserva.mockResolvedValue(null);

      const respuesta = await enviarFirmado();

      expect(respuesta.status).toBe(200);
      expect(actualizarReservas).not.toHaveBeenCalled();
    });
  });
});
