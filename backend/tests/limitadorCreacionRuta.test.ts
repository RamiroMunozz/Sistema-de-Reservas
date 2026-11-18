import { randomUUID } from "node:crypto";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

const { transaccionIniciada } = vi.hoisted(() => ({
  transaccionIniciada: vi.fn(),
}));

vi.mock("../src/core/config/prisma.js", () => ({
  prisma: {
    court: { findUnique: vi.fn() },
    $transaction: transaccionIniciada,
  },
}));

const RUTA = "/api/v1/public/bookings";

describe("POST /public/bookings: límite por IP en la ruta real (RES-030)", () => {
  beforeAll(() => {
    vi.stubEnv("LIMITE_CREACION_PUBLICA_MAXIMO", "10");
    vi.spyOn(console, "error").mockImplementation(() => undefined);
  });

  afterAll(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  it("la solicitud 11 responde 429 aunque las anteriores fueran rechazadas por validación", async () => {
    const { default: app } = await import("../src/app.js");
    const estados: number[] = [];

    for (let indice = 0; indice < 11; indice += 1) {
      // Cuerpo inválido: se rechaza con 400 y igual cuenta para el límite.
      const respuesta = await request(app)
        .post(RUTA)
        .send({ courtId: randomUUID() });
      estados.push(respuesta.status);
    }

    expect(estados.slice(0, 10)).toEqual(Array(10).fill(400));
    expect(estados[10]).toBe(429);
    expect(transaccionIniciada).not.toHaveBeenCalled();
  });

  it("una cabecera X-Forwarded-For falsificada no elude el límite (trust proxy explícito)", async () => {
    const { default: app } = await import("../src/app.js");

    // La IP real ya agotó el límite en la prueba anterior (mismo proceso y módulo).
    const respuesta = await request(app)
      .post(RUTA)
      .set("X-Forwarded-For", "203.0.113.77")
      .send({ courtId: randomUUID() });

    expect(respuesta.status).toBe(429);
  });
});
