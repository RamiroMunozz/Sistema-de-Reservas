import { randomUUID } from "node:crypto";
import jwt from "jsonwebtoken";
import request from "supertest";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import app from "../src/app.js";
import { prisma } from "../src/core/config/prisma.js";

// Solo corre contra una base descartable: escribe y borra reservas.
const URL_BASE_DE_PRUEBA = process.env.DATABASE_URL_PRUEBA;
const SECRETO_DE_PRUEBA = "secreto_de_prueba";

describe.skipIf(!URL_BASE_DE_PRUEBA)(
  "Una reserva de invitado PENDING vencida no impide reservar el turno (RES-007, RES-026)",
  () => {
    const idUsuario = randomUUID();
    const idComplejo = randomUUID();
    const idCancha = randomUUID();
    const idVencida = randomUUID();
    const inicio = new Date("2030-03-20T10:00:00.000Z");
    const fin = new Date("2030-03-20T11:00:00.000Z");

    const conToken = (rol: "USER" | "ADMIN") => ({
      Authorization: `Bearer ${jwt.sign({ userId: idUsuario, role: rol }, SECRETO_DE_PRUEBA)}`,
    });

    const insertarVencida = async (id: string) => {
      const vencio = new Date(Date.now() - 30 * 60 * 1000);
      const hash = id.replaceAll("-", "").repeat(2);

      await prisma.$executeRaw`
        INSERT INTO "bookings"
          ("id", "guest_first_name", "guest_last_name", "guest_phone",
           "court_id", "negocio_id", "start_time", "end_time", "total_price", "status", "expires_at",
           "deposit_amount", "access_token_hash", "updated_at")
        VALUES
          (${id}::uuid, 'Ana', 'Pérez', '5491155551234',
           ${idCancha}::uuid, ${inicio}, ${fin}, 1000, 'PENDING'::"BookingStatus", ${vencio},
           300, ${hash}, now())`;
    };

    const estadoDe = async (id: string): Promise<string | undefined> => {
      const reserva = await prisma.booking.findUnique({
        where: { id },
        select: { status: true },
      });
      return reserva?.status;
    };

    beforeAll(async () => {
      vi.stubEnv("JWT_SECRET", SECRETO_DE_PRUEBA);

      await prisma.$executeRaw`
        INSERT INTO "users" ("id", "email", "password_hash", "first_name", "last_name", "updated_at")
        VALUES (${idUsuario}::uuid, ${`liberar-${idUsuario}@example.com`}, 'sin_uso', 'Cuenta', 'Prueba', now())`;
      await prisma.$executeRaw`
        INSERT INTO "complexes" ("id", "name", "address", "negocio_id")
        VALUES (${idComplejo}::uuid, 'Complejo liberar', 'Sin dirección', (SELECT "id" FROM "negocios" WHERE "slug" = 'principal'))`;
      await prisma.$executeRaw`
        INSERT INTO "courts" ("id", "complex_id", "name", "sport", "surface", "price_per_slot")
        VALUES (${idCancha}::uuid, ${idComplejo}::uuid, 'Cancha liberar', 'PADEL', 'CEMENTO', 1000)`;
    });

    afterEach(async () => {
      await prisma.$executeRaw`DELETE FROM "bookings" WHERE "court_id" = ${idCancha}::uuid`;
    });

    afterAll(async () => {
      await prisma.$executeRaw`DELETE FROM "bookings" WHERE "court_id" = ${idCancha}::uuid`;
      await prisma.$executeRaw`DELETE FROM "courts" WHERE "id" = ${idCancha}::uuid`;
      await prisma.$executeRaw`DELETE FROM "complexes" WHERE "id" = ${idComplejo}::uuid`;
      await prisma.$executeRaw`DELETE FROM "users" WHERE "id" = ${idUsuario}::uuid`;
      await prisma.$disconnect();
      vi.unstubAllEnvs();
    });

    it("POST /bookings crea la reserva del jugador (201) y deja la vencida en EXPIRED", async () => {
      await insertarVencida(idVencida);

      const respuesta = await request(app)
        .post("/api/v1/bookings")
        .set(conToken("USER"))
        .send({
          courtId: idCancha,
          startTime: inicio.toISOString(),
          endTime: fin.toISOString(),
          paymentMethod: "CASH",
        });

      expect(respuesta.status).toBe(201);
      expect(await estadoDe(idVencida)).toBe("EXPIRED");
    });

    it("POST /bookings/admin/create crea la reserva del administrador (201) y deja la vencida en EXPIRED", async () => {
      await insertarVencida(idVencida);

      const respuesta = await request(app)
        .post("/api/v1/bookings/admin/create")
        .set(conToken("ADMIN"))
        .send({
          courtId: idCancha,
          startTime: inicio.toISOString(),
          endTime: fin.toISOString(),
          paymentMethod: "CASH",
        });

      expect(respuesta.status).toBe(201);
      expect(await estadoDe(idVencida)).toBe("EXPIRED");
    });
  },
);
