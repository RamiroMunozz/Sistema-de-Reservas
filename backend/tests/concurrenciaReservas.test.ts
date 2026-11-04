import { randomUUID } from "node:crypto";
import jwt from "jsonwebtoken";
import request from "supertest";
import {
  afterAll,
  afterEach,
  beforeAll,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import app from "../src/app.js";
import { prisma } from "../src/core/config/prisma.js";

// Solo corre contra una base descartable: escribe y borra reservas.
const URL_BASE_DE_PRUEBA = process.env.DATABASE_URL_PRUEBA;
const SECRETO_DE_PRUEBA = "secreto_de_prueba";
const MENSAJE_OCUPADO = "El turno seleccionado ya fue reservado.";

const horario = (horaInicio: number, horaFin: number) => ({
  startTime: `2030-01-15T${String(horaInicio).padStart(2, "0")}:00:00.000Z`,
  endTime: `2030-01-15T${String(horaFin).padStart(2, "0")}:00:00.000Z`,
});

describe.skipIf(!URL_BASE_DE_PRUEBA)("Concurrencia de reservas", () => {
  let idUsuario: string;
  let idComplejo: string;
  let idCancha: string;
  let idOtraCancha: string;

  const conToken = (rol: "USER" | "ADMIN" = "USER") => ({
    Authorization: `Bearer ${jwt.sign({ userId: idUsuario, role: rol }, SECRETO_DE_PRUEBA)}`,
  });

  const crearCancha = async (nombre: string) => {
    const cancha = await prisma.court.create({
      data: {
        complexId: idComplejo,
        name: nombre,
        sport: "PADEL",
        surface: "CEMENTO",
        pricePerSlot: 1000,
      },
    });
    return cancha.id;
  };

  const reservar = (
    datos: { startTime: string; endTime: string },
    courtId = idCancha,
  ) =>
    request(app)
      .post("/api/v1/bookings")
      .set(conToken())
      .send({ courtId, ...datos, paymentMethod: "CASH" });

  const reservarComoAdmin = (datos: { startTime: string; endTime: string }) =>
    request(app)
      .post("/api/v1/bookings/admin/create")
      .set(conToken("ADMIN"))
      .send({ courtId: idCancha, ...datos, paymentMethod: "CASH" });

  beforeAll(async () => {
    vi.stubEnv("JWT_SECRET", SECRETO_DE_PRUEBA);

    const usuario = await prisma.user.create({
      data: {
        email: `concurrencia-${randomUUID()}@example.com`,
        passwordHash: "sin_uso",
        firstName: "Prueba",
        lastName: "Concurrencia",
      },
    });
    idUsuario = usuario.id;

    const complejo = await prisma.complex.create({
      data: { name: "Complejo de prueba", address: "Sin dirección" },
    });
    idComplejo = complejo.id;

    idCancha = await crearCancha("Cancha A");
    idOtraCancha = await crearCancha("Cancha B");
  });

  afterEach(async () => {
    await prisma.booking.deleteMany({ where: { userId: idUsuario } });
  });

  afterAll(async () => {
    await prisma.court.deleteMany({ where: { complexId: idComplejo } });
    await prisma.complex.delete({ where: { id: idComplejo } });
    await prisma.user.delete({ where: { id: idUsuario } });
    await prisma.$disconnect();
    vi.unstubAllEnvs();
  });

  it("de 20 pedidos simultáneos por el mismo turno, solo uno reserva", async () => {
    const respuestas = await Promise.all(
      Array.from({ length: 20 }, () => reservar(horario(10, 11))),
    );

    const estados = respuestas.map((respuesta) => respuesta.status);
    expect(estados.filter((estado) => estado === 201)).toHaveLength(1);
    expect(estados.filter((estado) => estado === 409)).toHaveLength(19);
    expect(
      await prisma.booking.count({
        where: { courtId: idCancha, status: { not: "CANCELLED" } },
      }),
    ).toBe(1);
  });

  it("usuario y admin simultáneos: siempre una reserva y nueve 409, sin deadlocks", async () => {
    for (let ronda = 0; ronda < 30; ronda++) {
      const respuestas = await Promise.all([
        ...Array.from({ length: 5 }, () => reservar(horario(10, 11))),
        ...Array.from({ length: 5 }, () => reservarComoAdmin(horario(10, 11))),
      ]);

      expect(respuestas.filter((r) => r.status === 201)).toHaveLength(1);
      expect(respuestas.filter((r) => r.status === 409)).toHaveLength(9);
      await prisma.booking.deleteMany({ where: { userId: idUsuario } });
    }
  });

  it("responde 404 al cambiar el estado de una reserva inexistente", async () => {
    const respuesta = await request(app)
      .patch(`/api/v1/bookings/admin/${randomUUID()}/status`)
      .set(conToken("ADMIN"))
      .send({ status: "CONFIRMED" });

    expect(respuesta.status).toBe(404);
  });

  it("responde 409 con el mensaje de turno ocupado", async () => {
    await reservar(horario(10, 11));

    const respuesta = await reservar(horario(10, 11));

    expect(respuesta.status).toBe(409);
    expect(respuesta.body.detail).toBe(MENSAJE_OCUPADO);
  });

  it("rechaza un solapamiento parcial", async () => {
    await reservar(horario(10, 12));

    const respuesta = await reservar(horario(11, 13));

    expect(respuesta.status).toBe(409);
  });

  it("permite turnos contiguos", async () => {
    await reservar(horario(10, 11));

    const respuesta = await reservar(horario(11, 12));

    expect(respuesta.status).toBe(201);
  });

  it("permite el mismo horario en otra cancha", async () => {
    await reservar(horario(10, 11));

    const respuesta = await reservar(horario(10, 11), idOtraCancha);

    expect(respuesta.status).toBe(201);
  });

  it("libera el turno al cancelar la reserva", async () => {
    const primera = await reservar(horario(10, 11));
    await request(app)
      .patch(`/api/v1/bookings/${primera.body.id}/cancel`)
      .set(conToken());

    const respuesta = await reservar(horario(10, 11));

    expect(respuesta.status).toBe(201);
  });

  it("no deja reconfirmar una reserva cancelada si el turno ya es de otra", async () => {
    const cancelada = await reservar(horario(10, 11));
    await request(app)
      .patch(`/api/v1/bookings/${cancelada.body.id}/cancel`)
      .set(conToken());
    await reservar(horario(10, 11));

    const respuesta = await request(app)
      .patch(`/api/v1/bookings/admin/${cancelada.body.id}/status`)
      .set(conToken("ADMIN"))
      .send({ status: "CONFIRMED" });

    expect(respuesta.status).toBe(409);
    expect(respuesta.body.detail).toBe(MENSAJE_OCUPADO);
    const original = await prisma.booking.findUnique({
      where: { id: cancelada.body.id },
    });
    expect(original?.status).toBe("CANCELLED");
  });

  it("no marca libre un turno completado en la disponibilidad", async () => {
    const reserva = await reservar(horario(10, 11));
    await request(app)
      .patch(`/api/v1/bookings/admin/${reserva.body.id}/status`)
      .set(conToken("ADMIN"))
      .send({ status: "COMPLETED" });

    const respuesta = await request(app).get(
      `/api/v1/bookings/availability?courtId=${idCancha}&date=2030-01-15`,
    );

    expect(respuesta.body).toEqual(["10:00"]);
  });

  it("corta la espera si otra transacción retiene el bloqueo de la cancha", async () => {
    const inicio = Date.now();
    let respuestaEnEspera;

    await prisma.$transaction(
      async (transaccion) => {
        await transaccion.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${idCancha}))`;
        vi.spyOn(console, "error").mockImplementation(() => undefined);
        respuestaEnEspera = await reservar(horario(10, 11));
      },
      { timeout: 9000 },
    );

    vi.mocked(console.error).mockRestore();
    expect(respuestaEnEspera).toMatchObject({ status: 500 });
    expect(Date.now() - inicio).toBeLessThan(8000);
  });

  it("la base rechaza un horario con fin anterior al inicio", async () => {
    await expect(
      prisma.booking.create({
        data: {
          userId: idUsuario,
          courtId: idCancha,
          startTime: new Date("2030-01-15T12:00:00.000Z"),
          endTime: new Date("2030-01-15T11:00:00.000Z"),
          totalPrice: 1000,
        },
      }),
    ).rejects.toThrow();
  });
});
