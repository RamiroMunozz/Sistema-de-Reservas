import { randomUUID } from "node:crypto";
import jwt from "jsonwebtoken";
import request from "supertest";
import { ID_NEGOCIO_DE_PRUEBA, type RolDePrueba, payloadDePrueba } from "./ayudantes/tokens.js";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

const { buscarCancha, actualizarCancha } = vi.hoisted(() => ({
  buscarCancha: vi.fn(),
  actualizarCancha: vi.fn(),
}));

vi.mock("../src/core/config/prisma.js", () => ({
  prisma: {
    court: { findUnique: buscarCancha, update: actualizarCancha },
  },
}));

const { default: app } = await import("../src/app.js");

const SECRETO_DE_PRUEBA = "secreto_de_prueba";
const ID_CANCHA = randomUUID();
const ID_INEXISTENTE = randomUUID();

const conToken = (rol: RolDePrueba) => ({
  Authorization: `Bearer ${jwt.sign(
    payloadDePrueba(rol, randomUUID()),
    SECRETO_DE_PRUEBA,
  )}`,
});

const canchaInactiva = {
  id: ID_CANCHA,
  name: "Cancha 1",
  isActive: false,
  isIndoor: true,
};

describe("Validación de canchas", () => {
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
    buscarCancha.mockReset();
    actualizarCancha.mockReset();
    buscarCancha.mockResolvedValue(undefined);
    actualizarCancha.mockImplementation(
      async ({ data }: { data: Record<string, unknown> }) => ({
        ...canchaInactiva,
        ...data,
      }),
    );
  });

  describe("CAN-015: validación del id de cancha", () => {
    it.each([
      { descripcion: "GET /courts/:id", metodo: "get", ruta: "/api/v1/courts/abc" },
      {
        descripcion: "GET /courts/:id/availability",
        metodo: "get",
        ruta: "/api/v1/courts/abc/availability?date=2026-12-01",
      },
      {
        descripcion: "PATCH /admin/courts/:id",
        metodo: "patch",
        ruta: "/api/v1/admin/courts/abc",
      },
    ] as const)(
      "responde 400 con el campo id y sin consultar la base en $descripcion",
      async ({ metodo, ruta }) => {
        const solicitud =
          metodo === "patch"
            ? request(app).patch(ruta).set(conToken("DUENO")).send({ name: "Cancha 1" })
            : request(app).get(ruta);

        const respuesta = await solicitud;

        expect(respuesta.status).toBe(400);
        expect(respuesta.body.errors).toContainEqual(
          expect.objectContaining({ field: "id" }),
        );
        expect(buscarCancha).not.toHaveBeenCalled();
        expect(actualizarCancha).not.toHaveBeenCalled();
      },
    );

    it("responde 403 (no 400) a un JUGADOR en PATCH con id mal formado", async () => {
      const respuesta = await request(app)
        .patch("/api/v1/admin/courts/abc")
        .set(conToken("JUGADOR"))
        .send({ name: "Cancha 1" });

      expect(respuesta.status).toBe(403);
    });

    it("responde 404 ante un UUID válido de una cancha inexistente", async () => {
      const respuesta = await request(app).get(`/api/v1/courts/${ID_INEXISTENTE}`);

      expect(respuesta.status).toBe(404);
      expect(JSON.stringify(respuesta.body)).toContain(
        "La cancha solicitada no existe o se encuentra inactiva",
      );
    });

    it("responde 404 en la disponibilidad ante un UUID válido de una cancha inexistente", async () => {
      const respuesta = await request(app).get(
        `/api/v1/courts/${ID_INEXISTENTE}/availability?date=2026-12-01`,
      );

      expect(respuesta.status).toBe(404);
      expect(JSON.stringify(respuesta.body)).toContain("Cancha no encontrada");
    });
  });

  describe("CAN-010: PATCH de cancha sin valores por defecto", () => {
    const modificar = (cuerpo: Record<string, unknown>) =>
      request(app)
        .patch(`/api/v1/admin/courts/${ID_CANCHA}`)
        .set(conToken("DUENO"))
        .send(cuerpo);

    beforeEach(() => {
      buscarCancha.mockResolvedValue(canchaInactiva);
    });

    it.each([
      { descripcion: "solo name", cuerpo: { name: "Cancha Central" } },
      { descripcion: "cuerpo vacío", cuerpo: {} },
      {
        descripcion: "isActive e isIndoor explícitos en true",
        cuerpo: { isActive: true, isIndoor: true },
      },
      { descripcion: "isIndoor explícito en false", cuerpo: { isIndoor: false } },
    ])(
      "envía a la base solo los campos recibidos ($descripcion)",
      async ({ cuerpo }) => {
        const respuesta = await modificar(cuerpo);

        expect(respuesta.status).toBe(200);
        expect(actualizarCancha).toHaveBeenCalledWith({
          where: { id: ID_CANCHA },
          data: cuerpo,
        });
      },
    );

    it("desactiva una cancha activa y responde 200 con la cancha actualizada", async () => {
      buscarCancha.mockResolvedValue({ ...canchaInactiva, isActive: true });
      actualizarCancha.mockImplementation(
        async ({ data }: { data: Record<string, unknown> }) => ({
          ...canchaInactiva,
          isActive: true,
          ...data,
        }),
      );

      const respuesta = await modificar({ isActive: false });

      expect(respuesta.status).toBe(200);
      expect(actualizarCancha).toHaveBeenCalledWith({
        where: { id: ID_CANCHA },
        data: { isActive: false },
      });
      expect(respuesta.body).toEqual(
        expect.objectContaining({
          id: ID_CANCHA,
          name: "Cancha 1",
          isActive: false,
          isIndoor: true,
        }),
      );
    });

    it("responde 400 con el campo pricePerSlot si el precio no es positivo", async () => {
      const respuesta = await modificar({ pricePerSlot: 0 });

      expect(respuesta.status).toBe(400);
      expect(respuesta.body.errors).toContainEqual(
        expect.objectContaining({ field: "pricePerSlot" }),
      );
    });

    it("responde 404 'Cancha no encontrada' ante un UUID inexistente", async () => {
      buscarCancha.mockResolvedValue(null);

      const respuesta = await request(app)
        .patch(`/api/v1/admin/courts/${ID_INEXISTENTE}`)
        .set(conToken("DUENO"))
        .send({ name: "Cancha Central" });

      expect(respuesta.status).toBe(404);
      expect(JSON.stringify(respuesta.body)).toContain("Cancha no encontrada");
    });
  });
});
