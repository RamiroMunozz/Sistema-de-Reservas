import { describe, it, expect, beforeAll, afterAll } from "vitest";
import request from "supertest";
import app from "../src/app.js";
import { prisma } from "../src/core/config/prisma.js";

describe("Suite de Integración - API de Reservas", () => {
  let userToken: string;
  let adminToken: string;
  let courtId: string;

  beforeAll(async () => {
    const userLoginRes = await request(app).post("/api/v1/auth/login").send({
      email: "jugador@example.com",
      password: "UserPass123",
    });
    userToken = userLoginRes.body.accessToken;

    const adminLoginRes = await request(app).post("/api/v1/auth/login").send({
      email: "admin@sportsbooking.com",
      password: "AdminPass123",
    });
    adminToken = adminLoginRes.body.accessToken;

    const courtsRes = await request(app).get("/api/v1/courts");
    courtId = courtsRes.body[0].id;
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  describe("GET /api/v1/courts", () => {
    it("debe devolver la lista de canchas con status 200", async () => {
      const res = await request(app).get("/api/v1/courts");
      expect(res.status).toBe(200);
      expect(Array.isArray(res.body)).toBe(true);
      expect(res.body.length).toBeGreaterThan(0);
      expect(res.body[0]).toHaveProperty("complex");
    });

    it("debe filtrar correctamente por deporte", async () => {
      const res = await request(app).get("/api/v1/courts?sport=FUTBOL_5");
      expect(res.status).toBe(200);
      expect(res.body.every((c: any) => c.sport === "FUTBOL_5")).toBe(true);
    });
  });

  describe("Control de Acceso (RBAC)", () => {
    it("debe rechazar con 403 Forbidden a un usuario regular en /api/v1/admin/metrics", async () => {
      const res = await request(app)
        .get("/api/v1/admin/metrics?startDate=2026-08-01&endDate=2026-08-31")
        .set("Authorization", `Bearer ${userToken}`);

      expect(res.status).toBe(403);
      expect(res.body.detail).toBe(
        "No tienes los permisos necesarios para realizar esta acción",
      );
    });

    it("debe permitir con 200 OK el acceso a un administrador en /api/v1/admin/metrics", async () => {
      const res = await request(app)
        .get("/api/v1/admin/metrics?startDate=2026-08-01&endDate=2026-08-31")
        .set("Authorization", `Bearer ${adminToken}`);

      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty("summary");
    });
  });

  describe("Lógica de Reservas y Concurrencia Transaccional", () => {
    const testSlot = {
      startTime: "2026-11-20T19:00:00.000Z",
      endTime: "2026-11-20T20:00:00.000Z",
    };

    it("debe crear una reserva confirmada con status 201", async () => {
      const res = await request(app)
        .post("/api/v1/bookings")
        .set("Authorization", `Bearer ${userToken}`)
        .send({
          courtId,
          startTime: testSlot.startTime,
          endTime: testSlot.endTime,
          paymentMethod: "CASH",
        });

      expect(res.status).toBe(201);
      expect(res.body.status).toBe("CONFIRMED");
      expect(res.body.courtId).toBe(courtId);
    });

    it("debe retornar 409 Conflict al intentar reservar el mismo horario (prevención de overbooking)", async () => {
      const res = await request(app)
        .post("/api/v1/bookings")
        .set("Authorization", `Bearer ${userToken}`)
        .send({
          courtId,
          startTime: testSlot.startTime,
          endTime: testSlot.endTime,
          paymentMethod: "CASH",
        });

      expect(res.status).toBe(409);
      expect(res.body.detail).toContain("ya fue reservado");
    });
  });
});
