import { randomUUID } from "node:crypto";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import app from "../src/app.js";
import { prisma } from "../src/core/config/prisma.js";
import {
  borrarNegocioDePrueba,
  crearNegocioDePrueba,
  firmarToken,
  type NegocioDePrueba,
} from "./ayudantes/negociosDePrueba.js";
import { payloadDePrueba } from "./ayudantes/tokens.js";

// Aislamiento entre negocios en la administración (NEG-007, ADM-001 a ADM-009, ADM-015, ADM-019,
// CAN-009 a CAN-011). El dueño A opera con ids de B: la respuesta es la misma que para un id
// inexistente y el recurso de B no cambia. Solo corre contra la base descartable.
const URL_BASE_DE_PRUEBA = process.env.DATABASE_URL_PRUEBA;
const SECRETO_DE_PRUEBA = "secreto_de_prueba";

const FECHA_RESERVA = "2032-05-10";

interface DatosCancha {
  complexId: string;
  name: string;
  isActive?: boolean;
}

// `instance` repite la ruta pedida, que cambia con el id; el resto de la respuesta debe ser idéntico.
const sinInstancia = (cuerpo: Record<string, unknown>): Record<string, unknown> => {
  const { instance: _instancia, ...resto } = cuerpo;
  return resto;
};

describe.skipIf(!URL_BASE_DE_PRUEBA)("Aislamiento de la administración entre negocios", () => {
  let negocioA: NegocioDePrueba;
  let negocioB: NegocioDePrueba;
  let idComplejoA: string;
  let idComplejoA2: string;
  let idComplejoB: string;
  let idCanchaA: string;
  let idCanchaB: string;
  let idReservaA: string;
  let idReservaB: string;
  let tokenDuenoA: { Authorization: string };
  let tokenJugador: { Authorization: string };
  const idsUsuarios: string[] = [];

  const crearCancha = async ({ complexId, name, isActive = true }: DatosCancha): Promise<string> => {
    const cancha = await prisma.court.create({
      data: {
        complexId,
        name,
        sport: "PADEL",
        surface: "CEMENTO",
        pricePerSlot: 1000,
        isActive,
      },
    });
    return cancha.id;
  };

  // Reserva de un jugador sin negocio (cuenta global), el 2032-05-10, en la cancha y el negocio dados.
  const crearReserva = async (courtId: string, negocioId: string, precio: number): Promise<string> => {
    const jugador = await prisma.user.create({
      data: {
        email: `${randomUUID()}@prueba.test`,
        passwordHash: "hash",
        firstName: "Jugador",
        lastName: "Prueba",
        role: "JUGADOR",
      },
    });
    idsUsuarios.push(jugador.id);
    const reserva = await prisma.booking.create({
      data: {
        userId: jugador.id,
        courtId,
        negocioId,
        startTime: new Date(`${FECHA_RESERVA}T10:00:00.000Z`),
        endTime: new Date(`${FECHA_RESERVA}T11:00:00.000Z`),
        totalPrice: precio,
        status: "CONFIRMED",
      },
    });
    return reserva.id;
  };

  const conToken = (negocioId: string) => ({
    Authorization: `Bearer ${firmarToken(
      SECRETO_DE_PRUEBA,
      payloadDePrueba("DUENO", randomUUID(), negocioId),
    )}`,
  });

  beforeAll(async () => {
    vi.stubEnv("JWT_SECRET", SECRETO_DE_PRUEBA);

    negocioA = await crearNegocioDePrueba();
    negocioB = await crearNegocioDePrueba();

    idComplejoA = (
      await prisma.complex.create({
        data: { name: "Complejo A1", address: "Calle A", negocioId: negocioA.id, depositPercent: 40 },
      })
    ).id;
    idComplejoA2 = (
      await prisma.complex.create({
        data: { name: "Complejo A2", address: "Calle A2", negocioId: negocioA.id },
      })
    ).id;
    idComplejoB = (
      await prisma.complex.create({
        data: { name: "Complejo B", address: "Calle B", negocioId: negocioB.id, depositPercent: 55 },
      })
    ).id;

    idCanchaA = await crearCancha({ complexId: idComplejoA, name: "Cancha A activa" });
    await crearCancha({ complexId: idComplejoA, name: "Cancha A inactiva", isActive: false });
    idCanchaB = await crearCancha({ complexId: idComplejoB, name: "Cancha B" });

    idReservaA = await crearReserva(idCanchaA, negocioA.id, 1000);
    idReservaB = await crearReserva(idCanchaB, negocioB.id, 2500);

    tokenDuenoA = conToken(negocioA.id);
    tokenJugador = {
      Authorization: `Bearer ${firmarToken(SECRETO_DE_PRUEBA, payloadDePrueba("JUGADOR", randomUUID()))}`,
    };
  });

  afterAll(async () => {
    vi.unstubAllEnvs();
    if (idsUsuarios.length > 0) {
      await prisma.booking.deleteMany({ where: { userId: { in: idsUsuarios } } });
      await prisma.user.deleteMany({ where: { id: { in: idsUsuarios } } });
    }
    if (negocioA) await borrarNegocioDePrueba(negocioA.id);
    if (negocioB) await borrarNegocioDePrueba(negocioB.id);
  });

  describe("createCourt (CAN-009)", () => {
    const cuerpoDe = (complexId: string) => ({
      complexId,
      name: "Cancha nueva",
      sport: "PADEL",
      surface: "CEMENTO",
      pricePerSlot: 1500,
    });

    it("con un complexId de B responde igual que con uno inexistente y no crea nada", async () => {
      const ajeno = await request(app)
        .post("/api/v1/admin/courts")
        .set(tokenDuenoA)
        .send(cuerpoDe(idComplejoB));
      const inexistente = await request(app)
        .post("/api/v1/admin/courts")
        .set(tokenDuenoA)
        .send(cuerpoDe(randomUUID()));

      expect(ajeno.status).toBe(404);
      expect(ajeno.status).toBe(inexistente.status);
      expect(sinInstancia(ajeno.body)).toEqual(sinInstancia(inexistente.body));
      expect(await prisma.court.count({ where: { name: "Cancha nueva" } })).toBe(0);
    });

    it("con un complejo propio crea la cancha", async () => {
      const respuesta = await request(app)
        .post("/api/v1/admin/courts")
        .set(tokenDuenoA)
        .send(cuerpoDe(idComplejoA2));

      expect(respuesta.status).toBe(201);
      expect(respuesta.body.complexId).toBe(idComplejoA2);
    });
  });

  describe("updateCourt (CAN-010)", () => {
    it("sobre una cancha de B responde igual que sobre una inexistente y no la modifica", async () => {
      const ajena = await request(app)
        .patch(`/api/v1/admin/courts/${idCanchaB}`)
        .set(tokenDuenoA)
        .send({ name: "Cancha robada" });
      const inexistente = await request(app)
        .patch(`/api/v1/admin/courts/${randomUUID()}`)
        .set(tokenDuenoA)
        .send({ name: "Cancha robada" });

      expect(ajena.status).toBe(404);
      expect(sinInstancia(ajena.body)).toEqual(sinInstancia(inexistente.body));
      const sinCambios = await prisma.court.findUniqueOrThrow({ where: { id: idCanchaB } });
      expect(sinCambios.name).toBe("Cancha B");
    });

    it("un complexId de B responde igual que uno inexistente (404 del complejo) y la cancha no cambia", async () => {
      const ajeno = await request(app)
        .patch(`/api/v1/admin/courts/${idCanchaA}`)
        .set(tokenDuenoA)
        .send({ name: "Cancha movida", complexId: idComplejoB });
      const inexistente = await request(app)
        .patch(`/api/v1/admin/courts/${idCanchaA}`)
        .set(tokenDuenoA)
        .send({ name: "Cancha movida", complexId: randomUUID() });

      expect(ajeno.status).toBe(404);
      expect(ajeno.body.detail).toBe("El complejo especificado no existe");
      expect(sinInstancia(ajeno.body)).toEqual(sinInstancia(inexistente.body));
      const cancha = await prisma.court.findUniqueOrThrow({ where: { id: idCanchaA } });
      expect(cancha.complexId).toBe(idComplejoA);
      expect(cancha.name).toBe("Cancha A activa");
    });

    it("un complexId de otro complejo propio mueve la cancha y sus reservas conservan el negocio", async () => {
      const respuesta = await request(app)
        .patch(`/api/v1/admin/courts/${idCanchaA}`)
        .set(tokenDuenoA)
        .send({ complexId: idComplejoA2 });

      try {
        expect(respuesta.status).toBe(200);
        const cancha = await prisma.court.findUniqueOrThrow({ where: { id: idCanchaA } });
        expect(cancha.complexId).toBe(idComplejoA2);
        const reserva = await prisma.booking.findUniqueOrThrow({ where: { id: idReservaA } });
        expect(reserva.negocioId).toBe(negocioA.id);
      } finally {
        await prisma.court.update({ where: { id: idCanchaA }, data: { complexId: idComplejoA } });
      }
    });
  });

  describe("seña del complejo (ADM-015)", () => {
    const ruta = (id: string) => `/api/v1/admin/complexes/${id}/deposit-percent`;

    it("GET de un complejo de B responde igual que uno inexistente", async () => {
      const ajeno = await request(app).get(ruta(idComplejoB)).set(tokenDuenoA);
      const inexistente = await request(app).get(ruta(randomUUID())).set(tokenDuenoA);

      expect(ajeno.status).toBe(404);
      expect(sinInstancia(ajeno.body)).toEqual(sinInstancia(inexistente.body));
    });

    it("PATCH de un complejo de B responde 404 y no cambia la seña de B", async () => {
      const respuesta = await request(app)
        .patch(ruta(idComplejoB))
        .set(tokenDuenoA)
        .send({ depositPercent: 99 });

      expect(respuesta.status).toBe(404);
      const complejoB = await prisma.complex.findUniqueOrThrow({ where: { id: idComplejoB } });
      expect(complejoB.depositPercent).toBe(55);
    });

    it("GET y PATCH de un complejo propio funcionan", async () => {
      const lectura = await request(app).get(ruta(idComplejoA)).set(tokenDuenoA);
      expect(lectura.status).toBe(200);
      expect(lectura.body).toEqual({ id: idComplejoA, depositPercent: 40 });

      const escritura = await request(app)
        .patch(ruta(idComplejoA))
        .set(tokenDuenoA)
        .send({ depositPercent: 45 });
      expect(escritura.status).toBe(200);
      expect(escritura.body.depositPercent).toBe(45);
    });
  });

  describe("GET /admin/complexes (ADM-019)", () => {
    it("devuelve solo los complejos de A, con la seña y sus canchas activas, por createdAt", async () => {
      const respuesta = await request(app).get("/api/v1/admin/complexes").set(tokenDuenoA);

      expect(respuesta.status).toBe(200);
      const complejos = respuesta.body as Array<{
        id: string;
        name: string;
        address: string;
        depositPercent: number;
        courts: Array<{ id: string; isActive: boolean }>;
      }>;
      expect(complejos.map((c) => c.id)).toEqual([idComplejoA, idComplejoA2]);
      expect(complejos[0]).toMatchObject({ name: "Complejo A1", address: "Calle A" });
      expect(complejos[0]?.depositPercent).toEqual(expect.any(Number));
      const canchasDelPrimero = complejos[0]?.courts ?? [];
      expect(canchasDelPrimero.map((c) => c.id)).toEqual([idCanchaA]);
      expect(canchasDelPrimero.every((c) => c.isActive)).toBe(true);
      expect(JSON.stringify(respuesta.body)).not.toContain(idComplejoB);
      expect(JSON.stringify(respuesta.body)).not.toContain(idCanchaB);
    });

    it("un dueño de otro negocio no ve los complejos de A", async () => {
      const respuesta = await request(app)
        .get("/api/v1/admin/complexes")
        .set(conToken(negocioB.id));

      expect(respuesta.status).toBe(200);
      expect((respuesta.body as Array<{ id: string }>).map((c) => c.id)).toEqual([idComplejoB]);
    });

    it("un JUGADOR recibe 403", async () => {
      const respuesta = await request(app).get("/api/v1/admin/complexes").set(tokenJugador);

      expect(respuesta.status).toBe(403);
    });
  });

  describe("métricas, listado y agenda (ADM-001 a ADM-008)", () => {
    const hoy = new Date();
    const desde = new Date(hoy.getTime() - 86_400_000).toISOString().slice(0, 10);
    const hasta = new Date(hoy.getTime() + 86_400_000).toISOString().slice(0, 10);

    it("las métricas de A no incluyen reservas ni recaudación de B", async () => {
      const respuesta = await request(app)
        .get("/api/v1/admin/metrics")
        .query({ startDate: desde, endDate: hasta })
        .set(tokenDuenoA);

      expect(respuesta.status).toBe(200);
      expect(respuesta.body.summary).toMatchObject({
        totalBookings: 1,
        confirmedCount: 1,
        totalRevenueARS: 1000,
      });
      const detalle = respuesta.body.details as Array<{ id: string }>;
      expect(detalle.map((d) => d.id)).toEqual([idReservaA]);
    });

    it("el listado completo de A no contiene reservas de B", async () => {
      const respuesta = await request(app).get("/api/v1/bookings/admin/all").set(tokenDuenoA);

      expect(respuesta.status).toBe(200);
      const ids = (respuesta.body as Array<{ id: string }>).map((r) => r.id);
      expect(ids).toEqual([idReservaA]);
    });

    it("la agenda diaria de A no contiene reservas de B", async () => {
      const respuesta = await request(app)
        .get("/api/v1/bookings/admin/daily")
        .query({ date: FECHA_RESERVA })
        .set(tokenDuenoA);

      expect(respuesta.status).toBe(200);
      const ids = (respuesta.body as Array<{ id: string }>).map((r) => r.id);
      expect(ids).toEqual([idReservaA]);
      expect(ids).not.toContain(idReservaB);
    });
  });
});
