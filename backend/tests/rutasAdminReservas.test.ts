import { randomUUID } from "node:crypto";
import jwt from "jsonwebtoken";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import app from "../src/app.js";

const SECRETO_DE_PRUEBA = "secreto_de_prueba";
const FECHA_SIN_RESERVAS = "2000-01-01";

const firmarToken = (rol: "USER" | "ADMIN"): string =>
  jwt.sign({ userId: randomUUID(), role: rol }, SECRETO_DE_PRUEBA);

const conToken = (rol: "USER" | "ADMIN") => ({
  Authorization: `Bearer ${firmarToken(rol)}`,
});

describe("Rutas admin de reservas", () => {
  beforeAll(() => {
    vi.stubEnv("JWT_SECRET", SECRETO_DE_PRUEBA);
  });

  afterAll(() => {
    vi.unstubAllEnvs();
  });

  describe("usuario sin rol ADMIN", () => {
    const mensajeProhibido =
      "No tienes los permisos necesarios para realizar esta acción";

    it("recibe 403 en GET /admin/daily", async () => {
      const respuesta = await request(app)
        .get(`/api/v1/bookings/admin/daily?date=${FECHA_SIN_RESERVAS}`)
        .set(conToken("USER"));

      expect(respuesta.status).toBe(403);
      expect(respuesta.body.detail).toBe(mensajeProhibido);
    });

    it("recibe 403 en PATCH /admin/:id/status", async () => {
      const respuesta = await request(app)
        .patch(`/api/v1/bookings/admin/${randomUUID()}/status`)
        .set(conToken("USER"))
        .send({ status: "CANCELLED" });

      expect(respuesta.status).toBe(403);
      expect(respuesta.body.detail).toBe(mensajeProhibido);
    });

    it("recibe 403 en POST /admin/create", async () => {
      const respuesta = await request(app)
        .post("/api/v1/bookings/admin/create")
        .set(conToken("USER"))
        .send({
          courtId: randomUUID(),
          startTime: "2000-01-01T10:00:00.000Z",
          endTime: "2000-01-01T11:00:00.000Z",
          paymentMethod: "CASH",
        });

      expect(respuesta.status).toBe(403);
      expect(respuesta.body.detail).toBe(mensajeProhibido);
    });
  });

  describe("comportamiento que se mantiene", () => {
    it("un pedido sin token recibe 401 en GET /admin/daily", async () => {
      const respuesta = await request(app).get(
        `/api/v1/bookings/admin/daily?date=${FECHA_SIN_RESERVAS}`,
      );

      expect(respuesta.status).toBe(401);
    });

    it("un pedido sin token recibe 401 en PATCH /admin/:id/status", async () => {
      const respuesta = await request(app)
        .patch(`/api/v1/bookings/admin/${randomUUID()}/status`)
        .send({ status: "CANCELLED" });

      expect(respuesta.status).toBe(401);
    });

    it("un pedido sin token recibe 401 en POST /admin/create", async () => {
      const respuesta = await request(app)
        .post("/api/v1/bookings/admin/create")
        .send({
          courtId: randomUUID(),
          startTime: "2000-01-01T10:00:00.000Z",
          endTime: "2000-01-01T11:00:00.000Z",
          paymentMethod: "CASH",
        });

      expect(respuesta.status).toBe(401);
    });

    it("un ADMIN accede a GET /admin/daily", async () => {
      const respuesta = await request(app)
        .get(`/api/v1/bookings/admin/daily?date=${FECHA_SIN_RESERVAS}`)
        .set(conToken("ADMIN"));

      expect(respuesta.status).toBe(200);
      expect(respuesta.body).toEqual([]);
    });

    it("un ADMIN recibe 400 si la cancha no existe en POST /admin/create", async () => {
      const respuesta = await request(app)
        .post("/api/v1/bookings/admin/create")
        .set(conToken("ADMIN"))
        .send({
          courtId: randomUUID(),
          startTime: "2000-01-01T10:00:00.000Z",
          endTime: "2000-01-01T11:00:00.000Z",
          paymentMethod: "CASH",
        });

      expect(respuesta.status).toBe(400);
      expect(respuesta.body.detail).toBe("Cancha no encontrada.");
    });

    it("un usuario consulta sus propias reservas en GET /my-bookings", async () => {
      const respuesta = await request(app)
        .get("/api/v1/bookings/my-bookings")
        .set(conToken("USER"));

      expect(respuesta.status).toBe(200);
      expect(respuesta.body).toEqual([]);
    });

    it("un usuario recibe 400 si la cancha no existe en POST /", async () => {
      const respuesta = await request(app)
        .post("/api/v1/bookings")
        .set(conToken("USER"))
        .send({
          courtId: randomUUID(),
          startTime: "2000-01-01T10:00:00.000Z",
          endTime: "2000-01-01T11:00:00.000Z",
        });

      expect(respuesta.status).toBe(400);
      expect(respuesta.body.detail).toBe("La cancha no existe.");
    });
  });
});
