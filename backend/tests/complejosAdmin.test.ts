import { randomUUID } from "node:crypto";
import jwt from "jsonwebtoken";
import request from "supertest";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import type { JwtPayload } from "../src/core/config/security.js";
import { ID_NEGOCIO_DE_PRUEBA, payloadDePrueba } from "./ayudantes/tokens.js";

const { buscarComplejos } = vi.hoisted(() => ({ buscarComplejos: vi.fn() }));

vi.mock("../src/core/config/prisma.js", () => ({
  prisma: { complex: { findMany: buscarComplejos } },
}));

const { default: app } = await import("../src/app.js");

const SECRETO_DE_PRUEBA = "secreto_de_prueba";
const RUTA = "/api/v1/admin/complexes";
const MENSAJE_PROHIBIDO = "No tienes los permisos necesarios para realizar esta acción";

const conToken = (payload: JwtPayload) => ({
  Authorization: `Bearer ${jwt.sign(payload, SECRETO_DE_PRUEBA)}`,
});

describe("GET /admin/complexes: matriz de roles (ADM-019)", () => {
  beforeAll(() => {
    vi.stubEnv("JWT_SECRET", SECRETO_DE_PRUEBA);
  });

  afterAll(() => {
    vi.unstubAllEnvs();
  });

  beforeEach(() => {
    buscarComplejos.mockReset();
    buscarComplejos.mockResolvedValue([]);
  });

  it("sin token recibe 401", async () => {
    const respuesta = await request(app).get(RUTA);

    expect(respuesta.status).toBe(401);
    expect(buscarComplejos).not.toHaveBeenCalled();
  });

  it.each([
    { rol: "JUGADOR", payload: payloadDePrueba("JUGADOR", randomUUID()) },
    { rol: "SUPER_ADMIN", payload: { userId: randomUUID(), role: "SUPER_ADMIN" } as JwtPayload },
  ])("$rol recibe 403 sin consultar la base", async ({ payload }) => {
    const respuesta = await request(app).get(RUTA).set(conToken(payload));

    expect(respuesta.status).toBe(403);
    expect(respuesta.body.detail).toBe(MENSAJE_PROHIBIDO);
    expect(buscarComplejos).not.toHaveBeenCalled();
  });

  it("un DUENO recibe 200 y la consulta filtra por el negocio firmado en su token", async () => {
    const respuesta = await request(app)
      .get(RUTA)
      .set(conToken(payloadDePrueba("DUENO", randomUUID())));

    expect(respuesta.status).toBe(200);
    expect(buscarComplejos).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { negocioId: ID_NEGOCIO_DE_PRUEBA },
        orderBy: { createdAt: "asc" },
      }),
    );
  });
});
