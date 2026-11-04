import { randomUUID } from "node:crypto";
import jwt from "jsonwebtoken";
import request from "supertest";
import { afterEach, describe, expect, it, vi } from "vitest";
import app from "../src/app.js";
import {
  generateAccessToken,
  validarConfiguracionDeSeguridad,
  verifyAccessToken,
} from "../src/core/config/security.js";

const SECRETO_DE_PRUEBA = "secreto_de_prueba";
const RUTA_PROTEGIDA = "/api/v1/bookings/my-bookings";

const cargaUtil = () => ({ userId: randomUUID(), role: "USER" as const });

describe("Secretos JWT", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  describe("sin JWT_SECRET definido", () => {
    it("rechaza con 401 un token firmado con el secreto por defecto del middleware", async () => {
      vi.stubEnv("JWT_SECRET", "");
      const token = jwt.sign(cargaUtil(), "default_secret");

      const respuesta = await request(app)
        .get(RUTA_PROTEGIDA)
        .set("Authorization", `Bearer ${token}`);

      expect(respuesta.status).toBe(401);
    });

    it("rechaza con 401 un token firmado con el secreto por defecto de security.ts", async () => {
      vi.stubEnv("JWT_SECRET", "");
      const token = jwt.sign(
        cargaUtil(),
        "clave_secreta_por_defecto_desarrollo",
      );

      const respuesta = await request(app)
        .get(RUTA_PROTEGIDA)
        .set("Authorization", `Bearer ${token}`);

      expect(respuesta.status).toBe(401);
    });

    it("no permite emitir tokens", () => {
      vi.stubEnv("JWT_SECRET", "");

      expect(() => generateAccessToken(cargaUtil())).toThrow(
        "JWT_SECRET no está definido.",
      );
    });

    it("la validación de arranque falla", () => {
      vi.stubEnv("JWT_SECRET", "");

      expect(() => validarConfiguracionDeSeguridad()).toThrow(
        "JWT_SECRET no está definido.",
      );
    });
  });

  describe("con JWT_SECRET definido", () => {
    it("rechaza con 401 un token firmado con otro algoritmo", async () => {
      vi.stubEnv("JWT_SECRET", SECRETO_DE_PRUEBA);
      const token = jwt.sign(cargaUtil(), SECRETO_DE_PRUEBA, {
        algorithm: "HS512",
      });

      const respuesta = await request(app)
        .get(RUTA_PROTEGIDA)
        .set("Authorization", `Bearer ${token}`);

      expect(respuesta.status).toBe(401);
    });

    it("rechaza con 401 un token sin firma", async () => {
      vi.stubEnv("JWT_SECRET", SECRETO_DE_PRUEBA);
      const token = jwt.sign(cargaUtil(), "", { algorithm: "none" });

      const respuesta = await request(app)
        .get(RUTA_PROTEGIDA)
        .set("Authorization", `Bearer ${token}`);

      expect(respuesta.status).toBe(401);
    });

    it("acepta un token emitido por la aplicación", async () => {
      vi.stubEnv("JWT_SECRET", SECRETO_DE_PRUEBA);
      const token = generateAccessToken(cargaUtil());

      const respuesta = await request(app)
        .get(RUTA_PROTEGIDA)
        .set("Authorization", `Bearer ${token}`);

      expect(respuesta.status).toBe(200);
    });

    it("emite y verifica la misma carga útil con HS256", () => {
      vi.stubEnv("JWT_SECRET", SECRETO_DE_PRUEBA);
      const carga = cargaUtil();
      const token = generateAccessToken(carga);

      expect(verifyAccessToken(token)).toMatchObject(carga);
      expect(jwt.decode(token, { complete: true })?.header.alg).toBe("HS256");
    });

    it("la validación de arranque pasa", () => {
      vi.stubEnv("JWT_SECRET", SECRETO_DE_PRUEBA);

      expect(() => validarConfiguracionDeSeguridad()).not.toThrow();
    });
  });
});
