import { randomUUID } from "node:crypto";
import { afterAll, describe, expect, it, vi } from "vitest";
import { prisma } from "../src/core/config/prisma.js";
import { BookingService } from "../src/modules/bookings/booking.service.js";
import { ReservaInvitadoService } from "../src/modules/public/reservaInvitado.service.js";
import { borrarNegocioDePrueba, crearNegocioDePrueba } from "./ayudantes/negociosDePrueba.js";

// La creación de invitado se prueba contra la base real; Mercado Pago, simulado.
vi.mock("../src/core/integraciones/mercadoPago.js", () => ({
  obtenerVariableMercadoPago: vi.fn(),
  crearPreferencia: vi.fn(async () => ({
    id: "preferencia-de-prueba",
    initPoint: "https://mp.ejemplo.test/checkout",
    sandboxInitPoint: undefined,
  })),
  expirarPreferencia: vi.fn(),
  obtenerPago: vi.fn(),
  reembolsarPago: vi.fn(),
}));

// Solo corre contra una base descartable con M1 y M2 (20261125120000_negocios y 20261125120100_roles_negocio) aplicadas:
// escribe y borra filas. Usa SQL directo para no depender de los tipos del cliente.
const URL_BASE_DE_PRUEBA = process.env.DATABASE_URL_PRUEBA;

interface FilaNulable {
  is_nullable: string;
}

describe.skipIf(!URL_BASE_DE_PRUEBA)("Migraciones M1 y M2 de negocios y roles (base descartable)", () => {
  const idsNegocios: string[] = [];
  const idsComplejos: string[] = [];
  const idsCanchas: string[] = [];
  const idsReservas: string[] = [];
  const idsUsuarios: string[] = [];

  const crearNegocio = async (): Promise<string> => {
    const id = randomUUID();
    idsNegocios.push(id);
    await prisma.$executeRaw`
      INSERT INTO "negocios" ("id", "nombre", "slug")
      VALUES (${id}::uuid, ${`Negocio ${id}`}, ${`prueba-${id.slice(0, 8)}`})`;
    return id;
  };

  const crearComplejoConCancha = async (idNegocio: string): Promise<string> => {
    const idComplejo = randomUUID();
    const idCancha = randomUUID();
    idsComplejos.push(idComplejo);
    idsCanchas.push(idCancha);
    await prisma.$executeRaw`
      INSERT INTO "complexes" ("id", "name", "address", "negocio_id")
      VALUES (${idComplejo}::uuid, 'Complejo de prueba', 'Calle 1', ${idNegocio}::uuid)`;
    await prisma.$executeRaw`
      INSERT INTO "courts" ("id", "complex_id", "name", "sport", "surface", "price_per_slot")
      VALUES (${idCancha}::uuid, ${idComplejo}::uuid, 'Cancha de prueba',
              'PADEL'::"Sport", 'CEMENTO'::"Surface", 1000)`;
    return idCancha;
  };

  const insertarReserva = async (idCancha: string, idNegocio: string): Promise<void> => {
    const id = randomUUID();
    idsReservas.push(id);
    await prisma.$executeRaw`
      INSERT INTO "bookings"
        ("id", "guest_phone", "court_id", "negocio_id", "start_time", "end_time",
         "total_price", "status", "updated_at")
      VALUES
        (${id}::uuid, '5492604000000', ${idCancha}::uuid, ${idNegocio}::uuid,
         '2031-04-10T10:00:00.000Z', '2031-04-10T11:00:00.000Z',
         1000, 'CONFIRMED'::"BookingStatus", now())`;
  };

  // Por defecto un usuario con negocio es DUENO y uno sin negocio es JUGADOR (users_negocio_segun_rol).
  const insertarUsuario = async (
    idNegocio: string | null,
    rol: string = idNegocio ? "DUENO" : "JUGADOR",
  ): Promise<void> => {
    const id = randomUUID();
    idsUsuarios.push(id);
    await prisma.$executeRaw`
      INSERT INTO "users"
        ("id", "email", "password_hash", "first_name", "last_name", "role", "negocio_id", "updated_at")
      VALUES
        (${id}::uuid, ${`${id}@prueba.test`}, 'hash', 'Prueba', 'Negocio',
         ${rol}::"Role", ${idNegocio}::uuid, now())`;
  };

  afterAll(async () => {
    if (idsReservas.length > 0) {
      await prisma.$executeRaw`DELETE FROM "bookings" WHERE "id" = ANY(${idsReservas}::uuid[])`;
    }
    if (idsCanchas.length > 0) {
      await prisma.$executeRaw`DELETE FROM "courts" WHERE "id" = ANY(${idsCanchas}::uuid[])`;
    }
    if (idsComplejos.length > 0) {
      await prisma.$executeRaw`DELETE FROM "complexes" WHERE "id" = ANY(${idsComplejos}::uuid[])`;
    }
    if (idsUsuarios.length > 0) {
      await prisma.$executeRaw`DELETE FROM "users" WHERE "id" = ANY(${idsUsuarios}::uuid[])`;
    }
    if (idsNegocios.length > 0) {
      await prisma.$executeRaw`DELETE FROM "negocios" WHERE "id" = ANY(${idsNegocios}::uuid[])`;
    }
    await prisma.$disconnect();
  });

  it("crea la tabla negocios con el negocio principal activo (NEG-012)", async () => {
    const filas = await prisma.$queryRaw<{ slug: string; activo: boolean }[]>`
      SELECT "slug", "activo" FROM "negocios" WHERE "slug" = 'principal'`;
    expect(filas).toEqual([{ slug: "principal", activo: true }]);
  });

  it.each([["complexes"], ["bookings"]])(
    "%s.negocio_id es NOT NULL (NEG-001)",
    async (tabla) => {
      const filas = await prisma.$queryRaw<FilaNulable[]>`
        SELECT "is_nullable" FROM information_schema.columns
        WHERE table_name = ${tabla} AND column_name = 'negocio_id'`;
      expect(filas).toEqual([{ is_nullable: "NO" }]);
    },
  );

  it("users.negocio_id existe y admite nulo (jugadores sin negocio)", async () => {
    const filas = await prisma.$queryRaw<FilaNulable[]>`
      SELECT "is_nullable" FROM information_schema.columns
      WHERE table_name = 'users' AND column_name = 'negocio_id'`;
    expect(filas).toEqual([{ is_nullable: "YES" }]);
  });

  it("ningún complejo ni reserva queda fuera de un negocio existente (NEG-012)", async () => {
    const huerfanos = await prisma.$queryRaw<{ total: bigint }[]>`
      SELECT (
        (SELECT count(*) FROM "complexes" c WHERE NOT EXISTS
          (SELECT 1 FROM "negocios" n WHERE n."id" = c."negocio_id"))
        +
        (SELECT count(*) FROM "bookings" b WHERE NOT EXISTS
          (SELECT 1 FROM "negocios" n WHERE n."id" = b."negocio_id"))
      ) AS total`;
    expect(Number(huerfanos[0]?.total)).toBe(0);
  });

  it("el trigger acepta una reserva con el negocio de su cancha (NEG-007)", async () => {
    const idNegocio = await crearNegocio();
    const idCancha = await crearComplejoConCancha(idNegocio);
    await expect(insertarReserva(idCancha, idNegocio)).resolves.toBeUndefined();
  });

  it("el trigger bookings_negocio_coherente rechaza una reserva con otro negocio (NEG-007)", async () => {
    const idNegocioA = await crearNegocio();
    const idNegocioB = await crearNegocio();
    const idCanchaDeA = await crearComplejoConCancha(idNegocioA);

    const error: unknown = await insertarReserva(idCanchaDeA, idNegocioB).catch(
      (e: unknown) => e,
    );
    expect(error).toBeInstanceOf(Error);
    expect((error as Error).message).toContain("bookings_negocio_coherente");
    expect((error as Error).message).toContain("23514");
  });

  it("users_un_dueno_por_negocio rechaza un segundo usuario con el mismo negocio (D10)", async () => {
    const idNegocio = await crearNegocio();
    await insertarUsuario(idNegocio);

    const error: unknown = await insertarUsuario(idNegocio).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(Error);
    expect((error as Error).message).toContain("users_un_dueno_por_negocio");
  });

  it("users_un_dueno_por_negocio no limita a los usuarios sin negocio", async () => {
    await insertarUsuario(null);
    await expect(insertarUsuario(null)).resolves.toBeUndefined();
  });

  it("users_negocio_segun_rol acepta un DUENO con negocio, y un JUGADOR y un SUPER_ADMIN sin negocio", async () => {
    const idNegocio = await crearNegocio();

    await expect(insertarUsuario(idNegocio, "DUENO")).resolves.toBeUndefined();
    await expect(insertarUsuario(null, "JUGADOR")).resolves.toBeUndefined();
    await expect(insertarUsuario(null, "SUPER_ADMIN")).resolves.toBeUndefined();
  });

  it("users_negocio_segun_rol rechaza un DUENO sin negocio", async () => {
    const error: unknown = await insertarUsuario(null, "DUENO").catch((e: unknown) => e);

    expect(error).toBeInstanceOf(Error);
    expect((error as Error).message).toContain("users_negocio_segun_rol");
  });

  it.each([["JUGADOR"], ["SUPER_ADMIN"]])(
    "users_negocio_segun_rol rechaza un %s con negocio",
    async (rol) => {
      const idNegocio = await crearNegocio();

      const error: unknown = await insertarUsuario(idNegocio, rol).catch((e: unknown) => e);

      expect(error).toBeInstanceOf(Error);
      expect((error as Error).message).toContain("users_negocio_segun_rol");
    },
  );

  it("el rol por defecto de un usuario nuevo es JUGADOR", async () => {
    const filas = await prisma.$queryRaw<{ column_default: string }[]>`
      SELECT "column_default" FROM information_schema.columns
      WHERE table_name = 'users' AND column_name = 'role'`;

    expect(filas[0]?.column_default).toContain("JUGADOR");
  });
});

// T-1.10: las tres rutas de creación fijan el negocio del complejo de la cancha. Se usa un negocio
// distinto de `principal` para que la coincidencia no sea casual y el trigger no rechace ninguna.
describe.skipIf(!URL_BASE_DE_PRUEBA)("Coherencia del negocio en las rutas de creación (NEG-007)", () => {
  const inicio = (hora: number) => new Date(`2031-06-10T${String(hora).padStart(2, "0")}:00:00.000Z`);
  const fin = (hora: number) => inicio(hora + 1);
  let idNegocio: string;
  let idCancha: string;
  let idUsuario: string;

  const negocioDeLaReserva = async (idReserva: string): Promise<string> => {
    const filas = await prisma.$queryRaw<{ negocio_id: string }[]>`
      SELECT "negocio_id" FROM "bookings" WHERE "id" = ${idReserva}::uuid`;
    return filas[0]?.negocio_id ?? "";
  };

  const prepararDatos = async (): Promise<void> => {
    const negocio = await crearNegocioDePrueba();
    idNegocio = negocio.id;
    const complejo = await prisma.complex.create({
      data: { name: "Complejo coherencia", address: "Sin dirección", negocioId: idNegocio },
    });
    const cancha = await prisma.court.create({
      data: {
        complexId: complejo.id,
        name: "Cancha coherencia",
        sport: "PADEL",
        surface: "CEMENTO",
        pricePerSlot: 1000,
      },
    });
    idCancha = cancha.id;
    // Usuario sin negocio: la reserva del jugador toma el negocio de la cancha, no el del usuario.
    idUsuario = randomUUID();
    await prisma.user.create({
      data: {
        id: idUsuario,
        email: `coherencia-${idUsuario}@example.com`,
        passwordHash: "sin_uso",
        firstName: "Cuenta",
        lastName: "Coherencia",
      },
    });
  };

  afterAll(async () => {
    await borrarNegocioDePrueba(idNegocio);
    await prisma.user.deleteMany({ where: { id: idUsuario } });
    await prisma.$disconnect();
  });

  it("createBooking, createAdminBooking y la reserva de invitado guardan el negocio de la cancha", async () => {
    await prepararDatos();
    const servicio = new BookingService();

    const deJugador = await servicio.createBooking(
      { courtId: idCancha, startTime: inicio(10), endTime: fin(10) },
      idUsuario,
    );
    const deAdmin = await servicio.createAdminBooking(
      idNegocio,
      { courtId: idCancha, startTime: inicio(12).toISOString(), endTime: fin(12).toISOString(), paymentMethod: "CASH" },
      idUsuario,
    );
    await new ReservaInvitadoService().crear({
      courtId: idCancha,
      startTime: inicio(14).toISOString(),
      endTime: fin(14).toISOString(),
      guestFirstName: "Ana",
      guestLastName: "Coherente",
      guestPhone: "5492604555000",
    });
    const deInvitado = await prisma.booking.findFirstOrThrow({
      where: { courtId: idCancha, guestPhone: "5492604555000" },
    });

    expect(await negocioDeLaReserva(deJugador.id)).toBe(idNegocio);
    expect(await negocioDeLaReserva(deAdmin.id)).toBe(idNegocio);
    expect(await negocioDeLaReserva(deInvitado.id)).toBe(idNegocio);
  });
});
