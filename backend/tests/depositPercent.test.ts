import { randomUUID } from "node:crypto";
import jwt from "jsonwebtoken";
import request from "supertest";
import { ID_NEGOCIO_DE_PRUEBA, type RolDePrueba, payloadDePrueba } from "./ayudantes/tokens.js";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

const { buscarComplejo, actualizarComplejo } = vi.hoisted(() => ({
  buscarComplejo: vi.fn(),
  actualizarComplejo: vi.fn(),
}));

vi.mock("../src/core/config/prisma.js", () => ({
  prisma: { complex: { findFirst: buscarComplejo, update: actualizarComplejo } },
}));

const { default: app } = await import("../src/app.js");

const SECRETO_DE_PRUEBA = "secreto_de_prueba";
const ID_COMPLEJO = randomUUID();
const MENSAJE_PROHIBIDO = "No tienes los permisos necesarios para realizar esta acción";

const conToken = (rol: RolDePrueba) => ({
  Authorization: `Bearer ${jwt.sign(payloadDePrueba(rol, randomUUID()), SECRETO_DE_PRUEBA)}`,
});

const ruta = (id: string = ID_COMPLEJO) =>
  `/api/v1/admin/complexes/${id}/deposit-percent`;

describe("Porcentaje de seña del complejo (ADM-015)", () => {
  beforeAll(() => {
    vi.stubEnv("JWT_SECRET", SECRETO_DE_PRUEBA);
  });

  afterAll(() => {
    vi.unstubAllEnvs();
  });

  beforeEach(() => {
    buscarComplejo.mockReset();
    actualizarComplejo.mockReset();
    buscarComplejo.mockResolvedValue({ id: ID_COMPLEJO, depositPercent: 30 });
    actualizarComplejo.mockImplementation(
      async ({ data }: { data: { depositPercent: number } }) => ({
        id: ID_COMPLEJO,
        depositPercent: data.depositPercent,
      }),
    );
  });

  describe("control de acceso", () => {
    it("GET sin token recibe 401", async () => {
      const respuesta = await request(app).get(ruta());

      expect(respuesta.status).toBe(401);
    });

    it("PATCH sin token recibe 401 y no escribe", async () => {
      const respuesta = await request(app).patch(ruta()).send({ depositPercent: 50 });

      expect(respuesta.status).toBe(401);
      expect(actualizarComplejo).not.toHaveBeenCalled();
    });

    it("GET con JUGADOR recibe 403", async () => {
      const respuesta = await request(app).get(ruta()).set(conToken("JUGADOR"));

      expect(respuesta.status).toBe(403);
      expect(respuesta.body.detail).toBe(MENSAJE_PROHIBIDO);
    });

    it("PATCH con JUGADOR recibe 403 y no escribe", async () => {
      const respuesta = await request(app)
        .patch(ruta())
        .set(conToken("JUGADOR"))
        .send({ depositPercent: 50 });

      expect(respuesta.status).toBe(403);
      expect(respuesta.body.detail).toBe(MENSAJE_PROHIBIDO);
      expect(actualizarComplejo).not.toHaveBeenCalled();
    });
  });

  describe("GET", () => {
    it("un DUENO recibe 200 con id y depositPercent", async () => {
      const respuesta = await request(app).get(ruta()).set(conToken("DUENO"));

      expect(respuesta.status).toBe(200);
      expect(respuesta.body).toEqual({ id: ID_COMPLEJO, depositPercent: 30 });
      expect(buscarComplejo).toHaveBeenCalledWith(
        { where: { id: ID_COMPLEJO, negocioId: ID_NEGOCIO_DE_PRUEBA } },
      );
    });

    it("un id que no es UUID recibe 400 sin consultar la base", async () => {
      const respuesta = await request(app).get(ruta("no-es-uuid")).set(conToken("DUENO"));

      expect(respuesta.status).toBe(400);
      expect(buscarComplejo).not.toHaveBeenCalled();
    });

    it("un complejo inexistente recibe 404", async () => {
      buscarComplejo.mockResolvedValue(null);

      const respuesta = await request(app).get(ruta()).set(conToken("DUENO"));

      expect(respuesta.status).toBe(404);
    });
  });

  describe("PATCH", () => {
    it.each([1, 40, 50, 100])(
      "un DUENO guarda %i y recibe 200 con el valor nuevo",
      async (valor) => {
        const respuesta = await request(app)
          .patch(ruta())
          .set(conToken("DUENO"))
          .send({ depositPercent: valor });

        expect(respuesta.status).toBe(200);
        expect(respuesta.body).toEqual({ id: ID_COMPLEJO, depositPercent: valor });
        expect(actualizarComplejo).toHaveBeenCalledWith(
          expect.objectContaining({
            where: { id: ID_COMPLEJO },
            data: { depositPercent: valor },
          }),
        );
      },
    );

    it.each([
      ["cero", 0],
      ["negativo", -5],
      ["mayor que 100", 101],
      ["decimal", 30.5],
      ["texto", "texto"],
      ["número como texto", "50"],
      ["nulo", null],
    ])("rechaza con 400 y la lista errors un valor %s, sin escribir", async (_nombre, valor) => {
      const respuesta = await request(app)
        .patch(ruta())
        .set(conToken("DUENO"))
        .send({ depositPercent: valor });

      expect(respuesta.status).toBe(400);
      expect(respuesta.body.errors).toEqual([
        expect.objectContaining({ field: "depositPercent" }),
      ]);
      expect(actualizarComplejo).not.toHaveBeenCalled();
    });

    it("rechaza con 400 un cuerpo sin depositPercent", async () => {
      const respuesta = await request(app)
        .patch(ruta())
        .set(conToken("DUENO"))
        .send({});

      expect(respuesta.status).toBe(400);
      expect(respuesta.body.errors).toEqual([
        expect.objectContaining({ field: "depositPercent" }),
      ]);
      expect(actualizarComplejo).not.toHaveBeenCalled();
    });

    it("un id que no es UUID recibe 400 y no escribe", async () => {
      const respuesta = await request(app)
        .patch(ruta("no-es-uuid"))
        .set(conToken("DUENO"))
        .send({ depositPercent: 50 });

      expect(respuesta.status).toBe(400);
      expect(actualizarComplejo).not.toHaveBeenCalled();
    });

    it("un complejo inexistente recibe 404 y no escribe", async () => {
      buscarComplejo.mockResolvedValue(null);

      const respuesta = await request(app)
        .patch(ruta())
        .set(conToken("DUENO"))
        .send({ depositPercent: 50 });

      expect(respuesta.status).toBe(404);
      expect(actualizarComplejo).not.toHaveBeenCalled();
    });
  });
});
