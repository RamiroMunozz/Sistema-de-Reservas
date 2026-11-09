import { describe, it, expect, beforeAll, afterAll } from "vitest";
import request from "supertest";
import app from "../src/app.js";
import { prisma } from "../src/core/config/prisma.js";

const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;
// Fechas lejanas para no chocar con datos reales ni con otras suites.
const TEST_EPOCH = Date.UTC(2040, 0, 1);

// Genera un turno de una hora único por ejecución para que la suite sea re-ejecutable.
function uniqueSlot(durationHours = 1) {
  const dayOffset = Math.floor(Math.random() * 100_000);
  const start = new Date(TEST_EPOCH + dayOffset * DAY_MS + 10 * HOUR_MS);
  const end = new Date(start.getTime() + durationHours * HOUR_MS);
  return { start, end };
}

describe("Reservas - concurrencia y superposición", () => {
  let userToken: string;
  let adminToken: string;
  let courtId: string;

  const book = (token: string, start: Date, end: Date) =>
    request(app)
      .post("/api/v1/bookings")
      .set("Authorization", `Bearer ${token}`)
      .send({
        courtId,
        startTime: start.toISOString(),
        endTime: end.toISOString(),
        paymentMethod: "CASH",
      });

  beforeAll(async () => {
    const userLogin = await request(app).post("/api/v1/auth/login").send({
      email: "jugador@example.com",
      password: "UserPass123",
    });
    userToken = userLogin.body.accessToken;

    const adminLogin = await request(app).post("/api/v1/auth/login").send({
      email: "admin@sportsbooking.com",
      password: "AdminPass123",
    });
    adminToken = adminLogin.body.accessToken;

    const courtsRes = await request(app).get("/api/v1/courts");
    courtId = courtsRes.body[0].id;
  });

  afterAll(async () => {
    await prisma.booking.deleteMany({
      where: { courtId, startTime: { gte: new Date(TEST_EPOCH) } },
    });
    await prisma.$disconnect();
  });

  it("10 solicitudes simultáneas al mismo turno generan 1 reserva (201) y 9 conflictos (409)", async () => {
    const { start, end } = uniqueSlot();

    const responses = await Promise.all(
      Array.from({ length: 10 }, () => book(userToken, start, end)),
    );

    const created = responses.filter((r) => r.status === 201);
    const conflicts = responses.filter((r) => r.status === 409);

    expect(created).toHaveLength(1);
    expect(conflicts).toHaveLength(9);
    for (const res of conflicts) {
      expect(res.body.detail).toContain("ya fue reservado");
    }

    const stored = await prisma.booking.count({
      where: { courtId, startTime: start, status: { not: "CANCELLED" } },
    });
    expect(stored).toBe(1);
  });

  it("permite reservar un turno contiguo (inicio igual al fin de la reserva previa)", async () => {
    const { start, end } = uniqueSlot();
    const next = new Date(end.getTime() + HOUR_MS);

    const first = await book(userToken, start, end);
    const contiguous = await book(userToken, end, next);

    expect(first.status).toBe(201);
    expect(contiguous.status).toBe(201);
  });

  it("rechaza con 409 un turno que se superpone parcialmente", async () => {
    const { start, end } = uniqueSlot(2);
    const overlapStart = new Date(start.getTime() + HOUR_MS);
    const overlapEnd = new Date(end.getTime() + HOUR_MS);

    const first = await book(userToken, start, end);
    const overlapping = await book(userToken, overlapStart, overlapEnd);

    expect(first.status).toBe(201);
    expect(overlapping.status).toBe(409);
    expect(overlapping.body.detail).toContain("ya fue reservado");
  });

  it("libera el turno al cancelar la reserva y permite reservarlo de nuevo", async () => {
    const { start, end } = uniqueSlot();

    const created = await book(userToken, start, end);
    expect(created.status).toBe(201);

    const cancelled = await request(app)
      .patch(`/api/v1/bookings/${created.body.id}/cancel`)
      .set("Authorization", `Bearer ${userToken}`);
    expect(cancelled.status).toBe(200);

    const rebooked = await book(userToken, start, end);
    expect(rebooked.status).toBe(201);
  });

  it("la reserva manual del administrador sobre un turno ocupado responde 409", async () => {
    const { start, end } = uniqueSlot();

    const created = await book(userToken, start, end);
    expect(created.status).toBe(201);

    const res = await request(app)
      .post("/api/v1/bookings/admin/create")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({
        courtId,
        startTime: start.toISOString(),
        endTime: end.toISOString(),
        paymentMethod: "CASH",
      });

    expect(res.status).toBe(409);
    expect(res.body.detail).toContain("ya fue reservado");
  });
});
