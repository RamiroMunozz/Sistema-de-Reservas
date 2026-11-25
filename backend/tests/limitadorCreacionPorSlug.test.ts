import { randomUUID } from "node:crypto";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

const { buscarNegocio } = vi.hoisted(() => ({ buscarNegocio: vi.fn() }));

vi.mock("../src/core/config/prisma.js", () => ({
  prisma: {
    negocio: { findFirst: buscarNegocio },
  },
}));

const RUTA = "/api/v1/negocios/padel-norte/bookings";

describe("POST /negocios/:slug/bookings: el límite por IP corre antes del resolutor (RES-030)", () => {
  beforeAll(() => {
    vi.stubEnv("LIMITE_CREACION_PUBLICA_MAXIMO", "10");
    vi.spyOn(console, "error").mockImplementation(() => undefined);
  });

  afterAll(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  it("la solicitud 11 responde 429 aunque el negocio no exista y las anteriores dieran 404", async () => {
    buscarNegocio.mockResolvedValue(null);
    const { default: app } = await import("../src/app.js");
    const estados: number[] = [];

    for (let indice = 0; indice < 11; indice += 1) {
      const respuesta = await request(app).post(RUTA).send({ courtId: randomUUID() });
      estados.push(respuesta.status);
    }

    expect(estados.slice(0, 10)).toEqual(Array(10).fill(404));
    expect(estados[10]).toBe(429);
    // El resolutor no se consulta cuando el límite ya cortó la solicitud.
    expect(buscarNegocio).toHaveBeenCalledTimes(10);
  });
});
