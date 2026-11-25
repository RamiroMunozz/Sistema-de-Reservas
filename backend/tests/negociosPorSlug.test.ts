import { randomUUID } from "node:crypto";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import app from "../src/app.js";
import { prisma } from "../src/core/config/prisma.js";
import {
  borrarNegocioDePrueba,
  crearNegocioDePrueba,
  type NegocioDePrueba,
} from "./ayudantes/negociosDePrueba.js";

// Mercado Pago, simulado: la reserva de invitado crea una preferencia de pago.
vi.mock("../src/core/integraciones/mercadoPago.js", () => ({
  obtenerVariableMercadoPago: vi.fn(),
  crearPreferencia: vi.fn().mockResolvedValue({ id: "preferencia-de-prueba", initPoint: "https://pago.test/init" }),
  expirarPreferencia: vi.fn(),
  obtenerPago: vi.fn(),
  reembolsarPago: vi.fn(),
}));

// El límite por IP se lee al cargar la app: se sube para que no interfiera con estas pruebas.
vi.hoisted(() => {
  process.env.LIMITE_CREACION_PUBLICA_MAXIMO = "1000";
});

// Rutas por slug (NEG-003 a NEG-006, NEG-009, CAN-001, CAN-004, CAN-007, CAN-008, CAN-013, RES-012,
// RES-023, RES-031). Solo corre contra la base descartable.
const URL_BASE_DE_PRUEBA = process.env.DATABASE_URL_PRUEBA;

const FECHA = "2033-04-12";
const MENSAJE_NO_ENCONTRADO = "Negocio no encontrado.";

// `instance` repite la ruta pedida, que cambia con el slug; el resto de la respuesta debe ser idéntico.
const sinInstancia = (cuerpo: Record<string, unknown>): Record<string, unknown> => {
  const { instance: _instancia, ...resto } = cuerpo;
  return resto;
};

describe.skipIf(!URL_BASE_DE_PRUEBA)("Rutas por slug: resolutor, catálogo y disponibilidad", () => {
  let negocioA: NegocioDePrueba;
  let negocioB: NegocioDePrueba;
  let negocioInactivo: NegocioDePrueba;
  let idCanchaA: string;
  let idCanchaB: string;
  const idsUsuarios: string[] = [];

  const crearCancha = async (idNegocio: string, nombre: string): Promise<string> => {
    const complejo = await prisma.complex.create({
      data: { name: `Complejo ${nombre}`, address: "Calle 1", negocioId: idNegocio },
    });
    const cancha = await prisma.court.create({
      data: {
        complexId: complejo.id,
        name: nombre,
        sport: "PADEL",
        surface: "CEMENTO",
        pricePerSlot: 1000,
      },
    });
    return cancha.id;
  };

  const crearReserva = async (courtId: string, negocioId: string): Promise<void> => {
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
    await prisma.booking.create({
      data: {
        userId: jugador.id,
        courtId,
        negocioId,
        startTime: new Date(`${FECHA}T10:00:00.000Z`),
        endTime: new Date(`${FECHA}T11:00:00.000Z`),
        totalPrice: 1000,
        status: "CONFIRMED",
      },
    });
  };

  beforeAll(async () => {
    negocioA = await crearNegocioDePrueba();
    negocioB = await crearNegocioDePrueba();
    negocioInactivo = await crearNegocioDePrueba();
    await prisma.negocio.update({ where: { id: negocioInactivo.id }, data: { activo: false } });

    idCanchaA = await crearCancha(negocioA.id, "Cancha de A");
    idCanchaB = await crearCancha(negocioB.id, "Cancha de B");
    await crearCancha(negocioInactivo.id, "Cancha inactiva");
    await crearReserva(idCanchaA, negocioA.id);
    await crearReserva(idCanchaB, negocioB.id);
  });

  afterAll(async () => {
    if (idsUsuarios.length > 0) {
      await prisma.booking.deleteMany({ where: { userId: { in: idsUsuarios } } });
      await prisma.user.deleteMany({ where: { id: { in: idsUsuarios } } });
    }
    for (const negocio of [negocioA, negocioB, negocioInactivo]) {
      if (negocio) await borrarNegocioDePrueba(negocio.id);
    }
  });

  describe("GET /negocios/:slug (NEG-005)", () => {
    it("devuelve nombre y slug del negocio activo", async () => {
      const respuesta = await request(app).get(`/api/v1/negocios/${negocioA.slug}`);

      expect(respuesta.status).toBe(200);
      expect(respuesta.body).toEqual({ nombre: `Negocio ${negocioA.slug}`, slug: negocioA.slug });
    });

    it("slug inexistente, inactivo o mal formado: 404 con el mismo mensaje", async () => {
      const slugs = ["no-existe-nunca", negocioInactivo.slug, "Mal_Formado", "ab", "admin"];
      const respuestas = await Promise.all(
        slugs.map((slug) => request(app).get(`/api/v1/negocios/${slug}`)),
      );

      for (const respuesta of respuestas) {
        expect(respuesta.status).toBe(404);
        expect(respuesta.body.detail).toBe(MENSAJE_NO_ENCONTRADO);
      }
      const cuerpos = respuestas.map((r) => sinInstancia(r.body));
      for (const cuerpo of cuerpos) expect(cuerpo).toEqual(cuerpos[0]);
    });
  });

  describe("catálogo por slug (CAN-001, CAN-004, CAN-007, CAN-008)", () => {
    it("lista solo las canchas del negocio del slug", async () => {
      const respuesta = await request(app).get(`/api/v1/negocios/${negocioA.slug}/courts`);

      expect(respuesta.status).toBe(200);
      const ids = (respuesta.body as { id: string }[]).map((c) => c.id);
      expect(ids).toEqual([idCanchaA]);
    });

    it("el detalle de una cancha propia responde 200 y el de otro negocio 404", async () => {
      const propia = await request(app).get(`/api/v1/negocios/${negocioA.slug}/courts/${idCanchaA}`);
      const ajena = await request(app).get(`/api/v1/negocios/${negocioA.slug}/courts/${idCanchaB}`);
      const inexistente = await request(app).get(
        `/api/v1/negocios/${negocioA.slug}/courts/${randomUUID()}`,
      );

      expect(propia.status).toBe(200);
      expect(ajena.status).toBe(404);
      expect(sinInstancia(ajena.body)).toEqual(sinInstancia(inexistente.body));
    });

    it("la disponibilidad de una cancha propia marca ocupado el turno y la de otro negocio da 404", async () => {
      const propia = await request(app)
        .get(`/api/v1/negocios/${negocioA.slug}/courts/${idCanchaA}/availability`)
        .query({ date: FECHA });
      const ajena = await request(app)
        .get(`/api/v1/negocios/${negocioA.slug}/courts/${idCanchaB}/availability`)
        .query({ date: FECHA });

      expect(propia.status).toBe(200);
      const turno = (propia.body.slots as { startTime: string; isAvailable: boolean }[]).find(
        (s) => s.startTime === `${FECHA}T10:00:00.000Z`,
      );
      expect(turno?.isAvailable).toBe(false);
      expect(ajena.status).toBe(404);
    });

    it("un slug inexistente, inactivo o mal formado responde 404 en el catálogo", async () => {
      for (const slug of ["no-existe-nunca", negocioInactivo.slug, "Mal_Formado"]) {
        const respuesta = await request(app).get(`/api/v1/negocios/${slug}/courts`);
        expect(respuesta.status).toBe(404);
        expect(respuesta.body.detail).toBe(MENSAJE_NO_ENCONTRADO);
      }
    });
  });

  describe("GET /negocios/:slug/bookings/availability (RES-012)", () => {
    it("devuelve los turnos ocupados de la cancha del negocio", async () => {
      const respuesta = await request(app)
        .get(`/api/v1/negocios/${negocioA.slug}/bookings/availability`)
        .query({ courtId: idCanchaA, date: FECHA });

      expect(respuesta.status).toBe(200);
      expect(respuesta.body).toEqual(["10:00"]);
    });

    it("con una cancha de otro negocio no revela sus turnos", async () => {
      const respuesta = await request(app)
        .get(`/api/v1/negocios/${negocioA.slug}/bookings/availability`)
        .query({ courtId: idCanchaB, date: FECHA });

      expect(respuesta.status).toBe(200);
      expect(respuesta.body).toEqual([]);
    });
  });

  describe("POST /negocios/:slug/bookings (RES-023, RES-030, RES-031)", () => {
    const DIA = "2033-05-";
    const telefonos: string[] = [];
    const cuerpo = (courtId: string, hora: number, telefono: string, dia = "10") => {
      telefonos.push(telefono);
      return {
        courtId,
        startTime: `${DIA}${dia}T${String(hora).padStart(2, "0")}:00:00.000Z`,
        endTime: `${DIA}${dia}T${String(hora + 1).padStart(2, "0")}:00:00.000Z`,
        guestFirstName: "Ana",
        guestLastName: "Pérez",
        guestPhone: telefono,
      };
    };
    const telefonoNuevo = () => `549${Math.floor(1e9 + Math.random() * 8e9)}`;

    afterAll(async () => {
      await prisma.booking.deleteMany({ where: { guestPhone: { in: telefonos } } });
    });

    it("crea la reserva con el negocio del slug", async () => {
      const respuesta = await request(app)
        .post(`/api/v1/negocios/${negocioA.slug}/bookings`)
        .send(cuerpo(idCanchaA, 10, telefonoNuevo()));

      expect(respuesta.status).toBe(201);
      expect(respuesta.body.token).toBeTruthy();
    });

    it("una cancha de otro negocio responde 400 \"La cancha no existe.\" y no crea nada", async () => {
      const telefono = telefonoNuevo();
      const ajena = await request(app)
        .post(`/api/v1/negocios/${negocioA.slug}/bookings`)
        .send(cuerpo(idCanchaB, 12, telefono));
      const inexistente = await request(app)
        .post(`/api/v1/negocios/${negocioA.slug}/bookings`)
        .send(cuerpo(randomUUID(), 12, telefono));

      expect(ajena.status).toBe(400);
      expect(ajena.body.detail).toBe("La cancha no existe.");
      expect(sinInstancia(ajena.body)).toEqual(sinInstancia(inexistente.body));
      expect(await prisma.booking.count({ where: { guestPhone: telefono } })).toBe(0);
    });

    it("un slug inexistente o inactivo responde 404", async () => {
      for (const slug of ["no-existe-nunca", negocioInactivo.slug]) {
        const respuesta = await request(app)
          .post(`/api/v1/negocios/${slug}/bookings`)
          .send(cuerpo(idCanchaA, 13, telefonoNuevo()));
        expect(respuesta.status).toBe(404);
        expect(respuesta.body.detail).toBe(MENSAJE_NO_ENCONTRADO);
      }
    });

    it("el mismo teléfono reserva en dos negocios sin consumir el tope del otro (RES-031)", async () => {
      const telefono = telefonoNuevo();
      const enA = (hora: number) =>
        request(app).post(`/api/v1/negocios/${negocioA.slug}/bookings`).send(cuerpo(idCanchaA, hora, telefono, "11"));

      expect((await enA(10)).status).toBe(201);
      expect((await enA(11)).status).toBe(201);
      expect((await enA(12)).status).toBe(429);

      const enB = await request(app)
        .post(`/api/v1/negocios/${negocioB.slug}/bookings`)
        .send(cuerpo(idCanchaB, 10, telefono, "11"));
      expect(enB.status).toBe(201);
    });

    it("la reserva de invitado hereda el negocio de la cancha", async () => {
      const telefono = telefonoNuevo();
      await request(app)
        .post(`/api/v1/negocios/${negocioB.slug}/bookings`)
        .send(cuerpo(idCanchaB, 15, telefono, "12"));

      const reserva = await prisma.booking.findFirst({ where: { guestPhone: telefono } });
      expect(reserva?.negocioId).toBe(negocioB.id);
    });
  });

  describe("rutas viejas sin slug (retiradas)", () => {
    const rutasRetiradas: { metodo: "get" | "post"; ruta: string }[] = [
      { metodo: "get", ruta: "/api/v1/courts" },
      { metodo: "get", ruta: "/api/v1/courts/abc" },
      { metodo: "get", ruta: "/api/v1/courts/abc/availability" },
      { metodo: "get", ruta: "/api/v1/bookings/availability" },
      { metodo: "post", ruta: "/api/v1/public/bookings" },
    ];

    it.each(rutasRetiradas)("$metodo $ruta responde 404", async ({ metodo, ruta }) => {
      const respuesta = await request(app)[metodo](ruta);

      expect(respuesta.status).toBe(404);
    });
  });
});
