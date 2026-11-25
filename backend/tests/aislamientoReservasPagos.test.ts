import { randomUUID } from "node:crypto";
import request from "supertest";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import app from "../src/app.js";
import { prisma } from "../src/core/config/prisma.js";
import {
  borrarNegocioDePrueba,
  crearNegocioDePrueba,
  firmarToken,
  type NegocioDePrueba,
} from "./ayudantes/negociosDePrueba.js";
import { payloadDePrueba } from "./ayudantes/tokens.js";

// Mercado Pago, simulado: el aislamiento exige que un pago ajeno nunca llegue a él.
const { obtenerPago, reembolsarPago } = vi.hoisted(() => ({
  obtenerPago: vi.fn(),
  reembolsarPago: vi.fn(),
}));

vi.mock("../src/core/integraciones/mercadoPago.js", () => ({
  obtenerVariableMercadoPago: vi.fn(),
  crearPreferencia: vi.fn(),
  expirarPreferencia: vi.fn(),
  obtenerPago,
  reembolsarPago,
}));

// Aislamiento entre negocios en reservas y pagos (NEG-007, NEG-009, RES-005, RES-010, RES-013,
// RES-015, RES-016, RES-021, RES-036, PAG-024). El dueño A opera con ids de B: la respuesta es la
// misma que para un id inexistente y el recurso de B no cambia. Solo corre contra la base descartable.
const URL_BASE_DE_PRUEBA = process.env.DATABASE_URL_PRUEBA;
const SECRETO_DE_PRUEBA = "secreto_de_prueba";

const DIA_DUENO = "2033-03-10";
const DIA_JUGADOR = "2033-03-11";

// `instance` repite la ruta pedida, que cambia con el id; el resto de la respuesta debe ser idéntico.
const sinInstancia = (cuerpo: Record<string, unknown>): Record<string, unknown> => {
  const { instance: _instancia, ...resto } = cuerpo;
  return resto;
};

const turno = (dia: string, hora: number) => ({
  startTime: `${dia}T${String(hora).padStart(2, "0")}:00:00.000Z`,
  endTime: `${dia}T${String(hora + 1).padStart(2, "0")}:00:00.000Z`,
});

describe.skipIf(!URL_BASE_DE_PRUEBA)("Aislamiento de reservas y pagos entre negocios", () => {
  let negocioA: NegocioDePrueba;
  let negocioB: NegocioDePrueba;
  let negocioInactivo: NegocioDePrueba;
  let idCanchaA: string;
  let idCanchaB: string;
  let idCanchaInactivo: string;
  let idJugador: string;
  let idReservaB: string;
  let idPagoA: string;
  let idPagoB: string;
  let tokenDuenoA: { Authorization: string };
  let tokenJugador: { Authorization: string };
  const idsUsuarios: string[] = [];

  const crearCancha = async (idComplejo: string): Promise<string> => {
    const cancha = await prisma.court.create({
      data: {
        complexId: idComplejo,
        name: "Cancha de prueba",
        sport: "PADEL",
        surface: "CEMENTO",
        pricePerSlot: 1000,
      },
    });
    return cancha.id;
  };

  const crearComplejoConCancha = async (idNegocio: string): Promise<string> => {
    const complejo = await prisma.complex.create({
      data: { name: "Complejo de prueba", address: "Calle 1", negocioId: idNegocio },
    });
    return crearCancha(complejo.id);
  };

  const crearReserva = async (
    courtId: string,
    negocioId: string,
    userId: string,
    hora: number,
  ): Promise<string> => {
    const reserva = await prisma.booking.create({
      data: {
        userId,
        courtId,
        negocioId,
        startTime: new Date(turno("2033-04-01", hora).startTime),
        endTime: new Date(turno("2033-04-01", hora).endTime),
        totalPrice: 1000,
        status: "CONFIRMED",
      },
    });
    return reserva.id;
  };

  const crearPago = async (bookingId: string): Promise<string> => {
    const pago = await prisma.bookingPayment.create({
      data: {
        bookingId,
        mpPaymentId: String(Math.floor(Math.random() * 1e12)),
        amount: 1000,
        isValid: false,
        refundReason: "SLOT_TAKEN",
      },
    });
    return pago.id;
  };

  beforeAll(async () => {
    vi.stubEnv("JWT_SECRET", SECRETO_DE_PRUEBA);

    negocioA = await crearNegocioDePrueba();
    negocioB = await crearNegocioDePrueba();
    negocioInactivo = await crearNegocioDePrueba();
    await prisma.negocio.update({ where: { id: negocioInactivo.id }, data: { activo: false } });

    idCanchaA = await crearComplejoConCancha(negocioA.id);
    idCanchaB = await crearComplejoConCancha(negocioB.id);
    idCanchaInactivo = await crearComplejoConCancha(negocioInactivo.id);

    const jugador = await prisma.user.create({
      data: {
        email: `${randomUUID()}@prueba.test`,
        passwordHash: "hash",
        firstName: "Jugador",
        lastName: "Global",
        role: "JUGADOR",
      },
    });
    idJugador = jugador.id;
    idsUsuarios.push(jugador.id);

    idReservaB = await crearReserva(idCanchaB, negocioB.id, idJugador, 10);
    const idReservaA = await crearReserva(idCanchaA, negocioA.id, idJugador, 12);
    idPagoA = await crearPago(idReservaA);
    idPagoB = await crearPago(idReservaB);

    // El dueño de A existe en la base: la reserva manual guarda su id como titular.
    const duenoA = await prisma.user.create({
      data: {
        email: `${randomUUID()}@prueba.test`,
        passwordHash: "hash",
        firstName: "Dueño",
        lastName: "A",
        role: "DUENO",
        negocioId: negocioA.id,
      },
    });
    tokenDuenoA = {
      Authorization: `Bearer ${firmarToken(
        SECRETO_DE_PRUEBA,
        payloadDePrueba("DUENO", duenoA.id, negocioA.id),
      )}`,
    };
    tokenJugador = {
      Authorization: `Bearer ${firmarToken(SECRETO_DE_PRUEBA, payloadDePrueba("JUGADOR", idJugador))}`,
    };
  });

  beforeEach(() => {
    obtenerPago.mockReset().mockResolvedValue({ id: "1", status: "approved" });
    reembolsarPago.mockReset().mockResolvedValue({ id: 1 });
  });

  afterAll(async () => {
    vi.unstubAllEnvs();
    if (negocioA) await borrarNegocioDePrueba(negocioA.id);
    if (negocioB) await borrarNegocioDePrueba(negocioB.id);
    if (negocioInactivo) await borrarNegocioDePrueba(negocioInactivo.id);
    if (idsUsuarios.length > 0) {
      await prisma.user.deleteMany({ where: { id: { in: idsUsuarios } } });
    }
  });

  describe("cambio de estado (RES-013, RES-015)", () => {
    it("sobre una reserva de B responde igual que sobre una inexistente y no la modifica", async () => {
      const ajena = await request(app)
        .patch(`/api/v1/bookings/admin/${idReservaB}/status`)
        .set(tokenDuenoA)
        .send({ status: "CANCELLED" });
      const inexistente = await request(app)
        .patch(`/api/v1/bookings/admin/${randomUUID()}/status`)
        .set(tokenDuenoA)
        .send({ status: "CANCELLED" });

      expect(ajena.status).toBe(404);
      expect(ajena.status).toBe(inexistente.status);
      expect(sinInstancia(ajena.body)).toEqual(sinInstancia(inexistente.body));
      const reserva = await prisma.booking.findUniqueOrThrow({ where: { id: idReservaB } });
      expect(reserva.status).toBe("CONFIRMED");
    });
  });

  describe("creación por el dueño (RES-010)", () => {
    const cuerpoDe = (courtId: string, hora: number) => ({
      courtId,
      ...turno(DIA_DUENO, hora),
      paymentMethod: "CASH",
    });

    it("con un courtId de B responde igual que con uno inexistente y no crea nada", async () => {
      const ajena = await request(app)
        .post("/api/v1/bookings/admin/create")
        .set(tokenDuenoA)
        .send(cuerpoDe(idCanchaB, 9));
      const inexistente = await request(app)
        .post("/api/v1/bookings/admin/create")
        .set(tokenDuenoA)
        .send(cuerpoDe(randomUUID(), 9));

      expect(ajena.status).toBe(400);
      expect(ajena.body.detail).toBe("La cancha no existe.");
      expect(ajena.status).toBe(inexistente.status);
      expect(sinInstancia(ajena.body)).toEqual(sinInstancia(inexistente.body));
      expect(await prisma.booking.count({ where: { courtId: idCanchaB, startTime: new Date(turno(DIA_DUENO, 9).startTime) } })).toBe(0);
    });

    it("con una cancha propia crea la reserva con el negocio de A", async () => {
      const respuesta = await request(app)
        .post("/api/v1/bookings/admin/create")
        .set(tokenDuenoA)
        .send(cuerpoDe(idCanchaA, 9));

      expect(respuesta.status).toBe(201);
      const reserva = await prisma.booking.findUniqueOrThrow({ where: { id: respuesta.body.id } });
      expect(reserva.negocioId).toBe(negocioA.id);
    });
  });

  describe("reserva del jugador (RES-005, NEG-009)", () => {
    const cuerpoDe = (courtId: string, hora: number) => ({
      courtId,
      ...turno(DIA_JUGADOR, hora),
      paymentMethod: "CASH",
    });

    it("en un negocio inactivo responde igual que con una cancha inexistente", async () => {
      const inactivo = await request(app)
        .post("/api/v1/bookings")
        .set(tokenJugador)
        .send(cuerpoDe(idCanchaInactivo, 9));
      const inexistente = await request(app)
        .post("/api/v1/bookings")
        .set(tokenJugador)
        .send(cuerpoDe(randomUUID(), 9));

      expect(inactivo.status).toBe(400);
      expect(inactivo.body.detail).toBe("La cancha no existe.");
      expect(sinInstancia(inactivo.body)).toEqual(sinInstancia(inexistente.body));
      expect(await prisma.booking.count({ where: { courtId: idCanchaInactivo } })).toBe(0);
    });

    it("en cualquier negocio activo funciona con la misma cuenta (cuenta global)", async () => {
      const enA = await request(app)
        .post("/api/v1/bookings")
        .set(tokenJugador)
        .send(cuerpoDe(idCanchaA, 9));
      const enB = await request(app)
        .post("/api/v1/bookings")
        .set(tokenJugador)
        .send(cuerpoDe(idCanchaB, 9));

      expect(enA.status).toBe(201);
      expect(enB.status).toBe(201);
      expect(enA.body.negocioId).toBe(negocioA.id);
      expect(enB.body.negocioId).toBe(negocioB.id);
    });
  });

  describe("Mis reservas (RES-021)", () => {
    it("incluye el negocio { nombre, slug } de cada reserva, de negocios distintos", async () => {
      const respuesta = await request(app).get("/api/v1/bookings/my-bookings").set(tokenJugador);

      expect(respuesta.status).toBe(200);
      const reservas = respuesta.body as Array<{
        courtId: string;
        negocio: { nombre: string; slug: string };
      }>;
      const deA = reservas.filter((r) => r.courtId === idCanchaA);
      const deB = reservas.filter((r) => r.courtId === idCanchaB);
      expect(deA.length).toBeGreaterThan(0);
      expect(deB.length).toBeGreaterThan(0);
      expect(deA.every((r) => r.negocio.slug === negocioA.slug)).toBe(true);
      expect(deB.every((r) => r.negocio.slug === negocioB.slug)).toBe(true);
      expect(deA[0]?.negocio.nombre).toBe(`Negocio ${negocioA.slug}`);
    });
  });
});
