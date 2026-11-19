import { createHmac, randomUUID } from "node:crypto";
import request from "supertest";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

const {
  buscarReserva,
  actualizarReservas,
  contarReservas,
  buscarPagoPorId,
  buscarPagoValido,
  crearPago,
  obtenerPago,
} = vi.hoisted(() => ({
  buscarReserva: vi.fn(),
  actualizarReservas: vi.fn(),
  contarReservas: vi.fn(),
  buscarPagoPorId: vi.fn(),
  buscarPagoValido: vi.fn(),
  crearPago: vi.fn(),
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
        booking: {
          findUnique: buscarReserva,
          updateMany: actualizarReservas,
          count: contarReservas,
        },
        bookingPayment: {
          findUnique: buscarPagoPorId,
          findFirst: buscarPagoValido,
          create: crearPago,
        },
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
  depositAmount: null,
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

const confirmacion = (estado: string) => ({
  where: { id: ID_RESERVA, status: estado },
  data: { status: "CONFIRMED", paymentMethod: "MERCADOPAGO" },
});

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
    contarReservas.mockReset();
    buscarPagoPorId.mockReset();
    buscarPagoValido.mockReset();
    crearPago.mockReset();
    obtenerPago.mockReset();
    vi.mocked(console.warn).mockClear();
    actualizarReservas.mockResolvedValue({ count: 1 });
    contarReservas.mockResolvedValue(0);
    buscarPagoPorId.mockResolvedValue(null);
    buscarPagoValido.mockResolvedValue(null);
    crearPago.mockResolvedValue({});
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
    it("rama 1: un pago ya registrado no escribe nada (idempotencia)", async () => {
      obtenerPago.mockResolvedValue(pago("approved"));
      buscarReserva.mockResolvedValue(reserva("CONFIRMED"));
      buscarPagoPorId.mockResolvedValue({ id: randomUUID() });

      const respuesta = await enviarFirmado();

      expect(respuesta.status).toBe(200);
      expect(buscarPagoPorId).toHaveBeenCalledWith({
        where: { mpPaymentId: ID_PAGO },
      });
      expect(crearPago).not.toHaveBeenCalled();
      expect(actualizarReservas).not.toHaveBeenCalled();
    });

    it("rama 2: una reserva inexistente avisa y no registra el pago", async () => {
      obtenerPago.mockResolvedValue(pago("approved"));
      buscarReserva.mockResolvedValue(null);

      const respuesta = await enviarFirmado();

      expect(respuesta.status).toBe(200);
      expect(crearPago).not.toHaveBeenCalled();
      expect(actualizarReservas).not.toHaveBeenCalled();
      const advertencia = String(vi.mocked(console.warn).mock.calls[0]?.[0]);
      expect(advertencia).toContain(ID_RESERVA);
      expect(advertencia).toContain(ID_PAGO);
      expect(advertencia).toContain("requiere revisión manual");
    });

    it("rama 3: sin monto relee el pago una vez y, si sigue sin monto, avisa y no registra", async () => {
      obtenerPago.mockResolvedValue({
        status: "approved",
        external_reference: ID_RESERVA,
      });
      buscarReserva.mockResolvedValue(reserva("PENDING"));

      const respuesta = await enviarFirmado();

      expect(respuesta.status).toBe(200);
      expect(obtenerPago).toHaveBeenCalledTimes(2);
      expect(crearPago).not.toHaveBeenCalled();
      expect(actualizarReservas).not.toHaveBeenCalled();
      expect(console.warn).toHaveBeenCalledWith(
        expect.stringContaining("requiere revisión manual"),
      );
    });

    it("rama 3: si la relectura trae el monto, registra el pago", async () => {
      obtenerPago
        .mockResolvedValueOnce({
          status: "approved",
          external_reference: ID_RESERVA,
        })
        .mockResolvedValueOnce(pago("approved"));
      buscarReserva.mockResolvedValue(reserva("PENDING"));

      const respuesta = await enviarFirmado();

      expect(respuesta.status).toBe(200);
      expect(obtenerPago).toHaveBeenCalledTimes(2);
      expect(crearPago).toHaveBeenCalledWith({
        data: expect.objectContaining({ mpPaymentId: ID_PAGO, isValid: true }),
      });
    });

    it.each(["vigente", "vencida sin barrer"])(
      "rama 6: confirma una PENDING %s sin liberar vencidas antes",
      async () => {
        obtenerPago.mockResolvedValue(pago("approved"));
        buscarReserva.mockResolvedValue(reserva("PENDING"));

        const respuesta = await enviarFirmado();

        expect(respuesta.status).toBe(200);
        expect(crearPago).toHaveBeenCalledWith({
          data: {
            bookingId: ID_RESERVA,
            mpPaymentId: ID_PAGO,
            amount: 1000,
            isValid: true,
          },
        });
        expect(actualizarReservas).toHaveBeenCalledTimes(1);
        expect(actualizarReservas).toHaveBeenCalledWith(confirmacion("PENDING"));
      },
    );

    it("rama 6: el monto esperado de una reserva de invitado es la seña", async () => {
      obtenerPago.mockResolvedValue(pago("approved", 300));
      buscarReserva.mockResolvedValue({
        ...reserva("PENDING"),
        depositAmount: "300.00",
      });

      const respuesta = await enviarFirmado();

      expect(respuesta.status).toBe(200);
      expect(crearPago).toHaveBeenCalledWith({
        data: expect.objectContaining({ amount: 300, isValid: true }),
      });
      expect(actualizarReservas).toHaveBeenCalledWith(confirmacion("PENDING"));
    });

    it("rama 7: una CONFIRMED en efectivo sin pago válido registra el pago y pasa a MERCADOPAGO", async () => {
      obtenerPago.mockResolvedValue(pago("approved"));
      buscarReserva.mockResolvedValue({
        ...reserva("CONFIRMED"),
        paymentMethod: "CASH",
      });

      const respuesta = await enviarFirmado();

      expect(respuesta.status).toBe(200);
      expect(buscarPagoValido).toHaveBeenCalledWith({
        where: { bookingId: ID_RESERVA, isValid: true, refundedAt: null },
      });
      expect(crearPago).toHaveBeenCalledWith({
        data: expect.objectContaining({ mpPaymentId: ID_PAGO, isValid: true }),
      });
      expect(actualizarReservas).toHaveBeenCalledWith({
        where: { id: ID_RESERVA, status: "CONFIRMED" },
        data: { paymentMethod: "MERCADOPAGO" },
      });
    });

    it("rama 9 con turno libre: libera vencidas, cuenta solapadas y reactiva la EXPIRED", async () => {
      obtenerPago.mockResolvedValue(pago("approved"));
      const expirada = reserva("EXPIRED");
      buscarReserva.mockResolvedValue(expirada);
      contarReservas.mockResolvedValue(0);

      const respuesta = await enviarFirmado();

      expect(respuesta.status).toBe(200);
      expect(actualizarReservas).toHaveBeenNthCalledWith(
        1,
        expect.objectContaining({
          where: expect.objectContaining({
            courtId: expirada.courtId,
            status: "PENDING",
          }),
          data: { status: "EXPIRED" },
        }),
      );
      expect(contarReservas).toHaveBeenCalledWith({
        where: expect.objectContaining({
          courtId: expirada.courtId,
          id: { not: ID_RESERVA },
          startTime: { lt: expirada.endTime },
          endTime: { gt: expirada.startTime },
          status: { notIn: ["CANCELLED", "EXPIRED"] },
        }),
      });
      expect(crearPago).toHaveBeenCalledWith({
        data: expect.objectContaining({ mpPaymentId: ID_PAGO, isValid: true }),
      });
      expect(actualizarReservas).toHaveBeenLastCalledWith(
        confirmacion("EXPIRED"),
      );
    });

    it.each(["rejected", "cancelled", "pending", "in_process"])(
      "PAG-016: un pago %s no escribe nada",
      async (estadoPago) => {
        obtenerPago.mockResolvedValue(pago(estadoPago));
        buscarReserva.mockResolvedValue(reserva("PENDING"));

        const respuesta = await enviarFirmado();

        expect(respuesta.status).toBe(200);
        expect(crearPago).not.toHaveBeenCalled();
        expect(actualizarReservas).not.toHaveBeenCalled();
      },
    );

    it("responde 500 para que se reintente si falla otro error de base", async () => {
      obtenerPago.mockResolvedValue(pago("approved"));
      buscarReserva.mockResolvedValue(reserva("PENDING"));
      crearPago.mockRejectedValue(new Error("base no disponible"));
      vi.spyOn(console, "error").mockImplementation(() => undefined);

      const respuesta = await enviarFirmado();

      expect(respuesta.status).toBe(500);
    });

    it("no clasifica en esta entrega los casos de reembolso: avisa y no escribe", async () => {
      obtenerPago.mockResolvedValue(pago("approved", 1));
      buscarReserva.mockResolvedValue(reserva("PENDING"));

      const respuesta = await enviarFirmado();

      expect(respuesta.status).toBe(200);
      expect(crearPago).not.toHaveBeenCalled();
      expect(actualizarReservas).not.toHaveBeenCalled();
      expect(console.warn).toHaveBeenCalledWith(
        expect.stringContaining("requiere revisión manual"),
      );
    });
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
  });
});
