import { randomUUID } from "node:crypto";
import jwt from "jsonwebtoken";
import request from "supertest";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

const { buscarReserva, crearPreferencia } = vi.hoisted(() => ({
  buscarReserva: vi.fn(),
  crearPreferencia: vi.fn(),
}));

vi.mock("../src/core/config/prisma.js", () => ({
  prisma: { booking: { findUnique: buscarReserva } },
}));

vi.mock("mercadopago", () => ({
  MercadoPagoConfig: class {},
  Preference: class {
    create = crearPreferencia;
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

const reserva = (status: string) => ({
  id: ID_RESERVA,
  userId: ID_DUENO,
  status,
  totalPrice: 1000,
  court: { name: "Cancha 1", sport: "PADEL" },
  user: { email: "dueno@example.com" },
});

describe("POST /payments/create-preference", () => {
  beforeAll(() => {
    vi.stubEnv("JWT_SECRET", SECRETO_DE_PRUEBA);
    vi.stubEnv("BACKEND_URL", "https://api.ejemplo.test");
    vi.stubEnv("MERCADOPAGO_ACCESS_TOKEN", "token_de_prueba");
  });

  afterAll(() => {
    vi.unstubAllEnvs();
  });

  beforeEach(() => {
    buscarReserva.mockReset();
    crearPreferencia.mockReset();
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

  it.each(["CANCELLED", "COMPLETED"])(
    "rechaza con 409 una reserva en estado %s y no genera el cobro",
    async (estado) => {
      buscarReserva.mockResolvedValue(reserva(estado));

      const respuesta = await request(app)
        .post(RUTA)
        .set(conToken(ID_DUENO))
        .send({ bookingId: ID_RESERVA });

      expect(respuesta.status).toBe(409);
      expect(respuesta.body.detail).toBe("Esta reserva no se puede pagar.");
      expect(crearPreferencia).not.toHaveBeenCalled();
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

  it("no genera el cobro si falta MERCADOPAGO_ACCESS_TOKEN", async () => {
    vi.stubEnv("MERCADOPAGO_ACCESS_TOKEN", "");
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    buscarReserva.mockResolvedValue(reserva("CONFIRMED"));

    const respuesta = await request(app)
      .post(RUTA)
      .set(conToken(ID_DUENO))
      .send({ bookingId: ID_RESERVA });

    vi.stubEnv("MERCADOPAGO_ACCESS_TOKEN", "token_de_prueba");
    expect(respuesta.status).toBe(500);
    expect(crearPreferencia).not.toHaveBeenCalled();
  });
});
