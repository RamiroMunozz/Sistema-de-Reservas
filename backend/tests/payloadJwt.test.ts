import { randomUUID } from "node:crypto";
import express from "express";
import jwt from "jsonwebtoken";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

vi.mock("../src/core/config/prisma.js", () => ({ prisma: {} }));

const { default: app } = await import("../src/app.js");
const { armarPayloadJwt, verifyAccessToken } = await import(
  "../src/core/config/security.js"
);
const { obtenerIdNegocio, soloDueno } = await import(
  "../src/core/middlewares/negocio.js"
);
const { errorHandler } = await import("../src/core/middlewares/errorHandler.js");

const SECRETO_DE_PRUEBA = "secreto_de_prueba";
const MENSAJE_TOKEN_INVALIDO = "Token inválido o expirado.";
const MENSAJE_PROHIBIDO = "No tienes los permisos necesarios para realizar esta acción";

const firmar = (payload: Record<string, unknown>): string =>
  jwt.sign(payload, SECRETO_DE_PRUEBA);

const conToken = (payload: Record<string, unknown>) => ({
  Authorization: `Bearer ${firmar(payload)}`,
});

// Rutas del dueño de las tres áreas (administración, reservas y reembolso).
const RUTAS_DEL_DUENO = [
  { metodo: "get", ruta: "/api/v1/admin/metrics" },
  { metodo: "get", ruta: "/api/v1/bookings/admin/all" },
  { metodo: "post", ruta: `/api/v1/payments/admin/payments/${randomUUID()}/refund` },
] as const;

// Aplicación mínima con la cadena del dueño para observar `req.idNegocio`.
const appDelDueno = express();
appDelDueno.get("/prueba", ...soloDueno, (req, res) => {
  res.json({ idNegocio: obtenerIdNegocio(req) });
});
appDelDueno.use(errorHandler);

describe("Payload del JWT y roles (AUT-001, AUT-006, AUT-009, AUT-012, AUT-014, AUT-015)", () => {
  beforeAll(() => {
    vi.stubEnv("JWT_SECRET", SECRETO_DE_PRUEBA);
  });

  afterAll(() => {
    vi.unstubAllEnvs();
  });

  describe("tokens con el payload viejo o inválido", () => {
    for (const { metodo, ruta } of RUTAS_DEL_DUENO) {
      it(`un token con rol USER recibe 401 en ${metodo.toUpperCase()} ${ruta}`, async () => {
        const respuesta = await request(app)[metodo](ruta).set(
          conToken({ userId: randomUUID(), role: "USER" }),
        );

        expect(respuesta.status).toBe(401);
        expect(respuesta.body.message).toBe(MENSAJE_TOKEN_INVALIDO);
      });

      it(`un token con rol ADMIN recibe 401 en ${metodo.toUpperCase()} ${ruta}`, async () => {
        const respuesta = await request(app)[metodo](ruta).set(
          conToken({ userId: randomUUID(), role: "ADMIN" }),
        );

        expect(respuesta.status).toBe(401);
        expect(respuesta.body.message).toBe(MENSAJE_TOKEN_INVALIDO);
      });
    }

    it("un token DUENO sin negocioId recibe 401", async () => {
      const respuesta = await request(app)
        .get("/api/v1/admin/metrics")
        .set(conToken({ userId: randomUUID(), role: "DUENO" }));

      expect(respuesta.status).toBe(401);
      expect(respuesta.body.message).toBe(MENSAJE_TOKEN_INVALIDO);
    });

    it("un token DUENO con negocioId que no es UUID recibe 401", async () => {
      const respuesta = await request(app)
        .get("/api/v1/admin/metrics")
        .set(conToken({ userId: randomUUID(), role: "DUENO", negocioId: "principal" }));

      expect(respuesta.status).toBe(401);
      expect(respuesta.body.message).toBe(MENSAJE_TOKEN_INVALIDO);
    });

    it("un token con userId que no es UUID recibe 401", async () => {
      const respuesta = await request(app)
        .get("/api/v1/admin/metrics")
        .set(conToken({ userId: "123", role: "JUGADOR" }));

      expect(respuesta.status).toBe(401);
    });

    it("un token con un rol desconocido lanza en verifyAccessToken", () => {
      expect(() =>
        verifyAccessToken(firmar({ userId: randomUUID(), role: "OTRO" })),
      ).toThrow();
    });
  });

  describe("rutas del dueño con otros roles", () => {
    for (const { metodo, ruta } of RUTAS_DEL_DUENO) {
      it(`JUGADOR recibe 403 en ${metodo.toUpperCase()} ${ruta}`, async () => {
        const respuesta = await request(app)[metodo](ruta).set(
          conToken({ userId: randomUUID(), role: "JUGADOR" }),
        );

        expect(respuesta.status).toBe(403);
        expect(respuesta.body.detail).toBe(MENSAJE_PROHIBIDO);
      });

      it(`SUPER_ADMIN recibe 403 en ${metodo.toUpperCase()} ${ruta}`, async () => {
        const respuesta = await request(app)[metodo](ruta).set(
          conToken({ userId: randomUUID(), role: "SUPER_ADMIN" }),
        );

        expect(respuesta.status).toBe(403);
        expect(respuesta.body.detail).toBe(MENSAJE_PROHIBIDO);
      });
    }
  });

  describe("DUENO con negocioId válido", () => {
    it("pasa la autenticación y deja el negocio del claim en req.idNegocio", async () => {
      const idNegocio = randomUUID();

      const respuesta = await request(appDelDueno)
        .get("/prueba")
        .set(conToken({ userId: randomUUID(), role: "DUENO", negocioId: idNegocio }));

      expect(respuesta.status).toBe(200);
      expect(respuesta.body).toEqual({ idNegocio });
    });

    it("verifyAccessToken devuelve el payload con negocioId", () => {
      const userId = randomUUID();
      const negocioId = randomUUID();

      const payload = verifyAccessToken(firmar({ userId, role: "DUENO", negocioId }));

      expect(payload).toMatchObject({ userId, role: "DUENO", negocioId });
    });

    it("el claim negocioId de un JUGADOR no llega al payload", () => {
      const userId = randomUUID();

      const payload = verifyAccessToken(
        firmar({ userId, role: "JUGADOR", negocioId: randomUUID() }),
      );

      expect(payload).toMatchObject({ userId, role: "JUGADOR" });
      expect("negocioId" in payload).toBe(false);
    });
  });

  describe("obtenerIdNegocio", () => {
    it("lanza un error de programación si el middleware no fijó el negocio", () => {
      const reqSinNegocio = {} as express.Request;

      expect(() => obtenerIdNegocio(reqSinNegocio)).toThrow();
    });
  });

  describe("armarPayloadJwt", () => {
    it("arma el payload del DUENO con su negocio", () => {
      const id = randomUUID();
      const negocioId = randomUUID();

      expect(armarPayloadJwt({ id, role: "DUENO", negocioId })).toEqual({
        userId: id,
        role: "DUENO",
        negocioId,
      });
    });

    it("arma el payload del JUGADOR y del SUPER_ADMIN sin negocio", () => {
      const id = randomUUID();

      expect(armarPayloadJwt({ id, role: "JUGADOR", negocioId: null })).toEqual({
        userId: id,
        role: "JUGADOR",
      });
      expect(armarPayloadJwt({ id, role: "SUPER_ADMIN", negocioId: null })).toEqual({
        userId: id,
        role: "SUPER_ADMIN",
      });
    });

    it("lanza para un DUENO sin negocio", () => {
      expect(() =>
        armarPayloadJwt({ id: randomUUID(), role: "DUENO", negocioId: null }),
      ).toThrow();
    });
  });
});
