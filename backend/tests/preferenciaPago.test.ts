import { randomUUID } from "node:crypto";
import jwt from "jsonwebtoken";
import request from "supertest";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

const {
  buscarReserva,
  actualizarReservas,
  crearPreferencia,
  obtenerPreferencia,
  actualizarPreferencia,
} = vi.hoisted(() => ({
  buscarReserva: vi.fn(),
  actualizarReservas: vi.fn(),
  crearPreferencia: vi.fn(),
  obtenerPreferencia: vi.fn(),
  actualizarPreferencia: vi.fn(),
}));

vi.mock("../src/core/config/prisma.js", () => ({
  prisma: {
    booking: { findUnique: buscarReserva, updateMany: actualizarReservas },
  },
}));

vi.mock("mercadopago", () => ({
  MercadoPagoConfig: class {},
  Preference: class {
    create = crearPreferencia;
    get = obtenerPreferencia;
    update = actualizarPreferencia;
  },
  Payment: class {},
}));

const { default: app } = await import("../src/app.js");

const SECRETO_DE_PRUEBA = "secreto_de_prueba";
const RUTA = "/api/v1/payments/create-preference";
const ID_DUENO = randomUUID();
const ID_RESERVA = randomUUID();

const conToken = (userId: string) => ({
  Authorization: `Bearer ${jwt.sign({ userId, role: "USER" }, SECRETO_DE_PRUEBA)}`,
});

const reserva = (status: string, mpPreferenceId: string | null = null) => ({
  id: ID_RESERVA,
  userId: ID_DUENO,
  status,
  mpPreferenceId,
  totalPrice: 1000,
  court: { name: "Cancha 1", sport: "PADEL" },
  user: { email: "dueno@example.com" },
});

describe("POST /payments/create-preference", () => {
  beforeAll(() => {
    vi.stubEnv("JWT_SECRET", SECRETO_DE_PRUEBA);
    vi.stubEnv("BACKEND_URL", "https://api.ejemplo.test");
    vi.stubEnv("MERCADOPAGO_ACCESS_TOKEN", "token_de_prueba");
    vi.stubEnv("MERCADOPAGO_WEBHOOK_SECRET", "secreto_webhook_de_prueba");
  });

  afterAll(() => {
    vi.unstubAllEnvs();
  });

  beforeEach(() => {
    buscarReserva.mockReset();
    actualizarReservas.mockReset();
    crearPreferencia.mockReset();
    obtenerPreferencia.mockReset();
    actualizarPreferencia.mockReset();
    actualizarReservas.mockResolvedValue({ count: 1 });
    obtenerPreferencia.mockResolvedValue({ id: "vieja", items: [] });
    actualizarPreferencia.mockResolvedValue({});
    crearPreferencia.mockResolvedValue({
      id: "preferencia-1",
      init_point: "https://mp.test/pago",
      sandbox_init_point: "https://mp.test/sandbox",
    });
  });

  it("rechaza con 401 un pedido sin token y no genera el cobro", async () => {
    buscarReserva.mockResolvedValue(reserva("CONFIRMED"));

    const respuesta = await request(app)
      .post(RUTA)
      .send({ bookingId: ID_RESERVA });

    expect(respuesta.status).toBe(401);
    expect(crearPreferencia).not.toHaveBeenCalled();
  });

  it("rechaza con 403 a quien no es dueño de la reserva y no genera el cobro", async () => {
    buscarReserva.mockResolvedValue(reserva("CONFIRMED"));

    const respuesta = await request(app)
      .post(RUTA)
      .set(conToken(randomUUID()))
      .send({ bookingId: ID_RESERVA });

    expect(respuesta.status).toBe(403);
    expect(respuesta.body.detail).toBe(
      "No tienes autorización para pagar esta reserva.",
    );
    expect(crearPreferencia).not.toHaveBeenCalled();
  });

  it("rechaza con 409 una reserva CANCELLED, indica reservar de nuevo y no genera el cobro (PAG-004)", async () => {
    buscarReserva.mockResolvedValue(reserva("CANCELLED"));

    const respuesta = await request(app)
      .post(RUTA)
      .set(conToken(ID_DUENO))
      .send({ bookingId: ID_RESERVA });

    expect(respuesta.status).toBe(409);
    expect(respuesta.body.detail).toBe(
      "Esta reserva fue cancelada y no se puede pagar. Realiza una reserva nueva.",
    );
    expect(crearPreferencia).not.toHaveBeenCalled();
    expect(actualizarReservas).not.toHaveBeenCalled();
  });

  it.each(["COMPLETED", "EXPIRED"])(
    "rechaza con 409 una reserva en estado %s y no genera el cobro (PAG-004)",
    async (estado) => {
      buscarReserva.mockResolvedValue(reserva(estado));

      const respuesta = await request(app)
        .post(RUTA)
        .set(conToken(ID_DUENO))
        .send({ bookingId: ID_RESERVA });

      expect(respuesta.status).toBe(409);
      expect(respuesta.body.detail).toBe("Esta reserva no se puede pagar.");
      expect(crearPreferencia).not.toHaveBeenCalled();
      expect(actualizarReservas).not.toHaveBeenCalled();
    },
  );

  it("responde 404 si la reserva no existe", async () => {
    buscarReserva.mockResolvedValue(null);

    const respuesta = await request(app)
      .post(RUTA)
      .set(conToken(ID_DUENO))
      .send({ bookingId: ID_RESERVA });

    expect(respuesta.status).toBe(404);
    expect(respuesta.body.detail).toBe("Reserva no encontrada");
  });

  it("responde 400 si el bookingId no es un UUID", async () => {
    const respuesta = await request(app)
      .post(RUTA)
      .set(conToken(ID_DUENO))
      .send({ bookingId: "no-es-uuid" });

    expect(respuesta.status).toBe(400);
    expect(buscarReserva).not.toHaveBeenCalled();
  });

  it("responde 400 si falta el bookingId", async () => {
    const respuesta = await request(app)
      .post(RUTA)
      .set(conToken(ID_DUENO))
      .send({});

    expect(respuesta.status).toBe(400);
  });

  it.each(["CONFIRMED", "PENDING"])(
    "genera el cobro para el dueño de una reserva en estado %s",
    async (estado) => {
      buscarReserva.mockResolvedValue(reserva(estado));

      const respuesta = await request(app)
        .post(RUTA)
        .set(conToken(ID_DUENO))
        .send({ bookingId: ID_RESERVA });

      expect(respuesta.status).toBe(200);
      expect(respuesta.body).toEqual({
        initPoint: "https://mp.test/pago",
        sandboxInitPoint: "https://mp.test/sandbox",
        preferenceId: "preferencia-1",
      });
      expect(crearPreferencia).toHaveBeenCalledOnce();
    },
  );

  it("arma notification_url desde BACKEND_URL", async () => {
    buscarReserva.mockResolvedValue(reserva("CONFIRMED"));

    await request(app)
      .post(RUTA)
      .set(conToken(ID_DUENO))
      .send({ bookingId: ID_RESERVA });

    expect(crearPreferencia.mock.calls[0][0].body.notification_url).toBe(
      "https://api.ejemplo.test/api/v1/payments/webhook?source_news=webhooks",
    );
  });

  it("no genera el cobro si falta BACKEND_URL", async () => {
    vi.stubEnv("BACKEND_URL", "");
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    buscarReserva.mockResolvedValue(reserva("CONFIRMED"));

    const respuesta = await request(app)
      .post(RUTA)
      .set(conToken(ID_DUENO))
      .send({ bookingId: ID_RESERVA });

    vi.stubEnv("BACKEND_URL", "https://api.ejemplo.test");
    expect(respuesta.status).toBe(500);
    expect(crearPreferencia).not.toHaveBeenCalled();
  });

  it("no genera el cobro si falta MERCADOPAGO_WEBHOOK_SECRET", async () => {
    vi.stubEnv("MERCADOPAGO_WEBHOOK_SECRET", "");
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    buscarReserva.mockResolvedValue(reserva("CONFIRMED"));

    const respuesta = await request(app)
      .post(RUTA)
      .set(conToken(ID_DUENO))
      .send({ bookingId: ID_RESERVA });

    vi.stubEnv("MERCADOPAGO_WEBHOOK_SECRET", "secreto_webhook_de_prueba");
    expect(respuesta.status).toBe(503);
    expect(respuesta.body.detail).toBe(
      "Los pagos con Mercado Pago no están configurados.",
    );
    expect(crearPreferencia).not.toHaveBeenCalled();
  });

  it("no genera el cobro si falta MERCADOPAGO_ACCESS_TOKEN", async () => {
    vi.stubEnv("MERCADOPAGO_ACCESS_TOKEN", "");
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    buscarReserva.mockResolvedValue(reserva("CONFIRMED"));

    const respuesta = await request(app)
      .post(RUTA)
      .set(conToken(ID_DUENO))
      .send({ bookingId: ID_RESERVA });

    vi.stubEnv("MERCADOPAGO_ACCESS_TOKEN", "token_de_prueba");
    expect(respuesta.status).toBe(503);
    expect(respuesta.body.detail).toBe(
      "Los pagos con Mercado Pago no están configurados.",
    );
    expect(crearPreferencia).not.toHaveBeenCalled();
  });

  describe("preferencia vigente de la reserva (PAG-025)", () => {
    it("guarda el id de la preferencia en una reserva sin preferencia previa", async () => {
      buscarReserva.mockResolvedValue(reserva("PENDING"));

      const respuesta = await request(app)
        .post(RUTA)
        .set(conToken(ID_DUENO))
        .send({ bookingId: ID_RESERVA });

      expect(respuesta.status).toBe(200);
      expect(actualizarReservas).toHaveBeenCalledWith({
        where: {
          id: ID_RESERVA,
          mpPreferenceId: null,
          status: { in: ["PENDING", "CONFIRMED"] },
        },
        data: { mpPreferenceId: "preferencia-1" },
      });
      expect(actualizarPreferencia).not.toHaveBeenCalled();
    });

    it("guarda la preferencia nueva y vence la anterior", async () => {
      buscarReserva.mockResolvedValue(reserva("CONFIRMED", "vieja"));

      const respuesta = await request(app)
        .post(RUTA)
        .set(conToken(ID_DUENO))
        .send({ bookingId: ID_RESERVA });

      expect(respuesta.status).toBe(200);
      expect(respuesta.body.preferenceId).toBe("preferencia-1");
      expect(actualizarReservas.mock.calls[0][0].where.mpPreferenceId).toBe(
        "vieja",
      );
      expect(actualizarPreferencia.mock.calls[0][0].id).toBe("vieja");
    });

    it("entrega la preferencia nueva aunque falle al vencer la anterior", async () => {
      vi.spyOn(console, "error").mockImplementation(() => undefined);
      buscarReserva.mockResolvedValue(reserva("CONFIRMED", "vieja"));
      actualizarPreferencia.mockRejectedValue(new Error("Mercado Pago caído"));

      const respuesta = await request(app)
        .post(RUTA)
        .set(conToken(ID_DUENO))
        .send({ bookingId: ID_RESERVA });

      expect(respuesta.status).toBe(200);
      expect(respuesta.body.preferenceId).toBe("preferencia-1");
      expect(console.error).toHaveBeenCalled();
    });

    it("si la reserva cambió mientras se generaba el pago, invalida la nueva y responde 409", async () => {
      buscarReserva
        .mockResolvedValueOnce(reserva("PENDING", "vieja"))
        .mockResolvedValueOnce({ status: "PENDING" });
      actualizarReservas.mockResolvedValue({ count: 0 });

      const respuesta = await request(app)
        .post(RUTA)
        .set(conToken(ID_DUENO))
        .send({ bookingId: ID_RESERVA });

      expect(respuesta.status).toBe(409);
      expect(respuesta.body.detail).toBe(
        "La reserva cambió mientras se generaba el pago. Intenta de nuevo.",
      );
      expect(actualizarPreferencia.mock.calls[0][0].id).toBe("preferencia-1");
    });

    it("si la reserva se canceló mientras se generaba el pago, responde 409 con el mensaje de cancelada", async () => {
      buscarReserva
        .mockResolvedValueOnce(reserva("CONFIRMED"))
        .mockResolvedValueOnce({ status: "CANCELLED" });
      actualizarReservas.mockResolvedValue({ count: 0 });

      const respuesta = await request(app)
        .post(RUTA)
        .set(conToken(ID_DUENO))
        .send({ bookingId: ID_RESERVA });

      expect(respuesta.status).toBe(409);
      expect(respuesta.body.detail).toBe(
        "Esta reserva fue cancelada y no se puede pagar. Realiza una reserva nueva.",
      );
    });
  });
});
