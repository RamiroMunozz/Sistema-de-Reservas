import { randomUUID } from "node:crypto";
import jwt from "jsonwebtoken";
import request from "supertest";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

const { buscarCancha, buscarReserva, crearReserva, actualizarReserva, buscarUsuario } =
  vi.hoisted(() => ({
    buscarCancha: vi.fn(),
    buscarReserva: vi.fn(),
    crearReserva: vi.fn(),
    actualizarReserva: vi.fn(),
    buscarUsuario: vi.fn(),
  }));

vi.mock("../src/core/config/prisma.js", () => {
  const booking = {
    findUnique: buscarReserva,
    findMany: vi.fn().mockResolvedValue([]),
    create: crearReserva,
    update: actualizarReserva,
  };

  return {
    prisma: {
      booking,
      court: { findUnique: buscarCancha },
      user: { findUnique: buscarUsuario },
      $transaction: (operacion: (transaccion: unknown) => Promise<unknown>) =>
        operacion({ $executeRaw: async () => 0, booking }),
    },
  };
});

const { default: app } = await import("../src/app.js");

const SECRETO_DE_PRUEBA = "secreto_de_prueba";
const RUTA_RESERVAS = "/api/v1/bookings";
const ID_USUARIO = randomUUID();
const ID_CANCHA = randomUUID();
const ID_RESERVA = randomUUID();

const conToken = (rol: "USER" | "ADMIN" = "USER", userId = ID_USUARIO) => ({
  Authorization: `Bearer ${jwt.sign({ userId, role: rol }, SECRETO_DE_PRUEBA)}`,
});

const enDias = (dias: number, hora: number) => {
  const fecha = new Date(Date.now() + dias * 24 * 60 * 60 * 1000);
  fecha.setUTCHours(hora, 0, 0, 0);
  return fecha.toISOString();
};

const reservaValida = () => ({
  courtId: ID_CANCHA,
  startTime: enDias(10, 10),
  endTime: enDias(10, 11),
  paymentMethod: "CASH",
});

const canchaActiva = { id: ID_CANCHA, isActive: true, pricePerSlot: 1000 };

describe("Validación de reservas", () => {
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
    for (const simulado of [
      buscarCancha,
      buscarReserva,
      crearReserva,
      actualizarReserva,
      buscarUsuario,
    ]) {
      simulado.mockReset();
    }
    buscarCancha.mockResolvedValue(canchaActiva);
    crearReserva.mockResolvedValue({ id: ID_RESERVA, status: "CONFIRMED" });
  });

  describe("POST /bookings", () => {
    it.each([
      ["courtId que no es UUID", { courtId: "abc" }],
      ["startTime inválido", { startTime: "mañana" }],
      ["endTime faltante", { endTime: undefined }],
      ["paymentMethod desconocido", { paymentMethod: "BITCOIN" }],
    ])("responde 400 con %s y no crea la reserva", async (_caso, cambios) => {
      const respuesta = await request(app)
        .post(RUTA_RESERVAS)
        .set(conToken())
        .send({ ...reservaValida(), ...cambios });

      expect(respuesta.status).toBe(400);
      expect(respuesta.body.errors).toBeDefined();
      expect(crearReserva).not.toHaveBeenCalled();
    });

    it("responde 400 si el inicio no es anterior al fin", async () => {
      const respuesta = await request(app)
        .post(RUTA_RESERVAS)
        .set(conToken())
        .send({
          ...reservaValida(),
          startTime: enDias(10, 11),
          endTime: enDias(10, 10),
        });

      expect(respuesta.status).toBe(400);
      expect(respuesta.body.detail).toBe(
        "La hora de inicio debe ser anterior a la hora de fin.",
      );
      expect(crearReserva).not.toHaveBeenCalled();
    });

    it("responde 400 si el turno ya pasó", async () => {
      const respuesta = await request(app)
        .post(RUTA_RESERVAS)
        .set(conToken())
        .send({
          ...reservaValida(),
          startTime: enDias(-1, 10),
          endTime: enDias(-1, 11),
        });

      expect(respuesta.status).toBe(400);
      expect(respuesta.body.detail).toBe("No se puede reservar un turno pasado.");
      expect(crearReserva).not.toHaveBeenCalled();
    });

    it("responde 400 si la cancha está inactiva", async () => {
      buscarCancha.mockResolvedValue({ ...canchaActiva, isActive: false });

      const respuesta = await request(app)
        .post(RUTA_RESERVAS)
        .set(conToken())
        .send(reservaValida());

      expect(respuesta.status).toBe(400);
      expect(respuesta.body.detail).toBe("La cancha no está disponible.");
      expect(crearReserva).not.toHaveBeenCalled();
    });

    it("crea la reserva con datos válidos", async () => {
      const respuesta = await request(app)
        .post(RUTA_RESERVAS)
        .set(conToken())
        .send(reservaValida());

      expect(respuesta.status).toBe(201);
      expect(crearReserva).toHaveBeenCalledOnce();
    });

    it("usa CASH si no se indica el medio de pago", async () => {
      const { paymentMethod: _omitido, ...datos } = reservaValida();

      const respuesta = await request(app)
        .post(RUTA_RESERVAS)
        .set(conToken())
        .send(datos);

      expect(respuesta.status).toBe(201);
      expect(crearReserva.mock.calls[0][0].data.paymentMethod).toBe("CASH");
    });

    it("no expone errores internos al cliente", async () => {
      crearReserva.mockRejectedValue(
        new Error("Invalid `prisma.booking.create()` en /ruta/interna.ts"),
      );

      const respuesta = await request(app)
        .post(RUTA_RESERVAS)
        .set(conToken())
        .send(reservaValida());

      expect(respuesta.status).toBe(500);
      expect(JSON.stringify(respuesta.body)).not.toContain("prisma");
      expect(JSON.stringify(respuesta.body)).not.toContain("/ruta/interna");
    });
  });

  describe("POST /bookings/admin/create", () => {
    it("responde 400 si el inicio no es anterior al fin", async () => {
      const respuesta = await request(app)
        .post(`${RUTA_RESERVAS}/admin/create`)
        .set(conToken("ADMIN"))
        .send({
          ...reservaValida(),
          startTime: enDias(10, 11),
          endTime: enDias(10, 10),
        });

      expect(respuesta.status).toBe(400);
      expect(respuesta.body.detail).toBe(
        "La hora de inicio debe ser anterior a la hora de fin.",
      );
      expect(crearReserva).not.toHaveBeenCalled();
    });

    it("responde 400 si falta el medio de pago", async () => {
      const { paymentMethod: _omitido, ...datos } = reservaValida();

      const respuesta = await request(app)
        .post(`${RUTA_RESERVAS}/admin/create`)
        .set(conToken("ADMIN"))
        .send(datos);

      expect(respuesta.status).toBe(400);
      expect(crearReserva).not.toHaveBeenCalled();
    });

    it("permite registrar un turno pasado", async () => {
      const respuesta = await request(app)
        .post(`${RUTA_RESERVAS}/admin/create`)
        .set(conToken("ADMIN"))
        .send({
          ...reservaValida(),
          startTime: enDias(-1, 10),
          endTime: enDias(-1, 11),
        });

      expect(respuesta.status).toBe(201);
    });
  });

  describe("PATCH /bookings/admin/:id/status", () => {
    it("responde 400 con un estado desconocido", async () => {
      const respuesta = await request(app)
        .patch(`${RUTA_RESERVAS}/admin/${ID_RESERVA}/status`)
        .set(conToken("ADMIN"))
        .send({ status: "BORRADA" });

      expect(respuesta.status).toBe(400);
      expect(actualizarReserva).not.toHaveBeenCalled();
    });

    it("responde 400 con un ID que no es UUID", async () => {
      const respuesta = await request(app)
        .patch(`${RUTA_RESERVAS}/admin/abc/status`)
        .set(conToken("ADMIN"))
        .send({ status: "CONFIRMED" });

      expect(respuesta.status).toBe(400);
      expect(buscarReserva).not.toHaveBeenCalled();
    });
  });

  describe("PATCH /bookings/:id/cancel", () => {
    it("responde 400 con un ID que no es UUID", async () => {
      const respuesta = await request(app)
        .patch(`${RUTA_RESERVAS}/abc/cancel`)
        .set(conToken());

      expect(respuesta.status).toBe(400);
    });

    it("responde 404 si la reserva no existe", async () => {
      buscarReserva.mockResolvedValue(null);

      const respuesta = await request(app)
        .patch(`${RUTA_RESERVAS}/${ID_RESERVA}/cancel`)
        .set(conToken());

      expect(respuesta.status).toBe(404);
    });

    it("responde 403 si la reserva es de otro usuario", async () => {
      buscarReserva.mockResolvedValue({
        id: ID_RESERVA,
        userId: randomUUID(),
        status: "CONFIRMED",
      });

      const respuesta = await request(app)
        .patch(`${RUTA_RESERVAS}/${ID_RESERVA}/cancel`)
        .set(conToken());

      expect(respuesta.status).toBe(403);
      expect(actualizarReserva).not.toHaveBeenCalled();
    });

    it.each(["CANCELLED", "COMPLETED"])(
      "responde 409 si la reserva está en estado %s",
      async (estado) => {
        buscarReserva.mockResolvedValue({
          id: ID_RESERVA,
          userId: ID_USUARIO,
          status: estado,
        });

        const respuesta = await request(app)
          .patch(`${RUTA_RESERVAS}/${ID_RESERVA}/cancel`)
          .set(conToken());

        expect(respuesta.status).toBe(409);
        expect(actualizarReserva).not.toHaveBeenCalled();
      },
    );

    it("cancela la reserva propia", async () => {
      buscarReserva.mockResolvedValue({
        id: ID_RESERVA,
        userId: ID_USUARIO,
        status: "CONFIRMED",
      });
      actualizarReserva.mockResolvedValue({ id: ID_RESERVA, status: "CANCELLED" });

      const respuesta = await request(app)
        .patch(`${RUTA_RESERVAS}/${ID_RESERVA}/cancel`)
        .set(conToken());

      expect(respuesta.status).toBe(200);
    });
  });

  describe("consultas por fecha", () => {
    it("responde 400 con una fecha inválida en /availability", async () => {
      const respuesta = await request(app).get(
        `${RUTA_RESERVAS}/availability?courtId=${ID_CANCHA}&date=2026-13-99`,
      );

      expect(respuesta.status).toBe(400);
    });

    it("responde 400 con un courtId inválido en /availability", async () => {
      const respuesta = await request(app).get(
        `${RUTA_RESERVAS}/availability?courtId=abc&date=2026-12-01`,
      );

      expect(respuesta.status).toBe(400);
    });

    it("responde 400 con una fecha inválida en /admin/daily", async () => {
      const respuesta = await request(app)
        .get(`${RUTA_RESERVAS}/admin/daily?date=hoy`)
        .set(conToken("ADMIN"));

      expect(respuesta.status).toBe(400);
    });

    it("acepta una consulta válida en /availability", async () => {
      const respuesta = await request(app).get(
        `${RUTA_RESERVAS}/availability?courtId=${ID_CANCHA}&date=2026-12-01`,
      );

      expect(respuesta.status).toBe(200);
      expect(respuesta.body).toEqual([]);
    });
  });

  describe("CORS", () => {
    it("permite el origen de FRONTEND_URL", async () => {
      const respuesta = await request(app)
        .get("/health")
        .set("Origin", "https://reservas.ejemplo.test");

      expect(respuesta.headers["access-control-allow-origin"]).toBe(
        "https://reservas.ejemplo.test",
      );
    });

    it("no permite otros orígenes", async () => {
      const respuesta = await request(app)
        .get("/health")
        .set("Origin", "https://atacante.ejemplo.test");

      expect(respuesta.headers["access-control-allow-origin"]).toBeUndefined();
    });
  });

  describe("límite de intentos de autenticación", () => {
    const credenciales = { email: "nadie@example.com", password: "Clave1234" };

    it("responde 429 al superar 10 intentos de login", async () => {
      buscarUsuario.mockResolvedValue(null);

      for (let intento = 0; intento < 10; intento++) {
        const respuesta = await request(app)
          .post("/api/v1/auth/login")
          .send(credenciales);
        expect(respuesta.status).toBe(401);
      }

      const bloqueada = await request(app)
        .post("/api/v1/auth/login")
        .send(credenciales);

      expect(bloqueada.status).toBe(429);
      expect(bloqueada.body.detail).toBe(
        "Demasiados intentos. Probá de nuevo más tarde.",
      );
    });
  });
});
